/**
 * Safe Relayer Service (Backend)
 *
 * 后端服务用于：
 * - 从数据库获取用户的 Safe 状态
 * - 验证 Safe 部署和授权状态
 * - 查询 Safe USDC 余额
 *
 * 注意：Safe 的实际部署和授权由前端通过 @polymarket/builder-relayer-client 完成
 */

import prisma from '../lib/prisma.js';
import { ethers } from 'ethers';
import { invalidateByUserId } from './user-cache.service.js';

// Polygon 官方 RPC 端点
const POLYGON_RPC = process.env.POLYGON_RPC_URL || 'https://polygon-rpc.com';

// USDC.e Contract on Polygon
// 注意：Polymarket 只支持 USDC.e (bridged)，不支持 Native USDC
const USDC_CONTRACT = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174';

// Polymarket Contract Addresses
const CTF_CONTRACT_ADDRESS = '0x4d97dcd97ec945f40cf65f87097ace5ea0476045';
const CTF_EXCHANGE_ADDRESS = '0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E';
const NEG_RISK_CTF_EXCHANGE_ADDRESS = '0xC5d563A36AE78145C45a50134d48A1215220f80a';
const NEG_RISK_ADAPTER_ADDRESS = '0xd91E80cF2E7be2e162c6513ceD06f1dD0dA35296';

/**
 * 获取用户的 Safe 信息（从数据库）
 *
 * @param {number} userId - 数据库用户 ID
 * @returns {Promise<Object|null>} Safe 信息
 */
export async function getUserSafeInfo(userId) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        safeAddress: true,
        safeDeployed: true,
        safeApprovalsSet: true,
      },
    });

    if (!user || !user.safeAddress) {
      return null;
    }

    return {
      safeAddress: user.safeAddress,
      isDeployed: user.safeDeployed || false,
      approvalsSet: user.safeApprovalsSet || false,
    };
  } catch (error) {
    console.error('[SafeRelayer] Error getting user Safe info:', error);
    return null;
  }
}

/**
 * 检查 Safe 是否已部署（链上检查）
 *
 * @param {string} safeAddress - Safe 地址
 * @returns {Promise<boolean>}
 */
export async function isSafeDeployed(safeAddress) {
  try {
    // ethers v5 使用 ethers.providers.JsonRpcProvider
    const provider = new ethers.providers.JsonRpcProvider(POLYGON_RPC);
    const code = await provider.getCode(safeAddress);
    return code !== '0x' && code.length > 2;
  } catch (error) {
    console.error('[SafeRelayer] Error checking Safe deployment:', error);
    return false;
  }
}

/**
 * 获取 Safe 的 USDC.e 余额
 * 注意：Polymarket 只支持 USDC.e (bridged)，不支持 Native USDC
 *
 * @param {string} safeAddress - Safe 地址
 * @returns {Promise<number>} USDC.e 余额
 */
export async function getSafeUSDCBalance(safeAddress) {
  try {
    // ethers v5 使用 ethers.providers.JsonRpcProvider
    const provider = new ethers.providers.JsonRpcProvider(POLYGON_RPC);
    const usdcContract = new ethers.Contract(
      USDC_CONTRACT,
      ['function balanceOf(address) view returns (uint256)'],
      provider
    );
    const balance = await usdcContract.balanceOf(safeAddress);
    const balanceNumber = Number(balance) / 1e6; // USDC has 6 decimals
    
    console.log('[SafeRelayer] USDC.e balance for', safeAddress, ':', balanceNumber);
    
    return balanceNumber;
  } catch (error) {
    console.error('[SafeRelayer] Error getting Safe USDC.e balance:', error);
    return 0;
  }
}

/**
 * 检查 Token 授权状态
 * 检查 Safe 是否已授权 USDC 给 Polymarket 合约
 *
 * @param {string} safeAddress - Safe 地址
 * @returns {Promise<Object>} 授权状态
 */
export async function checkTokenApprovals(safeAddress) {
  try {
    // ethers v5 使用 ethers.providers.JsonRpcProvider
    const provider = new ethers.providers.JsonRpcProvider(POLYGON_RPC);
    const usdcContract = new ethers.Contract(
      USDC_CONTRACT,
      ['function allowance(address owner, address spender) view returns (uint256)'],
      provider
    );

    // 检查 USDC 授权给各个 Polymarket 合约
    const spenders = [
      CTF_CONTRACT_ADDRESS,
      CTF_EXCHANGE_ADDRESS,
      NEG_RISK_CTF_EXCHANGE_ADDRESS,
      NEG_RISK_ADAPTER_ADDRESS,
    ];

    const results = {};
    let allApproved = true;

    for (const spender of spenders) {
      const allowance = await usdcContract.allowance(safeAddress, spender);
      // ethers v5 返回 BigNumber，使用 .gt(0) 判断
      const approved = allowance.gt(0);
      results[spender] = approved;
      if (!approved) {
        allApproved = false;
      }
    }

    return {
      allApproved,
      details: results,
    };
  } catch (error) {
    console.error('[SafeRelayer] Error checking token approvals:', error);
    return {
      allApproved: false,
      details: {},
      error: error.message,
    };
  }
}

/**
 * 更新用户的 Safe 地址
 *
 * @param {number} userId - 数据库用户 ID
 * @param {string} safeAddress - Safe 地址
 */
export async function saveSafeAddress(userId, safeAddress) {
  try {
    await prisma.user.update({
      where: { id: userId },
      data: {
        safeAddress,
        safeDeployed: false,
        safeApprovalsSet: false,
      },
    });
    // 清除用户缓存（数据已更新）
    invalidateByUserId(userId);
    console.log(`[SafeRelayer] Saved Safe address for user ${userId}: ${safeAddress}`);
  } catch (error) {
    console.error('[SafeRelayer] Error saving Safe address:', error);
    throw error;
  }
}

/**
 * 更新 Safe 部署状态
 *
 * @param {number} userId - 数据库用户 ID
 * @param {boolean} isDeployed - 是否已部署
 */
export async function updateSafeDeployedStatus(userId, isDeployed) {
  try {
    await prisma.user.update({
      where: { id: userId },
      data: { safeDeployed: isDeployed },
    });
    // 清除用户缓存（数据已更新）
    invalidateByUserId(userId);
    console.log(`[SafeRelayer] Updated Safe deployment status for user ${userId}: ${isDeployed}`);
  } catch (error) {
    console.error('[SafeRelayer] Error updating Safe deployment status:', error);
    throw error;
  }
}

/**
 * 更新 Safe 授权状态
 *
 * @param {number} userId - 数据库用户 ID
 * @param {boolean} approvalsSet - 是否已授权
 */
export async function updateSafeApprovalsStatus(userId, approvalsSet) {
  try {
    await prisma.user.update({
      where: { id: userId },
      data: { safeApprovalsSet: approvalsSet },
    });
    // 清除用户缓存（数据已更新）
    invalidateByUserId(userId);
    console.log(`[SafeRelayer] Updated Safe approvals status for user ${userId}: ${approvalsSet}`);
  } catch (error) {
    console.error('[SafeRelayer] Error updating Safe approvals status:', error);
    throw error;
  }
}

// Aliases for controller compatibility
export const saveUserSafeAddress = saveSafeAddress;
export const updateSafeDeploymentStatus = updateSafeDeployedStatus;

export default {
  getUserSafeInfo,
  isSafeDeployed,
  getSafeUSDCBalance,
  checkTokenApprovals,
  saveSafeAddress,
  saveUserSafeAddress,
  updateSafeDeployedStatus,
  updateSafeDeploymentStatus,
  updateSafeApprovalsStatus,
};
