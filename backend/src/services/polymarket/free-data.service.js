/**
 * 免费数据源服务
 * 提供 Reddit JSON API 和 Google News RSS 数据抓取
 * 无需 API Key，完全免费
 */

import { parseStringPromise } from 'xml2js';

// ============================================
// 配置
// ============================================

// 使用更真实的 User-Agent 来避免 Reddit 403 限制
const REDDIT_USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0'
];

// 获取随机 User-Agent
const getRandomUserAgent = () => REDDIT_USER_AGENTS[Math.floor(Math.random() * REDDIT_USER_AGENTS.length)];

// Reddit 搜索的 subreddit 列表（按事件类别）
// 注意: r/Polymarket 返回 404，已移除
const SUBREDDIT_MAP = {
  politics: ['politics', 'news', 'worldnews', 'PoliticalDiscussion'],
  crypto: ['CryptoCurrency', 'Bitcoin', 'ethereum', 'defi'],
  sports: ['sportsbook', 'sports', 'nfl', 'nba'],
  business: ['wallstreetbets', 'stocks', 'finance', 'investing'],
  entertainment: ['movies', 'boxoffice', 'entertainment', 'television'],
  technology: ['technology', 'tech', 'gadgets', 'Futurology'],
  science: ['science', 'space', 'environment'],
  default: ['news', 'worldnews', 'popular']
};

// 简单的情绪关键词
const SENTIMENT_KEYWORDS = {
  positive: ['bullish', 'moon', 'buying', 'win', 'winning', 'surge', 'leading', 'ahead', 'strong', 'positive', 'good', 'great', 'up', 'rise', 'rising'],
  negative: ['bearish', 'dump', 'selling', 'lose', 'losing', 'crash', 'behind', 'weak', 'negative', 'bad', 'down', 'fall', 'falling', 'drop']
};

// ============================================
// Reddit JSON API
// ============================================

/**
 * 从 Reddit 获取相关讨论
 * @param {string} query - 搜索关键词
 * @param {object} options - 配置选项
 * @returns {Promise<object>} Reddit 数据
 */
export async function fetchRedditData(query, options = {}) {
  const {
    category = 'default',
    limit = 25,
    sort = 'new', // new, hot, relevance
    timeFilter = 'week' // hour, day, week, month, year, all
  } = options;

  console.log(`[Reddit] Fetching data for query: "${query}"`);

  try {
    // 获取相关 subreddit 列表
    const subreddits = SUBREDDIT_MAP[category] || SUBREDDIT_MAP.default;
    
    // 并行搜索多个 subreddit
    const searchPromises = subreddits.map(subreddit => 
      searchSubreddit(subreddit, query, { limit: Math.ceil(limit / subreddits.length), sort, timeFilter })
    );

    const results = await Promise.allSettled(searchPromises);
    
    // 合并所有结果
    let allPosts = [];
    results.forEach((result, index) => {
      if (result.status === 'fulfilled' && result.value) {
        allPosts = allPosts.concat(result.value);
      } else {
        console.warn(`[Reddit] Failed to fetch from r/${subreddits[index]}:`, result.reason?.message);
      }
    });

    if (allPosts.length === 0) {
      console.log('[Reddit] No posts found');
      return null;
    }

    // 处理和分析数据
    const processedData = processRedditPosts(allPosts);
    
    console.log(`[Reddit] Found ${processedData.totalPosts} posts, sentiment: ${processedData.sentiment.overall}`);
    
    return processedData;

  } catch (error) {
    console.error('[Reddit] Fetch error:', error.message);
    return null;
  }
}

/**
 * 搜索单个 subreddit
 * 使用 old.reddit.com 来避免一些 API 限制
 */
async function searchSubreddit(subreddit, query, options) {
  const { limit, sort, timeFilter } = options;
  
  // 使用 old.reddit.com 更稳定
  const url = new URL(`https://old.reddit.com/r/${subreddit}/search.json`);
  url.searchParams.set('q', query);
  url.searchParams.set('sort', sort);
  url.searchParams.set('t', timeFilter);
  url.searchParams.set('limit', limit.toString());
  url.searchParams.set('restrict_sr', 'true'); // 限制在当前 subreddit
  url.searchParams.set('raw_json', '1'); // 获取原始 JSON

  // 添加随机延迟避免速率限制 (100-300ms)
  await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 200));

  const response = await fetch(url.toString(), {
    headers: {
      'User-Agent': getRandomUserAgent(),
      'Accept': 'application/json',
      'Accept-Language': 'en-US,en;q=0.9'
    }
  });

  if (!response.ok) {
    // 如果 old.reddit.com 失败，尝试 www.reddit.com
    if (response.status === 403 || response.status === 429) {
      console.log(`[Reddit] Retrying with www.reddit.com for r/${subreddit}`);
      return searchSubredditFallback(subreddit, query, options);
    }
    throw new Error(`Reddit API error: ${response.status}`);
  }

  const data = await response.json();
  
  // 提取帖子数据
  const posts = data?.data?.children?.map(child => ({
    id: child.data.id,
    title: child.data.title,
    selftext: child.data.selftext || '',
    score: child.data.score,
    numComments: child.data.num_comments,
    createdUtc: child.data.created_utc,
    subreddit: child.data.subreddit,
    upvoteRatio: child.data.upvote_ratio,
    url: `https://reddit.com${child.data.permalink}`,
    author: child.data.author
  })) || [];

  return posts;
}

