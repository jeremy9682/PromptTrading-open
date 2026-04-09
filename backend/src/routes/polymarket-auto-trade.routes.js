/**
 * Polymarket Auto Trade Routes
 *
 * 自动交易相关的 API 路由
 * 使用 Privy Session Signer 实现无签名弹窗的自动交易
 *
 * 路由:
 * - POST /api/polymarket/auto-trade/execute   执行自动交易订单
 * - GET  /api/polymarket/auto-trade/status    检查自动交易状态
 */

import express from 'express';
import {
  executeOrder,
  checkStatus,
  setDelegation,
  getTraderScheduleStatus,
  getPositionMonitorStatus,
  triggerPositionCheck,
  resetPositionMonitorStats,
} from '../controllers/polymarket-auto-trade.controller.js';
import { privyAuthMiddleware, requirePrivyAuth } from '../middleware/privyAuth.middleware.js';

const router = express.Router();

// Apply Privy auth middleware to all routes
router.use(privyAuthMiddleware);

/**
 * 执行自动交易订单
 *
 * POST /api/polymarket/auto-trade/execute
 *
 * 使用 Privy Session Signer 代签，无需用户签名弹窗
 *
 * Headers:
 * - Authorization: Bearer <privy_token>
 * - X-Wallet-Address: <eoa_address>
 *
 * Request Body:
 * {
 *   safeAddress: string,      // Safe 钱包地址
 *   tokenId: string,          // 市场 Token ID
 *   side: 'BUY' | 'SELL',     // 交易方向
 *   price: number,            // 价格 (0-1)
 *   amount: number,           // 金额 (USDC)
 *   timeInForce?: 'GTC' | 'GTD',  // 订单类型
 *   minOrderSize?: number,    // 最小订单大小
 *   eventId?: string,         // 事件ID (用于记录)
 *   eventTitle?: string,      // 事件标题 (用于记录)
 * }
 *
 * Response:
 * {
 *   success: boolean,
 *   orderId?: string,
 *   status?: string,
 *   executionTime?: number,
 *   errorMsg?: string,
 * }
 */
router.post('/execute', requirePrivyAuth, executeOrder);

/**
 * 检查自动交易是否可用
 *
 * GET /api/polymarket/auto-trade/status
 *
 * 检查用户是否满足自动交易的所有条件:
 * 1. 已授权 Session Signer (isDelegated)
 * 2. 已创建 API 凭证
 * 3. 已初始化 Safe 钱包
 * 4. Safe 已部署且授权已设置
 *
 * Response:
 * {
 *   success: boolean,
 *   data: {
 *     available: boolean,
 *     isDelegated: boolean,
 *     hasApiCredentials: boolean,
 *     hasSafeWallet: boolean,
 *     isDeployed: boolean,
 *     approvalsSet: boolean,
 *     safeAddress: string | null,
 *     message: string,
 *   }
 * }
 */
router.get('/status', requirePrivyAuth, checkStatus);

/**
 * 开启/关闭自动交易委托
 *
 * POST /api/polymarket/auto-trade/delegation
 *
 * Request Body:
 * {
 *   enabled: boolean,
 * }
 *
 * Response:
 * {
 *   success: boolean,
 *   data: {
 *     isDelegated: boolean,
 *     message: string,
 *   }
 * }
 */
router.post('/delegation', requirePrivyAuth, setDelegation);

/**
 * 获取 Trader 调度器状态
 *
 * GET /api/polymarket/auto-trade/scheduler/:traderId
 *
 * 获取指定 Trader 的后端调度器状态，包括:
 * - 是否正在运行
 * - 上次执行时间
 * - 下次执行时间
 *
 * Response:
 * {
 *   success: boolean,
 *   data: {
 *     isScheduled: boolean,     // 是否已加入调度器
 *     lastRunTime: number,      // 上次运行时间戳
 *     nextRunTime: number,      // 下次运行时间戳
 *     intervalMinutes: number,  // 调度间隔（分钟）
 *     message: string,
 *   }
 * }
 */
router.get('/scheduler/:traderId', requirePrivyAuth, getTraderScheduleStatus);

// ============================================
// 止盈止损监控 API
// ============================================

/**
 * 获取止盈止损监控状态
 *
 * GET /api/polymarket/auto-trade/position-monitor/status
 *
 * Response:
 * {
 *   success: boolean,
 *   data: {
 *     isRunning: boolean,
 *     lastCheck: number,
 *     intervalMs: number,
 *     stats: {
 *       checksCount: number,
 *       triggeredStopLoss: number,
 *       triggeredTakeProfit: number,
 *       errors: number,
 *     },
 *   }
 * }
 */
router.get('/position-monitor/status', requirePrivyAuth, getPositionMonitorStatus);

/**
 * 手动触发止盈止损检查
 *
 * POST /api/polymarket/auto-trade/position-monitor/check
 *
 * 用于测试或紧急情况下手动触发检查
 */
router.post('/position-monitor/check', requirePrivyAuth, triggerPositionCheck);

/**
 * 重置监控统计数据
 *
 * POST /api/polymarket/auto-trade/position-monitor/reset-stats
 */
router.post('/position-monitor/reset-stats', requirePrivyAuth, resetPositionMonitorStats);

export default router;
