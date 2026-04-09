/**
 * Privy Signing Service
 *
 * 使用 Privy Server SDK 代用户签名交易
 * 实现 Delegated Actions 功能
 *
 * 支持:
 * - Ethereum/EVM (Polygon): signTypedData, signMessage
 * - Solana: signSolanaTransaction, signSolanaMessage
 *
 * 参考: https://docs.privy.io/guide/server/wallets/delegated-actions
 * 参考: https://docs.privy.io/guide/server-wallets/authorization/signatures
 */

import { PrivyClient } from '@privy-io/server-auth';
import { getPrivyCredentials, getSolanaRpcUrl } from '../config/secrets.js';
import prisma from '../lib/prisma.js';
import { VersionedTransaction, Connection } from '@solana/web3.js';

// 缓存的 Solana RPC URL
let cachedSolanaRpcUrl = null;

/**
 * 获取 Solana RPC URL（带缓存）
 * 开发环境从 .env 读取，生产环境从 AWS Secrets Manager 读取
 */
async function ensureSolanaRpcUrl() {
  if (cachedSolanaRpcUrl) return cachedSolanaRpcUrl;
  cachedSolanaRpcUrl = await getSolanaRpcUrl();
  return cachedSolanaRpcUrl;
}

// Privy client 单例
let privyClient = null;

// ============================================
// 委托状态短期缓存（安全关键操作）
// TTL 30 秒，平衡安全性和性能
// ============================================
const DELEGATION_CACHE_TTL = 30 * 1000; // 30 秒
const delegationCache = new Map();

/**
 * 清除委托状态缓存
 * @param {string} privyUserId - Privy 用户 ID
 */
export function invalidateDelegationCache(privyUserId) {
  if (privyUserId) {
    delegationCache.delete(privyUserId);
  }
}

/**
 * 获取 Privy client 实例
 * 配置 Authorization Key 用于 Server Wallet API
 */
async function getPrivyClient() {
  if (privyClient) {
    return privyClient;
  }

  const { appId, appSecret, authorizationPrivateKey } = await getPrivyCredentials();

  if (!appId || !appSecret) {
    throw new Error('Missing Privy credentials');
  }

  // 创建 Privy client，如果有 authorization key 则配置它
  const clientConfig = {};

  if (authorizationPrivateKey) {
    console.log('[PrivySigning] Authorization private key found, configuring wallet API authorization');
    clientConfig.walletApi = {
      authorizationPrivateKey: authorizationPrivateKey,
    };
  } else {
    console.warn('[PrivySigning] ⚠️ No authorization private key configured!');
    console.warn('[PrivySigning] Server wallet signing will fail without it.');
    console.warn('[PrivySigning] Please set PRIVY_AUTHORIZATION_PRIVATE_KEY in your .env file');
    console.warn('[PrivySigning] Get it from: https://dashboard.privy.io -> Settings -> Authorization keys');
  }

  privyClient = new PrivyClient(appId, appSecret, clientConfig);
  console.log('[PrivySigning] Privy client initialized');
  return privyClient;
}

/**
 * 检查用户是否已授权委托
 * 使用 30 秒短期缓存，平衡安全性和性能
 *
 * @param {string} privyUserId - Privy 用户 ID
 * @returns {Promise<{isDelegated: boolean, walletAddress: string | null}>}
 */
export async function checkDelegationStatus(privyUserId) {
  // 1. 检查短期缓存
  const cached = delegationCache.get(privyUserId);
  if (cached && (Date.now() - cached.timestamp < DELEGATION_CACHE_TTL)) {
    return cached.data;
  }

  // 2. 缓存未命中或已过期，查询数据库
  const user = await prisma.user.findUnique({
    where: { privyUserId },
    select: {
      isDelegated: true,
      walletAddress: true,
      delegatedAt: true,
    },
  });

  const result = user
    ? {
    isDelegated: user.isDelegated,
    walletAddress: user.walletAddress,
    delegatedAt: user.delegatedAt,
      }
    : { isDelegated: false, walletAddress: null };

  // 3. 存入缓存
  delegationCache.set(privyUserId, {
    data: result,
    timestamp: Date.now(),
  });

  return result;
}

