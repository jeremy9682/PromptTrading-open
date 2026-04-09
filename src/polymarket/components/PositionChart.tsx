import { LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { TradePosition } from '../types';

interface PositionChartProps {
  positions: TradePosition[];
}

export function PositionChart({ positions }: PositionChartProps) {
  const chartData = positions.map((pos) => ({
    time: new Date(pos.timestamp).toLocaleTimeString('zh-CN', { 
      hour: '2-digit', 
      minute: '2-digit',
      second: '2-digit'
    }),
    仓位: pos.position,
    账户价值: pos.value,
    action: pos.action
  }));

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-white dark:bg-slate-900 p-3 rounded-lg border shadow-lg">
          <p className="text-sm mb-1">{data.time}</p>
          <p className="text-sm text-blue-600 dark:text-blue-400">
            仓位: {data.仓位.toFixed(0)} 股
          </p>
          <p className="text-sm text-green-600 dark:text-green-400">
            价值: ${data.账户价值.toFixed(2)}
          </p>
          {data.action !== 'hold' && (
            <p className="text-xs mt-1 text-muted-foreground">
              操作: {data.action === 'buy' ? '买入 📈' : '卖出 📉'}
            </p>
          )}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-6">
      {/* Position Line Chart */}
      <div>
        <h4 className="text-sm text-muted-foreground mb-3">仓位持有量</h4>
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id="colorPosition" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
            <XAxis 
              dataKey="time" 
              tick={{ fontSize: 11 }}
              tickFormatter={(value) => value.split(':').slice(0, 2).join(':')}
            />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip content={<CustomTooltip />} />
            <Area 
              type="monotone" 
              dataKey="仓位" 
              stroke="#3b82f6" 
              strokeWidth={2}
              fill="url(#colorPosition)" 
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Portfolio Value Chart */}
      <div>
        <h4 className="text-sm text-muted-foreground mb-3">账户价值变化</h4>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={chartData}>
            <defs>
              <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
            <XAxis 
              dataKey="time" 
              tick={{ fontSize: 11 }}
              tickFormatter={(value) => value.split(':').slice(0, 2).join(':')}
            />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip content={<CustomTooltip />} />
            <Line 
              type="monotone" 
              dataKey="账户价值" 
              stroke="#10b981" 
              strokeWidth={2}
              dot={(props: any) => {
                const { cx, cy, payload } = props;
                if (payload.action === 'buy') {
                  return <circle cx={cx} cy={cy} r={4} fill="#10b981" />;
                } else if (payload.action === 'sell') {
                  return <circle cx={cx} cy={cy} r={4} fill="#ef4444" />;
                }
                return null;
              }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
