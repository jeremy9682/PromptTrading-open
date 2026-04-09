/**
 * Privy Signer Service
 *
 * 实现一个兼容 ethers Signer 接口的类，
 * 让 ClobClient 可以使用 Privy Server SDK 进行签名
 *
 * 核心功能:
 * - 实现 getAddress() 方法
 * - 实现 _signTypedData() 方法 (ClobClient 内部调用)
 * - 实现 signMessage() 方法 (某些场景需要)
 *
 * 参考: https://docs.privy.io/guide/server/wallets/delegated-actions
 */

import { signTypedData, signMessage, checkDelegationStatus } from './privy-signing.service.js';

/**
 * PrivySigner - 实现 ethers Signer 接口
 *
 * 让 ClobClient 可以使用 Privy 进行后端代签
 */
export class PrivySigner {
  /**
   * @param {string} privyUserId - Privy 用户 ID
   * @param {string} walletAddress - 用户的钱包地址 (EOA)
   */
  constructor(privyUserId, walletAddress) {
    this.privyUserId = privyUserId;
    this.walletAddress = walletAddress;

    console.log('[PrivySigner] Created for user:', privyUserId, 'wallet:', walletAddress);
  }

  /**
   * 获取钱包地址
   * ClobClient 会调用这个方法
   *
   * @returns {Promise<string>} 钱包地址
   */
  async getAddress() {
    console.log('[PrivySigner] getAddress() called, returning:', this.walletAddress);
    return this.walletAddress;
  }

  /**
   * EIP-712 签名
   * ClobClient 内部会调用这个方法来签名订单
   *
   * @param {object} domain - EIP-712 domain
   * @param {object} types - EIP-712 types
   * @param {object} value - 要签名的数据
   * @returns {Promise<string>} 签名
   */
  async _signTypedData(domain, types, value) {
    console.log('[PrivySigner] _signTypedData() called');
    console.log('[PrivySigner] Domain:', JSON.stringify(domain));
    console.log('[PrivySigner] Types:', JSON.stringify(Object.keys(types)));
    console.log('[PrivySigner] Value keys:', Object.keys(value));

    // 检查用户是否已授权委托
    const { isDelegated } = await checkDelegationStatus(this.privyUserId);
    if (!isDelegated) {
      console.error('[PrivySigner] User has not enabled delegation');
      throw new Error('用户未授权自动交易。请先在设置中开启 Session Signer。');
    }

    // 移除 EIP712Domain (Privy API 不需要)
    const { EIP712Domain, ...typesWithoutDomain } = types;

    // 确定 primaryType
    // ClobClient 签名订单时，primaryType 通常是 'Order'
    const primaryType = Object.keys(typesWithoutDomain)[0] || 'Order';

    const typedData = {
      domain: domain,
      types: typesWithoutDomain,
      primaryType: primaryType,
      message: value,
    };

    console.log('[PrivySigner] Calling Privy signTypedData...');
    console.log('[PrivySigner] TypedData primaryType:', primaryType);

    try {
      const signature = await signTypedData(
        this.privyUserId,
        this.walletAddress,
        typedData
      );

      console.log('[PrivySigner] Signature obtained successfully');
      console.log('[PrivySigner] Signature length:', signature.length);

      return signature;
    } catch (error) {
      console.error('[PrivySigner] signTypedData failed:', error);
      throw new Error(`Privy 签名失败: ${error.message}`);
    }
  }

  /**
   * 普通消息签名
   * 某些场景可能需要 (如 API Key 创建)
   *
   * @param {string} message - 要签名的消息
   * @returns {Promise<string>} 签名
   */
  async signMessage(message) {
    console.log('[PrivySigner] signMessage() called');
    console.log('[PrivySigner] Message preview:', message.substring(0, 100) + '...');

    // 检查用户是否已授权委托
    const { isDelegated } = await checkDelegationStatus(this.privyUserId);
    if (!isDelegated) {
      console.error('[PrivySigner] User has not enabled delegation');
      throw new Error('用户未授权自动交易。请先在设置中开启 Session Signer。');
    }

    try {
      const signature = await signMessage(
        this.privyUserId,
        this.walletAddress,
        message
      );

      console.log('[PrivySigner] Message signature obtained');
      return signature;
    } catch (error) {
      console.error('[PrivySigner] signMessage failed:', error);
      throw new Error(`Privy 消息签名失败: ${error.message}`);
    }
  }

  /**
   * 获取 provider (ClobClient 可能需要)
   * 返回 null，因为我们不需要实际的 provider
   */
  get provider() {
    return null;
  }
}

/**
 * 创建 PrivySigner 实例
 *
 * @param {string} privyUserId - Privy 用户 ID
 * @param {string} walletAddress - 钱包地址
 * @returns {PrivySigner}
 */
export function createPrivySigner(privyUserId, walletAddress) {
  return new PrivySigner(privyUserId, walletAddress);
}

export default {
  PrivySigner,
  createPrivySigner,
};
