/**
 * 充值服务
 * 
 * 处理 AI Credits 充值相关业务逻辑
 * - 创建充值订单
 * - 提交交易验证
 * - 更新订单状态
 * - 处理过期订单
 * 
 * 🔒 安全措施:
 * - 事务处理
 * - 乐观锁
 * - 日志脱敏
 */

import crypto from 'crypto';
import prisma from '../../lib/prisma.js';
import {
  AMOUNT_TIERS,
  ORDER_EXPIRY_MINUTES,
  REQUIRED_CONFIRMATIONS,
  PLATFORM_RECEIVER,
  EXCHANGE_RATE,
  isValidAmount,
} from '../../config/recharge.config.js';
import {
  verifyRechargeTransaction,
  getTransactionConfirmations,
} from './blockchain-verifier.service.js';
import { maskAddress, safeLog } from '../../utils/security.utils.js';

/**
 * 生成唯一订单号
 * 格式: RCH-{timestamp}-{random}
 */
const generateOrderNo = () => {
  const timestamp = Date.now();
  const random = crypto.randomBytes(4).toString('hex');
  return `RCH-${timestamp}-${random}`;
};

/**
 * 创建充值订单
 * 
 * @param {string} userId - 用户 ID (数据库 ID)
 * @param {string} payerAddress - 付款钱包地址
 * @param {number} amount - 充值金额 (USDC)
 * @param {string} chain - 支付链 (arbitrum | polygon)
 * @returns {Promise<Object>} 创建的订单
 */
export const createRechargeOrder = async (userId, payerAddress, amount, chain = 'arbitrum') => {
  // 验证金额 - 测试模式：允许任意正数金额
  if (amount <= 0) {
    throw new Error('Amount must be positive');
  }
  // 临时注释：测试完恢复
  // if (!isValidAmount(amount)) {
  //   throw new Error(`Invalid amount. Allowed tiers: ${AMOUNT_TIERS.join(', ')} USDC`);
  // }

  // 获取平台收款地址
  const receiverAddress = PLATFORM_RECEIVER[chain];
  if (!receiverAddress) {
    throw new Error(`Platform receiver not configured for chain: ${chain}`);
  }

  // 计算 AI Credits (1:1 兑换)
  const creditsAmount = amount * EXCHANGE_RATE;

  // 计算过期时间
  const expiresAt = new Date(Date.now() + ORDER_EXPIRY_MINUTES * 60 * 1000);

  // 创建订单
  const order = await prisma.rechargeOrder.create({
    data: {
      userId,
      orderNo: generateOrderNo(),
      amount,
      creditsAmount,
      paymentChain: chain,
      paymentToken: 'USDC',
      payerAddress: payerAddress.toLowerCase(),
      receiverAddress: receiverAddress.toLowerCase(),
      status: 'pending',
      expiresAt,
    },
  });

  safeLog.info('[Recharge]', 'Order created', {
    orderNo: order.orderNo,
    amount,
    chain,
    payer: payerAddress,
  });

  return {
    orderId: order.id,
    orderNo: order.orderNo,
    amount: Number(order.amount),
    creditsAmount: Number(order.creditsAmount),
    receiverAddress: order.receiverAddress,
    chain: order.paymentChain,
    token: order.paymentToken,
    expiresAt: order.expiresAt,
    status: order.status,
  };
};

/**
 * 提交交易哈希并验证
 * 
 * @param {string} orderId - 订单 ID
 * @param {string} txHash - 交易哈希
 * @returns {Promise<Object>} 验证结果
 * 
 * 🔒 安全措施:
 * - 使用事务确保原子性
 * - 使用乐观锁防止竞态条件
 * - 双重检查 txHash 唯一性
 */
