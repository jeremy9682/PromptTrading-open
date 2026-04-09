/**
 * Position Monitor Service
 *
 * 止盈止损自动监控服务
 * 定时检查所有活跃 Trader 的持仓，当价格触及止盈/止损阈值时自动平仓
 *
 * 功能:
 * - 监控所有活跃 Trader 的持仓
 * - 实时检查价格与止盈/止损阈值
 * - 自动执行平仓操作
 * - 记录平仓原因到交易历史
 */

import prisma from '../lib/prisma.js';
import { getPrice, subscribeToken } from './polymarket/price-cache.service.js';
import { executeAutoTrade } from './auto-trade.service.js';
import { notifyStopLoss, notifyTakeProfit } from './notification.service.js';

// ============================================
// 配置常量
// ============================================

// 监控间隔（毫秒）
const MONITOR_INTERVAL = 30 * 1000; // 30 秒

// 价格变化阈值（避免频繁触发）
const PRICE_CHANGE_THRESHOLD = 0.01; // 1%

// 监控器状态
const monitorState = {
  isRunning: false,
  intervalId: null,
  lastCheck: null,
  stats: {
    checksCount: 0,
    triggeredStopLoss: 0,
    triggeredTakeProfit: 0,
    errors: 0,
  },
};

// ============================================
// 辅助函数
// ============================================

/**
 * 获取所有需要监控的持仓
 * 
 * 条件:
 * 1. Trader 处于激活状态
 * 2. 用户已启用委托
 * 3. 有已执行的买入订单
 */
