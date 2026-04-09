/**
 * Polymarket Builder Controller
 *
 * 提供 Builder HMAC 签名服务
 * - Builder 凭证安全保存在服务器端（生产环境从 AWS Secrets Manager 获取）
 * - 前端通过此端点获取签名，用于订单归因
 */

import { buildHmacSignature } from '@polymarket/builder-signing-sdk';
import axios from 'axios';
import { getPolymarketBuilderCredentials } from '../config/secrets.js';

// Polymarket Relayer URL
const RELAYER_URL = 'https://relayer-v2.polymarket.com';

// Builder 凭证缓存
let cachedBuilderCredentials = null;

/**
 * 获取 Builder 凭证（从 AWS Secrets Manager 或本地环境变量）
 */
async function getBuilderCredentials() {
  if (cachedBuilderCredentials) {
    return cachedBuilderCredentials;
  }

  try {
    const credentials = await getPolymarketBuilderCredentials();
    cachedBuilderCredentials = {
      key: credentials.key?.trim(),
      secret: credentials.secret?.trim(),
      passphrase: credentials.passphrase?.trim(),
    };

    console.log('[Builder] Credentials loaded:', {
      hasKey: !!cachedBuilderCredentials.key,
      hasSecret: !!cachedBuilderCredentials.secret,
      hasPassphrase: !!cachedBuilderCredentials.passphrase,
      keyPrefix: cachedBuilderCredentials.key ? cachedBuilderCredentials.key.substring(0, 8) + '...' : 'NOT SET',
    });

    return cachedBuilderCredentials;
  } catch (error) {
    console.error('[Builder] Failed to load credentials:', error.message);
    return { key: null, secret: null, passphrase: null };
  }
}

/**
 * 检查 Builder 凭证是否已配置
 */
async function isBuilderConfigured() {
  const credentials = await getBuilderCredentials();
  return !!(
    credentials.key &&
    credentials.secret &&
    credentials.passphrase
  );
}

/**
 * 生成 Builder HMAC 签名
 * POST /api/polymarket/sign
 *
 * 参考: https://github.com/ayv8er/polymarket-safe-trader/blob/main/app/api/polymarket/sign/route.ts
 *
 * Request Body:
 * {
 *   method: "POST" | "GET" | "DELETE",
 *   path: "/order",
 *   body?: string (JSON string for POST requests)
 * }
 *
 * Response (直接返回 headers，SDK 期望的格式):
 * {
 *   POLY_BUILDER_SIGNATURE: string,
 *   POLY_BUILDER_TIMESTAMP: string,
 *   POLY_BUILDER_API_KEY: string,
 *   POLY_BUILDER_PASSPHRASE: string
 * }
 */
export async function signBuilderRequest(req, res) {
  console.log('[Builder Sign] ====== Request received ======');
  console.log('[Builder Sign] Body:', JSON.stringify(req.body, null, 2));

  try {
    // 获取 Builder 凭证（从 AWS Secrets Manager 或本地环境变量）
    const credentials = await getBuilderCredentials();

    // 检查 Builder 凭证是否已配置
    if (!(await isBuilderConfigured())) {
      console.log('[Builder Sign] ERROR: Credentials not configured!');
      return res.status(503).json({
        error: 'Builder credentials not configured',
        message: 'Builder credentials not found in AWS Secrets Manager or environment variables',
      });
    }

    const { method, path, body } = req.body;

    // 验证必需参数
    if (!method || !path) {
      return res.status(400).json({
        error: 'Missing required fields: method, path',
      });
    }

    // 生成时间戳（毫秒，不是秒！参考 polymarket-safe-trader）
    const timestamp = Date.now();

    // 获取请求体（SDK 可能发送 body 或 requestBody）
    const requestBody = body || '';

    console.log('[Builder Sign] Signature params:', {
      timestamp,
      method: method.toUpperCase(),
      path,
      bodyLength: requestBody.length,
      bodyPreview: requestBody.substring(0, 100) + '...',
    });

    // 使用官方 SDK 生成 HMAC 签名
    const signature = buildHmacSignature(
      credentials.secret,
      timestamp,
      method.toUpperCase(),
      path,
      requestBody
    );

    // 直接返回 Builder 签名头（SDK 期望的格式）
    // 参考: https://github.com/ayv8er/polymarket-safe-trader
    const response = {
      POLY_BUILDER_SIGNATURE: signature,
      POLY_BUILDER_TIMESTAMP: timestamp.toString(),
      POLY_BUILDER_API_KEY: credentials.key,
      POLY_BUILDER_PASSPHRASE: credentials.passphrase,
    };
    console.log('[Builder Sign] SUCCESS - Returning headers:', {
      timestamp: response.POLY_BUILDER_TIMESTAMP,
      signaturePrefix: signature.substring(0, 20) + '...',
      apiKeyPrefix: credentials.key.substring(0, 8) + '...',
    });
    return res.json(response);
  } catch (error) {
    console.error('Builder sign error:', error);
    return res.status(500).json({
      error: 'Failed to generate builder signature',
      message: error.message,
    });
  }
}

