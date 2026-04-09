export type MarketSource = 'POLYMARKET' | 'KALSHI' | 'OTHER';

export interface MarketOutcome {
  id: string;
  name: string;
  price: number;
  probability?: number;
  tokenId?: string;  // CTF token ID (用于 CLOB API 交易)

  // 多选项市场：每个选项都有自己的 YES/NO 价格
  yesPrice?: number;
  noPrice?: number;
  yesBid?: number;
  yesAsk?: number;
  noBid?: number;
  noAsk?: number;
  marketTicker?: string; // 对应的市场 ticker (用于交易)
}

export interface UnifiedMarketEvent {
  id: string;
  conditionId?: string; // Polymarket condition ID (用于获取 K 线数据)
  source: MarketSource;
  sourceUrl: string;
  title: string;
  description: string;
  category: string;
  imageUrl?: string;
  outcomes: MarketOutcome[];
  volume: number;
  volume24h?: number; // 24小时交易量
  endDate: string;
  liquidity?: number;
  traders?: number;
  active?: boolean; // 是否活跃
  closed?: boolean; // 是否已关闭
  frequency?: string; // daily, weekly, monthly

  // 订单簿数据
  bestBid?: number;
  bestAsk?: number;
  spread?: number;
  
  // 价格变化
  oneDayPriceChange?: number;
  oneHourPriceChange?: number;
  
  // 订单限制
  orderMinSize?: number;        // 最小订单大小 (股数)
  orderPriceMinTickSize?: number; // 最小价格步长
  
  raw?: any; // 保留原始数据以备不时之需
  
  // 辅助字段，方便前端直接展示 Yes/No 价格 (如果是二元市场)
  yesPrice?: number;
  noPrice?: number;
}
