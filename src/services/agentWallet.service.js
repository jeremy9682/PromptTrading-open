/**
 * Agent Wallet 服务
 * 生成、管理、授权 Agent Wallet
 */

import { ethers } from 'ethers';
import { encryptWithAddress, decryptWithAddress } from './encryption.service';

const AGENT_STORAGE_KEY_PREFIX = 'hyperliquid_agent_wallet';
const AGENT_CONFIG_KEY = 'hyperliquid_agent_config';

/**
 * Get storage key for a specific chain
 * @param {number} chainId - Chain ID (42161 for mainnet, 421614 for testnet)
 * @returns {string} Storage key
 */
const getStorageKey = (chainId) => {
  if (!chainId) {
    // Fallback to old key for backwards compatibility
    return AGENT_STORAGE_KEY_PREFIX;
  }
  return `${AGENT_STORAGE_KEY_PREFIX}_${chainId}`;
};

/**
 * 生成随机 Agent Wallet
 * @returns {Object} { privateKey, address, wallet }
 */
export const generateAgentWallet = () => {
  try {
    const wallet = ethers.Wallet.createRandom();
    return {
      privateKey: wallet.privateKey,
      address: wallet.address,
      wallet: wallet
    };
  } catch (error) {
    console.error('生成 Agent Wallet 失败:', error);
    throw new Error('无法生成 Agent Wallet');
  }
};

/**
 * 创建 Agent 授权签名消息（用于 MetaMask 签名）
 * @param {string} agentAddress - Agent 钱包地址
 * @param {Object} permissions - 权限配置
 * @returns {Object} EIP-712 签名消息
 */
export const createAgentApprovalMessage = (agentAddress, permissions = {}) => {
  const timestamp = Date.now();
  const expirationTime = permissions.expirationTime || (timestamp + 24 * 60 * 60 * 1000); // 默认 24 小时

  // EIP-712 Domain
  const domain = {
    name: 'PromptTrading Agent Authorization',
    version: '1',
    chainId: permissions.chainId || 42161, // Arbitrum One (或 421614 for testnet)
  };

  // Agent 授权类型
  const types = {
    AgentApproval: [
      { name: 'agentAddress', type: 'address' },
      { name: 'maxOrderSize', type: 'uint256' },
      { name: 'expirationTime', type: 'uint256' },
      { name: 'nonce', type: 'uint256' }
    ]
  };

  // 授权消息
  const message = {
    agentAddress: agentAddress,
    maxOrderSize: ethers.parseUnits(
      (permissions.maxOrderSize || 1000).toString(),
      6
    ).toString(), // USDT 有 6 位小数
    expirationTime: Math.floor(expirationTime / 1000), // Unix 时间戳（秒）
    nonce: timestamp
  };

  return { domain, types, message };
};

/**
 * 使用 MetaMask 签名授权 Agent
 * @param {Object} signer - ethers.js Signer (from MetaMask)
 * @param {string} agentAddress - Agent 地址
 * @param {Object} permissions - 权限配置
 * @returns {Promise<Object>} { signature, signedPermissions } - 签名和完整的 permissions（包含 nonce）
 */
export const approveAgentWithMetaMask = async (signer, agentAddress, permissions = {}) => {
  try {
    const { domain, types, message } = createAgentApprovalMessage(agentAddress, permissions);

    // 使用 EIP-712 签名
    const signature = await signer.signTypedData(domain, types, message);

    console.log('✅ Agent 授权签名成功:', signature);
    
    // 返回签名和完整的 permissions（包含 nonce）
    return {
      signature,
      signedPermissions: {
        maxOrderSize: permissions.maxOrderSize || 1000,
        expirationTime: permissions.expirationTime || (Date.now() + 24 * 60 * 60 * 1000),
        chainId: permissions.chainId || 42161,
        nonce: message.nonce // ✅ 包含签名时使用的 nonce
      }
    };

  } catch (error) {
    console.error('❌ Agent 授权签名失败:', error);
    
    if (error.code === 'ACTION_REJECTED') {
      throw new Error('用户拒绝签名授权');
    }
    throw new Error(`授权失败: ${error.message}`);
  }
};

