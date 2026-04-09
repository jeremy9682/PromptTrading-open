/**
 * Polymarket API Credentials Service
 *
 * 使用 Privy Delegated Actions 自动创建 Polymarket API 凭证
 * 无需用户手动签名
 *
 * 流程：
 * 1. 使用 Privy 代签 EIP-712 消息
 * 2. 调用 Polymarket /auth/api-key 端点
 * 3. 存储凭证到数据库
 */

import { signTypedData, checkDelegationStatus } from './privy-signing.service.js';
import prisma from '../lib/prisma.js';
import crypto from 'crypto';
import { getUserByPrivyId } from './user-cache.service.js';
import { getPolymarketEncryptionKey } from '../config/secrets.js';

// Polymarket CLOB API
const CLOB_HOST = 'https://clob.polymarket.com';

// 加密配置
const ENCRYPTION_ALGORITHM = 'aes-256-gcm';

// 缓存的加密密钥
let cachedEncryptionKey = null;

/**
 * 获取加密密钥（从 AWS Secrets Manager 或本地环境变量）
 */
async function getEncryptionKey() {
  if (cachedEncryptionKey) {
    return cachedEncryptionKey;
  }
  cachedEncryptionKey = await getPolymarketEncryptionKey();
  if (!cachedEncryptionKey) {
    // 回退到随机生成（仅开发环境）
    console.warn('[PolymarketCredentials] No encryption key found, generating random key');
    cachedEncryptionKey = crypto.randomBytes(32).toString('hex');
  }
  return cachedEncryptionKey;
}

/**
 * 加密数据
 */
async function encrypt(text) {
  const encryptionKey = await getEncryptionKey();
  const iv = crypto.randomBytes(16);
  const key = Buffer.from(encryptionKey, 'hex').slice(0, 32);
  const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, key, iv);

  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  return {
    iv: iv.toString('hex'),
    encrypted,
    authTag: authTag.toString('hex'),
  };
}

// L1 认证的 EIP-712 类型定义 (与 Polymarket SDK 一致)
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
 * 生成 L1 认证的 EIP-712 类型数据
 */
function buildL1AuthTypedData(address, timestamp, nonce = 0) {
  return {
    domain: L1_AUTH_DOMAIN,
    types: L1_AUTH_TYPES,
    primaryType: 'ClobAuth',
    message: {
      address: address,
      timestamp: timestamp.toString(),
      nonce: nonce,
      message: 'This message attests that I control the given wallet',
    },
  };
}

/**
 * 调用 Polymarket API 创建 API Key (新用户)
 *
 * @param {string} address - 钱包地址
 * @param {string} signature - EIP-712 签名
 * @param {number} timestamp - 时间戳
 * @param {number} nonce - Nonce
 * @returns {Promise<{key: string, secret: string, passphrase: string}>}
 */
async function callPolymarketCreateApiKey(address, signature, timestamp, nonce = 0) {
  const url = `${CLOB_HOST}/auth/api-key`;

  console.log('[PolymarketCredentials] Creating API key for:', address);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'POLY_ADDRESS': address,
      'POLY_SIGNATURE': signature,
      'POLY_TIMESTAMP': timestamp.toString(),
      'POLY_NONCE': nonce.toString(),
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[PolymarketCredentials] API key creation failed:', response.status, errorText);
    throw new Error(`Failed to create API key: ${response.status} - ${errorText}`);
  }

  const data = await response.json();

  console.log('[PolymarketCredentials] API key created successfully');

  return {
    key: data.apiKey,
    secret: data.secret,
    passphrase: data.passphrase,
  };
}

/**
 * 调用 Polymarket API 派生 API Key (返回用户)
 *
 * 如果用户之前已经创建过 API Key，使用 derive 可以获取已有的凭证
 *
 * @param {string} address - 钱包地址
 * @param {string} signature - EIP-712 签名
 * @param {number} timestamp - 时间戳
 * @param {number} nonce - Nonce
 * @returns {Promise<{key: string, secret: string, passphrase: string}>}
 */
async function callPolymarketDeriveApiKey(address, signature, timestamp, nonce = 0) {
  const url = `${CLOB_HOST}/auth/derive-api-key`;

  console.log('[PolymarketCredentials] Deriving API key for:', address);

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'POLY_ADDRESS': address,
      'POLY_SIGNATURE': signature,
      'POLY_TIMESTAMP': timestamp.toString(),
      'POLY_NONCE': nonce.toString(),
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[PolymarketCredentials] API key derive failed:', response.status, errorText);
    throw new Error(`Failed to derive API key: ${response.status} - ${errorText}`);
  }

  const data = await response.json();

  console.log('[PolymarketCredentials] API key derived successfully');

  return {
    key: data.apiKey,
    secret: data.secret,
    passphrase: data.passphrase,
  };
}

/**
 * 获取或创建 API Key
 *
 * 参考 Polymarket 官方流程：
 * 1. 先尝试 derive (返回用户 - 已有 API Key)
 * 2. 如果 derive 失败，尝试 create (新用户)
 *
 * @param {string} address - 钱包地址
 * @param {string} signature - EIP-712 签名
 * @param {number} timestamp - 时间戳
 * @param {number} nonce - Nonce
 * @returns {Promise<{key: string, secret: string, passphrase: string}>}
 */
