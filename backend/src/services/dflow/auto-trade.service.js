/**
 * DFlow/Kalshi Auto Trade Service
 *
 * 自动交易服务 for Kalshi markets via DFlow on Solana
 *
 * 使用 Privy Server SDK 签名 Solana 交易，实现全自动交易
 * (和 Polymarket 自动交易流程一致)
 *
 * 此服务用于:
 * 1. 获取 DFlow Intent (交易报价)
 * 2. 使用 Privy 服务端签名 Solana 交易
 * 3. 提交签名后的交易到 DFlow
 * 4. 记录交易历史
 */

import prisma from '../../lib/prisma.js';
import {
  getSolanaEmbeddedWalletInfo,
  getSolanaEmbeddedWalletAddress,
  signSolanaTransaction,
  broadcastSolanaTransaction,
  checkDelegationStatus,
} from '../privy-signing.service.js';
import { getDFlowApiKey, getSolanaRpcUrl } from '../../config/secrets.js';

// DFlow Trade API
// Production: Use a.quote-api.dflow.net with API key
// IMPORTANT: Always use production API for prediction markets
// dev-quote-api.dflow.net does NOT support prediction market tokens
const DFLOW_TRADE_API = process.env.DFLOW_TRADE_API || 'https://a.quote-api.dflow.net';

// USDC mint on Solana mainnet
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

// 缓存的密钥
let cachedDFlowApiKey = null;
let cachedSolanaRpcUrl = null;

/**
 * 获取 DFlow API Key（带缓存）
 * 开发环境从 .env 读取，生产环境从 AWS Secrets Manager 读取
 */
async function ensureDFlowApiKey() {
  if (cachedDFlowApiKey) return cachedDFlowApiKey;
  cachedDFlowApiKey = await getDFlowApiKey();
  return cachedDFlowApiKey;
}

/**
 * 获取 Solana RPC URL（带缓存）
 * 开发环境从 .env 读取，生产环境从 AWS Secrets Manager 读取
 */
async function ensureSolanaRpcUrl() {
  if (cachedSolanaRpcUrl) return cachedSolanaRpcUrl;
  cachedSolanaRpcUrl = await getSolanaRpcUrl();
  return cachedSolanaRpcUrl;
}

/**
 * Get Solana USDC balance for a wallet
 * 
 * @param {string} walletAddress - Solana wallet address
 * @returns {Promise<number>} USDC balance in dollars
 */
export async function getSolanaUsdcBalance(walletAddress) {
  try {
    // Dynamically import @solana/web3.js and @solana/spl-token
    const { Connection, PublicKey } = await import('@solana/web3.js');
    const { getAssociatedTokenAddress, getAccount } = await import('@solana/spl-token');
    
    // 从 AWS Secrets Manager 或本地 .env 获取 RPC URL
    const solanaRpc = await ensureSolanaRpcUrl();
    const connection = new Connection(solanaRpc, 'confirmed');
    const walletPubkey = new PublicKey(walletAddress);
    const usdcMint = new PublicKey(USDC_MINT);
    
    // Get associated token account for USDC
    const ataAddress = await getAssociatedTokenAddress(usdcMint, walletPubkey);
    
    try {
      const tokenAccount = await getAccount(connection, ataAddress);
      // USDC has 6 decimals
      const balance = Number(tokenAccount.amount) / 1_000_000;
      console.log(`[DFlowAutoTrade] Solana USDC balance for ${walletAddress}: $${balance.toFixed(2)}`);
      return balance;
    } catch (err) {
      // Token account doesn't exist = 0 balance
      if (err.name === 'TokenAccountNotFoundError') {
        console.log(`[DFlowAutoTrade] No USDC token account for ${walletAddress}`);
        return 0;
      }
      throw err;
    }
  } catch (error) {
    console.error('[DFlowAutoTrade] Failed to get Solana USDC balance:', error);
    return 0;
  }
}

/**
 * 获取 DFlow Order（用于预测市场 Imperative Swap）
 *
 * IMPORTANT: 预测市场使用 /order 端点 (imperative swap)，不是 /intent (declarative swap)
 * - /intent 用于普通代币交换
 * - /order 用于预测市场
 *
 * @param {object} params
 * @param {string} params.inputMint - 输入代币地址
 * @param {string} params.outputMint - 输出代币地址
 * @param {number} params.amount - 金额（最小单位）
 * @param {number} params.slippageBps - 滑点（基点）
 * @param {string} params.publicKey - 用户 Solana 公钥
 * @returns {Promise<object>} DFlow Order 响应（包含 transaction）
 */
