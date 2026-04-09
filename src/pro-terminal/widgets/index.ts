import React from 'react';
import { WidgetType } from '../layout/types';

// Import widgets
import { OrderBookWidget } from './OrderBookWidget';
import { TradingChartWidget } from './TradingChartWidget';
import { AIAgentWidget } from './AIAgentWidget';
import { NewsFeedWidget } from './NewsFeedWidget';
import { PositionsWidget } from './PositionsWidget';
import { PlaceholderWidget } from './PlaceholderWidget';
import { MarketOverviewWidget } from './MarketOverviewWidget';

// Export all widgets
export { OrderBookWidget } from './OrderBookWidget';
export { TradingChartWidget } from './TradingChartWidget';
export { AIAgentWidget } from './AIAgentWidget';
export { NewsFeedWidget } from './NewsFeedWidget';
export { PositionsWidget } from './PositionsWidget';
export { PlaceholderWidget } from './PlaceholderWidget';
export { MarketOverviewWidget } from './MarketOverviewWidget';
export { WidgetWrapper } from './WidgetWrapper';

// Component mapping for Dockview
export const WIDGET_COMPONENTS: Record<string, React.ComponentType<any>> = {
  'order-book': OrderBookWidget,
  'trading-chart': TradingChartWidget,
  'ai-agent': AIAgentWidget,
  'news-feed': NewsFeedWidget,
  'positions': PositionsWidget,
  'market-overview': MarketOverviewWidget,
  // Placeholder widgets for not yet implemented components
  'quick-trade': (props: any) => React.createElement(PlaceholderWidget, { ...props, params: { ...props.params, widgetType: 'Quick Trade', icon: '⚡' } }),
  'trade-history': (props: any) => React.createElement(PlaceholderWidget, { ...props, params: { ...props.params, widgetType: 'Trade History', icon: '📜' } }),
  'ai-research': (props: any) => React.createElement(PlaceholderWidget, { ...props, params: { ...props.params, widgetType: 'AI Research', icon: '📝' } }),
  'youtube-embed': (props: any) => React.createElement(PlaceholderWidget, { ...props, params: { ...props.params, widgetType: 'YouTube', icon: '🎥' } }),
  'fed-watch': (props: any) => React.createElement(PlaceholderWidget, { ...props, params: { ...props.params, widgetType: 'FedWatch Tool', icon: '🏦' } }),
  'watchlist': (props: any) => React.createElement(PlaceholderWidget, { ...props, params: { ...props.params, widgetType: 'Watchlist', icon: '⭐' } }),
  'portfolio-chart': (props: any) => React.createElement(PlaceholderWidget, { ...props, params: { ...props.params, widgetType: 'Portfolio Chart', icon: '📊' } }),
  'twitter-feed': (props: any) => React.createElement(PlaceholderWidget, { ...props, params: { ...props.params, widgetType: 'Twitter/X', icon: '🐦' } }),
  'economic-calendar': (props: any) => React.createElement(PlaceholderWidget, { ...props, params: { ...props.params, widgetType: 'Economic Calendar', icon: '📅' } }),
};

// Get component by widget type
export function getWidgetComponent(type: WidgetType): React.ComponentType<any> | undefined {
  return WIDGET_COMPONENTS[type];
}