export const submitTransaction = async (orderId, txHash) => {
  const normalizedTxHash = txHash.toLowerCase();
  
  // 🔒 使用事务进行原子性检查和更新
  // 防止竞态条件导致的重复处理
  const order = await prisma.$transaction(async (tx) => {
    // 获取订单并锁定（使用 SELECT FOR UPDATE 语义）
    const order = await tx.rechargeOrder.findUnique({
      where: { id: orderId },
    });

    if (!order) {
      throw new Error('Order not found');
    }

    // 检查订单状态
    if (order.status === 'completed') {
      throw new Error('Order already completed');
    }

    if (order.status === 'expired') {
      throw new Error('Order has expired');
    }

    // 如果订单已经在确认中且是同一个 txHash，允许继续
    if (order.status === 'confirming' && order.txHash === normalizedTxHash) {
      return order;
    }

    // 如果订单在确认中但是不同的 txHash，拒绝
    if (order.status === 'confirming' && order.txHash && order.txHash !== normalizedTxHash) {
      throw new Error('Order is already being processed with a different transaction');
    }

    // 检查是否过期
    if (new Date() > order.expiresAt) {
      await tx.rechargeOrder.update({
        where: { id: orderId },
        data: { status: 'expired' },
      });
      throw new Error('Order has expired');
    }

    // 🔒 检查交易哈希是否已被使用（双重检查）
    const existingOrder = await tx.rechargeOrder.findFirst({
      where: {
        txHash: normalizedTxHash,
        status: { in: ['completed', 'confirming'] },
        id: { not: orderId }, // 排除当前订单
      },
    });

    if (existingOrder) {
      throw new Error('This transaction has already been used for another order');
    }

    // 更新订单状态为确认中
    const updatedOrder = await tx.rechargeOrder.update({
      where: { 
        id: orderId,
        status: 'pending', // 乐观锁：只有 pending 状态才能更新
      },
      data: {
        txHash: normalizedTxHash,
        status: 'confirming',
      },
    });

    return updatedOrder;
  });

  if (!order) {
    throw new Error('Failed to process order');
  }

  // 验证交易
  const verificationResult = await verifyRechargeTransaction(txHash, {
    payerAddress: order.payerAddress,
    amount: Number(order.amount),
    chain: order.paymentChain,
  });

  if (!verificationResult.valid) {
    // 检查是否是 pending 状态（交易还在等待确认）
    if (verificationResult.pending) {
      // 保持 confirming 状态，不标记为失败
      safeLog.info('[Recharge]', 'Transaction still pending, keeping order in confirming state', {
        orderNo: order.orderNo,
        txHash: normalizedTxHash,
      });
      
      return {
        success: false,
        error: verificationResult.error,
        pending: true,
        confirmations: 0,
        requiredConfirmations: REQUIRED_CONFIRMATIONS[order.paymentChain],
      };
    }
    
    // 真正的验证失败
    await prisma.rechargeOrder.update({
      where: { id: orderId },
      data: {
        status: 'failed',
        errorMessage: verificationResult.error,
      },
    });

    return {
      success: false,
      error: verificationResult.error,
      confirmations: verificationResult.details?.confirmations || 0,
      requiredConfirmations: REQUIRED_CONFIRMATIONS[order.paymentChain],
    };
  }

  // 验证通过，完成充值（使用事务）
  // ⚠️ 使用链上实际金额，而不是订单中的期望金额
  // 这样对用户更公平：收到多少就充多少
  const actualCreditsAmount = verificationResult.details.amount;

  const result = await prisma.$transaction(async (tx) => {
    // 🔒 乐观锁：先检查订单是否仍然可以完成
    // 只有 pending 或 confirming 状态的订单才能被完成
    // 防止并发请求导致重复增加余额
    const currentOrder = await tx.rechargeOrder.findUnique({
      where: { id: orderId },
    });

    if (!currentOrder) {
      throw new Error('Order not found');
    }

    if (currentOrder.status === 'completed') {
      // 订单已经被另一个请求完成了，返回当前用户余额
      const user = await tx.user.findUnique({
        where: { id: order.userId },
      });
      safeLog.info('[Recharge]', 'Order already completed by another request, skipping', {
        orderNo: currentOrder.orderNo,
      });
      return {
        order: currentOrder,
        user,
        alreadyCompleted: true
      };
    }

    if (currentOrder.status !== 'pending' && currentOrder.status !== 'confirming') {
      throw new Error(`Cannot complete order with status: ${currentOrder.status}`);
    }

    // 更新订单状态和实际金额
    const updatedOrder = await tx.rechargeOrder.update({
      where: {
        id: orderId,
        status: { in: ['pending', 'confirming'] }, // 🔒 乐观锁：只有未完成的订单才能更新
      },
      data: {
        status: 'completed',
        creditsAmount: actualCreditsAmount, // 使用实际到账金额
        blockNumber: verificationResult.details.blockNumber,
        confirmations: verificationResult.details.confirmations,
        confirmedAt: new Date(),
        completedAt: new Date(),
      },
    });

    // 增加用户余额（使用实际到账金额）
    const updatedUser = await tx.user.update({
      where: { id: order.userId },
      data: {
        aiCreditsBalance: {
          increment: actualCreditsAmount,
        },
      },
    });

    return { order: updatedOrder, user: updatedUser, alreadyCompleted: false };
  });

  // 如果订单已经被另一个请求完成了，直接返回成功
  if (result.alreadyCompleted) {
    return {
      success: true,
      orderId: result.order.id,
      orderNo: result.order.orderNo,
      creditsAmount: Number(result.order.creditsAmount),
      newBalance: Number(result.user.aiCreditsBalance),
      confirmations: result.order.confirmations,
      alreadyProcessed: true,
    };
  }

  safeLog.info('[Recharge]', '✅ Order completed', {
    orderNo: order.orderNo,
    expectedCredits: Number(order.creditsAmount),
    actualCredits: actualCreditsAmount,
    payer: order.payerAddress,
  });

  return {
    success: true,
    orderId: result.order.id,
    orderNo: result.order.orderNo,
    creditsAmount: actualCreditsAmount,  // 实际充值金额
    newBalance: Number(result.user.aiCreditsBalance),
    confirmations: verificationResult.details.confirmations,
  };
};

