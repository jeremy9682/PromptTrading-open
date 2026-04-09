/**
 * Hyperliquid 市场数据服务
 * 获取 Open Interest、Funding Rate 等合约数据
 * 文档: https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api
 */

import axios from 'axios';

const HYPERLIQUID_API_BASE = 'https://api.hyperliquid.xyz/info';

/**
 * 获取所有市场的元数据和资产上下文
 * 包括 Open Interest 和 Funding Rate
 * @returns {Promise} 市场数据
 */
export const getMetaAndAssetCtxs = async () => {
  try {
    const response = await axios.post(
      HYPERLIQUID_API_BASE,
      { type: 'metaAndAssetCtxs' },
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 5000
      }
    );

    return response.data;

  } catch (error) {
    console.error('Hyperliquid getMetaAndAssetCtxs 错误:', error.message);
    throw new Error(`无法获取 Hyperliquid 市场数据: ${error.message}`);
  }
};

/**
 * 获取单个币种的 Open Interest 和 Funding Rate
 * @param {string} coin - 币种符号 (BTC, ETH, etc.)
 * @returns {Promise} { openInterest, fundingRate }
 */
export const getCoinMetrics = async (coin) => {
  try {
    const data = await getMetaAndAssetCtxs();
    
    // 查找对应的币种
    const assetIndex = data[0].universe.findIndex(
      u => u.name.toUpperCase() === coin.toUpperCase()
    );

    if (assetIndex === -1) {
      throw new Error(`Hyperliquid 不支持币种: ${coin}`);
    }

    const assetCtx = data[1][assetIndex];

    return {
      coin: coin.toUpperCase(),
      openInterest: parseFloat(assetCtx.openInterest),
      fundingRate: parseFloat(assetCtx.funding),
      volume24h: parseFloat(assetCtx.dayNtlVlm || 0),
      premium: parseFloat(assetCtx.premium || 0)
    };

  } catch (error) {
    console.error(`Hyperliquid getCoinMetrics 错误 [${coin}]:`, error.message);
    throw new Error(`无法获取 ${coin} Hyperliquid 数据: ${error.message}`);
  }
};

/**
 * 批量获取多个币种的 OI 和 Funding Rate
 * @param {string[]} coins - 币种符号数组
 * @returns {Promise<Object>} { BTC: {...}, ETH: {...}, ... }
 */
export const getBatchMetrics = async (coins) => {
  try {
    const data = await getMetaAndAssetCtxs();
    const universe = data[0].universe;
    const assetCtxs = data[1];

    const result = {};

    coins.forEach(coin => {
      const assetIndex = universe.findIndex(
        u => u.name.toUpperCase() === coin.toUpperCase()
      );

      if (assetIndex !== -1) {
        const assetCtx = assetCtxs[assetIndex];
        result[coin.toUpperCase()] = {
          openInterest: parseFloat(assetCtx.openInterest),
          fundingRate: parseFloat(assetCtx.funding),
          volume24h: parseFloat(assetCtx.dayNtlVlm || 0),
          premium: parseFloat(assetCtx.premium || 0)
        };
      }
    });

    return result;

  } catch (error) {
    console.error('Hyperliquid getBatchMetrics 错误:', error.message);
    throw new Error(`批量获取 Hyperliquid 数据失败: ${error.message}`);
  }
};

/**
 * 获取 K线数据
 * @param {string} coin - 币种符号
 * @param {string} interval - 时间间隔: '1m', '15m', '1h', '4h', '1d'
 * @param {number} startTime - 开始时间戳 (毫秒)
 * @param {number} endTime - 结束时间戳 (毫秒)
 * @returns {Promise} K线数据数组
 */
export const getCandles = async (coin, interval, startTime, endTime) => {
  try {
    const response = await axios.post(
      HYPERLIQUID_API_BASE,
      {
        type: 'candleSnapshot',
        req: {
          coin: coin.toUpperCase(),
          interval,
          startTime,
          endTime
        }
      },
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 5000
      }
    );

    return response.data.map(candle => ({
      time: candle.t,
      open: parseFloat(candle.o),
      high: parseFloat(candle.h),
      low: parseFloat(candle.l),
      close: parseFloat(candle.c),
      volume: parseFloat(candle.v)
    }));

  } catch (error) {
    console.error(`Hyperliquid getCandles 错误 [${coin}]:`, error.message);
    throw new Error(`无法获取 ${coin} K线数据: ${error.message}`);
  }
};


