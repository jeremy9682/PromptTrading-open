/**
 * CoinGecko API 服务
 * 免费 API，获取价格、市值等数据
 * 文档: https://www.coingecko.com/en/api/documentation
 */

import axios from 'axios';

const COINGECKO_API_BASE = 'https://api.coingecko.com/api/v3';

// 币种 ID 映射 (CoinGecko 使用 ID 而不是符号)
const COIN_ID_MAP = {
  'BTC': 'bitcoin',
  'ETH': 'ethereum',
  'SOL': 'solana',
  'BNB': 'binancecoin',
  'XRP': 'ripple',
  'DOGE': 'dogecoin',
  'AVAX': 'avalanche-2',
  'MATIC': 'matic-network',
  'LINK': 'chainlink',
  'UNI': 'uniswap',
  'ATOM': 'cosmos',
  'LTC': 'litecoin',
  'DOT': 'polkadot',
  'ADA': 'cardano',
  'NEAR': 'near',
  'APT': 'aptos',
  'ARB': 'arbitrum',
  'OP': 'optimism',
  'SUI': 'sui',
  'FTM': 'fantom',
  'PEPE': 'pepe',
  'SHIB': 'shiba-inu',
  'WIF': 'dogwifcoin',
  'BONK': 'bonk'
};

/**
 * 获取单个币种的价格和市场数据
 * @param {string} coin - 币种符号
 * @returns {Promise} 市场数据
 */
export const getCoinData = async (coin) => {
  try {
    const coinId = COIN_ID_MAP[coin.toUpperCase()];
    if (!coinId) {
      throw new Error(`不支持的币种: ${coin}`);
    }

    const response = await axios.get(`${COINGECKO_API_BASE}/simple/price`, {
      params: {
        ids: coinId,
        vs_currencies: 'usd',
        include_market_cap: true,
        include_24hr_vol: true,
        include_24hr_change: true
      },
      timeout: 5000
    });

    const data = response.data[coinId];
    return {
      price: data.usd,
      marketCap: data.usd_market_cap,
      volume24h: data.usd_24h_vol,
      change24h: data.usd_24h_change
    };

  } catch (error) {
    console.error(`CoinGecko getCoinData 错误 [${coin}]:`, error.message);
    throw new Error(`无法获取 ${coin} CoinGecko 数据: ${error.message}`);
  }
};

/**
 * 批量获取多个币种的价格
 * @param {string[]} coins - 币种符号数组
 * @returns {Promise<Object>} 价格对象
 */
export const getBatchPrices = async (coins) => {
  try {
    const coinIds = coins
      .map(coin => COIN_ID_MAP[coin.toUpperCase()])
      .filter(id => id);

    if (coinIds.length === 0) {
      throw new Error('没有有效的币种');
    }

    const response = await axios.get(`${COINGECKO_API_BASE}/simple/price`, {
      params: {
        ids: coinIds.join(','),
        vs_currencies: 'usd'
      },
      timeout: 5000
    });

    // 转换回币种符号格式
    const result = {};
    Object.entries(COIN_ID_MAP).forEach(([symbol, id]) => {
      if (response.data[id]) {
        result[symbol] = response.data[id].usd;
      }
    });

    return result;

  } catch (error) {
    console.error('CoinGecko getBatchPrices 错误:', error.message);
    throw new Error(`批量获取价格失败: ${error.message}`);
  }
};

/**
 * 获取历史价格数据
 * @param {string} coin - 币种符号
 * @param {number} days - 天数 (1-365)
 * @returns {Promise} 历史价格数组
 */
export const getHistoricalData = async (coin, days = 7) => {
  try {
    const coinId = COIN_ID_MAP[coin.toUpperCase()];
    if (!coinId) {
      throw new Error(`不支持的币种: ${coin}`);
    }

    const response = await axios.get(`${COINGECKO_API_BASE}/coins/${coinId}/market_chart`, {
      params: {
        vs_currency: 'usd',
        days: days
      },
      timeout: 10000
    });

    return {
      prices: response.data.prices.map(p => ({ time: p[0], price: p[1] })),
      volumes: response.data.total_volumes.map(v => ({ time: v[0], volume: v[1] })),
      marketCaps: response.data.market_caps.map(m => ({ time: m[0], marketCap: m[1] }))
    };

  } catch (error) {
    console.error(`CoinGecko getHistoricalData 错误 [${coin}]:`, error.message);
    throw new Error(`无法获取 ${coin} 历史数据: ${error.message}`);
  }
};


