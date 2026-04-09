import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { useState, useEffect } from 'react';
import {
  TrendingUp,
  TrendingDown,
  Calendar,
  ArrowUpRight,
  ArrowDownRight,
  Brain,
  FileText,
  AlertCircle,
  ShoppingCart,
  Wallet,
  Lightbulb
} from 'lucide-react';
import { UnifiedMarketEvent } from '../../services/markets/types';
import { AIAnalysisPanel } from './AIAnalysisPanel';
import { TradingPanel } from './TradingPanel';
import { DFlowTradingPanel } from './DFlowTradingPanel';
import { PolymarketEvent, AnalysisStep } from '../types';
import { useAuth } from '../../contexts/AuthContext';
import { translations } from '../../constants/translations';
import { useAppStore } from '../../contexts/useAppStore';
import { PaperTradeDialog } from '../../components/paper-trading';

interface EventDetailDialogProps {
  event: UnifiedMarketEvent | null;
  open: boolean;
  onClose: () => void;
  language?: 'zh' | 'en';
  // For multi-option markets: pre-select outcome and side
  initialOutcomeIndex?: number; // Which outcome to pre-select (0-based index)
  initialSide?: 'YES' | 'NO';   // Whether to buy YES or NO
  initialTab?: string;          // Which tab to open (e.g., 'trade')
}

// K线数据类型
interface CandlestickData {
  timestamp: number;
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

// 每个 outcome 的 K 线数据
interface OutcomeCandlesticks {
  index: number;
  name: string;
  tokenId: string;
  candles: CandlestickData[];
  currentPrice: number;
}

interface PriceAnalysis {
  currentPrice: number;
  startPrice: number;
  priceChange: number;
  priceChangePercent: number;
  high: number;
  low: number;
  trend: 'bullish' | 'bearish' | 'stable';
  trendStrength: 'strong' | 'moderate' | 'weak';
  volatilityPercent: number;
  momentum: number;
  dataPoints: number;
  timeRangeHours: number;
}

// 多条线的颜色配置
const OUTCOME_COLORS = [
  { stroke: '#22c55e', fill: 'rgba(34, 197, 94, 0.1)' },   // 绿色 (leading)
  { stroke: '#3b82f6', fill: 'rgba(59, 130, 246, 0.1)' },  // 蓝色
  { stroke: '#f97316', fill: 'rgba(249, 115, 22, 0.1)' },  // 橙色
  { stroke: '#a855f7', fill: 'rgba(168, 85, 247, 0.1)' },  // 紫色
  { stroke: '#ef4444', fill: 'rgba(239, 68, 68, 0.1)' },   // 红色
  { stroke: '#06b6d4', fill: 'rgba(6, 182, 212, 0.1)' },   // 青色
];

export function EventDetailDialog({
  event,
  open,
  onClose,
  language = 'zh',
  initialOutcomeIndex,
  initialSide,
  initialTab
}: EventDetailDialogProps) {
  const t = translations[language]?.polymarketPage?.eventDetail || translations.en.polymarketPage.eventDetail;
  // 鼠标悬停状态 - 支持多线图表
  const [hoveredPoint, setHoveredPoint] = useState<{x: number; y: number; price: number; time: string; outcomeName?: string; outcomeIndex?: number} | null>(null);

  // AI 分析状态
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisSteps, setAnalysisSteps] = useState<AnalysisStep[]>([]);
  const [activeTab, setActiveTab] = useState(initialTab || 'orderbook');

  // For multi-option markets: track which outcome is selected for trading
  const [selectedOutcomeIndex, setSelectedOutcomeIndex] = useState<number>(initialOutcomeIndex ?? 0);
  const [selectedTradeSide, setSelectedTradeSide] = useState<'YES' | 'NO'>(initialSide || 'YES');

  // K线数据状态
  const [candlesticks, setCandlesticks] = useState<CandlestickData[]>([]);
  const [outcomeCandlesticks, setOutcomeCandlesticks] = useState<OutcomeCandlesticks[]>([]);
  const [priceAnalysis, setPriceAnalysis] = useState<PriceAnalysis | null>(null);
  const [candlestickLoading, setCandlestickLoading] = useState(false);

  // 获取认证信息
  const {
    authenticated,
    walletAddress,
    accessToken,
    signWithPrivyWallet,
    getProvider,
    primaryWallet
  } = useAuth();

  // Paper Trading (模拟盘) 状态
  const isPaperTrading = useAppStore((state) => state.isPaperTrading);
  const [paperTradeDialogOpen, setPaperTradeDialogOpen] = useState(false);

  // 当事件改变或对话框打开时，重置分析状态
  useEffect(() => {
    if (event?.id) {
      // 重置分析状态，确保每个事件的分析是独立的
      setIsAnalyzing(false);
      setAnalysisSteps([]);
      setActiveTab(initialTab || 'orderbook');
      setCandlesticks([]);
      setOutcomeCandlesticks([]);
      setPriceAnalysis(null);
      // Reset to initial outcome selection if provided
      setSelectedOutcomeIndex(initialOutcomeIndex ?? 0);
      setSelectedTradeSide(initialSide || 'YES');
    }
  }, [event?.id, open, initialTab, initialOutcomeIndex, initialSide]);

  // 获取 K 线数据
  useEffect(() => {
    async function fetchCandlesticks() {
      if (!event?.conditionId || !open) return;

      setCandlestickLoading(true);
      try {
        const response = await fetch(`/api/polymarket/candlesticks/${event.conditionId}?hours=72&interval=1h`);
        const data = await response.json();

        if (data.success) {
          // 优先使用 outcomes 数组（多条线）
          if (data.data?.outcomes?.length > 0) {
            // 用 event.outcomes 的名称来匹配 K 线数据
            const enrichedOutcomes = data.data.outcomes.map((outcome: OutcomeCandlesticks, idx: number) => {
              // 尝试通过 tokenId 匹配
              const matchedEventOutcome = event.outcomes.find(eo => eo.id === outcome.tokenId);
              if (matchedEventOutcome) {
                return { ...outcome, name: matchedEventOutcome.name };
              }
              // 如果没有匹配到，尝试通过价格匹配（价格相近的）
              const priceDiff = event.outcomes.map((eo, i) => ({
                idx: i,
                name: eo.name,
                diff: Math.abs(eo.price - outcome.currentPrice)
              })).sort((a, b) => a.diff - b.diff);
              if (priceDiff.length > 0 && priceDiff[0].diff < 0.1) {
                return { ...outcome, name: priceDiff[0].name };
              }
              // 最后回退：使用 event.outcomes 的顺序
              if (event.outcomes[idx]) {
                return { ...outcome, name: event.outcomes[idx].name };
              }
              return outcome;
            });
            setOutcomeCandlesticks(enrichedOutcomes);
          }
          // 向后兼容：也存储单独的 candlesticks
          if (data.data?.candlesticks?.length > 0) {
            setCandlesticks(data.data.candlesticks);
          }
          if (data.data?.priceAnalysis) {
            setPriceAnalysis(data.data.priceAnalysis);
          }
        }
      } catch (error) {
        console.error('Failed to fetch candlesticks:', error);
      } finally {
        setCandlestickLoading(false);
      }
    }

    fetchCandlesticks();
  }, [event?.conditionId, open]);

