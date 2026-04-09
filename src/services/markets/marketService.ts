import { PolymarketAdapter } from './adapters/polymarketAdapter';
import { DFlowAdapter } from './adapters/dflowAdapter';
import { UnifiedMarketEvent, MarketSource } from './types';

class MarketService {
  private polyAdapter = new PolymarketAdapter();
  private dflowAdapter = new DFlowAdapter();

  // 可以在这里添加缓存逻辑
  private cache: UnifiedMarketEvent[] = [];
  private lastFetchTime: number = 0;
  private CACHE_DURATION = 300000; // 5分钟缓存（因为现在加载更多数据）

  /**
   * Fetch active markets from all sources
   * @param forceRefresh - Force refresh cache
   * @param limit - Number of markets per source
   * @param offset - Offset for pagination
   * @param sourceFilter - Optional filter by source ('POLYMARKET', 'KALSHI', or undefined for all)
   */
  async getActiveMarkets(
    forceRefresh = false,
    limit = 20,
    offset = 0,
    sourceFilter?: MarketSource
  ): Promise<UnifiedMarketEvent[]> {
    const now = Date.now();

    // 简单的缓存逻辑只适用于第一页 (offset=0) 且无来源过滤
    if (offset === 0 && !forceRefresh && !sourceFilter && this.cache.length > 0 && (now - this.lastFetchTime < this.CACHE_DURATION)) {
      return this.cache.slice(0, limit);
    }

    try {
      // 并行调用多个适配器
      const fetchPromises: Promise<UnifiedMarketEvent[]>[] = [];

      // 根据 sourceFilter 决定调用哪些适配器
      if (!sourceFilter || sourceFilter === 'POLYMARKET') {
        fetchPromises.push(
          this.polyAdapter.fetchMarkets(limit, offset)
            .catch(err => {
              console.error('[MarketService] Polymarket fetch failed:', err);
              return [] as UnifiedMarketEvent[];
            })
        );
      }

      if (!sourceFilter || sourceFilter === 'KALSHI') {
        fetchPromises.push(
          this.dflowAdapter.fetchMarkets(limit, offset)
            .catch(err => {
              console.error('[MarketService] DFlow/Kalshi fetch failed:', err);
              return [] as UnifiedMarketEvent[];
            })
        );
      }

      // 等待所有请求完成
      const results = await Promise.all(fetchPromises);

      // 合并所有来源的市场
      const allMarkets: UnifiedMarketEvent[] = results.flat();

      // 统计各来源的市场数量
      const polyCount = allMarkets.filter(m => m.source === 'POLYMARKET').length;
      const kalshiCount = allMarkets.filter(m => m.source === 'KALSHI').length;
      console.log(`[MarketService] Sources breakdown - Polymarket: ${polyCount}, Kalshi: ${kalshiCount}`);

      // 按交易量排序（降序）
      allMarkets.sort((a, b) => (b.volume || 0) - (a.volume || 0));

      console.log(`[MarketService] Fetched ${allMarkets.length} markets from all sources`);

      // 如果是第一页且无过滤，更新缓存
      if (offset === 0 && !sourceFilter) {
        this.cache = allMarkets;
        this.lastFetchTime = now;
      }

      return allMarkets;
    } catch (error) {
      console.error('Error in MarketService:', error);
      // 发生错误时如果是第一页请求，尝试返回缓存
      if (offset === 0) return this.cache;
      return [];
    }
  }

  /**
   * Get market by ID from cache
   */
  getMarketById(id: string): UnifiedMarketEvent | undefined {
    return this.cache.find(m => m.id === id);
  }

  /**
   * Get markets filtered by source
   */
  getMarketsBySource(source: MarketSource): UnifiedMarketEvent[] {
    return this.cache.filter(m => m.source === source);
  }

  /**
   * Get statistics about cached markets
   */
  getCacheStats(): { total: number; bySource: Record<string, number> } {
    const bySource: Record<string, number> = {};
    for (const market of this.cache) {
      bySource[market.source] = (bySource[market.source] || 0) + 1;
    }
    return { total: this.cache.length, bySource };
  }
}

export const marketService = new MarketService();
