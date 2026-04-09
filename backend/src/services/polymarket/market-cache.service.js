/**
 * Polymarket Market Cache Service
 * 
 * 市场元数据缓存服务
 * 
 * 功能:
 * - LRU (Least Recently Used) 缓存策略
 * - 双层 TTL（静态字段 24h，动态字段 30min）
 * - 按需加载（Lazy Loading）
 * - 定时清理已关闭市场
 * - 提供快速查询（无需外部 API 调用）
 * 
 * 安全特性:
 * - API 响应数据验证
 * - 字段类型和范围检查
 * - 异常数据拒绝和日志
 */

// ============================================
// 配置
// ============================================

const CLOB_API = 'https://clob.polymarket.com';
const GAMMA_API = 'https://gamma-api.polymarket.com';

// 缓存配置
const MAX_CACHE_SIZE = 500;                    // 最多缓存 500 个市场
const STATIC_TTL_MS = 24 * 60 * 60 * 1000;    // 静态字段 TTL: 24 小时
const DYNAMIC_TTL_MS = 30 * 60 * 1000;        // 动态字段 TTL: 30 分钟
const CLEANUP_INTERVAL_MS = 10 * 60 * 1000;   // 清理间隔: 10 分钟

// 安全配置
const MAX_QUESTION_LENGTH = 1000;             // 问题最大长度
const MAX_DESCRIPTION_LENGTH = 10000;         // 描述最大长度

// Token ID 格式 - Polymarket 使用两种格式:
// 1. 大整数字符串 (CTF Token ID): "60487116984468020978..."
// 2. 十六进制字符串 (Condition ID): "0x..."
const TOKEN_ID_PATTERN_NUMERIC = /^\d{10,}$/;     // 至少10位数字
const TOKEN_ID_PATTERN_HEX = /^0x[a-fA-F0-9]+$/;  // 0x 开头的十六进制

// 安全统计
const securityStats = {
  rejectedMarkets: 0,     // 被拒绝的异常市场数据
  sanitizedFields: 0,     // 被清理的字段数
};

// ============================================
// 缓存数据结构
// ============================================

/**
 * 缓存条目结构:
 * {
 *   marketId: {
 *     static: { question, description, tokenIds, endDate, outcomes },
 *     dynamic: { volume, liquidity, active, closed, yesPrice, noPrice },
 *     staticUpdated: timestamp,
 *     dynamicUpdated: timestamp,
 *     lastAccessed: timestamp
 *   }
 * }
 */
const marketCache = new Map();

// 清理定时器
let cleanupTimer = null;

// ============================================
// LRU 淘汰策略
// ============================================

/**
 * 找出最久未访问的条目
 */
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

/**
 * 淘汰最久未访问的条目（当缓存满时）
 */
function evictIfNeeded() {
  while (marketCache.size >= MAX_CACHE_SIZE) {
    const lruKey = findLRUEntry();
    if (lruKey) {
      console.log(`[MarketCache] Evicting LRU entry: ${lruKey.slice(0, 20)}...`);
      marketCache.delete(lruKey);
    } else {
      break;
    }
  }
}

// ============================================
// TTL 检查
// ============================================

/**
 * 检查静态字段是否过期
 */
function isStaticExpired(entry) {
  if (!entry || !entry.staticUpdated) return true;
  return Date.now() - entry.staticUpdated > STATIC_TTL_MS;
}

/**
 * 检查动态字段是否过期
 */
function isDynamicExpired(entry) {
  if (!entry || !entry.dynamicUpdated) return true;
  return Date.now() - entry.dynamicUpdated > DYNAMIC_TTL_MS;
}

// ============================================
// 数据验证函数
// ============================================

/**
 * 验证 Token ID 格式
 * Polymarket 使用两种格式:
 * 1. CTF Token ID: 大整数字符串 (如 "60487116984468020978...")
 * 2. Condition ID: 十六进制字符串 (如 "0x4319532e...")
 * 
 * @param {string} tokenId - Token ID
 * @returns {boolean} 是否有效
 */
function isValidTokenId(tokenId) {
  if (!tokenId || typeof tokenId !== 'string') return false;
  
  // 支持两种格式
  return TOKEN_ID_PATTERN_NUMERIC.test(tokenId) || TOKEN_ID_PATTERN_HEX.test(tokenId);
}

