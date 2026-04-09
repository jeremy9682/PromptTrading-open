/**
 * Polymarket 订单服务
 *
 * 核心功能：订单构建、签名、提交
 */

import {
  OrderParams,
  OrderBuildParams,
  SignedOrder,
  OrderResponse,
  PolymarketApiCredentials,
  POLYMARKET_ORDER_DOMAIN,
  ORDER_TYPES,
  POLYMARKET_APIS,
  POLYMARKET_CONTRACTS,
} from '../../types/polymarketTrading';
import { buildL2Headers } from './polymarketAuthService';
import { estimateMarketOrder, getPrice } from './polymarketClobService';
import { toUsdcUnits } from './polymarketAllowanceService';

/**
 * 生成随机salt
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
 * 生成订单nonce
 */
function generateNonce(): string {
  return Date.now().toString();
}

/**
 * 构建限价单参数
 */
export function buildLimitOrderParams(
  maker: string,
  tokenId: string,
  side: 'BUY' | 'SELL',
  price: number,
  size: number,
  expiration: string = '0'
): OrderBuildParams {
  const sideNum = side === 'BUY' ? 0 : 1;

  // 计算makerAmount和takerAmount
  // 对于买单：makerAmount是要支付的USDC，takerAmount是要获得的shares
  // 对于卖单：makerAmount是要卖出的shares，takerAmount是要获得的USDC
  let makerAmount: string;
  let takerAmount: string;

  if (side === 'BUY') {
    // 买入：支付 price * size USDC，获得 size shares
    makerAmount = toUsdcUnits(price * size).toString();
    takerAmount = toUsdcUnits(size).toString();
  } else {
    // 卖出：卖出 size shares，获得 price * size USDC
    makerAmount = toUsdcUnits(size).toString();
    takerAmount = toUsdcUnits(price * size).toString();
  }

  return {
    salt: generateSalt(),
    maker: maker,
    signer: maker, // 对于EOA，signer和maker相同
    taker: '0x0000000000000000000000000000000000000000',
    tokenId: tokenId,
    makerAmount: makerAmount,
    takerAmount: takerAmount,
    expiration: expiration,
    nonce: generateNonce(),
    feeRateBps: '0', // 0.01%
    side: sideNum,
    signatureType: 0, // EOA签名
  };
}

/**
 * 构建市价单参数
 */
export async function buildMarketOrderParams(
  maker: string,
  tokenId: string,
  side: 'BUY' | 'SELL',
  amount: number
): Promise<OrderBuildParams> {
  // 获取当前市场价格
  const price = await getPrice(tokenId, side);

  // 估算执行结果
  const estimate = await estimateMarketOrder(tokenId, amount, side);

  // 市价单使用一个较高/较低的价格来确保成交
  const adjustedPrice = side === 'BUY' ? price * 1.05 : price * 0.95;

  // 计算size（shares数量）
  const size = side === 'BUY' ? estimate.totalShares : amount;

  return buildLimitOrderParams(maker, tokenId, side, adjustedPrice, size, '0');
}

/**
 * 签名订单
 * 使用EIP-712签名
 */
export async function signOrder(
  orderParams: OrderBuildParams,
  signTypedData: (
    domain: object,
    types: object,
    message: object,
    primaryType: string
  ) => Promise<string>
): Promise<SignedOrder> {
  // 构建EIP-712消息
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

  // 签名
  const signature = await signTypedData(
    POLYMARKET_ORDER_DOMAIN,
    ORDER_TYPES,
    message,
    'Order'
  );

  return {
    ...orderParams,
    signature,
  };
}

/**
 * 提交订单到CLOB
 */
