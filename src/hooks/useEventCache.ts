/**
 * Event Cache Hook
 *
 * 从后端缓存获取事件数据，支持多来源：
 * - Polymarket: 通过后端缓存获取
 * - Kalshi/DFlow: 通过 DFlow API 获取
 *
 * 优势：
 * - 响应时间 < 10ms（后端内存缓存）
 * - 减少外部 API 调用
 * - 统一缓存管理（LRU + TTL）
 * - 自动识别事件来源并路由到正确的 API
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { getCachedMarkets, CachedMarket } from '../services/polymarket/polymarketSafeService';
import { DFlowAdapter } from '../services/markets/adapters/dflowAdapter';

// DFlow adapter singleton
const dflowAdapter = new DFlowAdapter();

// 本地缓存过期时间（与后端动态 TTL 对齐，减少无效请求）
const LOCAL_CACHE_EXPIRY_MS = 5 * 60 * 1000; // 5 分钟

/**
 * 判断事件 ID 是否为 Kalshi/DFlow 事件
 * Kalshi 事件 ID 格式: KX开头 + 字母 + 可选数字，如 KXSB-26, KXFEDCHAIRNOM-29
 * Polymarket 事件 ID 格式: 长十六进制字符串 (condition ID)
 */
function isKalshiEventId(eventId: string): boolean {
  // Kalshi tickers start with KX or are short alphanumeric with dashes
  // Polymarket IDs are long hex strings (0x... or just hex)
  if (!eventId) return false;

  // If it starts with KX, it's definitely Kalshi
  if (eventId.toUpperCase().startsWith('KX')) return true;

  // If it's a long hex string (>30 chars), it's Polymarket
  if (eventId.length > 30 && /^[0-9a-fA-Fx]+$/.test(eventId)) return false;

  // If it contains only letters, numbers, and dashes, and is relatively short, likely Kalshi
  if (/^[A-Z0-9-]+$/i.test(eventId) && eventId.length < 30) return true;

  return false;
}

// 检查间隔（降低频率，后端缓存 30 分钟内数据不变）
const CHECK_INTERVAL_MS = 60 * 1000; // 60 秒

// 转换后端数据格式为前端统一格式
interface UnifiedMarketEvent {
  id: string;
  title: string;
  description: string;
  endDate: string;
  volume: number;
  liquidity: number;
  outcomes: Array<{
    id: string;
    name: string;
    price: number;
    tokenId: string;
  }>;
  yesPrice: number;
  noPrice: number;
  active: boolean;
  closed: boolean;
  orderMinSize?: number;
  orderPriceMinTickSize?: number;
  source?: 'POLYMARKET' | 'KALSHI'; // 事件来源
}

interface CacheEntry {
  data: UnifiedMarketEvent;
  timestamp: number;
}

interface UseEventCacheReturn {
  events: Map<string, UnifiedMarketEvent>;
  isLoading: boolean;
  lastRefresh: number | null;
  refreshEvents: (eventIds: string[]) => Promise<void>;
  getEvent: (eventId: string) => UnifiedMarketEvent | undefined;
  isExpired: boolean;
}

/**
 * 将后端缓存数据转换为前端统一格式
 */
function transformMarketData(market: CachedMarket): UnifiedMarketEvent {
  return {
    id: market.id || market.conditionId,
    title: market.question || market.title,
    description: market.description || '',
    endDate: market.endDate,
    volume: market.volume || 0,
    liquidity: market.liquidity || 0,
    outcomes: [
      {
        id: `${market.id}-yes`,
        name: 'Yes',
        price: market.yesPrice,
        tokenId: market.yesTokenId,
      },
      {
        id: `${market.id}-no`,
        name: 'No',
        price: market.noPrice,
        tokenId: market.noTokenId,
      },
    ],
    yesPrice: market.yesPrice,
    noPrice: market.noPrice,
    active: market.active,
    closed: market.closed,
    orderMinSize: market.orderMinSize,
    orderPriceMinTickSize: market.orderPriceMinTickSize,
  };
}

