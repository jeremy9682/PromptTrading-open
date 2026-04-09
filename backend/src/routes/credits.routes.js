/**
 * AI Credits 余额路由
 * 
 * 处理余额查询、使用记录等 API
 */

import express from 'express';
import { requirePrivyAuth } from '../middleware/privyAuth.middleware.js';
import prisma from '../lib/prisma.js';
import {
  getUserBalance,
  getUserUsageRecords,
  getUserUsageStats,
  estimateCost,
} from '../services/billing/credits.service.js';
import { PLATFORM_RECEIVER } from '../config/recharge.config.js';

const router = express.Router();

/**
 * GET /api/credits/balance
 * 获取当前用户余额（需要登录）
 */
router.get('/balance', requirePrivyAuth, async (req, res) => {
  try {
    const privyUserId = req.privyUser.userId;

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

    // 获取余额
    const balance = await getUserBalance(user.id);

    res.json({
      success: true,
      data: {
        balance: balance.balance,
        currency: balance.currency,
        formatted: `$${balance.balance.toFixed(2)}`,
      },
    });

  } catch (error) {
    console.error('[Credits] Get balance error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/credits/usage
 * 获取使用记录（需要登录）
 */
router.get('/usage', requirePrivyAuth, async (req, res) => {
  try {
    const privyUserId = req.privyUser.userId;
    const { page = 1, pageSize = 20, type } = req.query;

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

    // 获取使用记录
    const result = await getUserUsageRecords(user.id, {
      page: parseInt(page),
      pageSize: parseInt(pageSize),
      type,
    });

    res.json({
      success: true,
      data: result,
    });

  } catch (error) {
    console.error('[Credits] Get usage error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/credits/stats
 * 获取使用统计（需要登录）
 */
router.get('/stats', requirePrivyAuth, async (req, res) => {
  try {
    const privyUserId = req.privyUser.userId;
    const { days = 30 } = req.query;

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

    // 获取统计
    const stats = await getUserUsageStats(user.id, {
      days: parseInt(days),
    });

    res.json({
      success: true,
      data: stats,
    });

  } catch (error) {
    console.error('[Credits] Get stats error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/credits/estimate
 * 预估 AI 调用成本（公开）
 */
router.get('/estimate', (req, res) => {
  const { model = 'deepseek', tokens = 5000 } = req.query;

  const estimate = estimateCost(model, parseInt(tokens));

  res.json({
    success: true,
    data: estimate,
  });
});

/**
 * GET /api/credits/daily-summary
 * 获取每日汇总数据（用于图表）
 */
router.get('/daily-summary', requirePrivyAuth, async (req, res) => {
  try {
    const privyUserId = req.privyUser.userId;
    const { days = 30 } = req.query;

    const user = await prisma.user.findUnique({
      where: { privyUserId },
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
      });
    }

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));
    startDate.setHours(0, 0, 0, 0);

    // 🔧 优化：使用数据库聚合代替内存聚合
    // 按日期分组聚合使用记录
    const usageAggregation = await prisma.$queryRaw`
      SELECT 
        DATE(created_at) as date,
        SUM(total_cost) as spend,
        COUNT(*) as requests,
        SUM(COALESCE(prompt_tokens, 0) + COALESCE(completion_tokens, 0)) as tokens
      FROM usage_records
      WHERE user_id = ${user.id}
        AND created_at >= ${startDate}
      GROUP BY DATE(created_at)
      ORDER BY date ASC
    `;

    // 按日期分组聚合充值记录
    const rechargeAggregation = await prisma.$queryRaw`
      SELECT 
        DATE(completed_at) as date,
        SUM(credits_amount) as recharge
      FROM recharge_orders
      WHERE user_id = ${user.id}
        AND status = 'completed'
        AND completed_at >= ${startDate}
      GROUP BY DATE(completed_at)
      ORDER BY date ASC
    `;

    // 构建每日汇总 Map
    const dailyMap = new Map();
    
    // 初始化所有日期
    for (let i = 0; i <= parseInt(days); i++) {
      const date = new Date(startDate);
      date.setDate(date.getDate() + i);
      const dateKey = date.toISOString().split('T')[0];
      dailyMap.set(dateKey, {
        date: dateKey,
        spend: 0,
        recharge: 0,
        requests: 0,
        tokens: 0,
      });
    }

    // 填充使用数据
    usageAggregation.forEach(row => {
      const dateKey = row.date instanceof Date 
        ? row.date.toISOString().split('T')[0] 
        : String(row.date);
      if (dailyMap.has(dateKey)) {
        const day = dailyMap.get(dateKey);
        day.spend = Number(row.spend) || 0;
        day.requests = Number(row.requests) || 0;
        day.tokens = Number(row.tokens) || 0;
      }
    });

    // 填充充值数据
    rechargeAggregation.forEach(row => {
      const dateKey = row.date instanceof Date 
        ? row.date.toISOString().split('T')[0] 
        : String(row.date);
      if (dailyMap.has(dateKey)) {
        const day = dailyMap.get(dateKey);
        day.recharge = Number(row.recharge) || 0;
      }
    });

    const dailySummary = Array.from(dailyMap.values());

    res.json({
      success: true,
      data: {
        summary: dailySummary,
        totals: {
          totalSpend: dailySummary.reduce((sum, d) => sum + d.spend, 0),
          totalRecharge: dailySummary.reduce((sum, d) => sum + d.recharge, 0),
          totalRequests: dailySummary.reduce((sum, d) => sum + d.requests, 0),
          totalTokens: dailySummary.reduce((sum, d) => sum + d.tokens, 0),
        },
      },
    });

  } catch (error) {
    console.error('[Credits] Get daily summary error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/credits/pending-recharge
 * 创建待处理充值订单（在打开 Privy fundWallet 前调用）
 * 
 * 这是匹配充值的关键：用户通过 fundWallet 充值时，
 * from 地址可能是任意外部钱包，无法通过 from 地址匹配用户。
 * 所以需要先创建 pending 订单，后端通过 金额+时间窗口 匹配。
 */
router.post('/pending-recharge', requirePrivyAuth, async (req, res) => {
  try {
    const privyUserId = req.privyUser.userId;
    const { amount, chain = 'arbitrum' } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid amount',
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

    // 检查是否有未完成的订单（防止重复创建）
    const existingPending = await prisma.rechargeOrder.findFirst({
      where: {
        userId: user.id,
        status: 'pending',
        expiresAt: { gt: new Date() },
      },
    });

    if (existingPending) {
      // 更新现有订单的金额和过期时间
      const updatedOrder = await prisma.rechargeOrder.update({
        where: { id: existingPending.id },
        data: {
          amount: amount,
          creditsAmount: amount,
          paymentChain: chain,
          expiresAt: new Date(Date.now() + 30 * 60 * 1000), // 30分钟
        },
      });

      console.log(`[Credits] 更新 pending 订单: ${updatedOrder.orderNo}, 金额=${amount} USDC`);

      return res.json({
        success: true,
        data: {
          orderId: updatedOrder.id,
          orderNo: updatedOrder.orderNo,
          amount: Number(updatedOrder.amount),
          expiresAt: updatedOrder.expiresAt,
        },
      });
    }

    // 创建新的 pending 订单
    const orderNo = `RECHARGE-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    
    const order = await prisma.rechargeOrder.create({
      data: {
        orderNo,
        user: { connect: { id: user.id } }, // 使用关系连接
        amount: amount,
        creditsAmount: amount, // 1:1 兑换
        paymentChain: chain,
        paymentToken: 'USDC',
        payerAddress: '', // 空字符串表示未知（通过 Safe/fundWallet 充值）
        receiverAddress: (PLATFORM_RECEIVER[chain] || '').toLowerCase(),
        status: 'pending',
        expiresAt: new Date(Date.now() + 30 * 60 * 1000), // 30分钟过期
      },
    });

    console.log(`[Credits] 创建 pending 订单: ${orderNo}, 用户=${user.id}, 金额=${amount} USDC`);

    res.json({
      success: true,
      data: {
        orderId: order.id,
        orderNo: order.orderNo,
        amount: Number(order.amount),
        expiresAt: order.expiresAt,
      },
    });

  } catch (error) {
    console.error('[Credits] Create pending recharge error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/credits/model-breakdown
 * 获取模型使用分布
 */
router.get('/model-breakdown', requirePrivyAuth, async (req, res) => {
  try {
    const privyUserId = req.privyUser.userId;
    const { days = 30 } = req.query;

    const user = await prisma.user.findUnique({
      where: { privyUserId },
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
      });
    }

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));

    // 🔧 优化：使用数据库聚合代替内存聚合
    const modelAggregation = await prisma.$queryRaw`
      SELECT 
        COALESCE(ai_model, 'unknown') as model,
        COUNT(*) as requests,
        SUM(total_cost) as spend,
        SUM(COALESCE(prompt_tokens, 0) + COALESCE(completion_tokens, 0)) as tokens
      FROM usage_records
      WHERE user_id = ${user.id}
        AND created_at >= ${startDate}
      GROUP BY ai_model
      ORDER BY spend DESC
    `;

    // 计算总消费
    const totalSpend = modelAggregation.reduce((sum, m) => sum + Number(m.spend || 0), 0);

    // 格式化输出
    const breakdown = modelAggregation.map(row => ({
      model: row.model || 'unknown',
      requests: Number(row.requests) || 0,
      spend: Number(row.spend) || 0,
      tokens: Number(row.tokens) || 0,
      percentage: totalSpend > 0 ? ((Number(row.spend) / totalSpend) * 100).toFixed(1) : '0',
      avgCostPerRequest: Number(row.requests) > 0 
        ? (Number(row.spend) / Number(row.requests)).toFixed(4) 
        : '0',
    }));

    res.json({
      success: true,
      data: {
        breakdown,
        totalSpend,
        totalRequests: breakdown.reduce((sum, m) => sum + m.requests, 0),
      },
    });

  } catch (error) {
    console.error('[Credits] Get model breakdown error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/credits/history
 * 获取完整交易历史（充值+消费）（需要登录）
 */
router.get('/history', requirePrivyAuth, async (req, res) => {
  try {
    const privyUserId = req.privyUser.userId;
    const { page = 1, pageSize = 20, type } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(pageSize);

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

    // 根据类型筛选
    let records = [];
    let total = 0;

    if (!type || type === 'all') {
      // 🔧 优化：使用 SQL UNION 在数据库中合并排序，避免加载所有记录到内存
      const [rechargeCount, usageCount] = await Promise.all([
        prisma.rechargeOrder.count({ where: { userId: user.id, status: 'completed' } }),
        prisma.usageRecord.count({ where: { userId: user.id } }),
      ]);

      total = rechargeCount + usageCount;

      // 使用 UNION ALL 在数据库中合并两个表，并在数据库中排序和分页
      const combinedRecords = await prisma.$queryRaw`
        (
          SELECT 
            id,
            'recharge' as type,
            credits_amount as amount,
            'in' as direction,
            CONCAT('Recharge ', credits_amount, ' USDC') as description,
            tx_hash as "txHash",
            NULL as "aiModel",
            completed_at as "createdAt"
          FROM recharge_orders
          WHERE user_id = ${user.id} AND status = 'completed'
        )
        UNION ALL
        (
          SELECT 
            id,
            'usage' as type,
            total_cost as amount,
            'out' as direction,
            COALESCE(description, CONCAT('Polymarket AI Analysis (', ai_model, ')')) as description,
            NULL as "txHash",
            ai_model as "aiModel",
            created_at as "createdAt"
          FROM usage_records
          WHERE user_id = ${user.id}
        )
        ORDER BY "createdAt" DESC
        LIMIT ${parseInt(pageSize)}
        OFFSET ${skip}
      `;

      records = combinedRecords.map(r => ({
        id: r.id,
        type: r.type,
        amount: Number(r.amount) || 0,
        direction: r.direction,
        description: r.description,
        txHash: r.txHash,
        aiModel: r.aiModel,
        createdAt: r.createdAt,
      }));

    } else if (type === 'recharge') {
      // 只获取充值记录
      const [recharges, count] = await Promise.all([
        prisma.rechargeOrder.findMany({
          where: { userId: user.id, status: 'completed' },
          orderBy: { completedAt: 'desc' },
          skip,
          take: parseInt(pageSize),
        }),
        prisma.rechargeOrder.count({ where: { userId: user.id, status: 'completed' } }),
      ]);

      records = recharges.map(r => ({
        id: r.id,
        type: 'recharge',
        amount: Number(r.creditsAmount),
        direction: 'in',
        description: `Recharge ${Number(r.creditsAmount)} USDC`,
        txHash: r.txHash,
        createdAt: r.completedAt,
      }));
      total = count;

    } else if (type === 'usage') {
      // 只获取消费记录
      const [usages, count] = await Promise.all([
        prisma.usageRecord.findMany({
          where: { userId: user.id },
          orderBy: { createdAt: 'desc' },
          skip,
          take: parseInt(pageSize),
        }),
        prisma.usageRecord.count({ where: { userId: user.id } }),
      ]);

      records = usages.map(u => ({
        id: u.id,
        type: 'usage',
        amount: Number(u.totalCost),
        direction: 'out',
        description: u.description || `Polymarket AI Analysis (${u.aiModel})`,
        aiModel: u.aiModel,
        createdAt: u.createdAt,
      }));
      total = count;
    }

    res.json({
      success: true,
      data: {
        records,
        pagination: {
          page: parseInt(page),
          pageSize: parseInt(pageSize),
          total,
          totalPages: Math.ceil(total / parseInt(pageSize)),
        },
      },
    });

  } catch (error) {
    console.error('[Credits] Get history error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/credits/manual-complete
 * 手动完成充值订单（临时测试用）
 */
router.post('/manual-complete', requirePrivyAuth, async (req, res) => {
  try {
    const privyUserId = req.privyUser.userId;
    const { txHash } = req.body;

    if (!txHash) {
      return res.status(400).json({ success: false, error: 'txHash required' });
    }

    // 获取用户
    const user = await prisma.user.findUnique({
      where: { privyUserId },
    });

    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    // 查找订单
    const order = await prisma.rechargeOrder.findFirst({
      where: { txHash: txHash.toLowerCase() },
    });

    if (!order) {
      return res.status(404).json({ success: false, error: 'Order not found' });
    }

    if (order.userId !== user.id) {
      return res.status(403).json({ success: false, error: 'Order does not belong to this user' });
    }

    if (order.status === 'completed') {
      return res.json({ success: true, message: 'Order already completed' });
    }

    // 手动完成订单
    await prisma.$transaction(async (tx) => {
      await tx.rechargeOrder.update({
        where: { id: order.id },
        data: {
          status: 'completed',
          completedAt: new Date(),
        },
      });

      await tx.user.update({
        where: { id: user.id },
        data: {
          aiCreditsBalance: { increment: Number(order.creditsAmount) },
        },
      });
    });

    console.log(`[Credits] ✅ 手动完成订单: ${order.orderNo}, 金额=${order.creditsAmount} USDC`);

    res.json({
      success: true,
      message: 'Order completed',
      creditsAmount: Number(order.creditsAmount),
    });

  } catch (error) {
    console.error('[Credits] Manual complete error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;



