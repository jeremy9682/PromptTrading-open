/**
 * Auto Trade Service
 *
 * 自动交易执行服务 (Gasless 版本)
 * 基于 Trader 配置和 AI 分析信号执行交易
 *
 * 架构:
 * - Safe 钱包作为资金持有者 (funder)
 * - EOA 只负责签名 (signer)
 * - signatureType = 2 (POLY_PROXY)
 * - 所有 Gas 由 Builder 代付 = Gasless
 *
 * 功能:
 * - 执行单个 Trader 的自动交易
 * - 验证用户委托状态和交易限制
 * - 记录交易历史
 * - 提交订单到 Polymarket CLOB
 */

import prisma from '../lib/prisma.js';
import { ClobClient } from '@polymarket/clob-client';
import { ethers } from 'ethers';
import {
  checkDelegationStatus,
  signTypedData,
  buildOrderTypedData,
} from './privy-signing.service.js';
import { createAndStoreCredentials } from './polymarket-credentials.service.js';
import {
  getSafeUSDCBalance,
  getUserSafeInfo,
  isSafeDeployed,
  checkTokenApprovals,
} from './safe-relayer.service.js';
import {
  notifyTradeExecuted,
  notifyTradeFailed,
} from './notification.service.js';

// Polymarket 配置
const CLOB_HOST = 'https://clob.polymarket.com';
const POLYGON_CHAIN_ID = 137;

// 签名类型
const SIGNATURE_TYPE_EOA = 0;
const SIGNATURE_TYPE_POLY_PROXY = 2; // Safe 签名类型

// 价格滑点容忍度 - FOK 订单需要更激进的价格确保立即成交
const SLIPPAGE_TOLERANCE = 0.05; // 5% 滑点，确保 FOK 订单能成交

// FOK (Fill-Or-Kill) 订单类型 - 立即全部成交或完全取消
const ORDER_TYPE_FOK = 'FOK';

/**
 * 获取订单簿中的最佳价格
 * BUY: 返回最佳卖价 (best ask)
 * SELL: 返回最佳买价 (best bid)
 */
async function getBestExecutionPrice(tokenId, side, fallbackPrice) {
  try {
    const response = await fetch(`${CLOB_HOST}/book?token_id=${tokenId}`);
    if (!response.ok) {
      console.log(`[AutoTrade] Order book fetch failed, using fallback price: ${fallbackPrice}`);
      return fallbackPrice;
    }
    
    const book = await response.json();
    
    if (side === 'BUY') {
      // 买入时，使用最佳卖价 (asks 中最低的价格)
      const asks = book.asks || [];
      if (asks.length > 0) {
        // asks 按价格从低到高排序，第一个是最佳卖价
        const bestAsk = parseFloat(asks[0].price);
        // 添加滑点，确保能成交
        const priceWithSlippage = Math.min(bestAsk * (1 + SLIPPAGE_TOLERANCE), 0.99);
        console.log(`[AutoTrade] Best ask: ${bestAsk}, with slippage: ${priceWithSlippage}`);
        return priceWithSlippage;
      }
    } else {
      // 卖出时，使用最佳买价 (bids 中最高的价格)
      const bids = book.bids || [];
      if (bids.length > 0) {
        // bids 按价格从高到低排序，第一个是最佳买价
        const bestBid = parseFloat(bids[0].price);
        // 减少滑点，确保能成交
        const priceWithSlippage = Math.max(bestBid * (1 - SLIPPAGE_TOLERANCE), 0.01);
        console.log(`[AutoTrade] Best bid: ${bestBid}, with slippage: ${priceWithSlippage}`);
        return priceWithSlippage;
      }
    }
    
    console.log(`[AutoTrade] Order book empty, using fallback price: ${fallbackPrice}`);
    return fallbackPrice;
  } catch (error) {
    console.error('[AutoTrade] Failed to get order book:', error.message);
    return fallbackPrice;
  }
}

/**
 * 检查订单状态
 * @param {string} orderId - 订单 ID
 * @param {Object} credentials - API 凭证
 * @returns {Promise<string>} 订单状态: 'matched' | 'live' | 'cancelled' | 'unknown'
 */
