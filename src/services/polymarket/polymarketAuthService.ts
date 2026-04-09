/**
 * Polymarket 认证服务
 *
 * 认证流程：
 * 1. L1认证：使用Privy钱包的EIP-712签名创建API Key
 * 2. L2认证：使用HMAC签名进行API调用
 */

import {
  PolymarketApiCredentials,
  L1AuthHeaders,
  L2AuthHeaders,
  POLYMARKET_APIS,
} from '../../types/polymarketTrading';

// ============================================
// 浏览器兼容的HMAC签名工具
// ============================================

/**
 * Base64解码为ArrayBuffer
 * 支持 URL-safe base64 (使用 - 和 _ 代替 + 和 /)
 */
function base64ToArrayBuffer(base64: string): ArrayBuffer {
  // 将 URL-safe base64 转换为标准 base64
  let standardBase64 = base64.replace(/-/g, '+').replace(/_/g, '/');

  // 添加必要的 padding
  const paddingNeeded = (4 - (standardBase64.length % 4)) % 4;
  standardBase64 += '='.repeat(paddingNeeded);

  const binaryString = atob(standardBase64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * ArrayBuffer转Base64
 */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * 使用Web Crypto API生成HMAC-SHA256签名
 */
async function hmacSha256(secret: string, message: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = base64ToArrayBuffer(secret);
  const messageData = encoder.encode(message);

  const key = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign('HMAC', key, messageData);
  return arrayBufferToBase64(signature);
}

// L1认证的EIP-712类型定义
const L1_AUTH_DOMAIN = {
  name: 'ClobAuthDomain',
  version: '1',
  chainId: 137,
};

const L1_AUTH_TYPES = {
  ClobAuth: [
    { name: 'address', type: 'address' },
    { name: 'timestamp', type: 'string' },
    { name: 'nonce', type: 'uint256' },
    { name: 'message', type: 'string' },
  ],
};

/**
 * 生成L1认证签名消息
 */
export function generateL1AuthMessage(address: string, timestamp: number, nonce: number = 0): {
  domain: typeof L1_AUTH_DOMAIN;
  types: typeof L1_AUTH_TYPES;
  message: Record<string, unknown>;
  primaryType: string;
} {
  return {
    domain: L1_AUTH_DOMAIN,
    types: L1_AUTH_TYPES,
    message: {
      address: address,
      timestamp: timestamp.toString(),
      nonce: nonce,
      message: 'This message attests that I control the given wallet',
    },
    primaryType: 'ClobAuth',
  };
}

/**
 * 构建L1认证头
 */
export function buildL1Headers(
  address: string,
  signature: string,
  timestamp: number,
  nonce: number = 0
): L1AuthHeaders {
  return {
    'POLY_ADDRESS': address,
    'POLY_SIGNATURE': signature,
    'POLY_TIMESTAMP': timestamp.toString(),
    'POLY_NONCE': nonce.toString(),
  };
}

/**
 * 生成L2 HMAC签名
 */
export async function generateL2Signature(
  apiSecret: string,
  timestamp: string,
  method: string,
  requestPath: string,
  body: string = ''
): Promise<string> {
  const message = timestamp + method + requestPath + body;
  return hmacSha256(apiSecret, message);
}

/**
 * 构建L2认证头
 */
export async function buildL2Headers(
  address: string,
  credentials: PolymarketApiCredentials,
  method: string,
  requestPath: string,
  body: string = ''
): Promise<L2AuthHeaders> {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = await generateL2Signature(
    credentials.apiSecret,
    timestamp,
    method,
    requestPath,
    body
  );

  return {
    'POLY_ADDRESS': address,
    'POLY_SIGNATURE': signature,
    'POLY_TIMESTAMP': timestamp,
    'POLY_API_KEY': credentials.apiKey,
    'POLY_PASSPHRASE': credentials.passphrase,
  };
}

/**
 * 创建或派生API Key
 * 需要L1签名
 */
export async function createApiKey(
  address: string,
  signTypedData: (domain: object, types: object, message: object, primaryType: string) => Promise<string>
): Promise<PolymarketApiCredentials> {
  const timestamp = Math.floor(Date.now() / 1000);
  const nonce = 0;

  // 生成签名消息
  const { domain, types, message, primaryType } = generateL1AuthMessage(address, timestamp, nonce);

  // 使用Privy钱包签名
  const signature = await signTypedData(domain, types, message, primaryType);

  // 构建L1认证头
  const headers = buildL1Headers(address, signature, timestamp, nonce);

  // 调用CLOB API创建API Key
  const response = await fetch(`${POLYMARKET_APIS.CLOB}/auth/api-key`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to create API key: ${error}`);
  }

  const data = await response.json();

  return {
    apiKey: data.apiKey,
    apiSecret: data.secret,
    passphrase: data.passphrase,
  };
}

/**
 * 派生API Key（如果已有签名，可以派生出API Key）
 */
export async function deriveApiKey(
  address: string,
  signTypedData: (domain: object, types: object, message: object, primaryType: string) => Promise<string>
): Promise<PolymarketApiCredentials> {
  const timestamp = Math.floor(Date.now() / 1000);
  const nonce = 0;

  // 生成签名消息
  const { domain, types, message, primaryType } = generateL1AuthMessage(address, timestamp, nonce);

  // 使用Privy钱包签名
  const signature = await signTypedData(domain, types, message, primaryType);

  // 构建L1认证头
  const headers = buildL1Headers(address, signature, timestamp, nonce);

  // 调用CLOB API派生API Key
  const response = await fetch(`${POLYMARKET_APIS.CLOB}/auth/derive-api-key`, {
    method: 'GET',
    headers: {
      ...headers,
    },
  });

  if (!response.ok) {
    // 如果派生失败，尝试创建新的
    console.log('Derive API key failed, trying to create new one...');
    return createApiKey(address, signTypedData);
  }

  const data = await response.json();

  return {
    apiKey: data.apiKey,
    apiSecret: data.secret,
    passphrase: data.passphrase,
  };
}

/**
 * 删除API Key
 */
export async function deleteApiKey(
  address: string,
  credentials: PolymarketApiCredentials
): Promise<boolean> {
  const requestPath = '/auth/api-key';
  const headers = await buildL2Headers(address, credentials, 'DELETE', requestPath);

  const response = await fetch(`${POLYMARKET_APIS.CLOB}${requestPath}`, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
  });

  return response.ok;
}

/**
 * 获取所有API Keys
 */
export async function getApiKeys(
  address: string,
  signTypedData: (domain: object, types: object, message: object, primaryType: string) => Promise<string>
): Promise<{ apiKey: string }[]> {
  const timestamp = Math.floor(Date.now() / 1000);
  const nonce = 0;

  const { domain, types, message, primaryType } = generateL1AuthMessage(address, timestamp, nonce);
  const signature = await signTypedData(domain, types, message, primaryType);
  const headers = buildL1Headers(address, signature, timestamp, nonce);

  const response = await fetch(`${POLYMARKET_APIS.CLOB}/auth/api-keys`, {
    method: 'GET',
    headers: {
      ...headers,
    },
  });

  if (!response.ok) {
    throw new Error('Failed to get API keys');
  }

  return response.json();
}

// ============================================
// 后端API Key存储相关
// ============================================

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3002';

/**
 * 从后端获取已存储的API Key
 */
export async function getStoredApiKey(
  accessToken: string,
  walletAddress: string
): Promise<PolymarketApiCredentials | null> {
  try {
    console.log('[AuthService] Fetching stored API key for wallet:', walletAddress);
    
    const response = await fetch(`${API_BASE_URL}/api/polymarket/trading/api-key`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'X-Wallet-Address': walletAddress,
      },
    });

    console.log('[AuthService] API key response status:', response.status);

    if (!response.ok) {
      if (response.status === 404) {
        console.log('[AuthService] No stored API key found (404)');
        return null;
      }
      throw new Error(`Failed to get stored API key: ${response.status}`);
    }

    const data = await response.json();
    console.log('[AuthService] API key response:', { success: data.success, hasData: !!data.data });
    
    if (data.success && data.data) {
      return {
        apiKey: data.data.apiKey,
        apiSecret: data.data.apiSecret,
        passphrase: data.data.passphrase,
      };
    }

    return null;
  } catch (error) {
    console.error('[AuthService] Failed to get stored API key:', error);
    return null;
  }
}

/**
 * 保存API Key到后端
 */
export async function saveApiKey(
  accessToken: string,
  walletAddress: string,
  credentials: PolymarketApiCredentials
): Promise<boolean> {
  try {
    console.log('[AuthService] Saving API key for wallet:', walletAddress);
    
    const response = await fetch(`${API_BASE_URL}/api/polymarket/trading/api-key`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'X-Wallet-Address': walletAddress,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(credentials),
    });

    console.log('[AuthService] Save API key response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[AuthService] Failed to save API key:', errorText);
      throw new Error('Failed to save API key');
    }

    const data = await response.json();
    console.log('[AuthService] API key saved successfully:', data.success);
    return data.success;
  } catch (error) {
    console.error('[AuthService] Failed to save API key:', error);
    return false;
  }
}

/**
 * 删除后端存储的API Key
 */
export async function deleteStoredApiKey(
  accessToken: string,
  walletAddress: string
): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/polymarket/trading/api-key`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'X-Wallet-Address': walletAddress,
      },
    });

    return response.ok;
  } catch (error) {
    console.error('Failed to delete stored API key:', error);
    return false;
  }
}

