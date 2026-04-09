/**
 * Paper Trading Controller (模拟盘控制器)
 *
 * 处理模拟交易的 HTTP 请求
 */

import {
  getPaperAccountDetails,
  executePaperBuy,
  executePaperSell,
  resetPaperAccount,
  getPaperTradeHistory,
  getPaperPositions,
  executeFromAiAnalysis
} from '../services/paper-trading.service.js';
import { getUserByPrivyId } from '../services/user-cache.service.js';
import prisma from '../lib/prisma.js';

/**
 * 获取用户 ID（通过 Privy 认证）
 */
async function getUserIdFromRequest(req) {
  const privyUser = req.privyUser;
  if (!privyUser) return null;

  const user = await getUserByPrivyId(privyUser.userId);
  return user?.id || null;
}

/**
 * 获取模拟账户详情
 * GET /api/paper-trading/account
 */
export async function getAccount(req, res) {
  try {
    const userId = await getUserIdFromRequest(req);

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    const accountDetails = await getPaperAccountDetails(userId);

    return res.json({
      success: true,
      data: accountDetails
    });
  } catch (error) {
    console.error('[PaperTrading] Get account error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get paper account'
    });
  }
}

/**
 * 执行模拟买入
 * POST /api/paper-trading/buy
 * Body: { eventId, eventTitle, side, price, amount, source?, traderId?, fromAiAnalysis?, aiConfidence? }
 */
export async function buy(req, res) {
  try {
    const userId = await getUserIdFromRequest(req);

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    const { eventId, eventTitle, side, price, amount, source, traderId, fromAiAnalysis, aiConfidence } = req.body;

    // 验证必填字段
    if (!eventId || !eventTitle || !side || !price || !amount) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: eventId, eventTitle, side, price, amount'
      });
    }

    // 验证 side
    if (!['YES', 'NO'].includes(side)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid side. Must be "YES" or "NO"'
      });
    }

    // 验证价格范围
    if (price <= 0 || price >= 1) {
      return res.status(400).json({
        success: false,
        error: 'Invalid price. Must be between 0 and 1'
      });
    }

    // 验证金额
    if (amount <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Amount must be greater than 0'
      });
    }

    const result = await executePaperBuy(userId, {
      eventId,
      eventTitle,
      side,
      price: parseFloat(price),
      amount: parseFloat(amount),
      source: source || 'POLYMARKET',  // 市场来源
      traderId: traderId || null,      // 关联的 PaperTrader ID
      fromAiAnalysis: fromAiAnalysis || false,
      aiConfidence: aiConfidence || null
    });

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error,
        availableBalance: result.availableBalance
      });
    }

    return res.json({
      success: true,
      message: 'Paper buy executed successfully',
      data: result
    });
  } catch (error) {
    console.error('[PaperTrading] Buy error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to execute paper buy'
    });
  }
}

/**
 * 执行模拟卖出（平仓）
 * POST /api/paper-trading/sell
 * Body: { positionId, sellPrice, fromAiAnalysis?, aiConfidence? }
 */
export async function sell(req, res) {
  try {
    const userId = await getUserIdFromRequest(req);

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    const { positionId, sellPrice, fromAiAnalysis, aiConfidence } = req.body;

    // 验证必填字段
    if (!positionId || sellPrice === undefined) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: positionId, sellPrice'
      });
    }

    // 验证价格范围
    if (sellPrice <= 0 || sellPrice > 1) {
      return res.status(400).json({
        success: false,
        error: 'Invalid sellPrice. Must be between 0 and 1'
      });
    }

    const result = await executePaperSell(userId, {
      positionId,
      sellPrice: parseFloat(sellPrice),
      fromAiAnalysis: fromAiAnalysis || false,
      aiConfidence: aiConfidence || null
    });

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error
      });
    }

    return res.json({
      success: true,
      message: 'Paper sell executed successfully',
      data: result
    });
  } catch (error) {
    console.error('[PaperTrading] Sell error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to execute paper sell'
    });
  }
}

/**
 * 重置模拟账户
 * POST /api/paper-trading/reset
 */
export async function reset(req, res) {
  try {
    const userId = await getUserIdFromRequest(req);

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    const result = await resetPaperAccount(userId);

    return res.json({
      success: true,
      message: result.message,
      data: {
        balance: result.balance
      }
    });
  } catch (error) {
    console.error('[PaperTrading] Reset error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to reset paper account'
    });
  }
}

