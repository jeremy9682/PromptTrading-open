/**
 * 价格查询服务
 * 用于获取当前市场价格
 */

import axios from 'axios';
import { getInfoAPI } from '../../config/hyperliquid.config.js';

const HYPERLIQUID_INFO_API = getInfoAPI(true);  // 测试网

/**
 * 获取币种当前价格
 * @param {string} coin - 币种符号
 * @returns {Promise<number>} 当前价格
 */
export const getCurrentPrice = async (coin) => {
  try {
    const response = await axios.post(HYPERLIQUID_INFO_API, {
      type: 'allMids'
    });
    
    const coinUpper = coin.toUpperCase();
    const price = response.data[coinUpper];
    
    if (!price) {
      throw new Error(`无法获取 ${coin} 的价格`);
    }
    
    return parseFloat(price);
  } catch (error) {
    console.error(`获取 ${coin} 价格失败:`, error.message);
    throw error;
  }
};

/**
 * 计算价格精度（根据币种和价格大小）
 * @param {string} coin - 币种
 * @param {number} price - 价格
 * @returns {number} 小数位数
 */
const getPriceDecimals = (coin, price) => {
  const coinUpper = coin.toUpperCase();
  
  // BTC, ETH 等高价币种
  if (['BTC', 'ETH'].includes(coinUpper)) {
    if (price >= 10000) return 0;  // 整数
    if (price >= 1000) return 1;
    return 2;
  }
  
  // 中等价格币种
  if (price >= 100) return 1;
  if (price >= 10) return 2;
  if (price >= 1) return 3;
  
  // 低价币种
  return 5;
};

/**
 * 四舍五入到指定精度
 * @param {number} value - 数值
 * @param {number} decimals - 小数位数
 * @returns {number} 四舍五入后的值
 */
const roundToDecimals = (value, decimals) => {
  return Math.round(value * Math.pow(10, decimals)) / Math.pow(10, decimals);
};

/**
 * 计算市价单的限价（基于当前价格的滑点）
 * @param {number} currentPrice - 当前价格
 * @param {string} side - BUY/SELL
 * @param {string} coin - 币种符号
 * @param {number} slippage - 滑点百分比（默认 0.5%）
 * @returns {number} 限价
 */
export const calculateMarketOrderPrice = (currentPrice, side, coin, slippage = 0.5) => {
  const slippageMultiplier = 1 + (slippage / 100);
  
  let price;
  if (side === 'BUY') {
    // 买入时，使用稍高的价格确保成交
    price = currentPrice * slippageMultiplier;
  } else {
    // 卖出时，使用稍低的价格确保成交
    price = currentPrice / slippageMultiplier;
  }
  
  // 根据币种和价格大小确定精度
  const decimals = getPriceDecimals(coin, currentPrice);
  return roundToDecimals(price, decimals);
};

