/**
 * AI Credits 余额服务
 * 
 * 处理用户余额查询、扣费、使用记录等
 */

import prisma from '../../lib/prisma.js';
import { PLATFORM_MARKUP } from '../../config/recharge.config.js';

/**
 * 获取用户余额
 * 
 * @param {string} userId - 用户 ID (数据库 ID)
 * @returns {Promise<{ balance: number, currency: string }>}
 */
export const getUserBalance = async (userId) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      aiCreditsBalance: true,
      aiCreditsCurrency: true,
    },
  });

  if (!user) {
    throw new Error('User not found');
  }

  return {
    balance: Number(user.aiCreditsBalance),
    currency: user.aiCreditsCurrency,
  };
};

/**
 * 通过 Privy User ID 获取用户余额
 * 
 * @param {string} privyUserId - Privy User ID
 * @returns {Promise<{ balance: number, currency: string, userId: string }>}
 */
export const getBalanceByPrivyUserId = async (privyUserId) => {
  const user = await prisma.user.findUnique({
    where: { privyUserId },
    select: {
      id: true,
      aiCreditsBalance: true,
      aiCreditsCurrency: true,
    },
  });

  if (!user) {
    throw new Error('User not found');
  }

  return {
    userId: user.id,
    balance: Number(user.aiCreditsBalance),
    currency: user.aiCreditsCurrency,
  };
};

/**
 * 检查用户是否有足够余额
 * 
 * @param {string} userId - 用户 ID
 * @param {number} requiredAmount - 需要的金额
 * @returns {Promise<{ sufficient: boolean, balance: number, required: number }>}
 */
export const checkBalance = async (userId, requiredAmount) => {
  const { balance } = await getUserBalance(userId);
  
  return {
    sufficient: balance >= requiredAmount,
    balance,
    required: requiredAmount,
  };
};

/**
 * 扣减用户余额（AI 使用）
 * 
 * @param {string} userId - 用户 ID
 * @param {Object} usageInfo - 使用信息
 * @param {string} usageInfo.type - 使用类型 (ai_analysis | auto_trade_analysis)
 * @param {string} usageInfo.aiModel - AI 模型 ID
 * @param {string} usageInfo.aiModelName - AI 模型全名
 * @param {number} usageInfo.promptTokens - Prompt Tokens
 * @param {number} usageInfo.completionTokens - Completion Tokens
 * @param {number} usageInfo.openRouterCost - OpenRouter 原始成本
 * @param {string} [usageInfo.description] - 可读描述
 * @returns {Promise<{ success: boolean, newBalance: number, totalCost: number, usageId: string }>}
 */
export const deductBalance = async (userId, usageInfo) => {
  const {
    type,
    aiModel,
    aiModelName,
    promptTokens,
    completionTokens,
    openRouterCost,
    description,
  } = usageInfo;

  // 计算平台加成和总费用
  const platformMarkup = openRouterCost * PLATFORM_MARKUP;
  const totalCost = openRouterCost + platformMarkup;

  // 使用事务确保原子性
  const result = await prisma.$transaction(async (tx) => {
    // 获取当前余额
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { aiCreditsBalance: true },
    });

    if (!user) {
      throw new Error('User not found');
    }

    const balanceBefore = Number(user.aiCreditsBalance);

    // 检查余额是否足够
    if (balanceBefore < totalCost) {
      throw new Error(`Insufficient balance. Required: $${totalCost.toFixed(6)}, Available: $${balanceBefore.toFixed(6)}`);
    }

    const balanceAfter = balanceBefore - totalCost;

    // 扣减余额
    const updatedUser = await tx.user.update({
      where: { id: userId },
      data: {
        aiCreditsBalance: {
          decrement: totalCost,
        },
      },
    });

    // 创建使用记录
    const usageRecord = await tx.usageRecord.create({
      data: {
        userId,
        type,
        description,
        aiModel,
        aiModelName,
        promptTokens,
        completionTokens,
        openRouterCost,
        platformMarkup,
        totalCost,
        balanceBefore,
        balanceAfter,
      },
    });

    return {
      user: updatedUser,
      usageRecord,
      balanceBefore,
      balanceAfter,
    };
  });

  console.log(`[Credits] Deducted $${totalCost.toFixed(6)} from user ${userId}. New balance: $${result.balanceAfter.toFixed(6)}`);

  return {
    success: true,
    newBalance: Number(result.user.aiCreditsBalance),
    totalCost,
    openRouterCost,
    platformMarkup,
    usageId: result.usageRecord.id,
  };
};

/**
 * 获取用户使用记录
 * 
 * @param {string} userId - 用户 ID
 * @param {Object} options - 分页选项
 * @returns {Promise<Object>}
 */