/**
 * 自动创建 API 凭证 (使用 Privy Delegated Actions)
 * 
 * 后端会使用 Privy 的委托签名功能自动创建凭证，无需用户手动签名
 * 
 * @returns {Promise<{success: boolean, alreadyExists?: boolean, error?: string}>}
 */
export async function createApiCredentialsAuto(
  accessToken: string,
  walletAddress: string
): Promise<{ success: boolean; alreadyExists?: boolean; error?: string }> {
  try {
    console.log('[AuthService] Creating API credentials via Privy Delegated Actions...');
    
    const response = await fetch(`${API_BASE_URL}/api/polymarket/trading/create-credentials`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'X-Wallet-Address': walletAddress,
        'Content-Type': 'application/json',
      },
    });

    console.log('[AuthService] Create credentials response status:', response.status);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('[AuthService] Failed to create credentials:', errorData);
      
      // 如果是委托未启用，返回特定错误
      if (errorData.code === 'DELEGATION_NOT_ENABLED') {
        return {
          success: false,
          error: '请先启用自动交易功能（Delegated Actions）',
        };
      }
      
      return {
        success: false,
        error: errorData.error || 'Failed to create credentials',
      };
    }

    const data = await response.json();
    console.log('[AuthService] ✅ API credentials created:', { 
      success: data.success, 
      alreadyExists: data.alreadyExists 
    });
    
    return {
      success: data.success,
      alreadyExists: data.alreadyExists,
    };
  } catch (error) {
    console.error('[AuthService] Failed to create API credentials:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create credentials',
    };
  }
}

/**
 * 获取或创建API Key（优先从后端获取，不存在则创建并保存）
 */
export async function getOrCreateApiKey(
  accessToken: string,
  walletAddress: string,
  signTypedData: (domain: object, types: object, message: object, primaryType: string) => Promise<string>
): Promise<PolymarketApiCredentials> {
  // 1. 先尝试从后端获取
  const storedCredentials = await getStoredApiKey(accessToken, walletAddress);
  if (storedCredentials) {
    console.log('Using stored API credentials');
    return storedCredentials;
  }

  // 2. 不存在则创建新的
  console.log('Creating new API credentials...');
  const newCredentials = await deriveApiKey(walletAddress, signTypedData);

  // 3. 保存到后端
  await saveApiKey(accessToken, walletAddress, newCredentials);

  return newCredentials;
}
