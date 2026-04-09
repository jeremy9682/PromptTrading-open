/**
 * Trader Scheduler Service
 *
 * 定时调度器，按 Trader 的 analysisInterval 执行自动分析和交易
 *
 * 功能:
 * - 管理活跃 Trader 的分析任务
 * - 获取市场数据（支持 Polymarket 和 Kalshi）
 * - 调用 AI 分析
 * - 触发自动交易
 *
 * 支持市场来源:
 * - POLYMARKET: Polygon 链上的预测市场
 * - KALSHI: 通过 DFlow 在 Solana 上的预测市场
 */

import prisma from '../lib/prisma.js';
import { processAnalysisSignal } from './auto-trade.service.js';
import { checkDelegationStatus } from './privy-signing.service.js';
import { getMarket as getPolymarketMarket } from './polymarket/market-cache.service.js';
import { getMarket as getDFlowMarket } from './dflow/market-cache.service.js';
import { getPrice } from './polymarket/price-cache.service.js';
import { processKalshiAnalysisSignal } from './dflow/auto-trade.service.js';

// 调度器状态
const schedulerState = {
  isRunning: false,
  activeTraders: new Map(), // traderId -> intervalId
  lastRun: new Map(), // traderId -> timestamp
};

/**
 * 获取市场事件数据
 *
 * 使用缓存服务获取市场数据和实时价格
 * 支持多个市场来源:
 * - POLYMARKET: 从 Polymarket 缓存获取
 * - KALSHI: 从 DFlow 缓存获取
 *
 * @param {string} eventId - 事件 ID
 * @param {string} source - 市场来源 ('POLYMARKET' | 'KALSHI')
 */
async function fetchMarketData(eventId, source = 'POLYMARKET') {
  try {
    console.log(`[Scheduler] Fetching ${source} market data: ${eventId.slice(0, 20)}...`);

    let market;

    if (source === 'KALSHI') {
      // 从 DFlow 缓存获取
      market = await getDFlowMarket(eventId);
    } else {
      // 从 Polymarket 缓存获取
      market = await getPolymarketMarket(eventId);
    }

    if (!market) {
      console.warn(`[Scheduler] Market not found in ${source} cache: ${eventId}`);
      throw new Error(`Market not found: ${eventId}`);
    }

    // 尝试从价格缓存获取更新的价格 (只对 Polymarket 有效)
    let yesPrice = market.yesPrice;
    let noPrice = market.noPrice;

    if (source === 'POLYMARKET' && market.yesTokenId) {
      const yesPriceData = getPrice(market.yesTokenId);
      if (yesPriceData && yesPriceData.price && !yesPriceData.isStale) {
        yesPrice = yesPriceData.price;
        noPrice = 1 - yesPrice; // Yes + No = 1
      }
    }

    return {
      eventId: market.conditionId || market.ticker,
      eventTitle: market.question || market.title || 'Unknown Market',
      description: market.description || '',
      endDate: market.endDate,
      yesPrice,
      noPrice,
      yesTokenId: market.yesTokenId,
      noTokenId: market.noTokenId,
      volume: market.volume || 0,
      liquidity: market.liquidity || 0,
      active: market.active,
      closed: market.closed,
      source, // 包含来源信息
    };
  } catch (error) {
    console.error(`[Scheduler] Error fetching market data for ${eventId}:`, error);
    throw error;
  }
}

/**
 * 调用 AI 分析
 * 使用 trader-analysis.service 进行分析
 * 
 * ⚠️ 重要限制：
 * 后端调度器运行时没有用户请求上下文，无法获取用户的 API Key（存储在客户端 localStorage）
 * 
 * 当前行为：
 * - 无 API Key 时使用 fallback 规则分析（简化版策略）
 * - 用户需要在浏览器中打开 Trader 详情页才能使用完整 AI 分析
 * 
 * 未来改进方案：
 * 1. 允许用户将加密的 API Key 存储到数据库
 * 2. 使用平台统一的 API Key 进行分析
 * 3. 通过 WebSocket 请求客户端发起分析
 */
async function runAIAnalysis(trader, marketData, userApiKey = null, source = 'POLYMARKET') {
  try {
    // 如果没有 API Key，使用 fallback 规则分析
    // 这是预期行为，因为 API Key 存储在客户端 localStorage 中
    if (!userApiKey) {
      console.log('[Scheduler] ⚠️ No API key available - using fallback rule-based analysis');
      console.log('[Scheduler] 💡 Tip: Open Trader detail page in browser for full AI analysis');
      return fallbackAnalysis(marketData, trader);
    }

    // 调用 Trader 分析服务 (支持多来源)
    const { analyzeMarketForTrader } = await import('./polymarket/trader-analysis.service.js');

    const result = await analyzeMarketForTrader({
      trader,
      marketData,
      userApiKey,
      source, // 传递市场来源
    });

    return result;
  } catch (error) {
    console.error('[Scheduler] AI analysis failed:', error);

    // 备用: 简单的规则分析
    console.log('[Scheduler] Using fallback rule-based analysis');
    return fallbackAnalysis(marketData, trader);
  }
}

/**
 * 备用规则分析 (当 AI 服务不可用时)
 */
function fallbackAnalysis(marketData, trader) {
  const yesPrice = marketData.yesPrice;
  const noPrice = marketData.noPrice;

  // 简单的价值投资策略
  let action = 'hold';
  let confidence = 50;
  let reasoning = 'Fallback rule-based analysis';

  // 如果 YES 价格低于 0.3 且有足够流动性
  if (yesPrice < 0.3 && marketData.liquidity > 10000) {
    action = 'buy_yes';
    confidence = 60;
    reasoning = `YES price ${yesPrice} is undervalued (< 0.3) with good liquidity`;
  }
  // 如果 NO 价格低于 0.3
  else if (noPrice < 0.3 && marketData.liquidity > 10000) {
    action = 'buy_no';
    confidence = 60;
    reasoning = `NO price ${noPrice} is undervalued (< 0.3) with good liquidity`;
  }

  return { action, confidence, reasoning };
}

