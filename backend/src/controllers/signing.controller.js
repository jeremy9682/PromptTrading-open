/**
 * Agent Wallet Trading Controller
 * Supports User Agent Mode: User's own Agent Wallet (requires agentPrivateKey)
 * Server Agent Mode has been deprecated - all trading uses user's Agent Wallet
 *
 * Reference: https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/signing
 */

import { Hyperliquid } from 'hyperliquid';
import { verifyBatchOrderPermissions } from '../services/agent/verification.service.js';

/**
 * 使用 Agent Wallet 执行订单
 * 支持两种模式:
 * 1. User Agent Mode: 用户提供 agentPrivateKey (传统模式)
 * 2. Server Agent Mode: 使用平台 API Wallet (useServerAgent=true)
 *
 * POST /api/signing/execute-with-agent
 * Body: {
 *   orders: [...],
 *   mainWalletAddress: "0x...",  // 用户钱包地址 (Privy embedded wallet)
 *   useServerAgent: boolean,     // 是否使用服务器端 Agent (新模式)
 *   chainId: 421614/42161,       // 网络ID
 *   // 传统模式需要以下参数:
 *   agentPrivateKey: "0x...",    // Agent 私钥
 *   agentData: {...}             // Agent 授权数据
 * }
 */
export const executeWithAgent = async (req, res) => {
  try {
    const { orders, mainWalletAddress, agentPrivateKey, agentData, chainId, useServerAgent } = req.body;

    if (!orders || !Array.isArray(orders) || orders.length === 0) {
      return res.status(400).json({
        success: false,
        error: '缺少必需参数: orders (数组)'
      });
    }

    if (!mainWalletAddress) {
      return res.status(400).json({
        success: false,
        error: '缺少必需参数: mainWalletAddress (用户钱包地址)'
      });
    }

    // Determine network (default to testnet for safety)
    const effectiveChainId = chainId || 421614;
    const isTestnet = effectiveChainId === 421614;
    const isMainnet = effectiveChainId === 42161;

    if (!isTestnet && !isMainnet) {
      return res.status(400).json({
        success: false,
        error: '不支持的网络。请使用 Arbitrum Sepolia (测试网) 或 Arbitrum One (主网)',
        errorCode: 'UNSUPPORTED_NETWORK',
        chainId: effectiveChainId,
        supportedNetworks: {
          testnet: { name: 'Arbitrum Sepolia', chainId: 421614 },
          mainnet: { name: 'Arbitrum One', chainId: 42161 }
        }
      });
    }

    // ========== Embedded Wallet Mode (Privy embedded wallet) ==========
    // Frontend exports embedded wallet private key and sends it for signing
    const { embeddedWalletPrivateKey } = req.body;

    if (embeddedWalletPrivateKey) {
      console.log(`[Embedded Wallet] 用户: ${mainWalletAddress}, 订单数: ${orders.length}, 网络: ${isTestnet ? '测试网' : '主网'}`);

      // Execute using user's embedded wallet private key
      // This trades on the USER's embedded wallet account
      return await executeWithPrivateKey(
        embeddedWalletPrivateKey,
        mainWalletAddress,  // User's embedded wallet address
        orders,
        res,
        'Embedded Wallet',
        isTestnet
      );
    }

    // ========== Server Agent Mode (Deprecated) ==========
    // Server Agent mode has been removed for security reasons.
    // All trading must use user's own Agent Wallet.
    if (useServerAgent) {
      return res.status(400).json({
        success: false,
        error: 'Server Agent 模式已弃用。请使用 Agent Wallet 进行交易。',
        errorCode: 'SERVER_AGENT_DEPRECATED',
        hint: '前往钱包管理页面创建 Agent Wallet'
      });
    }

    // ========== User Agent Mode (Traditional - requires user's agent private key) ==========
    if (!agentPrivateKey || !agentData) {
      return res.status(400).json({
        success: false,
        error: '需要提供 Agent Wallet 信息进行交易。请先在钱包管理页面创建 Agent Wallet，或启用 useServerAgent 模式。',
        errorCode: 'AGENT_WALLET_REQUIRED',
        details: {
          required: ['agentPrivateKey', 'agentData'],
          missing: [
            !agentPrivateKey && 'agentPrivateKey',
            !agentData && 'agentData'
          ].filter(Boolean),
          hint: '使用 useServerAgent: true 可以使用平台代理执行'
        }
      });
    }

    console.log(`[User Agent] 用户: ${mainWalletAddress}, Agent: ${agentData.address}, 订单数: ${orders.length}, 网络: ${isTestnet ? '测试网' : '主网'}`);

    // 验证订单权限（已在中间件验证过授权签名）
    const permissionCheck = verifyBatchOrderPermissions(orders, agentData);
    if (!permissionCheck.valid) {
      return res.status(403).json({
        success: false,
        error: 'Order permission check failed',
        invalidOrders: permissionCheck.invalidOrders,
        details: permissionCheck.error
      });
    }

    // 使用用户 Agent 私钥执行交易
    return await executeWithPrivateKey(
      agentPrivateKey,
      mainWalletAddress,
      orders,
      res,
      'User Agent',
      isTestnet
    );

  } catch (error) {
    console.error('[Agent 执行] 错误:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      details: error.response?.data || null
    });
  }
};