export const getUserUsageRecords = async (userId, options = {}) => {
  const { page = 1, pageSize = 20, type } = options;
  const skip = (page - 1) * pageSize;

  const where = { userId };
  if (type) {
    where.type = type;
  }

  const [records, total] = await Promise.all([
    prisma.usageRecord.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: pageSize,
    }),
    prisma.usageRecord.count({ where }),
  ]);

  return {
    records: records.map((record) => ({
      id: record.id,
      type: record.type,
      description: record.description,
      aiModel: record.aiModel,
      aiModelName: record.aiModelName,
      promptTokens: record.promptTokens,
      completionTokens: record.completionTokens,
      openRouterCost: Number(record.openRouterCost),
      platformMarkup: Number(record.platformMarkup),
      totalCost: Number(record.totalCost),
      balanceBefore: Number(record.balanceBefore),
      balanceAfter: Number(record.balanceAfter),
      createdAt: record.createdAt,
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
 * 获取用户使用统计
 * 
 * @param {string} userId - 用户 ID
 * @param {Object} options - 选项
 * @returns {Promise<Object>}
 */
export const getUserUsageStats = async (userId, options = {}) => {
  const { days = 30 } = options;
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const stats = await prisma.usageRecord.aggregate({
    where: {
      userId,
      createdAt: {
        gte: startDate,
      },
    },
    _sum: {
      totalCost: true,
      openRouterCost: true,
      platformMarkup: true,
      promptTokens: true,
      completionTokens: true,
    },
    _count: true,
  });

  // 按类型统计
  const byType = await prisma.usageRecord.groupBy({
    by: ['type'],
    where: {
      userId,
      createdAt: {
        gte: startDate,
      },
    },
    _sum: {
      totalCost: true,
    },
    _count: true,
  });

  return {
    period: `Last ${days} days`,
    totalUsage: {
      count: stats._count,
      totalCost: Number(stats._sum.totalCost || 0),
      openRouterCost: Number(stats._sum.openRouterCost || 0),
      platformMarkup: Number(stats._sum.platformMarkup || 0),
      promptTokens: stats._sum.promptTokens || 0,
      completionTokens: stats._sum.completionTokens || 0,
    },
    byType: byType.map((item) => ({
      type: item.type,
      count: item._count,
      totalCost: Number(item._sum.totalCost || 0),
    })),
  };
};

/**
 * 预估 AI 调用成本
 * 基于模型和预估 token 数量
 * 
 * @param {string} modelId - 模型 ID
 * @param {number} estimatedTokens - 预估 token 数量
 * @returns {{ estimatedCost: number, breakdown: Object }}
 */
export const estimateCost = (modelId, estimatedTokens = 5000) => {
  // 模型价格参考 (每 1M tokens)
  const MODEL_PRICES = {
    deepseek: { prompt: 0.14, completion: 0.28 },
    qwen: { prompt: 0.12, completion: 0.24 },
    'gpt4': { prompt: 5.0, completion: 15.0 },
    'gpt-4o': { prompt: 5.0, completion: 15.0 },
    claude: { prompt: 3.0, completion: 15.0 },
    grok: { prompt: 5.0, completion: 15.0 },
    gemini: { prompt: 1.25, completion: 5.0 },
    mixtral: { prompt: 0.24, completion: 0.24 },
    llama3: { prompt: 0.59, completion: 0.79 },
  };

  const prices = MODEL_PRICES[modelId] || MODEL_PRICES.deepseek;
  
  // 假设 prompt:completion 比例为 3:1
  const promptTokens = Math.floor(estimatedTokens * 0.75);
  const completionTokens = Math.floor(estimatedTokens * 0.25);

  const promptCost = (promptTokens / 1_000_000) * prices.prompt;
  const completionCost = (completionTokens / 1_000_000) * prices.completion;
  const openRouterCost = promptCost + completionCost;
  const platformMarkup = openRouterCost * PLATFORM_MARKUP;
  const totalCost = openRouterCost + platformMarkup;

  return {
    estimatedCost: totalCost,
    breakdown: {
      model: modelId,
      estimatedTokens,
      promptTokens,
      completionTokens,
      openRouterCost,
      platformMarkup,
      platformMarkupPercent: `${PLATFORM_MARKUP * 100}%`,
    },
  };
};

/**
 * 管理员：手动添加用户余额
 * 用于促销、补偿等场景
 * 
 * @param {string} userId - 用户 ID
 * @param {number} amount - 添加金额
 * @param {string} reason - 原因
 * @param {Object} adminInfo - 管理员信息
 * @param {string} adminInfo.adminId - 管理员 Privy User ID
 * @param {string} adminInfo.adminEmail - 管理员邮箱
 * @param {string} [adminInfo.ipAddress] - IP 地址
 * @param {string} [adminInfo.userAgent] - User Agent
 * @returns {Promise<Object>}
 */
export const addCreditsManually = async (userId, amount, reason, adminInfo) => {
  const result = await prisma.$transaction(async (tx) => {
    // 获取当前余额
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { aiCreditsBalance: true },
    });

    if (!user) {
      throw new Error('User not found');
    }

    const balanceBefore = Number(user.aiCreditsBalance);

    // 增加余额
    const updatedUser = await tx.user.update({
      where: { id: userId },
      data: {
        aiCreditsBalance: {
          increment: amount,
        },
      },
    });

    // 记录管理员操作（一次性填充所有信息）
    await tx.adminActionLog.create({
      data: {
        adminId: adminInfo.adminId,
        adminEmail: adminInfo.adminEmail,
        action: 'add_credits',
        targetType: 'user',
        targetId: userId,
        details: {
          amount,
          balanceBefore,
          balanceAfter: Number(updatedUser.aiCreditsBalance),
        },
        reason,
        ipAddress: adminInfo.ipAddress || null,
        userAgent: adminInfo.userAgent || null,
      },
    });

    return {
      user: updatedUser,
      balanceBefore,
    };
  });

  console.log(`[Credits] Admin added $${amount} to user ${userId}. Reason: ${reason}`);

  return {
    success: true,
    userId,
    addedAmount: amount,
    newBalance: Number(result.user.aiCreditsBalance),
    balanceBefore: result.balanceBefore,
  };
};

export default {
  getUserBalance,
  getBalanceByPrivyUserId,
  checkBalance,
  deductBalance,
  getUserUsageRecords,
  getUserUsageStats,
  estimateCost,
  addCreditsManually,
};



