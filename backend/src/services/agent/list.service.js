/**
 * Agent 列表服务
 * 从 Hyperliquid 读取用户已授权的 Agent
 */

import { Hyperliquid } from 'hyperliquid';

/**
 * 获取用户在 Hyperliquid 上已授权的 Agent 列表
 * @param {string} userAddress - 用户钱包地址
 * @param {boolean} testnet - 是否测试网
 * @returns {Promise<Array>} Agent 列表
 */
export const getUserAgents = async (userAddress, testnet = true) => {
  try {
    console.log('[Agent 列表] 获取用户 Agent:', userAddress);

    // 创建 Hyperliquid SDK 客户端（不需要私钥，只读取信息）
    const client = new Hyperliquid({
      testnet: testnet,
      enableWs: false,
      disableAssetMapRefresh: true  // 🔧 禁用自动刷新，避免网络错误
    });

    await client.connect();

    // 调用 SDK 的 extraAgents 方法
    const agents = await client.info.extraAgents(userAddress);

    console.log('[Agent 列表] 找到', agents.length, '个 Agent');
    
    if (agents.length > 0) {
      agents.forEach((agent, index) => {
        console.log(`  ${index + 1}. ${agent.name} (${agent.address})`);
        console.log(`     有效期至: ${new Date(agent.validUntil).toLocaleString()}`);
      });
    }

    return agents.map(agent => ({
      address: agent.address,
      name: agent.name,
      validUntil: agent.validUntil,
      isExpired: agent.validUntil < Date.now()
    }));

  } catch (error) {
    console.error('[Agent 列表] 获取失败:', error.message);
    return [];
  }
};

/**
 * 检查特定 Agent 是否已授权
 * @param {string} userAddress - 用户钱包地址
 * @param {string} agentAddress - Agent 地址
 * @param {boolean} testnet - 是否测试网
 * @returns {Promise<boolean>} 是否已授权
 */
export const isAgentAuthorized = async (userAddress, agentAddress, testnet = true) => {
  try {
    const agents = await getUserAgents(userAddress, testnet);
    const found = agents.find(a => a.address.toLowerCase() === agentAddress.toLowerCase());
    
    if (found) {
      const isValid = !found.isExpired;
      console.log(`[Agent 检查] Agent ${agentAddress} ${isValid ? '已授权' : '已过期'}`);
      return isValid;
    }
    
    console.log(`[Agent 检查] Agent ${agentAddress} 未授权`);
    return false;
  } catch (error) {
    console.error('[Agent 检查] 检查失败:', error.message);
    return false;
  }
};

