import { UnifiedMarketEvent, MarketOutcome } from '../types';

// 获取 API 基础 URL
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3002/api';
// @ts-ignore - Vite 环境变量类型定义问题
const isDev = import.meta.env.DEV;

// 开发环境: /gamma-api 通过 Vite 代理到 https://gamma-api.polymarket.com
// 生产环境: 通过后端代理 /api/polymarket/gamma-api 避免 CORS 问题
const POLY_API_URL = isDev ? '/gamma-api' : `${API_BASE_URL}/polymarket/gamma-api`;
// CLOB API 支持按 condition_id 精确查询（Gamma API 的 condition_id 参数无效）
const CLOB_API_URL = isDev ? '/clob-api' : `${API_BASE_URL}/polymarket/clob-api`;

interface PolyToken {
  token_id: string;
  outcome: string;
  price: number;
  winner: boolean;
}

// 兼容 Polymarket API 的多种返回格式
interface PolyMarket {
  // 新版 API 字段 (camelCase)
  conditionId?: string;
  endDate?: string;
  
  // 旧版 API 字段 (snake_case)
  condition_id?: string;
  end_date_iso?: string;

  // 通用字段
  question: string;
  description: string;
  slug: string;
  outcomes?: string; // JSON字符串: "[\"Yes\", \"No\"]"
  outcomePrices?: string; // JSON字符串: "[\"0.11\", \"0.89\"]"
  clobTokenIds?: string; // JSON字符串: "[\"123456...\", \"654321...\"]" - 这是CLOB API需要的实际token ID
  tokens?: PolyToken[]; // 旧版API可能有这个
  volume: string | number;
  volume24hr?: string | number; // 24小时交易量
  liquidity: string | number;
  tags?: string[];
  image?: string;
  active: boolean;
  closed: boolean;
  competitive?: string | number; // 竞争等级：daily, weekly, monthly
  
  // 订单簿相关
  bestBid?: number;
  bestAsk?: number;
  spread?: number;
  
  // 价格变化
  oneDayPriceChange?: number;
  oneHourPriceChange?: number;
  oneWeekPriceChange?: number;
  oneMonthPriceChange?: number;

  // 订单限制
  orderMinSize?: number;          // 最小订单大小 (股数)
  orderPriceMinTickSize?: number; // 最小价格步长

  // 事件信息（嵌套）
  events?: Array<{
    id: string;
    slug: string;
    title: string;
    ticker?: string;
  }>;
}

export class PolymarketAdapter {
  /**
   * Fetch markets by their condition IDs using CLOB API
   * Note: Gamma API's condition_id parameter is broken, so we use CLOB API instead
   */
  async fetchMarketsByIds(conditionIds: string[]): Promise<UnifiedMarketEvent[]> {
    if (conditionIds.length === 0) return [];
    
    console.log(`[PolymarketAdapter] Fetching ${conditionIds.length} markets by IDs (via CLOB API)`);
    
    try {
      // Use CLOB API which properly supports condition_id lookup
      const promises = conditionIds.map(async (id) => {
        try {
          const response = await fetch(`${CLOB_API_URL}/markets/${id}`);
          if (!response.ok) {
            console.warn(`[PolymarketAdapter] Failed to fetch market ${id}: ${response.status}`);
            return null;
          }
          const data = await response.json();
          // CLOB API returns single market object, not array
          return data.condition_id ? { ...data, _fromClob: true } : null;
        } catch (error) {
          console.warn(`[PolymarketAdapter] Error fetching market ${id}:`, error);
          return null;
        }
      });
      
      const results = await Promise.all(promises);
      const validMarkets = results.filter((m): m is any => m !== null);
      
      console.log(`[PolymarketAdapter] Successfully fetched ${validMarkets.length}/${conditionIds.length} markets by ID`);
      
      return validMarkets.map(item => this.normalizeFromClob(item));
    } catch (error) {
      console.error('[PolymarketAdapter] Failed to fetch markets by IDs:', error);
      return [];
    }
  }

