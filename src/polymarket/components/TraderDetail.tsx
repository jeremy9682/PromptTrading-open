import { Card } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { 
  ArrowLeft, 
  Play, 
  Pause, 
  Settings, 
  BarChart3,
  Activity,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Sparkles,
  RefreshCw
} from 'lucide-react';
import { Trader } from '../types';
import { useState, useEffect } from 'react';
import { EventMonitorCard } from './EventMonitorCard';
import { PortfolioChart } from './PortfolioChart';
import { AllTradesHistory } from './AllTradesHistory';
import { AIAnalysisReport, AnalysisReport } from './AIAnalysisReport';
import { translations } from '../../constants/translations';
import { useAppStore } from '../../contexts/useAppStore';

interface TraderDetailProps {
  trader: Trader;
  onBack: () => void;
  onUpdate: (updates: Partial<Trader>) => void;
}

// Mock events data
const mockEvents = [
  {
    id: '1',
    title: '2024美国总统大选结果',
    category: '政治',
    yesPrice: 0.52,
    noPrice: 0.48,
    volume: 125000000
  },
  {
    id: '2',
    title: 'AI将在2025年通过图灵测试',
    category: '科技',
    yesPrice: 0.34,
    noPrice: 0.66,
    volume: 5600000
  },
  {
    id: '3',
    title: '比特币价格突破10万美元',
    category: '加密货币',
    yesPrice: 0.68,
    noPrice: 0.32,
    volume: 45000000
  },
  {
    id: '4',
    title: 'SpaceX成功载人登月',
    category: '太空',
    yesPrice: 0.28,
    noPrice: 0.72,
    volume: 12000000
  },
  {
    id: '5',
    title: '全球气温上升1.5°C',
    category: '气候',
    yesPrice: 0.76,
    noPrice: 0.24,
    volume: 3200000
  }
];