/**
 * 验证价格是否在有效范围内
 * @param {number} price - 价格
 * @returns {boolean} 是否有效
 */
function isValidPrice(price) {
  if (typeof price !== 'number' || isNaN(price)) return false;
  return price >= 0 && price <= 1;
}

/**
 * 清理字符串（防止 XSS 和注入）
 * @param {string} str - 原始字符串
 * @param {number} maxLength - 最大长度
 * @returns {string} 清理后的字符串
 */
function sanitizeString(str, maxLength) {
  if (!str || typeof str !== 'string') return '';
  
  // 截断过长的字符串
  let sanitized = str.slice(0, maxLength);
  
  // 移除潜在的危险字符（基本 XSS 防护）
  sanitized = sanitized
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
  
  if (sanitized !== str) {
    securityStats.sanitizedFields++;
  }
  
  return sanitized;
}

/**
 * 验证市场数据的完整性和有效性
 * @param {Object} market - 市场数据
 * @returns {{ valid: boolean, reason?: string }}
 */
function validateMarketData(market) {
  if (!market) {
    return { valid: false, reason: 'Market data is null' };
  }

  if (!market.condition_id) {
    return { valid: false, reason: 'Missing condition_id' };
  }

  // 验证 tokens
  const tokens = market.tokens || [];
  const yesToken = tokens.find(t => t.outcome === 'Yes');
  const noToken = tokens.find(t => t.outcome === 'No');

  if (yesToken?.token_id && !isValidTokenId(yesToken.token_id)) {
    return { valid: false, reason: `Invalid yesToken ID format: ${yesToken.token_id?.slice(0, 20)}...` };
  }

  if (noToken?.token_id && !isValidTokenId(noToken.token_id)) {
    return { valid: false, reason: `Invalid noToken ID format: ${noToken.token_id?.slice(0, 20)}...` };
  }

  // 验证价格
  if (yesToken?.price !== undefined && !isValidPrice(yesToken.price)) {
    return { valid: false, reason: `Invalid yesPrice: ${yesToken.price}` };
  }

  if (noToken?.price !== undefined && !isValidPrice(noToken.price)) {
    return { valid: false, reason: `Invalid noPrice: ${noToken.price}` };
  }

  return { valid: true };
}

// ============================================
// 从 Polymarket API 获取数据
// ============================================

/**
 * 从 CLOB API 获取市场数据
 * @param {string} marketId - 市场 ID (condition_id)
 */
async function fetchMarketFromAPI(marketId) {
  try {
    const response = await fetch(`${CLOB_API}/markets/${marketId}`);
    
    if (!response.ok) {
      console.warn(`[MarketCache] CLOB API failed for ${marketId}: ${response.status}`);
      return null;
    }

    const market = await response.json();
    
    // 安全验证
    const validation = validateMarketData(market);
    if (!validation.valid) {
      securityStats.rejectedMarkets++;
      console.warn(`[MarketCache] ⚠️ Rejected market data: ${validation.reason}`);
      return null;
    }

    // 解析 tokens
    const tokens = market.tokens || [];
    const yesToken = tokens.find(t => t.outcome === 'Yes');
    const noToken = tokens.find(t => t.outcome === 'No');

    return {
      // 静态字段（已清理）
      static: {
        question: sanitizeString(market.question, MAX_QUESTION_LENGTH) || 'Unknown Market',
        description: sanitizeString(market.description, MAX_DESCRIPTION_LENGTH) || '',
        endDate: market.end_date_iso,
        outcomes: ['Yes', 'No'],
        yesTokenId: yesToken?.token_id,
        noTokenId: noToken?.token_id,
        conditionId: market.condition_id,
        orderMinSize: Math.max(0, market.minimum_order_size || 5),
        orderPriceMinTickSize: Math.max(0.001, market.minimum_tick_size || 0.01),
      },
      // 动态字段（已验证）
      dynamic: {
        yesPrice: isValidPrice(yesToken?.price) ? yesToken.price : 0.5,
        noPrice: isValidPrice(noToken?.price) ? noToken.price : 0.5,
        volume: Math.max(0, market.volume || 0),
        liquidity: Math.max(0, market.liquidity || 0),
        active: Boolean(market.active ?? true),
        closed: Boolean(market.closed ?? false),
      }
    };
  } catch (error) {
    console.error(`[MarketCache] Error fetching market ${marketId}:`, error.message);
    return null;
  }
}

