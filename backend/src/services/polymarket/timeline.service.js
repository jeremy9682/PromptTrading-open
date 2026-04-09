/**
 * Timeline Service
 * 
 * 提供事件时间线功能:
 * 1. 价格异动检测 (Z-score based)
 * 2. 新闻-异动时间窗口匹配
 * 3. 聚合输出: K线 + 事件列表 + 异动点
 */

import { fetchDomeCandlesticks, fetchGoogleNewsData } from './free-data.service.js';

const POLYMARKET_CLOB_API = 'https://clob.polymarket.com';

// ============================================
// CLOB API 价格历史（主数据源）
// ============================================

/**
 * 从 Polymarket CLOB API 获取价格历史
 * @param {string} tokenId - YES token 的 clobTokenId
 * @param {object} options - 配置
 * @returns {Promise<Array>} K 线格式的价格数据
 */
async function fetchClobPriceHistory(tokenId, options = {}) {
  const { period = '7d' } = options;

  if (!tokenId) {
    console.warn('[Timeline/CLOB] No tokenId provided');
    return [];
  }

  // interval 参数: max (全部), 1d, 1w, 1m (月)
  // fidelity: 数据点粒度（分钟数）1=1min, 5=5min, 60=1h, 1440=1d
  const configMap = {
    '24h': { interval: '1d', fidelity: 5 },     // 24h → 5min 粒度
    '7d':  { interval: '1w', fidelity: 60 },     // 7d  → 1h 粒度
    '30d': { interval: '1m', fidelity: 360 },    // 30d → 6h 粒度
  };

  const cfg = configMap[period] || configMap['7d'];

  const url = `${POLYMARKET_CLOB_API}/prices-history?market=${tokenId}&interval=${cfg.interval}&fidelity=${cfg.fidelity}`;
  console.log(`[Timeline/CLOB] Fetching price history: ${url.substring(0, 100)}...`);

  try {
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'PromptTrading/1.0'
      }
    });

    if (!response.ok) {
      console.error(`[Timeline/CLOB] API error: ${response.status}`);
      return [];
    }

    const data = await response.json();
    const history = data.history || [];

    if (history.length === 0) {
      console.warn('[Timeline/CLOB] Empty price history');
      return [];
    }

    // 转换为 K 线格式 (CLOB 只返回 {t, p}，我们生成伪 OHLC)
    const candles = history.map((h, i) => {
      const price = parseFloat(h.p);
      const timestamp = h.t;
      const prevPrice = i > 0 ? parseFloat(history[i - 1].p) : price;

      return {
        timestamp,
        time: new Date(timestamp * 1000).toISOString(),
        open: prevPrice,
        high: Math.max(price, prevPrice),
        low: Math.min(price, prevPrice),
        close: price,
        volume: 0 // CLOB API 不提供成交量
      };
    });

    console.log(`[Timeline/CLOB] Got ${candles.length} price points, range: ${(candles[0]?.close * 100).toFixed(1)}¢ → ${(candles[candles.length - 1]?.close * 100).toFixed(1)}¢`);
    return candles;
  } catch (error) {
    console.error('[Timeline/CLOB] Fetch error:', error.message);
    return [];
  }
}

// ============================================
// 异动检测
// ============================================

/**
 * 检测 K 线价格异动点
 * 使用 Z-score + 成交量突变双重检测
 * 
 * @param {Array} candles - K 线数据 [{timestamp, open, high, low, close, volume}]
 * @param {object} config - 检测参数
 * @returns {Array} 异动列表
 */
