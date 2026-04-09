/**
 * useNotifications Hook
 *
 * 管理用户通知状态
 * - 轮询获取未读数量
 * - 获取通知列表
 * - 标记已读
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { usePrivy } from '@privy-io/react-auth';

// ============================================
// Types
// ============================================

export interface Notification {
  id: string;
  type: 'trade_executed' | 'trade_failed' | 'stop_loss' | 'take_profit' | 'analysis_complete' | 'system';
  title: string;
  message: string;
  metadata?: {
    traderId?: string;
    eventId?: string;
    eventTitle?: string;
    orderId?: string;
    side?: string;
    amount?: number;
    price?: number;
    profit?: number;
    loss?: number;
    action?: string;
    confidence?: number;
  };
  isRead: boolean;
  createdAt: number;
  readAt?: number;
}

interface NotificationState {
  notifications: Notification[];
  unreadCount: number;
  isLoading: boolean;
  error: string | null;
}

// ============================================
// Config
// ============================================

const API_BASE = (import.meta as any).env.VITE_API_BASE_URL || 'http://localhost:3002';
const POLL_INTERVAL = 30 * 1000; // 30 秒轮询一次

// ============================================
// Hook
// ============================================

export function useNotifications() {
  const { authenticated, ready, getAccessToken } = usePrivy();
  
  // 只有当 Privy 完全准备好且用户已认证时才激活
  const isReady = ready && authenticated;
  
  const [state, setState] = useState<NotificationState>({
    notifications: [],
    unreadCount: 0,
    isLoading: false,
    error: null,
  });

  // 跟踪是否应该继续轮询（用于处理404等错误）
  const [shouldPoll, setShouldPoll] = useState(true);

  // Fetch unread count (lightweight)
  const fetchUnreadCount = useCallback(async () => {
    if (!isReady || !shouldPoll) return;

    try {
      const token = await getAccessToken();
      // 确保 token 有效
      if (!token) {
        return;
      }

      const response = await fetch(`${API_BASE}/api/notifications/unread-count`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      // 处理404 - 用户未注册，停止轮询
      if (response.status === 404) {
        console.log('[Notifications] User not registered, stopping polling');
        setShouldPoll(false);
        setState((prev) => ({
          ...prev,
          error: 'User not registered. Please complete registration.',
        }));
        return;
      }

      // 处理401 - 认证失败，停止轮询
      if (response.status === 401) {
        console.log('[Notifications] Authentication failed, stopping polling');
        setShouldPoll(false);
        return;
      }

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setState((prev) => ({
            ...prev,
            unreadCount: data.data.unreadCount,
            error: null, // 清除之前的错误
          }));
          // 如果之前因为错误停止了轮询，现在恢复
          if (!shouldPoll) {
            setShouldPoll(true);
          }
        }
      }
    } catch (error) {
      // 网络错误等，不停止轮询（可能是临时问题）
      console.error('[Notifications] Fetch error:', error);
    }
  }, [isReady, shouldPoll, getAccessToken]);

  // Fetch all notifications
  const fetchNotifications = useCallback(async () => {
    if (!isReady) return;

    try {
      const token = await getAccessToken();
      // 确保 token 有效
      if (!token) {
        return;
      }

      setState((prev) => ({ ...prev, isLoading: true, error: null }));

      const response = await fetch(`${API_BASE}/api/notifications`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setState({
            notifications: data.data.notifications,
            unreadCount: data.data.unreadCount,
            isLoading: false,
            error: null,
          });
        }
      } else {
        // 静默处理非成功响应
        setState((prev) => ({ ...prev, isLoading: false }));
      }
    } catch (error) {
      // 静默处理错误
      setState((prev) => ({ ...prev, isLoading: false }));
    }
  }, [isReady, getAccessToken]);

  // Mark single notification as read
  const markAsRead = useCallback(async (notificationId: string) => {
    if (!isReady) return;

    try {
      const token = await getAccessToken();
      if (!token) return;

      await fetch(`${API_BASE}/api/notifications/${notificationId}/read`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      // Update local state
      setState((prev) => ({
        ...prev,
        notifications: prev.notifications.map((n) =>
          n.id === notificationId ? { ...n, isRead: true, readAt: Date.now() } : n
        ),
        unreadCount: Math.max(0, prev.unreadCount - 1),
      }));
    } catch (error) {
      // 静默处理错误
    }
  }, [isReady, getAccessToken]);

  // Mark all as read
  const markAllAsRead = useCallback(async () => {
    if (!isReady) return;

    try {
      const token = await getAccessToken();
      if (!token) return;

      await fetch(`${API_BASE}/api/notifications/read-all`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      // Update local state
      setState((prev) => ({
        ...prev,
        notifications: prev.notifications.map((n) => ({
          ...n,
          isRead: true,
          readAt: n.readAt || Date.now(),
        })),
        unreadCount: 0,
      }));
    } catch (error) {
      // 静默处理错误
    }
  }, [isReady, getAccessToken]);

  // Clear all notifications
  const clearAll = useCallback(async () => {
    if (!isReady) return;

    try {
      const token = await getAccessToken();
      if (!token) return;

      await fetch(`${API_BASE}/api/notifications`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      // Update local state
      setState({
        notifications: [],
        unreadCount: 0,
        isLoading: false,
        error: null,
      });
    } catch (error) {
      // 静默处理错误
    }
  }, [isReady, getAccessToken]);

  // Poll for unread count with page visibility detection
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  
  useEffect(() => {
    if (!isReady || !shouldPoll) {
      // 清理现有的轮询
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    let timeoutId: NodeJS.Timeout;
    let isPageVisible = !document.hidden;

    // 清理现有轮询的辅助函数
    const clearPolling = () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };

    // 启动轮询的辅助函数
    const startPolling = () => {
      clearPolling(); // 先清理，避免重复
      intervalRef.current = setInterval(fetchUnreadCount, POLL_INTERVAL);
    };

    // 页面可见性变化处理
    const handleVisibilityChange = () => {
      const visible = !document.hidden;
      isPageVisible = visible;

      if (visible) {
        // 页面变为可见时，立即获取一次
        fetchUnreadCount();
        // 重新启动轮询
        startPolling();
      } else {
        // 页面不可见时，停止轮询
        clearPolling();
      }
    };

    // 监听页面可见性变化
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Initial fetch (延迟一下确保 token 准备好)
    timeoutId = setTimeout(() => {
      if (isPageVisible) {
        fetchUnreadCount();
      }
    }, 1000);

    // Set up polling (只在页面可见时)
    if (isPageVisible) {
      startPolling();
    }

    return () => {
      clearTimeout(timeoutId);
      clearPolling();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isReady, shouldPoll, fetchUnreadCount]);

  // 当 isReady 或 shouldPoll 变化时，重置轮询状态
  useEffect(() => {
    if (isReady && shouldPoll) {
      // 如果用户重新认证或恢复轮询，重置状态
      setState((prev) => ({ ...prev, error: null }));
    }
  }, [isReady, shouldPoll]);

  return {
    ...state,
    fetchNotifications,
    fetchUnreadCount,
    markAsRead,
    markAllAsRead,
    clearAll,
  };
}

export default useNotifications;