  if (!event) return null;

  // 使用真实数据
  const volume24h = event.volume24h ?? event.volume * 0.15;
  const mainOutcome = event.outcomes[0];
  const currentPrice = mainOutcome?.price || 0.5;

  // 生成价格趋势数据 - 优先使用真实 K 线数据
  const generatePriceTrend = () => {
    // 如果有真实 K 线数据，使用它
    if (candlesticks.length > 0) {
      return candlesticks.map(c => ({
        time: new Date(c.timestamp * 1000).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
        price: c.close
      }));
    }

    // 否则使用模拟数据
    const points = 24;
    const data = [];
    const dayChange = (event.oneDayPriceChange || 0);

    // 从24小时前的价格开始
    const startPrice = currentPrice - dayChange;

    for (let i = 0; i < points; i++) {
      const progress = i / (points - 1);
      // 添加一些随机波动使其更真实
      const randomNoise = (Math.random() - 0.5) * 0.02;
      const price = startPrice + (dayChange * progress) + randomNoise;
      data.push({
        time: `${i}h`,
        price: Math.max(0.01, Math.min(0.99, price))
      });
    }
    return data;
  };

  // 生成简单的订单簿数据（基于 bestBid/bestAsk）
  const generateOrderBook = () => {
    const bids = [];
    const asks = [];
    const bidPrice = event.bestBid || (currentPrice - 0.05);
    const askPrice = event.bestAsk || (currentPrice + 0.05);
    const spreadSize = event.spread || 0.02;
    
    // 生成买单（由高到低）
    for (let i = 0; i < 5; i++) {
      bids.push({
        price: Math.max(0.01, bidPrice - i * 0.01),
        amount: Math.floor(Math.random() * 1000) + 100
      });
    }
    
    // 生成卖单（由低到高）
    for (let i = 0; i < 5; i++) {
      asks.push({
        price: Math.min(0.99, askPrice + i * 0.01),
        amount: Math.floor(Math.random() * 1000) + 100
      });
    }
    
    return { bids, asks };
  };

  const priceTrend = generatePriceTrend();
  const { bids, asks } = generateOrderBook();

  // 转换 UnifiedMarketEvent 为 PolymarketEvent（用于 AI 分析）
  const convertToPolymarketEvent = (): PolymarketEvent => {
    const yesOutcome = event.outcomes.find(o => o.name === 'Yes' || o.name === 'YES');
    const noOutcome = event.outcomes.find(o => o.name === 'No' || o.name === 'NO');

    // Check if this is a multi-option market (outcomes are not standard Yes/No)
    const isMultiOption = event.outcomes.length >= 2 &&
      !event.outcomes.some(o => {
        const name = (o.name || '').toLowerCase().trim();
        return name === 'yes' || name === 'no';
      });

    return {
      id: event.id,
      title: event.title,
      description: event.description,
      endDate: event.endDate,
      volume: event.volume,
      yesPrice: event.yesPrice ?? yesOutcome?.price ?? 0.5,
      noPrice: event.noPrice ?? noOutcome?.price ?? 0.5,
      category: event.category,
      liquidity: event.liquidity,
      traders: event.traders,
      // Include outcomes array for multi-option market support
      outcomes: event.outcomes.map(o => ({
        id: o.id,
        name: o.name,
        price: o.price,
        probability: o.probability,
        tokenId: o.tokenId,
        yesPrice: o.yesPrice,
        noPrice: o.noPrice,
        yesBid: o.yesBid,
        yesAsk: o.yesAsk,
        noBid: o.noBid,
        noAsk: o.noAsk,
        marketTicker: o.marketTicker
      })),
      isMultiOptionMarket: isMultiOption,
      source: event.source
    };
  };

  const renderSourceBadge = (source: string) => {
     if (source === 'POLYMARKET') {
       return <Badge variant="secondary" className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">Polymarket</Badge>;
     }
     if (source === 'KALSHI') {
       return <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">Kalshi</Badge>;
     }
     return <Badge variant="outline">{source}</Badge>;
  };

