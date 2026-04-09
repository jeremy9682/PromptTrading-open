/**
 * Polymarket Auto Trade Controller
 *
 * 处理自动交易相关的 API 请求
 * 使用 Privy Session Signer 实现无签名弹窗的自动交易
 */

import { executeAutoOrder } from '../services/polymarket-auto-trade.service.js';
import prisma from '../lib/prisma.js';
import { getSchedulerStatus, startTraderSchedule, stopTraderSchedule } from '../services/trader-scheduler.service.js';
import { getUserByPrivyId, invalidateUser } from '../services/user-cache.service.js';
import { invalidateDelegationCache } from '../services/privy-signing.service.js';
import {
  getMonitorStatus,
  triggerManualCheck,
  resetStats as resetMonitorStats,
} from '../services/position-monitor.service.js';
import { createAndStoreCredentials } from '../services/polymarket-credentials.service.js';

/**
 * 执行自动交易订单
 *
 * POST /api/polymarket/auto-trade/execute
 *
 * Request Body:
 * {
 *   safeAddress: string,      // Safe 钱包地址
 *   tokenId: string,          // 市场 Token ID
 *   side: 'BUY' | 'SELL',     // 交易方向
 *   price: number,            // 价格 (0.01-0.99, 即 1%-99%，取决于市场 tickSize)
 *   amount: number,           // 金额 (USDC)
 *   timeInForce?: 'GTC' | 'GTD',  // 订单类型，默认 GTC
 *   minOrderSize?: number,    // 最小订单大小，默认 5
 * }
 *
 * Response:
 * {
 *   success: boolean,
 *   orderId?: string,
 *   status?: string,
 *   errorMsg?: string,
 * }
 */
export async function executeOrder(req, res) {
  const startTime = Date.now();
  console.log('============================================');
  console.log('[AutoTradeController] POST /execute');
  console.log('[AutoTradeController] Time:', new Date().toISOString());

  try {
    // 1. 验证用户身份
    const privyUser = req.privyUser;
    const walletAddress = req.headers['x-wallet-address'];

    console.log('[AutoTradeController] Privy User:', privyUser?.userId);
    console.log('[AutoTradeController] Wallet Address:', walletAddress);

    if (!privyUser || !walletAddress) {
      console.error('[AutoTradeController] Authentication required');
      return res.status(401).json({
        success: false,
        errorMsg: 'Authentication required',
      });
    }

    // 2. 获取请求参数
    const {
      safeAddress,
      tokenId,
      side,
      price,
      amount,
      timeInForce = 'GTC',
      minOrderSize = 5,
      // 可选：用于记录交易历史
      eventId,
      eventTitle,
    } = req.body;

    console.log('[AutoTradeController] Request body:', {
      safeAddress,
      tokenId,
      side,
      price,
      amount,
      timeInForce,
      minOrderSize,
    });

    // 3. 验证必填参数
    if (!safeAddress) {
      return res.status(400).json({
        success: false,
        errorMsg: 'Missing required field: safeAddress',
      });
    }

    if (!tokenId) {
      return res.status(400).json({
        success: false,
        errorMsg: 'Missing required field: tokenId',
      });
    }

    if (!side || !['BUY', 'SELL'].includes(side.toUpperCase())) {
      return res.status(400).json({
        success: false,
        errorMsg: 'Invalid side. Must be BUY or SELL',
      });
    }

    // Polymarket 价格范围取决于市场的 tickSize：price >= tickSize && price <= (1 - tickSize)
    // 大多数市场 tickSize = 0.01，所以范围是 0.01 ~ 0.99 (1% ~ 99%)
    // 使用保守的默认范围做初步验证，ClobClient 会根据具体市场做更精确验证
    const DEFAULT_TICK_SIZE = 0.01;
    const MIN_PRICE = DEFAULT_TICK_SIZE;       // 1%
    const MAX_PRICE = 1 - DEFAULT_TICK_SIZE;   // 99%
    if (!price || typeof price !== 'number' || price < MIN_PRICE || price > MAX_PRICE) {
      return res.status(400).json({
        success: false,
        errorMsg: `Invalid price. Must be between ${(MIN_PRICE * 100).toFixed(0)}% and ${(MAX_PRICE * 100).toFixed(0)}%`,
      });
    }

    if (!amount || typeof amount !== 'number' || amount <= 0) {
      return res.status(400).json({
        success: false,
        errorMsg: 'Invalid amount. Must be a positive number',
      });
    }

    // 4. 执行自动交易
    console.log('[AutoTradeController] Executing auto order...');

    const result = await executeAutoOrder({
      privyUserId: privyUser.userId,
      eoaAddress: walletAddress,
      safeAddress: safeAddress,
      orderParams: {
        tokenId,
        side: side.toUpperCase(),
        price,
        amount,
        timeInForce,
      },
      minOrderSize,
    });

    const duration = Date.now() - startTime;
    console.log('[AutoTradeController] Execution completed in', duration, 'ms');
    console.log('[AutoTradeController] Result:', JSON.stringify(result));

    // 5. 如果成功，记录交易历史
    if (result.success) {
      try {
        // 从缓存获取用户
        const user = await getUserByPrivyId(privyUser.userId);

        if (user) {
          // 从请求体中获取 traderId
          const { traderId, signalConfidence: reqSignalConfidence } = req.body;
          
          await prisma.autoTradeHistory.create({
            data: {
              userId: user.id,
              traderId: traderId || null,  // Link to specific trader
              eventId: eventId || tokenId,
              eventTitle: eventTitle || `Token: ${tokenId.substring(0, 16)}...`,
              tokenId: tokenId,
              side: side.toUpperCase(),
              amount: amount,
              price: price,
              orderId: result.orderId || null,
              status: 'executed',
              signalSource: traderId ? 'ai_analysis' : 'auto-trade',  // 有 traderId 说明是 AI 分析触发
              signalConfidence: reqSignalConfidence || null,
              executedAt: new Date(),
            },
          });
          console.log('[AutoTradeController] Trade history recorded for trader:', traderId || 'N/A');
        }
      } catch (recordError) {
        // 记录失败不影响订单结果
        console.warn('[AutoTradeController] Failed to record trade history:', recordError.message);
      }
    }

    // 6. 返回结果
    console.log('============================================');

    if (result.success) {
      return res.json({
        success: true,
        orderId: result.orderId,
        status: result.status,
        executionTime: duration,
      });
    } else {
      return res.status(400).json({
        success: false,
        errorMsg: result.errorMsg,
        executionTime: duration,
      });
    }
  } catch (error) {
    console.error('============================================');
    console.error('[AutoTradeController] Unexpected error:', error);
    console.error('============================================');

    return res.status(500).json({
      success: false,
      errorMsg: error.message || 'Internal server error',
    });
  }
}

