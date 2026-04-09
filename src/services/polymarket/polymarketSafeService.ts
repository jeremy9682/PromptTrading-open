/**
 * Polymarket Safe Service (Frontend)
 *
 * 使用 @polymarket/builder-relayer-client 实现 Gasless 交易
 *
 * 架构说明 (参考 https://github.com/ayv8er/polymarket-safe-trader):
 * - 前端使用 RelayClient 进行 Safe 部署和授权
 * - 后端存储状态和检查链上数据
 *
 * 流程:
 * 1. 初始化 RelayClient (需要 Builder 配置)
 * 2. 派生 Safe 地址 (从 EOA)
 * 3. 部署 Safe (如果需要) - Gasless
 * 4. 设置 Token 授权 (如果需要) - Gasless
 */

import { RelayClient } from '@polymarket/builder-relayer-client';
import { RelayerTxType } from '@polymarket/builder-relayer-client/dist/types';
import { deriveSafe, deriveProxyWallet } from '@polymarket/builder-relayer-client/dist/builder/derive';
import { getContractConfig } from '@polymarket/builder-relayer-client/dist/config';
import { BuilderConfig } from '@polymarket/builder-signing-sdk';
// 使用 ethers v5 (builder-relayer-client 需要)
import { ethers as ethers5 } from 'ethers5';
// 用于独立的 RPC 调用 (ethers v6)
import { ethers } from 'ethers';
// 注意: 现在使用 ClobClient.createOrDeriveApiKey() 而不是 polymarketAuthService
// 导入官方 CLOB Client
import { ClobClient, OrderType as ClobOrderType, Side } from '@polymarket/clob-client';

// ============================================
// Types
// ============================================

export interface SafeInfo {
  safeAddress: string | null;
  isDeployed: boolean;
  approvalsSet: boolean;
  usdcBalance: number;
  eoaAddress: string | null;
}

export interface TradingSessionResult {
  success: boolean;
  safeAddress?: string;
  error?: string;
}

// ============================================
// Constants
// ============================================

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3002';
const POLYGON_CHAIN_ID = 137;
// 使用更可靠的 RPC URL
// Polygon 官方 RPC 端点
const POLYGON_RPC = import.meta.env.VITE_POLYGON_RPC_URL || 'https://polygon-rpc.com';

// Polymarket Relayer URL
// 通过后端代理调用，避免 CORS 问题
// 后端会转发请求到 https://relayer-v2.polymarket.com/
const RELAYER_URL = `${API_BASE_URL}/api/polymarket/relayer-proxy`;

// Remote signing URL for Builder authentication
// 必须指向后端服务器，路由是 /api/polymarket/sign
const getRemoteSigningUrl = () => `${API_BASE_URL}/api/polymarket/sign`;

// Polymarket Contract Addresses
const USDC_E_CONTRACT_ADDRESS = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174';
const CTF_CONTRACT_ADDRESS = '0x4d97dcd97ec945f40cf65f87097ace5ea0476045';
const CTF_EXCHANGE_ADDRESS = '0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E';
const NEG_RISK_CTF_EXCHANGE_ADDRESS = '0xC5d563A36AE78145C45a50134d48A1215220f80a';
const NEG_RISK_ADAPTER_ADDRESS = '0xd91E80cF2E7be2e162c6513ceD06f1dD0dA35296';

const MAX_UINT256 = '115792089237316195423570985008687907853269984665640564039457584007913129639935';

// USDC spenders that need approval
const USDC_E_SPENDERS = [
  CTF_CONTRACT_ADDRESS,
  NEG_RISK_ADAPTER_ADDRESS,
  CTF_EXCHANGE_ADDRESS,
  NEG_RISK_CTF_EXCHANGE_ADDRESS,
];

// ============================================
// API Credentials Cache (会话级缓存)
// ============================================

interface ApiCredentialsCache {
  eoaAddress: string;
  credentials: { key: string; secret: string; passphrase: string };
  timestamp: number;
}

// 缓存 API credentials，避免每次交易都需要签名
let apiCredentialsCache: ApiCredentialsCache | null = null;
const API_CREDENTIALS_CACHE_TTL = 30 * 60 * 1000; // 30 分钟有效期

function getCachedApiCredentials(eoaAddress: string): { key: string; secret: string; passphrase: string } | null {
  if (!apiCredentialsCache) return null;
  
  // 检查是否是同一个 EOA
  if (apiCredentialsCache.eoaAddress.toLowerCase() !== eoaAddress.toLowerCase()) {
    console.log('[SafeService] API credentials cache miss: different EOA');
    return null;
  }
  
  // 检查是否过期
  if (Date.now() - apiCredentialsCache.timestamp > API_CREDENTIALS_CACHE_TTL) {
    console.log('[SafeService] API credentials cache expired');
    apiCredentialsCache = null;
    return null;
  }
  
  console.log('[SafeService] ✅ Using cached API credentials (no signature needed)');
  return apiCredentialsCache.credentials;
}

function setCachedApiCredentials(eoaAddress: string, credentials: { key: string; secret: string; passphrase: string }) {
  apiCredentialsCache = {
    eoaAddress,
    credentials,
    timestamp: Date.now(),
  };
  console.log('[SafeService] API credentials cached for future trades');
}

// 清除缓存（用户登出或切换钱包时调用）
export function clearApiCredentialsCache() {
  apiCredentialsCache = null;
  console.log('[SafeService] API credentials cache cleared');
}

// ERC1155 operators that need approval
const OUTCOME_TOKEN_SPENDERS = [
  CTF_EXCHANGE_ADDRESS,
  NEG_RISK_CTF_EXCHANGE_ADDRESS,
  NEG_RISK_ADAPTER_ADDRESS,
];

// ============================================
// On-Chain Approval Check (链上授权检查)
// ============================================

// ERC1155 isApprovedForAll ABI
const ERC1155_ABI = [
  'function isApprovedForAll(address account, address operator) view returns (bool)',
];

/**
 * 检查 Safe 钱包在 CTF 合约上的 ERC1155 授权状态
 *
 * 对于卖单，需要确保 Exchange 合约有权转移用户的 outcome tokens
 *
 * @param safeAddress - Safe 钱包地址
 * @param isNegRisk - 是否是 negativeRisk 市场
 * @returns 授权检查结果
 */
export async function checkOnChainApprovals(
  safeAddress: string,
  isNegRisk: boolean = false
): Promise<{
  hasApproval: boolean;
  missingApprovals: string[];
  details: { operator: string; operatorName: string; approved: boolean }[];
}> {
  console.log('[SafeService] Checking on-chain ERC1155 approvals for Safe:', safeAddress);

  const provider = new ethers.JsonRpcProvider(POLYGON_RPC);
  const ctfContract = new ethers.Contract(CTF_CONTRACT_ADDRESS, ERC1155_ABI, provider);

  const details: { operator: string; operatorName: string; approved: boolean }[] = [];
  const missingApprovals: string[] = [];

  // 根据市场类型检查需要的授权
  const operatorsToCheck = isNegRisk
    ? [
        { address: NEG_RISK_CTF_EXCHANGE_ADDRESS, name: 'NegRisk CTF Exchange' },
        { address: NEG_RISK_ADAPTER_ADDRESS, name: 'NegRisk Adapter' },
      ]
    : [
        { address: CTF_EXCHANGE_ADDRESS, name: 'CTF Exchange' },
      ];

  for (const operator of operatorsToCheck) {
    try {
      const approved = await ctfContract.isApprovedForAll(safeAddress, operator.address);
      details.push({
        operator: operator.address,
        operatorName: operator.name,
        approved: approved,
      });

      if (!approved) {
        missingApprovals.push(operator.name);
      }

      console.log(`[SafeService] ${operator.name} approved:`, approved);
    } catch (error) {
      console.error(`[SafeService] Failed to check approval for ${operator.name}:`, error);
      // 检查失败时假设未授权
      details.push({
        operator: operator.address,
        operatorName: operator.name,
        approved: false,
      });
      missingApprovals.push(operator.name);
    }
  }

  const hasApproval = missingApprovals.length === 0;

  console.log('[SafeService] Approval check result:', {
    hasApproval,
    missingApprovals,
  });

  return {
    hasApproval,
    missingApprovals,
    details,
  };
}

// ============================================
// Error Message Parsing (用户友好的错误信息)
// ============================================

/**
 * 将 Polymarket API 错误转换为用户友好的中文消息
 */