/**
 * 获取用户的嵌入式钱包信息
 *
 * @param {string} privyUserId - Privy 用户 ID
 * @returns {Promise<{address: string, walletId: string, delegated: boolean, hasSessionSigners: boolean} | null>}
 */
export async function getEmbeddedWalletInfo(privyUserId) {
  try {
    const client = await getPrivyClient();
    const user = await client.getUser(privyUserId);

    // 查找嵌入式钱包
    const embeddedWallet = user.linkedAccounts?.find(
      (acc) => acc.type === 'wallet' && acc.walletClientType === 'privy'
    );

    if (!embeddedWallet) {
      console.log('[PrivySigning] No embedded wallet found for user:', privyUserId);
      return null;
    }

    // TEE 模式: 检查 sessionSigners 数组
    // On-Device 模式: 检查 delegated 字段
    const hasSessionSigners = Array.isArray(embeddedWallet.sessionSigners) && embeddedWallet.sessionSigners.length > 0;
    const isDelegatedOnDevice = embeddedWallet.delegated || false;

    console.log('[PrivySigning] Found embedded wallet:', {
      address: embeddedWallet.address,
      walletId: embeddedWallet.id,
      delegated: isDelegatedOnDevice,
      hasSessionSigners: hasSessionSigners,
      sessionSignersCount: embeddedWallet.sessionSigners?.length || 0,
    });

    return {
      address: embeddedWallet.address,
      walletId: embeddedWallet.id,
      delegated: isDelegatedOnDevice,
      hasSessionSigners: hasSessionSigners,
    };
  } catch (error) {
    console.error('[PrivySigning] Error getting embedded wallet:', error);
    return null;
  }
}

/**
 * 获取用户的嵌入式钱包地址 (兼容旧 API)
 *
 * @param {string} privyUserId - Privy 用户 ID
 * @returns {Promise<string | null>}
 */
export async function getEmbeddedWalletAddress(privyUserId) {
  const walletInfo = await getEmbeddedWalletInfo(privyUserId);
  return walletInfo?.address || null;
}

/**
 * 使用 Privy 代签 EIP-712 类型数据
 *
 * @param {string} privyUserId - Privy 用户 ID
 * @param {string} walletAddress - 钱包地址
 * @param {object} typedData - EIP-712 类型数据
 * @returns {Promise<string>} - 签名
 */
export async function signTypedData(privyUserId, walletAddress, typedData) {
  // 验证用户已在我们的系统中启用委托
  const { isDelegated } = await checkDelegationStatus(privyUserId);
  if (!isDelegated) {
    throw new Error('User has not enabled delegation in our system');
  }

  try {
    const client = await getPrivyClient();

    // 获取嵌入式钱包的 walletId 和委托状态
    const walletInfo = await getEmbeddedWalletInfo(privyUserId);
    if (!walletInfo) {
      throw new Error('No embedded wallet found for user');
    }

    // 验证钱包地址匹配
    if (walletInfo.address.toLowerCase() !== walletAddress.toLowerCase()) {
      console.warn('[PrivySigning] Wallet address mismatch:', {
        expected: walletAddress,
        found: walletInfo.address,
      });
      // 继续使用找到的嵌入式钱包
    }

    // 检查钱包是否可以签名
    // TEE 模式: 检查 hasSessionSigners
    // On-Device 模式: 检查 delegated
    const canSign = walletInfo.hasSessionSigners || walletInfo.delegated;

    if (!canSign) {
      console.error('[PrivySigning] ❌ Wallet cannot sign!');
      console.error('[PrivySigning] delegated:', walletInfo.delegated);
      console.error('[PrivySigning] hasSessionSigners:', walletInfo.hasSessionSigners);
      console.error('[PrivySigning] TEE mode: User needs to call addSessionSigners() on the frontend.');
      console.error('[PrivySigning] On-Device mode: User needs to call delegateWallet() on the frontend.');
      throw new Error('Wallet is not authorized for signing. User must enable Session Signer on the frontend first.');
    }

    // Wallet authorized for signing

    // 使用 Privy walletApi 签名 (使用 walletId 而不是 address)
    const result = await client.walletApi.ethereum.signTypedData({
      walletId: walletInfo.walletId,
      typedData: typedData,
    });

    // 结果可能是 { signature, encoding } 或直接是 signature 字符串
    const signature = typeof result === 'string' ? result : result.signature;

    console.log(`[PrivySigning] Signed typed data for ${walletAddress}`);
    return signature;
  } catch (error) {
    console.error('[PrivySigning] Error signing typed data:', error);
    throw new Error(`Failed to sign: ${error.message}`);
  }
}