export async function submitOrder(
  signedOrder: SignedOrder,
  walletAddress: string,
  credentials: PolymarketApiCredentials,
  orderType: 'GTC' | 'FOK' | 'GTD' = 'GTC'
): Promise<OrderResponse> {
  const requestPath = '/order';
  const body = JSON.stringify({
    order: signedOrder,
    orderType: orderType,
  });

  const headers = await buildL2Headers(
    walletAddress,
    credentials,
    'POST',
    requestPath,
    body
  );

  try {
    const response = await fetch(`${POLYMARKET_APIS.CLOB}${requestPath}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      body,
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        errorCode: data.error || 'UNKNOWN_ERROR',
        errorMsg: data.message || 'Failed to submit order',
      };
    }

    return {
      success: true,
      orderId: data.orderID,
      status: data.status || 'OPEN',
    };
  } catch (error) {
    return {
      success: false,
      errorCode: 'NETWORK_ERROR',
      errorMsg: error instanceof Error ? error.message : 'Network error',
    };
  }
}

/**
 * 取消订单
 */
export async function cancelOrder(
  orderId: string,
  walletAddress: string,
  credentials: PolymarketApiCredentials
): Promise<boolean> {
  const requestPath = `/order/${orderId}`;
  const headers = await buildL2Headers(
    walletAddress,
    credentials,
    'DELETE',
    requestPath
  );

  const response = await fetch(`${POLYMARKET_APIS.CLOB}${requestPath}`, {
    method: 'DELETE',
    headers: {
      ...headers,
    },
  });

  return response.ok;
}

/**
 * 取消所有订单
 */
export async function cancelAllOrders(
  walletAddress: string,
  credentials: PolymarketApiCredentials
): Promise<boolean> {
  const requestPath = '/orders';
  const headers = await buildL2Headers(
    walletAddress,
    credentials,
    'DELETE',
    requestPath
  );

  const response = await fetch(`${POLYMARKET_APIS.CLOB}${requestPath}`, {
    method: 'DELETE',
    headers: {
      ...headers,
    },
  });

  return response.ok;
}

/**
 * 获取用户订单列表
 */
export async function getOrders(
  walletAddress: string,
  credentials: PolymarketApiCredentials,
  status?: 'open' | 'matched' | 'cancelled'
): Promise<unknown[]> {
  let requestPath = '/orders';
  if (status) {
    requestPath += `?status=${status}`;
  }

  const headers = await buildL2Headers(
    walletAddress,
    credentials,
    'GET',
    requestPath
  );

  const response = await fetch(`${POLYMARKET_APIS.CLOB}${requestPath}`, {
    method: 'GET',
    headers: {
      ...headers,
    },
  });

  if (!response.ok) {
    throw new Error('Failed to get orders');
  }

  return response.json();
}

/**
 * 获取订单详情
 */
export async function getOrder(
  orderId: string,
  walletAddress: string,
  credentials: PolymarketApiCredentials
): Promise<unknown> {
  const requestPath = `/order/${orderId}`;
  const headers = await buildL2Headers(
    walletAddress,
    credentials,
    'GET',
    requestPath
  );

  const response = await fetch(`${POLYMARKET_APIS.CLOB}${requestPath}`, {
    method: 'GET',
    headers: {
      ...headers,
    },
  });

  if (!response.ok) {
    throw new Error('Failed to get order');
  }

  return response.json();
}

/**
 * 获取用户交易历史
 */
export async function getTrades(
  walletAddress: string,
  credentials: PolymarketApiCredentials,
  tokenId?: string
): Promise<unknown[]> {
  let requestPath = '/trades';
  if (tokenId) {
    requestPath += `?token_id=${tokenId}`;
  }

  const headers = await buildL2Headers(
    walletAddress,
    credentials,
    'GET',
    requestPath
  );

  const response = await fetch(`${POLYMARKET_APIS.CLOB}${requestPath}`, {
    method: 'GET',
    headers: {
      ...headers,
    },
  });

  if (!response.ok) {
    throw new Error('Failed to get trades');
  }

  return response.json();
}

// ============================================
// 高级封装函数
// ============================================

/**
 * 一键下单（包含完整流程）
 *
 * 1. 构建订单参数
 * 2. 签名订单
 * 3. 提交订单
 */
export async function placeOrder(
  params: OrderParams,
  walletAddress: string,
  credentials: PolymarketApiCredentials,
  signTypedData: (
    domain: object,
    types: object,
    message: object,
    primaryType: string
  ) => Promise<string>
): Promise<OrderResponse> {
  try {
    // 1. 构建订单参数
    let orderParams: OrderBuildParams;

    if (params.type === 'MARKET') {
      // 市价单
      orderParams = await buildMarketOrderParams(
        walletAddress,
        params.tokenId,
        params.side,
        params.amount
      );
    } else {
      // 限价单
      if (!params.price) {
        return {
          success: false,
          errorCode: 'MISSING_PRICE',
          errorMsg: 'Limit order requires price',
        };
      }

      // 计算size（从金额和价格）
      const size = params.amount / params.price;

      orderParams = buildLimitOrderParams(
        walletAddress,
        params.tokenId,
        params.side,
        params.price,
        size
      );
    }

    // 2. 签名订单
    const signedOrder = await signOrder(orderParams, signTypedData);

    // 3. 提交订单
    const result = await submitOrder(
      signedOrder,
      walletAddress,
      credentials,
      params.timeInForce
    );

    return result;
  } catch (error) {
    return {
      success: false,
      errorCode: 'ORDER_FAILED',
      errorMsg: error instanceof Error ? error.message : 'Order failed',
    };
  }
}

/**
 * 快速买入Yes
 */
export async function buyYes(
  tokenId: string,
  amount: number,
  walletAddress: string,
  credentials: PolymarketApiCredentials,
  signTypedData: (
    domain: object,
    types: object,
    message: object,
    primaryType: string
  ) => Promise<string>
): Promise<OrderResponse> {
  return placeOrder(
    {
      tokenId,
      side: 'BUY',
      type: 'MARKET',
      amount,
      timeInForce: 'FOK',
    },
    walletAddress,
    credentials,
    signTypedData
  );
}

/**
 * 快速买入No（等于卖出Yes）
 */
export async function buyNo(
  tokenId: string,
  amount: number,
  walletAddress: string,
  credentials: PolymarketApiCredentials,
  signTypedData: (
    domain: object,
    types: object,
    message: object,
    primaryType: string
  ) => Promise<string>
): Promise<OrderResponse> {
  // 买No实际上是在No token上买入
  // 需要获取No token的tokenId（通常是市场的另一个outcome）
  return placeOrder(
    {
      tokenId,
      side: 'SELL', // 卖出Yes = 买入No
      type: 'MARKET',
      amount,
      timeInForce: 'FOK',
    },
    walletAddress,
    credentials,
    signTypedData
  );
}
