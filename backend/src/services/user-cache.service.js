/**
 * User Cache Service
 * 
 * 用户数据缓存服务，减少数据库查询
 * 
 * 特点:
 * - 可插拔设计（方便未来迁移到 Redis）
 * - TTL 自动过期
 * - LRU 淘汰策略
 * - 监控统计（命中率、内存使用）
 * - 用户更新时自动清除缓存
 * 
 * 安全特性:
 * - 只缓存必要字段（敏感字段过滤）
 * - 缓存访问日志
 */

import prisma from '../lib/prisma.js';

// ============================================
// 配置
// ============================================

const CONFIG = {
  MAX_SIZE: 10000,              // 最多缓存 1 万用户
  TTL_MS: 5 * 60 * 1000,        // 5 分钟过期
  CLEANUP_INTERVAL_MS: 60 * 1000, // 每分钟清理过期条目
  ENABLE_ACCESS_LOG: false,      // 是否启用访问日志（生产环境可关闭）
};

// ============================================
// 允许缓存的用户字段（安全白名单）
// ============================================

const ALLOWED_CACHE_FIELDS = [
  'id',
  'privyUserId',
  'walletAddress',
  // Safe 钱包状态
  'safeAddress',
  'safeDeployed',
  'safeApprovalsSet',
  // 委托状态
  'isDelegated',
  'delegatedAt',
  'delegationChainId',
  // 自动交易设置
  'autoTradeEnabled',
  'autoTradeMaxAmount',
  'autoTradeDailyLimit',
  // 时间戳
  'createdAt',
  'updatedAt',
  'lastLoginAt',
];

/**
 * 过滤用户数据，只保留允许缓存的字段
 * @param {Object} user - 完整用户对象
 * @returns {Object} 过滤后的用户对象
 */
function sanitizeUserData(user) {
  if (!user) return null;
  
  const sanitized = {};
  for (const field of ALLOWED_CACHE_FIELDS) {
    if (field in user) {
      sanitized[field] = user[field];
    }
  }
  return sanitized;
}

// ============================================
// 缓存数据结构
// ============================================

/**
 * 缓存条目结构:
 * {
 *   privyUserId: {
 *     data: User,
 *     timestamp: number,
 *     lastAccessed: number
 *   }
 * }
 */
const userCache = new Map();

// 统计数据
const stats = {
  hits: 0,
  misses: 0,
  evictions: 0,
  invalidations: 0,
};

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

  for (const [key, entry] of userCache) {
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
  while (userCache.size >= CONFIG.MAX_SIZE) {
    const lruKey = findLRUEntry();
    if (lruKey) {
      userCache.delete(lruKey);
      stats.evictions++;
    } else {
      break;
    }
  }
}

// ============================================
// TTL 检查
// ============================================

/**
 * 检查条目是否过期
 */
function isExpired(entry) {
  if (!entry || !entry.timestamp) return true;
  return Date.now() - entry.timestamp > CONFIG.TTL_MS;
}

/**
 * 清理过期条目
 */
function cleanupExpired() {
  let cleaned = 0;
  
  for (const [key, entry] of userCache) {
    if (isExpired(entry)) {
      userCache.delete(key);
      cleaned++;
    }
  }

  if (cleaned > 0) {
    console.log(`[UserCache] Cleaned ${cleaned} expired entries. Current size: ${userCache.size}`);
  }
}

// ============================================
// 核心缓存操作
// ============================================

/**
 * 从缓存获取用户（不查数据库）
 * @param {string} privyUserId - Privy 用户 ID
 * @returns {Object | null} 用户数据或 null
 */
function getFromCache(privyUserId) {
  if (!privyUserId) return null;

  const entry = userCache.get(privyUserId);
  
  if (!entry) {
    return null;
  }

  if (isExpired(entry)) {
    userCache.delete(privyUserId);
    return null;
  }

  // 更新访问时间（LRU）
  entry.lastAccessed = Date.now();

  if (CONFIG.ENABLE_ACCESS_LOG) {
    console.log(`[UserCache] Cache hit for user: ${privyUserId.slice(0, 20)}...`);
  }

  return entry.data;
}

/**
 * 设置缓存
 * @param {string} privyUserId - Privy 用户 ID
 * @param {Object} user - 用户数据
 */
function setCache(privyUserId, user) {
  if (!privyUserId || !user) return;

  // 淘汰旧条目（如果需要）
  if (!userCache.has(privyUserId)) {
    evictIfNeeded();
  }

  const now = Date.now();
  
  // 安全：只缓存允许的字段
  const sanitizedUser = sanitizeUserData(user);
  
  userCache.set(privyUserId, {
    data: sanitizedUser,
    timestamp: now,
    lastAccessed: now,
  });

  if (CONFIG.ENABLE_ACCESS_LOG) {
    console.log(`[UserCache] Set cache for user: ${privyUserId.slice(0, 20)}...`);
  }
}

/**
 * 清除用户缓存（通过 Privy ID）
 * @param {string} privyUserId - Privy 用户 ID
 */
export function invalidateUser(privyUserId) {
  if (!privyUserId) return;

  if (userCache.has(privyUserId)) {
    userCache.delete(privyUserId);
    stats.invalidations++;
    console.log(`[UserCache] Invalidated user: ${privyUserId.slice(0, 30)}...`);
  }
}

/**
 * 清除用户缓存（通过数据库 ID）
 * 用于 service 层只有 userId 而没有 privyUserId 的场景
 * @param {string|number} userId - 数据库用户 ID
 */