/**
 * 使用 Privy 代签普通消息
 *
 * @param {string} privyUserId - Privy 用户 ID
 * @param {string} walletAddress - 钱包地址
 * @param {string} message - 消息
 * @returns {Promise<string>} - 签名
 */
export async function signMessage(privyUserId, walletAddress, message) {
  // 验证用户已在我们的系统中启用委托
  const { isDelegated } = await checkDelegationStatus(privyUserId);
  if (!isDelegated) {
    throw new Error('User has not enabled delegation in our system');
  }

  try {
    const client = await getPrivyClient();

    // 获取嵌入式钱包的 walletId 和委托状态
    const walletInfo = await getEmbeddedWalletInfo(privyUserId);
    if (!walletInfo) {
      throw new Error('No embedded wallet found for user');
    }

    // 检查钱包是否可以签名
    const canSign = walletInfo.hasSessionSigners || walletInfo.delegated;

    if (!canSign) {
      console.error('[PrivySigning] ❌ Wallet cannot sign!');
      throw new Error('Wallet is not authorized for signing. User must enable Session Signer on the frontend first.');
    }

    // Wallet authorized for signing

    // 使用 walletId 而不是 address
    const result = await client.walletApi.ethereum.signMessage({
      walletId: walletInfo.walletId,
      message: message,
    });

    // 结果可能是 { signature, encoding } 或直接是 signature 字符串
    const signature = typeof result === 'string' ? result : result.signature;

    console.log(`[PrivySigning] Signed message for ${walletAddress}`);
    return signature;
  } catch (error) {
    console.error('[PrivySigning] Error signing message:', error);
    throw new Error(`Failed to sign: ${error.message}`);
  }
}

// ============================================
// Solana Wallet Functions
// ============================================

/**
 * 获取用户的 Solana 嵌入式钱包信息
 *
 * @param {string} privyUserId - Privy 用户 ID
 * @returns {Promise<{address: string, walletId: string, delegated: boolean, hasSessionSigners: boolean} | null>}
 */
export async function getSolanaEmbeddedWalletInfo(privyUserId) {
  try {
    const client = await getPrivyClient();
    const user = await client.getUser(privyUserId);

    // 查找 Solana 嵌入式钱包
    // Solana 钱包的 chainType 是 'solana'
    const solanaWallet = user.linkedAccounts?.find(
      (acc) => acc.type === 'wallet' && acc.walletClientType === 'privy' && acc.chainType === 'solana'
    );

    if (!solanaWallet) {
      console.log('[PrivySigning] No Solana embedded wallet found for user:', privyUserId);
      return null;
    }

    // TEE 模式: 检查 sessionSigners 数组
    // On-Device 模式: 检查 delegated 字段
    const hasSessionSigners = Array.isArray(solanaWallet.sessionSigners) && solanaWallet.sessionSigners.length > 0;
    const isDelegatedOnDevice = solanaWallet.delegated || false;

    console.log('[PrivySigning] Found Solana embedded wallet:', {
      address: solanaWallet.address,
      walletId: solanaWallet.id,
      delegated: isDelegatedOnDevice,
      hasSessionSigners: hasSessionSigners,
      sessionSignersCount: solanaWallet.sessionSigners?.length || 0,
    });

    return {
      address: solanaWallet.address,
      walletId: solanaWallet.id,
      delegated: isDelegatedOnDevice,
      hasSessionSigners: hasSessionSigners,
    };
  } catch (error) {
    console.error('[PrivySigning] Error getting Solana embedded wallet:', error);
    return null;
  }
}

