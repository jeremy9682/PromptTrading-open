/**
 * Polymarket Auto Trade Service
 *
 * 使用 Privy Session Signer 实现自动交易
 * 无需用户签名弹窗
 *
 * 流程:
 * 1. 验证用户已启用 Session Signer (isDelegated = true)
 * 2. 从数据库获取加密存储的 API 凭证
 * 3. 创建 PrivySigner (实现 ethers Signer 接口)
 * 4. 使用 ClobClient + PrivySigner 下单
 * 5. ClobClient 内部调用 PrivySigner._signTypedData()
 * 6. PrivySigner 调用 Privy Server SDK 完成签名
 *
 * 参考:
 * - 前端原有实现: src/services/polymarket/polymarketSafeService.ts
 * - Privy Delegated Actions: https://docs.privy.io/guide/server/wallets/delegated-actions
 */

import { ClobClient, Side } from '@polymarket/clob-client';
import { createPrivySigner } from './privy-signer.service.js';
import { checkDelegationStatus } from './privy-signing.service.js';
import { createAndStoreCredentials } from './polymarket-credentials.service.js';
import prisma from '../lib/prisma.js';
import crypto from 'crypto';
import { getUserByPrivyId } from './user-cache.service.js';
import { getPolymarketEncryptionKey } from '../config/secrets.js';

// ============================================
// Constants
// ============================================

const CLOB_API_URL = 'https://clob.polymarket.com';
const POLYGON_CHAIN_ID = 137;

// Signature types
const SIGNATURE_TYPE = {
  EOA: 0,
  POLY_PROXY: 1,
  POLY_GNOSIS_SAFE: 2,
};

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
    console.warn('[AutoTrade] No encryption key found, generating random key');
    cachedEncryptionKey = crypto.randomBytes(32).toString('hex');
  }
  return cachedEncryptionKey;
}

// ============================================
// Helper Functions
// ============================================

/**
 * 解密数据
 */
