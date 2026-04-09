/**
 * Prompt 生成服务
 * 根据用户选择的数据源和币种，生成完整的 AI 分析 Prompt
 */

import { getCoinMarketData, getLongTermTrend } from '../market/index.js';
import { generateAccountPrompt } from '../hyperliquid/index.js';

/**
 * 生成单个币种的市场数据部分
 * @param {Object} marketData - 市场数据
 * @param {Object} dataSources - 用户选择的数据源
 * @param {Object} longTermData - 长期趋势数据
 * @param {string} language - 语言（'zh' 或 'en'）
 * @returns {string} 格式化的市场数据文本
 */
const formatCoinData = (marketData, dataSources, longTermData = null, language = 'zh') => {
  const { coin, price, indicators, volume, perpetual, timeSeries } = marketData;
  
  let text = language === 'zh' ? `\n## ${coin} 数据\n` : `\n## ${coin} Data\n`;
  
  // 当前价格和指标
  if (dataSources.price) {
    text += language === 'zh' ? `当前价格 = ${price.current.toFixed(2)}, ` : `Current Price = ${price.current.toFixed(2)}, `;
  }
  if (dataSources.ema && indicators.ema20) {
    text += language === 'zh' ? `当前EMA20 = ${indicators.ema20.toFixed(2)}, ` : `Current EMA20 = ${indicators.ema20.toFixed(2)}, `;
  }
  if (dataSources.macd && indicators.macd) {
    text += language === 'zh' ? `当前MACD = ${indicators.macd.toFixed(3)}, ` : `Current MACD = ${indicators.macd.toFixed(3)}, `;
  }
  if (dataSources.rsi && indicators.rsi7) {
    text += language === 'zh' ? `当前RSI(7周期) = ${indicators.rsi7.toFixed(3)}` : `Current RSI(7-period) = ${indicators.rsi7.toFixed(3)}`;
  }
  text += '\n';
  
  // Perpetual 数据（OI 和 Funding Rate）
  if (perpetual && (dataSources.oi || dataSources.funding)) {
    text += '\n';
    if (dataSources.oi) {
      text += language === 'zh' ? `未平仓合约: 最新 ${perpetual.openInterest.toFixed(2)}\n` : `Open Interest: Latest ${perpetual.openInterest.toFixed(2)}\n`;
    }
    if (dataSources.funding) {
      text += language === 'zh' ? `资金费率: ${perpetual.fundingRate.toExponential(4)}\n` : `Funding Rate: ${perpetual.fundingRate.toExponential(4)}\n`;
    }
  }
  
  // 时间序列数据（日内，最近10个数据点）
  text += language === 'zh' ? '\n日内时间序列（3分钟间隔，由旧到新）:\n' : '\nIntraday time series (3-min intervals, oldest to newest):\n';
  
  if (dataSources.price && timeSeries.prices) {
    text += language === 'zh' ? `价格: [${timeSeries.prices.map(p => p.toFixed(2)).join(', ')}]\n` : `Price: [${timeSeries.prices.map(p => p.toFixed(2)).join(', ')}]\n`;
  }
  
  if (dataSources.ema && timeSeries.ema20) {
    text += `EMA20: [${timeSeries.ema20.map(v => v.toFixed(2)).join(', ')}]\n`;
  }
  
  if (dataSources.macd && timeSeries.macd) {
    text += `MACD: [${timeSeries.macd.map(v => v.toFixed(3)).join(', ')}]\n`;
  }
  
  if (dataSources.rsi) {
    if (timeSeries.rsi7) {
      text += language === 'zh' ? `RSI(7周期): [${timeSeries.rsi7.map(v => v.toFixed(3)).join(', ')}]\n` : `RSI(7-period): [${timeSeries.rsi7.map(v => v.toFixed(3)).join(', ')}]\n`;
    }
    if (timeSeries.rsi14) {
      text += language === 'zh' ? `RSI(14周期): [${timeSeries.rsi14.map(v => v.toFixed(3)).join(', ')}]\n` : `RSI(14-period): [${timeSeries.rsi14.map(v => v.toFixed(3)).join(', ')}]\n`;
    }
  }
  
  if (dataSources.volume && timeSeries.volumes) {
    text += language === 'zh' ? `交易量: [${timeSeries.volumes.map(v => v.toFixed(2)).join(', ')}]\n` : `Volume: [${timeSeries.volumes.map(v => v.toFixed(2)).join(', ')}]\n`;
  }
  
  // 长期趋势（4小时级别）
  if (longTermData) {
    text += language === 'zh' ? '\n长期趋势（4小时级别）:\n' : '\nLong-term trend (4-hour level):\n';
    text += language === 'zh' ? `20周期 EMA: ${longTermData.ema20[longTermData.ema20.length - 1].toFixed(2)} ` : `20-period EMA: ${longTermData.ema20[longTermData.ema20.length - 1].toFixed(2)} `;
    text += language === 'zh' ? `vs. 50周期 EMA: ${longTermData.ema50[longTermData.ema50.length - 1].toFixed(2)}\n` : `vs. 50-period EMA: ${longTermData.ema50[longTermData.ema50.length - 1].toFixed(2)}\n`;
    text += language === 'zh' ? `ATR(3周期): ${longTermData.atr3.toFixed(3)} vs. ATR(14周期): ${longTermData.atr14.toFixed(3)}\n` : `ATR(3-period): ${longTermData.atr3.toFixed(3)} vs. ATR(14-period): ${longTermData.atr14.toFixed(3)}\n`;
    text += language === 'zh' ? `当前交易量: ${longTermData.currentVolume.toFixed(2)} vs. 平均交易量: ${longTermData.avgVolume.toFixed(2)}\n` : `Current Volume: ${longTermData.currentVolume.toFixed(2)} vs. Avg Volume: ${longTermData.avgVolume.toFixed(2)}\n`;
    
    text += `MACD: [${longTermData.macd.slice(-10).map(v => v.toFixed(3)).join(', ')}]\n`;
    text += language === 'zh' ? `RSI(14周期): [${longTermData.rsi14.slice(-10).map(v => v.toFixed(2)).join(', ')}]\n` : `RSI(14-period): [${longTermData.rsi14.slice(-10).map(v => v.toFixed(2)).join(', ')}]\n`;
  }
  
  return text;
};

