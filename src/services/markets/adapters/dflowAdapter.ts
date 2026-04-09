import { UnifiedMarketEvent, MarketOutcome } from '../types';

// 获取 API 基础 URL
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3002/api';
// @ts-ignore - Vite 环境变量类型定义问题
const isDev = import.meta.env.DEV;

// DFlow API 路由
// 开发环境和生产环境都通过后端代理访问
// 这样确保 API key 只在后端使用，不暴露给客户端
// 默认: http://localhost:3002/api/dflow/markets-api
const BACKEND_URL = isDev ? 'http://localhost:3002/api' : API_BASE_URL;
const DFLOW_API_URL = `${BACKEND_URL}/dflow/markets-api`;

// 构建请求 headers
// 注意: API key 不在客户端暴露，由后端代理添加 x-api-key header
const getHeaders = (): HeadersInit => {
  return {
    'Content-Type': 'application/json',
  };
};

// DFlow Market 数据结构 (来自 /markets API - 有价格数据)
interface DFlowMarket {
  ticker: string;
  eventTicker: string;
  title: string;
  subtitle?: string;
  yesSubTitle?: string;
  noSubTitle?: string;
  marketType: string;
  status: string;
  openTime: number;
  closeTime: number;
  expirationTime?: number;
  volume: number;
  openInterest?: number;
  result?: string;
  yesBid?: string | null;
  yesAsk?: string | null;
  noBid?: string | null;
  noAsk?: string | null;
  rulesPrimary?: string;
  rulesSecondary?: string;
  accounts?: Record<string, {
    marketLedger?: string;
    yesMint?: string;
    noMint?: string;
  }>;
}

// DFlow Event 数据结构 (来自 /events API)
interface DFlowEvent {
  ticker: string;
  seriesTicker: string;
  strikeDate?: number | null;
  title: string;
  subtitle?: string;
  imageUrl?: string;
  volume: number;
  volume24h?: number;
  liquidity?: number;
  openInterest?: number;
  competition?: string;
  competitionScope?: string;
}

interface DFlowMarketsResponse {
  markets: DFlowMarket[];
  cursor?: string;
}

interface DFlowEventsResponse {
  events: DFlowEvent[];
  cursor?: number;
}

// 扩展 MarketOutcome 以支持每个选项的 YES/NO 价格
interface MultiOptionOutcome extends MarketOutcome {
  yesPrice: number;
  noPrice: number;
  yesBid?: number;
  yesAsk?: number;
  noBid?: number;
  noAsk?: number;
  marketTicker: string; // 原始市场 ticker
}

export class DFlowAdapter {
  private eventsCache: Map<string, DFlowEvent> = new Map();
  private eventsCacheTime: number = 0;
  private EVENTS_CACHE_DURATION = 5 * 60 * 1000;

  /**
   * Fetch active markets from DFlow API, grouped by event
   */
  async fetchMarkets(limit: number = 20, offset: number = 0): Promise<UnifiedMarketEvent[]> {
    const apiLimit = Math.min(limit * 3, 200); // 获取更多以确保分组后有足够的事件
    console.log(`[DFlowAdapter] Fetching active markets from: ${DFLOW_API_URL} (limit=${apiLimit})`);

    try {
      const response = await fetch(
        `${DFLOW_API_URL}/markets?status=active&limit=${apiLimit}`,
        { headers: getHeaders() }
      );

      if (!response.ok) {
        throw new Error(`DFlow API error: ${response.status} ${response.statusText}`);
      }

      const data: DFlowMarketsResponse = await response.json();

      if (!data.markets || !Array.isArray(data.markets)) {
        console.warn('[DFlowAdapter] Invalid response format, no markets array');
        return [];
      }

      // 预加载 events 缓存
      await this.preloadEventsCache();

      // 过滤活跃市场
      const activeMarkets = data.markets.filter(market => {
        const isActive = market.status === 'active';
        const hasVolume = market.volume > 0;
        const hasTitle = market.ticker && market.title;
        return isActive && hasVolume && hasTitle;
      });

      // 按 eventTicker 分组市场
      const groupedByEvent = this.groupMarketsByEvent(activeMarkets);

      console.log(`[DFlowAdapter] Grouped ${activeMarkets.length} markets into ${groupedByEvent.length} events`);

      // 返回请求数量的事件
      return groupedByEvent.slice(0, limit);
    } catch (error) {
      console.error('[DFlowAdapter] Failed to fetch DFlow markets:', error);
      return [];
    }
  }

  /**
   * 将市场按 eventTicker 分组，生成多选项事件
   */
  private groupMarketsByEvent(markets: DFlowMarket[]): UnifiedMarketEvent[] {
    // 按 eventTicker 分组
    const eventGroups = new Map<string, DFlowMarket[]>();

    for (const market of markets) {
      const eventTicker = market.eventTicker || market.ticker;
      if (!eventGroups.has(eventTicker)) {
        eventGroups.set(eventTicker, []);
      }
      eventGroups.get(eventTicker)!.push(market);
    }

    // 将每组转换为 UnifiedMarketEvent
    const events: UnifiedMarketEvent[] = [];

    for (const [eventTicker, groupMarkets] of eventGroups) {
      const event = this.createGroupedEvent(eventTicker, groupMarkets);
      if (event) {
        events.push(event);
      }
    }

    // 按交易量排序
    events.sort((a, b) => (b.volume || 0) - (a.volume || 0));

    return events;
  }

