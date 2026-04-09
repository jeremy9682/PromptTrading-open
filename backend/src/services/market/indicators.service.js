/**
 * 技术指标计算服务
 * 使用 technicalindicators 库计算 EMA, MACD, RSI, ATR 等
 * 文档: https://github.com/anandanand84/technicalindicators
 */

import { 
  EMA, 
  MACD, 
  RSI, 
  ATR,
  SMA
} from 'technicalindicators';

/**
 * 计算 EMA (指数移动平均线)
 * @param {number[]} prices - 价格数组
 * @param {number} period - 周期，默认 20
 * @returns {number[]} EMA 数组
 */
export const calculateEMA = (prices, period = 20) => {
  try {
    if (prices.length < period) {
      throw new Error(`数据不足: 需要至少 ${period} 个数据点`);
    }

    const emaValues = EMA.calculate({
      values: prices,
      period: period
    });

    return emaValues;

  } catch (error) {
    console.error('计算 EMA 错误:', error.message);
    throw error;
  }
};

/**
 * 计算 MACD (移动平均收敛散度)
 * @param {number[]} prices - 价格数组
 * @param {number} fastPeriod - 快线周期，默认 12
 * @param {number} slowPeriod - 慢线周期，默认 26
 * @param {number} signalPeriod - 信号线周期，默认 9
 * @returns {Object[]} MACD 数组 [{ MACD, signal, histogram }]
 */
export const calculateMACD = (prices, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) => {
  try {
    if (prices.length < slowPeriod + signalPeriod) {
      throw new Error(`数据不足: 需要至少 ${slowPeriod + signalPeriod} 个数据点`);
    }

    const macdValues = MACD.calculate({
      values: prices,
      fastPeriod,
      slowPeriod,
      signalPeriod,
      SimpleMAOscillator: false,
      SimpleMASignal: false
    });

    return macdValues;

  } catch (error) {
    console.error('计算 MACD 错误:', error.message);
    throw error;
  }
};

/**
 * 计算 RSI (相对强弱指标)
 * @param {number[]} prices - 价格数组
 * @param {number} period - 周期，默认 14
 * @returns {number[]} RSI 数组
 */
export const calculateRSI = (prices, period = 14) => {
  try {
    if (prices.length < period + 1) {
      throw new Error(`数据不足: 需要至少 ${period + 1} 个数据点`);
    }

    const rsiValues = RSI.calculate({
      values: prices,
      period: period
    });

    return rsiValues;

  } catch (error) {
    console.error('计算 RSI 错误:', error.message);
    throw error;
  }
};

/**
 * 计算 ATR (平均真实波幅)
 * @param {Object[]} candles - K线数据 [{ high, low, close }]
 * @param {number} period - 周期，默认 14
 * @returns {number[]} ATR 数组
 */
export const calculateATR = (candles, period = 14) => {
  try {
    if (candles.length < period + 1) {
      throw new Error(`数据不足: 需要至少 ${period + 1} 个数据点`);
    }

    const atrValues = ATR.calculate({
      high: candles.map(c => c.high),
      low: candles.map(c => c.low),
      close: candles.map(c => c.close),
      period: period
    });

    return atrValues;

  } catch (error) {
    console.error('计算 ATR 错误:', error.message);
    throw error;
  }
};

/**
 * 计算 SMA (简单移动平均线)
 * @param {number[]} prices - 价格数组
 * @param {number} period - 周期
 * @returns {number[]} SMA 数组
 */
export const calculateSMA = (prices, period = 20) => {
  try {
    if (prices.length < period) {
      throw new Error(`数据不足: 需要至少 ${period} 个数据点`);
    }

    const smaValues = SMA.calculate({
      values: prices,
      period: period
    });

    return smaValues;

  } catch (error) {
    console.error('计算 SMA 错误:', error.message);
    throw error;
  }
};

/**
 * 计算完整的技术指标集合
 * @param {Object[]} candles - K线数据
 * @returns {Object} 所有指标
 */
export const calculateAllIndicators = (candles) => {
  try {
    const closePrices = candles.map(c => c.close);

    const ema20 = calculateEMA(closePrices, 20);
    const ema50 = calculateEMA(closePrices, 50);
    const macd = calculateMACD(closePrices);
    const rsi7 = calculateRSI(closePrices, 7);
    const rsi14 = calculateRSI(closePrices, 14);
    const atr3 = calculateATR(candles, 3);
    const atr14 = calculateATR(candles, 14);

    return {
      ema20: ema20[ema20.length - 1] || null,
      ema50: ema50[ema50.length - 1] || null,
      macd: macd[macd.length - 1] || null,
      rsi7: rsi7[rsi7.length - 1] || null,
      rsi14: rsi14[rsi14.length - 1] || null,
      atr3: atr3[atr3.length - 1] || null,
      atr14: atr14[atr14.length - 1] || null,
      // 返回完整数组用于图表展示
      ema20Array: ema20,
      ema50Array: ema50,
      macdArray: macd,
      rsi7Array: rsi7,
      rsi14Array: rsi14,
      atr3Array: atr3,
      atr14Array: atr14
    };

  } catch (error) {
    console.error('计算全部指标错误:', error.message);
    throw error;
  }
};

/**
 * 生成用于 Prompt 的指标时间序列
 * @param {Object[]} candles - K线数据
 * @param {number} count - 返回最近 N 个数据点
 * @returns {Object} 格式化的指标时间序列
 */
export const generateIndicatorTimeSeries = (candles, count = 10) => {
  try {
    const closePrices = candles.map(c => c.close);
    
    const ema20 = calculateEMA(closePrices, 20);
    const macd = calculateMACD(closePrices);
    const rsi7 = calculateRSI(closePrices, 7);
    const rsi14 = calculateRSI(closePrices, 14);
    const atr14 = calculateATR(candles, 14);

    // 获取最近的 N 个数据点
    const getLastN = (arr, n) => arr.slice(-n);

    return {
      prices: getLastN(closePrices, count),
      ema20: getLastN(ema20, count),
      macd: getLastN(macd.map(m => m.MACD), count),
      rsi7: getLastN(rsi7, count),
      rsi14: getLastN(rsi14, count),
      volumes: getLastN(candles.map(c => c.volume), count)
    };

  } catch (error) {
    console.error('生成指标时间序列错误:', error.message);
    throw error;
  }
};


