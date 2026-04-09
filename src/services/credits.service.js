/**
 * AI Credits 服务
 * 
 * 处理余额查询、充值、交易记录等前端 API 调用
 */

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3002';

/**
 * 创建带认证的请求头
 */
const createAuthHeaders = (accessToken, additionalHeaders = {}) => ({
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${accessToken}`,
  ...additionalHeaders,
});

// ============================================
// 余额相关 API
// ============================================

/**
 * 获取当前用户余额
 * @param {string} accessToken - Privy access token
 */
export const getBalance = async (accessToken) => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/credits/balance`, {
      headers: createAuthHeaders(accessToken),
    });
    return await response.json();
  } catch (error) {
    console.error('[Credits] Get balance error:', error);
    return { success: false, error: error.message };
  }
};

/**
 * 获取使用记录
 * @param {string} accessToken - Privy access token
 * @param {Object} options - 分页选项
 */
export const getUsageRecords = async (accessToken, options = {}) => {
  try {
    const { page = 1, pageSize = 20, type } = options;
    const params = new URLSearchParams({ page, pageSize });
    if (type) params.append('type', type);

    const response = await fetch(`${API_BASE_URL}/api/credits/usage?${params}`, {
      headers: createAuthHeaders(accessToken),
    });
    return await response.json();
  } catch (error) {
    console.error('[Credits] Get usage error:', error);
    return { success: false, error: error.message };
  }
};

/**
 * 获取完整交易历史（充值+消费）
 * @param {string} accessToken - Privy access token
 * @param {Object} options - 分页选项
 */
export const getTransactionHistory = async (accessToken, options = {}) => {
  try {
    const { page = 1, pageSize = 20, type } = options;
    const params = new URLSearchParams({ page, pageSize });
    if (type) params.append('type', type);

    const response = await fetch(`${API_BASE_URL}/api/credits/history?${params}`, {
      headers: createAuthHeaders(accessToken),
    });
    return await response.json();
  } catch (error) {
    console.error('[Credits] Get history error:', error);
    return { success: false, error: error.message };
  }
};

/**
 * 获取使用统计
 * @param {string} accessToken - Privy access token
 * @param {number} days - 统计天数
 */
export const getUsageStats = async (accessToken, days = 30) => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/credits/stats?days=${days}`, {
      headers: createAuthHeaders(accessToken),
    });
    return await response.json();
  } catch (error) {
    console.error('[Credits] Get stats error:', error);
    return { success: false, error: error.message };
  }
};

/**
 * 获取每日汇总数据（用于图表）
 * @param {string} accessToken - Privy access token
 * @param {number} days - 统计天数
 */
export const getDailySummary = async (accessToken, days = 30) => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/credits/daily-summary?days=${days}`, {
      headers: createAuthHeaders(accessToken),
    });
    return await response.json();
  } catch (error) {
    console.error('[Credits] Get daily summary error:', error);
    return { success: false, error: error.message };
  }
};

/**
 * 获取模型使用分布
 * @param {string} accessToken - Privy access token
 * @param {number} days - 统计天数
 */
export const getModelBreakdown = async (accessToken, days = 30) => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/credits/model-breakdown?days=${days}`, {
      headers: createAuthHeaders(accessToken),
    });
    return await response.json();
  } catch (error) {
    console.error('[Credits] Get model breakdown error:', error);
    return { success: false, error: error.message };
  }
};

/**
 * 预估 AI 调用成本
 * @param {string} model - 模型 ID
 * @param {number} tokens - 预估 token 数量
 */
export const estimateCost = async (model = 'deepseek', tokens = 5000) => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/credits/estimate?model=${model}&tokens=${tokens}`);
    return await response.json();
  } catch (error) {
    console.error('[Credits] Estimate error:', error);
    return { success: false, error: error.message };
  }
};

// ============================================
// 充值相关 API
// ============================================

/**
 * 获取充值配置
 */