async function checkOrderStatus(orderId, credentials) {
  try {
    const response = await fetch(`${CLOB_HOST}/order/${orderId}`, {
      headers: {
        'POLY_API_KEY': credentials.apiKey,
        'POLY_SECRET': credentials.secret,
        'POLY_PASSPHRASE': credentials.passphrase,
      },
    });
    
    if (!response.ok) {
      console.log(`[AutoTrade] Failed to check order status: ${response.status}`);
      return 'unknown';
    }
    
    const order = await response.json();
    console.log(`[AutoTrade] Order ${orderId} status:`, order.status);
    
    // Polymarket 订单状态:
    // - 'LIVE' / 'live' - 挂单中
    // - 'MATCHED' / 'matched' - 已成交
    // - 'CANCELLED' / 'cancelled' - 已取消
    return (order.status || '').toLowerCase();
  } catch (error) {
    console.error('[AutoTrade] Failed to check order status:', error.message);
    return 'unknown';
  }
}

// 加密配置
import crypto from 'crypto';
import { getPolymarketEncryptionKey } from '../config/secrets.js';

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
    throw new Error('Failed to decrypt credentials');
  }
}

/**
 * 获取用户的 API 凭证
 * 如果凭证不存在且提供了 privyUserId，会自动创建
 */
async function getUserApiCredentials(userId, walletAddress, privyUserId = null) {
  let credential = await prisma.polymarketApiCredential.findUnique({
    where: {
      userId_walletAddress: {
        userId,
        walletAddress,
      },
    },
  });

  // 如果凭证不存在，尝试自动创建
  if (!credential && privyUserId) {
    console.log('[AutoTrade] API credentials not found, auto-creating...');
    try {
      const result = await createAndStoreCredentials(privyUserId, walletAddress);
      if (result.success || result.alreadyExists) {
        console.log('[AutoTrade] ✅ API credentials created successfully');
        // 重新获取凭证
        credential = await prisma.polymarketApiCredential.findUnique({
          where: {
            userId_walletAddress: {
              userId,
              walletAddress,
            },
          },
        });
      } else {
        throw new Error(`Failed to create API credentials: ${result.error}`);
      }
    } catch (createError) {
      console.error('[AutoTrade] Failed to auto-create credentials:', createError);
      throw new Error('API credentials not found and auto-creation failed');
    }
  }

  if (!credential) {
    throw new Error('API credentials not found');
  }

  return {
    apiKey: await decrypt(credential.apiKey),
    secret: await decrypt(credential.apiSecret),
    passphrase: await decrypt(credential.passphrase),
  };
}

/**
 * 检查用户的交易限制
 *
 * @param {string} userId - 用户 ID
 * @param {number} amount - 交易金额
 * @returns {Promise<{allowed: boolean, reason?: string}>}
 */
async function checkTradeLimits(userId, amount) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      autoTradeMaxAmount: true,
      autoTradeDailyLimit: true,
    },
  });

  if (!user) {
    return { allowed: false, reason: 'User not found' };
  }

  // 检查单笔最大金额
  const maxAmount = user.autoTradeMaxAmount ? parseFloat(user.autoTradeMaxAmount) : 100;
  if (amount > maxAmount) {
    return {
      allowed: false,
      reason: `Amount ${amount} exceeds max limit ${maxAmount}`,
    };
  }

  // 检查每日限额
  if (user.autoTradeDailyLimit) {
    const dailyLimit = parseFloat(user.autoTradeDailyLimit);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todayTotal = await prisma.autoTradeHistory.aggregate({
      where: {
        userId,
        status: 'executed',
        createdAt: { gte: today },
      },
      _sum: { amount: true },
    });

    const usedAmount = todayTotal._sum.amount ? parseFloat(todayTotal._sum.amount) : 0;
    if (usedAmount + amount > dailyLimit) {
      return {
        allowed: false,
        reason: `Daily limit exceeded. Used: ${usedAmount}, Limit: ${dailyLimit}`,
      };
    }
  }

  return { allowed: true };
}

/**
 * 记录自动交易历史
 */
async function recordTradeHistory(data) {
  return prisma.autoTradeHistory.create({
    data: {
      userId: data.userId,
      traderId: data.traderId || null, // Link to specific trader
      eventId: data.eventId,
      eventTitle: data.eventTitle,
      tokenId: data.tokenId,
      side: data.side,
      amount: data.amount,
      price: data.price,
      orderId: data.orderId,
      status: data.status,
      errorMessage: data.errorMessage,
      signalSource: data.signalSource,
      signalConfidence: data.signalConfidence,
      executedAt: data.status === 'executed' ? new Date() : null,
    },
  });
}