export function useEventCache(eventIds: string[]): UseEventCacheReturn {
  const [events, setEvents] = useState<Map<string, UnifiedMarketEvent>>(new Map());
  const [isLoading, setIsLoading] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<number | null>(null);

  const cacheRef = useRef<Map<string, CacheEntry>>(new Map());

  const isExpired = lastRefresh ? (Date.now() - lastRefresh > LOCAL_CACHE_EXPIRY_MS) : true;

  const refreshEvents = useCallback(async (ids: string[]) => {
    if (!ids || ids.length === 0) return;

    setIsLoading(true);

    try {
      const now = Date.now();
      const newEvents = new Map<string, UnifiedMarketEvent>();

      // 分离 Kalshi 和 Polymarket 事件
      const kalshiIds = ids.filter(isKalshiEventId);
      const polymarketIds = ids.filter(id => !isKalshiEventId(id));

      console.log(`[EventCache] Processing ${polymarketIds.length} Polymarket + ${kalshiIds.length} Kalshi events`);

      // 并行获取两个来源的数据
      const [polymarketResponse, kalshiEvents] = await Promise.all([
        // Polymarket 事件
        polymarketIds.length > 0 ? getCachedMarkets(polymarketIds) : Promise.resolve(null),
        // Kalshi 事件 - 逐个获取
        Promise.all(kalshiIds.map(async (ticker) => {
          try {
            const event = await dflowAdapter.fetchMarketById(ticker);
            return event;
          } catch (error) {
            console.warn(`[EventCache] Failed to fetch Kalshi event ${ticker}:`, error);
            return null;
          }
        }))
      ]);

      // 处理 Polymarket 数据
      if (polymarketResponse?.markets) {
        for (const market of polymarketResponse.markets) {
          const transformed = transformMarketData(market);
          cacheRef.current.set(transformed.id, { data: transformed, timestamp: now });
          newEvents.set(transformed.id, transformed);
        }
      }

      // 处理 Kalshi 数据
      for (const event of kalshiEvents) {
        if (event) {
          // 转换为 UnifiedMarketEvent 格式
          const transformed: UnifiedMarketEvent = {
            id: event.id,
            title: event.title,
            description: event.description || '',
            endDate: event.endDate,
            volume: event.volume || 0,
            liquidity: event.liquidity || 0,
            outcomes: event.outcomes?.map(o => ({
              id: o.id,
              name: o.name,
              price: o.price || 0.5,
              tokenId: o.tokenId || '',
            })) || [],
            yesPrice: event.yesPrice ?? 0.5,
            noPrice: event.noPrice ?? 0.5,
            active: event.active ?? true,
            closed: event.closed ?? false,
            source: 'KALSHI',
          };
          cacheRef.current.set(event.id, { data: transformed, timestamp: now });
          newEvents.set(event.id, transformed);
          console.log(`[EventCache] ✅ Loaded Kalshi event: ${event.id} - ${event.title}`);
        }
      }

      // 对于没有获取到的事件，保留本地旧数据
      for (const id of ids) {
        if (!newEvents.has(id) && cacheRef.current.has(id)) {
          const cached = cacheRef.current.get(id)!;
          newEvents.set(id, cached.data);
        }
      }

      // 更新状态
      if (newEvents.size > 0) {
        setEvents(newEvents);
        setLastRefresh(now);
        console.log(`[EventCache] Refreshed ${newEvents.size}/${ids.length} events`);
      }

      // 记录缺失的事件
      const missingIds = ids.filter(id => !newEvents.has(id));
      if (missingIds.length > 0) {
        console.warn(`[EventCache] Missing events: ${missingIds.join(', ')}`);
      }
    } catch (error) {
      console.error('[EventCache] Failed to refresh events:', error);
      // 错误时不清空现有数据
    } finally {
      setIsLoading(false);
    }
  }, []);

  const getEvent = useCallback((eventId: string): UnifiedMarketEvent | undefined => {
    return events.get(eventId);
  }, [events]);

  // 初始加载
  useEffect(() => {
    if (!eventIds || eventIds.length === 0) return;

    // 首次加载
    if (!lastRefresh) {
      refreshEvents(eventIds);
      return;
    }

    // 检查是否过期，自动刷新
    if (isExpired) {
      refreshEvents(eventIds);
    }
  }, [eventIds, lastRefresh, isExpired, refreshEvents]);

  // 定时检查过期（降低频率，后端缓存 30 分钟内数据不变）
  useEffect(() => {
    if (!eventIds || eventIds.length === 0) return;

    const interval = setInterval(() => {
      // 页面不可见时跳过刷新
      if (document.visibilityState !== 'visible') return;

      if (lastRefresh && Date.now() - lastRefresh > LOCAL_CACHE_EXPIRY_MS) {
        console.log('[EventCache] Local cache expired, refreshing from backend...');
        refreshEvents(eventIds);
      }
    }, CHECK_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [eventIds, lastRefresh, refreshEvents]);

  // 页面可见性变化时检查是否需要刷新
  useEffect(() => {
    if (!eventIds || eventIds.length === 0) return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        // 页面重新可见时，检查缓存是否过期
        if (lastRefresh && Date.now() - lastRefresh > LOCAL_CACHE_EXPIRY_MS) {
          console.log('[EventCache] Page visible, cache expired, refreshing...');
          refreshEvents(eventIds);
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [eventIds, lastRefresh, refreshEvents]);

  return {
    events,
    isLoading,
    lastRefresh,
    refreshEvents,
    getEvent,
    isExpired
  };
}

// 导出类型供其他组件使用
export type { UnifiedMarketEvent };
