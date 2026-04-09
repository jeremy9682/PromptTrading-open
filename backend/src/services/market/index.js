/**
 * 市场数据服务 - 统一接口
 * 整合 Binance、CoinGecko、Hyperliquid 数据源
 */

import * as binanceService from './binance.service.js';
import * as coingeckoService from './coingecko.service.js';
import * as hyperliquidDataService from './hyperliquid-data.service.js';
import * as indicatorsService from './indicators.service.js';

/**
 * 将时间间隔字符串转换为毫秒
 * @param {string} interval - 时间间隔 ('1m', '3m', '5m', '15m', '1h', '4h', '1d')
 * @returns {number} 毫秒数
 */
const getIntervalMs = (interval) => {
  const intervalMap = {
    '1m': 60 * 1000,
    '3m': 3 * 60 * 1000,
    '5m': 5 * 60 * 1000,
    '15m': 15 * 60 * 1000,
    '1h': 60 * 60 * 1000,
    '4h': 4 * 60 * 60 * 1000,
    '1d': 24 * 60 * 60 * 1000
  };
  return intervalMap[interval] || 3 * 60 * 1000; // 默认 3 分钟
};

/**
 * 从 K线数据计算 24小时统计
 * @param {Object[]} klines - K线数据
 * @returns {Object} 24h 统计数据
 */
const calculate24hStats = (klines) => {
  if (!klines || klines.length === 0) {
    return {
      highPrice: 0,
      lowPrice: 0,
      priceChange: 0,
      priceChangePercent: 0
    };
  }

  const prices = klines.map(k => k.close);
  const firstPrice = klines[0].close;
  const lastPrice = klines[klines.length - 1].close;
  
  return {
    highPrice: Math.max(...klines.map(k => k.high)),
    lowPrice: Math.min(...klines.map(k => k.low)),
    priceChange: lastPrice - firstPrice,
    priceChangePercent: ((lastPrice - firstPrice) / firstPrice) * 100
  };
};

/**
 * 获取单个币种的完整市场数据
 * @param {string} coin - 币种符号 (BTC, ETH, etc.)
 * @param {string} interval - K线时间间隔，默认 '3m'
 * @param {number} limit - K线数据条数，默认 100
 * @returns {Promise} 完整市场数据
 */
export const getCoinMarketData = async (coin, interval = '3m', limit = 100) => {
  try {
    // 直接使用 Hyperliquid（跳过 Binance 以提升速度）
    let klines, stats24h;
    let dataSource = 'hyperliquid';

    console.log(`获取 ${coin} 市场数据（使用 Hyperliquid）...`);
    
    const endTime = Date.now();
    const startTime = endTime - (limit * getIntervalMs(interval));
    
    klines = await hyperliquidDataService.getCandles(coin, interval, startTime, endTime);
    stats24h = calculate24hStats(klines);

    // 获取 Hyperliquid 合约数据
    const hyperliquidMetrics = await hyperliquidDataService.getCoinMetrics(coin).catch(err => {
      console.warn(`Hyperliquid 合约数据获取失败 [${coin}]:`, err.message);
      return null;
    });

    // 计算技术指标
    const indicators = indicatorsService.calculateAllIndicators(klines);
    const timeSeries = indicatorsService.generateIndicatorTimeSeries(klines, 10);

    // 当前价格和最新数据
    const latestCandle = klines[klines.length - 1];
    const currentPrice = latestCandle.close;

    return {
      coin: coin.toUpperCase(),
      timestamp: Date.now(),
      dataSource, // 标记数据来源
      
      // 价格信息
      price: {
        current: currentPrice,
        high24h: stats24h.highPrice,
        low24h: stats24h.lowPrice,
        change24h: stats24h.priceChange,
        changePercent24h: stats24h.priceChangePercent
      },

      // 技术指标（当前值）
      indicators: {
        ema20: indicators.ema20,
        ema50: indicators.ema50,
        macd: indicators.macd?.MACD || null,
        macdSignal: indicators.macd?.signal || null,
        macdHistogram: indicators.macd?.histogram || null,
        rsi7: indicators.rsi7,
        rsi14: indicators.rsi14,
        atr3: indicators.atr3,
        atr14: indicators.atr14
      },

      // 时间序列（最近10个数据点）
      timeSeries,

      // 交易量
      volume: {
        volume24h: stats24h.volume,
        quoteVolume24h: stats24h.quoteVolume,
        current: latestCandle.volume
      },

      // Hyperliquid 合约数据
      perpetual: hyperliquidMetrics ? {
        openInterest: hyperliquidMetrics.openInterest,
        fundingRate: hyperliquidMetrics.fundingRate,
        volume24h: hyperliquidMetrics.volume24h,
        premium: hyperliquidMetrics.premium
      } : null,

      // 原始 K线数据
      klines: klines.slice(-50) // 只返回最近50根K线
    };

  } catch (error) {
    console.error(`获取市场数据错误 [${coin}]:`, error.message);
    throw new Error(`无法获取 ${coin} 市场数据: ${error.message}`);
  }
};

