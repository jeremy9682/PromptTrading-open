/**
 * Portfolio Service
 * 
 * 获取用户持仓、挂单、交易历史等数据
 * 
 * 重要架构说明：
 * - 持仓数据：使用 Data API（公开，无需任何凭证）
 * - 挂单数据：使用 CLOB API + 存储的 API 凭证（HMAC 签名，非钱包签名）
 * - 取消订单：使用 CLOB API + 存储的 API 凭证
 * 
 * API 凭证在首次交易时创建并存储，后续操作无需再次签名
 */

import { ClobClient } from '@polymarket/clob-client';
import { BuilderConfig } from '@polymarket/builder-signing-sdk';
import { getStoredApiKey } from './polymarketAuthService';
import { ethers as ethers5 } from 'ethers5';

// ============================================
// Constants
// ============================================

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3002';
const CLOB_API_URL = 'https://clob.polymarket.com';
const DATA_API_URL = 'https://data-api.polymarket.com';
const GAMMA_API_URL = 'https://gamma-api.polymarket.com';
const POLYGON_CHAIN_ID = 137;

// Signature type for Safe wallets
const SIGNATURE_TYPE = {
  EOA: 0,
  POLY_PROXY: 1,
  POLY_GNOSIS_SAFE: 2,
};

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

// ============================================
// Types
// ============================================

export interface Position {
  id: string;
  tokenId: string;
  conditionId: string;
  marketSlug: string;
  title: string;
  outcome: string;
  size: number;
  avgPrice: number;
  currentPrice: number;
  value: number;
  cost: number;
  pnl: number;
  pnlPercent: number;
  icon?: string;
}

export interface OpenOrder {
  orderId: string;
  tokenId: string;
  marketSlug: string;
  title: string;
  outcome: string;
  side: 'BUY' | 'SELL';
  price: number;
  size: number;
  sizeFilled: number;
  sizeRemaining: number;
  fillPercent: number;
  status: 'live' | 'matched' | 'cancelled';
  createdAt: string;
  orderType: string;
  icon?: string;
}

export interface TradeHistoryItem {
  id: string;
  orderId: string;
  tokenId: string;
  marketSlug: string;
  title: string;
  outcome: string;
  side: 'BUY' | 'SELL';
  price: number;
  size: number;
  total: number;
  status: 'matched' | 'cancelled' | 'expired' | 'executed' | 'failed';
  createdAt: string;
  transactionHash?: string;
  icon?: string;
}

export interface PortfolioSummary {
  totalValue: number;
  positionsValue: number;
  availableBalance: number;
  totalPnl: number;
  totalPnlPercent: number;
  positionsCount: number;
  openOrdersCount: number;
}

// ============================================
// 持仓查询 - Data API (公开，无需凭证)
// ============================================

/**
 * 获取用户持仓
 * 使用 Data API - 公开接口，无需任何认证
 */
export async function fetchPositions(safeAddress: string | null): Promise<Position[]> {
  // 检查 safeAddress 是否有效
  if (!safeAddress) {
    console.log('[PortfolioService] No safe address provided, skipping fetch');
    return [];
  }
  
  try {
    console.log('[PortfolioService] Fetching positions for:', safeAddress);
    
    // 尝试 Data API
    const response = await fetch(
      `${DATA_API_URL}/positions?user=${safeAddress.toLowerCase()}`
    );
    
    if (!response.ok) {
      // 回退到 Gamma API
      console.log('[PortfolioService] Data API failed, trying Gamma API...');
      const gammaResponse = await fetch(
        `${GAMMA_API_URL}/positions?user=${safeAddress.toLowerCase()}`
      );
      
      if (!gammaResponse.ok) {
        console.warn('[PortfolioService] Both APIs failed');
        return [];
      }
      
      const gammaData = await gammaResponse.json();
      return parsePositionsResponse(gammaData);
    }
    
    const data = await response.json();
    return parsePositionsResponse(data);
  } catch (error) {
    console.error('[PortfolioService] Failed to fetch positions:', error);
    return [];
  }
}

