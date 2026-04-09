import React, { useState, useMemo } from 'react';
import { IDockviewPanelProps } from 'dockview';
import { Search, Star, TrendingUp, TrendingDown, Loader2, RefreshCw, Filter } from 'lucide-react';
import { useProTerminal } from '../context/ProTerminalContext';

interface MarketOverviewWidgetProps extends IDockviewPanelProps {
  params?: {
    filter?: string;
  };
}

const categoryOptions = [
  { key: 'all', label: 'All', labelZh: '全部' },
  { key: 'crypto', label: 'Crypto', labelZh: '加密货币' },
  { key: 'politics', label: 'Politics', labelZh: '政治' },
  { key: 'economy', label: 'Economy', labelZh: '经济' },
  { key: 'sports', label: 'Sports', labelZh: '体育' },
];

export const MarketOverviewWidget: React.FC<MarketOverviewWidgetProps> = ({ params }) => {
  const {
    filteredEvents,
    isLoadingEvents,
    loadEvents,
    selectedEvent,
    setSelectedEvent,
    selectedCategory,
    setSelectedCategory,
    searchQuery,
    setSearchQuery,
    addToWatchlist,
    removeFromWatchlist,
    isInWatchlist,
  } = useProTerminal();

  const [showFilters, setShowFilters] = useState(false);

  // Format volume display
  const formatVolume = (volume: number) => {
    if (volume >= 1000000) {
      return `$${(volume / 1000000).toFixed(1)}M`;
    }
    if (volume >= 1000) {
      return `$${(volume / 1000).toFixed(0)}K`;
    }
    return `$${volume.toFixed(0)}`;
  };

  // Format price as cents
  const formatPrice = (price: number) => {
    return `${(price * 100).toFixed(0)}¢`;
  };

  return (
    <div className="h-full flex flex-col bg-gray-900 text-white">
      {/* Header */}
      <div className="p-3 border-b border-gray-800">
        <div className="flex items-center gap-2 mb-2">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search markets..."
              className="w-full pl-9 pr-3 py-1.5 text-sm bg-gray-800 border border-gray-700 rounded focus:outline-none focus:border-blue-500"
            />
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`p-1.5 rounded transition-colors ${showFilters ? 'bg-blue-600' : 'hover:bg-gray-800'}`}
          >
            <Filter size={14} />
          </button>
          <button
            onClick={() => loadEvents(true)}
            disabled={isLoadingEvents}
            className="p-1.5 hover:bg-gray-800 rounded transition-colors disabled:opacity-50"
          >
            <RefreshCw size={14} className={isLoadingEvents ? 'animate-spin' : ''} />
          </button>
        </div>

        {/* Category filters */}
        {showFilters && (
          <div className="flex flex-wrap gap-1 pt-2">
            {categoryOptions.map((cat) => (
              <button
                key={cat.key}
                onClick={() => setSelectedCategory(cat.key)}
                className={`px-2 py-1 text-xs rounded transition-colors ${
                  selectedCategory === cat.key
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-800 text-gray-400 hover:text-white'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Events count */}
      <div className="px-3 py-2 text-xs text-gray-500 border-b border-gray-800">
        {isLoadingEvents ? (
          <span className="flex items-center gap-1">
            <Loader2 size={12} className="animate-spin" />
            Loading...
          </span>
        ) : (
          <span>{filteredEvents.length} markets</span>
        )}
      </div>

      {/* Events list */}
      <div className="flex-1 overflow-auto">
        {filteredEvents.map((event) => {
          const isSelected = selectedEvent?.id === event.id;
          const inWatchlist = isInWatchlist(event.id);
          const yesPrice = event.yesPrice ?? 0.5;
          const noPrice = event.noPrice ?? (1 - yesPrice);
          const priceChange = event.oneDayPriceChange;

          return (
            <div
              key={event.id}
              onClick={() => setSelectedEvent(event)}
              className={`p-3 border-b border-gray-800 cursor-pointer transition-colors ${
                isSelected
                  ? 'bg-blue-900/30 border-l-2 border-l-blue-500'
                  : 'hover:bg-gray-800/50'
              }`}
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex items-start gap-2 flex-1 min-w-0">
                  {/* Event image */}
                  {event.imageUrl && (
                    <img
                      src={event.imageUrl}
                      alt=""
                      className="w-8 h-8 rounded object-cover flex-shrink-0"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                      }}
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="text-[10px] px-1.5 py-0.5 bg-gray-700 rounded text-gray-400">
                        {event.source}
                      </span>
                      <span className="text-[10px] text-gray-500 truncate">
                        {event.category}
                      </span>
                    </div>
                    <h4 className="text-sm font-medium leading-tight line-clamp-2">
                      {event.title}
                    </h4>
                  </div>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    inWatchlist ? removeFromWatchlist(event.id) : addToWatchlist(event.id);
                  }}
                  className={`p-1 rounded transition-colors ${
                    inWatchlist ? 'text-yellow-400' : 'text-gray-600 hover:text-gray-400'
                  }`}
                >
                  <Star size={14} className={inWatchlist ? 'fill-current' : ''} />
                </button>
              </div>

              {/* Prices */}
              <div className="flex items-center gap-3 mb-2">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-gray-500">YES</span>
                  <span className="text-sm font-mono text-green-400">
                    {formatPrice(yesPrice)}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-gray-500">NO</span>
                  <span className="text-sm font-mono text-red-400">
                    {formatPrice(noPrice)}
                  </span>
                </div>
                {priceChange !== undefined && (
                  <div className={`flex items-center gap-0.5 text-xs ${
                    priceChange >= 0 ? 'text-green-400' : 'text-red-400'
                  }`}>
                    {priceChange >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                    {priceChange >= 0 ? '+' : ''}{(priceChange * 100).toFixed(1)}%
                  </div>
                )}
              </div>

              {/* Stats */}
              <div className="flex items-center gap-4 text-xs text-gray-500">
                <span>Vol: {formatVolume(event.volume)}</span>
                {event.liquidity && <span>Liq: {formatVolume(event.liquidity)}</span>}
                <span>Ends: {new Date(event.endDate).toLocaleDateString()}</span>
              </div>

              {/* Multi-outcome display */}
              {event.outcomes.length > 2 && (
                <div className="mt-2 pt-2 border-t border-gray-800">
                  <div className="text-xs text-gray-500 mb-1">{event.outcomes.length} outcomes</div>
                  <div className="flex flex-wrap gap-1">
                    {event.outcomes.slice(0, 3).map((outcome) => (
                      <span
                        key={outcome.id}
                        className="text-[10px] px-1.5 py-0.5 bg-gray-800 rounded"
                      >
                        {outcome.name}: {formatPrice(outcome.yesPrice ?? outcome.price)}
                      </span>
                    ))}
                    {event.outcomes.length > 3 && (
                      <span className="text-[10px] text-gray-500">
                        +{event.outcomes.length - 3} more
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {/* Empty state */}
        {!isLoadingEvents && filteredEvents.length === 0 && (
          <div className="p-8 text-center text-gray-500">
            <Search size={32} className="mx-auto mb-2 opacity-30" />
            <p className="text-sm">No markets found</p>
            <p className="text-xs mt-1">Try adjusting your filters</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default MarketOverviewWidget;
