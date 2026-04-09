import express from 'express';
import {
  getAccountBalance,
  getAccountPerformance,
  getUserPositions,
  getOpenOrders,
  getAccountOverview,
  getAccountAIPrompt,
  getUserFills,
  closePosition,
  withdraw,
  testAccount
} from '../controllers/account.controller.js';
import { networkValidation } from '../middleware/network.middleware.js';

const router = express.Router();

// 账户信息查询接口（支持可选的 chainId 参数）
router.get('/balance', networkValidation, getAccountBalance);
router.get('/performance', networkValidation, getAccountPerformance);
router.get('/positions', networkValidation, getUserPositions);
router.get('/open-orders', networkValidation, getOpenOrders);
router.get('/overview', networkValidation, getAccountOverview);
router.get('/ai-prompt', networkValidation, getAccountAIPrompt);
router.get('/fills', networkValidation, getUserFills);

// 账户操作接口（必须提供 chainId）
router.post('/close-position', networkValidation, closePosition);
router.post('/withdraw', networkValidation, withdraw);

// 测试接口
router.get('/test', testAccount);

export default router;