function parseOrderError(errorMsg: string): string {
  // 最小订单大小错误
  const sizeMatch = errorMsg.match(/Size \(([0-9.]+)\) lower than the minimum: (\d+)/i);
  if (sizeMatch) {
    const currentSize = parseFloat(sizeMatch[1]);
    const minSize = parseInt(sizeMatch[2]);
    return `订单数量太小：当前 ${currentSize.toFixed(2)} 股，最低需要 ${minSize} 股。请增加交易金额。`;
  }

  // 余额/授权不足 - 区分两种情况
  if (errorMsg.toLowerCase().includes('insufficient balance') ||
      errorMsg.toLowerCase().includes('not enough balance')) {
    return '余额不足，请确保 Safe 钱包有足够的 USDC.e';
  }

  // 授权不足 (allowance) - 卖单常见问题
  if (errorMsg.toLowerCase().includes('allowance') ||
      errorMsg.toLowerCase().includes('not enough balance / allowance')) {
    return 'APPROVAL_MISSING:Token 授权缺失，请重新设置授权后再试。点击"重新授权"按钮修复此问题。';
  }

  // 无效价格 - 解析具体的价格范围错误
  const priceRangeMatch = errorMsg.match(/invalid price \(([0-9.e+-]+)\), min: ([0-9.]+) - max: ([0-9.]+)/i);
  if (priceRangeMatch) {
    const currentPrice = parseFloat(priceRangeMatch[1]);
    const minPrice = parseFloat(priceRangeMatch[2]);
    const maxPrice = parseFloat(priceRangeMatch[3]);
    
    if (currentPrice < minPrice) {
      return `价格太低：当前 ${(currentPrice * 100).toFixed(2)}%，最低需要 ${(minPrice * 100).toFixed(1)}%。该市场当前概率过低，无法下单。`;
    } else if (currentPrice > maxPrice) {
      return `价格太高：当前 ${(currentPrice * 100).toFixed(2)}%，最高允许 ${(maxPrice * 100).toFixed(1)}%。该市场当前概率过高，无法下单。`;
    }
    return `价格超出范围 (${(minPrice * 100).toFixed(1)}% - ${(maxPrice * 100).toFixed(1)}%)`;
  }
  
  if (errorMsg.toLowerCase().includes('invalid price')) {
    return '无效的价格 (需要在 0.1% - 99.9% 之间)，请选择其他市场或等待价格变化';
  }

  // 市场关闭
  if (errorMsg.toLowerCase().includes('market closed') || 
      errorMsg.toLowerCase().includes('trading halted')) {
    return '市场已关闭或暂停交易';
  }

  // 无效的 Token ID
  if (errorMsg.toLowerCase().includes('invalid token') || 
      errorMsg.toLowerCase().includes('token not found')) {
    return '无效的市场代币，请刷新页面后重试';
  }

  // API Key 问题
  if (errorMsg.toLowerCase().includes('unauthorized') || 
      errorMsg.toLowerCase().includes('invalid api key')) {
    return 'API 认证失败，请重新登录';
  }

  // 签名问题
  if (errorMsg.toLowerCase().includes('invalid signature') || 
      errorMsg.toLowerCase().includes('signature verification')) {
    return '签名验证失败。请尝试：1) 刷新页面重试；2) 如果问题持续，请清除 API Key 后重新授权。';
  }

  // 网络错误
  if (errorMsg.toLowerCase().includes('network error') || 
      errorMsg.toLowerCase().includes('failed to fetch') ||
      errorMsg.toLowerCase().includes('connection')) {
    return '网络连接失败，请检查网络后重试';
  }

  // 订单已过期
  if (errorMsg.toLowerCase().includes('expired')) {
    return '订单已过期，请重新下单';
  }

  // 重复订单
  if (errorMsg.toLowerCase().includes('duplicate')) {
    return '重复的订单，请稍后再试';
  }

  // 限价单价格不合理
  if (errorMsg.toLowerCase().includes('price out of range') ||
      errorMsg.toLowerCase().includes('price too')) {
    return '价格超出合理范围 (0-1)';
  }

  // 如果没有匹配，返回原始错误 (去掉订单ID等技术细节)
  const cleanedError = errorMsg
    .replace(/order 0x[a-fA-F0-9]+/g, '订单')
    .replace(/is invalid\./g, '无效:');
  
  return cleanedError || '下单失败，请稍后重试';
}

// ============================================
// RelayClient Management
// ============================================

let relayerClientCache: RelayClient | null = null;

/**
 * 创建 Builder 配置 (用于 Order Attribution)
 *
 * 远程签名端点在后端: /api/polymarket/builder/sign
 */
function createBuilderConfig(): BuilderConfig {
  return new BuilderConfig({
    remoteBuilderConfig: {
      url: getRemoteSigningUrl(),
    },
  });
}

/**
 * 获取或创建 RelayClient
 *
 * 重要：必须使用 RelayerTxType.SAFE，因为：
 * - deploy() 内部总是使用 SAFE-CREATE 类型，部署地址由 deriveSafe() 派生
 * - execute() 需要使用相同类型来确保地址一致
 * - 如果使用 PROXY 类型，execute() 会使用 deriveProxyWallet() 派生不同的地址
 *   导致 Token Approvals 在错误的地址上执行并失败
 *
 * @param signer - Ethers v5 signer from user's wallet
 */
async function getRelayClient(signer: ethers5.Signer): Promise<RelayClient> {
  if (!relayerClientCache) {
    const builderConfig = createBuilderConfig();

    console.log('[SafeService] Initializing RelayClient...');
    console.log('[SafeService] Relayer URL:', RELAYER_URL);

    // 使用 SAFE 类型 - 确保 deploy() 和 execute() 使用相同的地址
    // deploy() 总是部署 SAFE 钱包，所以 execute() 也必须使用 SAFE 类型
    relayerClientCache = new RelayClient(
      RELAYER_URL,
      POLYGON_CHAIN_ID,
      signer as unknown as ethers5.providers.JsonRpcSigner,
      builderConfig,
      RelayerTxType.SAFE
    );

    console.log('[SafeService] RelayClient initialized with SAFE type');
  }

  return relayerClientCache;
}

/**
 * 清除 RelayClient 缓存 (用于用户登出时)
 */
export function clearRelayClient(): void {
  relayerClientCache = null;
  clearApiCredentialsCache(); // 同时清除 API 凭证缓存
  console.log('[SafeService] RelayClient cache cleared');
}

// ============================================
// Safe Operations (Frontend)
// ============================================

/**
 * 派生 Safe 地址 (从 EOA)
 *
 * 使用 deriveSafe 函数确定性地计算 Safe 地址
 *
 * @param eoaAddress - EOA 地址
 * @returns Safe 地址
 */
export function deriveSafeAddressFromEOA(eoaAddress: string): string {
  console.log('[SafeService] Deriving Safe address for EOA:', eoaAddress);

  try {
    const config = getContractConfig(POLYGON_CHAIN_ID);
    const safeAddress = deriveSafe(eoaAddress, config.SafeContracts.SafeFactory);

    console.log('[SafeService] Safe address:', safeAddress);
    return safeAddress;
  } catch (error) {
    console.error('[SafeService] Error deriving Safe address:', error);
    throw error;
  }
}

/**
 * 派生 Proxy 钱包地址 (从 EOA)
 *
 * 重要：使用 RelayerTxType.PROXY 时，部署的是 Proxy 钱包，
 * 其地址与 deriveSafe() 返回的 Safe 地址不同。
 * 这个函数返回正确的 PROXY 钱包地址。
 *
 * @param eoaAddress - EOA 地址
 * @returns Proxy 钱包地址
 */
export function deriveProxyAddressFromEOA(eoaAddress: string): string {
  console.log('[SafeService] Deriving PROXY wallet address for EOA:', eoaAddress);

  try {
    const config = getContractConfig(POLYGON_CHAIN_ID);
    const proxyAddress = deriveProxyWallet(eoaAddress, config.ProxyContracts.ProxyFactory);

    console.log('[SafeService] PROXY wallet address:', proxyAddress);
    return proxyAddress;
  } catch (error) {
    console.error('[SafeService] Error deriving PROXY address:', error);
    throw error;
  }
}

/**
 * 检查钱包是否已部署
 *
 * 使用 EOA 地址检查 - RelayClient 会根据类型 (PROXY) 确定实际钱包地址
 *
 * @param signer - Ethers signer
 */
export async function checkSafeDeployed(
  signer: ethers5.Signer
): Promise<{ deployed: boolean; walletAddress?: string }> {
  try {
    const relayClient = await getRelayClient(signer);
    const eoaAddress = await signer.getAddress();

    // 使用 EOA 地址查询 - RelayClient 会根据类型 (PROXY) 返回正确的部署状态
    const deployed = await (relayClient as any).getDeployed(eoaAddress);
    console.log('[SafeService] Wallet for EOA', eoaAddress, 'deployed:', deployed);

    return { deployed };
  } catch (err: any) {
    console.warn('[SafeService] API check failed:', err?.message || err);

    // 如果 API 检查失败，假设未部署，让 deploy 步骤来处理
    return { deployed: false };
  }
}

/**
 * 部署交易钱包 (Gasless)
 *
 * 注意：使用 RelayerTxType.PROXY 时，部署的是 Proxy 钱包，
 * 返回的地址可能与 deriveSafe() 派生的 Safe 地址不同。
 * 调用者应使用返回的 safeAddress（实际是 proxyAddress）作为钱包地址。
 *
 * 如果钱包已经部署，会尝试从错误信息中提取现有地址。
 *
 * @param signer - Ethers signer
 * @param onProgress - 进度回调
 * @returns TradingSessionResult with safeAddress set to the deployed wallet address
 */
