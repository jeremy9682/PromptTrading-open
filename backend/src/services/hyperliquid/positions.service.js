/**
 * Hyperliquid 持仓服务
 * 获取用户当前持仓、清算价格、盈亏等信息
 * ✅ 使用官方 Hyperliquid SDK，不手动调用 API
 */

import { Hyperliquid } from 'hyperliquid';

// ✅ 创建 SDK 客户端实例（只读操作不需要私钥）
const createInfoClient = (isTestnet = true) => {
  return new Hyperliquid({
    testnet: isTestnet,  // 动态网络配置
    enableWs: false,
    disableAssetMapRefresh: true  // 🔧 禁用自动刷新，避免网络错误
  });
};

/**
 * 获取用户当前持仓
 * ✅ 使用官方 SDK 方法
 * @param {string} userAddress - 用户地址
 * @param {boolean} isTestnet - 是否为测试网
 * @returns {Promise} 持仓列表
 */
export const getUserPositions = async (userAddress, isTestnet = true) => {
  try {
    const client = createInfoClient(isTestnet);
    await client.connect();

    // ✅ 使用 SDK 官方方法获取清算所状态
    const state = await client.info.perpetuals.getClearinghouseState(userAddress);

    const positions = state.assetPositions || [];

    return positions
      .filter(pos => parseFloat(pos.position.szi) !== 0) // 只返回有持仓的
      .map(pos => {
        const position = pos.position;
        const size = parseFloat(position.szi);
        const isLong = size > 0;

        return {
          coin: position.coin,
          side: isLong ? 'LONG' : 'SHORT',
          size: Math.abs(size),
          entryPrice: parseFloat(position.entryPx || 0),
          currentPrice: parseFloat(pos.markPx || 0),
          liquidationPrice: parseFloat(position.liquidationPx || 0),
          unrealizedPnl: parseFloat(position.unrealizedPnl || 0),
          returnPercent: parseFloat(position.returnOnEquity || 0) * 100,
          leverage: parseFloat(position.leverage?.value || 1),
          marginUsed: parseFloat(position.marginUsed || 0),
          maxTradeSizes: pos.maxTradeSizes || null
        };
      });

  } catch (error) {
    console.error('Hyperliquid getUserPositions 错误:', error.message);
    throw error;
  }
};

/**
 * 获取单个持仓的详细信息
 * @param {string} userAddress - 用户地址
 * @param {string} coin - 币种符号
 * @param {boolean} isTestnet - 是否为测试网
 * @returns {Promise} 持仓详情
 */
export const getPositionByCoin = async (userAddress, coin, isTestnet = true) => {
  try {
    const positions = await getUserPositions(userAddress, isTestnet);
    return positions.find(pos => pos.coin.toUpperCase() === coin.toUpperCase()) || null;

  } catch (error) {
    console.error(`Hyperliquid getPositionByCoin 错误 [${coin}]:`, error.message);
    throw error;
  }
};

/**
 * 计算持仓统计
 * @param {Object[]} positions - 持仓列表
 * @returns {Object} 持仓统计
 */
export const calculatePositionStats = (positions) => {
  if (!positions || positions.length === 0) {
    return {
      totalPositions: 0,
      longPositions: 0,
      shortPositions: 0,
      totalUnrealizedPnl: 0,
      totalMarginUsed: 0,
      avgLeverage: 0
    };
  }

  const longPositions = positions.filter(p => p.side === 'LONG');
  const shortPositions = positions.filter(p => p.side === 'SHORT');
  const totalUnrealizedPnl = positions.reduce((sum, p) => sum + p.unrealizedPnl, 0);
  const totalMarginUsed = positions.reduce((sum, p) => sum + p.marginUsed, 0);
  const avgLeverage = positions.reduce((sum, p) => sum + p.leverage, 0) / positions.length;

  return {
    totalPositions: positions.length,
    longPositions: longPositions.length,
    shortPositions: shortPositions.length,
    totalUnrealizedPnl: parseFloat(totalUnrealizedPnl.toFixed(2)),
    totalMarginUsed: parseFloat(totalMarginUsed.toFixed(2)),
    avgLeverage: parseFloat(avgLeverage.toFixed(2))
  };
};

