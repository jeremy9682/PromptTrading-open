/**
 * Market Configuration
 *
 * Defines all supported prediction markets with their chain and token configurations.
 * This serves as the single source of truth for market integrations.
 */

// Chain types
export type ChainType = 'evm' | 'solana';

// Supported EVM chain IDs
export const EVM_CHAINS = {
  POLYGON: 137,
  BASE: 8453,
  ARBITRUM: 42161,
  ETHEREUM: 1,
  MANTLE: 5000,
} as const;

// Chain metadata
export interface ChainInfo {
  id: number | string;
  name: string;
  type: ChainType;
  rpcUrl: string;
  explorerUrl: string;
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
  };
}

// Token configuration
export interface TokenConfig {
  symbol: string;
  address: string;
  decimals: number;
  name: string;
}

// Market configuration
export interface MarketConfig {
  id: string;
  name: string;
  description: string;
  chainType: ChainType;
  chainId: number | string;
  enabled: boolean;

  // Collateral token (usually USDC)
  collateral: TokenConfig;

  // API endpoints (optional - some markets are on-chain only)
  api?: {
    baseUrl: string;
    docsUrl?: string;
  };

  // Contract addresses (optional - depends on market)
  contracts?: {
    exchange?: string;
    router?: string;
    factory?: string;
  };
}

// ============================================
// Chain Configurations
// ============================================

export const CHAINS: Record<string, ChainInfo> = {
  polygon: {
    id: EVM_CHAINS.POLYGON,
    name: 'Polygon',
    type: 'evm',
    rpcUrl: 'https://polygon-rpc.com',
    explorerUrl: 'https://polygonscan.com',
    nativeCurrency: { name: 'MATIC', symbol: 'MATIC', decimals: 18 },
  },
  base: {
    id: EVM_CHAINS.BASE,
    name: 'Base',
    type: 'evm',
    rpcUrl: 'https://mainnet.base.org',
    explorerUrl: 'https://basescan.org',
    nativeCurrency: { name: 'Ethereum', symbol: 'ETH', decimals: 18 },
  },
  arbitrum: {
    id: EVM_CHAINS.ARBITRUM,
    name: 'Arbitrum One',
    type: 'evm',
    rpcUrl: 'https://arb1.arbitrum.io/rpc',
    explorerUrl: 'https://arbiscan.io',
    nativeCurrency: { name: 'Ethereum', symbol: 'ETH', decimals: 18 },
  },
  solana: {
    id: 'solana-mainnet',
    name: 'Solana',
    type: 'solana',
    rpcUrl: import.meta.env.VITE_SOLANA_RPC_URL || 'https://solana-rpc.publicnode.com',
    explorerUrl: 'https://solscan.io',
    nativeCurrency: { name: 'Solana', symbol: 'SOL', decimals: 9 },
  },
};

// ============================================
// Token Addresses by Chain
// ============================================

export const USDC_ADDRESSES: Record<number | string, string> = {
  // EVM Chains
  [EVM_CHAINS.POLYGON]: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359', // Native USDC on Polygon
  [EVM_CHAINS.BASE]: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',    // Native USDC on Base
  [EVM_CHAINS.ARBITRUM]: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', // Native USDC on Arbitrum
  [EVM_CHAINS.ETHEREUM]: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', // USDC on Ethereum

  // Bridged USDC.e (for Polymarket)
  'polygon-usdc-e': '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174', // USDC.e on Polygon

  // Solana
  'solana-mainnet': 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC on Solana
};

// ============================================
// Market Configurations
// ============================================

export const MARKETS: Record<string, MarketConfig> = {
  polymarket: {
    id: 'polymarket',
    name: 'Polymarket',
    description: 'The largest prediction market on Polygon',
    chainType: 'evm',
    chainId: EVM_CHAINS.POLYGON,
    enabled: true,
    collateral: {
      symbol: 'USDC.e',
      address: USDC_ADDRESSES['polygon-usdc-e'],
      decimals: 6,
      name: 'USD Coin (Bridged)',
    },
    api: {
      baseUrl: 'https://clob.polymarket.com',
      docsUrl: 'https://docs.polymarket.com',
    },
    contracts: {
      exchange: '0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E', // CTF Exchange
      router: '0xC5d563A36AE78145C45a50134d48A1215220f80a', // Neg Risk Adapter
    },
  },

  kalshi: {
    id: 'kalshi',
    name: 'Kalshi',
    description: 'CFTC-regulated prediction market via DFlow on Solana',
    chainType: 'solana',
    chainId: 'solana-mainnet',
    enabled: true,
    collateral: {
      symbol: 'USDC',
      address: USDC_ADDRESSES['solana-mainnet'],
      decimals: 6,
      name: 'USD Coin',
    },
    api: {
      baseUrl: 'https://api.dflow.net', // DFlow API
    },
  },

  limitless: {
    id: 'limitless',
    name: 'Limitless',
    description: 'High-frequency prediction market on Base',
    chainType: 'evm',
    chainId: EVM_CHAINS.BASE,
    enabled: false, // Not yet integrated
    collateral: {
      symbol: 'USDC',
      address: USDC_ADDRESSES[EVM_CHAINS.BASE],
      decimals: 6,
      name: 'USD Coin',
    },
    api: {
      baseUrl: 'https://api.limitless.exchange',
    },
  },

  opinion: {
    id: 'opinion',
    name: 'Opinion',
    description: 'Decentralized prediction market on Arbitrum',
    chainType: 'evm',
    chainId: EVM_CHAINS.ARBITRUM,
    enabled: false, // Not yet integrated
    collateral: {
      symbol: 'USDC',
      address: USDC_ADDRESSES[EVM_CHAINS.ARBITRUM],
      decimals: 6,
      name: 'USD Coin',
    },
    api: {
      baseUrl: 'https://api.o.xyz', // O.LAB API
    },
  },
};

// ============================================
// Helper Functions
// ============================================

/**
 * Get all enabled markets
 */
export const getEnabledMarkets = (): MarketConfig[] => {
  return Object.values(MARKETS).filter(m => m.enabled);
};

/**
 * Get markets by chain type
 */
export const getMarketsByChainType = (chainType: ChainType): MarketConfig[] => {
  return Object.values(MARKETS).filter(m => m.chainType === chainType);
};

/**
 * Get all unique chain IDs that have enabled markets
 */
export const getActiveChainIds = (): (number | string)[] => {
  const enabledMarkets = getEnabledMarkets();
  return [...new Set(enabledMarkets.map(m => m.chainId))];
};

/**
 * Get market by ID
 */
export const getMarketById = (id: string): MarketConfig | undefined => {
  return MARKETS[id];
};

/**
 * Get USDC address for a specific chain
 */
export const getUsdcAddress = (chainId: number | string): string | undefined => {
  return USDC_ADDRESSES[chainId];
};

/**
 * Check if a chain is EVM-based
 */
export const isEvmChain = (chainId: number | string): boolean => {
  return typeof chainId === 'number';
};

// LiFi chain ID for Solana (used by LiFi widget)
export const LIFI_SOLANA_CHAIN_ID = 1151111081099710;
