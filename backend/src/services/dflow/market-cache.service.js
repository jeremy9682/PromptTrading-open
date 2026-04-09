/**
 * DFlow/Kalshi Market Cache Service
 *
 * 市场元数据缓存服务 for Kalshi markets via DFlow
 *
 * 功能:
 * - LRU (Least Recently Used) 缓存策略
 * - 双层 TTL（静态字段 24h，动态字段 30min）
 * - 按需加载（Lazy Loading）
 * - 定时清理已关闭市场
 */

// ============================================
// 配置
// ============================================

// DFlow API endpoints
const DFLOW_MARKETS_API = 'https://dev-prediction-markets-api.dflow.net';

// 缓存配置
const MAX_CACHE_SIZE = 500;
const STATIC_TTL_MS = 24 * 60 * 60 * 1000;    // 静态字段 TTL: 24 小时
const DYNAMIC_TTL_MS = 30 * 60 * 1000;        // 动态字段 TTL: 30 分钟
const CLEANUP_INTERVAL_MS = 10 * 60 * 1000;   // 清理间隔: 10 分钟

// ============================================
// 缓存数据结构
// ============================================

const marketCache = new Map();
let cleanupTimer = null;

// ============================================
// LRU 淘汰策略
// ============================================

function findLRUEntry() {
  let oldestKey = null;
  let oldestTime = Infinity;

  for (const [key, entry] of marketCache) {
    if (entry.lastAccessed < oldestTime) {
      oldestTime = entry.lastAccessed;
      oldestKey = key;
    }
  }

  return oldestKey;
}

function evictIfNeeded() {
  while (marketCache.size >= MAX_CACHE_SIZE) {
    const lruKey = findLRUEntry();
    if (lruKey) {
      console.log(`[DFlowMarketCache] Evicting LRU entry: ${lruKey.slice(0, 20)}...`);
      marketCache.delete(lruKey);
    } else {
      break;
    }
  }
}

// ============================================
// TTL 检查
// ============================================

function isStaticExpired(entry) {
  if (!entry || !entry.staticUpdated) return true;
  return Date.now() - entry.staticUpdated > STATIC_TTL_MS;
}

function isDynamicExpired(entry) {
  if (!entry || !entry.dynamicUpdated) return true;
  return Date.now() - entry.dynamicUpdated > DYNAMIC_TTL_MS;
}

// ============================================
// 从 DFlow API 获取数据
// ============================================

/**
 * 从 DFlow API 获取单个市场/事件数据
 * @param {string} ticker - 市场 ticker
 */
async function fetchMarketFromAPI(ticker) {
  try {
    // First try to get as a market
    const marketResponse = await fetch(`${DFLOW_MARKETS_API}/api/v1/market/${ticker}`);

    if (marketResponse.ok) {
      const market = await marketResponse.json();
      return normalizeMarketData(market);
    }

    // If not found as market, try as event
    const eventResponse = await fetch(`${DFLOW_MARKETS_API}/api/v1/event/${ticker}`);

    if (eventResponse.ok) {
      const event = await eventResponse.json();
      return normalizeEventData(event);
    }

    console.warn(`[DFlowMarketCache] Market/Event not found: ${ticker}`);
    return null;
  } catch (error) {
    console.error(`[DFlowMarketCache] Error fetching market ${ticker}:`, error.message);
    return null;
  }
}

/**
 * 标准化市场数据
 */
function normalizeMarketData(market) {
  if (!market) return null;

  const yesMint = market.yes_token_mint || market.yesMint;
  const noMint = market.no_token_mint || market.noMint;

  // Parse prices
  const yesPrice = parsePrice(market.yes_bid || market.yesBid) || 0.5;
  const noPrice = parsePrice(market.no_bid || market.noBid) || (1 - yesPrice);

  return {
    static: {
      question: market.title || market.question || 'Unknown Market',
      description: market.subtitle || market.description || '',
      endDate: market.close_time || market.closeTime || market.end_time,
      outcomes: ['Yes', 'No'],
      yesTokenId: yesMint,
      noTokenId: noMint,
      conditionId: market.ticker,
      ticker: market.ticker,
    },
    dynamic: {
      yesPrice,
      noPrice,
      volume: parseFloat(market.volume || 0),
      liquidity: parseFloat(market.liquidity || 0),
      active: market.status === 'active' || market.active !== false,
      closed: market.status === 'closed' || market.closed === true,
    }
  };
}

/**
 * 标准化事件数据
 */