/**
 * 保存 Agent 到 sessionStorage（加密）
 * @param {string} privateKey - Agent 私钥
 * @param {string} agentAddress - Agent 地址
 * @param {string} userAddress - 用户主钱包地址（用于加密）
 * @param {Object} permissions - 权限配置
 * @param {string} approvalSignature - 授权签名
 * @param {string} agentName - Agent 名称（可选，用于撤销）
 */
export const saveAgent = async (privateKey, agentAddress, userAddress, permissions, approvalSignature, agentName = '') => {
  try {
    // 加密私钥
    const encryptedPrivateKey = await encryptWithAddress(privateKey, userAddress);

    const chainId = permissions.chainId || 42161;
    const agentData = {
      address: agentAddress,
      encryptedPrivateKey: encryptedPrivateKey,
      mainWallet: userAddress,
      createdAt: Date.now(),
      approvalSignature: approvalSignature,
      agentName: agentName, // ✅ 保存 agent 名称用于撤销
      permissions: {
        maxOrderSize: permissions.maxOrderSize || 1000,
        expirationTime: permissions.expirationTime || (Date.now() + 24 * 60 * 60 * 1000),
        chainId: chainId,
        nonce: permissions.nonce  // ✅ 保存 nonce 用于后端验证
      }
    };

    // 保存到 sessionStorage (使用链特定的 key)
    const storageKey = getStorageKey(chainId);
    sessionStorage.setItem(storageKey, JSON.stringify(agentData));

    console.log(`✅ Agent 已保存到 sessionStorage (${storageKey})`);
    return agentData;

  } catch (error) {
    console.error('❌ 保存 Agent 失败:', error);
    throw new Error('无法保存 Agent');
  }
};

/**
 * 获取当前 Agent
 * @param {number} currentChainId - 当前钱包的 chainId（必需，用于获取正确的 Agent）
 * @returns {Object|null} Agent 数据或 null
 */
export const getCurrentAgent = (currentChainId = null) => {
  try {
    // 使用链特定的存储 key
    const storageKey = getStorageKey(currentChainId);
    let agentDataStr = sessionStorage.getItem(storageKey);

    // 如果找不到，尝试旧的 key（向后兼容）
    if (!agentDataStr && currentChainId) {
      const oldKey = AGENT_STORAGE_KEY_PREFIX;
      agentDataStr = sessionStorage.getItem(oldKey);
      if (agentDataStr) {
        const oldData = JSON.parse(agentDataStr);
        // 只有当旧数据的 chainId 匹配时才使用
        if (oldData.permissions.chainId !== currentChainId) {
          console.log(`📝 Found agent for different chain (${oldData.permissions.chainId}), ignoring`);
          agentDataStr = null;
        } else {
          // 迁移到新的 key
          console.log(`📝 Migrating agent to chain-specific key: ${storageKey}`);
          sessionStorage.setItem(storageKey, agentDataStr);
          sessionStorage.removeItem(oldKey);
        }
      }
    }

    if (!agentDataStr) return null;

    const agentData = JSON.parse(agentDataStr);

    // 检查是否过期
    if (agentData.permissions.expirationTime < Date.now()) {
      console.warn('⚠️ Agent 已过期');
      clearAgent(currentChainId);
      return null;
    }

    return agentData;

  } catch (error) {
    console.error('❌ 读取 Agent 失败:', error);
    return null;
  }
};

/**
 * 获取 Agent 私钥（解密）
 * @param {string} userAddress - 用户主钱包地址
 * @param {number} currentChainId - 当前钱包的 chainId（可选）
 * @returns {Promise<string|null>} 解密后的私钥
 */
export const getAgentPrivateKey = async (userAddress, currentChainId = null) => {
  try {
    const agentData = getCurrentAgent(currentChainId);
    if (!agentData) return null;

    // 验证主钱包地址匹配
    if (agentData.mainWallet.toLowerCase() !== userAddress.toLowerCase()) {
      console.error('❌ Agent 与当前钱包不匹配');
      return null;
    }

    // 解密私钥
    const privateKey = await decryptWithAddress(agentData.encryptedPrivateKey, userAddress);
    return privateKey;

  } catch (error) {
    console.error('❌ 获取 Agent 私钥失败:', error);
    return null;
  }
};