export function invalidateByUserId(userId) {
  if (!userId) return;

  const userIdStr = String(userId);

  // 遍历缓存找到匹配的条目
  for (const [privyUserId, entry] of userCache.entries()) {
    if (entry.data && String(entry.data.id) === userIdStr) {
      userCache.delete(privyUserId);
      stats.invalidations++;
      console.log(`[UserCache] Invalidated user by ID: ${userId}`);
      return;
    }
  }
}

/**
 * 清除所有缓存
 */
export function clearAllCache() {
  const size = userCache.size;
  userCache.clear();
  console.log(`[UserCache] Cleared all ${size} entries`);
}

// ============================================
// 主要 API（带数据库回退）
// ============================================

/**
 * 通过 Privy ID 获取用户（优先从缓存）
 * @param {string} privyUserId - Privy 用户 ID
 * @returns {Promise<Object | null>} 用户数据
 */
export async function getUserByPrivyId(privyUserId) {
  if (!privyUserId) return null;

  // 1. 检查缓存
  const cached = getFromCache(privyUserId);
  if (cached) {
    stats.hits++;
    return cached;
  }

  // 2. 缓存未命中，查询数据库
  stats.misses++;
  
  try {
    const user = await prisma.user.findUnique({
      where: { privyUserId }
    });

    if (user) {
      setCache(privyUserId, user);
    }

    return user;
  } catch (error) {
    console.error('[UserCache] Database query error:', error.message);
    return null;
  }
}

/**
 * 通过钱包地址获取用户（优先从缓存）
 * @param {string} walletAddress - 钱包地址
 * @returns {Promise<Object | null>} 用户数据
 */
export async function getUserByWallet(walletAddress) {
  if (!walletAddress) return null;

  // 钱包地址查询需要遍历缓存（不如 privyUserId 高效）
  // 但仍然比数据库快
  for (const [, entry] of userCache) {
    if (!isExpired(entry) && 
        entry.data.walletAddress?.toLowerCase() === walletAddress.toLowerCase()) {
      entry.lastAccessed = Date.now();
      stats.hits++;
      return entry.data;
    }
  }

  // 缓存未命中，查询数据库
  stats.misses++;
  
  try {
    const user = await prisma.user.findFirst({
      where: { 
        walletAddress: {
          equals: walletAddress,
          mode: 'insensitive'
        }
      }
    });

    if (user) {
      setCache(user.privyUserId, user);
    }

    return user;
  } catch (error) {
    console.error('[UserCache] Database query error:', error.message);
    return null;
  }
}

/**
 * 更新用户并清除缓存
 * @param {string} privyUserId - Privy 用户 ID
 * @param {Object} data - 更新数据
 * @returns {Promise<Object | null>} 更新后的用户
 */
export async function updateUser(privyUserId, data) {
  if (!privyUserId) return null;

  try {
    const user = await prisma.user.update({
      where: { privyUserId },
      data
    });

    // 更新缓存（而不是清除）
    if (user) {
      setCache(privyUserId, user);
    }

    return user;
  } catch (error) {
    console.error('[UserCache] Update error:', error.message);
    // 清除缓存以确保一致性
    invalidateUser(privyUserId);
    throw error;
  }
}

/**
 * 创建或更新用户（upsert）
 * @param {Object} params - Prisma upsert 参数
 * @returns {Promise<Object>} 用户数据
 */
export async function upsertUser(params) {
  try {
    const user = await prisma.user.upsert(params);

    if (user) {
      setCache(user.privyUserId, user);
    }

    return user;
  } catch (error) {
    console.error('[UserCache] Upsert error:', error.message);
    throw error;
  }
}

// ============================================
// 统计和监控
// ============================================

/**
 * 获取缓存统计
 */
export function getCacheStats() {
  const total = stats.hits + stats.misses;
  const hitRate = total > 0 ? (stats.hits / total * 100).toFixed(2) : 0;

  return {
    size: userCache.size,
    maxSize: CONFIG.MAX_SIZE,
    ttlMinutes: CONFIG.TTL_MS / 1000 / 60,
    hits: stats.hits,
    misses: stats.misses,
    hitRate: `${hitRate}%`,
    evictions: stats.evictions,
    invalidations: stats.invalidations,
    // 安全信息
    security: {
      cachedFieldsCount: ALLOWED_CACHE_FIELDS.length,
      accessLogEnabled: CONFIG.ENABLE_ACCESS_LOG,
    }
  };
}

/**
 * 重置统计
 */
export function resetStats() {
  stats.hits = 0;
  stats.misses = 0;
  stats.evictions = 0;
  stats.invalidations = 0;
}

// ============================================
// 服务生命周期
// ============================================

/**
 * 启动用户缓存服务
 */
export function startUserCacheService() {
  console.log('[UserCache] Starting user cache service...');
  console.log(`[UserCache] Config: MAX_SIZE=${CONFIG.MAX_SIZE}, TTL=${CONFIG.TTL_MS/1000/60}min`);

  // 启动定时清理
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
  }
  cleanupTimer = setInterval(cleanupExpired, CONFIG.CLEANUP_INTERVAL_MS);

  console.log('[UserCache] ✅ User cache service started');
}

/**
 * 停止用户缓存服务
 */
export function stopUserCacheService() {
  console.log('[UserCache] Stopping user cache service...');

  if (cleanupTimer) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
  }

  console.log('[UserCache] User cache service stopped');
}

// ============================================
// 导出
// ============================================

export default {
  // 主要 API
  getUserByPrivyId,
  getUserByWallet,
  updateUser,
  upsertUser,
  
  // 缓存操作
  invalidateUser,
  clearAllCache,
  
  // 统计
  getCacheStats,
  resetStats,
  
  // 生命周期
  startUserCacheService,
  stopUserCacheService,
};