function parsePositionsResponse(data: any): Position[] {
  if (!data || !Array.isArray(data)) {
    return [];
  }

  return data.map((item: any) => {
    // Debug log to see actual API response structure
    console.log('[PortfolioService] Position item:', item);

    const size = parseFloat(item.size || item.shares || item.amount || '0') || 0;
    const avgPrice = parseFloat(item.avgPrice || item.average_price || item.avgCost || '0') || 0;
    const currentPrice = parseFloat(item.currentPrice || item.price || item.curPrice || avgPrice || '0') || 0;

    // 确保计算结果不是 NaN
    const value = isNaN(size * currentPrice) ? 0 : size * currentPrice;
    const cost = isNaN(size * avgPrice) ? 0 : size * avgPrice;
    const pnl = isNaN(value - cost) ? 0 : value - cost;
    const pnlPercent = cost > 0 && !isNaN(pnl / cost) ? (pnl / cost) * 100 : 0;

    // Data API returns 'asset' field for token ID
    const tokenId = item.tokenId || item.token_id || item.asset || item.assetId || item.asset_id || '';

    return {
      id: item.id || `${tokenId}-${item.conditionId || item.condition_id || ''}`,
      tokenId,
      conditionId: item.conditionId || item.condition_id || item.marketId || '',
      marketSlug: item.market || item.slug || item.marketSlug || '',
      title: item.title || item.question || item.market || item.eventTitle || 'Unknown Market',
      outcome: item.outcome || item.side || item.outcomeName || 'Unknown',
      size,
      avgPrice,
      currentPrice,
      value,
      cost,
      pnl,
      pnlPercent,
      icon: item.icon || item.image || undefined,
    };
  }).filter(p => p.size > 0); // 过滤掉无效持仓
}

// ============================================
// 挂单查询 - 使用 ClobClient（需要 signer）
// ============================================

/**
 * API 凭证类型（ClobClient 需要的格式）
 */
export interface ClobApiCredentials {
  key: string;
  secret: string;
  passphrase: string;
}

/**
 * 获取用户挂单
 * 使用 ClobClient.getOpenOrders()（像 Polymarket 官方示例一样）
 *
 * @param signer - ethers v5 signer
 * @param safeAddress - Safe 钱包地址
 * @param credentials - API 凭证（key, secret, passphrase）
 */
export async function fetchOpenOrders(
  signer: ethers5.Signer,
  safeAddress: string,
  credentials: ClobApiCredentials
): Promise<OpenOrder[]> {
  try {
    console.log('[PortfolioService] Fetching open orders with ClobClient...');

    // 创建 BuilderConfig（用于订单归属）
    const builderConfig = createBuilderConfig();

    // 创建 ClobClient（像 Polymarket 官方示例一样）
    const clobClient = new ClobClient(
      CLOB_API_URL,
      POLYGON_CHAIN_ID,
      signer as unknown as ethers5.providers.JsonRpcSigner,
      credentials,
      SIGNATURE_TYPE.POLY_GNOSIS_SAFE, // signatureType = 2 for Safe
      safeAddress, // funder = Safe 地址
      undefined,
      false,
      builderConfig
    );

    // 调用 getOpenOrders()
    const orders = await clobClient.getOpenOrders();

    console.log('[PortfolioService] Fetched', orders?.length || 0, 'open orders');

    if (!orders || !Array.isArray(orders)) {
      return [];
    }

    // 过滤出属于这个 Safe 地址的订单（状态为 LIVE）
    const filteredOrders = orders.filter((order: any) => {
      const makerMatch = order.maker_address?.toLowerCase() === safeAddress.toLowerCase();
      const statusMatch = order.status?.toUpperCase() === 'LIVE';
      return makerMatch && statusMatch;
    });

    return filteredOrders.map((order: any) => ({
      orderId: order.id || order.order_id || '',
      tokenId: order.asset_id || order.token_id || '',
      marketSlug: order.market || '',
      title: order.market || 'Unknown Market',
      outcome: order.outcome || 'Unknown',
      side: order.side?.toUpperCase() === 'BUY' ? 'BUY' : 'SELL',
      price: parseFloat(order.price) || 0,
      size: parseFloat(order.original_size || order.size) || 0,
      sizeFilled: parseFloat(order.size_matched || order.filled_size || 0),
      sizeRemaining: parseFloat(order.size || order.remaining_size || 0),
      fillPercent: order.size > 0 ? (parseFloat(order.size_matched || 0) / parseFloat(order.original_size || order.size || 1)) * 100 : 0,
      status: order.status || 'live',
      createdAt: order.created_at || order.timestamp || new Date().toISOString(),
      orderType: order.type || order.order_type || 'GTC',
    }));
  } catch (error) {
    // 静默处理错误，不影响用户体验
    console.log('[PortfolioService] Open orders fetch failed:', error instanceof Error ? error.message : 'unknown error');
    return [];
  }
}