/**
 * 生成用户 Prompt
 * @param {Object} config - 配置对象
 * @param {string[]} config.coins - 币种列表
 * @param {Object} config.dataSources - 数据源选择
 * @param {string} config.customPrompt - 用户自定义 Prompt
 * @param {string} config.userAddress - Hyperliquid 用户地址（可选）
 * @param {number} config.initialBalance - 初始余额（可选）
 * @param {string} config.language - 语言（'zh' 或 'en'）
 * @param {boolean} config.isTestnet - 是否为测试网
 * @returns {Promise<string>} 生成的完整 Prompt
 */
export const generateUserPrompt = async (config) => {
  const {
    coins = ['BTC', 'ETH', 'SOL'],
    dataSources = {
      price: true,
      ema: true,
      macd: true,
      rsi: true,
      volume: true,
      funding: true,
      oi: false
    },
    customPrompt = '',
    userAddress = null,
    initialBalance = 10000,
    riskPreference = 'balanced', // conservative, balanced, aggressive
    language = 'zh',
    isTestnet = true  // 默认测试网
  } = config;

  try {
    let prompt = '';

    // 风险偏好映射
    const riskLevels = {
      conservative: {
        zh: { name: '保守', leverage: '5-10倍', maxPositions: 3 },
        en: { name: 'Conservative', leverage: '5-10x', maxPositions: 3 }
      },
      balanced: {
        zh: { name: '平衡', leverage: '10-15倍', maxPositions: 4 },
        en: { name: 'Balanced', leverage: '10-15x', maxPositions: 4 }
      },
      aggressive: {
        zh: { name: '激进', leverage: '15-20倍', maxPositions: 6 },
        en: { name: 'Aggressive', leverage: '15-20x', maxPositions: 6 }
      }
    };
    
    const risk = riskLevels[riskPreference][language];

    // 1. 基础说明
    if (language === 'zh') {
      prompt += `你是一位顶级量化基金的系统化交易员，在 Hyperliquid 上执行交易。
当前时间: ${new Date().toISOString()}

核心原则：
- 追求扣除费用后的最大利润
- 避免过度交易，每个信号都需要明确优势
- 考虑0.09%的双向手续费+滑点+资金费率
- 严格风险管理，不加仓现有头寸

`;
    } else {
      prompt += `You are a systematic trader at a top quant fund, executing trades on Hyperliquid.
Current time: ${new Date().toISOString()}

Core Principles:
- Maximize profit after fees
- Avoid overtrading, every signal needs clear edge
- Consider 0.09% round-trip fees + slippage + funding
- Strict risk management, no pyramiding existing positions

`;
    }

    // 2. 交易参数和风险偏好
    if (language === 'zh') {
      prompt += `## 交易参数
- 参与交易金额: ${initialBalance} USDC
- 风险偏好: ${risk.name}
- 建议杠杆范围: ${risk.leverage}
- 最大持仓数: ${risk.maxPositions}

`;
    } else {
      prompt += `## Trading Parameters
- Trading Amount: ${initialBalance} USDC
- Risk Preference: ${risk.name}
- Recommended Leverage: ${risk.leverage}
- Maximum Positions: ${risk.maxPositions}

`;
    }

    // 3. 账户信息（如果提供了地址，获取真实持仓）
    if (userAddress) {
      try {
        const accountPrompt = await generateAccountPrompt(userAddress, initialBalance, language, isTestnet);
        prompt += accountPrompt + '\n\n';
      } catch (error) {
        console.warn('获取账户信息失败:', error.message);
        // 获取失败时使用基本信息（交易参数中已包含）
      }
    }

    // 4. 市场数据
    if (language === 'zh') {
      prompt += `## 市场数据\n`;
      prompt += `分析以下币种（按优先级）：${coins.join(', ')}\n`;
    } else {
      prompt += `## Market Data\n`;
      prompt += `Analyze the following coins (by priority): ${coins.join(', ')}\n`;
    }

    // 并行获取所有币种的市场数据
    const marketDataPromises = coins.map(coin => 
      Promise.allSettled([
        getCoinMarketData(coin, '3m', 100),
        getLongTermTrend(coin)
      ])
    );

    const results = await Promise.all(marketDataPromises);

    // 格式化每个币种的数据
    results.forEach(([marketDataResult, longTermResult], index) => {
      const coin = coins[index];
      
      if (marketDataResult.status === 'fulfilled') {
        const longTermData = longTermResult.status === 'fulfilled' ? longTermResult.value : null;
        prompt += formatCoinData(marketDataResult.value, dataSources, longTermData, language);
      } else {
        console.error(`获取 ${coin} 数据失败:`, marketDataResult.reason);
        const errorMsg = language === 'zh' ? `数据获取失败: ${marketDataResult.reason.message}` : `Failed to fetch data: ${marketDataResult.reason.message}`;
        prompt += language === 'zh' ? `\n## ${coin} 数据\n${errorMsg}\n` : `\n## ${coin} Data\n${errorMsg}\n`;
      }
    });

    // 5. 用户自定义 Prompt
    if (customPrompt && customPrompt.trim() !== '') {
      const sectionTitle = language === 'zh' ? '## 额外说明' : '## Additional Instructions';
      prompt += `\n\n${sectionTitle}\n${customPrompt.trim()}\n`;
    }

    // 6. 结束语
    if (language === 'zh') {
      prompt += `\n\n请基于以上数据进行深度分析，并提供具体的交易建议。`;
    } else {
      prompt += `\n\nPlease provide in-depth analysis based on the above data and specific trading recommendations.`;
    }

    return prompt;

  } catch (error) {
    console.error('生成 Prompt 错误:', error.message);
    throw new Error(`无法生成 Prompt: ${error.message}`);
  }
};