function normalizeEventData(event) {
  if (!event) return null;

  // Events have markets array
  const markets = event.markets || [];

  // Use first market for pricing if available
  const primaryMarket = markets[0] || {};
  const yesPrice = parsePrice(primaryMarket.yes_bid) || 0.5;
  const noPrice = parsePrice(primaryMarket.no_bid) || (1 - yesPrice);

  return {
    static: {
      question: event.title || 'Unknown Event',
      description: event.subtitle || event.description || '',
      endDate: event.close_time || event.end_time,
      outcomes: ['Yes', 'No'],
      yesTokenId: primaryMarket.yes_token_mint,
      noTokenId: primaryMarket.no_token_mint,
      conditionId: event.ticker || event.event_ticker,
      ticker: event.ticker || event.event_ticker,
    },
    dynamic: {
      yesPrice,
      noPrice,
      volume: parseFloat(event.volume || 0),
      liquidity: parseFloat(event.liquidity || 0),
      active: event.status === 'active' || event.active !== false,
      closed: event.status === 'closed' || event.closed === true,
      markets: markets.map(m => ({
        ticker: m.ticker,
        title: m.title,
        yesPrice: parsePrice(m.yes_bid),
        noPrice: parsePrice(m.no_bid),
        yesMint: m.yes_token_mint,
        noMint: m.no_token_mint,
      })),
    }
  };
}

/**
 * Parse price value
 */
function parsePrice(price) {
  if (price === undefined || price === null) return null;
  const parsed = parseFloat(price);
  if (isNaN(parsed)) return null;
  // DFlow prices may be in cents (0-100) or decimals (0-1)
  return parsed > 1 ? parsed / 100 : parsed;
}

/**
 * 批量获取市场数据
 */
async function fetchMarketsFromAPI(limit = 20, offset = 0) {
  try {
    const url = `${DFLOW_MARKETS_API}/api/v1/events?limit=${limit}&offset=${offset}`;
    const response = await fetch(url);

    if (!response.ok) {
      console.warn(`[DFlowMarketCache] Events API failed: ${response.status}`);
      return [];
    }

    const data = await response.json();
    const events = data.events || data || [];
    return Array.isArray(events) ? events : [];
  } catch (error) {
    console.error('[DFlowMarketCache] Error fetching events:', error.message);
    return [];
  }
}

// ============================================
// 缓存操作
// ============================================

/**
 * 获取市场数据（从缓存或 API）
 * @param {string} ticker - 市场 ticker
 * @param {boolean} forceRefresh - 是否强制刷新
 * @returns {Object | null} 市场数据
 */
export async function getMarket(ticker, forceRefresh = false) {
  if (!ticker) return null;

  const now = Date.now();
  let entry = marketCache.get(ticker);

  // 缓存命中且未过期
  if (entry && !forceRefresh) {
    const staticExpired = isStaticExpired(entry);
    const dynamicExpired = isDynamicExpired(entry);

    entry.lastAccessed = now;

    if (!staticExpired && !dynamicExpired) {
      return formatMarketData(entry);
    }

    if (!staticExpired && dynamicExpired) {
      refreshDynamicFields(ticker).catch(err =>
        console.warn(`[DFlowMarketCache] Background refresh failed for ${ticker}:`, err.message)
      );
      return formatMarketData(entry);
    }
  }

  // 从 API 获取
  const freshData = await fetchMarketFromAPI(ticker);

  if (!freshData) {
    if (entry) {
      entry.lastAccessed = now;
      return formatMarketData(entry);
    }
    return null;
  }

  if (!entry) {
    evictIfNeeded();
  }

  marketCache.set(ticker, {
    static: freshData.static,
    dynamic: freshData.dynamic,
    staticUpdated: now,
    dynamicUpdated: now,
    lastAccessed: now,
  });

  return formatMarketData(marketCache.get(ticker));
}

/**
 * 批量获取市场数据
 */
export async function getMarkets(tickers) {
  if (!tickers || tickers.length === 0) return new Map();

  const results = new Map();
  const toFetch = [];

  for (const ticker of tickers) {
    const entry = marketCache.get(ticker);
    if (entry && !isStaticExpired(entry)) {
      entry.lastAccessed = Date.now();
      results.set(ticker, formatMarketData(entry));
    } else {
      toFetch.push(ticker);
    }
  }

  if (toFetch.length > 0) {
    const BATCH_SIZE = 10;
    for (let i = 0; i < toFetch.length; i += BATCH_SIZE) {
      const batch = toFetch.slice(i, i + BATCH_SIZE);
      const fetched = await Promise.all(
        batch.map(ticker => getMarket(ticker))
      );

      batch.forEach((ticker, index) => {
        if (fetched[index]) {
          results.set(ticker, fetched[index]);
        }
      });
    }
  }

  return results;
}

