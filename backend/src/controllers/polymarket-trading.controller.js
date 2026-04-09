/**
 * Polymarket Trading Controller
 *
 * 处理API Key存储和交易相关操作
 * 
 * 注意：所有钱包地址都会被规范化为小写，确保与数据库 UNIQUE 约束的一致性
 */

import prisma from '../lib/prisma.js';
import crypto from 'crypto';
import { createAndStoreCredentials } from '../services/polymarket-credentials.service.js';
import { normalizeWalletAddress } from '../utils/wallet.js';
import { getUserByPrivyId } from '../services/user-cache.service.js';
import { getPolymarketEncryptionKey } from '../config/secrets.js';

/**
 * 从请求中获取并规范化钱包地址
 * @param {Request} req - Express 请求对象
 * @returns {string|null} 规范化后的钱包地址，如果无效则返回 null
 */
function getWalletAddressFromRequest(req) {
  const rawAddress = req.headers['x-wallet-address'];
  if (!rawAddress) return null;
  return normalizeWalletAddress(rawAddress, false);
}

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
    console.warn('[PolymarketTrading] No encryption key found, generating random key');
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
    encrypted: encrypted,
    authTag: authTag.toString('hex')
  };
}

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
    console.error('Decryption failed:', error);
    throw new Error('Failed to decrypt data');
  }
}

/**
 * 获取用户的API Key
 */
export async function getApiKey(req, res) {
  try {
    const privyUser = req.privyUser;
    const walletAddress = getWalletAddressFromRequest(req);

    if (!privyUser || !walletAddress) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    // 从缓存获取用户
    const user = await getUserByPrivyId(privyUser.userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // 查找API Key（walletAddress 已规范化为小写）
    const credential = await prisma.polymarketApiCredential.findUnique({
      where: {
        userId_walletAddress: {
          userId: user.id,
          walletAddress: walletAddress
        }
      }
    });

    if (!credential) {
      // 返回 200 + data: null，而不是 404，避免前端控制台显示错误
      return res.json({
        success: true,
        data: null,
        message: 'No API credentials stored yet'
      });
    }

    // 解密并返回
    return res.json({
      success: true,
      data: {
        apiKey: await decrypt(credential.apiKey),
        apiSecret: await decrypt(credential.apiSecret),
        passphrase: await decrypt(credential.passphrase)
      }
    });
  } catch (error) {
    console.error('Get API key error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get API key'
    });
  }
}

/**
 * 保存API Key
 */
export async function saveApiKey(req, res) {
  try {
    const privyUser = req.privyUser;
    const walletAddress = getWalletAddressFromRequest(req);
    const { apiKey, apiSecret, passphrase } = req.body;

    if (!privyUser || !walletAddress) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    if (!apiKey || !apiSecret || !passphrase) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: apiKey, apiSecret, passphrase'
      });
    }

    // 从缓存获取用户，如果不存在则创建
    let user = await getUserByPrivyId(privyUser.userId);

    if (!user) {
      user = await prisma.user.create({
        data: {
          privyUserId: privyUser.userId,
          walletAddress: walletAddress
        }
      });
      // 新用户会在下次 getUserByPrivyId 时自动缓存
    }

    // 加密数据
    const encryptedApiKey = JSON.stringify(await encrypt(apiKey));
    const encryptedApiSecret = JSON.stringify(await encrypt(apiSecret));
    const encryptedPassphrase = JSON.stringify(await encrypt(passphrase));

    // Upsert API Key（walletAddress 已规范化为小写）
    const credential = await prisma.polymarketApiCredential.upsert({
      where: {
        userId_walletAddress: {
          userId: user.id,
          walletAddress: walletAddress
        }
      },
      update: {
        apiKey: encryptedApiKey,
        apiSecret: encryptedApiSecret,
        passphrase: encryptedPassphrase
      },
      create: {
        userId: user.id,
        walletAddress: walletAddress,
        apiKey: encryptedApiKey,
        apiSecret: encryptedApiSecret,
        passphrase: encryptedPassphrase
      }
    });

    return res.json({
      success: true,
      message: 'API key saved successfully',
      data: {
        id: credential.id,
        createdAt: credential.createdAt
      }
    });
  } catch (error) {
    console.error('Save API key error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to save API key'
    });
  }
}

