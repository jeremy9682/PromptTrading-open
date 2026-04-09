/**
 * 后端 API 客户端
 * 用于前端调用后端接口
 */

import { getApiKey, getApiMode, getApiSource, API_PROVIDERS } from './apikey';
import { useAppStore } from '../contexts/useAppStore';
import { translations } from '../constants/translations';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3002/api';
const API_HEALTH_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3002';

/**
 * 通用请求函数
 * @param {string} url - API 端点
 * @param {object} options - 请求选项
 * @param {string} userAddress - 用户钱包地址（用于获取 API Key）
 * @param {string} accessToken - Privy access token（用于平台 API 认证）
 */
const request = async (url, options = {}, userAddress = null, accessToken = null) => {
  try {
    // 构建请求头
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    // Add Privy auth token if provided (required for platform API)
    if (accessToken) {
      headers['Authorization'] = `Bearer ${accessToken}`;
    }

    // If user address provided, get API configuration
    if (userAddress) {
      const apiMode = getApiMode(userAddress);
      const apiSource = getApiSource(userAddress);
      headers['X-API-Mode'] = apiMode;
      headers['X-API-Source'] = apiSource;

      if (apiMode === 'native') {
        // Native API mode: get all native API Keys
        const deepseekKey = getApiKey(userAddress, API_PROVIDERS.DEEPSEEK);
        const qwenKey = getApiKey(userAddress, API_PROVIDERS.QWEN);
        const claudeKey = getApiKey(userAddress, API_PROVIDERS.CLAUDE);
        const openaiKey = getApiKey(userAddress, API_PROVIDERS.OPENAI);
        const googleKey = getApiKey(userAddress, API_PROVIDERS.GOOGLE);

        if (deepseekKey) headers['X-DeepSeek-API-Key'] = deepseekKey;
        if (qwenKey) headers['X-Qwen-API-Key'] = qwenKey;
        if (claudeKey) headers['X-Claude-API-Key'] = claudeKey;
        if (openaiKey) headers['X-OpenAI-API-Key'] = openaiKey;
        if (googleKey) headers['X-Google-API-Key'] = googleKey;

        console.log('⚙️ 使用原生 API 模式');
      } else {
        // OpenRouter mode
        if (apiSource === 'platform') {
          // Using platform API - no need to send user key
          console.log('🏢 使用平台 OpenRouter API');
        } else {
          // Using user's own API key
          const openrouterKey = getApiKey(userAddress, API_PROVIDERS.OPENROUTER);
          if (openrouterKey) {
            headers['X-User-API-Key'] = openrouterKey;
            console.log('🔮 使用用户 OpenRouter API');
          }
        }
      }
    }

    const response = await fetch(`${API_BASE_URL}${url}`, {
      headers,
      ...options,
    });

    const data = await response.json();

    if (!response.ok) {
      // 获取当前语言
      const language = useAppStore.getState().language || 'en';

      // 如果后端返回了错误码，使用翻译
      if (data.errorCode && translations[language]?.errors?.[data.errorCode]) {
        let errorMessage = translations[language].errors[data.errorCode];

        // 如果有详细信息，添加到错误消息后面
        if (data.details) {
          errorMessage += `: ${data.details}`;
        }

        throw new Error(errorMessage);
      }

      // 兼容旧格式（如果没有错误码，使用原来的 error 字段）
      throw new Error(data.error || 'API request failed');
    }

    return data;
  } catch (error) {
    console.error('API Error:', error);
    throw error;
  }
};

/**
 * AI 分析相关 API
 */
