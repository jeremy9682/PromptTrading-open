/**
 * Polymarket EOA 直接交易服务
 *
 * 新架构特点：
 * - EOA 直接交易 (signature_type = 0)
 * - 无需 Safe 钱包
 * - 支持 Privy Delegated Actions 自动交易
 * - 简化的充值流程（直接充到 EOA）
 *
 * 参考: https://docs.polymarket.com/
 */

import { ClobClient, Side, OrderType } from '@polymarket/clob-client';
import { JsonRpcProvider, Web3Provider } from '@ethersproject/providers';
import { Contract } from '@ethersproject/contracts';
import { BigNumber } from '@ethersproject/bignumber';
import type { Signer } from '@ethersproject/abstract-signer';
import type { ExternalProvider } from '@ethersproject/providers';

// ============================================
// 常量定义
// ============================================

// Polygon 主网配置
export const POLYGON_CHAIN_ID = 137;
// Polygon 官方 RPC 端点
const POLYGON_RPC = 'https://polygon-rpc.com';

// CLOB API 地址
const CLOB_HOST = 'https://clob.polymarket.com';

// API Base URL
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3002';

// Polymarket 合约地址 (Polygon)
export const POLYMARKET_CONTRACTS = {
  // USDC.e on Polygon
  USDC: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
  // CTF Exchange
  CTF_EXCHANGE: '0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E',
  // Neg Risk CTF Exchange
  NEG_RISK_CTF_EXCHANGE: '0xC5d563A36AE78145C45a50134d48A1215220f80a',
  // Neg Risk Adapter
  NEG_RISK_ADAPTER: '0xd91E80cF2E7be2e162c6513ceD06f1dD0dA35296',
  // CTF Token (ERC-1155)
  CTF_TOKEN: '0x4D97DCd97eC945f40cF65F87097ACe5EA0476045',
} as const;

// MAX_UINT256 用于授权
const MAX_UINT256 = BigNumber.from('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff');

// ============================================
// 共享 Provider
// ============================================

let sharedProvider: JsonRpcProvider | null = null;

function getSharedProvider(): JsonRpcProvider {
  if (!sharedProvider) {
    sharedProvider = new JsonRpcProvider(POLYGON_RPC);
  }
  return sharedProvider;
}

// ============================================
// 类型定义
// ============================================

export interface ApiCredentials {
  apiKey: string;
  secret: string;
  passphrase: string;
}

export interface OrderParams {
  tokenId: string;
  side: 'BUY' | 'SELL';
  type: 'MARKET' | 'LIMIT';
  amount: number;
  price?: number;
  timeInForce?: 'FOK' | 'GTC' | 'GTD';
}

export interface OrderResult {
  success: boolean;
  orderId?: string;
  status?: string;
  errorCode?: string;
  errorMsg?: string;
}

export interface ApprovalStatus {
  usdc: {
    ctfExchange: boolean;
    negRiskCtfExchange: boolean;
  };
  ctfToken: {
    ctfExchange: boolean;
    negRiskCtfExchange: boolean;
  };
  allApproved: boolean;
}

// ============================================
// 缓存
// ============================================

// 授权状态缓存
const approvalCache: Map<string, { status: ApprovalStatus; timestamp: number }> = new Map();
const APPROVAL_CACHE_TTL = 60000; // 60秒

// ============================================
// Signer 工具函数
// ============================================

/**
 * 从 EIP-1193 Provider 创建 ethers v5 Signer
 */
export async function createSignerFromProvider(
  ethereumProvider: ExternalProvider
): Promise<Signer> {
  const web3Provider = new Web3Provider(ethereumProvider, POLYGON_CHAIN_ID);
  const signer = web3Provider.getSigner();
  const address = await signer.getAddress();
  console.log('[EOAService] Created signer for address:', address);
  return signer;
}

/**
 * 获取 EOA 地址
 */
export async function getEOAAddress(ethereumProvider: ExternalProvider): Promise<string> {
  const signer = await createSignerFromProvider(ethereumProvider);
  return signer.getAddress();
}

// ============================================
// 授权检查
// ============================================

/**
 * 检查 EOA 的所有授权状态
 */
