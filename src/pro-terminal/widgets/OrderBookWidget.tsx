import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { IDockviewPanelProps } from 'dockview';
import { RefreshCw, Loader2 } from 'lucide-react';
import { useProTerminal } from '../context/ProTerminalContext';

interface OrderBookWidgetProps extends IDockviewPanelProps {
  params?: {
    exchange?: 'polymarket' | 'kalshi';
  };
}

interface OrderBookLevel {
  price: number;
  size: number;
}

interface OrderBookData {
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  spread: number;
  midPrice: number;
}

export const OrderBookWidget: React.FC<OrderBookWidgetProps> = ({ params }) => {
  const { selectedEvent } = useProTerminal();
  const [selectedExchange, setSelectedExchange] = useState<'polymarket' | 'kalshi'>(
    params?.exchange || 'polymarket'
  );
  const [selectedOutcomeIndex, setSelectedOutcomeIndex] = useState(0);
  const [orderBook, setOrderBook] = useState<OrderBookData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  // Fetch order book from Polymarket CLOB API
  const fetchOrderBook = useCallback(async () => {
    if (!selectedEvent?.outcomes?.[selectedOutcomeIndex]?.tokenId) return;

    const tokenId = selectedEvent.outcomes[selectedOutcomeIndex].tokenId;
    setIsLoading(true);

    try {
      const response = await fetch(
        `https://clob.polymarket.com/book?token_id=${tokenId}`
      );

      if (!response.ok) throw new Error('Failed to fetch order book');

      const data = await response.json();

      // Parse order book data
      const bids: OrderBookLevel[] = (data.bids || [])
        .map((bid: { price: string; size: string }) => ({
          price: parseFloat(bid.price),
          size: parseFloat(bid.size),
        }))
        .sort((a: OrderBookLevel, b: OrderBookLevel) => b.price - a.price)
        .slice(0, 10);

      const asks: OrderBookLevel[] = (data.asks || [])
        .map((ask: { price: string; size: string }) => ({
          price: parseFloat(ask.price),
          size: parseFloat(ask.size),
        }))
        .sort((a: OrderBookLevel, b: OrderBookLevel) => a.price - b.price)
        .slice(0, 10);

      // Calculate spread and mid price
      const bestBid = bids[0]?.price || 0;
      const bestAsk = asks[0]?.price || 1;
      const spread = bestAsk - bestBid;
      const midPrice = (bestBid + bestAsk) / 2;

      setOrderBook({ bids, asks, spread, midPrice });
      setLastUpdate(new Date());
    } catch (error) {
      console.error('Error fetching order book:', error);
    } finally {
      setIsLoading(false);
    }
  }, [selectedEvent?.outcomes, selectedOutcomeIndex]);

  // Fetch on mount and when selection changes
  useEffect(() => {
    fetchOrderBook();
  }, [fetchOrderBook]);

  // Auto-refresh every 10 seconds
  useEffect(() => {
    const interval = setInterval(fetchOrderBook, 10000);
    return () => clearInterval(interval);
  }, [fetchOrderBook]);

  // Calculate cumulative totals and max for visualization
  const { bidsWithTotal, asksWithTotal, maxTotal } = useMemo(() => {
    if (!orderBook) return { bidsWithTotal: [], asksWithTotal: [], maxTotal: 1 };

    let bidTotal = 0;
    const bidsWithTotal = orderBook.bids.map(bid => {
      bidTotal += bid.size;
      return { ...bid, total: bidTotal };
    });

    let askTotal = 0;
    const asksWithTotal = orderBook.asks.map(ask => {
      askTotal += ask.size;
      return { ...ask, total: askTotal };
    }).reverse(); // Reverse for display (highest ask at top)

    const maxTotal = Math.max(bidTotal, askTotal, 1);

    return { bidsWithTotal, asksWithTotal, maxTotal };
  }, [orderBook]);

  const formatPrice = (price: number) => `${(price * 100).toFixed(1)}¢`;
  const formatSize = (size: number) => {
    if (size >= 1000) return `${(size / 1000).toFixed(1)}K`;
    return size.toFixed(0);
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
  const noPrice = selectedEvent.noPrice ?? (1 - yesPrice);

  return (
    <div className="h-full flex flex-col bg-gray-900 text-white">
      {/* Header */}
      <div className="p-2 border-b border-gray-800">
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs text-gray-400 truncate flex-1" title={selectedEvent.title}>
            {selectedEvent.title.length > 30
              ? selectedEvent.title.substring(0, 30) + '...'
              : selectedEvent.title}
          </div>
          <button
            onClick={fetchOrderBook}
            disabled={isLoading}
            className="p-1 hover:bg-gray-800 rounded transition-colors disabled:opacity-50"
          >
            <RefreshCw size={12} className={isLoading ? 'animate-spin' : ''} />
          </button>
        </div>

        {/* Exchange Tabs */}
        <div className="flex items-center gap-1 mb-2">
          <button
            onClick={() => setSelectedExchange('polymarket')}
            className={`px-2 py-1 text-xs rounded transition-colors ${
              selectedExchange === 'polymarket'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:text-white'
            }`}
          >
            Polymarket
          </button>
          <button
            onClick={() => setSelectedExchange('kalshi')}
            disabled
            className="px-2 py-1 text-xs rounded bg-gray-800 text-gray-600 cursor-not-allowed"
            title="Coming soon"
          >
            Kalshi
          </button>
        </div>

        {/* Outcome selector for multi-outcome events */}
        {selectedEvent.outcomes.length > 2 && (
          <div className="flex flex-wrap gap-1">
            {selectedEvent.outcomes.slice(0, 4).map((outcome, idx) => (
              <button
                key={outcome.id}
                onClick={() => setSelectedOutcomeIndex(idx)}
                className={`px-2 py-0.5 text-[10px] rounded transition-colors ${
                  selectedOutcomeIndex === idx
                    ? 'bg-purple-600 text-white'
                    : 'bg-gray-800 text-gray-400 hover:text-white'
                }`}
              >
                {outcome.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Column Headers */}
      <div className="grid grid-cols-3 gap-2 px-3 py-1.5 text-[10px] text-gray-500 border-b border-gray-800 uppercase tracking-wider">
        <span>Price</span>
        <span className="text-right">Size</span>
        <span className="text-right">Total</span>
      </div>

      {/* Order Book Content */}
      <div className="flex-1 overflow-auto text-xs">
        {isLoading && !orderBook ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 size={20} className="animate-spin text-blue-500" />
          </div>
        ) : (
          <>
            {/* Asks (Sells) */}
            <div className="flex flex-col-reverse">
              {asksWithTotal.map((ask, i) => (
                <div
                  key={`ask-${i}`}
                  className="relative grid grid-cols-3 gap-2 px-3 py-0.5 hover:bg-gray-800/50"
                >
                  <div
                    className="absolute inset-0 bg-red-500/10"
                    style={{ width: `${(ask.total / maxTotal) * 100}%` }}
                  />
                  <span className="relative text-red-400 font-mono">{formatPrice(ask.price)}</span>
                  <span className="relative text-right font-mono text-gray-300">{formatSize(ask.size)}</span>
                  <span className="relative text-right font-mono text-gray-500">{formatSize(ask.total)}</span>
                </div>
              ))}
            </div>

            {/* Spread / Mid Price */}
            <div className="px-3 py-2 bg-gray-800/50 border-y border-gray-700">
              <div className="flex justify-between items-center text-xs">
                <span className="text-gray-500">Spread</span>
                <span className="font-mono text-yellow-400">
                  {orderBook ? `${(orderBook.spread * 100).toFixed(2)}¢` : '-'}
                </span>
              </div>
              <div className="flex justify-between items-center text-sm mt-1 font-bold">
                <span className="text-green-400">
                  YES {formatPrice(orderBook?.midPrice ?? yesPrice)}
                </span>
                <span className="text-red-400">
                  NO {formatPrice(1 - (orderBook?.midPrice ?? yesPrice))}
                </span>
              </div>
            </div>

            {/* Bids (Buys) */}
            {bidsWithTotal.map((bid, i) => (
              <div
                key={`bid-${i}`}
                className="relative grid grid-cols-3 gap-2 px-3 py-0.5 hover:bg-gray-800/50"
              >
                <div
                  className="absolute inset-0 bg-green-500/10"
                  style={{ width: `${(bid.total / maxTotal) * 100}%` }}
                />
                <span className="relative text-green-400 font-mono">{formatPrice(bid.price)}</span>
                <span className="relative text-right font-mono text-gray-300">{formatSize(bid.size)}</span>
                <span className="relative text-right font-mono text-gray-500">{formatSize(bid.total)}</span>
              </div>
            ))}
          </>
        )}
      </div>

      {/* Footer with last update */}
      <div className="px-3 py-1.5 border-t border-gray-800 text-[10px] text-gray-500 flex justify-between">
        <span>
          {lastUpdate ? `Updated ${lastUpdate.toLocaleTimeString()}` : 'Loading...'}
        </span>
        <span className={isLoading ? 'text-blue-400' : 'text-green-400'}>
          {isLoading ? 'Updating...' : 'Live'}
        </span>
      </div>

      {/* Trade Buttons */}
      <div className="p-2 border-t border-gray-800">
        <div className="grid grid-cols-2 gap-2">
          <button className="py-2 bg-green-600 hover:bg-green-500 text-sm font-medium rounded transition-colors">
            Buy YES
          </button>
          <button className="py-2 bg-red-600 hover:bg-red-500 text-sm font-medium rounded transition-colors">
            Buy NO
          </button>
        </div>
      </div>
    </div>
  );
};

export default OrderBookWidget;
