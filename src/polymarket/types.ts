export interface PolymarketEventOutcome {
  id: string;
  name: string;
  price: number;
  probability?: number;
  tokenId?: string;
  // Multi-option market: each option has YES/NO prices
  yesPrice?: number;
  noPrice?: number;
  yesBid?: number;
  yesAsk?: number;
  noBid?: number;
  noAsk?: number;
  marketTicker?: string;
}

export interface PolymarketEvent {
  id: string;
  title: string;
  description: string;
  endDate: string;
  volume: number;
  yesPrice: number;
  noPrice: number;
  category: string;
  liquidity?: number;
  traders?: number;
  // Multi-option market support
  outcomes?: PolymarketEventOutcome[];
  isMultiOptionMarket?: boolean;
  source?: MarketSource;
}

export interface AnalysisStep {
  id: string;
  step: string;
  content: string;
  confidence?: number;
  timestamp: number;
  status?: 'pending' | 'running' | 'completed' | 'error';
  data?: Record<string, unknown>;
}

export interface TradePosition {
  timestamp: number;
  position: number;
  value: number;
  action: 'buy' | 'sell' | 'hold';
}

export interface TraderDataSources {
  marketDepth: boolean;      // 市场深度
  historyData: boolean;      // 历史数据
  relatedEvents: boolean;    // 关联事件
  technicalIndicators: boolean; // 技术指标
  participantBehavior: boolean; // 参与者行为
  userAccount: boolean;      // 用户账户
  reddit?: boolean;          // Reddit 社区数据 (免费)
  googleNews?: boolean;      // Google News 新闻 (免费)
}

// Market source types
export type MarketSource = 'POLYMARKET' | 'KALSHI' | 'OTHER';

// Event assignment with source information
export interface TraderEventAssignment {
  eventId: string;
  source: MarketSource;
  addedAt?: string | number;
}

export interface Trader {
  id: string;
  name: string;
  color: string;

  // Strategy
  prompt: string;
  aiModel: string;           // AI 模型 (deepseek, gpt-4, claude-3.5-sonnet, etc.)

  // Capital & Performance
  capital: number;           // 初始资金
  totalValue: number;
  totalPnL: number;

  // Risk Management
  minConfidence: number;     // 最小置信度 (50-95)
  maxPosition: number;       // 最大持仓比例 (10-100)
  stopLossPrice: number;     // 止损价格 (5-50)
  takeProfitPrice: number;   // 止盈价格 (50-95)

  // Analysis Weights
  newsWeight: number;        // 新闻权重 (0-100)
  dataWeight: number;        // 数据权重 (0-100)
  sentimentWeight: number;   // 情绪权重 (0-100)

  // Analysis Configuration
  analysisInterval: number;  // 分析间隔（分钟）
  dataSources: TraderDataSources;

  // Status & Events
  isActive: boolean;
  eventIds: string[];        // Legacy: array of event IDs (for backward compatibility)
  events?: TraderEventAssignment[]; // New: events with source information
  assignedEvents?: string[];  // Backend may use this field name
  isPaper?: boolean;          // True if this is a paper trading trader

  // Timestamps
  createdAt: number;
  updatedAt?: number;
}

export interface AnalysisReport {
  id: string;
  eventId: string;
  timestamp: number;
  prediction: 'YES' | 'NO';
  confidence: number;
  currentYesPrice: number;
  currentNoPrice: number;
  analysis: {
    technicalFactors: string[];
    sentimentFactors: string[];
    riskFactors: string[];
  };
  suggestedPosition: number;
  reasoning: string;
}
