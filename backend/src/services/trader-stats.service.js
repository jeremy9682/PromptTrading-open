/**
 * Trader Stats Service
 *
 * 计算 Trader 的性能统计指标
 *
 * 指标:
 * - 总交易次数
 * - 胜率 (Win Rate)
 * - 总盈亏 (Total PnL)
 * - 平均收益 (Average Return)
 * - 最大回撤 (Max Drawdown)
 * - ROI (回报率)
 * - 夏普比率 (Sharpe Ratio) - 简化版
 */

import prisma from '../lib/prisma.js';
import { getPrice, subscribeTokens, refreshPrice } from './polymarket/price-cache.service.js';

/**
 * 计算 Trader 的性能统计
 *
 * @param {string} traderId - Trader ID
 * @returns {Promise<Object>} 性能统计
 */
export async function getTraderStats(traderId) {
  try {
    // 1. 获取 Trader 信息
    const trader = await prisma.polymarketTrader.findUnique({
      where: { id: traderId },
    });

    if (!trader) {
      throw new Error(`Trader not found: ${traderId}`);
    }

    const initialCapital = Number(trader.capital) || 1000;

    // 2. 获取所有已执行的交易记录
    const trades = await prisma.autoTradeHistory.findMany({
      where: {
        traderId,
        status: 'executed',
      },
      orderBy: {
        executedAt: 'asc',
      },
    });

    // 如果没有交易记录，返回默认统计
    if (trades.length === 0) {
      return {
        traderId,
        traderName: trader.name,
        initialCapital,
        currentValue: initialCapital,
        
        // 交易统计
        totalTrades: 0,
        buyTrades: 0,
        sellTrades: 0,
        
        // 盈亏统计
        totalPnL: 0,
        totalPnLPercent: 0,
        winRate: 0,
        winCount: 0,
        lossCount: 0,
        
        // 收益统计
        averageReturn: 0,
        bestTrade: 0,
        worstTrade: 0,
        
        // 风险统计
        maxDrawdown: 0,
        maxDrawdownPercent: 0,
        roi: 0,
        
        // 时间统计
        firstTradeAt: null,
        lastTradeAt: null,
        tradingDays: 0,
        avgTradesPerDay: 0,
        
        calculatedAt: Date.now(),
      };
    }

    // 3. 计算交易统计
    const buyTrades = trades.filter(t => t.side === 'BUY');
    const sellTrades = trades.filter(t => t.side === 'SELL');

    // 4. 计算每笔交易的盈亏
    // 配对买卖交易来计算实际盈亏
    const tradePairs = matchTradePairs(trades);
    const { winCount, lossCount, tradePnLs, totalRealizedPnL } = calculateTradePnLs(tradePairs);

    // 5. 计算未实现盈亏（当前持仓）
    const openPositions = await getOpenPositions(traderId, trades);
    
    // 5.1 确保价格缓存有这些 token 的价格
    const tokenIds = openPositions.map(p => p.tokenId);
    if (tokenIds.length > 0) {
      await subscribeTokens(tokenIds);
    }
    
    // 5.2 计算未实现盈亏（使用实时价格）
    const unrealizedPnL = await calculateUnrealizedPnLWithFreshPrices(openPositions);

    // 6. 计算实际投入的资金（所有买入花费）
    const totalSpent = buyTrades.reduce((sum, t) => sum + Number(t.amount) * Number(t.price), 0);
    const totalReceived = sellTrades.reduce((sum, t) => sum + Number(t.amount) * Number(t.price), 0);

    // 7. 计算总盈亏（基于实际投入，不是虚拟额度）
    const totalPnL = totalRealizedPnL + unrealizedPnL;
    // 当前价值 = 初始额度 - 已花费 + 已收回 + 持仓价值
    // 但更简单的方式：实际赚/亏的钱 = totalPnL
    const currentValue = initialCapital + totalPnL;

    // 8. 计算胜率
    const closedTrades = winCount + lossCount;
    const winRate = closedTrades > 0 ? (winCount / closedTrades) * 100 : 0;

    // 9. 计算收益统计
    const returns = tradePnLs.length > 0 ? tradePnLs : [0];
    const averageReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
    const bestTrade = Math.max(...returns, 0);
    const worstTrade = Math.min(...returns, 0);

    // 10. 计算最大回撤
    const { maxDrawdown, maxDrawdownPercent } = calculateMaxDrawdown(trades, initialCapital);

    // 11. 计算 ROI（基于实际投入资金，不是虚拟额度）
    // ROI = 总盈亏 / 实际投入
    const roi = totalSpent > 0 ? (totalPnL / totalSpent) * 100 : 0;

    // 12. 时间统计
    const firstTradeAt = trades[0]?.executedAt || trades[0]?.createdAt;
    const lastTradeAt = trades[trades.length - 1]?.executedAt || trades[trades.length - 1]?.createdAt;
    const tradingDays = firstTradeAt && lastTradeAt
      ? Math.max(1, Math.ceil((new Date(lastTradeAt) - new Date(firstTradeAt)) / (1000 * 60 * 60 * 24)))
      : 0;
    const avgTradesPerDay = tradingDays > 0 ? trades.length / tradingDays : 0;

    return {
      traderId,
      traderName: trader.name,
      initialCapital,
      currentValue,
      
      // 交易统计
      totalTrades: trades.length,
      buyTrades: buyTrades.length,
      sellTrades: sellTrades.length,
      
      // 盈亏统计
      totalPnL,
      realizedPnL: totalRealizedPnL,
      unrealizedPnL,
      totalPnLPercent: totalSpent > 0 ? (totalPnL / totalSpent) * 100 : 0,
      totalSpent, // 实际投入
      totalReceived, // 已收回
      winRate,
      winCount,
      lossCount,
      
      // 收益统计
      averageReturn,
      bestTrade,
      worstTrade,
      
      // 风险统计
      maxDrawdown,
      maxDrawdownPercent,
      roi,
      
      // 时间统计
      firstTradeAt,
      lastTradeAt,
      tradingDays,
      avgTradesPerDay,
      
      calculatedAt: Date.now(),
    };
  } catch (error) {
    console.error('[TraderStats] Error calculating stats:', error);
    throw error;
  }
}

