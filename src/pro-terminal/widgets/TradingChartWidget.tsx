import React, { useRef, useState, useEffect, useCallback } from 'react';
import { IDockviewPanelProps } from 'dockview';
import { TrendingUp, TrendingDown, Loader2, RefreshCw, Settings } from 'lucide-react';
import { createChart, IChartApi, ISeriesApi, LineData, AreaData, ColorType } from 'lightweight-charts';
import { useProTerminal } from '../context/ProTerminalContext';

interface TradingChartWidgetProps extends IDockviewPanelProps {
  params?: {
    market?: string;
    symbol?: string;
  };
}

interface CandlestickData {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

const TIMEFRAMES = [
  { label: '1H', value: '1h', fidelity: 60 },
  { label: '4H', value: '4h', fidelity: 240 },
  { label: '1D', value: '1d', fidelity: 1440 },
  { label: '1W', value: '1w', fidelity: 10080 },
  { label: 'ALL', value: 'all', fidelity: 10080 },
];

export const TradingChartWidget: React.FC<TradingChartWidgetProps> = ({ params }) => {
  const { selectedEvent } = useProTerminal();
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Area'> | null>(null);

  const [timeframe, setTimeframe] = useState('1d');
  const [isLoading, setIsLoading] = useState(false);
  const [chartData, setChartData] = useState<AreaData[]>([]);
  const [priceInfo, setPriceInfo] = useState<{
    current: number;
    change: number;
    changePercent: number;
    high: number;
    low: number;
  } | null>(null);

  // Fetch candlestick data from API
  const fetchCandlestickData = useCallback(async () => {
    if (!selectedEvent?.conditionId) return;

    setIsLoading(true);
    try {
      const tf = TIMEFRAMES.find(t => t.value === timeframe);
      const fidelity = tf?.fidelity || 1440;

      // Get YES token ID from first outcome
      const tokenId = selectedEvent.outcomes?.[0]?.tokenId;
      if (!tokenId) {
        console.log('No token ID available for chart');
        return;
      }

      const response = await fetch(
        `https://clob.polymarket.com/prices-history?market=${tokenId}&interval=all&fidelity=${fidelity}`
      );

      if (!response.ok) throw new Error('Failed to fetch price history');

      const data = await response.json();

      if (data?.history && Array.isArray(data.history)) {
        // Convert to lightweight-charts format
        const formattedData: AreaData[] = data.history.map((item: { t: number; p: number }) => ({
          time: item.t as any, // Unix timestamp in seconds
          value: item.p * 100, // Convert to cents
        }));

        // Sort by time
        formattedData.sort((a, b) => (a.time as number) - (b.time as number));

        setChartData(formattedData);

        // Calculate price info
        if (formattedData.length > 0) {
          const first = formattedData[0].value;
          const last = formattedData[formattedData.length - 1].value;
          const change = last - first;
          const changePercent = first > 0 ? (change / first) * 100 : 0;
          const high = Math.max(...formattedData.map(d => d.value));
          const low = Math.min(...formattedData.map(d => d.value));

          setPriceInfo({
            current: last,
            change,
            changePercent,
            high,
            low,
          });
        }
      }
    } catch (error) {
      console.error('Error fetching candlestick data:', error);
    } finally {
      setIsLoading(false);
    }
  }, [selectedEvent?.conditionId, selectedEvent?.outcomes, timeframe]);

  // Initialize chart
  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#9ca3af',
      },
      grid: {
        vertLines: { color: 'rgba(55, 65, 81, 0.3)' },
        horzLines: { color: 'rgba(55, 65, 81, 0.3)' },
      },
      crosshair: {
        mode: 1, // Normal
        vertLine: { color: '#6b7280', width: 1, style: 2 },
        horzLine: { color: '#6b7280', width: 1, style: 2 },
      },
      rightPriceScale: {
        borderColor: 'rgba(55, 65, 81, 0.5)',
        scaleMargins: { top: 0.1, bottom: 0.1 },
      },
      timeScale: {
        borderColor: 'rgba(55, 65, 81, 0.5)',
        timeVisible: true,
        secondsVisible: false,
      },
      handleScroll: { vertTouchDrag: false },
    });

    const areaSeries = chart.addAreaSeries({
      lineColor: '#22c55e',
      topColor: 'rgba(34, 197, 94, 0.4)',
      bottomColor: 'rgba(34, 197, 94, 0.0)',
      lineWidth: 2,
      priceFormat: {
        type: 'custom',
        formatter: (price: number) => `${price.toFixed(1)}¢`,
      },
    });

    chartRef.current = chart;
    seriesRef.current = areaSeries;

    // Handle resize
    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({
          width: chartContainerRef.current.clientWidth,
          height: chartContainerRef.current.clientHeight,
        });
      }
    };

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(chartContainerRef.current);

    return () => {
      resizeObserver.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, []);

  // Update chart data
  useEffect(() => {
    if (seriesRef.current && chartData.length > 0) {
      // Update colors based on price direction
      const isPositive = priceInfo && priceInfo.change >= 0;
      seriesRef.current.applyOptions({
        lineColor: isPositive ? '#22c55e' : '#ef4444',
        topColor: isPositive ? 'rgba(34, 197, 94, 0.4)' : 'rgba(239, 68, 68, 0.4)',
        bottomColor: isPositive ? 'rgba(34, 197, 94, 0.0)' : 'rgba(239, 68, 68, 0.0)',
      });
      seriesRef.current.setData(chartData);
      chartRef.current?.timeScale().fitContent();
    }
  }, [chartData, priceInfo]);

  // Fetch data when event or timeframe changes
  useEffect(() => {
    fetchCandlestickData();
  }, [fetchCandlestickData]);

  // Format volume
  const formatVolume = (vol: number) => {
    if (vol >= 1000000) return `$${(vol / 1000000).toFixed(1)}M`;
    if (vol >= 1000) return `$${(vol / 1000).toFixed(1)}K`;
    return `$${vol.toFixed(0)}`;
  };

  if (!selectedEvent) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-900 text-gray-500">
        <div className="text-center">
          <p className="text-sm">No market selected</p>
          <p className="text-xs mt-1">Select a market from the list</p>
        </div>
      </div>
    );
  }

  const yesPrice = selectedEvent.yesPrice ?? 0.5;

  return (
    <div className="h-full flex flex-col bg-gray-900 text-white">
      {/* Chart Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-800">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          {/* Event info */}
          <div className="flex items-center gap-2 min-w-0">
            {selectedEvent.imageUrl && (
              <img
                src={selectedEvent.imageUrl}
                alt=""
                className="w-6 h-6 rounded object-cover flex-shrink-0"
                onError={(e) => { e.currentTarget.style.display = 'none'; }}
              />
            )}
            <span className="text-sm font-medium truncate max-w-[200px]" title={selectedEvent.title}>
              {selectedEvent.title}
            </span>
          </div>

          {/* Price info */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="text-xl font-mono font-bold">
              {priceInfo ? `${priceInfo.current.toFixed(1)}¢` : `${(yesPrice * 100).toFixed(0)}¢`}
            </span>
            {priceInfo && (
              <div className={`flex items-center text-sm ${priceInfo.change >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {priceInfo.change >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                <span className="ml-1 font-medium">
                  {priceInfo.change >= 0 ? '+' : ''}{priceInfo.changePercent.toFixed(1)}%
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-2">
          {/* Timeframe selector */}
          <div className="flex items-center gap-0.5 bg-gray-800 rounded p-0.5">
            {TIMEFRAMES.map((tf) => (
              <button
                key={tf.value}
                onClick={() => setTimeframe(tf.value)}
                className={`px-2 py-1 text-xs rounded transition-colors ${
                  timeframe === tf.value
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                {tf.label}
              </button>
            ))}
          </div>

          {/* Refresh button */}
          <button
            onClick={fetchCandlestickData}
            disabled={isLoading}
            className="p-1.5 hover:bg-gray-800 rounded transition-colors disabled:opacity-50"
          >
            <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Chart Area */}
      <div className="flex-1 relative">
        {isLoading && chartData.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-900/80 z-10">
            <Loader2 size={24} className="animate-spin text-blue-500" />
          </div>
        )}
        <div ref={chartContainerRef} className="w-full h-full" />
      </div>

      {/* Chart Footer */}
      <div className="flex items-center justify-between px-3 py-2 border-t border-gray-800 text-xs text-gray-500">
        <div className="flex items-center gap-4">
          {priceInfo && (
            <>
              <span>H: <span className="text-white">{priceInfo.high.toFixed(1)}¢</span></span>
              <span>L: <span className="text-white">{priceInfo.low.toFixed(1)}¢</span></span>
            </>
          )}
          <span>Vol: <span className="text-white">{formatVolume(selectedEvent.volume)}</span></span>
          {selectedEvent.liquidity && (
            <span>Liq: <span className="text-white">{formatVolume(selectedEvent.liquidity)}</span></span>
          )}
        </div>
        <div className="flex items-center gap-2 text-gray-500">
          <span>End: {new Date(selectedEvent.endDate).toLocaleDateString()}</span>
        </div>
      </div>
    </div>
  );
};

export default TradingChartWidget;
