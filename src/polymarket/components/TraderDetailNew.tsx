import { Card } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Slider } from './ui/slider';
import { Textarea } from './ui/textarea';
import { Checkbox } from './ui/checkbox';
import { Progress } from './ui/progress';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from './ui/collapsible';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from './ui/alert-dialog';
import {
  ArrowLeft,
  Play,
  Pause,
  TrendingUp,
  TrendingDown,
  Minus,
  Activity,
  Sparkles,
  Clock,
  BarChart3,
  Zap,
  AlertCircle,
  RefreshCw,
  Settings,
  Database,
  CheckCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Target,
  Loader2,
  Brain,
  Search,
  Key,
  Bot,
  Shield,
  Wallet
} from 'lucide-react';
import { Trader, TraderDataSources } from '../types';
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { TradingViewPnLChart, PnLDataPoint } from './TradingViewPnLChart';
import { polymarketAPI, paperTradingAPI } from '../../utils/api';
import { usePrivy } from '@privy-io/react-auth';
import { useEventCache } from '../../hooks/useEventCache';
import { ApiKeyDialog } from './ApiKeyDialog';
import { usePrivyDelegation } from '../../hooks/usePrivyDelegation';
import { useSafeWallet } from '../../contexts/SafeWalletContext';
import { useWallet } from '../../contexts/WalletContext';
import { 
  checkAutoTradeStatus, 
  getTraderSchedulerStatus, 
  TraderSchedulerStatus,
  getTraderTradeHistory,
  TraderTrade,
  TraderTradeHistoryResponse,
  getTraderPositions,
  TraderPosition,
  TraderPositionsResponse,
  getTraderPortfolioValue,
  TraderPortfolioValueResponse,
  PortfolioPosition,
  getTraderStats,
  TraderStats
} from '../../services/polymarket/polymarketSafeService';
import {
  fetchPositions as fetchRealPositions,
  Position as RealPosition,
  fetchActivity,
  ActivityItem
} from '../../services/polymarket/portfolioService';
import { dflowPortfolioService, DFlowPosition } from '../../services/dflow/dflowPortfolioService';
import { useRealtimeUpdates, PriceUpdate } from '../../hooks/useRealtimeUpdates';
import { translations } from '../../constants/translations';
import { useAppStore } from '../../contexts/useAppStore';

// 模型 ID 到显示名称的映射
const MODEL_DISPLAY_NAMES: Record<string, string> = {
  // OpenAI
  'openai/gpt-5.2': 'GPT-5.2',
  'openai/gpt-5.1': 'GPT-5.1',
  'openai/gpt-5-pro': 'GPT-5 Pro',
  'openai/gpt-5-mini': 'GPT-5 Mini',
  'openai/gpt-4o': 'GPT-4o',
  'openai/o3-mini': 'o3-mini',
  // Anthropic
  'anthropic/claude-sonnet-4.5': 'Claude 4.5 Sonnet',
  'anthropic/claude-opus-4.5': 'Claude 4.5 Opus',
  'anthropic/claude-haiku-4.5': 'Claude 4.5 Haiku',
  'anthropic/claude-sonnet-4': 'Claude 4 Sonnet',
  // Google
  'google/gemini-3-pro-preview': 'Gemini 3 Pro',
  'google/gemini-2.5-pro': 'Gemini 2.5 Pro',
  'google/gemini-2.5-flash': 'Gemini 2.5 Flash',
  // xAI
  'x-ai/grok-4.1-fast': 'Grok 4.1 Fast',
  'x-ai/grok-4': 'Grok 4',
  'x-ai/grok-4-fast': 'Grok 4 Fast',
  // DeepSeek
  'deepseek/deepseek-r1-0528': 'DeepSeek R1',
  'deepseek/deepseek-r1': 'DeepSeek R1',
  'deepseek/deepseek-chat': 'DeepSeek V3',
  // Qwen
  'qwen/qwen3-coder': 'Qwen3 Coder',
  'qwen/qwen3-max': 'Qwen3 Max',
  'qwen/qwq-32b': 'QwQ 32B',
  // Kimi
  'moonshotai/kimi-k2-0905': 'Kimi K2',
  'moonshotai/kimi-k2-thinking': 'Kimi K2 Thinking',
  'moonshotai/kimi-k2': 'Kimi K2',
  // Llama
  'meta-llama/llama-4-maverick': 'Llama 4 Maverick',
  'meta-llama/llama-4-scout': 'Llama 4 Scout',
  // Mistral
  'mistralai/mistral-large-2512': 'Mistral Large 3',
  'mistralai/codestral-2508': 'Codestral',
  // 旧版兼容
  'deepseek': 'DeepSeek',
  'gpt-4': 'GPT-4',
  'gpt-4o': 'GPT-4o',
  'gpt-4o-mini': 'GPT-4o Mini',
  'claude-3-5-sonnet': 'Claude 3.5 Sonnet',
  'claude-3.5-sonnet': 'Claude 3.5 Sonnet',
};

// 获取模型显示名称
const getModelDisplayName = (modelId: string): string => {
  if (!modelId) return 'DeepSeek';
  return MODEL_DISPLAY_NAMES[modelId] || modelId.split('/').pop() || modelId;
};

interface TraderDetailProps {
  trader: Trader;
  onBack: () => void;
  onUpdate: (updates: Partial<Trader>) => void;
  language?: 'zh' | 'en';
}

// 直接使用 API 返回的分析结果格式（与 AIAnalysisPanel 一致）
interface AnalysisResult {
  id: string;
  timestamp: number;
  eventId: string;
  eventTitle: string;
  aiModel: string;
  summary: string;
  reasoning: {
    questionBreakdown: string[];
    baseRateAnalysis: string;
    factors: Array<{
      name: string;
      impact: 'positive' | 'negative' | 'neutral';
      weight: number;
      explanation: string;
    }>;
    detailedAnalysis: string;
  };
  probability: {
    yes: number;
    confidence: number;
  };
  marketAssessment: {
    currentPrice: number;
    fairValue: number;
    mispricing: number;
    direction: 'underpriced' | 'overpriced' | 'fair';
  };
  decision: {
    action: 'buy_yes' | 'buy_no' | 'sell_yes' | 'sell_no' | 'hold';
    confidence: number;
    reasoning: string;
    riskLevel: 'low' | 'medium' | 'high';
    suggestedPosition: number;
  };
  risks: string[];
  keyInsights: string[];
  // 分析过程步骤（保留与结果一起）
  steps?: Array<{
    id: string;
    step: string;
    content: string;
    status: 'pending' | 'running' | 'completed' | 'failed';
    data?: any;
  }>;
}

// 格式化时间差
const formatTimeSince = (timestamp: number | null, lang: 'zh' | 'en' = 'zh'): string => {
  if (!timestamp) return lang === 'zh' ? '从未' : 'Never';
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return lang === 'zh' ? `${seconds}秒前` : `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return lang === 'zh' ? `${minutes}分钟前` : `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return lang === 'zh' ? `${hours}小时前` : `${hours}h ago`;
};

// 格式化数据源显示
const formatDataSources = (dataSources: TraderDataSources, lang: 'zh' | 'en' = 'zh'): string[] => {
  const labels: Record<string, Record<string, string>> = {
    marketDepth: { zh: '市场深度', en: 'Market Depth' },
    historyData: { zh: '历史数据', en: 'Historical Data' },
    relatedEvents: { zh: '关联事件', en: 'Related Events' },
    technicalIndicators: { zh: '技术指标', en: 'Technical Indicators' },
    participantBehavior: { zh: '参与者行为', en: 'Participant Behavior' },
    userAccount: { zh: '用户账户', en: 'User Account' },
    reddit: { zh: '💬 Reddit', en: '💬 Reddit' },
    googleNews: { zh: '📰 新闻', en: '📰 News' }
  };
  return Object.entries(dataSources)
    .filter(([_, enabled]) => enabled)
    .map(([key]) => labels[key]?.[lang] || key);
};