/**
 * 使用私钥执行订单的通用方法
 * @param {string} privateKey - Agent 私钥
 * @param {string} walletAddress - 主账户地址
 * @param {Array} orders - 订单数组
 * @param {Object} res - Express response 对象
 * @param {string} mode - 模式描述（用于日志）
 * @param {boolean} isTestnet - 是否为测试网
 */
const executeWithPrivateKey = async (privateKey, walletAddress, orders, res, mode = 'Agent', isTestnet = true) => {
  try {

    // 使用提供的私钥创建 SDK 实例
    const client = new Hyperliquid({
      privateKey: privateKey,
      testnet: isTestnet,  // 动态设置网络
      walletAddress: walletAddress,  // 主账户地址
      enableWs: false,
      disableAssetMapRefresh: true  // 🔧 禁用自动刷新，避免网络错误
    });

    await client.connect();

    console.log(`[${mode}] 使用私钥代表用户 ${walletAddress} 执行`);

    // 🎯 使用 Hyperliquid SDK 的高级方法（custom.marketOpen 和 custom.marketClose）
    // 这些方法会自动处理所有格式化、价格计算、滑点、杠杆等
    const results = [];

    for (const order of orders) {
      const coinSymbol = order.coin.replace('-PERP', '');

      try {
        let result;

        if (order.reduceOnly) {
          // 平仓：使用 SDK 的 marketClose 方法（自动处理一切）
          console.log(`[${mode}] ${coinSymbol} CLOSE - 使用 SDK custom.marketClose()`);

          result = await client.custom.marketClose(
            coinSymbol,                    // 币种
            order.quantity,                // 数量（可选，不传则全平）
            order.limitPrice || undefined, // 参考价格（不传则自动获取）
            0.05,                          // 5% 滑点
            order.cloid                    // 客户端订单 ID（可选）
          );

        } else {
          // 开仓：使用 SDK 的 marketOpen 方法（自动处理一切）
          console.log(`[${mode}] ${coinSymbol} ${order.side} - 使用 SDK custom.marketOpen()`);

          result = await client.custom.marketOpen(
            coinSymbol,                    // 币种
            order.side === 'BUY',          // 是否买入
            order.quantity,                // 数量
            order.limitPrice || undefined, // 参考价格（不传则自动获取）
            0.05,                          // 5% 滑点
            order.cloid                    // 客户端订单 ID（可选）
          );
        }

        // 检查结果中是否有错误（即使 HTTP 成功，订单也可能被拒绝）
        const hasError = result.response?.data?.statuses?.some(s => s.error);
        const errorMsg = hasError
          ? result.response.data.statuses.find(s => s.error)?.error
          : null;

        if (hasError) {
          console.log(`[${mode}] ⚠️ ${coinSymbol} 订单被拒绝: ${errorMsg}`);
          results.push({
            coin: coinSymbol,
            success: false,
            rejected: true,  // 标记为平台拒绝（非代码错误）
            error: errorMsg,
            result
          });
        } else {
          console.log(`[${mode}] ✅ ${coinSymbol} 执行成功`);
          results.push({ coin: coinSymbol, success: true, result });
        }

      } catch (error) {
        console.error(`[${mode}] ❌ ${coinSymbol} 执行失败:`, error.message);

        // 友好的错误信息
        let errorMsg = error.message;
        if (error.message.includes('Unknown asset')) {
          errorMsg = `${coinSymbol} 在 Hyperliquid ${isTestnet ? '测试网' : '主网'}不可用。请尝试其他币种（如 BTC, ETH, SOL 等主流币）`;
        } else if (error.message.includes('does not exist')) {
          errorMsg = `Agent Wallet 未在 Hyperliquid 上授权。请在钱包管理页面创建 Agent Wallet。`;
        }

        results.push({ coin: coinSymbol, success: false, error: errorMsg });
      }
    }

    // 汇总结果
    const successCount = results.filter(r => r.success).length;
    const rejectedCount = results.filter(r => r.rejected).length;
    const failedCount = results.filter(r => !r.success && !r.rejected).length;
    
    console.log(`[${mode}] 批量执行完成:`);
    console.log(`  - 成功: ${successCount}/${results.length}`);
    console.log(`  - 平台拒绝: ${rejectedCount}/${results.length}`);
    console.log(`  - 失败: ${failedCount}/${results.length}`);
    
    // 详细的结果汇总
    const summary = {
      total: results.length,
      success: successCount,
      rejected: rejectedCount,
      failed: failedCount,
      results: results.map(r => ({
        coin: r.coin,
        success: r.success,
        rejected: r.rejected || false,
        error: r.error || null,
        // 提取成交信息
        filled: r.result?.response?.data?.statuses?.[0]?.filled || null,
        resting: r.result?.response?.data?.statuses?.[0]?.resting || null
      }))
    };

    return res.json({
      success: true,
      data: summary,
      message: `执行完成: ${successCount} 成功, ${rejectedCount} 被拒绝, ${failedCount} 失败`,
      mode: mode
    });

  } catch (error) {
    console.error(`[${mode}] 错误:`, error);
    throw error; // 抛出到外层处理
  }
};

