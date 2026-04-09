/**
 * 用户路由
 * 用户额度管理、API Key设置、委托授权等
 */

import express from 'express';
import {
  getQuota,
  recharge,
  setApiKey,
  getStats,
  test
} from '../controllers/user.controller.js';
import {
  getDelegationStatus,
  enableDelegation,
  disableDelegation,
  updateAutoTradeSettings,
  getAutoTradeHistory,
} from '../controllers/delegation.controller.js';
import { requirePrivyAuth } from '../middleware/privyAuth.middleware.js';

const router = express.Router();

// 用户额度管理
router.get('/quota', getQuota);           // 获取额度
router.post('/recharge', recharge);       // 充值额度

// API Key 管理
router.post('/set-api-key', setApiKey);   // 设置自有 API Key

// 用户统计
router.get('/stats', getStats);           // 获取统计数据

// Delegation (委托授权) - 需要 Privy 认证
router.get('/delegation-status', requirePrivyAuth, getDelegationStatus);   // 获取委托状态
router.post('/enable-delegation', requirePrivyAuth, enableDelegation);     // 启用委托
router.post('/disable-delegation', requirePrivyAuth, disableDelegation);   // 撤销委托

// Auto Trade (自动交易) - 需要 Privy 认证
router.post('/auto-trade-settings', requirePrivyAuth, updateAutoTradeSettings);  // 更新自动交易设置
router.get('/auto-trade-history', requirePrivyAuth, getAutoTradeHistory);        // 获取自动交易历史

// 测试接口
router.get('/test', test);

export default router;