export function detectPriceAnomalies(candles, config = {}) {
  const {
    lookback = 12,          // 回看窗口（K线根数）
    priceZThreshold = 1.8,  // 价格变化率 Z-score 阈值
    volumeMultiple = 2.5,   // 成交量倍数阈值
    maxAnomalies = 10       // 最多返回的异动数
  } = config;

  if (!candles || candles.length < lookback + 2) {
    return [];
  }

  const anomalies = [];

  for (let i = lookback; i < candles.length; i++) {
    const window = candles.slice(i - lookback, i);
    const current = candles[i];
    const prev = candles[i - 1];

    // 跳过无效数据
    if (!prev.close || prev.close === 0 || !current.close) continue;

    // 1. 价格变化率
    const currentChange = Math.abs(current.close - prev.close) / prev.close;

    // 计算窗口内的平均变化率和标准差
    const changes = [];
    for (let j = 1; j < window.length; j++) {
      if (window[j - 1].close && window[j - 1].close > 0) {
        changes.push(Math.abs(window[j].close - window[j - 1].close) / window[j - 1].close);
      }
    }

    if (changes.length < 3) continue;

    const avgChange = changes.reduce((a, b) => a + b, 0) / changes.length;
    const stdChange = Math.sqrt(
      changes.reduce((sum, c) => sum + Math.pow(c - avgChange, 2), 0) / changes.length
    );

    const zScore = stdChange > 0 ? (currentChange - avgChange) / stdChange : 0;

    // 2. 成交量突变
    const windowVolumes = window.map(c => c.volume || 0).filter(v => v > 0);
    const avgVolume = windowVolumes.length > 0
      ? windowVolumes.reduce((a, b) => a + b, 0) / windowVolumes.length
      : 0;
    const volumeRatio = avgVolume > 0 ? (current.volume || 0) / avgVolume : 1;

    // 判断是否异动
    const isPriceAnomaly = zScore > priceZThreshold;
    const isVolumeAnomaly = volumeRatio > volumeMultiple;

    if (isPriceAnomaly || isVolumeAnomaly) {
      const priceChangePct = ((current.close - prev.close) / prev.close) * 100;
      const direction = priceChangePct > 0 ? 'up' : priceChangePct < 0 ? 'down' : 'flat';

      anomalies.push({
        timestamp: current.timestamp,
        time: current.time || new Date(current.timestamp * 1000).toISOString(),
        type: isPriceAnomaly && isVolumeAnomaly ? 'spike_with_volume'
            : isPriceAnomaly ? 'price_spike'
            : 'volume_surge',
        severity: Math.min(100, Math.round(
          (isPriceAnomaly ? zScore * 20 : 0) + (isVolumeAnomaly ? volumeRatio * 10 : 0)
        )),
        priceChange: Math.round(priceChangePct * 100) / 100,
        direction,
        volumeRatio: Math.round(volumeRatio * 10) / 10,
        zScore: Math.round(zScore * 100) / 100,
        price: current.close,
        priceBefore: prev.close
      });
    }
  }

  // 按严重度排序，取 top N
  return anomalies
    .sort((a, b) => b.severity - a.severity)
    .slice(0, maxAnomalies);
}

// ============================================
// 新闻-异动匹配
// ============================================

/**
 * 将新闻文章按时间窗口匹配到异动点
 * 
 * @param {Array} anomalies - 异动列表
 * @param {Array} articles - 新闻文章列表
 * @param {object} config - 匹配参数
 * @returns {Array} 时间线事件列表
 */
export function matchEventsToAnomalies(anomalies, articles, config = {}) {
  const {
    windowBeforeMinutes = 60,  // 异动前 N 分钟搜索新闻
    windowAfterMinutes = 15    // 异动后 N 分钟搜索新闻
  } = config;

  const events = [];
  const usedArticles = new Set();

  // 为每个异动点匹配新闻
  anomalies.forEach(anomaly => {
    const anomalyTime = anomaly.timestamp;
    const windowStart = anomalyTime - windowBeforeMinutes * 60;
    const windowEnd = anomalyTime + windowAfterMinutes * 60;

    const matched = [];
    articles.forEach((article, idx) => {
      if (usedArticles.has(idx)) return;

      const articleTime = parseArticleTimestamp(article.pubDate);
      if (!articleTime) return;

      if (articleTime >= windowStart && articleTime <= windowEnd) {
        matched.push({ article, idx, articleTime });
      }
    });

    // 如果有匹配的新闻，关联到这个异动点
    if (matched.length > 0) {
      matched.forEach(({ article, idx, articleTime }) => {
        usedArticles.add(idx);
        events.push(createTimelineEvent(article, anomaly, articleTime));
      });
    }
    // 不再创建 Algorithm 类型的纯异动卡片，原生 K 线图已经很明显
  });

  // 未匹配的新闻也加入时间线（作为独立事件）
  articles.forEach((article, idx) => {
    if (usedArticles.has(idx)) return;

    const articleTime = parseArticleTimestamp(article.pubDate);
    if (!articleTime) return;

    events.push(createTimelineEvent(article, null, articleTime));
  });

  // 按时间倒序排列（最新在前）
  return events.sort((a, b) => b.timestamp - a.timestamp);
}

