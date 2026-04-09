/**
 * Agent 认证中间件
 * 验证请求中的 Agent 授权
 */

import { verifyAgentAuthorization } from '../services/agent/verification.service.js';

/**
 * Agent 认证中间件
 * 验证请求中包含有效的 Agent 授权
 */
export const agentAuthMiddleware = async (req, res, next) => {
  try {
    const { agentData, mainWalletAddress } = req.body;

    // 如果没有提供 Agent 数据，跳过验证（可能是旧的请求格式）
    if (!agentData) {
      console.log('⚠️ 未提供 Agent 数据，跳过 Agent 验证');
      return next();
    }

    // 验证 Agent 授权
    const verification = await verifyAgentAuthorization(agentData, mainWalletAddress);

    if (!verification.valid) {
      return res.status(403).json({
        success: false,
        error: 'Invalid Agent authorization',
        details: verification.error
      });
    }

    // 将验证后的 Agent 数据附加到 request
    req.agentData = agentData;
    req.agentVerified = true;

    console.log('✅ Agent 认证成功:', agentData.address);
    next();

  } catch (error) {
    console.error('❌ Agent 认证中间件错误:', error);
    res.status(500).json({
      success: false,
      error: 'Agent authentication failed',
      details: error.message
    });
  }
};

/**
 * 要求必须使用 Agent 的中间件
 */
export const requireAgent = (req, res, next) => {
  if (!req.agentVerified) {
    return res.status(403).json({
      success: false,
      error: 'Agent authentication required',
      message: 'This endpoint requires a valid Agent Wallet authorization'
    });
  }
  next();
};