/**
 * 刷新动态字段
 */
async function refreshDynamicFields(ticker) {
  const freshData = await fetchMarketFromAPI(ticker);
  if (!freshData) return;

  const entry = marketCache.get(ticker);
  if (entry) {
    entry.dynamic = freshData.dynamic;
    entry.dynamicUpdated = Date.now();
  }
}

/**
 * 格式化市场数据
 */
function formatMarketData(entry) {
  if (!entry) return null;

  return {
    id: entry.static.ticker,
    conditionId: entry.static.conditionId,
    ticker: entry.static.ticker,
    question: entry.static.question,
    title: entry.static.question,
    description: entry.static.description,
    endDate: entry.static.endDate,
    outcomes: entry.static.outcomes,
    yesTokenId: entry.static.yesTokenId,
    noTokenId: entry.static.noTokenId,
    yesPrice: entry.dynamic.yesPrice,
    noPrice: entry.dynamic.noPrice,
    volume: entry.dynamic.volume,
    liquidity: entry.dynamic.liquidity,
    active: entry.dynamic.active,
    closed: entry.dynamic.closed,
    markets: entry.dynamic.markets, // For events with multiple markets
    source: 'KALSHI',
    _cache: {
      staticUpdated: entry.staticUpdated,
      dynamicUpdated: entry.dynamicUpdated,
      lastAccessed: entry.lastAccessed,
    }
  };
}

// ============================================
// 定时清理
// ============================================

function cleanupCache() {
  const now = Date.now();
  let cleaned = 0;

  for (const [ticker, entry] of marketCache) {
    if (entry.dynamic.closed && now - entry.dynamicUpdated > 60 * 60 * 1000) {
      marketCache.delete(ticker);
      cleaned++;
      continue;
    }

    if (now - entry.staticUpdated > 2 * STATIC_TTL_MS) {
      marketCache.delete(ticker);
      cleaned++;
    }
  }

  if (cleaned > 0) {
    console.log(`[DFlowMarketCache] Cleaned ${cleaned} stale entries. Current size: ${marketCache.size}`);
  }
}

// ============================================
// 公共 API
// ============================================

export function getCacheStatus() {
  let expiredCount = 0;
  let closedCount = 0;

  for (const [, entry] of marketCache) {
    if (isStaticExpired(entry)) expiredCount++;
    if (entry.dynamic.closed) closedCount++;
  }

  return {
    size: marketCache.size,
    maxSize: MAX_CACHE_SIZE,
    expiredCount,
    closedCount,
    staticTTL: STATIC_TTL_MS,
    dynamicTTL: DYNAMIC_TTL_MS,
  };
}

export async function warmupCache(tickers) {
  if (!tickers || tickers.length === 0) return;

  console.log(`[DFlowMarketCache] Warming up cache with ${tickers.length} markets...`);

  const startTime = Date.now();
  await getMarkets(tickers);

  console.log(`[DFlowMarketCache] Warmup completed in ${Date.now() - startTime}ms. Cache size: ${marketCache.size}`);
}

export function invalidateMarket(ticker) {
  if (marketCache.has(ticker)) {
    marketCache.delete(ticker);
    console.log(`[DFlowMarketCache] Invalidated: ${ticker}`);
  }
}

export function clearCache() {
  const size = marketCache.size;
  marketCache.clear();
  console.log(`[DFlowMarketCache] Cleared all ${size} entries`);
}

// ============================================
// 服务生命周期
// ============================================

export function startDFlowMarketCacheService() {
  console.log('[DFlowMarketCache] Starting DFlow market cache service...');

  if (cleanupTimer) {
    clearInterval(cleanupTimer);
  }
  cleanupTimer = setInterval(cleanupCache, CLEANUP_INTERVAL_MS);

  console.log('[DFlowMarketCache] ✅ DFlow market cache service started');
}

export function stopDFlowMarketCacheService() {
  console.log('[DFlowMarketCache] Stopping DFlow market cache service...');

  if (cleanupTimer) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
  }

  console.log('[DFlowMarketCache] DFlow market cache service stopped');
}

export default {
  getMarket,
  getMarkets,
  getCacheStatus,
  warmupCache,
  invalidateMarket,
  clearCache,
  startDFlowMarketCacheService,
  stopDFlowMarketCacheService,
};