/**
 * 解析新闻文章的时间戳
 */
function parseArticleTimestamp(pubDate) {
  if (!pubDate) return null;
  try {
    const date = new Date(pubDate);
    if (isNaN(date.getTime())) return null;
    return Math.floor(date.getTime() / 1000);
  } catch {
    return null;
  }
}

/**
 * 创建新闻类型的时间线事件
 */
function createTimelineEvent(article, anomaly, articleTime) {
  const sentiment = article.sentiment || analyzeSentiment(article.title);
  const direction = sentiment === 'positive' ? 'bullish' : sentiment === 'negative' ? 'bearish' : 'neutral';

  return {
    id: `news_${articleTime}_${hashString(article.title || '')}`,
    timestamp: articleTime,
    type: 'news',
    title: article.title || '',
    summary: article.description || article.title || '',
    source: {
      name: article.source || 'News',
      type: 'news',
      icon: '📰'
    },
    sourceUrl: article.link || article.url || '',
    credibility: getSourceCredibility(article.source),
    impact: {
      direction,
      magnitude: anomaly ? (anomaly.severity > 60 ? 'high' : 'medium') : 'low',
      priceChangePct: anomaly ? anomaly.priceChange : 0
    },
    relatedPricePoint: anomaly ? {
      price: anomaly.price,
      priceBefore: anomaly.priceBefore,
      priceAfter: anomaly.price
    } : null
  };
}

/**
 * 简单情绪分析
 */
function analyzeSentiment(text) {
  if (!text) return 'neutral';
  const lower = text.toLowerCase();
  const positive = ['surge', 'rise', 'win', 'lead', 'ahead', 'gain', 'success', 'boost', 'up', 'support', 'approve'];
  const negative = ['fall', 'drop', 'lose', 'behind', 'fail', 'crash', 'decline', 'slip', 'down', 'reject', 'oppose'];

  let score = 0;
  positive.forEach(w => { if (lower.includes(w)) score++; });
  negative.forEach(w => { if (lower.includes(w)) score--; });

  return score > 0 ? 'positive' : score < 0 ? 'negative' : 'neutral';
}

/**
 * 来源可信度评分
 */
function getSourceCredibility(source) {
  if (!source) return 50;
  const highCred = ['Reuters', 'AP', 'Bloomberg', 'BBC', 'CNN', 'NYT', 'Washington Post', 'The Guardian', 'Financial Times'];
  const medCred = ['Fox News', 'CNBC', 'The Hill', 'Politico', 'NBC', 'CBS', 'ABC News'];
  const src = source.toLowerCase();
  if (highCred.some(s => src.includes(s.toLowerCase()))) return 90;
  if (medCred.some(s => src.includes(s.toLowerCase()))) return 75;
  return 60;
}

/**
 * 格式化异动标题
 */
function formatAnomalyTitle(anomaly) {
  const dir = anomaly.direction === 'up' ? '↑' : anomaly.direction === 'down' ? '↓' : '→';
  const type = anomaly.type === 'volume_surge' ? 'Volume Surge'
    : anomaly.type === 'spike_with_volume' ? 'Price & Volume Spike'
    : 'Price Spike';
  return `${dir} ${type}: ${anomaly.priceChange > 0 ? '+' : ''}${anomaly.priceChange}%`;
}

/**
 * 格式化异动摘要
 */
function formatAnomalySummary(anomaly) {
  const parts = [];
  parts.push(`Price moved ${anomaly.priceChange > 0 ? '+' : ''}${anomaly.priceChange}%`);
  if (anomaly.volumeRatio > 1.5) {
    parts.push(`volume ${anomaly.volumeRatio}x average`);
  }
  parts.push(`from ${(anomaly.priceBefore * 100).toFixed(1)}¢ to ${(anomaly.price * 100).toFixed(1)}¢`);
  return parts.join(', ');
}

