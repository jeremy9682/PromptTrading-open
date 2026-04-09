/**
 * 前端安全工具函数
 * 
 * 提供日志脱敏等安全相关功能
 */

/**
 * 脱敏钱包地址
 * 显示前6位和后4位，中间用*替代
 * 
 * @param {string} address - 完整钱包地址
 * @returns {string} 脱敏后的地址
 * 
 * @example
 * maskAddress('0x8888cf219403123cae59a7596093c354524f4cfd')
 * // => '0x8888****4cfd'
 */
export const maskAddress = (address) => {
  if (!address || typeof address !== 'string') {
    return '****';
  }
  
  if (address.length < 12) {
    return '****';
  }
  
  const prefix = address.slice(0, 6);
  const suffix = address.slice(-4);
  
  return `${prefix}****${suffix}`;
};

/**
 * 脱敏交易哈希
 * 显示前10位和后6位，中间用*替代
 * 
 * @param {string} txHash - 完整交易哈希
 * @returns {string} 脱敏后的哈希
 */
export const maskTxHash = (txHash) => {
  if (!txHash || typeof txHash !== 'string') {
    return '****';
  }
  
  if (txHash.length < 20) {
    return '****';
  }
  
  const prefix = txHash.slice(0, 10);
  const suffix = txHash.slice(-6);
  
  return `${prefix}****${suffix}`;
};

/**
 * 安全日志记录器
 * 
 * 🔒 前端日志始终脱敏敏感信息
 * 因为用户可以通过浏览器控制台查看所有前端日志
 */
export const safeLog = {
  info: (prefix, message, data) => {
    // 前端日志始终脱敏，保护用户隐私
    const safeData = data ? maskSensitiveData(data) : '';
    console.log(`${prefix} ${message}`, safeData);
  },
  
  warn: (prefix, message, data) => {
    const safeData = data ? maskSensitiveData(data) : '';
    console.warn(`${prefix} ${message}`, safeData);
  },
  
  error: (prefix, message, data) => {
    const safeData = data ? maskSensitiveData(data) : '';
    console.error(`${prefix} ${message}`, safeData);
  },
};

/**
 * 脱敏对象中的敏感数据
 */
const maskSensitiveData = (data) => {
  if (!data || typeof data !== 'object') {
    return data;
  }
  
  const sensitiveFields = [
    'address', 'walletAddress', 'payerAddress', 'receiverAddress',
    'from', 'to', 'recipient', 'sender', 'receiver',
  ];
  
  const txHashFields = ['txHash', 'transactionHash', 'hash'];
  
  const result = { ...data };
  
  for (const field of sensitiveFields) {
    if (result[field]) {
      result[field] = maskAddress(result[field]);
    }
  }
  
  for (const field of txHashFields) {
    if (result[field]) {
      result[field] = maskTxHash(result[field]);
    }
  }
  
  return result;
};

export default {
  maskAddress,
  maskTxHash,
  safeLog,
};














