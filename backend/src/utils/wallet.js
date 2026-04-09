/**
 * Wallet Address Utilities
 * 
 * 统一处理钱包地址的规范化，确保整个系统中钱包地址格式一致。
 * 
 * 重要：以太坊地址不区分大小写（EIP-55 校验和是可选的），
 * 但数据库 UNIQUE 约束是大小写敏感的。
 * 因此我们统一将所有地址转为小写存储和查询。
 */

/**
 * 规范化以太坊钱包地址
 * - 去除首尾空白
 * - 转为小写
 * - 验证格式（可选）
 * 
 * @param {string} address - 原始钱包地址
 * @param {boolean} validate - 是否验证格式（默认 false）
 * @returns {string|null} 规范化后的地址，如果无效且 validate=true 则返回 null
 */
export function normalizeWalletAddress(address, validate = false) {
  if (!address || typeof address !== 'string') {
    return validate ? null : (address || 'unknown');
  }

  const trimmed = address.trim();
  
  if (!trimmed) {
    return validate ? null : 'unknown';
  }

  // 如果需要验证，检查以太坊地址格式
  if (validate) {
    const ethAddressRegex = /^0x[a-fA-F0-9]{40}$/;
    if (!ethAddressRegex.test(trimmed)) {
      return null;
    }
  }

  // 统一转为小写
  return trimmed.toLowerCase();
}

/**
 * 验证以太坊地址格式
 * 
 * @param {string} address - 钱包地址
 * @returns {boolean} 是否是有效的以太坊地址格式
 */
export function isValidEthAddress(address) {
  if (!address || typeof address !== 'string') {
    return false;
  }
  
  const ethAddressRegex = /^0x[a-fA-F0-9]{40}$/;
  return ethAddressRegex.test(address.trim());
}
