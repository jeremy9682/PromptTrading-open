/**
 * useRealtimeUpdates Hook
 * 
 * 通过 SSE (Server-Sent Events) 接收后端实时推送
 * 
 * 功能:
 * - 价格实时更新
 * - 订单状态更新
 * - 持仓变化通知
 * - 余额更新
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3002';

// 事件类型
export interface PriceUpdate {
  type: 'price_update';
  tokenId: string;
  price: number;
  bid?: number;
  ask?: number;
  timestamp: number;
}

export interface OrderUpdate {
  type: 'order_update';
  orderId: string;
  status: string;
  side: string;
  amount: number;
  price: number;
  timestamp: number;
}

export interface PositionUpdate {
  type: 'position_update';
  tokenId: string;
  size: number;
  avgPrice: number;
  currentPrice: number;
  pnl: number;
  timestamp: number;
}

export interface BalanceUpdate {
  type: 'balance_update';
  balance: number;
  change: number;
  timestamp: number;
}

export type RealtimeEvent = PriceUpdate | OrderUpdate | PositionUpdate | BalanceUpdate;

interface UseRealtimeUpdatesOptions {
  tokenIds?: string[];
  onPriceUpdate?: (data: PriceUpdate) => void;
  onOrderUpdate?: (data: OrderUpdate) => void;
  onPositionUpdate?: (data: PositionUpdate) => void;
  onBalanceUpdate?: (data: BalanceUpdate) => void;
  enabled?: boolean;
}

interface UseRealtimeUpdatesReturn {
  isConnected: boolean;
  lastEvent: RealtimeEvent | null;
  prices: Map<string, PriceUpdate>;
  reconnect: () => void;
}

export function useRealtimeUpdates(options: UseRealtimeUpdatesOptions = {}): UseRealtimeUpdatesReturn {
  const {
    tokenIds = [],
    onPriceUpdate,
    onOrderUpdate,
    onPositionUpdate,
    onBalanceUpdate,
    enabled = true,
  } = options;

  const { authenticated, getAccessToken } = useAuth();
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  const [isConnected, setIsConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState<RealtimeEvent | null>(null);
  const [prices, setPrices] = useState<Map<string, PriceUpdate>>(new Map());

  // 连接 SSE
  const connect = useCallback(async () => {
    console.log('[SSE] Connect called:', { authenticated, enabled });
    if (!authenticated || !enabled) {
      console.log('[SSE] Skipping connection:', { authenticated, enabled });
      return;
    }

    // 清理现有连接
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    try {
      const token = await getAccessToken();
      if (!token) {
        console.log('[SSE] No access token, skipping connection');
        return;
      }

      // 构建 URL（带 token 参数，因为 EventSource 不支持自定义 headers）
      const tokensParam = tokenIds.length > 0 ? `&tokens=${tokenIds.join(',')}` : '';
      const url = `${API_BASE_URL}/api/sse/stream?token=${encodeURIComponent(token)}${tokensParam}`;
      
      console.log('[SSE] Connecting to:', url.substring(0, 100) + '...');
      
      const eventSource = new EventSource(url);
      eventSourceRef.current = eventSource;

      eventSource.onopen = () => {
        console.log('[SSE] ✅ Connected');
        setIsConnected(true);
      };

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as RealtimeEvent;
          setLastEvent(data);

          switch (data.type) {
            case 'price_update':
              setPrices(prev => {
                const newMap = new Map(prev);
                newMap.set(data.tokenId, data);
                return newMap;
              });
              onPriceUpdate?.(data);
              break;
            case 'order_update':
              onOrderUpdate?.(data);
              break;
            case 'position_update':
              onPositionUpdate?.(data);
              break;
            case 'balance_update':
              onBalanceUpdate?.(data);
              break;
          }
        } catch (error) {
          // 忽略心跳和非 JSON 消息
        }
      };

      eventSource.onerror = (error) => {
        console.error('[SSE] Error:', error);
        setIsConnected(false);
        
        // 自动重连（5秒后）
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
        }
        reconnectTimeoutRef.current = setTimeout(() => {
          console.log('[SSE] Attempting to reconnect...');
          connect();
        }, 5000);
      };

    } catch (error) {
      console.error('[SSE] Connection failed:', error);
      setIsConnected(false);
    }
  }, [authenticated, enabled, tokenIds, getAccessToken, onPriceUpdate, onOrderUpdate, onPositionUpdate, onBalanceUpdate]);

  // 断开连接
  const disconnect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    setIsConnected(false);
  }, []);

  // 手动重连
  const reconnect = useCallback(() => {
    disconnect();
    connect();
  }, [disconnect, connect]);

  // 初始连接
  useEffect(() => {
    console.log('[SSE] useEffect triggered:', { authenticated, enabled });
    if (authenticated && enabled) {
      connect();
    }
    
    return () => {
      disconnect();
    };
  }, [authenticated, enabled]); // 只在认证状态改变时重连

  // 用于追踪上一次订阅的 tokenIds，避免重复订阅
  const prevTokenIdsRef = useRef<string>('');
  // 用于追踪是否已发送过订阅请求，避免短时间内重复调用
  const subscribeInProgressRef = useRef<boolean>(false);
  // 存储 getAccessToken 的稳定引用，避免依赖变化
  const getAccessTokenRef = useRef(getAccessToken);
  getAccessTokenRef.current = getAccessToken;

  // tokenIds 变化时更新订阅
  // 注意：将 getAccessToken 从依赖中移除，改用 ref 访问，避免每次渲染都触发 effect
  useEffect(() => {
    if (!isConnected || tokenIds.length === 0) {
      return;
    }

    // 将 tokenIds 排序后转成字符串进行比较，只在内容真正变化时才调用 subscribe
    const tokenIdsKey = [...tokenIds].sort().join(',');
    if (tokenIdsKey === prevTokenIdsRef.current) {
      // tokenIds 内容没变化，跳过订阅
      return;
    }

    // 防止短时间内重复调用（防抖）
    if (subscribeInProgressRef.current) {
      return;
    }

    prevTokenIdsRef.current = tokenIdsKey;
    subscribeInProgressRef.current = true;

    // 通过 POST 更新订阅
    console.log('[SSE] 📡 Subscribing to tokens:', tokenIds.length);
    
    const doSubscribe = async () => {
      try {
        const token = await getAccessTokenRef.current();
        if (token) {
          await fetch(`${API_BASE_URL}/api/sse/subscribe`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`,
            },
            body: JSON.stringify({ tokenIds }),
          });
        }
      } catch (error) {
        console.error('[SSE] Subscribe error:', error);
      } finally {
        // 300ms 后允许下一次订阅，防止频繁调用
        setTimeout(() => {
          subscribeInProgressRef.current = false;
        }, 300);
      }
    };

    doSubscribe();
  }, [isConnected, tokenIds]); // 移除 getAccessToken 依赖，改用 ref

  return {
    isConnected,
    lastEvent,
    prices,
    reconnect,
  };
}

export default useRealtimeUpdates;