/**
 * 获取交易历史
 * GET /api/paper-trading/history?limit=50&offset=0
 */
export async function getHistory(req, res) {
  try {
    const userId = await getUserIdFromRequest(req);

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;

    const result = await getPaperTradeHistory(userId, { limit, offset });

    return res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('[PaperTrading] Get history error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get trade history'
    });
  }
}

/**
 * 获取持仓列表
 * GET /api/paper-trading/positions
 */
export async function getPositions(req, res) {
  try {
    const userId = await getUserIdFromRequest(req);

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    const positions = await getPaperPositions(userId);

    return res.json({
      success: true,
      data: positions
    });
  } catch (error) {
    console.error('[PaperTrading] Get positions error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get positions'
    });
  }
}

/**
 * 根据 AI 分析执行模拟交易
 * POST /api/paper-trading/execute-ai
 * Body: { eventId, eventTitle, action, confidence, price, amount?, source?, traderId? }
 */
export async function executeAi(req, res) {
  try {
    const userId = await getUserIdFromRequest(req);

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    const { eventId, eventTitle, action, confidence, price, amount, source, traderId } = req.body;

    // 验证必填字段
    if (!eventId || !eventTitle || !action || !price) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: eventId, eventTitle, action, price'
      });
    }

    // 验证 action
    const validActions = ['buy_yes', 'buy_no', 'sell_yes', 'sell_no', 'hold'];
    if (!validActions.includes(action)) {
      return res.status(400).json({
        success: false,
        error: `Invalid action. Must be one of: ${validActions.join(', ')}`
      });
    }

    const result = await executeFromAiAnalysis(userId, {
      eventId,
      eventTitle,
      action,
      confidence: confidence || 0,
      price: parseFloat(price),
      amount: parseFloat(amount) || 100,
      source: source || 'POLYMARKET',  // 市场来源
      traderId: traderId || null       // 关联的 PaperTrader ID
    });

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error
      });
    }

    return res.json({
      success: true,
      message: result.executed === false ? result.message : 'AI trade executed successfully',
      data: result
    });
  } catch (error) {
    console.error('[PaperTrading] Execute AI error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to execute AI trade'
    });
  }
}

// ============================================
// Paper Traders CRUD (模拟盘 AI Trader)
// ============================================

/**
 * 获取用户的所有 Paper Traders
 * GET /api/paper-trading/traders
 */
export async function getTraders(req, res) {
  try {
    const userId = await getUserIdFromRequest(req);

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    const traders = await prisma.paperTrader.findMany({
      where: { userId },
      include: {
        eventAssignments: true
      },
      orderBy: { createdAt: 'desc' }
    });

    // 转换格式以匹配前端期望的结构
    const formattedTraders = traders.map(trader => ({
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
      createdAt: trader.createdAt.toISOString(),
      updatedAt: trader.updatedAt.toISOString(),
      assignedEvents: trader.eventAssignments.map(e => e.eventId),
      isPaper: true // 标记为模拟盘 trader
    }));

    return res.json({
      success: true,
      data: formattedTraders
    });
  } catch (error) {
    console.error('[PaperTrading] Get traders error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get paper traders'
    });
  }
}

/**
 * 创建新的 Paper Trader
 * POST /api/paper-trading/traders
 */