/**
 * 备用 Reddit 搜索（使用 www.reddit.com）
 */
async function searchSubredditFallback(subreddit, query, options) {
  const { limit, sort, timeFilter } = options;
  
  const url = new URL(`https://www.reddit.com/r/${subreddit}/search.json`);
  url.searchParams.set('q', query);
  url.searchParams.set('sort', sort);
  url.searchParams.set('t', timeFilter);
  url.searchParams.set('limit', limit.toString());
  url.searchParams.set('restrict_sr', 'true');
  url.searchParams.set('raw_json', '1');

  // 更长的延迟
  await new Promise(resolve => setTimeout(resolve, 500 + Math.random() * 500));

  const response = await fetch(url.toString(), {
    headers: {
      'User-Agent': getRandomUserAgent(),
      'Accept': 'application/json',
      'Accept-Language': 'en-US,en;q=0.9',
      'Cache-Control': 'no-cache'
    }
  });

  if (!response.ok) {
    throw new Error(`Reddit API error: ${response.status}`);
  }

  const data = await response.json();
  
  const posts = data?.data?.children?.map(child => ({
    id: child.data.id,
    title: child.data.title,
    selftext: child.data.selftext || '',
    score: child.data.score,
    numComments: child.data.num_comments,
    createdUtc: child.data.created_utc,
    subreddit: child.data.subreddit,
    upvoteRatio: child.data.upvote_ratio,
    url: `https://reddit.com${child.data.permalink}`,
    author: child.data.author
  })) || [];

  return posts;
}

/**
 * 处理和分析 Reddit 帖子
 */
function processRedditPosts(posts) {
  // 过滤低质量帖子
  const filteredPosts = posts.filter(post => {
    // 过滤 score 太低的帖子
    if (post.score < 3) return false;
    // 过滤太旧的帖子（超过 7 天）
    const sevenDaysAgo = Date.now() / 1000 - 7 * 24 * 60 * 60;
    if (post.createdUtc < sevenDaysAgo) return false;
    return true;
  });

  // 去重（按标题相似度）
  const uniquePosts = deduplicatePosts(filteredPosts);

  // 情绪分析
  const sentimentResult = analyzeSentiment(uniquePosts);

  // 按热度排序
  const sortedPosts = uniquePosts.sort((a, b) => {
    const scoreA = a.score * 2 + a.numComments * 3;
    const scoreB = b.score * 2 + b.numComments * 3;
    return scoreB - scoreA;
  });

  // 提取热门关键词
  const keywords = extractKeywords(uniquePosts);

  // 统计数据
  const totalScore = uniquePosts.reduce((sum, p) => sum + p.score, 0);
  const totalComments = uniquePosts.reduce((sum, p) => sum + p.numComments, 0);

  return {
    totalPosts: uniquePosts.length,
    avgScore: uniquePosts.length > 0 ? Math.round(totalScore / uniquePosts.length) : 0,
    totalComments,
    
    sentiment: sentimentResult,
    
    topDiscussions: sortedPosts.slice(0, 5).map(post => ({
      title: post.title,
      subreddit: post.subreddit,
      score: post.score,
      comments: post.numComments,
      sentiment: getPostSentiment(post),
      url: post.url,
      timeAgo: formatTimeAgo(post.createdUtc)
    })),
    
    trendingKeywords: keywords.slice(0, 8),
    
    latestPost: sortedPosts.length > 0 
      ? new Date(sortedPosts[0].createdUtc * 1000).toISOString() 
      : null,
    
    activityLevel: getActivityLevel(uniquePosts.length, totalComments),
    
    subredditBreakdown: getSubredditBreakdown(uniquePosts)
  };
}

/**
 * 简单的帖子去重
 */
