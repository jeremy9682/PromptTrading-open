/**
 * Notification Service
 *
 * 内存缓存通知服务
 * 用于交易执行、止盈止损等实时通知
 *
 * 特点:
 * - 零数据库开销
 * - 每用户最多保留 20 条通知
 * - 自动清理旧通知
 * - 支持未读计数
 */

// ============================================
// 配置常量
// ============================================

const MAX_NOTIFICATIONS_PER_USER = 20;
const NOTIFICATION_TTL = 24 * 60 * 60 * 1000; // 24 小时后自动清理

// ============================================
// 内存存储
// ============================================

// userId -> Notification[]
const notificationStore = new Map();

// 统计
const stats = {
  totalCreated: 0,
  totalRead: 0,
  totalCleared: 0,
};

// ============================================
// 通知类型
// ============================================

export const NotificationType = {
  TRADE_EXECUTED: 'trade_executed',
  TRADE_FAILED: 'trade_failed',
  STOP_LOSS: 'stop_loss',
  TAKE_PROFIT: 'take_profit',
  ANALYSIS_COMPLETE: 'analysis_complete',
  SYSTEM: 'system',
};

// ============================================
// 辅助函数
// ============================================

/**
 * 生成唯一 ID
 */
function generateId() {
  return `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * 清理过期通知
 */
function cleanupExpiredNotifications(userId) {
  const notifications = notificationStore.get(userId);
  if (!notifications) return;

  const now = Date.now();
  const validNotifications = notifications.filter(
    (n) => now - n.createdAt < NOTIFICATION_TTL
  );

  if (validNotifications.length < notifications.length) {
    stats.totalCleared += notifications.length - validNotifications.length;
    notificationStore.set(userId, validNotifications);
  }
}

/**
 * 限制通知数量
 */
function limitNotifications(userId) {
  const notifications = notificationStore.get(userId);
  if (!notifications || notifications.length <= MAX_NOTIFICATIONS_PER_USER) return;

  // 保留最新的 N 条
  const sorted = notifications.sort((a, b) => b.createdAt - a.createdAt);
  const limited = sorted.slice(0, MAX_NOTIFICATIONS_PER_USER);
  stats.totalCleared += notifications.length - limited.length;
  notificationStore.set(userId, limited);
}

// ============================================
// 公共 API
// ============================================

/**
 * 创建通知
 *
 * @param {string} userId - 用户 ID
 * @param {object} data - 通知数据
 * @param {string} data.type - 通知类型
 * @param {string} data.title - 标题
 * @param {string} data.message - 消息内容
 * @param {object} [data.metadata] - 额外数据
 * @returns {object} 创建的通知
 */
export function createNotification(userId, data) {
  if (!userId) {
    console.error('[NotificationService] Cannot create notification without userId');
    return null;
  }

  const notification = {
    id: generateId(),
    type: data.type || NotificationType.SYSTEM,
    title: data.title,
    message: data.message,
    metadata: data.metadata || null,
    isRead: false,
    createdAt: Date.now(),
  };

  // 获取或创建用户通知列表
  if (!notificationStore.has(userId)) {
    notificationStore.set(userId, []);
  }

  const notifications = notificationStore.get(userId);
  notifications.unshift(notification); // 新通知放在最前面

  // 清理和限制
  cleanupExpiredNotifications(userId);
  limitNotifications(userId);

  stats.totalCreated++;

  console.log(`[NotificationService] Created notification for user ${userId}:`, {
    type: notification.type,
    title: notification.title,
  });

  return notification;
}

/**
 * 获取用户的所有通知
 *
 * @param {string} userId - 用户 ID
 * @returns {object[]} 通知列表
 */
export function getNotifications(userId) {
  if (!userId) return [];

  cleanupExpiredNotifications(userId);
  return notificationStore.get(userId) || [];
}

/**
 * 获取未读通知数量
 *
 * @param {string} userId - 用户 ID
 * @returns {number} 未读数量
 */
export function getUnreadCount(userId) {
  if (!userId) return 0;

  const notifications = notificationStore.get(userId) || [];
  return notifications.filter((n) => !n.isRead).length;
}

/**
 * 标记通知为已读
 *
 * @param {string} userId - 用户 ID
 * @param {string} notificationId - 通知 ID
 * @returns {boolean} 是否成功
 */
export function markAsRead(userId, notificationId) {
  if (!userId) return false;

  const notifications = notificationStore.get(userId);
  if (!notifications) return false;

  const notification = notifications.find((n) => n.id === notificationId);
  if (notification && !notification.isRead) {
    notification.isRead = true;
    notification.readAt = Date.now();
    stats.totalRead++;
    return true;
  }

  return false;
}

/**
 * 标记所有通知为已读
 *
 * @param {string} userId - 用户 ID
 * @returns {number} 标记的数量
 */
export function markAllAsRead(userId) {
  if (!userId) return 0;

  const notifications = notificationStore.get(userId);
  if (!notifications) return 0;

  let count = 0;
  notifications.forEach((n) => {
    if (!n.isRead) {
      n.isRead = true;
      n.readAt = Date.now();
      count++;
    }
  });

  stats.totalRead += count;
  return count;
}

/**
 * 清除所有通知
 *
 * @param {string} userId - 用户 ID
 * @returns {number} 清除的数量
 */
export function clearNotifications(userId) {
  if (!userId) return 0;

  const notifications = notificationStore.get(userId);
  if (!notifications) return 0;

  const count = notifications.length;
  notificationStore.delete(userId);
  stats.totalCleared += count;

  return count;
}

/**
 * 获取服务状态
 */
export function getServiceStats() {
  let totalNotifications = 0;
  let totalUnread = 0;

  for (const [, notifications] of notificationStore) {
    totalNotifications += notifications.length;
    totalUnread += notifications.filter((n) => !n.isRead).length;
  }

  return {
    activeUsers: notificationStore.size,
    totalNotifications,
    totalUnread,
    maxPerUser: MAX_NOTIFICATIONS_PER_USER,
    ttlHours: NOTIFICATION_TTL / (60 * 60 * 1000),
    stats: { ...stats },
  };
}

// ============================================
// 便捷方法 - 交易通知
// ============================================

/**
 * 创建交易执行成功通知
 */
export function notifyTradeExecuted(userId, data) {
  return createNotification(userId, {
    type: NotificationType.TRADE_EXECUTED,
    title: '✅ 交易执行成功',
    message: `${data.side === 'BUY' ? '买入' : '卖出'} ${data.outcome || ''} @ $${data.price?.toFixed(2) || '?'}`,
    metadata: {
      traderId: data.traderId,
      eventId: data.eventId,
      eventTitle: data.eventTitle,
      orderId: data.orderId,
      side: data.side,
      amount: data.amount,
      price: data.price,
    },
  });
}

/**
 * 创建交易失败通知
 */
export function notifyTradeFailed(userId, data) {
  return createNotification(userId, {
    type: NotificationType.TRADE_FAILED,
    title: '❌ 交易执行失败',
    message: data.error || '未知错误',
    metadata: {
      traderId: data.traderId,
      eventId: data.eventId,
      eventTitle: data.eventTitle,
      error: data.error,
    },
  });
}

/**
 * 创建止损触发通知
 */
export function notifyStopLoss(userId, data) {
  return createNotification(userId, {
    type: NotificationType.STOP_LOSS,
    title: '🛑 止损触发',
    message: `${data.eventTitle || '持仓'} 触发止损，已自动卖出`,
    metadata: {
      traderId: data.traderId,
      eventId: data.eventId,
      entryPrice: data.entryPrice,
      exitPrice: data.exitPrice,
      loss: data.loss,
    },
  });
}

/**
 * 创建止盈触发通知
 */
export function notifyTakeProfit(userId, data) {
  return createNotification(userId, {
    type: NotificationType.TAKE_PROFIT,
    title: '🎯 止盈触发',
    message: `${data.eventTitle || '持仓'} 触发止盈，已自动卖出`,
    metadata: {
      traderId: data.traderId,
      eventId: data.eventId,
      entryPrice: data.entryPrice,
      exitPrice: data.exitPrice,
      profit: data.profit,
    },
  });
}

/**
 * 创建分析完成通知
 */
export function notifyAnalysisComplete(userId, data) {
  return createNotification(userId, {
    type: NotificationType.ANALYSIS_COMPLETE,
    title: '🤖 AI 分析完成',
    message: `${data.traderName || 'Trader'}: ${data.action === 'hold' ? '持有观望' : data.action === 'buy_yes' ? '建议买入 YES' : '建议买入 NO'}`,
    metadata: {
      traderId: data.traderId,
      eventId: data.eventId,
      action: data.action,
      confidence: data.confidence,
    },
  });
}

export default {
  NotificationType,
  createNotification,
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  clearNotifications,
  getServiceStats,
  notifyTradeExecuted,
  notifyTradeFailed,
  notifyStopLoss,
  notifyTakeProfit,
  notifyAnalysisComplete,
};

