/**
 * Polymarket Watchlist Controller
 * Handles CRUD operations for user's polymarket watchlist
 */

import prisma from '../lib/prisma.js';
import { FREE_TIER_QUOTAS } from '../config/quotas.js';
import { normalizeWalletAddress } from '../utils/wallet.js';
import { getUserByPrivyId, invalidateUser } from '../services/user-cache.service.js';

/**
 * Get or create user by Privy ID and wallet address
 * 使用缓存优化，减少数据库查询
 * 
 * 注意：walletAddress 会被规范化为小写存储，确保与其他模块（如 PolymarketApiCredential）的一致性
 */
async function getOrCreateUser(privyUserId, walletAddress) {
  // 规范化钱包地址（转小写），确保数据一致性
  const normalizedAddress = normalizeWalletAddress(walletAddress);
  
  // 先从缓存获取用户
  let user = await getUserByPrivyId(privyUserId);

  if (!user) {
    // 缓存未命中且数据库无记录，创建新用户
    user = await prisma.user.create({
      data: {
        privyUserId,
        walletAddress: normalizedAddress
      }
    });
    console.log(`Created new user: ${privyUserId} with wallet ${normalizedAddress}`);
    // 新用户会被 getUserByPrivyId 下次调用时自动缓存
  } else if (normalizedAddress !== 'unknown' && user.walletAddress !== normalizedAddress) {
    // 只有当新地址有效且与现有地址不同时才更新
    // 注意：比较时都是小写，避免大小写不一致导致的误判
    user = await prisma.user.update({
      where: { id: user.id },
      data: { walletAddress: normalizedAddress }
    });
    // 清除缓存（数据已更新）
    invalidateUser(privyUserId);
    console.log(`Updated user ${privyUserId} wallet from ${user.walletAddress} to ${normalizedAddress}`);
  }

  return user;
}

/**
 * GET /api/polymarket/watchlist
 * Get user's watchlist
 */
export async function getWatchlist(req, res) {
  try {
    const privyUserId = req.privyUser?.userId;
    const walletAddress = req.headers['x-wallet-address'];

    if (!privyUserId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    const user = await getOrCreateUser(privyUserId, walletAddress);

    const watchlistItems = await prisma.polymarketWatchlistItem.findMany({
      where: { userId: user.id },
      orderBy: { addedAt: 'desc' }
    });

    res.json({
      success: true,
      data: watchlistItems.map(item => ({
        eventId: item.eventId,
        addedAt: item.addedAt,
        notes: item.notes
      }))
    });

  } catch (error) {
    console.error('Error fetching watchlist:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch watchlist',
      message: error.message
    });
  }
}

/**
 * POST /api/polymarket/watchlist
 * Add event to watchlist
 * Body: { eventId: string, notes?: string }
 */
export async function addToWatchlist(req, res) {
  try {
    const privyUserId = req.privyUser?.userId;
    const walletAddress = req.headers['x-wallet-address'];
    const { eventId, notes } = req.body;

    if (!privyUserId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    if (!eventId) {
      return res.status(400).json({
        success: false,
        error: 'eventId is required'
      });
    }

    const user = await getOrCreateUser(privyUserId, walletAddress);

    // Check quota limit
    const currentCount = await prisma.polymarketWatchlistItem.count({
      where: { userId: user.id }
    });

    // Check if this event already exists (upsert won't increase count)
    const existingItem = await prisma.polymarketWatchlistItem.findUnique({
      where: {
        userId_eventId: { userId: user.id, eventId }
      }
    });

    if (!existingItem && currentCount >= FREE_TIER_QUOTAS.maxWatchlistItems) {
      return res.status(403).json({
        success: false,
        error: 'QUOTA_EXCEEDED',
        message: `关注列表已达上限 (${FREE_TIER_QUOTAS.maxWatchlistItems} 个)`,
        limit: FREE_TIER_QUOTAS.maxWatchlistItems,
        current: currentCount
      });
    }

    // Use upsert to handle duplicates gracefully
    const watchlistItem = await prisma.polymarketWatchlistItem.upsert({
      where: {
        userId_eventId: {
          userId: user.id,
          eventId
        }
      },
      update: {
        notes: notes || null
      },
      create: {
        userId: user.id,
        eventId,
        notes: notes || null
      }
    });

    res.json({
      success: true,
      data: {
        eventId: watchlistItem.eventId,
        addedAt: watchlistItem.addedAt,
        notes: watchlistItem.notes
      }
    });

  } catch (error) {
    console.error('Error adding to watchlist:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to add to watchlist',
      message: error.message
    });
  }
}

