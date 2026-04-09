/**
 * Hyperliquid 配置
 * 管理测试网和主网的 API 端点配置
 * 注意：不再存储任何私钥，所有交易必须使用用户自己的 Agent Wallet
 */

export const HYPERLIQUID_CONFIG = {
  // 测试网配置
  testnet: {
    infoAPI: process.env.HYPERLIQUID_TESTNET_INFO_API || 'https://api.hyperliquid-testnet.xyz/info',
    exchangeAPI: process.env.HYPERLIQUID_TESTNET_EXCHANGE_API || 'https://api.hyperliquid-testnet.xyz/exchange',

    // 演示账户地址（可选，仅用于展示查询）
    // 注意：这不是用于交易的账户，仅用于演示
    demoAccountAddress: process.env.HYPERLIQUID_DEMO_ACCOUNT || null,
  },

  // 主网配置
  mainnet: {
    infoAPI: process.env.HYPERLIQUID_MAINNET_INFO_API || 'https://api.hyperliquid.xyz/info',
    exchangeAPI: process.env.HYPERLIQUID_MAINNET_EXCHANGE_API || 'https://api.hyperliquid.xyz/exchange',
  },

  // 默认配置
  defaults: {
    // 移除 useTestnet，由前端决定网络
    initialBalance: parseFloat(process.env.DEFAULT_INITIAL_BALANCE) || 10000,
    timeout: 10000, // API 超时时间（毫秒）
  },
};

/**
 * 获取当前环境的 API 配置
 * @param {boolean} isTestnet - 是否使用测试网
 * @returns {Object} API 配置
 */
export const getAPIConfig = (isTestnet = true) => {
  return isTestnet ? HYPERLIQUID_CONFIG.testnet : HYPERLIQUID_CONFIG.mainnet;
};

/**
 * 获取 Info API 端点
 * @param {boolean} isTestnet - 是否使用测试网
 * @returns {string} Info API URL
 */
export const getInfoAPI = (isTestnet = true) => {
  return getAPIConfig(isTestnet).infoAPI;
};

/**
 * 获取 Exchange API 端点
 * @param {boolean} isTestnet - 是否使用测试网
 * @returns {string} Exchange API URL
 */
export const getExchangeAPI = (isTestnet = true) => {
  return getAPIConfig(isTestnet).exchangeAPI;
};

/**
 * 获取默认初始余额
 * @returns {number}
 */
export const getDefaultInitialBalance = () => {
  return HYPERLIQUID_CONFIG.defaults.initialBalance;
};

/**
 * 获取演示账户地址（仅用于展示）
 * @returns {string|null} 演示账户地址
 */
export const getDemoAccountAddress = () => {
  return HYPERLIQUID_CONFIG.testnet.demoAccountAddress;
};

// 已移除的函数（不再支持服务器钱包）：
// - getTestPrivateKey
// - getMainAccountAddress
// - getApiWalletAddress
// - getTestAddress
// - isTestnetEnabled