/**
 * 执行单个 Trader 的分析和交易周期
 */
async function executeTraderCycle(traderId) {
  console.log(`[Scheduler] Executing cycle for trader ${traderId}`);

  try {
    // 1. 获取 Trader 和其分配的事件
    const trader = await prisma.polymarketTrader.findUnique({
      where: { id: traderId },
      include: {
        user: true,
        eventAssignments: true,
      },
    });

    if (!trader || !trader.isActive) {
      console.log(`[Scheduler] Trader ${traderId} not found or inactive, stopping`);
      stopTraderSchedule(traderId);
      return;
    }

    // 2. 检查用户委托状态
    const { isDelegated } = await checkDelegationStatus(trader.user.privyUserId);
    if (!isDelegated) {
      console.log(`[Scheduler] User not delegated, skipping trader ${traderId}`);
      return;
    }

    // 3. 遍历分配的事件
    for (const assignment of trader.eventAssignments) {
      try {
        // 获取市场来源 (默认 POLYMARKET，新事件可能有 source 字段)
        const source = assignment.source || 'POLYMARKET';

        // 获取市场数据
        const marketData = await fetchMarketData(assignment.eventId, source);

        // 运行 AI 分析
        const analysisResult = await runAIAnalysis(trader, marketData, null, source);

        // 处理分析信号 (根据来源使用不同的交易服务)
        let tradeResult;
        if (source === 'KALSHI') {
          // Kalshi 交易需要前端 Solana 钱包签名
          tradeResult = await processKalshiAnalysisSignal(analysisResult, trader, marketData, trader.user);
        } else {
          // Polymarket 交易使用 Privy Session Signer
          tradeResult = await processAnalysisSignal(analysisResult, trader, marketData);
        }

        console.log(`[Scheduler] Event ${assignment.eventId} (${source}) processed:`, {
          action: analysisResult.action,
          confidence: analysisResult.confidence,
          executed: tradeResult.executed,
          pending: tradeResult.pending,
        });

      } catch (eventError) {
        console.error(`[Scheduler] Error processing event ${assignment.eventId}:`, eventError);
      }
    }

    // 更新最后运行时间
    schedulerState.lastRun.set(traderId, Date.now());

  } catch (error) {
    console.error(`[Scheduler] Cycle failed for trader ${traderId}:`, error);
  }
}

/**
 * 启动 Trader 的定时调度
 */
export function startTraderSchedule(traderId, intervalMinutes) {
  // 如果已经在运行，先停止
  if (schedulerState.activeTraders.has(traderId)) {
    stopTraderSchedule(traderId);
  }

  const intervalMs = intervalMinutes * 60 * 1000;

  console.log(`[Scheduler] Starting schedule for trader ${traderId} every ${intervalMinutes} minutes`);

  // 立即执行一次
  executeTraderCycle(traderId);

  // 设置定时器
  const intervalId = setInterval(() => {
    executeTraderCycle(traderId);
  }, intervalMs);

  schedulerState.activeTraders.set(traderId, intervalId);
}

/**
 * 停止 Trader 的定时调度
 */
export function stopTraderSchedule(traderId) {
  const intervalId = schedulerState.activeTraders.get(traderId);
  if (intervalId) {
    clearInterval(intervalId);
    schedulerState.activeTraders.delete(traderId);
    console.log(`[Scheduler] Stopped schedule for trader ${traderId}`);
  }
}

/**
 * 初始化调度器 - 恢复所有活跃 Trader 的调度
 */
export async function initializeScheduler() {
  if (schedulerState.isRunning) {
    console.log('[Scheduler] Already running');
    return;
  }

  console.log('[Scheduler] Initializing...');

  try {
    // 获取所有活跃且用户已委托的 Trader
    const activeTraders = await prisma.polymarketTrader.findMany({
      where: {
        isActive: true,
        user: {
          isDelegated: true,
        },
      },
      include: {
        user: true,
        eventAssignments: true,
      },
    });

    console.log(`[Scheduler] Found ${activeTraders.length} active traders with delegation`);

    // 为每个活跃 Trader 启动调度
    for (const trader of activeTraders) {
      if (trader.eventAssignments.length > 0) {
        startTraderSchedule(trader.id, trader.analysisInterval);
      }
    }

    schedulerState.isRunning = true;
    console.log('[Scheduler] Initialized successfully');

  } catch (error) {
    console.error('[Scheduler] Initialization failed:', error);
  }
}

/**
 * 停止调度器
 */
export function shutdownScheduler() {
  console.log('[Scheduler] Shutting down...');

  for (const traderId of schedulerState.activeTraders.keys()) {
    stopTraderSchedule(traderId);
  }

  schedulerState.isRunning = false;
  console.log('[Scheduler] Shutdown complete');
}

/**
 * 获取调度器状态
 */
export function getSchedulerStatus() {
  return {
    isRunning: schedulerState.isRunning,
    activeTraders: Array.from(schedulerState.activeTraders.keys()),
    lastRun: Object.fromEntries(schedulerState.lastRun),
  };
}

export default {
  startTraderSchedule,
  stopTraderSchedule,
  initializeScheduler,
  shutdownScheduler,
  getSchedulerStatus,
};
