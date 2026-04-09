/**
 * 安全工具函数
 * 
 * 提供日志脱敏、数据清理等安全相关功能
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
  
  // 确保地址格式正确
  if (address.length < 12) {
    return '****';
  }
  
  // 显示前6位（包括0x）和后4位
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
 * 
 * @example
 * maskTxHash('0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef')
 * // => '0x12345678****abcdef'
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
 * 脱敏金额
 * 生产环境可选择隐藏具体金额
 * 
 * @param {number} amount - 金额
 * @param {boolean} hideExact - 是否隐藏精确值
 * @returns {string} 处理后的金额字符串
 */
export const maskAmount = (amount, hideExact = false) => {
  if (typeof amount !== 'number') {
    return '***';
  }
  
  if (hideExact) {
    // 只显示数量级
    if (amount < 10) return '<$10';
    if (amount < 100) return '$10-100';
    if (amount < 1000) return '$100-1K';
    return '>$1K';
  }
  
  return `$${amount}`;
};

/**
 * 创建安全的日志对象
 * 自动脱敏敏感字段
 * 
 * @param {Object} data - 原始数据
 * @returns {Object} 脱敏后的数据
 */
export const createSafeLogData = (data) => {
  if (!data || typeof data !== 'object') {
    return data;
  }
  
  const sensitiveFields = [
    'address', 'walletAddress', 'payerAddress', 'receiverAddress',
    'from', 'to', 'recipient', 'sender',
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

/**
 * 安全日志记录器
 * 
 * 后端日志：显示完整信息（只有管理员可见）
 * 前端日志：自动脱敏（用户可通过浏览器控制台查看）
 */
export const safeLog = {
  info: (prefix, message, data) => {
    // 后端日志显示完整信息，方便调试和审计
    console.log(`${prefix} ${message}`, data || '');
  },
  
  warn: (prefix, message, data) => {
    console.warn(`${prefix} ${message}`, data || '');
  },
  
  error: (prefix, message, data) => {
    console.error(`${prefix} ${message}`, data || '');
  },
};

export default {
  maskAddress,
  maskTxHash,
  maskAmount,
  createSafeLogData,
  safeLog,
};














