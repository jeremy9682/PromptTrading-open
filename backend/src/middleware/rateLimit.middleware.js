/**
 * 速率限制中间件
 * 
 * 防止 API 滥用和 DoS 攻击
 */

// 简单的内存存储（生产环境建议使用 Redis）
const requestCounts = new Map();

// 定期清理过期记录
setInterval(() => {
  const now = Date.now();
  for (const [key, data] of requestCounts.entries()) {
    if (now - data.startTime > data.windowMs) {
      requestCounts.delete(key);
    }
  }
}, 60000); // 每分钟清理一次

/**
 * 创建速率限制中间件
 * @param {Object} options 配置选项
 * @param {number} options.windowMs - 时间窗口（毫秒）
 * @param {number} options.max - 最大请求数
 * @param {string} options.message - 超限错误消息
 * @param {Function} options.keyGenerator - 生成限制 key 的函数
 */
export const createRateLimiter = (options = {}) => {
  const {
    windowMs = 60000, // 默认 1 分钟
    max = 10,          // 默认最多 10 次
    message = 'Too many requests, please try again later',
    keyGenerator = (req) => {
      // 默认使用用户 ID 或 IP
      return req.privyUser?.userId || req.ip || 'anonymous';
    },
  } = options;

  return (req, res, next) => {
    const key = keyGenerator(req);
    const now = Date.now();

    let record = requestCounts.get(key);

    if (!record || now - record.startTime > windowMs) {
      // 新窗口
      record = {
        count: 1,
        startTime: now,
        windowMs,
      };
      requestCounts.set(key, record);
    } else {
      record.count++;
    }

    // 设置响应头
    res.set('X-RateLimit-Limit', max);
    res.set('X-RateLimit-Remaining', Math.max(0, max - record.count));
    res.set('X-RateLimit-Reset', new Date(record.startTime + windowMs).toISOString());

    if (record.count > max) {
      console.warn(`[RateLimit] Rate limit exceeded for ${key}: ${record.count}/${max}`);
      return res.status(429).json({
        success: false,
        error: message,
        retryAfter: Math.ceil((record.startTime + windowMs - now) / 1000),
      });
    }

    next();
  };
};

/**
 * 充值 API 速率限制
 * 每用户每分钟最多 5 次创建订单
 */
export const rechargeRateLimiter = createRateLimiter({
  windowMs: 60000,  // 1 分钟
  max: 5,           // 最多 5 次
  message: 'Too many recharge requests. Please wait a minute before trying again.',
});

/**
 * 提交交易速率限制
 * 每用户每分钟最多 10 次
 */
export const submitTxRateLimiter = createRateLimiter({
  windowMs: 60000,  // 1 分钟
  max: 10,          // 最多 10 次
  message: 'Too many transaction submissions. Please wait a minute.',
});

/**
 * 通用 API 速率限制
 * 每 IP 每分钟最多 100 次
 */
export const generalRateLimiter = createRateLimiter({
  windowMs: 60000,
  max: 100,
  keyGenerator: (req) => req.ip || 'anonymous',
  message: 'Too many requests from this IP. Please try again later.',
});

export default {
  createRateLimiter,
  rechargeRateLimiter,
  submitTxRateLimiter,
  generalRateLimiter,
};