export async function createTrader(req, res) {
  try {
    const userId = await getUserIdFromRequest(req);

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    // 检查用户 trader 数量限制 (最多 10 个)
    const existingCount = await prisma.paperTrader.count({
      where: { userId }
    });

    if (existingCount >= 10) {
      return res.status(400).json({
        success: false,
        error: '已达到模拟盘 Trader 上限 (10个)',
        code: 'QUOTA_EXCEEDED'
      });
    }

    const {
      name,
      color,
      prompt,
      aiModel,
      capital,
      minConfidence,
      maxPosition,
      stopLossPrice,
      takeProfitPrice,
      newsWeight,
      dataWeight,
      sentimentWeight,
      analysisInterval,
      dataSources,
      assignedEvents
    } = req.body;

    // 验证必填字段
    if (!name || !prompt) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: name, prompt'
      });
    }

    // 创建 trader
    const trader = await prisma.paperTrader.create({
      data: {
        userId,
        name,
        color: color || 'blue',
        prompt,
        aiModel: aiModel || 'deepseek/deepseek-chat',
        capital: capital || 1000,
        totalValue: capital || 1000,
        minConfidence: minConfidence ?? 65,
        maxPosition: maxPosition ?? 30,
        stopLossPrice: stopLossPrice ?? 20,
        takeProfitPrice: takeProfitPrice ?? 80,
        newsWeight: newsWeight ?? 40,
        dataWeight: dataWeight ?? 35,
        sentimentWeight: sentimentWeight ?? 25,
        analysisInterval: analysisInterval ?? 15,
        dataSources: dataSources || { marketDepth: true, historyData: true }
      }
    });

    // 如果有分配的事件，创建关联
    if (assignedEvents && Array.isArray(assignedEvents) && assignedEvents.length > 0) {
      await prisma.paperTraderEvent.createMany({
        data: assignedEvents.map(eventId => ({
          traderId: trader.id,
          eventId
        }))
      });
    }

    console.log(`[PaperTrading] Created trader: ${trader.id} for user: ${userId}`);

    return res.json({
      success: true,
      data: {
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
        createdAt: trader.createdAt.toISOString(),
        updatedAt: trader.updatedAt.toISOString(),
        assignedEvents: assignedEvents || [],
        isPaper: true
      }
    });
  } catch (error) {
    console.error('[PaperTrading] Create trader error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to create paper trader'
    });
  }
}

/**
 * 更新 Paper Trader
 * PUT /api/paper-trading/traders/:traderId
 */
export async function updateTrader(req, res) {
  try {
    const userId = await getUserIdFromRequest(req);

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    const { traderId } = req.params;

    // 验证 trader 所属
    const existingTrader = await prisma.paperTrader.findFirst({
      where: { id: traderId, userId }
    });

    if (!existingTrader) {
      return res.status(404).json({
        success: false,
        error: 'Paper trader not found'
      });
    }

    const {
      name,
      color,
      prompt,
      aiModel,
      capital,
      minConfidence,
      maxPosition,
      stopLossPrice,
      takeProfitPrice,
      newsWeight,
      dataWeight,
      sentimentWeight,
      analysisInterval,
      dataSources,
      isActive,
      assignedEvents
    } = req.body;

    // 更新 trader
    const updatedTrader = await prisma.paperTrader.update({
      where: { id: traderId },
      data: {
        ...(name !== undefined && { name }),
        ...(color !== undefined && { color }),
        ...(prompt !== undefined && { prompt }),
        ...(aiModel !== undefined && { aiModel }),
        ...(capital !== undefined && { capital }),
        ...(minConfidence !== undefined && { minConfidence }),
        ...(maxPosition !== undefined && { maxPosition }),
        ...(stopLossPrice !== undefined && { stopLossPrice }),
        ...(takeProfitPrice !== undefined && { takeProfitPrice }),
        ...(newsWeight !== undefined && { newsWeight }),
        ...(dataWeight !== undefined && { dataWeight }),
        ...(sentimentWeight !== undefined && { sentimentWeight }),
        ...(analysisInterval !== undefined && { analysisInterval }),
        ...(dataSources !== undefined && { dataSources }),
        ...(isActive !== undefined && { isActive })
      }
    });

    // 如果有更新事件分配
    if (assignedEvents !== undefined && Array.isArray(assignedEvents)) {
      // 删除旧的关联
      await prisma.paperTraderEvent.deleteMany({
        where: { traderId }
      });

      // 创建新的关联
      if (assignedEvents.length > 0) {
        await prisma.paperTraderEvent.createMany({
          data: assignedEvents.map(eventId => ({
            traderId,
            eventId
          }))
        });
      }
    }

    // 获取更新后的事件分配
    const eventAssignments = await prisma.paperTraderEvent.findMany({
      where: { traderId }
    });

    console.log(`[PaperTrading] Updated trader: ${traderId}`);

    return res.json({
      success: true,
      data: {
        id: updatedTrader.id,
        name: updatedTrader.name,
        color: updatedTrader.color,
        prompt: updatedTrader.prompt,
        aiModel: updatedTrader.aiModel,
        capital: parseFloat(updatedTrader.capital),
        totalValue: parseFloat(updatedTrader.totalValue),
        totalPnL: parseFloat(updatedTrader.totalPnL),
        minConfidence: updatedTrader.minConfidence,
        maxPosition: updatedTrader.maxPosition,
        stopLossPrice: updatedTrader.stopLossPrice,
        takeProfitPrice: updatedTrader.takeProfitPrice,
        newsWeight: updatedTrader.newsWeight,
        dataWeight: updatedTrader.dataWeight,
        sentimentWeight: updatedTrader.sentimentWeight,
        analysisInterval: updatedTrader.analysisInterval,
        dataSources: updatedTrader.dataSources,
        isActive: updatedTrader.isActive,
        createdAt: updatedTrader.createdAt.toISOString(),
        updatedAt: updatedTrader.updatedAt.toISOString(),
        assignedEvents: eventAssignments.map(e => e.eventId),
        isPaper: true
      }
    });
  } catch (error) {
    console.error('[PaperTrading] Update trader error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to update paper trader'
    });
  }
}