export async function deploySafe(
  signer: ethers5.Signer,
  onProgress?: (step: string) => void
): Promise<TradingSessionResult> {
  try {
    const relayClient = await getRelayClient(signer);
    const eoaAddress = await signer.getAddress();

    onProgress?.('正在部署交易钱包... (请在钱包中确认签名)');
    console.log('[SafeService] Deploying wallet for EOA:', eoaAddress);

    // 调用 deploy() 方法，这会提示用户签名
    const response = await relayClient.deploy();

    onProgress?.('等待部署确认...');

    // 等待交易完成
    const result = await response.wait();

    if (!result) {
      throw new Error('Wallet deployment failed - no result');
    }

    // result.proxyAddress 是实际部署的钱包地址
    console.log('[SafeService] ✅ Wallet deployed at:', result.proxyAddress);
    onProgress?.('交易钱包部署成功');

    return {
      success: true,
      safeAddress: result.proxyAddress, // 返回实际部署的地址
    };
  } catch (error: any) {
    console.error('[SafeService] Deploy error:', error);

    const errorMsg = error.message || error.toString() || '';
    const errorData = error.data || error.response?.data || {};

    // 检测是否是 "already deployed" 类型的错误
    const isAlreadyDeployed =
      errorMsg.toLowerCase().includes('already deployed') ||
      errorMsg.toLowerCase().includes('already exists') ||
      errorMsg.toLowerCase().includes('proxy exists') ||
      errorMsg.toLowerCase().includes('safe already');

    if (isAlreadyDeployed) {
      console.log('[SafeService] Wallet already deployed, trying to get address...');
      onProgress?.('交易钱包已存在，获取地址...');

      // 尝试从错误中提取地址
      let existingAddress: string | null = null;

      // 1. 检查错误消息中的地址
      const addressMatch = errorMsg.match(/0x[a-fA-F0-9]{40}/);
      if (addressMatch) {
        existingAddress = addressMatch[0];
        console.log('[SafeService] Found address in error message:', existingAddress);
      }

      // 2. 检查错误数据中的地址
      if (!existingAddress && errorData.proxyAddress) {
        existingAddress = errorData.proxyAddress;
        console.log('[SafeService] Found proxyAddress in error data:', existingAddress);
      }
      if (!existingAddress && errorData.address) {
        existingAddress = errorData.address;
        console.log('[SafeService] Found address in error data:', existingAddress);
      }

      // 3. 如果错误中没有地址，尝试从 RelayClient 获取
      if (!existingAddress) {
        try {
          const relayClient = await getRelayClient(signer);

          // 打印 RelayClient 的所有属性以便调试
          console.log('[SafeService] RelayClient properties:', Object.keys(relayClient));

          // 尝试各种可能的属性名 - proxyWallet 是最重要的
          if ((relayClient as any).proxyWallet) {
            existingAddress = (relayClient as any).proxyWallet;
            console.log('[SafeService] Got proxyWallet from RelayClient:', existingAddress);
          } else if ((relayClient as any).proxyAddress) {
            existingAddress = (relayClient as any).proxyAddress;
            console.log('[SafeService] Got proxyAddress from RelayClient:', existingAddress);
          } else if ((relayClient as any).address) {
            existingAddress = (relayClient as any).address;
            console.log('[SafeService] Got address from RelayClient:', existingAddress);
          } else if ((relayClient as any).safeAddress) {
            existingAddress = (relayClient as any).safeAddress;
            console.log('[SafeService] Got safeAddress from RelayClient:', existingAddress);
          } else if ((relayClient as any).wallet?.address) {
            existingAddress = (relayClient as any).wallet.address;
            console.log('[SafeService] Got wallet.address from RelayClient:', existingAddress);
          } else if (typeof (relayClient as any).getProxyWallet === 'function') {
            existingAddress = await (relayClient as any).getProxyWallet();
            console.log('[SafeService] Got address via getProxyWallet():', existingAddress);
          } else if (typeof (relayClient as any).getAddress === 'function') {
            existingAddress = await (relayClient as any).getAddress();
            console.log('[SafeService] Got address via getAddress():', existingAddress);
          } else if (typeof (relayClient as any).getProxyAddress === 'function') {
            existingAddress = await (relayClient as any).getProxyAddress();
            console.log('[SafeService] Got address via getProxyAddress():', existingAddress);
          }

          // 如果还是没找到，检查 _proxyWallet 或其他下划线前缀的私有属性
          if (!existingAddress) {
            for (const key of Object.keys(relayClient)) {
              if (key.toLowerCase().includes('proxy') || key.toLowerCase().includes('wallet')) {
                const value = (relayClient as any)[key];
                if (typeof value === 'string' && value.startsWith('0x') && value.length === 42) {
                  existingAddress = value;
                  console.log(`[SafeService] Found address in ${key}:`, existingAddress);
                  break;
                }
              }
            }
          }
        } catch (queryErr) {
          console.warn('[SafeService] Failed to get address from RelayClient:', queryErr);
        }
      }

      // 4. 最后的后备：使用派生 SAFE 地址
      // 因为 deploy() 使用 SAFE-CREATE 类型，地址由 deriveSafe() 派生
      if (!existingAddress) {
        try {
          const eoaAddress = await signer.getAddress();
          existingAddress = deriveSafeAddressFromEOA(eoaAddress);
          console.log('[SafeService] Using derived SAFE address as fallback:', existingAddress);
        } catch (deriveErr) {
          console.error('[SafeService] Failed to derive SAFE address:', deriveErr);
        }
      }

      if (existingAddress) {
        console.log('[SafeService] ✅ Wallet already deployed at:', existingAddress);
        onProgress?.('交易钱包已存在');
        return {
          success: true,
          safeAddress: existingAddress,
        };
      }
    }

    return {
      success: false,
      error: error.message || 'Failed to deploy wallet',
    };
  }
}

/**
 * 创建所有需要的授权交易
 */
function createAllApprovalTxs(): any[] {
  const erc20Approve = new ethers5.utils.Interface([
    'function approve(address spender, uint256 amount) returns (bool)',
  ]);
  const erc1155SetApprovalForAll = new ethers5.utils.Interface([
    'function setApprovalForAll(address operator, bool approved)',
  ]);

  const safeTxns: any[] = [];

  // USDC approvals
  for (const spender of USDC_E_SPENDERS) {
    safeTxns.push({
      to: USDC_E_CONTRACT_ADDRESS,
      operation: 0, // OperationType.Call
      data: erc20Approve.encodeFunctionData('approve', [spender, MAX_UINT256]),
      value: '0',
    });
  }

  // ERC1155 approvals
  for (const operator of OUTCOME_TOKEN_SPENDERS) {
    safeTxns.push({
      to: CTF_CONTRACT_ADDRESS,
      operation: 0, // OperationType.Call
      data: erc1155SetApprovalForAll.encodeFunctionData('setApprovalForAll', [operator, true]),
      value: '0',
    });
  }

  return safeTxns;
}

/**
 * 设置 Token 授权 (Gasless)
 *
 * 授权 USDC 和 CTF Token 给 Polymarket 合约
 *
 * 注意：授权是在 RelayClient 管理的钱包上设置的（与 deploy 返回的地址相同）
 * walletAddress 参数主要用于日志和返回值
 *
 * @param signer - Ethers signer
 * @param walletAddress - 钱包地址（应使用 deploySafe 返回的地址）
 * @param onProgress - 进度回调
 */
export async function setTokenApprovals(
  signer: ethers5.Signer,
  walletAddress: string,
  onProgress?: (step: string) => void
): Promise<TradingSessionResult> {
  try {
    const relayClient = await getRelayClient(signer);

    onProgress?.('正在设置 Token 授权... (请在钱包中确认签名)');
    console.log('[SafeService] Setting token approvals for wallet:', walletAddress);

    // 创建授权交易
    const approvalTxs = createAllApprovalTxs();
    console.log('[SafeService] Created', approvalTxs.length, 'approval transactions');

    // 使用 relayClient.execute() 批量执行授权
    const response = await relayClient.execute(
      approvalTxs,
      'Set all token approvals for trading'
    );

    onProgress?.('等待授权确认...');
    const result = await response.wait();

    // 检查交易结果 - wait() 可能不会抛错但交易实际上失败了
    console.log('[SafeService] Approval transaction result:', result);

    // 检查各种可能的失败状态
    if (!result) {
      console.error('[SafeService] No result from wait()');
      return {
        success: false,
        error: 'Transaction confirmation failed - no result',
      };
    }

    // 检查交易状态
    const txStatus = result.status || result.state || result.transactionStatus;
    const txHash = result.txHash || result.transactionHash || result.hash;

    if (txStatus && (
      txStatus.toLowerCase().includes('fail') ||
      txStatus.toLowerCase().includes('revert') ||
      txStatus === 'STATE_FAILED' ||
      txStatus === 'FAILED'
    )) {
      console.error('[SafeService] Transaction failed onchain:', txHash);
      return {
        success: false,
        error: `Transaction failed onchain: ${txHash}`,
      };
    }

    console.log('[SafeService] ✅ Token approvals set for:', walletAddress);
    onProgress?.('Token 授权设置成功');

    return { success: true, safeAddress: walletAddress };
  } catch (error: any) {
    console.error('[SafeService] Failed to set approvals:', error);

    // 检查错误消息是否包含 "failed onchain"
    const errorMsg = error.message || error.toString() || '';
    if (errorMsg.toLowerCase().includes('failed onchain')) {
      return {
        success: false,
        error: 'Transaction failed onchain - the wallet address may be incorrect',
      };
    }

    return {
      success: false,
      error: error.message || 'Failed to set token approvals',
    };
  }
}

// ============================================
// USDC.e Transfer (for AI Credits Recharge)
// ============================================

export interface TransferResult {
  success: boolean;
  txHash?: string;
  error?: string;
}

/**
 * 从 Safe 钱包转账 USDC.e 到指定地址
 * 用于 AI Credits 充值
 *
 * @param signer - Ethers v5 signer
 * @param safeAddress - Safe 钱包地址
 * @param toAddress - 接收地址（平台收款地址）
 * @param amount - USDC 金额（例如 5 表示 $5）
 * @param onProgress - 进度回调
 */
export async function transferUSDCFromSafe(
  signer: ethers5.Signer,
  safeAddress: string,
  toAddress: string,
  amount: number,
  onProgress?: (step: string) => void
): Promise<TransferResult> {
  try {
    console.log('[SafeService] Initiating USDC.e transfer from Safe');
    console.log('[SafeService] From:', safeAddress);
    console.log('[SafeService] To:', toAddress);
    console.log('[SafeService] Amount:', amount, 'USDC');

    // 检查余额
    const balance = await getSafeUSDCBalance(safeAddress);
    if (balance < amount) {
      return {
        success: false,
        error: `余额不足: ${balance.toFixed(2)} USDC，需要 ${amount} USDC`,
      };
    }

    onProgress?.('正在准备转账交易...');

    // 获取 RelayClient
    const relayClient = await getRelayClient(signer);

    // 构建 ERC20 transfer 交易
    const erc20Interface = new ethers5.utils.Interface([
      'function transfer(address to, uint256 amount) returns (bool)',
    ]);

    // USDC has 6 decimals
    const amountInWei = ethers5.BigNumber.from(Math.floor(amount * 1e6));

    const transferTx = {
      to: USDC_E_CONTRACT_ADDRESS,
      operation: 0, // OperationType.Call
      data: erc20Interface.encodeFunctionData('transfer', [toAddress, amountInWei]),
      value: '0',
    };

    console.log('[SafeService] Transfer tx:', transferTx);

    onProgress?.('请在钱包中确认交易...');

    // 执行交易
    const response = await relayClient.execute(
      [transferTx],
      `Transfer ${amount} USDC.e to platform`
    );

    onProgress?.('等待交易确认...');

    // 等待交易完成
    const result = await response.wait();

    console.log('[SafeService] Transfer result:', result);

    // 如果 result 是 undefined 或 null，说明交易超时或失败
    if (!result) {
      console.error('[SafeService] Transaction wait returned undefined - relayer timeout');
      return {
        success: false,
        error: 'Transaction timeout - Polymarket relayer did not confirm the transaction. Please try again.',
      };
    }

    // 获取交易哈希
    // RelayClient 返回的结果可能有不同的格式
    let txHash: string | undefined;
    if (typeof result === 'string') {
      txHash = result;
    } else if (result && typeof result === 'object') {
      txHash = (result as any).txHash || (result as any).transactionHash || (result as any).hash;
    }

    if (!txHash) {
      // 如果没有直接返回 txHash，尝试从 response 获取
      txHash = (response as any).txHash || (response as any).hash;
    }

    // 验证 txHash 存在
    if (!txHash) {
      console.error('[SafeService] No transaction hash returned');
      return {
        success: false,
        error: 'No transaction hash returned from relayer',
      };
    }

    console.log('[SafeService] Transfer txHash:', txHash);
    onProgress?.('转账成功！');

    return {
      success: true,
      txHash,
    };
  } catch (error: any) {
    console.error('[SafeService] Transfer failed:', error);
    
    // 用户取消
    if (error.message?.includes('rejected') || error.message?.includes('cancel')) {
      return {
        success: false,
        error: '用户取消了交易',
      };
    }

    return {
      success: false,
      error: error.message || '转账失败',
    };
  }
}