// ============================================
// Activity - 从 Polymarket Data API 获取真实交易历史
// ============================================

export interface ActivityItem {
  id: string;
  type: 'trade' | 'order' | 'transfer' | 'claim' | 'redemption';
  action: 'buy' | 'sell' | 'place' | 'cancel' | 'transfer_in' | 'transfer_out' | 'claim' | 'redeem';
  tokenId: string;
  conditionId: string;
  title: string;
  outcome: string;
  side: 'BUY' | 'SELL';
  price: number;
  size: number;  // 股数
  total: number; // USDC
  timestamp: string;
  transactionHash?: string;
  status: 'confirmed' | 'pending';
}

/**
 * 获取用户活动记录（真实链上交易）
 * 使用 Polymarket Data API - 公开接口，无需认证
 */
export async function fetchActivity(
  safeAddress: string,
  limit: number = 50
): Promise<ActivityItem[]> {
  if (!safeAddress) {
    console.log('[PortfolioService] No safe address for activity fetch');
    return [];
  }

  try {
    console.log('[PortfolioService] Fetching activity for:', safeAddress);

    // Data API activity endpoint
    const response = await fetch(
      `${DATA_API_URL}/activity?user=${safeAddress.toLowerCase()}&limit=${limit}`
    );

    if (!response.ok) {
      console.warn('[PortfolioService] Activity API failed:', response.status);
      return [];
    }

    const data = await response.json();

    if (!Array.isArray(data)) {
      console.warn('[PortfolioService] Activity data is not an array');
      return [];
    }

    console.log('[PortfolioService] Fetched', data.length, 'activity items');

    return data.map((item: any) => {
      const side = item.side?.toUpperCase() === 'BUY' ? 'BUY' : 'SELL';
      const price = parseFloat(item.price || 0);
      const size = parseFloat(item.size || item.amount || 0);
      const total = size * price;

      return {
        id: item.id || item.transactionHash || `${item.asset}-${item.timestamp}`,
        type: item.type || 'trade',
        action: item.action || (side === 'BUY' ? 'buy' : 'sell'),
        tokenId: item.asset || item.tokenId || item.asset_id || '',
        conditionId: item.conditionId || item.condition_id || '',
        title: item.title || item.question || item.market || 'Unknown Market',
        outcome: item.outcome || item.outcomeName || 'Unknown',
        side,
        price,
        size,
        total,
        timestamp: item.timestamp || item.createdAt || new Date().toISOString(),
        transactionHash: item.transactionHash || item.txHash || undefined,
        status: item.status || 'confirmed',
      };
    });
  } catch (error) {
    console.error('[PortfolioService] Failed to fetch activity:', error);
    return [];
  }
}

// ============================================
// 交易历史 - 从后端获取（备用，如果 API 不可用）
// ============================================

/**
 * 获取交易历史
 * 从我们的后端 API 获取，无需 CLOB 凭证
 * @deprecated 优先使用 fetchActivity 获取链上数据
 */