/**
 * POST /api/polymarket/watchlist/batch
 * Add multiple events to watchlist
 * Body: { eventIds: string[] }
 */
export async function addBatchToWatchlist(req, res) {
  try {
    const privyUserId = req.privyUser?.userId;
    const walletAddress = req.headers['x-wallet-address'];
    const { eventIds } = req.body;

    if (!privyUserId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    if (!Array.isArray(eventIds) || eventIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'eventIds array is required'
      });
    }

    const user = await getOrCreateUser(privyUserId, walletAddress);

    // Check quota limit
    const currentCount = await prisma.polymarketWatchlistItem.count({
      where: { userId: user.id }
    });

    // Get existing event IDs to calculate actual new items
    const existingItems = await prisma.polymarketWatchlistItem.findMany({
      where: { userId: user.id },
      select: { eventId: true }
    });
    const existingEventIds = new Set(existingItems.map(item => item.eventId));
    const newEventIds = eventIds.filter(id => !existingEventIds.has(id));

    if (currentCount + newEventIds.length > FREE_TIER_QUOTAS.maxWatchlistItems) {
      const available = FREE_TIER_QUOTAS.maxWatchlistItems - currentCount;
      return res.status(403).json({
        success: false,
        error: 'QUOTA_EXCEEDED',
        message: `关注列表已达上限，最多还能添加 ${available} 个`,
        limit: FREE_TIER_QUOTAS.maxWatchlistItems,
        current: currentCount,
        available: available
      });
    }

    // Use createMany with skipDuplicates
    await prisma.polymarketWatchlistItem.createMany({
      data: eventIds.map(eventId => ({
        userId: user.id,
        eventId
      })),
      skipDuplicates: true
    });

    // Fetch updated watchlist
    const watchlistItems = await prisma.polymarketWatchlistItem.findMany({
      where: { userId: user.id },
      orderBy: { addedAt: 'desc' }
    });

    res.json({
      success: true,
      data: watchlistItems.map(item => ({
        eventId: item.eventId,
        addedAt: item.addedAt,
        notes: item.notes
      }))
    });

  } catch (error) {
    console.error('Error batch adding to watchlist:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to batch add to watchlist',
      message: error.message
    });
  }
}

/**
 * DELETE /api/polymarket/watchlist/:eventId
 * Remove event from watchlist
 */
export async function removeFromWatchlist(req, res) {
  try {
    const privyUserId = req.privyUser?.userId;
    const { eventId } = req.params;

    if (!privyUserId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    // 从缓存获取用户
    const user = await getUserByPrivyId(privyUserId);

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    await prisma.polymarketWatchlistItem.deleteMany({
      where: {
        userId: user.id,
        eventId
      }
    });

    res.json({
      success: true,
      message: 'Removed from watchlist'
    });

  } catch (error) {
    console.error('Error removing from watchlist:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to remove from watchlist',
      message: error.message
    });
  }
}

/**
 * PUT /api/polymarket/watchlist/sync
 * Sync entire watchlist (replace all)
 * Body: { eventIds: string[] }
 */
export async function syncWatchlist(req, res) {
  try {
    const privyUserId = req.privyUser?.userId;
    const walletAddress = req.headers['x-wallet-address'];
    const { eventIds } = req.body;

    if (!privyUserId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    if (!Array.isArray(eventIds)) {
      return res.status(400).json({
        success: false,
        error: 'eventIds array is required'
      });
    }

    const user = await getOrCreateUser(privyUserId, walletAddress);

    // Check quota limit for sync
    if (eventIds.length > FREE_TIER_QUOTAS.maxWatchlistItems) {
      return res.status(403).json({
        success: false,
        error: 'QUOTA_EXCEEDED',
        message: `关注列表最多 ${FREE_TIER_QUOTAS.maxWatchlistItems} 个，当前尝试同步 ${eventIds.length} 个`,
        limit: FREE_TIER_QUOTAS.maxWatchlistItems,
        requested: eventIds.length
      });
    }

    // Transaction: delete all existing, then create new ones
    await prisma.$transaction(async (tx) => {
      // Delete all existing watchlist items
      await tx.polymarketWatchlistItem.deleteMany({
        where: { userId: user.id }
      });

      // Create new ones
      if (eventIds.length > 0) {
        await tx.polymarketWatchlistItem.createMany({
          data: eventIds.map(eventId => ({
            userId: user.id,
            eventId
          }))
        });
      }
    });

    res.json({
      success: true,
      data: eventIds.map(eventId => ({ eventId }))
    });

  } catch (error) {
    console.error('Error syncing watchlist:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to sync watchlist',
      message: error.message
    });
  }
}
