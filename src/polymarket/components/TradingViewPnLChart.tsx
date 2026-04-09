import { useEffect, useRef, useState, useMemo } from 'react';
import { createChart, ColorType, IChartApi, ISeriesApi, UTCTimestamp, AreaSeries } from 'lightweight-charts';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { TrendingUp, TrendingDown, ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';
import { translations } from '../../constants/translations';

export interface PnLDataPoint {
  timestamp: number;
  value: number;
  action?: 'buy_yes' | 'buy_no' | 'hold';
  eventTitle?: string;
}

interface TradingViewPnLChartProps {
  data: PnLDataPoint[];
  initialValue: number;
  currentValue: number;
  className?: string;
  height?: number;
  showHeader?: boolean;
  language?: 'zh' | 'en';
}

// 时间范围选项
type TimeRange = '1H' | '4H' | '1D' | '1W' | '1M' | '3M' | 'ALL';

export function TradingViewPnLChart({ 
  data, 
  initialValue, 
  currentValue, 
  className = '',
  height = 300,
  showHeader = true,
  language = 'zh'
}: TradingViewPnLChartProps) {
  const t = translations[language]?.polymarketPage?.traderDetail || translations.en.polymarketPage.traderDetail;
  
  const TIME_RANGES: { key: TimeRange; label: string; ms: number }[] = [
    { key: '1H', label: language === 'zh' ? '1小时' : '1H', ms: 60 * 60 * 1000 },
    { key: '4H', label: language === 'zh' ? '4小时' : '4H', ms: 4 * 60 * 60 * 1000 },
    { key: '1D', label: language === 'zh' ? '1天' : '1D', ms: 24 * 60 * 60 * 1000 },
    { key: '1W', label: language === 'zh' ? '1周' : '1W', ms: 7 * 24 * 60 * 60 * 1000 },
    { key: '1M', label: language === 'zh' ? '1月' : '1M', ms: 30 * 24 * 60 * 60 * 1000 },
    { key: '3M', label: language === 'zh' ? '3月' : '3M', ms: 90 * 24 * 60 * 60 * 1000 },
    { key: 'ALL', label: language === 'zh' ? '全部' : 'ALL', ms: 0 },
  ];
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const areaSeriesRef = useRef<ISeriesApi<'Area'> | null>(null);
  const [selectedRange, setSelectedRange] = useState<TimeRange>('ALL');

  const pnl = currentValue - initialValue;
  const pnlPercentage = initialValue > 0 ? ((pnl / initialValue) * 100).toFixed(2) : '0.00';
  const isProfit = pnl >= 0;

  // 根据时间范围过滤数据
  const filteredData = useMemo(() => {
    if (selectedRange === 'ALL' || data.length === 0) {
      return data;
    }
    
    const range = TIME_RANGES.find(r => r.key === selectedRange);
    if (!range) return data;
    
    const now = Date.now();
    const cutoff = now - range.ms;
    
    return data.filter(d => d.timestamp >= cutoff);
  }, [data, selectedRange]);

  // 计算选定时间范围内的 PnL
  const rangePnL = useMemo(() => {
    if (filteredData.length === 0) return { value: 0, percentage: '0.00' };
    
    const startValue = filteredData[0]?.value || initialValue;
    const endValue = filteredData[filteredData.length - 1]?.value || currentValue;
    const diff = endValue - startValue;
    const pct = startValue > 0 ? ((diff / startValue) * 100).toFixed(2) : '0.00';
    
    return { value: diff, percentage: pct };
  }, [filteredData, initialValue, currentValue]);

  // 颜色配置
  const colors = {
    profit: {
      line: '#22c55e',
      top: 'rgba(34, 197, 94, 0.4)',
      bottom: 'rgba(34, 197, 94, 0.0)',
    },
    loss: {
      line: '#ef4444',
      top: 'rgba(239, 68, 68, 0.4)',
      bottom: 'rgba(239, 68, 68, 0.0)',
    },
  };

  const currentColors = isProfit ? colors.profit : colors.loss;

  // 初始化图表
  useEffect(() => {
    if (!chartContainerRef.current) return;

    // 清除旧图表
    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
    }

    const isDarkMode = document.documentElement.classList.contains('dark');

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: isDarkMode ? '#9ca3af' : '#6b7280',
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      },
      grid: {
        vertLines: { color: isDarkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' },
        horzLines: { color: isDarkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' },
      },
      width: chartContainerRef.current.clientWidth,
      height: height,
      rightPriceScale: {
        borderVisible: false,
        scaleMargins: { top: 0.1, bottom: 0.1 },
      },
      timeScale: {
        borderVisible: false,
        timeVisible: true,
        secondsVisible: false,
      },
      crosshair: {
        vertLine: {
          width: 1,
          color: isDarkMode ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)',
          style: 3,
          labelBackgroundColor: isDarkMode ? '#374151' : '#f3f4f6',
        },
        horzLine: {
          width: 1,
          color: isDarkMode ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)',
          style: 3,
          labelBackgroundColor: isDarkMode ? '#374151' : '#f3f4f6',
        },
      },
      handleScroll: { vertTouchDrag: false },
    });

    chartRef.current = chart;

    // 添加面积图系列 (v5.x API)
    const areaSeries = chart.addSeries(AreaSeries, {
      lineColor: currentColors.line,
      topColor: currentColors.top,
      bottomColor: currentColors.bottom,
      lineWidth: 2,
      priceFormat: {
        type: 'custom',
        formatter: (price: number) => `$${price.toFixed(2)}`,
      },
      crosshairMarkerVisible: true,
      crosshairMarkerRadius: 6,
      crosshairMarkerBorderColor: '#ffffff',
      crosshairMarkerBackgroundColor: currentColors.line,
    });

    areaSeriesRef.current = areaSeries;

    // 转换并设置数据
    if (filteredData.length > 0) {
      // Filter out invalid data points and sort by timestamp
      const chartData = filteredData
        .filter(d => d.timestamp && !isNaN(d.timestamp) && d.value !== undefined && !isNaN(d.value))
        .map(d => ({
          time: Math.floor(d.timestamp / 1000) as UTCTimestamp,
          value: d.value,
        }))
        .sort((a, b) => a.time - b.time);

      if (chartData.length > 0) {
        areaSeries.setData(chartData);
      }

      // 添加交易标记
      const markers = filteredData
        .filter(d => d.action && d.action !== 'hold' && d.timestamp && !isNaN(d.timestamp))
        .map(d => ({
          time: Math.floor(d.timestamp / 1000) as UTCTimestamp,
          position: d.action === 'buy_yes' ? 'belowBar' as const : 'aboveBar' as const,
          color: d.action === 'buy_yes' ? '#22c55e' : '#ef4444',
          shape: d.action === 'buy_yes' ? 'arrowUp' as const : 'arrowDown' as const,
          text: d.action === 'buy_yes' ? 'YES' : 'NO',
        }))
        .sort((a, b) => a.time - b.time);

      if (markers.length > 0) {
        areaSeries.setMarkers(markers);
      }
    }

    // 添加初始值参考线
    areaSeries.createPriceLine({
      price: initialValue,
      color: isDarkMode ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)',
      lineWidth: 1,
      lineStyle: 2, // Dashed
      axisLabelVisible: true,
      title: language === 'zh' ? '初始' : 'Initial',
    });

    // 自适应显示
    chart.timeScale().fitContent();

    // 响应式处理
    const handleResize = () => {
      if (chartContainerRef.current && chartRef.current) {
        chartRef.current.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    };

    window.addEventListener('resize', handleResize);

    // 监听暗黑模式变化
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.attributeName === 'class') {
          const isDark = document.documentElement.classList.contains('dark');
          chart.applyOptions({
            layout: {
              textColor: isDark ? '#9ca3af' : '#6b7280',
            },
            grid: {
              vertLines: { color: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' },
              horzLines: { color: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' },
            },
          });
        }
      });
    });

    observer.observe(document.documentElement, { attributes: true });

    return () => {
      window.removeEventListener('resize', handleResize);
      observer.disconnect();
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }
    };
  }, [filteredData, initialValue, height, isProfit, currentColors]);

  // 图表控制函数
  const handleZoomIn = () => {
    if (chartRef.current) {
      const timeScale = chartRef.current.timeScale();
      const currentRange = timeScale.getVisibleLogicalRange();
      if (currentRange) {
        const newRange = {
          from: currentRange.from + (currentRange.to - currentRange.from) * 0.2,
          to: currentRange.to - (currentRange.to - currentRange.from) * 0.2,
        };
        timeScale.setVisibleLogicalRange(newRange);
      }
    }
  };

  const handleZoomOut = () => {
    if (chartRef.current) {
      const timeScale = chartRef.current.timeScale();
      const currentRange = timeScale.getVisibleLogicalRange();
      if (currentRange) {
        const newRange = {
          from: currentRange.from - (currentRange.to - currentRange.from) * 0.2,
          to: currentRange.to + (currentRange.to - currentRange.from) * 0.2,
        };
        timeScale.setVisibleLogicalRange(newRange);
      }
    }
  };

  const handleFitContent = () => {
    if (chartRef.current) {
      chartRef.current.timeScale().fitContent();
    }
  };

  return (
    <Card className={`overflow-hidden ${className}`}>
      {/* Header */}
      {showHeader && (
        <div className="p-4 border-b">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground mb-1">投资组合价值</p>
              <p className="text-2xl font-semibold">${currentValue.toFixed(2)}</p>
            </div>
            <div className={`flex items-center gap-2 px-3 py-2 rounded-lg ${
              isProfit 
                ? 'bg-green-50 dark:bg-green-950/30' 
                : 'bg-red-50 dark:bg-red-950/30'
            }`}>
              {isProfit ? (
                <TrendingUp className="w-5 h-5 text-green-600" />
              ) : (
                <TrendingDown className="w-5 h-5 text-red-600" />
              )}
              <div>
                <p className={`font-semibold ${isProfit ? 'text-green-600' : 'text-red-600'}`}>
                  {isProfit ? '+' : ''}${pnl.toFixed(2)}
                </p>
                <p className={`text-xs ${isProfit ? 'text-green-600' : 'text-red-600'}`}>
                  {isProfit ? '+' : ''}{pnlPercentage}%
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Chart Area */}
      <div className="relative">
        {/* 时间范围选择器 */}
        <div className="absolute top-2 left-2 z-10 flex items-center gap-1 bg-background/80 backdrop-blur-sm rounded-lg p-1">
          {TIME_RANGES.map(range => (
            <Button
              key={range.key}
              variant={selectedRange === range.key ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setSelectedRange(range.key)}
              className={`h-6 px-2 text-xs ${
                selectedRange === range.key 
                  ? 'bg-primary text-primary-foreground' 
                  : 'hover:bg-muted'
              }`}
            >
              {range.key}
            </Button>
          ))}
        </div>

        {/* 工具栏 */}
        <div className="absolute top-2 right-2 z-10 flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleZoomIn}
            className="h-7 w-7 p-0 bg-background/80 backdrop-blur-sm hover:bg-background"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleZoomOut}
            className="h-7 w-7 p-0 bg-background/80 backdrop-blur-sm hover:bg-background"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleFitContent}
            className="h-7 w-7 p-0 bg-background/80 backdrop-blur-sm hover:bg-background"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </Button>
        </div>

        {/* 时间范围内的 PnL 显示 */}
        {selectedRange !== 'ALL' && filteredData.length > 0 && (
          <div className="absolute top-10 left-2 z-10 text-xs bg-background/80 backdrop-blur-sm rounded px-2 py-1">
            <span className="text-muted-foreground">区间:</span>
            <span className={`ml-1 font-medium ${rangePnL.value >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {rangePnL.value >= 0 ? '+' : ''}${rangePnL.value.toFixed(2)} ({rangePnL.value >= 0 ? '+' : ''}{rangePnL.percentage}%)
            </span>
          </div>
        )}

        {/* Chart */}
        <div ref={chartContainerRef} className="w-full" style={{ height: `${height}px` }} />
      </div>

      {/* Legend */}
      <div className="px-4 py-3 border-t">
        <div className="flex items-center justify-center gap-6 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1">
              <div className="w-0 h-0 border-l-[5px] border-l-transparent border-r-[5px] border-r-transparent border-b-[8px] border-b-green-500" />
              <span>{language === 'zh' ? '买入 YES' : 'Buy YES'}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1">
              <div className="w-0 h-0 border-l-[5px] border-l-transparent border-r-[5px] border-r-transparent border-t-[8px] border-t-red-500" />
              <span>{language === 'zh' ? '买入 NO' : 'Buy NO'}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-6 h-0.5 border-t-2 border-dashed opacity-40" />
            <span>{language === 'zh' ? '初始投资' : 'Initial Investment'} ${initialValue.toFixed(0)}</span>
          </div>
        </div>
      </div>
    </Card>
  );
}

export default TradingViewPnLChart;
