/**
 * Notification Controller
 *
 * 处理通知相关的 API 请求
 */

import {
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  clearNotifications,
  getServiceStats,
} from '../services/notification.service.js';
import { getUserByPrivyId } from '../services/user-cache.service.js';

/**
 * 获取用户通知列表
 *
 * GET /api/notifications
 */
export async function listNotifications(req, res) {
  try {
    const privyUserId = req.privyUser?.userId;
    if (!privyUserId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
    }

    // 获取用户 ID
    const user = await getUserByPrivyId(privyUserId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
      });
    }

    const notifications = getNotifications(user.id);
    const unreadCount = getUnreadCount(user.id);

    return res.json({
      success: true,
      data: {
        notifications,
        unreadCount,
        total: notifications.length,
      },
    });
  } catch (error) {
    console.error('[NotificationController] List notifications error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get notifications',
    });
  }
}

/**
 * 获取未读数量
 *
 * GET /api/notifications/unread-count
 */
export async function getUnreadCountHandler(req, res) {
  try {
    const privyUserId = req.privyUser?.userId;
    if (!privyUserId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
    }

    const user = await getUserByPrivyId(privyUserId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
      });
    }

    const count = getUnreadCount(user.id);

    return res.json({
      success: true,
      data: { unreadCount: count },
    });
  } catch (error) {
    console.error('[NotificationController] Get unread count error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get unread count',
    });
  }
}

/**
 * 标记单个通知为已读
 *
 * POST /api/notifications/:id/read
 */
export async function markNotificationRead(req, res) {
  try {
    const privyUserId = req.privyUser?.userId;
    const { id } = req.params;

    if (!privyUserId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
    }

    const user = await getUserByPrivyId(privyUserId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
      });
    }

    const success = markAsRead(user.id, id);

    return res.json({
      success,
      message: success ? 'Marked as read' : 'Notification not found',
    });
  } catch (error) {
    console.error('[NotificationController] Mark read error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to mark notification as read',
    });
  }
}

/**
 * 标记所有通知为已读
 *
 * POST /api/notifications/read-all
 */
export async function markAllRead(req, res) {
  try {
    const privyUserId = req.privyUser?.userId;

    if (!privyUserId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
    }

    const user = await getUserByPrivyId(privyUserId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
      });
    }

    const count = markAllAsRead(user.id);

    return res.json({
      success: true,
      data: { markedCount: count },
      message: `Marked ${count} notifications as read`,
    });
  } catch (error) {
    console.error('[NotificationController] Mark all read error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to mark all as read',
    });
  }
}

/**
 * 清除所有通知
 *
 * DELETE /api/notifications
 */
export async function clearAllNotifications(req, res) {
  try {
    const privyUserId = req.privyUser?.userId;

    if (!privyUserId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
    }

    const user = await getUserByPrivyId(privyUserId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
      });
    }

    const count = clearNotifications(user.id);

    return res.json({
      success: true,
      data: { clearedCount: count },
      message: `Cleared ${count} notifications`,
    });
  } catch (error) {
    console.error('[NotificationController] Clear all error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to clear notifications',
    });
  }
}

/**
 * 获取通知服务状态（管理员用）
 *
 * GET /api/notifications/stats
 */
export async function getStats(req, res) {
  try {
    const stats = getServiceStats();

    return res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    console.error('[NotificationController] Get stats error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get stats',
    });
  }
}

export default {
  listNotifications,
  getUnreadCountHandler,
  markNotificationRead,
  markAllRead,
  clearAllNotifications,
  getStats,
};