/**
 * 批量获取多个币种的市场数据
 * @param {string[]} coins - 币种符号数组
 * @param {string} interval - K线时间间隔
 * @param {number} limit - K线数据条数
 * @returns {Promise<Object>} 市场数据对象 { BTC: {...}, ETH: {...}, ... }
 */
export const getBatchMarketData = async (coins, interval = '3m', limit = 100) => {
  try {
    const results = await Promise.allSettled(
      coins.map(coin => getCoinMarketData(coin, interval, limit))
    );

    const marketData = {};
    
    results.forEach((result, index) => {
      const coin = coins[index];
      if (result.status === 'fulfilled') {
        marketData[coin.toUpperCase()] = result.value;
      } else {
        console.error(`获取 ${coin} 数据失败:`, result.reason);
        marketData[coin.toUpperCase()] = {
          error: result.reason.message,
          coin: coin.toUpperCase(),
          timestamp: Date.now()
        };
      }
    });

    return marketData;

  } catch (error) {
    console.error('批量获取市场数据错误:', error.message);
    throw error;
  }
};

/**
 * 获取 4 小时级别的长期趋势数据
 * @param {string} coin - 币种符号
 * @returns {Promise} 长期趋势数据
 */
export const getLongTermTrend = async (coin) => {
  try {
    // 直接使用 Hyperliquid（跳过 Binance）
    const endTime = Date.now();
    const startTime = endTime - (50 * 4 * 60 * 60 * 1000); // 50 * 4小时
    const klines = await hyperliquidDataService.getCandles(coin, '4h', startTime, endTime);
    
    // 计算长期指标
    const closePrices = klines.map(k => k.close);
    const ema20_4h = indicatorsService.calculateEMA(closePrices, 20);
    const ema50_4h = indicatorsService.calculateEMA(closePrices, 50);
    const macd_4h = indicatorsService.calculateMACD(closePrices);
    const rsi14_4h = indicatorsService.calculateRSI(closePrices, 14);
    const atr3_4h = indicatorsService.calculateATR(klines, 3);
    const atr14_4h = indicatorsService.calculateATR(klines, 14);

    // 平均交易量
    const volumes = klines.map(k => k.volume);
    const avgVolume = volumes.reduce((a, b) => a + b, 0) / volumes.length;

    return {
      timeframe: '4h',
      ema20: ema20_4h.slice(-10),
      ema50: ema50_4h.slice(-10),
      macd: macd_4h.slice(-10).map(m => m.MACD),
      rsi14: rsi14_4h.slice(-10),
      atr3: atr3_4h[atr3_4h.length - 1],
      atr14: atr14_4h[atr14_4h.length - 1],
      currentVolume: klines[klines.length - 1].volume,
      avgVolume
    };

  } catch (error) {
    console.error(`获取长期趋势数据错误 [${coin}]:`, error.message);
    throw error;
  }
};

/**
 * 生成用于 AI Prompt 的市场数据摘要
 * @param {Object} marketData - 完整市场数据
 * @returns {string} 格式化的文本摘要
 */
export const generateMarketDataSummary = (marketData) => {
  const { coin, price, indicators, volume, perpetual } = marketData;

  let summary = `\n## ${coin} 数据\n`;
  summary += `当前价格 = ${price.current.toFixed(2)}, `;
  summary += `当前EMA20 = ${indicators.ema20?.toFixed(2) || 'N/A'}, `;
  summary += `当前MACD = ${indicators.macd?.toFixed(3) || 'N/A'}, `;
  summary += `当前RSI(7周期) = ${indicators.rsi7?.toFixed(3) || 'N/A'}\n`;

  if (perpetual) {
    summary += `未平仓合约: ${perpetual.openInterest.toFixed(2)}\n`;
    summary += `资金费率: ${perpetual.fundingRate.toExponential(4)}\n`;
  }

  summary += `24小时交易量: ${volume.volume24h.toFixed(2)}\n`;

  return summary;
};

// 导出所有子服务
export { 
  binanceService, 
  coingeckoService, 
  hyperliquidDataService, 
  indicatorsService 
};