function deduplicatePosts(posts) {
  const seen = new Set();
  return posts.filter(post => {
    // 用标题前 50 字符作为去重 key
    const key = post.title.toLowerCase().substring(0, 50);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * 情绪分析
 */
function analyzeSentiment(posts) {
  let positiveCount = 0;
  let negativeCount = 0;
  let neutralCount = 0;
  let sentimentScore = 0;

  posts.forEach(post => {
    const text = (post.title + ' ' + post.selftext).toLowerCase();
    const upvoteRatio = post.upvoteRatio || 0.5;
    
    // 基于关键词
    let postScore = 0;
    SENTIMENT_KEYWORDS.positive.forEach(kw => {
      if (text.includes(kw)) postScore += 1;
    });
    SENTIMENT_KEYWORDS.negative.forEach(kw => {
      if (text.includes(kw)) postScore -= 1;
    });
    
    // 结合 upvote ratio
    if (upvoteRatio > 0.7) postScore += 0.5;
    if (upvoteRatio < 0.4) postScore -= 0.5;
    
    if (postScore > 0) {
      positiveCount++;
      sentimentScore += 1;
    } else if (postScore < 0) {
      negativeCount++;
      sentimentScore -= 1;
    } else {
      neutralCount++;
    }
  });

  const total = posts.length || 1;
  const normalizedScore = (sentimentScore / total + 1) / 2; // 归一化到 0-1

  return {
    overall: normalizedScore > 0.55 ? 'bullish' : normalizedScore < 0.45 ? 'bearish' : 'neutral',
    score: Math.round(normalizedScore * 100) / 100,
    confidence: Math.min(0.9, 0.5 + total * 0.02), // 帖子越多置信度越高
    breakdown: {
      positive: positiveCount,
      negative: negativeCount,
      neutral: neutralCount
    }
  };
}

/**
 * 获取单个帖子的情绪
 */
function getPostSentiment(post) {
  const text = (post.title + ' ' + post.selftext).toLowerCase();
  let score = 0;
  
  SENTIMENT_KEYWORDS.positive.forEach(kw => {
    if (text.includes(kw)) score += 1;
  });
  SENTIMENT_KEYWORDS.negative.forEach(kw => {
    if (text.includes(kw)) score -= 1;
  });
  
  if (post.upvoteRatio > 0.7) score += 0.5;
  if (post.upvoteRatio < 0.4) score -= 0.5;
  
  return score > 0 ? 'positive' : score < 0 ? 'negative' : 'neutral';
}

/**
 * 提取热门关键词
 */
function extractKeywords(posts) {
  const wordCount = {};
  const stopWords = new Set(['the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must', 'shall', 'can', 'need', 'dare', 'ought', 'used', 'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through', 'during', 'before', 'after', 'above', 'below', 'between', 'under', 'again', 'further', 'then', 'once', 'here', 'there', 'when', 'where', 'why', 'how', 'all', 'each', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very', 's', 't', 'just', 'don', 'now', 'and', 'but', 'or', 'if', 'because', 'until', 'while', 'this', 'that', 'these', 'those', 'what', 'which', 'who', 'whom', 'its', 'it', 'he', 'she', 'they', 'them', 'his', 'her', 'their', 'my', 'your', 'our', 'i', 'you', 'we', 'me', 'him', 'us']);

  posts.forEach(post => {
    const words = post.title.toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2 && !stopWords.has(w));
    
    words.forEach(word => {
      wordCount[word] = (wordCount[word] || 0) + 1;
    });
  });

  return Object.entries(wordCount)
    .filter(([_, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([word]) => word);
}

/**
 * 格式化时间
 */
function formatTimeAgo(timestamp) {
  const seconds = Math.floor(Date.now() / 1000 - timestamp);
  
  if (seconds < 3600) return `${Math.floor(seconds / 60)} 分钟前`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} 小时前`;
  return `${Math.floor(seconds / 86400)} 天前`;
}

/**
 * 获取活跃度等级
 */
function getActivityLevel(postCount, commentCount) {
  const score = postCount * 2 + commentCount / 10;
  if (score > 50) return 'high';
  if (score > 20) return 'medium';
  return 'low';
}

/**
 * 获取 subreddit 分布
 */
function getSubredditBreakdown(posts) {
  const breakdown = {};
  posts.forEach(post => {
    breakdown[post.subreddit] = (breakdown[post.subreddit] || 0) + 1;
  });
  return breakdown;
}

// ============================================
// Google News RSS
// ============================================

/**
 * 从 Google News RSS 获取新闻
 * @param {string} query - 搜索关键词
 * @param {object} options - 配置选项
 * @returns {Promise<object>} 新闻数据
 */
export async function fetchGoogleNewsData(query, options = {}) {
  const {
    language = 'en',
    country = 'US',
    maxResults = 15
  } = options;

  console.log(`[GoogleNews] Fetching news for query: "${query}"`);

  try {
    // 构建 RSS URL
    const encodedQuery = encodeURIComponent(query);
    const hl = language === 'zh' ? 'zh-CN' : 'en-US';
    const gl = country;
    const ceid = `${gl}:${language}`;
    
    const url = `https://news.google.com/rss/search?q=${encodedQuery}&hl=${hl}&gl=${gl}&ceid=${ceid}`;

    console.log(`[GoogleNews] Fetching URL: ${url}`);

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/rss+xml, application/xml, text/xml, */*',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    });

    if (!response.ok) {
      throw new Error(`Google News RSS error: ${response.status}`);
    }

    const xmlText = await response.text();
    
    // 解析 XML
    const result = await parseStringPromise(xmlText, {
      explicitArray: false,
      ignoreAttrs: false
    });

    const items = result?.rss?.channel?.item;
    if (!items) {
      console.log('[GoogleNews] No articles found');
      return null;
    }

    // 确保 items 是数组
    const articlesArray = Array.isArray(items) ? items : [items];

    // 处理文章
    const articles = articlesArray.slice(0, maxResults).map(item => {
      // 解析来源（Google News 格式: "Title - Source"）
      const titleParts = item.title?.split(' - ') || [];
      const source = titleParts.length > 1 ? titleParts.pop() : 'Unknown';
      const title = titleParts.join(' - ');

      return {
        title: title || item.title,
        link: item.link,
        pubDate: item.pubDate,
        pubDateFormatted: formatPubDate(item.pubDate),
        source: source,
        description: cleanHtml(item.description || '')
      };
    });

    // 统计来源
    const sourceCount = {};
    articles.forEach(a => {
      sourceCount[a.source] = (sourceCount[a.source] || 0) + 1;
    });

    const processedData = {
      articles,
      articlesCount: articles.length,
      sources: Object.entries(sourceCount)
        .sort((a, b) => b[1] - a[1])
        .map(([name, count]) => ({ name, count })),
      latestDate: articles.length > 0 ? articles[0].pubDate : null,
      query
    };

    console.log(`[GoogleNews] Found ${processedData.articlesCount} articles from ${Object.keys(sourceCount).length} sources`);

    return processedData;

  } catch (error) {
    console.error('[GoogleNews] Fetch error:', error.message);
    return null;
  }
}

/**
 * 格式化发布日期
 */
function formatPubDate(pubDate) {
  if (!pubDate) return '';
  
  try {
    const date = new Date(pubDate);
    const now = new Date();
    const diffMs = now - date;
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    
    if (diffHours < 1) return '刚刚';
    if (diffHours < 24) return `${diffHours} 小时前`;
    
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays} 天前`;
    
    return date.toLocaleDateString('zh-CN');
  } catch {
    return pubDate;
  }
}

/**
 * 清理 HTML 标签
 */
function cleanHtml(html) {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .trim();
}

// ============================================
// Wikipedia API (完全免费，无需 API Key)
// ============================================

/**
 * 从 Wikipedia 获取事件相关的背景信息
 * @param {string} query - 搜索关键词
 * @param {object} options - 配置选项
 * @returns {Promise<object>} Wikipedia 数据
 */
export async function fetchWikipediaData(query, options = {}) {
  const {
    language = 'en',
    maxResults = 3
  } = options;

  console.log(`[Wikipedia] Fetching data for query: "${query}"`);

  try {
    // 第一步：搜索相关条目
    const searchUrl = `https://${language}.wikipedia.org/w/api.php?` + new URLSearchParams({
      action: 'query',
      list: 'search',
      srsearch: query,
      srlimit: maxResults.toString(),
      format: 'json',
      origin: '*'
    });

    const searchResponse = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'PromptTrading/1.0 (AI Event Analysis)',
        'Accept': 'application/json'
      }
    });

    if (!searchResponse.ok) {
      throw new Error(`Wikipedia search error: ${searchResponse.status}`);
    }

    const searchData = await searchResponse.json();
    const searchResults = searchData?.query?.search || [];

    if (searchResults.length === 0) {
      console.log('[Wikipedia] No results found');
      return null;
    }

    // 第二步：获取每个条目的摘要
    const summaries = await Promise.all(
      searchResults.map(result => fetchWikipediaSummary(result.title, language))
    );

    // 过滤掉失败的请求
    const validSummaries = summaries.filter(s => s !== null);

    if (validSummaries.length === 0) {
      console.log('[Wikipedia] No valid summaries found');
      return null;
    }

    const processedData = {
      articles: validSummaries,
      articlesCount: validSummaries.length,
      query,
      language,
      fetchedAt: new Date().toISOString()
    };

    console.log(`[Wikipedia] Found ${processedData.articlesCount} relevant articles`);

    return processedData;

  } catch (error) {
    console.error('[Wikipedia] Fetch error:', error.message);
    return null;
  }
}