/**
 * 删除 Paper Trader
 * DELETE /api/paper-trading/traders/:traderId
 */
export async function deleteTrader(req, res) {
  try {
    const userId = await getUserIdFromRequest(req);

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    const { traderId } = req.params;

    // 验证 trader 所属
    const existingTrader = await prisma.paperTrader.findFirst({
      where: { id: traderId, userId }
    });

    if (!existingTrader) {
      return res.status(404).json({
        success: false,
        error: 'Paper trader not found'
      });
    }

    // 删除 trader (级联删除事件分配和分析历史)
    await prisma.paperTrader.delete({
      where: { id: traderId }
    });

    console.log(`[PaperTrading] Deleted trader: ${traderId}`);

    return res.json({
      success: true,
      message: 'Paper trader deleted successfully'
    });
  } catch (error) {
    console.error('[PaperTrading] Delete trader error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to delete paper trader'
    });
  }
}

// ============================================
// Paper Analysis History (模拟盘分析历史)
// ============================================

/**
 * 获取 Trader 的分析历史
 * GET /api/paper-trading/traders/:traderId/analysis-history
 */
export async function getAnalysisHistory(req, res) {
  try {
    const userId = await getUserIdFromRequest(req);

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    const { traderId } = req.params;
    const limit = parseInt(req.query.limit) || 20;

    // 验证 trader 所属
    const existingTrader = await prisma.paperTrader.findFirst({
      where: { id: traderId, userId }
    });

    if (!existingTrader) {
      return res.status(404).json({
        success: false,
        error: 'Paper trader not found'
      });
    }

    const history = await prisma.paperAnalysisHistory.findMany({
      where: { traderId },
      orderBy: { createdAt: 'desc' },
      take: limit
    });

    // 转换格式
    const formattedHistory = history.map(h => ({
      id: h.id,
      traderId: h.traderId,
      eventId: h.eventId,
      eventTitle: h.eventTitle,
      aiModel: h.aiModel,
      yesPrice: parseFloat(h.yesPrice),
      noPrice: parseFloat(h.noPrice),
      volume: parseFloat(h.volume),
      analysisResult: h.analysisResult,
      action: h.action,
      confidence: h.confidence,
      reasoning: h.reasoning,
      executed: h.executed,
      executedAt: h.executedAt?.toISOString() || null,
      createdAt: h.createdAt.toISOString()
    }));

    return res.json({
      success: true,
      data: formattedHistory
    });
  } catch (error) {
    console.error('[PaperTrading] Get analysis history error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get analysis history'
    });
  }
}

/**
 * 保存分析历史
 * POST /api/paper-trading/traders/:traderId/analysis-history
 */