  /**
   * Normalize CLOB API response to UnifiedMarketEvent format
   */
  private normalizeFromClob(raw: any): UnifiedMarketEvent {
    const id = raw.condition_id;
    const endDate = raw.end_date_iso || new Date().toISOString();
    
    // Parse tokens for outcomes
    const outcomes: MarketOutcome[] = (raw.tokens || []).map((token: any) => ({
      id: token.token_id,
      name: token.outcome,
      price: token.price || 0,
      probability: token.price || 0
    }));

    // Get Yes/No prices
    let yesPrice = 0.5;
    let noPrice = 0.5;
    const yesToken = outcomes.find(o => o.name === 'Yes');
    const noToken = outcomes.find(o => o.name === 'No');
    if (yesToken && noToken) {
      yesPrice = yesToken.price;
      noPrice = noToken.price;
    } else if (outcomes.length >= 2) {
      yesPrice = outcomes[0].price;
      noPrice = outcomes[1].price;
    }

    // Extract category from tags - 返回英文标准化分类
    let category = 'Other';
    if (raw.tags && Array.isArray(raw.tags) && raw.tags.length > 0) {
      category = this.normalizeCategory(raw.tags[0]);
    }

    return {
      id: id,
      source: 'POLYMARKET',
      sourceUrl: `https://polymarket.com/event/${raw.market_slug || id}`,
      title: raw.question || 'Unknown Market',
      description: raw.description || '',
      category: category,
      imageUrl: raw.image || raw.icon,
      outcomes: outcomes,
      volume: 0, // CLOB API doesn't return volume
      endDate: endDate,
      liquidity: 0,
      active: raw.active,
      closed: raw.closed,
      orderMinSize: raw.minimum_order_size,
      orderPriceMinTickSize: raw.minimum_tick_size,
      yesPrice: yesPrice,
      noPrice: noPrice,
      raw: raw
    };
  }

  async fetchMarkets(limit: number = 20, offset: number = 0): Promise<UnifiedMarketEvent[]> {
    console.log(`[PolymarketAdapter] Fetching from: ${POLY_API_URL} (limit=${limit}, offset=${offset})`);
    try {
      const response = await fetch(
        `${POLY_API_URL}/markets?active=true&closed=false&limit=${limit}&offset=${offset}&order=volume&ascending=false`
      );
      
      if (!response.ok) {
        throw new Error(`Polymarket API error: ${response.status} ${response.statusText}`);
      }

      const data: PolyMarket[] = await response.json();
      
      // 过滤掉无效数据
      const validItems = data.filter(item => {
        const id = item.conditionId || item.condition_id;
        return id && item.question; 
      });

      console.log(`[PolymarketAdapter] Successfully fetched ${validItems.length} markets`);
      
      return validItems.map(item => this.normalize(item));
    } catch (error) {
      console.error('[PolymarketAdapter] Failed to fetch Polymarket events:', error);
      return [];
    }
  }

