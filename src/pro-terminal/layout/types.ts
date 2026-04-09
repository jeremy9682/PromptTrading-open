import { DockviewApi } from 'dockview';

// Widget 类型
export type WidgetType =
  | 'order-book'
  | 'trading-chart'
  | 'quick-trade'
  | 'positions'
  | 'trade-history'
  | 'ai-agent'
  | 'ai-research'
  | 'news-feed'
  | 'youtube-embed'
  | 'fed-watch'
  | 'market-overview'
  | 'watchlist'
  | 'portfolio-chart'
  | 'twitter-feed'
  | 'economic-calendar';

// Widget 分类
export type WidgetCategory = 'trading' | 'charts' | 'ai' | 'news' | 'research' | 'data' | 'media';

// Widget 定义
export interface WidgetDefinition {
  id: WidgetType;
  name: string;
  nameZh: string;
  icon: string;
  category: WidgetCategory;
  defaultSize: { width: number; height: number };
  minSize?: { width: number; height: number };
  description?: string;
  descriptionZh?: string;
}

// Widget Props（传递给每个 Widget 组件）
export interface WidgetProps {
  id: string;
  title: string;
  params?: Record<string, any>;
  api?: DockviewApi;
}

// 布局预设类型
export type LayoutPresetType = 'crypto' | 'fed' | 'election' | 'multi-asset' | 'custom';

// 布局预设定义
export interface LayoutPreset {
  id: LayoutPresetType;
  name: string;
  nameZh: string;
  description: string;
  descriptionZh: string;
  icon: string;
  panels: PanelConfig[];
}

// 面板配置
export interface PanelConfig {
  id: string;
  component: WidgetType;
  title: string;
  params?: Record<string, any>;
  position?: {
    referencePanel?: string;
    direction?: 'left' | 'right' | 'above' | 'below' | 'within';
  };
  size?: number;
}

// 序列化的布局数据
export interface SerializedLayout {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  data: any; // Dockview 序列化数据
}
