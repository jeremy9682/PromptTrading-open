import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Input } from './ui/input';
import { 
  Search, 
  Star, 
  Users,
  DollarSign,
  Calendar,
  Info,
  Loader2,
  Globe,
  ChevronDown,
  X
} from 'lucide-react';
import { UnifiedMarketEvent } from '../../services/markets/types';
import { marketService } from '../../services/markets/marketService';
import { EventDetailDialog } from './EventDetailDialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { translations } from '../../constants/translations';

interface EventMarketProps {
  watchlist: string[];
  onAddToWatchlist: (eventId: string) => void;
  onRemoveFromWatchlist: (eventId: string) => void;
  language?: 'zh' | 'en';
}

// 扩展事件类型，包含AI评分和Trending评分
interface EventWithScore extends UnifiedMarketEvent {
  aiScore: number;
  trendingScore: number;
}

// Category configuration: key for URL/filtering, translateKey for i18n, matchPatterns for API data matching
const categoryConfig = [
  { key: 'all', translateKey: 'allCategories', matchPatterns: [] },
  { key: 'politics', translateKey: 'politics', matchPatterns: ['politics', 'political', 'election', 'vote'] },
  { key: 'crypto', translateKey: 'crypto', matchPatterns: ['crypto', 'cryptocurrency', 'bitcoin', 'ethereum', 'blockchain'] },
  { key: 'sports', translateKey: 'sports', matchPatterns: ['sports', 'nfl', 'nba', 'soccer', 'football', 'basketball', 'baseball'] },
  { key: 'tech', translateKey: 'tech', matchPatterns: ['tech', 'technology', 'ai', 'software'] },
  { key: 'business', translateKey: 'business', matchPatterns: ['business', 'corporate', 'company'] },
  { key: 'economy', translateKey: 'economy', matchPatterns: ['economy', 'economic', 'finance', 'fed', 'interest'] },
  { key: 'stocks', translateKey: 'stocks', matchPatterns: ['stocks', 'stock', 'market', 'trading'] },
  { key: 'popCulture', translateKey: 'popCulture', matchPatterns: ['pop culture', 'entertainment', 'celebrity', 'movie', 'music'] },
  { key: 'science', translateKey: 'science', matchPatterns: ['science', 'research', 'space', 'climate'] },
  { key: 'esports', translateKey: 'esports', matchPatterns: ['esports', 'gaming', 'game'] },
  { key: 'other', translateKey: 'other', matchPatterns: [] }
];

// Sort option keys for translation
const sortOptionKeys = [
  { value: '24h_volume', key: 'volume24h' },
  { value: 'volume', key: 'volume' },
  { value: 'liquidity', key: 'liquidity' },
  { value: 'ending_soon', key: 'endingSoon' },
  { value: 'newest', key: 'newest' },
  { value: 'ai_recommended', key: 'aiRecommended' }
];