  private normalize(raw: PolyMarket): UnifiedMarketEvent {
    // 兼容字段名
    const id = raw.conditionId || raw.condition_id || 'unknown_id';
    const endDate = raw.endDate || raw.end_date_iso || new Date().toISOString();
    
    // 解析 outcomes、outcomePrices 和 clobTokenIds（它们是JSON字符串）
    let parsedOutcomes: string[] = [];
    let parsedPrices: string[] = [];
    let parsedClobTokenIds: string[] = [];
    
    try {
      if (typeof raw.outcomes === 'string') {
        parsedOutcomes = JSON.parse(raw.outcomes);
      }
      if (typeof raw.outcomePrices === 'string') {
        parsedPrices = JSON.parse(raw.outcomePrices);
      }
      // 解析 clobTokenIds - 这是 CLOB API 需要的实际 token ID
      if (typeof raw.clobTokenIds === 'string') {
        parsedClobTokenIds = JSON.parse(raw.clobTokenIds);
      }
    } catch (e) {
      console.error(`[PolymarketAdapter] Failed to parse outcomes/prices/tokenIds for: ${raw.question}`, e);
    }
    
    // 如果没有 clobTokenIds，尝试从 tokens 数组获取
    if (parsedClobTokenIds.length === 0 && raw.tokens && Array.isArray(raw.tokens)) {
      parsedClobTokenIds = raw.tokens.map(t => t.token_id);
    }
    
    // 构建 outcomes 数组 - 使用实际的 CLOB token ID
    const outcomes: MarketOutcome[] = parsedOutcomes.map((name, index) => ({
      // 优先使用 clobTokenIds，如果没有则回退到 conditionId-index 格式
      id: parsedClobTokenIds[index] || `${id}-${index}`,
      name: name,
      price: Number(parsedPrices[index]) || 0,
      probability: Number(parsedPrices[index]) || 0
    }));

    // 获取价格 - 支持 Yes/No 和其他格式（如体育赛事的球队名）
    let displayYesPrice = 0.5;
    let displayNoPrice = 0.5;
    
    if (outcomes.length >= 2) {
      // 方案1：标准 Yes/No 市场
      const yesToken = outcomes.find(o => o.name === 'Yes');
      const noToken = outcomes.find(o => o.name === 'No');
      
      if (yesToken && noToken) {
        displayYesPrice = yesToken.price;
        displayNoPrice = noToken.price;
      } else {
        // 方案2：其他格式（如体育赛事："Magic" vs "Celtics"）
        // 取第一个选项作为 Yes，第二个作为 No
        displayYesPrice = outcomes[0].price;
        displayNoPrice = outcomes[1].price;
      }
    }

    // 智能分类提取 (Priority: Tags -> Ticker -> Question Analysis -> Default)
    // 注意：返回英文标准化的 category，前端负责翻译显示
    let category = 'Other';

    // 1. 尝试从 Tags 提取（Polymarket API 目前返回 null，但保留逻辑以备将来）
    if (raw.tags && Array.isArray(raw.tags) && raw.tags.length > 0) {
      const mainCategories = [
        'Politics', 'Crypto', 'Cryptocurrency', 'Sports', 'Pop Culture',
        'Business', 'Science', 'Technology', 'Economy', 'Stock Market',
        'Esports', 'Gaming', 'Finance'
      ];
      const foundCategory = raw.tags.find(tag => {
        if (typeof tag !== 'string') return false;
        return mainCategories.some(c => c.toLowerCase() === tag.toLowerCase());
      });
      let rawCategory = foundCategory || raw.tags[0];
      if (typeof rawCategory === 'string') {
        category = this.normalizeCategory(rawCategory);
      }
    }

    // 2. 如果没有从 Tags 获取到有效分类，尝试从 ticker 和 question 组合分析
    if (category === 'Other') {
      // 获取 ticker（来自 events[0].ticker）
      const ticker = raw.events?.[0]?.ticker?.toLowerCase() || '';
      const q = (raw.question || '').toLowerCase();
      const combined = `${ticker} ${q}`;

      // 加密货币关键词（扩展列表）
      const cryptoPatterns = [
        'bitcoin', 'ethereum', 'solana', 'crypto', 'btc', 'eth', 'token',
        'xrp', 'ripple', 'doge', 'dogecoin', 'cardano', 'ada', 'bnb',
        'polygon', 'matic', 'avalanche', 'avax', 'polkadot', 'dot',
        'chainlink', 'link', 'uniswap', 'aave', 'defi', 'nft', 'web3',
        'binance', 'coinbase', 'usdt', 'usdc', 'stablecoin', 'memecoin',
        'altcoin', 'blockchain', 'layer-2', 'l2', 'sui', 'apt', 'aptos',
        'ton', 'pepe', 'shib', 'arbitrum', 'optimism'
      ];

      // 体育关键词（扩展列表）
      const sportsPatterns = [
        'nba', 'nfl', 'nhl', 'mlb', 'mls', 'football', 'soccer', 'basketball',
        'baseball', 'hockey', 'tennis', 'golf', 'f1', 'formula 1', 'formula-1',
        'championship', 'world series', 'super bowl', 'playoffs', 'finals',
        'champions league', 'uefa', 'premier league', 'la liga', 'serie a',
        'bundesliga', 'world cup', 'olympics', 'mvp', 'ppg', 'sacks',
        'touchdown', 'home run', 'calder', 'trophy', 'coach of the year',
        'offensive player', 'defensive player', 'rookie', 'tottenham',
        'liverpool', 'manchester', 'arsenal', 'chelsea', 'real madrid',
        'barcelona', 'verstappen', 'red bull racing'
      ];

      // 电竞关键词
      const esportsPatterns = [
        'esports', 'e-sports', 'gaming', 'lol', 'league of legends',
        'dota', 'counter-strike', 'cs2', 'csgo', 'valorant', 'overwatch',
        'fortnite', 'pubg', 'apex legends', 'twitch', 'streamer'
      ];

      // 政治关键词
      const politicsPatterns = [
        'election', 'trump', 'biden', 'harris', 'vote', 'poll', 'president',
        'congress', 'senate', 'governor', 'democrat', 'republican', 'primary',
        'nominee', 'white house', 'cabinet', 'impeach', 'legislation',
        'shutdown', 'government', 'political', 'panama canal', 'syria',
        'ukraine', 'russia', 'china', 'war', 'military', 'strike'
      ];

      // 流行文化关键词
      const popCulturePatterns = [
        'movie', 'film', 'album', 'grammy', 'oscar', 'oscars', 'academy award',
        'golden globe', 'critics choice', 'emmy', 'celebrity', 'taylor swift',
        'drake', 'beyonce', 'kanye', 'kardashian', 'hollywood', 'netflix',
        'disney', 'marvel', 'dc', 'box office', 'streaming', 'spotify',
        'billboard', 'mtv', 'vma', 'best actor', 'best actress', 'best director',
        'best picture', 'visual effects', 'television', 'tv series', 'joe rogan'
      ];

      // 经济关键词
      const economyPatterns = [
        'fed', 'federal reserve', 'rate cut', 'rate hike', 'interest rate',
        'inflation', 'gdp', 'recession', 'economy', 'economic', 'unemployment',
        'jobs report', 'cpi', 'ppi', 'treasury', 'yield', 'bond', 'eggs'
      ];

      // 股市关键词
      const stocksPatterns = [
        'stock', 'stocks', 'share', 'nasdaq', 's&p', 'dow jones', 'nyse',
        'market cap', 'ipo', 'earnings', 'quarterly', 'dividend'
      ];

      // 科技关键词
      const techPatterns = [
        'ai', 'artificial intelligence', 'chatgpt', 'openai', 'google',
        'apple', 'microsoft', 'meta', 'amazon', 'nvidia', 'technology',
        'tech', 'software', 'hardware', 'startup', 'silicon valley',
        'elon musk', 'spacex', 'neuralink', 'tesla'
      ];

      // 商业关键词
      const businessPatterns = [
        'company', 'ceo', 'merger', 'acquisition', 'deal', 'revenue',
        'profit', 'bankruptcy', 'layoff', 'corporate'
      ];

      // 科学关键词
      const sciencePatterns = [
        'climate', 'temperature', 'research', 'study', 'discovery',
        'vaccine', 'nasa', 'space', 'mars', 'moon', 'asteroid'
      ];

      // 按优先级匹配
      if (cryptoPatterns.some(p => combined.includes(p))) {
        category = 'Crypto';
      } else if (esportsPatterns.some(p => combined.includes(p))) {
        category = 'Esports';
      } else if (sportsPatterns.some(p => combined.includes(p))) {
        category = 'Sports';
      } else if (popCulturePatterns.some(p => combined.includes(p))) {
        category = 'Pop Culture';
      } else if (politicsPatterns.some(p => combined.includes(p))) {
        category = 'Politics';
      } else if (economyPatterns.some(p => combined.includes(p))) {
        category = 'Economy';
      } else if (stocksPatterns.some(p => combined.includes(p))) {
        category = 'Stocks';
      } else if (techPatterns.some(p => combined.includes(p))) {
        category = 'Technology';
      } else if (businessPatterns.some(p => combined.includes(p))) {
        category = 'Business';
      } else if (sciencePatterns.some(p => combined.includes(p))) {
        category = 'Science';
      }
    }

    return {
      id: id,
      conditionId: id, // Polymarket condition ID (用于获取 K 线数据)
      source: 'POLYMARKET',
      sourceUrl: `https://polymarket.com/event/${raw.events?.[0]?.slug || raw.slug}`,
      title: raw.question,
      description: raw.description,
      category: category,
      imageUrl: raw.image,
      outcomes: outcomes,
      volume: Number(raw.volume) || 0,
      volume24h: raw.volume24hr ? Number(raw.volume24hr) : undefined,
      endDate: endDate,
      liquidity: Number(raw.liquidity) || 0,
      active: raw.active,
      closed: raw.closed,
      frequency: typeof raw.competitive === 'string' ? raw.competitive : undefined,

      // 订单簿数据
      bestBid: raw.bestBid ? Number(raw.bestBid) : undefined,
      bestAsk: raw.bestAsk ? Number(raw.bestAsk) : undefined,
      spread: raw.spread ? Number(raw.spread) : undefined,

      // 价格变化
      oneDayPriceChange: raw.oneDayPriceChange ? Number(raw.oneDayPriceChange) : undefined,
      oneHourPriceChange: raw.oneHourPriceChange ? Number(raw.oneHourPriceChange) : undefined,

      // 订单限制 - 从 API 获取每个市场的实际值
      orderMinSize: raw.orderMinSize ? Number(raw.orderMinSize) : undefined,
      orderPriceMinTickSize: raw.orderPriceMinTickSize ? Number(raw.orderPriceMinTickSize) : undefined,

      yesPrice: displayYesPrice,
      noPrice: displayNoPrice,
      raw: raw
    };
  }