async function decrypt(encryptedData) {
  try {
    const encryptionKey = await getEncryptionKey();
    const { iv, encrypted, authTag } = JSON.parse(encryptedData);
    const key = Buffer.from(encryptionKey, 'hex').slice(0, 32);
    const decipher = crypto.createDecipheriv(
      ENCRYPTION_ALGORITHM,
      key,
      Buffer.from(iv, 'hex'),
      { authTagLength: 16 }  // 🔒 强制验证 16 字节 auth tag，防止伪造攻击
    );

    decipher.setAuthTag(Buffer.from(authTag, 'hex'));

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch (error) {
    console.error('[AutoTrade] Decryption failed:', error);
    throw new Error('Failed to decrypt API credentials');
  }
}

/**
 * 从数据库获取用户的 API 凭证
 * 如果凭证不存在，会自动创建
 *
 * @param {string} privyUserId - Privy 用户 ID
 * @param {string} walletAddress - 钱包地址
 * @returns {Promise<{key: string, secret: string, passphrase: string} | null>}
 */
async function getApiCredentials(privyUserId, walletAddress) {
  console.log('[AutoTrade] Getting API credentials for user:', privyUserId);

  // 从缓存获取用户
  const user = await getUserByPrivyId(privyUserId);

  if (!user) {
    console.error('[AutoTrade] User not found:', privyUserId);
    return null;
  }

  // 查找 API 凭证
  let credential = await prisma.polymarketApiCredential.findUnique({
    where: {
      userId_walletAddress: {
        userId: user.id,
        walletAddress: walletAddress,
      },
    },
  });

  // 如果凭证不存在，自动创建
  if (!credential) {
    console.log('[AutoTrade] API credentials not found, auto-creating...');
    try {
      const result = await createAndStoreCredentials(privyUserId, walletAddress);
      if (result.success || result.alreadyExists) {
        console.log('[AutoTrade] ✅ API credentials created successfully');
        // 重新获取凭证
        credential = await prisma.polymarketApiCredential.findUnique({
          where: {
            userId_walletAddress: {
              userId: user.id,
              walletAddress: walletAddress,
            },
          },
        });
      } else {
        console.error('[AutoTrade] Failed to create API credentials:', result.error);
        return null;
      }
    } catch (createError) {
      console.error('[AutoTrade] Error creating API credentials:', createError);
      return null;
    }
  }

  if (!credential) {
    console.error('[AutoTrade] API credentials still not found after creation attempt');
    return null;
  }

  // 解密凭证
  try {
    const apiKey = await decrypt(credential.apiKey);
    const apiSecret = await decrypt(credential.apiSecret);
    const passphrase = await decrypt(credential.passphrase);

    console.log('[AutoTrade] API credentials retrieved successfully');
    return {
      key: apiKey,
      secret: apiSecret,
      passphrase: passphrase,
    };
  } catch (error) {
    console.error('[AutoTrade] Failed to decrypt credentials:', error);
    return null;
  }
}

/**
 * 将 Polymarket API 错误转换为用户友好的中文消息
 * (复用前端的错误解析逻辑)
 */
function parseOrderError(errorMsg) {
  if (!errorMsg) return '下单失败，请稍后重试';

  // 最小订单大小错误
  const sizeMatch = errorMsg.match(/Size \(([0-9.]+)\) lower than the minimum: (\d+)/i);
  if (sizeMatch) {
    const currentSize = parseFloat(sizeMatch[1]);
    const minSize = parseInt(sizeMatch[2]);
    return `订单数量太小：当前 ${currentSize.toFixed(2)} 股，最低需要 ${minSize} 股。请增加交易金额。`;
  }

  // 余额不足
  if (errorMsg.toLowerCase().includes('insufficient balance') ||
      errorMsg.toLowerCase().includes('not enough')) {
    return '余额不足，请确保 Safe 钱包有足够的 USDC.e';
  }

  // 无效价格
  const priceRangeMatch = errorMsg.match(/invalid price \(([0-9.e+-]+)\), min: ([0-9.]+) - max: ([0-9.]+)/i);
  if (priceRangeMatch) {
    const currentPrice = parseFloat(priceRangeMatch[1]);
    const minPrice = parseFloat(priceRangeMatch[2]);
    const maxPrice = parseFloat(priceRangeMatch[3]);

    if (currentPrice < minPrice) {
      return `价格太低：当前 ${(currentPrice * 100).toFixed(2)}%，最低需要 ${(minPrice * 100).toFixed(1)}%`;
    } else if (currentPrice > maxPrice) {
      return `价格太高：当前 ${(currentPrice * 100).toFixed(2)}%，最高允许 ${(maxPrice * 100).toFixed(1)}%`;
    }
    return `价格超出范围 (${(minPrice * 100).toFixed(1)}% - ${(maxPrice * 100).toFixed(1)}%)`;
  }

  if (errorMsg.toLowerCase().includes('invalid price')) {
    return '无效的价格 (需要在 0.1% - 99.9% 之间)';
  }

  // 市场关闭
  if (errorMsg.toLowerCase().includes('market closed') ||
      errorMsg.toLowerCase().includes('trading halted')) {
    return '市场已关闭或暂停交易';
  }

  // API Key 问题
  if (errorMsg.toLowerCase().includes('unauthorized') ||
      errorMsg.toLowerCase().includes('invalid api key')) {
    return 'API 认证失败，请重新创建 API 凭证';
  }

  // 签名问题
  if (errorMsg.toLowerCase().includes('invalid signature')) {
    return '签名验证失败，请检查 Session Signer 是否正确配置';
  }

  // 委托未启用
  if (errorMsg.toLowerCase().includes('delegation') ||
      errorMsg.toLowerCase().includes('not enabled')) {
    return '自动交易未授权，请先开启 Session Signer';
  }

  return errorMsg || '下单失败，请稍后重试';
}

// ============================================
// Main Export
// ============================================

/**
 * 执行自动交易订单
 *
 * 使用 Privy Session Signer 代签，无需用户交互
 *
 * @param {object} params
 * @param {string} params.privyUserId - Privy 用户 ID
 * @param {string} params.eoaAddress - 用户 EOA 地址
 * @param {string} params.safeAddress - Safe 钱包地址
 * @param {object} params.orderParams - 订单参数
 * @param {string} params.orderParams.tokenId - 市场 Token ID
 * @param {string} params.orderParams.side - 'BUY' | 'SELL'
 * @param {number} params.orderParams.price - 价格 (0-1)
 * @param {number} params.orderParams.amount - 金额 (USDC)
 * @param {string} [params.orderParams.timeInForce='GTC'] - 订单类型
 * @param {number} [params.minOrderSize=5] - 最小订单大小 (股数)
 *
 * @returns {Promise<{success: boolean, orderId?: string, errorMsg?: string}>}
 */
export async function executeAutoOrder({
  privyUserId,
  eoaAddress,
  safeAddress,
  orderParams,
  minOrderSize = 5,
}) {
  console.log('============================================');
  console.log('[AutoTrade] Starting auto order execution');
  console.log('[AutoTrade] User:', privyUserId);
  console.log('[AutoTrade] EOA:', eoaAddress);
  console.log('[AutoTrade] Safe:', safeAddress);
  console.log('[AutoTrade] Order params:', JSON.stringify(orderParams));
  console.log('============================================');

  try {
    // 1. 验证用户已授权 Session Signer
    console.log('[AutoTrade] Step 1: Checking delegation status...');
    const { isDelegated } = await checkDelegationStatus(privyUserId);
    if (!isDelegated) {
      console.error('[AutoTrade] User has not enabled delegation');
      return {
        success: false,
        errorMsg: '自动交易未授权。请先在设置中开启 Session Signer。',
      };
    }
    console.log('[AutoTrade] Delegation status: OK');

    // 2. 获取 API 凭证
    console.log('[AutoTrade] Step 2: Getting API credentials...');
    const credentials = await getApiCredentials(privyUserId, eoaAddress);
    if (!credentials) {
      console.error('[AutoTrade] API credentials not found');
      return {
        success: false,
        errorMsg: 'API 凭证不存在。请先创建 Polymarket API Key。',
      };
    }
    console.log('[AutoTrade] API credentials: OK');

    // 3. 创建 PrivySigner
    console.log('[AutoTrade] Step 3: Creating PrivySigner...');
    const privySigner = createPrivySigner(privyUserId, eoaAddress);
    console.log('[AutoTrade] PrivySigner created');

    // 4. 验证订单参数
    console.log('[AutoTrade] Step 4: Validating order params...');

    const { tokenId, side, price, amount, timeInForce = 'GTC' } = orderParams;

    // 验证 tokenId
    if (!tokenId || !/^\d{10,}$/.test(tokenId)) {
      return {
        success: false,
        errorMsg: '无效的市场 Token ID',
      };
    }

    // 验证价格范围
    // Polymarket 价格范围取决于市场的 tickSize：price >= tickSize && price <= (1 - tickSize)
    // 大多数市场 tickSize = 0.01，所以范围是 0.01 ~ 0.99
    // 使用保守的默认范围，ClobClient 会根据具体市场的 tickSize 做更精确的验证
    const DEFAULT_TICK_SIZE = 0.01;
    const MIN_PRICE = DEFAULT_TICK_SIZE;       // 1%
    const MAX_PRICE = 1 - DEFAULT_TICK_SIZE;   // 99%
    if (!price || price < MIN_PRICE || price > MAX_PRICE) {
      return {
        success: false,
        errorMsg: `价格必须在 ${(MIN_PRICE * 100).toFixed(0)}% - ${(MAX_PRICE * 100).toFixed(0)}% 之间`,
      };
    }

    // 验证金额
    if (!amount || amount <= 0) {
      return {
        success: false,
        errorMsg: '无效的交易金额',
      };
    }

    // 计算 size (shares 数量)
    const size = side === 'BUY' ? amount / price : amount;
    console.log('[AutoTrade] Calculated size:', size);

    // 验证最小订单大小
    if (size < minOrderSize) {
      const minAmount = price * minOrderSize;
      return {
        success: false,
        errorMsg: `订单数量太小：当前 ${size.toFixed(2)} 股，最低需要 ${minOrderSize} 股。请将交易金额增加到至少 ${minAmount.toFixed(2)} USDC。`,
      };
    }

    console.log('[AutoTrade] Order params validated');

    // 5. 创建 ClobClient
    console.log('[AutoTrade] Step 5: Creating ClobClient...');
    const clobClient = new ClobClient(
      CLOB_API_URL,
      POLYGON_CHAIN_ID,
      privySigner,                        // 使用 PrivySigner
      credentials,                        // API 凭证
      SIGNATURE_TYPE.POLY_GNOSIS_SAFE,    // Safe 钱包签名类型
      safeAddress                         // Safe 地址作为 funder
    );
    console.log('[AutoTrade] ClobClient created with PrivySigner');

    // 6. 查询市场的 negRisk 状态
    console.log('[AutoTrade] Step 6: Checking market negRisk status...');
    let isNegRisk = false;
    try {
      isNegRisk = await clobClient.getNegRisk(tokenId);
      console.log('[AutoTrade] Market negRisk:', isNegRisk);
    } catch (negRiskError) {
      console.warn('[AutoTrade] Could not fetch negRisk, defaulting to false:', negRiskError.message);
    }

    // 7. 构建订单
    console.log('[AutoTrade] Step 7: Building order...');
    const order = {
      tokenID: tokenId,
      price: price,
      size: size,
      side: side === 'BUY' ? Side.BUY : Side.SELL,
      feeRateBps: 0,
      expiration: 0,
      taker: '0x0000000000000000000000000000000000000000',
    };
    console.log('[AutoTrade] Order:', JSON.stringify(order));

    // 8. 提交订单
    console.log('[AutoTrade] Step 8: Submitting order via ClobClient...');
    console.log('[AutoTrade] This will trigger PrivySigner._signTypedData()...');

    let response;
    try {
      response = await clobClient.createAndPostOrder(
        order,
        { negRisk: isNegRisk },
        timeInForce === 'GTD' ? 'GTD' : 'GTC'
      );
    } catch (clobError) {
      console.error('[AutoTrade] ClobClient error:', clobError);
      return {
        success: false,
        errorMsg: parseOrderError(clobError.message || clobError.error),
      };
    }

    console.log('[AutoTrade] Order response:', JSON.stringify(response));

    // 9. 检查响应
    if (response.error || response.errorMsg) {
      console.error('[AutoTrade] Order error:', response.error || response.errorMsg);
      return {
        success: false,
        errorMsg: parseOrderError(response.error || response.errorMsg),
      };
    }

    if (!response.orderID && !response.id) {
      console.error('[AutoTrade] No order ID in response');
      return {
        success: false,
        errorMsg: '服务器未返回订单 ID',
      };
    }

    const orderId = response.orderID || response.id;
    console.log('============================================');
    console.log('[AutoTrade] Order submitted successfully!');
    console.log('[AutoTrade] Order ID:', orderId);
    console.log('[AutoTrade] Status:', response.status || 'SUBMITTED');
    console.log('============================================');

    return {
      success: true,
      orderId: orderId,
      status: response.status || 'SUBMITTED',
    };
  } catch (error) {
    console.error('============================================');
    console.error('[AutoTrade] Unexpected error:', error);
    console.error('============================================');
    return {
      success: false,
      errorMsg: parseOrderError(error.message),
    };
  }
}

export default {
  executeAutoOrder,
};