/**
 * 格式化持仓信息用于 AI Prompt
 * @param {Object[]} positions - 持仓列表
 * @param {string} language - 语言（'zh' 或 'en'）
 * @returns {string} 格式化的持仓信息
 */
export const formatPositionsForPrompt = (positions, language = 'zh') => {
  if (!positions || positions.length === 0) {
    return language === 'zh' ? '当前没有持仓。' : 'No current positions.';
  }

  let formatted = language === 'zh' ? '当前持仓:\n' : 'Current Positions:\n';
  
  positions.forEach((pos, index) => {
    formatted += `${index + 1}. ${pos.coin} ${pos.side}:\n`;
    if (language === 'zh') {
      formatted += `   - 仓位大小: ${pos.size}\n`;
      formatted += `   - 入场价格: $${pos.entryPrice.toFixed(2)}\n`;
      formatted += `   - 当前价格: $${pos.currentPrice.toFixed(2)}\n`;
      formatted += `   - 清算价格: $${pos.liquidationPrice.toFixed(2)}\n`;
      formatted += `   - 未实现盈亏: $${pos.unrealizedPnl.toFixed(2)} (${pos.returnPercent.toFixed(2)}%)\n`;
      formatted += `   - 杠杆: ${pos.leverage}x\n`;
      formatted += `   - 已用保证金: $${pos.marginUsed.toFixed(2)}\n\n`;
    } else {
      formatted += `   - Position Size: ${pos.size}\n`;
      formatted += `   - Entry Price: $${pos.entryPrice.toFixed(2)}\n`;
      formatted += `   - Current Price: $${pos.currentPrice.toFixed(2)}\n`;
      formatted += `   - Liquidation Price: $${pos.liquidationPrice.toFixed(2)}\n`;
      formatted += `   - Unrealized PnL: $${pos.unrealizedPnl.toFixed(2)} (${pos.returnPercent.toFixed(2)}%)\n`;
      formatted += `   - Leverage: ${pos.leverage}x\n`;
      formatted += `   - Margin Used: $${pos.marginUsed.toFixed(2)}\n\n`;
    }
  });

  const stats = calculatePositionStats(positions);
  if (language === 'zh') {
    formatted += `总计:\n`;
    formatted += `- 总持仓数: ${stats.totalPositions} (${stats.longPositions} 多 / ${stats.shortPositions} 空)\n`;
    formatted += `- 总未实现盈亏: $${stats.totalUnrealizedPnl.toFixed(2)}\n`;
    formatted += `- 总保证金使用: $${stats.totalMarginUsed.toFixed(2)}\n`;
    formatted += `- 平均杠杆: ${stats.avgLeverage.toFixed(2)}x\n`;
  } else {
    formatted += `Total:\n`;
    formatted += `- Total Positions: ${stats.totalPositions} (${stats.longPositions} long / ${stats.shortPositions} short)\n`;
    formatted += `- Total Unrealized PnL: $${stats.totalUnrealizedPnl.toFixed(2)}\n`;
    formatted += `- Total Margin Used: $${stats.totalMarginUsed.toFixed(2)}\n`;
    formatted += `- Average Leverage: ${stats.avgLeverage.toFixed(2)}x\n`;
  }

  return formatted;
};

/**
 * 获取用户的未成交订单
 * ✅ 使用官方 SDK 方法
 * @param {string} userAddress - 用户地址
 * @param {boolean} isTestnet - 是否为测试网
 * @returns {Promise} 未成交订单列表
 */
export const getOpenOrders = async (userAddress, isTestnet = true) => {
  try {
    const client = createInfoClient(isTestnet);
    await client.connect();

    // ✅ 使用 SDK 官方方法获取未成交订单
    const orders = await client.info.getUserOpenOrders(userAddress);

    return orders.map(order => ({
      coin: order.coin,
      side: order.side,
      limitPx: parseFloat(order.limitPx),
      sz: parseFloat(order.sz),
      oid: order.oid,
      timestamp: order.timestamp,
      triggerCondition: order.triggerCondition || null,
      isTrigger: order.isTrigger || false
    }));

  } catch (error) {
    console.error('Hyperliquid getOpenOrders 错误:', error.message);
    throw error;
  }
};

