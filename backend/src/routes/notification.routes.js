/**
 * Notification Routes
 *
 * 通知相关的 API 路由
 *
 * Routes:
 * - GET    /api/notifications              获取通知列表
 * - GET    /api/notifications/unread-count 获取未读数量
 * - POST   /api/notifications/:id/read     标记单个为已读
 * - POST   /api/notifications/read-all     标记所有为已读
 * - DELETE /api/notifications              清除所有通知
 * - GET    /api/notifications/stats        获取服务状态
 */

import express from 'express';
import {
  listNotifications,
  getUnreadCountHandler,
  markNotificationRead,
  markAllRead,
  clearAllNotifications,
  getStats,
} from '../controllers/notification.controller.js';
import { privyAuthMiddleware, requirePrivyAuth } from '../middleware/privyAuth.middleware.js';

const router = express.Router();

// Apply Privy auth middleware to all routes
router.use(privyAuthMiddleware);

// 获取通知列表
router.get('/', requirePrivyAuth, listNotifications);

// 获取未读数量（轻量级接口，用于轮询）
router.get('/unread-count', requirePrivyAuth, getUnreadCountHandler);

// 标记单个为已读
router.post('/:id/read', requirePrivyAuth, markNotificationRead);

// 标记所有为已读
router.post('/read-all', requirePrivyAuth, markAllRead);

// 清除所有通知
router.delete('/', requirePrivyAuth, clearAllNotifications);

// 获取服务状态
router.get('/stats', getStats);

// ============================================
// 测试端点 - 生产环境应删除
// ============================================
import {
  notifyTradeExecuted,
  notifyTradeFailed,
  notifyStopLoss,
  notifyTakeProfit,
  notifyAnalysisComplete,
} from '../services/notification.service.js';
import prisma from '../lib/prisma.js';

// POST /api/notifications/test-public - 无需认证的测试端点
router.post('/test-public', async (req, res) => {
  try {
    // 查找第一个用户
    const user = await prisma.user.findFirst({
      orderBy: { createdAt: 'desc' },
    });
    
    if (!user) {
      return res.status(404).json({ success: false, error: 'No users found' });
    }

    console.log('[NotificationTest] Found user:', user.id);

    // 创建多种类型的测试通知
    const notifications = [];

    notifications.push(notifyTradeExecuted(user.id, {
      traderId: 'test-trader-1',
      eventId: 'test-event-1',
      eventTitle: 'Will Bitcoin reach $100k?',
      orderId: 'order-123',
      side: 'BUY',
      outcome: 'YES',
      amount: 50,
      price: 0.65,
    }));

    notifications.push(notifyTakeProfit(user.id, {
      traderId: 'test-trader-1',
      eventId: 'test-event-2',
      eventTitle: 'Will ETH flip BTC?',
      entryPrice: 0.25,
      exitPrice: 0.75,
      profit: 100,
    }));

    notifications.push(notifyAnalysisComplete(user.id, {
      traderId: 'test-trader-1',
      traderName: 'AI Trader Alpha',
      eventId: 'test-event-3',
      action: 'buy_yes',
      confidence: 85,
    }));

    console.log('[NotificationTest] ✅ Created test notifications for user:', user.id);

    return res.json({
      success: true,
      message: `Created ${notifications.length} test notifications for user ${user.id}`,
      data: notifications,
    });
  } catch (error) {
    console.error('[NotificationTest] Error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

export default router;

