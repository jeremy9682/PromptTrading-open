/**
 * Polymarket CLOB订单簿服务
 *
 * 用于获取订单簿深度和计算最佳价格
 */

import {
  OrderBook,
  OrderBookLevel,
  POLYMARKET_APIS,
} from '../../types/polymarketTrading';

/**
 * 获取订单簿
 */
export async function getOrderBook(tokenId: string): Promise<OrderBook> {
  const response = await fetch(`${POLYMARKET_APIS.CLOB}/book?token_id=${tokenId}`);

  if (!response.ok) {
    throw new Error(`Failed to get order book: ${response.status}`);
  }

  return response.json();
}

/**
 * 获取市场中间价
 */
export async function getMidpoint(tokenId: string): Promise<number> {
  const response = await fetch(`${POLYMARKET_APIS.CLOB}/midpoint?token_id=${tokenId}`);

  if (!response.ok) {
    throw new Error(`Failed to get midpoint: ${response.status}`);
  }

  const data = await response.json();
  return parseFloat(data.mid);
}

/**
 * 获取最佳买卖价
 */
export async function getPrice(tokenId: string, side: 'BUY' | 'SELL'): Promise<number> {
  const response = await fetch(
    `${POLYMARKET_APIS.CLOB}/price?token_id=${tokenId}&side=${side}`
  );

  if (!response.ok) {
    throw new Error(`Failed to get price: ${response.status}`);
  }

  const data = await response.json();
  return parseFloat(data.price);
}

/**
 * 获取买卖价差
 */
export async function getSpread(tokenId: string): Promise<number> {
  const response = await fetch(`${POLYMARKET_APIS.CLOB}/spread?token_id=${tokenId}`);

  if (!response.ok) {
    throw new Error(`Failed to get spread: ${response.status}`);
  }

  const data = await response.json();
  return parseFloat(data.spread);
}

/**
 * 获取最后成交价
 */
export async function getLastTradePrice(tokenId: string): Promise<number> {
  const response = await fetch(`${POLYMARKET_APIS.CLOB}/last-trade-price?token_id=${tokenId}`);

  if (!response.ok) {
    throw new Error(`Failed to get last trade price: ${response.status}`);
  }

  const data = await response.json();
  return parseFloat(data.price);
}

/**
 * 计算市价单的平均执行价格（考虑滑点）
 *
 * @param orderBook 订单簿
 * @param amount USDC金额
 * @param side 买卖方向
 * @returns 平均执行价格和预计获得的shares
 */
export function calculateMarketOrderPrice(
  orderBook: OrderBook,
  amount: number,
  side: 'BUY' | 'SELL'
): {
  avgPrice: number;
  totalShares: number;
  slippage: number;
  priceImpact: number;
  levels: Array<{ price: number; size: number; filled: number }>;
} {
  // 买入时匹配卖单（asks），卖出时匹配买单（bids）
  const levels = side === 'BUY' ? orderBook.asks : orderBook.bids;

  if (!levels || levels.length === 0) {
    throw new Error('No liquidity available');
  }

  let remainingAmount = amount;
  let totalShares = 0;
  let totalCost = 0;
  const filledLevels: Array<{ price: number; size: number; filled: number }> = [];

  // 获取最佳价格（用于计算滑点）
  const bestPrice = parseFloat(levels[0].price);

  for (const level of levels) {
    if (remainingAmount <= 0) break;

    const price = parseFloat(level.price);
    const size = parseFloat(level.size);
    const levelValue = price * size;

    if (levelValue <= remainingAmount) {
      // 完全吃掉这一档
      totalShares += size;
      totalCost += levelValue;
      remainingAmount -= levelValue;
      filledLevels.push({ price, size, filled: size });
    } else {
      // 部分成交
      const fillSize = remainingAmount / price;
      totalShares += fillSize;
      totalCost += remainingAmount;
      filledLevels.push({ price, size, filled: fillSize });
      remainingAmount = 0;
    }
  }

  if (remainingAmount > 0) {
    console.warn(`Insufficient liquidity: ${remainingAmount} USDC remaining`);
  }

  const avgPrice = totalCost / totalShares;
  const slippage = Math.abs(avgPrice - bestPrice) / bestPrice;
  const priceImpact = (avgPrice - bestPrice) / bestPrice;

  return {
    avgPrice,
    totalShares,
    slippage,
    priceImpact,
    levels: filledLevels,
  };
}