async function getOrCreateApiKey(address, signature, timestamp, nonce = 0) {
  // 1. 先尝试 derive（返回用户）
  try {
    console.log('[PolymarketCredentials] Trying deriveApiKey first (returning user)...');
    const credentials = await callPolymarketDeriveApiKey(address, signature, timestamp, nonce);
    console.log('[PolymarketCredentials] ✅ deriveApiKey succeeded');
    return credentials;
  } catch (deriveError) {
    console.log('[PolymarketCredentials] deriveApiKey failed, trying createApiKey...', deriveError.message);
  }

  // 2. 如果 derive 失败，尝试 create（新用户）
  try {
    console.log('[PolymarketCredentials] Trying createApiKey (new user)...');
    const credentials = await callPolymarketCreateApiKey(address, signature, timestamp, nonce);
    console.log('[PolymarketCredentials] ✅ createApiKey succeeded');
    return credentials;
  } catch (createError) {
    console.error('[PolymarketCredentials] Both derive and create failed:', createError.message);
    throw new Error(`Failed to get or create API key: ${createError.message}`);
  }
}

/**
 * 使用 Privy Delegated Actions 创建 Polymarket API 凭证
 *
 * @param {string} privyUserId - Privy 用户 ID
 * @param {string} walletAddress - 钱包地址
 * @returns {Promise<{success: boolean, apiKey?: string, apiSecret?: string, passphrase?: string, error?: string}>}
 */
export async function createPolymarketCredentials(privyUserId, walletAddress) {
  console.log('[PolymarketCredentials] Creating credentials for user:', privyUserId);

  try {
    // 1. 检查用户是否已授权委托
    const { isDelegated } = await checkDelegationStatus(privyUserId);
    if (!isDelegated) {
      console.log('[PolymarketCredentials] User has not enabled delegation');
      return {
        success: false,
        error: 'User has not enabled delegation',
      };
    }

    // 2. 生成时间戳和 nonce
    const timestamp = Math.floor(Date.now() / 1000);
    const nonce = 0;

    // 3. 构建 EIP-712 类型数据
    const typedData = buildL1AuthTypedData(walletAddress, timestamp, nonce);

    console.log('[PolymarketCredentials] Signing EIP-712 message via Privy...');

    // 4. 使用 Privy 代签
    const signature = await signTypedData(privyUserId, walletAddress, typedData);

    console.log('[PolymarketCredentials] Signature obtained, getting or creating API key...');

    // 5. 调用 Polymarket API 获取或创建凭证 (先 derive，失败再 create)
    const credentials = await getOrCreateApiKey(walletAddress, signature, timestamp, nonce);

    console.log('[PolymarketCredentials] ✅ Credentials obtained successfully');

    return {
      success: true,
      apiKey: credentials.key,
      apiSecret: credentials.secret,
      passphrase: credentials.passphrase,
    };
  } catch (error) {
    console.error('[PolymarketCredentials] Error creating credentials:', error);
    return {
      success: false,
      error: error.message || 'Failed to create credentials',
    };
  }
}

/**
 * 创建并存储 Polymarket API 凭证
 *
 * @param {string} privyUserId - Privy 用户 ID
 * @param {string} walletAddress - 钱包地址
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function createAndStoreCredentials(privyUserId, walletAddress) {
  console.log('[PolymarketCredentials] Creating and storing credentials...');

  try {
    // 1. 从缓存获取用户
    const user = await getUserByPrivyId(privyUserId);

    if (!user) {
      return {
        success: false,
        error: 'User not found',
      };
    }

    // 2. 检查是否已有凭证
    const existingCredential = await prisma.polymarketApiCredential.findUnique({
      where: {
        userId_walletAddress: {
          userId: user.id,
          walletAddress: walletAddress,
        },
      },
    });

    if (existingCredential) {
      console.log('[PolymarketCredentials] Credentials already exist');
      return {
        success: true,
        alreadyExists: true,
      };
    }

    // 3. 创建新凭证
    const result = await createPolymarketCredentials(privyUserId, walletAddress);

    if (!result.success) {
      return result;
    }

    // 4. 加密并存储
    const encryptedApiKey = JSON.stringify(await encrypt(result.apiKey));
    const encryptedApiSecret = JSON.stringify(await encrypt(result.apiSecret));
    const encryptedPassphrase = JSON.stringify(await encrypt(result.passphrase));

    await prisma.polymarketApiCredential.create({
      data: {
        userId: user.id,
        walletAddress: walletAddress,
        apiKey: encryptedApiKey,
        apiSecret: encryptedApiSecret,
        passphrase: encryptedPassphrase,
      },
    });

    console.log('[PolymarketCredentials] ✅ Credentials stored successfully');

    return {
      success: true,
    };
  } catch (error) {
    console.error('[PolymarketCredentials] Error:', error);
    return {
      success: false,
      error: error.message || 'Failed to create and store credentials',
    };
  }
}

/**
 * 检查用户是否有 API 凭证
 */
export async function hasCredentials(userId, walletAddress) {
  const credential = await prisma.polymarketApiCredential.findUnique({
    where: {
      userId_walletAddress: {
        userId: userId,
        walletAddress: walletAddress,
      },
    },
  });
  return !!credential;
}

