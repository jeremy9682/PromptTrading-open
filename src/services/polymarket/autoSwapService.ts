/**
 * Auto Swap Service
 * 
 * 自动将 Native USDC 转换为 USDC.e
 * 
 * 流程:
 * 1. 检测 Safe 钱包中的 Native USDC 余额
 * 2. 如果有 Native USDC，调用 1inch API 获取 swap 数据
 * 3. 通过 Polymarket Relayer 执行 gasless swap
 */

import { ethers } from 'ethers';
import { RelayClient } from '@polymarket/builder-relayer-client';
import { BuilderConfig } from '@polymarket/builder-signing-sdk';
import { ethers as ethers5 } from 'ethers5';

// ============================================
// Constants
// ============================================

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3002';
const POLYGON_RPC = import.meta.env.VITE_POLYGON_RPC_URL || 'https://polygon-rpc.com';
const RELAYER_URL = 'https://relayer-v2.polymarket.com/';

// Token Addresses on Polygon
const TOKENS = {
  NATIVE_USDC: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359', // Native USDC (Circle)
  USDC_E: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',      // USDC.e (Bridged)
  WMATIC: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270',      // Wrapped MATIC
};

// Multi-chain USDC addresses (for user's EOA wallet detection)
export const MULTI_CHAIN_USDC = {
  polygon: {
    chainId: 137,
    rpcUrl: 'https://polygon-rpc.com',
    name: 'Polygon',
    tokens: {
      NATIVE_USDC: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
      USDC_E: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
    },
  },
  ethereum: {
    chainId: 1,
    rpcUrl: 'https://eth.llamarpc.com',
    name: 'Ethereum',
    tokens: {
      USDC: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    },
  },
  arbitrum: {
    chainId: 42161,
    rpcUrl: 'https://arb1.arbitrum.io/rpc',
    name: 'Arbitrum',
    tokens: {
      USDC: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', // Native USDC
      USDC_E: '0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8', // Bridged USDC.e
    },
  },
  optimism: {
    chainId: 10,
    rpcUrl: 'https://mainnet.optimism.io',
    name: 'Optimism',
    tokens: {
      USDC: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85', // Native USDC
      USDC_E: '0x7F5c764cBc14f9669B88837ca1490cCa17c31607', // Bridged USDC.e
    },
  },
  base: {
    chainId: 8453,
    rpcUrl: 'https://mainnet.base.org',
    name: 'Base',
    tokens: {
      USDC: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    },
  },
  bsc: {
    chainId: 56,
    rpcUrl: 'https://bsc-dataseed.binance.org',
    name: 'BNB Chain',
    tokens: {
      USDC: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d',
    },
  },
  avalanche: {
    chainId: 43114,
    rpcUrl: 'https://api.avax.network/ext/bc/C/rpc',
    name: 'Avalanche',
    tokens: {
      USDC: '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E',
    },
  },
};

// DEX Routers on Polygon (no API key needed!)
const DEX_ROUTERS = {
  // QuickSwap V3 (主要 DEX on Polygon)
  QUICKSWAP_V3: '0xf5b509bB0909a69B1c207E495f687a596C168E12',
  // Uniswap V3 SwapRouter02
  UNISWAP_V3: '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45',
  // SushiSwap Router
  SUSHISWAP: '0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506',
};

// 使用 QuickSwap 作为默认 (Polygon 上流动性最好)
const DEFAULT_ROUTER = DEX_ROUTERS.QUICKSWAP_V3;

// Pool fee tier for Uniswap V3 style pools (0.05% = 500, 0.3% = 3000, 1% = 10000)
const POOL_FEE = 500; // 0.05% - stablecoin pairs usually have lowest fee

// Minimum amount to trigger swap (in USDC units, e.g., 0.1 USDC)
const MIN_SWAP_AMOUNT = 0.1;

// Slippage tolerance (0.5%)
const SLIPPAGE_BPS = 50; // 0.5% = 50 basis points

// ============================================
// Types
// ============================================

export interface SwapQuote {
  fromToken: string;
  toToken: string;
  fromAmount: string;
  toAmount: string;
  estimatedGas: string;
  priceImpact: number;
}

export interface SwapResult {
  success: boolean;
  txHash?: string;
  fromAmount?: number;
  toAmount?: number;
  error?: string;
}