/**
 * 获取单个 Wikipedia 条目的摘要
 * @param {string} title - 条目标题
 * @param {string} language - 语言代码
 * @returns {Promise<object|null>} 条目摘要
 */
async function fetchWikipediaSummary(title, language = 'en') {
  try {
    const url = `https://${language}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'PromptTrading/1.0 (AI Event Analysis)',
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();

    // 过滤掉消歧义页面
    if (data.type === 'disambiguation') {
      return null;
    }

    return {
      title: data.title,
      extract: data.extract || '',
      extractShort: data.extract ? data.extract.substring(0, 300) + (data.extract.length > 300 ? '...' : '') : '',
      url: data.content_urls?.desktop?.page || `https://${language}.wikipedia.org/wiki/${encodeURIComponent(title)}`,
      thumbnail: data.thumbnail?.source || null,
      description: data.description || '',
      type: data.type
    };

  } catch (error) {
    console.error(`[Wikipedia] Error fetching summary for "${title}":`, error.message);
    return null;
  }
}

/**
 * 从事件标题提取 Wikipedia 搜索关键词
 * 专门优化用于寻找人物、事件、组织等实体
 */
function extractWikipediaKeywords(eventTitle) {
  // 提取专有名词（大写开头的词组）
  const properNouns = eventTitle.match(/[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*/g) || [];

  // 提取年份
  const years = eventTitle.match(/\b(19|20)\d{2}\b/g) || [];

  // 如果有专有名词，优先使用
  if (properNouns.length > 0) {
    // 取最长的专有名词短语（通常是人名或组织名）
    const longest = properNouns.sort((a, b) => b.length - a.length)[0];
    return longest;
  }

  // 回退到基本关键词提取
  return eventTitle
    .replace(/^will\s+/i, '')
    .replace(/\?$/g, '')
    .split(' ')
    .filter(w => w.length > 3)
    .slice(0, 3)
    .join(' ');
}

// ============================================
// Dome API (完全免费，无需 API Key)
// 提供 Polymarket 市场数据、价格、K线、交易历史
// ============================================

const DOME_API_BASE = 'https://api.domeapi.io/v1';

/**
 * 从 Dome API 获取 K 线数据（价格走势）
 * @param {string} conditionId - Polymarket condition ID
 * @param {object} options - 配置选项
 * @returns {Promise<object>} K线数据
 */
export async function fetchDomeCandlesticks(conditionId, options = {}) {
  const {
    interval = '1h',  // 1m, 5m, 15m, 30m, 1h, 4h, 1d
    hours = 72        // 获取多少小时的数据
  } = options;

  if (!conditionId) {
    console.warn('[Dome] No conditionId provided');
    return null;
  }

  console.log(`[Dome] Fetching candlesticks for: ${conditionId.substring(0, 20)}...`);

  try {
    const endTime = Math.floor(Date.now() / 1000);
    const startTime = endTime - (hours * 3600);

    const url = `${DOME_API_BASE}/polymarket/candlesticks/${conditionId}?` + new URLSearchParams({
      interval,
      start_time: startTime.toString(),
      end_time: endTime.toString(),
      limit: '100'
    });

    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'PromptTrading/1.0'
      }
    });

    if (!response.ok) {
      throw new Error(`Dome API error: ${response.status}`);
    }

    // 验证响应类型，防止 HTML 错误页面导致 JSON 解析失败
    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      const text = await response.text();
      console.error(`[Dome] Non-JSON response: ${text.substring(0, 200)}`);
      throw new Error(`Dome API returned non-JSON response (${response.status})`);
    }

    const data = await response.json();

    // 处理 K 线数据 - Dome 返回的是嵌套数组结构
    if (!data.candlesticks || data.candlesticks.length === 0) {
      console.log('[Dome] No candlestick data available');
      return null;
    }

    // 提取所有 outcome 的 K 线数据
    const processedData = {
      outcomes: [], // 所有 outcome 的 K 线数据
      yes: null,    // 保持向后兼容
      no: null,
      interval,
      hours,
      priceAnalysis: null,
      fetchedAt: new Date().toISOString()
    };

    data.candlesticks.forEach((tokenData, index) => {
      if (!tokenData || !Array.isArray(tokenData[0])) return;

      const candles = tokenData[0].map(c => ({
        timestamp: c.end_period_ts,
        time: new Date(c.end_period_ts * 1000).toISOString(),
        open: parseFloat(c.price?.open_dollars || 0),
        high: parseFloat(c.price?.high_dollars || 0),
        low: parseFloat(c.price?.low_dollars || 0),
        close: parseFloat(c.price?.close_dollars || 0),
        volume: c.volume || 0
      }));

      const tokenId = tokenData[1]?.token_id;
      const outcome = tokenData[1]?.outcome || `Outcome ${index + 1}`;

      // 获取当前价格（最后一个 K 线的收盘价）
      const currentPrice = candles.length > 0 ? candles[candles.length - 1].close : 0;

      // 添加到 outcomes 数组
      processedData.outcomes.push({
        index,
        name: outcome,
        tokenId,
        candles,
        currentPrice
      });

      // 保持向后兼容：根据 outcome 名称或索引设置 yes/no
      if (outcome === 'Yes' || (index === 0 && !processedData.yes)) {
        processedData.yes = { candles, tokenId, name: outcome };
      } else if (outcome === 'No' || (index === 1 && !processedData.no)) {
        processedData.no = { candles, tokenId, name: outcome };
      }
    });

    // 按当前价格降序排序 outcomes（价格高的在前）
    processedData.outcomes.sort((a, b) => b.currentPrice - a.currentPrice);

    // 计算价格分析（使用第一个 outcome）
    if (processedData.outcomes.length > 0 && processedData.outcomes[0].candles.length > 0) {
      processedData.priceAnalysis = analyzePriceTrend(processedData.outcomes[0].candles);
    }

    console.log(`[Dome] Found ${processedData.outcomes.length} outcomes, ${processedData.outcomes[0]?.candles?.length || 0} candlesticks each`);

    return processedData;

  } catch (error) {
    console.error('[Dome] Candlesticks fetch error:', error.message);
    return null;
  }
}

