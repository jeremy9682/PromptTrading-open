/**
 * 数据保留服务
 * 
 * 功能：
 * 1. 定期清理超过 30 天的 AI 使用记录
 * 2. 可选：归档前发送邮件给用户
 * 
 * 注意：只清理 UsageRecord（使用记录），不清理：
 * - RechargeOrder（充值记录）- 永久保留用于财务审计
 * - AdminActionLog（管理员日志）- 永久保留用于安全审计
 */

import prisma from '../../lib/prisma.js';

// 数据保留天数
const RETENTION_DAYS = 30;

// 是否启用自动清理
let cleanupInterval = null;

/**
 * 清理过期的使用记录
 * 
 * @param {Object} options - 选项
 * @param {boolean} options.dryRun - 是否只预览不删除
 * @param {boolean} options.sendEmail - 是否发送邮件给用户（需要邮件服务）
 * @returns {Promise<Object>} 清理结果
 */
export const cleanupExpiredRecords = async (options = {}) => {
  const { dryRun = false, sendEmail = false } = options;
  
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - RETENTION_DAYS);
  
  console.log(`[DataRetention] 开始清理 ${RETENTION_DAYS} 天前的使用记录...`);
  console.log(`[DataRetention] 截止日期: ${cutoffDate.toISOString()}`);
  
  try {
    // 1. 统计待清理的记录
    const expiredCount = await prisma.usageRecord.count({
      where: {
        createdAt: { lt: cutoffDate },
      },
    });
    
    console.log(`[DataRetention] 找到 ${expiredCount} 条过期记录`);
    
    if (expiredCount === 0) {
      return {
        success: true,
        message: '没有需要清理的记录',
        deletedCount: 0,
      };
    }
    
    if (dryRun) {
      console.log('[DataRetention] 干运行模式，不实际删除');
      return {
        success: true,
        message: `干运行：将删除 ${expiredCount} 条记录`,
        deletedCount: 0,
        wouldDelete: expiredCount,
      };
    }
    
    // 2. 如果需要发送邮件，先获取每个用户的统计
    if (sendEmail) {
      // 获取每个用户的过期记录统计
      const userStats = await prisma.usageRecord.groupBy({
        by: ['userId'],
        where: {
          createdAt: { lt: cutoffDate },
        },
        _count: true,
        _sum: {
          totalCost: true,
          promptTokens: true,
          completionTokens: true,
        },
      });
      
      console.log(`[DataRetention] 受影响的用户数: ${userStats.length}`);
      
      // TODO: 实现邮件发送
      // 需要：
      // 1. 获取用户邮箱
      // 2. 生成 CSV 或 PDF 报告
      // 3. 通过邮件服务发送
      // 
      // for (const stat of userStats) {
      //   await sendArchiveEmail(stat.userId, {
      //     recordCount: stat._count,
      //     totalCost: stat._sum.totalCost,
      //     tokens: stat._sum.promptTokens + stat._sum.completionTokens,
      //   });
      // }
    }
    
    // 3. 删除过期记录
    const deleteResult = await prisma.usageRecord.deleteMany({
      where: {
        createdAt: { lt: cutoffDate },
      },
    });
    
    console.log(`[DataRetention] ✅ 成功删除 ${deleteResult.count} 条过期记录`);
    
    return {
      success: true,
      message: `成功删除 ${deleteResult.count} 条过期记录`,
      deletedCount: deleteResult.count,
      cutoffDate: cutoffDate.toISOString(),
    };
    
  } catch (error) {
    console.error('[DataRetention] ❌ 清理失败:', error);
    return {
      success: false,
      error: error.message,
    };
  }
};

/**
 * 获取数据保留统计信息
 */
export const getRetentionStats = async () => {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - RETENTION_DAYS);
  
  const [totalRecords, expiredRecords, recentRecords] = await Promise.all([
    prisma.usageRecord.count(),
    prisma.usageRecord.count({
      where: { createdAt: { lt: cutoffDate } },
    }),
    prisma.usageRecord.count({
      where: { createdAt: { gte: cutoffDate } },
    }),
  ]);
  
  return {
    retentionDays: RETENTION_DAYS,
    cutoffDate: cutoffDate.toISOString(),
    totalRecords,
    expiredRecords,
    recentRecords,
    nextCleanup: cleanupInterval ? 'Scheduled' : 'Not scheduled',
  };
};

/**
 * 启动自动清理任务
 * 每天凌晨 3:00 执行
 */
export const startAutoCleanup = () => {
  if (cleanupInterval) {
    console.log('[DataRetention] 自动清理任务已在运行');
    return;
  }
  
  // 计算到下一个凌晨 3:00 的时间
  const now = new Date();
  const next3am = new Date(now);
  next3am.setHours(3, 0, 0, 0);
  if (next3am <= now) {
    next3am.setDate(next3am.getDate() + 1);
  }
  
  const msUntilNext3am = next3am.getTime() - now.getTime();
  
  // 首次运行
  setTimeout(async () => {
    console.log('[DataRetention] 执行首次自动清理...');
    await cleanupExpiredRecords();
    
    // 之后每 24 小时运行一次
    cleanupInterval = setInterval(async () => {
      console.log('[DataRetention] 执行定时自动清理...');
      await cleanupExpiredRecords();
    }, 24 * 60 * 60 * 1000); // 24 小时
    
  }, msUntilNext3am);
  
  console.log(`[DataRetention] 自动清理任务已启动，下次运行: ${next3am.toISOString()}`);
};

/**
 * 停止自动清理任务
 */
export const stopAutoCleanup = () => {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
    console.log('[DataRetention] 自动清理任务已停止');
  }
};

export default {
  cleanupExpiredRecords,
  getRetentionStats,
  startAutoCleanup,
  stopAutoCleanup,
  RETENTION_DAYS,
};