/**
 * 计算潜在盈利
 *
 * @param amount 投入金额（USDC）
 * @param price 买入价格
 * @returns 潜在盈利信息
 */
export function calculatePotentialProfit(
  amount: number,
  price: number
): {
  shares: number;
  potentialProfit: number;
  potentialLoss: number;
  breakEvenPrice: number;
  roi: number;
} {
  // 购买的shares数量
  const shares = amount / price;

  // 如果结果为Yes（价格变为1），潜在盈利
  const potentialProfit = shares - amount;

  // 如果结果为No（价格变为0），潜在亏损
  const potentialLoss = amount;

  // 盈亏平衡价格
  const breakEvenPrice = price;

  // 投资回报率
  const roi = (potentialProfit / amount) * 100;

  return {
    shares,
    potentialProfit,
    potentialLoss,
    breakEvenPrice,
    roi,
  };
}

/**
 * 获取市场摘要（价格、订单簿深度等）
 */
export async function getMarketSummary(tokenId: string): Promise<{
  midpoint: number;
  bestBid: number;
  bestAsk: number;
  spread: number;
  bidDepth: number;
  askDepth: number;
}> {
  const orderBook = await getOrderBook(tokenId);

  const bestBid = orderBook.bids.length > 0 ? parseFloat(orderBook.bids[0].price) : 0;
  const bestAsk = orderBook.asks.length > 0 ? parseFloat(orderBook.asks[0].price) : 0;
  const midpoint = (bestBid + bestAsk) / 2;
  const spread = bestAsk - bestBid;

  // 计算深度（前5档的总量）
  const calculateDepth = (levels: OrderBookLevel[], count: number = 5) =>
    levels
      .slice(0, count)
      .reduce((sum, level) => sum + parseFloat(level.price) * parseFloat(level.size), 0);

  const bidDepth = calculateDepth(orderBook.bids);
  const askDepth = calculateDepth(orderBook.asks);

  return {
    midpoint,
    bestBid,
    bestAsk,
    spread,
    bidDepth,
    askDepth,
  };
}

/**
 * 批量获取多个市场的订单簿
 */
export async function getOrderBooks(tokenIds: string[]): Promise<Map<string, OrderBook>> {
  const results = new Map<string, OrderBook>();

  // 并行请求
  const promises = tokenIds.map(async (tokenId) => {
    try {
      const orderBook = await getOrderBook(tokenId);
      return { tokenId, orderBook };
    } catch (error) {
      console.error(`Failed to get order book for ${tokenId}:`, error);
      return { tokenId, orderBook: null };
    }
  });

  const responses = await Promise.all(promises);

  for (const { tokenId, orderBook } of responses) {
    if (orderBook) {
      results.set(tokenId, orderBook);
    }
  }

  return results;
}

/**
 * 估算市价单的执行结果
 */
export async function estimateMarketOrder(
  tokenId: string,
  amount: number,
  side: 'BUY' | 'SELL'
): Promise<{
  avgPrice: number;
  totalShares: number;
  slippage: number;
  priceImpact: number;
  potentialProfit: number;
  roi: number;
}> {
  const orderBook = await getOrderBook(tokenId);
  const { avgPrice, totalShares, slippage, priceImpact } = calculateMarketOrderPrice(
    orderBook,
    amount,
    side
  );

  const { potentialProfit, roi } = calculatePotentialProfit(amount, avgPrice);

  return {
    avgPrice,
    totalShares,
    slippage,
    priceImpact,
    potentialProfit,
    roi,
  };
}

/**
 * 格式化价格显示
 */
export function formatPrice(price: number): string {
  // 转换为美分显示
  const cents = Math.round(price * 100);
  return `${cents}¢`;
}

/**
 * 格式化金额显示
 */
export function formatAmount(amount: number): string {
  if (amount >= 1000000) {
    return `$${(amount / 1000000).toFixed(2)}M`;
  } else if (amount >= 1000) {
    return `$${(amount / 1000).toFixed(2)}K`;
  } else {
    return `$${amount.toFixed(2)}`;
  }
}
