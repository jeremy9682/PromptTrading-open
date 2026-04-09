import { Card } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Switch } from './ui/switch';
import { Label } from './ui/label';
import { 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  BarChart3,
  Activity,
  AlertCircle,
  Play,
  Pause,
  Target,
  Users,
  Brain
} from 'lucide-react';
import { PolymarketEvent, AnalysisStep, TradePosition } from '../types';
import { useState, useEffect } from 'react';
import { PositionChart } from './PositionChart';
import { TradeHistory } from './TradeHistory';
import { MarketPriceChart } from './MarketPriceChart';

interface TradingDashboardProps {
  event: PolymarketEvent;
  isAutoTrading: boolean;
  setIsAutoTrading: (value: boolean) => void;
  analysisSteps: AnalysisStep[];
}

export interface MarketPrice {
  timestamp: number;
  yesPrice: number;
  noPrice: number;
}

export function TradingDashboard({
  event,
  isAutoTrading,
  setIsAutoTrading,
  analysisSteps
}: TradingDashboardProps) {
  const [positions, setPositions] = useState<TradePosition[]>([]);
  const [marketPrices, setMarketPrices] = useState<MarketPrice[]>([]);
  const [currentPosition, setCurrentPosition] = useState(0);
  const [portfolioValue, setPortfolioValue] = useState(10000);
  const [totalPnL, setTotalPnL] = useState(0);

  // Simulate real-time market price changes
  useEffect(() => {
    const interval = setInterval(() => {
      const time = Date.now();
      const yesChange = (Math.random() - 0.5) * 0.02;
      const currentYes = marketPrices.length > 0 
        ? marketPrices[marketPrices.length - 1].yesPrice 
        : event.yesPrice;
      
      const newYesPrice = Math.max(0.05, Math.min(0.95, currentYes + yesChange));
      const newNoPrice = 1 - newYesPrice;

      setMarketPrices(prev => [
        ...prev.slice(-100),
        {
          timestamp: time,
          yesPrice: newYesPrice,
          noPrice: newNoPrice
        }
      ]);
    }, 2000);

    return () => clearInterval(interval);
  }, [marketPrices, event.yesPrice]);

  useEffect(() => {
    if (!isAutoTrading) return;

    // Simulate trading activity
    const interval = setInterval(() => {
      const time = Date.now();
      const randomChange = (Math.random() - 0.5) * 200;
      const newPosition = currentPosition + randomChange;
      const action: 'buy' | 'sell' | 'hold' = 
        randomChange > 50 ? 'buy' : 
        randomChange < -50 ? 'sell' : 'hold';

      const newValue = portfolioValue + randomChange * 0.5;
      const pnl = newValue - 10000;

      setCurrentPosition(newPosition);
      setPortfolioValue(newValue);
      setTotalPnL(pnl);

      setPositions(prev => [
        ...prev.slice(-50),
        {
          timestamp: time,
          position: newPosition,
          value: newValue,
          action
        }
      ]);
    }, 3000);

    return () => clearInterval(interval);
  }, [isAutoTrading, currentPosition, portfolioValue]);

  const toggleAutoTrading = () => {
    if (!isAutoTrading && analysisSteps.length === 0) {
      alert('请先运行AI分析再启动自动交易');
      return;
    }
    setIsAutoTrading(!isAutoTrading);
  };

  const currentMarketPrice = marketPrices.length > 0 
    ? marketPrices[marketPrices.length - 1]
    : { yesPrice: event.yesPrice, noPrice: event.noPrice, timestamp: Date.now() };

  const priceChange24h = marketPrices.length > 10
    ? ((currentMarketPrice.yesPrice - marketPrices[marketPrices.length - 10].yesPrice) / marketPrices[marketPrices.length - 10].yesPrice) * 100
    : 0;

  return (
    <div className="space-y-4">
      {/* Market Overview Card */}
      <Card className="p-6 bg-gradient-to-br from-indigo-50 to-blue-50 dark:from-indigo-950/20 dark:to-blue-950/20 border-indigo-200 dark:border-indigo-800">
        <div className="space-y-4">
          <div className="flex items-start justify-between">
            <div>
              <Badge variant="secondary" className="mb-2">{event.category}</Badge>
              <h3 className="mb-1">{event.title}</h3>
              <p className="text-sm text-muted-foreground">
                截止时间: {new Date(event.endDate).toLocaleDateString('zh-CN')}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground mb-1">交易量</p>
              <p className="text-xl">${(event.volume / 1000000).toFixed(1)}M</p>
            </div>
          </div>

          {/* Current Market Prices */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white dark:bg-slate-900 rounded-lg p-4 border-2 border-green-200 dark:border-green-800">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-muted-foreground">YES 价格</span>
                <Badge variant="outline" className={priceChange24h >= 0 ? 'text-green-600' : 'text-red-600'}>
                  {priceChange24h >= 0 ? '+' : ''}{priceChange24h.toFixed(2)}%
                </Badge>
              </div>
              <p className="text-3xl mb-1">{(currentMarketPrice.yesPrice * 100).toFixed(1)}¢</p>
              <p className="text-xs text-muted-foreground">
                {(currentMarketPrice.yesPrice * 100).toFixed(2)}% 概率
              </p>
            </div>

            <div className="bg-white dark:bg-slate-900 rounded-lg p-4 border-2 border-red-200 dark:border-red-800">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-muted-foreground">NO 价格</span>
                <Badge variant="outline" className={priceChange24h <= 0 ? 'text-green-600' : 'text-red-600'}>
                  {priceChange24h <= 0 ? '+' : ''}{(-priceChange24h).toFixed(2)}%
                </Badge>
              </div>
              <p className="text-3xl mb-1">{(currentMarketPrice.noPrice * 100).toFixed(1)}¢</p>
              <p className="text-xs text-muted-foreground">
                {(currentMarketPrice.noPrice * 100).toFixed(2)}% 概率
              </p>
            </div>
          </div>
        </div>
      </Card>

      {/* Market Price Chart */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            <h3>市场价格走势</h3>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded-full bg-green-500" />
              <span className="text-xs text-muted-foreground">YES</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded-full bg-red-500" />
              <span className="text-xs text-muted-foreground">NO</span>
            </div>
          </div>
        </div>
        {marketPrices.length > 0 ? (
          <MarketPriceChart prices={marketPrices} />
        ) : (
          <div className="h-48 flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <Activity className="w-12 h-12 mx-auto mb-2 opacity-20" />
              <p className="text-sm">正在加载市场数据...</p>
            </div>
          </div>
        )}
      </Card>

      {/* Trading Control */}
      <Card className="p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
              isAutoTrading ? 'bg-green-500' : 'bg-gray-200 dark:bg-gray-800'
            }`}>
              {isAutoTrading ? (
                <Activity className="w-6 h-6 text-white animate-pulse" />
              ) : (
                <Target className="w-6 h-6 text-gray-500" />
              )}
            </div>
            <div>
              <h3>AI自动交易</h3>
              <p className="text-sm text-muted-foreground">
                {isAutoTrading ? '交易机器人正在运行，实时跟踪市场变化' : '启动后将根据AI分析自动执行交易'}
              </p>
            </div>
          </div>
          <Button
            size="lg"
            variant={isAutoTrading ? "destructive" : "default"}
            onClick={toggleAutoTrading}
          >
            {isAutoTrading ? (
              <>
                <Pause className="w-4 h-4 mr-2" />
                停止交易
              </>
            ) : (
              <>
                <Play className="w-4 h-4 mr-2" />
                启动交易
              </>
            )}
          </Button>
        </div>
      </Card>

      {/* Portfolio Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground mb-1">账户余额</p>
              <p className="text-2xl">${portfolioValue.toFixed(2)}</p>
            </div>
            <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-950 flex items-center justify-center">
              <DollarSign className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground mb-1">当前仓位</p>
              <p className="text-2xl">{currentPosition.toFixed(0)} 股</p>
              <p className="text-xs text-muted-foreground mt-1">
                持仓价值: ${(currentPosition * currentMarketPrice.yesPrice).toFixed(2)}
              </p>
            </div>
            <div className="w-10 h-10 rounded-full bg-purple-100 dark:bg-purple-950 flex items-center justify-center">
              <BarChart3 className="w-5 h-5 text-purple-600 dark:text-purple-400" />
            </div>
          </div>
        </Card>

        <Card className={`p-4 ${
          totalPnL >= 0 
            ? 'bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800' 
            : 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800'
        }`}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground mb-1">总盈亏</p>
              <p className={`text-2xl ${totalPnL >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                {totalPnL >= 0 ? '+' : ''}${totalPnL.toFixed(2)}
              </p>
              <p className={`text-xs ${totalPnL >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                {((totalPnL / 10000) * 100).toFixed(2)}% 回报率
              </p>
            </div>
            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
              totalPnL >= 0 
                ? 'bg-green-500' 
                : 'bg-red-500'
            }`}>
              {totalPnL >= 0 ? (
                <TrendingUp className="w-5 h-5 text-white" />
              ) : (
                <TrendingDown className="w-5 h-5 text-white" />
              )}
            </div>
          </div>
        </Card>
      </div>

      {/* Position Chart */}
      {positions.length > 0 && (
        <Card className="p-6">
          <h3 className="mb-4">我的交易表现</h3>
          <PositionChart positions={positions} />
        </Card>
      )}

      {/* Trade History */}
      {positions.length > 0 && (
        <Card className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <Users className="w-5 h-5 text-purple-600 dark:text-purple-400" />
            <h3>交易记录</h3>
          </div>
          <TradeHistory positions={positions} />
        </Card>
      )}

      {/* Risk Warning */}
      {!isAutoTrading && (
        <Card className="p-4 bg-yellow-50 dark:bg-yellow-950/20 border-yellow-200 dark:border-yellow-800">
          <div className="flex gap-3">
            <AlertCircle className="w-5 h-5 text-yellow-600 dark:text-yellow-400 shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="text-yellow-900 dark:text-yellow-300 mb-1">风险提示</p>
              <p className="text-yellow-700 dark:text-yellow-400 text-xs">
                自动交易存在风险，请确保已充分了解交易策略。建议：1) 设置止损点 2) 不要投入超过承受能力的资金 3) 定期检查交易状态 4) 关注市场价格波动
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* Trading Strategy Info */}
      {isAutoTrading && analysisSteps.length > 0 && (
        <Card className="p-4 bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800">
          <div className="flex gap-3">
            <Brain className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="text-blue-900 dark:text-blue-300 mb-1">AI策略执行中</p>
              <p className="text-blue-700 dark:text-blue-400 text-xs">
                根据{analysisSteps.length}步分析结果，AI正在实时监控市场并执行交易。当市场价格偏离AI预测值超过阈值时，将自动调整仓位。
              </p>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}