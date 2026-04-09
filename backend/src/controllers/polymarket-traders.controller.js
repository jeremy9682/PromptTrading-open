/**
 * Polymarket Traders Controller
 * Handles CRUD operations for user's polymarket traders
 */

import prisma from '../lib/prisma.js';
import { FREE_TIER_QUOTAS } from '../config/quotas.js';
import {
  startTraderSchedule,
  stopTraderSchedule,
} from '../services/trader-scheduler.service.js';
import { normalizeWalletAddress } from '../utils/wallet.js';
import {
  getPrice,
  subscribeTokens,
  refreshPrice,
} from '../services/polymarket/price-cache.service.js';
import { getMarket as getPolymarketMarket } from '../services/polymarket/market-cache.service.js';
import { getMarket as getDFlowMarket } from '../services/dflow/market-cache.service.js';
import { getUserByPrivyId, invalidateUser } from '../services/user-cache.service.js';
import { getTraderStats } from '../services/trader-stats.service.js';

/**
 * Helper to get market data from the appropriate source
 */
async function getMarket(eventId, source = 'POLYMARKET') {
  if (source === 'KALSHI') {
    return getDFlowMarket(eventId);
  }
  return getPolymarketMarket(eventId);
}

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
 * Format trader for API response
 */
function formatTrader(trader) {
  return {
    id: trader.id,
    name: trader.name,
    color: trader.color,
    prompt: trader.prompt,
    aiModel: trader.aiModel,
    capital: parseFloat(trader.capital),
    totalValue: parseFloat(trader.totalValue),
    totalPnL: parseFloat(trader.totalPnL),
    minConfidence: trader.minConfidence,
    maxPosition: trader.maxPosition,
    stopLossPrice: trader.stopLossPrice,
    takeProfitPrice: trader.takeProfitPrice,
    newsWeight: trader.newsWeight,
    dataWeight: trader.dataWeight,
    sentimentWeight: trader.sentimentWeight,
    analysisInterval: trader.analysisInterval,
    dataSources: trader.dataSources,
    isActive: trader.isActive,
    createdAt: trader.createdAt.getTime(),
    updatedAt: trader.updatedAt.getTime(),
    // Include source information for each event
    eventIds: trader.eventAssignments?.map(e => e.eventId) || [],
    events: trader.eventAssignments?.map(e => ({
      eventId: e.eventId,
      source: e.source || 'POLYMARKET',
      addedAt: e.addedAt,
    })) || []
  };
}

/**
 * GET /api/polymarket/traders
 * Get all traders for the user
 */
export async function getTraders(req, res) {
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

    const traders = await prisma.polymarketTrader.findMany({
      where: { userId: user.id },
      include: {
        eventAssignments: true
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json({
      success: true,
      data: traders.map(formatTrader)
    });

  } catch (error) {
    console.error('Error fetching traders:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch traders',
      message: error.message
    });
  }
}

/**
 * GET /api/polymarket/traders/:traderId
 * Get a specific trader
 */
export async function getTrader(req, res) {
  try {
    const privyUserId = req.privyUser?.userId;
    const { traderId } = req.params;

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

    const trader = await prisma.polymarketTrader.findFirst({
      where: {
        id: traderId,
        userId: user.id
      },
      include: {
        eventAssignments: true
      }
    });

    if (!trader) {
      return res.status(404).json({
        success: false,
        error: 'Trader not found'
      });
    }

    res.json({
      success: true,
      data: formatTrader(trader)
    });

  } catch (error) {
    console.error('Error fetching trader:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch trader',
      message: error.message
    });
  }
}

/**
 * POST /api/polymarket/traders
 * Create a new trader
 */
