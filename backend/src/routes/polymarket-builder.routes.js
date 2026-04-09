/**
 * Polymarket Builder Routes
 *
 * Builder 签名相关路由
 * 参考: https://github.com/ayv8er/polymarket-safe-trader
 */

import express from 'express';
import {
  signBuilderRequest,
  getBuilderInfo,
  checkBuilderHealth,
  proxyRelayerSubmit,
  proxyRelayerTransaction,
  proxyRelayerDeployed,
  proxyRelayerNonce,
  proxyRelayerGenericGet,
} from '../controllers/polymarket-builder.controller.js';

const router = express.Router();

/**
 * POST /api/polymarket/sign
 * 生成 Builder HMAC 签名
 * 
 * 注意：此端点不需要认证，因为：
 * 1. BuilderConfig SDK 直接调用此端点
 * 2. Builder 凭证仅用于订单归因，不涉及用户资金安全
 * 3. 参考 polymarket-safe-trader 的实现
 */
router.post('/sign', signBuilderRequest);

/**
 * GET /api/polymarket/builder-info
 * 获取 Builder 公开信息
 * 不需要认证
 */
router.get('/builder-info', getBuilderInfo);

/**
 * GET /api/polymarket/builder-health
 * 检查 Builder 凭证健康状态
 * 不需要认证
 */
router.get('/builder-health', checkBuilderHealth);

/**
 * Polymarket Relayer Proxy Endpoints
 * 解决 CORS 问题 - 浏览器无法直接访问 Polymarket relayer
 */

// POST /submit - 提交交易
router.post('/relayer-proxy/submit', proxyRelayerSubmit);

// GET /transactions/:id - 查询交易状态
router.get('/relayer-proxy/transactions/:id', proxyRelayerTransaction);

// GET /deployed - 检查 Safe 是否已部署
router.get('/relayer-proxy/deployed', proxyRelayerDeployed);

// GET /nonce - 获取 Safe 的 nonce
router.get('/relayer-proxy/nonce', proxyRelayerNonce);

// GET /* - 通用代理（处理其他所有 GET 请求）
router.get('/relayer-proxy/*', proxyRelayerGenericGet);

export default router;

