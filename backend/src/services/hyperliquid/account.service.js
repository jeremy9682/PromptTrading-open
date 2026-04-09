/**
 * Hyperliquid 账户服务
 * 获取账户余额、总价值、收益率等信息
 * ✅ 使用官方 Hyperliquid SDK，不手动调用 API
 * 文档: https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/info-endpoint
 */

import { Hyperliquid } from 'hyperliquid';

// ✅ 创建 SDK 客户端实例（只读操作不需要私钥）
const createInfoClient = (isTestnet = true) => {
  return new Hyperliquid({
    testnet: isTestnet,  // 动态网络配置
    enableWs: false,
    disableAssetMapRefresh: true  // 🔧 禁用自动刷新 asset maps，避免网络错误
  });
};

/**
 * 获取用户账户状态
 * ✅ 使用官方 SDK 方法
 * @param {string} userAddress - 用户的 Hyperliquid 地址
 * @param {boolean} isTestnet - 是否为测试网
 * @returns {Promise} 账户状态
 */
export const getUserState = async (userAddress, isTestnet = true) => {
  try {
    const client = createInfoClient(isTestnet);
    await client.connect();

    // ✅ 使用 SDK 官方方法获取清算所状态
    const state = await client.info.perpetuals.getClearinghouseState(userAddress);

    return state;

  } catch (error) {
    console.error(`Hyperliquid getUserState 错误 [${userAddress}]:`, error.message);
    throw new Error(`无法获取账户状态: ${error.message}`);
  }
};

/**
 * 获取账户余额信息
 * @param {string} userAddress - 用户地址
 * @param {boolean} isTestnet - 是否为测试网
 * @returns {Promise} 余额信息
 */
export const getAccountBalance = async (userAddress, isTestnet = true) => {
  try {
    const state = await getUserState(userAddress, isTestnet);

    // ✅ 添加响应验证
    if (!state) {
      console.warn(`⚠️ 账户 ${userAddress} 未返回状态，返回空账户`);
      return getEmptyAccountBalance();
    }

    const marginSummary = state.marginSummary;
    const crossMarginSummary = state.crossMarginSummary;

    // 🔧 处理空账户或新账户（没有 marginSummary）
    if (!marginSummary || marginSummary.accountValue === undefined) {
      console.warn(`⚠️ 账户 ${userAddress} 在 Hyperliquid 测试网上没有余额，返回空账户`);
      return getEmptyAccountBalance();
    }

    return {
      // 账户总价值 (USDT)
      accountValue: parseFloat(marginSummary.accountValue),

      // 可用余额
      availableBalance: parseFloat(crossMarginSummary?.availableBalance || marginSummary.accountValue),

      // 总权益
      totalEquity: parseFloat(marginSummary.accountValue),

      // 已用保证金
      totalMarginUsed: parseFloat(marginSummary.totalMarginUsed || 0),

      // 未实现盈亏
      // ⚠️ 注意：Hyperliquid API 中使用 totalNtlPos (总名义持仓价值)
      // 这可能不是准确的未实现盈亏，建议使用持仓计算的值
      // 尝试多个可能的字段名
      totalUnrealizedPnl: parseFloat(
        marginSummary.totalUnrealizedPnl ||
        marginSummary.unrealizedPnl ||
        marginSummary.totalNtlPos ||
        0
      ),

      // 提款限制
      withdrawable: parseFloat(state.withdrawable || marginSummary.accountValue)
    };

  } catch (error) {
    console.error('Hyperliquid getAccountBalance 错误:', error.message);
    // 🔧 返回空账户而不是抛出错误
    console.warn('⚠️ 返回空账户余额');
    return getEmptyAccountBalance();
  }
};

/**
 * 返回空账户余额
 * @returns {Object} 空账户余额对象
 */
const getEmptyAccountBalance = () => {
  return {
    accountValue: 0,
    availableBalance: 0,
    totalEquity: 0,
    totalMarginUsed: 0,
    totalUnrealizedPnl: 0,
    withdrawable: 0
  };
};


/**
 * 获取用户 Portfolio 信息并解析
 * ✅ 使用官方 SDK 方法
 * @param {string} userAddress - 用户的 Hyperliquid 地址
 * @param {boolean} isTestnet - 是否为测试网
 * @returns {Promise<Object>} 解析后的 Portfolio 数据
 */
export const getUserPortfolio = async (userAddress, isTestnet = true) => {
  try {
    const client = createInfoClient(isTestnet);
    await client.connect();

    // ✅ 使用 SDK 官方方法获取 Portfolio
    const portfolio = await client.info.portfolio(userAddress);

    return portfolio || {};

  } catch (error) {
    console.error(`Hyperliquid getUserPortfolio 错误 [${userAddress}]:`, error.message);
    throw new Error(`无法获取 Portfolio 信息: ${error.message}`);
  }
};