export interface TokenBalance {
  nativeUsdc: number;
  usdcE: number;
}

export interface MultiChainBalance {
  chain: string;
  chainId: number;
  token: string;
  balance: number;
  needsBridge: boolean; // true if on different chain than Polygon
}

export interface AllBalances {
  // Polygon Safe balances (can be swapped directly)
  polygon: {
    nativeUsdc: number;
    usdcE: number;
  };
  // EOA balances on other chains (need bridging)
  otherChains: MultiChainBalance[];
  // Total available after bridge+swap
  totalPotential: number;
}

// ============================================
// Balance Detection
// ============================================

const ERC20_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function approve(address spender, uint256 amount) returns (bool)',
];

/**
 * 获取 Safe 钱包的 USDC 余额（Native 和 USDC.e）
 */
export async function getTokenBalances(safeAddress: string): Promise<TokenBalance> {
  try {
    const provider = new ethers.JsonRpcProvider(POLYGON_RPC);
    
    const nativeUsdcContract = new ethers.Contract(TOKENS.NATIVE_USDC, ERC20_ABI, provider);
    const usdcEContract = new ethers.Contract(TOKENS.USDC_E, ERC20_ABI, provider);
    
    const [nativeBalance, usdcEBalance] = await Promise.all([
      nativeUsdcContract.balanceOf(safeAddress),
      usdcEContract.balanceOf(safeAddress),
    ]);
    
    return {
      nativeUsdc: Number(nativeBalance) / 1e6,
      usdcE: Number(usdcEBalance) / 1e6,
    };
  } catch (error) {
    console.error('[AutoSwap] Failed to get token balances:', error);
    return { nativeUsdc: 0, usdcE: 0 };
  }
}

/**
 * 检查是否需要 swap
 */
export async function checkNeedsSwap(safeAddress: string): Promise<{
  needsSwap: boolean;
  nativeUsdcBalance: number;
}> {
  const balances = await getTokenBalances(safeAddress);
  
  return {
    needsSwap: balances.nativeUsdc >= MIN_SWAP_AMOUNT,
    nativeUsdcBalance: balances.nativeUsdc,
  };
}

/**
 * 获取 EOA 钱包在所有链上的 USDC 余额
 * 用于提示用户需要跨链桥接
 */
export async function getMultiChainBalances(eoaAddress: string): Promise<AllBalances> {
  const otherChains: MultiChainBalance[] = [];
  let totalPotential = 0;
  
  // Check each chain
  const chainPromises = Object.entries(MULTI_CHAIN_USDC).map(async ([chainKey, chainConfig]) => {
    if (chainKey === 'polygon') return null; // Skip Polygon, handled separately
    
    try {
      const provider = new ethers.JsonRpcProvider(chainConfig.rpcUrl);
      
      for (const [tokenKey, tokenAddress] of Object.entries(chainConfig.tokens)) {
        try {
          const contract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
          const balance = await contract.balanceOf(eoaAddress);
          const balanceNumber = Number(balance) / 1e6;
          
          if (balanceNumber >= MIN_SWAP_AMOUNT) {
            return {
              chain: chainConfig.name,
              chainId: chainConfig.chainId,
              token: tokenKey,
              balance: balanceNumber,
              needsBridge: true,
            };
          }
        } catch (err) {
          // Token might not exist or RPC error, skip
        }
      }
    } catch (err) {
      console.warn(`[AutoSwap] Failed to check ${chainConfig.name}:`, err);
    }
    return null;
  });
  
  const results = await Promise.all(chainPromises);
  results.forEach(result => {
    if (result) {
      otherChains.push(result);
      totalPotential += result.balance;
    }
  });
  
  return {
    polygon: { nativeUsdc: 0, usdcE: 0 }, // Will be filled by getTokenBalances
    otherChains,
    totalPotential,
  };
}

/**
 * 获取完整的跨链余额信息
 */
export async function getAllBalances(
  safeAddress: string,
  eoaAddress: string
): Promise<AllBalances> {
  const [polygonBalances, multiChainResult] = await Promise.all([
    getTokenBalances(safeAddress),
    getMultiChainBalances(eoaAddress),
  ]);
  
  return {
    polygon: polygonBalances,
    otherChains: multiChainResult.otherChains,
    totalPotential: polygonBalances.usdcE + polygonBalances.nativeUsdc + multiChainResult.totalPotential,
  };
}

