import express from 'express';
import {
  analyzeEvent,
  analyzeEventStream,
  getAnalysisStatus,
  testConnection,
  getCandlesticks,
  analyzeEventComments
} from '../controllers/polymarket.controller.js';
import {
  getWatchlist,
  addToWatchlist,
  addBatchToWatchlist,
  removeFromWatchlist,
  syncWatchlist
} from '../controllers/polymarket-watchlist.controller.js';
import {
  getTraders,
  getTrader,
  createTrader,
  updateTrader,
  deleteTrader,
  syncTraders,
  getTraderTradeHistory,
  getTraderPositions,
  getTraderPortfolioValue,
  getTraderStatsHandler
} from '../controllers/polymarket-traders.controller.js';
import {
  getAnalysisHistory,
  saveAnalysisHistory,
  clearAnalysisHistory,
  markAnalysisExecuted
} from '../controllers/polymarket-analysis.controller.js';
import {
  getTokenPrice,
  getTokenPrices,
  getPriceCacheStatus,
  subscribeToTokens,
} from '../controllers/polymarket-prices.controller.js';
import {
  getMarketData,
  getMarketsData,
  getMarketCacheStatus,
} from '../controllers/polymarket-markets.controller.js';
import {
  proxyGammaAPI,
  proxyClobAPI,
} from '../controllers/polymarket-proxy.controller.js';
import { privyAuthMiddleware, requirePrivyAuth } from '../middleware/privyAuth.middleware.js';
import { sentimentUsageLimiter } from '../middleware/usageLimit.middleware.js';

const router = express.Router();

// Apply Privy auth middleware to all routes
router.use(privyAuthMiddleware);

/**
 * Polymarket AI 分析路由
 */

// 事件分析（流式输出）
router.post('/analyze-stream', analyzeEventStream);

// 事件分析（一次性返回）
router.post('/analyze', analyzeEvent);

// 获取分析状态
router.get('/analysis-status/:analysisId', getAnalysisStatus);

// 测试连接
router.get('/test-connection', testConnection);

/**
 * Watchlist 路由 (需要认证)
 */

// 获取用户关注列表
router.get('/watchlist', requirePrivyAuth, getWatchlist);

// 添加到关注列表
router.post('/watchlist', requirePrivyAuth, addToWatchlist);

// 批量添加到关注列表
router.post('/watchlist/batch', requirePrivyAuth, addBatchToWatchlist);

// 从关注列表移除
router.delete('/watchlist/:eventId', requirePrivyAuth, removeFromWatchlist);

// 同步关注列表（替换全部）
router.put('/watchlist/sync', requirePrivyAuth, syncWatchlist);

/**
 * Traders 路由 (需要认证)
 */

// 获取所有 Traders
router.get('/traders', requirePrivyAuth, getTraders);

// 获取单个 Trader
router.get('/traders/:traderId', requirePrivyAuth, getTrader);

// 创建 Trader
router.post('/traders', requirePrivyAuth, createTrader);

// 更新 Trader
router.put('/traders/:traderId', requirePrivyAuth, updateTrader);

// 删除 Trader
router.delete('/traders/:traderId', requirePrivyAuth, deleteTrader);

// 同步 Traders（替换全部）
router.put('/traders/sync', requirePrivyAuth, syncTraders);

/**
 * Trade History 路由 (需要认证)
 */

// 获取 Trader 的交易历史
router.get('/traders/:traderId/trade-history', requirePrivyAuth, getTraderTradeHistory);

// 获取 Trader 的持仓
router.get('/traders/:traderId/positions', requirePrivyAuth, getTraderPositions);

// 获取 Trader 的投资组合实时价值
router.get('/traders/:traderId/portfolio-value', requirePrivyAuth, getTraderPortfolioValue);

// 获取 Trader 的性能统计
router.get('/traders/:traderId/stats', requirePrivyAuth, getTraderStatsHandler);

/**
 * Analysis History 路由 (需要认证)
 */

// 获取 Trader 的分析历史
router.get('/traders/:traderId/analysis-history', requirePrivyAuth, getAnalysisHistory);

// 保存分析结果
router.post('/traders/:traderId/analysis-history', requirePrivyAuth, saveAnalysisHistory);

// 清空分析历史
router.delete('/traders/:traderId/analysis-history', requirePrivyAuth, clearAnalysisHistory);