export const getUserPortfolioInfo = async (userAddress, isTestnet = true) => {
  try {
    const portfolio = await getUserPortfolio(userAddress, isTestnet);

    // Validate portfolio is an array
    if (!Array.isArray(portfolio)) {
      console.warn('Portfolio data is not an array, returning empty data');
      return {
        allTime: { accountValue: 0, pnl: 0 },
        perpAllTime: { accountValue: 0, pnl: 0 },
        raw: {
          day: { accountValueHistory: [], pnlHistory: [], vlm: "0.0"},
          week: { accountValueHistory: [], pnlHistory: [], vlm: "0.0"},
          month: { accountValueHistory: [], pnlHistory: [], vlm: "0.0"},
          allTime: { accountValueHistory: [], pnlHistory: [], vlm: "0.0"},
          perpDay: { accountValueHistory: [], pnlHistory: [], vlm: "0.0" },
          perpWeek: { accountValueHistory: [], pnlHistory: [], vlm: "0.0" },
          perpMonth: { accountValueHistory: [], pnlHistory: [], vlm: "0.0" },
          perpAllTime: { accountValueHistory: [], pnlHistory: [], vlm: "0.0" },
        }
      };
    }

    const raw = Array.isArray(portfolio) ? Object.fromEntries(portfolio) : (portfolio || {});

    return {
      allTime: {
        accountValue: parseFloat(raw.allTime?.accountValueHistory?.[raw.allTime.accountValueHistory.length - 1]?.[1] ?? 0),
        pnl: parseFloat((raw.allTime?.pnlHistory?.[raw.allTime.pnlHistory.length - 1]?.[1]) ?? 0),
      },
      perpAllTime: {
        accountValue: parseFloat((raw.perpAllTime?.accountValueHistory?.[raw.perpAllTime.accountValueHistory.length - 1]?.[1]) ?? 0),
        pnl: parseFloat((raw.perpAllTime?.pnlHistory?.[raw.perpAllTime.pnlHistory.length - 1]?.[1]) ?? 0),
      },
      raw
    }
  } catch (error) {
    console.error('Hyperliquid getUserPortfolioInfo 错误:', error.message);
    throw error;
  }
}

/**
 * 获取账户性能指标
 * @param {string} userAddress - 用户地址
 * @param {number} initialBalance - 初始余额（用于计算收益率）
 * @param {boolean} isTestnet - 是否为测试网
 * @returns {Promise} 性能指标
 */
export const getAccountPerformance = async (userAddress, initialBalance = 10000, isTestnet = true) => {
  try {
    const balance = await getAccountBalance(userAddress, isTestnet);

    const currentValue = balance.accountValue;
    const totalReturn = currentValue - initialBalance;
    const returnPercent = (totalReturn / initialBalance) * 100;

    return {
      initialBalance,
      currentValue,
      totalReturn,
      returnPercent: parseFloat(returnPercent.toFixed(2)),
      availableCash: balance.availableBalance,
      marginUsed: balance.totalMarginUsed,
      // ⚠️ 注意：这里的 unrealizedPnl 来自 marginSummary，可能不够准确
      // 应该使用持仓计算的 positionStats.totalUnrealizedPnl
      unrealizedPnl: balance.totalUnrealizedPnl
    };

  } catch (error) {
    console.error('Hyperliquid getAccountPerformance 错误:', error.message);
    throw error;
  }
};

/**
 * 获取用户填充订单历史（已成交订单）
 * ✅ 使用官方 SDK 方法
 * @param {string} userAddress - 用户地址
 * @param {boolean} isTestnet - 是否为测试网
 * @returns {Promise} 订单历史
 */
export const getUserFills = async (userAddress, isTestnet = true) => {
  try {
    const client = createInfoClient(isTestnet);
    await client.connect();

    // ✅ 使用 SDK 官方方法获取用户成交记录
    const fills = await client.info.getUserFills(userAddress);

    return fills.map(fill => ({
      coin: fill.coin,
      side: fill.side, // 'A' for ask (sell), 'B' for bid (buy)
      price: parseFloat(fill.px),
      size: parseFloat(fill.sz),
      time: fill.time,
      fee: parseFloat(fill.fee),
      hash: fill.hash,
      oid: fill.oid
    }));

  } catch (error) {
    console.error('Hyperliquid getUserFills 错误:', error.message);
    throw error;
  }
};

/**
 * 获取用户资金费率历史
 * ✅ 使用官方 SDK 方法
 * @param {string} userAddress - 用户地址
 * @param {number} startTime - 开始时间戳（毫秒）
 * @param {number} endTime - 结束时间戳（毫秒）
 * @param {boolean} isTestnet - 是否为测试网
 * @returns {Promise} 资金费率历史
 */
export const getUserFundingHistory = async (userAddress, startTime, endTime, isTestnet = true) => {
  try {
    const client = createInfoClient(isTestnet);
    await client.connect();

    // ✅ 使用 SDK 官方方法获取用户资金费率历史
    const funding = await client.info.perpetuals.getUserFunding(
      userAddress,
      startTime,
      endTime
    );

    return funding;

  } catch (error) {
    console.error('Hyperliquid getUserFundingHistory 错误:', error.message);
    throw error;
  }
};

/**
 * 格式化账户信息用于 AI Prompt
 * @param {Object} performance - 账户性能数据
 * @returns {string} 格式化的账户信息
 */
export const formatAccountInfo = (performance) => {
  return `
账户信息:
- 当前总回报: ${performance.returnPercent}%
- 可用资金: $${performance.availableCash.toFixed(2)} USDT
- 账户总价值: $${performance.currentValue.toFixed(2)}
- 已用保证金: $${performance.marginUsed.toFixed(2)}
- 未实现盈亏: $${performance.unrealizedPnl.toFixed(2)}
  `.trim();
};