export async function getDFlowOrder(params) {
  const { inputMint, outputMint, amount, slippageBps = 50, publicKey } = params;

  // Use /order endpoint for prediction markets (imperative swap)
  const url = new URL(`${DFLOW_TRADE_API}/order`);
  url.searchParams.set('userPublicKey', publicKey);
  url.searchParams.set('inputMint', inputMint);
  url.searchParams.set('outputMint', outputMint);
  url.searchParams.set('amount', amount.toString());
  url.searchParams.set('slippageBps', slippageBps.toString());

  // Getting DFlow order

  const headers = {
    'Accept': 'application/json',
  };

  // IMPORTANT: API key must be passed via x-api-key header for production
  // 从 AWS Secrets Manager 或本地 .env 获取
  const apiKey = await ensureDFlowApiKey();
  if (apiKey) {
    headers['x-api-key'] = apiKey;
  }

  const response = await fetch(url.toString(), { headers });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[DFlowAutoTrade] Order API error:', response.status, errorText);
    throw new Error(`Failed to get order: ${response.status} - ${errorText}`);
  }

  const data = await response.json();

  // Normalize response: /order returns 'transaction', add 'openTransaction' alias
  return {
    ...data,
    openTransaction: data.transaction,
  };
}

/**
 * 获取 DFlow 订单状态
 *
 * @param {string} orderId - 订单 ID
 * @returns {Promise<object>} 订单状态
 */
export async function getDFlowOrderStatus(orderId) {
  const url = `${DFLOW_TRADE_API}/order-status?orderId=${orderId}`;

  // Getting order status

  const headers = {
    'Accept': 'application/json',
  };

  // IMPORTANT: API key must be passed via x-api-key header for production
  // 从 AWS Secrets Manager 或本地 .env 获取
  const apiKey = await ensureDFlowApiKey();
  if (apiKey) {
    headers['x-api-key'] = apiKey;
  }

  const response = await fetch(url, { headers });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `Failed to get order status: ${response.status}`);
  }

  return response.json();
}

/**
 * 提交签名后的交易到 DFlow
 *
 * @param {object} params
 * @param {object} params.quoteResponse - 原始的 intent 响应
 * @param {string} params.signedOpenTransaction - 签名后的交易 (Base64)
 * @returns {Promise<object>} 提交结果
 */
export async function submitDFlowIntent(params) {
  const { quoteResponse, signedOpenTransaction } = params;

  // Submitting signed intent to DFlow

  const headers = {
    'Accept': 'application/json',
    'Content-Type': 'application/json',
  };

  // 从 AWS Secrets Manager 或本地 .env 获取
  const apiKey = await ensureDFlowApiKey();
  if (apiKey) {
    headers['x-api-key'] = apiKey;
  }

  const response = await fetch(`${DFLOW_TRADE_API}/submit-intent`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      quoteResponse,
      signedOpenTransaction,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `Failed to submit intent: ${response.status}`);
  }

  const result = await response.json();
  // Intent submitted successfully
  return result;
}

/**
 * 验证用户是否可以进行 Kalshi 自动交易
 *
 * 检查:
 * 1. 用户存在且已启用委托 (isDelegated)
 * 2. 用户有 Solana 嵌入式钱包且已授权
 *
 * Note: We check isDelegated instead of autoTradeEnabled to match Polymarket's behavior.
 * isDelegated is the master switch for server-side signing capabilities.
 *
 * @param {string} privyUserId - Privy 用户 ID
 * @returns {Promise<{canTrade: boolean, reason?: string, solanaAddress?: string}>}
 */
