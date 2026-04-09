import { Card } from './ui/card';
import { Button } from './ui/button';
import { Progress } from './ui/progress';
import { Brain, CheckCircle2, Loader2, TrendingUp, TrendingDown, Minus, ChevronDown, ChevronUp, Database, AlertCircle, Search, BarChart3, Key, Wallet } from 'lucide-react';
import { PolymarketEvent, AnalysisStep } from '../types';
import { Badge } from './ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from './ui/collapsible';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import { useState } from 'react';
import { polymarketAPI } from '../../utils/api';
import { usePrivy } from '@privy-io/react-auth';
import { ApiKeyDialog } from './ApiKeyDialog';
import { translations } from '../../constants/translations';
import { useSafeWallet } from '../../contexts/SafeWalletContext';
import { usePositions } from '../../hooks/usePortfolio';

// AI 模型显示名称映射
const MODEL_DISPLAY_NAMES: Record<string, string> = {
  'openai/gpt-5.2': 'GPT-5.2', 'openai/gpt-5.1': 'GPT-5.1', 'openai/gpt-5-pro': 'GPT-5 Pro',
  'openai/gpt-5-mini': 'GPT-5 Mini', 'openai/gpt-4o': 'GPT-4o', 'openai/o3-mini': 'o3-mini',
  'anthropic/claude-sonnet-4.5': 'Claude 4.5 Sonnet', 'anthropic/claude-opus-4.5': 'Claude 4.5 Opus',
  'anthropic/claude-haiku-4.5': 'Claude 4.5 Haiku', 'anthropic/claude-sonnet-4': 'Claude 4 Sonnet',
  'google/gemini-3-pro-preview': 'Gemini 3 Pro', 'google/gemini-2.5-pro': 'Gemini 2.5 Pro',
  'google/gemini-2.5-flash': 'Gemini 2.5 Flash', 'x-ai/grok-4.1-fast': 'Grok 4.1 Fast',
  'x-ai/grok-4': 'Grok 4', 'x-ai/grok-4-fast': 'Grok 4 Fast',
  'deepseek/deepseek-r1-0528': 'DeepSeek R1', 'deepseek/deepseek-r1': 'DeepSeek R1',
  'deepseek/deepseek-chat': 'DeepSeek V3', 'qwen/qwen3-coder': 'Qwen3 Coder',
  'qwen/qwen3-max': 'Qwen3 Max', 'qwen/qwq-32b': 'QwQ 32B',
  'moonshotai/kimi-k2-0905': 'Kimi K2', 'moonshotai/kimi-k2-thinking': 'Kimi K2 Thinking',
  'moonshotai/kimi-k2': 'Kimi K2', 'meta-llama/llama-4-maverick': 'Llama 4 Maverick',
  'meta-llama/llama-4-scout': 'Llama 4 Scout', 'mistralai/mistral-large-2512': 'Mistral Large 3',
  'mistralai/codestral-2508': 'Codestral', 'deepseek': 'DeepSeek',
};

const getModelDisplayName = (modelId: string): string => {
  if (!modelId) return 'DeepSeek V3';
  return MODEL_DISPLAY_NAMES[modelId] || modelId.split('/').pop() || modelId;
};

interface AIAnalysisPanelProps {
  event: PolymarketEvent;
  isAnalyzing: boolean;
  setIsAnalyzing: (value: boolean) => void;
  analysisSteps: AnalysisStep[];
  setAnalysisSteps: (steps: AnalysisStep[]) => void;
  customPrompt: string;
  selectedModel?: string;
  dataSources?: {
    market: boolean;
    news: boolean;
    historical: boolean;
    probability: boolean;
  };
  language?: 'zh' | 'en';
}

// 分析结果类型
interface AnalysisResult {
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
    // 多选项市场支持
    selectedOutcome?: string;      // 选中的选项名称 (如 "Houston")
    selectedOutcomeId?: string;    // 选中的选项 ID
    outcomeSide?: 'yes' | 'no';    // 买 YES 还是 NO
  };
  risks: string[];
  keyInsights: string[];
  // 多选项市场分析
  multiOptionAnalysis?: {
    outcomes: Array<{
      name: string;
      id?: string;
      predictedProbability: number;
      currentPrice: number;
      recommendation: 'buy_yes' | 'buy_no' | 'hold';
      reasoning: string;
    }>;
    bestPick?: string;  // AI 推荐的最佳选项
  };
}