// 标记分析为已执行（交易已下单）
router.patch('/analysis-history/:analysisId/executed', requirePrivyAuth, markAnalysisExecuted);

/**
 * Price Cache 路由 (公开，无需认证)
 * 用于前端快速获取缓存价格
 */

// 获取缓存状态
router.get('/prices/status', getPriceCacheStatus);

// 批量获取价格（POST 因为可能有很多 tokenIds）
router.post('/prices/batch', getTokenPrices);

// 订阅 token 价格更新
router.post('/prices/subscribe', subscribeToTokens);

// 获取单个 token 价格
router.get('/prices/:tokenId', getTokenPrice);

/**
 * Market Cache 路由 (公开，无需认证)
 * 用于前端快速获取市场元数据
 */

// 获取市场缓存状态
router.get('/markets/cache/status', getMarketCacheStatus);

// 批量获取市场数据（POST 因为可能有很多 marketIds）
router.post('/markets/batch', getMarketsData);

// 获取单个市场数据
router.get('/markets/:marketId', getMarketData);

/**
 * Candlesticks 路由 (公开，无需认证)
 * 从 Dome API 获取 K 线数据
 */

// 获取市场 K 线数据
router.get('/candlesticks/:conditionId', getCandlesticks);

/**
 * Community Sentiment 路由 (需要认证 + 每日用量限制)
 * 分析 Polymarket 事件的社区评论情绪
 */

// 分析评论情绪（每日免费 5 次）
router.post('/analyze-comments', requirePrivyAuth, sentimentUsageLimiter, analyzeEventComments);

/**
 * API 代理路由 (公开，无需认证)
 * 用于解决前端 CORS 问题
 */

// 代理 Gamma API 请求
// GET /api/polymarket/gamma-api/*
router.get('/gamma-api/*', proxyGammaAPI);

// 代理 CLOB API 请求
// GET /api/polymarket/clob-api/*
router.get('/clob-api/*', proxyClobAPI);

/**
 * Timeline API 路由 (公开，无需认证)
 * 提供 K 线 + 事件注释的时间线数据
 */
router.get('/timeline/:conditionId', async (req, res) => {
  const { conditionId } = req.params;
  const { title, period = '7d', interval, impactFilter = 'all', tokenId } = req.query;

  if (!conditionId) {
    return res.status(400).json({ success: false, error: 'conditionId is required' });
  }

  try {
    const { getTimelineData } = await import('../services/polymarket/timeline.service.js');
    const data = await getTimelineData(conditionId, title || '', {
      period,
      interval: interval || undefined,
      impactFilter,
      tokenId: tokenId || undefined
    });

    res.json({ success: true, data });
  } catch (error) {
    console.error('[Timeline API] Error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 新闻 API 路由 (公开，无需认证)
 * 从 Google News 获取相关新闻
 */
router.get('/news', async (req, res) => {
  const { query, limit = 5 } = req.query;
  
  if (!query) {
    return res.json({ success: true, articles: [] });
  }
  
  try {
    const { fetchGoogleNewsData } = await import('../services/polymarket/free-data.service.js');
    const newsData = await fetchGoogleNewsData(query, { maxResults: parseInt(limit) });
    
    if (!newsData || !newsData.articles) {
      return res.json({ success: true, articles: [] });
    }
    
    // 为每篇文章添加简单的情绪分析
    const articlesWithSentiment = newsData.articles.map(article => {
      const title = (article.title || '').toLowerCase();
      let sentiment = 'neutral';
      
      // 简单的情绪关键词检测
      const positiveWords = ['surge', 'rise', 'win', 'lead', 'ahead', 'gain', 'success', 'boost'];
      const negativeWords = ['fall', 'drop', 'lose', 'behind', 'fail', 'crash', 'decline', 'slip'];
      
      if (positiveWords.some(word => title.includes(word))) {
        sentiment = 'positive';
      } else if (negativeWords.some(word => title.includes(word))) {
        sentiment = 'negative';
      }
      
      return {
        ...article,
        sentiment,
        url: article.link
      };
    });
    
    res.json({
      success: true,
      articles: articlesWithSentiment
    });
  } catch (error) {
    console.error('[News API] Error:', error.message);
    res.json({ success: true, articles: [] });
  }
});

export default router;