/**
 * 分析价格走势
 * @param {Array} candles - K线数据
 * @returns {object} 价格分析结果
 */
function analyzePriceTrend(candles) {
  if (!candles || candles.length < 2) {
    return null;
  }

  const first = candles[0];
  const last = candles[candles.length - 1];

  // 价格变化
  const priceChange = last.close - first.open;
  const priceChangePercent = first.open > 0 ? (priceChange / first.open) * 100 : 0;

  // 最高和最低
  const high = Math.max(...candles.map(c => c.high));
  const low = Math.min(...candles.map(c => c.low));

  // 计算波动率 (简单标准差)
  const prices = candles.map(c => c.close);
  const avgPrice = prices.reduce((a, b) => a + b, 0) / prices.length;
  const variance = prices.reduce((sum, p) => sum + Math.pow(p - avgPrice, 2), 0) / prices.length;
  const volatility = Math.sqrt(variance);

  // 计算动量 (最近几根K线的方向)
  const recentCandles = candles.slice(-5);
  let momentum = 0;
  for (let i = 1; i < recentCandles.length; i++) {
    if (recentCandles[i].close > recentCandles[i - 1].close) momentum++;
    else if (recentCandles[i].close < recentCandles[i - 1].close) momentum--;
  }

  // 判断趋势
  let trend = 'stable';
  if (priceChangePercent > 5) trend = 'bullish';
  else if (priceChangePercent < -5) trend = 'bearish';

  // 趋势强度
  let trendStrength = 'weak';
  if (Math.abs(priceChangePercent) > 15) trendStrength = 'strong';
  else if (Math.abs(priceChangePercent) > 8) trendStrength = 'moderate';

  return {
    currentPrice: last.close,
    startPrice: first.open,
    priceChange: Math.round(priceChange * 10000) / 10000,
    priceChangePercent: Math.round(priceChangePercent * 100) / 100,
    high,
    low,
    avgPrice: Math.round(avgPrice * 10000) / 10000,
    volatility: Math.round(volatility * 10000) / 10000,
    volatilityPercent: Math.round((volatility / avgPrice) * 100 * 100) / 100,
    momentum,  // 正数=上涨动量, 负数=下跌动量
    trend,
    trendStrength,
    dataPoints: candles.length,
    timeRangeHours: Math.round((last.timestamp - first.timestamp) / 3600)
  };
}

