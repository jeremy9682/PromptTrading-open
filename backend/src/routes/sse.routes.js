/**
 * SSE (Server-Sent Events) Routes
 * 
 * 提供实时推送端点
 */

import express from 'express';
import { PrivyClient } from '@privy-io/server-auth';
import { getPrivyCredentials } from '../config/secrets.js';
import { requirePrivyAuth } from '../middleware/privyAuth.middleware.js';
import {
  addClient,
  updateSubscription,
  getSSEStats,
} from '../services/sse.service.js';

const router = express.Router();

// Privy client for token verification
let privyClient = null;

async function getPrivyClient() {
  if (privyClient) return privyClient;
  const { appId, appSecret } = await getPrivyCredentials();
  privyClient = new PrivyClient(appId, appSecret);
  return privyClient;
}

/**
 * GET /api/sse/stream
 * 建立 SSE 连接，接收实时更新
 * 
 * Query params:
 * - token: Privy access token（必需，因为 EventSource 不支持 headers）
 * - tokens: 逗号分隔的 tokenId 列表（可选）
 */
router.get('/stream', async (req, res) => {
  try {
    // 从 query 获取 token（EventSource 不支持自定义 headers）
    const token = req.query.token;
    if (!token) {
      return res.status(401).json({ error: 'Token required' });
    }

    // 验证 token
    const client = await getPrivyClient();
    const claims = await client.verifyAuthToken(token);
    const userId = claims.userId;

    const tokenIds = req.query.tokens ? req.query.tokens.split(',') : [];
    
    console.log(`[SSE] New connection from ${userId} (${tokenIds.length} tokens)`);
    
    // 添加客户端并建立 SSE 连接
    addClient(userId, res, tokenIds);
    
    // 保持连接打开（Express 会自动处理）
    // 客户端断开时会触发 res.on('close')
  } catch (error) {
    console.error('[SSE] Auth failed:', error.message);
    res.status(401).json({ error: 'Invalid token' });
  }
});

/**
 * POST /api/sse/subscribe
 * 更新订阅的 tokens
 * 
 * Body: { tokenIds: string[] }
 */
router.post('/subscribe', requirePrivyAuth, (req, res) => {
  const userId = req.privyUser.userId;
  const { tokenIds } = req.body;
  
  if (!Array.isArray(tokenIds)) {
    return res.status(400).json({
      success: false,
      error: 'tokenIds must be an array',
    });
  }
  
  updateSubscription(userId, tokenIds);
  
  res.json({
    success: true,
    message: `Subscribed to ${tokenIds.length} tokens`,
  });
});

/**
 * GET /api/sse/stats
 * 获取 SSE 服务状态（仅用于调试）
 */
router.get('/stats', (req, res) => {
  res.json({
    success: true,
    data: getSSEStats(),
  });
});

export default router;
