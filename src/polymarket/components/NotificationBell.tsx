/**
 * Notification Bell Component
 *
 * 铃铛图标组件，显示未读通知数量
 * 点击展开通知面板
 *
 * 放置位置: Portfolio 按钮左侧
 */

import React, { useState, useRef, useEffect } from 'react';
import { Bell, Check, CheckCheck, Trash2, X, TrendingUp, TrendingDown, AlertTriangle, Bot, Info } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNotifications, Notification } from '../../hooks/useNotifications';
import { formatDistanceToNow } from 'date-fns';
import { zhCN } from 'date-fns/locale';

// ============================================
// Notification Item Component
// ============================================

interface NotificationItemProps {
  notification: Notification;
  onMarkRead: (id: string) => void;
}

function NotificationItem({ notification, onMarkRead }: NotificationItemProps) {
  const getIcon = () => {
    switch (notification.type) {
      case 'trade_executed':
        return <TrendingUp className="w-4 h-4 text-green-500" />;
      case 'trade_failed':
        return <AlertTriangle className="w-4 h-4 text-red-500" />;
      case 'stop_loss':
        return <TrendingDown className="w-4 h-4 text-red-500" />;
      case 'take_profit':
        return <TrendingUp className="w-4 h-4 text-green-500" />;
      case 'analysis_complete':
        return <Bot className="w-4 h-4 text-blue-500" />;
      default:
        return <Info className="w-4 h-4 text-gray-500" />;
    }
  };

  const getBgColor = () => {
    if (notification.isRead) return 'bg-white dark:bg-gray-900';
    switch (notification.type) {
      case 'trade_executed':
      case 'take_profit':
        return 'bg-green-50 dark:bg-green-900/20';
      case 'trade_failed':
      case 'stop_loss':
        return 'bg-red-50 dark:bg-red-900/20';
      default:
        return 'bg-blue-50 dark:bg-blue-900/20';
    }
  };

  return (
    <div
      className={`p-3 border-b border-gray-100 dark:border-gray-800 last:border-b-0 ${getBgColor()} transition-colors cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50`}
      onClick={() => !notification.isRead && onMarkRead(notification.id)}
    >
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 mt-0.5">{getIcon()}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className={`text-sm font-medium ${notification.isRead ? 'text-gray-500 dark:text-gray-400' : 'text-gray-900 dark:text-white'}`}>
              {notification.title}
            </span>
            {!notification.isRead && (
              <span className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0" />
            )}
          </div>
          <p className={`text-xs mt-0.5 ${notification.isRead ? 'text-gray-400 dark:text-gray-500' : 'text-gray-600 dark:text-gray-300'}`}>
            {notification.message}
          </p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
            {formatDistanceToNow(notification.createdAt, { addSuffix: true, locale: zhCN })}
          </p>
        </div>
      </div>
    </div>
  );
}

// ============================================
// Main Component
// ============================================

export function NotificationBell() {
  const [isOpen, setIsOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const {
    notifications,
    unreadCount,
    isLoading,
    fetchNotifications,
    markAsRead,
    markAllAsRead,
    clearAll,
  } = useNotifications();

  // Close panel when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        panelRef.current &&
        !panelRef.current.contains(event.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Fetch notifications when panel opens
  useEffect(() => {
    if (isOpen) {
      fetchNotifications();
    }
  }, [isOpen, fetchNotifications]);

  return (
    <div className="relative">
      {/* Bell Button */}
      <button
        ref={buttonRef}
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
        title="通知"
      >
        <Bell className="w-5 h-5 text-gray-600 dark:text-gray-400" />
        
        {/* Red dot for unread */}
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 flex items-center justify-center min-w-[16px] h-4 px-1 text-[10px] font-bold text-white bg-red-500 rounded-full">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Notification Panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            ref={panelRef}
            initial={{ opacity: 0, y: -10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-full mt-2 w-80 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl overflow-hidden z-50"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
              <h3 className="font-semibold text-sm text-gray-900 dark:text-white">通知</h3>
              <div className="flex items-center gap-1">
                {unreadCount > 0 && (
                  <button
                    onClick={markAllAsRead}
                    className="p-1.5 rounded-md hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                    title="全部标为已读"
                  >
                    <CheckCheck className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                  </button>
                )}
                {notifications.length > 0 && (
                  <button
                    onClick={clearAll}
                    className="p-1.5 rounded-md hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                    title="清除所有"
                  >
                    <Trash2 className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                  </button>
                )}
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-1.5 rounded-md hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                >
                  <X className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="max-h-96 overflow-y-auto bg-white dark:bg-gray-900">
              {isLoading ? (
                <div className="p-8 text-center">
                  <div className="animate-spin w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full mx-auto" />
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">加载中...</p>
                </div>
              ) : notifications.length === 0 ? (
                <div className="p-8 text-center">
                  <Bell className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto" />
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">暂无通知</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                    交易执行后会在这里显示通知
                  </p>
                </div>
              ) : (
                notifications.map((notification) => (
                  <NotificationItem
                    key={notification.id}
                    notification={notification}
                    onMarkRead={markAsRead}
                  />
                ))
              )}
            </div>

            {/* Footer */}
            {notifications.length > 0 && (
              <div className="px-4 py-2 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                <p className="text-xs text-center text-gray-500 dark:text-gray-400">
                  共 {notifications.length} 条通知
                  {unreadCount > 0 && `，${unreadCount} 条未读`}
                </p>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default NotificationBell;