export const getRechargeConfig = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/recharge/config`);
    return await response.json();
  } catch (error) {
    console.error('[Credits] Get config error:', error);
    return { success: false, error: error.message };
  }
};

/**
 * 创建待处理充值订单（在打开 Privy fundWallet 前调用）
 *
 * 这是匹配充值的关键：用户通过 fundWallet 充值时，
 * from 地址可能是任意外部钱包，后端通过 金额+时间窗口 匹配。
 *
 * @param {string} accessToken - Privy access token
 * @param {number} amount - 充值金额
 * @param {string} chain - 支付链
 * @param {boolean} isLiFi - 是否是 LI.FI 跨链充值（跳过发送方验证）
 */
export const createPendingRecharge = async (accessToken, amount, chain = 'arbitrum', isLiFi = false) => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/credits/pending-recharge`, {
      method: 'POST',
      headers: createAuthHeaders(accessToken),
      body: JSON.stringify({ amount, chain, isLiFi }),
    });
    return await response.json();
  } catch (error) {
    console.error('[Credits] Create pending recharge error:', error);
    return { success: false, error: error.message };
  }
};

/**
 * 创建充值订单（旧版，保留兼容）
 * @param {string} accessToken - Privy access token
 * @param {number} amount - 充值金额
 * @param {string} chain - 支付链
 */
export const createRechargeOrder = async (accessToken, amount, chain = 'arbitrum') => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/recharge/create`, {
      method: 'POST',
      headers: createAuthHeaders(accessToken),
      body: JSON.stringify({ amount, chain }),
    });
    return await response.json();
  } catch (error) {
    console.error('[Credits] Create order error:', error);
    return { success: false, error: error.message };
  }
};

/**
 * 提交交易哈希验证 (旧版 API，保留兼容)
 * @param {string} accessToken - Privy access token
 * @param {string} orderId - 订单 ID
 * @param {string} txHash - 交易哈希
 */
export const submitTransaction = async (accessToken, orderId, txHash) => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/recharge/submit-tx`, {
      method: 'POST',
      headers: createAuthHeaders(accessToken),
      body: JSON.stringify({ orderId, txHash }),
    });
    return await response.json();
  } catch (error) {
    console.error('[Credits] Submit tx error:', error);
    return { success: false, error: error.message };
  }
};

/**
 * 验证交易并充值 (txHash-first 模式，新版 API)
 *
 * 一步完成验证+创建订单+充值，特点：
 * - 幂等: 同一 txHash 多次调用结果相同
 * - 原子: 不需要先创建订单
 *
 * @param {string} accessToken - Privy access token
 * @param {string} txHash - 交易哈希
 * @param {string} chain - 链名称 (polygon)
 */
export const verifyTransaction = async (accessToken, txHash, chain = 'polygon') => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/recharge/verify-tx`, {
      method: 'POST',
      headers: createAuthHeaders(accessToken),
      body: JSON.stringify({ txHash, chain }),
    });
    return await response.json();
  } catch (error) {
    console.error('[Credits] Verify tx error:', error);
    return { success: false, error: error.message };
  }
};

/**
 * 获取订单状态
 * @param {string} accessToken - Privy access token
 * @param {string} orderId - 订单 ID
 */
export const getOrderStatus = async (accessToken, orderId) => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/recharge/status/${orderId}`, {
      headers: createAuthHeaders(accessToken),
    });
    return await response.json();
  } catch (error) {
    console.error('[Credits] Get order status error:', error);
    return { success: false, error: error.message };
  }
};

/**
 * 获取充值记录
 * @param {string} accessToken - Privy access token
 * @param {Object} options - 分页选项
 */
export const getRechargeOrders = async (accessToken, options = {}) => {
  try {
    const { page = 1, pageSize = 10, status } = options;
    const params = new URLSearchParams({ page, pageSize });
    if (status) params.append('status', status);

    const response = await fetch(`${API_BASE_URL}/api/recharge/orders?${params}`, {
      headers: createAuthHeaders(accessToken),
    });
    return await response.json();
  } catch (error) {
    console.error('[Credits] Get orders error:', error);
    return { success: false, error: error.message };
  }
};

/**
 * 手动完成充值订单（临时测试用）
 */
export const manualCompleteOrder = async (accessToken, txHash) => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/credits/manual-complete`, {
      method: 'POST',
      headers: createAuthHeaders(accessToken),
      body: JSON.stringify({ txHash }),
    });
    return await response.json();
  } catch (error) {
    console.error('[Credits] Manual complete error:', error);
    return { success: false, error: error.message };
  }
};

export default {
  // 余额
  getBalance,
  getUsageRecords,
  getTransactionHistory,
  getUsageStats,
  getDailySummary,
  getModelBreakdown,
  estimateCost,
  // 充值
  getRechargeConfig,
  createPendingRecharge,
  createRechargeOrder,
  submitTransaction,
  verifyTransaction,
  getOrderStatus,
  getRechargeOrders,
  manualCompleteOrder,
};



