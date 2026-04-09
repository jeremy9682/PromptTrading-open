/**
 * Hyperliquid Agent 授权服务（已废弃）
 * 
 * ⚠️ 警告：该服务已废弃，不再支持服务器端注册 Agent
 * 所有 Agent 注册必须在前端完成，使用用户自己的主钱包签名
 * 
 * @deprecated 请使用前端直接与 Hyperliquid 交互
 */

import { Hyperliquid } from 'hyperliquid';
// import { getMainAccountAddress, getTestPrivateKey } from '../../config/hyperliquid.config.js'; // 已移除

/**
 * 使用 Hyperliquid SDK 在平台上注册 Agent（已废弃）
 * 
 * @deprecated 该方法已废弃，服务器不再存储私钥
 * @param {string} agentAddress - Agent 地址
 * @param {string} agentName - Agent 名称
 * @param {boolean} testnet - 是否测试网
 * @returns {Promise<Object>} 错误信息
 */
export const registerAgentOnHyperliquid = async (agentAddress, agentName = 'TradingAgent', testnet = true) => {
  console.error('❌ [废弃警告] registerAgentOnHyperliquid 已废弃');
  console.error('❌ 服务器不再支持注册 Agent，请在前端使用用户自己的钱包进行注册');
  
  return {
    success: false,
    error: '服务器不再支持注册 Agent。请在钱包管理页面使用您的主钱包创建 Agent Wallet。',
    errorCode: 'DEPRECATED_API',
    deprecated: true,
    message: 'Agent 注册必须在前端完成，使用用户自己的主钱包签名'
  }
};