/**
 * 检查自动交易是否可用
 *
 * GET /api/polymarket/auto-trade/status
 *
 * 检查:
 * 1. 用户是否已授权 Session Signer (isDelegated)
 * 2. 用户是否有 API 凭证
 * 3. 用户是否有 Safe 钱包
 */
export async function checkStatus(req, res) {
  console.log('[AutoTradeController] GET /status');

  try {
    const privyUser = req.privyUser;
    const walletAddress = req.headers['x-wallet-address'];

    if (!privyUser || !walletAddress) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
    }

    // 从缓存获取用户
    const user = await getUserByPrivyId(privyUser.userId);

    if (!user) {
      return res.json({
        success: true,
        data: {
          available: false,
          isDelegated: false,
          hasApiCredentials: false,
          hasSafeWallet: false,
          message: 'User not found',
        },
      });
    }

    // 检查委托状态
    const isDelegated = user.isDelegated || false;

    // 检查 API 凭证
    let credential = await prisma.polymarketApiCredential.findUnique({
      where: {
        userId_walletAddress: {
          userId: user.id,
          walletAddress: walletAddress,
        },
      },
    });
    let hasApiCredentials = !!credential;

    // 如果已启用 delegation 但没有 API 凭证，自动创建
    if (isDelegated && !hasApiCredentials) {
      console.log('[AutoTradeController] isDelegated=true but no API credentials, auto-creating...');
      try {
        const result = await createAndStoreCredentials(privyUser.userId, walletAddress);
        if (result.success || result.alreadyExists) {
          console.log('[AutoTradeController] ✅ API credentials created successfully');
          hasApiCredentials = true;
        } else {
          console.warn('[AutoTradeController] ⚠️ Failed to create API credentials:', result.error);
        }
      } catch (credError) {
        console.error('[AutoTradeController] ⚠️ Error creating API credentials:', credError);
      }
    }

    // 检查 Safe 钱包 - Safe 信息存储在 User 表中
    const hasSafeWallet = !!user.safeAddress;
    const isDeployed = user.safeDeployed || false;
    const approvalsSet = user.safeApprovalsSet || false;

    // 判断是否可用
    const available = isDelegated && hasApiCredentials && hasSafeWallet && isDeployed && approvalsSet;

    let message = '';
    if (!isDelegated) {
      message = '请先开启 Session Signer 授权';
    } else if (!hasApiCredentials) {
      message = '请先创建 Polymarket API 凭证';
    } else if (!hasSafeWallet) {
      message = '请先初始化 Safe 钱包';
    } else if (!isDeployed) {
      message = '请先部署 Safe 钱包';
    } else if (!approvalsSet) {
      message = '请先设置 Token 授权';
    } else {
      message = '自动交易已就绪';
    }

    console.log('[AutoTradeController] Status check result:', {
      available,
      isDelegated,
      hasApiCredentials,
      hasSafeWallet,
    });

    return res.json({
      success: true,
      data: {
        available,
        isDelegated,
        hasApiCredentials,
        hasSafeWallet,
        isDeployed,
        approvalsSet,
        safeAddress: user.safeAddress || null,
        message,
      },
    });
  } catch (error) {
    console.error('[AutoTradeController] Status check error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to check auto trade status',
    });
  }
}