export const aiAPI = {
  /**
   * 智能交易分析（推荐使用）
   * @param {Object} data - { model, coins, dataSources, customPrompt, userAddress, initialBalance, language }
   * @param {string} userAddress - 用户钱包地址（用于获取 API Key）
   * @param {string} accessToken - Privy access token（用于平台 API 认证）
   */
  smartAnalysis: (data, userAddress = null, accessToken = null) => request('/ai/smart-analysis', {
    method: 'POST',
    body: JSON.stringify(data),
  }, userAddress || data.userAddress, accessToken),

  /**
   * AI 市场分析
   * @param {Object} data - { prompt, model, dataSources, token }
   * @param {string} userAddress - 用户钱包地址（用于获取 API Key）
   */
  analyze: (data, userAddress = null) => request('/ai/analyze', {
    method: 'POST',
    body: JSON.stringify(data),
  }, userAddress),

  /**
   * 多模型对比分析
   * @param {Object} data - { prompt, models }
   * @param {string} userAddress - 用户钱包地址（用于获取 API Key）
   */
  compare: (data, userAddress = null) => request('/ai/compare', {
    method: 'POST',
    body: JSON.stringify(data),
  }, userAddress),

  /**
   * 测试 AI API 连接
   */
  test: () => request('/ai/test'),
  
  /**
   * 测试 OpenRouter 连接
   * @param {string} userAddress - 用户钱包地址（用于获取 API Key）
   */
  testConnection: (userAddress = null) => request('/ai/test-connection', {}, userAddress),
  
  /**
   * 获取可用模型列表（本地配置）
   */
  getModels: () => request('/ai/models'),
  
  /**
   * 获取 OpenRouter 所有模型（实时 API）
   * @param {string} userAddress - 用户钱包地址（用于获取 API Key）
   */
  fetchModels: (userAddress = null) => request('/ai/models/fetch', {}, userAddress),

  /**
   * Get billing configuration and platform API availability
   */
  getBillingInfo: () => request('/ai/billing-info'),
};

/**
 * 交易相关 API
 */
export const tradingAPI = {
  /**
   * 执行批量签名订单（推荐使用）
   * @param {Object} data - { signedOrder, userAddress }
   */
  executeBatch: (data) => request('/trading/execute-batch', {
    method: 'POST',
    body: JSON.stringify(data),
  }),

  /**
   * 执行单个签名订单
   * @param {Object} data - { signedOrder, userAddress }
   */
  executeSigned: (data) => request('/trading/execute-signed', {
    method: 'POST',
    body: JSON.stringify(data),
  }),

  /**
   * 执行 AI 交易决策（旧接口，兼容）
   * @param {Object} data - { decision, privateKey, userAddress }
   * @deprecated 请使用 executeBatch
   */
  executeAI: (data) => request('/trading/execute-ai', {
    method: 'POST',
    body: JSON.stringify(data),
  }),

  /**
   * 执行市价单（测试网）
   * @param {Object} data - { coin, side, quantity, leverage, privateKey }
   */
  executeMarket: (data) => request('/trading/execute-market', {
    method: 'POST',
    body: JSON.stringify(data),
  }),

  /**
   * 执行限价单（测试网）
   * @param {Object} data - { coin, side, quantity, limitPrice, leverage, privateKey }
   */
  executeLimit: (data) => request('/trading/execute-limit', {
    method: 'POST',
    body: JSON.stringify(data),
  }),

  /**
   * 设置止损止盈（测试网）
   * @param {Object} data - { coin, quantity, stopLoss, takeProfit, privateKey }
   */
  setStopLoss: (data) => request('/trading/set-stop-loss', {
    method: 'POST',
    body: JSON.stringify(data),
  }),

  /**
   * 取消订单（测试网）
   * @param {Object} data - { coin, oid, privateKey }
   */
  cancelOrder: (data) => request('/trading/cancel', {
    method: 'POST',
    body: JSON.stringify(data),
  }),

  /**
   * 执行交易（旧接口）
   * @param {Object} data - { coin, action, amount, leverage }
   */
  execute: (data) => request('/trading/execute', {
    method: 'POST',
    body: JSON.stringify(data),
  }),

  /**
   * 获取当前持仓
   */
  getPositions: () => request('/trading/positions'),

  /**
   * 平仓
   * @param {number} positionId - 持仓ID
   */
  closePosition: (positionId) => request(`/trading/positions/${positionId}/close`, {
    method: 'POST',
  }),

  /**
   * 获取账户余额
   */
  getBalance: () => request('/trading/balance'),

  /**
   * 测试 Trading API 连接
   */
  test: () => request('/trading/test'),
};

/**
 * Hyperliquid 账户相关 API
 */
