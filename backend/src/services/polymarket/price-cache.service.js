/**
 * Polymarket Price Cache Service
 * 
 * 管理 Polymarket 市场价格的实时缓存
 * 
 * 功能:
 * - WebSocket 连接 Polymarket 实时价格流
 * - 内存缓存所有订阅的 token 价格
 * - 提供快速价格查询（无需外部 API 调用）
 * - 自动重连和错误处理
 * 
 * 安全特性:
 * - 订阅数量上限（防止内存耗尽）
 * - 价格变动合理性检查（防止异常数据）
 * - LRU 淘汰策略
 */

import WebSocket from 'ws';
import { broadcastPriceUpdate } from '../sse.service.js';

// ============================================
// 常量
// ============================================

const WS_URL = 'wss://ws-subscriptions-clob.polymarket.com/ws/market';
const CLOB_API = 'https://clob.polymarket.com';

// 重连配置
const RECONNECT_DELAY_MS = 5000;
const MAX_RECONNECT_ATTEMPTS = 10;
const HEARTBEAT_INTERVAL_MS = 30000;

// 价格过期时间（如果 WebSocket 断开，缓存多久有效）
const PRICE_EXPIRY_MS = 5 * 60 * 1000; // 5 分钟

// ============================================
// 安全配置
// ============================================

// 最大订阅数量（防止内存耗尽攻击）
const MAX_SUBSCRIPTIONS = 1000;

// 价格变动阈值（超过此阈值视为可疑，需要验证）
const PRICE_CHANGE_THRESHOLD = 0.5; // 50% 变动

// 价格有效范围（Polymarket 概率市场价格应在 0-1 之间）
const MIN_VALID_PRICE = 0;
const MAX_VALID_PRICE = 1;

// ============================================
// 价格缓存
// ============================================

// tokenId -> { price, bid, ask, lastUpdate, subscribeTime }
const priceCache = new Map();

// 订阅的 token 集合（带订阅时间用于 LRU）
// tokenId -> { subscribeTime }
const subscribedTokens = new Map();

// 安全统计
const securityStats = {
  rejectedPrices: 0,      // 被拒绝的异常价格数
  suspiciousChanges: 0,   // 可疑的价格变动数
  evictedTokens: 0,       // 因达到上限被淘汰的 token 数
};

// WebSocket 状态
let ws = null;
let isConnected = false;
let reconnectAttempts = 0;
let heartbeatTimer = null;
let reconnectTimer = null;

// ============================================
// WebSocket 管理
// ============================================

/**
 * 初始化 WebSocket 连接
 */
export function initWebSocket() {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
    console.log('[PriceCache] WebSocket already connected or connecting');
    return;
  }

  console.log('[PriceCache] Initializing WebSocket connection to Polymarket...');

  try {
    ws = new WebSocket(WS_URL);

    ws.on('open', () => {
      console.log('[PriceCache] ✅ WebSocket connected to Polymarket');
      isConnected = true;
      reconnectAttempts = 0;

      // 重新订阅所有 token
      if (subscribedTokens.size > 0) {
        console.log(`[PriceCache] Re-subscribing to ${subscribedTokens.size} tokens...`);
        for (const tokenId of subscribedTokens.keys()) {
          sendSubscribe(tokenId);
        }
      }

      // 启动心跳
      startHeartbeat();
    });

    ws.on('message', (data) => {
      try {
        const rawMessage = data.toString();
        
        // 忽略 PONG 心跳响应（不是 JSON）
        if (rawMessage === 'PONG' || rawMessage === 'pong') {
          return;
        }
        
        const message = JSON.parse(rawMessage);
        handleMessage(message);
      } catch (error) {
        // 只记录真正的解析错误，忽略心跳等非 JSON 消息
        const rawStr = data.toString().substring(0, 50);
        if (rawStr.startsWith('{') || rawStr.startsWith('[')) {
          console.error('[PriceCache] Failed to parse JSON message:', error.message);
        }
        // 其他非 JSON 消息（如心跳）静默忽略
      }
    });

    ws.on('close', (code, reason) => {
      console.log(`[PriceCache] WebSocket closed: ${code} - ${reason}`);
      isConnected = false;
      stopHeartbeat();
      scheduleReconnect();
    });

    ws.on('error', (error) => {
      console.error('[PriceCache] WebSocket error:', error.message);
      isConnected = false;
    });

  } catch (error) {
    console.error('[PriceCache] Failed to create WebSocket:', error);
    scheduleReconnect();
  }
}