/**
 * 删除API Key
 */
export async function deleteApiKey(req, res) {
  try {
    const privyUser = req.privyUser;
    const walletAddress = getWalletAddressFromRequest(req);

    if (!privyUser || !walletAddress) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    // 从缓存获取用户
    const user = await getUserByPrivyId(privyUser.userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // 删除API Key（walletAddress 已规范化为小写）
    await prisma.polymarketApiCredential.delete({
      where: {
        userId_walletAddress: {
          userId: user.id,
          walletAddress: walletAddress
        }
      }
    });

    return res.json({
      success: true,
      message: 'API key deleted successfully'
    });
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({
        success: false,
        error: 'API key not found'
      });
    }

    console.error('Delete API key error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to delete API key'
    });
  }
}

/**
 * 自动创建 API Key (使用 Privy Delegated Actions)
 * 
 * 此端点使用 Privy 的委托签名功能自动创建 Polymarket API 凭证
 * 用户无需手动签名
 * 
 * POST /api/polymarket/trading/create-credentials
 */
export async function createCredentials(req, res) {
  try {
    const privyUser = req.privyUser;
    const walletAddress = getWalletAddressFromRequest(req);

    if (!privyUser || !walletAddress) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    console.log('[CreateCredentials] Creating credentials for user:', privyUser.userId);

    // 使用服务创建凭证（walletAddress 已规范化为小写）
    const result = await createAndStoreCredentials(privyUser.userId, walletAddress);

    if (!result.success) {
      // 如果是因为委托未启用，返回特定错误码
      if (result.error?.includes('delegation')) {
        return res.status(403).json({
          success: false,
          error: result.error,
          code: 'DELEGATION_NOT_ENABLED'
        });
      }
      
      return res.status(500).json({
        success: false,
        error: result.error || 'Failed to create credentials'
      });
    }

    // 如果凭证已存在
    if (result.alreadyExists) {
      return res.json({
        success: true,
        message: 'API credentials already exist',
        alreadyExists: true
      });
    }

    return res.json({
      success: true,
      message: 'API credentials created successfully'
    });
  } catch (error) {
    console.error('Create credentials error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to create credentials'
    });
  }
}

/**
 * 检查API Key是否存在
 */
export async function checkApiKey(req, res) {
  try {
    const privyUser = req.privyUser;
    const walletAddress = getWalletAddressFromRequest(req);

    if (!privyUser || !walletAddress) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    // 从缓存获取用户
    const user = await getUserByPrivyId(privyUser.userId);

    if (!user) {
      return res.json({
        success: true,
        exists: false
      });
    }

    // 检查API Key（walletAddress 已规范化为小写）
    const credential = await prisma.polymarketApiCredential.findUnique({
      where: {
        userId_walletAddress: {
          userId: user.id,
          walletAddress: walletAddress
        }
      }
    });

    return res.json({
      success: true,
      exists: !!credential,
      createdAt: credential?.createdAt
    });
  } catch (error) {
    console.error('Check API key error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to check API key'
    });
  }
}

/**
 * 记录订单 (用于交易历史)
 * POST /api/polymarket/trading/record-order
 */