export async function createTrader(req, res) {
  try {
    const privyUserId = req.privyUser?.userId;
    const walletAddress = req.headers['x-wallet-address'];
    const traderData = req.body;

    if (!privyUserId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    // Validate required fields
    if (!traderData.name) {
      return res.status(400).json({
        success: false,
        error: 'Trader name is required'
      });
    }

    const user = await getOrCreateUser(privyUserId, walletAddress);

    // Check trader count quota
    const traderCount = await prisma.polymarketTrader.count({
      where: { userId: user.id }
    });

    if (traderCount >= FREE_TIER_QUOTAS.maxTraders) {
      return res.status(403).json({
        success: false,
        error: 'QUOTA_EXCEEDED',
        message: `Trader 数量已达上限 (${FREE_TIER_QUOTAS.maxTraders} 个)`,
        limit: FREE_TIER_QUOTAS.maxTraders,
        current: traderCount
      });
    }

    // Check active trader count if trying to create an active trader
    if (traderData.isActive) {
      const activeCount = await prisma.polymarketTrader.count({
        where: { userId: user.id, isActive: true }
      });

      if (activeCount >= FREE_TIER_QUOTAS.maxActiveTraders) {
        return res.status(403).json({
          success: false,
          error: 'ACTIVE_QUOTA_EXCEEDED',
          message: `同时运行的 Trader 已达上限 (${FREE_TIER_QUOTAS.maxActiveTraders} 个)，请先停止其他 Trader`,
          limit: FREE_TIER_QUOTAS.maxActiveTraders,
          current: activeCount
        });
      }
    }

    // Create trader with event assignments in a transaction
    const trader = await prisma.$transaction(async (tx) => {
      const newTrader = await tx.polymarketTrader.create({
        data: {
          userId: user.id,
          name: traderData.name,
          color: traderData.color || 'blue',
          prompt: traderData.prompt || '',
          aiModel: traderData.aiModel || 'gpt-4',
          capital: traderData.capital || 1000,
          totalValue: traderData.totalValue || traderData.capital || 1000,
          totalPnL: traderData.totalPnL || 0,
          minConfidence: traderData.minConfidence || 65,
          maxPosition: traderData.maxPosition || 30,
          stopLossPrice: traderData.stopLossPrice || 20,
          takeProfitPrice: traderData.takeProfitPrice || 80,
          newsWeight: traderData.newsWeight || 40,
          dataWeight: traderData.dataWeight || 35,
          sentimentWeight: traderData.sentimentWeight || 25,
          analysisInterval: traderData.analysisInterval || 15,
          dataSources: traderData.dataSources || {
            marketDepth: true,
            historyData: true,
            relatedEvents: false,
            technicalIndicators: false,
            participantBehavior: false,
            userAccount: false
          },
          isActive: traderData.isActive || false
        }
      });

      // Add event assignments (support both old eventIds array and new events array with source)
      if (traderData.events && traderData.events.length > 0) {
        // New format: events with source
        await tx.polymarketTraderEvent.createMany({
          data: traderData.events.map(event => ({
            traderId: newTrader.id,
            eventId: event.eventId || event.id,
            source: event.source || 'POLYMARKET'
          }))
        });
      } else if (traderData.eventIds && traderData.eventIds.length > 0) {
        // Old format: just eventIds (backward compatible)
        await tx.polymarketTraderEvent.createMany({
          data: traderData.eventIds.map(eventId => ({
            traderId: newTrader.id,
            eventId,
            source: 'POLYMARKET' // Default to POLYMARKET for backward compatibility
          }))
        });
      }

      return newTrader;
    });

    // Fetch with assignments for response
    const traderWithEvents = await prisma.polymarketTrader.findUnique({
      where: { id: trader.id },
      include: { eventAssignments: true }
    });

    res.status(201).json({
      success: true,
      data: formatTrader(traderWithEvents)
    });

  } catch (error) {
    console.error('Error creating trader:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create trader',
      message: error.message
    });
  }
}

/**
 * PUT /api/polymarket/traders/:traderId
 * Update a trader
 */