// ============================================
// Backend API Calls
// ============================================

/**
 * 获取 Safe 信息 (从后端)
 */
export async function getSafeInfo(accessToken: string): Promise<SafeInfo | null> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/polymarket/trading/safe-info`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      console.error('[SafeService] Failed to get Safe info:', response.status);
      return null;
    }

    const data = await response.json();
    if (!data.success) {
      console.error('[SafeService] API error:', data.error);
      return null;
    }

    return data.data;
  } catch (error) {
    console.error('[SafeService] Get Safe info error:', error);
    return null;
  }
}

/**
 * 保存 Safe 地址到后端
 */
export async function saveSafeAddress(
  accessToken: string,
  safeAddress: string
): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/polymarket/trading/save-safe-address`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ safeAddress }),
    });

    if (!response.ok) {
      console.error('[SafeService] Failed to save Safe address:', response.status);
      return false;
    }

    const data = await response.json();
    return data.success;
  } catch (error) {
    console.error('[SafeService] Save Safe address error:', error);
    return false;
  }
}

/**
 * 通知后端 Safe 已部署
 */
export async function notifySafeDeployed(accessToken: string): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/polymarket/trading/update-safe-deployed`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      console.error('[SafeService] Failed to update Safe deployed:', response.status);
      return false;
    }

    const data = await response.json();
    return data.success;
  } catch (error) {
    console.error('[SafeService] Update Safe deployed error:', error);
    return false;
  }
}

/**
 * 通知后端授权已设置
 */
export async function notifyApprovalsSet(accessToken: string): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/polymarket/trading/update-safe-approvals`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      console.error('[SafeService] Failed to update Safe approvals:', response.status);
      return false;
    }

    const data = await response.json();
    return data.success;
  } catch (error) {
    console.error('[SafeService] Update Safe approvals error:', error);
    return false;
  }
}

// ============================================
// Complete Trading Session Initialization
// ============================================

/**
 * 初始化完整的 Trading Session
 *
 * 流程:
 * 1. 派生 Safe 地址
 * 2. 保存到后端
 * 3. 部署 Safe (如果需要)
 * 4. 设置 Token 授权 (如果需要)
 *
 * @param signer - Ethers signer
 * @param accessToken - 认证 token
 * @param onProgress - 进度回调
 */
export async function initializeTradingSession(
  signer: ethers5.Signer,
  accessToken: string,
  onProgress?: (step: string) => void
): Promise<TradingSessionResult> {
  try {
    // 获取 EOA 地址
    const eoaAddress = await signer.getAddress();
    console.log('[SafeService] Initializing trading session for EOA:', eoaAddress);

    onProgress?.('正在准备钱包...');

    // 使用 PROXY 类型时，始终通过 deploy() 获取正确的钱包地址
    // deploy() 会处理已部署的情况并返回现有地址
    onProgress?.('正在检查/部署交易钱包...');
    const deployResult = await deploySafe(signer, onProgress);

    if (!deployResult.success) {
      return deployResult;
    }

    const walletAddress = deployResult.safeAddress;
    if (!walletAddress) {
      return {
        success: false,
        error: '无法获取钱包地址',
      };
    }

    console.log('[SafeService] ✅ Wallet address:', walletAddress);

    // 检查后端存储的地址是否需要更新
    const safeInfo = await getSafeInfo(accessToken);
    if (!safeInfo?.safeAddress || safeInfo.safeAddress.toLowerCase() !== walletAddress.toLowerCase()) {
      console.log('[SafeService] Updating wallet address in backend...');
      console.log('[SafeService] Old address:', safeInfo?.safeAddress);
      console.log('[SafeService] New address:', walletAddress);

      onProgress?.('正在保存钱包地址...');
      await saveSafeAddress(accessToken, walletAddress);
      await notifySafeDeployed(accessToken);
    }

    // 3. 检查授权状态，如果已设置则跳过
    // 重新获取最新状态（如果刚部署，需要刷新）
    const latestSafeInfo = await getSafeInfo(accessToken);
    if (latestSafeInfo?.approvalsSet) {
      console.log('[SafeService] Token approvals already set, skipping');
      onProgress?.('授权已设置，跳过');
    } else {
      onProgress?.('正在设置 Token 授权... (请在钱包中确认签名)');
      const approvalResult = await setTokenApprovals(signer, walletAddress, onProgress);
      if (!approvalResult.success) {
        return approvalResult;
      }

      // 通知后端
      await notifyApprovalsSet(accessToken);
    }

    onProgress?.('Trading Session 初始化完成！');

    return {
      success: true,
      safeAddress: walletAddress,
    };
  } catch (error: any) {
    console.error('[SafeService] Initialize trading session failed:', error);
    return {
      success: false,
      error: error.message || 'Failed to initialize trading session',
    };
  }
}

// ============================================
// Get USDC Balance
// ============================================

/**
 * 获取 Safe 的 USDC.e 余额
 * 注意：Polymarket 只支持 USDC.e (bridged)，不支持 Native USDC
 */
export async function getSafeUSDCBalance(safeAddress: string): Promise<number> {
  try {
    const provider = new ethers.JsonRpcProvider(POLYGON_RPC);
    
    // Polymarket 只支持 USDC.e (bridged from Ethereum)
    const USDC_E_ADDRESS = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174';
    const USDC_ABI = ['function balanceOf(address) view returns (uint256)'];

    const usdcContract = new ethers.Contract(USDC_E_ADDRESS, USDC_ABI, provider);
    const balance = await usdcContract.balanceOf(safeAddress);

    const balanceNumber = Number(balance) / 1e6; // USDC has 6 decimals
    console.log('[SafeService] USDC.e balance:', balanceNumber);

    return balanceNumber;
  } catch (error) {
    console.error('[SafeService] Failed to get USDC.e balance:', error);
    return 0;
  }
}

// ============================================
// Order Execution
// ============================================

export interface OrderParams {
  tokenId: string;
  side: 'BUY' | 'SELL';
  type: 'MARKET' | 'LIMIT';
  amount: number;
  price?: number;
  timeInForce: 'FOK' | 'GTC' | 'GTD';
  // 当 API 无法获取价格时使用的回退价格 (来自 UI 显示的价格)
  fallbackPrice?: number;
}

export interface OrderResult {
  success: boolean;
  orderId?: string;
  errorMsg?: string;
  status?: string;
}

// Polymarket CLOB API constants
const CLOB_API_URL = 'https://clob.polymarket.com';

// EIP-712 Domain for Polymarket Orders
const ORDER_DOMAIN = {
  name: 'Polymarket CTF Exchange',
  version: '1',
  chainId: POLYGON_CHAIN_ID,
  verifyingContract: CTF_EXCHANGE_ADDRESS as `0x${string}`,
};