export async function fetchTradeHistory(
  accessToken: string,
  walletAddress: string,
  limit: number = 50
): Promise<TradeHistoryItem[]> {
  try {
    console.log('[PortfolioService] Fetching trade history...');
    
    const response = await fetch(
      `${API_BASE_URL}/api/polymarket/trading/order-history?limit=${limit}`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'x-wallet-address': walletAddress,
        },
      }
    );
    
    if (!response.ok) {
      console.warn('[PortfolioService] Failed to fetch trade history:', response.status);
      return [];
    }
    
    const data = await response.json();
    
    if (!data.success || !data.data) {
      return [];
    }
    
    // Backend returns { orders, pagination } structure
    const orders = data.data.orders || data.data;
    if (!Array.isArray(orders)) {
      console.warn('[PortfolioService] Trade history data is not an array:', data.data);
      return [];
    }
    
    return orders.map((item: any) => {
      const side = item.side?.toUpperCase() === 'BUY' ? 'BUY' : 'SELL';
      const price = parseFloat(item.price) || 0;
      const rawAmount = parseFloat(item.amount) || 0;

      // 后端在记录订单时，BUY 的 amount 代表支付的 USDC，SELL 的 amount 代表卖出的股数
      const size = side === 'BUY' && price > 0 ? rawAmount / price : rawAmount; // 股数
      const total = side === 'BUY' ? rawAmount : rawAmount * price; // USDC

      return {
        id: item.id || item.orderId,
        orderId: item.orderId || item.order_id || '',
        tokenId: item.tokenId || item.token_id || '',
        marketSlug: item.market || '',
        title: item.eventTitle || item.title || 'Unknown Market',
        outcome: item.outcome || 'Unknown',
        side,
        price,
        size,
        total,
        status: item.status?.toLowerCase() || 'matched',
        createdAt: item.createdAt || item.created_at || new Date().toISOString(),
        transactionHash: item.transactionHash || item.txHash,
        icon: item.icon || undefined,
      };
    });
  } catch (error) {
    console.error('[PortfolioService] Failed to fetch trade history:', error);
    return [];
  }
}

// ============================================
// 取消订单 - 使用存储的 API 凭证
// ============================================

/**
 * 取消订单
 * 需要 signer 来签名取消请求
 */
export async function cancelOrder(
  signer: ethers5.Signer,
  safeAddress: string,
  credentials: ClobApiCredentials,
  orderId: string
): Promise<boolean> {
  try {
    console.log('[PortfolioService] Cancelling order:', orderId);

    // 创建 ClobClient（需要 signer）
    const builderConfig = createBuilderConfig();
    const clobClient = new ClobClient(
      CLOB_API_URL,
      POLYGON_CHAIN_ID,
      signer as unknown as ethers5.providers.JsonRpcSigner,
      credentials,
      SIGNATURE_TYPE.POLY_GNOSIS_SAFE,
      safeAddress,
      undefined,
      false,
      builderConfig
    );

    await clobClient.cancelOrder({ orderID: orderId });

    console.log('[PortfolioService] Order cancelled successfully');
    return true;
  } catch (error) {
    console.error('[PortfolioService] Failed to cancel order:', error);
    return false;
  }
}

/**
 * 批量取消订单
 * 需要 signer 来签名取消请求
 */
export async function cancelAllOrders(
  signer: ethers5.Signer,
  safeAddress: string,
  credentials: ClobApiCredentials
): Promise<boolean> {
  try {
    console.log('[PortfolioService] Cancelling all orders...');

    // 创建 ClobClient（需要 signer）
    const builderConfig = createBuilderConfig();
    const clobClient = new ClobClient(
      CLOB_API_URL,
      POLYGON_CHAIN_ID,
      signer as unknown as ethers5.providers.JsonRpcSigner,
      credentials,
      SIGNATURE_TYPE.POLY_GNOSIS_SAFE,
      safeAddress,
      undefined,
      false,
      builderConfig
    );

    await clobClient.cancelAll();

    console.log('[PortfolioService] All orders cancelled successfully');
    return true;
  } catch (error) {
    console.error('[PortfolioService] Failed to cancel all orders:', error);
    return false;
  }
}

// ============================================
// 工具函数
// ============================================

/**
 * 计算投资组合摘要
 */
export function calculatePortfolioSummary(
  positions: Position[],
  openOrders: OpenOrder[],
  availableBalance: number
): PortfolioSummary {
  const positionsValue = positions.reduce((sum, p) => sum + p.value, 0);
  const totalPnl = positions.reduce((sum, p) => sum + p.pnl, 0);
  const totalCost = positions.reduce((sum, p) => sum + p.cost, 0);
  const totalPnlPercent = totalCost > 0 ? (totalPnl / totalCost) * 100 : 0;
  
  return {
    totalValue: positionsValue + availableBalance,
    positionsValue,
    availableBalance,
    totalPnl,
    totalPnlPercent,
    positionsCount: positions.length,
    openOrdersCount: openOrders.length,
  };
}

/**
 * 检查是否有存储的 API 凭证
 * 用于判断是否能查看挂单
 */
export async function hasStoredCredentials(
  accessToken: string,
  walletAddress: string
): Promise<boolean> {
  const credentials = await getStoredApiKey(accessToken, walletAddress);
  return !!credentials;
}
