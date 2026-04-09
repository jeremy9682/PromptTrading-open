/**
 * 管理员路由
 * 
 * 提供管理员面板的 API：
 * - 查看所有用户余额
 * - 查看所有充值订单
 * - 查看收入统计
 * - 手动添加用户余额
 */

import express from 'express';
import { requirePrivyAuth } from '../middleware/privyAuth.middleware.js';
import { adminAuthMiddleware, adminApiKeyAuth } from '../middleware/adminAuth.middleware.js';
import prisma from '../lib/prisma.js';
import { addCreditsManually } from '../services/billing/credits.service.js';
import { 
  cleanupExpiredRecords, 
  getRetentionStats 
} from '../services/billing/data-retention.service.js';

const router = express.Router();

/**
 * 统一的管理员认证
 * 支持 Privy + 邮箱验证 或 API Key
 */
const requireAdmin = [requirePrivyAuth, adminAuthMiddleware];

// ============================================
// 用户管理
// ============================================

/**
 * GET /api/admin/users
 * 获取所有用户列表（分页）
 */
router.get('/users', ...requireAdmin, async (req, res) => {
  try {
    const { page = 1, pageSize = 20, search } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(pageSize);

    const where = {};
    if (search) {
      where.OR = [
        { walletAddress: { contains: search, mode: 'insensitive' } },
        { privyUserId: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true,
          privyUserId: true,
          walletAddress: true,
          aiCreditsBalance: true,
          createdAt: true,
          lastLoginAt: true,
          _count: {
            select: {
              rechargeOrders: true,
              usageRecords: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: parseInt(pageSize),
      }),
      prisma.user.count({ where }),
    ]);

    res.json({
      success: true,
      data: {
        users: users.map((u) => ({
          ...u,
          aiCreditsBalance: Number(u.aiCreditsBalance),
          rechargeCount: u._count.rechargeOrders,
          usageCount: u._count.usageRecords,
        })),
        pagination: {
          page: parseInt(page),
          pageSize: parseInt(pageSize),
          total,
          totalPages: Math.ceil(total / parseInt(pageSize)),
        },
      },
    });
  } catch (error) {
    console.error('[Admin] Get users error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/admin/users/:userId
 * 获取单个用户详情
 */
router.get('/users/:userId', ...requireAdmin, async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        rechargeOrders: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
        usageRecords: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
    });

    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    res.json({
      success: true,
      data: {
        ...user,
        aiCreditsBalance: Number(user.aiCreditsBalance),
      },
    });
  } catch (error) {
    console.error('[Admin] Get user error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/admin/users/:userId/add-credits
 * 手动添加用户余额
 */
router.post('/users/:userId/add-credits', ...requireAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    const { amount, reason } = req.body;

    if (!amount || typeof amount !== 'number' || amount <= 0) {
      return res.status(400).json({ success: false, error: 'Invalid amount' });
    }

    if (!reason) {
      return res.status(400).json({ success: false, error: 'Reason is required' });
    }

    // 一次性传递完整的管理员信息，避免二次更新
    const result = await addCreditsManually(userId, amount, reason, {
      adminId: req.adminUser.userId,
      adminEmail: req.adminUser.email,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
    });

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('[Admin] Add credits error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// 充值订单管理
// ============================================

/**
 * GET /api/admin/orders
 * 获取所有充值订单（分页）
 */
router.get('/orders', ...requireAdmin, async (req, res) => {
  try {
    const { page = 1, pageSize = 20, status, search } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(pageSize);

    const where = {};
    if (status) where.status = status;
    if (search) {
      where.OR = [
        { orderNo: { contains: search, mode: 'insensitive' } },
        { txHash: { contains: search, mode: 'insensitive' } },
        { payerAddress: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [orders, total] = await Promise.all([
      prisma.rechargeOrder.findMany({
        where,
        include: {
          user: {
            select: {
              walletAddress: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: parseInt(pageSize),
      }),
      prisma.rechargeOrder.count({ where }),
    ]);

    res.json({
      success: true,
      data: {
        orders: orders.map((o) => ({
          ...o,
          amount: Number(o.amount),
          creditsAmount: Number(o.creditsAmount),
        })),
        pagination: {
          page: parseInt(page),
          pageSize: parseInt(pageSize),
          total,
          totalPages: Math.ceil(total / parseInt(pageSize)),
        },
      },
    });
  } catch (error) {
    console.error('[Admin] Get orders error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// 统计数据
// ============================================

/**
 * GET /api/admin/stats
 * 获取平台统计数据
 */
router.get('/stats', ...requireAdmin, async (req, res) => {
  try {
    const { days = 30 } = req.query;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));

    // 并行查询多个统计
    const [
      totalUsers,
      totalRechargeAmount,
      totalUsageAmount,
      recentRecharges,
      recentUsage,
      ordersByStatus,
    ] = await Promise.all([
      // 总用户数
      prisma.user.count(),
      
      // 总充值金额
      prisma.rechargeOrder.aggregate({
        where: { status: 'completed' },
        _sum: { amount: true },
      }),
      
      // 总消费金额
      prisma.usageRecord.aggregate({
        _sum: { totalCost: true, openRouterCost: true, platformMarkup: true },
      }),
      
      // 最近充值（按天）
      prisma.rechargeOrder.groupBy({
        by: ['createdAt'],
        where: {
          status: 'completed',
          createdAt: { gte: startDate },
        },
        _sum: { amount: true },
        _count: true,
      }),
      
      // 最近消费（按天）
      prisma.usageRecord.groupBy({
        by: ['createdAt'],
        where: {
          createdAt: { gte: startDate },
        },
        _sum: { totalCost: true },
        _count: true,
      }),
      
      // 订单状态分布
      prisma.rechargeOrder.groupBy({
        by: ['status'],
        _count: true,
        _sum: { amount: true },
      }),
    ]);

    res.json({
      success: true,
      data: {
        overview: {
          totalUsers,
          totalRechargeAmount: Number(totalRechargeAmount._sum.amount || 0),
          totalUsageRevenue: Number(totalUsageAmount._sum.totalCost || 0),
          totalOpenRouterCost: Number(totalUsageAmount._sum.openRouterCost || 0),
          totalPlatformProfit: Number(totalUsageAmount._sum.platformMarkup || 0),
        },
        ordersByStatus: ordersByStatus.map((s) => ({
          status: s.status,
          count: s._count,
          amount: Number(s._sum.amount || 0),
        })),
        period: `Last ${days} days`,
      },
    });
  } catch (error) {
    console.error('[Admin] Get stats error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/admin/daily-stats
 * 获取每日统计（用于图表）
 */
router.get('/daily-stats', ...requireAdmin, async (req, res) => {
  try {
    const { days = 30 } = req.query;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));
    startDate.setHours(0, 0, 0, 0);

    // 使用原生 SQL 查询按日聚合
    const dailyRecharges = await prisma.$queryRaw`
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as count,
        SUM(amount) as total_amount
      FROM recharge_orders
      WHERE status = 'completed' AND created_at >= ${startDate}
      GROUP BY DATE(created_at)
      ORDER BY date ASC
    `;

    const dailyUsage = await prisma.$queryRaw`
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as count,
        SUM(total_cost) as total_cost,
        SUM(platform_markup) as total_profit
      FROM usage_records
      WHERE created_at >= ${startDate}
      GROUP BY DATE(created_at)
      ORDER BY date ASC
    `;

    res.json({
      success: true,
      data: {
        recharges: dailyRecharges,
        usage: dailyUsage,
        period: `Last ${days} days`,
      },
    });
  } catch (error) {
    console.error('[Admin] Get daily stats error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// 管理员操作日志
// ============================================

/**
 * GET /api/admin/logs
 * 获取管理员操作日志
 */
router.get('/logs', ...requireAdmin, async (req, res) => {
  try {
    const { page = 1, pageSize = 50, action } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(pageSize);

    const where = {};
    if (action) where.action = action;

    const [logs, total] = await Promise.all([
      prisma.adminActionLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: parseInt(pageSize),
      }),
      prisma.adminActionLog.count({ where }),
    ]);

    res.json({
      success: true,
      data: {
        logs,
        pagination: {
          page: parseInt(page),
          pageSize: parseInt(pageSize),
          total,
          totalPages: Math.ceil(total / parseInt(pageSize)),
        },
      },
    });
  } catch (error) {
    console.error('[Admin] Get logs error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// 数据保留管理
// ============================================

/**
 * GET /api/admin/data-retention/stats
 * 获取数据保留统计
 */
router.get('/data-retention/stats', requireAdmin, async (req, res) => {
  try {
    const stats = await getRetentionStats();
    res.json({ success: true, data: stats });
  } catch (error) {
    console.error('[Admin] Get retention stats error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/admin/data-retention/cleanup
 * 手动触发数据清理
 * 
 * Body: { dryRun?: boolean }
 */
router.post('/data-retention/cleanup', requireAdmin, async (req, res) => {
  try {
    const { dryRun = false } = req.body;
    
    console.log(`[Admin] 管理员 ${req.adminUser.email} 触发数据清理 (dryRun: ${dryRun})`);
    
    const result = await cleanupExpiredRecords({ dryRun });
    
    // 记录管理员操作
    if (!dryRun && result.deletedCount > 0) {
      await prisma.adminActionLog.create({
        data: {
          adminId: req.adminUser.userId,
          adminEmail: req.adminUser.email,
          action: 'data_cleanup',
          targetType: 'usage_records',
          targetId: null,
          details: {
            deletedCount: result.deletedCount,
            cutoffDate: result.cutoffDate,
          },
          reason: '手动触发数据清理',
          ipAddress: req.ip,
          userAgent: req.get('User-Agent'),
        },
      });
    }
    
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('[Admin] Data cleanup error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;