/**
 * 格式化 K 线数据为 AI 可读的文本
 * @param {object} domeData - Dome API 返回的数据
 * @param {boolean} isZh - 是否中文
 * @returns {string} 格式化的文本
 */
export function formatCandlestickDataForAI(domeData, isZh = false) {
  if (!domeData?.priceAnalysis) {
    return '';
  }

  const p = domeData.priceAnalysis;
  const trendEmoji = p.trend === 'bullish' ? '📈' : p.trend === 'bearish' ? '📉' : '➡️';

  const trendMap = {
    bullish: isZh ? '上涨' : 'Bullish',
    bearish: isZh ? '下跌' : 'Bearish',
    stable: isZh ? '稳定' : 'Stable'
  };

  const strengthMap = {
    strong: isZh ? '强' : 'Strong',
    moderate: isZh ? '中等' : 'Moderate',
    weak: isZh ? '弱' : 'Weak'
  };

  let text = isZh ? `## 价格走势分析 (过去 ${p.timeRangeHours} 小时)\n\n` : `## Price Trend Analysis (Past ${p.timeRangeHours} hours)\n\n`;

  text += `${trendEmoji} **${isZh ? '趋势' : 'Trend'}**: ${trendMap[p.trend]} (${strengthMap[p.trendStrength]})\n\n`;

  text += isZh ? `**价格数据**:\n` : `**Price Data**:\n`;
  text += `- ${isZh ? '当前价格' : 'Current Price'}: $${p.currentPrice.toFixed(4)} (${(p.currentPrice * 100).toFixed(1)}%)\n`;
  text += `- ${isZh ? '起始价格' : 'Start Price'}: $${p.startPrice.toFixed(4)}\n`;
  text += `- ${isZh ? '价格变化' : 'Price Change'}: ${p.priceChange >= 0 ? '+' : ''}${p.priceChange.toFixed(4)} (${p.priceChangePercent >= 0 ? '+' : ''}${p.priceChangePercent.toFixed(2)}%)\n`;
  text += `- ${isZh ? '最高/最低' : 'High/Low'}: $${p.high.toFixed(4)} / $${p.low.toFixed(4)}\n\n`;

  text += isZh ? `**市场指标**:\n` : `**Market Indicators**:\n`;
  text += `- ${isZh ? '波动率' : 'Volatility'}: ${p.volatilityPercent.toFixed(2)}%\n`;
  text += `- ${isZh ? '动量' : 'Momentum'}: ${p.momentum > 0 ? '+' + p.momentum : p.momentum} (${p.momentum > 0 ? (isZh ? '上涨动量' : 'Upward') : p.momentum < 0 ? (isZh ? '下跌动量' : 'Downward') : (isZh ? '中性' : 'Neutral')})\n`;
  text += `- ${isZh ? '数据点数' : 'Data Points'}: ${p.dataPoints}\n`;

  return text;
}