export async function updateTrader(req, res) {
  try {
    const privyUserId = req.privyUser?.userId;
    const { traderId } = req.params;
    const updates = req.body;

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

    // Verify ownership
    const existingTrader = await prisma.polymarketTrader.findFirst({
      where: {
        id: traderId,
        userId: user.id
      }
    });

    if (!existingTrader) {
      return res.status(404).json({
        success: false,
        error: 'Trader not found'
      });
    }

    // Check active trader quota if trying to activate
    if (updates.isActive === true && !existingTrader.isActive) {
      const activeCount = await prisma.polymarketTrader.count({
        where: { userId: user.id, isActive: true }
      });

      if (activeCount >= FREE_TIER_QUOTAS.maxActiveTraders) {
        return res.status(403).json({
          success: false,
          error: 'ACTIVE_QUOTA_EXCEEDED',
          message: `同时运行的 Trader 已达上限 (${FREE_TIER_QUOTAS.maxActiveTraders} 个)，请先停止其他 Trader`,
          limit: FREE_TIER_QUOTAS.maxActiveTraders,
          current: activeCount
        });
      }
    }

    // Update trader and event assignments in a transaction
    const trader = await prisma.$transaction(async (tx) => {
      // Prepare update data (only include fields that are provided)
      const updateData = {};

      if (updates.name !== undefined) updateData.name = updates.name;
      if (updates.color !== undefined) updateData.color = updates.color;
      if (updates.prompt !== undefined) updateData.prompt = updates.prompt;
      if (updates.aiModel !== undefined) updateData.aiModel = updates.aiModel;
      if (updates.capital !== undefined) updateData.capital = updates.capital;
      if (updates.totalValue !== undefined) updateData.totalValue = updates.totalValue;
      if (updates.totalPnL !== undefined) updateData.totalPnL = updates.totalPnL;
      if (updates.minConfidence !== undefined) updateData.minConfidence = updates.minConfidence;
      if (updates.maxPosition !== undefined) updateData.maxPosition = updates.maxPosition;
      if (updates.stopLossPrice !== undefined) updateData.stopLossPrice = updates.stopLossPrice;
      if (updates.takeProfitPrice !== undefined) updateData.takeProfitPrice = updates.takeProfitPrice;
      if (updates.newsWeight !== undefined) updateData.newsWeight = updates.newsWeight;
      if (updates.dataWeight !== undefined) updateData.dataWeight = updates.dataWeight;
      if (updates.sentimentWeight !== undefined) updateData.sentimentWeight = updates.sentimentWeight;
      if (updates.analysisInterval !== undefined) updateData.analysisInterval = updates.analysisInterval;
      if (updates.dataSources !== undefined) updateData.dataSources = updates.dataSources;
      if (updates.isActive !== undefined) updateData.isActive = updates.isActive;

      const updatedTrader = await tx.polymarketTrader.update({
        where: { id: traderId },
        data: updateData
      });

      // Update event assignments if provided
      if (updates.events !== undefined || updates.eventIds !== undefined) {
        // Delete existing assignments
        await tx.polymarketTraderEvent.deleteMany({
          where: { traderId }
        });

        // Create new assignments (support both formats)
        if (updates.events && updates.events.length > 0) {
          // New format: events with source
          await tx.polymarketTraderEvent.createMany({
            data: updates.events.map(event => ({
              traderId,
              eventId: event.eventId || event.id,
              source: event.source || 'POLYMARKET'
            }))
          });
        } else if (updates.eventIds && updates.eventIds.length > 0) {
          // Old format: just eventIds (backward compatible)
          await tx.polymarketTraderEvent.createMany({
            data: updates.eventIds.map(eventId => ({
              traderId,
              eventId,
              source: 'POLYMARKET'
            }))
          });
        }
      }

      return updatedTrader;
    });

    // Fetch with assignments for response
    const traderWithEvents = await prisma.polymarketTrader.findUnique({
      where: { id: trader.id },
      include: { eventAssignments: true }
    });

    // 管理自动交易调度
    // 只有当用户已委托且 Trader 有分配的事件时才启动调度
    if (updates.isActive !== undefined) {
      console.log(`[Traders] Handling isActive change for trader ${traderId}:`, {
        newIsActive: updates.isActive,
        isDelegated: user.isDelegated,
        eventCount: traderWithEvents.eventAssignments.length,
        analysisInterval: traderWithEvents.analysisInterval
      });
      
      if (updates.isActive && traderWithEvents.eventAssignments.length > 0) {
        // 检查用户是否已委托
        if (user.isDelegated) {
          startTraderSchedule(traderId, traderWithEvents.analysisInterval);
          console.log(`[Traders] ✅ Started auto-trade schedule for trader ${traderId}`);
        } else {
          console.log(`[Traders] ⚠️ User not delegated, skipping scheduler start for trader ${traderId}`);
        }
      } else if (!updates.isActive) {
        stopTraderSchedule(traderId);
        console.log(`[Traders] 🛑 Stopped auto-trade schedule for trader ${traderId}`);
      } else if (traderWithEvents.eventAssignments.length === 0) {
        console.log(`[Traders] ⚠️ No events assigned, skipping scheduler start for trader ${traderId}`);
      }
    }

    res.json({
      success: true,
      data: formatTrader(traderWithEvents)
    });

  } catch (error) {
    console.error('Error updating trader:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update trader',
      message: error.message
    });
  }
}