// EIP-712 Types for Order signing
const ORDER_TYPES = {
  Order: [
    { name: 'salt', type: 'uint256' },
    { name: 'maker', type: 'address' },
    { name: 'signer', type: 'address' },
    { name: 'taker', type: 'address' },
    { name: 'tokenId', type: 'uint256' },
    { name: 'makerAmount', type: 'uint256' },
    { name: 'takerAmount', type: 'uint256' },
    { name: 'expiration', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
    { name: 'feeRateBps', type: 'uint256' },
    { name: 'side', type: 'uint8' },
    { name: 'signatureType', type: 'uint8' },
  ],
};

// Signature types
const SIGNATURE_TYPE = {
  EOA: 0,
  POLY_PROXY: 1,
  POLY_GNOSIS_SAFE: 2,
};

/**
 * 生成随机 salt
 */
function generateSalt(): string {
  const randomBytes = new Uint8Array(32);
  crypto.getRandomValues(randomBytes);
  let hex = '0x';
  for (const byte of randomBytes) {
    hex += byte.toString(16).padStart(2, '0');
  }
  return BigInt(hex).toString();
}

/**
 * 生成订单 nonce
 */
function generateNonce(): string {
  return Date.now().toString();
}

/**
 * 转换金额为 USDC 单位 (6 decimals)
 */
function toUsdcUnits(amount: number): bigint {
  return BigInt(Math.round(amount * 1e6));
}

/**
 * 获取订单簿最佳价格
 */
async function getOrderBookPrice(tokenId: string, side: 'BUY' | 'SELL'): Promise<number> {
  try {
    const response = await fetch(`${CLOB_API_URL}/price?token_id=${tokenId}&side=${side}`);
    if (!response.ok) {
      throw new Error(`Failed to get price: ${response.status}`);
    }
    const data = await response.json();
    const price = parseFloat(data.price);
    // 验证价格有效性 (必须在 0.01 - 0.99 之间)
    if (isNaN(price) || price <= 0 || price >= 1) {
      throw new Error(`Invalid price from API: ${price}`);
    }
    return price;
  } catch (error) {
    console.error('[SafeService] Failed to get order book price:', error);
    throw error;
  }
}

/**
 * 获取市场中间价
 */
async function getMidpoint(tokenId: string): Promise<number> {
  try {
    const response = await fetch(`${CLOB_API_URL}/midpoint?token_id=${tokenId}`);
    if (!response.ok) {
      throw new Error(`Failed to get midpoint: ${response.status}`);
    }
    const data = await response.json();
    return parseFloat(data.mid);
  } catch (error) {
    console.error('[SafeService] Failed to get midpoint:', error);
    throw error;
  }
}

/**
 * 构建订单参数
 *
 * 对于 Safe 钱包:
 * - maker: Safe 地址 (资金持有者)
 * - signer: EOA 地址 (签名者)
 * - signatureType: 2 (POLY_GNOSIS_SAFE)
 */
interface OrderBuildParams {
  salt: string;
  maker: string;
  signer: string;
  taker: string;
  tokenId: string;
  makerAmount: string;
  takerAmount: string;
  expiration: string;
  nonce: string;
  feeRateBps: string;
  side: number;
  signatureType: number;
}

async function buildOrderParams(
  eoaAddress: string,
  safeAddress: string,
  tokenId: string,
  side: 'BUY' | 'SELL',
  amount: number,
  price: number
): Promise<OrderBuildParams> {
  // 验证输入参数
  if (!amount || amount <= 0 || !isFinite(amount)) {
    throw new Error(`Invalid amount: ${amount}`);
  }
  if (!price || price <= 0 || price >= 1 || !isFinite(price)) {
    throw new Error(`Invalid price: ${price}. Must be between 0 and 1.`);
  }

  const sideNum = side === 'BUY' ? 0 : 1;

  // 计算 makerAmount 和 takerAmount
  // 买单: makerAmount 是支付的 USDC, takerAmount 是获得的 shares
  // 卖单: makerAmount 是卖出的 shares, takerAmount 是获得的 USDC
  let makerAmount: string;
  let takerAmount: string;

  if (side === 'BUY') {
    // 买入: 支付 amount USDC, 获得 amount/price shares
    const shares = amount / price;
    if (!isFinite(shares) || shares <= 0) {
      throw new Error(`Invalid calculation: amount=${amount}, price=${price}, shares=${shares}`);
    }
    makerAmount = toUsdcUnits(amount).toString();
    takerAmount = toUsdcUnits(shares).toString();
  } else {
    // 卖出: 卖出 amount shares, 获得 amount * price USDC
    const usdcValue = amount * price;
    if (!isFinite(usdcValue) || usdcValue <= 0) {
      throw new Error(`Invalid calculation: amount=${amount}, price=${price}, usdcValue=${usdcValue}`);
    }
    makerAmount = toUsdcUnits(amount).toString();
    takerAmount = toUsdcUnits(usdcValue).toString();
  }

  console.log('[SafeService] Order amounts:', { makerAmount, takerAmount, price, amount });

  return {
    salt: generateSalt(),
    maker: safeAddress, // Safe 地址作为 maker (资金持有者)
    signer: eoaAddress, // EOA 地址作为 signer (签名者)
    taker: '0x0000000000000000000000000000000000000000',
    tokenId: tokenId,
    makerAmount: makerAmount,
    takerAmount: takerAmount,
    expiration: '0', // 不过期
    nonce: generateNonce(),
    feeRateBps: '0', // 0 费率
    side: sideNum,
    signatureType: SIGNATURE_TYPE.POLY_GNOSIS_SAFE, // Safe 钱包签名类型
  };
}

/**
 * 使用 ethers5 签名订单 (EIP-712)
 */
async function signOrderWithSigner(
  signer: ethers5.Signer,
  orderParams: OrderBuildParams
): Promise<string> {
  console.log('[SafeService] Signing order with EIP-712...');

  // 获取 _signTypedData 方法
  const typedSigner = signer as ethers5.Signer & {
    _signTypedData: (
      domain: object,
      types: Record<string, Array<{ name: string; type: string }>>,
      value: object
    ) => Promise<string>;
  };

  if (!typedSigner._signTypedData) {
    throw new Error('Signer does not support _signTypedData');
  }

  const message = {
    salt: orderParams.salt,
    maker: orderParams.maker,
    signer: orderParams.signer,
    taker: orderParams.taker,
    tokenId: orderParams.tokenId,
    makerAmount: orderParams.makerAmount,
    takerAmount: orderParams.takerAmount,
    expiration: orderParams.expiration,
    nonce: orderParams.nonce,
    feeRateBps: orderParams.feeRateBps,
    side: orderParams.side,
    signatureType: orderParams.signatureType,
  };

  const signature = await typedSigner._signTypedData(ORDER_DOMAIN, ORDER_TYPES, message);

  console.log('[SafeService] Order signed successfully');
  return signature;
}

/**
 * 提交订单到 CLOB (需要 L2 认证)
 */
async function submitOrderToCLOB(
  signedOrder: OrderBuildParams & { signature: string },
  timeInForce: 'FOK' | 'GTC' | 'GTD',
  eoaAddress: string,
  credentials: { apiKey: string; apiSecret: string; passphrase: string }
): Promise<OrderResult> {
  console.log('[SafeService] Submitting order to CLOB...');

  try {
    const requestPath = '/order';
    
    // 转换订单格式: side 从数字转为字符串 (API 需要 "BUY"/"SELL")
    const orderPayload = {
      salt: signedOrder.salt,
      maker: signedOrder.maker,
      signer: signedOrder.signer,
      taker: signedOrder.taker,
      tokenId: signedOrder.tokenId,
      makerAmount: signedOrder.makerAmount,
      takerAmount: signedOrder.takerAmount,
      expiration: signedOrder.expiration,
      nonce: signedOrder.nonce,
      feeRateBps: signedOrder.feeRateBps,
      side: signedOrder.side === 0 ? 'BUY' : 'SELL', // 转换为字符串
      signatureType: signedOrder.signatureType,
      signature: signedOrder.signature,
    };

    console.log('[SafeService] Order payload:', orderPayload);

    const body = JSON.stringify({
      order: orderPayload,
      orderType: timeInForce,
    });

    // 生成 L2 HMAC 认证头
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const method = 'POST';
    const message = timestamp + method + requestPath + body;
    
    console.log('[SafeService] L2 Auth debug:', {
      timestamp,
      method,
      requestPath,
      bodyLength: body.length,
      messagePreview: message.substring(0, 100) + '...',
    });
    
    // HMAC-SHA256 签名
    const encoder = new TextEncoder();
    const keyData = Uint8Array.from(atob(credentials.apiSecret), c => c.charCodeAt(0));
    const messageData = encoder.encode(message);
    
    const key = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    
    const signatureBuffer = await crypto.subtle.sign('HMAC', key, messageData);
    const hmacSignature = btoa(String.fromCharCode(...new Uint8Array(signatureBuffer)));

    const headers = {
      'Content-Type': 'application/json',
      'POLY_ADDRESS': eoaAddress,
      'POLY_SIGNATURE': hmacSignature,
      'POLY_TIMESTAMP': timestamp,
      'POLY_API_KEY': credentials.apiKey,
      'POLY_PASSPHRASE': credentials.passphrase,
    };

    console.log('[SafeService] L2 auth headers prepared:', {
      address: eoaAddress,
      apiKeyPrefix: credentials.apiKey.substring(0, 10) + '...',
      timestamp,
    });

    const response = await fetch(`${CLOB_API_URL}${requestPath}`, {
      method: 'POST',
      headers,
      body,
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('[SafeService] CLOB API error:', data);
      return {
        success: false,
        errorMsg: data.error || data.message || `HTTP ${response.status}`,
      };
    }

    console.log('[SafeService] Order submitted successfully:', data);
    return {
      success: true,
      orderId: data.orderID || data.id,
      status: data.status || 'SUBMITTED',
    };
  } catch (error: any) {
    console.error('[SafeService] Failed to submit order:', error);
    return {
      success: false,
      errorMsg: error.message || 'Network error',
    };
  }
}

// ============================================
// Auto Trade API (Backend Privy Session Signer)
// ============================================

/**
 * 调用后端自动交易 API
 *
 * 使用 Privy Session Signer 代签，无需用户签名弹窗
 *
 * @param accessToken - Privy access token
 * @param eoaAddress - 用户 EOA 地址
 * @param params - 订单参数
 * @returns OrderResult
 */
async function executeAutoOrder(
  accessToken: string,
  eoaAddress: string,
  params: {
    safeAddress: string;
    tokenId: string;
    side: 'BUY' | 'SELL';
    price: number;
    amount: number;
    timeInForce?: 'FOK' | 'GTC' | 'GTD';
    minOrderSize?: number;
    eventId?: string;
    eventTitle?: string;
  }
): Promise<OrderResult> {
  console.log('[SafeService] executeAutoOrder called');
  console.log('[SafeService] EOA:', eoaAddress);
  console.log('[SafeService] Params:', JSON.stringify(params));

  try {
    const response = await fetch(`${API_BASE_URL}/api/polymarket/auto-trade/execute`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
        'X-Wallet-Address': eoaAddress,
      },
      body: JSON.stringify({
        safeAddress: params.safeAddress,
        tokenId: params.tokenId,
        side: params.side,
        price: params.price,
        amount: params.amount,
        timeInForce: params.timeInForce || 'GTC',
        minOrderSize: params.minOrderSize || 5,
        eventId: params.eventId,
        eventTitle: params.eventTitle,
      }),
    });

    const data = await response.json();
    console.log('[SafeService] Auto-trade API response:', data);

    if (!response.ok || !data.success) {
      console.error('[SafeService] Auto-trade API error:', data);
      return {
        success: false,
        errorMsg: data.errorMsg || data.error || `HTTP ${response.status}`,
      };
    }

    console.log('[SafeService] Auto-trade order submitted successfully');
    console.log('[SafeService] Order ID:', data.orderId);
    console.log('[SafeService] Execution time:', data.executionTime, 'ms');

    return {
      success: true,
      orderId: data.orderId,
      status: data.status || 'SUBMITTED',
    };
  } catch (error: any) {
    console.error('[SafeService] executeAutoOrder error:', error);
    return {
      success: false,
      errorMsg: error.message || '网络错误，请检查连接后重试',
    };
  }
}

/**
 * 检查自动交易状态
 *
 * 检查用户是否满足自动交易的所有条件
 *
 * @param accessToken - Privy access token
 * @param eoaAddress - 用户 EOA 地址
 * @returns 自动交易状态信息
 */
