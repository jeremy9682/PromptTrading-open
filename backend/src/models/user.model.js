/**
 * 用户模型（简化版，基于内存存储）
 * 生产环境应该使用 MongoDB 等数据库
 */

// 内存存储（开发/测试用）
const users = new Map();

/**
 * 用户数据结构
 * {
 *   walletAddress: string,
 *   createdAt: Date,
 *   freeQuota: number,
 *   paidQuota: number,
 *   isPaid: boolean,
 *   ownApiKey: { encrypted: string, enabled: boolean },
 *   stats: { totalTrades: number, totalProfit: number, winRate: number }
 * }
 */

/**
 * 创建新用户
 */
export const createUser = (walletAddress, options = {}) => {
  const user = {
    walletAddress: walletAddress.toLowerCase(),
    createdAt: new Date(),
    freeQuota: options.freeQuota !== undefined ? options.freeQuota : 5,
    paidQuota: options.paidQuota || 0,
    isPaid: options.isPaid || false,
    ownApiKey: options.ownApiKey || null,
    stats: {
      totalTrades: 0,
      totalProfit: 0,
      winRate: 0
    }
  };

  users.set(walletAddress.toLowerCase(), user);
  
  console.log('✅ 新用户创建:', walletAddress, '免费额度:', user.freeQuota);
  
  return user;
};

/**
 * 获取用户
 */
export const getUserByAddress = (walletAddress) => {
  return users.get(walletAddress.toLowerCase());
};

/**
 * 更新用户
 */
export const updateUser = (walletAddress, updates) => {
  const user = users.get(walletAddress.toLowerCase());
  if (!user) {
    return null;
  }

  const updated = { ...user, ...updates };
  users.set(walletAddress.toLowerCase(), updated);
  
  return updated;
};

/**
 * 扣减额度
 */
export const decrementQuota = (walletAddress) => {
  const user = users.get(walletAddress.toLowerCase());
  if (!user) {
    return false;
  }

  if (user.freeQuota > 0) {
    user.freeQuota -= 1;
    console.log(`💳 ${walletAddress} 免费额度剩余: ${user.freeQuota}`);
  } else if (user.paidQuota > 0) {
    user.paidQuota -= 1;
    console.log(`💳 ${walletAddress} 付费额度剩余: ${user.paidQuota}`);
  } else {
    return false;
  }

  users.set(walletAddress.toLowerCase(), user);
  return true;
};

/**
 * 增加额度（充值）
 */
export const addQuota = (walletAddress, amount, type = 'paid') => {
  const user = users.get(walletAddress.toLowerCase());
  if (!user) {
    return null;
  }

  if (type === 'paid') {
    user.paidQuota += amount;
  } else {
    user.freeQuota += amount;
  }

  users.set(walletAddress.toLowerCase(), user);
  
  console.log(`💰 ${walletAddress} 充值 ${amount} 次 (${type})`);
  
  return user;
};

/**
 * 更新统计数据
 */
export const updateStats = (walletAddress, stats) => {
  const user = users.get(walletAddress.toLowerCase());
  if (!user) {
    return null;
  }

  user.stats = { ...user.stats, ...stats };
  users.set(walletAddress.toLowerCase(), user);
  
  return user;
};

/**
 * 获取所有用户（管理用）
 */
export const getAllUsers = () => {
  return Array.from(users.values());
};

/**
 * 删除用户
 */
export const deleteUser = (walletAddress) => {
  return users.delete(walletAddress.toLowerCase());
};

/**
 * 清空所有用户（测试用）
 */
export const clearAllUsers = () => {
  users.clear();
  console.log('🧹 已清空所有用户数据');
};

// 导出用户存储（用于持久化，可选）
export const getUsersMap = () => users;