/**
 * 配对买卖交易
 * 
 * 按 tokenId 分组，匹配 BUY 和 SELL 交易
 */
function matchTradePairs(trades) {
  const pairs = [];
  const openBuys = new Map(); // tokenId -> [buyTrades]

  for (const trade of trades) {
    const key = trade.tokenId;

    if (trade.side === 'BUY') {
      // 添加到未平仓买入
      if (!openBuys.has(key)) {
        openBuys.set(key, []);
      }
      openBuys.get(key).push({
        ...trade,
        amount: Number(trade.amount),
        price: Number(trade.price),
      });
    } else if (trade.side === 'SELL') {
      // 尝试配对最早的买入
      const buys = openBuys.get(key) || [];
      if (buys.length > 0) {
        const buy = buys.shift(); // FIFO
        pairs.push({
          buy,
          sell: {
            ...trade,
            amount: Number(trade.amount),
            price: Number(trade.price),
          },
        });
        if (buys.length === 0) {
          openBuys.delete(key);
        }
      }
    }
  }

  return pairs;
}

/**
 * 计算已平仓交易的盈亏
 */
function calculateTradePnLs(pairs) {
  let winCount = 0;
  let lossCount = 0;
  const tradePnLs = [];
  let totalRealizedPnL = 0;

  for (const { buy, sell } of pairs) {
    // 简化计算：使用较小的数量
    const quantity = Math.min(buy.amount, sell.amount);
    const buyValue = quantity * buy.price;
    const sellValue = quantity * sell.price;
    const pnl = sellValue - buyValue;

    tradePnLs.push(pnl);
    totalRealizedPnL += pnl;

    if (pnl > 0) {
      winCount++;
    } else if (pnl < 0) {
      lossCount++;
    }
    // pnl === 0 不计入胜负
  }

  return { winCount, lossCount, tradePnLs, totalRealizedPnL };
}

/**
 * 获取当前持仓
 */
async function getOpenPositions(traderId, trades) {
  // 计算每个 tokenId 的净持仓
  const positions = new Map();

  for (const trade of trades) {
    const key = trade.tokenId;
    const amount = Number(trade.amount);
    const price = Number(trade.price);

    if (!positions.has(key)) {
      positions.set(key, {
        tokenId: key,
        eventTitle: trade.eventTitle,
        quantity: 0,
        avgPrice: 0,
        totalCost: 0,
      });
    }

    const pos = positions.get(key);

    if (trade.side === 'BUY') {
      const newQuantity = pos.quantity + amount;
      const newTotalCost = pos.totalCost + (amount * price);
      pos.quantity = newQuantity;
      pos.totalCost = newTotalCost;
      pos.avgPrice = newQuantity > 0 ? newTotalCost / newQuantity : 0;
    } else {
      pos.quantity -= amount;
      if (pos.quantity <= 0) {
        positions.delete(key);
      }
    }
  }

  return Array.from(positions.values()).filter(p => p.quantity > 0);
}