export async function checkAutoTradeStatus(
  accessToken: string,
  eoaAddress: string
): Promise<{
  available: boolean;
  isDelegated: boolean;
  hasApiCredentials: boolean;
  hasSafeWallet: boolean;
  isDeployed: boolean;
  approvalsSet: boolean;
  safeAddress: string | null;
  message: string;
} | null> {
  console.log('[SafeService] Checking auto-trade status...');

  try {
    const response = await fetch(`${API_BASE_URL}/api/polymarket/auto-trade/status`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
        'X-Wallet-Address': eoaAddress,
      },
    });

    const data = await response.json();
    console.log('[SafeService] Auto-trade status:', data);

    if (!response.ok || !data.success) {
      console.error('[SafeService] Failed to check auto-trade status:', data);
      return null;
    }

    return data.data;
  } catch (error) {
    console.error('[SafeService] checkAutoTradeStatus error:', error);
    return null;
  }
}

/**
 * 使用前端 ClobClient + 用户钱包签名执行订单
 * 需要用户在钱包中确认签名（弹窗）
 *
 * @param signer - Ethers5 signer from user's wallet
 * @param accessToken - 认证 token (用于后端记录)
 * @param safeAddress - Safe 钱包地址
 * @param orderParams - 订单参数
 * @param minOrderSize - 最小订单大小 (股数)
 */
async function executeOrderWithFrontendSigning(
  signer: ethers5.Signer,
  accessToken: string,
  safeAddress: string,
  orderParams: OrderParams,
  minOrderSize: number = 5
): Promise<OrderResult> {
  console.log('[SafeService] Using frontend ClobClient signing (will show signature popup)...');

  try {
    // 1. 获取 EOA 地址
    const eoaAddress = await signer.getAddress();
    console.log('[SafeService] EOA address:', eoaAddress);
    console.log('[SafeService] Safe address:', safeAddress);

    // 2. 检查 tokenId 格式
    const isValidTokenIdFormat = /^\d{10,}$/.test(orderParams.tokenId);
    if (!isValidTokenIdFormat) {
      console.warn('[SafeService] Token ID format may be invalid:', orderParams.tokenId);
      throw new Error('Invalid token ID format. Please refresh the page to get updated market data.');
    }

    // 3. 获取 API 凭证
    // 优化：先检查缓存 → 再 derive → 最后 create
    console.log('[SafeService] Getting API credentials...');

    // 创建 Builder 配置 (用于订单签名归属)
    const builderConfig = createBuilderConfig();

    // 首先检查缓存（完全不需要签名）
    let credentials = getCachedApiCredentials(eoaAddress);

    if (!credentials) {
      // 没有缓存，需要派生/创建
      const tempClient = new ClobClient(
        CLOB_API_URL,
        POLYGON_CHAIN_ID,
        signer as unknown as ethers5.providers.JsonRpcSigner
      );

      // 优化签名次数：先 derive，后 create
      try {
        // 先尝试 derive（如果 API key 已存在，只需要1次签名）
        console.log('[SafeService] Trying deriveApiKey (1 signature)...');
        credentials = await tempClient.deriveApiKey();
        console.log('[SafeService] ✅ API key derived successfully');
      } catch (deriveError: unknown) {
        // derive 失败，可能是首次使用，尝试 create
        console.log('[SafeService] deriveApiKey failed, trying createApiKey...', deriveError);
        try {
          credentials = await tempClient.createApiKey();
          console.log('[SafeService] ✅ API key created successfully');
        } catch (createError: unknown) {
          console.error('[SafeService] Both derive and create failed:', createError);
          throw new Error('无法获取 API 凭证，请刷新页面重试');
        }
      }

      // 缓存凭证供后续交易使用
      setCachedApiCredentials(eoaAddress, credentials);
    }

    console.log('[SafeService] ✅ API credentials ready:', {
      hasKey: !!credentials.key,
      hasSecret: !!credentials.secret,
      hasPassphrase: !!credentials.passphrase
    });

    // 用凭证创建正式的 ClobClient (带 Safe 参数)
    const clobClient = new ClobClient(
      CLOB_API_URL,
      POLYGON_CHAIN_ID,
      signer as unknown as ethers5.providers.JsonRpcSigner,
      credentials, // API 凭证
      SIGNATURE_TYPE.POLY_GNOSIS_SAFE, // signatureType = 2 for Safe
      safeAddress, // funder = Safe 地址
      undefined,   // mandatory placeholder
      false,       // isPrivate
      builderConfig // Builder 配置
    );

    console.log('[SafeService] ClobClient created with credentials and Safe config');

    // 4. 确定执行价格
    let executionPrice: number;
    if (orderParams.type === 'LIMIT' && orderParams.price && orderParams.price > 0) {
      executionPrice = orderParams.price;
    } else {
      // 市价单使用回退价格（UI显示的价格）
      if (orderParams.fallbackPrice && orderParams.fallbackPrice > 0 && orderParams.fallbackPrice < 1) {
        executionPrice = orderParams.fallbackPrice;
        // 增加滑点保护
        if (orderParams.side === 'BUY') {
          executionPrice = Math.min(executionPrice * 1.05, 0.99);
        } else {
          executionPrice = Math.max(executionPrice * 0.95, 0.01);
        }
      } else {
        throw new Error('需要提供价格');
      }
    }
    console.log('[SafeService] Execution price:', executionPrice);

    // 4.1 验证价格范围
    // Polymarket 价格范围取决于市场的 tickSize：price >= tickSize && price <= (1 - tickSize)
    // 大多数市场 tickSize = 0.01，所以范围是 0.01 ~ 0.99 (1% ~ 99%)
    // ClobClient 会根据具体市场的 tickSize 做更精确验证
    const DEFAULT_TICK_SIZE = 0.01;
    const MIN_PRICE = DEFAULT_TICK_SIZE;       // 1%
    const MAX_PRICE = 1 - DEFAULT_TICK_SIZE;   // 99%

    if (executionPrice < MIN_PRICE) {
      return {
        success: false,
        errorMsg: `价格太低：当前 ${(executionPrice * 100).toFixed(2)}%，最低需要 ${(MIN_PRICE * 100).toFixed(0)}%。该市场当前价格过低，无法下单。`,
      };
    }

    if (executionPrice > MAX_PRICE) {
      return {
        success: false,
        errorMsg: `价格太高：当前 ${(executionPrice * 100).toFixed(2)}%，最高允许 ${(MAX_PRICE * 100).toFixed(0)}%。该市场当前价格过高，无法下单。`,
      };
    }

    // 5. 计算 size (shares 数量)
    const MIN_MARKETABLE_ORDER_USDC = 1.0;
    const ROUNDING_BUFFER = 1.02;

    let adjustedAmount = orderParams.amount;
    if (orderParams.side === 'BUY' && orderParams.amount <= MIN_MARKETABLE_ORDER_USDC * 1.05) {
      adjustedAmount = Math.max(orderParams.amount * ROUNDING_BUFFER, MIN_MARKETABLE_ORDER_USDC * ROUNDING_BUFFER);
      console.log('[SafeService] Adjusted amount for rounding buffer:', adjustedAmount.toFixed(4), '(original:', orderParams.amount, ')');
    }

    const size = orderParams.side === 'BUY'
      ? adjustedAmount / executionPrice
      : orderParams.amount;

    console.log('[SafeService] Order size (shares):', size);

    // 5.1 验证最小订单大小
    if (size < minOrderSize) {
      const minAmount = executionPrice * minOrderSize;
      return {
        success: false,
        errorMsg: `订单数量太小：当前 ${size.toFixed(2)} 股，最低需要 ${minOrderSize} 股。请将交易金额增加到至少 ${minAmount.toFixed(2)} USDC。`,
      };
    }

    // 6. 构建订单
    const order = {
      tokenID: orderParams.tokenId,
      price: executionPrice,
      size: size,
      side: orderParams.side === 'BUY' ? Side.BUY : Side.SELL,
      feeRateBps: 0,
      expiration: 0,
      taker: '0x0000000000000000000000000000000000000000',
    };

    console.log('[SafeService] Order to submit:', order);

    // 8. 确定订单类型
    const clobOrderType = orderParams.timeInForce === 'GTD'
      ? ClobOrderType.GTD
      : ClobOrderType.GTC;

    // 8.1 查询市场的 negRisk 状态
    let isNegRisk = false;
    try {
      isNegRisk = await clobClient.getNegRisk(orderParams.tokenId);
      console.log('[SafeService] Market negRisk status:', isNegRisk);
    } catch (negRiskError) {
      console.warn('[SafeService] Could not fetch negRisk status, defaulting to false:', negRiskError);
    }

    // 9. 提交订单 (使用官方客户端)
    console.log('[SafeService] Submitting order via ClobClient...');
    console.log('[SafeService] Order type:', clobOrderType, 'negRisk:', isNegRisk);

    let response: any;
    try {
      response = await clobClient.createAndPostOrder(
        order,
        { negRisk: isNegRisk },
        clobOrderType
      );
    } catch (clobError: any) {
      console.error('[SafeService] ClobClient error:', clobError);
      const rawError = clobError.message || clobError.error || 'Network error connecting to Polymarket';
      return {
        success: false,
        errorMsg: parseOrderError(rawError),
      };
    }

    console.log('[SafeService] Order response:', response);

    // 检查是否有错误
    if (response.error || response.errorMsg) {
      const rawError = response.error || response.errorMsg || 'Order submission failed';
      console.log('[SafeService] Order error (raw):', rawError);
      return {
        success: false,
        errorMsg: parseOrderError(rawError),
      };
    }

    // 检查是否有订单ID
    if (!response.orderID && !response.id) {
      return {
        success: false,
        errorMsg: '服务器未返回订单ID，可能是网络问题或订单被拒绝',
      };
    }

    const result: OrderResult = {
      success: true,
      orderId: response.orderID || response.id,
      status: response.status || 'SUBMITTED',
    };

    // 10. 记录交易到后端
    if (result.success) {
      try {
        await recordOrderToBackend(accessToken, {
          orderId: result.orderId,
          safeAddress,
          tokenId: orderParams.tokenId,
          side: orderParams.side,
          type: orderParams.type,
          amount: orderParams.amount,
          price: executionPrice,
          status: result.status,
        });
      } catch (recordError) {
        console.warn('[SafeService] Failed to record order to backend:', recordError);
      }
    }

    return result;
  } catch (error: any) {
    console.error('[SafeService] Execute order failed:', error);
    const rawError = error.message || '下单失败';
    return {
      success: false,
      errorMsg: parseOrderError(rawError),
    };
  }
}