/**
 * 批量从 Gamma API 获取市场数据（用于搜索/列表）
 * @param {number} limit - 数量限制
 * @param {number} offset - 偏移量
 */
async function fetchMarketsFromGammaAPI(limit = 20, offset = 0) {
  try {
    const url = `${GAMMA_API}/markets?active=true&closed=false&limit=${limit}&offset=${offset}&order=volume&ascending=false`;
    const response = await fetch(url);
    
    if (!response.ok) {
      console.warn(`[MarketCache] Gamma API failed: ${response.status}`);
      return [];
    }

    const markets = await response.json();
    return Array.isArray(markets) ? markets : [];
  } catch (error) {
    console.error('[MarketCache] Error fetching from Gamma API:', error.message);
    return [];
  }
}

// ============================================
// 缓存操作
// ============================================

/**
 * 获取市场数据（从缓存或 API）
 * @param {string} marketId - 市场 ID
 * @param {boolean} forceRefresh - 是否强制刷新
 * @returns {Object | null} 市场数据
 */
export async function getMarket(marketId, forceRefresh = false) {
  if (!marketId) return null;

  const now = Date.now();
  let entry = marketCache.get(marketId);

  // 缓存命中且未过期
  if (entry && !forceRefresh) {
    const staticExpired = isStaticExpired(entry);
    const dynamicExpired = isDynamicExpired(entry);

    // 更新访问时间
    entry.lastAccessed = now;

    // 如果两者都未过期，直接返回
    if (!staticExpired && !dynamicExpired) {
      return formatMarketData(entry);
    }

    // 如果只有动态字段过期，后台刷新（不阻塞）
    if (!staticExpired && dynamicExpired) {
      // 异步刷新动态字段
      refreshDynamicFields(marketId).catch(err => 
        console.warn(`[MarketCache] Background refresh failed for ${marketId}:`, err.message)
      );
      return formatMarketData(entry);
    }
  }

  // 缓存未命中或静态字段过期，从 API 获取
  const freshData = await fetchMarketFromAPI(marketId);
  
  if (!freshData) {
    // API 失败，返回缓存数据（如果有）
    if (entry) {
      entry.lastAccessed = now;
      return formatMarketData(entry);
    }
    return null;
  }

  // 淘汰旧条目（如果需要）
  if (!entry) {
    evictIfNeeded();
  }

  // 更新缓存
  marketCache.set(marketId, {
    static: freshData.static,
    dynamic: freshData.dynamic,
    staticUpdated: now,
    dynamicUpdated: now,
    lastAccessed: now,
  });

  return formatMarketData(marketCache.get(marketId));
}

/**
 * 批量获取市场数据
 * @param {string[]} marketIds - 市场 ID 数组
 * @returns {Map<string, Object>} 市场数据 Map
 */
export async function getMarkets(marketIds) {
  if (!marketIds || marketIds.length === 0) return new Map();

  const results = new Map();
  const toFetch = [];

  // 先检查缓存
  for (const id of marketIds) {
    const entry = marketCache.get(id);
    if (entry && !isStaticExpired(entry)) {
      entry.lastAccessed = Date.now();
      results.set(id, formatMarketData(entry));
    } else {
      toFetch.push(id);
    }
  }

  // 并行获取缺失的市场数据
  if (toFetch.length > 0) {
    const BATCH_SIZE = 10;
    for (let i = 0; i < toFetch.length; i += BATCH_SIZE) {
      const batch = toFetch.slice(i, i + BATCH_SIZE);
      const fetched = await Promise.all(
        batch.map(id => getMarket(id))
      );
      
      batch.forEach((id, index) => {
        if (fetched[index]) {
          results.set(id, fetched[index]);
        }
      });
    }
  }

  return results;
}

/**
 * 刷新动态字段（后台异步）
 */
async function refreshDynamicFields(marketId) {
  const freshData = await fetchMarketFromAPI(marketId);
  if (!freshData) return;

  const entry = marketCache.get(marketId);
  if (entry) {
    entry.dynamic = freshData.dynamic;
    entry.dynamicUpdated = Date.now();
  }
}

/**
 * 格式化市场数据（合并静态和动态字段）
 */
