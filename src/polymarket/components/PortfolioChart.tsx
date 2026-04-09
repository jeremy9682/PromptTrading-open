import { Card } from './ui/card';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Area, AreaChart, Dot } from 'recharts';
import { TrendingUp, TrendingDown, Circle } from 'lucide-react';

export interface ChartDataPoint {
  timestamp: number;
  value: number;
  action?: 'buy_yes' | 'buy_no' | 'hold';
  eventTitle?: string;
}

interface PortfolioChartProps {
  data: ChartDataPoint[];
  initialValue: number;
  currentValue: number;
  className?: string;
  language?: 'zh' | 'en';
}

export function PortfolioChart({ data, initialValue, currentValue, className, language = 'zh' }: PortfolioChartProps) {
  const pnl = currentValue - initialValue;
  const pnlPercentage = ((pnl / initialValue) * 100).toFixed(2);
  const isProfit = pnl >= 0;

  // Custom dot for trade markers
  const CustomDot = (props: any) => {
    const { cx, cy, payload } = props;
    if (!payload.action || payload.action === 'hold') return null;

    const isBuyYes = payload.action === 'buy_yes';
    const color = isBuyYes ? '#10b981' : '#ef4444';

    return (
      <g>
        <circle cx={cx} cy={cy} r={6} fill={color} stroke="#fff" strokeWidth={2} />
        <circle cx={cx} cy={cy} r={3} fill="#fff" />
      </g>
    );
  };

  // Custom tooltip
  const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload || !payload.length) return null;

    const data = payload[0].payload;
    const time = new Date(data.timestamp).toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });

    return (
      <div className="bg-background border rounded-lg shadow-lg p-3">
        <p className="text-xs text-muted-foreground mb-1">{time}</p>
        <p className="font-medium">${data.value.toFixed(2)}</p>
        {data.action && data.action !== 'hold' && (
          <>
            <div className="mt-2 pt-2 border-t">
              <div className="flex items-center gap-2 text-xs">
                <Circle className={`w-2 h-2 fill-current ${
                  data.action === 'buy_yes' ? 'text-green-500' : 'text-red-500'
                }`} />
                <span className={data.action === 'buy_yes' ? 'text-green-600' : 'text-red-600'}>
                  {data.action === 'buy_yes' ? (language === 'zh' ? '买入 YES' : 'Buy YES') : (language === 'zh' ? '买入 NO' : 'Buy NO')}
                </span>
              </div>
              {data.eventTitle && (
                <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
                  {data.eventTitle}
                </p>
              )}
            </div>
          </>
        )}
      </div>
    );
  };

  // Format Y-axis
  const formatYAxis = (value: number) => {
    return `$${(value / 1000).toFixed(1)}k`;
  };

  // Format X-axis
  const formatXAxis = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Add area chart data with initial value reference
  const chartData = data.map(d => ({
    ...d,
    baseline: initialValue
  }));

  return (
    <Card className={className}>
      <div className="p-4 border-b">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground mb-1">{language === 'zh' ? '投资组合价值' : 'Portfolio Value'}</p>
            <p className="text-2xl">${currentValue.toFixed(2)}</p>
          </div>
          <div className={`flex items-center gap-2 px-3 py-2 rounded-lg ${
            isProfit 
              ? 'bg-green-50 dark:bg-green-950/20' 
              : 'bg-red-50 dark:bg-red-950/20'
          }`}>
            {isProfit ? (
              <TrendingUp className="w-5 h-5 text-green-600" />
            ) : (
              <TrendingDown className="w-5 h-5 text-red-600" />
            )}
            <div>
              <p className={`font-medium ${isProfit ? 'text-green-600' : 'text-red-600'}`}>
                {isProfit ? '+' : ''}${pnl.toFixed(2)}
              </p>
              <p className={`text-xs ${isProfit ? 'text-green-600' : 'text-red-600'}`}>
                {isProfit ? '+' : ''}{pnlPercentage}%
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="p-4">
        {data.length < 2 ? (
          <div className="h-[280px] flex items-center justify-center text-sm text-muted-foreground">
            {language === 'zh' ? '等待数据收集中...' : 'Collecting data...'}
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="colorProfit" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="colorLoss" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis 
                dataKey="timestamp" 
                tickFormatter={formatXAxis}
                className="text-xs"
                stroke="currentColor"
                opacity={0.5}
              />
              <YAxis 
                tickFormatter={formatYAxis}
                className="text-xs"
                stroke="currentColor"
                opacity={0.5}
                domain={['dataMin - 100', 'dataMax + 100']}
              />
              <Tooltip content={<CustomTooltip />} />
              
              {/* Baseline reference */}
              <ReferenceLine 
                y={initialValue} 
                stroke="currentColor" 
                strokeDasharray="3 3" 
                opacity={0.3}
                label={{ 
                  value: language === 'zh' ? '初始' : 'Initial', 
                  position: 'right',
                  className: 'text-xs fill-muted-foreground'
                }} 
              />

              {/* Area fill based on profit/loss */}
              <Area
                type="monotone"
                dataKey="value"
                stroke="none"
                fill={isProfit ? "url(#colorProfit)" : "url(#colorLoss)"}
                fillOpacity={1}
              />

              {/* Main line */}
              <Line
                type="monotone"
                dataKey="value"
                stroke={isProfit ? "#10b981" : "#ef4444"}
                strokeWidth={2}
                dot={<CustomDot />}
                activeDot={{ r: 6 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}

        {/* Legend */}
        <div className="flex items-center justify-center gap-6 mt-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1">
              <Circle className="w-3 h-3 fill-green-500 text-green-500" />
              <span>{language === 'zh' ? '买入 YES' : 'Buy YES'}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1">
              <Circle className="w-3 h-3 fill-red-500 text-red-500" />
              <span>{language === 'zh' ? '买入 NO' : 'Buy NO'}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-0.5 border-t-2 border-dashed opacity-30" />
            <span>{language === 'zh' ? '初始投资' : 'Initial Investment'}</span>
          </div>
        </div>
      </div>
    </Card>
  );
}