  /**
   * 从一组市场创建一个多选项事件
   */
  private createGroupedEvent(eventTicker: string, markets: DFlowMarket[]): UnifiedMarketEvent | null {
    if (markets.length === 0) return null;

    // 使用第一个市场的基本信息
    const firstMarket = markets[0];

    // 从 events 缓存获取事件信息
    const eventData = this.eventsCache.get(eventTicker);

    // 构建事件标题 - 优先使用 events API 的标题
    let eventTitle = eventData?.title || '';
    if (!eventTitle) {
      // 从市场标题中提取事件标题
      // 例如 "Denver at Kansas City Winner?" -> "Denver at Kansas City"
      eventTitle = firstMarket.title.replace(/\s*(Winner\??|win\??|\?)$/i, '').trim();
    }

    // 计算总交易量
    const totalVolume = markets.reduce((sum, m) => sum + m.volume, 0) / 100;

    // 获取最晚的结束时间
    const latestCloseTime = Math.max(...markets.map(m => m.closeTime || 0));
    const endDate = latestCloseTime > 0
      ? new Date(latestCloseTime * 1000).toISOString()
      : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    // 构建多选项 outcomes - 每个市场是一个选项
    const outcomes: MultiOptionOutcome[] = markets.map(market => {
      // 解析价格
      const yesBid = market.yesBid ? parseFloat(market.yesBid) : null;
      const yesAsk = market.yesAsk ? parseFloat(market.yesAsk) : null;
      const noBid = market.noBid ? parseFloat(market.noBid) : null;
      const noAsk = market.noAsk ? parseFloat(market.noAsk) : null;

      // 计算 YES 价格
      let yesPrice = 0.5;
      if (yesBid !== null && yesAsk !== null) {
        yesPrice = (yesBid + yesAsk) / 2;
      } else if (yesBid !== null) {
        yesPrice = yesBid;
      } else if (yesAsk !== null) {
        yesPrice = yesAsk;
      }

      // 计算 NO 价格
      let noPrice = 1 - yesPrice;
      if (noBid !== null && noAsk !== null) {
        noPrice = (noBid + noAsk) / 2;
      } else if (noBid !== null) {
        noPrice = noBid;
      } else if (noAsk !== null) {
        noPrice = noAsk;
      }

      // 获取选项名称 - 使用 yesSubTitle 或从标题提取
      let optionName = market.yesSubTitle || '';
      if (!optionName) {
        // 尝试从标题中提取选项名称
        // 例如 "Will Kansas City win?" -> "Kansas City"
        const match = market.title.match(/^(?:Will\s+)?(.+?)(?:\s+win|\s+Winner|\?)?\??$/i);
        optionName = match ? match[1].trim() : market.title;
      }

      // Use USDC account specifically (not CASH or other stablecoins)
      const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
      const usdcAccount = market.accounts?.[USDC_MINT];

      return {
        id: market.ticker,
        name: optionName,
        price: yesPrice,
        probability: yesPrice,
        tokenId: usdcAccount?.yesMint,
        yesPrice: yesPrice,
        noPrice: noPrice,
        yesBid: yesBid ?? undefined,
        yesAsk: yesAsk ?? undefined,
        noBid: noBid ?? undefined,
        noAsk: noAsk ?? undefined,
        marketTicker: market.ticker
      };
    });

    // 按 YES 价格排序选项（最高概率在前）
    outcomes.sort((a, b) => b.yesPrice - a.yesPrice);

    // 获取分类
    const category = this.mapCategory(eventData?.competition || eventTicker);

    // 计算整体 yesPrice/noPrice（使用第一个选项，即最高概率的）
    const topOutcome = outcomes[0];

    return {
      id: eventTicker,
      source: 'KALSHI',
      sourceUrl: `https://kalshi.com/event/${eventTicker}`,
      title: eventTitle,
      description: eventData?.subtitle || firstMarket.subtitle || '',
      category: category,
      imageUrl: eventData?.imageUrl,
      outcomes: outcomes,
      volume: totalVolume,
      volume24h: eventData?.volume24h ? eventData.volume24h / 100 : undefined,
      liquidity: eventData?.liquidity ? eventData.liquidity / 100 : undefined,
      endDate: endDate,
      active: true,
      closed: false,
      yesPrice: topOutcome?.yesPrice ?? 0.5,
      noPrice: topOutcome?.noPrice ?? 0.5,
      raw: { eventTicker, markets, eventData }
    };
  }