function formatMarketData(entry) {
  if (!entry) return null;

  return {
    id: entry.static.conditionId,
    conditionId: entry.static.conditionId,
    question: entry.static.question,
    title: entry.static.question,
    description: entry.static.description,
    endDate: entry.static.endDate,
    outcomes: entry.static.outcomes,
    yesTokenId: entry.static.yesTokenId,
    noTokenId: entry.static.noTokenId,
    orderMinSize: entry.static.orderMinSize,
    orderPriceMinTickSize: entry.static.orderPriceMinTickSize,
    yesPrice: entry.dynamic.yesPrice,
    noPrice: entry.dynamic.noPrice,
    volume: entry.dynamic.volume,
    liquidity: entry.dynamic.liquidity,
    active: entry.dynamic.active,
    closed: entry.dynamic.closed,
    // 元数据
    _cache: {
      staticUpdated: entry.staticUpdated,
      dynamicUpdated: entry.dynamicUpdated,
      lastAccessed: entry.lastAccessed,
      staticExpired: isStaticExpired(entry),
      dynamicExpired: isDynamicExpired(entry),
    }
  };
}

// ============================================
// 定时清理
// ============================================

/**
 * 清理已关闭的市场和过期条目
 */
function cleanupCache() {
  const now = Date.now();
  let cleaned = 0;

  for (const [marketId, entry] of marketCache) {
    // 删除已关闭的市场（保留 1 小时后删除）
    if (entry.dynamic.closed && now - entry.dynamicUpdated > 60 * 60 * 1000) {
      marketCache.delete(marketId);
      cleaned++;
      continue;
    }

    // 删除静态字段严重过期的条目（超过 48 小时未更新）
    if (now - entry.staticUpdated > 2 * STATIC_TTL_MS) {
      marketCache.delete(marketId);
      cleaned++;
    }
  }

  if (cleaned > 0) {
    console.log(`[MarketCache] Cleaned ${cleaned} stale entries. Current size: ${marketCache.size}`);
  }
}

// ============================================
// 公共 API
// ============================================

/**
 * 获取缓存状态
 */
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
    // 安全统计
    security: {
      rejectedMarkets: securityStats.rejectedMarkets,
      sanitizedFields: securityStats.sanitizedFields,
    }
  };
}

/**
 * 预热缓存（加载活跃 Trader 监控的市场）
 * @param {string[]} marketIds - 要预热的市场 ID
 */
export async function warmupCache(marketIds) {
  if (!marketIds || marketIds.length === 0) return;

  console.log(`[MarketCache] Warming up cache with ${marketIds.length} markets...`);
  
  const startTime = Date.now();
  await getMarkets(marketIds);
  
  console.log(`[MarketCache] Warmup completed in ${Date.now() - startTime}ms. Cache size: ${marketCache.size}`);
}

/**
 * 清除指定市场的缓存
 */
export function invalidateMarket(marketId) {
  if (marketCache.has(marketId)) {
    marketCache.delete(marketId);
    console.log(`[MarketCache] Invalidated: ${marketId.slice(0, 20)}...`);
  }
}

/**
 * 清除所有缓存
 */
export function clearCache() {
  const size = marketCache.size;
  marketCache.clear();
  console.log(`[MarketCache] Cleared all ${size} entries`);
}

// ============================================
// 服务生命周期
// ============================================

/**
 * 启动市场缓存服务
 */
export function startMarketCacheService() {
  console.log('[MarketCache] Starting market cache service...');
  console.log(`[MarketCache] Config: MAX_SIZE=${MAX_CACHE_SIZE}, STATIC_TTL=${STATIC_TTL_MS/1000/60}min, DYNAMIC_TTL=${DYNAMIC_TTL_MS/1000/60}min`);

  // 启动定时清理
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
  }
  cleanupTimer = setInterval(cleanupCache, CLEANUP_INTERVAL_MS);

  console.log('[MarketCache] ✅ Market cache service started');
}

/**
 * 停止市场缓存服务
 */
export function stopMarketCacheService() {
  console.log('[MarketCache] Stopping market cache service...');

  if (cleanupTimer) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
  }

  console.log('[MarketCache] Market cache service stopped');
}

export default {
  getMarket,
  getMarkets,
  getCacheStatus,
  warmupCache,
  invalidateMarket,
  clearCache,
  startMarketCacheService,
  stopMarketCacheService,
};