// ============================================
// Direct DEX Contract Integration (No API Key Needed!)
// ============================================

// Uniswap V3 SwapRouter ABI (exactInputSingle)
const SWAP_ROUTER_ABI = [
  'function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96)) external payable returns (uint256 amountOut)',
  'function multicall(uint256 deadline, bytes[] calldata data) external payable returns (bytes[] memory results)',
];

/**
 * 获取 swap 报价 (直接从链上获取价格)
 * 对于 Native USDC <-> USDC.e，价格应该接近 1:1
 */
export async function getSwapQuote(
  fromAmount: number,
): Promise<SwapQuote | null> {
  try {
    const amountInWei = Math.floor(fromAmount * 1e6).toString();
    
    // For stablecoin pairs, we expect ~1:1 ratio
    // Apply slippage to get minimum output
    const minOutput = Math.floor(fromAmount * 1e6 * (10000 - SLIPPAGE_BPS) / 10000);
    
    return {
      fromToken: TOKENS.NATIVE_USDC,
      toToken: TOKENS.USDC_E,
      fromAmount: amountInWei,
      toAmount: minOutput.toString(),
      estimatedGas: '150000', // Estimated gas for swap
      priceImpact: 0, // Native USDC to USDC.e should be ~1:1
    };
  } catch (error) {
    console.error('[AutoSwap] Failed to get swap quote:', error);
    return null;
  }
}

/**
 * 构建 swap 交易数据 (直接调用 DEX 合约)
 * 使用 Uniswap V3 exactInputSingle
 */
export async function getSwapTransaction(
  safeAddress: string,
  fromAmount: number,
): Promise<{
  to: string;
  data: string;
  value: string;
} | null> {
  try {
    const amountIn = BigInt(Math.floor(fromAmount * 1e6));
    // 0.5% slippage
    const amountOutMinimum = amountIn * BigInt(10000 - SLIPPAGE_BPS) / BigInt(10000);
    
    const iface = new ethers.Interface(SWAP_ROUTER_ABI);
    
    // ExactInputSingle params
    const params = {
      tokenIn: TOKENS.NATIVE_USDC,
      tokenOut: TOKENS.USDC_E,
      fee: POOL_FEE,
      recipient: safeAddress,
      amountIn: amountIn,
      amountOutMinimum: amountOutMinimum,
      sqrtPriceLimitX96: 0, // No price limit
    };
    
    // Encode the swap call
    const swapData = iface.encodeFunctionData('exactInputSingle', [params]);
    
    // Wrap in multicall with deadline (5 minutes from now)
    const deadline = Math.floor(Date.now() / 1000) + 300;
    const multicallData = iface.encodeFunctionData('multicall', [deadline, [swapData]]);
    
    console.log('[AutoSwap] Built swap transaction:', {
      router: DEFAULT_ROUTER,
      amountIn: amountIn.toString(),
      amountOutMin: amountOutMinimum.toString(),
    });
    
    return {
      to: DEFAULT_ROUTER,
      data: multicallData,
      value: '0',
    };
  } catch (error) {
    console.error('[AutoSwap] Failed to build swap transaction:', error);
    return null;
  }
}

// ============================================
// Approve Token for DEX Router (No API Key Needed!)
// ============================================

/**
 * 构建 approve 交易
 * 直接 approve 给 DEX Router，不需要 1inch API key
 */
export function buildApproveTransaction(
  amount: string = '115792089237316195423570985008687907853269984665640564039457584007913129639935' // MAX_UINT256
): {
  to: string;
  data: string;
  value: string;
} {
  const iface = new ethers.Interface(ERC20_ABI);
  // Approve 给实际使用的 DEX Router (QuickSwap V3)
  const data = iface.encodeFunctionData('approve', [DEFAULT_ROUTER, amount]);
  
  return {
    to: TOKENS.NATIVE_USDC,
    data,
    value: '0',
  };
}

// ============================================
// Execute Swap via Polymarket Relayer
// ============================================

let relayerClientCache: RelayClient | null = null;

/**
 * 创建 Builder 配置
 */
function createBuilderConfig(): BuilderConfig {
  return new BuilderConfig({
    remoteBuilderConfig: {
      url: `${API_BASE_URL}/api/polymarket/sign`,
    },
  });
}

