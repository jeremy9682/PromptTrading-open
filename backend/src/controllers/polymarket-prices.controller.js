/**
 * Polymarket Prices Controller
 * 
 * 提供价格缓存查询 API
 * 所有价格从内存缓存读取，响应时间 < 10ms
 */

import {
  getPrice,
  getPrices,
  getAllPrices,
  getCacheStatus,
  subscribeTokens,
  refreshPrice,
} from '../services/polymarket/price-cache.service.js';

/**
 * 获取单个 token 的价格
 * GET /api/polymarket/prices/:tokenId
 */
export async function getTokenPrice(req, res) {
  try {
    const { tokenId } = req.params;

    if (!tokenId) {
      return res.status(400).json({
        success: false,
        error: 'tokenId is required'
      });
    }

    // 从缓存获取价格
    let priceData = getPrice(tokenId);

    // 如果没有缓存，订阅并获取
    if (!priceData) {
      await subscribeTokens([tokenId]);
      priceData = getPrice(tokenId);
    }

    // 如果缓存过期，刷新
    if (priceData?.isStale) {
      const freshPrice = await refreshPrice(tokenId);
      if (freshPrice) {
        priceData = getPrice(tokenId);
      }
    }

    res.json({
      success: true,
      data: priceData || { price: null, error: 'Price not available' }
    });

  } catch (error) {
    console.error('Error getting token price:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get price',
      message: error.message
    });
  }
}

/**
 * 批量获取 token 价格
 * POST /api/polymarket/prices/batch
 * Body: { tokenIds: string[] }
 */
export async function getTokenPrices(req, res) {
  try {
    const { tokenIds } = req.body;

    if (!tokenIds || !Array.isArray(tokenIds) || tokenIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'tokenIds array is required'
      });
    }

    // 限制批量请求大小
    if (tokenIds.length > 100) {
      return res.status(400).json({
        success: false,
        error: 'Maximum 100 tokens per request'
      });
    }

    // 订阅所有 token（确保它们被缓存追踪）
    await subscribeTokens(tokenIds);

    // 从缓存获取价格
    const pricesMap = getPrices(tokenIds);
    
    // 转换为对象格式
    const prices = {};
    for (const [tokenId, data] of pricesMap) {
      prices[tokenId] = data;
    }

    // 找出缺失的 token
    const missingTokens = tokenIds.filter(id => !prices[id]);

    res.json({
      success: true,
      data: {
        prices,
        missing: missingTokens,
        count: Object.keys(prices).length
      }
    });

  } catch (error) {
    console.error('Error getting token prices:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get prices',
      message: error.message
    });
  }
}

/**
 * 获取价格缓存状态
 * GET /api/polymarket/prices/status
 */
export function getPriceCacheStatus(req, res) {
  try {
    const status = getCacheStatus();
    const allPrices = getAllPrices();
    
    res.json({
      success: true,
      data: {
        ...status,
        samplePrices: Object.entries(allPrices).slice(0, 5).map(([tokenId, data]) => ({
          tokenId: tokenId.slice(0, 20) + '...',
          price: data.price,
          lastUpdate: new Date(data.lastUpdate).toISOString(),
          isStale: data.isStale
        }))
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

/**
 * 订阅 token 价格更新
 * POST /api/polymarket/prices/subscribe
 * Body: { tokenIds: string[] }
 */
export async function subscribeToTokens(req, res) {
  try {
    const { tokenIds } = req.body;

    if (!tokenIds || !Array.isArray(tokenIds) || tokenIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'tokenIds array is required'
      });
    }

    // 限制订阅数量
    if (tokenIds.length > 50) {
      return res.status(400).json({
        success: false,
        error: 'Maximum 50 tokens per subscription request'
      });
    }

    await subscribeTokens(tokenIds);

    res.json({
      success: true,
      message: `Subscribed to ${tokenIds.length} tokens`,
      data: getCacheStatus()
    });

  } catch (error) {
    console.error('Error subscribing to tokens:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to subscribe',
      message: error.message
    });
  }
}

export default {
  getTokenPrice,
  getTokenPrices,
  getPriceCacheStatus,
  subscribeToTokens,
};
