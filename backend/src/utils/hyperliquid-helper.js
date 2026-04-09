/**
 * Hyperliquid 辅助工具
 * 币种映射、订单格式转换等
 */

/**
 * 币种符号到 Asset Index 的映射
 * 参考: https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api
 */
export const COIN_TO_ASSET_INDEX = {
  'BTC': 0,
  'ETH': 1,
  'SOL': 2,
  'MATIC': 3,
  'ARB': 4,
  'OP': 5,
  'APE': 6,
  'APT': 7,
  'LTC': 8,
  'BCH': 9,
  'COMP': 10,
  'LDO': 11,
  'SHIB': 12,
  'CRV': 13,
  'DOGE': 14,
  'ATOM': 15,
  'MKR': 16,
  'SNX': 17,
  'BLUR': 18,
  'PEPE': 19,
  'SEI': 20,
  'XRP': 21,
  'STX': 22,
  'KPEPE': 23,
  'KSHIB': 24,
  'FTM': 25,
  'BNB': 26,
  'XLM': 27,
  'ADA': 28,
  'TRX': 29,
  'AVAX': 30,
  'WLD': 31,
  'TIA': 32,
  'SUI': 33,
  'LINK': 34,
  'UNI': 35,
  'ORDI': 36,
  'HYPE': 37,
  'NEAR': 38,
  'WIF': 39,
  'BONK': 40,
  'DOT': 41,
};

/**
 * 获取币种的 Asset Index
 * @param {string} coin - 币种符号
 * @returns {number} Asset Index
 */
export const getAssetIndex = (coin) => {
  const index = COIN_TO_ASSET_INDEX[coin.toUpperCase()];
  if (index === undefined) {
    throw new Error(`不支持的币种: ${coin}`);
  }
  return index;
};

/**
 * 将订单参数转换为 Hyperliquid 格式
 * @param {Object} params - 订单参数
 * @returns {Object} Hyperliquid 订单格式
 */
export const buildHyperliquidOrder = (params) => {
  const { coin, side, quantity, limitPrice, orderType = 'market' } = params;
  
  const assetIndex = getAssetIndex(coin);
  
  const order = {
    a: assetIndex,
    b: side === 'BUY',
    p: limitPrice ? limitPrice.toString() : '0', // 市价单用 '0'
    s: quantity.toString(),
    r: false, // reduce_only
    t: orderType === 'market' 
      ? { limit: { tif: 'Ioc' } } // Immediate or Cancel (市价单)
      : { limit: { tif: 'Gtc' } } // Good til Cancel (限价单)
  };
  
  return order;
};

/**
 * 格式化价格（确保符合 Hyperliquid 要求）
 * @param {number} price - 价格
 * @param {string} coin - 币种
 * @returns {string} 格式化的价格
 */
export const formatPrice = (price, coin) => {
  // BTC/ETH 等高价币种使用更多小数位
  if (['BTC', 'ETH'].includes(coin.toUpperCase())) {
    return price.toFixed(1);
  }
  return price.toFixed(4);
};

/**
 * 格式化数量
 * @param {number} size - 数量
 * @returns {string} 格式化的数量
 */
export const formatSize = (size) => {
  return size.toString();
};