export async function checkEOAApprovals(
  eoaAddress: string,
  skipCache = false
): Promise<ApprovalStatus> {
  // 检查缓存
  if (!skipCache) {
    const cached = approvalCache.get(eoaAddress.toLowerCase());
    if (cached && Date.now() - cached.timestamp < APPROVAL_CACHE_TTL) {
      console.log('[EOAService] Using cached approval status');
      return cached.status;
    }
  }

  try {
    console.log('[EOAService] Checking approvals on chain for:', eoaAddress);
    const provider = getSharedProvider();

    // ERC20 ABI
    const erc20Abi = ['function allowance(address owner, address spender) view returns (uint256)'];
    // ERC1155 ABI
    const erc1155Abi = ['function isApprovedForAll(address account, address operator) view returns (bool)'];

    const usdc = new Contract(POLYMARKET_CONTRACTS.USDC, erc20Abi, provider);
    const ctfToken = new Contract(POLYMARKET_CONTRACTS.CTF_TOKEN, erc1155Abi, provider);

    // 并行检查所有授权
    const [usdcCtf, usdcNegRisk, ctfExchange, ctfNegRisk] = await Promise.all([
      usdc.allowance(eoaAddress, POLYMARKET_CONTRACTS.CTF_EXCHANGE),
      usdc.allowance(eoaAddress, POLYMARKET_CONTRACTS.NEG_RISK_CTF_EXCHANGE),
      ctfToken.isApprovedForAll(eoaAddress, POLYMARKET_CONTRACTS.CTF_EXCHANGE),
      ctfToken.isApprovedForAll(eoaAddress, POLYMARKET_CONTRACTS.NEG_RISK_CTF_EXCHANGE),
    ]);

    const status: ApprovalStatus = {
      usdc: {
        ctfExchange: usdcCtf.gte(MAX_UINT256.div(2)),
        negRiskCtfExchange: usdcNegRisk.gte(MAX_UINT256.div(2)),
      },
      ctfToken: {
        ctfExchange: ctfExchange as boolean,
        negRiskCtfExchange: ctfNegRisk as boolean,
      },
      allApproved: false,
    };

    status.allApproved =
      status.usdc.ctfExchange &&
      status.usdc.negRiskCtfExchange &&
      status.ctfToken.ctfExchange &&
      status.ctfToken.negRiskCtfExchange;

    // 缓存结果
    approvalCache.set(eoaAddress.toLowerCase(), {
      status,
      timestamp: Date.now(),
    });

    console.log('[EOAService] Approval status:', status.allApproved ? 'All approved' : 'Needs approval');
    return status;
  } catch (error) {
    console.error('[EOAService] Failed to check approvals:', error);
    return {
      usdc: { ctfExchange: false, negRiskCtfExchange: false },
      ctfToken: { ctfExchange: false, negRiskCtfExchange: false },
      allApproved: false,
    };
  }
}

// ============================================
// 授权执行
// ============================================

/**
 * 执行所有必要的授权
 * 需要用户签名，需要 Gas (MATIC)
 */