export async function validateKalshiTradingEligibility(privyUserId) {
  try {
    // 获取用户信息
    const user = await prisma.user.findUnique({
      where: { privyUserId },
    });

    if (!user) {
      return { canTrade: false, reason: 'User not found' };
    }

    // 检查是否启用委托 (这是主开关，与 Polymarket 行为一致)
    if (!user.isDelegated) {
      return { canTrade: false, reason: 'Delegation not enabled. Please enable Session Signer.' };
    }

    // 检查委托状态是否仍然有效 (Privy 端)
    const { isDelegated } = await checkDelegationStatus(privyUserId);
    if (!isDelegated) {
      return { canTrade: false, reason: 'Delegation expired. Please re-enable Session Signer.' };
    }

    // 检查 Solana 嵌入式钱包
    const solanaWallet = await getSolanaEmbeddedWalletInfo(privyUserId);
    if (!solanaWallet) {
      return { canTrade: false, reason: 'No Solana embedded wallet found' };
    }

    // 检查钱包是否可以签名
    const canSign = solanaWallet.hasSessionSigners || solanaWallet.delegated;
    if (!canSign) {
      return { canTrade: false, reason: 'Solana wallet not authorized for signing (Session Signer not enabled)' };
    }

    console.log('[DFlowAutoTrade] ✅ User eligible for Kalshi auto-trading:', {
      userId: user.id,
      solanaAddress: solanaWallet.address,
    });

    return { canTrade: true, solanaAddress: solanaWallet.address };
  } catch (error) {
    console.error('[DFlowAutoTrade] Eligibility check failed:', error);
    return { canTrade: false, reason: error.message };
  }
}

/**
 * 记录 Kalshi 交易历史
 *
 * @param {object} params
 * @param {string} params.userId - 用户 ID
 * @param {string} params.traderId - Trader ID
 * @param {string} params.eventId - 事件 ID
 * @param {string} params.eventTitle - 事件标题
 * @param {string} params.tokenId - Token ID (mint address)
 * @param {string} params.side - 'BUY' | 'SELL'
 * @param {number} params.amount - 金额
 * @param {number} params.price - 价格
 * @param {string} params.orderId - 订单 ID
 * @param {string} params.status - 状态
 * @param {number} params.confidence - 置信度
 * @param {string} params.errorMessage - 错误消息
 */
export async function recordKalshiTradeHistory(params) {
  const {
    userId,
    traderId,
    eventId,
    eventTitle,
    tokenId,
    side,
    amount,
    price,
    orderId,
    status = 'pending',
    confidence,
    errorMessage,
  } = params;

  try {
    const record = await prisma.autoTradeHistory.create({
      data: {
        userId,
        traderId,
        source: 'KALSHI', // 标记为 Kalshi 交易
        eventId,
        eventTitle,
        tokenId,
        side,
        amount,
        price,
        orderId,
        status,
        signalSource: 'ai_analysis',
        signalConfidence: confidence,
        errorMessage,
        executedAt: status === 'executed' ? new Date() : null,
      },
    });

    console.log('[DFlowAutoTrade] Trade history recorded:', record.id);
    return record;
  } catch (error) {
    console.error('[DFlowAutoTrade] Failed to record trade history:', error);
    throw error;
  }
}

/**
 * 更新交易状态
 *
 * @param {string} tradeHistoryId - 交易历史 ID
 * @param {string} status - 新状态
 * @param {string} orderId - 订单 ID
 * @param {string} errorMessage - 错误消息
 */
export async function updateTradeStatus(tradeHistoryId, status, orderId = null, errorMessage = null) {
  try {
    const data = { status };

    if (orderId) data.orderId = orderId;
    if (errorMessage) data.errorMessage = errorMessage;
    if (status === 'executed') data.executedAt = new Date();

    await prisma.autoTradeHistory.update({
      where: { id: tradeHistoryId },
      data,
    });

    console.log('[DFlowAutoTrade] Trade status updated:', tradeHistoryId, status);
  } catch (error) {
    console.error('[DFlowAutoTrade] Failed to update trade status:', error);
  }
}

/**
 * 准备 Kalshi 交易参数
 *
 * 注意: 实际交易需要在前端使用 Solana 钱包签名
 *
 * @param {object} params
 * @param {object} params.marketData - 市场数据
 * @param {string} params.action - 交易动作 ('buy_yes' | 'buy_no' | 'sell_yes' | 'sell_no')
 * @param {number} params.amount - 交易金额 (USDC)
 * @param {number} params.slippageBps - 滑点 (基点)
 * @returns {object} 交易参数
 */