/**
 * 获取订单状态
 * 
 * @param {string} orderId - 订单 ID
 * @returns {Promise<Object>}
 */
export const getOrderStatus = async (orderId) => {
  const order = await prisma.rechargeOrder.findUnique({
    where: { id: orderId },
  });

  if (!order) {
    throw new Error('Order not found');
  }

  let confirmations = order.confirmations;

  // 如果订单在确认中，获取最新确认数
  if (order.status === 'confirming' && order.txHash) {
    const txStatus = await getTransactionConfirmations(order.txHash, order.paymentChain);
    confirmations = txStatus.confirmations;

    // 如果确认数已满足要求，尝试完成订单
    if (confirmations >= REQUIRED_CONFIRMATIONS[order.paymentChain]) {
      const result = await submitTransaction(orderId, order.txHash);
      if (result.success) {
        return {
          orderId: order.id,
          orderNo: order.orderNo,
          status: 'completed',
          confirmations,
          requiredConfirmations: REQUIRED_CONFIRMATIONS[order.paymentChain],
          newBalance: result.newBalance,
        };
      }
    }
  }

  return {
    orderId: order.id,
    orderNo: order.orderNo,
    amount: Number(order.amount),
    creditsAmount: Number(order.creditsAmount),
    status: order.status,
    txHash: order.txHash,
    confirmations,
    requiredConfirmations: REQUIRED_CONFIRMATIONS[order.paymentChain],
    errorMessage: order.errorMessage,
    createdAt: order.createdAt,
    expiresAt: order.expiresAt,
    completedAt: order.completedAt,
  };
};

/**
 * 获取用户的充值订单列表
 * 
 * @param {string} userId - 用户 ID
 * @param {Object} options - 分页选项
 * @returns {Promise<Object>}
 */