export const accountAPI = {
  /**
   * 获取账户余额
   * @param {string} address - 用户地址
   * @param {number} chainId - 网络 ID (421614=测试网, 42161=主网)
   */
  getBalance: (address, chainId = 421614) => 
    request(`/account/balance?address=${address}&chainId=${chainId}`),

  /**
   * 获取账户性能指标
   * @param {string} address - 用户地址
   * @param {number} initialBalance - 初始余额（可选）
   * @param {number} chainId - 网络 ID
   */
  getPerformance: (address, initialBalance = 10000, chainId = 421614) => 
    request(`/account/performance?address=${address}&initialBalance=${initialBalance}&chainId=${chainId}`),

  /**
   * 获取用户持仓
   * @param {string} address - 用户地址
   * @param {number} chainId - 网络 ID
   */
  getPositions: (address, chainId = 421614) => 
    request(`/account/positions?address=${address}&chainId=${chainId}`),

  /**
   * 获取未成交订单
   * @param {string} address - 用户地址
   * @param {number} chainId - 网络 ID
   */
  getOpenOrders: (address, chainId = 421614) => 
    request(`/account/open-orders?address=${address}&chainId=${chainId}`),

  /**
   * 获取完整账户概览
   * @param {string} address - 用户地址
   * @param {number} initialBalance - 初始余额（可选）
   * @param {number} chainId - 网络 ID
   */
  getOverview: (address, initialBalance = 10000, chainId = 421614) => 
    request(`/account/overview?address=${address}&initialBalance=${initialBalance}&chainId=${chainId}`),

  /**
   * 获取用于 AI 的账户摘要
   * @param {string} address - 用户地址
   * @param {number} initialBalance - 初始余额（可选）
   * @param {number} chainId - 网络 ID
   */
  getAIPrompt: (address, initialBalance = 10000, chainId = 421614) => 
    request(`/account/ai-prompt?address=${address}&initialBalance=${initialBalance}&chainId=${chainId}`),

  /**
   * 获取历史交易
   * @param {string} address - 用户地址
   * @param {number} chainId - 网络 ID
   */
  getFills: (address, chainId = 421614) => 
    request(`/account/fills?address=${address}&chainId=${chainId}`),

  /**
   * 平仓
   * @param {Object} data - { coin, address, size? }
   */
  closePosition: (data) => request('/account/close-position', {
    method: 'POST',
    body: JSON.stringify(data),
  }),

  /**
   * 提款
   * @param {Object} data - { address, amount, destination }
   */
  withdraw: (data) => request('/account/withdraw', {
    method: 'POST',
    body: JSON.stringify(data),
  }),

  /**
   * 测试 Account API 连接
   */
  test: () => request('/account/test'),
};

/**
 * Agent Wallet 交易 API
 * 使用 SDK Custom 方法执行订单（marketOpen/marketClose）
 * 官方建议：使用 SDK 而不是手动签名
 */
export const signingAPI = {
  /**
   * 使用 Agent Wallet 执行订单
   * SDK 会自动处理所有格式化、价格计算、滑点等
   * @param {Object} data - { orders: [...], userAddress }
   * @returns {Promise} 执行结果
   */
  executeWithAgent: (data) => request('/signing/execute-with-agent', {
    method: 'POST',
    body: JSON.stringify(data),
  }),
};

/**
 * Agent 管理 API
 */
export const agentAPI = {
  /**
   * 在 Hyperliquid 上注册 Agent（使用 SDK）
   * @param {string} agentAddress - Agent 地址
   * @param {string} agentName - Agent 名称
   * @returns {Promise} 注册结果
   */
  register: (agentAddress, agentName) => request('/agent/register', {
    method: 'POST',
    body: JSON.stringify({ agentAddress, agentName }),
  }),

  /**
   * 获取用户的 Agent 列表
   * @param {string} userAddress - 用户钱包地址
   * @param {number} chainId - 网络 ID (421614=测试网, 42161=主网)
   * @returns {Promise} Agent 列表
   */
  list: (userAddress, chainId = 421614) => 
    request(`/agent/list?address=${userAddress}&chainId=${chainId}`),

  /**
   * 检查 Agent 是否已授权
   * @param {string} userAddress - 用户钱包地址
   * @param {string} agentAddress - Agent 地址
   * @param {number} chainId - 网络 ID
   * @returns {Promise} 是否已授权
   */
  check: (userAddress, agentAddress, chainId = 421614) => 
    request(`/agent/check?address=${userAddress}&agent=${agentAddress}&chainId=${chainId}`),
};

/**
 * 用户额度管理 API
 */
