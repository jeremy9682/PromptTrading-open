import React, { useState } from 'react';
import { IDockviewPanelProps } from 'dockview';
import { ExternalLink, Clock, TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface NewsItem {
  id: string;
  title: string;
  source: string;
  time: string;
  sentiment: 'positive' | 'negative' | 'neutral';
  summary?: string;
}

interface NewsFeedWidgetProps extends IDockviewPanelProps {
  params: {
    filter?: 'crypto' | 'fed' | 'politics' | 'all';
  };
}

export const NewsFeedWidget: React.FC<NewsFeedWidgetProps> = ({ params }) => {
  const [filter, setFilter] = useState(params?.filter || 'all');

  // Mock news data
  const mockNews: NewsItem[] = [
    {
      id: '1',
      title: 'Bitcoin Surges Past $99,000 Amid ETF Inflows',
      source: 'CoinDesk',
      time: '5m ago',
      sentiment: 'positive',
      summary: 'Institutional demand continues to drive prices higher...',
    },
    {
      id: '2',
      title: 'Fed Officials Signal Potential Rate Cut in Q1',
      source: 'Reuters',
      time: '12m ago',
      sentiment: 'positive',
      summary: 'Multiple Fed governors expressed openness to easing policy...',
    },
    {
      id: '3',
      title: 'Crypto Market Update: Volatility Expected',
      source: 'The Block',
      time: '25m ago',
      sentiment: 'neutral',
      summary: 'Options expiry could lead to increased market movement...',
    },
    {
      id: '4',
      title: 'Regulatory Concerns Mount for Prediction Markets',
      source: 'Bloomberg',
      time: '1h ago',
      sentiment: 'negative',
      summary: 'SEC reportedly examining prediction market platforms...',
    },
    {
      id: '5',
      title: 'Polymarket Volume Hits All-Time High',
      source: 'Decrypt',
      time: '2h ago',
      sentiment: 'positive',
      summary: 'Platform sees record trading activity in election markets...',
    },
  ];

  const getSentimentIcon = (sentiment: string) => {
    switch (sentiment) {
      case 'positive':
        return <TrendingUp size={12} className="text-green-400" />;
      case 'negative':
        return <TrendingDown size={12} className="text-red-400" />;
      default:
        return <Minus size={12} className="text-gray-400" />;
    }
  };

  const getSentimentColor = (sentiment: string) => {
    switch (sentiment) {
      case 'positive':
        return 'border-l-green-500';
      case 'negative':
        return 'border-l-red-500';
      default:
        return 'border-l-gray-500';
    }
  };

  return (
    <div className="h-full flex flex-col bg-gray-900 text-white">
      {/* Filter Tabs */}
      <div className="flex items-center gap-1 p-2 border-b border-gray-800">
        {['all', 'crypto', 'fed', 'politics'].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f as any)}
            className={`px-2 py-1 text-xs rounded transition-colors capitalize ${
              filter === f
                ? 'bg-blue-600 text-white'
                : 'text-gray-400 hover:text-white hover:bg-gray-800'
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {/* News List */}
      <div className="flex-1 overflow-auto">
        {mockNews.map((news) => (
          <div
            key={news.id}
            className={`p-3 border-b border-gray-800 border-l-2 ${getSentimentColor(news.sentiment)} hover:bg-gray-800/50 cursor-pointer transition-colors`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  {getSentimentIcon(news.sentiment)}
                  <span className="text-xs text-blue-400">{news.source}</span>
                  <span className="text-xs text-gray-500 flex items-center gap-1">
                    <Clock size={10} />
                    {news.time}
                  </span>
                </div>
                <h4 className="text-sm font-medium leading-tight mb-1 line-clamp-2">
                  {news.title}
                </h4>
                {news.summary && (
                  <p className="text-xs text-gray-500 line-clamp-1">{news.summary}</p>
                )}
              </div>
              <button className="text-gray-500 hover:text-white p-1">
                <ExternalLink size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="p-2 border-t border-gray-800 text-center">
        <button className="text-xs text-blue-400 hover:text-blue-300">
          View All News →
        </button>
      </div>
    </div>
  );
};

export default NewsFeedWidget;