  /**
   * 预加载 events 数据
   */
  private async preloadEventsCache(): Promise<void> {
    const now = Date.now();
    if (this.eventsCache.size > 0 && now - this.eventsCacheTime < this.EVENTS_CACHE_DURATION) {
      return;
    }

    try {
      const response = await fetch(`${DFLOW_API_URL}/events?limit=200`, { headers: getHeaders() });
      if (response.ok) {
        const data: DFlowEventsResponse = await response.json();
        if (data.events) {
          this.eventsCache.clear();
          for (const event of data.events) {
            this.eventsCache.set(event.ticker, event);
          }
          this.eventsCacheTime = now;
          console.log(`[DFlowAdapter] Cached ${this.eventsCache.size} events`);
        }
      }
    } catch (error) {
      console.warn('[DFlowAdapter] Failed to preload events cache:', error);
    }
  }

  /**
   * Fetch a single event by ticker
   */
  async fetchMarketById(ticker: string): Promise<UnifiedMarketEvent | null> {
    console.log(`[DFlowAdapter] Fetching event by ticker: ${ticker}`);

    try {
      // 先预加载缓存
      await this.preloadEventsCache();

      // 获取所有活跃市场
      const response = await fetch(`${DFLOW_API_URL}/markets?status=active&limit=200`, { headers: getHeaders() });
      if (!response.ok) return null;

      const data: DFlowMarketsResponse = await response.json();

      // 查找属于该事件的所有市场
      const eventMarkets = data.markets?.filter(m =>
        m.eventTicker === ticker || m.ticker === ticker
      ) || [];

      if (eventMarkets.length > 0) {
        return this.createGroupedEvent(ticker, eventMarkets);
      }

      // 如果没有找到市场，尝试从 events API 获取
      const eventResponse = await fetch(`${DFLOW_API_URL}/event/${ticker}`, { headers: getHeaders() });
      if (eventResponse.ok) {
        const eventData = await eventResponse.json();
        if (eventData.ticker) {
          return this.normalizeEventToMarket(eventData);
        }
      }

      return null;
    } catch (error) {
      console.error(`[DFlowAdapter] Error fetching event ${ticker}:`, error);
      return null;
    }
  }

  /**
   * Normalize DFlow Event to UnifiedMarketEvent (fallback, no real prices)
   */
  private normalizeEventToMarket(event: DFlowEvent): UnifiedMarketEvent {
    const category = this.mapCategory(event.competition || event.seriesTicker || '');

    const outcomes: MarketOutcome[] = [
      {
        id: `${event.ticker}-yes`,
        name: 'Yes',
        price: 0.5,
        probability: 0.5
      },
      {
        id: `${event.ticker}-no`,
        name: 'No',
        price: 0.5,
        probability: 0.5
      }
    ];

    const endDate = event.strikeDate
      ? new Date(event.strikeDate * 1000).toISOString()
      : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    return {
      id: event.ticker,
      source: 'KALSHI',
      sourceUrl: `https://kalshi.com/event/${event.ticker}`,
      title: event.title,
      description: event.subtitle || '',
      category: category,
      imageUrl: event.imageUrl,
      outcomes: outcomes,
      volume: event.volume / 100,
      volume24h: event.volume24h ? event.volume24h / 100 : undefined,
      endDate: endDate,
      liquidity: event.liquidity ? event.liquidity / 100 : undefined,
      active: true,
      closed: false,
      yesPrice: 0.5,
      noPrice: 0.5,
      raw: event
    };
  }

  /**
   * Map category
   */
  private mapCategory(rawCategory: string): string {
    const lowerCategory = rawCategory.toLowerCase();

    if (['nfl', 'nba', 'mlb', 'nhl', 'mls', 'boxing', 'ufc', 'mma', 'tennis', 'golf', 'soccer', 'football', 'game', 'ncaa'].some(s => lowerCategory.includes(s))) {
      return 'Sports';
    }
    if (['pres', 'president', 'election', 'senate', 'congress', 'vote', 'governor', 'mayor', 'trump', 'biden'].some(s => lowerCategory.includes(s))) {
      return 'Politics';
    }
    if (['btc', 'eth', 'bitcoin', 'ethereum', 'crypto', 'sol', 'solana'].some(s => lowerCategory.includes(s))) {
      return 'Crypto';
    }
    if (['fed', 'rate', 'inflation', 'gdp', 'unemployment', 'cpi', 'fomc', 'decision'].some(s => lowerCategory.includes(s))) {
      return 'Economy';
    }
    if (['tech', 'ai', 'openai', 'google', 'apple', 'microsoft', 'nvidia'].some(s => lowerCategory.includes(s))) {
      return 'Technology';
    }
    if (['weather', 'temperature', 'hurricane', 'climate'].some(s => lowerCategory.includes(s))) {
      return 'Science';
    }
    if (['oscar', 'emmy', 'grammy', 'movie', 'music', 'celebrity'].some(s => lowerCategory.includes(s))) {
      return 'Pop Culture';
    }

    return 'Other';
  }
}