async function getActivePositions() {
  try {
    // 获取所有活跃 Trader 的已执行买入订单
    const positions = await prisma.autoTradeHistory.findMany({
      where: {
        side: 'BUY',
        status: 'executed',
        // 关联到活跃的 Trader
        trader: {
          isActive: true,
          user: {
            isDelegated: true,
          },
        },
      },
      include: {
        trader: {
          select: {
            id: true,
            name: true,
            stopLossPrice: true,
            takeProfitPrice: true,
            capital: true,
            user: {
              select: {
                id: true,
                privyUserId: true,
                walletAddress: true,
                safeAddress: true,
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    // 过滤掉已经卖出的持仓
    // 通过检查是否有对应的 SELL 订单来判断
    const openPositions = [];

    for (const position of positions) {
      // 检查是否有对应的卖出订单
      const sellOrder = await prisma.autoTradeHistory.findFirst({
        where: {
          traderId: position.traderId,
          tokenId: position.tokenId,
          side: 'SELL',
          status: 'executed',
          createdAt: {
            gt: position.createdAt,
          },
        },
      });

      // 如果没有卖出订单，说明持仓仍然开放
      if (!sellOrder) {
        openPositions.push(position);
      }
    }

    return openPositions;
  } catch (error) {
    console.error('[PositionMonitor] Error fetching active positions:', error);
    return [];
  }
}

/**
 * 检查单个持仓是否需要平仓
 * 
 * @param {object} position - 持仓记录
 * @returns {Promise<{shouldClose: boolean, reason?: string, currentPrice?: number}>}
 */
async function checkPosition(position) {
  const { tokenId, price: entryPrice, trader } = position;

  if (!trader) {
    return { shouldClose: false };
  }

  // 1. 获取当前价格
  const priceData = getPrice(tokenId);
  
  if (!priceData || !priceData.price) {
    // 订阅价格更新
    await subscribeToken(tokenId);
    return { shouldClose: false, reason: 'Price not available' };
  }

  const currentPrice = priceData.price;
  const entryPriceNum = parseFloat(entryPrice);

  // 2. 计算价格变化百分比
  const priceChangePercent = ((currentPrice - entryPriceNum) / entryPriceNum) * 100;

  // 3. 检查止损条件
  // stopLossPrice 表示允许的最大亏损百分比（如 20 表示亏损 20% 时止损）
  // 例如：入场价 0.30，stopLossPrice=20 → 止损价 = 0.30 × (1 - 0.20) = 0.24
  const stopLossThreshold = trader.stopLossPrice / 100; // 转换为小数
  const stopLossPrice = entryPriceNum * (1 - stopLossThreshold);

  if (currentPrice <= stopLossPrice) {
    return {
      shouldClose: true,
      reason: 'stop_loss',
      currentPrice,
      entryPrice: entryPriceNum,
      priceChange: priceChangePercent,
      threshold: trader.stopLossPrice,
      triggerPrice: stopLossPrice,
    };
  }

  // 4. 检查止盈条件
  // takeProfitPrice 表示目标盈利百分比（如 100 表示盈利 100% 时止盈，即翻倍）
  // 例如：入场价 0.30，takeProfitPrice=200 → 止盈价 = 0.30 × (1 + 2.00) = 0.90
  // 注意：Polymarket 价格最高为 1.00，所以止盈价不能超过 1.00
  const takeProfitThreshold = trader.takeProfitPrice / 100; // 转换为小数
  const takeProfitTarget = Math.min(entryPriceNum * (1 + takeProfitThreshold), 1.0);

  if (currentPrice >= takeProfitTarget) {
    return {
      shouldClose: true,
      reason: 'take_profit',
      currentPrice,
      entryPrice: entryPriceNum,
      priceChange: priceChangePercent,
      threshold: trader.takeProfitPrice,
      triggerPrice: takeProfitTarget,
    };
  }

  return {
    shouldClose: false,
    currentPrice,
    entryPrice: entryPriceNum,
    priceChange: priceChangePercent,
  };
}

/**
 * 执行平仓操作
 * 
 * @param {object} position - 持仓记录
 * @param {string} reason - 平仓原因 ('stop_loss' | 'take_profit')
 * @param {number} currentPrice - 当前价格
 */
async function closePosition(position, reason, currentPrice) {
  const { tokenId, eventId, eventTitle, amount, trader } = position;

  console.log(`[PositionMonitor] Closing position for trader ${trader.name}:`, {
    reason,
    tokenId: tokenId.slice(0, 20) + '...',
    entryPrice: parseFloat(position.price),
    currentPrice,
    amount: parseFloat(amount),
  });

  try {
    // 计算卖出数量（基于当前持仓）
    const entryPrice = parseFloat(position.price);
    const tokenAmount = parseFloat(amount) / entryPrice; // 原始购买的 token 数量
    const sellAmount = tokenAmount * currentPrice; // 当前价值

    // 执行卖出
    const result = await executeAutoTrade({
      traderId: trader.id,
      eventId,
      eventTitle: eventTitle || 'Unknown',
      tokenId,
      side: 'SELL',
      outcome: 'CLOSE', // 标记为平仓
      amount: sellAmount,
      price: currentPrice,
      confidence: 100, // 自动平仓无需置信度
      signalSource: reason === 'stop_loss' ? 'auto_stop_loss' : 'auto_take_profit',
    });

    if (result.success) {
      const pnl = sellAmount - parseFloat(amount);
      console.log(`[PositionMonitor] ✅ Position closed successfully:`, {
        orderId: result.orderId,
        reason,
        profit: pnl,
      });

      // 更新统计
      if (reason === 'stop_loss') {
        monitorState.stats.triggeredStopLoss++;
        // 发送止损通知
        notifyStopLoss(trader.user.id, {
          traderId: trader.id,
          eventId,
          eventTitle: eventTitle || 'Unknown',
          entryPrice,
          exitPrice: currentPrice,
          loss: Math.abs(pnl),
        });
      } else {
        monitorState.stats.triggeredTakeProfit++;
        // 发送止盈通知
        notifyTakeProfit(trader.user.id, {
          traderId: trader.id,
          eventId,
          eventTitle: eventTitle || 'Unknown',
          entryPrice,
          exitPrice: currentPrice,
          profit: pnl,
        });
      }

      return { success: true, orderId: result.orderId };
    } else {
      console.error(`[PositionMonitor] ❌ Failed to close position:`, result.error);
      monitorState.stats.errors++;
      return { success: false, error: result.error };
    }
  } catch (error) {
    console.error(`[PositionMonitor] ❌ Error closing position:`, error);
    monitorState.stats.errors++;
    return { success: false, error: error.message };
  }
}

/**
 * 执行一次监控检查
 */
async function runMonitorCycle() {
  console.log('[PositionMonitor] Running monitor cycle...');
  monitorState.lastCheck = Date.now();
  monitorState.stats.checksCount++;

  try {
    // 1. 获取所有活跃持仓
    const positions = await getActivePositions();

    if (positions.length === 0) {
      console.log('[PositionMonitor] No active positions to monitor');
      return;
    }

    console.log(`[PositionMonitor] Checking ${positions.length} active positions`);

    // 2. 检查每个持仓
    for (const position of positions) {
      try {
        const checkResult = await checkPosition(position);

        if (checkResult.shouldClose) {
          console.log(`[PositionMonitor] 🚨 Trigger detected:`, {
            reason: checkResult.reason,
            trader: position.trader?.name,
            tokenId: position.tokenId.slice(0, 20) + '...',
            entryPrice: checkResult.entryPrice,
            currentPrice: checkResult.currentPrice,
            threshold: checkResult.threshold,
          });

          // 执行平仓
          await closePosition(position, checkResult.reason, checkResult.currentPrice);
        }
      } catch (positionError) {
        console.error(`[PositionMonitor] Error checking position ${position.id}:`, positionError);
        monitorState.stats.errors++;
      }
    }
  } catch (error) {
    console.error('[PositionMonitor] Monitor cycle failed:', error);
    monitorState.stats.errors++;
  }
}

// ============================================
// 公共 API
// ============================================

/**
 * 启动止盈止损监控服务
 */
export function startPositionMonitor() {
  if (monitorState.isRunning) {
    console.log('[PositionMonitor] Already running');
    return;
  }

  console.log('[PositionMonitor] Starting position monitor service...');
  console.log(`[PositionMonitor] Monitor interval: ${MONITOR_INTERVAL / 1000}s`);

  // 立即执行一次
  runMonitorCycle();

  // 设置定时器
  monitorState.intervalId = setInterval(runMonitorCycle, MONITOR_INTERVAL);
  monitorState.isRunning = true;

  console.log('[PositionMonitor] ✅ Position monitor service started');
}

/**
 * 停止止盈止损监控服务
 */
export function stopPositionMonitor() {
  if (!monitorState.isRunning) {
    console.log('[PositionMonitor] Not running');
    return;
  }

  console.log('[PositionMonitor] Stopping position monitor service...');

  if (monitorState.intervalId) {
    clearInterval(monitorState.intervalId);
    monitorState.intervalId = null;
  }

  monitorState.isRunning = false;
  console.log('[PositionMonitor] ✅ Position monitor service stopped');
}

/**
 * 获取监控服务状态
 */
export function getMonitorStatus() {
  return {
    isRunning: monitorState.isRunning,
    lastCheck: monitorState.lastCheck,
    intervalMs: MONITOR_INTERVAL,
    stats: { ...monitorState.stats },
  };
}

/**
 * 手动触发一次检查
 */
export async function triggerManualCheck() {
  console.log('[PositionMonitor] Manual check triggered');
  await runMonitorCycle();
  return getMonitorStatus();
}

/**
 * 重置统计数据
 */
export function resetStats() {
  monitorState.stats = {
    checksCount: 0,
    triggeredStopLoss: 0,
    triggeredTakeProfit: 0,
    errors: 0,
  };
  console.log('[PositionMonitor] Stats reset');
}

export default {
  startPositionMonitor,
  stopPositionMonitor,
  getMonitorStatus,
  triggerManualCheck,
  resetStats,
};