export function TraderDetail({ trader, onBack, onUpdate }: TraderDetailProps) {
  const [portfolioValue, setPortfolioValue] = useState(trader.totalValue);
  const [totalPnL, setTotalPnL] = useState(trader.totalPnL);
  const [portfolioHistory, setPortfolioHistory] = useState<Array<{ timestamp: number; value: number }>>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisReports, setAnalysisReports] = useState<AnalysisReport[]>([]);

  // Simulate portfolio changes when active
  useEffect(() => {
    if (!trader.isActive) return;

    const interval = setInterval(() => {
      const change = (Math.random() - 0.5) * 100;
      const newValue = portfolioValue + change;
      const newPnL = newValue - 10000;

      setPortfolioValue(newValue);
      setTotalPnL(newPnL);
      
      setPortfolioHistory(prev => [
        ...prev.slice(-50),
        {
          timestamp: Date.now(),
          value: newValue
        }
      ]);

      // Update parent
      onUpdate({ totalValue: newValue, totalPnL: newPnL });
    }, 4000);

    return () => clearInterval(interval);
  }, [trader.isActive, portfolioValue]);

  const toggleActive = () => {
    onUpdate({ isActive: !trader.isActive });
  };

  // Generate mock analysis report
  const runSingleAnalysis = async () => {
    setIsAnalyzing(true);
    
    // Simulate AI analysis delay
    await new Promise(resolve => setTimeout(resolve, 2500));
    
    const event = monitoredEvents[0]; // Analyze first event for demo
    
    const mockReport: AnalysisReport = {
      id: `analysis-${Date.now()}`,
      timestamp: Date.now(),
      eventId: event.id,
      eventTitle: event.title,
      aiModel: 'GPT-4 Turbo',
      prompt: trader.prompt,
      
      dataCollection: {
        marketData: {
          price: event.yesPrice,
          volume: event.volume,
          liquidity: event.volume * 0.15
        },
        newsArticles: [
          { title: '最新民调显示支持率稳步上升', source: 'Reuters', sentiment: 'positive' },
          { title: '经济政策获得商界认可', source: 'Bloomberg', sentiment: 'positive' },
          { title: '关键州选情仍然胶着', source: 'CNN', sentiment: 'neutral' }
        ],
        socialSentiment: [
          { platform: 'Twitter/X', sentiment: 0.15, mentions: 125000 },
          { platform: 'Reddit', sentiment: 0.08, mentions: 45000 },
          { platform: 'News Articles', sentiment: 0.12, mentions: 8500 }
        ]
      },
      
      newsAnalysis: {
        summary: '近期新闻整体倾向于积极，主要关注点集中在经济政策和民调数据上。多家权威媒体报道显示支持率有所上升，但仍需关注关键摇摆州的动态。',
        keyPoints: [
          '最新民调显示全国支持率上升3个百分点',
          '经济政策获得多家大型企业支持',
          '关键摇摆州选情依然胶着，不确定性较高',
          '社交媒体情绪整体偏向积极'
        ],
        confidence: 72
      },
      
      historicalAnalysis: {
        similarEvents: [
          { title: '2020年美国总统大选', outcome: 'YES', accuracy: 68 },
          { title: '2016年美国总统大选', outcome: 'NO', accuracy: 52 },
          { title: '2012年美国总统大选', outcome: 'YES', accuracy: 71 }
        ],
        patterns: [
          '历史上民调领先3%以上的候选人有75%概率获胜',
          '经济指标强劲时现任政党获胜概率提升15%',
          '关键摇摆州投票率与最终结果高度相关'
        ],
        confidence: 68
      },
      
      sentimentAnalysis: {
        overall: 0.12,
        breakdown: [
          { source: '社交媒体', score: 0.15 },
          { source: '新闻媒体', score: 0.12 },
          { source: '民调机构', score: 0.08 },
          { source: '市场预测', score: 0.14 }
        ],
        confidence: 65
      },
      
      statisticalModel: {
        probability: 0.58,
        factors: [
          { name: '民调数据', impact: 0.15, weight: 30 },
          { name: '经济指标', impact: 0.12, weight: 25 },
          { name: '历史模式', impact: 0.08, weight: 20 },
          { name: '媒体情绪', impact: 0.10, weight: 15 },
          { name: '竞选资金', impact: 0.06, weight: 10 }
        ],
        confidence: 71
      },
      
      riskAssessment: {
        level: 'medium',
        factors: [
          '关键摇摆州选情不确定性较高',
          '距离选举日期尚远，可能出现重大变化',
          '国际局势变化可能影响选情',
          '当前市场流动性充足，风险可控'
        ],
        confidence: 75
      },
      
      decision: {
        action: 'buy_yes',
        confidence: 70,
        reasoning: '综合分析显示，当前YES选项具有一定优势。民调数据积极，经济指标支持，历史模式也倾向于YES。尽管存在一定不确定性，但整体风险可控，建议适度买入YES仓位。',
        targetPrice: 0.55,
        amount: 1500
      }
    };
    
    setAnalysisReports(prev => [mockReport, ...prev]);
    setIsAnalyzing(false);
  };

  const monitoredEvents = mockEvents.filter(e => trader.eventIds.includes(e.id));

  return (
    <div className="space-y-6">
      {/* Back Button */}
      <Button variant="ghost" onClick={onBack} className="gap-2">
        <ArrowLeft className="w-4 h-4" />
        返回Traders列表
      </Button>

      {/* Trader Header */}
      <Card className="p-6 bg-gradient-to-br from-blue-50 to-purple-50 dark:from-blue-950/20 dark:to-purple-950/20 border-blue-200 dark:border-blue-800">
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <h2>{trader.name}</h2>
              {trader.isActive && (
                <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-green-500/20 border border-green-500/30">
                  <Activity className="w-3 h-3 text-green-600 dark:text-green-400 animate-pulse" />
                  <span className="text-xs text-green-700 dark:text-green-400">运行中</span>
                </div>
              )}
            </div>
            <p className="text-sm text-muted-foreground max-w-2xl">
              {trader.prompt}
            </p>
          </div>
          <Button
            size="lg"
            variant={trader.isActive ? "destructive" : "default"}
            onClick={toggleActive}
          >
            {trader.isActive ? (
              <>
                <Pause className="w-4 h-4 mr-2" />
                停止
              </>
            ) : (
              <>
                <Play className="w-4 h-4 mr-2" />
                启动
              </>
            )}
          </Button>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white/70 dark:bg-slate-900/70 rounded-lg p-3">
            <p className="text-sm text-muted-foreground mb-1">总资产</p>
            <p className="text-2xl">${portfolioValue.toFixed(2)}</p>
          </div>
          <div className={`rounded-lg p-3 ${
            totalPnL >= 0 
              ? 'bg-green-100 dark:bg-green-950/30' 
              : 'bg-red-100 dark:bg-red-950/30'
          }`}>
            <p className="text-sm text-muted-foreground mb-1">总盈亏</p>
            <p className={`text-2xl ${totalPnL >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
              {totalPnL >= 0 ? '+' : ''}${totalPnL.toFixed(2)}
            </p>
            <p className={`text-xs ${totalPnL >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
              {((totalPnL / (portfolioValue - totalPnL)) * 100).toFixed(2)}%
            </p>
          </div>
          <div className="bg-white/70 dark:bg-slate-900/70 rounded-lg p-3">
            <p className="text-sm text-muted-foreground mb-1">监控事件</p>
            <p className="text-2xl">{trader.eventIds.length}</p>
          </div>
        </div>
      </Card>

      {/* Portfolio Performance Chart */}
      {portfolioHistory.length > 0 && (
        <Card className="p-6">
          <h3 className="mb-4">投资组合表现</h3>
          <PortfolioChart history={portfolioHistory} />
        </Card>
      )}

      {/* Monitored Events */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3>监控事件 ({monitoredEvents.length})</h3>
          <Button 
            onClick={runSingleAnalysis} 
            disabled={isAnalyzing || monitoredEvents.length === 0}
            variant="outline"
            className="gap-2"
          >
            {isAnalyzing ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                AI分析中...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                单次AI分析
              </>
            )}
          </Button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {monitoredEvents.map((event) => (
            <EventMonitorCard 
              key={event.id} 
              event={event}
              isActive={trader.isActive}
            />
          ))}
        </div>
      </div>

      {/* Analysis Reports */}
      {analysisReports.length > 0 && (
        <div>
          <h3 className="mb-4">AI分析报告历史 ({analysisReports.length})</h3>
          <div className="space-y-4">
            {analysisReports.map((report) => (
              <AIAnalysisReport key={report.id} report={report} />
            ))}
          </div>
        </div>
      )}

      {/* All Trades */}
      {trader.isActive && (
        <Card className="p-6">
          <h3 className="mb-4">所有交易记录</h3>
          <AllTradesHistory traderId={trader.id} />
        </Card>
      )}
    </div>
  );
}