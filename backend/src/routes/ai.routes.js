import express from 'express';
import {
  analyzeMarket,
  compareModels,
  testOpenRouter,
  smartTradingAnalysis,
  getModels,
  fetchModels,
  getBillingInfo
} from '../controllers/ai.controller.js';
import { networkValidation } from '../middleware/network.middleware.js';

const router = express.Router();

// AI 分析接口
router.post('/analyze', networkValidation, analyzeMarket);

// AI 模型对比
router.post('/compare', networkValidation, compareModels);

// 智能交易分析（自动生成 Prompt + 结构化响应）
// 需要网络验证以获取正确的账户数据
router.post('/smart-analysis', networkValidation, smartTradingAnalysis);

// 获取可用模型列表（本地配置）
router.get('/models', getModels);

// 获取 OpenRouter 所有模型（实时 API）
router.get('/models/fetch', fetchModels);

// Get billing info and platform API availability
router.get('/billing-info', getBillingInfo);

// 测试 OpenRouter 连接
router.get('/test-connection', testOpenRouter);

// 测试接口
router.get('/test', (req, res) => {
  res.json({
    success: true,
    message: 'AI routes working',
    availableEndpoints: [
      'POST /api/ai/analyze',
      'POST /api/ai/compare',
      'POST /api/ai/smart-analysis',
      'GET /api/ai/models',
      'GET /api/ai/models/fetch',
      'GET /api/ai/billing-info',
      'GET /api/ai/test-connection'
    ]
  });
});

export default router;