export function prepareKalshiTradeParams(params) {
  const { marketData, action, amount, slippageBps = 50 } = params;

  const isBuy = action.startsWith('buy');
  const isYes = action.endsWith('yes');

  // 确定 token ID
  const tokenId = isYes ? marketData.yesTokenId : marketData.noTokenId;

  if (!tokenId) {
    throw new Error(`Token ID not found for ${isYes ? 'YES' : 'NO'} outcome`);
  }

  // 构建交易参数
  const tradeParams = {
    inputMint: isBuy ? USDC_MINT : tokenId,
    outputMint: isBuy ? tokenId : USDC_MINT,
    amount: Math.floor(amount * 1_000_000), // Convert to USDC decimals (6)
    slippageBps,
    side: isBuy ? 'BUY' : 'SELL',
    tokenId,
    // 用于前端显示
    displayAmount: amount,
    displayAction: action,
    outcomeType: isYes ? 'YES' : 'NO',
  };

  console.log('[DFlowAutoTrade] Prepared trade params:', tradeParams);

  return tradeParams;
}

/**
 * 执行 Kalshi 交易（完整流程）
 *
 * 使用 Privy 服务端签名，实现全自动交易:
 * 1. 获取 DFlow Order (imperative swap for prediction markets)
 * 2. 使用 Privy 签名 Solana 交易
 * 3. 广播交易到 Solana 网络
 *
 * Note: Prediction markets use /order endpoint (imperative swap).
 * After signing, we broadcast directly to Solana instead of submitting to DFlow.
 *
 * @param {object} params
 * @param {object} params.tradeParams - 交易参数
 * @param {string} params.privyUserId - Privy 用户 ID
 * @param {string} params.solanaAddress - Solana 钱包地址
 * @returns {Promise<{success: boolean, orderId?: string, txSignature?: string, error?: string}>}
 */
