/**
 * Polymarket API Proxy Controller
 * 
 * 代理 Polymarket 公开 API 请求，解决前端 CORS 问题
 * 这些端点不需要认证，因为都是公开数据
 */

const GAMMA_API_URL = 'https://gamma-api.polymarket.com';
const CLOB_API_URL = 'https://clob.polymarket.com';

/**
 * 代理 Gamma API 请求
 * GET /api/polymarket/gamma-api/*
 */
export async function proxyGammaAPI(req, res) {
  try {
    const path = req.params[0] || '';
    const queryString = new URLSearchParams(req.query).toString();
    const url = `${GAMMA_API_URL}/${path}${queryString ? `?${queryString}` : ''}`;

    console.log(`[Gamma Proxy] Forwarding: ${req.method} ${url}`);

    const response = await fetch(url, {
      method: req.method,
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'PromptTrading-Backend/1.0',
      },
    });

    if (!response.ok) {
      console.warn(`[Gamma Proxy] API returned ${response.status} for ${url}`);
    }

    // 验证响应类型，防止 HTML 错误页面导致 JSON 解析失败
    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      const text = await response.text();
      console.error(`[Gamma Proxy] Non-JSON response: ${text.substring(0, 200)}`);
      return res.status(502).json({
        error: 'Upstream API returned non-JSON response',
        status: response.status,
        contentType: contentType || 'unknown'
      });
    }

    const data = await response.json();
    
    // 设置 CORS 头
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    res.status(response.status).json(data);

  } catch (error) {
    console.error('[Gamma Proxy] Error:', error.message);
    res.status(500).json({
      error: 'Failed to proxy Gamma API request',
      message: error.message
    });
  }
}

/**
 * 代理 CLOB API 请求
 * GET /api/polymarket/clob-api/*
 */
export async function proxyClobAPI(req, res) {
  try {
    const path = req.params[0] || '';
    const queryString = new URLSearchParams(req.query).toString();
    const url = `${CLOB_API_URL}/${path}${queryString ? `?${queryString}` : ''}`;

    console.log(`[CLOB Proxy] Forwarding: ${req.method} ${url}`);

    const response = await fetch(url, {
      method: req.method,
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'PromptTrading-Backend/1.0',
      },
    });

    if (!response.ok) {
      console.warn(`[CLOB Proxy] API returned ${response.status} for ${url}`);
    }

    // 验证响应类型，防止 HTML 错误页面导致 JSON 解析失败
    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      const text = await response.text();
      console.error(`[CLOB Proxy] Non-JSON response: ${text.substring(0, 200)}`);
      return res.status(502).json({
        error: 'Upstream API returned non-JSON response',
        status: response.status,
        contentType: contentType || 'unknown'
      });
    }

    const data = await response.json();
    
    // 设置 CORS 头
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    res.status(response.status).json(data);

  } catch (error) {
    console.error('[CLOB Proxy] Error:', error.message);
    res.status(500).json({
      error: 'Failed to proxy CLOB API request',
      message: error.message
    });
  }
}

export default {
  proxyGammaAPI,
  proxyClobAPI,
};

