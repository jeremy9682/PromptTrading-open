import { Card } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from './ui/collapsible';
import { 
  ChevronDown, 
  ChevronUp,
  Brain, 
  Newspaper, 
  BarChart3, 
  TrendingUp, 
  MessageSquare,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Sparkles,
  Clock,
  Target,
  DollarSign
} from 'lucide-react';
import { useState } from 'react';

// 模型 ID 到显示名称的映射
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
  'mistralai/codestral-2508': 'Codestral', 'deepseek': 'DeepSeek', 'gpt-4': 'GPT-4',
  'gpt-4o': 'GPT-4o', 'gpt-4o-mini': 'GPT-4o Mini', 'claude-3-5-sonnet': 'Claude 3.5 Sonnet',
};

const getModelDisplayName = (modelId: string): string => {
  if (!modelId) return 'DeepSeek';
  return MODEL_DISPLAY_NAMES[modelId] || modelId.split('/').pop() || modelId;
};

export interface AnalysisReport {
  id: string;
  timestamp: number;
  eventId: string;
  eventTitle: string;
  aiModel: string;
  prompt: string;
  
  // Analysis steps
  dataCollection: {
    marketData: { price: number; volume: number; liquidity: number };
    newsArticles: { title: string; source: string; sentiment: 'positive' | 'negative' | 'neutral' }[];
    socialSentiment: { platform: string; sentiment: number; mentions: number }[];
  };
  
  newsAnalysis: {
    summary: string;
    keyPoints: string[];
    confidence: number;
  };
  
  historicalAnalysis: {
    similarEvents: { title: string; outcome: string; accuracy: number }[];
    patterns: string[];
    confidence: number;
  };
  
  sentimentAnalysis: {
    overall: number;
    breakdown: { source: string; score: number }[];
    confidence: number;
  };
  
  statisticalModel: {
    probability: number;
    factors: { name: string; impact: number; weight: number }[];
    confidence: number;
  };
  
  riskAssessment: {
    level: 'low' | 'medium' | 'high';
    factors: string[];
    confidence: number;
  };
  
  // Final decision
  decision: {
    action: 'buy_yes' | 'buy_no' | 'hold' | 'sell';
    confidence: number;
    reasoning: string;
    targetPrice?: number;
    amount?: number;
  };
}

interface AIAnalysisReportProps {
  report: AnalysisReport;
}