/**
 * 开启/关闭自动交易委托
 *
 * POST /api/polymarket/auto-trade/delegation
 *
 * Request Body:
 * {
 *   enabled: boolean,  // true = 开启, false = 关闭
 * }
 *
 * Response:
 * {
 *   success: boolean,
 *   data: {
 *     isDelegated: boolean,
 *     message: string,
 *   }
 * }
 */
export async function setDelegation(req, res) {
  console.log('[AutoTradeController] POST /delegation');

  try {
    const privyUser = req.privyUser;
    const walletAddress = req.headers['x-wallet-address'];

    if (!privyUser || !walletAddress) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
    }

    const { enabled } = req.body;
    if (typeof enabled !== 'boolean') {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: enabled (boolean)',
      });
    }

    // 从缓存获取用户
    const user = await getUserByPrivyId(privyUser.userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
      });
    }

    // 更新委托状态
    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: {
        isDelegated: enabled,
        delegatedAt: enabled ? new Date() : null,
      },
    });

    // 清除缓存（数据已更新）
    invalidateUser(privyUser.userId);
    invalidateDelegationCache(privyUser.userId);  // 同时清除委托状态短期缓存

    console.log('[AutoTradeController] Delegation updated:', {
      userId: user.id,
      isDelegated: enabled,
    });

    return res.json({
      success: true,
      data: {
        isDelegated: updatedUser.isDelegated,
        message: enabled ? '自动交易已开启' : '自动交易已关闭',
      },
    });
  } catch (error) {
    console.error('[AutoTradeController] Set delegation error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to update delegation status',
    });
  }
}

/**
 * 获取 Trader 调度器状态
 *
 * GET /api/polymarket/auto-trade/scheduler/:traderId
 *
 * Response:
 * {
 *   success: boolean,
 *   data: {
 *     isScheduled: boolean,     // 是否已加入调度器
 *     lastRunTime: number,      // 上次运行时间戳
 *     nextRunTime: number,      // 下次运行时间戳
 *     intervalMinutes: number,  // 调度间隔（分钟）
 *   }
 * }
 */