export async function approveAllContracts(
  ethereumProvider: ExternalProvider,
  onProgress?: (step: string) => void
): Promise<{ success: boolean; error?: string }> {
  try {
    const signer = await createSignerFromProvider(ethereumProvider);
    const eoaAddress = await signer.getAddress();

    // 检查当前授权状态
    const currentApprovals = await checkEOAApprovals(eoaAddress, true);

    if (currentApprovals.allApproved) {
      console.log('[EOAService] All approvals already set');
      return { success: true };
    }

    // ERC20 approve ABI
    const erc20Abi = ['function approve(address spender, uint256 amount) returns (bool)'];
    // ERC1155 setApprovalForAll ABI
    const erc1155Abi = ['function setApprovalForAll(address operator, bool approved)'];

    const usdc = new Contract(POLYMARKET_CONTRACTS.USDC, erc20Abi, signer);
    const ctfToken = new Contract(POLYMARKET_CONTRACTS.CTF_TOKEN, erc1155Abi, signer);

    const txPromises: Promise<any>[] = [];

    // USDC 授权
    if (!currentApprovals.usdc.ctfExchange) {
      onProgress?.('Approving USDC for CTF Exchange...');
      console.log('[EOAService] Approving USDC for CTF Exchange');
      txPromises.push(
        usdc.approve(POLYMARKET_CONTRACTS.CTF_EXCHANGE, MAX_UINT256).then((tx: any) => tx.wait())
      );
    }

    if (!currentApprovals.usdc.negRiskCtfExchange) {
      onProgress?.('Approving USDC for Neg Risk Exchange...');
      console.log('[EOAService] Approving USDC for Neg Risk Exchange');
      txPromises.push(
        usdc.approve(POLYMARKET_CONTRACTS.NEG_RISK_CTF_EXCHANGE, MAX_UINT256).then((tx: any) => tx.wait())
      );
    }

    // CTF Token 授权
    if (!currentApprovals.ctfToken.ctfExchange) {
      onProgress?.('Approving CTF Token for CTF Exchange...');
      console.log('[EOAService] Approving CTF Token for CTF Exchange');
      txPromises.push(
        ctfToken.setApprovalForAll(POLYMARKET_CONTRACTS.CTF_EXCHANGE, true).then((tx: any) => tx.wait())
      );
    }

    if (!currentApprovals.ctfToken.negRiskCtfExchange) {
      onProgress?.('Approving CTF Token for Neg Risk Exchange...');
      console.log('[EOAService] Approving CTF Token for Neg Risk Exchange');
      txPromises.push(
        ctfToken.setApprovalForAll(POLYMARKET_CONTRACTS.NEG_RISK_CTF_EXCHANGE, true).then((tx: any) => tx.wait())
      );
    }

    // 等待所有授权完成
    onProgress?.('Waiting for confirmations...');
    await Promise.all(txPromises);

    // 清除缓存
    approvalCache.delete(eoaAddress.toLowerCase());

    console.log('[EOAService] All approvals completed');
    return { success: true };
  } catch (error) {
    console.error('[EOAService] Approval failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Approval failed',
    };
  }
}

// ============================================
// API Key 管理
// ============================================

/**
 * 派生 API Key (使用 EOA 签名)
 */
export async function deriveApiCredentials(
  ethereumProvider: ExternalProvider
): Promise<ApiCredentials> {
  const signer = await createSignerFromProvider(ethereumProvider);
  const eoaAddress = await signer.getAddress();

  const timestamp = Math.floor(Date.now() / 1000);
  const nonce = 0;

  // ClobAuth EIP-712 签名
  const domain = {
    name: 'ClobAuthDomain',
    version: '1',
    chainId: POLYGON_CHAIN_ID,
  };

  const types = {
    ClobAuth: [
      { name: 'address', type: 'address' },
      { name: 'timestamp', type: 'string' },
      { name: 'nonce', type: 'uint256' },
      { name: 'message', type: 'string' },
    ],
  };

  const message = {
    address: eoaAddress, // 使用 EOA 地址
    timestamp: timestamp.toString(),
    nonce: nonce,
    message: 'This message attests that I control the given wallet',
  };

  console.log('[EOAService] Signing API key derivation for:', eoaAddress);

  // 使用 signer 签名 EIP-712
  const signature = await (signer as any)._signTypedData(domain, types, message);

  // 尝试派生已有的 API Key
  const response = await fetch(`${CLOB_HOST}/auth/derive-api-key`, {
    method: 'GET',
    headers: {
      'POLY_ADDRESS': eoaAddress,
      'POLY_SIGNATURE': signature,
      'POLY_TIMESTAMP': timestamp.toString(),
      'POLY_NONCE': nonce.toString(),
    },
  });

  if (!response.ok) {
    // 创建新的 API Key
    console.log('[EOAService] Creating new API key...');
    const createResponse = await fetch(`${CLOB_HOST}/auth/api-key`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'POLY_ADDRESS': eoaAddress,
        'POLY_SIGNATURE': signature,
        'POLY_TIMESTAMP': timestamp.toString(),
        'POLY_NONCE': nonce.toString(),
      },
    });

    if (!createResponse.ok) {
      const error = await createResponse.text();
      throw new Error(`Failed to create API key: ${error}`);
    }

    const data = await createResponse.json();
    return {
      apiKey: data.apiKey,
      secret: data.secret,
      passphrase: data.passphrase,
    };
  }

  const data = await response.json();
  return {
    apiKey: data.apiKey,
    secret: data.secret,
    passphrase: data.passphrase,
  };
}

