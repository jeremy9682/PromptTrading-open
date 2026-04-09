/**
 * Agent 管理路由
 */

import express from 'express';
import { registerAgent, getAgentList, checkAgent } from '../controllers/agent.controller.js';

const router = express.Router();

// 在 Hyperliquid 上注册 Agent
router.post('/register', registerAgent);

// 获取用户的 Agent 列表
router.get('/list', getAgentList);

// 检查 Agent 是否已授权
router.get('/check', checkAgent);

export default router;