// ============================================
// 聚合函数
// ============================================

/**
 * 从事件标题和描述构建搜索查询
 */
function buildSearchQuery(eventTitle, eventDescription = '') {
  // 提取关键词
  let query = eventTitle;
  
  // 移除常见的问句格式和无意义词
  query = query
    .replace(/^will\s+/i, '')
    .replace(/\?$/g, '')
    .replace(/\s+(happen|occur|take place|be the|be a|be)\s+/gi, ' ')
    .replace(/\s+(of|in|at|on|by|for|to|the|a|an)\s+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  
  // 提取关键名词和实体（保留大写词、数字、年份等）
  const words = query.split(' ');
  const importantWords = words.filter(word => {
    // 保留: 大写开头的词（专有名词）、数字/年份、长度>=4的词
    if (word.length < 3) return false;
    if (/^\d{4}$/.test(word)) return true; // 年份
    if (/^[A-Z]/.test(word)) return true; // 专有名词
    if (word.length >= 5) return true; // 较长的词
    return false;
  });
  
  // 如果提取的关键词太少，回退到原始处理
  if (importantWords.length >= 2) {
    query = importantWords.slice(0, 6).join(' '); // 最多6个关键词
  } else if (query.length > 50) {
    query = query.substring(0, 50);
  }
  
  return query.trim();
}

/**
 * 根据事件标题推断类别
 */
function inferCategory(eventTitle, eventCategory = '') {
  const title = eventTitle.toLowerCase();
  const category = eventCategory.toLowerCase();
  
  // 先根据事件分类判断（支持中英文）
  if (category.includes('政治') || category.includes('politic')) {
    return 'politics';
  }
  if (category.includes('流行文化') || category.includes('pop culture') || category.includes('entertainment') || category.includes('娱乐')) {
    return 'entertainment';
  }
  if (category.includes('体育') || category.includes('sport')) {
    return 'sports';
  }
  if (category.includes('crypto') || category.includes('加密') || category.includes('区块链')) {
    return 'crypto';
  }
  if (category.includes('商业') || category.includes('business') || category.includes('经济') || category.includes('金融')) {
    return 'business';
  }
  if (category.includes('科技') || category.includes('tech')) {
    return 'technology';
  }
  if (category.includes('科学') || category.includes('science')) {
    return 'science';
  }
  
  // 然后根据标题关键词判断
  if (title.includes('trump') || title.includes('biden') || title.includes('election') || 
      title.includes('president') || title.includes('congress') || title.includes('senate')) {
    return 'politics';
  }
  
  if (title.includes('bitcoin') || title.includes('btc') || title.includes('ethereum') || 
      title.includes('eth') || title.includes('crypto') || title.includes('token')) {
    return 'crypto';
  }
  
  if (title.includes('nfl') || title.includes('nba') || title.includes('soccer') || 
      title.includes('world cup') || title.includes('super bowl') || title.includes('championship')) {
    return 'sports';
  }
  
  if (title.includes('stock') || title.includes('market') || title.includes('fed') || 
      title.includes('interest rate') || title.includes('earnings') || title.includes('ipo')) {
    return 'business';
  }
  
  // 电影/娱乐相关关键词
  if (title.includes('movie') || title.includes('film') || title.includes('box office') || 
      title.includes('oscar') || title.includes('grossing') || title.includes('cinema') ||
      title.includes('actor') || title.includes('actress') || title.includes('director') ||
      title.includes('tv show') || title.includes('series') || title.includes('emmy') ||
      title.includes('grammy') || title.includes('album') || title.includes('song')) {
    return 'entertainment';
  }
  
  // 科技相关
  if (title.includes('ai') || title.includes('artificial intelligence') || title.includes('tech') ||
      title.includes('apple') || title.includes('google') || title.includes('microsoft') ||
      title.includes('spacex') || title.includes('tesla')) {
    return 'technology';
  }
  
  return 'default';
}

/**
 * 聚合所有免费数据源
 * @param {string} eventTitle - 事件标题
 * @param {string} eventDescription - 事件描述
 * @param {object} options - 配置选项
 * @returns {Promise<object>} 聚合后的数据
 */
export async function fetchAllFreeData(eventTitle, eventDescription = '', options = {}) {
  const {
    useReddit = true,
    useGoogleNews = true,
    useWikipedia = true,
    language = 'en',
    eventCategory = '' // 事件分类
  } = options;

  console.log(`[FreeData] Fetching free data for: "${eventTitle.substring(0, 50)}..."`);

  const query = buildSearchQuery(eventTitle, eventDescription);
  const wikiQuery = extractWikipediaKeywords(eventTitle); // 专门为 Wikipedia 优化的关键词
  const category = inferCategory(eventTitle, eventCategory);

  console.log(`[FreeData] Search query: "${query}", wiki query: "${wikiQuery}", category: ${category}`);

  const promises = [];

  // TODO: Reddit API 被封锁 (403)，暂时禁用，之后添加 OAuth 认证后恢复
  // if (useReddit) {
  //   promises.push(
  //     fetchRedditData(query, { category, limit: 30 })
  //       .catch(err => {
  //         console.error('[FreeData] Reddit fetch failed:', err.message);
  //         return null;
  //       })
  //   );
  // } else {
  //   promises.push(Promise.resolve(null));
  // }
  promises.push(Promise.resolve(null)); // Reddit 暂时返回 null

  if (useGoogleNews) {
    promises.push(
      fetchGoogleNewsData(query, { language, maxResults: 15 })
        .catch(err => {
          console.error('[FreeData] Google News fetch failed:', err.message);
          return null;
        })
    );
  } else {
    promises.push(Promise.resolve(null));
  }

  // Wikipedia 背景信息
  if (useWikipedia) {
    promises.push(
      fetchWikipediaData(wikiQuery, { language, maxResults: 3 })
        .catch(err => {
          console.error('[FreeData] Wikipedia fetch failed:', err.message);
          return null;
        })
    );
  } else {
    promises.push(Promise.resolve(null));
  }

  const [redditData, googleNewsData, wikipediaData] = await Promise.all(promises);

  return {
    reddit: redditData, // 暂时为 null
    googleNews: googleNewsData,
    wikipedia: wikipediaData,
    query,
    wikiQuery,
    category,
    fetchedAt: new Date().toISOString()
  };
}

export default {
  fetchRedditData,
  fetchGoogleNewsData,
  fetchWikipediaData,
  fetchDomeCandlesticks,
  formatCandlestickDataForAI,
  fetchAllFreeData
};