export async function getTraderScheduleStatus(req, res) {
  console.log('[AutoTradeController] GET /scheduler/:traderId');

  try {
    const privyUser = req.privyUser;
    const { traderId } = req.params;

    if (!privyUser) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
    }

    // 从缓存获取用户
    const user = await getUserByPrivyId(privyUser.userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
      });
    }

    // 验证 Trader 归属
    const trader = await prisma.polymarketTrader.findFirst({
      where: {
        id: traderId,
        userId: user.id,
      },
      include: {
        eventAssignments: true,
      },
    });

    if (!trader) {
      return res.status(404).json({
        success: false,
        error: 'Trader not found',
      });
    }

    // 获取调度器状态
    const schedulerStatus = getSchedulerStatus();
    const isScheduled = schedulerStatus.activeTraders.includes(traderId);
    const lastRunTime = schedulerStatus.lastRun[traderId] || null;

    // 计算下次运行时间
    let nextRunTime = null;
    if (isScheduled && lastRunTime) {
      const intervalMs = trader.analysisInterval * 60 * 1000;
      nextRunTime = lastRunTime + intervalMs;
    }

    // 如果 Trader 是激活状态但没有在调度器中，并且满足条件，尝试启动调度
    if (trader.isActive && !isScheduled && user.isDelegated && trader.eventAssignments.length > 0) {
      console.log(`[AutoTradeController] Auto-starting scheduler for trader ${traderId}`);
      startTraderSchedule(traderId, trader.analysisInterval);
    }

    // 获取最近的分析历史
    const recentAnalysis = await prisma.polymarketAnalysisHistory.findMany({
      where: { traderId },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: {
        id: true,
        eventId: true,
        eventTitle: true,
        action: true,
        confidence: true,
        createdAt: true,
      },
    });

    // 获取最近的交易历史
    const recentTrades = await prisma.autoTradeHistory.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: {
        id: true,
        eventTitle: true,
        side: true,
        amount: true,
        price: true,
        status: true,
        createdAt: true,
        executedAt: true,
      },
    });

    console.log('[AutoTradeController] Scheduler status:', {
      traderId,
      isScheduled,
      lastRunTime,
      nextRunTime,
    });

    return res.json({
      success: true,
      data: {
        isScheduled,
        lastRunTime,
        nextRunTime,
        intervalMinutes: trader.analysisInterval,
        isActive: trader.isActive,
        isDelegated: user.isDelegated,
        eventCount: trader.eventAssignments.length,
        recentAnalysis,
        recentTrades,
        message: isScheduled 
          ? `调度器正在运行，每 ${trader.analysisInterval} 分钟执行一次分析` 
          : trader.isActive 
            ? '调度器未运行（可能缺少必要条件）'
            : 'Trader 未激活',
      },
    });
  } catch (error) {
    console.error('[AutoTradeController] Get scheduler status error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get scheduler status',
    });
  }
}

/**
 * 获取止盈止损监控状态
 *
 * GET /api/polymarket/auto-trade/position-monitor/status
 *
 * Response:
 * {
 *   success: boolean,
 *   data: {
 *     isRunning: boolean,
 *     lastCheck: number,
 *     intervalMs: number,
 *     stats: {
 *       checksCount: number,
 *       triggeredStopLoss: number,
 *       triggeredTakeProfit: number,
 *       errors: number,
 *     },
 *   }
 * }
 */
export async function getPositionMonitorStatus(req, res) {
  try {
    const status = getMonitorStatus();

    return res.json({
      success: true,
      data: status,
    });
  } catch (error) {
    console.error('[AutoTradeController] Get position monitor status error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get position monitor status',
    });
  }
}

/**
 * 手动触发止盈止损检查
 *
 * POST /api/polymarket/auto-trade/position-monitor/check
 *
 * Response:
 * {
 *   success: boolean,
 *   data: {
 *     isRunning: boolean,
 *     lastCheck: number,
 *     stats: {...},
 *   }
 * }
 */
export async function triggerPositionCheck(req, res) {
  try {
    console.log('[AutoTradeController] Manual position check triggered');
    const status = await triggerManualCheck();

    return res.json({
      success: true,
      data: status,
      message: 'Position check completed',
    });
  } catch (error) {
    console.error('[AutoTradeController] Trigger position check error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to trigger position check',
    });
  }
}

/**
 * 重置监控统计
 *
 * POST /api/polymarket/auto-trade/position-monitor/reset-stats
 */
export async function resetPositionMonitorStats(req, res) {
  try {
    resetMonitorStats();

    return res.json({
      success: true,
      message: 'Position monitor stats reset',
      data: getMonitorStatus(),
    });
  } catch (error) {
    console.error('[AutoTradeController] Reset stats error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to reset stats',
    });
  }
}

export default {
  executeOrder,
  checkStatus,
  setDelegation,
  getTraderScheduleStatus,
  getPositionMonitorStatus,
  triggerPositionCheck,
  resetPositionMonitorStats,
};
