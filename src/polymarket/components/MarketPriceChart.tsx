import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { MarketPrice } from './TradingDashboard';

interface MarketPriceChartProps {
  prices: MarketPrice[];
}

export function MarketPriceChart({ prices }: MarketPriceChartProps) {
  const chartData = prices.map((price) => ({
    time: new Date(price.timestamp).toLocaleTimeString('zh-CN', { 
      hour: '2-digit', 
      minute: '2-digit',
      second: '2-digit'
    }),
    YES: (price.yesPrice * 100).toFixed(2),
    NO: (price.noPrice * 100).toFixed(2),
    yesRaw: price.yesPrice,
    noRaw: price.noPrice
  }));

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-white dark:bg-slate-900 p-3 rounded-lg border shadow-lg">
          <p className="text-sm mb-2">{data.time}</p>
          <div className="space-y-1">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-green-500" />
                <span className="text-xs text-muted-foreground">YES</span>
              </div>
              <span className="text-sm text-green-600 dark:text-green-400">{data.YES}¢</span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-red-500" />
                <span className="text-xs text-muted-foreground">NO</span>
              </div>
              <span className="text-sm text-red-600 dark:text-red-400">{data.NO}¢</span>
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
        <XAxis 
          dataKey="time" 
          tick={{ fontSize: 11 }}
          tickFormatter={(value) => value.split(':').slice(0, 2).join(':')}
        />
        <YAxis 
          tick={{ fontSize: 11 }}
          domain={[0, 100]}
          label={{ value: '价格 (¢)', angle: -90, position: 'insideLeft', style: { fontSize: 11 } }}
        />
        <Tooltip content={<CustomTooltip />} />
        <ReferenceLine y={50} stroke="#94a3b8" strokeDasharray="3 3" opacity={0.5} />
        <Line 
          type="monotone" 
          dataKey="YES" 
          stroke="#10b981" 
          strokeWidth={2.5}
          dot={false}
          activeDot={{ r: 5 }}
        />
        <Line 
          type="monotone" 
          dataKey="NO" 
          stroke="#ef4444" 
          strokeWidth={2.5}
          dot={false}
          activeDot={{ r: 5 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
