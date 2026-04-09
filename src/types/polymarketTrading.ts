/**
 * Polymarket 交易相关类型定义
 */

// ============================================
// 订单类型
// ============================================

export type OrderType = 'MARKET' | 'LIMIT';
export type OrderSide = 'BUY' | 'SELL';
export type TimeInForce = 'FOK' | 'GTC' | 'GTD';

// 订单状态
export type OrderStatus = 'PENDING' | 'OPEN' | 'FILLED' | 'CANCELLED' | 'EXPIRED';

// ============================================
// 订单参数
// ============================================

export interface OrderParams {
  tokenId: string;
  side: OrderSide;
  type: OrderType;
  amount: number;           // USDC金额
  price?: number;           // 限价单价格 (0-1)
  timeInForce: TimeInForce;
}

// 订单构建参数（内部使用）
export interface OrderBuildParams {
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
  side: number;             // 0=BUY, 1=SELL
  signatureType: number;    // 0=EOA, 1=POLY_PROXY, 2=POLY_GNOSIS_SAFE
}

// 签名后的订单
export interface SignedOrder extends OrderBuildParams {
  signature: string;
}

// ============================================
// API认证
// ============================================

export interface PolymarketApiCredentials {
  apiKey: string;
  apiSecret: string;
  passphrase: string;
}

// L1认证头
export interface L1AuthHeaders {
  'POLY_ADDRESS': string;
  'POLY_SIGNATURE': string;
  'POLY_TIMESTAMP': string;
  'POLY_NONCE': string;
}

// L2认证头
export interface L2AuthHeaders {
  'POLY_ADDRESS': string;
  'POLY_SIGNATURE': string;
  'POLY_TIMESTAMP': string;
  'POLY_API_KEY': string;
  'POLY_PASSPHRASE': string;
}

// ============================================
// 订单簿
// ============================================

export interface OrderBookLevel {
  price: string;
  size: string;
}

export interface OrderBook {
  market: string;
  assetId: string;
  hash: string;
  timestamp: string;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
}

// ============================================
// 持仓
// ============================================

export interface Position {
  tokenId: string;
  conditionId: string;
  outcomeName: string;
  size: number;             // 持有shares数量
  avgPrice: number;         // 平均买入价格
  currentPrice: number;     // 当前价格
  value: number;            // 当前价值
  pnl: number;              // 盈亏
  pnlPercent: number;       // 盈亏百分比
}

// ============================================
// 交易响应
// ============================================

export interface OrderResponse {
  success: boolean;
  orderId?: string;
  status?: OrderStatus;
  errorCode?: string;
  errorMsg?: string;
}

export interface TradeResult {
  orderId: string;
  side: OrderSide;
  type: OrderType;
  price: number;
  size: number;
  filledSize: number;
  status: OrderStatus;
  timestamp: number;
}

// ============================================
// EIP-712 签名类型
// ============================================

export const POLYMARKET_ORDER_DOMAIN = {
  name: 'Polymarket CTF Exchange',
  version: '1',
  chainId: 137,
  verifyingContract: '0x4bfb41d5b3570defd03c39a9a4d8de6bd8b8982e' as `0x${string}`
} as const;

export const ORDER_TYPES = {
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
    { name: 'signatureType', type: 'uint8' }
  ]
} as const;

// ============================================
// 合约地址常量
// ============================================

export const POLYMARKET_CONTRACTS = {
  // Polygon主网
  USDC: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
  CTF_EXCHANGE: '0x4bfb41d5b3570defd03c39a9a4d8de6bd8b8982e',
  NEG_RISK_EXCHANGE: '0xC5d563A36AE78145C45a50134d48A1215220f80a',
  NEG_RISK_ADAPTER: '0xd91E80cF2E7be2e162c6513ceD06f1dD0dA35296',
  CTF_TOKEN: '0x4D97DCd97eC945f40cF65F87097ACe5EA0476045',
} as const;

export const POLYMARKET_APIS = {
  CLOB: 'https://clob.polymarket.com',
  GAMMA: 'https://gamma-api.polymarket.com',
} as const;

// ============================================
// UI状态类型
// ============================================

export interface TradingPanelState {
  selectedOutcome: string | null;    // 选中的outcome (Yes/No/其他)
  orderSide: OrderSide;
  orderType: OrderType;
  amount: number;
  price: number;                      // 限价单价格
  isAdvancedOpen: boolean;            // 高级选项是否展开
  timeInForce: TimeInForce;
}

export interface TradingUIProps {
  tokenId: string;
  outcomeName: string;
  currentPrice: number;
  bestBid?: number;
  bestAsk?: number;
  onTrade: (params: OrderParams) => Promise<OrderResponse>;
}

// ============================================
// 工具函数类型
// ============================================

export interface ProfitCalculation {
  shares: number;              // 买入的shares数量
  potentialProfit: number;     // 潜在盈利 (如果结果为Yes)
  potentialLoss: number;       // 潜在亏损 (投入金额)
  breakEvenPrice: number;      // 盈亏平衡价格
  roi: number;                 // 投资回报率 (%)
}