/**
 * DELETE /api/polymarket/traders/:traderId
 * Delete a trader
 */
export async function deleteTrader(req, res) {
  try {
    const privyUserId = req.privyUser?.userId;
    const { traderId } = req.params;

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

    // 先停止调度
    stopTraderSchedule(traderId);

    // Verify ownership and delete
    const deleted = await prisma.polymarketTrader.deleteMany({
      where: {
        id: traderId,
        userId: user.id
      }
    });

    if (deleted.count === 0) {
      return res.status(404).json({
        success: false,
        error: 'Trader not found'
      });
    }

    console.log(`[Traders] Deleted trader ${traderId}`);

    res.json({
      success: true,
      message: 'Trader deleted successfully'
    });

  } catch (error) {
    console.error('Error deleting trader:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete trader',
      message: error.message
    });
  }
}

/**
 * PUT /api/polymarket/traders/sync
 * Sync all traders (replace all)
 * Body: { traders: Trader[] }
 */
export async function syncTraders(req, res) {
  try {
    const privyUserId = req.privyUser?.userId;
    const walletAddress = req.headers['x-wallet-address'];
    const { traders: tradersData } = req.body;

    if (!privyUserId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    if (!Array.isArray(tradersData)) {
      return res.status(400).json({
        success: false,
        error: 'traders array is required'
      });
    }

    const user = await getOrCreateUser(privyUserId, walletAddress);

    // Check quota limits for sync
    if (tradersData.length > FREE_TIER_QUOTAS.maxTraders) {
      return res.status(403).json({
        success: false,
        error: 'QUOTA_EXCEEDED',
        message: `Trader 数量最多 ${FREE_TIER_QUOTAS.maxTraders} 个，当前尝试同步 ${tradersData.length} 个`,
        limit: FREE_TIER_QUOTAS.maxTraders,
        requested: tradersData.length
      });
    }

    // Check active traders count
    const activeCount = tradersData.filter(t => t.isActive).length;
    if (activeCount > FREE_TIER_QUOTAS.maxActiveTraders) {
      return res.status(403).json({
        success: false,
        error: 'ACTIVE_QUOTA_EXCEEDED',
        message: `同时运行的 Trader 最多 ${FREE_TIER_QUOTAS.maxActiveTraders} 个，当前尝试激活 ${activeCount} 个`,
        limit: FREE_TIER_QUOTAS.maxActiveTraders,
        requested: activeCount
      });
    }

    // Transaction: delete all existing, then create new ones
    await prisma.$transaction(async (tx) => {
      // Delete all existing traders (cascade deletes event assignments)
      await tx.polymarketTrader.deleteMany({
        where: { userId: user.id }
      });

      // Create new traders with their event assignments
      for (const traderData of tradersData) {
        const newTrader = await tx.polymarketTrader.create({
          data: {
            userId: user.id,
            name: traderData.name || 'Unnamed Trader',
            color: traderData.color || 'blue',
            prompt: traderData.prompt || '',
            aiModel: traderData.aiModel || 'gpt-4',
            capital: traderData.capital || 1000,
            totalValue: traderData.totalValue || traderData.capital || 1000,
            totalPnL: traderData.totalPnL || 0,
            minConfidence: traderData.minConfidence || 65,
            maxPosition: traderData.maxPosition || 30,
            stopLossPrice: traderData.stopLossPrice || 20,
            takeProfitPrice: traderData.takeProfitPrice || 80,
            newsWeight: traderData.newsWeight || 40,
            dataWeight: traderData.dataWeight || 35,
            sentimentWeight: traderData.sentimentWeight || 25,
            analysisInterval: traderData.analysisInterval || 15,
            dataSources: traderData.dataSources || {
              marketDepth: true,
              historyData: true,
              relatedEvents: false,
              technicalIndicators: false,
              participantBehavior: false,
              userAccount: false
            },
            isActive: traderData.isActive || false
          }
        });

        // Add event assignments
        if (traderData.eventIds && traderData.eventIds.length > 0) {
          await tx.polymarketTraderEvent.createMany({
            data: traderData.eventIds.map(eventId => ({
              traderId: newTrader.id,
              eventId
            }))
          });
        }
      }
    });

    // Fetch updated traders
    const traders = await prisma.polymarketTrader.findMany({
      where: { userId: user.id },
      include: { eventAssignments: true },
      orderBy: { createdAt: 'desc' }
    });

    res.json({
      success: true,
      data: traders.map(formatTrader)
    });

  } catch (error) {
    console.error('Error syncing traders:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to sync traders',
      message: error.message
    });
  }
}