/**
 * 简单字符串哈希
 */
function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

// ============================================
// 主函数：获取时间线数据
// ============================================

/**
 * 获取完整的时间线数据
 * 
 * @param {string} conditionId - Polymarket condition ID
 * @param {string} eventTitle - 事件标题（用于搜索新闻）
 * @param {object} options - 配置
 * @returns {Promise<object>} TimelineResponse
 */
export async function getTimelineData(conditionId, eventTitle, options = {}) {
  const {
    period = '7d',    // '24h' | '7d' | '30d'
    interval,         // auto if not specified
    impactFilter = 'all',  // 'all' | 'high' | 'medium'
    tokenId           // YES token clobTokenId (for CLOB API)
  } = options;

  // 根据 period 计算小时数和默认 interval
  const periodConfig = {
    '24h': { hours: 24, defaultInterval: '15m' },
    '7d':  { hours: 168, defaultInterval: '1h' },
    '30d': { hours: 720, defaultInterval: '4h' }
  };

  const cfg = periodConfig[period] || periodConfig['7d'];
  const resolvedInterval = interval || cfg.defaultInterval;

  console.log(`[Timeline] Building timeline: conditionId=${conditionId?.substring(0, 20)}..., tokenId=${tokenId?.substring(0, 20) || 'none'}, period=${period}`);

  // 构建新闻查询
  const newsQuery = buildNewsQuery(eventTitle);
  console.log(`[Timeline] News query: "${newsQuery}"`);

  // 并行获取: CLOB 价格历史（主） + Dome K线（备） + 新闻
  const [clobCandles, candlestickData, newsData] = await Promise.all([
    // 主数据源: CLOB API (需要 tokenId)
    tokenId ? fetchClobPriceHistory(tokenId, { period }).catch(err => {
      console.error('[Timeline] CLOB price history error:', err.message);
      return [];
    }) : Promise.resolve([]),
    // 备选数据源: Dome API (需要 conditionId)
    fetchDomeCandlesticks(conditionId, {
      interval: resolvedInterval,
      hours: cfg.hours
    }).catch(err => {
      console.error('[Timeline] Dome candlestick error:', err.message);
      return null;
    }),
    // 新闻
    fetchGoogleNewsData(newsQuery, {
      maxResults: 20
    }).catch(err => {
      console.error('[Timeline] News fetch error:', err.message);
      return null;
    })
  ]);

  // 优先使用 CLOB 数据，如果没有则用 Dome 数据
  const domeCandles = candlestickData?.yes?.candles
    || candlestickData?.outcomes?.[0]?.candles
    || [];

  const candles = clobCandles.length > 0 ? clobCandles : domeCandles;

  console.log('[Timeline] Price data resolved:', {
    clobPoints: clobCandles.length,
    domePoints: domeCandles.length,
    usingSource: clobCandles.length > 0 ? 'CLOB' : domeCandles.length > 0 ? 'Dome' : 'none',
    finalPoints: candles.length,
    newsArticles: newsData?.articles?.length || 0
  });

  console.log(`[Timeline] Candles extracted: ${candles.length} data points`);
  if (candles.length > 0) {
    console.log('[Timeline] First candle:', candles[0]);
    console.log('[Timeline] Last candle:', candles[candles.length - 1]);
  }

  // 检测异动
  const anomalies = detectPriceAnomalies(candles, {
    lookback: period === '24h' ? 6 : period === '7d' ? 12 : 20,
    priceZThreshold: 1.8,
    volumeMultiple: 2.5,
    maxAnomalies: 10
  });

  console.log(`[Timeline] Anomalies detected: ${anomalies.length}`);
  if (anomalies.length > 0) {
    anomalies.forEach((a, i) => {
      console.log(`[Timeline] Anomaly ${i}: type=${a.type}, change=${a.priceChange}%, severity=${a.severity}, ts=${a.timestamp}`);
    });
  }

  // 准备新闻（带情绪标注）
  const articles = (newsData?.articles || []).map(article => ({
    ...article,
    sentiment: article.sentiment || analyzeSentiment(article.title)
  }));

  console.log(`[Timeline] Articles with sentiment: ${articles.length}`);
  articles.forEach((a, i) => {
    const ts = parseArticleTimestamp(a.pubDate);
    console.log(`[Timeline] Article ${i}: "${a.title?.substring(0, 50)}" sentiment=${a.sentiment} pubDate=${a.pubDate} parsedTs=${ts}`);
  });

  // 匹配事件到异动
  let events = matchEventsToAnomalies(anomalies, articles);

  // 按影响度筛选
  if (impactFilter === 'high') {
    events = events.filter(e => e.impact.magnitude === 'high');
  } else if (impactFilter === 'medium') {
    events = events.filter(e => e.impact.magnitude !== 'low');
  }

  // 构建价格分析 (如果 Dome 有则用 Dome 的，否则从 candles 自己算)
  let priceAnalysis = candlestickData?.priceAnalysis || null;
  if (!priceAnalysis && candles.length >= 2) {
    const first = candles[0];
    const last = candles[candles.length - 1];
    const closes = candles.map(c => c.close);
    const priceChange = last.close - first.open;
    const priceChangePercent = first.open > 0 ? (priceChange / first.open) * 100 : 0;
    const high = Math.max(...closes);
    const low = Math.min(...closes);
    const avgPrice = closes.reduce((a, b) => a + b, 0) / closes.length;
    const variance = closes.reduce((sum, p) => sum + Math.pow(p - avgPrice, 2), 0) / closes.length;
    const volatility = Math.sqrt(variance);

    const recentCandles = candles.slice(-5);
    let momentum = 0;
    for (let i = 1; i < recentCandles.length; i++) {
      if (recentCandles[i].close > recentCandles[i - 1].close) momentum++;
      else if (recentCandles[i].close < recentCandles[i - 1].close) momentum--;
    }

    priceAnalysis = {
      currentPrice: last.close,
      startPrice: first.open,
      priceChange: Math.round(priceChange * 10000) / 10000,
      priceChangePercent: Math.round(priceChangePercent * 100) / 100,
      high,
      low,
      avgPrice: Math.round(avgPrice * 10000) / 10000,
      volatility: Math.round(volatility * 10000) / 10000,
      volatilityPercent: avgPrice > 0 ? Math.round((volatility / avgPrice) * 100 * 100) / 100 : 0,
      momentum,
      trend: priceChangePercent > 5 ? 'bullish' : priceChangePercent < -5 ? 'bearish' : 'stable',
      trendStrength: Math.abs(priceChangePercent) > 15 ? 'strong' : Math.abs(priceChangePercent) > 8 ? 'moderate' : 'weak',
      dataPoints: candles.length,
      timeRangeHours: Math.round((last.timestamp - first.timestamp) / 3600)
    };
  }

  // 统计
  const highImpactCount = events.filter(e => e.impact.magnitude === 'high').length;
  const bullishCount = events.filter(e => e.impact.direction === 'bullish').length;
  const bearishCount = events.filter(e => e.impact.direction === 'bearish').length;

  const result = {
    market: {
      conditionId,
      title: eventTitle
    },
    priceData: candles,
    events,
    anomalies,
    priceAnalysis,
    summary: {
      totalEvents: events.length,
      highImpactCount,
      overallSentiment: bullishCount > bearishCount ? 'bullish'
        : bearishCount > bullishCount ? 'bearish'
        : 'mixed',
      period
    },
    fetchedAt: new Date().toISOString()
  };

  console.log('[Timeline] Final result:', {
    priceDataPoints: result.priceData.length,
    eventsCount: result.events.length,
    anomaliesCount: result.anomalies.length,
    hasPriceAnalysis: !!result.priceAnalysis,
    summary: result.summary
  });

  return result;
}

/**
 * 从事件标题构建新闻搜索查询
 */
function buildNewsQuery(eventTitle) {
  if (!eventTitle) return '';
  return eventTitle
    .replace(/^will\s+/i, '')
    .replace(/\?$/g, '')
    .replace(/\s+(happen|occur|take place|be the|be a|be)\s+/gi, ' ')
    .split(' ')
    .filter(w => w.length > 2)
    .slice(0, 6)
    .join(' ')
    .trim();
}

export default {
  detectPriceAnomalies,
  matchEventsToAnomalies,
  getTimelineData
};