/**
 * 获取用户的 Solana 嵌入式钱包地址
 *
 * @param {string} privyUserId - Privy 用户 ID
 * @returns {Promise<string | null>}
 */
export async function getSolanaEmbeddedWalletAddress(privyUserId) {
  const walletInfo = await getSolanaEmbeddedWalletInfo(privyUserId);
  return walletInfo?.address || null;
}

/**
 * 使用 Privy 代签 Solana 交易
 *
 * @param {string} privyUserId - Privy 用户 ID
 * @param {string} transactionBase64 - Base64 编码的 Solana 交易
 * @returns {Promise<string>} - 签名后的交易 (Base64)
 */
export async function signSolanaTransaction(privyUserId, transactionBase64) {
  // 验证用户已在我们的系统中启用委托
  const { isDelegated } = await checkDelegationStatus(privyUserId);
  if (!isDelegated) {
    throw new Error('User has not enabled delegation in our system');
  }

  try {
    const client = await getPrivyClient();

    // 获取 Solana 嵌入式钱包的 walletId 和委托状态
    const walletInfo = await getSolanaEmbeddedWalletInfo(privyUserId);
    if (!walletInfo) {
      throw new Error('No Solana embedded wallet found for user');
    }

    // 检查钱包是否可以签名
    const canSign = walletInfo.hasSessionSigners || walletInfo.delegated;

    if (!canSign) {
      console.error('[PrivySigning] ❌ Solana wallet cannot sign!');
      console.error('[PrivySigning] delegated:', walletInfo.delegated);
      console.error('[PrivySigning] hasSessionSigners:', walletInfo.hasSessionSigners);
      console.error('[PrivySigning] User needs to enable Session Signer for Solana wallet on the frontend.');
      throw new Error('Solana wallet is not authorized for signing. User must enable Session Signer on the frontend first.');
    }

    // Solana wallet authorized for signing

    // 解码 Base64 交易为 VersionedTransaction 对象
    const transactionBuffer = Buffer.from(transactionBase64, 'base64');
    const transaction = VersionedTransaction.deserialize(transactionBuffer);

    // Transaction deserialized, signing...

    // 使用 Privy walletApi.solana 签名
    const result = await client.walletApi.solana.signTransaction({
      walletId: walletInfo.walletId,
      transaction: transaction,
    });

    // 返回签名后的交易 (序列化为 Base64)
    let signedTransaction;
    if (result.signedTransaction) {
      // 如果返回的是 Transaction 对象，序列化它
      if (result.signedTransaction instanceof VersionedTransaction) {
        const serialized = result.signedTransaction.serialize();
        signedTransaction = Buffer.from(serialized).toString('base64');
      } else {
        signedTransaction = result.signedTransaction;
      }
    } else {
      signedTransaction = result;
    }

    console.log(`[PrivySigning] ✅ Signed Solana transaction for wallet ${walletInfo.address}`);
    return signedTransaction;
  } catch (error) {
    console.error('[PrivySigning] Error signing Solana transaction:', error);
    throw new Error(`Failed to sign Solana transaction: ${error.message}`);
  }
}

/**
 * 广播签名后的 Solana 交易到网络
 *
 * @param {string} signedTransactionBase64 - 签名后的交易 (Base64)
 * @returns {Promise<string>} - 交易签名 (txSignature)
 */