/**
 * 验证价格是否在有效范围内
 * @param {number} price - 价格
 * @returns {boolean} 是否有效
 */
function isValidPrice(price) {
  if (isNaN(price)) return false;
  if (price < MIN_VALID_PRICE || price > MAX_VALID_PRICE) return false;
  return true;
}

/**
 * 检查价格变动是否可疑
 * @param {string} tokenId - Token ID
 * @param {number} newPrice - 新价格
 * @returns {{ valid: boolean, reason?: string }}
 */
function validatePriceChange(tokenId, newPrice) {
  // 1. 基本范围检查
  if (!isValidPrice(newPrice)) {
    return { valid: false, reason: `Price out of range: ${newPrice}` };
  }

  // 2. 检查价格变动幅度
  const cached = priceCache.get(tokenId);
  if (cached && cached.price !== undefined && cached.price !== null) {
    const oldPrice = cached.price;
    const change = Math.abs(newPrice - oldPrice);
    
    // 如果变动超过阈值，记录但仍然接受（市场可能有大波动）
    if (change > PRICE_CHANGE_THRESHOLD) {
      securityStats.suspiciousChanges++;
      console.warn(`[PriceCache] ⚠️ Large price change for ${tokenId.slice(0, 20)}...: ${oldPrice.toFixed(4)} -> ${newPrice.toFixed(4)} (${(change * 100).toFixed(1)}%)`);
    }
  }

  return { valid: true };
}

/**
 * 处理 WebSocket 消息
 */
function handleMessage(message) {
  // Polymarket WebSocket 消息格式
  // { type: 'price_change', asset_id: tokenId, price: number, ... }
  
  if (message.type === 'price_change' || message.event_type === 'price_change') {
    const tokenId = message.asset_id || message.token_id;
    const price = parseFloat(message.price);
    
    if (tokenId && !isNaN(price)) {
      // 安全检查：验证价格
      const validation = validatePriceChange(tokenId, price);
      if (!validation.valid) {
        securityStats.rejectedPrices++;
        console.warn(`[PriceCache] Rejected price update: ${validation.reason}`);
        return;
      }

      updatePrice(tokenId, {
        price,
        bid: message.bid ? parseFloat(message.bid) : undefined,
        ask: message.ask ? parseFloat(message.ask) : undefined,
      });
    }
  } else if (message.type === 'book' || message.event_type === 'book') {
    // 订单簿更新
    const tokenId = message.asset_id || message.market;
    if (tokenId && message.bids && message.asks) {
      const bestBid = message.bids[0]?.[0];
      const bestAsk = message.asks[0]?.[0];
      if (bestBid || bestAsk) {
        const midPrice = bestBid && bestAsk ? (parseFloat(bestBid) + parseFloat(bestAsk)) / 2 : null;
        
        // 安全检查：验证价格
        if (midPrice !== null) {
          const validation = validatePriceChange(tokenId, midPrice);
          if (!validation.valid) {
            securityStats.rejectedPrices++;
            console.warn(`[PriceCache] Rejected book price update: ${validation.reason}`);
            return;
          }
        }

        updatePrice(tokenId, {
          price: midPrice,
          bid: bestBid ? parseFloat(bestBid) : undefined,
          ask: bestAsk ? parseFloat(bestAsk) : undefined,
        });
      }
    }
  }
}

/**
 * 更新价格缓存并广播给 SSE 客户端
 */
function updatePrice(tokenId, data) {
  const existing = priceCache.get(tokenId) || {};
  const newData = {
    ...existing,
    ...data,
    lastUpdate: Date.now(),
  };
  priceCache.set(tokenId, newData);
  
  // 广播价格更新给所有 SSE 客户端
  broadcastPriceUpdate(tokenId, {
    price: newData.price,
    bid: newData.bid,
    ask: newData.ask,
  });
}

/**
 * 发送订阅消息
 */
function sendSubscribe(tokenId) {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    return false;
  }

  try {
    // Polymarket WebSocket 订阅格式
    ws.send(JSON.stringify({
      type: 'subscribe',
      channel: 'market',
      assets_ids: [tokenId],
    }));
    return true;
  } catch (error) {
    console.error(`[PriceCache] Failed to subscribe to ${tokenId}:`, error);
    return false;
  }
}

/**
 * 发送取消订阅消息
 */
function sendUnsubscribe(tokenId) {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    return false;
  }

  try {
    ws.send(JSON.stringify({
      type: 'unsubscribe',
      channel: 'market',
      assets_ids: [tokenId],
    }));
    return true;
  } catch (error) {
    console.error(`[PriceCache] Failed to unsubscribe from ${tokenId}:`, error);
    return false;
  }
}