/**
 * 从后端获取存储的 API 凭证
 */
export async function getStoredCredentials(
  accessToken: string,
  walletAddress: string
): Promise<ApiCredentials | null> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/polymarket/trading/api-key`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'X-Wallet-Address': walletAddress,
      },
    });

    if (!response.ok) return null;

    const data = await response.json();
    if (data.success && data.data) {
      return {
        apiKey: data.data.apiKey,
        secret: data.data.apiSecret,
        passphrase: data.data.passphrase,
      };
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * 保存 API 凭证到后端
 */
export async function saveCredentials(
  accessToken: string,
  walletAddress: string,
  credentials: ApiCredentials
): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/polymarket/trading/api-key`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'X-Wallet-Address': walletAddress,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        apiKey: credentials.apiKey,
        apiSecret: credentials.secret,
        passphrase: credentials.passphrase,
      }),
    });

    return response.ok;
  } catch {
    return false;
  }
}

/**
 * 获取或创建 API 凭证
 */
export async function getOrCreateCredentials(
  ethereumProvider: ExternalProvider,
  accessToken: string
): Promise<ApiCredentials> {
  const eoaAddress = await getEOAAddress(ethereumProvider);

  // 1. 先从后端获取
  const stored = await getStoredCredentials(accessToken, eoaAddress);
  if (stored) {
    console.log('[EOAService] Using stored API credentials');
    return stored;
  }

  // 2. 派生新凭证
  console.log('[EOAService] Deriving new API credentials...');
  const credentials = await deriveApiCredentials(ethereumProvider);

  // 3. 保存到后端
  await saveCredentials(accessToken, eoaAddress, credentials);

  return credentials;
}

// ============================================
// ClobClient 工厂
// ============================================

/**
 * 创建 ClobClient (EOA 模式)
 * signature_type = 0 (EOA 直接签名)
 */
export async function createClobClient(
  ethereumProvider: ExternalProvider,
  credentials: ApiCredentials
): Promise<ClobClient> {
  const signer = await createSignerFromProvider(ethereumProvider);
  const eoaAddress = await signer.getAddress();

  console.log('[EOAService] Creating ClobClient with EOA:', eoaAddress);

  // 创建 ClobClient
  // signature_type = 0 (EOA direct signing)
  // funder = EOA 地址
  const client = new ClobClient(
    CLOB_HOST,
    POLYGON_CHAIN_ID,
    signer,
    credentials,
    0, // SignatureType.EOA for direct signing
    eoaAddress // funder = EOA 地址
  );

  return client;
}

// ============================================
// 订单操作
// ============================================

/**
 * 下单
 */
export async function placeOrder(
  client: ClobClient,
  params: OrderParams
): Promise<OrderResult> {
  try {
    const side = params.side === 'BUY' ? Side.BUY : Side.SELL;
    const price = params.price || 0.5;
    const size = params.side === 'BUY' ? params.amount / price : params.amount;

    const order = {
      tokenID: params.tokenId,
      price: price,
      size: size,
      side: side,
      feeRateBps: 0,
      expiration: 0,
      taker: '0x0000000000000000000000000000000000000000',
    };

    let orderType: OrderType;
    switch (params.timeInForce) {
      case 'FOK':
        orderType = OrderType.FOK;
        break;
      case 'GTD':
        orderType = OrderType.GTD;
        break;
      case 'GTC':
      default:
        orderType = OrderType.GTC;
    }

    console.log('[EOAService] Placing order:', { tokenId: params.tokenId, side: params.side, amount: params.amount });

    const response = await client.createAndPostOrder(
      order,
      { negRisk: false },
      orderType
    );

    return {
      success: true,
      orderId: response.orderID,
      status: 'OPEN',
    };
  } catch (error) {
    console.error('[EOAService] Place order error:', error);
    return {
      success: false,
      errorCode: 'ORDER_FAILED',
      errorMsg: error instanceof Error ? error.message : 'Order failed',
    };
  }
}

