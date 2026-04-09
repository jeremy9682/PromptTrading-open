/**
 * 用户控制器
 * 处理用户额度管理、API Key等
 */

import {
  getUserByAddress,
  createUser,
  updateUser,
  addQuota,
  updateStats
} from '../models/user.model.js';

/**
 * 获取用户额度信息
 */
export const getQuota = async (req, res) => {
  try {
    const { address } = req.query;

    if (!address) {
      return res.status(400).json({
        success: false,
        error: '缺少参数: address'
      });
    }

    let user = getUserByAddress(address);
    
    // 新用户，自动创建
    if (!user) {
      user = createUser(address, { freeQuota: 5 });
    }

    res.json({
      success: true,
      data: {
        address: user.walletAddress,
        freeQuota: user.freeQuota,
        paidQuota: user.paidQuota,
        totalQuota: user.freeQuota + user.paidQuota,
        isPaid: user.isPaid,
        hasOwnApiKey: !!user.ownApiKey,
        createdAt: user.createdAt
      }
    });

  } catch (error) {
    console.error('获取用户额度失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * 充值额度
 */
export const recharge = async (req, res) => {
  try {
    const { address, amount, txHash } = req.body;

    if (!address || !amount) {
      return res.status(400).json({
        success: false,
        error: '缺少参数: address, amount'
      });
    }

    // TODO: 验证支付交易（链上验证）
    // 这里简化处理，生产环境需要验证USDT转账

    let user = getUserByAddress(address);
    if (!user) {
      user = createUser(address, { freeQuota: 0 });
    }

    // 添加付费额度
    const updatedUser = addQuota(address, amount, 'paid');

    console.log(`💰 用户 ${address} 充值 ${amount} 次, 交易: ${txHash}`);

    res.json({
      success: true,
      data: {
        address: updatedUser.walletAddress,
        freeQuota: updatedUser.freeQuota,
        paidQuota: updatedUser.paidQuota,
        totalQuota: updatedUser.freeQuota + updatedUser.paidQuota
      }
    });

  } catch (error) {
    console.error('充值失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * 设置自有 API Key
 */
export const setApiKey = async (req, res) => {
  try {
    const { address, apiKey, encrypted } = req.body;

    if (!address || !apiKey) {
      return res.status(400).json({
        success: false,
        error: '缺少参数: address, apiKey'
      });
    }

    let user = getUserByAddress(address);
    if (!user) {
      user = createUser(address);
    }

    // 更新用户API Key
    const updatedUser = updateUser(address, {
      ownApiKey: {
        encrypted: encrypted || apiKey,  // 前端加密后的Key
        enabled: true
      }
    });

    console.log(`🔑 用户 ${address} 设置了自有 API Key`);

    res.json({
      success: true,
      data: {
        address: updatedUser.walletAddress,
        hasOwnApiKey: true,
        message: '设置成功，将使用您自己的 API Key'
      }
    });

  } catch (error) {
    console.error('设置 API Key 失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * 获取用户统计
 */
export const getStats = async (req, res) => {
  try {
    const { address } = req.query;

    if (!address) {
      return res.status(400).json({
        success: false,
        error: '缺少参数: address'
      });
    }

    const user = getUserByAddress(address);
    
    if (!user) {
      return res.json({
        success: true,
        data: {
          totalTrades: 0,
          totalProfit: 0,
          winRate: 0
        }
      });
    }

    res.json({
      success: true,
      data: user.stats
    });

  } catch (error) {
    console.error('获取用户统计失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * 测试接口
 */
export const test = (req, res) => {
  res.json({
    success: true,
    message: 'User controller working',
    endpoints: [
      'GET /api/user/quota?address=0x...',
      'POST /api/user/recharge',
      'POST /api/user/set-api-key',
      'GET /api/user/stats?address=0x...'
    ]
  });
};