export function AIAnalysisPanel({
  event,
  isAnalyzing,
  setIsAnalyzing,
  analysisSteps,
  setAnalysisSteps,
  customPrompt,
  selectedModel = 'deepseek',
  dataSources = { market: true, news: true, historical: true, probability: true },
  language = 'zh'
}: AIAnalysisPanelProps) {
  const t = translations[language]?.polymarketPage?.aiAnalysis || translations.en.polymarketPage.aiAnalysis;
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set());
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newsData, setNewsData] = useState<any>(null);
  const [showApiKeyDialog, setShowApiKeyDialog] = useState(false);
  const [showInsufficientBalanceDialog, setShowInsufficientBalanceDialog] = useState(false);
  const [expandedSearchContent, setExpandedSearchContent] = useState(false);
  const [currentModel, setCurrentModel] = useState(selectedModel || 'deepseek/deepseek-chat');

  const { user } = usePrivy();
  const userAddress = user?.wallet?.address || null;

  // Safe 钱包状态（用于获取账户余额）
  const { safeAddress, usdcBalance, refreshBalance } = useSafeWallet();

  // 获取用户真实持仓数据
  const { positions: userPositions, refetch: refetchPositions } = usePositions();

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

  // 步骤名称映射
  const stepNameMap: Record<string, { name: string; icon: any }> = {
    init: { name: t.steps?.init || 'Initialize', icon: Brain },
    market_data: { name: t.steps?.marketData || 'Market Data Collection', icon: Database },
    news_search: { name: t.steps?.newsSearch || 'Web Search', icon: Search },
    prompt_generation: { name: t.steps?.promptGeneration || 'Prompt Generation', icon: Search },
    ai_analysis: { name: t.steps?.aiAnalysis || 'AI Analysis', icon: Brain },
    parsing: { name: t.steps?.parsing || 'Result Parsing', icon: BarChart3 },
    complete: { name: t.steps?.complete || 'Analysis Complete', icon: CheckCircle2 },
    error: { name: t.steps?.error || 'Error', icon: AlertCircle }
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
    const dayMatch = dateStr.match(/(\d+)天前/);
    if (dayMatch) {
      const days = dayMatch[1];
      return language === 'zh' ? dateStr : dateStr.replace(/(\d+)天前/, `${days} day${days !== '1' ? 's' : ''} ago`);
    }
    
    const hourMatch = dateStr.match(/(\d+)小时前/);
    if (hourMatch) {
      const hours = hourMatch[1];
      return language === 'zh' ? dateStr : dateStr.replace(/(\d+)小时前/, `${hours} hour${hours !== '1' ? 's' : ''} ago`);
    }
    
    const minuteMatch = dateStr.match(/(\d+)分钟前/);
    if (minuteMatch) {
      const minutes = minuteMatch[1];
      return language === 'zh' ? dateStr : dateStr.replace(/(\d+)分钟前/, `${minutes} minute${minutes !== '1' ? 's' : ''} ago`);
    }
    
    return dateStr;
  };

  const startAnalysis = async () => {
    setIsAnalyzing(true);
    setAnalysisSteps([]);
    setExpandedSteps(new Set());
    setAnalysisResult(null);
    setError(null);
    setNewsData(null);

    try {
      // 刷新余额和持仓以获取最新值（避免闭包捕获旧值）
      let latestBalance = usdcBalance;
      let latestPositions = userPositions;

      if (safeAddress) {
        // 刷新余额
        if (refreshBalance) {
          try {
            latestBalance = await refreshBalance();
            console.log('[AIAnalysisPanel] Refreshed balance:', latestBalance);
          } catch (e) {
            console.warn('[AIAnalysisPanel] Failed to refresh balance:', e);
          }
        }

        // 刷新持仓
        try {
          const result = await refetchPositions();
          latestPositions = result.data || [];
          console.log('[AIAnalysisPanel] Refreshed positions:', latestPositions.length);
        } catch (e) {
          console.warn('[AIAnalysisPanel] Failed to refresh positions:', e);
        }
      }

      // 筛选出与当前事件相关的持仓（event.id 就是 conditionId）
      const eventPositions = latestPositions.filter(pos =>
        pos.conditionId === event.id
      );

      // 计算持仓统计
      const totalPositionsValue = latestPositions.reduce((sum, p) => sum + p.value, 0);
      const totalPnL = latestPositions.reduce((sum, p) => sum + p.pnl, 0);

      // 构建账户信息（包含真实持仓数据）
      const accountInfo = safeAddress ? {
        availableBalance: latestBalance || 0,
        totalPositionsValue,
        totalPnL,
        positions: eventPositions.map(pos => ({
          eventId: pos.conditionId,
          eventTitle: pos.title,
          outcome: pos.outcome,
          tokenId: pos.tokenId,
          size: pos.size,
          avgPrice: pos.avgPrice,
          currentPrice: pos.currentPrice,
          value: pos.value,
          pnl: pos.pnl
        }))
      } : undefined;

      console.log('[AIAnalysisPanel] accountInfo:', {
        availableBalance: accountInfo?.availableBalance,
        totalPositionsValue: accountInfo?.totalPositionsValue,
        positionsCount: accountInfo?.positions?.length || 0,
        eventPositions: eventPositions.map(p => `${p.outcome}: ${p.size} shares`)
      });

      // 转换事件数据格式 - 支持多选项市场
      // 检查是否是多选项市场（outcomes 不是标准的 Yes/No）
      const hasOutcomes = event.outcomes && Array.isArray(event.outcomes) && event.outcomes.length >= 2;
      const hasNonYesNoOutcomes = hasOutcomes &&
        !event.outcomes!.some((o: any) => {
          const name = (o.name || '').toLowerCase().trim();
          return name === 'yes' || name === 'no';
        });
      // Use the flag if provided, otherwise compute it
      const isMultiOptionMarket = (event as any).isMultiOptionMarket ?? (hasOutcomes && hasNonYesNoOutcomes);

      // 构建 outcomes 数据
      let outcomesData;
      if (isMultiOptionMarket && event.outcomes) {
        // 多选项市场：传递所有选项及其 YES/NO 价格
        outcomesData = event.outcomes.map((outcome: any) => ({
          id: outcome.id,
          name: outcome.name,
          yesPrice: outcome.yesPrice ?? outcome.price ?? 0.5,
          noPrice: outcome.noPrice ?? (1 - (outcome.yesPrice ?? outcome.price ?? 0.5)),
          marketTicker: outcome.marketTicker
        }));
      } else {
        // 标准 Yes/No 市场
        outcomesData = [
          { name: 'Yes', price: event.yesPrice },
          { name: 'No', price: event.noPrice }
        ];
      }

      const eventData = {
        id: event.id,
        title: event.title,
        description: event.description,
        category: event.category,
        endDate: event.endDate,
        outcomes: outcomesData,
        isMultiOptionMarket: isMultiOptionMarket,
        volume: event.volume,
        yesPrice: event.yesPrice,
        noPrice: event.noPrice
      };

      // 调用流式 API
      const result = await polymarketAPI.analyzeStream(
        {
          event: eventData,
          dataSources: {
            market: dataSources.market,
            news: dataSources.news
          },
          customPrompt: customPrompt || undefined,
          model: currentModel,
          language: language,
          accountInfo: accountInfo  // 添加账户信息
        },
        (stepEvent) => {
          // 处理每一步的回调
          const stepInfo = stepNameMap[stepEvent.step] || { name: stepEvent.step, icon: Brain };

          // 更新步骤
          const newStep: AnalysisStep = {
            id: `step-${stepEvent.step}-${stepEvent.timestamp}`,
            step: stepInfo.name,
            content: stepEvent.message || '',
            confidence: 0,
            timestamp: stepEvent.timestamp,
            status: stepEvent.status,
            data: stepEvent.data || stepEvent.result
          };

          setAnalysisSteps(prev => {
            // 检查是否已存在相同步骤（更新状态）
            const existingIndex = prev.findIndex(s => s.step === stepInfo.name);
            if (existingIndex >= 0) {
              const updated = [...prev];
              updated[existingIndex] = newStep;
              return updated;
            }
            return [...prev, newStep];
          });

          // 保存新闻数据
          if (stepEvent.step === 'news_search' && stepEvent.status === 'completed') {
            setNewsData(stepEvent.data);
          }

          // 保存最终结果
          if (stepEvent.step === 'complete' && stepEvent.status === 'completed' && stepEvent.result) {
            setAnalysisResult(stepEvent.result.analysis);
          }

          // 处理错误
          if (stepEvent.status === 'failed') {
            // 根据错误码显示不同的错误信息
            if (stepEvent.errorCode === 'INSUFFICIENT_BALANCE') {
              setError(language === 'zh' 
                ? 'AI Credits 余额不足，请充值后重试' 
                : 'Insufficient AI Credits balance, please recharge');
              setShowInsufficientBalanceDialog(true);
            } else if (stepEvent.errorCode === 'USER_API_KEY_REQUIRED') {
              setError(t.apiKeyError || 'Please configure your OpenRouter API Key first');
              setShowApiKeyDialog(true);
            } else {
              setError(stepEvent.error || (t.analysisError || 'Error during analysis'));
            }
          }
        },
        userAddress
      );

      // 如果流式处理完成后还没有结果，从 result 中获取
      if (result?.data?.analysis) {
        setAnalysisResult(result.data.analysis);
      }
    } catch (err: any) {
      console.error('Analysis error:', err);
      // 根据错误码显示不同的错误信息
      if (err.code === 'USER_API_KEY_REQUIRED' || err.message?.includes('API Key')) {
        setError(t.apiKeyError || 'Please configure your OpenRouter API Key first');
        setShowApiKeyDialog(true);
      } else if (err.code === 'INSUFFICIENT_BALANCE' || err.message?.includes('余额不足') || err.message?.includes('Insufficient')) {
        setError(language === 'zh' 
          ? 'AI Credits 余额不足，请充值后重试' 
          : 'Insufficient AI Credits balance, please recharge');
        setShowInsufficientBalanceDialog(true);
      } else {
        setError(err.message || (t.analysisFailed || 'Analysis failed, please try again later'));
      }
    } finally {
      setIsAnalyzing(false);
    }
  };

  const getRecommendation = () => {
    if (!analysisResult?.decision) return null;

    const { action, confidence, riskLevel } = analysisResult.decision;

    // 映射 action 到显示文本
    const actionMap: Record<string, string> = {
      'buy_yes': 'BUY YES',
      'buy_no': 'BUY NO',
      'sell_yes': 'SELL YES',
      'sell_no': 'SELL NO',
      'hold': 'HOLD'
    };

    // 映射 action 到趋势
    const trendMap: Record<string, 'up' | 'down' | 'neutral'> = {
      'buy_yes': 'up',
      'buy_no': 'down',
      'sell_yes': 'down',  // 卖出 YES = 看跌
      'sell_no': 'up',     // 卖出 NO = 看涨
      'hold': 'neutral'
    };

    return {
      action: actionMap[action] || 'HOLD',
      confidence,
      trend: trendMap[action] || 'neutral',
      riskLevel
    };
  };

  const recommendation = getRecommendation();

  const renderStepDetails = (step: AnalysisStep) => {
    const data = step.data as Record<string, any>;
    if (!data) return null;

    return (
      <div className="mt-3 p-4 bg-slate-50 dark:bg-slate-900/50 rounded-lg border space-y-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Database className="w-4 h-4" />
          <span>{t.detailedData}</span>
        </div>

        {/* 初始化 */}
        {step.step === stepNameMap.init.name && data.eventTitle && (
          <div className="text-sm">
            <p className="text-muted-foreground">{t.analyzingEvent}:</p>
            <p className="font-medium">{data.eventTitle}</p>
          </div>
        )}

        {/* 市场数据 */}
        {step.step === stepNameMap.market_data.name && (
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-white dark:bg-slate-800 p-2 rounded">
              <p className="text-xs text-muted-foreground">{t.yesPrice}</p>
              <p className="text-lg text-green-600">{((data.price || 0) * 100).toFixed(1)}%</p>
            </div>
            <div className="bg-white dark:bg-slate-800 p-2 rounded">
              <p className="text-xs text-muted-foreground">{t.noPrice}</p>
              <p className="text-lg text-red-600">{((data.noPrice || 0) * 100).toFixed(1)}%</p>
            </div>
            {data.volume !== undefined && (
              <div className="bg-white dark:bg-slate-800 p-2 rounded">
                <p className="text-xs text-muted-foreground">{t.volume}</p>
                <p className="text-lg">${(data.volume / 1000000).toFixed(2)}M</p>
              </div>
            )}
            {data.spread !== undefined && (
              <div className="bg-white dark:bg-slate-800 p-2 rounded">
                <p className="text-xs text-muted-foreground">{t.spread}</p>
                <p className="text-lg">{(data.spread * 100).toFixed(2)}%</p>
              </div>
            )}
            {data.oneDayPriceChange !== undefined && (
              <div className="bg-white dark:bg-slate-800 p-2 rounded col-span-2">
                <p className="text-xs text-muted-foreground">{t.change24h}</p>
                <p className={`text-lg ${data.oneDayPriceChange >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {data.oneDayPriceChange >= 0 ? '+' : ''}{(data.oneDayPriceChange * 100).toFixed(2)}%
                </p>
              </div>
            )}
          </div>
        )}

        {/* 网络搜索结果 */}
        {step.step === stepNameMap.news_search.name && (
          <div className="space-y-4">
            {/* 数据源状态概览 */}
            <div className="flex flex-wrap items-center gap-2">
              <Search className="w-4 h-4" />
              {data.searchResults === 'available' && (
                <Badge variant="default" className="text-xs bg-green-600">🤖 {t.aiSearch}</Badge>
              )}
              {data.reddit && (
                <Badge variant="default" className="text-xs bg-orange-500">💬 Reddit ({data.reddit.totalPosts})</Badge>
              )}
              {data.googleNews && (
                <Badge variant="default" className="text-xs bg-blue-500">📰 News ({data.googleNews.articlesCount})</Badge>
              )}
              {data.wikipedia && (
                <Badge variant="default" className="text-xs bg-gray-600">📚 Wiki ({data.wikipedia.articlesCount})</Badge>
              )}
              {!data.searchResults && !data.reddit && !data.googleNews && !data.wikipedia && (
                <Badge variant="secondary" className="text-xs">{t.noSearchResults}</Badge>
              )}
            </div>

            {/* AI 搜索摘要 */}
            {data.perplexitySummary && (
              <div className="bg-white dark:bg-slate-800 p-3 rounded overflow-hidden">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <span>🤖</span> {t.aiSearchSummary}
                  </p>
                  <button
                    onClick={() => setExpandedSearchContent(!expandedSearchContent)}
                    className="text-xs text-blue-600 hover:text-blue-800 dark:text-blue-400 flex-shrink-0"
                  >
                    {expandedSearchContent ? t.collapse : t.expandAll}
                  </button>
                </div>
                <div className={`${expandedSearchContent ? 'max-h-80 overflow-y-auto' : ''}`}>
                  <p className={`text-sm whitespace-pre-wrap break-words ${expandedSearchContent ? '' : 'line-clamp-3'}`}>
                    {data.perplexitySummary}
                  </p>
                </div>
                {data.sources && data.sources.length > 0 && expandedSearchContent && (
                  <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
                    <p className="text-xs text-muted-foreground mb-2">{t.citeSources}:</p>
                    <div className="space-y-1">
                      {data.sources.map((source: string, index: number) => (
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

            {/* Reddit 社区讨论 */}
            {data.reddit && (
              <div className="bg-white dark:bg-slate-800 p-3 rounded">
                <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
                  <span>💬</span> {t.redditDiscussion}
                  <Badge variant="secondary" className="text-xs ml-2">{t.free}</Badge>
                </p>
                
                {/* 情绪指标 */}
                {data.reddit.sentiment && (
                  <div className="mb-3">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs">{t.communitySentiment}:</span>
                      <span className={`text-xs font-medium ${
                        data.reddit.sentiment.overall === 'bullish' ? 'text-green-600' :
                        data.reddit.sentiment.overall === 'bearish' ? 'text-red-600' : 'text-yellow-600'
                      }`}>
                        {data.reddit.sentiment.overall === 'bullish' ? `🟢 ${t.bullish}` :
                         data.reddit.sentiment.overall === 'bearish' ? `🔴 ${t.bearish}` : `🟡 ${t.neutral}`}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        ({Math.round((data.reddit.sentiment.score || 0.5) * 100)}%)
                      </span>
                    </div>
                    <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                      <div 
                        className={`h-full transition-all ${
                          data.reddit.sentiment.overall === 'bullish' ? 'bg-green-500' :
                          data.reddit.sentiment.overall === 'bearish' ? 'bg-red-500' : 'bg-yellow-500'
                        }`}
                        style={{ width: `${(data.reddit.sentiment.score || 0.5) * 100}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* 热门讨论 */}
                {data.reddit.topDiscussions && data.reddit.topDiscussions.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground">{t.hotDiscussions}:</p>
                    {data.reddit.topDiscussions.map((post: any, index: number) => (
                      <div key={index} className="text-xs p-2 bg-slate-50 dark:bg-slate-900 rounded">
                        <div className="flex items-start gap-2">
                          <span className={
                            post.sentiment === 'positive' ? '🟢' :
                            post.sentiment === 'negative' ? '🔴' : '🟡'
                          } />
                          <div className="flex-1 min-w-0">
                            <p className="font-medium truncate">{post.title}</p>
                            <p className="text-muted-foreground">
                              r/{post.subreddit} · 👍 {post.score} · 💬 {post.comments}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* 热门关键词 */}
                {data.reddit.trendingKeywords && data.reddit.trendingKeywords.length > 0 && (
                  <div className="mt-2">
                    <p className="text-xs text-muted-foreground mb-1">{t.hotKeywords}:</p>
                    <div className="flex flex-wrap gap-1">
                      {data.reddit.trendingKeywords.map((keyword: string, index: number) => (
                        <Badge key={index} variant="outline" className="text-xs">
                          {keyword}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* News */}
            {data.googleNews && (
              <div className="bg-white dark:bg-slate-800 p-3 rounded">
                <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
                  <span>📰</span> {t.newsReports}
                  <Badge variant="secondary" className="text-xs ml-2">{t.free}</Badge>
                </p>
                
                {/* 新闻列表 */}
                {data.googleNews.articles && data.googleNews.articles.length > 0 && (
                  <div className="space-y-2">
                    {data.googleNews.articles.map((article: any, index: number) => (
                      <div key={index} className="text-xs p-2 bg-slate-50 dark:bg-slate-900 rounded">
                        <p className="font-medium line-clamp-2">{article.title}</p>
                        <p className="text-muted-foreground mt-1">
                          📰 {article.source} · {formatNewsDate(article.pubDateFormatted || article.pubDate)}
                        </p>
                      </div>
                    ))}
                  </div>
                )}

                {/* 来源统计 */}
                {data.googleNews.sources && data.googleNews.sources.length > 0 && (
                  <div className="mt-2">
                    <p className="text-xs text-muted-foreground">
                      {t.source}: {data.googleNews.sources.map((s: any) => `${s.name}(${s.count})`).join(', ')}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Wikipedia 背景知识 */}
            {data.wikipedia && data.wikipedia.articles && data.wikipedia.articles.length > 0 && (
              <div className="bg-white dark:bg-slate-800 p-3 rounded">
                <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
                  <span>📚</span> {language === 'zh' ? 'Wikipedia 背景知识' : 'Wikipedia Background'}
                  <Badge variant="secondary" className="text-xs ml-2">{t.free}</Badge>
                </p>

                {/* Wikipedia 文章列表 */}
                <div className="space-y-2">
                  {data.wikipedia.articles.map((article: any, index: number) => (
                    <div key={index} className="text-xs p-2 bg-slate-50 dark:bg-slate-900 rounded">
                      <a
                        href={article.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-blue-600 hover:text-blue-800 dark:text-blue-400"
                      >
                        {article.title}
                      </a>
                      {article.description && (
                        <p className="text-muted-foreground italic mt-1">{article.description}</p>
                      )}
                      <p className="text-muted-foreground mt-1 line-clamp-3">
                        {article.extractShort || article.extract?.substring(0, 200)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {data.warning && (
              <p className="text-xs text-yellow-600">{data.warning}</p>
            )}
          </div>
        )}

        {/* Prompt 生成 */}
        {step.step === stepNameMap.prompt_generation.name && (
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-white dark:bg-slate-800 p-2 rounded">
              <p className="text-xs text-muted-foreground">{t.promptLength}</p>
              <p className="text-sm font-medium">{data.promptLength?.toLocaleString() || 0} {t.characters}</p>
            </div>
            <div className="bg-white dark:bg-slate-800 p-2 rounded">
              <p className="text-xs text-muted-foreground">{t.customStrategy}</p>
              <p className="text-sm font-medium">{data.hasCustomPrompt ? t.enabled : t.notUsed}</p>
            </div>
            {data.dataSources && (
              <div className="bg-white dark:bg-slate-800 p-2 rounded col-span-2">
                <p className="text-xs text-muted-foreground">{t.dataSources}</p>
                <div className="flex gap-2 mt-1">
                  {data.dataSources.market && <Badge variant="outline" className="text-xs">{t.marketDataSource}</Badge>}
                  {data.dataSources.news && <Badge variant="outline" className="text-xs">{t.newsSearchSource}</Badge>}
                </div>
              </div>
            )}
          </div>
        )}

        {/* AI 分析完成 */}
        {step.step === stepNameMap.ai_analysis.name && data.model && (
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-white dark:bg-slate-800 p-2 rounded">
              <p className="text-xs text-muted-foreground">{t.modelUsed}</p>
              <p className="text-sm font-medium">{data.model}</p>
            </div>
            {data.tokensUsed && (
              <div className="bg-white dark:bg-slate-800 p-2 rounded">
                <p className="text-xs text-muted-foreground">{t.tokenUsage}</p>
                <p className="text-sm font-medium">{data.tokensUsed.toLocaleString()}</p>
              </div>
            )}
            {data.promptTokens && (
              <div className="bg-white dark:bg-slate-800 p-2 rounded">
                <p className="text-xs text-muted-foreground">{t.inputTokens}</p>
                <p className="text-sm">{data.promptTokens.toLocaleString()}</p>
              </div>
            )}
            {data.completionTokens && (
              <div className="bg-white dark:bg-slate-800 p-2 rounded">
                <p className="text-xs text-muted-foreground">{t.outputTokens}</p>
                <p className="text-sm">{data.completionTokens.toLocaleString()}</p>
              </div>
            )}
          </div>
        )}

        {/* 通用数据展示（其他步骤） */}
        {![stepNameMap.init.name, stepNameMap.market_data.name, stepNameMap.news_search.name, stepNameMap.prompt_generation.name, stepNameMap.ai_analysis.name, stepNameMap.complete.name].includes(step.step) && Object.keys(data).length > 0 && (
          <pre className="text-xs bg-white dark:bg-slate-800 p-2 rounded overflow-auto max-h-32">
            {JSON.stringify(data, null, 2)}
          </pre>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4 overflow-hidden">
      {/* Event Info Card */}
      <Card className="p-6 bg-gradient-to-br from-blue-50 to-purple-50 dark:from-blue-950/20 dark:to-purple-950/20 border-blue-200 dark:border-blue-800 overflow-hidden">
        <div className="space-y-2">
          <Badge variant="secondary">{event.category}</Badge>
          <h2 className="text-xl break-words">{event.title}</h2>
          <p className="text-sm text-muted-foreground break-words">{event.description}</p>

          {/* 检查是否是多选项市场 */}
          {(() => {
            // Check for multi-option market using the flag or by checking outcomes
            const hasOutcomes = event.outcomes && Array.isArray(event.outcomes) && event.outcomes.length >= 2;
            const hasNonYesNoOutcomes = hasOutcomes &&
              !event.outcomes!.some((o: any) => {
                const name = (o.name || '').toLowerCase().trim();
                return name === 'yes' || name === 'no';
              });

            // Use the flag if provided, otherwise compute it
            const isMultiOption = (event as any).isMultiOptionMarket ?? (hasOutcomes && hasNonYesNoOutcomes);

            if (isMultiOption && event.outcomes) {
              // 多选项市场：显示所有选项
              return (
                <div className="mt-3 space-y-2">
                  <p className="text-xs text-muted-foreground">{language === 'zh' ? '所有选项' : 'All Options'}</p>
                  <div className="grid grid-cols-2 gap-2">
                    {event.outcomes.slice(0, 6).map((outcome: any) => {
                      const yesPrice = outcome.yesPrice ?? outcome.price ?? 0.5;
                      return (
                        <div key={outcome.id} className="p-2 bg-white/50 dark:bg-slate-800/50 rounded-lg">
                          <p className="text-sm font-medium truncate">{outcome.name}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-xs px-1.5 py-0.5 rounded bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">
                              Y {(yesPrice * 100).toFixed(0)}%
                            </span>
                            <span className="text-xs px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400">
                              N {((1 - yesPrice) * 100).toFixed(0)}%
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {event.outcomes.length > 6 && (
                    <p className="text-xs text-muted-foreground text-center">
                      +{event.outcomes.length - 6} {language === 'zh' ? '更多选项' : 'more options'}
                    </p>
                  )}
                </div>
              );
            } else {
              // 标准 Yes/No 市场
              return (
                <div className="flex gap-4 mt-3">
                  <div className="text-center">
                    <p className="text-xs text-muted-foreground">YES</p>
                    <p className="text-lg text-green-600">{((event.yesPrice || 0) * 100).toFixed(0)}%</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-muted-foreground">NO</p>
                    <p className="text-lg text-red-600">{((event.noPrice || 0) * 100).toFixed(0)}%</p>
                  </div>
                </div>
              );
            }
          })()}
        </div>
      </Card>

      {/* Analysis Control */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-950 flex items-center justify-center">
              <Brain className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h3>{t.title}</h3>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {/* AI Model Selector */}
            <Select value={currentModel} onValueChange={setCurrentModel} disabled={isAnalyzing}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder={language === 'zh' ? '选择 AI 模型' : 'Select AI Model'}>
                  {getModelDisplayName(currentModel)}
                </SelectValue>
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
            <Button
              onClick={startAnalysis}
              disabled={isAnalyzing}
              size="lg"
            >
              {isAnalyzing ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  {t.analyzing}
                </>
              ) : (
                <>
                  <Brain className="w-4 h-4 mr-2" />
                  {t.analyze}
                </>
              )}
            </Button>
          </div>
        </div>

        {/* 自定义 Prompt 显示 */}
        {customPrompt && (
          <div className="mb-4 p-3 bg-purple-50 dark:bg-purple-950/20 rounded-lg">
            <p className="text-xs text-muted-foreground mb-1">{t.customStrategy}</p>
            <p className="text-sm">{customPrompt.substring(0, 100)}{customPrompt.length > 100 ? '...' : ''}</p>
          </div>
        )}

        {/* Analysis Progress */}
        {isAnalyzing && (
          <div className="space-y-2">
            <Progress value={(analysisSteps.length / 6) * 100} className="h-2" />
            <p className="text-xs text-muted-foreground text-center">
              {analysisSteps.length}/6 {t.stepsCompleted}
            </p>
          </div>
        )}

        {/* Error Display */}
        {error && (
          <div className={`mt-4 p-4 rounded-lg border ${
            showInsufficientBalanceDialog
              ? 'bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800'
              : 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800'
          }`}>
            <div className="flex items-center justify-between gap-2">
              <div className={`flex items-center gap-2 ${
                showInsufficientBalanceDialog ? 'text-amber-600' : 'text-red-600'
              }`}>
                {showInsufficientBalanceDialog ? (
                  <Wallet className="w-4 h-4" />
                ) : (
                  <AlertCircle className="w-4 h-4" />
                )}
                <p className="text-sm">{error}</p>
              </div>
              {error.includes('API Key') && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowApiKeyDialog(true)}
                  className="gap-1 text-xs"
                >
                  <Key className="w-3 h-3" />
                  {t.configureApiKey}
                </Button>
              )}
              {showInsufficientBalanceDialog && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    window.location.href = '/ai-credits';
                  }}
                  className="gap-1 text-xs bg-amber-100 hover:bg-amber-200 border-amber-300 text-amber-700"
                >
                  <Wallet className="w-3 h-3" />
                  {language === 'zh' ? '去充值' : 'Recharge'}
                </Button>
              )}
            </div>
          </div>
        )}
      </Card>

      {/* Analysis Steps */}
      {analysisSteps.length > 0 && (
        <Card className="p-6">
          <h3 className="mb-4">{t.analysisProcess}</h3>
          <div className="space-y-4">
            {analysisSteps.map((step, index) => (
              <Collapsible
                key={step.id}
                open={expandedSteps.has(step.id)}
                onOpenChange={() => toggleStep(step.id)}
              >
                <div className="flex gap-4">
                  <div className="flex flex-col items-center">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                      step.status === 'completed'
                        ? 'bg-green-100 dark:bg-green-950'
                        : step.status === 'failed'
                        ? 'bg-red-100 dark:bg-red-950'
                        : 'bg-blue-100 dark:bg-blue-950 animate-pulse'
                    }`}>
                      {step.status === 'completed' ? (
                        <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400" />
                      ) : step.status === 'failed' ? (
                        <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400" />
                      ) : (
                        <Loader2 className="w-4 h-4 text-blue-600 dark:text-blue-400 animate-spin" />
                      )}
                    </div>
                    {index < analysisSteps.length - 1 && (
                      <div className="w-0.5 h-full bg-gradient-to-b from-green-200 to-transparent dark:from-green-900 mt-2" />
                    )}
                  </div>
                  <div className="flex-1 pb-6">
                    <CollapsibleTrigger className="w-full">
                      <div className="flex items-center justify-between mb-2 group">
                        <h4 className="text-sm flex items-center gap-2">
                          {getStepDisplayName(step.step)}
                          {step.status === 'completed' && step.data && (
                            expandedSteps.has(step.id) ? (
                              <ChevronUp className="w-4 h-4 text-muted-foreground" />
                            ) : (
                              <ChevronDown className="w-4 h-4 text-muted-foreground group-hover:text-blue-500" />
                            )
                          )}
                        </h4>
                        {step.status === 'completed' && (
                          <Badge variant="outline" className="text-xs">{t.completed}</Badge>
                        )}
                      </div>
                    </CollapsibleTrigger>
                    <p className="text-sm text-muted-foreground text-left">{translateStepContent(step.content)}</p>

                    <CollapsibleContent>
                      {step.status === 'completed' && renderStepDetails(step)}
                    </CollapsibleContent>
                  </div>
                </div>
              </Collapsible>
            ))}
          </div>
        </Card>
      )}

      {/* AI Analysis Result Details */}
      {analysisResult && !isAnalyzing && (
        <>
          {/* 推理过程 */}
          <Card className="p-6 overflow-hidden">
            <h3 className="mb-4">{t.analysisReasoning}</h3>

            {/* 问题分解 */}
            {analysisResult.reasoning.questionBreakdown?.length > 0 && (
              <div className="mb-4">
                <p className="text-sm text-muted-foreground mb-2">{t.questionBreakdown}</p>
                <ul className="space-y-1">
                  {analysisResult.reasoning.questionBreakdown.map((q, i) => (
                    <li key={i} className="text-sm flex items-start gap-2">
                      <span className="text-blue-500">•</span>
                      {q}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* 基准率分析 */}
            {analysisResult.reasoning.baseRateAnalysis && (
              <div className="mb-4 p-3 bg-slate-50 dark:bg-slate-900/50 rounded-lg">
                <p className="text-sm text-muted-foreground mb-1">{t.historicalBaseRate}</p>
                <p className="text-sm">{analysisResult.reasoning.baseRateAnalysis}</p>
              </div>
            )}

            {/* 影响因素 */}
            {analysisResult.reasoning.factors?.length > 0 && (
              <div className="mb-4">
                <p className="text-sm text-muted-foreground mb-2">{t.impactFactors}</p>
                <div className="space-y-2">
                  {analysisResult.reasoning.factors.map((factor, i) => (
                    <div key={i} className="p-3 bg-white dark:bg-slate-800 rounded-lg border">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium">{factor.name}</span>
                        <div className="flex items-center gap-2">
                          <Badge
                            variant={factor.impact === 'positive' ? 'default' : factor.impact === 'negative' ? 'destructive' : 'secondary'}
                            className="text-xs"
                          >
                            {factor.impact === 'positive' ? t.positive : factor.impact === 'negative' ? t.negative : t.neutral}
                          </Badge>
                          <span className="text-xs text-muted-foreground">{t.weight}: {factor.weight}/10</span>
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground">{factor.explanation}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 详细分析 */}
            {analysisResult.reasoning.detailedAnalysis && (
              <div className="p-3 bg-blue-50 dark:bg-blue-950/20 rounded-lg">
                <p className="text-sm text-muted-foreground mb-1">{t.detailedAnalysis}</p>
                <p className="text-sm whitespace-pre-wrap break-words">{analysisResult.reasoning.detailedAnalysis}</p>
              </div>
            )}
          </Card>

          {/* 市场评估 */}
          <Card className="p-6 overflow-hidden">
            <h3 className="mb-4">{t.marketAssessment}</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center p-3 bg-slate-50 dark:bg-slate-900/50 rounded-lg">
                <p className="text-xs text-muted-foreground">{t.currentPriceLabel}</p>
                <p className="text-2xl">{(analysisResult.marketAssessment.currentPrice * 100).toFixed(0)}%</p>
              </div>
              <div className="text-center p-3 bg-slate-50 dark:bg-slate-900/50 rounded-lg">
                <p className="text-xs text-muted-foreground">{t.fairValue}</p>
                <p className="text-2xl text-blue-600">{(analysisResult.marketAssessment.fairValue * 100).toFixed(0)}%</p>
              </div>
              <div className="text-center p-3 bg-slate-50 dark:bg-slate-900/50 rounded-lg">
                <p className="text-xs text-muted-foreground">{t.pricingBias}</p>
                <p className={`text-2xl ${analysisResult.marketAssessment.mispricing > 0 ? 'text-green-600' : analysisResult.marketAssessment.mispricing < 0 ? 'text-red-600' : ''}`}>
                  {analysisResult.marketAssessment.mispricing > 0 ? '+' : ''}{(typeof analysisResult.marketAssessment.mispricing === 'number' ? analysisResult.marketAssessment.mispricing : 0).toFixed(1)}%
                </p>
              </div>
              <div className="text-center p-3 bg-slate-50 dark:bg-slate-900/50 rounded-lg">
                <p className="text-xs text-muted-foreground">{t.assessment}</p>
                <Badge variant={analysisResult.marketAssessment.direction === 'underpriced' ? 'default' : analysisResult.marketAssessment.direction === 'overpriced' ? 'destructive' : 'secondary'}>
                  {analysisResult.marketAssessment.direction === 'underpriced' ? t.underpriced : analysisResult.marketAssessment.direction === 'overpriced' ? t.overpriced : t.fairlyPriced}
                </Badge>
              </div>
            </div>

            {/* AI 预测概率 */}
            <div className="mt-4 p-4 bg-purple-50 dark:bg-purple-950/20 rounded-lg">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{t.aiPrediction}</p>
                  <p className="text-3xl font-bold">{(analysisResult.probability.yes * 100).toFixed(0)}%</p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-muted-foreground">{t.confidence}</p>
                  <p className="text-xl">{analysisResult.probability.confidence}%</p>
                </div>
              </div>
            </div>
          </Card>

          {/* 风险与洞察 */}
          {(analysisResult.risks?.length > 0 || analysisResult.keyInsights?.length > 0) && (
            <Card className="p-6">
              <div className="grid md:grid-cols-2 gap-6">
                {analysisResult.risks?.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium mb-2 text-red-600">{t.riskFactors}</h4>
                    <ul className="space-y-1">
                      {analysisResult.risks.map((risk, i) => (
                        <li key={i} className="text-sm flex items-start gap-2">
                          <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                          {risk}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {analysisResult.keyInsights?.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium mb-2 text-green-600">{t.keyInsights}</h4>
                    <ul className="space-y-1">
                      {analysisResult.keyInsights.map((insight, i) => (
                        <li key={i} className="text-sm flex items-start gap-2">
                          <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                          {insight}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </Card>
          )}
        </>
      )}

      {/* Recommendation */}
      {recommendation && !isAnalyzing && (
        <Card className="p-6 bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950/20 dark:to-emerald-950/20 border-green-200 dark:border-green-800">
          <div className="flex items-start gap-4">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
              recommendation.trend === 'up'
                ? 'bg-green-500'
                : recommendation.trend === 'down'
                ? 'bg-red-500'
                : 'bg-gray-500'
            }`}>
              {recommendation.trend === 'up' ? (
                <TrendingUp className="w-6 h-6 text-white" />
              ) : recommendation.trend === 'down' ? (
                <TrendingDown className="w-6 h-6 text-white" />
              ) : (
                <Minus className="w-6 h-6 text-white" />
              )}
            </div>
            <div className="flex-1">
              <h3 className="mb-2">{t.aiTradeAdvice}</h3>

              {/* 多选项市场：显示选中的选项 */}
              {analysisResult?.decision.selectedOutcome ? (
                <div className="mb-2">
                  <p className="text-lg font-medium text-blue-600 dark:text-blue-400">
                    {analysisResult.decision.selectedOutcome}
                  </p>
                  <p className="text-2xl">
                    {analysisResult.decision.outcomeSide === 'yes' ? 'BUY YES' : 'BUY NO'}
                  </p>
                </div>
              ) : (
                <p className="text-2xl mb-2">{recommendation.action}</p>
              )}

              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <span>{t.confidence}: {recommendation.confidence.toFixed(0)}%</span>
                <Badge variant={recommendation.riskLevel === 'low' ? 'default' : recommendation.riskLevel === 'high' ? 'destructive' : 'secondary'}>
                  {recommendation.riskLevel === 'low' ? t.lowRisk : recommendation.riskLevel === 'high' ? t.highRisk : t.mediumRisk}
                </Badge>
              </div>
              {analysisResult?.decision.reasoning && (
                <p className="mt-2 text-sm text-muted-foreground">
                  {analysisResult.decision.reasoning}
                </p>
              )}
              <div className="mt-4 p-3 bg-white/50 dark:bg-slate-900/50 rounded-lg">
                <p className="text-xs text-muted-foreground">
                  {t.suggestedPosition}: {analysisResult?.decision.suggestedPosition || 0}% |
                  {t.adjustByRisk}
                </p>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Multi-Option Analysis Results */}
      {analysisResult?.multiOptionAnalysis && !isAnalyzing && (
        <Card className="p-6">
          <h3 className="mb-4">{language === 'zh' ? '多选项分析' : 'Multi-Option Analysis'}</h3>
          <div className="space-y-3">
            {analysisResult.multiOptionAnalysis.outcomes.map((outcome, idx) => (
              <div
                key={idx}
                className={`p-3 rounded-lg border ${
                  outcome.name === analysisResult.multiOptionAnalysis?.bestPick
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/30'
                    : 'border-slate-200 dark:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{outcome.name}</span>
                    {outcome.name === analysisResult.multiOptionAnalysis?.bestPick && (
                      <Badge variant="default" className="text-xs">
                        {language === 'zh' ? 'AI 推荐' : 'AI Pick'}
                      </Badge>
                    )}
                  </div>
                  <Badge
                    variant={
                      outcome.recommendation === 'buy_yes' ? 'default' :
                      outcome.recommendation === 'buy_no' ? 'destructive' : 'secondary'
                    }
                  >
                    {outcome.recommendation === 'buy_yes' ? 'BUY YES' :
                     outcome.recommendation === 'buy_no' ? 'BUY NO' : 'HOLD'}
                  </Badge>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-muted-foreground">{language === 'zh' ? '当前价格' : 'Current'}:</span>
                    <span className="ml-1">{(outcome.currentPrice * 100).toFixed(0)}%</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">{language === 'zh' ? 'AI 预测' : 'AI Prediction'}:</span>
                    <span className="ml-1 text-blue-600">{(outcome.predictedProbability * 100).toFixed(0)}%</span>
                  </div>
                </div>
                {outcome.reasoning && (
                  <p className="text-xs text-muted-foreground mt-2">{outcome.reasoning}</p>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* API Key Configuration Dialog */}
      <ApiKeyDialog
        open={showApiKeyDialog}
        onOpenChange={setShowApiKeyDialog}
        onSaved={() => {
          setError(null);
        }}
      />

    </div>
  );
}