export async function recordOrder(req, res) {
  try {
    const privyUser = req.privyUser;

    if (!privyUser) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    const {
      orderId,
      safeAddress,
      tokenId,
      side,
      type,
      amount,
      price,
      status,
      eventId,
      eventTitle,
    } = req.body;

    // 验证必填字段
    if (!tokenId || !side || !amount) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: tokenId, side, amount'
      });
    }

    // 从缓存获取用户
    const user = await getUserByPrivyId(privyUser.userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // 记录订单到 AutoTradeHistory
    const tradeRecord = await prisma.autoTradeHistory.create({
      data: {
        userId: user.id,
        eventId: eventId || tokenId,
        eventTitle: eventTitle || `Token: ${tokenId.substring(0, 16)}...`,
        tokenId: tokenId,
        side: side,
        amount: amount,
        price: price || 0,
        orderId: orderId || null,
        status: status || 'executed',
        signalSource: 'manual',
        signalConfidence: null,
        executedAt: new Date(),
      }
    });

    console.log('[TradingController] Order recorded:', tradeRecord.id);

    return res.json({
      success: true,
      message: 'Order recorded successfully',
      data: {
        id: tradeRecord.id,
        orderId: orderId,
        status: tradeRecord.status,
        createdAt: tradeRecord.createdAt
      }
    });
  } catch (error) {
    console.error('Record order error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to record order'
    });
  }
}

/**
 * 获取用户交易历史
 * GET /api/polymarket/trading/order-history
 */
export async function getOrderHistory(req, res) {
  try {
    const privyUser = req.privyUser;

    if (!privyUser) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    // 从缓存获取用户
    const user = await getUserByPrivyId(privyUser.userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // 获取交易历史
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;

    const orders = await prisma.autoTradeHistory.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
      select: {
        id: true,
        eventId: true,
        eventTitle: true,
        tokenId: true,
        side: true,
        amount: true,
        price: true,
        orderId: true,
        status: true,
        errorMessage: true,
        signalSource: true,
        signalConfidence: true,
        createdAt: true,
        executedAt: true,
      }
    });

    // 获取总数
    const total = await prisma.autoTradeHistory.count({
      where: { userId: user.id }
    });

    return res.json({
      success: true,
      data: {
        orders,
        pagination: {
          total,
          limit,
          offset,
          hasMore: offset + orders.length < total
        }
      }
    });
  } catch (error) {
    console.error('Get order history error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get order history'
    });
  }
}

/**
 * 获取用户持仓
 * GET /api/polymarket/trading/positions
 * 
 * 注意: 这里只是从交易历史推算，实际持仓应该从链上查询
 */
export async function getPositions(req, res) {
  try {
    const privyUser = req.privyUser;

    if (!privyUser) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    // 从缓存获取用户
    const user = await getUserByPrivyId(privyUser.userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // 从交易历史聚合持仓
    const trades = await prisma.autoTradeHistory.findMany({
      where: {
        userId: user.id,
        status: 'executed'
      },
      select: {
        tokenId: true,
        eventTitle: true,
        side: true,
        amount: true,
        price: true,
      }
    });

    // 按 tokenId 聚合
    const positionMap = new Map();

    for (const trade of trades) {
      const existing = positionMap.get(trade.tokenId) || {
        tokenId: trade.tokenId,
        eventTitle: trade.eventTitle,
        totalBought: 0,
        totalSold: 0,
        avgBuyPrice: 0,
        totalBuyCost: 0,
      };

      if (trade.side === 'BUY') {
        existing.totalBought += parseFloat(trade.amount);
        existing.totalBuyCost += parseFloat(trade.amount);
      } else {
        existing.totalSold += parseFloat(trade.amount);
      }

      positionMap.set(trade.tokenId, existing);
    }

    // 计算净持仓
    const positions = [];
    for (const [tokenId, pos] of positionMap) {
      const netPosition = pos.totalBought - pos.totalSold;
      if (netPosition > 0.01) { // 只显示有持仓的
        positions.push({
          tokenId,
          eventTitle: pos.eventTitle,
          size: netPosition,
          avgPrice: pos.totalBought > 0 ? pos.totalBuyCost / pos.totalBought : 0,
          totalCost: pos.totalBuyCost,
        });
      }
    }

    return res.json({
      success: true,
      data: {
        positions,
        note: 'Positions calculated from trade history. For accurate data, query on-chain.'
      }
    });
  } catch (error) {
    console.error('Get positions error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get positions'
    });
  }
}
