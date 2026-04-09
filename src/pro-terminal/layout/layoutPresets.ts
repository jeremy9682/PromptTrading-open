import { LayoutPreset, PanelConfig } from './types';

// Crypto 布局预设
const cryptoLayout: PanelConfig[] = [
  {
    id: 'market-overview-1',
    component: 'market-overview',
    title: 'Prediction Markets',
    params: { filter: 'crypto' },
  },
  {
    id: 'orderbook-1',
    component: 'order-book',
    title: 'Order Book',
    position: { referencePanel: 'market-overview-1', direction: 'right' },
    size: 30,
  },
  {
    id: 'chart-1',
    component: 'trading-chart',
    title: 'Price Chart',
    position: { referencePanel: 'orderbook-1', direction: 'right' },
    size: 40,
  },
  {
    id: 'news-1',
    component: 'news-feed',
    title: 'Crypto News',
    params: { filter: 'crypto' },
    position: { referencePanel: 'chart-1', direction: 'right' },
    size: 25,
  },
  {
    id: 'ai-agent-1',
    component: 'ai-agent',
    title: 'AI Trading Agent',
    position: { referencePanel: 'market-overview-1', direction: 'below' },
  },
  {
    id: 'positions-1',
    component: 'positions',
    title: 'Positions',
    position: { referencePanel: 'ai-agent-1', direction: 'right' },
  },
];

// Fed Rates 布局预设
const fedLayout: PanelConfig[] = [
  {
    id: 'market-overview-1',
    component: 'market-overview',
    title: 'Fed Rate Markets',
    params: { filter: 'economy' },
  },
  {
    id: 'orderbook-1',
    component: 'order-book',
    title: 'Order Book',
    position: { referencePanel: 'market-overview-1', direction: 'right' },
    size: 30,
  },
  {
    id: 'chart-1',
    component: 'trading-chart',
    title: 'Price Chart',
    position: { referencePanel: 'orderbook-1', direction: 'right' },
    size: 40,
  },
  {
    id: 'news-1',
    component: 'news-feed',
    title: 'Fed News',
    params: { filter: 'fed' },
    position: { referencePanel: 'chart-1', direction: 'right' },
    size: 25,
  },
  {
    id: 'ai-agent-1',
    component: 'ai-agent',
    title: 'AI Agent',
    position: { referencePanel: 'market-overview-1', direction: 'below' },
  },
  {
    id: 'positions-1',
    component: 'positions',
    title: 'Positions',
    position: { referencePanel: 'ai-agent-1', direction: 'right' },
  },
];

// Election 布局预设
const electionLayout: PanelConfig[] = [
  {
    id: 'market-overview-1',
    component: 'market-overview',
    title: 'Election Markets',
    params: { filter: 'politics' },
  },
  {
    id: 'orderbook-1',
    component: 'order-book',
    title: 'Order Book',
    position: { referencePanel: 'market-overview-1', direction: 'right' },
    size: 30,
  },
  {
    id: 'chart-1',
    component: 'trading-chart',
    title: 'Election Odds',
    position: { referencePanel: 'orderbook-1', direction: 'right' },
    size: 40,
  },
  {
    id: 'news-1',
    component: 'news-feed',
    title: 'Political News',
    params: { filter: 'politics' },
    position: { referencePanel: 'chart-1', direction: 'right' },
    size: 25,
  },
  {
    id: 'ai-agent-1',
    component: 'ai-agent',
    title: 'AI Agent',
    position: { referencePanel: 'market-overview-1', direction: 'below' },
  },
  {
    id: 'positions-1',
    component: 'positions',
    title: 'Positions',
    position: { referencePanel: 'ai-agent-1', direction: 'right' },
  },
];

// Multi-Asset 布局预设
const multiAssetLayout: PanelConfig[] = [
  {
    id: 'market-overview-1',
    component: 'market-overview',
    title: 'All Markets',
  },
  {
    id: 'orderbook-1',
    component: 'order-book',
    title: 'Order Book',
    position: { referencePanel: 'market-overview-1', direction: 'right' },
    size: 25,
  },
  {
    id: 'chart-1',
    component: 'trading-chart',
    title: 'Price Chart',
    position: { referencePanel: 'orderbook-1', direction: 'right' },
    size: 35,
  },
  {
    id: 'ai-agent-1',
    component: 'ai-agent',
    title: 'AI Agent',
    position: { referencePanel: 'chart-1', direction: 'right' },
    size: 25,
  },
  {
    id: 'positions-1',
    component: 'positions',
    title: 'All Positions',
    position: { referencePanel: 'market-overview-1', direction: 'below' },
    size: 50,
  },
  {
    id: 'news-1',
    component: 'news-feed',
    title: 'News Feed',
    position: { referencePanel: 'positions-1', direction: 'right' },
    size: 50,
  },
];

// 布局预设集合
export const LAYOUT_PRESETS: Record<string, LayoutPreset> = {
  crypto: {
    id: 'crypto',
    name: 'Crypto',
    nameZh: '加密货币',
    description: 'Optimized for cryptocurrency prediction markets',
    descriptionZh: '针对加密货币预测市场优化',
    icon: '₿',
    panels: cryptoLayout,
  },
  fed: {
    id: 'fed',
    name: 'Fed Rates',
    nameZh: '美联储利率',
    description: 'Federal Reserve interest rate predictions',
    descriptionZh: '美联储利率预测',
    icon: '🏦',
    panels: fedLayout,
  },
  election: {
    id: 'election',
    name: 'Election',
    nameZh: '选举',
    description: 'Political and election prediction markets',
    descriptionZh: '政治和选举预测市场',
    icon: '🗳️',
    panels: electionLayout,
  },
  'multi-asset': {
    id: 'multi-asset',
    name: 'Multi-Asset',
    nameZh: '多资产',
    description: 'Overview of multiple market types',
    descriptionZh: '多种市场类型概览',
    icon: '📊',
    panels: multiAssetLayout,
  },
};

// 获取布局预设
export function getLayoutPreset(id: string): LayoutPreset | undefined {
  return LAYOUT_PRESETS[id];
}

// 获取所有布局预设
export function getAllLayoutPresets(): LayoutPreset[] {
  return Object.values(LAYOUT_PRESETS);
}