/**
 * 生成简化版 Prompt（用于快速测试）
 * @param {string[]} coins - 币种列表
 * @param {string} language - 语言
 * @returns {Promise<string>} 简化的 Prompt
 */
export const generateQuickPrompt = async (coins = ['BTC'], language = 'zh') => {
  return generateUserPrompt({
    coins,
    dataSources: {
      price: true,
      ema: true,
      macd: true,
      rsi: true,
      volume: false,
      funding: false,
      oi: false
    },
    language
  });
};

/**
 * 验证 Prompt 配置
 * @param {Object} config - 配置对象
 * @returns {Object} 验证结果 { valid: boolean, errors: string[] }
 */
export const validatePromptConfig = (config) => {
  const errors = [];

  if (!config.coins || !Array.isArray(config.coins) || config.coins.length === 0) {
    errors.push('必须选择至少一个币种');
  }

  if (config.coins && config.coins.length > 10) {
    errors.push('最多选择 10 个币种');
  }

  if (config.userAddress && typeof config.userAddress !== 'string') {
    errors.push('用户地址格式不正确');
  }

  if (config.initialBalance && (typeof config.initialBalance !== 'number' || config.initialBalance <= 0)) {
    errors.push('初始余额必须为正数');
  }

  return {
    valid: errors.length === 0,
    errors
  };
};


