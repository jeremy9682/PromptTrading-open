/**
 * 管理员认证中间件
 * 
 * 验证用户是否具有管理员权限
 */

import { PrivyClient } from '@privy-io/server-auth';
import { getPrivyCredentials } from '../config/secrets.js';

// 从环境变量获取管理员邮箱列表
const getAdminEmails = () => {
  const adminEmailsStr = process.env.ADMIN_EMAILS || '';
  return adminEmailsStr.split(',').map((email) => email.trim().toLowerCase()).filter(Boolean);
};

// Privy client 单例
let privyClient = null;

/**
 * 获取 Privy client 实例
 */
async function getPrivyClient() {
  if (privyClient) {
    return privyClient;
  }

  const { appId, appSecret } = await getPrivyCredentials();

  if (!appId || !appSecret) {
    throw new Error('Missing Privy credentials');
  }

  privyClient = new PrivyClient(appId, appSecret);
  return privyClient;
}

/**
 * 管理员认证中间件
 * 
 * 检查用户是否在管理员邮箱列表中
 * 必须在 privyAuthMiddleware 之后使用
 */
export const adminAuthMiddleware = async (req, res, next) => {
  try {
    // 1. 必须先通过 Privy 认证
    if (!req.privyUser?.userId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
        message: 'Please login to access admin features',
      });
    }

    // 2. 获取用户详情
    const client = await getPrivyClient();
    const user = await client.getUser(req.privyUser.userId);
    const email = user.email?.address?.toLowerCase();

    if (!email) {
      console.warn(`[AdminAuth] User ${req.privyUser.userId} has no email linked`);
      return res.status(403).json({
        success: false,
        error: 'Admin access denied',
        message: 'No email linked to account',
      });
    }

    // 3. 检查是否是管理员
    const adminEmails = getAdminEmails();
    
    if (adminEmails.length === 0) {
      console.warn('[AdminAuth] No admin emails configured in ADMIN_EMAILS env var');
      return res.status(403).json({
        success: false,
        error: 'Admin not configured',
        message: 'No admin accounts configured',
      });
    }

    if (!adminEmails.includes(email)) {
      console.warn(`[AdminAuth] Unauthorized admin access attempt: ${email}`);
      return res.status(403).json({
        success: false,
        error: 'Admin access denied',
        message: 'You do not have admin privileges',
      });
    }

    // 4. 附加管理员信息到请求
    req.adminUser = {
      userId: req.privyUser.userId,
      email,
    };

    console.log(`[AdminAuth] ✅ Admin verified: ${email}`);
    next();

  } catch (error) {
    console.error('[AdminAuth] Error:', error);
    return res.status(500).json({
      success: false,
      error: 'Admin verification failed',
      message: error.message,
    });
  }
};

/**
 * 简单的 API Key 认证（备用方案）
 * 
 * 使用 X-Admin-API-Key header 验证
 * 适用于自动化脚本或内部服务调用
 */
export const adminApiKeyAuth = (req, res, next) => {
  const apiKey = req.headers['x-admin-api-key'];
  const configuredApiKey = process.env.ADMIN_API_KEY;

  if (!configuredApiKey) {
    return res.status(503).json({
      success: false,
      error: 'Admin API not configured',
    });
  }

  if (apiKey !== configuredApiKey) {
    return res.status(403).json({
      success: false,
      error: 'Invalid admin API key',
    });
  }

  req.adminUser = { userId: 'api-key', email: 'api' };
  next();
};

export default adminAuthMiddleware;