  /**
   * 标准化分类名称为英文标准格式
   * 用于数据层，前端负责翻译显示
   */
  private normalizeCategory(rawCategory: string): string {
    const normalizations: Record<string, string> = {
      'politics': 'Politics',
      'political': 'Politics',
      'election': 'Politics',
      'global election': 'Politics',
      'crypto': 'Crypto',
      'cryptocurrency': 'Crypto',
      'bitcoin': 'Crypto',
      'ethereum': 'Crypto',
      'blockchain': 'Crypto',
      'sports': 'Sports',
      'nfl': 'Sports',
      'nba': 'Sports',
      'soccer': 'Sports',
      'football': 'Sports',
      'basketball': 'Sports',
      'baseball': 'Sports',
      'pop culture': 'Pop Culture',
      'popculture': 'Pop Culture',
      'entertainment': 'Pop Culture',
      'celebrity': 'Pop Culture',
      'movie': 'Pop Culture',
      'music': 'Pop Culture',
      'business': 'Business',
      'corporate': 'Business',
      'company': 'Business',
      'finance': 'Business',
      'science': 'Science',
      'research': 'Science',
      'space': 'Science',
      'climate': 'Science',
      'technology': 'Technology',
      'tech': 'Technology',
      'ai': 'Technology',
      'software': 'Technology',
      'economy': 'Economy',
      'economic': 'Economy',
      'economics': 'Economy',
      'fed': 'Economy',
      'interest': 'Economy',
      'stock': 'Stocks',
      'stocks': 'Stocks',
      'stock market': 'Stocks',
      'market': 'Stocks',
      'trading': 'Stocks',
      'esports': 'Esports',
      'e-sports': 'Esports',
      'gaming': 'Esports',
      'game': 'Esports',
      'middle east': 'Politics',
      'mentions': 'Other'
    };

    const lowerKey = rawCategory.toLowerCase();
    return normalizations[lowerKey] || rawCategory.charAt(0).toUpperCase() + rawCategory.slice(1);
  }
}
