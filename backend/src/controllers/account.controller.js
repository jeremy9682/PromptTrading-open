/**
 * Hyperliquid 账户控制器
 * 处理账户信息查询相关请求
 * 
 * ✅ 支持测试网和主网动态切换
 */

import * as accountService from '../services/hyperliquid/account.service.js';
import * as positionsService from '../services/hyperliquid/positions.service.js';
import { getCompleteAccountOverview, generateAccountPrompt } from '../services/hyperliquid/index.js';

/**
 * 获取用户账户余额
 * GET /api/account/balance?address=0x...&chainId=421614/42161
 */
export const getAccountBalance = async (req, res) => {
  try {
    const { address } = req.query;

    if (!address) {
      return res.status(400).json({
        success: false,
        error: '缺少必需参数: address'
      });
    }

    const isTestnet = req.isTestnet; // 从中间件获取
    const networkName = isTestnet ? '测试网' : '主网';
    console.log(`[${networkName}] 获取账户余额: ${address}`);

    const balance = await accountService.getAccountBalance(address, isTestnet);

    res.json({
      success: true,
      data: balance,
      timestamp: Date.now()
    });

  } catch (error) {
    console.error('获取账户余额错误:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * 获取用户账户性能指标
 * GET /api/account/performance?address=0x...&initialBalance=10000&chainId=421614/42161
 */
export const getAccountPerformance = async (req, res) => {
  try {
    const { address, initialBalance } = req.query;

    if (!address) {
      return res.status(400).json({
        success: false,
        error: '缺少必需参数: address'
      });
    }

    const isTestnet = req.isTestnet; // 从中间件获取
    const networkName = isTestnet ? '测试网' : '主网';
    console.log(`[${networkName}] 获取账户性能: ${address}`);

    const performance = await accountService.getAccountPerformance(
      address,
      initialBalance ? parseFloat(initialBalance) : 10000,
      isTestnet
    );

    res.json({
      success: true,
      data: performance,
      timestamp: Date.now()
    });

  } catch (error) {
    console.error('获取账户性能错误:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * 获取用户持仓信息
 * GET /api/account/positions?address=0x...&chainId=421614/42161
 */
export const getUserPositions = async (req, res) => {
  try {
    const { address } = req.query;

    if (!address) {
      return res.status(400).json({
        success: false,
        error: '缺少必需参数: address'
      });
    }

    const isTestnet = req.isTestnet; // 从中间件获取
    const networkName = isTestnet ? '测试网' : '主网';
    console.log(`[${networkName}] 获取用户持仓: ${address}`);

    const positions = await positionsService.getUserPositions(address, isTestnet);
    const stats = positionsService.calculatePositionStats(positions);

    res.json({
      success: true,
      data: {
        positions,
        stats
      },
      timestamp: Date.now()
    });

  } catch (error) {
    console.error('获取用户持仓错误:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * 获取未成交订单
 * GET /api/account/open-orders?address=0x...&chainId=421614/42161
 */
export const getOpenOrders = async (req, res) => {
  try {
    const { address } = req.query;

    if (!address) {
      return res.status(400).json({
        success: false,
        error: '缺少必需参数: address'
      });
    }

    const isTestnet = req.isTestnet; // 从中间件获取
    const networkName = isTestnet ? '测试网' : '主网';
    console.log(`[${networkName}] 获取未成交订单: ${address}`);

    const orders = await positionsService.getOpenOrders(address, isTestnet);

    res.json({
      success: true,
      data: orders,
      timestamp: Date.now()
    });

  } catch (error) {
    console.error('获取未成交订单错误:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * 获取完整账户概览
 * GET /api/account/overview?address=0x...&initialBalance=10000&chainId=421614/42161
 */
export const getAccountOverview = async (req, res) => {
  try {
    const { address, initialBalance } = req.query;

    if (!address) {
      return res.status(400).json({
        success: false,
        error: '缺少必需参数: address'
      });
    }

    const isTestnet = req.isTestnet; // 从中间件获取
    const networkName = isTestnet ? '测试网' : '主网';
    console.log(`[${networkName}] 获取账户概览: ${address}`);

    const overview = await getCompleteAccountOverview(
      address,
      initialBalance ? parseFloat(initialBalance) : 10000,
      isTestnet
    );

    res.json({
      success: true,
      data: overview
    });

  } catch (error) {
    console.error('获取账户概览错误:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * 生成用于 AI 的账户摘要
 * GET /api/account/ai-prompt?address=0x...&initialBalance=10000&chainId=421614/42161
 */
export const getAccountAIPrompt = async (req, res) => {
  try {
    const { address, initialBalance } = req.query;

    if (!address) {
      return res.status(400).json({
        success: false,
        error: '缺少必需参数: address'
      });
    }

    const isTestnet = req.isTestnet; // 从中间件获取
    const networkName = isTestnet ? '测试网' : '主网';
    console.log(`[${networkName}] 生成 AI Prompt: ${address}`);

    const prompt = await generateAccountPrompt(
      address,
      initialBalance ? parseFloat(initialBalance) : 10000,
      'en', // 语言参数
      isTestnet
    );

    res.json({
      success: true,
      data: {
        prompt,
        address,
        timestamp: Date.now()
      }
    });

  } catch (error) {
    console.error('生成 AI Prompt 错误:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * 获取用户历史交易
 * GET /api/account/fills?address=0x...&chainId=421614/42161
 */
export const getUserFills = async (req, res) => {
  try {
    const { address } = req.query;

    if (!address) {
      return res.status(400).json({
        success: false,
        error: '缺少必需参数: address'
      });
    }

    const isTestnet = req.isTestnet; // 从中间件获取
    const networkName = isTestnet ? '测试网' : '主网';
    console.log(`[${networkName}] 获取历史交易: ${address}`);

    const fills = await accountService.getUserFills(address, isTestnet);

    res.json({
      success: true,
      data: fills,
      timestamp: Date.now()
    });

  } catch (error) {
    console.error('获取历史交易错误:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * 平仓指定持仓
 * POST /api/account/close-position
 * Body: { coin, address, size?, embeddedWalletPrivateKey, chainId }
 *
 * Supports two modes:
 * 1. Embedded Wallet Mode: Uses embeddedWalletPrivateKey from Privy embedded wallet
 * 2. Agent Wallet Mode (legacy): Uses agentPrivateKey and agentData
 */
export const closePosition = async (req, res) => {
  try {
    const { coin, address, size, embeddedWalletPrivateKey, agentPrivateKey, agentData, chainId } = req.body;

    if (!coin || !address) {
      return res.status(400).json({
        success: false,
        error: '缺少必需参数: coin, address'
      });
    }

    // Determine which private key to use
    let privateKeyToUse = null;
    let mode = 'unknown';

    // Priority 1: Embedded Wallet Mode (Privy embedded wallet)
    if (embeddedWalletPrivateKey) {
      privateKeyToUse = embeddedWalletPrivateKey;
      mode = 'Embedded Wallet';
    }
    // Priority 2: Agent Wallet Mode (legacy MetaMask agent)
    else if (agentPrivateKey && agentData) {
      privateKeyToUse = agentPrivateKey;
      mode = 'Agent Wallet';
    }
    // No valid credentials provided
    else {
      return res.status(400).json({
        success: false,
        error: '需要提供钱包签名信息进行平仓操作。请确保您已登录。',
        errorCode: 'WALLET_REQUIRED',
        details: {
          message: 'Either embeddedWalletPrivateKey or agentPrivateKey+agentData is required'
        }
      });
    }

    // Validate chainId
    if (!chainId) {
      return res.status(400).json({
        success: false,
        error: '缺少必需参数: chainId',
        errorCode: 'CHAIN_ID_REQUIRED'
      });
    }

    // 验证网络
    const isTestnet = chainId === 421614; // Arbitrum Sepolia
    const isMainnet = chainId === 42161;  // Arbitrum One

    if (!isTestnet && !isMainnet) {
      return res.status(400).json({
        success: false,
        error: '不支持的网络。请使用 Arbitrum Sepolia (测试网) 或 Arbitrum One (主网)',
        errorCode: 'UNSUPPORTED_NETWORK',
        chainId: chainId
      });
    }

    console.log(`[${mode}] Close position: ${coin} for ${address} on ${isTestnet ? 'Testnet' : 'Mainnet'}`);

    // 动态导入 Hyperliquid SDK
    const { Hyperliquid } = await import('hyperliquid');

    // 创建 SDK 客户端（使用动态网络）
    const client = new Hyperliquid({
      privateKey: privateKeyToUse,
      testnet: isTestnet,
      walletAddress: address,
      enableWs: false,
      disableAssetMapRefresh: true  // Disable auto refresh to avoid network errors
    });

    await client.connect();

    // 使用 SDK 的 marketClose 方法平仓
    const coinSymbol = coin.replace('-PERP', '');
    console.log(`📤 执行平仓: ${coinSymbol}${size ? ` (size: ${size})` : ' (全平)'}`);

    const result = await client.custom.marketClose(
      coinSymbol,
      size,         // 可选：不传则全平
      undefined,    // 参考价格（自动获取）
      0.05          // 5% 滑点
    );

    // 检查是否有错误
    const hasError = result.response?.data?.statuses?.some(s => s.error);
    const errorMsg = hasError
      ? result.response.data.statuses.find(s => s.error)?.error
      : null;

    if (hasError) {
      console.error('❌ 平仓失败:', errorMsg);
      return res.status(400).json({
        success: false,
        error: errorMsg || '平仓失败',
        details: result
      });
    }

    console.log('✅ 平仓成功:', result);

    res.json({
      success: true,
      message: `${coin} 平仓成功`,
      data: result,
      timestamp: Date.now()
    });

  } catch (error) {
    console.error('❌ 平仓错误:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * 提款
 * POST /api/account/withdraw
 * Body: { address, amount, destination }
 */
export const withdraw = async (req, res) => {
  try {
    const { address, amount, destination } = req.body;

    if (!address || !amount || !destination) {
      return res.status(400).json({
        success: false,
        error: '缺少必需参数: address, amount, destination'
      });
    }

    const withdrawAmount = parseFloat(amount);
    if (isNaN(withdrawAmount) || withdrawAmount <= 0) {
      return res.status(400).json({
        success: false,
        error: '无效的提款金额'
      });
    }

    console.log(`[测试网] 提款请求: ${withdrawAmount} USDT to ${destination}`);

    // 动态导入 Hyperliquid SDK
    const { Hyperliquid } = await import('hyperliquid');
    const { getMainAccountAddress, getTestPrivateKey } = await import('../config/hyperliquid.config.js');

    const mainAccountAddress = getMainAccountAddress();
    const apiWalletPrivateKey = getTestPrivateKey();

    if (!apiWalletPrivateKey) {
      return res.status(500).json({
        success: false,
        error: '未配置 API Wallet'
      });
    }

    // 创建 SDK 客户端
    const client = new Hyperliquid({
      privateKey: apiWalletPrivateKey,
      testnet: true,
      walletAddress: mainAccountAddress,
      enableWs: false,
      disableAssetMapRefresh: true  // 🔧 禁用自动刷新，避免网络错误
    });

    await client.connect();

    // 使用 SDK 的 usdTransfer 方法提款
    // 注意：withdrawAmount 需要以 USDC 为单位（测试网）
    const result = await client.custom.usdTransfer(
      destination,
      withdrawAmount
    );

    // 检查是否有错误
    const hasError = result.response?.data?.statuses?.some(s => s.error);
    const errorMsg = hasError
      ? result.response.data.statuses.find(s => s.error)?.error
      : null;

    if (hasError) {
      return res.status(400).json({
        success: false,
        error: errorMsg || '提款失败',
        details: result
      });
    }

    res.json({
      success: true,
      message: `提款 ${withdrawAmount} USDT 成功`,
      data: result,
      timestamp: Date.now()
    });

  } catch (error) {
    console.error('提款错误:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * 测试接口
 */
export const testAccount = async (req, res) => {
  res.json({
    success: true,
    message: 'Hyperliquid Account API working',
    network: 'TESTNET ONLY',
    availableEndpoints: [
      'GET /api/account/balance?address=0x...',
      'GET /api/account/performance?address=0x...',
      'GET /api/account/positions?address=0x...',
      'GET /api/account/open-orders?address=0x...',
      'GET /api/account/overview?address=0x...',
      'GET /api/account/ai-prompt?address=0x...',
      'GET /api/account/fills?address=0x...',
      'POST /api/account/close-position',
      'POST /api/account/withdraw'
    ]
  });
};