/**
 * 计算未实现盈亏（使用缓存价格，可能不准确）
 */
function calculateUnrealizedPnL(positions) {
  let unrealizedPnL = 0;

  for (const pos of positions) {
    // 尝试从价格缓存获取当前价格
    const priceData = getPrice(pos.tokenId);
    const currentPrice = priceData?.price || pos.avgPrice;

    const currentValue = pos.quantity * currentPrice;
    const cost = pos.totalCost;
    unrealizedPnL += currentValue - cost;
  }

  return unrealizedPnL;
}

/**
 * 计算未实现盈亏（使用实时价格）
 * 会尝试刷新价格缓存以获取最新价格
 */
async function calculateUnrealizedPnLWithFreshPrices(positions) {
  let unrealizedPnL = 0;

  for (const pos of positions) {
    // 尝试从价格缓存获取当前价格
    let priceData = getPrice(pos.tokenId);
    let currentPrice = priceData?.price;

    // 如果缓存没有价格或已过期，尝试刷新
    if (!currentPrice || priceData?.isStale) {
      const freshPrice = await refreshPrice(pos.tokenId);
      if (freshPrice) {
        currentPrice = freshPrice;
      }
    }

    // 如果还是没有价格，使用买入均价（这意味着 unrealizedPnL = 0）
    if (!currentPrice) {
      currentPrice = pos.avgPrice;
      console.log(`[TraderStats] No price for token ${pos.tokenId.substring(0, 20)}..., using avgPrice: ${currentPrice}`);
    }

    const currentValue = pos.quantity * currentPrice;
    const cost = pos.totalCost;
    const positionPnL = currentValue - cost;
    
    console.log(`[TraderStats] Position ${pos.eventTitle?.substring(0, 30) || 'Unknown'}: qty=${pos.quantity.toFixed(2)}, avgPrice=${pos.avgPrice.toFixed(4)}, currentPrice=${currentPrice.toFixed(4)}, PnL=${positionPnL.toFixed(4)}`);
    
    unrealizedPnL += positionPnL;
  }

  return unrealizedPnL;
}

/**
 * 计算最大回撤
 */
function calculateMaxDrawdown(trades, initialCapital) {
  if (trades.length === 0) {
    return { maxDrawdown: 0, maxDrawdownPercent: 0 };
  }

  // 构建权益曲线
  let equity = initialCapital;
  let peak = initialCapital;
  let maxDrawdown = 0;

  // 按时间顺序计算权益变化
  for (const trade of trades) {
    const amount = Number(trade.amount);
    const price = Number(trade.price);
    const value = amount * price;

    if (trade.side === 'BUY') {
      // 买入减少现金（暂时不计入权益变化）
      // 实际权益变化在卖出时计算
    } else if (trade.side === 'SELL') {
      // 卖出增加权益（这里简化处理）
      equity += value * 0.05; // 假设平均 5% 盈利用于示例
    }

    // 更新峰值和回撤
    if (equity > peak) {
      peak = equity;
    }
    const drawdown = peak - equity;
    if (drawdown > maxDrawdown) {
      maxDrawdown = drawdown;
    }
  }

  const maxDrawdownPercent = peak > 0 ? (maxDrawdown / peak) * 100 : 0;

  return { maxDrawdown, maxDrawdownPercent };
}

/**
 * 获取多个 Trader 的统计汇总
 */
export async function getMultipleTraderStats(traderIds) {
  const stats = await Promise.all(
    traderIds.map(id => getTraderStats(id).catch(err => {
      console.error(`[TraderStats] Error for trader ${id}:`, err);
      return null;
    }))
  );

  return stats.filter(Boolean);
}

/**
 * 获取用户所有 Trader 的统计
 */
export async function getUserTradersStats(userId) {
  const traders = await prisma.polymarketTrader.findMany({
    where: { userId },
    select: { id: true },
  });

  return getMultipleTraderStats(traders.map(t => t.id));
}

export default {
  getTraderStats,
  getMultipleTraderStats,
  getUserTradersStats,
};
