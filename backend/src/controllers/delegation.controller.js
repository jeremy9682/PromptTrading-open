/**
 * Delegation Controller
 * 处理 Privy Delegated Actions 相关的 API 请求
 *
 * 功能:
 * - 获取用户委托状态
 * - 启用委托授权
 * - 撤销委托授权
 * - 更新自动交易设置
 * 
 * 注意：所有钱包地址都会被规范化为小写，确保与其他模块的一致性
 */

import prisma from '../lib/prisma.js';
import { normalizeWalletAddress, isValidEthAddress } from '../utils/wallet.js';
import { getUserByPrivyId, invalidateUser } from '../services/user-cache.service.js';
import { invalidateDelegationCache } from '../services/privy-signing.service.js';

/**
 * 获取用户委托状态
 * GET /api/user/delegation-status
 */
export const getDelegationStatus = async (req, res) => {
  try {
    // 需要认证
    if (!req.privyUser?.userId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
    }

    const privyUserId = req.privyUser.userId;

    // 从缓存获取用户
    const user = await getUserByPrivyId(privyUserId);

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
      });
    }

    res.json({
      success: true,
      isDelegated: user.isDelegated,
      delegatedAt: user.delegatedAt,
      delegationChainId: user.delegationChainId,
      autoTradeEnabled: user.autoTradeEnabled,
      // 使用 != null 检查，确保 0 值能正确传递（0 是有效的限额值）
      autoTradeMaxAmount: user.autoTradeMaxAmount != null ? parseFloat(user.autoTradeMaxAmount) : null,
      autoTradeDailyLimit: user.autoTradeDailyLimit != null ? parseFloat(user.autoTradeDailyLimit) : null,
    });

  } catch (error) {
    console.error('[Delegation] Error getting status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get delegation status',
    });
  }
};

/**
 * 启用委托授权
 * POST /api/user/enable-delegation
 * Body: { walletAddress, chainId }
 * 
 * 安全说明:
 * - 对于已存在的用户，不允许通过此接口更改 walletAddress
 * - walletAddress 只在创建新用户时设置
 * - 这样可以保护 PolymarketApiCredential 等关联表的数据完整性
 */
export const enableDelegation = async (req, res) => {
  try {
    // 需要认证
    if (!req.privyUser?.userId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
    }

    const privyUserId = req.privyUser.userId;
    const { walletAddress, chainId } = req.body;

    // 支持的区块链网络 ID 白名单
    // 137: Polygon Mainnet (主要用于 Polymarket)
    // 80002: Polygon Amoy Testnet (测试环境)
    const SUPPORTED_CHAIN_IDS = [137, 80002];
    const DEFAULT_CHAIN_ID = 137; // Polygon Mainnet

    // 验证 chainId（如果提供）
    let validatedChainId = DEFAULT_CHAIN_ID;
    if (chainId !== undefined && chainId !== null) {
      const parsedChainId = Number(chainId);
      if (!Number.isInteger(parsedChainId) || !SUPPORTED_CHAIN_IDS.includes(parsedChainId)) {
        return res.status(400).json({
          success: false,
          error: `Invalid chainId. Supported chain IDs: ${SUPPORTED_CHAIN_IDS.join(', ')}`,
        });
      }
      validatedChainId = parsedChainId;
    }

    // 验证 walletAddress 类型和存在性
    if (walletAddress === undefined || walletAddress === null) {
      return res.status(400).json({
        success: false,
        error: 'Missing walletAddress',
      });
    }
    if (typeof walletAddress !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'walletAddress must be a string',
      });
    }
    const trimmedWalletAddress = walletAddress.trim();
    if (!trimmedWalletAddress) {
      return res.status(400).json({
        success: false,
        error: 'walletAddress cannot be empty',
      });
    }

    // 验证以太坊地址格式 (0x + 40个十六进制字符)
    const ethAddressRegex = /^0x[a-fA-F0-9]{40}$/;
    if (!ethAddressRegex.test(trimmedWalletAddress)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid walletAddress format. Must be a valid Ethereum address (0x + 40 hex characters).',
      });
    }

    // 统一转为小写存储，确保查询时大小写一致
    const normalizedWalletAddress = trimmedWalletAddress.toLowerCase();

    // 先检查用户是否已存在（包括委托状态，用于保留首次委托时间）
    // 从缓存获取用户
    const existingUser = await getUserByPrivyId(privyUserId);

    let user;

    if (existingUser) {
      // 用户已存在：只更新委托状态，不允许更改 walletAddress
      // 这保护了 PolymarketApiCredential 等使用 (userId, walletAddress) 作为键的关联数据
      
      // 检查现有 walletAddress 是否有效（非 null、非空字符串）
      const hasValidWalletAddress = existingUser.walletAddress && existingUser.walletAddress.trim() !== '';
      
      if (hasValidWalletAddress) {
        // 已有有效的 walletAddress，不允许更改
        // 比较时需要将现有地址也规范化为小写，确保大小写不同的相同地址不会被误判为"尝试更改"
        const existingNormalized = normalizeWalletAddress(existingUser.walletAddress);
        if (existingNormalized !== normalizedWalletAddress) {
          console.warn(
            `[Delegation] User ${privyUserId} attempted to change walletAddress from ${existingUser.walletAddress} to ${normalizedWalletAddress}. Ignoring walletAddress change.`
          );
        }

        user = await prisma.user.update({
          where: { privyUserId },
          data: {
            // 不更新 walletAddress，保持现有值
            isDelegated: true,
            // 保留首次委托时间，只有当 delegatedAt 为 null 时才设置新时间
            delegatedAt: existingUser.delegatedAt ?? new Date(),
            delegationChainId: validatedChainId,
          },
        });
      } else {
        // 现有用户没有有效的 walletAddress（可能是通过其他代码路径创建的）
        // 此时需要设置 walletAddress，否则会违反数据库非空约束
        console.log(
          `[Delegation] User ${privyUserId} has no valid walletAddress (current: "${existingUser.walletAddress || ''}"), setting to ${normalizedWalletAddress}`
        );

        user = await prisma.user.update({
          where: { privyUserId },
          data: {
            walletAddress: normalizedWalletAddress,
            isDelegated: true,
            delegatedAt: existingUser.delegatedAt ?? new Date(),
            delegationChainId: validatedChainId,
          },
        });
      }

      // 清除缓存（数据已更新）
      invalidateUser(privyUserId);
      invalidateDelegationCache(privyUserId);  // 同时清除委托状态短期缓存

      const isReenabling = existingUser.delegatedAt !== null;
      console.log(`[Delegation] User ${privyUserId} ${isReenabling ? 're-enabled' : 'enabled'} delegation (wallet: ${user.walletAddress}, original delegatedAt: ${existingUser.delegatedAt})`);
    } else {
      // 新用户：可以设置初始 walletAddress（使用 normalized 地址）
      user = await prisma.user.create({
        data: {
          privyUserId,
          walletAddress: normalizedWalletAddress,
          isDelegated: true,
          delegatedAt: new Date(),
          delegationChainId: validatedChainId,
        },
      });

      console.log(`[Delegation] New user ${privyUserId} created with delegation for wallet ${normalizedWalletAddress}`);
    }

    res.json({
      success: true,
      message: 'Delegation enabled successfully',
      isDelegated: true,
      delegatedAt: user.delegatedAt,
      walletAddress: user.walletAddress, // 返回实际使用的钱包地址
    });

  } catch (error) {
    console.error('[Delegation] Error enabling delegation:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to enable delegation',
    });
  }
};