/**
 * 心跳保持连接
 */
function startHeartbeat() {
  stopHeartbeat();
  heartbeatTimer = setInterval(() => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.ping();
    }
  }, HEARTBEAT_INTERVAL_MS);
}

function stopHeartbeat() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}

/**
 * 安排重连
 */
function scheduleReconnect() {
  if (reconnectTimer) return;

  if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    console.error('[PriceCache] Max reconnect attempts reached. Giving up.');
    return;
  }

  reconnectAttempts++;
  const delay = RECONNECT_DELAY_MS * Math.pow(2, reconnectAttempts - 1); // 指数退避
  
  console.log(`[PriceCache] Scheduling reconnect in ${delay}ms (attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);
  
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    initWebSocket();
  }, delay);
}

// ============================================
// 公共 API
// ============================================

/**
 * 找出最久未使用的订阅（LRU）
 * @returns {string | null} 最久未使用的 tokenId
 */
function findLRUSubscription() {
  let oldestKey = null;
  let oldestTime = Infinity;

  for (const [tokenId, data] of subscribedTokens) {
    if (data.subscribeTime < oldestTime) {
      oldestTime = data.subscribeTime;
      oldestKey = tokenId;
    }
  }

  return oldestKey;
}

/**
 * 淘汰最久未使用的订阅（当达到上限时）
 * @param {number} count - 需要淘汰的数量
 */
function evictLRUSubscriptions(count = 1) {
  for (let i = 0; i < count; i++) {
    const lruKey = findLRUSubscription();
    if (lruKey) {
      subscribedTokens.delete(lruKey);
      priceCache.delete(lruKey);
      if (isConnected) {
        sendUnsubscribe(lruKey);
      }
      securityStats.evictedTokens++;
      console.log(`[PriceCache] Evicted LRU subscription: ${lruKey.slice(0, 20)}...`);
    }
  }
}

/**
 * 订阅 token 价格
 * @param {string} tokenId - Token ID
 * @returns {boolean} 是否成功订阅
 */
export async function subscribeToken(tokenId) {
  if (!tokenId) return false;

  // 如果已订阅，更新访问时间
  if (subscribedTokens.has(tokenId)) {
    subscribedTokens.set(tokenId, { subscribeTime: Date.now() });
    return true;
  }

  // 检查是否达到订阅上限
  if (subscribedTokens.size >= MAX_SUBSCRIPTIONS) {
    console.warn(`[PriceCache] Max subscriptions (${MAX_SUBSCRIPTIONS}) reached, evicting LRU`);
    evictLRUSubscriptions(1);
  }

  subscribedTokens.set(tokenId, { subscribeTime: Date.now() });
  
  // 立即从 REST API 获取初始价格
  await fetchInitialPrice(tokenId);

  // 如果 WebSocket 已连接，发送订阅
  if (isConnected) {
    sendSubscribe(tokenId);
  }

  return true;
}

/**
 * 批量订阅 token 价格
 * @param {string[]} tokenIds - Token IDs
 * @returns {{ subscribed: number, evicted: number }} 订阅结果
 */
export async function subscribeTokens(tokenIds) {
  if (!tokenIds || tokenIds.length === 0) return { subscribed: 0, evicted: 0 };

  const now = Date.now();
  let evicted = 0;

  // 计算需要淘汰的数量
  const newTokens = tokenIds.filter(id => !subscribedTokens.has(id));
  const overflow = (subscribedTokens.size + newTokens.length) - MAX_SUBSCRIPTIONS;
  
  if (overflow > 0) {
    console.warn(`[PriceCache] Would exceed max subscriptions, evicting ${overflow} LRU tokens`);
    evictLRUSubscriptions(overflow);
    evicted = overflow;
  }

  // 添加订阅
  for (const tokenId of tokenIds) {
    subscribedTokens.set(tokenId, { subscribeTime: now });
  }

  // 批量获取初始价格
  await fetchInitialPrices(tokenIds);

  // 如果 WebSocket 已连接，发送订阅
  if (isConnected) {
    for (const tokenId of tokenIds) {
      sendSubscribe(tokenId);
    }
  }

  return { subscribed: tokenIds.length, evicted };
}

/**
 * 取消订阅 token 价格
 * @param {string} tokenId - Token ID
 */
export function unsubscribeToken(tokenId) {
  if (!tokenId) return;

  subscribedTokens.delete(tokenId);
  
  if (isConnected) {
    sendUnsubscribe(tokenId);
  }
}

/**
 * 获取 token 价格（从缓存）
 * @param {string} tokenId - Token ID
 * @returns {{ price: number, bid?: number, ask?: number, lastUpdate: number, isStale: boolean } | null}
 */
export function getPrice(tokenId) {
  const cached = priceCache.get(tokenId);
  if (!cached) return null;

  const isStale = Date.now() - cached.lastUpdate > PRICE_EXPIRY_MS;
  
  return {
    ...cached,
    isStale,
  };
}

/**
 * 批量获取 token 价格（从缓存）
 * @param {string[]} tokenIds - Token IDs
 * @returns {Map<string, { price: number, bid?: number, ask?: number, lastUpdate: number, isStale: boolean }>}
 */
export function getPrices(tokenIds) {
  const result = new Map();
  
  for (const tokenId of tokenIds) {
    const cached = priceCache.get(tokenId);
    if (cached) {
      result.set(tokenId, {
        ...cached,
        isStale: Date.now() - cached.lastUpdate > PRICE_EXPIRY_MS,
      });
    }
  }
  
  return result;
}

/**
 * 获取所有缓存的价格
 * @returns {Object} { tokenId: { price, bid, ask, lastUpdate, isStale } }
 */
export function getAllPrices() {
  const result = {};
  const now = Date.now();
  
  for (const [tokenId, data] of priceCache) {
    result[tokenId] = {
      ...data,
      isStale: now - data.lastUpdate > PRICE_EXPIRY_MS,
    };
  }
  
  return result;
}

/**
 * 获取缓存状态
 */
export function getCacheStatus() {
  return {
    isConnected,
    subscribedCount: subscribedTokens.size,
    cachedCount: priceCache.size,
    maxSubscriptions: MAX_SUBSCRIPTIONS,
    reconnectAttempts,
    // 安全统计
    security: {
      rejectedPrices: securityStats.rejectedPrices,
      suspiciousChanges: securityStats.suspiciousChanges,
      evictedTokens: securityStats.evictedTokens,
    }
  };
}

// ============================================
// REST API 回退（初始价格获取）
// ============================================

/**
 * 从 REST API 获取初始价格
 */
async function fetchInitialPrice(tokenId) {
  try {
    const response = await fetch(`${CLOB_API}/price?token_id=${tokenId}&side=sell`);
    if (response.ok) {
      const data = await response.json();
      const price = parseFloat(data.price);
      if (!isNaN(price)) {
        updatePrice(tokenId, { price });
        console.log(`[PriceCache] Fetched initial price for ${tokenId}: ${price}`);
      }
    }
  } catch (error) {
    console.warn(`[PriceCache] Failed to fetch initial price for ${tokenId}:`, error.message);
  }
}

/**
 * 批量从 REST API 获取初始价格
 */
async function fetchInitialPrices(tokenIds) {
  // 并行获取，但限制并发
  const BATCH_SIZE = 10;
  
  for (let i = 0; i < tokenIds.length; i += BATCH_SIZE) {
    const batch = tokenIds.slice(i, i + BATCH_SIZE);
    await Promise.all(batch.map(fetchInitialPrice));
  }
}

/**
 * 强制从 REST API 刷新价格（绕过缓存）
 * @param {string} tokenId - Token ID
 * @returns {number | null} 价格
 */
export async function refreshPrice(tokenId) {
  try {
    const response = await fetch(`${CLOB_API}/price?token_id=${tokenId}&side=sell`);
    if (response.ok) {
      const data = await response.json();
      const price = parseFloat(data.price);
      if (!isNaN(price)) {
        updatePrice(tokenId, { price });
        return price;
      }
    }
  } catch (error) {
    console.warn(`[PriceCache] Failed to refresh price for ${tokenId}:`, error.message);
  }
  return null;
}

// ============================================
// 启动/停止
// ============================================

/**
 * 启动价格缓存服务
 */
export function startPriceCacheService() {
  console.log('[PriceCache] Starting price cache service...');
  initWebSocket();
}

/**
 * 停止价格缓存服务
 */
export function stopPriceCacheService() {
  console.log('[PriceCache] Stopping price cache service...');
  
  stopHeartbeat();
  
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  
  if (ws) {
    ws.close();
    ws = null;
  }
  
  isConnected = false;
}

export default {
  initWebSocket,
  startPriceCacheService,
  stopPriceCacheService,
  subscribeToken,
  subscribeTokens,
  unsubscribeToken,
  getPrice,
  getPrices,
  getAllPrices,
  getCacheStatus,
  refreshPrice,
};