export function EventMarket({ watchlist, onAddToWatchlist, onRemoveFromWatchlist, language = 'zh' }: EventMarketProps) {
  const t = translations[language]?.polymarketPage?.eventMarket || translations.en.polymarketPage.eventMarket;
  
  // Build translated categories with keys
  const categories = categoryConfig.map(cat => ({
    key: cat.key,
    label: t[cat.translateKey] || cat.key,
    matchPatterns: cat.matchPatterns
  }));
  
  // Build translated sort options  
  const sortOptions = sortOptionKeys.map(opt => ({
    value: opt.value,
    label: t[opt.key] || opt.key
  }));
  const [searchParams, setSearchParams] = useSearchParams();
  
  // Use category key for URL (stable across languages)
  const searchQuery = searchParams.get('search') || '';
  const selectedCategoryKey = searchParams.get('category') || 'all';
  const sortBy = searchParams.get('sort') || '24h_volume';
  const hideSports = searchParams.get('hideSports') === 'true';
  const hideCrypto = searchParams.get('hideCrypto') === 'true';
  const selectedSource = searchParams.get('source') || 'all'; // 'all' | 'POLYMARKET' | 'KALSHI'
  
  // Frequency 和 Status 固定为默认值，不再显示在UI中
  const frequency = 'all';
  const status = 'active';
  
  const [events, setEvents] = useState<UnifiedMarketEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [selectedEvent, setSelectedEvent] = useState<UnifiedMarketEvent | null>(null);
  // For multi-option trading: track which outcome and side was clicked
  const [selectedOutcomeIndex, setSelectedOutcomeIndex] = useState<number>(0);
  const [selectedTradeSide, setSelectedTradeSide] = useState<'YES' | 'NO'>('YES');
  const [initialTab, setInitialTab] = useState<string | undefined>(undefined);

  const LIMIT = 200; // 一次性加载更多事件，提供更好的搜索体验
  const MAX_DISPLAY = 500; // 增加最大显示数量
  const loadMoreRef = useRef<HTMLDivElement>(null);
  
  // AI推荐评分算法：评估市场是否适合AI交易
  const calculateAIScore = useCallback((event: UnifiedMarketEvent): number => {
    let score = 0;
    
    // 1. 流动性评分 (0-30分)
    const liquidity = event.liquidity || 0;
    if (liquidity > 500000) score += 30;
    else if (liquidity > 100000) score += 20;
    else if (liquidity > 50000) score += 10;
    
    // 2. 交易量评分 (0-30分)
    const volume = event.volume || 0;
    if (volume > 5000000) score += 30;
    else if (volume > 1000000) score += 20;
    else if (volume > 500000) score += 10;
    
    // 3. 价格合理性评分 (0-20分)
    const yesPrice = event.yesPrice ?? 0.5;
    if (yesPrice >= 0.2 && yesPrice <= 0.8) score += 20;
    else if (yesPrice >= 0.1 && yesPrice <= 0.9) score += 10;
    
    // 4. 时间评分 (0-20分)
    const endDate = new Date(event.endDate);
    const now = new Date();
    const daysLeft = (endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    if (daysLeft > 30) score += 20;
    else if (daysLeft > 7) score += 15;
    else if (daysLeft > 3) score += 10;
    else if (daysLeft > 1) score += 5;
    
    return score;
  }, []);
  
  // 计算Trending分数（模拟Polymarket的Trending算法）
  const calculateTrendingScore = useCallback((event: UnifiedMarketEvent): number => {
    let score = 0;
    
    // 1. 交易量权重最高 (0-50分)
    const volume = event.volume || 0;
    if (volume > 10000000) score += 50;
    else if (volume > 5000000) score += 40;
    else if (volume > 1000000) score += 30;
    else if (volume > 500000) score += 20;
    else if (volume > 100000) score += 10;
    
    // 2. 流动性 (0-20分)
    const liquidity = event.liquidity || 0;
    if (liquidity > 1000000) score += 20;
    else if (liquidity > 500000) score += 15;
    else if (liquidity > 100000) score += 10;
    else if (liquidity > 50000) score += 5;
    
    // 3. 价格波动性/活跃度 (0-20分) - 价格在20-80之间说明市场活跃
    const yesPrice = event.yesPrice ?? 0.5;
    if (yesPrice >= 0.3 && yesPrice <= 0.7) score += 20; // 高度不确定，最活跃
    else if (yesPrice >= 0.2 && yesPrice <= 0.8) score += 15;
    else if (yesPrice >= 0.1 && yesPrice <= 0.9) score += 10;
    
    // 4. 时效性 (0-10分) - 距离结束时间合适的事件
    const endDate = new Date(event.endDate);
    const now = new Date();
    const daysLeft = (endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    if (daysLeft > 7 && daysLeft < 90) score += 10; // 还有足够时间但不是太远
    else if (daysLeft > 3 && daysLeft < 180) score += 5;
    
    return score;
  }, []);
  
  // 使用useMemo缓存AI评分和Trending评分，避免重复计算
  const eventsWithScore = useMemo<EventWithScore[]>(() => {
    return events.map(event => ({
      ...event,
      aiScore: calculateAIScore(event),
      trendingScore: calculateTrendingScore(event)
    }));
  }, [events, calculateAIScore, calculateTrendingScore]);
  
  // 判断是否为AI推荐市场
  const isAIRecommended = (score: number): boolean => {
    return score >= 60;
  };
  
  // 更新 URL 参数的辅助函数（只管理筛选参数）
  const updateUrlParams = (updates: Record<string, string>) => {
    const newParams = new URLSearchParams(searchParams);
    Object.entries(updates).forEach(([key, value]) => {
      if (value) {
        newParams.set(key, value);
      } else {
        newParams.delete(key);
      }
    });
    setSearchParams(newParams);
  };

  const loadEvents = async (isLoadMore = false) => {
    const currentOffset = isLoadMore ? offset + LIMIT : 0;
    if (isLoadMore) {
      setLoadingMore(true);
    } else {
      setLoading(true);
    }

    try {
      // 不传递搜索查询到API，使用前端过滤
      const data = await marketService.getActiveMarkets(false, LIMIT, currentOffset);
      
      if (data.length < LIMIT) {
        setHasMore(false);
      }

      if (isLoadMore) {
        setEvents(prev => {
          // 去重逻辑：保留旧数据，如果新数据中有重复ID则过滤掉
          const existingIds = new Set(prev.map(e => e.id));
          const uniqueNewEvents = data.filter(e => !existingIds.has(e.id));
          return [...prev, ...uniqueNewEvents];
        });
        setOffset(currentOffset);
      } else {
        setEvents(data);
        setOffset(0);
        setHasMore(true);
      }
    } catch (error) {
      console.error("Failed to load markets", error);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  // Load events on mount - 恢复API调用
  // 当分类或排序变化时重新加载数据（搜索不触发重新加载，只做前端过滤）
  useEffect(() => {
    loadEvents();
  }, [selectedCategoryKey, sortBy]);

  // 无限滚动：使用 Intersection Observer
  useEffect(() => {
    if (!loadMoreRef.current || !hasMore || loadingMore || loading) return;
    
    const observer = new IntersectionObserver(
      (entries) => {
        // 当"加载更多"元素进入视口时，自动加载
        if (entries[0].isIntersecting && hasMore && !loadingMore) {
          loadEvents(true);
        }
      },
      { threshold: 0.1, rootMargin: '100px' } // 提前100px开始加载
    );
    
    observer.observe(loadMoreRef.current);
    
    return () => {
      observer.disconnect();
    };
  }, [hasMore, loadingMore, loading, offset]);

  // 过滤和排序，使用带评分的events，限制最大显示数量
  const filteredEvents = useMemo(() => {
    // Get selected category config
    const selectedCat = categories.find(c => c.key === selectedCategoryKey);
    
    return eventsWithScore
      .filter(event => {
        // 前端搜索过滤
        const matchesSearch = !searchQuery || 
          event.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          event.description.toLowerCase().includes(searchQuery.toLowerCase());
        
        // 分类过滤 - 使用 matchPatterns 匹配 API 返回的英文分类
        let matchesCategory = false;
        if (selectedCategoryKey === 'all') {
          matchesCategory = true;
        } else if (selectedCategoryKey === 'other') {
          // "Other" matches events that don't match any defined category
          const allPatterns = categories.slice(1, -1).flatMap(c => c.matchPatterns);
          matchesCategory = !allPatterns.some(pattern => 
            event.category?.toLowerCase().includes(pattern.toLowerCase())
          );
        } else if (selectedCat && selectedCat.matchPatterns.length > 0) {
          matchesCategory = selectedCat.matchPatterns.some(pattern => 
            event.category?.toLowerCase().includes(pattern.toLowerCase())
          );
        }
        
        // 频率过滤
        const matchesFrequency = frequency === 'all' || 
          (event.frequency && typeof event.frequency === 'string' && event.frequency.toLowerCase() === frequency.toLowerCase());
        
        // 状态过滤
        const matchesStatus = status === 'all' || 
          (status === 'active' && event.active !== false && event.closed !== true) ||
          (status === 'closed' && event.closed === true);
        
        // 快速隐藏过滤 - 使用 matchPatterns
        const sportPatterns = categories.find(c => c.key === 'sports')?.matchPatterns || [];
        const esportPatterns = categories.find(c => c.key === 'esports')?.matchPatterns || [];
        const cryptoPatterns = categories.find(c => c.key === 'crypto')?.matchPatterns || [];
        
        const isSports = [...sportPatterns, ...esportPatterns].some(pattern => 
          event.category?.toLowerCase().includes(pattern.toLowerCase())
        );
        const isCrypto = cryptoPatterns.some(pattern => 
          event.category?.toLowerCase().includes(pattern.toLowerCase())
        );
        
        if (hideSports && isSports) return false;
        if (hideCrypto && isCrypto) return false;

        // 来源过滤
        const matchesSource = selectedSource === 'all' || event.source === selectedSource;
        if (!matchesSource) return false;

        return matchesSearch && matchesCategory && matchesFrequency && matchesStatus;
      })
      .sort((a, b) => {
        switch (sortBy) {
          case '24h_volume':
            // 24小时交易量排序 - 如果没有24h数据，使用估算值
            const vol24hA = a.volume24h ?? (a.volume / 30); // 简单估算
            const vol24hB = b.volume24h ?? (b.volume / 30);
            return vol24hB - vol24hA;
          case 'volume':
            return b.volume - a.volume;
          case 'liquidity':
            return (b.liquidity || 0) - (a.liquidity || 0);
          case 'ending_soon':
            return new Date(a.endDate).getTime() - new Date(b.endDate).getTime();
          case 'newest':
            return b.id.localeCompare(a.id);
          case 'ai_recommended':
            return b.aiScore - a.aiScore;
          default:
            return 0;
        }
      })
      .slice(0, MAX_DISPLAY); // 限制最大显示数量
  }, [eventsWithScore, searchQuery, selectedCategoryKey, sortBy, hideSports, hideCrypto, selectedSource, categories]);

  // 渲染来源图标
  const renderSourceIcon = (source: string) => {
    if (source === 'POLYMARKET') {
      return <div className="w-4 h-4 rounded-full bg-blue-600 flex items-center justify-center text-[10px] text-white font-bold" title="Polymarket">P</div>;
    }
    if (source === 'KALSHI') {
      return <div className="w-4 h-4 rounded-full bg-green-600 flex items-center justify-center text-[10px] text-white font-bold" title="Kalshi">K</div>;
    }
    return <Globe className="w-4 h-4 text-gray-500" />;
  };

  // 翻译分类名称 - 将 API 返回的分类匹配到翻译后的名称
  const translateCategory = (apiCategory: string | undefined): string => {
    if (!apiCategory) return t.other;
    const lowerCategory = apiCategory.toLowerCase();
    
    // 匹配分类配置中的 patterns
    for (const cat of categoryConfig) {
      if (cat.key === 'all' || cat.key === 'other') continue;
      if (cat.matchPatterns.some(pattern => lowerCategory.includes(pattern.toLowerCase()))) {
        return t[cat.translateKey] || apiCategory;
      }
    }
    return t.other;
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Welcome Banner */}
      <Card className="p-6 bg-gradient-to-br from-blue-50 to-purple-50 dark:from-blue-950/20 dark:to-purple-950/20 border-blue-200 dark:border-blue-800">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <h2 className="text-xl font-bold">{t.title}</h2>
            </div>
            <p className="text-muted-foreground">
              {t.browseEvents} · {t.loadOneTime}
            </p>
            <div className="flex items-center gap-4 mt-4 text-sm">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-950 flex items-center justify-center">
                  <span className="text-lg">1</span>
                </div>
                <span className="text-muted-foreground">{t.browseStep}</span>
              </div>
              <div className="text-muted-foreground">→</div>
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-yellow-100 dark:bg-yellow-950 flex items-center justify-center">
                  <Star className="w-4 h-4" />
                </div>
                <span className="text-muted-foreground">{t.addToWatchlist}</span>
              </div>
              <div className="text-muted-foreground">→</div>
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-green-100 dark:bg-green-950 flex items-center justify-center">
                  <span className="text-sm font-semibold">AI</span>
                </div>
                <span className="text-muted-foreground">{t.createTraderStep}</span>
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* Filters */}
      <Card className="p-4">
        <div className="space-y-4">
          {/* Search Row */}
          <div className="flex gap-3">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder={t.searchPlaceholder}
                value={searchQuery}
                onChange={(e) => updateUrlParams({ search: e.target.value })}
                className="pl-10 pr-10 w-full"
              />
              {searchQuery && (
                <button
                  onClick={() => updateUrlParams({ search: '' })}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  title={t.clearSearch}
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* Filter Options Row */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Sort by */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground whitespace-nowrap">{t.sortBy}:</span>
              <Select value={sortBy} onValueChange={(value) => updateUrlParams({ sort: value })}>
                <SelectTrigger className="w-[140px] h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {sortOptions.map(option => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Quick Hide Options */}
            <div className="flex items-center gap-3 ml-auto">
              <label className="flex items-center gap-1.5 text-sm text-muted-foreground cursor-pointer hover:text-foreground transition-colors">
                <input
                  type="checkbox"
                  checked={hideSports}
                  onChange={(e) => updateUrlParams({ hideSports: e.target.checked ? 'true' : '' })}
                  className="rounded"
                />
                <span className="whitespace-nowrap">{t.hideSports}</span>
              </label>
              <label className="flex items-center gap-1.5 text-sm text-muted-foreground cursor-pointer hover:text-foreground transition-colors">
                <input
                  type="checkbox"
                  checked={hideCrypto}
                  onChange={(e) => updateUrlParams({ hideCrypto: e.target.checked ? 'true' : '' })}
                  className="rounded"
                />
                <span className="whitespace-nowrap">{t.hideCrypto}</span>
              </label>
            </div>
          </div>

          {/* Source Filter Row - Polymarket / Kalshi */}
          <div className="flex gap-2 items-center">
            <span className="text-sm text-muted-foreground whitespace-nowrap">{language === 'zh' ? '来源:' : 'Source:'}</span>
            <div className="flex gap-1">
              <Button
                variant={selectedSource === 'all' ? "default" : "outline"}
                size="sm"
                onClick={() => updateUrlParams({ source: '' })}
                className="h-8"
              >
                {t.allSources || (language === 'zh' ? '全部来源' : 'All Sources')}
              </Button>
              <Button
                variant={selectedSource === 'POLYMARKET' ? "default" : "outline"}
                size="sm"
                onClick={() => updateUrlParams({ source: 'POLYMARKET' })}
                className="h-8"
              >
                <div className="w-4 h-4 rounded-full bg-blue-600 flex items-center justify-center text-[10px] text-white font-bold mr-1.5">P</div>
                {t.polymarketOnly || 'Polymarket'}
              </Button>
              <Button
                variant={selectedSource === 'KALSHI' ? "default" : "outline"}
                size="sm"
                onClick={() => updateUrlParams({ source: 'KALSHI' })}
                className="h-8"
              >
                <div className="w-4 h-4 rounded-full bg-green-600 flex items-center justify-center text-[10px] text-white font-bold mr-1.5">K</div>
                {t.kalshiOnly || 'Kalshi'}
              </Button>
            </div>
          </div>

          {/* Category Filter Row */}
          <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-700">
            {categories.map((category) => (
              <Button
                key={category.key}
                variant={selectedCategoryKey === category.key ? "default" : "outline"}
                size="sm"
                onClick={() => updateUrlParams({ category: category.key === 'all' ? '' : category.key })}
                className="whitespace-nowrap flex-shrink-0"
              >
                {category.label}
              </Button>
            ))}
          </div>
        </div>
      </Card>

      {/* Results Count */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-4">
          <p className="text-sm text-muted-foreground">
            {searchQuery ? (
              language === 'zh' ? (
                <>搜索 <span className="font-medium text-blue-600 dark:text-blue-400">"{searchQuery}"</span> 找到 <span className="font-medium text-foreground">{filteredEvents.length}</span> 个事件</>
              ) : (
                <>Found <span className="font-medium text-foreground">{filteredEvents.length}</span> events for <span className="font-medium text-blue-600 dark:text-blue-400">"{searchQuery}"</span></>
              )
            ) : (
              language === 'zh' ? (
                <>显示 <span className="font-medium text-foreground">{filteredEvents.length}</span> 个事件</>
              ) : (
                <>Showing <span className="font-medium text-foreground">{filteredEvents.length}</span> events</>
              )
            )}
          </p>
          {sortBy === 'ai_recommended' && filteredEvents.length > 0 && (
            <p className="text-sm text-muted-foreground">
              {language === 'zh' ? (
                <>其中 <span className="font-medium text-purple-600 dark:text-purple-400">
                  {filteredEvents.filter(e => isAIRecommended(e.aiScore)).length}
                </span> 个{t.aiRecommended}</>
              ) : (
                <><span className="font-medium text-purple-600 dark:text-purple-400">
                  {filteredEvents.filter(e => isAIRecommended(e.aiScore)).length}
                </span> {t.aiRecommended}</>
              )}
            </p>
          )}
        </div>
        {loading && <Loader2 className="w-4 h-4 animate-spin text-blue-500" />}
      </div>

      {/* Events Grid */}
      {loading && events.length === 0 ? (
        // 骨架屏加载效果
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {[...Array(8)].map((_, i) => (
            <Card key={i} className="p-4 animate-pulse">
              <div className="space-y-3">
                <div className="flex justify-between">
                  <div className="flex gap-2">
                    <div className="w-4 h-4 bg-gray-200 dark:bg-gray-700 rounded-full" />
                    <div className="w-20 h-4 bg-gray-200 dark:bg-gray-700 rounded" />
                  </div>
                  <div className="w-8 h-8 bg-gray-200 dark:bg-gray-700 rounded" />
                </div>
                <div className="space-y-2">
                  <div className="w-full h-4 bg-gray-200 dark:bg-gray-700 rounded" />
                  <div className="w-3/4 h-4 bg-gray-200 dark:bg-gray-700 rounded" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="h-16 bg-gray-200 dark:bg-gray-700 rounded" />
                  <div className="h-16 bg-gray-200 dark:bg-gray-700 rounded" />
                </div>
                <div className="grid grid-cols-2 gap-2 pt-2 border-t">
                  <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded" />
                  <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded" />
                </div>
              </div>
            </Card>
          ))}
        </div>
      ) : filteredEvents.length === 0 ? (
        <Card className="p-12 text-center">
          <Search className="w-16 h-16 text-muted-foreground mx-auto mb-4 opacity-20" />
          <h3 className="text-lg font-medium mb-2">{t.noEvents}</h3>
          <p className="text-sm text-muted-foreground mb-4">
            {t.noEventsDesc}
          </p>
          <div className="flex flex-wrap gap-2 justify-center">
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => {
                updateUrlParams({ search: '', category: '', sort: 'ai_recommended' });
              }}
            >
              {language === 'zh' ? '重置所有筛选' : 'Reset All Filters'}
            </Button>
            {searchQuery && (
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => updateUrlParams({ search: '' })}
              >
                {t.clearSearch}
              </Button>
            )}
            {selectedCategoryKey !== 'all' && (
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => updateUrlParams({ category: '' })}
              >
                {t.allCategories}
              </Button>
            )}
          </div>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredEvents.map((event) => {
              const isInWatchlist = watchlist.includes(event.id);
              const yesPrice = event.yesPrice ?? 0;
              const noPrice = event.noPrice ?? (1 - yesPrice);
              
              return (
                <Card
                  key={event.id}
                  className="p-4 hover:shadow-lg transition-all"
                >
                  <div className="space-y-3">
                    {/* Header with Image */}
                    <div className="flex items-start gap-3">
                      {/* Event Image */}
                      {event.imageUrl && (
                        <img 
                          src={event.imageUrl} 
                          alt={event.title}
                          className="w-12 h-12 rounded object-cover flex-shrink-0"
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                          }}
                        />
                      )}
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div className="flex gap-2 items-center flex-wrap">
                            {renderSourceIcon(event.source)}
                            <Badge variant="outline" className="shrink-0 truncate max-w-[120px]" title={event.category}>
                              {translateCategory(event.category)}
                            </Badge>
                            {isAIRecommended(event.aiScore) && (
                              <Badge className="shrink-0 bg-gradient-to-r from-purple-500 to-blue-500 text-white border-0">
                                {t.aiRecommended}
                              </Badge>
                            )}
                          </div>
                          <Button
                            variant={isInWatchlist ? "default" : "ghost"}
                            size="sm"
                            className="shrink-0 h-8 w-8 p-0"
                            onClick={() => isInWatchlist ? onRemoveFromWatchlist(event.id) : onAddToWatchlist(event.id)}
                          >
                            <Star className={`w-4 h-4 ${isInWatchlist ? 'fill-white' : ''}`} />
                          </Button>
                        </div>

                        {/* Title */}
                        <h4 className="line-clamp-2 text-sm font-medium leading-snug" title={event.title}>
                          {event.title}
                        </h4>
                      </div>
                    </div>

                    {/* Outcomes - 支持多选项 */}
                    {event.outcomes.length === 2 && (event.outcomes[0].name === 'Yes' || event.outcomes[0].name === 'No' || event.outcomes[1].name === 'Yes' || event.outcomes[1].name === 'No') ? (
                      // 标准 Yes/No 市场
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedOutcomeIndex(0);
                            setSelectedTradeSide('YES');
                            setInitialTab('trade');
                            setSelectedEvent(event);
                          }}
                          className="bg-green-50 dark:bg-green-950/20 rounded p-2 hover:bg-green-100 dark:hover:bg-green-950/40 transition-colors text-left"
                        >
                          <p className="text-xs text-muted-foreground mb-0.5">YES</p>
                          <p className="text-lg font-bold text-green-600 dark:text-green-400">
                            {(yesPrice * 100).toFixed(0)}¢
                          </p>
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedOutcomeIndex(0);
                            setSelectedTradeSide('NO');
                            setInitialTab('trade');
                            setSelectedEvent(event);
                          }}
                          className="bg-red-50 dark:bg-red-950/20 rounded p-2 hover:bg-red-100 dark:hover:bg-red-950/40 transition-colors text-left"
                        >
                          <p className="text-xs text-muted-foreground mb-0.5">NO</p>
                          <p className="text-lg font-bold text-red-600 dark:text-red-400">
                            {(noPrice * 100).toFixed(0)}¢
                          </p>
                        </button>
                      </div>
                    ) : (
                      // 多选项市场（Fed decision, 体育赛事等）- 每个选项显示 YES/NO 价格
                      <div className="space-y-1.5">
                        {event.outcomes.slice(0, 4).map((outcome, outcomeIdx) => {
                          // 使用选项级别的 yesPrice/noPrice，如果没有则使用 price
                          const optionYesPrice = outcome.yesPrice ?? outcome.price;
                          const optionNoPrice = outcome.noPrice ?? (1 - outcome.price);
                          return (
                            <div key={outcome.id} className="flex items-center justify-between bg-slate-50 dark:bg-slate-900 rounded px-2 py-1.5">
                              <span className="text-xs font-medium truncate flex-1 min-w-0 mr-2">{outcome.name}</span>
                              <div className="flex gap-1.5 flex-shrink-0">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedOutcomeIndex(outcomeIdx);
                                    setSelectedTradeSide('YES');
                                    setInitialTab('trade');
                                    setSelectedEvent(event);
                                  }}
                                  className="text-[10px] px-2 py-0.5 rounded bg-green-500 hover:bg-green-400 text-white font-semibold min-w-[40px] text-center transition-colors"
                                >
                                  Y {(optionYesPrice * 100).toFixed(0)}¢
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedOutcomeIndex(outcomeIdx);
                                    setSelectedTradeSide('NO');
                                    setInitialTab('trade');
                                    setSelectedEvent(event);
                                  }}
                                  className="text-[10px] px-2 py-0.5 rounded bg-red-500 hover:bg-red-400 text-white font-semibold min-w-[40px] text-center transition-colors"
                                >
                                  N {(optionNoPrice * 100).toFixed(0)}¢
                                </button>
                              </div>
                            </div>
                          );
                        })}
                        {event.outcomes.length > 4 && (
                          <p className="text-xs text-muted-foreground text-center">
                            +{event.outcomes.length - 4} more options
                          </p>
                        )}
                      </div>
                    )}

                    {/* Stats */}
                    <div className="grid grid-cols-2 gap-2 pt-2 border-t text-xs">
                      <div className="flex items-center gap-1.5">
                        <DollarSign className="w-3.5 h-3.5 text-muted-foreground" />
                        <span className="text-muted-foreground">
                          ${event.volume >= 1000000 
                            ? (event.volume / 1000000).toFixed(2) + 'M' 
                            : (event.volume / 1000).toFixed(0) + 'k'}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5" title={t.liquidity}>
                        <Users className="w-3.5 h-3.5 text-muted-foreground" />
                        <span className="text-muted-foreground">
                          {event.liquidity 
                            ? '$' + (event.liquidity >= 1000000 
                              ? (event.liquidity / 1000000).toFixed(2) + 'M'
                              : (event.liquidity / 1000).toFixed(0) + 'k')
                            : 'N/A'}
                        </span>
                      </div>
                    </div>
                    
                    {/* AI Score indicator - 仅在AI推荐时显示 */}
                    {isAIRecommended(event.aiScore) && (
                      <div className="pt-2 border-t">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">{language === 'zh' ? 'AI适配度' : 'AI Score'}</span>
                          <div className="flex items-center gap-1">
                            <div className="h-1.5 w-16 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                              <div 
                                className="h-full bg-gradient-to-r from-purple-500 to-blue-500 rounded-full transition-all"
                                style={{ width: `${event.aiScore}%` }}
                              />
                            </div>
                            <span className="font-medium text-blue-600 dark:text-blue-400">
                              {event.aiScore}%
                            </span>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* End Date */}
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Calendar className="w-3.5 h-3.5" />
                      <span>{t.endDate}: {new Date(event.endDate).toLocaleDateString(language === 'zh' ? 'zh-CN' : 'en-US')}</span>
                    </div>

                    {/* Action Buttons */}
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setInitialTab(undefined); // Go to default orderbook tab
                          setSelectedEvent(event);
                        }}
                      >
                        <Info className="w-4 h-4 mr-1" />
                        {t.viewDetails}
                      </Button>
                      <Button
                        variant={isInWatchlist ? "secondary" : "default"}
                        size="sm"
                        onClick={() => isInWatchlist ? onRemoveFromWatchlist(event.id) : onAddToWatchlist(event.id)}
                      >
                        {isInWatchlist ? (
                          <>
                            <Star className="w-4 h-4 mr-1 fill-current" />
                            {language === 'zh' ? '已关注' : 'Watching'}
                          </>
                        ) : (
                          <>
                            <Star className="w-4 h-4 mr-1" />
                            {language === 'zh' ? '关注' : 'Watch'}
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>

          {/* Load More - 自动触发区域 */}
          {hasMore && filteredEvents.length < MAX_DISPLAY && (
            <div 
              ref={loadMoreRef}
              className="flex justify-center mt-8 py-4"
            >
              {loadingMore ? (
                <div className="flex flex-col items-center gap-2">
                  <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
                  <p className="text-sm text-muted-foreground">{language === 'zh' ? '加载中...' : 'Loading...'}</p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <ChevronDown className="w-6 h-6 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">{language === 'zh' ? '向下滚动加载更多' : 'Scroll down to load more'}</p>
                </div>
              )}
            </div>
          )}
          
          {/* 已达到最大显示数量或加载完毕 */}
          {(filteredEvents.length >= MAX_DISPLAY || (!hasMore && events.length > 0)) && (
            <div className="text-center py-8">
              <p className="text-sm text-muted-foreground">
                {filteredEvents.length >= MAX_DISPLAY 
                  ? (language === 'zh' 
                    ? `已显示前 ${MAX_DISPLAY} 个市场，请使用筛选功能查找更多`
                    : `Showing first ${MAX_DISPLAY} markets. Use filters to find more`)
                  : (language === 'zh' 
                    ? `共 ${filteredEvents.length} 个市场`
                    : `${filteredEvents.length} markets total`)}
              </p>
            </div>
          )}
        </>
      )}

      {/* Event Detail Dialog */}
      <EventDetailDialog
        event={selectedEvent}
        open={!!selectedEvent}
        onClose={() => {
          setSelectedEvent(null);
          setInitialTab(undefined); // Reset to default tab
        }}
        language={language}
        initialOutcomeIndex={selectedOutcomeIndex}
        initialSide={selectedTradeSide}
        initialTab={initialTab}
      />
    </div>
  );
}
