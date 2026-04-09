import { useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';

// Note: This component is designed to be fed by parent props

// interface EquityPoint {
//   timestamp: string;
//   total_equity: number;
//   pnl: number;
//   pnl_pct: number;
//   cycle_number: number;
// }

// interface EquityChartProps {
//   traderId?: string;
// }

export function EquityChart({
  traderId,
  language = 'zh',
  history,
  account,
  error,
  initialDisplayMode = 'dollar',
  selectedTimeframe = '24H',
  isPnl = false,
}) {
  const [displayMode, setDisplayMode] = useState(initialDisplayMode === 'percent' ? 'percent' : 'dollar');


  if (error) {
    return (
      <div className="p-6">
        <div className="flex items-center gap-3 p-4 rounded-lg bg-red-500/10 border border-red-500/20">
          <div className="text-2xl">⚠️</div>
          <div>
            <div className="font-semibold text-red-400">{language === 'zh' ? '加载失败' : 'Loading Error'}</div>
            <div className="text-sm text-gray-400">{error.message}</div>
          </div>
        </div>
      </div>
    );
  }

  // 过滤掉无效数据：total_equity为0或小于1的数据点（API失败导致）
  const validHistory = history?.filter(point => point.total_equity > 1) || [];

  if (!validHistory || validHistory.length === 0) {
    return (
      <div className="p-6">
        <h3 className="text-lg font-semibold mb-6 text-white">{language === 'zh' ? '账户权益曲线' : 'Account Equity Curve'}</h3>
        <div className="text-center py-16 text-gray-400">
          <div className="text-6xl mb-4 opacity-50">📊</div>
          <div className="text-lg font-semibold mb-2">{language === 'zh' ? '暂无历史数据' : 'No historical data'}</div>
          <div className="text-sm">{language === 'zh' ? '数据生成后将显示在此处' : 'Data will appear here as it is generated'}</div>
        </div>
      </div>
    );
  }

  // 限制显示最近的数据点（性能优化）
  // 如果数据超过2000个点，只显示最近2000个
  const MAX_DISPLAY_POINTS = 2000;
  const displayHistory = validHistory.length > MAX_DISPLAY_POINTS
    ? validHistory.slice(-MAX_DISPLAY_POINTS)
    : validHistory;

  // 计算初始余额
  // PnL 模式下，初始值为 0（盈亏从0开始）
  // 权益模式下，使用第一个有效数据点或账户余额
  const initialBalance = isPnl ? 0 : (
    validHistory[0]?.total_equity
    ?? account?.total_equity
    ?? 100  // 默认值100，与NoFx保持一致，避免除以0
  );

  // 🔍 调试：打印初始余额
  console.log(`📈 [EquityChart] isPnl: ${isPnl}, initialBalance: ${initialBalance}, 第一个点equity: ${validHistory[0]?.total_equity}`);
  if (validHistory.length > 0) {
    console.log(`📈 [EquityChart] 第一个点完整数据:`, validHistory[0]);
    console.log(`📈 [EquityChart] 最后一个点完整数据:`, validHistory[validHistory.length - 1]);
  }

  // 根据时间范围格式化X轴标签
  const formatTimeLabel = (date) => {
    const d = new Date(date);
    switch (selectedTimeframe) {
      case '24H':
      case '12H':
      case '6H':
        return d.toLocaleTimeString(language === 'zh' ? 'zh-CN' : 'en-US', {
          hour: '2-digit',
          minute: '2-digit',
        });
      case '7D':
      case '1W':
        return d.toLocaleDateString(language === 'zh' ? 'zh-CN' : 'en-US', {
          month: '2-digit',
          day: '2-digit',
        });
      case '30D':
      case '1M':
      case '3M':
        return d.toLocaleDateString(language === 'zh' ? 'zh-CN' : 'en-US', {
          month: '2-digit',
          day: '2-digit',
        });
      case '6M':
      case '1Y':
        return d.toLocaleDateString(language === 'zh' ? 'zh-CN' : 'en-US', {
          year: '2-digit',
          month: '2-digit',
        });
      case 'ALL':
      default:
        return d.toLocaleDateString(language === 'zh' ? 'zh-CN' : 'en-US', {
          year: '2-digit',
          month: '2-digit',
          day: '2-digit',
        });
    }
  };

  // Tooltip内始终显示完整日期时间
  const formatFullDateTime = (date) => {
    const d = new Date(date);
    return d.toLocaleString(language === 'zh' ? 'zh-CN' : 'en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  };

  // 转换数据格式
  const chartData = displayHistory.map((point, index) => {
    // PnL 模式下，直接使用 point.pnl 或 point.total_equity（它们是同一个值）
    // 权益模式下，计算相对于初始余额的 PnL
    const rawPnl = isPnl ? (point.pnl ?? point.total_equity) : (point.total_equity - initialBalance);
    
    // 计算百分比：PnL 模式下需要基于初始权益计算，如果没有则基于绝对值计算
    let pnlPct;
    if (isPnl) {
      // PnL 模式：尝试使用 point.pnl_pct，如果没有则基于第一个非零值计算
      const baseValue = validHistory.find(p => (p.pnl ?? p.total_equity) !== 0);
      const basePnl = baseValue ? Math.abs(baseValue.pnl ?? baseValue.total_equity) : Math.abs(rawPnl);
      pnlPct = basePnl !== 0 ? ((rawPnl / basePnl) * 100).toFixed(2) : '0.00';
    } else {
      // 权益模式：基于初始余额计算百分比
      pnlPct = initialBalance !== 0 ? ((rawPnl / initialBalance) * 100).toFixed(2) : '0.00';
    }
    
    // 图表显示的值
    const chartValue = isPnl
      ? (displayMode === 'dollar' ? rawPnl : parseFloat(pnlPct))
      : (displayMode === 'dollar' ? point.total_equity : parseFloat(pnlPct));
    
      return {
        xLabel: point.timestamp,
        xIndex: index, // 🔧 修复：添加xIndex字段，与XAxis的dataKey匹配
        value: chartValue,
        cycle: point.cycle_number,
        raw_equity: isPnl ? rawPnl : point.total_equity, // PnL 模式下存储 PnL 值
        raw_pnl: rawPnl,
        raw_pnl_pct: parseFloat(pnlPct),
        timestamp: point.timestamp,
        // 使用稳定的索引作为 key，确保 Recharts 能正确识别数据点
        name: `point-${index}`,
      };
    });

  // 🔍 调试：检查是否有重复的xLabel
  const xLabelCounts = {};
  chartData.forEach(d => {
    xLabelCounts[d.xLabel] = (xLabelCounts[d.xLabel] || 0) + 1;
  });
  const duplicateLabels = Object.entries(xLabelCounts).filter(([label, count]) => count > 1);
  if (duplicateLabels.length > 0) {
    console.warn(`⚠️ [EquityChart] 发现重复的X轴标签:`, duplicateLabels.map(([label, count]) => `${label}(${count}个)`).join(', '));
  }

  const currentValue = chartData[chartData.length - 1];
  const isProfit = currentValue.raw_pnl >= 0;
  
  // PnL 模式下的当前值
  const currentDisplayValue = isPnl 
    ? (account?.total_equity ?? currentValue.raw_pnl)
    : (account?.total_equity ?? currentValue.raw_equity);

  // 计算Y轴范围
  const calculateYDomain = () => {
    if (displayMode === 'percent') {
      // 百分比模式：找到最大最小值，留20%余量
      const values = chartData.map(d => d.value);
      const minVal = Math.min(...values);
      const maxVal = Math.max(...values);
      const range = Math.max(Math.abs(maxVal), Math.abs(minVal));
      const padding = Math.max(range * 0.2, 1); // 至少留1%余量
      return [Math.floor(minVal - padding), Math.ceil(maxVal + padding)];
    } else {
      // 美元模式
      if (isPnl) {
        // PnL 模式：以0为中心，上下留15%余量
        const values = chartData.map(d => d.value);
        const minVal = Math.min(...values, 0);
        const maxVal = Math.max(...values, 0);
        const range = Math.max(Math.abs(maxVal), Math.abs(minVal));
        const padding = Math.max(range * 0.15, 10); // 至少留10 USDC余量
        return [
          Math.floor(minVal - padding),
          Math.ceil(maxVal + padding)
        ];
      } else {
        // 权益模式：以初始余额为基准，上下留10%余量
        const values = chartData.map(d => d.value);
        const minVal = Math.min(...values, initialBalance);
        const maxVal = Math.max(...values, initialBalance);
        const range = maxVal - minVal;
        const padding = Math.max(range * 0.15, initialBalance * 0.01); // 至少留1%余量
        return [
          Math.floor(minVal - padding),
          Math.ceil(maxVal + padding)
        ];
      }
    }
  };

  // 自定义Tooltip
  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="rounded-lg p-3 shadow-xl bg-gray-800 border border-gray-700">
          <div className="text-xs mb-1 text-gray-400">{formatFullDateTime(data.timestamp)}</div>
          {isPnl ? (
            // PnL 模式：显示 PnL 值
            <div
              className={`font-bold text-lg ${data.raw_pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}
            >
              {data.raw_pnl >= 0 ? '+' : ''}
              {data.raw_pnl.toFixed(2)} USDC
            </div>
          ) : (
            // 权益模式：显示账户权益和 PnL
            <>
              <div className="font-bold text-white">
                {data.raw_equity.toFixed(2)} USDC
              </div>
              <div
                className={`text-sm font-bold ${data.raw_pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}
              >
                {data.raw_pnl >= 0 ? '+' : ''}
                {data.raw_pnl.toFixed(2)} USDC ({data.raw_pnl_pct >= 0 ? '+' : ''}
                {data.raw_pnl_pct}%)
              </div>
            </>
          )}
        </div>
      );
    }
    return null;
  };

  return (
      <div className="p-3 sm:p-5 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
        <div className="flex-1">
          <div className="flex flex-col sm:flex-row sm:items-baseline gap-2 sm:gap-4">
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className={`text-sm sm:text-lg font-bold px-2 sm:px-3 py-1 rounded ${
                  isProfit ? 'text-green-400 bg-green-500/10 border border-green-500/20' : 'text-red-400 bg-red-500/10 border border-red-500/20'
                }`}
              >
                {isProfit ? '▲' : '▼'} {isProfit ? '+' : ''}
                {currentValue?.raw_pnl_pct ?? 0}%
              </span>
              <span className="text-xs sm:text-sm text-gray-400">
                ({isProfit ? '+' : ''}{(currentValue?.raw_pnl ?? 0).toFixed(2)} USDC)
              </span>
            </div>
          </div>
        </div>

        {/* Display Mode Toggle */}
        <div className="flex gap-1 rounded bg-gray-900 border border-gray-700 p-1 self-start sm:self-auto">
          <button
            onClick={() => setDisplayMode('dollar')}
            className={`px-3 sm:px-4 py-1.5 sm:py-2 rounded text-xs sm:text-sm font-medium transition-all ${
              displayMode === 'dollar'
                ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/50'
                : 'bg-transparent text-gray-400 hover:text-white'
            }`}
          >
            USDC
          </button>
          <button
            onClick={() => setDisplayMode('percent')}
            className={`px-3 sm:px-4 py-1.5 sm:py-2 rounded text-xs sm:text-sm font-medium transition-all ${
              displayMode === 'percent'
                ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/50'
                : 'bg-transparent text-gray-400 hover:text-white'
            }`}
          >
            %
          </button>
        </div>
      </div>

      {/* Chart */}
      <div className="my-2" style={{ borderRadius: '8px', overflow: 'hidden' }}>
        <ResponsiveContainer width="100%" height={280}>
        <LineChart data={chartData} margin={{ top: 10, right: 20, left: 5, bottom: 30 }}>
          <defs>
            <linearGradient id="colorGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.8} />
              <stop offset="95%" stopColor="#8B5CF6" stopOpacity={0.2} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
          {(() => {
            // 根据时间范围控制刻度密度和样式
            const desiredTicksMap = {
              '24H': 8,
              '12H': 8,
              '6H': 8,
              '7D': 7,
              '1W': 7,
              '30D': 10,
              '1M': 10,
              '3M': 8,
              '6M': 8,
              '1Y': 8,
              'ALL': 6,
            };
            const desired = desiredTicksMap[selectedTimeframe] || 8;
            const interval = Math.max(0, Math.floor(chartData.length / desired) - 1);
            const angle = selectedTimeframe === '24H' || selectedTimeframe === '12H' || selectedTimeframe === '6H' ? -15 : 0;
            const anchor = angle === 0 ? 'middle' : 'end';
            const height = angle === 0 ? 40 : 60;
            return (
              <XAxis
                dataKey="xIndex"
                stroke="#6B7280"
                tick={{ fill: '#9CA3AF', fontSize: 11 }}
                tickLine={{ stroke: '#374151' }}
                interval={interval}
                angle={angle}
                textAnchor={anchor}
                height={height}
                minTickGap={12}
                tickFormatter={(value) => {
                  // 🔧 修复：value现在是xIndex（索引），需要通过索引查找对应的timestamp
                  const dataPoint = chartData[value];
                  if (!dataPoint) return '';
                  try {
                    return formatTimeLabel(dataPoint.timestamp);
                  } catch {
                    return '';
                  }
                }}
              />
            );
          })()}
          <YAxis
            stroke="#6B7280"
            tick={{ fill: '#9CA3AF', fontSize: 12 }}
            tickLine={{ stroke: '#374151' }}
            domain={calculateYDomain()}
            tickFormatter={(value) =>
              displayMode === 'dollar' ? `$${value.toFixed(0)}` : `${value}%`
            }
          />
          <Tooltip content={<CustomTooltip />} />
          <ReferenceLine
            y={displayMode === 'dollar' ? (isPnl ? 0 : initialBalance) : 0}
            stroke="#6B7280"
            strokeDasharray="3 3"
            label={{
              value: displayMode === 'dollar'
                ? (isPnl ? '0' : (language === 'zh' ? '初始资金' : 'Initial'))
                : '0%',
              fill: '#9CA3AF',
              fontSize: 12,
            }}
          />
          <Line
            type="natural"
            dataKey="value"
            stroke="url(#colorGradient)"
            strokeWidth={3}
            dot={chartData.length > 50 ? false : { fill: '#3B82F6', r: 3 }}
            activeDot={{ r: 6, fill: '#8B5CF6', stroke: '#3B82F6', strokeWidth: 2 }}
            connectNulls={true}
            animationDuration={100}
          />
        </LineChart>
      </ResponsiveContainer>
      </div>

      {/* Footer Stats */}
      <div className="mt-3 grid grid-cols-2 gap-2 sm:gap-3 pt-3 border-t border-gray-700">
        {!isPnl && (
          <div className="p-2 rounded bg-blue-500/5 hover:bg-blue-500/10 transition-all">
            <div className="text-xs mb-1 uppercase tracking-wider text-gray-400">{language === 'zh' ? '初始资金' : 'Initial Balance'}</div>
            <div className="text-xs sm:text-sm font-bold text-white">
              {initialBalance.toFixed(2)} USDC
            </div>
          </div>
        )}
        {isPnl && (
          <div className="p-2 rounded bg-blue-500/5 hover:bg-blue-500/10 transition-all">
            <div className="text-xs mb-1 uppercase tracking-wider text-gray-400">{language === 'zh' ? '当前盈亏' : 'Current PnL'}</div>
            <div
              className={`text-xs sm:text-sm font-bold ${(currentValue?.raw_pnl ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}
            >
              {(currentValue?.raw_pnl ?? 0) >= 0 ? '+' : ''}{(currentValue?.raw_pnl ?? 0).toFixed(2)} USDC
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