/**
 * Get trade history for a specific trader
 * GET /api/polymarket/traders/:traderId/trade-history
 */
export async function getTraderTradeHistory(req, res) {
  try {
    const privyUser = req.privyUser;
    const { traderId } = req.params;
    const limit = parseInt(req.query.limit) || 20;
    const offset = parseInt(req.query.offset) || 0;

    if (!privyUser) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    // 从缓存获取用户
    const user = await getUserByPrivyId(privyUser.userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Verify trader belongs to user
    const trader = await prisma.polymarketTrader.findFirst({
      where: {
        id: traderId,
        userId: user.id
      }
    });

    if (!trader) {
      return res.status(404).json({
        success: false,
        error: 'Trader not found'
      });
    }

    // Get trade history for this trader
    const trades = await prisma.autoTradeHistory.findMany({
      where: {
        traderId: traderId
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
      select: {
        id: true,
        source: true, // Include market source
        eventId: true,
        eventTitle: true,
        tokenId: true,
        side: true,
        amount: true,
        price: true,
        orderId: true,
        status: true,
        errorMessage: true,
        signalSource: true,
        signalConfidence: true,
        createdAt: true,
        executedAt: true,
      }
    });

    // Get total count
    const total = await prisma.autoTradeHistory.count({
      where: { traderId: traderId }
    });

    // Calculate some stats
    const stats = {
      totalTrades: total,
      executedTrades: trades.filter(t => t.status === 'executed').length,
      failedTrades: trades.filter(t => t.status === 'failed').length,
      totalVolume: trades.reduce((sum, t) => sum + parseFloat(t.amount || 0), 0),
    };

    res.json({
      success: true,
      data: {
        trades: trades.map(t => ({
          ...t,
          amount: parseFloat(t.amount),
          price: parseFloat(t.price),
        })),
        stats,
        pagination: {
          total,
          limit,
          offset,
          hasMore: offset + trades.length < total
        }
      }
    });

  } catch (error) {
    console.error('Error getting trader trade history:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get trade history',
      message: error.message
    });
  }
}

/**
 * Get positions for a specific trader
 * GET /api/polymarket/traders/:traderId/positions
 * 
 * 基于该 Trader 的交易历史计算当前持仓
 */
export async function getTraderPositions(req, res) {
  try {
    const privyUser = req.privyUser;
    const { traderId } = req.params;

    if (!privyUser) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    // 从缓存获取用户
    const user = await getUserByPrivyId(privyUser.userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Verify trader belongs to user
    const trader = await prisma.polymarketTrader.findFirst({
      where: {
        id: traderId,
        userId: user.id
      }
    });

    if (!trader) {
      return res.status(404).json({
        success: false,
        error: 'Trader not found'
      });
    }

    // Get all executed trades for this trader
    const trades = await prisma.autoTradeHistory.findMany({
      where: {
        traderId: traderId,
        status: 'executed'
      },
      orderBy: { createdAt: 'asc' }
    });

    // Aggregate positions by tokenId
    const positionMap = new Map();

    for (const trade of trades) {
      const key = trade.tokenId;
      if (!positionMap.has(key)) {
        positionMap.set(key, {
          tokenId: trade.tokenId,
          eventId: trade.eventId,
          eventTitle: trade.eventTitle,
          totalBought: 0,
          totalSold: 0,
          totalBuyCost: 0,
          totalSellRevenue: 0,
          trades: []
        });
      }

      const pos = positionMap.get(key);
      const amount = parseFloat(trade.amount) || 0;
      const price = parseFloat(trade.price) || 0;

      if (trade.side === 'BUY') {
        pos.totalBought += amount;
        pos.totalBuyCost += amount * price;
      } else {
        pos.totalSold += amount;
        pos.totalSellRevenue += amount * price;
      }

      pos.trades.push({
        id: trade.id,
        side: trade.side,
        amount,
        price,
        createdAt: trade.createdAt
      });
    }

    // Calculate net positions
    const positions = [];
    for (const [tokenId, pos] of positionMap) {
      const netSize = pos.totalBought - pos.totalSold;
      if (netSize > 0.001) { // Only show positions with meaningful size
        const avgPrice = pos.totalBought > 0 ? pos.totalBuyCost / pos.totalBought : 0;
        const cost = netSize * avgPrice;

        // 推断 outcome (YES/NO)
        let outcome = 'Unknown';
        try {
          const marketData = await getMarket(pos.eventId);
          if (marketData) {
            if (marketData.yesTokenId === tokenId) {
              outcome = 'Yes';
            } else if (marketData.noTokenId === tokenId) {
              outcome = 'No';
            }
          }
        } catch (err) {
          console.warn(`[Positions] Failed to determine outcome for token ${tokenId}:`, err.message);
        }

        positions.push({
          tokenId,
          eventId: pos.eventId,
          eventTitle: pos.eventTitle,
          outcome,  // 添加 outcome 字段
          size: netSize,
          avgPrice,
          cost,
          tradesCount: pos.trades.length,
          lastTrade: pos.trades[pos.trades.length - 1]?.createdAt
        });
      }
    }

    // Calculate summary
    const summary = {
      totalPositions: positions.length,
      totalCost: positions.reduce((sum, p) => sum + p.cost, 0),
      totalTrades: trades.length
    };

    res.json({
      success: true,
      data: {
        positions,
        summary
      }
    });

  } catch (error) {
    console.error('Error getting trader positions:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get positions',
      message: error.message
    });
  }
}

/**
 * Get portfolio value for a specific trader (with live market prices)
 * GET /api/polymarket/traders/:traderId/portfolio-value
 * 
 * 计算 Trader 的实时投资组合价值
 */
export async function getTraderPortfolioValue(req, res) {
  try {
    const privyUser = req.privyUser;
    const { traderId } = req.params;

    if (!privyUser) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    // 从缓存获取用户
    const user = await getUserByPrivyId(privyUser.userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Get trader with capital info
    const trader = await prisma.polymarketTrader.findFirst({
      where: {
        id: traderId,
        userId: user.id
      }
    });

    if (!trader) {
      return res.status(404).json({
        success: false,
        error: 'Trader not found'
      });
    }

    const initialCapital = parseFloat(trader.capital) || 1000;

    // Get all executed trades for this trader
    const trades = await prisma.autoTradeHistory.findMany({
      where: {
        traderId: traderId,
        status: 'executed'
      },
      orderBy: { createdAt: 'asc' }
    });

    // If no trades, return initial capital
    if (trades.length === 0) {
      return res.json({
        success: true,
        data: {
          initialCapital,
          currentValue: initialCapital,
          positionsValue: 0,
          availableCash: initialCapital,
          totalPnL: 0,
          totalPnLPercent: 0,
          positions: [],
          lastUpdated: new Date().toISOString()
        }
      });
    }

    // Aggregate positions by tokenId
    const positionMap = new Map();
    let totalSpent = 0;
    let totalReceived = 0;

    for (const trade of trades) {
      const key = trade.tokenId;
      if (!positionMap.has(key)) {
        positionMap.set(key, {
          tokenId: trade.tokenId,
          eventId: trade.eventId,
          eventTitle: trade.eventTitle,
          totalBought: 0,
          totalSold: 0,
          totalBuyCost: 0,
          totalSellRevenue: 0
        });
      }

      const pos = positionMap.get(key);
      const amount = parseFloat(trade.amount) || 0;
      const price = parseFloat(trade.price) || 0;

      if (trade.side === 'BUY') {
        pos.totalBought += amount;
        pos.totalBuyCost += amount * price;
        totalSpent += amount * price;
      } else {
        pos.totalSold += amount;
        pos.totalSellRevenue += amount * price;
        totalReceived += amount * price;
      }
    }

    // Get all token IDs that need prices
    const tokenIds = [];
    for (const [tokenId, pos] of positionMap) {
      const netSize = pos.totalBought - pos.totalSold;
      if (netSize > 0.001) {
        tokenIds.push(tokenId);
      }
    }

    // Subscribe tokens to price cache (ensures they're being tracked)
    if (tokenIds.length > 0) {
      await subscribeTokens(tokenIds);
    }

    // Fetch current market prices from cache (with fallback to REST API)
    const positions = [];
    let totalPositionsValue = 0;

    for (const [tokenId, pos] of positionMap) {
      const netSize = pos.totalBought - pos.totalSold;
      if (netSize > 0.001) {
        const avgPrice = pos.totalBought > 0 ? pos.totalBuyCost / pos.totalBought : 0;
        const cost = netSize * avgPrice;

        // Get price from cache (fast, no external API call)
        let currentPrice = avgPrice; // Default to avg price
        const cachedPrice = getPrice(tokenId);

        if (cachedPrice && cachedPrice.price && !cachedPrice.isStale) {
          currentPrice = cachedPrice.price;
        } else {
          // Cache miss or stale - refresh from API (this is rare)
          const freshPrice = await refreshPrice(tokenId);
          if (freshPrice) {
            currentPrice = freshPrice;
          }
        }

        const currentValue = netSize * currentPrice;
        const pnl = currentValue - cost;
        const pnlPercent = cost > 0 ? (pnl / cost) * 100 : 0;

        totalPositionsValue += currentValue;

        // 推断 outcome (YES/NO) - 通过对比 tokenId 与市场的 yesTokenId/noTokenId
        let outcome = 'Unknown';
        try {
          const marketData = await getMarket(pos.eventId);
          if (marketData) {
            if (marketData.yesTokenId === tokenId) {
              outcome = 'Yes';
            } else if (marketData.noTokenId === tokenId) {
              outcome = 'No';
            }
          }
        } catch (err) {
          console.warn(`[Portfolio] Failed to determine outcome for token ${tokenId}:`, err.message);
        }

        positions.push({
          tokenId,
          eventId: pos.eventId,
          eventTitle: pos.eventTitle,
          outcome,  // 添加 outcome 字段
          size: netSize,
          avgPrice,
          currentPrice,
          cost,
          currentValue,
          pnl,
          pnlPercent,
          priceFromCache: !!(cachedPrice && !cachedPrice.isStale)
        });
      }
    }

    // Calculate portfolio value
    // Available cash = Initial capital - Total spent on buys + Total received from sells
    const availableCash = initialCapital - totalSpent + totalReceived;
    const currentValue = availableCash + totalPositionsValue;

    // 真正的 PnL = 持仓现值 + 卖出收入 - 买入花费
    // 这表示：你实际赚了/亏了多少钱
    const totalPnL = totalPositionsValue + totalReceived - totalSpent;
    // PnL 百分比 = PnL / 实际投入的资金
    const totalPnLPercent = totalSpent > 0 ? (totalPnL / totalSpent) * 100 : 0;

    // DEBUG: 打印持仓详情
    console.log('[Portfolio] === 持仓计算结果 ===');
    console.log(`[Portfolio] 交易记录数: ${trades.length}`);
    console.log(`[Portfolio] 活跃持仓数: ${positions.length}`);
    console.log(`[Portfolio] 总买入: $${totalSpent.toFixed(2)}, 总卖出: $${totalReceived.toFixed(2)}`);
    console.log(`[Portfolio] 计算可用现金: $${availableCash.toFixed(2)} (初始资金 $${initialCapital})`);
    positions.forEach((p, i) => {
      console.log(`[Portfolio] 持仓 ${i+1}: ${p.eventTitle?.substring(0, 30)}... | ${p.outcome} | ${p.size.toFixed(2)} 股 @ $${p.avgPrice.toFixed(4)}`);
    });

    res.json({
      success: true,
      data: {
        initialCapital,
        currentValue,
        positionsValue: totalPositionsValue,
        availableCash,
        totalPnL,
        totalPnLPercent,
        positions,
        totalSpent,
        totalReceived,
        lastUpdated: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Error getting trader portfolio value:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get portfolio value',
      message: error.message
    });
  }
}

/**
 * GET /api/polymarket/traders/:traderId/stats
 * Get performance statistics for a trader
 */
export async function getTraderStatsHandler(req, res) {
  try {
    const privyUser = req.privyUser;
    const { traderId } = req.params;

    if (!privyUser) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    // Verify trader belongs to user
    const user = await getUserByPrivyId(privyUser.userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    const trader = await prisma.polymarketTrader.findFirst({
      where: {
        id: traderId,
        userId: user.id
      }
    });

    if (!trader) {
      return res.status(404).json({
        success: false,
        error: 'Trader not found'
      });
    }

    // Get stats
    const stats = await getTraderStats(traderId);

    res.json({
      success: true,
      data: stats
    });

  } catch (error) {
    console.error('Error getting trader stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get trader stats',
      message: error.message
    });
  }
}