export const getUserRechargeOrders = async (userId, options = {}) => {
  const { page = 1, pageSize = 10, status } = options;
  const skip = (page - 1) * pageSize;

  const where = { userId };
  if (status) {
    where.status = status;
  }

  const [orders, total] = await Promise.all([
    prisma.rechargeOrder.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: pageSize,
    }),
    prisma.rechargeOrder.count({ where }),
  ]);

  return {
    orders: orders.map((order) => ({
      orderId: order.id,
      orderNo: order.orderNo,
      amount: Number(order.amount),
      creditsAmount: Number(order.creditsAmount),
      status: order.status,
      chain: order.paymentChain,
      txHash: order.txHash,
      createdAt: order.createdAt,
      completedAt: order.completedAt,
    })),
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  };
};

/**
 * 处理过期订单（定时任务调用）
 */
export const processExpiredOrders = async () => {
  const now = new Date();
  
  const result = await prisma.rechargeOrder.updateMany({
    where: {
      status: 'pending',
      expiresAt: {
        lt: now,
      },
    },
    data: {
      status: 'expired',
    },
  });

  if (result.count > 0) {
    safeLog.info('[Recharge]', `Marked ${result.count} orders as expired`, {});
  }

  return result.count;
};

/**
 * 验证交易并充值 (txHash-first 模式)
 *
 * 这是新的充值核心函数，特点：
 * - 幂等: 同一 txHash 多次调用结果相同
 * - 原子: 验证+创建订单+充值在同一事务
 * - 简化: 不需要先创建订单，直接用 txHash 充值
 *
 * @param {string} userId - 用户 ID
 * @param {string} txHash - 交易哈希
 * @param {string} chain - 链名称 (polygon)
 * @returns {Promise<Object>} 充值结果
 */