export async function executeKalshiTrade(params) {
  const { tradeParams, privyUserId, solanaAddress } = params;

  try {
    // Step 1: 获取 DFlow Order (imperative swap)
    const orderResponse = await getDFlowOrder({
      inputMint: tradeParams.inputMint,
      outputMint: tradeParams.outputMint,
      amount: tradeParams.amount,
      slippageBps: tradeParams.slippageBps,
      publicKey: solanaAddress,
    });

    if (!orderResponse.openTransaction) {
      throw new Error('No transaction in order response');
    }

    // Step 2: 使用 Privy 签名交易
    const signedTransaction = await signSolanaTransaction(
      privyUserId,
      orderResponse.openTransaction // Base64 encoded transaction
    );

    // Step 3: 广播签名后的交易到 Solana
    const txSignature = await broadcastSolanaTransaction(signedTransaction);

    return {
      success: true,
      txSignature,
    };

  } catch (error) {
    console.error('[DFlowAutoTrade] ❌ Trade execution failed:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * 处理 Kalshi 分析信号
 *
 * 使用 Privy 服务端签名实现全自动交易（和 Polymarket 一样）
 *
 * @param {object} analysisResult - AI 分析结果
 * @param {object} trader - Trader 配置
 * @param {object} marketData - 市场数据
 * @param {object} user - 用户信息
 * @returns {Promise<{executed: boolean, pending?: boolean, tradeId?: string, reason?: string}>}
 */
export async function processKalshiAnalysisSignal(analysisResult, trader, marketData, user) {
  const { action, confidence, reasoning } = analysisResult;

  console.log('[DFlowAutoTrade] Processing Kalshi analysis signal:', {
    action,
    confidence,
    traderId: trader.id,
    eventId: marketData.eventId,
  });

  // 检查是否需要交易
  if (action === 'hold') {
    console.log('[DFlowAutoTrade] Action is hold, skipping trade');
    return { executed: false, reason: 'Hold signal' };
  }

  // 验证置信度
  if (confidence < trader.minConfidence) {
    console.log(`[DFlowAutoTrade] Confidence ${confidence} below threshold ${trader.minConfidence}`);
    return { executed: false, reason: `Confidence below threshold (${confidence} < ${trader.minConfidence})` };
  }

  try {
    // 验证用户是否可以进行 Kalshi 自动交易
    const eligibility = await validateKalshiTradingEligibility(user.privyUserId);
    if (!eligibility.canTrade) {
      console.log('[DFlowAutoTrade] User not eligible for Kalshi auto-trading:', eligibility.reason);

      // 如果不能自动交易，记录为 pending 状态
      const tradeParams = prepareKalshiTradeParams({
        marketData,
        action,
        amount: Number(trader.capital || 1000) * (trader.maxPosition / 100) * (confidence / 100),
      });

      const tradeRecord = await recordKalshiTradeHistory({
        userId: user.id,
        traderId: trader.id,
        eventId: marketData.eventId,
        eventTitle: marketData.eventTitle,
        tokenId: tradeParams.tokenId,
        side: tradeParams.side,
        amount: tradeParams.displayAmount,
        price: action.endsWith('yes') ? marketData.yesPrice : marketData.noPrice,
        status: 'pending',
        confidence,
        errorMessage: eligibility.reason,
      });

      return {
        executed: false,
        pending: true,
        tradeId: tradeRecord.id,
        reason: eligibility.reason,
      };
    }

    // 计算交易金额
    const capitalDecimal = trader.capital || 1000;
    const maxPositionPercent = trader.maxPosition / 100;
    const tradeAmount = Number(capitalDecimal) * maxPositionPercent * (confidence / 100);

    // 准备交易参数
    const tradeParams = prepareKalshiTradeParams({
      marketData,
      action,
      amount: tradeAmount,
    });

    // 记录交易（状态为 executing）
    const tradeRecord = await recordKalshiTradeHistory({
      userId: user.id,
      traderId: trader.id,
      eventId: marketData.eventId,
      eventTitle: marketData.eventTitle,
      tokenId: tradeParams.tokenId,
      side: tradeParams.side,
      amount: tradeParams.displayAmount,
      price: action.endsWith('yes') ? marketData.yesPrice : marketData.noPrice,
      status: 'executing',
      confidence,
    });

    console.log('[DFlowAutoTrade] 🚀 Executing auto-trade for:', tradeRecord.id);

    // 执行交易（使用服务端签名）
    const tradeResult = await executeKalshiTrade({
      tradeParams,
      privyUserId: user.privyUserId,
      solanaAddress: eligibility.solanaAddress,
    });

    if (tradeResult.success) {
      // 更新交易状态为已执行 (use txSignature as orderId for imperative swaps)
      await updateTradeStatus(tradeRecord.id, 'executed', tradeResult.txSignature);

      console.log('[DFlowAutoTrade] ✅ Kalshi auto-trade executed successfully:', {
        tradeId: tradeRecord.id,
        txSignature: tradeResult.txSignature,
      });

      return {
        executed: true,
        tradeId: tradeRecord.id,
        txSignature: tradeResult.txSignature,
      };
    } else {
      // 更新交易状态为失败
      await updateTradeStatus(tradeRecord.id, 'failed', null, tradeResult.error);

      console.log('[DFlowAutoTrade] ❌ Kalshi auto-trade failed:', tradeResult.error);

      return {
        executed: false,
        tradeId: tradeRecord.id,
        reason: tradeResult.error,
      };
    }

  } catch (error) {
    console.error('[DFlowAutoTrade] Signal processing failed:', error);
    return { executed: false, reason: error.message };
  }
}

/**
 * 获取待执行的 Kalshi 交易
 *
 * @param {string} userId - 用户 ID
 * @returns {Promise<Array>} 待执行交易列表
 */
export async function getPendingKalshiTrades(userId) {
  try {
    const trades = await prisma.autoTradeHistory.findMany({
      where: {
        userId,
        source: 'KALSHI',
        status: 'pending',
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 20,
    });

    return trades;
  } catch (error) {
    console.error('[DFlowAutoTrade] Failed to get pending trades:', error);
    return [];
  }
}

export default {
  // DFlow API
  getDFlowOrder,
  getDFlowOrderStatus,
  submitDFlowIntent,
  // Validation
  validateKalshiTradingEligibility,
  // Balance check
  getSolanaUsdcBalance,
  // Trade execution
  executeKalshiTrade,
  processKalshiAnalysisSignal,
  // Trade history
  recordKalshiTradeHistory,
  updateTradeStatus,
  getPendingKalshiTrades,
  // Helpers
  prepareKalshiTradeParams,
};
