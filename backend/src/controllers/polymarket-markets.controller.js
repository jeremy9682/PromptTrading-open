/**
 * Polymarket Markets Controller
 * 
 * 提供市场元数据缓存查询 API
 * 所有数据从内存缓存读取，响应时间 < 10ms
 */

import {
  getMarket,
  getMarkets,
  getCacheStatus,
} from '../services/polymarket/market-cache.service.js';

/**
 * 获取单个市场数据
 * GET /api/polymarket/markets/:marketId
 */
export async function getMarketData(req, res) {
  try {
    const { marketId } = req.params;
    const { refresh } = req.query;

    if (!marketId) {
      return res.status(400).json({
        success: false,
        error: 'marketId is required'
      });
    }

    const market = await getMarket(marketId, refresh === 'true');

    if (!market) {
      return res.status(404).json({
        success: false,
        error: 'Market not found'
      });
    }

    res.json({
      success: true,
      data: market
    });

  } catch (error) {
    console.error('Error getting market data:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get market data',
      message: error.message
    });
  }
}

/**
 * 批量获取市场数据
 * POST /api/polymarket/markets/batch
 * Body: { marketIds: string[] }
 */
export async function getMarketsData(req, res) {
  try {
    const { marketIds } = req.body;

    if (!marketIds || !Array.isArray(marketIds) || marketIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'marketIds array is required'
      });
    }

    // 限制批量请求大小
    if (marketIds.length > 50) {
      return res.status(400).json({
        success: false,
        error: 'Maximum 50 markets per request'
      });
    }

    const marketsMap = await getMarkets(marketIds);
    
    // 转换为数组格式
    const markets = [];
    const missing = [];

    for (const id of marketIds) {
      const market = marketsMap.get(id);
      if (market) {
        markets.push(market);
      } else {
        missing.push(id);
      }
    }

    res.json({
      success: true,
      data: {
        markets,
        missing,
        count: markets.length
      }
    });

  } catch (error) {
    console.error('Error getting markets data:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get markets data',
      message: error.message
    });
  }
}

/**
 * 获取市场缓存状态
 * GET /api/polymarket/markets/cache/status
 */
export function getMarketCacheStatus(req, res) {
  try {
    const status = getCacheStatus();
    
    res.json({
      success: true,
      data: {
        ...status,
        staticTTLMinutes: status.staticTTL / 1000 / 60,
        dynamicTTLMinutes: status.dynamicTTL / 1000 / 60,
      }
    });

  } catch (error) {
    console.error('Error getting cache status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get cache status',
      message: error.message
    });
  }
}

export default {
  getMarketData,
  getMarketsData,
  getMarketCacheStatus,
};