export const userAPI = {
  /**
   * 获取用户额度
   * @param {string} address - 钱包地址
   */
  getQuota: (address) => request(`/user/quota?address=${address}`),

  /**
   * 充值额度
   * @param {Object} data - { address, amount, txHash }
   */
  recharge: (data) => request('/user/recharge', {
    method: 'POST',
    body: JSON.stringify(data),
  }),

  /**
   * 设置自有 API Key
   * @param {Object} data - { address, apiKey, encrypted }
   */
  setApiKey: (data) => request('/user/set-api-key', {
    method: 'POST',
    body: JSON.stringify(data),
  }),

  /**
   * 获取用户统计
   * @param {string} address - 钱包地址
   */
  getStats: (address) => request(`/user/stats?address=${address}`),
};

/**
 * 创建带认证的请求函数
 * @param {string} accessToken - Privy access token
 * @param {string} walletAddress - 用户钱包地址
 */
const createAuthRequest = (accessToken, walletAddress) => async (url, options = {}) => {
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }
  if (walletAddress) {
    headers['X-Wallet-Address'] = walletAddress;
  }

  const response = await fetch(`${API_BASE_URL}${url}`, {
    headers,
    ...options,
  });

  const data = await response.json();

  if (!response.ok) {
    // 对于配额错误，优先使用 message（包含中文提示）
    // 同时附加 error code 以便前端识别错误类型
    const errorMessage = data.message || data.error || 'API request failed';
    const error = new Error(errorMessage);
    error.code = data.error; // 保留错误码
    error.limit = data.limit;
    error.current = data.current;
    throw error;
  }

  return data;
};

/**
 * Polymarket AI 分析 API
 */