/**
 * 开启/关闭自动交易委托 (Session Signer)
 *
 * @param accessToken - Privy access token
 * @param eoaAddress - 用户 EOA 地址
 * @param enabled - true = 开启, false = 关闭
 * @returns 更新后的委托状态
 */
export async function setAutoTradeDelegation(
  accessToken: string,
  eoaAddress: string,
  enabled: boolean
): Promise<{
  success: boolean;
  isDelegated?: boolean;
  message?: string;
  error?: string;
}> {
  console.log('[SafeService] Setting auto-trade delegation:', enabled);

  try {
    const response = await fetch(`${API_BASE_URL}/api/polymarket/auto-trade/delegation`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
        'X-Wallet-Address': eoaAddress,
      },
      body: JSON.stringify({ enabled }),
    });

    const data = await response.json();
    console.log('[SafeService] Set delegation response:', data);

    if (!response.ok || !data.success) {
      return {
        success: false,
        error: data.error || `HTTP ${response.status}`,
      };
    }

    return {
      success: true,
      isDelegated: data.data.isDelegated,
      message: data.data.message,
    };
  } catch (error: any) {
    console.error('[SafeService] setAutoTradeDelegation error:', error);
    return {
      success: false,
      error: error.message || '网络错误',
    };
  }
}

/**
 * 执行订单 (Gasless via Safe)
 *
 * 智能选择签名方式:
 * 1. 如果用户已开启 Session Signer (isDelegated) → 使用后端代签（无弹窗）
 * 2. 如果用户未开启 → 回退到前端 ClobClient 签名（弹窗）
 *
 * @param signer - Ethers5 signer from user's wallet
 * @param accessToken - 认证 token
 * @param safeAddress - Safe 钱包地址
 * @param orderParams - 订单参数
 * @param minOrderSize - 最小订单大小 (股数)
 */
export async function executeOrder(
  signer: ethers5.Signer,
  accessToken: string,
  safeAddress: string,
  orderParams: OrderParams,
  minOrderSize: number = 5
): Promise<OrderResult> {
  console.log('[SafeService] Execute order:', { safeAddress, orderParams });

  const eoaAddress = await signer.getAddress();

  // 0. 对于卖单，先检查链上 ERC1155 授权状态
  if (orderParams.side === 'SELL') {
    console.log('[SafeService] SELL order detected, checking on-chain approvals...');
    try {
      // 先获取市场的 negRisk 状态
      let isNegRisk = false;
      try {
        const tempClient = new ClobClient(CLOB_API_URL, POLYGON_CHAIN_ID);
        isNegRisk = await tempClient.getNegRisk(orderParams.tokenId);
        console.log('[SafeService] Market negRisk status:', isNegRisk);
      } catch (negRiskError) {
        console.warn('[SafeService] Could not fetch negRisk, assuming false:', negRiskError);
      }

      const approvalCheck = await checkOnChainApprovals(safeAddress, isNegRisk);

      if (!approvalCheck.hasApproval) {
        console.error('[SafeService] ❌ Missing ERC1155 approvals:', approvalCheck.missingApprovals);
        return {
          success: false,
          errorMsg: `APPROVAL_MISSING:Token 授权缺失 (${approvalCheck.missingApprovals.join(', ')})。请点击"重新授权"按钮修复后再试。`,
        };
      }
      console.log('[SafeService] ✅ On-chain approvals verified');
    } catch (approvalError) {
      console.warn('[SafeService] Failed to check approvals, proceeding anyway:', approvalError);
      // 检查失败时继续执行，让 API 返回具体错误
    }
  }

  // 1. 先检查是否开启了 Session Signer
  console.log('[SafeService] Checking auto-trade status...');
  const autoTradeStatus = await checkAutoTradeStatus(accessToken, eoaAddress);

  // 2. 如果开启了委托且满足所有条件，使用后端自动交易
  if (autoTradeStatus?.available && autoTradeStatus?.isDelegated) {
    console.log('[SafeService] ✅ Session Signer enabled, using backend auto-trade (no popup)...');

    // 确定执行价格
    let executionPrice: number;
    if (orderParams.type === 'LIMIT' && orderParams.price && orderParams.price > 0) {
      executionPrice = orderParams.price;
    } else if (orderParams.fallbackPrice && orderParams.fallbackPrice > 0 && orderParams.fallbackPrice < 1) {
      executionPrice = orderParams.fallbackPrice;
      // 滑点保护
      if (orderParams.side === 'BUY') {
        executionPrice = Math.min(executionPrice * 1.05, 0.99);
      } else {
        executionPrice = Math.max(executionPrice * 0.95, 0.01);
      }
    } else {
      return {
        success: false,
        errorMsg: '需要提供价格',
      };
    }

    const result = await executeAutoOrder(accessToken, eoaAddress, {
      safeAddress,
      tokenId: orderParams.tokenId,
      side: orderParams.side,
      price: executionPrice,
      amount: orderParams.amount,
      timeInForce: orderParams.timeInForce,
      minOrderSize,
    });

    return result;
  }

  // 3. 未开启委托，回退到前端签名方式
  console.log('[SafeService] ⚠️ Session Signer not enabled, falling back to frontend signing (popup required)...');
  if (autoTradeStatus) {
    console.log('[SafeService] Auto-trade status:', {
      available: autoTradeStatus.available,
      isDelegated: autoTradeStatus.isDelegated,
      hasApiCredentials: autoTradeStatus.hasApiCredentials,
      message: autoTradeStatus.message,
    });
  }

  return executeOrderWithFrontendSigning(signer, accessToken, safeAddress, orderParams, minOrderSize);
}

/**
 * 记录订单到后端 (用于交易历史)
 */
async function recordOrderToBackend(
  accessToken: string,
  orderInfo: {
    orderId?: string;
    safeAddress: string;
    tokenId: string;
    side: string;
    type: string;
    amount: number;
    price: number;
    status?: string;
  }
): Promise<void> {
  try {
    await fetch(`${API_BASE_URL}/api/polymarket/trading/record-order`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(orderInfo),
    });
  } catch (error) {
    console.error('[SafeService] Record order error:', error);
  }
}

/**
 * 获取订单状态
 */
export async function getOrderStatus(orderId: string): Promise<{
  status: string;
  filledAmount?: number;
  remainingAmount?: number;
} | null> {
  try {
    const response = await fetch(`${CLOB_API_URL}/order/${orderId}`);
    if (!response.ok) {
      return null;
    }
    return response.json();
  } catch (error) {
    console.error('[SafeService] Get order status error:', error);
    return null;
  }
}

/**
 * 取消订单
 */
export async function cancelOrder(
  signer: ethers5.Signer,
  orderId: string
): Promise<boolean> {
  try {
    // 取消订单可能需要签名验证
    // TODO: 实现取消订单逻辑
    console.log('[SafeService] Cancel order:', orderId);
    return false;
  } catch (error) {
    console.error('[SafeService] Cancel order error:', error);
    return false;
  }
}

// ============================================
// Scheduler Status API
// ============================================

export interface TraderSchedulerStatus {
  isScheduled: boolean;
  lastRunTime: number | null;
  nextRunTime: number | null;
  intervalMinutes: number;
  isActive: boolean;
  isDelegated: boolean;
  eventCount: number;
  recentAnalysis: Array<{
    id: string;
    eventId: string;
    eventTitle: string;
    action: string;
    confidence: number;
    createdAt: string;
  }>;
  recentTrades: Array<{
    id: string;
    eventTitle: string;
    side: string;
    amount: number;
    price: number;
    status: string;
    createdAt: string;
    executedAt: string | null;
  }>;
  message: string;
}

/**
 * 获取 Trader 的调度器状态
 * 
 * @param accessToken - 认证 token
 * @param traderId - Trader ID
 */