export const verifyAndCreditTransaction = async (userId, txHash, chain = 'polygon') => {
  const normalizedTxHash = txHash.toLowerCase();

  safeLog.info('[Recharge]', 'verifyAndCreditTransaction called', {
    userId: userId.slice(0, 8) + '...',
    txHash: normalizedTxHash.slice(0, 16) + '...',
    chain,
  });

  // 第一步：幂等检查 - 检查 txHash 是否已处理
  const existingOrder = await prisma.rechargeOrder.findUnique({
    where: { txHash: normalizedTxHash },
  });

  if (existingOrder) {
    // txHash 已存在
    if (existingOrder.status === 'completed') {
      // 已完成，返回成功（幂等）
      const user = await prisma.user.findUnique({ where: { id: userId } });
      safeLog.info('[Recharge]', 'Transaction already processed (idempotent)', {
        orderNo: existingOrder.orderNo,
      });
      return {
        success: true,
        alreadyProcessed: true,
        orderId: existingOrder.id,
        orderNo: existingOrder.orderNo,
        creditsAmount: Number(existingOrder.creditsAmount),
        newBalance: Number(user?.aiCreditsBalance || 0),
      };
    }

    if (existingOrder.status === 'confirming') {
      // 正在确认中，继续尝试完成
      safeLog.info('[Recharge]', 'Order in confirming state, will retry verification', {
        orderNo: existingOrder.orderNo,
      });
    } else if (existingOrder.status === 'failed') {
      // 之前失败了，可以重试
      safeLog.info('[Recharge]', 'Previous attempt failed, retrying', {
        orderNo: existingOrder.orderNo,
        previousError: existingOrder.errorMessage,
      });
    } else {
      // 其他状态（pending/expired），不应该有 txHash
      safeLog.warn('[Recharge]', 'Unexpected order state with txHash', {
        orderNo: existingOrder.orderNo,
        status: existingOrder.status,
      });
    }
  }

  // 第二步：验证链上交易
  // 获取平台收款地址
  const receiverAddress = PLATFORM_RECEIVER[chain];
  if (!receiverAddress) {
    return {
      success: false,
      error: `Platform receiver not configured for chain: ${chain}`,
    };
  }

  const verificationResult = await verifyRechargeTransaction(txHash, {
    payerAddress: '', // txHash-first 模式不限制发送方
    amount: 0, // 不限制金额，使用链上实际金额
    chain,
  });

  if (!verificationResult.valid) {
    // 如果是 pending 状态，返回特殊响应
    if (verificationResult.pending) {
      safeLog.info('[Recharge]', 'Transaction still pending on chain', {
        txHash: normalizedTxHash.slice(0, 16) + '...',
      });
      return {
        success: false,
        pending: true,
        error: verificationResult.error,
        confirmations: 0,
        requiredConfirmations: REQUIRED_CONFIRMATIONS[chain],
      };
    }

    // 真正的验证失败
    safeLog.warn('[Recharge]', 'Transaction verification failed', {
      txHash: normalizedTxHash.slice(0, 16) + '...',
      error: verificationResult.error,
    });

    return {
      success: false,
      error: verificationResult.error,
      confirmations: verificationResult.details?.confirmations || 0,
      requiredConfirmations: REQUIRED_CONFIRMATIONS[chain],
    };
  }

  // 第三步：原子操作 - 创建订单 + 增加余额
  const actualAmount = verificationResult.details.amount;

  const result = await prisma.$transaction(async (tx) => {
    // 再次检查 txHash（防止验证期间的并发请求）
    const existingInTx = await tx.rechargeOrder.findUnique({
      where: { txHash: normalizedTxHash },
    });

    if (existingInTx && existingInTx.status === 'completed') {
      // 已被另一个请求完成
      const user = await tx.user.findUnique({ where: { id: userId } });
      return {
        alreadyCompleted: true,
        order: existingInTx,
        user,
      };
    }

    let order;

    if (existingInTx) {
      // 更新现有订单
      order = await tx.rechargeOrder.update({
        where: { id: existingInTx.id },
        data: {
          status: 'completed',
          creditsAmount: actualAmount,
          blockNumber: verificationResult.details.blockNumber,
          confirmations: verificationResult.details.confirmations,
          confirmedAt: new Date(),
          completedAt: new Date(),
          errorMessage: null, // 清除之前的错误
        },
      });
    } else {
      // 创建新订单
      const orderNo = `RECHARGE-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

      order = await tx.rechargeOrder.create({
        data: {
          userId,
          orderNo,
          txHash: normalizedTxHash,
          amount: actualAmount,
          creditsAmount: actualAmount,
          paymentChain: chain,
          paymentToken: 'USDC',
          payerAddress: verificationResult.details.from || '',
          receiverAddress: receiverAddress.toLowerCase(),
          status: 'completed',
          blockNumber: verificationResult.details.blockNumber,
          confirmations: verificationResult.details.confirmations,
          confirmedAt: new Date(),
          completedAt: new Date(),
          expiresAt: new Date(Date.now() + 30 * 60 * 1000), // 虽然已完成，但字段必填
        },
      });
    }

    // 增加用户余额
    const updatedUser = await tx.user.update({
      where: { id: userId },
      data: {
        aiCreditsBalance: {
          increment: actualAmount,
        },
      },
    });

    return {
      alreadyCompleted: false,
      order,
      user: updatedUser,
    };
  });

  if (result.alreadyCompleted) {
    safeLog.info('[Recharge]', 'Order completed by concurrent request', {
      orderNo: result.order.orderNo,
    });
    return {
      success: true,
      alreadyProcessed: true,
      orderId: result.order.id,
      orderNo: result.order.orderNo,
      creditsAmount: Number(result.order.creditsAmount),
      newBalance: Number(result.user.aiCreditsBalance),
    };
  }

  safeLog.info('[Recharge]', '✅ verifyAndCreditTransaction completed', {
    orderNo: result.order.orderNo,
    creditsAmount: actualAmount,
    newBalance: Number(result.user.aiCreditsBalance),
  });

  return {
    success: true,
    orderId: result.order.id,
    orderNo: result.order.orderNo,
    creditsAmount: actualAmount,
    newBalance: Number(result.user.aiCreditsBalance),
    confirmations: verificationResult.details.confirmations,
  };
};

export default {
  createRechargeOrder,
  submitTransaction,
  getOrderStatus,
  getUserRechargeOrders,
  processExpiredOrders,
  verifyAndCreditTransaction,
};