/**
 * 获取 Builder API Key（公开部分）
 * GET /api/polymarket/builder-info
 *
 * 返回可以公开的 Builder 信息（用于前端 BuilderConfig）
 */
export async function getBuilderInfo(req, res) {
  try {
    if (!(await isBuilderConfigured())) {
      return res.json({
        success: true,
        configured: false,
      });
    }

    const credentials = await getBuilderCredentials();
    return res.json({
      success: true,
      configured: true,
      apiKey: credentials.key,
      // 注意：不返回 secret，secret 只在服务器端使用
    });
  } catch (error) {
    console.error('Get builder info error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get builder info',
    });
  }
}

/**
 * 健康检查 - 验证 Builder 凭证是否有效
 * GET /api/polymarket/builder-health
 */
export async function checkBuilderHealth(req, res) {
  try {
    const configured = await isBuilderConfigured();

    if (!configured) {
      return res.json({
        success: true,
        status: 'not_configured',
        message: 'Builder credentials are not configured',
      });
    }

    const credentials = await getBuilderCredentials();

    // 测试签名生成（毫秒）
    const testTimestamp = Date.now();
    const testSignature = buildHmacSignature(
      credentials.secret,
      testTimestamp,
      'GET',
      '/test',
      ''
    );

    return res.json({
      success: true,
      status: 'healthy',
      message: 'Builder credentials are configured and working',
      apiKeyPrefix: credentials.key.substring(0, 8) + '...',
    });
  } catch (error) {
    console.error('Builder health check error:', error);
    return res.json({
      success: false,
      status: 'error',
      message: error.message,
    });
  }
}

/**
 * 透明代理请求到 Polymarket Relayer
 * 
 * 这个代理用于绕过浏览器 CORS 限制
 * 支持两种模式:
 * 1. 透明模式: 直接转发原始请求体和头部到 Polymarket relayer
 * 2. 包装模式: 使用 { endpoint, payload, builderHeaders } 格式
 */

/**
 * 代理 /submit 端点
 * POST /api/polymarket/relayer-proxy/submit
 */
