/**
 * 充值路由
 * 
 * 处理 AI Credits 充值相关 API
 * 
 * 🔒 安全措施:
 * - 所有写操作需要 Privy 认证
 * - 速率限制防止滥用
 * - 订单归属验证
 */

import express from 'express';
import { requirePrivyAuth } from '../middleware/privyAuth.middleware.js';
import { rechargeRateLimiter, submitTxRateLimiter } from '../middleware/rateLimit.middleware.js';
import prisma from '../lib/prisma.js';
import {
  createRechargeOrder,
  submitTransaction,
  getOrderStatus,
  getUserRechargeOrders,
  verifyAndCreditTransaction,
} from '../services/billing/recharge.service.js';
import {
  getConfigSummary,
  PLATFORM_RECEIVER,
  USDC_CONTRACTS,
  AMOUNT_TIERS,
} from '../config/recharge.config.js';

const router = express.Router();

/**
 * GET /api/recharge/config
 * 获取充值配置信息（公开）
 */
router.get('/config', (req, res) => {
  const config = getConfigSummary();
  
  // 添加合约地址信息
  config.contracts = {
    arbitrum: {
      usdc: USDC_CONTRACTS.arbitrum,
      receiver: PLATFORM_RECEIVER.arbitrum,
    },
    polygon: {
      usdc: USDC_CONTRACTS.polygon,
      receiver: PLATFORM_RECEIVER.polygon,
    },
  };
  
  res.json({
    success: true,
    data: config,
  });
});

/**
 * POST /api/recharge/create
 * 创建充值订单（需要登录）
 * 🔒 速率限制: 每用户每分钟最多 5 次
 */
router.post('/create', requirePrivyAuth, rechargeRateLimiter, async (req, res) => {
  try {
    const { amount, chain = 'arbitrum' } = req.body;
    const privyUserId = req.privyUser.userId;

    // 验证参数
    if (!amount) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameter: amount',
      });
    }

    // 测试模式：允许任意正数金额（测试完恢复）
    // if (!AMOUNT_TIERS.includes(amount)) {
    //   return res.status(400).json({
    //     success: false,
    //     error: `Invalid amount. Allowed tiers: ${AMOUNT_TIERS.join(', ')} USDC`,
    //   });
    // }
    if (amount <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Amount must be positive',
      });
    }

    // 获取用户
    const user = await prisma.user.findUnique({
      where: { privyUserId },
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found. Please sync your account first.',
      });
    }

    // 创建订单
    const order = await createRechargeOrder(
      user.id,
      user.walletAddress,
      amount,
      chain
    );

    res.json({
      success: true,
      data: order,
    });

  } catch (error) {
    console.error('[Recharge] Create order error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/recharge/submit-tx
 * 提交交易哈希验证（需要登录）
 * 🔒 速率限制: 每用户每分钟最多 10 次
 */
router.post('/submit-tx', requirePrivyAuth, submitTxRateLimiter, async (req, res) => {
  try {
    const { orderId, txHash } = req.body;
    const privyUserId = req.privyUser.userId;

    // 验证参数
    if (!orderId || !txHash) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters: orderId, txHash',
      });
    }

    // 验证交易哈希格式
    if (!txHash.match(/^0x[a-fA-F0-9]{64}$/)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid transaction hash format',
      });
    }

    // 获取用户
    const user = await prisma.user.findUnique({
      where: { privyUserId },
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
      });
    }

    // 验证订单属于该用户
    const order = await prisma.rechargeOrder.findUnique({
      where: { id: orderId },
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        error: 'Order not found',
      });
    }

    if (order.userId !== user.id) {
      return res.status(403).json({
        success: false,
        error: 'Order does not belong to this user',
      });
    }

    // 提交交易验证
    const result = await submitTransaction(orderId, txHash);

    res.json({
      success: result.success,
      data: result,
    });

  } catch (error) {
    console.error('[Recharge] Submit tx error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/recharge/verify-tx
 * 验证交易并充值 (txHash-first 模式)
 *
 * 新的充值核心 API，特点：
 * - 幂等: 同一 txHash 多次调用结果相同
 * - 原子: 验证+创建订单+充值在一步完成
 * - 简化: 不需要先创建订单
 *
 * 🔒 速率限制: 每用户每分钟最多 10 次
 */
router.post('/verify-tx', requirePrivyAuth, submitTxRateLimiter, async (req, res) => {
  try {
    const { txHash, chain = 'polygon' } = req.body;
    const privyUserId = req.privyUser.userId;

    // 验证参数
    if (!txHash) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameter: txHash',
      });
    }

    // 验证交易哈希格式
    if (!txHash.match(/^0x[a-fA-F0-9]{64}$/)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid transaction hash format',
      });
    }

    // 获取用户
    const user = await prisma.user.findUnique({
      where: { privyUserId },
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found. Please sync your account first.',
      });
    }

    // 调用核心函数
    const result = await verifyAndCreditTransaction(user.id, txHash, chain);

    // 返回结果
    if (result.success) {
      res.json({
        success: true,
        data: {
          orderId: result.orderId,
          orderNo: result.orderNo,
          creditsAmount: result.creditsAmount,
          newBalance: result.newBalance,
          confirmations: result.confirmations,
          alreadyProcessed: result.alreadyProcessed || false,
        },
      });
    } else {
      // 区分 pending 和真正的失败
      const statusCode = result.pending ? 202 : 400;
      res.status(statusCode).json({
        success: false,
        data: {
          error: result.error,
          pending: result.pending || false,
          confirmations: result.confirmations || 0,
          requiredConfirmations: result.requiredConfirmations,
        },
      });
    }
  } catch (error) {
    console.error('[Recharge] verify-tx error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/recharge/status/:orderId
 * 查询订单状态（需要登录）
 */
router.get('/status/:orderId', requirePrivyAuth, async (req, res) => {
  try {
    const { orderId } = req.params;
    const privyUserId = req.privyUser.userId;

    // 获取用户
    const user = await prisma.user.findUnique({
      where: { privyUserId },
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
      });
    }

    // 验证订单属于该用户
    const order = await prisma.rechargeOrder.findUnique({
      where: { id: orderId },
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        error: 'Order not found',
      });
    }

    if (order.userId !== user.id) {
      return res.status(403).json({
        success: false,
        error: 'Order does not belong to this user',
      });
    }

    // 获取订单状态
    const status = await getOrderStatus(orderId);

    res.json({
      success: true,
      data: status,
    });

  } catch (error) {
    console.error('[Recharge] Get status error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/recharge/orders
 * 获取用户充值记录（需要登录）
 */
router.get('/orders', requirePrivyAuth, async (req, res) => {
  try {
    const privyUserId = req.privyUser.userId;
    const { page = 1, pageSize = 10, status } = req.query;

    // 获取用户
    const user = await prisma.user.findUnique({
      where: { privyUserId },
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
      });
    }

    // 获取订单列表
    const result = await getUserRechargeOrders(user.id, {
      page: parseInt(page),
      pageSize: parseInt(pageSize),
      status,
    });

    res.json({
      success: true,
      data: result,
    });

  } catch (error) {
    console.error('[Recharge] Get orders error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

export default router;