export function AIAnalysisReport({ report }: AIAnalysisReportProps) {
  const [openSections, setOpenSections] = useState<string[]>(['decision']);
  const [isReportOpen, setIsReportOpen] = useState(true);

  const toggleSection = (section: string) => {
    setOpenSections(prev => 
      prev.includes(section) 
        ? prev.filter(s => s !== section)
        : [...prev, section]
    );
  };

  const getActionBadge = (action: string) => {
    switch (action) {
      case 'buy_yes':
        return <Badge className="bg-green-600">买入 YES</Badge>;
      case 'buy_no':
        return <Badge className="bg-red-600">买入 NO</Badge>;
      case 'hold':
        return <Badge variant="secondary">持仓观望</Badge>;
      case 'sell':
        return <Badge variant="destructive">卖出</Badge>;
      default:
        return <Badge variant="outline">无操作</Badge>;
    }
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 75) return 'text-green-600 dark:text-green-400';
    if (confidence >= 60) return 'text-yellow-600 dark:text-yellow-400';
    return 'text-red-600 dark:text-red-400';
  };

  const getSentimentEmoji = (sentiment: 'positive' | 'negative' | 'neutral') => {
    switch (sentiment) {
      case 'positive': return '📈';
      case 'negative': return '📉';
      default: return '➡️';
    }
  };

  return (
    <Card className="overflow-hidden">
      {/* Collapsible Header */}
      <Collapsible open={isReportOpen} onOpenChange={setIsReportOpen}>
        <CollapsibleTrigger asChild>
          <div className="p-4 cursor-pointer hover:bg-muted/50 transition-colors border-b">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <Brain className="w-5 h-5 text-purple-600" />
                  <h3 className="text-lg">AI分析报告</h3>
                  {getActionBadge(report.decision.action)}
                  <Badge className={getConfidenceColor(report.decision.confidence)}>
                    {report.decision.confidence}%
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground line-clamp-1">{report.eventTitle}</p>
                <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {new Date(report.timestamp).toLocaleString('zh-CN', { 
                      month: 'short', 
                      day: 'numeric', 
                      hour: '2-digit', 
                      minute: '2-digit' 
                    })}
                  </div>
                  <div className="flex items-center gap-1">
                    <Sparkles className="w-3 h-3" />
                    {getModelDisplayName(report.aiModel)}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {isReportOpen ? (
                  <ChevronUp className="w-5 h-5 text-muted-foreground" />
                ) : (
                  <ChevronDown className="w-5 h-5 text-muted-foreground" />
                )}
              </div>
            </div>
          </div>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="p-6 pt-4 space-y-4">
            {/* Final Decision */}
            <Collapsible open={openSections.includes('decision')}>
              <CollapsibleTrigger asChild>
                <Button
                  variant="ghost"
                  className="w-full justify-between p-4 h-auto hover:bg-muted/50"
                  onClick={() => toggleSection('decision')}
                >
                  <div className="flex items-center gap-2">
                    <Target className="w-4 h-4 text-blue-600" />
                    <span className="font-medium">最终决策</span>
                    <Badge className={getConfidenceColor(report.decision.confidence)}>
                      置信度 {report.decision.confidence}%
                    </Badge>
                  </div>
                  {openSections.includes('decision') ? (
                    <ChevronUp className="w-4 h-4" />
                  ) : (
                    <ChevronDown className="w-4 h-4" />
                  )}
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="px-4 pb-4 space-y-3">
                <div className="p-4 bg-blue-50 dark:bg-blue-950/20 rounded-lg">
                  <p className="text-sm mb-3">{report.decision.reasoning}</p>
                  {report.decision.targetPrice && (
                    <div className="flex items-center gap-4 text-sm">
                      <div className="flex items-center gap-1">
                        <DollarSign className="w-4 h-4" />
                        <span>目标价格: {(report.decision.targetPrice * 100).toFixed(1)}¢</span>
                      </div>
                      {report.decision.amount && (
                        <div>
                          <span>建议仓位: ${report.decision.amount.toFixed(0)}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </CollapsibleContent>
            </Collapsible>

            {/* Data Collection */}
            <Collapsible open={openSections.includes('data')}>
              <CollapsibleTrigger asChild>
                <Button
                  variant="ghost"
                  className="w-full justify-between p-4 h-auto hover:bg-muted/50"
                  onClick={() => toggleSection('data')}
                >
                  <div className="flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-purple-600" />
                    <span className="font-medium">数据收集</span>
                  </div>
                  {openSections.includes('data') ? (
                    <ChevronUp className="w-4 h-4" />
                  ) : (
                    <ChevronDown className="w-4 h-4" />
                  )}
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="px-4 pb-4 space-y-3">
                <div className="grid grid-cols-3 gap-3 text-sm">
                  <div className="p-3 bg-muted rounded-lg">
                    <p className="text-xs text-muted-foreground mb-1">当前价格</p>
                    <p className="font-medium">{(report.dataCollection.marketData.price * 100).toFixed(1)}¢</p>
                  </div>
                  <div className="p-3 bg-muted rounded-lg">
                    <p className="text-xs text-muted-foreground mb-1">交易量</p>
                    <p className="font-medium">${(report.dataCollection.marketData.volume / 1000000).toFixed(1)}M</p>
                  </div>
                  <div className="p-3 bg-muted rounded-lg">
                    <p className="text-xs text-muted-foreground mb-1">流动性</p>
                    <p className="font-medium">${(report.dataCollection.marketData.liquidity / 1000).toFixed(0)}K</p>
                  </div>
                </div>
                
                <div>
                  <p className="text-xs text-muted-foreground mb-2">社交媒体情绪</p>
                  <div className="space-y-2">
                    {report.dataCollection.socialSentiment.map((social, i) => (
                      <div key={i} className="flex items-center justify-between text-sm p-2 bg-muted rounded">
                        <span>{social.platform}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">{social.mentions} 提及</span>
                          <span className={social.sentiment > 0 ? 'text-green-600' : 'text-red-600'}>
                            {social.sentiment > 0 ? '+' : ''}{(social.sentiment * 100).toFixed(0)}%
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </CollapsibleContent>
            </Collapsible>

            {/* News Analysis */}
            <Collapsible open={openSections.includes('news')}>
              <CollapsibleTrigger asChild>
                <Button
                  variant="ghost"
                  className="w-full justify-between p-4 h-auto hover:bg-muted/50"
                  onClick={() => toggleSection('news')}
                >
                  <div className="flex items-center gap-2">
                    <Newspaper className="w-4 h-4 text-orange-600" />
                    <span className="font-medium">新闻分析</span>
                    <Badge className={getConfidenceColor(report.newsAnalysis.confidence)}>
                      {report.newsAnalysis.confidence}%
                    </Badge>
                  </div>
                  {openSections.includes('news') ? (
                    <ChevronUp className="w-4 h-4" />
                  ) : (
                    <ChevronDown className="w-4 h-4" />
                  )}
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="px-4 pb-4 space-y-3">
                <p className="text-sm p-3 bg-muted rounded-lg">{report.newsAnalysis.summary}</p>
                <div>
                  <p className="text-xs text-muted-foreground mb-2">关键要点</p>
                  <ul className="space-y-1">
                    {report.newsAnalysis.keyPoints.map((point, i) => (
                      <li key={i} className="text-sm flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 text-green-600 mt-0.5 shrink-0" />
                        <span>{point}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-2">参考新闻</p>
                  <div className="space-y-2">
                    {report.dataCollection.newsArticles.map((article, i) => (
                      <div key={i} className="text-sm p-2 bg-muted rounded flex items-start gap-2">
                        <span className="text-lg shrink-0">{getSentimentEmoji(article.sentiment)}</span>
                        <div className="flex-1">
                          <p className="font-medium">{article.title}</p>
                          <p className="text-xs text-muted-foreground">{article.source}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </CollapsibleContent>
            </Collapsible>

            {/* Historical Analysis */}
            <Collapsible open={openSections.includes('historical')}>
              <CollapsibleTrigger asChild>
                <Button
                  variant="ghost"
                  className="w-full justify-between p-4 h-auto hover:bg-muted/50"
                  onClick={() => toggleSection('historical')}
                >
                  <div className="flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-blue-600" />
                    <span className="font-medium">历史对比</span>
                    <Badge className={getConfidenceColor(report.historicalAnalysis.confidence)}>
                      {report.historicalAnalysis.confidence}%
                    </Badge>
                  </div>
                  {openSections.includes('historical') ? (
                    <ChevronUp className="w-4 h-4" />
                  ) : (
                    <ChevronDown className="w-4 h-4" />
                  )}
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="px-4 pb-4 space-y-3">
                <div>
                  <p className="text-xs text-muted-foreground mb-2">类似历史事件</p>
                  <div className="space-y-2">
                    {report.historicalAnalysis.similarEvents.map((event, i) => (
                      <div key={i} className="text-sm p-3 bg-muted rounded">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-medium">{event.title}</span>
                          <Badge variant={event.outcome === 'YES' ? 'default' : 'destructive'}>
                            {event.outcome}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          市场预测准确率: {event.accuracy}%
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-2">识别的模式</p>
                  <ul className="space-y-1">
                    {report.historicalAnalysis.patterns.map((pattern, i) => (
                      <li key={i} className="text-sm flex items-start gap-2">
                        <AlertCircle className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
                        <span>{pattern}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </CollapsibleContent>
            </Collapsible>

            {/* Sentiment Analysis */}
            <Collapsible open={openSections.includes('sentiment')}>
              <CollapsibleTrigger asChild>
                <Button
                  variant="ghost"
                  className="w-full justify-between p-4 h-auto hover:bg-muted/50"
                  onClick={() => toggleSection('sentiment')}
                >
                  <div className="flex items-center gap-2">
                    <MessageSquare className="w-4 h-4 text-green-600" />
                    <span className="font-medium">市场情绪</span>
                    <Badge className={getConfidenceColor(report.sentimentAnalysis.confidence)}>
                      {report.sentimentAnalysis.confidence}%
                    </Badge>
                  </div>
                  {openSections.includes('sentiment') ? (
                    <ChevronUp className="w-4 h-4" />
                  ) : (
                    <ChevronDown className="w-4 h-4" />
                  )}
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="px-4 pb-4 space-y-3">
                <div className="p-4 bg-muted rounded-lg">
                  <p className="text-xs text-muted-foreground mb-1">综合情绪指数</p>
                  <p className={`text-2xl font-medium ${
                    report.sentimentAnalysis.overall > 0 ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {report.sentimentAnalysis.overall > 0 ? '+' : ''}{(report.sentimentAnalysis.overall * 100).toFixed(0)}%
                  </p>
                </div>
                <div className="space-y-2">
                  {report.sentimentAnalysis.breakdown.map((item, i) => (
                    <div key={i} className="flex items-center justify-between text-sm">
                      <span>{item.source}</span>
                      <div className="flex items-center gap-2">
                        <div className="w-24 h-2 bg-muted rounded-full overflow-hidden">
                          <div 
                            className={`h-full ${item.score > 0 ? 'bg-green-500' : 'bg-red-500'}`}
                            style={{ width: `${Math.abs(item.score) * 100}%` }}
                          />
                        </div>
                        <span className={item.score > 0 ? 'text-green-600' : 'text-red-600'}>
                          {item.score > 0 ? '+' : ''}{(item.score * 100).toFixed(0)}%
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </CollapsibleContent>
            </Collapsible>

            {/* Statistical Model */}
            <Collapsible open={openSections.includes('statistical')}>
              <CollapsibleTrigger asChild>
                <Button
                  variant="ghost"
                  className="w-full justify-between p-4 h-auto hover:bg-muted/50"
                  onClick={() => toggleSection('statistical')}
                >
                  <div className="flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-indigo-600" />
                    <span className="font-medium">统计建模</span>
                    <Badge className={getConfidenceColor(report.statisticalModel.confidence)}>
                      {report.statisticalModel.confidence}%
                    </Badge>
                  </div>
                  {openSections.includes('statistical') ? (
                    <ChevronUp className="w-4 h-4" />
                  ) : (
                    <ChevronDown className="w-4 h-4" />
                  )}
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="px-4 pb-4 space-y-3">
                <div className="p-4 bg-muted rounded-lg">
                  <p className="text-xs text-muted-foreground mb-1">模型预测概率</p>
                  <p className="text-2xl font-medium text-blue-600">
                    {(report.statisticalModel.probability * 100).toFixed(1)}%
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-2">影响因子</p>
                  <div className="space-y-2">
                    {report.statisticalModel.factors.map((factor, i) => (
                      <div key={i} className="text-sm">
                        <div className="flex items-center justify-between mb-1">
                          <span>{factor.name}</span>
                          <span className="text-xs text-muted-foreground">权重 {factor.weight}%</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-blue-500"
                              style={{ width: `${Math.abs(factor.impact) * 100}%` }}
                            />
                          </div>
                          <span className={factor.impact > 0 ? 'text-green-600' : 'text-red-600'}>
                            {factor.impact > 0 ? '+' : ''}{(factor.impact * 100).toFixed(0)}%
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </CollapsibleContent>
            </Collapsible>

            {/* Risk Assessment */}
            <Collapsible open={openSections.includes('risk')}>
              <CollapsibleTrigger asChild>
                <Button
                  variant="ghost"
                  className="w-full justify-between p-4 h-auto hover:bg-muted/50"
                  onClick={() => toggleSection('risk')}
                >
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-red-600" />
                    <span className="font-medium">风险评估</span>
                    <Badge 
                      variant={
                        report.riskAssessment.level === 'low' ? 'default' :
                        report.riskAssessment.level === 'medium' ? 'secondary' :
                        'destructive'
                      }
                    >
                      {report.riskAssessment.level === 'low' ? '低风险' :
                       report.riskAssessment.level === 'medium' ? '中风险' :
                       '高风险'}
                    </Badge>
                  </div>
                  {openSections.includes('risk') ? (
                    <ChevronUp className="w-4 h-4" />
                  ) : (
                    <ChevronDown className="w-4 h-4" />
                  )}
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="px-4 pb-4">
                <ul className="space-y-2">
                  {report.riskAssessment.factors.map((factor, i) => (
                    <li key={i} className="text-sm flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 text-orange-600 mt-0.5 shrink-0" />
                      <span>{factor}</span>
                    </li>
                  ))}
                </ul>
              </CollapsibleContent>
            </Collapsible>

            {/* User Prompt */}
            <Collapsible open={openSections.includes('prompt')}>
              <CollapsibleTrigger asChild>
                <Button
                  variant="ghost"
                  className="w-full justify-between p-4 h-auto hover:bg-muted/50"
                  onClick={() => toggleSection('prompt')}
                >
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-yellow-600" />
                    <span className="font-medium">使用的策略Prompt</span>
                  </div>
                  {openSections.includes('prompt') ? (
                    <ChevronUp className="w-4 h-4" />
                  ) : (
                    <ChevronDown className="w-4 h-4" />
                  )}
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="px-4 pb-4">
                <pre className="text-xs p-3 bg-muted rounded-lg overflow-x-auto whitespace-pre-wrap font-mono">
                  {report.prompt}
                </pre>
              </CollapsibleContent>
            </Collapsible>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}