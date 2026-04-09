/**
 * Polymarket Trading Routes
 *
 * API Key存储和交易相关路由
 * Safe 钱包管理路由 (Gasless)
 *
 * 架构说明 (参考 https://github.com/ayv8er/polymarket-safe-trader):
 * - 前端使用 @polymarket/builder-relayer-client 进行 Safe 部署和授权
 * - 后端只负责存储状态和检查链上数据
 */

import express from 'express';
import {
  getApiKey,
  saveApiKey,
  deleteApiKey,
  checkApiKey,
  createCredentials,
  recordOrder,
  getOrderHistory,
  getPositions,
} from '../controllers/polymarket-trading.controller.js';
import {
  getSafeInfo,
  saveSafeAddress,
  updateSafeDeployed,
  updateSafeApprovals,
  checkSafeApprovals,
} from '../controllers/polymarket-safe.controller.js';
import { privyAuthMiddleware, requirePrivyAuth } from '../middleware/privyAuth.middleware.js';

const router = express.Router();

// Apply Privy auth middleware to all routes
router.use(privyAuthMiddleware);

/**
 * API Key Management Routes
 */

// 获取API Key
router.get('/api-key', requirePrivyAuth, getApiKey);

// 保存API Key
router.post('/api-key', requirePrivyAuth, saveApiKey);

// 删除API Key
router.delete('/api-key', requirePrivyAuth, deleteApiKey);

// 检查API Key是否存在
router.get('/api-key/check', requirePrivyAuth, checkApiKey);

// 自动创建 API 凭证 (使用 Privy Delegated Actions，无需用户签名)
router.post('/create-credentials', requirePrivyAuth, createCredentials);

/**
 * Safe Wallet Routes (Gasless)
 *
 * 前端负责:
 * 1. 使用 RelayerClient 派生 Safe 地址
 * 2. 使用 RelayerClient 部署 Safe
 * 3. 使用 RelayerClient 设置 Token 授权
 *
 * 后端负责:
 * 1. 保存 Safe 地址
 * 2. 检查链上状态
 * 3. 同步状态到数据库
 */

// 获取 Safe 信息 (包括链上状态验证)
router.get('/safe-info', requirePrivyAuth, getSafeInfo);

// 保存前端派生的 Safe 地址
router.post('/save-safe-address', requirePrivyAuth, saveSafeAddress);

// 前端部署后，更新部署状态
router.post('/update-safe-deployed', requirePrivyAuth, updateSafeDeployed);

// 前端设置授权后，更新授权状态
router.post('/update-safe-approvals', requirePrivyAuth, updateSafeApprovals);

// 检查 Safe 授权状态
router.get('/safe-approvals', requirePrivyAuth, checkSafeApprovals);

/**
 * Order Management Routes
 *
 * 订单在前端通过 Safe 钱包签名后直接提交到 Polymarket CLOB
 * 后端只负责记录交易历史和管理持仓数据
 */

// 记录订单 (前端提交成功后调用)
router.post('/record-order', requirePrivyAuth, recordOrder);

// 获取交易历史
router.get('/order-history', requirePrivyAuth, getOrderHistory);

// 获取用户持仓 (从交易历史推算)
router.get('/positions', requirePrivyAuth, getPositions);

export default router;
