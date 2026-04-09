/**
 * Hyperliquid 服务 - 统一导出
 * 整合账户、持仓、交易等功能
 */

import * as accountService from './account.service.js';
import * as positionsService from './positions.service.js';

/**
 * 获取完整的账户概览
 * @param {string} userAddress - 用户地址
 * @param {number} initialBalance - 初始余额
 * @param {boolean} isTestnet - 是否为测试网
 * @returns {Promise} 完整账户概览
 */
export const getCompleteAccountOverview = async (userAddress, initialBalance = 10000, isTestnet = true) => {
  try {
    // 并行获取账户和持仓信息
    const [performance, positions, openOrders, portfolio] = await Promise.allSettled([
      accountService.getAccountPerformance(userAddress, initialBalance, isTestnet),
      positionsService.getUserPositions(userAddress, isTestnet),
      positionsService.getOpenOrders(userAddress, isTestnet),
      accountService.getUserPortfolioInfo(userAddress, isTestnet)
    ]);

    const result = {
      timestamp: Date.now(),
      userAddress
    };

    // 账户性能
    if (performance.status === 'fulfilled') {
      result.performance = performance.value;
    } else {
      console.error('获取账户性能失败:', performance.reason);
      result.performance = null;
    }

    // 持仓信息
    if (positions.status === 'fulfilled') {
      result.positions = positions.value;
      result.positionStats = positionsService.calculatePositionStats(positions.value);
    } else {
      console.error('获取持仓信息失败:', positions.reason);
      result.positions = [];
      result.positionStats = null;
    }

    // 未成交订单
    if (openOrders.status === 'fulfilled') {
      result.openOrders = openOrders.value;
    } else {
      console.error('获取未成交订单失败:', openOrders.reason);
      result.openOrders = [];
    }

    // 账户信息
    if (portfolio.status === 'fulfilled') {
      result.portfolio = portfolio.value;
    } else {
      console.error('获取账户信息失败:', portfolio.reason);
      result.portfolio = null;
    }

    return result;

  } catch (error) {
    console.error('获取完整账户概览错误:', error.message);
    throw error;
  }
};

/**
 * 生成用于 AI Prompt 的账户摘要
 * @param {string} userAddress - 用户地址
 * @param {number} initialBalance - 初始余额
 * @param {string} language - 语言（'zh' 或 'en'）
 * @param {boolean} isTestnet - 是否为测试网
 * @returns {Promise<string>} 格式化的账户摘要
 */
export const generateAccountPrompt = async (userAddress, initialBalance = 10000, language = 'zh', isTestnet = true) => {
  try {
    const overview = await getCompleteAccountOverview(userAddress, initialBalance, isTestnet);

    let prompt = language === 'zh' ? '## 账户信息\n\n' : '## Account Information\n\n';

    // 账户性能
    if (overview.performance) {
      const perf = overview.performance;
      if (language === 'zh') {
        prompt += `当前总回报: ${perf.returnPercent}%\n`;
        prompt += `可用资金: $${perf.availableCash.toFixed(2)} USDT\n`;
        prompt += `账户总价值: $${perf.currentValue.toFixed(2)}\n`;
        prompt += `未实现盈亏: $${perf.unrealizedPnl.toFixed(2)}\n\n`;
      } else {
        prompt += `Current Total Return: ${perf.returnPercent}%\n`;
        prompt += `Available Cash: $${perf.availableCash.toFixed(2)} USDT\n`;
        prompt += `Account Total Value: $${perf.currentValue.toFixed(2)}\n`;
        prompt += `Unrealized PnL: $${perf.unrealizedPnl.toFixed(2)}\n\n`;
      }
    }

    // 持仓信息
    if (overview.positions && overview.positions.length > 0) {
      prompt += positionsService.formatPositionsForPrompt(overview.positions, language);
    } else {
      prompt += language === 'zh' ? '当前没有持仓。\n' : 'No current positions.\n';
    }

    // 未成交订单
    if (overview.openOrders && overview.openOrders.length > 0) {
      prompt += language === 'zh' ? `\n未成交订单: ${overview.openOrders.length} 个\n` : `\nOpen Orders: ${overview.openOrders.length}\n`;
    }

    return prompt;

  } catch (error) {
    console.error('生成账户 Prompt 错误:', error.message);
    throw error;
  }
};

// 导出所有服务
export {
  accountService,
  positionsService
};


