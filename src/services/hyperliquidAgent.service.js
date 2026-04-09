/**
 * Hyperliquid Agent 授权服务（前端）
 * 使用 MetaMask 签名并在 Hyperliquid 平台上注册 Agent
 */

import { ethers } from 'ethers';

/**
 * 创建 Hyperliquid approveAgent 签名消息
 * @param {string} agentAddress - Agent 地址
 * @param {string} agentName - Agent 名称
 * @param {number} chainId - 实际的 chainId
 * @returns {Object} { domain, types, message }
 */
export const createApproveAgentMessage = (agentAddress, agentName = 'TradingAgent', chainId) => {
  const timestamp = Date.now();

  // ✅ 判断是否主网
  const isMainnet = chainId === 42161;
  const hyperliquidChainId = isMainnet ? 42161 : 421614;

  // ✅ Hyperliquid SDK 的标准 Domain
  const domain = {
    name: 'HyperliquidSignTransaction',
    version: '1',
    chainId: hyperliquidChainId,
    verifyingContract: '0x0000000000000000000000000000000000000000'
  };

  // ✅ Hyperliquid SDK 的标准类型定义（来自 signAgent 函数）
  const types = {
    'HyperliquidTransaction:ApproveAgent': [
      { name: 'hyperliquidChain', type: 'string' },
      { name: 'agentAddress', type: 'address' },
      { name: 'agentName', type: 'string' },
      { name: 'nonce', type: 'uint64' }
    ]
  };

  // ✅ Hyperliquid SDK 的标准 action 格式
  const action = {
    hyperliquidChain: isMainnet ? 'Mainnet' : 'Testnet',
    agentAddress: agentAddress,
    agentName: agentName,
    nonce: timestamp
  };

  return { 
    domain, 
    types, 
    message: action,  // ✅ message 就是 action，不需要嵌套
    primaryType: 'HyperliquidTransaction:ApproveAgent',
    action: action 
  };
};

/**
 * 使用 MetaMask 签名 Hyperliquid approveAgent
 * @param {Object} signer - ethers.js Signer (from MetaMask)
 * @param {string} agentAddress - Agent 地址
 * @param {string} agentName - Agent 名称
 * @param {number} chainId - 实际的 chainId
 * @returns {Promise<Object>} { signature, action }
 */
export const signApproveAgentWithMetaMask = async (
  signer,
  agentAddress,
  agentName = 'TradingAgent',
  chainId
) => {
  try {
    console.log('🔐 [Hyperliquid] 创建 approveAgent 签名（SDK 标准格式）...');
    console.log('   使用 chainId:', chainId);

    const { domain, types, message, primaryType, action } = createApproveAgentMessage(
      agentAddress,
      agentName,
      chainId
    );

    console.log('   Domain:', domain);
    console.log('   PrimaryType:', primaryType);
    console.log('   Message:', message);

    // ✅ 使用 SDK 标准格式签名
    const signature = await signer.signTypedData(domain, types, message);

    console.log('✅ [Hyperliquid] approveAgent 签名成功');
    
    // ✅ 构造完整的 action（包含 type 和 signatureChainId）
    const isMainnet = chainId === 42161;
    const signatureChainId = isMainnet ? '0xa4b1' : '0x66eee';
    
    const fullAction = {
      type: 'approveAgent',
      hyperliquidChain: action.hyperliquidChain,
      signatureChainId: signatureChainId,  // ✅ 添加这个字段
      agentAddress: action.agentAddress,
      agentName: action.agentName,
      nonce: action.nonce
    };
    
    console.log('   完整 action:', fullAction);
    
    return {
      signature: signature,
      action: fullAction,
      r: signature.slice(0, 66),
      s: '0x' + signature.slice(66, 130),
      v: parseInt(signature.slice(130, 132), 16)
    };

  } catch (error) {
    console.error('❌ [Hyperliquid] approveAgent 签名失败:', error);
    
    if (error.code === 'ACTION_REJECTED') {
      throw new Error('用户拒绝 Hyperliquid Agent 授权');
    }
    throw new Error(`Hyperliquid Agent 授权失败: ${error.message}`);
  }
};

/**
 * 使用 MetaMask 签名撤销 Agent（发送零地址的 approveAgent）
 * @param {Object} signer - ethers.js Signer (from MetaMask)
 * @param {string} agentName - Agent 名称（与创建时相同）
 * @param {number} chainId - 实际的 chainId
 * @returns {Promise<Object>} { signature, action }
 */
export const signRevokeAgentWithMetaMask = async (
  signer,
  agentName = '',
  chainId
) => {
  try {
    console.log('🔐 [Hyperliquid] 创建 revokeAgent 签名（使用零地址）...');
    console.log('   使用 chainId:', chainId);
    console.log('   Agent 名称:', agentName || '(unnamed)');

    // ✅ 使用零地址来撤销 agent
    const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

    const { domain, types, message, primaryType, action } = createApproveAgentMessage(
      ZERO_ADDRESS,  // 使用零地址
      agentName,     // 使用相同的名称（如果是命名 agent）
      chainId
    );

    console.log('   Domain:', domain);
    console.log('   PrimaryType:', primaryType);
    console.log('   Message:', message);

    // ✅ 使用 SDK 标准格式签名
    const signature = await signer.signTypedData(domain, types, message);

    console.log('✅ [Hyperliquid] revokeAgent 签名成功');

    // ✅ 构造完整的 action（包含 type 和 signatureChainId）
    const isMainnet = chainId === 42161;
    const signatureChainId = isMainnet ? '0xa4b1' : '0x66eee';

    const fullAction = {
      type: 'approveAgent',
      hyperliquidChain: action.hyperliquidChain,
      signatureChainId: signatureChainId,
      agentAddress: ZERO_ADDRESS,  // 零地址表示撤销
      agentName: action.agentName,
      nonce: action.nonce
    };

    console.log('   完整 action:', fullAction);

    return {
      signature: signature,
      action: fullAction,
      r: signature.slice(0, 66),
      s: '0x' + signature.slice(66, 130),
      v: parseInt(signature.slice(130, 132), 16)
    };

  } catch (error) {
    console.error('❌ [Hyperliquid] revokeAgent 签名失败:', error);

    if (error.code === 'ACTION_REJECTED') {
      throw new Error('用户拒绝撤销 Agent 授权');
    }
    throw new Error(`撤销 Agent 失败: ${error.message}`);
  }
};