/**
 * 清除 Agent（撤销）
 * @param {number} chainId - Chain ID (可选，如果不提供则清除所有)
 */
export const clearAgent = (chainId = null) => {
  if (chainId) {
    // 清除特定链的 Agent
    const storageKey = getStorageKey(chainId);
    sessionStorage.removeItem(storageKey);
    console.log(`✅ Agent 已清除 (${storageKey})`);
  } else {
    // 清除所有 Agent（包括旧格式）
    sessionStorage.removeItem(AGENT_STORAGE_KEY_PREFIX);
    sessionStorage.removeItem(getStorageKey(42161));  // mainnet
    sessionStorage.removeItem(getStorageKey(421614)); // testnet
    console.log('✅ 所有 Agent 已清除');
  }
};

/**
 * 检查 Agent 是否有效
 * @param {number} currentChainId - 当前钱包的 chainId（必需）
 * @returns {boolean}
 */
export const isAgentValid = (currentChainId) => {
  if (!currentChainId) {
    console.warn('⚠️ isAgentValid: chainId is required');
    return false;
  }
  const agent = getCurrentAgent(currentChainId);
  if (!agent) return false;

  // 检查过期时间
  return agent.permissions.expirationTime > Date.now();
};

/**
 * 验证订单是否符合 Agent 权限
 * @param {Object} order - 订单对象
 * @param {Object} agentData - Agent 数据
 * @param {number} currentChainId - 当前钱包的 chainId（可选）
 * @returns {Object} { valid: boolean, error: string }
 */
export const validateOrderPermissions = (order, agentData = null, currentChainId = null) => {
  const agent = agentData || getCurrentAgent(currentChainId);
  if (!agent) {
    return { valid: false, error: 'No active agent' };
  }

  const { permissions } = agent;

  // 1. 检查订单金额
  const orderValue = order.quantity * (order.limitPrice || order.price || 0);
  if (orderValue > permissions.maxOrderSize) {
    return {
      valid: false,
      error: `Order size $${orderValue} exceeds limit $${permissions.maxOrderSize}`
    };
  }

  // 2. 检查过期时间
  if (permissions.expirationTime < Date.now()) {
    return { valid: false, error: 'Agent has expired' };
  }

  return { valid: true };
};

/**
 * 格式化 Agent 信息（用于 UI 显示和 API 调用）
 * @param {Object} agentData - Agent 数据
 * @param {number} currentChainId - 当前钱包的 chainId（可选，用于验证）
 * @returns {Object} 格式化的信息（包含原始数据）
 */
export const formatAgentInfo = (agentData, currentChainId = null) => {
  if (!agentData) return null;
  
  // 如果提供了 chainId，验证是否匹配
  if (currentChainId && agentData.permissions.chainId !== currentChainId) {
    console.warn(`⚠️ Agent 网络不匹配，不显示`);
    return null;
  }

  const now = Date.now();
  const timeLeft = agentData.permissions.expirationTime - now;
  const hoursLeft = Math.floor(timeLeft / (1000 * 60 * 60));
  const minutesLeft = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));

  return {
    // ✅ 原始数据（用于 API 调用）
    address: agentData.address,
    approvalSignature: agentData.approvalSignature,
    permissions: agentData.permissions,
    mainWallet: agentData.mainWallet,

    // 格式化数据（用于 UI 显示）
    shortAddress: `${agentData.address.slice(0, 6)}...${agentData.address.slice(-4)}`,
    createdAt: new Date(agentData.createdAt).toLocaleString(),
    maxOrderSize: `$${agentData.permissions.maxOrderSize}`,
    expiresIn: `${hoursLeft}h ${minutesLeft}m`,
    isExpired: timeLeft <= 0,
    isExpiringSoon: timeLeft < 60 * 60 * 1000 // < 1 hour
  };
};