export const polymarketAPI = {
  /**
   * 流式分析事件（SSE）
   * @param {Object} data - { event, dataSources, customPrompt, model, language }
   * @param {function} onStep - 每一步完成时的回调
   * @param {string} userAddress - 用户钱包地址
   * @param {Object} options - 可选配置 { timeout: 120000 }
   * @returns {Promise} 分析结果
   */
  analyzeStream: async (data, onStep, userAddress = null, options = {}) => {
    const { timeout = 120000 } = options; // 默认 2 分钟超时

    // 构建请求头
    const headers = {
      'Content-Type': 'application/json',
    };

    // 获取 API 配置
    if (userAddress) {
      const apiMode = getApiMode(userAddress);
      const apiSource = getApiSource(userAddress);
      headers['X-API-Mode'] = apiMode;
      headers['X-API-Source'] = apiSource;
      headers['X-Wallet-Address'] = userAddress; // 用于后端扣费

      if (apiMode === 'native') {
        const deepseekKey = getApiKey(userAddress, API_PROVIDERS.DEEPSEEK);
        const qwenKey = getApiKey(userAddress, API_PROVIDERS.QWEN);
        const claudeKey = getApiKey(userAddress, API_PROVIDERS.CLAUDE);
        const openaiKey = getApiKey(userAddress, API_PROVIDERS.OPENAI);
        const googleKey = getApiKey(userAddress, API_PROVIDERS.GOOGLE);

        if (deepseekKey) headers['X-DeepSeek-API-Key'] = deepseekKey;
        if (qwenKey) headers['X-Qwen-API-Key'] = qwenKey;
        if (claudeKey) headers['X-Claude-API-Key'] = claudeKey;
        if (openaiKey) headers['X-OpenAI-API-Key'] = openaiKey;
        if (googleKey) headers['X-Google-API-Key'] = googleKey;
      } else if (apiSource === 'user') {
        const openrouterKey = getApiKey(userAddress, API_PROVIDERS.OPENROUTER);
        if (openrouterKey) {
          headers['X-User-API-Key'] = openrouterKey;
        }
      }
    }

    // 创建 AbortController 用于超时控制
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(`${API_BASE_URL}/polymarket/analyze-stream`, {
        method: 'POST',
        headers,
        body: JSON.stringify(data),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        throw new Error(`HTTP error! status: ${response.status}${errorText ? `: ${errorText}` : ''}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let finalResult = null;
      let lastActivityTime = Date.now();

      // 活动超时检测（30秒无数据则认为连接有问题）
      const activityCheckInterval = setInterval(() => {
        if (Date.now() - lastActivityTime > 30000) {
          console.warn('SSE: No activity for 30 seconds, connection may be stale');
        }
      }, 10000);

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          lastActivityTime = Date.now(); // 更新活动时间
          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n');

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const eventData = JSON.parse(line.slice(6));

                // 调用回调函数
                if (onStep) {
                  onStep(eventData);
                }

                // 检查是否有特定错误码
                if (eventData.status === 'failed') {
                  if (eventData.errorCode === 'USER_API_KEY_REQUIRED') {
                    const error = new Error(eventData.error || '请配置您的 OpenRouter API Key');
                    error.code = 'USER_API_KEY_REQUIRED';
                    throw error;
                  }
                  if (eventData.errorCode === 'INSUFFICIENT_BALANCE') {
                    const error = new Error(eventData.error || 'AI Credits 余额不足，请充值后重试');
                    error.code = 'INSUFFICIENT_BALANCE';
                    throw error;
                  }
                  // 其他失败情况
                  if (eventData.error) {
                    const error = new Error(eventData.error);
                    error.code = eventData.errorCode || 'ANALYSIS_FAILED';
                    throw error;
                  }
                }

                // 保存最终结果
                if (eventData.step === 'complete' && eventData.status === 'completed') {
                  // 混合架构: SSE 只发送 analysisId，通过 API 获取完整结果
                  // 这样可以避免大数据包被 CloudFlare 缓冲/截断
                  if (eventData.analysisId) {
                    try {
                      const resultResponse = await fetch(
                        `${API_BASE_URL}/polymarket/analysis-status/${eventData.analysisId}`,
                        { headers }
                      );
                      if (resultResponse.ok) {
                        const resultData = await resultResponse.json();
                        if (resultData.success && resultData.data) {
                          finalResult = resultData.data;
                        }
                      } else {
                        console.warn('Failed to fetch analysis result via API:', resultResponse.status);
                        // 回退: 如果 API 调用失败但有 result 字段，使用它
                        if (eventData.result) {
                          finalResult = eventData.result;
                        }
                      }
                    } catch (fetchError) {
                      console.warn('Error fetching analysis result:', fetchError);
                      // 回退: 如果 API 调用失败但有 result 字段，使用它
                      if (eventData.result) {
                        finalResult = eventData.result;
                      }
                    }
                  } else if (eventData.result) {
                    // 兼容旧版本: 直接使用 result
                    finalResult = eventData.result;
                  }
                }
              } catch (parseError) {
                // 重新抛出特定错误码
                if (parseError.code === 'USER_API_KEY_REQUIRED' ||
                    parseError.code === 'INSUFFICIENT_BALANCE' ||
                    parseError.code === 'ANALYSIS_FAILED') {
                  throw parseError;
                }
                console.warn('SSE parse error:', parseError);
              }
            }
          }
        }
      } finally {
        clearInterval(activityCheckInterval);
      }

      return { success: true, data: finalResult };
    } catch (error) {
      // 处理不同类型的错误
      if (error.name === 'AbortError') {
        const timeoutError = new Error('分析请求超时，请稍后重试');
        timeoutError.code = 'TIMEOUT';
        throw timeoutError;
      }
      if (error.message?.includes('Failed to fetch') || error.message?.includes('NetworkError')) {
        const networkError = new Error('网络连接失败，请检查网络后重试');
        networkError.code = 'NETWORK_ERROR';
        throw networkError;
      }
      console.error('Polymarket stream error:', error);
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  },

  /**
   * 一次性分析事件（非流式）
   * @param {Object} data - { event, dataSources, customPrompt, model, language }
   * @param {string} userAddress - 用户钱包地址
   */
  analyze: (data, userAddress = null) => request('/polymarket/analyze', {
    method: 'POST',
    body: JSON.stringify(data),
  }, userAddress),

  /**
   * 获取分析状态/结果
   * @param {string} analysisId - 分析 ID
   */
  getAnalysisStatus: (analysisId) => request(`/polymarket/analysis-status/${analysisId}`),

  /**
   * 测试连接
   */
  testConnection: () => request('/polymarket/test-connection'),

  // ============================================
  // Watchlist API (需要 Privy 认证)
  // ============================================

  /**
   * 获取用户关注列表
   * @param {string} accessToken - Privy access token
   * @param {string} walletAddress - 用户钱包地址
   */
  getWatchlist: async (accessToken, walletAddress) => {
    const authRequest = createAuthRequest(accessToken, walletAddress);
    return authRequest('/polymarket/watchlist');
  },

  /**
   * 添加事件到关注列表
   * @param {string} eventId - 事件 ID
   * @param {string} accessToken - Privy access token
   * @param {string} walletAddress - 用户钱包地址
   */
  addToWatchlist: async (eventId, accessToken, walletAddress) => {
    const authRequest = createAuthRequest(accessToken, walletAddress);
    return authRequest('/polymarket/watchlist', {
      method: 'POST',
      body: JSON.stringify({ eventId }),
    });
  },

  /**
   * 批量添加事件到关注列表
   * @param {string[]} eventIds - 事件 ID 数组
   * @param {string} accessToken - Privy access token
   * @param {string} walletAddress - 用户钱包地址
   */
  addBatchToWatchlist: async (eventIds, accessToken, walletAddress) => {
    const authRequest = createAuthRequest(accessToken, walletAddress);
    return authRequest('/polymarket/watchlist/batch', {
      method: 'POST',
      body: JSON.stringify({ eventIds }),
    });
  },

  /**
   * 从关注列表移除事件
   * @param {string} eventId - 事件 ID
   * @param {string} accessToken - Privy access token
   * @param {string} walletAddress - 用户钱包地址
   */
  removeFromWatchlist: async (eventId, accessToken, walletAddress) => {
    const authRequest = createAuthRequest(accessToken, walletAddress);
    return authRequest(`/polymarket/watchlist/${encodeURIComponent(eventId)}`, {
      method: 'DELETE',
    });
  },

  /**
   * 同步关注列表（替换全部）
   * @param {string[]} eventIds - 事件 ID 数组
   * @param {string} accessToken - Privy access token
   * @param {string} walletAddress - 用户钱包地址
   */
  syncWatchlist: async (eventIds, accessToken, walletAddress) => {
    const authRequest = createAuthRequest(accessToken, walletAddress);
    return authRequest('/polymarket/watchlist/sync', {
      method: 'PUT',
      body: JSON.stringify({ eventIds }),
    });
  },

  // ============================================
  // Traders API (需要 Privy 认证)
  // ============================================

  /**
   * 获取用户所有 Traders
   * @param {string} accessToken - Privy access token
   * @param {string} walletAddress - 用户钱包地址
   */
  getTraders: async (accessToken, walletAddress) => {
    const authRequest = createAuthRequest(accessToken, walletAddress);
    return authRequest('/polymarket/traders');
  },

  /**
   * 获取单个 Trader
   * @param {string} traderId - Trader ID
   * @param {string} accessToken - Privy access token
   * @param {string} walletAddress - 用户钱包地址
   */
  getTrader: async (traderId, accessToken, walletAddress) => {
    const authRequest = createAuthRequest(accessToken, walletAddress);
    return authRequest(`/polymarket/traders/${traderId}`);
  },

  /**
   * 创建 Trader
   * @param {Object} traderData - Trader 数据
   * @param {string} accessToken - Privy access token
   * @param {string} walletAddress - 用户钱包地址
   */
  createTrader: async (traderData, accessToken, walletAddress) => {
    const authRequest = createAuthRequest(accessToken, walletAddress);
    return authRequest('/polymarket/traders', {
      method: 'POST',
      body: JSON.stringify(traderData),
    });
  },

  /**
   * 更新 Trader
   * @param {string} traderId - Trader ID
   * @param {Object} updates - 更新数据
   * @param {string} accessToken - Privy access token
   * @param {string} walletAddress - 用户钱包地址
   */
  updateTrader: async (traderId, updates, accessToken, walletAddress) => {
    const authRequest = createAuthRequest(accessToken, walletAddress);
    return authRequest(`/polymarket/traders/${traderId}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  },

  /**
   * 删除 Trader
   * @param {string} traderId - Trader ID
   * @param {string} accessToken - Privy access token
   * @param {string} walletAddress - 用户钱包地址
   */
  deleteTrader: async (traderId, accessToken, walletAddress) => {
    const authRequest = createAuthRequest(accessToken, walletAddress);
    return authRequest(`/polymarket/traders/${traderId}`, {
      method: 'DELETE',
    });
  },

  /**
   * 同步 Traders（替换全部）
   * @param {Object[]} traders - Traders 数组
   * @param {string} accessToken - Privy access token
   * @param {string} walletAddress - 用户钱包地址
   */
  syncTraders: async (traders, accessToken, walletAddress) => {
    const authRequest = createAuthRequest(accessToken, walletAddress);
    return authRequest('/polymarket/traders/sync', {
      method: 'PUT',
      body: JSON.stringify({ traders }),
    });
  },

  // ============================================
  // Analysis History API (需要 Privy 认证)
  // ============================================

  /**
   * 获取 Trader 的分析历史
   * @param {string} traderId - Trader ID
   * @param {string} accessToken - Privy access token
   * @param {string} walletAddress - 用户钱包地址
   * @param {number} limit - 返回记录数量限制
   */
  getAnalysisHistory: async (traderId, accessToken, walletAddress, limit = 20) => {
    const authRequest = createAuthRequest(accessToken, walletAddress);
    return authRequest(`/polymarket/traders/${traderId}/analysis-history?limit=${limit}`);
  },

  /**
   * 保存分析结果
   * @param {string} traderId - Trader ID
   * @param {Object} analysisData - 分析数据
   * @param {string} accessToken - Privy access token
   * @param {string} walletAddress - 用户钱包地址
   */
  saveAnalysisHistory: async (traderId, analysisData, accessToken, walletAddress) => {
    const authRequest = createAuthRequest(accessToken, walletAddress);
    return authRequest(`/polymarket/traders/${traderId}/analysis-history`, {
      method: 'POST',
      body: JSON.stringify(analysisData),
    });
  },

  /**
   * 清空 Trader 的分析历史
   * @param {string} traderId - Trader ID
   * @param {string} accessToken - Privy access token
   * @param {string} walletAddress - 用户钱包地址
   */
  clearAnalysisHistory: async (traderId, accessToken, walletAddress) => {
    const authRequest = createAuthRequest(accessToken, walletAddress);
    return authRequest(`/polymarket/traders/${traderId}/analysis-history`, {
      method: 'DELETE',
    });
  },

  /**
   * 标记分析为已执行（交易已下单）
   * @param {string} analysisId - 分析记录 ID
   * @param {string} accessToken - Privy access token
   * @param {string} walletAddress - 用户钱包地址
   */
  markAnalysisExecuted: async (analysisId, accessToken, walletAddress) => {
    const authRequest = createAuthRequest(accessToken, walletAddress);
    return authRequest(`/polymarket/analysis-history/${analysisId}/executed`, {
      method: 'PATCH',
    });
  },
};

/**
 * Paper Trading API (模拟盘)
 * 独立于实盘的数据存储
 * 需要 Privy 认证
 */
export const paperTradingAPI = {
  /**
   * 获取模拟账户详情
   * @param {string} accessToken - Privy access token
   * @param {string} walletAddress - 用户钱包地址
   */
  getAccount: async (accessToken, walletAddress) => {
    const authRequest = createAuthRequest(accessToken, walletAddress);
    return authRequest('/paper-trading/account');
  },

  /**
   * 获取持仓列表
   * @param {string} accessToken - Privy access token
   * @param {string} walletAddress - 用户钱包地址
   */
  getPositions: async (accessToken, walletAddress) => {
    const authRequest = createAuthRequest(accessToken, walletAddress);
    return authRequest('/paper-trading/positions');
  },

  /**
   * 获取交易历史
   * @param {string} accessToken - Privy access token
   * @param {string} walletAddress - 用户钱包地址
   * @param {Object} options - { limit, offset }
   */
  getHistory: async (accessToken, walletAddress, options = {}) => {
    const authRequest = createAuthRequest(accessToken, walletAddress);
    const { limit = 50, offset = 0 } = options;
    return authRequest(`/paper-trading/history?limit=${limit}&offset=${offset}`);
  },

  // ============================================
  // Paper Traders 管理（独立于实盘 traders）
  // ============================================

  /**
   * 获取所有模拟盘 Traders
   */
  getTraders: async (accessToken, walletAddress) => {
    const authRequest = createAuthRequest(accessToken, walletAddress);
    return authRequest('/paper-trading/traders');
  },

  /**
   * 创建模拟盘 Trader
   */
  createTrader: async (traderData, accessToken, walletAddress) => {
    const authRequest = createAuthRequest(accessToken, walletAddress);
    // Map eventIds to assignedEvents for backend compatibility
    const backendData = {
      ...traderData,
      assignedEvents: traderData.eventIds || traderData.assignedEvents || []
    };
    return authRequest('/paper-trading/traders', {
      method: 'POST',
      body: JSON.stringify(backendData),
    });
  },

  /**
   * 更新模拟盘 Trader
   */
  updateTrader: async (traderId, updates, accessToken, walletAddress) => {
    const authRequest = createAuthRequest(accessToken, walletAddress);
    // Map eventIds to assignedEvents for backend compatibility
    const backendUpdates = { ...updates };
    if (updates.eventIds !== undefined) {
      backendUpdates.assignedEvents = updates.eventIds;
    }
    return authRequest(`/paper-trading/traders/${traderId}`, {
      method: 'PUT',
      body: JSON.stringify(backendUpdates),
    });
  },

  /**
   * 删除模拟盘 Trader
   */
  deleteTrader: async (traderId, accessToken, walletAddress) => {
    const authRequest = createAuthRequest(accessToken, walletAddress);
    return authRequest(`/paper-trading/traders/${traderId}`, {
      method: 'DELETE',
    });
  },

  // ============================================
  // Paper Analysis History（独立于实盘分析历史）
  // ============================================

  /**
   * 获取模拟盘 Trader 的分析历史
   */
  getAnalysisHistory: async (traderId, accessToken, walletAddress, limit = 20) => {
    const authRequest = createAuthRequest(accessToken, walletAddress);
    return authRequest(`/paper-trading/traders/${traderId}/analysis-history?limit=${limit}`);
  },

  /**
   * 保存模拟盘分析历史
   */
  saveAnalysisHistory: async (traderId, analysisData, accessToken, walletAddress) => {
    const authRequest = createAuthRequest(accessToken, walletAddress);
    return authRequest(`/paper-trading/traders/${traderId}/analysis-history`, {
      method: 'POST',
      body: JSON.stringify(analysisData),
    });
  },

  /**
   * 执行模拟买入
   * @param {Object} data - { eventId, eventTitle, side, price, amount, fromAiAnalysis?, aiConfidence? }
   * @param {string} accessToken - Privy access token
   * @param {string} walletAddress - 用户钱包地址
   */
  buy: async (data, accessToken, walletAddress) => {
    const authRequest = createAuthRequest(accessToken, walletAddress);
    return authRequest('/paper-trading/buy', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  /**
   * 执行模拟卖出（平仓）
   * @param {Object} data - { positionId, sellPrice, fromAiAnalysis?, aiConfidence? }
   * @param {string} accessToken - Privy access token
   * @param {string} walletAddress - 用户钱包地址
   */
  sell: async (data, accessToken, walletAddress) => {
    const authRequest = createAuthRequest(accessToken, walletAddress);
    return authRequest('/paper-trading/sell', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  /**
   * 重置模拟账户
   * @param {string} accessToken - Privy access token
   * @param {string} walletAddress - 用户钱包地址
   */
  reset: async (accessToken, walletAddress) => {
    const authRequest = createAuthRequest(accessToken, walletAddress);
    return authRequest('/paper-trading/reset', {
      method: 'POST',
    });
  },

  /**
   * 根据 AI 分析执行模拟交易
   * @param {Object} data - { eventId, eventTitle, action, confidence, price, amount? }
   * @param {string} accessToken - Privy access token
   * @param {string} walletAddress - 用户钱包地址
   */
  executeAi: async (data, accessToken, walletAddress) => {
    const authRequest = createAuthRequest(accessToken, walletAddress);
    return authRequest('/paper-trading/execute-ai', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  /**
   * 同步前端数据到后端
   * @param {Object} data - { balance, positions, trades }
   * @param {string} accessToken - Privy access token
   * @param {string} walletAddress - 用户钱包地址
   */
  sync: async (data, accessToken, walletAddress) => {
    const authRequest = createAuthRequest(accessToken, walletAddress);
    return authRequest('/paper-trading/sync', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },
};

/**
 * 健康检查
 */
export const healthCheck = () =>
  fetch(`${API_HEALTH_URL}/health`).then(res => res.json());