/**
 * 执行自动交易
 *
 * @param {object} params - 交易参数
 * @param {string} params.traderId - Trader ID
 * @param {string} params.eventId - 市场事件 ID
 * @param {string} params.eventTitle - 事件标题
 * @param {string} params.tokenId - Token ID
 * @param {string} params.side - 'BUY' | 'SELL'
 * @param {string} params.outcome - 'YES' | 'NO'
 * @param {number} params.amount - USDC 金额
 * @param {number} params.price - 限价
 * @param {number} params.confidence - AI 置信度 (0-100)
 * @param {string} params.signalSource - 信号来源
 * @returns {Promise<{success: boolean, orderId?: string, error?: string}>}
 */
export async function executeAutoTrade(params) {
  const {
    traderId,
    eventId,
    eventTitle,
    tokenId,
    side,
    outcome,
    amount,
    price,
    confidence,
    signalSource = 'ai_analysis',
  } = params;

  console.log(`[AutoTrade] Executing trade for trader ${traderId}:`, {
    eventId,
    side,
    outcome,
    amount,
    price,
    confidence,
  });

  try {
    // 1. 获取 Trader 和关联的 User (包括 Safe 信息)
    const trader = await prisma.polymarketTrader.findUnique({
      where: { id: traderId },
      include: {
        user: {
          select: {
            id: true,
            privyUserId: true,
            walletAddress: true,
            isDelegated: true,
            safeAddress: true,
            safeDeployed: true,
            safeApprovalsSet: true,
            autoTradeMaxAmount: true,
            autoTradeDailyLimit: true,
          },
        },
      },
    });

    if (!trader) {
      throw new Error('Trader not found');
    }

    const user = trader.user;

    // 2. 检查 Trader 是否激活
    if (!trader.isActive) {
      throw new Error('Trader is not active');
    }

    // 3. 检查用户委托状态
    const { isDelegated, walletAddress } = await checkDelegationStatus(user.privyUserId);
    if (!isDelegated) {
      throw new Error('User has not enabled delegation');
    }

    // 3.1 检查 Safe 钱包状态 (Gasless)
    // 注意: Safe 钱包必须由用户在前端初始化
    let safeAddress = user.safeAddress;
    if (!safeAddress) {
      throw new Error('Safe wallet not configured. User must initialize Safe via web interface first.');
    }

    // 验证 Safe 部署状态
    if (!user.safeDeployed) {
      const deployed = await isSafeDeployed(safeAddress);
      if (!deployed) {
        throw new Error('Safe wallet not deployed. User must complete Safe setup via web interface.');
      }
    }

    // 验证授权状态
    if (!user.safeApprovalsSet) {
      const { allApproved } = await checkTokenApprovals(safeAddress);
      if (!allApproved) {
        throw new Error('Safe token approvals not set. User must complete approval setup via web interface.');
      }
    }

    console.log('[AutoTrade] Using Safe wallet:', safeAddress);

    // 4. 检查置信度是否满足最低要求
    if (confidence < trader.minConfidence) {
      console.log(`[AutoTrade] Confidence ${confidence} < minConfidence ${trader.minConfidence}, skipping`);
      return {
        success: false,
        error: `Confidence ${confidence} below threshold ${trader.minConfidence}`,
        skipped: true,
      };
    }

    // 5. 检查仓位限制
    const maxPositionAmount = (parseFloat(trader.capital) * trader.maxPosition) / 100;
    if (amount > maxPositionAmount) {
      throw new Error(`Amount ${amount} exceeds max position ${maxPositionAmount}`);
    }

    // 6. 检查用户交易限制
    const limitCheck = await checkTradeLimits(user.id, amount);
    if (!limitCheck.allowed) {
      throw new Error(limitCheck.reason);
    }

    // 7. 获取 API 凭证
    const credentials = await getUserApiCredentials(user.id, walletAddress, user.privyUserId);

    // 8. 获取最佳执行价格（从订单簿）
    const executionPrice = await getBestExecutionPrice(tokenId, side, price);
    console.log(`[AutoTrade] Original price: ${price}, Execution price: ${executionPrice}`);
    
    // 8.1 创建待处理的交易记录 (使用执行价格)
    const pendingRecord = await recordTradeHistory({
      userId: user.id,
      eventId,
      eventTitle,
      tokenId,
      side,
      amount,
      price: executionPrice, // 使用实际执行价格
      status: 'pending',
      signalSource,
      signalConfidence: confidence,
    });

    // 9. 执行交易 (使用 Privy 代签)
    // 注意: 这里简化了流程，实际需要构建完整的订单并签名
    // ClobClient 通常需要一个 signer，但我们使用 Privy 代签

    // 创建订单对象
    // 使用 FOK (Fill-Or-Kill) - 立即全部成交或完全取消，不会挂单
    const size = amount / executionPrice; // 用执行价格计算 token 数量
    const orderData = {
      tokenId,
      side: side === 'BUY' ? 0 : 1, // 0 = BUY, 1 = SELL
      price: executionPrice,
      size,
      feeRateBps: 0,
      nonce: Date.now(),
      // FOK 订单不需要长过期时间，设为10秒足够
      expiration: Math.floor(Date.now() / 1000) + 10,
    };
    
    console.log(`[AutoTrade] FOK Order: ${side} ${size.toFixed(2)} shares at $${executionPrice.toFixed(4)} (slippage: ${SLIPPAGE_TOLERANCE * 100}%)`);

    // 构建 EIP-712 类型数据用于签名
    // Safe 架构: maker = Safe 地址 (funder), signer = EOA 地址
    const typedData = buildOrderTypedData({
      salt: Math.floor(Math.random() * 1000000000),
      maker: safeAddress,           // Safe 钱包是资金持有者
      signer: walletAddress,        // EOA 负责签名
      taker: '0x0000000000000000000000000000000000000000',
      tokenId: orderData.tokenId,
      makerAmount: ethers.utils.parseUnits(String(amount), 6).toString(), // USDC 6 decimals
      takerAmount: ethers.utils.parseUnits(String(orderData.size), 6).toString(),
      expiration: orderData.expiration,
      nonce: orderData.nonce,
      feeRateBps: orderData.feeRateBps,
      side: orderData.side,
      signatureType: SIGNATURE_TYPE_POLY_PROXY, // Safe 签名类型 = 2
    });

    // 使用 Privy 代签
    const signature = await signTypedData(user.privyUserId, walletAddress, typedData);

    // 提交 FOK 订单到 CLOB (Gasless - 使用 Safe 架构)
    // FOK = Fill-Or-Kill: 立即全部成交或完全取消
    // Safe 架构: owner = Safe 地址, 但签名来自 EOA
    const orderPayload = {
      ...typedData.message,
      signature,
      owner: safeAddress,  // Safe 是订单的 owner (资金来源)
      orderType: ORDER_TYPE_FOK,  // FOK: 立即全部成交或取消
    };

    console.log(`[AutoTrade] Submitting FOK order to CLOB...`);
    
    const response = await fetch(`${CLOB_HOST}/order`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'POLY_API_KEY': credentials.apiKey,
        'POLY_SECRET': credentials.secret,
        'POLY_PASSPHRASE': credentials.passphrase,
        'POLY_SIGNATURE_TYPE': String(SIGNATURE_TYPE_POLY_PROXY), // Safe = 2
      },
      body: JSON.stringify(orderPayload),
    });

    const responseText = await response.text();
    let result;
    
    try {
      result = JSON.parse(responseText);
    } catch {
      throw new Error(`Order submission failed: ${responseText}`);
    }

    if (!response.ok) {
      throw new Error(`Order submission failed: ${responseText}`);
    }

    const orderId = result.orderID || result.id;
    console.log(`[AutoTrade] FOK Order response:`, result);

    // FOK 订单状态判断:
    // - 成功响应 + 有 orderId = 订单已成交 (FOK 特性: 要么全部成交，要么取消)
    // - 成功响应 + status 包含 'matched' = 已成交
    // - 错误响应 = 订单失败/取消
    
    // 检查 FOK 订单结果
    // FOK 订单不需要等待，立即知道结果
    let finalStatus = 'failed';
    let errorMessage = null;
    
    // 检查响应中的状态
    const responseStatus = (result.status || '').toLowerCase();
    const hasOrderId = !!orderId;
    
    // FOK 订单: 如果有 orderId 且状态是 matched，则成交
    // 如果状态是 cancelled 或没有 orderId，则失败
    if (responseStatus === 'matched' || (hasOrderId && responseStatus !== 'cancelled')) {
      // 额外验证: 查询订单状态确认
      await new Promise(resolve => setTimeout(resolve, 500)); // 短暂等待
      const confirmedStatus = await checkOrderStatus(orderId, credentials);
      console.log(`[AutoTrade] FOK order confirmed status:`, confirmedStatus);
      
      if (confirmedStatus === 'matched') {
        finalStatus = 'executed';
      } else if (confirmedStatus === 'unknown') {
        // 404 = 订单不存在 = FOK 被取消（没有成交）
        finalStatus = 'failed';
        errorMessage = 'FOK order was cancelled (no match available at price)';
      } else {
        finalStatus = 'failed';
        errorMessage = `Unexpected order status: ${confirmedStatus}`;
      }
    } else {
      finalStatus = 'failed';
      errorMessage = result.errorMsg || result.error || 'FOK order not filled';
    }
    
    await prisma.autoTradeHistory.update({
      where: { id: pendingRecord.id },
      data: {
        status: finalStatus,
        orderId: orderId,
        executedAt: finalStatus === 'executed' ? new Date() : null,
        errorMessage: errorMessage,
      },
    });

    console.log(`[AutoTrade] FOK Order final status: ${finalStatus}${errorMessage ? ` (${errorMessage})` : ''}`);

    // 11. 发送通知 (只有真正成交才通知)
    if (finalStatus === 'executed') {
      notifyTradeExecuted(user.id, {
        traderId,
        eventId,
        eventTitle,
        orderId: orderId,
        side,
        outcome,
        amount,
        price: executionPrice,
      });
    } else {
      // FOK 失败通知
      notifyTradeFailed(user.id, {
        traderId,
        eventId,
        eventTitle,
        side,
        outcome,
        amount,
        reason: errorMessage || 'FOK order not filled at current market price',
      });
    }

    return {
      success: finalStatus === 'executed',
      orderId: orderId,
      tradeHistoryId: pendingRecord.id,
      status: finalStatus,
      message: finalStatus === 'executed' 
        ? `FOK order filled: ${size.toFixed(2)} shares at $${executionPrice.toFixed(4)}` 
        : errorMessage || 'FOK order not filled',
    };

  } catch (error) {
    console.error('[AutoTrade] Execution failed:', error);

    // 记录失败
    await recordTradeHistory({
      userId: params.userId || 'unknown',
      eventId,
      eventTitle,
      tokenId,
      side,
      amount,
      price,
      status: 'failed',
      errorMessage: error.message,
      signalSource,
      signalConfidence: confidence,
    }).catch(console.error);

    // 发送失败通知
    if (params.userId) {
      notifyTradeFailed(params.userId, {
        traderId,
        eventId,
        eventTitle,
        error: error.message,
      });
    }

    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * 处理 AI 分析信号
 * 根据分析结果决定是否执行交易
 *
 * @param {object} analysisResult - AI 分析结果
 * @param {object} trader - Trader 配置
 * @param {object} marketData - 市场数据
 */
export async function processAnalysisSignal(analysisResult, trader, marketData) {
  const { action, confidence, reasoning } = analysisResult;

  console.log(`[AutoTrade] Processing signal for trader ${trader.id}:`, {
    action,
    confidence,
    reasoning: reasoning?.substring(0, 100),
  });

  // 只在 action 为 buy_yes 或 buy_no 时执行
  if (action === 'hold') {
    console.log('[AutoTrade] Signal is HOLD, skipping trade');
    return { executed: false, reason: 'Hold signal' };
  }

  // 计算交易金额 (使用 Trader 的 capital 的一部分)
  const tradePercentage = Math.min(confidence / 100, trader.maxPosition / 100);
  const tradeAmount = parseFloat(trader.capital) * tradePercentage * 0.1; // 每次最多 10% 的资金

  // 确定交易方向
  const side = 'BUY';
  const outcome = action === 'buy_yes' ? 'YES' : 'NO';
  const price = outcome === 'YES' ? marketData.yesPrice : marketData.noPrice;
  const tokenId = outcome === 'YES' ? marketData.yesTokenId : marketData.noTokenId;

  // 执行交易
  const result = await executeAutoTrade({
    traderId: trader.id,
    eventId: marketData.eventId,
    eventTitle: marketData.eventTitle,
    tokenId,
    side,
    outcome,
    amount: tradeAmount,
    price,
    confidence,
    signalSource: 'ai_analysis',
  });

  // 记录分析历史
  await prisma.polymarketAnalysisHistory.create({
    data: {
      traderId: trader.id,
      userId: trader.userId,
      eventId: marketData.eventId,
      eventTitle: marketData.eventTitle,
      aiModel: trader.aiModel,
      yesPrice: marketData.yesPrice,
      noPrice: marketData.noPrice,
      volume: marketData.volume || 0,
      analysisResult: analysisResult,
      action,
      confidence,
      reasoning: reasoning || '',
    },
  });

  return {
    executed: result.success,
    orderId: result.orderId,
    error: result.error,
    amount: tradeAmount,
    outcome,
  };
}

export default {
  executeAutoTrade,
  processAnalysisSignal,
  checkTradeLimits,
};