export async function saveAnalysisHistory(req, res) {
  try {
    const userId = await getUserIdFromRequest(req);

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    const { traderId } = req.params;

    // 验证 trader 所属
    const existingTrader = await prisma.paperTrader.findFirst({
      where: { id: traderId, userId }
    });

    if (!existingTrader) {
      return res.status(404).json({
        success: false,
        error: 'Paper trader not found'
      });
    }

    const {
      eventId,
      eventTitle,
      aiModel,
      yesPrice,
      noPrice,
      volume,
      analysisResult,
      action,
      confidence,
      reasoning,
      executed,
      executedAt
    } = req.body;

    // 验证必填字段
    if (!eventId || !eventTitle || !action) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: eventId, eventTitle, action'
      });
    }

    // 创建分析记录
    const analysis = await prisma.paperAnalysisHistory.create({
      data: {
        traderId,
        userId,
        eventId,
        eventTitle,
        aiModel: aiModel || existingTrader.aiModel,
        yesPrice: yesPrice || 0.5,
        noPrice: noPrice || 0.5,
        volume: volume || 0,
        analysisResult: analysisResult || {},
        action,
        confidence: confidence || 0,
        reasoning: reasoning || '',
        executed: executed || false,
        executedAt: executedAt ? new Date(executedAt) : null
      }
    });

    // 清理旧记录 (保留最近 20 条)
    const oldRecords = await prisma.paperAnalysisHistory.findMany({
      where: { traderId },
      orderBy: { createdAt: 'desc' },
      skip: 20,
      select: { id: true }
    });

    if (oldRecords.length > 0) {
      await prisma.paperAnalysisHistory.deleteMany({
        where: {
          id: { in: oldRecords.map(r => r.id) }
        }
      });
    }

    console.log(`[PaperTrading] Saved analysis for trader: ${traderId}`);

    return res.json({
      success: true,
      data: {
        id: analysis.id,
        traderId: analysis.traderId,
        eventId: analysis.eventId,
        eventTitle: analysis.eventTitle,
        aiModel: analysis.aiModel,
        yesPrice: parseFloat(analysis.yesPrice),
        noPrice: parseFloat(analysis.noPrice),
        volume: parseFloat(analysis.volume),
        analysisResult: analysis.analysisResult,
        action: analysis.action,
        confidence: analysis.confidence,
        reasoning: analysis.reasoning,
        executed: analysis.executed,
        executedAt: analysis.executedAt?.toISOString() || null,
        createdAt: analysis.createdAt.toISOString()
      }
    });
  } catch (error) {
    console.error('[PaperTrading] Save analysis history error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to save analysis history'
    });
  }
}

/**
 * 同步前端状态到后端
 * POST /api/paper-trading/sync
 * Body: { balance, positions, trades }
 *
 * 用于将前端 localStorage 中的模拟盘数据同步到数据库
 */
export async function syncFromFrontend(req, res) {
  try {
    const userId = await getUserIdFromRequest(req);

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    const { balance, positions, trades } = req.body;

    // 验证数据
    if (balance === undefined) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: balance'
      });
    }

    // 开始事务同步
    await prisma.$transaction(async (tx) => {
      // 1. 获取或创建账户
      let account = await tx.paperTradingAccount.findUnique({
        where: { userId }
      });

      if (!account) {
        account = await tx.paperTradingAccount.create({
          data: {
            userId,
            balance: parseFloat(balance),
            initialBalance: 10000
          }
        });
      } else {
        // 更新余额
        await tx.paperTradingAccount.update({
          where: { id: account.id },
          data: { balance: parseFloat(balance) }
        });
      }

      // 2. 同步持仓
      if (positions && Array.isArray(positions)) {
        // 清除现有持仓
        await tx.paperPosition.deleteMany({
          where: { accountId: account.id }
        });

        // 添加新持仓
        for (const pos of positions) {
          await tx.paperPosition.create({
            data: {
              accountId: account.id,
              eventId: pos.eventId,
              eventTitle: pos.eventTitle,
              side: pos.side,
              size: parseFloat(pos.size),
              entryPrice: parseFloat(pos.entryPrice),
              totalCost: parseFloat(pos.totalCost || pos.size * pos.entryPrice)
            }
          });
        }
      }

      // 3. 同步交易记录（只添加新的，不删除旧的）
      if (trades && Array.isArray(trades)) {
        for (const trade of trades) {
          // 检查是否已存在（通过时间戳和事件ID判断）
          const exists = await tx.paperTrade.findFirst({
            where: {
              accountId: account.id,
              eventId: trade.eventId,
              executedAt: new Date(trade.executedAt)
            }
          });

          if (!exists) {
            await tx.paperTrade.create({
              data: {
                accountId: account.id,
                eventId: trade.eventId,
                eventTitle: trade.eventTitle,
                action: trade.action,
                side: trade.side,
                size: parseFloat(trade.size),
                price: parseFloat(trade.price),
                amount: parseFloat(trade.amount),
                pnl: trade.pnl ? parseFloat(trade.pnl) : null,
                fromAiAnalysis: trade.fromAiAnalysis || false,
                aiConfidence: trade.aiConfidence || null,
                executedAt: new Date(trade.executedAt)
              }
            });
          }
        }
      }
    });

    console.log(`[PaperTrading] Synced data for user: ${userId}`);

    return res.json({
      success: true,
      message: 'Paper trading data synced successfully'
    });
  } catch (error) {
    console.error('[PaperTrading] Sync error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to sync paper trading data'
    });
  }
}
