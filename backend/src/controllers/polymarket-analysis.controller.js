/**
 * Polymarket Analysis History Controller
 * Handles CRUD operations for AI analysis history
 * Max 20 records per user (cleanup on insert)
 */

import prisma from '../lib/prisma.js';
import { getUserByPrivyId } from '../services/user-cache.service.js';

const MAX_HISTORY_PER_USER = 20;

/**
 * Format analysis history for API response
 */
function formatAnalysisHistory(record) {
  return {
    id: record.id,
    traderId: record.traderId,
    eventId: record.eventId,
    eventTitle: record.eventTitle,
    aiModel: record.aiModel,
    yesPrice: parseFloat(record.yesPrice),
    noPrice: parseFloat(record.noPrice),
    volume: parseFloat(record.volume),
    analysisResult: record.analysisResult,
    action: record.action,
    confidence: record.confidence,
    reasoning: record.reasoning,
    executed: record.executed || false,
    executedAt: record.executedAt ? record.executedAt.getTime() : null,
    createdAt: record.createdAt.getTime()
  };
}

/**
 * GET /api/polymarket/traders/:traderId/analysis-history
 * Get analysis history for a trader (max 20 records)
 */
export async function getAnalysisHistory(req, res) {
  try {
    const privyUserId = req.privyUser?.userId;
    const { traderId } = req.params;
    const { limit = 20 } = req.query;

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

    // Verify trader ownership
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

    // Get analysis history
    const history = await prisma.polymarketAnalysisHistory.findMany({
      where: { traderId },
      orderBy: { createdAt: 'desc' },
      take: Math.min(parseInt(limit), MAX_HISTORY_PER_USER)
    });

    res.json({
      success: true,
      data: history.map(formatAnalysisHistory)
    });

  } catch (error) {
    console.error('Error fetching analysis history:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch analysis history',
      message: error.message
    });
  }
}

/**
 * POST /api/polymarket/traders/:traderId/analysis-history
 * Save a new analysis result
 * Automatically cleans up old records if exceeding MAX_HISTORY_PER_USER
 */
export async function saveAnalysisHistory(req, res) {
  try {
    const privyUserId = req.privyUser?.userId;
    const { traderId } = req.params;
    const analysisData = req.body;

    if (!privyUserId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    // Validate required fields
    if (!analysisData.eventId || !analysisData.eventTitle) {
      return res.status(400).json({
        success: false,
        error: 'eventId and eventTitle are required'
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

    // Verify trader ownership
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

    // Transaction: create new record and cleanup old ones
    const result = await prisma.$transaction(async (tx) => {
      // Create new analysis record
      const newRecord = await tx.polymarketAnalysisHistory.create({
        data: {
          traderId,
          userId: user.id,
          eventId: analysisData.eventId,
          eventTitle: analysisData.eventTitle,
          aiModel: analysisData.aiModel || 'deepseek',
          yesPrice: analysisData.yesPrice || 0,
          noPrice: analysisData.noPrice || 0,
          volume: analysisData.volume || 0,
          analysisResult: analysisData.analysisResult || {},
          action: analysisData.action || 'hold',
          confidence: analysisData.confidence || 0,
          reasoning: analysisData.reasoning || ''
        }
      });

      // Get all records for this user, ordered by createdAt desc
      const allRecords = await tx.polymarketAnalysisHistory.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
        select: { id: true }
      });

      // Delete records exceeding the limit
      if (allRecords.length > MAX_HISTORY_PER_USER) {
        const idsToDelete = allRecords
          .slice(MAX_HISTORY_PER_USER)
          .map(r => r.id);

        await tx.polymarketAnalysisHistory.deleteMany({
          where: { id: { in: idsToDelete } }
        });

        console.log(`Cleaned up ${idsToDelete.length} old analysis records for user ${user.id}`);
      }

      return newRecord;
    });

    res.status(201).json({
      success: true,
      data: formatAnalysisHistory(result)
    });

  } catch (error) {
    console.error('Error saving analysis history:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to save analysis history',
      message: error.message
    });
  }
}

/**
 * PATCH /api/polymarket/analysis-history/:analysisId/executed
 * Mark an analysis as executed (trade was placed)
 * Idempotent: calling multiple times has the same effect
 */
export async function markAnalysisExecuted(req, res) {
  try {
    const privyUserId = req.privyUser?.userId;
    const { analysisId } = req.params;

    if (!privyUserId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    // 验证 analysisId 格式
    if (!analysisId || typeof analysisId !== 'string' || analysisId.length < 10) {
      return res.status(400).json({
        success: false,
        error: 'Invalid analysis ID'
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

    // 使用事务确保原子性，同时实现幂等性
    const result = await prisma.$transaction(async (tx) => {
      // 查找并锁定记录
      const analysis = await tx.polymarketAnalysisHistory.findFirst({
        where: {
          id: analysisId,
          userId: user.id
        }
      });

      if (!analysis) {
        return { error: 'not_found' };
      }

      // 幂等性检查：如果已执行，直接返回现有记录
      if (analysis.executed) {
        console.log(`[Analysis] Analysis ${analysisId} already executed at ${analysis.executedAt}`);
        return { alreadyExecuted: true, record: analysis };
      }

      // 更新为已执行
      const updated = await tx.polymarketAnalysisHistory.update({
        where: { id: analysisId },
        data: {
          executed: true,
          executedAt: new Date()
        }
      });

      return { record: updated };
    });

    if (result.error === 'not_found') {
      return res.status(404).json({
        success: false,
        error: 'Analysis record not found'
      });
    }

    if (result.alreadyExecuted) {
      // 返回成功但说明已经执行过
      return res.json({
        success: true,
        alreadyExecuted: true,
        data: formatAnalysisHistory(result.record)
      });
    }

    console.log(`[Analysis] Marked analysis ${analysisId} as executed`);

    res.json({
      success: true,
      data: formatAnalysisHistory(result.record)
    });

  } catch (error) {
    console.error('Error marking analysis as executed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to mark analysis as executed'
      // 不暴露内部错误信息
    });
  }
}

/**
 * DELETE /api/polymarket/traders/:traderId/analysis-history
 * Clear all analysis history for a trader
 */
export async function clearAnalysisHistory(req, res) {
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

    // Verify trader ownership
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

    // Delete all analysis history for this trader
    const deleted = await prisma.polymarketAnalysisHistory.deleteMany({
      where: { traderId }
    });

    res.json({
      success: true,
      message: `Deleted ${deleted.count} analysis records`
    });

  } catch (error) {
    console.error('Error clearing analysis history:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to clear analysis history',
      message: error.message
    });
  }
}
