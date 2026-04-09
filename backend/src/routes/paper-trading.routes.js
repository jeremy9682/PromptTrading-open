/**
 * Paper Trading Routes (模拟盘路由)
 *
 * API 端点:
 * GET    /api/paper-trading/account     - 获取模拟账户详情
 * GET    /api/paper-trading/positions   - 获取持仓列表
 * GET    /api/paper-trading/history     - 获取交易历史
 * POST   /api/paper-trading/buy         - 执行模拟买入
 * POST   /api/paper-trading/sell        - 执行模拟卖出（平仓）
 * POST   /api/paper-trading/reset       - 重置模拟账户
 * POST   /api/paper-trading/execute-ai  - 根据 AI 分析执行交易
 * POST   /api/paper-trading/sync        - 同步前端数据到后端
 *
 * Paper Traders (模拟盘 AI Trader):
 * GET    /api/paper-trading/traders              - 获取所有 Paper Traders
 * POST   /api/paper-trading/traders              - 创建 Paper Trader
 * PUT    /api/paper-trading/traders/:traderId    - 更新 Paper Trader
 * DELETE /api/paper-trading/traders/:traderId    - 删除 Paper Trader
 *
 * Paper Analysis History (模拟盘分析历史):
 * GET    /api/paper-trading/traders/:traderId/analysis-history  - 获取分析历史
 * POST   /api/paper-trading/traders/:traderId/analysis-history  - 保存分析历史
 */

import { Router } from 'express';
import {
  getAccount,
  buy,
  sell,
  reset,
  getHistory,
  getPositions,
  executeAi,
  syncFromFrontend,
  // Paper Traders CRUD
  getTraders,
  createTrader,
  updateTrader,
  deleteTrader,
  // Paper Analysis History
  getAnalysisHistory,
  saveAnalysisHistory
} from '../controllers/paper-trading.controller.js';

const router = Router();

// 获取模拟账户详情（包括余额、持仓、交易历史）
router.get('/account', getAccount);

// 获取持仓列表
router.get('/positions', getPositions);

// 获取交易历史
router.get('/history', getHistory);

// 执行模拟买入
router.post('/buy', buy);

// 执行模拟卖出（平仓）
router.post('/sell', sell);

// 重置模拟账户
router.post('/reset', reset);

// 根据 AI 分析执行交易
router.post('/execute-ai', executeAi);

// 同步前端数据到后端
router.post('/sync', syncFromFrontend);

// ============================================
// Paper Traders CRUD (模拟盘 AI Trader)
// ============================================

// 获取所有 Paper Traders
router.get('/traders', getTraders);

// 创建 Paper Trader
router.post('/traders', createTrader);

// 更新 Paper Trader
router.put('/traders/:traderId', updateTrader);

// 删除 Paper Trader
router.delete('/traders/:traderId', deleteTrader);

// ============================================
// Paper Analysis History (模拟盘分析历史)
// ============================================

// 获取 Trader 的分析历史
router.get('/traders/:traderId/analysis-history', getAnalysisHistory);

// 保存分析历史
router.post('/traders/:traderId/analysis-history', saveAnalysisHistory);

export default router;