export async function proxyRelayerSubmit(req, res) {
  console.log('[Relayer Proxy] ====== /submit Request received ======');
  
  try {
    // 获取原始请求体
    let payload = req.body;
    
    console.log('[Relayer Proxy] Payload type:', typeof payload);
    console.log('[Relayer Proxy] Content-Type:', req.headers['content-type']);
    
    // 如果 payload 是字符串，尝试解析为 JSON
    if (typeof payload === 'string') {
      try {
        payload = JSON.parse(payload);
        console.log('[Relayer Proxy] Parsed string payload to JSON');
      } catch (e) {
        console.log('[Relayer Proxy] Payload is a non-JSON string');
      }
    }
    
    // 检查是否是嵌套的 JSON 字符串（RelayClient 可能发送的格式）
    if (payload && typeof payload === 'object') {
      const keys = Object.keys(payload);
      if (keys.length === 1 && keys[0].startsWith('{')) {
        // Payload was incorrectly parsed - the entire JSON string became a key
        console.log('[Relayer Proxy] Detected malformed payload, trying to fix...');
        try {
          payload = JSON.parse(keys[0]);
          console.log('[Relayer Proxy] Fixed malformed payload');
        } catch (e) {
          console.log('[Relayer Proxy] Could not fix malformed payload');
        }
      }
    }
    
    console.log('[Relayer Proxy] Payload preview:', JSON.stringify(payload).substring(0, 300) + '...');
    console.log('[Relayer Proxy] Payload from:', payload?.from);
    console.log('[Relayer Proxy] Payload type field:', payload?.type);

    // 从请求头获取 Builder 认证信息
    // HTTP headers are case-insensitive, Express lowercases them
    const builderHeaders = {};
    
    // Map lowercase header names to the correct format for Polymarket relayer
    const headerMappings = {
      'poly_builder_signature': 'POLY_BUILDER_SIGNATURE',
      'poly_builder_timestamp': 'POLY_BUILDER_TIMESTAMP',
      'poly_builder_api_key': 'POLY_BUILDER_API_KEY',
      'poly_builder_passphrase': 'POLY_BUILDER_PASSPHRASE',
    };
    
    // Log all incoming headers for debugging
    console.log('[Relayer Proxy] All incoming headers:', Object.keys(req.headers).filter(h => h.includes('poly')));
    
    Object.entries(headerMappings).forEach(([lowercase, uppercase]) => {
      // Check various formats: lowercase with underscore, uppercase, hyphenated
      const value = req.headers[lowercase] 
        || req.headers[uppercase] 
        || req.headers[lowercase.replace(/_/g, '-')]
        || req.headers[uppercase.replace(/_/g, '-')];
      if (value) {
        builderHeaders[uppercase] = value;
        console.log(`[Relayer Proxy] Header ${uppercase}: ${value.substring(0, 20)}...`);
      }
    });

    console.log('[Relayer Proxy] Builder headers found:', Object.keys(builderHeaders));

    // 构建请求头
    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...builderHeaders,
    };

    // 发送请求到 Polymarket relayer（带重试）
    let lastError = null;
    const maxRetries = 3;
    const retryDelay = 3000;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`[Relayer Proxy] Attempt ${attempt}/${maxRetries} to ${RELAYER_URL}/submit`);
        
        const response = await axios.post(
          `${RELAYER_URL}/submit`,
          payload,
          {
            headers,
            timeout: 120000, // 120 秒超时（relayer 可能很慢）
          }
        );

        console.log('[Relayer Proxy] Success:', {
          status: response.status,
          dataPreview: JSON.stringify(response.data).substring(0, 300),
        });

        // 返回原始响应（透明代理）
        return res.status(response.status).json(response.data);
      } catch (error) {
        lastError = error;
        console.error(`[Relayer Proxy] Attempt ${attempt} failed:`, {
          status: error.response?.status,
          statusText: error.response?.statusText,
          data: error.response?.data,
          message: error.message,
        });

        // 如果是 4xx 错误，不重试（除了 429 Too Many Requests）
        if (error.response?.status >= 400 && error.response?.status < 500 && error.response?.status !== 429) {
          break;
        }

        // 等待后重试
        if (attempt < maxRetries) {
          console.log(`[Relayer Proxy] Waiting ${retryDelay}ms before retry...`);
          await new Promise(resolve => setTimeout(resolve, retryDelay));
        }
      }
    }

    // 所有重试都失败了
    console.error('[Relayer Proxy] All retries failed');

    // 返回原始错误响应（透明代理）
    if (lastError?.response) {
      return res.status(lastError.response.status).json(lastError.response.data);
    }

    return res.status(502).json({
      error: 'Relayer request failed',
      message: lastError?.message || 'Unknown error',
    });

  } catch (error) {
    console.error('[Relayer Proxy] Unexpected error:', error);
    return res.status(500).json({
      error: 'Proxy error',
      message: error.message,
    });
  }
}

/**
 * 代理 /transactions/:id 端点 - 用于查询交易状态
 * GET /api/polymarket/relayer-proxy/transactions/:id
 */
export async function proxyRelayerTransaction(req, res) {
  const { id } = req.params;
  console.log('[Relayer Proxy] ====== /transactions Request received ======');
  console.log('[Relayer Proxy] Transaction ID:', id);
  
  // 带重试的请求
  let lastError = null;
  const maxRetries = 3;
  const retryDelay = 2000;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[Relayer Proxy] /transactions Attempt ${attempt}/${maxRetries}`);
      
      const response = await axios.get(
        `${RELAYER_URL}/transactions/${id}`,
        {
          headers: {
            'Accept': 'application/json',
          },
          timeout: 30000,
        }
      );

      console.log('[Relayer Proxy] Transaction status:', response.data);
      return res.status(response.status).json(response.data);
    } catch (error) {
      lastError = error;
      console.error(`[Relayer Proxy] /transactions Attempt ${attempt} failed:`, error.message);
      
      // 如果是 4xx 客户端错误，不重试
      if (error.response?.status >= 400 && error.response?.status < 500) {
        break;
      }
      
      // ECONNRESET 或 5xx 错误，等待后重试
      if (attempt < maxRetries) {
        console.log(`[Relayer Proxy] Waiting ${retryDelay}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }
    }
  }

  // 所有重试都失败了
  console.error('[Relayer Proxy] /transactions All retries failed');
  
  if (lastError?.response) {
    return res.status(lastError.response.status).json(lastError.response.data);
  }

  return res.status(502).json({
    error: 'Failed to query transaction',
    message: lastError?.message || 'Unknown error',
  });
}

/**
 * 代理 /deployed 端点 - 检查 Safe 是否已部署
 * GET /api/polymarket/relayer-proxy/deployed
 */
