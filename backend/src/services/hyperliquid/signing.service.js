/**
 * Hyperliquid 签名服务
 * 实现正确的 EIP-712 签名格式
 * 参考: https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/exchange-endpoint
 */

import { ethers } from 'ethers';

/**
 * 创建 Hyperliquid 订单的 EIP-712 签名
 * @param {Object} action - 订单动作对象
 * @param {string} privateKey - 用户私钥
 * @param {boolean} isTestnet - 是否为测试网
 * @returns {Promise<Object>} 签名数据
 */
export const signL1Action = async (action, privateKey, isTestnet = true) => {
  try {
    const wallet = new ethers.Wallet(privateKey);
    const phantomAgent = { source: 'a', connectionId: ethers.constants.HashZero };
    
    // Hyperliquid EIP-712 域
    const domain = {
      name: 'HyperliquidSignTransaction',
      version: '1',
      chainId: isTestnet ? 421614 : 42161, // Arbitrum Sepolia (testnet) or Arbitrum One (mainnet)
      verifyingContract: '0x0000000000000000000000000000000000000000',
    };

    // 消息类型
    const types = {
      Agent: [
        { name: 'source', type: 'string' },
        { name: 'connectionId', type: 'bytes32' }
      ],
      HyperliquidTransaction: [
        { name: 'action', type: 'string' },
        { name: 'nonce', type: 'uint64' },
        { name: 'phantomAgent', type: 'Agent' }
      ]
    };

    // 构造消息
    const message = {
      action: JSON.stringify(action),
      nonce: Date.now(),
      phantomAgent
    };

    // 使用 EIP-712 签名
    const signature = await wallet._signTypedData(domain, types, message);
    
    return {
      r: signature.slice(0, 66),
      s: '0x' + signature.slice(66, 130),
      v: parseInt(signature.slice(130, 132), 16)
    };

  } catch (error) {
    console.error('Hyperliquid 签名错误:', error.message);
    throw new Error(`签名失败: ${error.message}`);
  }
};

/**
 * 简化的签名方法（用于普通消息签名）
 * @param {string} privateKey - 私钥
 * @param {Object} data - 要签名的数据
 * @returns {Promise<string>} 签名字符串
 */
export const signMessage = async (privateKey, data) => {
  try {
    const wallet = new ethers.Wallet(privateKey);
    const message = typeof data === 'string' ? data : JSON.stringify(data);
    return await wallet.signMessage(message);
  } catch (error) {
    console.error('消息签名错误:', error.message);
    throw new Error(`消息签名失败: ${error.message}`);
  }
};

/**
 * 构造 Hyperliquid 订单动作
 * @param {string} type - 动作类型 (order, cancel, modify, etc.)
 * @param {Object} payload - 动作载荷
 * @returns {Object} 动作对象
 */
export const buildAction = (type, payload) => {
  return {
    type,
    ...payload
  };
};