/**
 * 取消订单
 */
export async function cancelOrder(
  client: ClobClient,
  orderId: string
): Promise<boolean> {
  try {
    await client.cancelOrder({ orderID: orderId });
    return true;
  } catch (error) {
    console.error('[EOAService] Cancel order error:', error);
    return false;
  }
}

// ============================================
// 市场数据
// ============================================

/**
 * 获取订单簿
 */
export async function getOrderBook(
  tokenId: string
): Promise<{
  bids: Array<{ price: string; size: string }>;
  asks: Array<{ price: string; size: string }>;
}> {
  try {
    const response = await fetch(`${CLOB_HOST}/book?token_id=${tokenId}`);
    if (!response.ok) throw new Error('Failed to fetch order book');
    return response.json();
  } catch (error) {
    console.error('[EOAService] Get order book error:', error);
    return { bids: [], asks: [] };
  }
}

/**
 * 获取最优价格
 */
export async function getBestPrices(tokenId: string): Promise<{
  bestBid: number;
  bestAsk: number;
  midPrice: number;
}> {
  const orderBook = await getOrderBook(tokenId);

  const bestBid = orderBook.bids.length > 0 ? parseFloat(orderBook.bids[0].price) : 0;
  const bestAsk = orderBook.asks.length > 0 ? parseFloat(orderBook.asks[0].price) : 1;
  const midPrice = (bestBid + bestAsk) / 2;

  return { bestBid, bestAsk, midPrice };
}

// ============================================
// 完整交易流程
// ============================================

/**
 * 执行下单（完整流程）
 */
export async function executeOrder(
  ethereumProvider: ExternalProvider,
  accessToken: string,
  orderParams: OrderParams
): Promise<OrderResult> {
  try {
    // 1. 获取 EOA 地址
    const eoaAddress = await getEOAAddress(ethereumProvider);

    // 2. 检查授权
    const approvals = await checkEOAApprovals(eoaAddress);
    if (!approvals.allApproved) {
      return {
        success: false,
        errorCode: 'NOT_APPROVED',
        errorMsg: 'Please approve contracts first',
      };
    }

    // 3. 获取凭证
    const credentials = await getOrCreateCredentials(ethereumProvider, accessToken);

    // 4. 创建 ClobClient
    const client = await createClobClient(ethereumProvider, credentials);

    // 5. 下单
    return placeOrder(client, orderParams);
  } catch (error) {
    console.error('[EOAService] Execute order error:', error);
    return {
      success: false,
      errorCode: 'EXECUTE_FAILED',
      errorMsg: error instanceof Error ? error.message : 'Execute failed',
    };
  }
}

// ============================================
// 余额查询
// ============================================

/**
 * 获取 USDC 余额
 */
export async function getUSDCBalance(address: string): Promise<number> {
  try {
    const provider = getSharedProvider();
    const erc20Abi = ['function balanceOf(address account) view returns (uint256)'];
    const usdc = new Contract(POLYMARKET_CONTRACTS.USDC, erc20Abi, provider);
    const balance = await usdc.balanceOf(address);
    // USDC has 6 decimals
    return parseFloat(balance.toString()) / 1e6;
  } catch (error) {
    console.error('[EOAService] Failed to get USDC balance:', error);
    return 0;
  }
}

/**
 * 获取 MATIC 余额（用于 Gas）
 */
export async function getMATICBalance(address: string): Promise<number> {
  try {
    const provider = getSharedProvider();
    const balance = await provider.getBalance(address);
    // MATIC has 18 decimals
    return parseFloat(balance.toString()) / 1e18;
  } catch (error) {
    console.error('[EOAService] Failed to get MATIC balance:', error);
    return 0;
  }
}

// ============================================
// 缓存管理
// ============================================

/**
 * 清除所有缓存
 */
export function clearAllCaches(): void {
  approvalCache.clear();
  console.log('[EOAService] All caches cleared');
}