export async function proxyRelayerDeployed(req, res) {
  const { address } = req.query;
  console.log('[Relayer Proxy] ====== /deployed Request received ======');
  console.log('[Relayer Proxy] Address:', address);
  
  // 带重试的请求
  let lastError = null;
  const maxRetries = 3;
  const retryDelay = 2000;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[Relayer Proxy] /deployed Attempt ${attempt}/${maxRetries}`);
      
      const response = await axios.get(
        `${RELAYER_URL}/deployed`,
        {
          params: { address },
          headers: {
            'Accept': 'application/json',
          },
          timeout: 30000,
        }
      );

      console.log('[Relayer Proxy] Deployed status:', response.data);
      return res.status(response.status).json(response.data);
    } catch (error) {
      lastError = error;
      console.error(`[Relayer Proxy] /deployed Attempt ${attempt} failed:`, error.message);
      
      // 如果是 4xx 客户端错误，不重试
      if (error.response?.status >= 400 && error.response?.status < 500) {
        break;
      }
      
      // ECONNRESET 或 5xx 错误，等待后重试
      if (attempt < maxRetries) {
        console.log(`[Relayer Proxy] Waiting ${retryDelay}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }
    }
  }

  // 所有重试都失败了
  console.error('[Relayer Proxy] /deployed All retries failed');
  
  if (lastError?.response) {
    return res.status(lastError.response.status).json(lastError.response.data);
  }

  return res.status(502).json({
    error: 'Failed to query deployed status',
    message: lastError?.message || 'Unknown error',
  });
}

/**
 * 代理 /nonce 端点 - 获取 Safe 的 nonce
 * GET /api/polymarket/relayer-proxy/nonce
 */
export async function proxyRelayerNonce(req, res) {
  // 转发所有查询参数 (address, type 等)
  const queryParams = req.query;
  console.log('[Relayer Proxy] ====== /nonce Request received ======');
  console.log('[Relayer Proxy] Query params:', queryParams);

  // 带重试的请求
  let lastError = null;
  const maxRetries = 3;
  const retryDelay = 2000;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[Relayer Proxy] /nonce Attempt ${attempt}/${maxRetries}`);

      const response = await axios.get(
        `${RELAYER_URL}/nonce`,
        {
          params: queryParams, // 转发所有参数
          headers: {
            'Accept': 'application/json',
          },
          timeout: 30000,
        }
      );

      console.log('[Relayer Proxy] Nonce:', response.data);
      return res.status(response.status).json(response.data);
    } catch (error) {
      lastError = error;
      console.error(`[Relayer Proxy] /nonce Attempt ${attempt} failed:`, error.message);
      
      // 如果是 4xx 客户端错误，不重试
      if (error.response?.status >= 400 && error.response?.status < 500) {
        break;
      }
      
      // ECONNRESET 或 5xx 错误，等待后重试
      if (attempt < maxRetries) {
        console.log(`[Relayer Proxy] Waiting ${retryDelay}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }
    }
  }

  // 所有重试都失败了
  console.error('[Relayer Proxy] /nonce All retries failed');
  
  if (lastError?.response) {
    return res.status(lastError.response.status).json(lastError.response.data);
  }

  return res.status(502).json({
    error: 'Failed to query nonce',
    message: lastError?.message || 'Unknown error',
  });
}

/**
 * 通用代理 - 处理所有其他 GET 请求
 * GET /api/polymarket/relayer-proxy/*
 */
export async function proxyRelayerGenericGet(req, res) {
  const path = req.params[0] || '';
  console.log('[Relayer Proxy] ====== Generic GET Request ======');
  console.log('[Relayer Proxy] Path:', path);
  console.log('[Relayer Proxy] Query:', req.query);
  
  // 带重试的请求
  let lastError = null;
  const maxRetries = 3;
  const retryDelay = 2000;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[Relayer Proxy] Generic GET Attempt ${attempt}/${maxRetries}`);
      
      const response = await axios.get(
        `${RELAYER_URL}/${path}`,
        {
          params: req.query,
          headers: {
            'Accept': 'application/json',
          },
          timeout: 30000,
        }
      );

      console.log('[Relayer Proxy] Response:', response.data);
      return res.status(response.status).json(response.data);
    } catch (error) {
      lastError = error;
      console.error(`[Relayer Proxy] Generic GET Attempt ${attempt} failed:`, error.message);
      
      // 如果是 4xx 客户端错误，不重试
      if (error.response?.status >= 400 && error.response?.status < 500) {
        break;
      }
      
      // ECONNRESET 或 5xx 错误，等待后重试
      if (attempt < maxRetries) {
        console.log(`[Relayer Proxy] Waiting ${retryDelay}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }
    }
  }

  // 所有重试都失败了
  console.error('[Relayer Proxy] Generic GET All retries failed');
  
  if (lastError?.response) {
    return res.status(lastError.response.status).json(lastError.response.data);
  }

  return res.status(502).json({
    error: 'Relayer request failed',
    message: lastError?.message || 'Unknown error',
  });
}
