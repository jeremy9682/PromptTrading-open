/**
 * Polymarket Safe Controller
 *
 * 处理 Safe 钱包相关的 API 请求
 *
 * 重要架构说明 (参考 https://github.com/ayv8er/polymarket-safe-trader):
 * - 后端: 存储状态、检查链上数据、提供 Builder 签名
 * - 前端: 使用 @polymarket/builder-relayer-client 进行 Safe 部署和授权
 */

import prisma from '../lib/prisma.js';
import {
  isSafeDeployed,
  checkTokenApprovals,
  getSafeUSDCBalance,
  saveUserSafeAddress,
  updateSafeDeploymentStatus,
  updateSafeApprovalsStatus,
  getUserSafeInfo,
} from '../services/safe-relayer.service.js';
import { getUserByPrivyId, invalidateUser } from '../services/user-cache.service.js';

/**
 * 获取 Safe 信息
 * GET /api/polymarket/trading/safe-info
 */
export async function getSafeInfo(req, res) {
  try {
    const userId = req.privyUser?.userId;
    console.log('[SafeController] getSafeInfo called, userId:', userId);

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
    }

    // 从缓存获取用户信息（减少数据库查询）
    const user = await getUserByPrivyId(userId);

    if (!user) {
      console.log('[SafeController] User not found in database for userId:', userId);
      return res.status(404).json({
        success: false,
        error: 'User not found',
      });
    }

    console.log('[SafeController] User found:', user.id, 'safeAddress:', user.safeAddress);

    // 如果有 Safe 地址，验证链上状态
    let safeAddress = user.safeAddress;
    let isDeployed = user.safeDeployed;
    let approvalsSet = user.safeApprovalsSet;
    let usdcBalance = 0;

    if (safeAddress) {
      // 检查链上部署状态
      const chainDeployed = await isSafeDeployed(safeAddress);
      if (chainDeployed !== isDeployed) {
        await updateSafeDeploymentStatus(user.id, chainDeployed);
        isDeployed = chainDeployed;
        // 清除用户缓存（状态已更新）
        invalidateUser(userId);
      }

      // 如果已部署，检查授权状态
      if (isDeployed) {
        const { allApproved } = await checkTokenApprovals(safeAddress);
        if (allApproved !== approvalsSet) {
          await updateSafeApprovalsStatus(user.id, allApproved);
          approvalsSet = allApproved;
          // 清除用户缓存（状态已更新）
          invalidateUser(userId);
        }

        // 获取 USDC 余额
        usdcBalance = await getSafeUSDCBalance(safeAddress);
      }
    }

    const response = {
      success: true,
      data: {
        safeAddress,
        isDeployed,
        approvalsSet,
        usdcBalance,
        eoaAddress: user.walletAddress,
      },
    };
    console.log('[SafeController] Returning response:', JSON.stringify(response));
    return res.json(response);
  } catch (error) {
    console.error('[SafeController] Get Safe info error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to get Safe info',
    });
  }
}

/**
 * 保存前端派生的 Safe 地址
 * POST /api/polymarket/trading/save-safe-address
 *
 * 前端使用 RelayerClient 派生 Safe 地址后调用此接口保存
 */
export async function saveSafeAddress(req, res) {
  try {
    const userId = req.privyUser?.userId;
    const { safeAddress } = req.body;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
    }

    if (!safeAddress) {
      return res.status(400).json({
        success: false,
        error: 'Safe address is required',
      });
    }

    // 从缓存获取用户
    const user = await getUserByPrivyId(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
      });
    }

    // 保存 Safe 地址
    await saveUserSafeAddress(user.id, safeAddress);
    // 清除用户缓存（数据已更新）
    invalidateUser(userId);

    // 检查是否已部署
    const deployed = await isSafeDeployed(safeAddress);
    if (deployed) {
      await updateSafeDeploymentStatus(user.id, true);

      // 检查授权状态
      const { allApproved } = await checkTokenApprovals(safeAddress);
      if (allApproved) {
        await updateSafeApprovalsStatus(user.id, true);
      }
    }

    return res.json({
      success: true,
      safeAddress,
      isDeployed: deployed,
      message: 'Safe address saved',
    });
  } catch (error) {
    console.error('[SafeController] Save Safe address error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to save Safe address',
    });
  }
}

/**
 * 更新 Safe 部署状态 (前端部署后调用)
 * POST /api/polymarket/trading/update-safe-deployed
 */
export async function updateSafeDeployed(req, res) {
  try {
    const userId = req.privyUser?.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
    }

    // 从缓存获取用户
    const user = await getUserByPrivyId(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
      });
    }

    if (!user.safeAddress) {
      return res.status(400).json({
        success: false,
        error: 'Safe address not found',
      });
    }

    // 验证链上状态
    const deployed = await isSafeDeployed(user.safeAddress);
    await updateSafeDeploymentStatus(user.id, deployed);
    // 清除用户缓存（状态已更新）
    invalidateUser(userId);

    return res.json({
      success: true,
      isDeployed: deployed,
    });
  } catch (error) {
    console.error('[SafeController] Update Safe deployed error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to update Safe deployed status',
    });
  }
}

/**
 * 更新 Safe 授权状态 (前端设置授权后调用)
 * POST /api/polymarket/trading/update-safe-approvals
 */
export async function updateSafeApprovals(req, res) {
  try {
    const userId = req.privyUser?.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
    }

    // 从缓存获取用户
    const user = await getUserByPrivyId(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
      });
    }

    if (!user.safeAddress) {
      return res.status(400).json({
        success: false,
        error: 'Safe address not found',
      });
    }

    if (!user.safeDeployed) {
      return res.status(400).json({
        success: false,
        error: 'Safe not deployed',
      });
    }

    // 验证链上授权状态
    const { allApproved, details } = await checkTokenApprovals(user.safeAddress);
    await updateSafeApprovalsStatus(user.id, allApproved);
    // 清除用户缓存（状态已更新）
    invalidateUser(userId);

    return res.json({
      success: true,
      approvalsSet: allApproved,
      details,
    });
  } catch (error) {
    console.error('[SafeController] Update Safe approvals error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to update Safe approvals status',
    });
  }
}

/**
 * 检查 Safe 授权状态
 * GET /api/polymarket/trading/safe-approvals
 */
export async function checkSafeApprovals(req, res) {
  try {
    const userId = req.privyUser?.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
    }

    // 从缓存获取用户
    const user = await getUserByPrivyId(userId);

    if (!user?.safeAddress) {
      return res.status(400).json({
        success: false,
        error: 'Safe address not found',
      });
    }

    const approvals = await checkTokenApprovals(user.safeAddress);

    return res.json({
      success: true,
      data: approvals,
    });
  } catch (error) {
    console.error('[SafeController] Check approvals error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to check approvals',
    });
  }
}

export default {
  getSafeInfo,
  saveSafeAddress,
  updateSafeDeployed,
  updateSafeApprovals,
  checkSafeApprovals,
};