/**
 * 撤销委托授权
 * POST /api/user/disable-delegation
 */
export const disableDelegation = async (req, res) => {
  try {
    // 需要认证
    if (!req.privyUser?.userId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
    }

    const privyUserId = req.privyUser.userId;

    // 从缓存获取用户
    const existingUser = await getUserByPrivyId(privyUserId);

    if (!existingUser) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
      });
    }

    // 更新用户 - 撤销委托
    await prisma.user.update({
      where: { privyUserId },
      data: {
        isDelegated: false,
        autoTradeEnabled: false, // 同时禁用自动交易
      },
    });

    // 清除缓存（数据已更新）
    invalidateUser(privyUserId);
    invalidateDelegationCache(privyUserId);  // 同时清除委托状态短期缓存

    console.log(`[Delegation] User ${privyUserId} disabled delegation`);

    res.json({
      success: true,
      message: 'Delegation disabled successfully',
      isDelegated: false,
    });

  } catch (error) {
    console.error('[Delegation] Error disabling delegation:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to disable delegation',
    });
  }
};

/**
 * 更新自动交易设置
 * POST /api/user/auto-trade-settings
 * Body: { enabled, maxAmount, dailyLimit }
 * 
 * 验证规则:
 * - enabled: 必须是布尔值 (如果提供)
 * - maxAmount: 必须是非负数 (如果提供)
 * - dailyLimit: 必须是非负数 (如果提供)
 */
