/**
 * Agent Wallet 验证服务
 * 验证 Agent 授权签名的有效性
 */

import { ethers } from 'ethers';

/**
 * 验证 Agent 授权签名
 * @param {Object} agentData - 前端传来的 Agent 数据
 * @param {string} mainWalletAddress - 主钱包地址
 * @returns {Object} { valid: boolean, error?: string }
 */
export const verifyAgentAuthorization = async (agentData, mainWalletAddress) => {
  try {
    const { address: agentAddress, approvalSignature, permissions } = agentData;

    console.log('🔍 [验证] 开始验证 Agent 授权...');
    console.log('🔍 [验证] Agent 地址:', agentAddress);
    console.log('🔍 [验证] 主钱包地址:', mainWalletAddress);
    console.log('🔍 [验证] Permissions:', JSON.stringify(permissions, null, 2));

    // 1. 检查必需字段
    if (!agentAddress || !approvalSignature || !permissions) {
      console.error('❌ [验证] 缺少必需字段');
      return { valid: false, error: 'Missing required agent data' };
    }

    // 2. 检查过期时间
    if (permissions.expirationTime < Date.now()) {
      console.error('❌ [验证] Agent 已过期');
      return { valid: false, error: 'Agent has expired' };
    }

    // 3. 重建授权消息（必须与前端完全一致）
    const domain = {
      name: 'PromptTrading Agent Authorization',
      version: '1',
      chainId: permissions.chainId || 42161,
    };

    const types = {
      AgentApproval: [
        { name: 'agentAddress', type: 'address' },
        { name: 'maxOrderSize', type: 'uint256' },
        { name: 'expirationTime', type: 'uint256' },
        { name: 'nonce', type: 'uint256' }
      ]
    };

    // 兼容 ethers v5 和 v6
    const parseUnits = ethers.parseUnits || ethers.utils?.parseUnits;
    const verifyTypedData = ethers.verifyTypedData || ethers.utils?.verifyTypedData;

    const message = {
      agentAddress: agentAddress,
      maxOrderSize: parseUnits(
        (permissions.maxOrderSize || 1000).toString(),
        6
      ).toString(),
      expirationTime: Math.floor(permissions.expirationTime / 1000),
      nonce: permissions.nonce || Math.floor(permissions.expirationTime - 24 * 60 * 60 * 1000)
    };

    console.log('🔍 [验证] 重建的消息:', JSON.stringify(message, null, 2));

    // 4. 恢复签名者地址（兼容 ethers v5/v6）
    const recoveredAddress = verifyTypedData(
      domain,
      types,
      message,
      approvalSignature
    );

    console.log('🔍 [验证] 恢复的签名者地址:', recoveredAddress);

    // 5. 验证签名者是否为主钱包地址
    if (recoveredAddress.toLowerCase() !== mainWalletAddress.toLowerCase()) {
      console.error('❌ [验证] 签名者地址不匹配!');
      console.error(`   期望: ${mainWalletAddress}`);
      console.error(`   实际: ${recoveredAddress}`);
      return { 
        valid: false, 
        error: `Invalid signature: expected ${mainWalletAddress}, got ${recoveredAddress}` 
      };
    }

    console.log('✅ Agent 授权验证成功');
    return { valid: true };

  } catch (error) {
    console.error('❌ Agent 授权验证失败:', error);
    return { valid: false, error: error.message };
  }
};

/**
 * 验证订单是否符合 Agent 权限
 * @param {Object} order - 订单对象
 * @param {Object} agentData - Agent 数据
 * @returns {Object} { valid: boolean, error?: string }
 */
export const verifyOrderPermissions = (order, agentData) => {
  try {
    const { permissions } = agentData;

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

  } catch (error) {
    console.error('❌ 订单权限验证失败:', error);
    return { valid: false, error: error.message };
  }
};

/**
 * 批量验证订单权限
 * @param {Array} orders - 订单数组
 * @param {Object} agentData - Agent 数据
 * @returns {Object} { valid: boolean, invalidOrders: Array, error?: string }
 */
export const verifyBatchOrderPermissions = (orders, agentData) => {
  const invalidOrders = [];

  for (let i = 0; i < orders.length; i++) {
    const order = orders[i];
    const result = verifyOrderPermissions(order, agentData);
    
    if (!result.valid) {
      invalidOrders.push({
        index: i,
        coin: order.coin,
        error: result.error
      });
    }
  }

  if (invalidOrders.length > 0) {
    return {
      valid: false,
      invalidOrders,
      error: `${invalidOrders.length} order(s) failed permission check`
    };
  }

  return { valid: true, invalidOrders: [] };
};

