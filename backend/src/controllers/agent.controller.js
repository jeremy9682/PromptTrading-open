/**
 * Agent 管理控制器
 * 处理 Agent 的注册、列表查询等
 */

import { registerAgentOnHyperliquid } from '../services/agent/hyperliquid-agent.service.js';
import { getUserAgents, isAgentAuthorized } from '../services/agent/list.service.js';

/**
 * 在 Hyperliquid 上注册 Agent（已废弃）
 * 
 * @deprecated 该接口已废弃，所有 Agent 注册必须在前端完成
 * POST /api/agent/register
 * Body: { agentAddress, agentName }
 */
export const registerAgent = async (req, res) => {
  // 返回废弃警告
  console.warn('⚠️ [Agent 注册] API 已废弃，拒绝请求');
  
  return res.status(410).json({
    success: false,
    error: '该 API 已废弃。Agent 注册必须在前端完成，使用用户自己的主钱包签名。',
    errorCode: 'API_DEPRECATED',
    deprecated: true,
    migration: {
      message: '请在前端直接调用 Hyperliquid API 进行 Agent 注册',
      docs: 'https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/exchange-endpoint#approve-an-api-wallet'
    }
  });
};

/**
 * 获取用户的 Agent 列表
 * GET /api/agent/list?address=0x...&chainId=421614/42161
 */
export const getAgentList = async (req, res) => {
  try {
    const { address } = req.query;

    if (!address) {
      return res.status(400).json({
        success: false,
        error: '缺少必需参数: address'
      });
    }

    console.log('[Agent 列表] 查询用户 Agent:', address);

    // 获取 chainId 参数（可选，默认测试网）
    const chainId = parseInt(req.query.chainId) || 421614;
    const isTestnet = chainId === 421614;
    
    const agents = await getUserAgents(address, isTestnet);

    return res.json({
      success: true,
      data: {
        count: agents.length,
        agents: agents
      }
    });

  } catch (error) {
    console.error('[Agent 列表] 错误:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * 检查 Agent 是否已授权
 * GET /api/agent/check?address=0x...&agent=0x...&chainId=421614/42161
 */
export const checkAgent = async (req, res) => {
  try {
    const { address, agent } = req.query;

    if (!address || !agent) {
      return res.status(400).json({
        success: false,
        error: '缺少必需参数: address, agent'
      });
    }

    console.log('[Agent 检查] 用户:', address);
    console.log('[Agent 检查] Agent:', agent);

    // 获取 chainId 参数（可选，默认测试网）
    const chainId = parseInt(req.query.chainId) || 421614;
    const isTestnet = chainId === 421614;
    
    const isAuthorized = await isAgentAuthorized(address, agent, isTestnet);

    return res.json({
      success: true,
      data: {
        isAuthorized: isAuthorized
      }
    });

  } catch (error) {
    console.error('[Agent 检查] 错误:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};
