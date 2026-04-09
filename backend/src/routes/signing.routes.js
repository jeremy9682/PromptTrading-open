/**
 * Agent Wallet 交易路由
 * 仅支持使用用户自己的 Agent Wallet 进行交易
 */

import express from 'express';
import { executeWithAgent } from '../controllers/signing.controller.js';
import { agentAuthMiddleware } from '../middleware/agentAuth.middleware.js';
import { networkValidation } from '../middleware/network.middleware.js';

const router = express.Router();

// 使用 Agent Wallet 执行订单（使用 SDK Custom 方法）
// networkValidation 验证网络配置
// agentAuthMiddleware 验证 Agent 授权签名
router.post('/execute-with-agent', networkValidation, agentAuthMiddleware, executeWithAgent);

export default router;