export async function broadcastSolanaTransaction(signedTransactionBase64) {
  try {
    console.log('[PrivySigning] Broadcasting Solana transaction...');

    // 从 AWS Secrets Manager 或本地 .env 获取 RPC URL
    const solanaRpcUrl = await ensureSolanaRpcUrl();
    const connection = new Connection(solanaRpcUrl, 'confirmed');

    // 解码 Base64 交易
    const transactionBuffer = Buffer.from(signedTransactionBase64, 'base64');
    const transaction = VersionedTransaction.deserialize(transactionBuffer);

    // 发送并确认交易
    const signature = await connection.sendTransaction(transaction, {
      skipPreflight: false,
      preflightCommitment: 'confirmed',
      maxRetries: 3,
    });

    console.log('[PrivySigning] ✅ Transaction broadcasted, signature:', signature);

    // 等待确认
    const confirmation = await connection.confirmTransaction(signature, 'confirmed');

    if (confirmation.value.err) {
      throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
    }

    console.log('[PrivySigning] ✅ Transaction confirmed');
    return signature;
  } catch (error) {
    console.error('[PrivySigning] Error broadcasting Solana transaction:', error);
    throw new Error(`Failed to broadcast transaction: ${error.message}`);
  }
}

/**
 * 使用 Privy 代签 Solana 消息
 *
 * @param {string} privyUserId - Privy 用户 ID
 * @param {string} message - 消息 (UTF-8 字符串或 Base64)
 * @returns {Promise<string>} - 签名 (Base64)
 */
export async function signSolanaMessage(privyUserId, message) {
  // 验证用户已在我们的系统中启用委托
  const { isDelegated } = await checkDelegationStatus(privyUserId);
  if (!isDelegated) {
    throw new Error('User has not enabled delegation in our system');
  }

  try {
    const client = await getPrivyClient();

    // 获取 Solana 嵌入式钱包
    const walletInfo = await getSolanaEmbeddedWalletInfo(privyUserId);
    if (!walletInfo) {
      throw new Error('No Solana embedded wallet found for user');
    }

    // 检查钱包是否可以签名
    const canSign = walletInfo.hasSessionSigners || walletInfo.delegated;

    if (!canSign) {
      console.error('[PrivySigning] ❌ Solana wallet cannot sign!');
      throw new Error('Solana wallet is not authorized for signing. User must enable Session Signer on the frontend first.');
    }

    // Solana wallet authorized for message signing

    // 使用 Privy walletApi.solana 签名消息
    const result = await client.walletApi.solana.signMessage({
      walletId: walletInfo.walletId,
      message: message,
    });

    const signature = typeof result === 'string' ? result : result.signature;

    console.log(`[PrivySigning] ✅ Signed Solana message for wallet ${walletInfo.address}`);
    return signature;
  } catch (error) {
    console.error('[PrivySigning] Error signing Solana message:', error);
    throw new Error(`Failed to sign Solana message: ${error.message}`);
  }
}

// ============================================
// Polymarket Order Helpers
// ============================================

/**
 * 构建 Polymarket 订单的 EIP-712 类型数据
 *
 * 参考: Polymarket CLOB 订单签名格式
 */
export function buildOrderTypedData(order, chainId = 137) {
  const domain = {
    name: 'Polymarket CTF Exchange',
    version: '1',
    chainId: chainId,
  };

  const types = {
    Order: [
      { name: 'salt', type: 'uint256' },
      { name: 'maker', type: 'address' },
      { name: 'signer', type: 'address' },
      { name: 'taker', type: 'address' },
      { name: 'tokenId', type: 'uint256' },
      { name: 'makerAmount', type: 'uint256' },
      { name: 'takerAmount', type: 'uint256' },
      { name: 'expiration', type: 'uint256' },
      { name: 'nonce', type: 'uint256' },
      { name: 'feeRateBps', type: 'uint256' },
      { name: 'side', type: 'uint8' },
      { name: 'signatureType', type: 'uint8' },
    ],
  };

  return {
    domain,
    types,
    primaryType: 'Order',
    message: order,
  };
}

export default {
  // Delegation
  checkDelegationStatus,
  invalidateDelegationCache,
  // EVM (Polygon/Ethereum)
  getEmbeddedWalletInfo,
  getEmbeddedWalletAddress,
  signTypedData,
  signMessage,
  buildOrderTypedData,
  // Solana
  getSolanaEmbeddedWalletInfo,
  getSolanaEmbeddedWalletAddress,
  signSolanaTransaction,
  signSolanaMessage,
};