  return (
    <>
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        // 当 PaperTradeDialog 打开时，不要关闭 EventDetailDialog
        if (!isOpen && paperTradeDialogOpen) return;
        onClose(isOpen);
      }}
      modal={!paperTradeDialogOpen}
    >
      <DialogContent 
        className="max-h-[90vh] overflow-y-auto overflow-x-hidden bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-50" 
        style={{ width: '95vw', maxWidth: '900px' }}
        aria-describedby="event-desc"
      >
        <DialogHeader>
          <div className="flex items-start gap-4">
            {/* Event Image */}
            {event.imageUrl && (
              <img 
                src={event.imageUrl} 
                alt={event.title}
                className="w-16 h-16 rounded-lg object-cover flex-shrink-0"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                }}
              />
            )}
            
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                {renderSourceBadge(event.source)}
                <Badge variant="outline" className="dark:border-slate-700">{event.category}</Badge>
                {event.oneDayPriceChange !== undefined && (
                  <Badge variant={event.oneDayPriceChange >= 0 ? "default" : "destructive"} className="flex items-center gap-1">
                    {event.oneDayPriceChange >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                    {event.oneDayPriceChange >= 0 ? '+' : ''}{(event.oneDayPriceChange * 100).toFixed(1)}%
                  </Badge>
                )}
              </div>
              <DialogTitle className="text-lg md:text-xl font-semibold mb-2 leading-snug dark:text-white">{event.title}</DialogTitle>
              <DialogDescription id="event-desc" className="text-sm text-muted-foreground dark:text-slate-400 line-clamp-3">
                {event.description}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Current Prices - 所有选项 */}
        <div className="py-4">
          {event.outcomes.length === 2 && (event.outcomes[0].name === 'Yes' || event.outcomes[1].name === 'Yes') ? (
            // 标准 Yes/No 市场
            <div className="grid grid-cols-2 gap-3">
              <Card className="p-3 bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800/50">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-green-700 dark:text-green-300">YES</span>
                  <TrendingUp className="w-3.5 h-3.5 text-green-600 dark:text-green-400" />
                </div>
                <p className="text-2xl font-bold text-green-600 dark:text-green-400 mb-0.5">
                  {((event.outcomes.find(o => o.name === 'Yes')?.price || 0.5) * 100).toFixed(1)}¢
                </p>
                <p className="text-[10px] text-green-600/70 dark:text-green-400/70">
                  {t.probability}: {((event.outcomes.find(o => o.name === 'Yes')?.price || 0.5) * 100).toFixed(1)}%
                </p>
              </Card>
              <Card className="p-3 bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800/50">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-red-700 dark:text-red-300">NO</span>
                  <TrendingDown className="w-3.5 h-3.5 text-red-600 dark:text-red-400" />
                </div>
                <p className="text-2xl font-bold text-red-600 dark:text-red-400 mb-0.5">
                  {((event.outcomes.find(o => o.name === 'No')?.price || 0.5) * 100).toFixed(1)}¢
                </p>
                <p className="text-[10px] text-red-600/70 dark:text-red-400/70">
                  {t.probability}: {((event.outcomes.find(o => o.name === 'No')?.price || 0.5) * 100).toFixed(1)}%
                </p>
              </Card>
            </div>
          ) : (
            // 多选项市场（Fed decision, 体育赛事等）
            <div className="space-y-2">
              <h4 className="text-sm font-medium mb-3">{t.allOptions}</h4>
              {event.outcomes.map((outcome) => (
                <div key={outcome.id} className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-900 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <span className="text-sm font-medium truncate min-w-[120px]">{outcome.name}</span>
                    <div className="flex-1 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden max-w-[150px]">
                      <div 
                        className="h-full bg-gradient-to-r from-blue-500 to-blue-600 rounded-full transition-all"
                        style={{ width: `${outcome.price * 100}%` }}
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-3 ml-4 flex-shrink-0">
                    <span className="text-lg font-bold text-blue-600 dark:text-blue-400 min-w-[3rem] text-right">
                      {(outcome.price * 100).toFixed(0)}%
                    </span>
                    <div className="flex gap-1">
                      <span className="text-[10px] px-2 py-0.5 rounded bg-green-100 dark:bg-green-950 text-green-700 dark:text-green-300 font-medium">
                        Yes
                      </span>
                      <span className="text-[10px] px-2 py-0.5 rounded bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300 font-medium">
                        No
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-2 pb-4 border-b dark:border-slate-800">
          <div className="p-2 rounded bg-slate-50 dark:bg-slate-900">
            <p className="text-[10px] text-muted-foreground mb-0.5">{t.totalVolume}</p>
            <p className="text-sm font-medium dark:text-slate-200">${(event.volume / 1000000).toFixed(2)}M</p>
          </div>
          <div className="p-2 rounded bg-slate-50 dark:bg-slate-900">
            <p className="text-[10px] text-muted-foreground mb-0.5">{t.volume24h}</p>
            <p className="text-sm font-medium dark:text-slate-200">${(volume24h / 1000000).toFixed(2)}M</p>
          </div>
          <div className="p-2 rounded bg-slate-50 dark:bg-slate-900">
            <p className="text-[10px] text-muted-foreground mb-0.5">{t.liquidity}</p>
            <p className="text-sm font-medium dark:text-slate-200">${((event.liquidity || 0) / 1000).toFixed(0)}K</p>
          </div>
          <div className="p-2 rounded bg-slate-50 dark:bg-slate-900">
            <p className="text-[10px] text-muted-foreground mb-0.5">{t.spread}</p>
            <p className="text-sm font-medium dark:text-slate-200">{event.spread ? (event.spread * 100).toFixed(1) + '¢' : 'N/A'}</p>
          </div>
        </div>

        {/* Tabs - Order Book & Chart & Rules & AI Analysis & Trading */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-4">
          <TabsList className="grid w-full grid-cols-5 bg-slate-100 dark:bg-slate-800">
            <TabsTrigger value="orderbook" className="data-[state=active]:bg-white dark:data-[state=active]:bg-slate-700 text-xs px-2">{t.orderBook}</TabsTrigger>
            <TabsTrigger value="chart" className="data-[state=active]:bg-white dark:data-[state=active]:bg-slate-700 text-xs px-2">{t.trend}</TabsTrigger>
            <TabsTrigger value="rules" className="data-[state=active]:bg-white dark:data-[state=active]:bg-slate-700 flex items-center gap-1 text-xs px-2">
              <FileText className="w-3.5 h-3.5" />
              {t.rules}
            </TabsTrigger>
            <TabsTrigger value="ai" className="data-[state=active]:bg-white dark:data-[state=active]:bg-slate-700 flex items-center gap-1 text-xs px-2">
              <Brain className="w-3.5 h-3.5" />
              {t.ai}
            </TabsTrigger>
            <TabsTrigger value="trade" className={`data-[state=active]:bg-white dark:data-[state=active]:bg-slate-700 flex items-center gap-1 text-xs px-2 ${isPaperTrading ? 'text-amber-600 dark:text-amber-400' : 'text-green-600 dark:text-green-400'}`}>
              {isPaperTrading ? <Lightbulb className="w-3.5 h-3.5" /> : <ShoppingCart className="w-3.5 h-3.5" />}
              {isPaperTrading ? (language === 'zh' ? '模拟交易' : 'Paper') : t.trade}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="orderbook" className="mt-4">
            <div className="grid grid-cols-2 gap-4">
              {/* Buy Orders (Bids) */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-medium text-green-600 dark:text-green-400">{t.bids}</h4>
                  <span className="text-xs text-muted-foreground">{t.price} / {t.amount}</span>
                </div>
                <div className="space-y-1">
                  {bids.map((order, i) => (
                    <div 
                      key={i}
                      className="flex justify-between text-xs p-2 rounded bg-green-50 dark:bg-green-950/20 hover:bg-green-100 dark:hover:bg-green-950/30 transition-colors"
                    >
                      <span className="text-green-600 dark:text-green-400 font-mono font-medium">
                        {(order.price * 100).toFixed(1)}¢
                      </span>
                      <span className="text-muted-foreground font-mono">
                        {order.amount.toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
                {event.bestBid && (
                  <div className="mt-2 text-xs text-center text-green-600 dark:text-green-400 font-medium">
                    {t.bestBid}: {(event.bestBid * 100).toFixed(1)}¢
                  </div>
                )}
              </div>

              {/* Sell Orders (Asks) */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-medium text-red-600 dark:text-red-400">{t.asks}</h4>
                  <span className="text-xs text-muted-foreground">{t.price} / {t.amount}</span>
                </div>
                <div className="space-y-1">
                  {asks.map((order, i) => (
                    <div 
                      key={i}
                      className="flex justify-between text-xs p-2 rounded bg-red-50 dark:bg-red-950/20 hover:bg-red-100 dark:hover:bg-red-950/30 transition-colors"
                    >
                      <span className="text-red-600 dark:text-red-400 font-mono font-medium">
                        {(order.price * 100).toFixed(1)}¢
                      </span>
                      <span className="text-muted-foreground font-mono">
                        {order.amount.toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
                {event.bestAsk && (
                  <div className="mt-2 text-xs text-center text-red-600 dark:text-red-400 font-medium">
                    {t.bestAsk}: {(event.bestAsk * 100).toFixed(1)}¢
                  </div>
                )}
              </div>
            </div>
            <p className="text-xs text-center text-muted-foreground mt-4">
              💡 {t.orderBookNote}
            </p>
          </TabsContent>

          <TabsContent value="chart" className="mt-4">
            <div>
              <h4 className="mb-3 text-sm font-medium">{t.priceTrend24h}</h4>

              {/* 图例 - Legend */}
              {outcomeCandlesticks.length > 0 && (
                <div className="flex flex-wrap gap-3 mb-3">
                  {outcomeCandlesticks.map((outcome, idx) => {
                    const color = OUTCOME_COLORS[idx % OUTCOME_COLORS.length];
                    return (
                      <div key={outcome.tokenId || idx} className="flex items-center gap-2 text-xs">
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: color.stroke }}
                        />
                        <span className="font-medium">{outcome.name}</span>
                        <span className="text-muted-foreground">
                          {(outcome.currentPrice * 100).toFixed(1)}%
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* 交互式多线价格趋势图 */}
              <div className="relative h-[280px] bg-slate-50 dark:bg-slate-900 rounded-lg p-6">
                <svg
                  className="w-full h-full cursor-crosshair"
                  viewBox="0 0 400 150"
                  onMouseMove={(e) => {
                    const svg = e.currentTarget;
                    const rect = svg.getBoundingClientRect();
                    const x = ((e.clientX - rect.left) / rect.width) * 400;
                    const y = ((e.clientY - rect.top) / rect.height) * 150;

                    // 使用多线数据或单线数据
                    const dataToUse = outcomeCandlesticks.length > 0 ? outcomeCandlesticks :
                      (priceTrend.length > 0 ? [{ name: 'Yes', candles: priceTrend.map((p, i) => ({ close: p.price, timestamp: i })), currentPrice }] : []);

                    if (dataToUse.length === 0) return;

                    // 找到最近的数据点和最近的线
                    const firstOutcome = dataToUse[0];
                    const candleCount = firstOutcome.candles?.length || priceTrend.length;
                    const index = Math.round((x / 400) * (candleCount - 1));

                    if (index >= 0 && index < candleCount) {
                      // 找到离鼠标 Y 位置最近的线
                      let closestOutcome = dataToUse[0];
                      let closestDistance = Infinity;
                      let closestIdx = 0;

                      dataToUse.forEach((outcome, oi) => {
                        const candles = outcome.candles || [];
                        if (candles[index]) {
                          const price = candles[index].close;
                          const lineY = 150 - (price * 150);
                          const distance = Math.abs(lineY - y);
                          if (distance < closestDistance) {
                            closestDistance = distance;
                            closestOutcome = outcome;
                            closestIdx = oi;
                          }
                        }
                      });

                      const candles = closestOutcome.candles || [];
                      const candle = candles[index];
                      if (candle) {
                        const pointX = (index / (candleCount - 1)) * 400;
                        const pointY = 150 - (candle.close * 150);
                        const time = candle.time ? new Date(candle.time).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : `${index}h`;
                        setHoveredPoint({
                          x: pointX,
                          y: pointY,
                          price: candle.close,
                          time,
                          outcomeName: closestOutcome.name,
                          outcomeIndex: closestIdx
                        });
                      }
                    }
                  }}
                  onMouseLeave={() => setHoveredPoint(null)}
                >
                  {/* Grid lines */}
                  <line x1="0" y1="37.5" x2="400" y2="37.5" stroke="rgb(148, 163, 184)" strokeWidth="0.5" opacity="0.3" />
                  <line x1="0" y1="75" x2="400" y2="75" stroke="rgb(148, 163, 184)" strokeWidth="0.5" opacity="0.3" />
                  <line x1="0" y1="112.5" x2="400" y2="112.5" stroke="rgb(148, 163, 184)" strokeWidth="0.5" opacity="0.3" />

                  {/* 多条线 - 每个 outcome 一条 */}
                  {outcomeCandlesticks.length > 0 ? (
                    outcomeCandlesticks.map((outcome, idx) => {
                      const color = OUTCOME_COLORS[idx % OUTCOME_COLORS.length];
                      const candles = outcome.candles || [];
                      if (candles.length === 0) return null;

                      return (
                        <polyline
                          key={outcome.tokenId || idx}
                          points={candles.map((c, i) => {
                            const x = (i / (candles.length - 1)) * 400;
                            const y = 150 - (c.close * 150);
                            return `${x},${y}`;
                          }).join(' ')}
                          fill="none"
                          stroke={color.stroke}
                          strokeWidth={hoveredPoint?.outcomeIndex === idx ? "3" : "2"}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          opacity={hoveredPoint && hoveredPoint.outcomeIndex !== idx ? 0.4 : 1}
                        />
                      );
                    })
                  ) : (
                    // 向后兼容：单线模式
                    <polyline
                      points={priceTrend.map((point, i) => {
                        const x = (i / (priceTrend.length - 1)) * 400;
                        const y = 150 - (point.price * 150);
                        return `${x},${y}`;
                      }).join(' ')}
                      fill="none"
                      stroke="rgb(59, 130, 246)"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  )}

                  {/* Hover indicator */}
                  {hoveredPoint && (
                    <>
                      {/* Vertical line */}
                      <line
                        x1={hoveredPoint.x}
                        y1="0"
                        x2={hoveredPoint.x}
                        y2="150"
                        stroke="rgb(100, 116, 139)"
                        strokeWidth="1"
                        strokeDasharray="4 2"
                        opacity="0.5"
                      />
                      {/* Hover point */}
                      <circle
                        cx={hoveredPoint.x}
                        cy={hoveredPoint.y}
                        r="6"
                        fill={OUTCOME_COLORS[hoveredPoint.outcomeIndex ?? 0]?.stroke || 'rgb(59, 130, 246)'}
                        stroke="white"
                        strokeWidth="2"
                      />
                    </>
                  )}

                  {/* Current price indicators for each outcome */}
                  {outcomeCandlesticks.length > 0 ? (
                    outcomeCandlesticks.map((outcome, idx) => {
                      const color = OUTCOME_COLORS[idx % OUTCOME_COLORS.length];
                      return (
                        <circle
                          key={`end-${outcome.tokenId || idx}`}
                          cx={400}
                          cy={150 - (outcome.currentPrice * 150)}
                          r="4"
                          fill={color.stroke}
                          stroke="white"
                          strokeWidth="1.5"
                        />
                      );
                    })
                  ) : (
                    <circle
                      cx={400}
                      cy={150 - (currentPrice * 150)}
                      r="5"
                      fill="rgb(59, 130, 246)"
                      stroke="white"
                      strokeWidth="2"
                    />
                  )}
                </svg>

                {/* Hover tooltip */}
                {hoveredPoint && (
                  <div
                    className="absolute bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 px-3 py-2 rounded-lg shadow-xl text-xs font-medium pointer-events-none z-10"
                    style={{
                      left: `calc(${(hoveredPoint.x / 400) * 100}% + 24px)`,
                      top: `calc(${(hoveredPoint.y / 150) * 100}% + 24px - 40px)`,
                      transform: hoveredPoint.x > 300 ? 'translateX(-100%)' : 'translateX(0)'
                    }}
                  >
                    <div className="flex flex-col gap-1">
                      {hoveredPoint.outcomeName && (
                        <span
                          className="font-bold text-[11px]"
                          style={{ color: OUTCOME_COLORS[hoveredPoint.outcomeIndex ?? 0]?.stroke }}
                        >
                          {hoveredPoint.outcomeName}
                        </span>
                      )}
                      <span className="text-[10px] opacity-70">{hoveredPoint.time}</span>
                      <span className="font-bold">{(hoveredPoint.price * 100).toFixed(2)}%</span>
                    </div>
                  </div>
                )}

                {/* Y-axis labels */}
                <div className="absolute top-4 left-1 text-[10px] text-muted-foreground font-medium">100%</div>
                <div className="absolute top-1/2 left-1 text-[10px] text-muted-foreground -translate-y-1/2 font-medium">50%</div>
                <div className="absolute bottom-4 left-1 text-[10px] text-muted-foreground font-medium">0%</div>

                {/* X-axis labels */}
                <div className="absolute bottom-1 left-6 text-[10px] text-muted-foreground">{t.hoursAgo24}</div>
                <div className="absolute bottom-1 left-1/2 -translate-x-1/2 text-[10px] text-muted-foreground">{t.hoursAgo12}</div>
                <div className="absolute bottom-1 right-6 text-[10px] text-muted-foreground">{t.now}</div>
              </div>
              
              {/* Price Analysis from Dome API */}
              {priceAnalysis && (
                <div className="mt-4 p-4 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 rounded-lg border border-blue-100 dark:border-blue-900/50">
                  <div className="flex items-center justify-between mb-3">
                    <h5 className="text-sm font-semibold flex items-center gap-2">
                      {priceAnalysis.trend === 'bullish' ? '📈' : priceAnalysis.trend === 'bearish' ? '📉' : '➡️'}
                      {language === 'zh' ? '价格走势分析' : 'Price Trend Analysis'}
                      <span className="text-xs font-normal text-muted-foreground">
                        ({language === 'zh' ? `过去 ${priceAnalysis.timeRangeHours} 小时` : `Past ${priceAnalysis.timeRangeHours}h`})
                      </span>
                    </h5>
                    <Badge variant={priceAnalysis.trend === 'bullish' ? 'default' : priceAnalysis.trend === 'bearish' ? 'destructive' : 'secondary'}>
                      {priceAnalysis.trend === 'bullish' ? (language === 'zh' ? '上涨' : 'Bullish') :
                       priceAnalysis.trend === 'bearish' ? (language === 'zh' ? '下跌' : 'Bearish') :
                       (language === 'zh' ? '稳定' : 'Stable')}
                      {' '}({priceAnalysis.trendStrength === 'strong' ? (language === 'zh' ? '强' : 'Strong') :
                             priceAnalysis.trendStrength === 'moderate' ? (language === 'zh' ? '中等' : 'Moderate') :
                             (language === 'zh' ? '弱' : 'Weak')})
                    </Badge>
                  </div>
                  <div className="grid grid-cols-4 gap-2 text-xs">
                    <div className="p-2 bg-white/50 dark:bg-slate-900/50 rounded">
                      <p className="text-muted-foreground mb-1">{language === 'zh' ? '价格变化' : 'Change'}</p>
                      <p className={`font-bold ${priceAnalysis.priceChangePercent >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {priceAnalysis.priceChangePercent >= 0 ? '+' : ''}{priceAnalysis.priceChangePercent.toFixed(2)}%
                      </p>
                    </div>
                    <div className="p-2 bg-white/50 dark:bg-slate-900/50 rounded">
                      <p className="text-muted-foreground mb-1">{language === 'zh' ? '最高/最低' : 'High/Low'}</p>
                      <p className="font-medium">{(priceAnalysis.high * 100).toFixed(1)}¢ / {(priceAnalysis.low * 100).toFixed(1)}¢</p>
                    </div>
                    <div className="p-2 bg-white/50 dark:bg-slate-900/50 rounded">
                      <p className="text-muted-foreground mb-1">{language === 'zh' ? '波动率' : 'Volatility'}</p>
                      <p className="font-medium">{priceAnalysis.volatilityPercent.toFixed(2)}%</p>
                    </div>
                    <div className="p-2 bg-white/50 dark:bg-slate-900/50 rounded">
                      <p className="text-muted-foreground mb-1">{language === 'zh' ? '动量' : 'Momentum'}</p>
                      <p className={`font-bold ${priceAnalysis.momentum > 0 ? 'text-green-600' : priceAnalysis.momentum < 0 ? 'text-red-600' : ''}`}>
                        {priceAnalysis.momentum > 0 ? '+' : ''}{priceAnalysis.momentum}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {candlestickLoading && (
                <div className="mt-4 text-center text-sm text-muted-foreground">
                  {language === 'zh' ? '加载价格数据...' : 'Loading price data...'}
                </div>
              )}

              {/* Price Change Info */}
              <div className="grid grid-cols-2 gap-3 mt-4">
                {event.oneHourPriceChange !== undefined && (
                  <div className="p-3 bg-slate-50 dark:bg-slate-900 rounded-lg">
                    <p className="text-xs text-muted-foreground mb-1">{t.oneHourChange}</p>
                    <p className={`text-lg font-bold ${event.oneHourPriceChange >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {event.oneHourPriceChange >= 0 ? '+' : ''}{(event.oneHourPriceChange * 100).toFixed(2)}%
                    </p>
                  </div>
                )}
                {event.oneDayPriceChange !== undefined && (
                  <div className="p-3 bg-slate-50 dark:bg-slate-900 rounded-lg">
                    <p className="text-xs text-muted-foreground mb-1">{t.oneDayChange}</p>
                    <p className={`text-lg font-bold ${event.oneDayPriceChange >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {event.oneDayPriceChange >= 0 ? '+' : ''}{(event.oneDayPriceChange * 100).toFixed(2)}%
                    </p>
                  </div>
                )}
              </div>

              <p className="text-xs text-center text-muted-foreground mt-4">
                💡 {candlesticks.length > 0 ? (language === 'zh' ? '数据来源: Dome API (实时K线)' : 'Data source: Dome API (Real-time candlesticks)') : t.trendNote}
              </p>
            </div>
          </TabsContent>

          <TabsContent value="rules" className="mt-4">
            <div className="space-y-4">
              {/* 规则说明标题 */}
              <div className="flex items-center gap-2 mb-3">
                <FileText className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <h4 className="text-sm font-medium">{t.marketRules}</h4>
              </div>

              {/* 完整描述 */}
              <Card className="p-4 bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800">
                <div className="prose prose-sm dark:prose-invert max-w-none">
                  {event.description ? (
                    <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed">
                      {event.description}
                    </p>
                  ) : (
                    <p className="text-sm text-muted-foreground italic">
                      {language === 'zh' ? '暂无详细规则说明' : 'No detailed rules available'}
                    </p>
                  )}
                </div>
              </Card>

              {/* 关键信息提示 */}
              <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-950/20 rounded-lg border border-amber-200 dark:border-amber-800/50">
                <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
                <div className="text-xs text-amber-800 dark:text-amber-200">
                  <p className="font-medium mb-1">{t.importantNotice}</p>
                  <ul className="list-disc list-inside space-y-0.5 text-amber-700 dark:text-amber-300">
                    <li>{t.umaNotice}</li>
                    <li>{t.micNotice}</li>
                    <li>{t.readRulesNotice}</li>
                  </ul>
                </div>
              </div>

              {/* 市场基本信息 */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-slate-50 dark:bg-slate-900 rounded-lg">
                  <p className="text-xs text-muted-foreground mb-1">{t.resultOptions}</p>
                  <div className="flex flex-wrap gap-1">
                    {event.outcomes.map((outcome, idx) => (
                      <Badge key={idx} variant="outline" className="text-xs">
                        {outcome.name}
                      </Badge>
                    ))}
                  </div>
                </div>
                <div className="p-3 bg-slate-50 dark:bg-slate-900 rounded-lg">
                  <p className="text-xs text-muted-foreground mb-1">{t.deadline}</p>
                  <p className="text-sm font-medium">
                    {new Date(event.endDate).toLocaleString('zh-CN', {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </p>
                </div>
              </div>

              <p className="text-xs text-center text-muted-foreground">
                📋 {t.rulesFromPolymarket}
              </p>
            </div>
          </TabsContent>

          <TabsContent value="ai" className="mt-4">
            <AIAnalysisPanel
              event={convertToPolymarketEvent()}
              isAnalyzing={isAnalyzing}
              setIsAnalyzing={setIsAnalyzing}
              analysisSteps={analysisSteps}
              setAnalysisSteps={setAnalysisSteps}
              customPrompt=""
              language={language}
            />
          </TabsContent>

          <TabsContent value="trade" className="mt-4">
            {/* Paper Trading Mode - 模拟盘模式 */}
            {isPaperTrading ? (
              <div className="space-y-4">
                {/* Paper Trading Banner */}
                <div className="bg-gradient-to-r from-amber-500/20 to-orange-500/20 border border-amber-500/30 rounded-lg p-4">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 bg-amber-500/20 rounded-full flex items-center justify-center">
                      <Lightbulb className="w-5 h-5 text-amber-500" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-amber-700 dark:text-amber-400">
                        {language === 'zh' ? '模拟交易模式' : 'Paper Trading Mode'}
                      </h4>
                      <p className="text-sm text-amber-600/70 dark:text-amber-400/70">
                        {language === 'zh' ? '使用虚拟资金练习，不涉及真实交易' : 'Practice with virtual funds, no real trades'}
                      </p>
                    </div>
                  </div>

                  {/* Quick Trade Buttons */}
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={() => setPaperTradeDialogOpen(true)}
                      className="flex items-center justify-center gap-2 py-3 bg-green-500 hover:bg-green-400 text-white font-semibold rounded-lg transition-all"
                    >
                      <TrendingUp className="w-4 h-4" />
                      {language === 'zh' ? '买 YES' : 'Buy YES'} ({((event.yesPrice ?? 0.5) * 100).toFixed(0)}¢)
                    </button>
                    <button
                      onClick={() => setPaperTradeDialogOpen(true)}
                      className="flex items-center justify-center gap-2 py-3 bg-red-500 hover:bg-red-400 text-white font-semibold rounded-lg transition-all"
                    >
                      <TrendingDown className="w-4 h-4" />
                      {language === 'zh' ? '买 NO' : 'Buy NO'} ({((event.noPrice ?? (1 - (event.yesPrice ?? 0.5))) * 100).toFixed(0)}¢)
                    </button>
                  </div>
                </div>

                {/* Info Cards */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-slate-100 dark:bg-slate-800 rounded-lg p-3">
                    <p className="text-xs text-muted-foreground mb-1">
                      {language === 'zh' ? '如果 YES 获胜' : 'If YES wins'}
                    </p>
                    <p className="text-green-600 dark:text-green-400 font-semibold">
                      +{(((1 - (event.yesPrice ?? 0.5)) / (event.yesPrice ?? 0.5)) * 100).toFixed(0)}%
                    </p>
                  </div>
                  <div className="bg-slate-100 dark:bg-slate-800 rounded-lg p-3">
                    <p className="text-xs text-muted-foreground mb-1">
                      {language === 'zh' ? '如果 NO 获胜' : 'If NO wins'}
                    </p>
                    <p className="text-green-600 dark:text-green-400 font-semibold">
                      +{(((event.yesPrice ?? 0.5) / (1 - (event.yesPrice ?? 0.5))) * 100).toFixed(0)}%
                    </p>
                  </div>
                </div>

                <p className="text-xs text-center text-muted-foreground">
                  {language === 'zh'
                    ? '💡 模拟交易帮助您学习预测市场，准备好后可切换到实盘'
                    : '💡 Paper trading helps you learn prediction markets. Switch to live when ready.'}
                </p>
              </div>
            ) : event.source === 'KALSHI' ? (
              // Kalshi markets use DFlow on Solana - no Privy auth needed
              (() => {
                // Check if this is a multi-option market (outcomes are not standard Yes/No)
                const isMultiOptionMarket = event.outcomes.length >= 2 &&
                  !event.outcomes.some(o => o.name === 'Yes' || o.name === 'No' || o.name === 'YES' || o.name === 'NO');

                return (
                  <div className="space-y-4">
                    {/* Multi-option market: Show outcome selector */}
                    {isMultiOptionMarket && (
                      <div className="space-y-2">
                        <h4 className="text-sm font-medium">{language === 'zh' ? '选择选项' : 'Select Option'}</h4>
                        <div className="grid grid-cols-2 gap-2 max-h-[200px] overflow-y-auto">
                          {event.outcomes.map((outcome, idx) => {
                            const yesPrice = outcome.yesPrice ?? outcome.price ?? 0.5;
                            return (
                              <button
                                key={outcome.id}
                                onClick={() => setSelectedOutcomeIndex(idx)}
                                className={`p-3 rounded-lg border text-left transition-all ${
                                  selectedOutcomeIndex === idx
                                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/30'
                                    : 'border-slate-200 dark:border-slate-700 hover:border-blue-300'
                                }`}
                              >
                                <p className="text-sm font-medium truncate">{outcome.name}</p>
                                <p className="text-xs text-muted-foreground">
                                  {(yesPrice * 100).toFixed(0)}%
                                </p>
                              </button>
                            );
                          })}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {language === 'zh'
                            ? `当前选择: ${event.outcomes[selectedOutcomeIndex]?.name || 'N/A'}`
                            : `Selected: ${event.outcomes[selectedOutcomeIndex]?.name || 'N/A'}`}
                        </p>
                      </div>
                    )}

                    {/* Trading Panel for selected outcome */}
                    {(() => {
                      const selectedOutcome = isMultiOptionMarket
                        ? (event.outcomes[selectedOutcomeIndex] || event.outcomes[0])
                        : event.outcomes[0];
                      const yesPrice = selectedOutcome?.yesPrice ?? selectedOutcome?.price ?? 0.5;
                      const noPrice = selectedOutcome?.noPrice ?? (1 - yesPrice);
                      const marketTicker = selectedOutcome?.marketTicker || selectedOutcome?.id || event.id;

                      return (
                        <DFlowTradingPanel
                          marketTicker={marketTicker}
                          eventTitle={isMultiOptionMarket
                            ? `${event.title} - ${selectedOutcome?.name}`
                            : event.title}
                          outcomes={[
                            {
                              tokenId: selectedOutcome?.tokenId || selectedOutcome?.id || marketTicker,
                              name: 'Yes',
                              price: yesPrice,
                              bestBid: selectedOutcome?.yesBid,
                              bestAsk: selectedOutcome?.yesAsk,
                            },
                            {
                              tokenId: `${selectedOutcome?.tokenId || selectedOutcome?.id || marketTicker}_no`,
                              name: 'No',
                              price: noPrice,
                              bestBid: selectedOutcome?.noBid,
                              bestAsk: selectedOutcome?.noAsk,
                            },
                          ]}
                          initialSide={selectedTradeSide}
                          onTradeComplete={(result) => {
                            if (result.success) {
                              console.log('DFlow trade completed:', result.orderId, result.txSignature);
                            } else {
                              console.error('DFlow trade failed:', result.error);
                            }
                          }}
                          language={language}
                        />
                      );
                    })()}
                  </div>
                );
              })()
            ) : authenticated && walletAddress && accessToken ? (
              // Polymarket uses Polygon - requires Privy auth
              (() => {
                // Check if this is a multi-option market (outcomes are not standard Yes/No)
                const isMultiOptionMarket = event.outcomes.length >= 2 &&
                  !event.outcomes.some(o => o.name === 'Yes' || o.name === 'No' || o.name === 'YES' || o.name === 'NO');

                return (
                  <div className="space-y-4">
                    {/* Multi-option market: Show outcome selector */}
                    {isMultiOptionMarket && (
                      <div className="space-y-2">
                        <h4 className="text-sm font-medium">{language === 'zh' ? '选择选项' : 'Select Option'}</h4>
                        <div className="grid grid-cols-2 gap-2 max-h-[200px] overflow-y-auto">
                          {event.outcomes.map((outcome, idx) => {
                            const yesPrice = outcome.yesPrice ?? outcome.price ?? 0.5;
                            return (
                              <button
                                key={outcome.id}
                                onClick={() => setSelectedOutcomeIndex(idx)}
                                className={`p-3 rounded-lg border text-left transition-all ${
                                  selectedOutcomeIndex === idx
                                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/30'
                                    : 'border-slate-200 dark:border-slate-700 hover:border-blue-300'
                                }`}
                              >
                                <p className="text-sm font-medium truncate">{outcome.name}</p>
                                <p className="text-xs text-muted-foreground">
                                  {(yesPrice * 100).toFixed(0)}%
                                </p>
                              </button>
                            );
                          })}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {language === 'zh'
                            ? `当前选择: ${event.outcomes[selectedOutcomeIndex]?.name || 'N/A'}`
                            : `Selected: ${event.outcomes[selectedOutcomeIndex]?.name || 'N/A'}`}
                        </p>
                      </div>
                    )}

                    {/* Trading Panel */}
                    {(() => {
                      const selectedOutcome = isMultiOptionMarket
                        ? (event.outcomes[selectedOutcomeIndex] || event.outcomes[0])
                        : event.outcomes[0];
                      const yesPrice = selectedOutcome?.yesPrice ?? selectedOutcome?.price ?? 0.5;
                      const noPrice = selectedOutcome?.noPrice ?? (1 - yesPrice);

                      return (
                        <TradingPanel
                          outcomes={[
                            {
                              tokenId: selectedOutcome?.tokenId || selectedOutcome?.id || event.id,
                              name: 'Yes',
                              price: yesPrice,
                              bestBid: selectedOutcome?.yesBid ?? event.bestBid,
                              bestAsk: selectedOutcome?.yesAsk ?? event.bestAsk,
                            },
                            {
                              tokenId: `${selectedOutcome?.tokenId || selectedOutcome?.id || event.id}_no`,
                              name: 'No',
                              price: noPrice,
                              bestBid: selectedOutcome?.noBid ?? (event.bestAsk ? 1 - event.bestAsk : undefined),
                              bestAsk: selectedOutcome?.noAsk ?? (event.bestBid ? 1 - event.bestBid : undefined),
                            },
                          ]}
                          eventTitle={isMultiOptionMarket
                            ? `${event.title} - ${selectedOutcome?.name}`
                            : event.title}
                          walletAddress={walletAddress}
                          accessToken={accessToken}
                          getProvider={async () => {
                            // 获取 Privy wallet 的 EIP-1193 provider
                            if (primaryWallet?.getEthereumProvider) {
                              return primaryWallet.getEthereumProvider();
                            }
                            if (getProvider) {
                              return getProvider();
                            }
                            return null;
                          }}
                          signTypedData={async (domain, types, message, primaryType) => {
                            if (signWithPrivyWallet) {
                              return signWithPrivyWallet(domain, types, message, primaryType);
                            }
                            throw new Error('Signing not available');
                          }}
                          usdcBalance={0} // TODO: 从UserMenu共享余额状态
                          orderMinSize={event.orderMinSize} // 从市场数据获取最小订单大小
                          onTradeComplete={(result) => {
                            if (result.success) {
                              console.log('Trade completed:', result.orderId);
                            } else {
                              console.error('Trade failed:', result.error);
                            }
                          }}
                          language={language}
                        />
                      );
                    })()}
                  </div>
                );
              })()
            ) : (
              <div className="flex flex-col items-center justify-center py-12 space-y-4">
                <div className="w-16 h-16 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center">
                  <Wallet className="w-8 h-8 text-slate-400" />
                </div>
                <div className="text-center">
                  <h4 className="text-lg font-medium mb-2">{t.needLogin}</h4>
                  <p className="text-sm text-muted-foreground mb-4">
                    {t.needLoginDesc}
                  </p>
                </div>
              </div>
            )}

          </TabsContent>
        </Tabs>

        {/* Footer Actions */}
        <div className="mt-4 pt-4 border-t dark:border-slate-800">
          <div className="flex gap-3">
            <Button 
              variant="outline"
              onClick={onClose}
              className="flex-1"
            >
              {t.close}
            </Button>
          </div>
          
          {/* Footer Info */}
          <div className="flex items-center justify-center gap-4 pt-3 text-xs text-muted-foreground mt-2">
            <div className="flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5" />
              <span>{t.deadline}: {new Date(event.endDate).toLocaleDateString(language === 'zh' ? 'zh-CN' : 'en-US', { 
                month: 'short', 
                day: 'numeric',
                year: 'numeric'
              })}</span>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>

    {/* Paper Trade Dialog - rendered outside Radix Dialog to avoid focus trap */}
    {event && (() => {
      // 检测是否为多选市场
      const isMultiOption = event.outcomes.length >= 2 &&
        !event.outcomes.some(o => o.name === 'Yes' || o.name === 'No' || o.name === 'YES' || o.name === 'NO');

      // 获取当前选择的选项
      const selectedOutcome = isMultiOption
        ? (event.outcomes[selectedOutcomeIndex] || event.outcomes[0])
        : event.outcomes[0];

      // 计算价格
      const yesPrice = selectedOutcome?.yesPrice ?? selectedOutcome?.price ?? event.yesPrice ?? 0.5;
      const noPrice = selectedOutcome?.noPrice ?? (1 - yesPrice);

      return (
        <PaperTradeDialog
          open={paperTradeDialogOpen}
          onClose={() => setPaperTradeDialogOpen(false)}
          event={{
            id: event.id,
            title: event.title,
            question: event.title,
            image: event.imageUrl,
            source: event.source,
            yesPrice,
            noPrice,
            yesTokenId: selectedOutcome?.tokenId || selectedOutcome?.id,
            noTokenId: `${selectedOutcome?.tokenId || selectedOutcome?.id}_no`,
            // 多选市场额外数据
            outcomes: event.outcomes,
            isMultiOption,
            selectedOutcomeIndex,
            selectedOutcomeName: selectedOutcome?.name,
            marketTicker: selectedOutcome?.marketTicker || selectedOutcome?.id
          }}
          language={language}
          onOutcomeChange={isMultiOption ? setSelectedOutcomeIndex : undefined}
        />
      );
    })()}
  </>
  );
}