/**
 * 初始化 RelayClient
 */
async function getRelayClient(signer: ethers5.Signer): Promise<RelayClient> {
  if (relayerClientCache) {
    return relayerClientCache;
  }
  
  const builderConfig = createBuilderConfig();
  
  relayerClientCache = new RelayClient(
    signer,
    137, // Polygon chainId
    {
      url: RELAYER_URL,
    },
    builderConfig
  );
  
  console.log('[AutoSwap] RelayClient initialized');
  return relayerClientCache;
}

/**
 * 执行自动 swap
 * 
 * @param signer - ethers5 Signer (用于 Relayer)
 * @param safeAddress - Safe 钱包地址
 * @param amount - 要 swap 的金额（可选，默认全部）
 */
export async function executeAutoSwap(
  signer: ethers5.Signer,
  safeAddress: string,
  amount?: number
): Promise<SwapResult> {
  try {
    console.log('[AutoSwap] Starting auto swap for:', safeAddress);
    
    // 1. 检查余额
    const balances = await getTokenBalances(safeAddress);
    const swapAmount = amount || balances.nativeUsdc;
    
    if (swapAmount < MIN_SWAP_AMOUNT) {
      return {
        success: false,
        error: `Native USDC balance (${swapAmount}) is below minimum (${MIN_SWAP_AMOUNT})`,
      };
    }
    
    console.log('[AutoSwap] Swap amount:', swapAmount, 'USDC');
    
    // 2. 获取 RelayClient
    const relayClient = await getRelayClient(signer);
    
    // 3. 首先 approve DEX Router (QuickSwap V3 on Polygon)
    console.log('[AutoSwap] Approving DEX Router...');
    const approveTx = buildApproveTransaction();
    
    try {
      await relayClient.executeTransaction(safeAddress, {
        ...approveTx,
        typeCode: '1', // Standard transaction
      });
      console.log('[AutoSwap] Approval successful');
    } catch (approveError: unknown) {
      // 可能已经 approve 过了，继续执行
      console.warn('[AutoSwap] Approval may have failed or already set:', approveError);
    }
    
    // 4. 获取 swap 交易数据
    console.log('[AutoSwap] Getting swap transaction...');
    const swapTx = await getSwapTransaction(safeAddress, swapAmount);
    
    if (!swapTx) {
      return {
        success: false,
        error: 'Failed to build swap transaction',
      };
    }
    
    // 5. 执行 swap
    console.log('[AutoSwap] Executing swap...');
    const result = await relayClient.executeTransaction(safeAddress, {
      to: swapTx.to,
      data: swapTx.data,
      value: swapTx.value,
      typeCode: '1',
    });
    
    console.log('[AutoSwap] Swap executed:', result);
    
    // 6. 验证结果
    const newBalances = await getTokenBalances(safeAddress);
    
    return {
      success: true,
      txHash: typeof result === 'string' ? result : undefined,
      fromAmount: swapAmount,
      toAmount: newBalances.usdcE - balances.usdcE,
    };
  } catch (error) {
    console.error('[AutoSwap] Swap failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// ============================================
// Auto-detect and Swap Hook
// ============================================

/**
 * 自动检测并执行 swap（用于定期检查）
 */
export async function autoDetectAndSwap(
  signer: ethers5.Signer,
  safeAddress: string,
  onProgress?: (message: string) => void
): Promise<SwapResult> {
  onProgress?.('Checking Native USDC balance...');
  
  const { needsSwap, nativeUsdcBalance } = await checkNeedsSwap(safeAddress);
  
  if (!needsSwap) {
    onProgress?.('No Native USDC to swap');
    return {
      success: true,
      fromAmount: 0,
      toAmount: 0,
    };
  }
  
  onProgress?.(`Found ${nativeUsdcBalance} Native USDC, starting swap...`);
  
  const result = await executeAutoSwap(signer, safeAddress, nativeUsdcBalance);
  
  if (result.success) {
    onProgress?.(`Swap complete! Converted ${result.fromAmount} USDC to USDC.e`);
  } else {
    onProgress?.(`Swap failed: ${result.error}`);
  }
  
  return result;
}

// ============================================
// Exports
// ============================================

export const AUTO_SWAP_TOKENS = TOKENS;
export const AUTO_SWAP_MIN_AMOUNT = MIN_SWAP_AMOUNT;