export function TraderDetail({ trader, onBack, onUpdate, language = 'zh' }: TraderDetailProps) {
  const t = translations[language]?.polymarketPage?.traderDetail || translations.en.polymarketPage.traderDetail;
  const tAi = translations[language]?.polymarketPage?.aiAnalysis || translations.en.polymarketPage.aiAnalysis;

  // 检查是否为模拟盘 Trader（检查 isPaper 标记或 ID 前缀，兼容新旧数据）
  const isPaperTrader = trader.isPaper === true || trader.id.startsWith('paper-trader-');
  const isPaperTrading = useAppStore((state) => state.isPaperTrading);

  // 模拟盘分析历史使用 localStorage（与实盘完全独立）
  const paperAnalysisHistory = useAppStore((state) => state.paperAnalysisHistory);
  const addPaperAnalysisHistory = useAppStore((state) => state.addPaperAnalysisHistory);

  // 模拟盘数据（需要在 fetch 函数之前声明，因为 fetch 函数依赖这些数据）
  const paperPositions = useAppStore((state) => state.paperPositions);
  const paperTradeHistory = useAppStore((state) => state.paperTradeHistory);
  const paperBalance = useAppStore((state) => state.paperBalance);

  // 投资组合价值状态
  const initialCapital = trader.capital || 1000;
  const [portfolioValue, setPortfolioValue] = useState(trader.totalValue || initialCapital);
  const [totalPnL, setTotalPnL] = useState(trader.totalPnL || 0);
  const [portfolioData, setPortfolioData] = useState<TraderPortfolioValueResponse | null>(null);
  const [isLoadingPortfolio, setIsLoadingPortfolio] = useState(false);
  const [analysisReports, setAnalysisReports] = useState<AnalysisResult[]>([]);
  const [nextAnalysisTime, setNextAnalysisTime] = useState<number | null>(null);
  const [chartData, setChartData] = useState<PnLDataPoint[]>([
    { timestamp: trader.createdAt || Date.now(), value: initialCapital }
  ]);
  const [executedTrades, setExecutedTrades] = useState<number>(0);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [currentEventIndex, setCurrentEventIndex] = useState(0);
  const [showConfig, setShowConfig] = useState(false);

  // 事件分析间隔控制
  const [intervalInputValue, setIntervalInputValue] = useState(String(trader.analysisInterval || 15));
  const [intervalError, setIntervalError] = useState('');
  const [currentAnalyzingEvent, setCurrentAnalyzingEvent] = useState<string | null>(null);
  const [expandedReports, setExpandedReports] = useState<Set<string>>(new Set());
  const [countdown, setCountdown] = useState<number>(0);

  // 分析步骤状态（与 AIAnalysisPanel 一致）
  const [analysisSteps, setAnalysisSteps] = useState<Array<{
    id: string;
    step: string;
    content: string;
    status: 'pending' | 'running' | 'completed' | 'failed';
    data?: any;
  }>>([]);
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set());
  const [isAnalysisProcessExpanded, setIsAnalysisProcessExpanded] = useState(true); // 控制整个分析过程卡片的折叠
  const currentStepsRef = useRef<typeof analysisSteps>([]); // 用于捕获当前分析的步骤，保存到结果中
  const [showApiKeyDialog, setShowApiKeyDialog] = useState(false);
  const [showInsufficientBalanceDialog, setShowInsufficientBalanceDialog] = useState(false);
  const [expandedSearchContent, setExpandedSearchContent] = useState(false);

  // 可编辑配置状态
  const [editAiModel, setEditAiModel] = useState(trader.aiModel || 'deepseek');
  const [editPrompt, setEditPrompt] = useState(trader.prompt || '');
  const [editMinConfidence, setEditMinConfidence] = useState([trader.minConfidence || 65]);
  const [editMaxPosition, setEditMaxPosition] = useState([trader.maxPosition || 30]);
  const [editStopLoss, setEditStopLoss] = useState([trader.stopLossPrice || 20]);
  const [editTakeProfit, setEditTakeProfit] = useState([trader.takeProfitPrice || 80]);
  const [editNewsWeight, setEditNewsWeight] = useState([trader.newsWeight || 40]);
  const [editDataWeight, setEditDataWeight] = useState([trader.dataWeight || 35]);
  const [editSentimentWeight, setEditSentimentWeight] = useState([trader.sentimentWeight || 25]);
  const [editDataSources, setEditDataSources] = useState(trader.dataSources || {
    marketDepth: true,
    historyData: true,
    relatedEvents: false,
    technicalIndicators: false,
    participantBehavior: false,
    userAccount: false,
  });

  const { user, getAccessToken } = usePrivy();
  const userAddress = user?.wallet?.address || null;

  // Session Signer (自动交易授权)
  const { status: delegationStatus, requestDelegation, refreshStatus: refreshDelegationStatus } = usePrivyDelegation();
  
  // Safe 钱包状态 (Polymarket - Polygon)
  const { safeAddress, isReady: safeReady, usdcBalance, refreshBalance } = useSafeWallet();
  
  // Multi-chain wallet balances (for Kalshi - Solana)
  const { solanaAddress, solanaBalance, refreshSolanaBalance } = useWallet();

  // 自动交易确认对话框
  const [showAutoTradeConfirm, setShowAutoTradeConfirm] = useState(false);
  const [isEnablingDelegation, setIsEnablingDelegation] = useState(false);
  
  // 交易执行状态
  const [lastTradeResult, setLastTradeResult] = useState<{
    success: boolean;
    orderId?: string;
    errorMsg?: string;
    timestamp: number;
  } | null>(null);

  // 后端调度器状态
  const [schedulerStatus, setSchedulerStatus] = useState<TraderSchedulerStatus | null>(null);
  const [isLoadingScheduler, setIsLoadingScheduler] = useState(false);

  // 交易历史状态
  const [tradeHistory, setTradeHistory] = useState<TraderTrade[]>([]);
  const [tradeStats, setTradeStats] = useState<TraderTradeHistoryResponse['stats'] | null>(null);
  const [isLoadingTradeHistory, setIsLoadingTradeHistory] = useState(false);
  const [showTradeHistory, setShowTradeHistory] = useState(false);

  // 持仓状态
  const [positions, setPositions] = useState<TraderPosition[]>([]);
  const [positionsSummary, setPositionsSummary] = useState<TraderPositionsResponse['summary'] | null>(null);
  const [isLoadingPositions, setIsLoadingPositions] = useState(false);
  const [showPositions, setShowPositions] = useState(true); // 默认展开

  // 性能统计状态
  const [traderStats, setTraderStats] = useState<TraderStats | null>(null);
  const [isLoadingStats, setIsLoadingStats] = useState(false);

  // 实时价格缓存（用于即时更新 UI）
  const [realtimePrices, setRealtimePrices] = useState<Map<string, number>>(new Map());

  // 获取持仓的 tokenIds 用于订阅实时价格
  // 使用 useRef + useMemo 确保只在 tokenIds 内容真正变化时才返回新数组引用
  // 这样可以避免每次 positions 刷新（即使内容不变）都触发 useRealtimeUpdates 重新订阅
  const prevTokenIdsKeyRef = useRef<string>('');
  const stableTokenIdsRef = useRef<string[]>([]);
  
  const positionTokenIds = useMemo(() => {
    const newTokenIds = positions.map(p => p.tokenId);
    const newKey = [...newTokenIds].sort().join(',');
    
    // 只有当 tokenIds 内容真正变化时才返回新数组
    if (newKey !== prevTokenIdsKeyRef.current) {
      prevTokenIdsKeyRef.current = newKey;
      stableTokenIdsRef.current = newTokenIds;
    }
    
    return stableTokenIdsRef.current;
  }, [positions]);

  // SSE 实时更新 - 只有 trader 运行时才连接
  const { isConnected: sseConnected } = useRealtimeUpdates({
    tokenIds: positionTokenIds,
    enabled: trader.isActive, // 只在 trader 运行时连接，节省资源
    onPriceUpdate: useCallback((data: PriceUpdate) => {
      console.log('[SSE] 📊 Price update received:', data.tokenId.substring(0, 10), '→', data.price);
      // 更新实时价格缓存
      setRealtimePrices(prev => {
        const newMap = new Map(prev);
        newMap.set(data.tokenId, data.price);
        return newMap;
      });
      
      // 重新计算持仓价值（使用最新价格）
      if (portfolioData) {
        const updatedPositions = portfolioData.positions.map(pos => {
          if (pos.tokenId === data.tokenId) {
            const newValue = pos.size * data.price;
            const newPnl = newValue - pos.cost;
            return {
              ...pos,
              currentPrice: data.price,
              currentValue: newValue,
              pnl: newPnl,
              pnlPercent: pos.cost > 0 ? (newPnl / pos.cost) * 100 : 0,
            };
          }
          return pos;
        });

        // 更新总价值
        const newTotalPositionsValue = updatedPositions.reduce((sum, p) => sum + p.currentValue, 0);
        const newTotalPnL = updatedPositions.reduce((sum, p) => sum + p.pnl, 0);

        setPortfolioData({
          ...portfolioData,
          positions: updatedPositions,
          positionsValue: newTotalPositionsValue,
          totalPnL: newTotalPnL,
        });

        // 更新图表数据
        setPortfolioValue(portfolioData.availableCash + newTotalPositionsValue);
      }
    }, [portfolioData]),
  });

  // 事件缓存
  const { events, isLoading: eventsLoading, lastRefresh, refreshEvents, isExpired } = useEventCache(trader.eventIds);

  // 使用 ref 来避免 stale closure 和无限循环
  const analysisTimerRef = useRef<NodeJS.Timeout | null>(null);
  const onUpdateRef = useRef(onUpdate);
  const runAnalysisRef = useRef<() => Promise<void>>();

  useEffect(() => {
    onUpdateRef.current = onUpdate;
  }, [onUpdate]);

  // 获取后端调度器状态
  // 注意：模拟盘模式下不需要后端调度器
  const fetchSchedulerStatus = useCallback(async () => {
    if (!trader.id) return;

    // 模拟盘不需要后端调度器状态
    if (isPaperTrader || isPaperTrading) {
      setSchedulerStatus(null);
      return;
    }

    setIsLoadingScheduler(true);
    try {
      const accessToken = await getAccessToken();
      if (!accessToken) return;

      const status = await getTraderSchedulerStatus(accessToken, trader.id);
      setSchedulerStatus(status);
    } catch (error) {
      console.error('Failed to fetch scheduler status:', error);
    } finally {
      setIsLoadingScheduler(false);
    }
  }, [trader.id, getAccessToken, isPaperTrader, isPaperTrading]);

  // 获取交易历史 - 从 Polymarket Data API 获取真实链上数据
  // 只显示该 Trader 监控事件相关的交易
  // 模拟盘模式下加载模拟交易历史
  const fetchTradeHistoryFromChain = useCallback(async () => {
    // 模拟盘模式：加载模拟交易历史
    if (isPaperTrader || isPaperTrading) {
      setIsLoadingTradeHistory(true);
      try {
        // 获取该 Trader 监控的事件 ID 列表
        const monitoredEventIds = new Set(trader.eventIds || []);

        // 使用 getState() 获取最新数据，避免依赖项频繁触发
        const { paperTradeHistory: currentPaperTradeHistory } = useAppStore.getState();

        // 从 paperTradeHistory 转换为 TraderTrade 格式
        const allTrades: TraderTrade[] = (currentPaperTradeHistory || []).map((trade: any) => ({
          id: trade.id || `paper-${Date.now()}-${Math.random()}`,
          eventId: trade.conditionId || trade.eventId || '',
          eventTitle: trade.eventTitle || trade.title || '',
          tokenId: trade.tokenId || '',
          side: trade.side || (trade.outcome === 'Yes' ? 'YES' : trade.outcome === 'No' ? 'NO' : trade.outcome) || 'YES',
          amount: trade.amount || (trade.size * trade.price) || 0,
          price: trade.price || trade.entryPrice || 0,
          orderId: null,
          status: 'executed' as const,
          errorMessage: null,
          signalSource: 'ai' as const,
          signalConfidence: trade.confidence || null,
          createdAt: trade.executedAt || trade.createdAt || new Date().toISOString(),
          executedAt: trade.executedAt || trade.createdAt || new Date().toISOString(),
        }));

        // 筛选：只保留该 Trader 监控事件中的交易
        const filteredTrades = monitoredEventIds.size > 0
          ? allTrades.filter(t => monitoredEventIds.has(t.eventId))
          : allTrades;

        // 调试日志
        console.log(`[TradeHistory] 📝 模拟盘调试:`);
        console.log(`  - Trader 监控的 eventIds:`, Array.from(monitoredEventIds));
        console.log(`  - 全部模拟交易:`, allTrades.map(t => ({ eventId: t.eventId, title: t.eventTitle })));
        console.log(`[TradeHistory] 📝 模拟盘交易: ${allTrades.length}, 该 Trader 监控事件: ${filteredTrades.length}`);

        setTradeHistory(filteredTrades);

        // 计算统计数据
        const stats = {
          totalTrades: filteredTrades.length,
          executedTrades: filteredTrades.length, // 模拟交易都是已执行
          failedTrades: 0,
          totalVolume: filteredTrades.reduce((sum, t) => sum + (parseFloat(String(t.amount)) || 0), 0),
        };
        setTradeStats(stats);
        setExecutedTrades(stats.executedTrades);
      } finally {
        setIsLoadingTradeHistory(false);
      }
      return;
    }

    // 实盘模式：从链上获取
    if (!safeAddress) return;

    setIsLoadingTradeHistory(true);
    try {
      // 从 Polymarket Data API 获取真实交易活动
      const activity = await fetchActivity(safeAddress, 100); // 获取更多以便筛选后有足够数据

      // 获取该 Trader 监控的事件 ID 列表
      const monitoredEventIds = new Set(trader.eventIds || []);

      // 转换为 TraderTrade 格式
      const allTrades: TraderTrade[] = activity.map((item: ActivityItem) => ({
        id: item.id,
        eventId: item.conditionId || item.tokenId,
        eventTitle: item.title,
        tokenId: item.tokenId,
        side: item.side,
        amount: item.total,
        price: item.price,
        orderId: item.transactionHash || null,
        status: item.status === 'confirmed' ? 'executed' : 'pending',
        errorMessage: null,
        signalSource: 'manual',
        signalConfidence: null,
        createdAt: item.timestamp,
        executedAt: item.timestamp,
      }));

      // 筛选：只保留该 Trader 监控事件中的交易
      const filteredTrades = monitoredEventIds.size > 0
        ? allTrades.filter(t => monitoredEventIds.has(t.eventId))
        : allTrades;

      console.log(`[TradeHistory] 总交易: ${allTrades.length}, 该 Trader 监控事件交易: ${filteredTrades.length}`);

      setTradeHistory(filteredTrades);

      // 计算统计数据（仅限筛选后的交易）
      const stats = {
        totalTrades: filteredTrades.length,
        executedTrades: filteredTrades.filter(t => t.status === 'executed').length,
        failedTrades: filteredTrades.filter(t => t.status === 'failed').length,
        totalVolume: filteredTrades.reduce((sum, t) => sum + (parseFloat(String(t.amount)) || 0), 0),
      };
      setTradeStats(stats);
      setExecutedTrades(stats.executedTrades);
    } catch (error) {
      console.error('Failed to fetch trade history from chain:', error);
      // 回退到数据库数据
      try {
        const accessToken = await getAccessToken();
        if (accessToken) {
          const response = await getTraderTradeHistory(accessToken, trader.id);
          if (response) {
            setTradeHistory(response.trades);
            setTradeStats(response.stats);
            setExecutedTrades(response.stats.executedTrades);
          }
        }
      } catch (fallbackError) {
        console.error('Fallback to database also failed:', fallbackError);
      }
    } finally {
      setIsLoadingTradeHistory(false);
    }
  // 注意：paperTradeHistory 使用 useAppStore.getState() 获取，避免频繁触发重新执行
  }, [safeAddress, trader.id, trader.eventIds, getAccessToken, isPaperTrader, isPaperTrading]);

  // 定期获取调度器状态（当 Trader 激活时）
  useEffect(() => {
    if (trader.isActive) {
      // 立即获取一次
      fetchSchedulerStatus();

      // 每 30 秒刷新一次
      const intervalId = setInterval(fetchSchedulerStatus, 30000);

      return () => clearInterval(intervalId);
    }
  }, [trader.isActive, fetchSchedulerStatus]);

  // 获取交易历史（展开时或组件加载时）
  useEffect(() => {
    if (showTradeHistory) {
      fetchTradeHistoryFromChain();
    }
  }, [showTradeHistory, fetchTradeHistoryFromChain]);

  // 组件加载时获取一次交易历史统计（当 safeAddress 或监控事件变化时）
  useEffect(() => {
    fetchTradeHistoryFromChain();
  }, [fetchTradeHistoryFromChain]);

  // 获取持仓 - 从 Polymarket Data API 获取真实链上数据
  // 只显示该 Trader 监控事件相关的持仓
  // 模拟盘模式下加载模拟持仓
  const fetchPositionsFromChain = useCallback(async () => {
    // 模拟盘模式：加载模拟持仓
    if (isPaperTrader || isPaperTrading) {
      setIsLoadingPositions(true);
      try {
        // 获取该 Trader 监控的事件 ID 列表
        const monitoredEventIds = new Set(trader.eventIds || []);

        // 使用 getState() 获取最新数据，避免依赖项频繁触发
        const { paperPositions: currentPaperPositions } = useAppStore.getState();

        // 从 paperPositions 转换为 TraderPosition 格式
        const allPositions: TraderPosition[] = (currentPaperPositions || []).map((pos: any) => ({
          tokenId: pos.tokenId || '',
          eventId: pos.conditionId || pos.eventId || '',
          eventTitle: pos.eventTitle || pos.title || '',
          outcome: (pos.side === 'YES' ? 'Yes' : pos.side === 'NO' ? 'No' : pos.outcome || 'Yes') as 'Yes' | 'No' | 'Unknown',
          size: parseFloat(pos.size) || parseFloat(pos.shares) || 0,
          avgPrice: parseFloat(pos.entryPrice) || parseFloat(pos.avgPrice) || 0,
          cost: parseFloat(pos.totalCost) || (parseFloat(pos.size || pos.shares || 0) * parseFloat(pos.entryPrice || pos.avgPrice || 0)),
          tradesCount: 0,
          lastTrade: null,
        }));

        // 筛选：只保留该 Trader 监控事件中的持仓
        const filteredPositions = monitoredEventIds.size > 0
          ? allPositions.filter(p => monitoredEventIds.has(p.eventId))
          : allPositions;

        // 调试日志
        console.log(`[Positions] 📝 模拟盘调试:`);
        console.log(`  - Trader 监控的 eventIds:`, Array.from(monitoredEventIds));
        console.log(`  - 全部模拟持仓:`, allPositions.map(p => ({ eventId: p.eventId, title: p.eventTitle })));
        console.log(`[Positions] 📝 模拟盘持仓: ${allPositions.length}, 该 Trader 监控事件: ${filteredPositions.length}`);

        setPositions(filteredPositions);

        // 计算摘要
        const summary = {
          totalPositions: filteredPositions.length,
          totalCost: filteredPositions.reduce((sum, p) => sum + p.cost, 0),
          totalTrades: 0,
        };
        setPositionsSummary(summary);
      } finally {
        setIsLoadingPositions(false);
      }
      return;
    }

    // 实盘模式：从链上获取
    if (!safeAddress) return;

    setIsLoadingPositions(true);
    try {
      // 从 Polymarket Data API 获取真实持仓
      const realPositions = await fetchRealPositions(safeAddress);

      // 获取该 Trader 监控的事件 ID 列表
      const monitoredEventIds = new Set(trader.eventIds || []);

      // 转换为 TraderPosition 格式，并筛选只属于该 Trader 监控事件的持仓
      const allPositions: TraderPosition[] = realPositions.map(p => ({
        tokenId: p.tokenId,
        eventId: p.conditionId,
        eventTitle: p.title,
        outcome: p.outcome as 'Yes' | 'No' | 'Unknown',
        size: p.size,
        avgPrice: p.avgPrice,
        cost: p.cost,
        tradesCount: 0,
        lastTrade: null,
      }));

      // 筛选：只保留该 Trader 监控事件中的持仓
      // conditionId 就是 eventId
      const filteredPositions = monitoredEventIds.size > 0
        ? allPositions.filter(p => monitoredEventIds.has(p.eventId))
        : allPositions; // 如果没有监控任何事件，显示全部

      console.log(`[Positions] 总持仓: ${allPositions.length}, 该 Trader 监控事件持仓: ${filteredPositions.length}`);

      setPositions(filteredPositions);

      // 计算摘要
      const summary = {
        totalPositions: filteredPositions.length,
        totalCost: filteredPositions.reduce((sum, p) => sum + p.cost, 0),
        totalTrades: 0,
      };
      setPositionsSummary(summary);
    } catch (error) {
      console.error('Failed to fetch positions from chain:', error);
      // 回退到数据库
      try {
        const accessToken = await getAccessToken();
        if (accessToken) {
          const response = await getTraderPositions(accessToken, trader.id);
          if (response) {
            setPositions(response.positions);
            setPositionsSummary(response.summary);
          }
        }
      } catch (fallbackError) {
        console.error('Fallback to database also failed:', fallbackError);
      }
    } finally {
      setIsLoadingPositions(false);
    }
  // 注意：paperPositions 使用 useAppStore.getState() 获取，避免频繁触发重新执行
  }, [safeAddress, trader.id, trader.eventIds, getAccessToken, isPaperTrader, isPaperTrading]);

  // 组件加载时获取持仓（当 safeAddress 或监控事件变化时）
  useEffect(() => {
    fetchPositionsFromChain();
  }, [fetchPositionsFromChain]);

  // 获取性能统计
  // 模拟盘 Trader: 从本地数据计算统计
  // 实盘 Trader: 从后端 API 获取
  const fetchTraderStats = useCallback(async () => {
    if (!trader.id) return;

    // 模拟盘 Trader: 从本地 paperTradeHistory 计算统计
    if (isPaperTrader || isPaperTrading) {
      setIsLoadingStats(true);
      try {
        // 获取该 Trader 监控的事件 ID 列表
        const monitoredEventIds = new Set(trader.eventIds || []);

        // 使用 getState() 获取最新数据，避免依赖项频繁触发
        const { paperTradeHistory: currentPaperTradeHistory, paperPositions: currentPaperPositions, paperBalance: currentPaperBalance } = useAppStore.getState();

        // 筛选该 Trader 监控事件中的交易
        const trades = (currentPaperTradeHistory || []).filter((t: any) => {
          const eventId = t.conditionId || t.eventId || '';
          return monitoredEventIds.size === 0 || monitoredEventIds.has(eventId);
        });

        // 计算交易统计
        const buyTrades = trades.filter((t: any) => t.action === 'BUY').length;
        const sellTrades = trades.filter((t: any) => t.action === 'SELL').length;
        const totalTrades = trades.length;

        // 计算盈亏（从已平仓交易）
        let realizedPnL = 0;
        let winCount = 0;
        let lossCount = 0;

        // 计算 SELL 交易的盈亏
        trades.filter((t: any) => t.action === 'SELL').forEach((t: any) => {
          const pnl = t.pnl || t.profit || 0;
          realizedPnL += pnl;
          if (pnl > 0) winCount++;
          else if (pnl < 0) lossCount++;
        });

        // 计算当前持仓的未实现盈亏
        const filteredPositions = (currentPaperPositions || []).filter((p: any) => {
          const eventId = p.conditionId || p.eventId || '';
          return monitoredEventIds.size === 0 || monitoredEventIds.has(eventId);
        });

        const unrealizedPnL = filteredPositions.reduce((sum: number, pos: any) => {
          return sum + (parseFloat(pos.unrealizedPnL) || 0);
        }, 0);

        const totalPnL = realizedPnL + unrealizedPnL;
        const initial = trader.capital || currentPaperBalance || 10000;
        const totalPnLPercent = initial > 0 ? (totalPnL / initial) * 100 : 0;
        const roi = totalPnLPercent;
        const winRate = (winCount + lossCount) > 0 ? (winCount / (winCount + lossCount)) * 100 : 0;

        const stats: TraderStats = {
          traderId: trader.id,
          traderName: trader.name,
          initialCapital: initial,
          currentValue: initial + totalPnL,
          totalTrades,
          buyTrades,
          sellTrades,
          totalPnL,
          realizedPnL,
          unrealizedPnL,
          totalPnLPercent,
          winRate,
          winCount,
          lossCount,
          averageReturn: totalTrades > 0 ? totalPnL / totalTrades : 0,
          bestTrade: 0,
          worstTrade: 0,
          maxDrawdown: 0,
          maxDrawdownPercent: 0,
          roi,
          firstTradeAt: trades.length > 0 ? trades[trades.length - 1]?.executedAt || null : null,
          lastTradeAt: trades.length > 0 ? trades[0]?.executedAt || null : null,
          tradingDays: 0,
          avgTradesPerDay: 0,
        };

        console.log('[TraderStats] 📝 模拟盘统计:', stats);
        setTraderStats(stats);
      } finally {
        setIsLoadingStats(false);
      }
      return;
    }

    // 实盘 Trader: 从后端 API 获取
    setIsLoadingStats(true);
    try {
      const accessToken = await getAccessToken();
      if (!accessToken) return;

      const response = await getTraderStats(accessToken, trader.id);
      if (response) {
        setTraderStats(response);
      }
    } catch (error) {
      console.error('Failed to fetch trader stats:', error);
    } finally {
      setIsLoadingStats(false);
    }
  // 注意：paperTradeHistory, paperPositions, paperBalance 使用 useAppStore.getState() 获取，避免频繁触发重新执行
  }, [trader.id, trader.name, trader.capital, trader.eventIds, isPaperTrader, isPaperTrading, getAccessToken]);

  // 组件加载时获取性能统计
  // 模拟盘时需要在交易历史更新后重新计算
  useEffect(() => {
    fetchTraderStats();
  }, [fetchTraderStats]);

  // 获取投资组合实时价值
  // 从 Polymarket Data API 获取真实持仓并计算收益
  // 只计算该 Trader 监控事件相关的持仓
  // 模拟盘模式下使用模拟数据计算
  const fetchPortfolioValue = useCallback(async () => {
    // 模拟盘模式：使用模拟持仓计算
    if (isPaperTrader || isPaperTrading) {
      setIsLoadingPortfolio(true);
      try {
        // 获取该 Trader 监控的事件 ID 列表
        const monitoredEventIds = new Set(trader.eventIds || []);

        // 使用 getState() 获取最新数据，避免依赖项频繁触发
        const { paperPositions: currentPaperPositions, paperBalance: currentPaperBalance } = useAppStore.getState();

        // 从 paperPositions 转换格式
        const allPaperPositions = (currentPaperPositions || []).map((pos: any) => {
          const size = parseFloat(pos.size) || parseFloat(pos.shares) || 0;
          const entryPrice = parseFloat(pos.entryPrice) || parseFloat(pos.avgPrice) || 0;
          const cost = parseFloat(pos.totalCost) || (size * entryPrice);
          // 模拟盘暂时用入场价作为当前价（实际应该从市场获取实时价格）
          const currentPrice = entryPrice;
          const currentValue = size * currentPrice;
          const pnl = currentValue - cost;
          const pnlPercent = cost > 0 ? (pnl / cost) * 100 : 0;

          return {
            tokenId: pos.tokenId || '',
            eventId: pos.conditionId || pos.eventId || '',
            eventTitle: pos.eventTitle || pos.title || '',
            outcome: (pos.side === 'YES' ? 'Yes' : pos.side === 'NO' ? 'No' : pos.outcome || 'Yes') as 'Yes' | 'No' | 'Unknown',
            size,
            avgPrice: entryPrice,
            currentPrice,
            cost,
            value: currentValue,
            pnl,
            pnlPercent,
          };
        });

        // 筛选：只保留该 Trader 监控事件中的持仓
        const filteredPositions = monitoredEventIds.size > 0
          ? allPaperPositions.filter((p: any) => monitoredEventIds.has(p.eventId))
          : allPaperPositions;

        console.log(`[Portfolio] 📝 模拟盘持仓: ${allPaperPositions.length}, 该 Trader 监控事件: ${filteredPositions.length}`);

        // 计算总持仓价值和 PnL
        const positionsValue = filteredPositions.reduce((sum: number, p: any) => sum + p.value, 0);
        const totalPositionsPnL = filteredPositions.reduce((sum: number, p: any) => sum + p.pnl, 0);
        const totalCost = filteredPositions.reduce((sum: number, p: any) => sum + p.cost, 0);
        const pnlPercent = totalCost > 0 ? (totalPositionsPnL / totalCost) * 100 : 0;

        // 使用模拟盘余额
        const currentBalance = currentPaperBalance || 0;
        const currentValue = positionsValue + currentBalance;

        // 构建响应
        const response: TraderPortfolioValueResponse = {
          initialCapital: 10000, // 模拟盘初始资金
          currentValue,
          positionsValue,
          availableCash: currentBalance,
          totalPnL: totalPositionsPnL,
          totalPnLPercent: pnlPercent,
          positions: filteredPositions.map((p: any) => ({
            tokenId: p.tokenId,
            eventId: p.eventId,
            eventTitle: p.eventTitle,
            outcome: p.outcome,
            size: p.size,
            avgPrice: p.avgPrice,
            currentPrice: p.currentPrice,
            cost: p.cost,
            currentValue: p.value,
            pnl: p.pnl,
            pnlPercent: p.pnlPercent,
            priceFromCache: false,
          })),
          totalSpent: totalCost,
          totalReceived: 0,
          lastUpdated: new Date().toISOString(),
        };

        setPortfolioData(response);
        setPortfolioValue(currentValue);
        setTotalPnL(totalPositionsPnL);

        // 更新图表数据
        setChartData(prev => {
          const now = Date.now();
          const lastPoint = prev[prev.length - 1];
          if (lastPoint && now - lastPoint.timestamp < 60000) {
            const updated = [...prev];
            updated[updated.length - 1] = { ...lastPoint, value: currentValue };
            return updated;
          }
          return [...prev, { timestamp: now, value: currentValue }];
        });
      } finally {
        setIsLoadingPortfolio(false);
      }
      return;
    }

    // 实盘模式：从链上获取
    if (!safeAddress) return;

    setIsLoadingPortfolio(true);
    try {
      // 从 Polymarket Data API 获取真实持仓
      const allPositions = await fetchRealPositions(safeAddress);

      // 获取该 Trader 监控的事件 ID 列表
      const monitoredEventIds = new Set(trader.eventIds || []);

      // 筛选：只保留该 Trader 监控事件中的持仓
      const realPositions = monitoredEventIds.size > 0
        ? allPositions.filter(p => monitoredEventIds.has(p.conditionId))
        : allPositions;

      // 计算总持仓价值和 PnL（仅限该 Trader 监控的持仓）
      const positionsValue = realPositions.reduce((sum, p) => sum + p.value, 0);
      const totalPositionsPnL = realPositions.reduce((sum, p) => sum + p.pnl, 0);
      const totalCost = realPositions.reduce((sum, p) => sum + p.cost, 0);
      const pnlPercent = totalCost > 0 ? (totalPositionsPnL / totalCost) * 100 : 0;

      // 获取 USDC 余额
      const currentBalance = usdcBalance || 0;
      const currentValue = positionsValue + currentBalance;

      // 构建与后端 API 相同格式的响应
      const response: TraderPortfolioValueResponse = {
        initialCapital,
        currentValue,
        positionsValue,
        availableCash: currentBalance,
        totalPnL: totalPositionsPnL,
        totalPnLPercent: pnlPercent,
        positions: realPositions.map(p => ({
          tokenId: p.tokenId,
          eventId: p.conditionId,
          eventTitle: p.title,
          outcome: p.outcome as 'Yes' | 'No' | 'Unknown',
          size: p.size,
          avgPrice: p.avgPrice,
          currentPrice: p.currentPrice,
          cost: p.cost,
          currentValue: p.value,
          pnl: p.pnl,
          pnlPercent: p.pnlPercent,
          priceFromCache: true,
        })),
        totalSpent: totalCost,
        totalReceived: 0,
        lastUpdated: new Date().toISOString(),
      };

      setPortfolioData(response);
      setPortfolioValue(currentValue);
      setTotalPnL(totalPositionsPnL);

      // 更新图表数据 - 添加新的数据点
      setChartData(prev => {
        const now = Date.now();
        const lastPoint = prev[prev.length - 1];

        // 如果数据点时间太近（< 1分钟），更新最后一个点
        if (lastPoint && now - lastPoint.timestamp < 60000) {
          const updated = [...prev];
          updated[updated.length - 1] = {
            ...lastPoint,
            value: currentValue
          };
          return updated;
        }

        // 否则添加新的数据点
        return [...prev, {
          timestamp: now,
          value: currentValue
        }];
      });
    } catch (error) {
      console.error('Failed to fetch portfolio value from chain:', error);
      // 回退到后端 API
      try {
        const accessToken = await getAccessToken();
        if (accessToken) {
          const response = await getTraderPortfolioValue(accessToken, trader.id);
          if (response) {
            setPortfolioData(response);
            setPortfolioValue(response.currentValue);
            setTotalPnL(response.totalPnL);
          }
        }
      } catch (fallbackError) {
        console.error('Fallback to database also failed:', fallbackError);
      }
    } finally {
      setIsLoadingPortfolio(false);
    }
  // 注意：paperPositions 和 paperBalance 使用 useAppStore.getState() 获取，避免频繁触发重新执行
  }, [safeAddress, usdcBalance, initialCapital, trader.id, trader.eventIds, getAccessToken, isPaperTrader, isPaperTrading]);

  // 组件加载时获取投资组合价值（当相关依赖变化时）
  useEffect(() => {
    fetchPortfolioValue();
  }, [fetchPortfolioValue]);

  // 页面可见性状态
  const [isPageVisible, setIsPageVisible] = useState(true);
  
  // 监听页面可见性变化
  useEffect(() => {
    const handleVisibilityChange = () => {
      const visible = document.visibilityState === 'visible';
      setIsPageVisible(visible);
      // 页面变为可见时立即刷新
      if (visible && trader.isActive) {
        fetchPortfolioValue();
        fetchPositionsFromChain();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [trader.isActive, fetchPortfolioValue, fetchPositionsFromChain]);

  // 定时刷新投资组合价值（每 10 秒，因为后端有价格缓存，响应很快）
  // 仅在 Trader 激活且页面可见时刷新
  useEffect(() => {
    if (!trader.isActive || !isPageVisible) return;

    const intervalId = setInterval(fetchPortfolioValue, 10000);
    return () => clearInterval(intervalId);
  }, [trader.isActive, isPageVisible, fetchPortfolioValue]);

  // 验证时间间隔输入
  const validateInterval = (value: string): string => {
    if (!value || value.trim() === '') {
      return '请输入时间间隔';
    }
    const numValue = Number(value);
    if (isNaN(numValue)) {
      return language === 'zh' ? '请输入有效的数字' : 'Please enter a valid number';
    }
    if (!Number.isInteger(numValue) || numValue <= 0) {
      return language === 'zh' ? '请输入正整数' : 'Please enter a positive integer';
    }
    if (numValue < 1) {
      return language === 'zh' ? '时间间隔至少为1分钟' : 'Interval must be at least 1 minute';
    }
    if (numValue > 1440) {
      return language === 'zh' ? '时间间隔不能超过1440分钟（24小时）' : 'Interval cannot exceed 1440 minutes (24 hours)';
    }
    return '';
  };

  // 处理时间间隔输入
  const handleIntervalChange = (value: string) => {
    setIntervalInputValue(value);
    const error = validateInterval(value);
    setIntervalError(error);

    // 如果验证通过，更新 trader 的 analysisInterval
    if (!error) {
      onUpdateRef.current({ analysisInterval: Number(value) });
    }
  };

  // 配置更新处理函数
  const handleConfigUpdate = (updates: Partial<typeof trader>) => {
    onUpdateRef.current(updates);
  };

  const handleAiModelChange = (value: string) => {
    setEditAiModel(value);
    handleConfigUpdate({ aiModel: value });
  };

  const handlePromptChange = (value: string) => {
    setEditPrompt(value);
    handleConfigUpdate({ prompt: value });
  };

  const handleMinConfidenceChange = (value: number[]) => {
    setEditMinConfidence(value);
    handleConfigUpdate({ minConfidence: value[0] });
  };

  const handleMaxPositionChange = (value: number[]) => {
    setEditMaxPosition(value);
    handleConfigUpdate({ maxPosition: value[0] });
  };

  const handleStopLossChange = (value: number[]) => {
    setEditStopLoss(value);
    handleConfigUpdate({ stopLossPrice: value[0] });
  };

  const handleTakeProfitChange = (value: number[]) => {
    setEditTakeProfit(value);
    handleConfigUpdate({ takeProfitPrice: value[0] });
  };

  const handleNewsWeightChange = (value: number[]) => {
    setEditNewsWeight(value);
    handleConfigUpdate({ newsWeight: value[0] });
  };

  const handleDataWeightChange = (value: number[]) => {
    setEditDataWeight(value);
    handleConfigUpdate({ dataWeight: value[0] });
  };

  const handleSentimentWeightChange = (value: number[]) => {
    setEditSentimentWeight(value);
    handleConfigUpdate({ sentimentWeight: value[0] });
  };

  const toggleDataSource = (key: keyof typeof editDataSources) => {
    const newDataSources = { ...editDataSources, [key]: !editDataSources[key] };
    setEditDataSources(newDataSources);
    handleConfigUpdate({ dataSources: newDataSources });
  };

  // 加载分析历史
  // 实盘 Trader: 从后端数据库加载
  // 模拟盘 Trader: 从本地 localStorage 加载（完全独立）
  useEffect(() => {
    const loadHistory = async () => {
      if (!user) return;

      // 辅助函数：将记录转换为 AnalysisReport 格式
      const convertToReport = (record: any) => ({
        id: record.id,
        timestamp: record.createdAt,
        eventId: record.eventId,
        eventTitle: record.eventTitle,
        aiModel: record.aiModel,
        prompt: trader.prompt,
        dataCollection: record.dataCollection || {
          marketData: { price: record.yesPrice, volume: record.volume, liquidity: 0 },
          newsArticles: [],
          socialSentiment: []
        },
        newsAnalysis: record.newsAnalysis || { summary: '', keyPoints: [], confidence: 0 },
        historicalAnalysis: record.historicalAnalysis || { similarEvents: [], patterns: [], confidence: 0 },
        sentimentAnalysis: record.sentimentAnalysis || { overall: 0, breakdown: [], confidence: 0 },
        statisticalModel: record.statisticalModel || { probability: record.yesPrice, factors: [], confidence: record.confidence },
        riskAssessment: record.riskAssessment || { level: 'medium' as const, factors: [], confidence: 0 },
        decision: record.decision || {
          action: record.action as 'buy_yes' | 'buy_no' | 'sell_yes' | 'sell_no' | 'hold',
          confidence: record.confidence,
          reasoning: record.reasoning
        },
        steps: record.steps || []
      });

      try {
        const accessToken = await getAccessToken();
        if (!accessToken) return;

        // 模拟盘 Trader: 从独立的 paper-trading 数据库加载
        if (isPaperTrader) {
          const response = await paperTradingAPI.getAnalysisHistory(
            trader.id,
            accessToken,
            userAddress || undefined
          );

          if (response.success && response.data) {
            const reports = response.data.map(convertToReport);
            setAnalysisReports(reports);
            console.log(`📝 [Paper] 从数据库加载 ${reports.length} 条分析记录 (trader: ${trader.id})`);
          } else {
            // 回退到本地 localStorage（兼容旧数据）
            if (paperAnalysisHistory) {
              const traderAnalysis = paperAnalysisHistory
                .filter((record: any) => record.traderId === trader.id)
                .map(convertToReport);
              setAnalysisReports(traderAnalysis);
              console.log(`📝 [Paper] 从本地 localStorage 加载 ${traderAnalysis.length} 条分析记录`);
            }
          }
          return;
        }

        // 实盘 Trader: 从后端数据库加载
        const response = await polymarketAPI.getAnalysisHistory(
          trader.id,
          accessToken,
          userAddress || undefined
        );

        if (response.success && response.data) {
          const reports = response.data.map(convertToReport);
          setAnalysisReports(reports);
          console.log(`📊 [Live] 从数据库加载 ${reports.length} 条分析记录 (trader: ${trader.id})`);
        }
      } catch (error: any) {
        // 模拟盘回退到本地 localStorage（后端 404 时静默处理）
        if (isPaperTrader && paperAnalysisHistory) {
          const traderAnalysis = paperAnalysisHistory
            .filter((record: any) => record.traderId === trader.id)
            .map(convertToReport);
          setAnalysisReports(traderAnalysis);
          console.log(`📝 [Paper] 使用本地 localStorage: ${traderAnalysis.length} 条分析记录`);
        } else if (!isPaperTrader) {
          // 实盘才记录错误
          console.error('Failed to load analysis history:', error);
        }
      }
    };

    loadHistory();
  }, [trader.id, user, getAccessToken, userAddress, trader.prompt, isPaperTrader, paperAnalysisHistory]);

  // 运行单次分析
  // 步骤名称映射（与 AIAnalysisPanel 一致）
  const stepNameMap: Record<string, { name: string; icon: any }> = {
    init: { name: tAi.steps?.init || 'Initialize', icon: Brain },
    market_data: { name: tAi.steps?.marketData || 'Market Data Collection', icon: Database },
    news_search: { name: tAi.steps?.newsSearch || 'Web Search', icon: Search },
    prompt_generation: { name: tAi.steps?.promptGeneration || 'Prompt Generation', icon: Search },
    ai_analysis: { name: tAi.steps?.aiAnalysis || 'AI Analysis', icon: Brain },
    parsing: { name: tAi.steps?.parsing || 'Result Parsing', icon: BarChart3 },
    complete: { name: tAi.steps?.complete || 'Analysis Complete', icon: CheckCircle2 },
    error: { name: tAi.steps?.error || 'Error', icon: AlertCircle }
  };

  // 将后端返回的步骤名称（可能是中文或英文）映射到翻译后的名称
  const getStepDisplayName = (stepName: string): string => {
    // 中文到 key 的映射
    const chineseToKey: Record<string, string> = {
      '初始化': 'init',
      '开始分析': 'init',
      '市场数据收集': 'market_data',
      '市场数据收集完成': 'market_data',
      '网络搜索': 'news_search',
      '搜索完成': 'news_search',
      'Prompt 生成': 'prompt_generation',
      'Prompt 生成完成': 'prompt_generation',
      'AI 分析': 'ai_analysis',
      'AI 分析完成': 'ai_analysis',
      '结果解析': 'parsing',
      '解析完成': 'parsing',
      '分析完成': 'complete',
      '完成': 'complete',
      '错误': 'error'
    };
    
    // 英文到 key 的映射
    const englishToKey: Record<string, string> = {
      'Initialize': 'init',
      'Market Data Collection': 'market_data',
      'Web Search': 'news_search',
      'Prompt Generation': 'prompt_generation',
      'AI Analysis': 'ai_analysis',
      'Result Parsing': 'parsing',
      'Analysis Complete': 'complete',
      'Complete': 'complete',
      'Error': 'error'
    };
    
    // 先尝试直接匹配 key
    if (stepNameMap[stepName]) {
      return stepNameMap[stepName].name;
    }
    
    // 尝试中文映射
    const keyFromChinese = chineseToKey[stepName];
    if (keyFromChinese && stepNameMap[keyFromChinese]) {
      return stepNameMap[keyFromChinese].name;
    }
    
    // 尝试英文映射
    const keyFromEnglish = englishToKey[stepName];
    if (keyFromEnglish && stepNameMap[keyFromEnglish]) {
      return stepNameMap[keyFromEnglish].name;
    }
    
    // 如果都不匹配，返回原值
    return stepName;
  };

  // 翻译步骤内容消息（将后端返回的中文消息翻译成当前语言）
  const translateStepContent = (content: string): string => {
    if (!content) return content;
    
    // 中文到英文的映射
    const contentTranslations: Record<string, { zh: string; en: string }> = {
      '开始分析': { zh: '开始分析', en: 'Starting analysis' },
      '市场数据收集完成': { zh: '市场数据收集完成', en: 'Market data collection completed' },
      '搜索完成': { zh: '搜索完成', en: 'Search completed' },
      'Prompt 生成完成': { zh: 'Prompt 生成完成', en: 'Prompt generation completed' },
      'AI 分析完成': { zh: 'AI 分析完成', en: 'AI analysis completed' },
      '结果解析完成': { zh: '结果解析完成', en: 'Result parsing completed' },
      '分析完成': { zh: '分析完成', en: 'Analysis completed' },
      '初始化': { zh: '初始化', en: 'Initializing' },
      '市场数据收集': { zh: '市场数据收集', en: 'Collecting market data' },
      '网络搜索': { zh: '网络搜索', en: 'Searching the web' },
      'Prompt 生成': { zh: 'Prompt 生成', en: 'Generating prompt' },
      'AI 分析': { zh: 'AI 分析', en: 'AI analyzing' },
      '结果解析': { zh: '结果解析', en: 'Parsing results' },
      '解析完成': { zh: '解析完成', en: 'Parsing completed' }
    };
    
    // 如果内容完全匹配，返回翻译
    if (contentTranslations[content]) {
      return contentTranslations[content][language];
    }
    
    // 如果内容包含已知的中文短语，尝试替换
    let translated = content;
    Object.entries(contentTranslations).forEach(([chinese, translations]) => {
      if (content.includes(chinese)) {
        translated = translated.replace(chinese, translations[language]);
      }
    });
    
    return translated;
  };

  // 格式化新闻日期（处理"1天前"这样的中文格式）
  const formatNewsDate = (dateStr: string | undefined): string => {
    if (!dateStr) return '';

    // 如果已经是标准日期格式，直接返回
    if (dateStr.match(/^\d{4}\/\d{1,2}\/\d{1,2}$/)) {
      return dateStr;
    }

    // 处理中文相对时间格式
    const chineseTimePatterns: Record<string, { zh: string; en: string }> = {
      '1天前': { zh: '1天前', en: '1 day ago' },
      '2天前': { zh: '2天前', en: '2 days ago' },
      '3天前': { zh: '3天前', en: '3 days ago' },
      '1小时前': { zh: '1小时前', en: '1 hour ago' },
      '2小时前': { zh: '2小时前', en: '2 hours ago' },
      '1分钟前': { zh: '1分钟前', en: '1 minute ago' },
      '刚刚': { zh: '刚刚', en: 'Just now' }
    };

    // 检查是否匹配已知模式
    for (const [chinese, translations] of Object.entries(chineseTimePatterns)) {
      if (dateStr.includes(chinese)) {
        return dateStr.replace(chinese, translations[language]);
      }
    }

    // 处理通用模式：X天前、X小时前等
    const dayMatch = dateStr.match(/(\d+)\s*天前/);
    if (dayMatch) {
      const days = dayMatch[1];
      return language === 'zh' ? dateStr : dateStr.replace(/(\d+)\s*天前/, `${days} day${days !== '1' ? 's' : ''} ago`);
    }

    const hourMatch = dateStr.match(/(\d+)\s*小时前/);
    if (hourMatch) {
      const hours = hourMatch[1];
      return language === 'zh' ? dateStr : dateStr.replace(/(\d+)\s*小时前/, `${hours} hour${hours !== '1' ? 's' : ''} ago`);
    }

    const minuteMatch = dateStr.match(/(\d+)\s*分钟前/);
    if (minuteMatch) {
      const minutes = minuteMatch[1];
      return language === 'zh' ? dateStr : dateStr.replace(/(\d+)\s*分钟前/, `${minutes} minute${minutes !== '1' ? 's' : ''} ago`);
    }

    return dateStr;
  };

  const toggleStep = (stepId: string) => {
    setExpandedSteps(prev => {
      const newSet = new Set(prev);
      if (newSet.has(stepId)) {
        newSet.delete(stepId);
      } else {
        newSet.add(stepId);
      }
      return newSet;
    });
  };

  // 渲染步骤详情（与 AIAnalysisPanel 一致）
  const renderStepDetails = (step: typeof analysisSteps[0]) => {
    const data = step.data as Record<string, any>;
    if (!data) return null;

    return (
      <div className="mt-2 p-3 bg-slate-50 dark:bg-slate-900/50 rounded-lg border space-y-2 text-xs">
        {/* 初始化 */}
        {step.step === stepNameMap.init.name && data.eventTitle && (
          <div>
            <p className="text-muted-foreground">{tAi.analyzingEvent}:</p>
            <p className="font-medium">{data.eventTitle}</p>
          </div>
        )}

        {/* 市场数据 */}
        {step.step === stepNameMap.market_data.name && (
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-white dark:bg-slate-800 p-2 rounded">
              <p className="text-muted-foreground">{tAi.yesPrice}</p>
              <p className="text-sm text-green-600">{((data.price || 0) * 100).toFixed(1)}%</p>
            </div>
            <div className="bg-white dark:bg-slate-800 p-2 rounded">
              <p className="text-muted-foreground">{tAi.noPrice}</p>
              <p className="text-sm text-red-600">{((data.noPrice || 0) * 100).toFixed(1)}%</p>
            </div>
            {data.volume !== undefined && (
              <div className="bg-white dark:bg-slate-800 p-2 rounded col-span-2">
                <p className="text-muted-foreground">{tAi.volume}</p>
                <p className="text-sm">${(data.volume / 1000000).toFixed(2)}M</p>
              </div>
            )}
          </div>
        )}

        {/* 网络搜索结果 */}
        {step.step === stepNameMap.news_search.name && (
          <div className="space-y-2">
            {/* 数据源状态概览 */}
            <div className="flex flex-wrap items-center gap-2">
              <Search className="w-3 h-3" />
              {data.searchResults === 'available' && (
                <Badge variant="default" className="text-xs bg-green-600">🤖 {tAi.aiSearch}</Badge>
              )}
              {data.reddit && (
                <Badge variant="default" className="text-xs bg-orange-500">💬 Reddit ({data.reddit.totalPosts})</Badge>
              )}
              {data.googleNews && (
                <Badge variant="default" className="text-xs bg-blue-500">📰 {tAi.newsReports} ({data.googleNews.articlesCount})</Badge>
              )}
              {data.wikipedia && (
                <Badge variant="default" className="text-xs bg-gray-600">📚 Wiki ({data.wikipedia.articlesCount})</Badge>
              )}
              {!data.searchResults && !data.reddit && !data.googleNews && !data.wikipedia && (
                <span className="text-xs text-muted-foreground">{tAi.noSearchResults}</span>
              )}
            </div>

            {/* AI 搜索摘要 (Perplexity) */}
            {data.perplexitySummary && (
              <div className="bg-white dark:bg-slate-800 p-2 rounded overflow-hidden">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-muted-foreground">🤖 {tAi.aiSearchSummary}</p>
                  <button
                    onClick={() => setExpandedSearchContent(!expandedSearchContent)}
                    className="text-xs text-blue-600 hover:text-blue-800 dark:text-blue-400 flex-shrink-0"
                  >
                    {expandedSearchContent ? tAi.collapse : tAi.expandAll}
                  </button>
                </div>
                <div className={`${expandedSearchContent ? 'max-h-64 overflow-y-auto' : ''}`}>
                  <p className={`whitespace-pre-wrap break-words ${expandedSearchContent ? '' : 'line-clamp-2'}`}>
                    {data.perplexitySummary}
                  </p>
                </div>
                {data.sources && data.sources.length > 0 && expandedSearchContent && (
                  <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-700">
                    <p className="text-xs text-muted-foreground mb-1">{tAi.citeSources}:</p>
                    <div className="space-y-0.5">
                      {data.sources.slice(0, 5).map((source: string, index: number) => (
                        <a
                          key={index}
                          href={source}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block text-xs text-blue-600 hover:text-blue-800 dark:text-blue-400 truncate"
                        >
                          [{index + 1}] {source}
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Google News 新闻 */}
            {data.googleNews && data.googleNews.articles && data.googleNews.articles.length > 0 && (
              <div className="bg-white dark:bg-slate-800 p-2 rounded">
                <p className="text-muted-foreground mb-1">📰 {tAi.googleNewsTitle} ({data.googleNews.articlesCount} {tAi.articles})</p>
                <div className="space-y-1">
                  {data.googleNews.articles.slice(0, 3).map((article: any, index: number) => (
                    <a
                      key={index}
                      href={article.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block p-1.5 bg-slate-50 dark:bg-slate-700 rounded hover:bg-slate-100 dark:hover:bg-slate-600"
                    >
                      <p className="text-xs font-medium line-clamp-1">{article.title}</p>
                      <p className="text-xs text-muted-foreground">{article.source} · {formatNewsDate(article.pubDateFormatted)}</p>
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* Reddit 讨论 */}
            {data.reddit && data.reddit.topDiscussions && data.reddit.topDiscussions.length > 0 && (
              <div className="bg-white dark:bg-slate-800 p-2 rounded">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-muted-foreground">💬 Reddit ({data.reddit.totalPosts} {tAi.posts})</p>
                  {data.reddit.sentiment && (
                    <Badge variant={data.reddit.sentiment.overall === 'positive' ? 'default' : data.reddit.sentiment.overall === 'negative' ? 'destructive' : 'secondary'} className="text-xs">
                      {data.reddit.sentiment.overall === 'positive' ? tAi.positive : data.reddit.sentiment.overall === 'negative' ? tAi.negative : tAi.neutral}
                    </Badge>
                  )}
                </div>
                <div className="space-y-1">
                  {data.reddit.topDiscussions.slice(0, 2).map((post: any, index: number) => (
                    <a
                      key={index}
                      href={post.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block p-1.5 bg-slate-50 dark:bg-slate-700 rounded hover:bg-slate-100 dark:hover:bg-slate-600"
                    >
                      <p className="text-xs font-medium line-clamp-1">{post.title}</p>
                      <p className="text-xs text-muted-foreground">r/{post.subreddit} · {post.score} {tAi.points}</p>
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* Wikipedia 背景知识 */}
            {data.wikipedia && data.wikipedia.articles && data.wikipedia.articles.length > 0 && (
              <div className="bg-white dark:bg-slate-800 p-2 rounded">
                <p className="text-muted-foreground mb-1">📚 {tAi.wikiBackground}</p>
                <div className="space-y-1">
                  {data.wikipedia.articles.slice(0, 2).map((article: any, index: number) => (
                    <div key={index} className="p-1.5 bg-slate-50 dark:bg-slate-700 rounded">
                      <p className="text-xs font-medium">{article.title}</p>
                      <p className="text-xs text-muted-foreground line-clamp-2">{article.extract}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Prompt 生成 */}
        {step.step === stepNameMap.prompt_generation.name && (
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-white dark:bg-slate-800 p-2 rounded">
              <p className="text-muted-foreground">{tAi.promptLength}</p>
              <p className="font-medium">{data.promptLength?.toLocaleString() || 0} {tAi.characters}</p>
            </div>
            <div className="bg-white dark:bg-slate-800 p-2 rounded">
              <p className="text-muted-foreground">{tAi.customStrategy}</p>
              <p className="font-medium">{data.hasCustomPrompt ? tAi.enabled : tAi.notUsed}</p>
            </div>
            {data.dataSources && (
              <div className="bg-white dark:bg-slate-800 p-2 rounded col-span-2">
                <p className="text-muted-foreground">{tAi.dataSources}</p>
                <div className="flex gap-2 mt-1">
                  {data.dataSources.market && <Badge variant="outline" className="text-xs">{tAi.marketDataSource}</Badge>}
                  {data.dataSources.news && <Badge variant="outline" className="text-xs">{tAi.newsSearchSource}</Badge>}
                </div>
              </div>
            )}
          </div>
        )}

        {/* AI 分析 */}
        {step.step === stepNameMap.ai_analysis.name && data.model && (
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-white dark:bg-slate-800 p-2 rounded">
              <p className="text-muted-foreground">{tAi.modelUsed}</p>
              <p className="font-medium">{data.model}</p>
            </div>
            {data.tokensUsed && (
              <div className="bg-white dark:bg-slate-800 p-2 rounded">
                <p className="text-muted-foreground">{tAi.tokenUsage}</p>
                <p className="font-medium">{data.tokensUsed.toLocaleString()}</p>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  // 获取模拟盘相关的 store 函数（数据已在组件顶部声明，这里只需要 action 函数）
  const setPaperBalance = useAppStore((state) => state.setPaperBalance);
  const addPaperPosition = useAppStore((state) => state.addPaperPosition);
  const updatePaperPosition = useAppStore((state) => state.updatePaperPosition);
  const removePaperPosition = useAppStore((state) => state.removePaperPosition);
  const addPaperTradeHistory = useAppStore((state) => state.addPaperTradeHistory);

  /**
   * 根据分析结果执行交易
   * 只有在满足以下条件时才执行：
   * 1. 决策不是 hold
   * 2. 置信度 >= 最小置信度
   * 3. 已开启 Session Signer（实盘）或模拟盘模式
   * 4. Safe 钱包已就绪（实盘）
   */
  const executeTradeIfNeeded = async (
    report: AnalysisResult,
    event: any,
    analysisId?: string  // 分析记录 ID，用于标记已执行
  ) => {
    const { action, confidence, suggestedPosition } = report.decision;

    // 1. 检查是否需要执行交易
    if (action === 'hold') {
      console.log('📊 决策为 HOLD，不执行交易');
      return;
    }

    // 判断是买入还是卖出
    const isSellAction = action === 'sell_yes' || action === 'sell_no';

    // 🔄 模拟盘交易逻辑
    if (isPaperTrader || isPaperTrading) {
      console.log('📝 [Paper Trading] 执行模拟交易');

      // 检查置信度
      const minConfidence = trader.minConfidence || 65;
      if (confidence < minConfidence) {
        console.log(`⚠️ [Paper] 置信度 ${confidence}% < 最低要求 ${minConfidence}%，不执行交易`);
        return;
      }

      // 获取价格和 token 信息
      const isYesToken = action === 'buy_yes' || action === 'sell_yes';
      const price = isYesToken ? event.yesPrice : event.noPrice;
      const outcome = isYesToken ? event.outcomes?.[0] : event.outcomes?.[1];
      const tokenId = outcome?.tokenId || outcome?.id;

      if (!price || price <= 0 || price >= 1) {
        console.error('❌ [Paper] 无效的价格:', price);
        return;
      }

      // 计算交易金额
      const maxPositionPercent = trader.maxPosition || 30;
      const positionPercent = Math.min(suggestedPosition || 5, maxPositionPercent);
      const tradeAmount = ((trader.capital || paperBalance || 1000) * positionPercent) / 100;
      const shares = tradeAmount / price;

      if (isSellAction) {
        // 卖出：检查是否有持仓
        // 使用统一的字段名：side (YES/NO), size
        const sideValue = isYesToken ? 'YES' : 'NO';
        const existingPosition = paperPositions.find(
          p => p.eventId === event.id && p.side === sideValue
        );
        const existingSize = parseFloat(String(existingPosition?.size)) || 0;
        if (!existingPosition || existingSize <= 0) {
          console.log(`⚠️ [Paper] 无 ${sideValue} 持仓可卖，跳过卖出`);
          return;
        }

        const sellShares = Math.min(shares, existingSize);
        const proceeds = sellShares * price;

        // 更新余额
        setPaperBalance(paperBalance + proceeds);

        // 更新持仓
        const remainingShares = existingSize - sellShares;
        if (remainingShares <= 0.01) {
          removePaperPosition(existingPosition.id);
        } else {
          updatePaperPosition(existingPosition.id, { size: remainingShares });
        }

        // 记录交易
        addPaperTradeHistory({
          eventId: event.id,
          eventTitle: event.title,
          side: sideValue,
          action: 'SELL',
          price,
          size: sellShares,
          amount: proceeds,
        });

        console.log(`✅ [Paper] 卖出成功: ${sellShares.toFixed(2)} 股 ${sideValue} @ ${(price * 100).toFixed(1)}%，获得 $${proceeds.toFixed(2)}`);
      } else {
        // 买入：检查余额
        if (tradeAmount > paperBalance) {
          console.log(`⚠️ [Paper] 余额不足: 需要 $${tradeAmount.toFixed(2)}，可用 $${paperBalance.toFixed(2)}`);
          return;
        }

        // 扣除余额
        setPaperBalance(paperBalance - tradeAmount);

        // 添加或更新持仓
        // 使用统一的字段名：side (YES/NO), size, entryPrice, totalCost
        const sideValue = isYesToken ? 'YES' : 'NO';
        const existingPosition = paperPositions.find(
          p => p.eventId === event.id && p.side === sideValue
        );

        if (existingPosition) {
          // 更新现有持仓（计算平均成本）
          const existingSize = parseFloat(String(existingPosition.size)) || 0;
          const existingEntryPrice = parseFloat(String(existingPosition.entryPrice)) || 0;
          const totalSize = existingSize + shares;
          const totalCostValue = existingSize * existingEntryPrice + tradeAmount;
          const newEntryPrice = totalCostValue / totalSize;
          updatePaperPosition(existingPosition.id, {
            size: totalSize,
            entryPrice: newEntryPrice,
            totalCost: totalCostValue,
          });
        } else {
          // 创建新持仓
          addPaperPosition({
            eventId: event.id,
            eventTitle: event.title,
            tokenId,
            side: sideValue,
            size: shares,
            entryPrice: price,
            totalCost: tradeAmount,
          });
        }

        // 记录交易
        addPaperTradeHistory({
          eventId: event.id,
          eventTitle: event.title,
          side: sideValue,
          action: 'BUY',
          price,
          size: shares,
          amount: tradeAmount,
        });

        console.log(`✅ [Paper] 买入成功: ${shares.toFixed(2)} 股 ${isYesToken ? 'YES' : 'NO'} @ ${(price * 100).toFixed(1)}%，花费 $${tradeAmount.toFixed(2)}`);
      }

      // 更新交易次数和 UI 状态
      setExecutedTrades(prev => prev + 1);
      setLastTradeResult({
        success: true,
        orderId: `paper-${Date.now()}`,
        timestamp: Date.now(),
      });

      return; // 模拟盘交易完成，不执行实盘逻辑
    }

    // ===== 以下是实盘交易逻辑 =====

    // 2. 检查置信度是否满足最低要求
    const minConfidence = trader.minConfidence || 65;
    if (confidence < minConfidence) {
      console.log(`⚠️ 置信度 ${confidence}% < 最低要求 ${minConfidence}%，不执行交易`);
      return;
    }

    // 3. 通过后端 API 检查自动交易状态（更可靠）
    const accessToken = await getAccessToken();
    if (!accessToken) {
      console.log('⚠️ 无法获取认证 token，不执行交易');
      return;
    }

    const autoTradeStatus = await checkAutoTradeStatus(accessToken, userAddress || '');
    if (!autoTradeStatus) {
      console.log('⚠️ 无法获取自动交易状态，不执行交易');
      return;
    }

    if (!autoTradeStatus.available) {
      console.log('⚠️ 自动交易不可用:', autoTradeStatus.message);
      return;
    }

    // 使用后端返回的 safeAddress
    const tradeSafeAddress = autoTradeStatus.safeAddress;
    if (!tradeSafeAddress) {
      console.log('⚠️ Safe 钱包地址未配置，不执行交易');
      return;
    }

    // 5. 获取 token ID
    // outcomes[0] 是 Yes，outcomes[1] 是 No
    // 注意：使用 tokenId 字段（CTF token ID），而不是 id 字段（构造的标识符）
    // buy_yes/sell_yes 操作 Yes token, buy_no/sell_no 操作 No token

    // 首先检查 outcomes 数组是否有效
    if (!event.outcomes || !Array.isArray(event.outcomes) || event.outcomes.length < 2) {
      console.error('❌ 无效的 outcomes 数组:', event.outcomes);
      setAnalysisError('无法执行交易：市场数据不完整（缺少 outcomes）');
      return;
    }

    const isYesToken = action === 'buy_yes' || action === 'sell_yes';
    const outcome = isYesToken ? event.outcomes[0] : event.outcomes[1];
    const tokenId = outcome?.tokenId || outcome?.id;

    // Validate token ID:
    // - Polymarket: numeric string with 10+ digits (e.g., "12345678901234567890")
    // - Kalshi/DFlow: Solana public key in base58 (e.g., "AhydLZPSumu3toZPNGLkeMEtZBkXvNGkbUwu2AaR4VQ9")
    const isPolymarketToken = /^\d{10,}$/.test(tokenId);
    const isSolanaToken = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(tokenId); // Base58 format

    if (!tokenId || (!isPolymarketToken && !isSolanaToken)) {
      console.error('❌ 无效的 token ID:', tokenId);
      console.error('   outcome:', outcome);
      setAnalysisError('无法执行交易：市场数据不完整（缺少有效的 tokenId）');
      return;
    }

    // 6. 获取价格（先获取价格，用于计算最小金额）
    const price = isYesToken ? event.yesPrice : event.noPrice;
    if (!price || price <= 0 || price >= 1) {
      console.error('❌ 无效的价格:', price);
      return;
    }

    // 6.5 卖出检查：确保有持仓可卖
    if (isSellAction) {
      // 查找该 token 的持仓
      const position = positions.find(p => p.tokenId === tokenId);
      if (!position || position.size <= 0) {
        console.log(`⚠️ 无 ${isYesToken ? 'YES' : 'NO'} 持仓可卖，跳过卖出`);
        return;
      }
      console.log(`📊 找到可卖持仓: ${position.size} 股 ${isYesToken ? 'YES' : 'NO'}`);
    }

    // 7. Determine trade platform (Kalshi/Solana vs Polymarket/Polygon)
    // This is needed early to check the correct balance
    const isKalshiTrade = isSolanaToken;
    
    // 8. 计算交易金额
    // 使用建议仓位或默认为资金的 5%
    const maxPositionPercent = trader.maxPosition || 30;
    const positionPercent = Math.min(
      suggestedPosition || 5,
      maxPositionPercent
    );
    let tradeAmount = ((trader.capital || 1000) * positionPercent) / 100;
    
    // 9. 检查账户余额 - 使用正确的链上余额
    // Kalshi trades use Solana USDC, Polymarket uses Polygon Safe USDC
    const availableBalance = isKalshiTrade 
      ? (solanaBalance?.balance || 0)  // Solana USDC for Kalshi
      : (usdcBalance || 0);            // Polygon Safe USDC for Polymarket
    
    const platformName = isKalshiTrade ? 'Kalshi (Solana)' : 'Polymarket (Polygon)';
    console.log(`💰 [${platformName}] Available balance: $${availableBalance.toFixed(2)}, Requested: $${tradeAmount.toFixed(2)}`);
    
    // Cap trade amount to available balance (leave $0.50 buffer for fees)
    const maxTradeableAmount = Math.max(0, availableBalance - 0.5);
    if (tradeAmount > maxTradeableAmount) {
      if (maxTradeableAmount <= 0) {
        console.log(`⚠️ [${platformName}] Insufficient balance: $${availableBalance.toFixed(2)}, need at least $0.50 for fees`);
        const insufficientBalanceMsg = t.insufficientBalance
          ?.replace('${min}', '1.00')
          ?.replace('${available}', availableBalance.toFixed(2)) 
          || `Insufficient ${platformName} balance: only $${availableBalance.toFixed(2)} USDC available`;
        setAnalysisError(insufficientBalanceMsg);
        return;
      }
      console.log(`⚠️ [${platformName}] Capping trade amount: $${tradeAmount.toFixed(2)} → $${maxTradeableAmount.toFixed(2)} (available balance limit)`);
      tradeAmount = maxTradeableAmount;
    }
    
    // 确保交易金额足够满足最小订单量 (5 股)
    const minOrderSize = 5;
    const minTradeAmount = price * minOrderSize * 1.05; // 加 5% buffer 确保足够
    if (tradeAmount < minTradeAmount) {
      // 检查账户余额是否足够
      if (minTradeAmount > availableBalance) {
        console.log(`⚠️ [${platformName}] Insufficient balance: need $${minTradeAmount.toFixed(2)}, available $${availableBalance.toFixed(2)}`);
        const insufficientBalanceMsg = t.insufficientBalance
          ?.replace('${min}', minTradeAmount.toFixed(2))
          ?.replace('${available}', availableBalance.toFixed(2)) 
          || `Insufficient ${platformName} balance: minimum trade requires $${minTradeAmount.toFixed(2)} USDC, available $${availableBalance.toFixed(2)}`;
        setAnalysisError(insufficientBalanceMsg);
        return;
      }
      console.log(`⚠️ 调整交易金额: $${tradeAmount.toFixed(2)} → $${minTradeAmount.toFixed(2)} (满足最小 ${minOrderSize} 股要求)`);
      tradeAmount = minTradeAmount;
    }
    
    // 确保交易金额为正数
    if (tradeAmount <= 0) {
      console.log(`⚠️ 交易金额 $${tradeAmount.toFixed(2)} 无效，不执行交易`);
      return;
    }

    // 确定交易方向
    const tradeSide = isSellAction ? 'SELL' : 'BUY';
    const apiBaseUrl = import.meta.env.VITE_API_URL || 'http://localhost:3002/api';

    console.log('🚀 执行自动交易:', {
      event: event.title,
      action,
      tokenId: tokenId.substring(0, 16) + '...',
      side: tradeSide,
      price,
      amount: tradeAmount,
      confidence,
      safeAddress: tradeSafeAddress,
      platform: isKalshiTrade ? 'Kalshi/DFlow' : 'Polymarket',
    });

    try {
      let response;

      if (isKalshiTrade) {
        // Kalshi/DFlow trade via Solana
        response = await fetch(
          `${apiBaseUrl}/dflow/auto-trade/execute`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${accessToken}`,
              'X-Wallet-Address': userAddress || '',
            },
            body: JSON.stringify({
              tokenMint: tokenId, // Solana token mint address
              side: tradeSide,
              price,
              amount: tradeAmount,
              slippageBps: 100, // 1% slippage
              eventId: event.id,
              eventTitle: event.title,
              marketTicker: event.id, // Kalshi market ticker (e.g., KXFEDCHAIRNOM-29)
              outcomeType: isYesToken ? 'YES' : 'NO',
              traderId: trader.id,
              signalConfidence: confidence,
            }),
          }
        );
      } else {
        // Polymarket trade via Polygon
        response = await fetch(
          `${apiBaseUrl}/polymarket/auto-trade/execute`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${accessToken}`,
              'X-Wallet-Address': userAddress || '',
            },
            body: JSON.stringify({
              safeAddress: tradeSafeAddress,
              tokenId,
              side: tradeSide,
              price,
              amount: tradeAmount,
              timeInForce: 'GTC',
              eventId: event.id,
              eventTitle: event.title,
              traderId: trader.id,
              signalConfidence: confidence,
            }),
          }
        );
      }

      const result = await response.json();

      if (result.success) {
        console.log('✅ 交易执行成功:', result.orderId);
        setLastTradeResult({
          success: true,
          orderId: result.orderId,
          timestamp: Date.now(),
        });

        // 更新交易次数
        setExecutedTrades(prev => prev + 1);

        // 更新图表数据（添加新的数据点）
        setChartData(prev => [
          ...prev,
          { timestamp: Date.now(), value: portfolioValue }
        ]);

        // 标记分析记录为已执行
        if (analysisId && typeof analysisId === 'string' && analysisId.length > 10) {
          try {
            await polymarketAPI.markAnalysisExecuted(analysisId, accessToken, userAddress || '');
            console.log('✅ 分析记录已标记为已执行:', analysisId);
          } catch (markError) {
            console.warn('⚠️ 无法标记分析为已执行:', markError);
          }
        } else if (analysisId) {
          console.warn('⚠️ 无效的 analysisId，跳过标记:', analysisId);
        }

        // 注意：实际的 portfolioValue 和 PnL 应该从后端获取持仓价值计算
        // 这里暂时不更新，因为需要等待订单成交后从后端获取实际持仓
        console.log('📊 交易已提交，等待成交...');
      } else {
        console.error('❌ 交易执行失败:', result.errorMsg);
        setLastTradeResult({
          success: false,
          errorMsg: result.errorMsg,
          timestamp: Date.now(),
        });
      }
    } catch (err: any) {
      console.error('❌ 交易执行异常:', err);
      setLastTradeResult({
        success: false,
        errorMsg: err.message || t.tradeExecutionFailed,
        timestamp: Date.now(),
      });
    }
  };

  const runAnalysis = useCallback(async () => {
    const eventsList = Array.from(events.values());
    if (eventsList.length === 0 || isAnalyzing) return;

    setIsAnalyzing(true);
    setAnalysisError(null);
    setAnalysisSteps([]); // 清空步骤
    currentStepsRef.current = []; // 清空步骤 ref
    setIsAnalysisProcessExpanded(true); // 新分析时展开分析过程卡片

    // 🔄 根据模式获取余额
    let latestBalance: number;
    if (isPaperTrader || isPaperTrading) {
      // 模拟盘：使用 paperBalance
      latestBalance = paperBalance;
      console.log('[Analysis] 📝 模拟盘余额:', latestBalance);
    } else {
      // 实盘：刷新真实 USDC 余额
      latestBalance = usdcBalance;
      console.log('[Analysis] 初始 usdcBalance:', usdcBalance, 'safeAddress:', safeAddress);
      try {
        latestBalance = await refreshBalance();
        console.log('[Analysis] 刷新后余额:', latestBalance);
      } catch (e) {
        console.warn('[Analysis] 刷新余额失败:', e);
      }

      // 如果余额仍为 0，尝试使用 portfolioData.availableCash 作为备用
      if (!latestBalance || latestBalance === 0) {
        console.warn('[Analysis] 余额为 0，检查 portfolioData:', portfolioData?.availableCash);
        // 注意：这不是真实 USDC 余额，只是基于交易计算的可用资金
      }
    }

    // 轮询选择下一个事件
    const eventIndex = currentEventIndex % eventsList.length;
    const event = eventsList[eventIndex];
    setCurrentEventIndex(prev => prev + 1);
    setCurrentAnalyzingEvent(event.title);

    console.log(`🤖 开始分析事件 ${eventIndex + 1}/${eventsList.length}: ${event.title}`);

    let analysisResult: any = null;

    try {
      // 构建事件数据
      const eventData = {
        id: event.id,
        title: event.title,
        description: event.description,
        category: event.category,
        endDate: event.endDate,
        outcomes: event.outcomes,
        volume: event.volume,
        yesPrice: event.yesPrice,
        noPrice: event.noPrice,
        liquidity: event.liquidity,
        bestBid: event.bestBid,
        bestAsk: event.bestAsk,
        spread: event.spread,
        oneDayPriceChange: event.oneDayPriceChange,
        oneHourPriceChange: event.oneHourPriceChange
      };

      // 根据 trader 配置构建数据源
      // 传递完整的数据源配置，包括 reddit 和 googleNews
      const traderDataSources = trader.dataSources || {};
      const dataSources = {
        market: true,
        // news 用于 Perplexity 搜索（需要用户配置 API Key，默认关闭）
        // 注意：Perplexity 是付费服务，需要用户主动配置
        news: false,
        // Reddit 社区讨论（免费）
        reddit: traderDataSources.reddit !== false, // 默认启用
        // Google News 新闻（免费）
        googleNews: traderDataSources.googleNews !== false, // 默认启用
        // 社交数据（用于兼容后端逻辑）
        social: traderDataSources.reddit !== false,
        // 传递 trader 配置的数据源给后端（用于 Prompt 生成）
        historical: traderDataSources.historyData || false,
        relatedEvents: traderDataSources.relatedEvents || false
      };

      // 🔄 根据模式获取持仓数据
      let realPositions: RealPosition[] = [];

      if (isPaperTrader || isPaperTrading) {
        // 模拟盘：使用 paperPositions
        console.log('[Analysis] 📝 获取模拟盘持仓...');
        realPositions = (paperPositions || []).map(pos => {
          const size = parseFloat(String(pos.size)) || parseFloat(String(pos.shares)) || 0;
          const entryPrice = parseFloat(String(pos.entryPrice)) || parseFloat(String(pos.avgPrice)) || 0;
          const currentPrice = parseFloat(String(pos.currentPrice)) || entryPrice;
          const value = size * currentPrice;
          const cost = parseFloat(String(pos.totalCost)) || (size * entryPrice);
          const pnl = value - cost;
          const pnlPercent = cost > 0 ? (pnl / cost) * 100 : 0;

          return {
            id: pos.tokenId || pos.id,
            tokenId: pos.tokenId || pos.id,
            conditionId: pos.eventId || '',
            marketSlug: '',
            title: pos.eventTitle || 'Unknown',
            outcome: pos.side || pos.outcome || 'Unknown',
            size,
            avgPrice: entryPrice,
            currentPrice,
            value,
            cost,
            pnl,
            pnlPercent
          };
        });
        console.log('[Analysis] 📝 模拟盘持仓数量:', realPositions.length);
        realPositions.forEach((p, i) => {
          console.log(`[Analysis] 📝 模拟持仓 ${i+1}:`, p.title, '|', p.outcome, '|', p.size?.toFixed(2), '股');
        });
      } else {
        // 实盘：获取真实持仓数据
        // 检查当前事件是否是 Kalshi (Solana token)
        const eventTokenId = event.outcomes?.[0]?.tokenId || '';
        const isKalshiEvent = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(eventTokenId);
        
        if (isKalshiEvent && solanaAddress) {
          // Kalshi 事件：获取 DFlow/Solana 持仓
          try {
            console.log('[Analysis] 🌐 获取 Kalshi/DFlow 持仓...');
            console.log('[Analysis] Solana 钱包地址:', solanaAddress);
            
            if (solanaAddress) {
              const dflowPositions = await dflowPortfolioService.fetchPositions(solanaAddress);
              console.log('[Analysis] 🌐 Kalshi 持仓数量:', dflowPositions.length);
              
              realPositions = dflowPositions.map((pos: DFlowPosition) => {
                const cost = pos.balance * (pos.avgCost || 0);
                const value = pos.currentValue || (pos.balance * (pos.currentPrice || 0));
                const pnl = value - cost;
                const pnlPercent = cost > 0 ? (pnl / cost) * 100 : 0;
                
                return {
                  id: pos.tokenMint,
                  tokenId: pos.tokenMint,
                  conditionId: pos.eventTicker || '',
                  marketSlug: pos.marketTicker || '',
                  title: pos.eventTitle || 'Unknown',
                  outcome: pos.outcomeType || 'Unknown',
                  size: pos.balance,
                  avgPrice: pos.avgCost || 0,
                  currentPrice: pos.currentPrice || 0,
                  value,
                  cost,
                  pnl,
                  pnlPercent
                };
              });
              
              realPositions.forEach((p, i) => {
                console.log(`[Analysis] 🌐 Kalshi 持仓 ${i+1}:`, p.title, '|', p.outcome, '|', p.size?.toFixed(2), '股');
              });
            } else {
              console.log('[Analysis] ⚠️ 无 Solana 钱包地址，跳过 Kalshi 持仓获取');
            }
          } catch (err) {
            console.warn('[Analysis] 获取 Kalshi 持仓失败:', err);
          }
        } else if (safeAddress) {
          // Polymarket 事件：获取 Polygon Safe 持仓
          try {
            console.log('[Analysis] 获取真实 Polymarket 持仓...');
            realPositions = await fetchRealPositions(safeAddress);
            console.log('[Analysis] 真实持仓数量:', realPositions.length);
            realPositions.forEach((p, i) => {
              console.log(`[Analysis] 真实持仓 ${i+1}:`, p.title, '|', p.outcome, '|', p.size?.toFixed(2), '股');
            });
          } catch (err) {
            console.warn('[Analysis] 获取真实持仓失败，使用数据库数据:', err);
            // 回退到数据库数据
            const dbPositions = portfolioData?.positions || positions;
            realPositions = dbPositions.map(pos => ({
              id: pos.tokenId,
              tokenId: pos.tokenId,
              conditionId: pos.eventId || '',
              marketSlug: '',
              title: pos.eventTitle || 'Unknown',
              outcome: pos.outcome || 'Unknown',
              size: pos.size,
              avgPrice: pos.avgPrice,
              currentPrice: pos.currentPrice || pos.avgPrice,
              value: pos.currentValue || (pos.size * (pos.currentPrice || pos.avgPrice)),
              cost: pos.cost || (pos.size * pos.avgPrice),
              pnl: pos.pnl || 0,
              pnlPercent: pos.pnlPercent || 0
            }));
          }
        }
      }

      // 计算持仓统计
      const totalPositionsValue = realPositions.reduce((sum, p) => sum + p.value, 0);
      const totalPnL = realPositions.reduce((sum, p) => sum + p.pnl, 0);

      // 构建账户信息，供 AI 参考用户资金状况
      const accountInfo = {
        availableBalance: latestBalance || 0,
        positions: realPositions.map(pos => ({
          eventId: pos.conditionId || pos.tokenId,
          eventTitle: pos.title || 'Unknown',
          outcome: pos.outcome || 'Unknown',
          tokenId: pos.tokenId,
          size: pos.size,
          avgPrice: pos.avgPrice,
          currentPrice: pos.currentPrice,
          value: pos.value,
          pnl: pos.pnl || 0
        })),
        totalPositionsValue,
        totalPnL
      };

      console.log('[Analysis] accountInfo:', {
        availableBalance: accountInfo.availableBalance,
        positionsCount: accountInfo.positions.length,
        totalPositionsValue: accountInfo.totalPositionsValue
      });

      // 构建风控配置
      const riskConfig = {
        minConfidence: trader.minConfidence || 60,
        maxPosition: trader.maxPosition || 10,
        stopLoss: trader.stopLossPrice || 20,
        takeProfit: trader.takeProfitPrice || 80
      };

      // 使用流式 API（与 AIAnalysisPanel 一致）
      // 使用 editAiModel 而不是 trader.aiModel，确保使用最新选择的模型
      const result = await polymarketAPI.analyzeStream(
        {
          event: eventData,
          dataSources,
          customPrompt: trader.prompt || undefined,
          model: editAiModel || trader.aiModel || 'deepseek/deepseek-chat',
          language: language,
          accountInfo,  // 传入账户信息
          riskConfig    // 传入风控配置
        },
        (stepEvent) => {
          // 处理每一步的回调
          const stepInfo = stepNameMap[stepEvent.step] || { name: stepEvent.step, icon: Brain };
          const stepName = stepInfo.name;

          const newStep = {
            id: `step-${stepEvent.step}-${stepEvent.timestamp}`,
            step: stepName,
            content: stepEvent.message || '',
            status: stepEvent.status as 'pending' | 'running' | 'completed' | 'failed',
            data: stepEvent.data || stepEvent.result
          };

          setAnalysisSteps(prev => {
            const existingIndex = prev.findIndex(s => s.step === stepName);
            let updated: typeof prev;
            if (existingIndex >= 0) {
              updated = [...prev];
              updated[existingIndex] = newStep;
            } else {
              updated = [...prev, newStep];
            }
            // 同步更新 ref，用于保存到结果中
            currentStepsRef.current = updated;
            return updated;
          });

          // 保存最终结果
          if (stepEvent.step === 'complete' && stepEvent.status === 'completed' && stepEvent.result) {
            analysisResult = stepEvent.result.analysis;
          }

          // 处理错误
          if (stepEvent.status === 'failed') {
            // 检查是否是严重错误（需要暂停 trader 的错误）
            const isCriticalError = 
              stepEvent.errorCode === 'INSUFFICIENT_BALANCE' || 
              stepEvent.errorCode === 'USER_API_KEY_REQUIRED';
            
            // 根据错误码显示不同的错误信息
            if (stepEvent.errorCode === 'INSUFFICIENT_BALANCE') {
              setAnalysisError(language === 'zh' 
                ? 'AI Credits 余额不足，请充值后重试' 
                : 'Insufficient AI Credits balance, please recharge');
              setShowInsufficientBalanceDialog(true);
            } else if (stepEvent.errorCode === 'USER_API_KEY_REQUIRED') {
              setAnalysisError(language === 'zh' 
                ? '请先配置您的 OpenRouter API Key' 
                : 'Please configure your OpenRouter API Key first');
              setShowApiKeyDialog(true);
            } else {
              setAnalysisError(stepEvent.error || '分析过程中出现错误');
            }
            
            // 如果是严重错误，自动暂停 trader，避免浪费资源
            if (isCriticalError && trader.isActive) {
              console.log('[TraderDetail] ⚠️ Critical error detected via SSE, auto-pausing trader...');
              onUpdate({ isActive: false });
            }
          }
        },
        userAddress
      );

      // 如果流式处理完成后还没有结果，从 result 中获取
      if (!analysisResult && result?.data?.analysis) {
        analysisResult = result.data.analysis;
      }

      if (analysisResult) {
        const apiAnalysis = analysisResult;

        // 直接使用 API 返回的格式，添加必要的元数据
        const report: AnalysisResult = {
          id: `analysis-${Date.now()}-${event.id.slice(0, 8)}`,
          timestamp: Date.now(),
          eventId: event.id,
          eventTitle: event.title,
          aiModel: editAiModel || trader.aiModel || 'deepseek/deepseek-chat',
          summary: apiAnalysis.summary || '',
          reasoning: apiAnalysis.reasoning || {
            questionBreakdown: [],
            baseRateAnalysis: '',
            factors: [],
            detailedAnalysis: ''
          },
          probability: apiAnalysis.probability || { yes: 0.5, confidence: 50 },
          marketAssessment: apiAnalysis.marketAssessment || {
            currentPrice: event.yesPrice,
            fairValue: event.yesPrice,
            mispricing: 0,
            direction: 'fair'
          },
          decision: apiAnalysis.decision || {
            action: 'hold',
            confidence: 50,
            reasoning: '',
            riskLevel: 'medium',
            suggestedPosition: 0
          },
          risks: apiAnalysis.risks || [],
          keyInsights: apiAnalysis.keyInsights || [],
          // 保存分析过程步骤
          steps: [...currentStepsRef.current]
        };

        // 添加到报告列表
        setAnalysisReports(prev => [report, ...prev.slice(0, 49)]); // 前端保留50条

        // 保存分析历史
        // 实盘 Trader: 保存到后端数据库
        // 模拟盘 Trader: 仅保存到 localStorage（完全独立）
        let savedAnalysisId: string | undefined;

        const analysisData = {
          eventId: event.id,
          eventTitle: event.title,
          aiModel: editAiModel || trader.aiModel || 'deepseek/deepseek-chat',
          yesPrice: event.yesPrice,
          noPrice: event.noPrice,
          volume: event.volume,
          analysisResult: apiAnalysis,
          action: report.decision.action,
          confidence: report.decision.confidence,
          reasoning: report.decision.reasoning,
          steps: report.steps
        };

        if (isPaperTrader) {
          // 模拟盘 Trader: 保存到独立的 paper-trading 数据库
          const paperAnalysisRecord = {
            traderId: trader.id,
            ...analysisData,
            // 保存完整的分析数据以便展示
            dataCollection: report.dataCollection,
            newsAnalysis: report.newsAnalysis,
            historicalAnalysis: report.historicalAnalysis,
            sentimentAnalysis: report.sentimentAnalysis,
            statisticalModel: report.statisticalModel,
            riskAssessment: report.riskAssessment,
            decision: report.decision,
          };

          try {
            const accessToken = await getAccessToken();
            if (accessToken) {
              const saveResult = await paperTradingAPI.saveAnalysisHistory(
                trader.id,
                paperAnalysisRecord,
                accessToken,
                userAddress || undefined
              );
              savedAnalysisId = saveResult?.data?.id;
              console.log(`📝 [Paper] 分析历史已保存到数据库 (trader: ${trader.id})`);
            } else {
              // 未登录时回退到本地存储
              addPaperAnalysisHistory(paperAnalysisRecord);
              savedAnalysisId = `paper-${Date.now()}`;
              console.log(`📝 [Paper] 分析历史已保存到本地 (未登录)`);
            }
          } catch (saveError) {
            console.error('📝 [Paper] Failed to save analysis history to DB:', saveError);
            // 保存失败时回退到本地存储
            addPaperAnalysisHistory(paperAnalysisRecord);
            savedAnalysisId = `paper-${Date.now()}`;
            console.log(`📝 [Paper] 分析历史已回退保存到本地`);
          }
        } else {
          // 实盘 Trader: 保存到后端数据库
          try {
            const accessToken = await getAccessToken();
            if (accessToken) {
              const saveResult = await polymarketAPI.saveAnalysisHistory(
                trader.id,
                analysisData,
                accessToken,
                userAddress || undefined
              );
              savedAnalysisId = saveResult?.data?.id;
              console.log(`📊 [Live] 分析历史已保存到数据库 (trader: ${trader.id})`);
            }
          } catch (saveError) {
            console.error('Failed to save analysis history:', saveError);
          }
        }

        console.log(`✅ 分析完成: ${event.title}, 决策: ${report.decision.action}, 置信度: ${report.decision.confidence}%`);

        // 执行实际交易（如果满足条件），传入分析 ID 以便标记为已执行
        await executeTradeIfNeeded(report, event, savedAnalysisId);
      } else {
        throw new Error(result.error || 'Analysis failed');
      }
    } catch (error: any) {
      console.error('Analysis error:', error);
      
      // 检查是否是严重错误（需要暂停 trader 的错误）
      const isCriticalError = 
        error.code === 'USER_API_KEY_REQUIRED' || 
        error.code === 'INSUFFICIENT_BALANCE' ||
        error.message?.includes('API Key') ||
        error.message?.includes('余额不足') || 
        error.message?.includes('Insufficient');
      
      // 根据错误码显示不同的错误信息
      if (error.code === 'USER_API_KEY_REQUIRED' || error.message?.includes('API Key')) {
        setAnalysisError(language === 'zh' 
          ? '请先配置您的 OpenRouter API Key' 
          : 'Please configure your OpenRouter API Key first');
        setShowApiKeyDialog(true);
      } else if (error.code === 'INSUFFICIENT_BALANCE' || error.message?.includes('余额不足') || error.message?.includes('Insufficient')) {
        setAnalysisError(language === 'zh' 
          ? 'AI Credits 余额不足，请充值后重试' 
          : 'Insufficient AI Credits balance, please recharge');
        setShowInsufficientBalanceDialog(true);
      } else {
        setAnalysisError(error.message || t.analysisFailed);
      }
      
      // 如果是严重错误，自动暂停 trader，避免浪费资源
      if (isCriticalError && trader.isActive) {
        console.log('[TraderDetail] ⚠️ Critical error detected, auto-pausing trader...');
        onUpdate({ isActive: false });
      }
    } finally {
      setIsAnalyzing(false);
      setCurrentAnalyzingEvent(null);
    }
  }, [events, isAnalyzing, currentEventIndex, trader, userAddress, getAccessToken, delegationStatus.isDelegated, safeAddress, safeReady, onUpdate, isPaperTrading, isPaperTrader, paperPositions, paperBalance]);

  // 更新 runAnalysis ref
  useEffect(() => {
    runAnalysisRef.current = runAnalysis;
  }, [runAnalysis]);

  // 启动/停止自动分析 (使用 ref 避免频繁重启定时器)
  useEffect(() => {
    if (!trader.isActive || events.size === 0) {
      if (analysisTimerRef.current) {
        clearInterval(analysisTimerRef.current);
        analysisTimerRef.current = null;
      }
      setNextAnalysisTime(null);
      return;
    }

    // 立即运行第一次分析
    runAnalysisRef.current?.();

    // 设置定时器，按 analysisInterval 运行
    const intervalMs = (trader.analysisInterval || 15) * 60 * 1000;
    setNextAnalysisTime(Date.now() + intervalMs);

    analysisTimerRef.current = setInterval(() => {
      runAnalysisRef.current?.();
      setNextAnalysisTime(Date.now() + intervalMs);
    }, intervalMs);

    return () => {
      if (analysisTimerRef.current) {
        clearInterval(analysisTimerRef.current);
        analysisTimerRef.current = null;
      }
    };
  }, [trader.isActive, trader.analysisInterval, events.size]);

  // 更新倒计时显示
  useEffect(() => {
    if (!nextAnalysisTime || !trader.isActive) {
      setCountdown(0);
      return;
    }

    const updateCountdown = () => {
      const remaining = Math.max(0, Math.floor((nextAnalysisTime - Date.now()) / 1000));
      setCountdown(remaining);
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);

    return () => clearInterval(interval);
  }, [nextAnalysisTime, trader.isActive]);

  /**
   * 启动/停止 Trader
   * 启动时检查 Session Signer 状态，如未开启则弹出确认对话框
   */
  const toggleActive = async () => {
    // 如果是停止，直接执行
    if (trader.isActive) {
      onUpdate({ isActive: false });
      return;
    }

    // 如果要启动，先验证间隔设置
    const error = validateInterval(intervalInputValue);
    if (error) {
      setIntervalError(error);
      return;
    }

    // 检查 Session Signer 状态
    if (!delegationStatus.isDelegated) {
      // 未开启 Session Signer，弹出确认对话框
      setShowAutoTradeConfirm(true);
      return;
    }

    // 已开启 Session Signer，直接启动
    onUpdate({ isActive: true });
  };

  /**
   * 用户确认开启自动交易授权后的处理
   */
  const handleConfirmAutoTrade = async () => {
    setIsEnablingDelegation(true);
    try {
      // 请求开启 Session Signer
      const success = await requestDelegation();
      if (success) {
        // 注意：不要调用 refreshDelegationStatus()
        // 因为 requestDelegation() 成功后已经设置了 isDelegated: true
        // 而 Privy 的 user.linkedAccounts 可能还没有更新
        // 调用 refreshDelegationStatus() 会导致状态被错误地重置为 false
        
        // 启动 Trader
        onUpdate({ isActive: true });
        setShowAutoTradeConfirm(false);
      } else {
        setAnalysisError(t.enableAutoTradeFailed);
      }
    } catch (err: any) {
      console.error('Failed to enable delegation:', err);
      setAnalysisError(err.message || t.enableAutoTradeFailed);
    } finally {
      setIsEnablingDelegation(false);
    }
  };

  const formatCountdown = (seconds: number): string => {
    if (seconds <= 0) return language === 'zh' ? '即将开始' : 'Starting soon';
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    if (minutes > 0) {
      return language === 'zh' 
        ? `${minutes}分${remainingSeconds.toString().padStart(2, '0')}秒`
        : `${minutes}m ${remainingSeconds.toString().padStart(2, '0')}s`;
    }
    return language === 'zh' ? `${seconds}秒` : `${seconds}s`;
  };

  const toggleReportExpand = (reportId: string) => {
    setExpandedReports(prev => {
      const next = new Set(prev);
      if (next.has(reportId)) {
        next.delete(reportId);
      } else {
        next.add(reportId);
      }
      return next;
    });
  };

  const eventsList = Array.from(events.values());
  const currentEventNum = (currentEventIndex % Math.max(eventsList.length, 1)) + 1;

  return (
    <div className="h-screen flex flex-col">
      {/* Top Header */}
      <div className="border-b bg-background p-4">
        <div className="flex items-center justify-between mb-4">
          <Button variant="ghost" onClick={onBack} className="gap-2">
            <ArrowLeft className="w-4 h-4" />
            {t.back}
          </Button>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowConfig(!showConfig)}
              className="gap-2"
            >
              <Settings className="w-4 h-4" />
              {t.config}
            </Button>
            <Button
              size="lg"
              variant="outline"
              onClick={toggleActive}
              className="gap-2"
            >
              {trader.isActive ? (
                <>
                  <Pause className="w-4 h-4" />
                  {t.stop}
                </>
              ) : (
                <>
                  <Play className="w-4 h-4" />
                  {t.start}
                </>
              )}
            </Button>
          </div>
        </div>

        <div className="flex items-start gap-3">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <h2 className="text-xl">{trader.name}</h2>
              {trader.isActive && (
                <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-green-500/20 border border-green-500/30">
                  <Activity className="w-3 h-3 text-green-600 dark:text-green-400 animate-pulse" />
                  <span className="text-xs text-green-700 dark:text-green-400">{t.running}</span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <span>{language === 'zh' ? `${eventsList.length} 个监控事件` : `${eventsList.length} monitored events`}</span>
              <span>|</span>
              <span>{language === 'zh' ? `每 ${trader.analysisInterval || 15} 分钟分析` : `every ${trader.analysisInterval || 15} min analysis`}</span>
              <span>|</span>
              <span>{getModelDisplayName(trader.aiModel)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Config Panel (Collapsible) */}
      {showConfig && (
        <Card className="m-4 p-4 bg-muted/30">
          <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
            <Settings className="w-4 h-4" />
            {t.traderConfig}
          </h4>

          <div className="max-h-[60vh] overflow-y-auto space-y-4">
            {/* AI 模型和分析间隔 */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium mb-2 block">{t.aiModel}</label>
                <Select value={editAiModel} onValueChange={handleAiModelChange}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={t.selectAiModel} />
                  </SelectTrigger>
                  <SelectContent className="max-h-[300px] overflow-y-auto">
                    {/* OpenAI GPT Models */}
                    <SelectItem value="openai/gpt-5.2">GPT-5.2 (Latest)</SelectItem>
                    <SelectItem value="openai/gpt-5.1">GPT-5.1</SelectItem>
                    <SelectItem value="openai/gpt-5-pro">GPT-5 Pro</SelectItem>
                    <SelectItem value="openai/gpt-5-mini">GPT-5 Mini</SelectItem>
                    <SelectItem value="openai/gpt-4o">GPT-4o</SelectItem>
                    <SelectItem value="openai/o3-mini">OpenAI o3-mini</SelectItem>
                    {/* Anthropic Claude Models */}
                    <SelectItem value="anthropic/claude-sonnet-4.5">Claude Sonnet 4.5 (Latest)</SelectItem>
                    <SelectItem value="anthropic/claude-opus-4.5">Claude Opus 4.5</SelectItem>
                    <SelectItem value="anthropic/claude-haiku-4.5">Claude Haiku 4.5</SelectItem>
                    <SelectItem value="anthropic/claude-sonnet-4">Claude Sonnet 4</SelectItem>
                    {/* Google Gemini Models */}
                    <SelectItem value="google/gemini-3-pro-preview">Gemini 3 Pro (Latest)</SelectItem>
                    <SelectItem value="google/gemini-2.5-pro">Gemini 2.5 Pro</SelectItem>
                    <SelectItem value="google/gemini-2.5-flash">Gemini 2.5 Flash</SelectItem>
                    {/* xAI Grok Models */}
                    <SelectItem value="x-ai/grok-4.1-fast">Grok 4.1 Fast (Latest)</SelectItem>
                    <SelectItem value="x-ai/grok-4">Grok 4</SelectItem>
                    <SelectItem value="x-ai/grok-4-fast">Grok 4 Fast</SelectItem>
                    {/* DeepSeek Models */}
                    <SelectItem value="deepseek/deepseek-r1-0528">DeepSeek R1 0528 (Latest)</SelectItem>
                    <SelectItem value="deepseek/deepseek-r1">DeepSeek R1</SelectItem>
                    <SelectItem value="deepseek/deepseek-chat">DeepSeek V3</SelectItem>
                    {/* Alibaba Qwen Models */}
                    <SelectItem value="qwen/qwen3-coder">Qwen3 Coder 480B (Latest)</SelectItem>
                    <SelectItem value="qwen/qwen3-max">Qwen3 Max</SelectItem>
                    <SelectItem value="qwen/qwq-32b">QwQ 32B</SelectItem>
                    {/* Moonshot Kimi Models */}
                    <SelectItem value="moonshotai/kimi-k2-0905">Kimi K2 0905 (Latest)</SelectItem>
                    <SelectItem value="moonshotai/kimi-k2-thinking">Kimi K2 Thinking</SelectItem>
                    <SelectItem value="moonshotai/kimi-k2">Kimi K2</SelectItem>
                    {/* Meta Llama Models */}
                    <SelectItem value="meta-llama/llama-4-maverick">Llama 4 Maverick (Latest)</SelectItem>
                    <SelectItem value="meta-llama/llama-4-scout">Llama 4 Scout</SelectItem>
                    {/* Mistral Models */}
                    <SelectItem value="mistralai/mistral-large-2512">Mistral Large 3 (Latest)</SelectItem>
                    <SelectItem value="mistralai/codestral-2508">Codestral 2508</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block">{t.analysisIntervalLabel}</label>
                <div className="relative">
                  <input
                    type="text"
                    value={intervalInputValue}
                    onChange={(e) => handleIntervalChange(e.target.value)}
                    placeholder="1-1440"
                    className={`w-full bg-background border ${
                      intervalError ? 'border-red-400' : 'border-input'
                    } rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring`}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">{t.minutes}</span>
                </div>
                {intervalError && (
                  <p className="text-red-500 text-xs mt-1">{intervalError}</p>
                )}
              </div>
            </div>

            {/* 风险管理 */}
            <div className="p-3 bg-background rounded-lg border">
              <h5 className="text-sm font-medium mb-3">{t.riskManagement}</h5>
              <div className="space-y-4">
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-muted-foreground">{t.minConfidence}</span>
                    <span className="font-medium">{editMinConfidence[0]}%</span>
                  </div>
                  <Slider
                    value={editMinConfidence}
                    onValueChange={handleMinConfidenceChange}
                    min={30}
                    max={95}
                    step={5}
                    className="w-full"
                  />
                </div>
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-muted-foreground">{t.maxPosition}</span>
                    <span className="font-medium">{editMaxPosition[0]}%</span>
                  </div>
                  <Slider
                    value={editMaxPosition}
                    onValueChange={handleMaxPositionChange}
                    min={5}
                    max={100}
                    step={5}
                    className="w-full"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-muted-foreground">{t.stopLoss}</span>
                      <span className="font-medium text-red-600">{editStopLoss[0]}%</span>
                    </div>
                    <Slider
                      value={editStopLoss}
                      onValueChange={handleStopLossChange}
                      min={5}
                      max={50}
                      step={5}
                      className="w-full"
                    />
                  </div>
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-muted-foreground">{t.takeProfit}</span>
                      <span className="font-medium text-green-600">{editTakeProfit[0]}%</span>
                    </div>
                    <Slider
                      value={editTakeProfit}
                      onValueChange={handleTakeProfitChange}
                      min={50}
                      max={500}
                      step={10}
                      className="w-full"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* 分析权重 */}
            <div className="p-3 bg-background rounded-lg border">
              <h5 className="text-sm font-medium mb-3">{t.analysisWeight}</h5>
              <div className="space-y-3">
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-muted-foreground">{t.newsWeight}</span>
                    <span className="font-medium">{editNewsWeight[0]}%</span>
                  </div>
                  <Slider
                    value={editNewsWeight}
                    onValueChange={handleNewsWeightChange}
                    min={0}
                    max={100}
                    step={5}
                    className="w-full"
                  />
                </div>
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-muted-foreground">{t.dataWeight}</span>
                    <span className="font-medium">{editDataWeight[0]}%</span>
                  </div>
                  <Slider
                    value={editDataWeight}
                    onValueChange={handleDataWeightChange}
                    min={0}
                    max={100}
                    step={5}
                    className="w-full"
                  />
                </div>
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-muted-foreground">{t.sentimentWeight}</span>
                    <span className="font-medium">{editSentimentWeight[0]}%</span>
                  </div>
                  <Slider
                    value={editSentimentWeight}
                    onValueChange={handleSentimentWeightChange}
                    min={0}
                    max={100}
                    step={5}
                    className="w-full"
                  />
                </div>
              </div>
            </div>

            {/* 数据源 */}
            <div className="p-3 bg-background rounded-lg border">
              <h5 className="text-sm font-medium mb-3">{t.dataSources}</h5>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { key: 'marketDepth', label: t.marketDepth },
                  { key: 'historyData', label: t.historyData },
                  { key: 'relatedEvents', label: t.relatedEvents },
                  { key: 'technicalIndicators', label: t.technicalIndicators },
                  { key: 'participantBehavior', label: t.participantBehavior },
                  { key: 'userAccount', label: t.userAccount },
                ].map(({ key, label }) => (
                  <div key={key} className="flex items-center gap-2">
                    <Checkbox
                      id={`ds-${key}`}
                      checked={editDataSources[key as keyof typeof editDataSources]}
                      onCheckedChange={() => toggleDataSource(key as keyof typeof editDataSources)}
                    />
                    <label htmlFor={`ds-${key}`} className="text-sm cursor-pointer">{label}</label>
                  </div>
                ))}
              </div>
            </div>

            {/* 策略 Prompt */}
            <div>
              <label className="text-sm font-medium mb-2 block">{t.tradingStrategy}</label>
              <Textarea
                value={editPrompt}
                onChange={(e) => handlePromptChange(e.target.value)}
                placeholder={t.strategyPlaceholder}
                className="min-h-[80px] text-sm"
              />
            </div>

            {/* 资金显示 */}
            <div className="p-3 bg-muted/50 rounded-lg">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{t.initialFunds}</span>
                <span className="font-medium">${trader.capital?.toLocaleString() || '1,000'}</span>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Main Content */}
      <div className="flex-1 grid grid-cols-12 gap-4 p-4 overflow-hidden">
        {/* Left Content */}
        <div className="col-span-6 space-y-4 overflow-y-auto">
          {/* Performance Stats */}
          <div className="grid grid-cols-4 gap-3">
            {/* ROI */}
            <Card className="p-3 text-center">
              <div className="text-xs text-muted-foreground mb-1">{t.roi}</div>
              {isLoadingStats ? (
                <Loader2 className="w-4 h-4 animate-spin mx-auto" />
              ) : (
                <div className={`text-xl font-bold ${(traderStats?.roi ?? 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {(traderStats?.roi ?? 0) >= 0 ? '+' : ''}{(traderStats?.roi ?? 0).toFixed(2)}%
                </div>
              )}
            </Card>
            
            {/* 胜率 */}
            <Card className="p-3 text-center">
              <div className="text-xs text-muted-foreground mb-1">{t.winRate}</div>
              {isLoadingStats ? (
                <Loader2 className="w-4 h-4 animate-spin mx-auto" />
              ) : (
                <>
                  <div className={`text-xl font-bold ${(traderStats?.winRate ?? 0) >= 50 ? 'text-green-600' : 'text-muted-foreground'}`}>
                    {(traderStats?.winRate ?? 0).toFixed(1)}%
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    {language === 'zh' ? `${traderStats?.winCount ?? 0}胜 / ${traderStats?.lossCount ?? 0}负` : `${traderStats?.winCount ?? 0}W / ${traderStats?.lossCount ?? 0}L`}
                  </div>
                </>
              )}
            </Card>
            
            {/* 总盈亏 */}
            <Card className="p-3 text-center">
              <div className="text-xs text-muted-foreground mb-1">{t.totalPnL}</div>
              {isLoadingStats ? (
                <Loader2 className="w-4 h-4 animate-spin mx-auto" />
              ) : (
                <>
                  <div className={`text-xl font-bold ${(traderStats?.totalPnL ?? 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {(traderStats?.totalPnL ?? 0) >= 0 ? '+' : ''}${(traderStats?.totalPnL ?? 0).toFixed(2)}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    {(traderStats?.totalPnLPercent ?? 0) >= 0 ? '+' : ''}{(traderStats?.totalPnLPercent ?? 0).toFixed(1)}%
                  </div>
                </>
              )}
            </Card>
            
            {/* 交易次数 */}
            <Card className="p-3 text-center">
              <div className="text-xs text-muted-foreground mb-1">{t.tradeCount}</div>
              {isLoadingStats ? (
                <Loader2 className="w-4 h-4 animate-spin mx-auto" />
              ) : (
                <>
                  <div className="text-xl font-bold">
                    {traderStats?.totalTrades ?? 0}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    {language === 'zh' ? `买${traderStats?.buyTrades ?? 0} / 卖${traderStats?.sellTrades ?? 0}` : `Buy ${traderStats?.buyTrades ?? 0} / Sell ${traderStats?.sellTrades ?? 0}`}
                  </div>
                </>
              )}
            </Card>
          </div>

          {/* TradingView Style PnL Chart */}
          <TradingViewPnLChart
            data={chartData}
            initialValue={trader.capital || 1000}
            currentValue={portfolioValue}
            height={280}
            showHeader={false}
            language={language}
          />

          {/* Stats Row */}
          <div className="grid grid-cols-3 gap-4">
            {/* Analysis Status */}
            {trader.isActive && (
              <Card className="p-4 bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800">
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles className={`w-4 h-4 text-blue-600 ${isAnalyzing ? 'animate-pulse' : ''}`} />
                  <h3 className="text-sm font-medium">{t.aiAnalysisStatus}</h3>
                </div>
                <div className="space-y-2 text-sm">
                  {/* 运行状态 */}
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                    <span className="text-green-700 dark:text-green-400 font-medium">
                      {isAnalyzing ? t.analyzing : t.running}
                    </span>
                  </div>

                  {/* 当前分析事件 */}
                  {isAnalyzing && currentAnalyzingEvent && (
                    <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded text-xs">
                      <div className="flex items-center gap-1 mb-1">
                        <Target className="w-3 h-3 text-blue-600" />
                        <span className="text-blue-700 dark:text-blue-300">{t.currentlyAnalyzing}</span>
                      </div>
                      <p className="text-blue-800 dark:text-blue-200 line-clamp-2">{currentAnalyzingEvent}</p>
                    </div>
                  )}

                  {/* 倒计时 */}
                  {!isAnalyzing && countdown > 0 && (
                    <div className="p-2 bg-background rounded border">
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground text-xs">{t.nextAnalysis}</span>
                        <span className="font-mono font-medium text-blue-600">{formatCountdown(countdown)}</span>
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {language === 'zh' ? `事件 ${currentEventNum}/${eventsList.length}` : `Event ${currentEventNum}/${eventsList.length}`}
                      </div>
                    </div>
                  )}

                  {/* 统计 */}
                  <div className="flex items-center justify-between pt-1 border-t">
                    <span className="text-muted-foreground text-xs">{t.analyzed}</span>
                    <span className="font-medium">{analysisReports.length} {t.times}</span>
                  </div>
                  
                  {/* 交易统计 */}
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground text-xs">{t.traded}</span>
                    <span className="font-medium text-green-600">{executedTrades} {t.times}</span>
                  </div>
                  
                  {/* Session Signer 状态 */}
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground text-xs">{t.autoTrade}</span>
                    {delegationStatus.isDelegated ? (
                      <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200">
                        <CheckCircle className="w-3 h-3 mr-1" />
                        {t.authorized}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs bg-gray-50 text-gray-600 border-gray-200">
                        {t.unauthorized}
                      </Badge>
                    )}
                  </div>

                  {/* 后端调度器状态 */}
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground text-xs">{t.backendScheduler}</span>
                    {isLoadingScheduler ? (
                      <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
                    ) : schedulerStatus?.isScheduled ? (
                      <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200">
                        <Activity className="w-3 h-3 mr-1" />
                        {t.schedulerRunning}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs bg-gray-50 text-gray-600 border-gray-200">
                        {t.schedulerNotStarted}
                      </Badge>
                    )}
                  </div>

                  {/* 下次分析时间 */}
                  {schedulerStatus?.isScheduled && schedulerStatus?.nextRunTime && (
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground text-xs">{t.nextAnalysis}</span>
                      <span className="text-xs font-medium">
                        {new Date(schedulerStatus.nextRunTime).toLocaleTimeString(language === 'zh' ? 'zh-CN' : 'en-US', { 
                          hour: '2-digit', 
                          minute: '2-digit' 
                        })}
                      </span>
                    </div>
                  )}

                  {analysisError && (
                    <div className="p-2 bg-red-50 dark:bg-red-900/20 rounded">
                      <div className="flex items-center gap-1 text-xs text-red-600">
                        <AlertCircle className="w-3 h-3 flex-shrink-0" />
                        <span className="truncate flex-1">{analysisError}</span>
                      </div>
                      {analysisError.includes('API Key') && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setShowApiKeyDialog(true)}
                          className="mt-2 w-full gap-1 text-xs h-7"
                        >
                          <Key className="w-3 h-3" />
                          {t.configApiKey}
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </Card>
            )}

            {/* Monitored Events */}
            <Card className={`p-4 ${trader.isActive ? 'col-span-2' : 'col-span-3'}`}>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm text-muted-foreground">{t.monitoredEvents}</h3>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    {t.updated} {formatTimeSince(lastRefresh, language)}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => refreshEvents(trader.eventIds)}
                    disabled={eventsLoading}
                    className="h-6 w-6 p-0"
                  >
                    <RefreshCw className={`w-3 h-3 ${eventsLoading ? 'animate-spin' : ''}`} />
                  </Button>
                </div>
              </div>

              {eventsLoading && eventsList.length === 0 ? (
                <div className="text-center py-4 text-sm text-muted-foreground">
                  加载事件数据...
                </div>
              ) : eventsList.length === 0 ? (
                <div className="text-center py-4 text-sm text-muted-foreground">
                  未找到监控事件
                </div>
              ) : (
                <div className="space-y-2 max-h-[200px] overflow-y-auto">
                  {eventsList.map((event) => {
                    // Find the source from trader.events array, fallback to POLYMARKET
                    const eventAssignment = trader.events?.find(e => e.eventId === event.id);
                    const source = eventAssignment?.source || event.source || 'POLYMARKET';
                    const isKalshi = source === 'KALSHI';

                    return (
                      <div
                        key={event.id}
                        className="p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <p className="text-sm line-clamp-1">{event.title}</p>
                          {/* Source Badge */}
                          <Badge
                            variant="outline"
                            className={`text-[10px] flex-shrink-0 ${
                              isKalshi
                                ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                                : 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300'
                            }`}
                          >
                            {isKalshi ? 'Kalshi' : 'PM'}
                          </Badge>
                        </div>
                        <div className="flex items-center justify-between text-xs">
                          <Badge variant="outline" className="text-xs">{event.category}</Badge>
                          <div className="flex items-center gap-2">
                            <span className="text-green-600">{(event.yesPrice * 100).toFixed(0)}%</span>
                            <span className="text-muted-foreground">/</span>
                            <span className="text-red-600">{(event.noPrice * 100).toFixed(0)}%</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {isExpired && !eventsLoading && (
                <div className="mt-2 flex items-center gap-1 text-xs text-orange-600">
                  <Clock className="w-3 h-3" />
                  <span>数据可能已过期</span>
                </div>
              )}
            </Card>

            {/* Positions - 当前持仓 */}
            <Collapsible 
              open={showPositions} 
              onOpenChange={setShowPositions}
              className="col-span-3"
            >
              <Card className="p-4">
                <CollapsibleTrigger className="w-full">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Target className="w-4 h-4 text-muted-foreground" />
                      <h3 className="text-sm text-muted-foreground">{t.currentPositions}</h3>
                      {positionsSummary && positionsSummary.totalPositions > 0 && (
                        <Badge variant="outline" className="text-xs">
                          {t.positionsCount?.replace('{count}', String(positionsSummary.totalPositions)) || positionsSummary.totalPositions}
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {positionsSummary && positionsSummary.totalCost > 0 && (
                        <span className="text-xs text-muted-foreground">
                          {t.cost}: ${positionsSummary.totalCost.toFixed(2)}
                        </span>
                      )}
                      {showPositions ? (
                        <ChevronUp className="w-4 h-4 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-muted-foreground" />
                      )}
                    </div>
                  </div>
                </CollapsibleTrigger>
                
                <CollapsibleContent>
                  <div className="mt-4 space-y-3">
                    {isLoadingPositions ? (
                      <div className="flex items-center justify-center py-4">
                        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                      </div>
                    ) : (portfolioData?.positions || positions).length === 0 ? (
                      <div className="text-center py-6 text-sm text-muted-foreground">
                        <Target className="w-8 h-8 mx-auto mb-2 opacity-30" />
                        <p>{t.noPositions}</p>
                        <p className="text-xs mt-1 opacity-70">
                          {t.noPositionsDesc}
                        </p>
                      </div>
                    ) : (
                      <>
                        {/* 投资组合概览 */}
                        {portfolioData && (
                          <div className="grid grid-cols-3 gap-2 p-2 bg-muted/30 rounded-lg mb-3">
                            <div className="text-center">
                              <div className="text-xs text-muted-foreground">{t.availableFunds}</div>
                              <div className="font-medium">${portfolioData.availableCash.toFixed(2)}</div>
                            </div>
                            <div className="text-center">
                              <div className="text-xs text-muted-foreground">{t.positionValue}</div>
                              <div className="font-medium">${portfolioData.positionsValue.toFixed(2)}</div>
                            </div>
                            <div className="text-center">
                              <div className="text-xs text-muted-foreground">{t.totalProfit}</div>
                              <div className={`font-medium ${portfolioData.totalPnL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                {portfolioData.totalPnL >= 0 ? '+' : ''}${portfolioData.totalPnL.toFixed(2)}
                              </div>
                            </div>
                          </div>
                        )}

                        {/* 持仓列表 */}
                        <div className="space-y-2 max-h-[250px] overflow-y-auto">
                          {(portfolioData?.positions || positions).map((pos) => {
                            const position = pos as (PortfolioPosition | TraderPosition);
                            const hasLiveData = 'currentPrice' in position && 'pnl' in position;
                            const pnl = hasLiveData ? (position as PortfolioPosition).pnl : 0;
                            const currentPrice = hasLiveData ? (position as PortfolioPosition).currentPrice : position.avgPrice;
                            const currentValue = hasLiveData ? (position as PortfolioPosition).currentValue : position.cost;
                            
                            return (
                              <div
                                key={position.tokenId}
                                className="p-3 bg-muted/30 rounded-lg border border-transparent hover:border-muted-foreground/20 transition-colors"
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium line-clamp-2">
                                      {position.eventTitle}
                                    </p>
                                    <div className="flex items-center gap-2 mt-1">
                                      <Badge 
                                        variant="outline" 
                                        className={`text-xs ${
                                          hasLiveData && pnl >= 0 
                                            ? 'bg-green-50 dark:bg-green-950/30 text-green-600 border-green-200' 
                                            : hasLiveData && pnl < 0
                                            ? 'bg-red-50 dark:bg-red-950/30 text-red-600 border-red-200'
                                            : 'bg-blue-50 dark:bg-blue-950/30 text-blue-600 border-blue-200'
                                        }`}
                                      >
                                        {hasLiveData ? (pnl >= 0 ? t.profit : t.loss) : t.holding}
                                      </Badge>
                                      {hasLiveData && (
                                        <span className={`text-xs font-medium ${pnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                          {pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                  <div className="text-right shrink-0">
                                    <p className="text-sm font-medium">
                                      {position.size.toFixed(2)} {t.shares}
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                      {t.buyAt} ${position.avgPrice.toFixed(3)} → {t.currentPriceAt} ${currentPrice.toFixed(3)}
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                      {t.value} ${currentValue.toFixed(2)}
                                    </p>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        
                        {/* 刷新按钮 */}
                        <div className="flex justify-center pt-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              fetchPositionsFromChain();
                              fetchPortfolioValue();
                            }}
                            disabled={isLoadingPositions || isLoadingPortfolio}
                            className="text-xs h-7"
                          >
                            {(isLoadingPositions || isLoadingPortfolio) ? (
                              <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                            ) : (
                              <RefreshCw className="w-3 h-3 mr-1" />
                            )}
                            {t.refreshPrice}
                          </Button>
                        </div>
                      </>
                    )}
                  </div>
                </CollapsibleContent>
              </Card>
            </Collapsible>

            {/* Trade History - 交易历史 */}
            <Collapsible 
              open={showTradeHistory} 
              onOpenChange={setShowTradeHistory}
              className="col-span-3"
            >
              <Card className="p-4">
                <CollapsibleTrigger className="w-full">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <BarChart3 className="w-4 h-4 text-muted-foreground" />
                      <h3 className="text-sm text-muted-foreground">{t.tradeHistory}</h3>
                      {tradeStats && (
                        <Badge variant="outline" className="text-xs">
                          {t.tradesCount?.replace('{count}', String(tradeStats.totalTrades)) || tradeStats.totalTrades}
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {tradeStats && tradeStats.totalVolume > 0 && (
                        <span className="text-xs text-muted-foreground">
                          {t.totalVolume}: ${tradeStats.totalVolume.toFixed(2)}
                        </span>
                      )}
                      {showTradeHistory ? (
                        <ChevronUp className="w-4 h-4 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-muted-foreground" />
                      )}
                    </div>
                  </div>
                </CollapsibleTrigger>
                
                <CollapsibleContent>
                  <div className="mt-4 space-y-3">
                    {isLoadingTradeHistory ? (
                      <div className="flex items-center justify-center py-4">
                        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                      </div>
                    ) : tradeHistory.length === 0 ? (
                      <div className="text-center py-4 text-sm text-muted-foreground">
                        {t.noTradeHistory}
                      </div>
                    ) : (
                      <>
                        {/* 交易统计概览 */}
                        {tradeStats && (
                          <div className="grid grid-cols-4 gap-2 p-2 bg-muted/30 rounded-lg mb-3">
                            <div className="text-center">
                              <div className="text-xs text-muted-foreground">{t.totalTrades}</div>
                              <div className="font-medium">{tradeStats.totalTrades}</div>
                            </div>
                            <div className="text-center">
                              <div className="text-xs text-muted-foreground">{t.success}</div>
                              <div className="font-medium text-green-600">{tradeStats.executedTrades}</div>
                            </div>
                            <div className="text-center">
                              <div className="text-xs text-muted-foreground">{t.failed}</div>
                              <div className="font-medium text-red-600">{tradeStats.failedTrades}</div>
                            </div>
                            <div className="text-center">
                              <div className="text-xs text-muted-foreground">{t.totalVolume}</div>
                              <div className="font-medium">${tradeStats.totalVolume.toFixed(0)}</div>
                            </div>
                          </div>
                        )}
                        
                        {/* 交易列表 */}
                        <div className="space-y-2 max-h-[300px] overflow-y-auto">
                          {tradeHistory.map((trade) => (
                            <div 
                              key={trade.id}
                              className={`p-3 rounded-lg border ${
                                trade.status === 'executed' 
                                  ? 'bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800' 
                                  : trade.status === 'failed'
                                  ? 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800'
                                  : 'bg-yellow-50 dark:bg-yellow-950/20 border-yellow-200 dark:border-yellow-800'
                              }`}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 mb-1">
                                    <Badge 
                                      variant="outline" 
                                      className={`text-[10px] ${
                                        trade.side === 'BUY' 
                                          ? 'bg-green-100 text-green-700 border-green-300' 
                                          : 'bg-red-100 text-red-700 border-red-300'
                                      }`}
                                    >
                                      {trade.side}
                                    </Badge>
                                    <Badge 
                                      variant="outline" 
                                      className={`text-[10px] ${
                                        trade.status === 'executed' 
                                          ? 'bg-green-100 text-green-700 border-green-300' 
                                          : trade.status === 'failed'
                                          ? 'bg-red-100 text-red-700 border-red-300'
                                          : 'bg-yellow-100 text-yellow-700 border-yellow-300'
                                      }`}
                                    >
                                      {trade.status === 'executed' ? t.succeeded : trade.status === 'failed' ? t.failedStatus : t.processing}
                                    </Badge>
                                    {trade.signalConfidence && (
                                      <span className="text-[10px] text-muted-foreground">
                                        {t.confidence}: {trade.signalConfidence}%
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-xs font-medium line-clamp-1">{trade.eventTitle}</p>
                                  <div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground">
                                    <span>${trade.amount.toFixed(2)}</span>
                                    <span>@ {(trade.price * 100).toFixed(1)}%</span>
                                    <span>{new Date(trade.createdAt).toLocaleString('zh-CN', {
                                      month: 'numeric',
                                      day: 'numeric',
                                      hour: '2-digit',
                                      minute: '2-digit'
                                    })}</span>
                                  </div>
                                  {trade.errorMessage && (
                                    <p className="text-[10px] text-red-600 mt-1">{trade.errorMessage}</p>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                        
                        {/* 刷新按钮 */}
                        <div className="flex justify-center pt-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={fetchTradeHistoryFromChain}
                            disabled={isLoadingTradeHistory}
                            className="text-xs h-7"
                          >
                            {isLoadingTradeHistory ? (
                              <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                            ) : (
                              <RefreshCw className="w-3 h-3 mr-1" />
                            )}
                            刷新
                          </Button>
                        </div>
                      </>
                    )}
                  </div>
                </CollapsibleContent>
              </Card>
            </Collapsible>

          </div>
        </div>

        {/* Right Sidebar - Analysis Feed */}
        <div className="col-span-6 overflow-hidden flex flex-col border-l pl-4">
          <div className="mb-4">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="text-lg">{t.aiAnalysisFlow}</h3>
              {analysisReports.length > 0 && (
                <Badge variant="outline" className="gap-1">
                  <BarChart3 className="w-3 h-3" />
                  {analysisReports.length}
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {trader.isActive ? (language === 'zh' ? `逐一分析中 (每 ${trader.analysisInterval || 15} 分钟)` : `Analyzing (every ${trader.analysisInterval || 15} min)`) : t.waitingToStart}
            </p>
          </div>

          <div className="flex-1 overflow-y-auto pr-2">
            {/* 分析过程 - 只在分析进行中显示实时进度（分析完成后步骤保存在结果中） */}
            {isAnalyzing && analysisSteps.length > 0 && (
              <Card className={`p-4 mb-4 ${isAnalyzing
                ? 'bg-gradient-to-br from-blue-50 to-purple-50 dark:from-blue-950/20 dark:to-purple-950/20 border-blue-200 dark:border-blue-800'
                : 'bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950/20 dark:to-emerald-950/20 border-green-200 dark:border-green-800'}`}>
                {/* 可点击的头部区域 */}
                <div
                  className="flex items-center gap-3 cursor-pointer"
                  onClick={() => !isAnalyzing && setIsAnalysisProcessExpanded(!isAnalysisProcessExpanded)}
                >
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center ${isAnalyzing
                    ? 'bg-blue-100 dark:bg-blue-950'
                    : 'bg-green-100 dark:bg-green-950'}`}>
                    {isAnalyzing ? (
                      <Brain className="w-5 h-5 text-blue-600 dark:text-blue-400 animate-pulse" />
                    ) : (
                      <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400" />
                    )}
                  </div>
                  <div className="flex-1">
                    <h4 className="font-medium flex items-center gap-2">
                      {isAnalyzing ? t.aiAnalyzing : (language === 'zh' ? '分析过程' : 'Analysis Process')}
                      {!isAnalyzing && (
                        isAnalysisProcessExpanded ?
                          <ChevronUp className="w-4 h-4 text-muted-foreground" /> :
                          <ChevronDown className="w-4 h-4 text-muted-foreground" />
                      )}
                    </h4>
                    <p className="text-xs text-muted-foreground line-clamp-1">
                      {currentAnalyzingEvent || (isAnalyzing ? t.preparing : (language === 'zh' ? '点击展开/收起查看详情' : 'Click to expand/collapse'))}
                    </p>
                  </div>
                  {/* 完成徽章 */}
                  {!isAnalyzing && (
                    <Badge variant="outline" className="text-xs bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 border-green-300 dark:border-green-700">
                      {language === 'zh' ? '已完成' : 'Done'}
                    </Badge>
                  )}
                </div>

                {/* 可折叠的内容区域 */}
                {(isAnalyzing || isAnalysisProcessExpanded) && (
                  <>
                    {/* 进度条 */}
                    <div className="mt-4 mb-4">
                      <Progress value={(analysisSteps.filter(s => s.status === 'completed').length / 6) * 100} className="h-2" />
                      <p className="text-xs text-muted-foreground text-center mt-1">
                        {language === 'zh' ? `${analysisSteps.filter(s => s.status === 'completed').length}/6 步骤完成` : `${analysisSteps.filter(s => s.status === 'completed').length}/6 steps completed`}
                      </p>
                    </div>

                {/* 步骤列表 */}
                <div className="space-y-3">
                  {analysisSteps.map((step, index) => (
                    <Collapsible
                      key={step.id}
                      open={expandedSteps.has(step.id)}
                      onOpenChange={() => toggleStep(step.id)}
                    >
                      <div className="flex gap-3">
                        <div className="flex flex-col items-center">
                          <div className={`w-6 h-6 rounded-full flex items-center justify-center ${
                            step.status === 'completed'
                              ? 'bg-green-100 dark:bg-green-950'
                              : step.status === 'failed'
                              ? 'bg-red-100 dark:bg-red-950'
                              : 'bg-blue-100 dark:bg-blue-950 animate-pulse'
                          }`}>
                            {step.status === 'completed' ? (
                              <CheckCircle2 className="w-3 h-3 text-green-600 dark:text-green-400" />
                            ) : step.status === 'failed' ? (
                              <AlertCircle className="w-3 h-3 text-red-600 dark:text-red-400" />
                            ) : (
                              <Loader2 className="w-3 h-3 text-blue-600 dark:text-blue-400 animate-spin" />
                            )}
                          </div>
                          {index < analysisSteps.length - 1 && (
                            <div className="w-0.5 h-full bg-gradient-to-b from-green-200 to-transparent dark:from-green-900 mt-1" />
                          )}
                        </div>
                        <div className="flex-1 pb-3">
                          <CollapsibleTrigger className="w-full text-left">
                            <div className="flex items-center justify-between group">
                              <h5 className="text-xs font-medium flex items-center gap-1">
                                {getStepDisplayName(step.step)}
                                {step.status === 'completed' && step.data && (
                                  expandedSteps.has(step.id) ? (
                                    <ChevronUp className="w-3 h-3 text-muted-foreground" />
                                  ) : (
                                    <ChevronDown className="w-3 h-3 text-muted-foreground group-hover:text-blue-500" />
                                  )
                                )}
                              </h5>
                              {step.status === 'completed' && (
                                <Badge variant="outline" className="text-[10px] px-1.5 py-0">{tAi.completed}</Badge>
                              )}
                            </div>
                          </CollapsibleTrigger>
                          <p className="text-xs text-muted-foreground mt-0.5">{translateStepContent(step.content)}</p>
                          <CollapsibleContent>
                            {step.status === 'completed' && renderStepDetails(step)}
                          </CollapsibleContent>
                        </div>
                      </div>
                    </Collapsible>
                  ))}
                  </div>
                </>
              )}
              </Card>
            )}

            {/* 无分析结果且未在分析中且没有分析步骤 */}
            {analysisReports.length === 0 && !isAnalyzing && analysisSteps.length === 0 ? (
              <Card className="p-8 text-center">
                <Sparkles className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
                <h4 className="mb-2">等待 AI 分析</h4>
                <p className="text-xs text-muted-foreground">
                  {trader.isActive
                    ? '正在准备第一次分析...'
                    : '点击"启动"开始自动分析'}
                </p>
              </Card>
            ) : analysisReports.length > 0 ? (
              <div className="space-y-3 pb-4">
                {analysisReports.map((report, index) => {
                  const isExpanded = expandedReports.has(report.id);
                  const { action, confidence, riskLevel } = report.decision;
                  // buy_yes/sell_no = 看涨(up), buy_no/sell_yes = 看跌(down), hold = 中性
                  const trend = (action === 'buy_yes' || action === 'sell_no') ? 'up' :
                                (action === 'buy_no' || action === 'sell_yes') ? 'down' : 'neutral';
                  const isSell = action === 'sell_yes' || action === 'sell_no';

                  return (
                    <Card key={report.id} className={`p-4 ${index === 0 ? 'ring-2 ring-blue-500/50' : ''}`}>
                      {/* Header */}
                      <div className="flex items-start justify-between gap-2 mb-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium line-clamp-2">{report.eventTitle}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {new Date(report.timestamp).toLocaleString('zh-CN', {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            })} · {getModelDisplayName(report.aiModel)}
                          </p>
                        </div>
                        {index === 0 && (
                          <Badge variant="secondary" className="text-xs shrink-0">最新</Badge>
                        )}
                      </div>

                      {/* AI 交易建议 - 与 AIAnalysisPanel 一致 */}
                      <div className={`p-3 rounded-lg mb-3 ${
                        trend === 'up' ? 'bg-green-50 dark:bg-green-950/20' :
                        trend === 'down' ? 'bg-red-50 dark:bg-red-950/20' :
                        'bg-gray-50 dark:bg-gray-900/20'
                      }`}>
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                            trend === 'up' ? 'bg-green-500' :
                            trend === 'down' ? 'bg-red-500' : 'bg-gray-500'
                          }`}>
                            {trend === 'up' ? <TrendingUp className="w-5 h-5 text-white" /> :
                             trend === 'down' ? <TrendingDown className="w-5 h-5 text-white" /> :
                             <Minus className="w-5 h-5 text-white" />}
                          </div>
                          <div className="flex-1">
                            <p className="text-lg font-bold">
                              {action === 'buy_yes' ? 'BUY YES' :
                               action === 'buy_no' ? 'BUY NO' :
                               action === 'sell_yes' ? 'SELL YES' :
                               action === 'sell_no' ? 'SELL NO' : 'HOLD'}
                            </p>
                            <div className="flex items-center gap-2 text-xs">
                              <span>{t.confidence}: {confidence}%</span>
                              <Badge variant={riskLevel === 'low' ? 'default' : riskLevel === 'high' ? 'destructive' : 'secondary'} className="text-xs">
                                {riskLevel === 'low' ? t.lowRisk : riskLevel === 'high' ? t.highRisk : t.mediumRisk}
                              </Badge>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Summary */}
                      <p className="text-sm text-muted-foreground mb-3">
                        {report.summary || report.decision.reasoning || t.analysisComplete}
                      </p>

                      {/* 风险因素与关键洞察 - 始终显示（像截图一样） */}
                      {(report.risks?.length > 0 || report.keyInsights?.length > 0) && (
                        <div className="grid grid-cols-2 gap-3 mb-3">
                          {report.risks?.length > 0 && (
                            <div>
                              <h5 className="text-xs font-medium mb-1 text-red-600">{tAi.riskFactors}</h5>
                              <ul className="space-y-1">
                                {report.risks.map((risk, i) => (
                                  <li key={i} className="text-xs flex items-start gap-1">
                                    <AlertCircle className="w-3 h-3 text-red-500 mt-0.5 flex-shrink-0" />
                                    <span className="text-muted-foreground">{risk}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {report.keyInsights?.length > 0 && (
                            <div>
                              <h5 className="text-xs font-medium mb-1 text-green-600">{tAi.keyInsights}</h5>
                              <ul className="space-y-1">
                                {report.keyInsights.map((insight, i) => (
                                  <li key={i} className="text-xs flex items-start gap-1">
                                    <CheckCircle className="w-3 h-3 text-green-500 mt-0.5 flex-shrink-0" />
                                    <span className="text-muted-foreground">{insight}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      )}

                      {/* 分析过程 - 始终显示，可展开查看详细数据（像截图一样） */}
                      {report.steps && report.steps.length > 0 && (
                        <div className="mb-3 pt-3 border-t">
                          <h5 className="text-xs font-medium mb-2 flex items-center gap-2">
                            <Brain className="w-4 h-4 text-purple-500" />
                            {language === 'zh' ? '分析过程' : 'Analysis Process'}
                          </h5>
                          <div className="space-y-2">
                            {report.steps.map((step, stepIndex) => (
                              <Collapsible
                                key={step.id}
                                open={expandedSteps.has(`${report.id}-${step.id}`)}
                                onOpenChange={() => {
                                  const stepKey = `${report.id}-${step.id}`;
                                  setExpandedSteps(prev => {
                                    const newSet = new Set(prev);
                                    if (newSet.has(stepKey)) {
                                      newSet.delete(stepKey);
                                    } else {
                                      newSet.add(stepKey);
                                    }
                                    return newSet;
                                  });
                                }}
                              >
                                <div className="flex gap-2">
                                  <div className="flex flex-col items-center">
                                    <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${
                                      step.status === 'completed'
                                        ? 'bg-green-100 dark:bg-green-950'
                                        : step.status === 'failed'
                                        ? 'bg-red-100 dark:bg-red-950'
                                        : 'bg-blue-100 dark:bg-blue-950'
                                    }`}>
                                      {step.status === 'completed' ? (
                                        <CheckCircle2 className="w-3 h-3 text-green-600 dark:text-green-400" />
                                      ) : step.status === 'failed' ? (
                                        <AlertCircle className="w-3 h-3 text-red-600 dark:text-red-400" />
                                      ) : (
                                        <Loader2 className="w-3 h-3 text-blue-600 dark:text-blue-400" />
                                      )}
                                    </div>
                                    {stepIndex < report.steps!.length - 1 && (
                                      <div className="w-0.5 h-full bg-gradient-to-b from-green-200 to-transparent dark:from-green-900 mt-1" />
                                    )}
                                  </div>
                                  <div className="flex-1 min-w-0 pb-2">
                                    <CollapsibleTrigger className="w-full text-left">
                                      <div className="flex items-center justify-between group">
                                        <p className="text-xs font-medium flex items-center gap-1">
                                          {getStepDisplayName(step.step)}
                                          {step.status === 'completed' && step.data && (
                                            expandedSteps.has(`${report.id}-${step.id}`) ? (
                                              <ChevronUp className="w-3 h-3 text-muted-foreground" />
                                            ) : (
                                              <ChevronDown className="w-3 h-3 text-muted-foreground group-hover:text-blue-500" />
                                            )
                                          )}
                                        </p>
                                        {step.status === 'completed' && (
                                          <Badge variant="outline" className="text-[10px] px-1.5 py-0">{tAi.completed}</Badge>
                                        )}
                                      </div>
                                    </CollapsibleTrigger>
                                    <p className="text-xs text-muted-foreground">{translateStepContent(step.content)}</p>
                                    <CollapsibleContent>
                                      {step.status === 'completed' && renderStepDetails(step)}
                                    </CollapsibleContent>
                                  </div>
                                </div>
                              </Collapsible>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Expand/Collapse */}
                      <button
                        onClick={() => toggleReportExpand(report.id)}
                        className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700"
                      >
                        {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                        {isExpanded ? (language === 'zh' ? '收起详情' : 'Collapse') : t.viewDetails}
                      </button>

                      {/* Expanded Details - 与 AIAnalysisPanel 一致 */}
                      {isExpanded && (
                        <div className="mt-3 pt-3 border-t space-y-4">
                          {/* 市场评估 */}
                          <div>
                            <h5 className="text-xs font-medium mb-2">{t.marketAssessment}</h5>
                            <div className="grid grid-cols-2 gap-2 text-xs">
                              <div className="p-2 bg-muted/50 rounded text-center">
                                <p className="text-muted-foreground">{t.currentPrice}</p>
                                <p className="text-lg font-medium">{((report.marketAssessment?.currentPrice || 0) * 100).toFixed(0)}%</p>
                              </div>
                              <div className="p-2 bg-muted/50 rounded text-center">
                                <p className="text-muted-foreground">{t.fairValue}</p>
                                <p className="text-lg font-medium text-blue-600">{((report.marketAssessment?.fairValue || 0) * 100).toFixed(0)}%</p>
                              </div>
                              <div className="p-2 bg-muted/50 rounded text-center">
                                <p className="text-muted-foreground">{t.pricingDeviation}</p>
                                <p className={`text-lg font-medium ${(report.marketAssessment?.mispricing || 0) > 0 ? 'text-green-600' : (report.marketAssessment?.mispricing || 0) < 0 ? 'text-red-600' : ''}`}>
                                  {(report.marketAssessment?.mispricing || 0) > 0 ? '+' : ''}{(report.marketAssessment?.mispricing || 0).toFixed(1)}%
                                </p>
                              </div>
                              <div className="p-2 bg-muted/50 rounded text-center">
                                <p className="text-muted-foreground">{t.assessment}</p>
                                <Badge variant={report.marketAssessment?.direction === 'underpriced' ? 'default' : report.marketAssessment?.direction === 'overpriced' ? 'destructive' : 'secondary'} className="text-xs">
                                  {report.marketAssessment?.direction === 'underpriced' ? t.underpriced : report.marketAssessment?.direction === 'overpriced' ? t.overpriced : t.fairlyPriced}
                                </Badge>
                              </div>
                            </div>
                          </div>

                          {/* AI 预测概率 */}
                          <div className="p-3 bg-purple-50 dark:bg-purple-950/20 rounded-lg">
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="text-xs text-muted-foreground">{t.aiPrediction}</p>
                                <p className="text-2xl font-bold">{((report.probability?.yes || 0) * 100).toFixed(0)}%</p>
                              </div>
                              <div className="text-right">
                                <p className="text-xs text-muted-foreground">{t.confidence}</p>
                                <p className="text-lg font-medium">{report.probability?.confidence || 0}%</p>
                              </div>
                            </div>
                          </div>

                          {/* 影响因素 */}
                          {report.reasoning?.factors?.length > 0 && (
                            <div>
                              <h5 className="text-xs font-medium mb-2">{t.impactFactors}</h5>
                              <div className="space-y-2">
                                {report.reasoning.factors.map((factor, i) => (
                                  <div key={i} className="p-2 bg-white dark:bg-slate-800 rounded border text-xs">
                                    <div className="flex items-center justify-between mb-1">
                                      <span className="font-medium">{factor.name}</span>
                                      <div className="flex items-center gap-2">
                                        <Badge variant={factor.impact === 'positive' ? 'default' : factor.impact === 'negative' ? 'destructive' : 'secondary'} className="text-xs">
                                        {factor.impact === 'positive' ? tAi.positive : factor.impact === 'negative' ? tAi.negative : tAi.neutral}
                                      </Badge>
                                        <span className="text-muted-foreground">{tAi.weight}: {factor.weight}/10</span>
                                      </div>
                                    </div>
                                    <p className="text-muted-foreground">{factor.explanation}</p>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* 详细分析 */}
                          {report.reasoning?.detailedAnalysis && (
                            <div className="p-3 bg-blue-50 dark:bg-blue-950/20 rounded-lg">
                              <p className="text-xs text-muted-foreground mb-1">{tAi.detailedAnalysis}</p>
                              <p className="text-xs whitespace-pre-wrap">{report.reasoning.detailedAnalysis}</p>
                            </div>
                          )}

                        </div>
                      )}
                    </Card>
                  );
                })}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {/* API Key Configuration Dialog */}
      <ApiKeyDialog
        open={showApiKeyDialog}
        onOpenChange={setShowApiKeyDialog}
        onSaved={() => {
          setAnalysisError(null);
        }}
      />

      {/* 余额不足提示弹窗 */}
      <AlertDialog open={showInsufficientBalanceDialog} onOpenChange={setShowInsufficientBalanceDialog}>
        <AlertDialogContent className="max-w-md bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-amber-500" />
              {language === 'zh' ? 'AI Credits 余额不足' : 'Insufficient AI Credits'}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-4 text-muted-foreground text-sm">
                {/* Trader 已暂停提示 */}
                <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
                  <div className="flex items-start gap-2">
                    <Pause className="w-4 h-4 text-red-600 mt-0.5 shrink-0" />
                    <p className="text-sm text-red-700 dark:text-red-300 font-medium">
                      {language === 'zh' 
                        ? 'Trader 已自动暂停，避免继续产生错误' 
                        : 'Trader has been auto-paused to prevent further errors'}
                    </p>
                  </div>
                </div>
                
                <div className="p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800">
                  <div className="flex items-start gap-2">
                    <Wallet className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                    <div className="text-sm text-amber-700 dark:text-amber-300">
                      <p className="font-medium mb-1">
                        {language === 'zh'
                          ? '您的 AI Credits 余额不足以执行分析'
                          : 'Your AI Credits balance is insufficient for analysis'}
                      </p>
                      <ul className="text-xs space-y-1 text-amber-600 dark:text-amber-400">
                        <li>• {language === 'zh' ? '每次 AI 分析需要消耗一定的 Credits' : 'Each AI analysis consumes some Credits'}</li>
                        <li>• {language === 'zh' ? '充值后可重新启动 Trader' : 'You can restart the Trader after recharging'}</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              {language === 'zh' ? '稍后再说' : 'Later'}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setShowInsufficientBalanceDialog(false);
                // 跳转到充值页面
                window.location.href = '/ai-credits';
              }}
              className="bg-amber-600 hover:bg-amber-700 text-white"
            >
              <Wallet className="w-4 h-4 mr-2" />
              {language === 'zh' ? '去充值' : 'Recharge Now'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 自动交易授权确认对话框 */}
      <AlertDialog open={showAutoTradeConfirm} onOpenChange={setShowAutoTradeConfirm}>
        <AlertDialogContent className="max-w-md bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Bot className="w-5 h-5 text-purple-500" />
              {language === 'zh' ? '启用 AI 自动交易' : 'Enable AI Auto Trading'}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-4 text-muted-foreground text-sm">
                <div className="p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-200 dark:border-purple-800">
                  <div className="flex items-start gap-2">
                    <Shield className="w-4 h-4 text-purple-600 mt-0.5 shrink-0" />
                    <div className="text-sm text-purple-700 dark:text-purple-300">
                      <p className="font-medium mb-1">{language === 'zh' ? '启动自动交易需要授权' : 'Authorization required for auto trading'}</p>
                      <ul className="text-xs space-y-1 text-purple-600 dark:text-purple-400">
                        <li>• {language === 'zh' ? 'AI 分析产生交易信号后将自动执行' : 'Trades execute automatically after AI analysis signals'}</li>
                        <li>• {language === 'zh' ? '您的私钥安全存储在 Privy 安全飞地中' : 'Your private key is securely stored in Privy secure enclave'}</li>
                        <li>• {language === 'zh' ? '交易通过您的 Safe 钱包执行' : 'Trades are executed through your Safe wallet'}</li>
                        <li>• {language === 'zh' ? '您可以随时停止 Trader 或撤销授权' : 'You can stop the Trader or revoke authorization at any time'}</li>
                      </ul>
                    </div>
                  </div>
                </div>

                <div className="p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                    <p className="text-xs text-amber-700 dark:text-amber-300">
                      <strong>{t.riskWarning}:</strong> {t.autoTradeWarningText}
                    </p>
                  </div>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isEnablingDelegation}>
              {language === 'zh' ? '取消' : 'Cancel'}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleConfirmAutoTrade();
              }}
              disabled={isEnablingDelegation}
              className="bg-purple-500 hover:bg-purple-600"
            >
              {isEnablingDelegation ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  {language === 'zh' ? '授权中...' : 'Authorizing...'}
                </>
              ) : (
                <>
                  <Bot className="w-4 h-4 mr-2" />
                  {language === 'zh' ? '确认授权并启动' : 'Confirm & Start'}
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 交易执行结果提示 */}
      {lastTradeResult && (
        <div className={`fixed bottom-4 right-4 p-4 rounded-lg shadow-lg max-w-sm z-50 ${
          lastTradeResult.success 
            ? 'bg-green-50 dark:bg-green-900/90 border border-green-200 dark:border-green-700' 
            : 'bg-red-50 dark:bg-red-900/90 border border-red-200 dark:border-red-700'
        }`}>
          <div className="flex items-start gap-3">
            {lastTradeResult.success ? (
              <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400 shrink-0" />
            ) : (
              <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-medium ${
                lastTradeResult.success 
                  ? 'text-green-800 dark:text-green-200' 
                  : 'text-red-800 dark:text-red-200'
              }`}>
                {lastTradeResult.success ? t.tradeSuccess : t.tradeFailed}
              </p>
              <p className={`text-xs mt-1 ${
                lastTradeResult.success 
                  ? 'text-green-600 dark:text-green-400' 
                  : 'text-red-600 dark:text-red-400'
              }`}>
                {lastTradeResult.success 
                  ? `${language === 'zh' ? '订单 ID' : 'Order ID'}: ${lastTradeResult.orderId?.substring(0, 16)}...` 
                  : lastTradeResult.errorMsg}
              </p>
            </div>
            <button
              onClick={() => setLastTradeResult(null)}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
            >
              ×
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
