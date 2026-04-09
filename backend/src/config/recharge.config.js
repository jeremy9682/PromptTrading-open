/**
 * AI Credits 充值配置
 * 
 * 定义充值档位、收款地址、验证参数等
 * 
 * 支持的链：
 * - Arbitrum One (推荐，Gas 最低)
 * - Base
 * - Optimism
 * - Polygon
 * - Ethereum Mainnet (Gas 较高)
 */

// 充值档位 (USDC) - 测试模式：允许任意金额
export const AMOUNT_TIERS = [0.01, 0.1, 1, 5, 10, 20, 50, 100];

// 最小/最大限制 - 临时放开，测试完恢复
export const MIN_AMOUNT = 0.01;
export const MAX_AMOUNT = 1000;

// 订单过期时间 (分钟)
export const ORDER_EXPIRY_MINUTES = 30;

// 链上确认数要求
// 区块确认数（仅用于记录，不阻塞验证）
// 验证条件：receipt.status === 1（交易成功）即可
// Relayer 转账：Relayer 已等待交易被挖矿
// 直接转账：receipt 存在即表示交易已确认
export const REQUIRED_CONFIRMATIONS = {
  arbitrum: 12,     // ~2分钟
  base: 12,         // ~2分钟
  optimism: 12,     // ~2分钟
  polygon: 128,     // ~4分钟
  ethereum: 12,     // ~3分钟
};

// 平台收款地址 (从环境变量读取)
// ⚠️ 重要：同一个 EVM 地址在所有链上都可用
// 只需配置一个地址，所有链共用
// 优先读取通用地址，其次读取链特定地址，最后尝试任意已配置的地址
const getReceiverAddress = () => {
  return (
    process.env.PLATFORM_USDC_RECEIVER ||
    process.env.PLATFORM_USDC_RECEIVER_ARBITRUM ||
    process.env.PLATFORM_USDC_RECEIVER_POLYGON ||
    process.env.PLATFORM_USDC_RECEIVER_BASE ||
    process.env.PLATFORM_USDC_RECEIVER_OPTIMISM ||
    process.env.PLATFORM_USDC_RECEIVER_ETHEREUM ||
    ''
  );
};

const COMMON_RECEIVER = getReceiverAddress();

export const PLATFORM_RECEIVER = {
  arbitrum: COMMON_RECEIVER,
  base: COMMON_RECEIVER,
  optimism: COMMON_RECEIVER,
  polygon: COMMON_RECEIVER,
  ethereum: COMMON_RECEIVER,
};

// USDC 合约地址 (Circle 官方地址)
// 注意：Polygon 有两种 USDC，后端验证时需要同时检查
export const USDC_CONTRACTS = {
  arbitrum: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',  // Arbitrum One - Native USDC
  base: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',      // Base - Native USDC
  optimism: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',  // Optimism - Native USDC
  polygon: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',   // Polygon - Native USDC (Circle 官方，2023年底上线)
  ethereum: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',  // Ethereum Mainnet - USDC
};

// Polygon 上的备选 USDC 合约（USDC.e bridged，兼容 Polymarket/Safe）
export const POLYGON_USDC_BRIDGED = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174';

// 获取链上所有可接受的 USDC 合约地址
export const getAcceptableUsdcContracts = (chain) => {
  const contracts = [USDC_CONTRACTS[chain]];
  // Polygon 支持两种 USDC
  if (chain === 'polygon') {
    contracts.push(POLYGON_USDC_BRIDGED);
  }
  return contracts.filter(Boolean).map(c => c.toLowerCase());
};

// RPC 节点
export const RPC_URLS = {
  arbitrum: process.env.ARBITRUM_RPC_URL || 'https://arb1.arbitrum.io/rpc',
  base: process.env.BASE_RPC_URL || 'https://mainnet.base.org',
  optimism: process.env.OPTIMISM_RPC_URL || 'https://mainnet.optimism.io',
  polygon: process.env.POLYGON_RPC_URL || 'https://polygon-rpc.com',
  ethereum: process.env.ETHEREUM_RPC_URL || 'https://eth.llamarpc.com',
};

// Chain IDs
export const CHAIN_IDS = {
  arbitrum: 42161,
  base: 8453,
  optimism: 10,
  polygon: 137,
  ethereum: 1,
};

// 链显示名称
export const CHAIN_NAMES = {
  arbitrum: 'Arbitrum One',
  base: 'Base',
  optimism: 'Optimism',
  polygon: 'Polygon',
  ethereum: 'Ethereum',
};

// 区块浏览器 URL
export const EXPLORER_URLS = {
  arbitrum: 'https://arbiscan.io',
  base: 'https://basescan.org',
  optimism: 'https://optimistic.etherscan.io',
  polygon: 'https://polygonscan.com',
  ethereum: 'https://etherscan.io',
};

// 预估 Gas 费用 (美元)
export const ESTIMATED_GAS = {
  arbitrum: 0.01,
  base: 0.01,
  optimism: 0.01,
  polygon: 0.01,
  ethereum: 5.00,  // 主网 Gas 较高
};

// 平台加成比例 (20%)
export const PLATFORM_MARKUP = 0.20;

// 兑换比例: 1 USDC = 1 AI Credit
export const EXCHANGE_RATE = 1;

/**
 * 验证充值金额是否有效
 * @param {number} amount - 充值金额
 * @returns {boolean}
 */
export const isValidAmount = (amount) => {
  return AMOUNT_TIERS.includes(amount);
};

/**
 * 获取支持的链列表
 */
export const getSupportedChains = () => {
  return Object.keys(PLATFORM_RECEIVER).filter(chain => PLATFORM_RECEIVER[chain]);
};

/**
 * 获取链配置
 * @param {string} chain - 链名称
 */
export const getChainConfig = (chain) => {
  if (!CHAIN_IDS[chain]) {
    return null;
  }
  return {
    chainId: CHAIN_IDS[chain],
    chainName: CHAIN_NAMES[chain],
    usdcContract: USDC_CONTRACTS[chain],
    receiverAddress: PLATFORM_RECEIVER[chain],
    rpcUrl: RPC_URLS[chain],
    explorerUrl: EXPLORER_URLS[chain],
    requiredConfirmations: REQUIRED_CONFIRMATIONS[chain],
    estimatedGas: ESTIMATED_GAS[chain],
  };
};

/**
 * 获取配置摘要
 */
export const getConfigSummary = () => {
  const supportedChains = getSupportedChains();
  return {
    tiers: AMOUNT_TIERS,
    minAmount: MIN_AMOUNT,
    maxAmount: MAX_AMOUNT,
    orderExpiryMinutes: ORDER_EXPIRY_MINUTES,
    exchangeRate: EXCHANGE_RATE,
    platformMarkup: `${PLATFORM_MARKUP * 100}%`,
    supportedChains,
    chains: supportedChains.map(chain => ({
      id: chain,
      name: CHAIN_NAMES[chain],
      chainId: CHAIN_IDS[chain],
      estimatedGas: ESTIMATED_GAS[chain],
    })),
  };
};

export default {
  AMOUNT_TIERS,
  MIN_AMOUNT,
  MAX_AMOUNT,
  ORDER_EXPIRY_MINUTES,
  REQUIRED_CONFIRMATIONS,
  PLATFORM_RECEIVER,
  USDC_CONTRACTS,
  RPC_URLS,
  CHAIN_IDS,
  CHAIN_NAMES,
  EXPLORER_URLS,
  ESTIMATED_GAS,
  PLATFORM_MARKUP,
  EXCHANGE_RATE,
  isValidAmount,
  getSupportedChains,
  getChainConfig,
  getConfigSummary,
};