export async function getTraderSchedulerStatus(
  accessToken: string,
  traderId: string
): Promise<TraderSchedulerStatus | null> {
  console.log('[SafeService] Getting trader scheduler status for:', traderId);

  try {
    const response = await fetch(`${API_BASE_URL}/api/polymarket/auto-trade/scheduler/${traderId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
    });

    const data = await response.json();
    console.log('[SafeService] Scheduler status:', data);

    if (!response.ok || !data.success) {
      console.error('[SafeService] Failed to get scheduler status:', data);
      return null;
    }

    return data.data;
  } catch (error) {
    console.error('[SafeService] getTraderSchedulerStatus error:', error);
    return null;
  }
}

// ============================================
// Trader Trade History
// ============================================

export interface TraderTrade {
  id: string;
  eventId: string;
  eventTitle: string;
  tokenId: string;
  side: 'BUY' | 'SELL';
  amount: number;
  price: number;
  orderId: string | null;
  status: 'pending' | 'executed' | 'failed';
  errorMessage: string | null;
  signalSource: string;
  signalConfidence: number | null;
  createdAt: string;
  executedAt: string | null;
}

export interface TraderTradeHistoryResponse {
  trades: TraderTrade[];
  stats: {
    totalTrades: number;
    executedTrades: number;
    failedTrades: number;
    totalVolume: number;
  };
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}

/**
 * 获取 Trader 的交易历史
 * 
 * @param accessToken - 认证 token
 * @param traderId - Trader ID
 * @param limit - 每页数量
 * @param offset - 偏移量
 */
export async function getTraderTradeHistory(
  accessToken: string,
  traderId: string,
  limit: number = 20,
  offset: number = 0
): Promise<TraderTradeHistoryResponse | null> {
  console.log('[SafeService] Getting trader trade history for:', traderId);

  try {
    const response = await fetch(
      `${API_BASE_URL}/api/polymarket/traders/${traderId}/trade-history?limit=${limit}&offset=${offset}`, 
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
      }
    );

    const data = await response.json();

    if (!response.ok || !data.success) {
      console.error('[SafeService] Failed to get trade history:', data);
      return null;
    }

    return data.data;
  } catch (error) {
    console.error('[SafeService] getTraderTradeHistory error:', error);
    return null;
  }
}

// ============================================
// Trader Positions
// ============================================

export interface TraderPosition {
  tokenId: string;
  eventId: string;
  eventTitle: string;
  outcome: 'Yes' | 'No' | 'Unknown';  // YES/NO 方向
  size: number;
  avgPrice: number;
  cost: number;
  tradesCount: number;
  lastTrade: string;
  // 额外的市场数据（从前端补充）
  currentPrice?: number;
  value?: number;
  pnl?: number;
  pnlPercent?: number;
}

export interface TraderPositionsResponse {
  positions: TraderPosition[];
  summary: {
    totalPositions: number;
    totalCost: number;
    totalTrades: number;
  };
}

/**
 * 获取 Trader 的持仓
 * @param accessToken - 认证 token
 * @param traderId - Trader ID
 */
export async function getTraderPositions(
  accessToken: string,
  traderId: string
): Promise<TraderPositionsResponse | null> {
  console.log('[SafeService] Getting trader positions for:', traderId);

  try {
    const response = await fetch(
      `${API_BASE_URL}/api/polymarket/traders/${traderId}/positions`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
      }
    );

    const data = await response.json();

    if (!response.ok || !data.success) {
      console.error('[SafeService] Failed to get positions:', data);
      return null;
    }

    return data.data;
  } catch (error) {
    console.error('[SafeService] getTraderPositions error:', error);
    return null;
  }
}

// ============================================
// Price Cache (从后端缓存获取价格)
// ============================================

export interface CachedPrice {
  price: number;
  bid?: number;
  ask?: number;
  lastUpdate: number;
  isStale: boolean;
}

export interface PriceCacheStatus {
  isConnected: boolean;
  subscribedCount: number;
  cachedCount: number;
  reconnectAttempts: number;
}

/**
 * 批量获取缓存价格（极快，<10ms）
 * @param tokenIds - Token IDs 数组
 */
export async function getCachedPrices(
  tokenIds: string[]
): Promise<{ prices: Record<string, CachedPrice>; missing: string[] } | null> {
  if (!tokenIds || tokenIds.length === 0) return null;

  try {
    const response = await fetch(
      `${API_BASE_URL}/api/polymarket/prices/batch`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ tokenIds }),
      }
    );

    const data = await response.json();

    if (!response.ok || !data.success) {
      console.error('[SafeService] Failed to get cached prices:', data);
      return null;
    }

    return data.data;
  } catch (error) {
    console.error('[SafeService] getCachedPrices error:', error);
    return null;
  }
}

/**
 * 获取价格缓存状态
 */
export async function getPriceCacheStatus(): Promise<PriceCacheStatus | null> {
  try {
    const response = await fetch(
      `${API_BASE_URL}/api/polymarket/prices/status`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    const data = await response.json();

    if (!response.ok || !data.success) {
      console.error('[SafeService] Failed to get cache status:', data);
      return null;
    }

    return data.data;
  } catch (error) {
    console.error('[SafeService] getPriceCacheStatus error:', error);
    return null;
  }
}

/**
 * 订阅 token 价格（让后端开始追踪这些 token）
 * @param tokenIds - Token IDs 数组
 */
export async function subscribeToPrices(tokenIds: string[]): Promise<boolean> {
  if (!tokenIds || tokenIds.length === 0) return false;

  try {
    const response = await fetch(
      `${API_BASE_URL}/api/polymarket/prices/subscribe`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ tokenIds }),
      }
    );

    const data = await response.json();
    return response.ok && data.success;
  } catch (error) {
    console.error('[SafeService] subscribeToPrices error:', error);
    return false;
  }
}

// ============================================
// Market Cache (从后端缓存获取市场元数据)
// ============================================

export interface CachedMarket {
  id: string;
  conditionId: string;
  question: string;
  title: string;
  description: string;
  endDate: string;
  outcomes: string[];
  yesTokenId: string;
  noTokenId: string;
  orderMinSize: number;
  orderPriceMinTickSize: number;
  yesPrice: number;
  noPrice: number;
  volume: number;
  liquidity: number;
  active: boolean;
  closed: boolean;
  _cache?: {
    staticUpdated: number;
    dynamicUpdated: number;
    lastAccessed: number;
    staticExpired: boolean;
    dynamicExpired: boolean;
  };
}

export interface MarketCacheStatus {
  size: number;
  maxSize: number;
  expiredCount: number;
  closedCount: number;
  staticTTLMinutes: number;
  dynamicTTLMinutes: number;
}

/**
 * 批量获取市场数据（从后端缓存，极快 <10ms）
 * @param marketIds - Market IDs 数组
 */
export async function getCachedMarkets(
  marketIds: string[]
): Promise<{ markets: CachedMarket[]; missing: string[] } | null> {
  if (!marketIds || marketIds.length === 0) return null;

  try {
    const response = await fetch(
      `${API_BASE_URL}/api/polymarket/markets/batch`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ marketIds }),
      }
    );

    const data = await response.json();

    if (!response.ok || !data.success) {
      console.error('[SafeService] Failed to get cached markets:', data);
      return null;
    }

    return data.data;
  } catch (error) {
    console.error('[SafeService] getCachedMarkets error:', error);
    return null;
  }
}

/**
 * 获取单个市场数据（从后端缓存）
 * @param marketId - Market ID
 */
export async function getCachedMarket(marketId: string): Promise<CachedMarket | null> {
  if (!marketId) return null;

  try {
    const response = await fetch(
      `${API_BASE_URL}/api/polymarket/markets/${marketId}`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    const data = await response.json();

    if (!response.ok || !data.success) {
      console.error('[SafeService] Failed to get cached market:', data);
      return null;
    }

    return data.data;
  } catch (error) {
    console.error('[SafeService] getCachedMarket error:', error);
    return null;
  }
}

/**
 * 获取市场缓存状态
 */
export async function getMarketCacheStatus(): Promise<MarketCacheStatus | null> {
  try {
    const response = await fetch(
      `${API_BASE_URL}/api/polymarket/markets/cache/status`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    const data = await response.json();

    if (!response.ok || !data.success) {
      console.error('[SafeService] Failed to get market cache status:', data);
      return null;
    }

    return data.data;
  } catch (error) {
    console.error('[SafeService] getMarketCacheStatus error:', error);
    return null;
  }
}

// ============================================
// Portfolio Value
// ============================================

export interface PortfolioPosition {
  tokenId: string;
  eventId: string;
  eventTitle: string;
  outcome: 'Yes' | 'No' | 'Unknown';  // YES/NO 方向
  size: number;
  avgPrice: number;
  currentPrice: number;
  cost: number;
  currentValue: number;
  pnl: number;
  pnlPercent: number;
}

export interface TraderPortfolioValueResponse {
  initialCapital: number;
  currentValue: number;
  positionsValue: number;
  availableCash: number;
  totalPnL: number;
  totalPnLPercent: number;
  positions: PortfolioPosition[];
  totalSpent?: number;
  totalReceived?: number;
  lastUpdated: string;
}

/**
 * 获取 Trader 的实时投资组合价值
 * @param accessToken - 认证 token
 * @param traderId - Trader ID
 */
export async function getTraderPortfolioValue(
  accessToken: string,
  traderId: string
): Promise<TraderPortfolioValueResponse | null> {
  console.log('[SafeService] Getting trader portfolio value for:', traderId);

  try {
    const response = await fetch(
      `${API_BASE_URL}/api/polymarket/traders/${traderId}/portfolio-value`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
      }
    );

    const data = await response.json();

    if (!response.ok || !data.success) {
      console.error('[SafeService] Failed to get portfolio value:', data);
      return null;
    }

    return data.data;
  } catch (error) {
    console.error('[SafeService] getTraderPortfolioValue error:', error);
    return null;
  }
}

// ============================================
// Trader Stats
// ============================================

/**
 * Trader 性能统计数据
 */
export interface TraderStats {
  traderId: string;
  traderName: string;
  initialCapital: number;
  currentValue: number;

  // 交易统计
  totalTrades: number;
  buyTrades: number;
  sellTrades: number;

  // 盈亏统计
  totalPnL: number;
  realizedPnL: number;
  unrealizedPnL: number;
  totalPnLPercent: number;
  winRate: number;
  winCount: number;
  lossCount: number;

  // 收益统计
  averageReturn: number;
  bestTrade: number;
  worstTrade: number;

  // 风险统计
  maxDrawdown: number;
  maxDrawdownPercent: number;
  roi: number;

  // 时间统计
  firstTradeAt: string | null;
  lastTradeAt: string | null;
  tradingDays: number;
  avgTradesPerDay: number;

  calculatedAt: number;
}

/**
 * 获取 Trader 的性能统计
 * @param accessToken - 认证 token
 * @param traderId - Trader ID
 */
export async function getTraderStats(
  accessToken: string,
  traderId: string
): Promise<TraderStats | null> {
  console.log('[SafeService] Getting trader stats for:', traderId);

  try {
    const response = await fetch(
      `${API_BASE_URL}/api/polymarket/traders/${traderId}/stats`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (!response.ok) {
      console.error('[SafeService] getTraderStats failed:', response.status);
      return null;
    }

    const data = await response.json();
    if (!data.success) {
      console.error('[SafeService] getTraderStats error:', data.error);
      return null;
    }

    return data.data;
  } catch (error) {
    console.error('[SafeService] getTraderStats error:', error);
    return null;
  }
}

// ============================================
// Export
// ============================================

export { POLYGON_CHAIN_ID };

export default {
  // RelayClient
  clearRelayClient,

  // Safe operations (frontend)
  deriveSafeAddressFromEOA,
  deriveProxyAddressFromEOA, // 用于 RelayerTxType.PROXY
  checkSafeDeployed,
  deploySafe,
  setTokenApprovals,

  // USDC Transfer
  transferUSDCFromSafe,

  // Backend API
  getSafeInfo,
  saveSafeAddress,
  notifySafeDeployed,
  notifyApprovalsSet,

  // Balance
  getSafeUSDCBalance,

  // Order
  executeOrder,

  // Auto-trade / Session Signer
  checkAutoTradeStatus,
  setAutoTradeDelegation,

  // Scheduler status
  getTraderSchedulerStatus,

  // Trade history
  getTraderTradeHistory,

  // Positions
  getTraderPositions,

  // Portfolio Value
  getTraderPortfolioValue,

  // Trader Stats
  getTraderStats,

  // Price Cache
  getCachedPrices,
  getPriceCacheStatus,
  subscribeToPrices,

  // Market Cache
  getCachedMarkets,
  getCachedMarket,
  getMarketCacheStatus,

  // Complete flow
  initializeTradingSession,
};