export const updateAutoTradeSettings = async (req, res) => {
  try {
    // 需要认证
    if (!req.privyUser?.userId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
    }

    const privyUserId = req.privyUser.userId;
    const { enabled, maxAmount, dailyLimit } = req.body;

    // 输入验证
    if (enabled !== undefined && typeof enabled !== 'boolean') {
      return res.status(400).json({
        success: false,
        error: 'enabled must be a boolean',
      });
    }

    if (maxAmount !== undefined) {
      if (typeof maxAmount !== 'number' || isNaN(maxAmount)) {
        return res.status(400).json({
          success: false,
          error: 'maxAmount must be a number',
        });
      }
      if (maxAmount < 0) {
        return res.status(400).json({
          success: false,
          error: 'maxAmount must be non-negative',
        });
      }
    }

    if (dailyLimit !== undefined) {
      if (typeof dailyLimit !== 'number' || isNaN(dailyLimit)) {
        return res.status(400).json({
          success: false,
          error: 'dailyLimit must be a number',
        });
      }
      if (dailyLimit < 0) {
        return res.status(400).json({
          success: false,
          error: 'dailyLimit must be non-negative',
        });
      }
    }

    // 从缓存获取用户
    const existingUser = await getUserByPrivyId(privyUserId);

    if (!existingUser) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
      });
    }

    // 如果要启用自动交易，必须先启用委托
    if (enabled === true && !existingUser.isDelegated) {
      return res.status(400).json({
        success: false,
        error: 'Delegation must be enabled before enabling auto-trade',
      });
    }

    // 更新自动交易设置
    // 统一使用 !== undefined 检查，确保 false/0 等 falsy 值能正确处理
    const updatedUser = await prisma.user.update({
      where: { privyUserId },
      data: {
        autoTradeEnabled: enabled !== undefined ? enabled : existingUser.autoTradeEnabled,
        autoTradeMaxAmount: maxAmount !== undefined ? maxAmount : existingUser.autoTradeMaxAmount,
        autoTradeDailyLimit: dailyLimit !== undefined ? dailyLimit : existingUser.autoTradeDailyLimit,
      },
    });

    // 清除缓存（数据已更新）
    invalidateUser(privyUserId);

    console.log(`[Delegation] User ${privyUserId} updated auto-trade settings:`, {
      enabled: updatedUser.autoTradeEnabled,
      maxAmount: updatedUser.autoTradeMaxAmount,
      dailyLimit: updatedUser.autoTradeDailyLimit,
    });

    res.json({
      success: true,
      message: 'Auto-trade settings updated',
      autoTradeEnabled: updatedUser.autoTradeEnabled,
      // 使用 != null 检查，确保 0 值能正确传递（0 是有效的限额值）
      autoTradeMaxAmount: updatedUser.autoTradeMaxAmount != null ? parseFloat(updatedUser.autoTradeMaxAmount) : null,
      autoTradeDailyLimit: updatedUser.autoTradeDailyLimit != null ? parseFloat(updatedUser.autoTradeDailyLimit) : null,
    });

  } catch (error) {
    console.error('[Delegation] Error updating auto-trade settings:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update auto-trade settings',
    });
  }
};

/**
 * 获取自动交易历史
 * GET /api/user/auto-trade-history
 * Query: { limit, offset }
 * 
 * 分页参数:
 * - limit: 返回的记录数量 (默认 20，允许 1-100)
 * - offset: 跳过的记录数量 (默认 0)
 * 
 * 注意: limit 必须 >= 1，不允许 limit=0。
 * 原因: limit=0 会导致 hasMore 计算错误（返回0条记录但 hasMore=true）
 */
export const getAutoTradeHistory = async (req, res) => {
  try {
    // 需要认证
    if (!req.privyUser?.userId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
    }

    const privyUserId = req.privyUser.userId;

    // 解析分页参数
    const limitParam = req.query.limit;
    const offsetParam = req.query.offset;

    const limit = limitParam !== undefined ? parseInt(limitParam, 10) : 20;
    const offset = offsetParam !== undefined ? parseInt(offsetParam, 10) : 0;

    // 验证 limit (必须 >= 1，不允许 0)
    // 原因: limit=0 时 hasMore 计算会错误地返回 true
    if (isNaN(limit) || limit < 1) {
      return res.status(400).json({
        success: false,
        error: 'limit must be a positive integer (>= 1)',
      });
    }
    if (limit > 100) {
      return res.status(400).json({
        success: false,
        error: 'limit must not exceed 100',
      });
    }

    // 验证 offset
    if (isNaN(offset) || offset < 0) {
      return res.status(400).json({
        success: false,
        error: 'offset must be a non-negative integer',
      });
    }

    // 从缓存获取用户
    const user = await getUserByPrivyId(privyUserId);

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
      });
    }

    // 获取交易历史
    const [history, total] = await Promise.all([
      prisma.autoTradeHistory.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.autoTradeHistory.count({
        where: { userId: user.id },
      }),
    ]);

    res.json({
      success: true,
      data: history.map(h => ({
        id: h.id,
        eventId: h.eventId,
        eventTitle: h.eventTitle,
        tokenId: h.tokenId,
        side: h.side,
        amount: parseFloat(h.amount),
        price: parseFloat(h.price),
        orderId: h.orderId,
        status: h.status,
        errorMessage: h.errorMessage,
        signalSource: h.signalSource,
        signalConfidence: h.signalConfidence,
        createdAt: h.createdAt,
        executedAt: h.executedAt,
      })),
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + history.length < total,
      },
    });

  } catch (error) {
    console.error('[Delegation] Error getting auto-trade history:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get auto-trade history',
    });
  }
};
