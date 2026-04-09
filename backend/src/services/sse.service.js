/**
 * SSE (Server-Sent Events) Service
 * 
 * 管理从后端到前端的实时推送
 * 
 * 功能:
 * - 价格更新推送
 * - 订单状态更新推送
 * - 持仓变化推送
 * - 通知推送
 * 
 * 🔒 支持多标签页：每个用户可以有多个连接（不同浏览器标签页）
 */

import crypto from 'crypto';

// 存储所有连接的客户端
// userId -> Map<connectionId, { response, subscribedTokens, heartbeat }>
const clients = new Map();

// 统计信息
let stats = {
  totalConnections: 0,
  activeConnections: 0,
  messagesSent: 0,
  lastMessageTime: null,
};

/**
 * 生成唯一的连接 ID
 */
function generateConnectionId() {
  return crypto.randomBytes(8).toString('hex');
}

/**
 * 获取活跃连接总数
 */
function getActiveConnectionCount() {
  let count = 0;
  for (const userConnections of clients.values()) {
    count += userConnections.size;
  }
  return count;
}

/**
 * 添加新的 SSE 客户端
 * @param {string} userId - 用户 ID
 * @param {Response} res - Express response 对象
 * @param {string[]} tokenIds - 订阅的 token IDs (可选)
 */
export function addClient(userId, res, tokenIds = []) {
  // 设置 SSE 响应头
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('X-Accel-Buffering', 'no'); // 禁用 nginx 缓冲
  // CloudFlare 特定设置 - 禁用响应缓冲
  res.setHeader('CF-Cache-Status', 'DYNAMIC');

  // 立即发送响应头
  res.flushHeaders();

  const connectionId = generateConnectionId();

  // 发送初始连接成功消息
  const initMessage = `data: ${JSON.stringify({
    type: 'connected',
    userId,
    connectionId,
    timestamp: Date.now()
  })}\n\n`;
  res.write(initMessage);
  // 确保数据立即发送
  if (res.flush && typeof res.flush === 'function') {
    res.flush();
  }
  
  // 创建心跳定时器
  const heartbeat = setInterval(() => {
    try {
      res.write(`: heartbeat\n\n`);
    } catch {
      // 连接已断开，清理会在 close 事件中处理
      clearInterval(heartbeat);
    }
  }, 30000); // 每 30 秒发送心跳
  
  // 存储客户端连接
  const connectionData = {
    response: res,
    subscribedTokens: new Set(tokenIds),
    connectedAt: Date.now(),
    heartbeat,
  };
  
  // 获取或创建用户的连接 Map
  if (!clients.has(userId)) {
    clients.set(userId, new Map());
  }
  clients.get(userId).set(connectionId, connectionData);
  
  stats.totalConnections++;
  stats.activeConnections = getActiveConnectionCount();
  
  console.log(`[SSE] Client connected: ${userId}/${connectionId} (active: ${stats.activeConnections})`);
  
  // 处理客户端断开
  res.on('close', () => {
    const userConnections = clients.get(userId);
    if (userConnections) {
      const conn = userConnections.get(connectionId);
      if (conn) {
        clearInterval(conn.heartbeat); // 清理心跳定时器
        userConnections.delete(connectionId);
        
        // 如果用户没有其他连接，删除用户条目
        if (userConnections.size === 0) {
          clients.delete(userId);
        }
      }
    }
    
    stats.activeConnections = getActiveConnectionCount();
    console.log(`[SSE] Client disconnected: ${userId}/${connectionId} (active: ${stats.activeConnections})`);
  });
  
  return { connectionId, ...connectionData };
}

/**
 * 更新客户端订阅的 tokens
 * @param {string} userId - 用户 ID
 * @param {string[]} tokenIds - 新的 token IDs
 */
export function updateSubscription(userId, tokenIds) {
  const userConnections = clients.get(userId);
  if (userConnections) {
    // 更新该用户所有连接的订阅
    for (const [connectionId, conn] of userConnections.entries()) {
      conn.subscribedTokens = new Set(tokenIds);
    }
    console.log(`[SSE] Updated subscription for ${userId} (${userConnections.size} connections): ${tokenIds.length} tokens`);
  }
}

/**
 * 向特定用户的所有连接发送消息
 * @param {string} userId - 用户 ID
 * @param {object} data - 消息数据
 */
export function sendToUser(userId, data) {
  const userConnections = clients.get(userId);
  if (!userConnections || userConnections.size === 0) {
    return false;
  }

  let sentCount = 0;
  const message = `data: ${JSON.stringify(data)}\n\n`;

  for (const [connectionId, conn] of userConnections.entries()) {
    try {
      conn.response.write(message);
      // 确保数据立即发送，不被缓冲
      if (conn.response.flush && typeof conn.response.flush === 'function') {
        conn.response.flush();
      }
      sentCount++;
    } catch (error) {
      console.error(`[SSE] Failed to send to ${userId}/${connectionId}:`, error.message);
      clearInterval(conn.heartbeat);
      userConnections.delete(connectionId);
    }
  }
  
  // 清理空用户条目
  if (userConnections.size === 0) {
    clients.delete(userId);
  }
  
  if (sentCount > 0) {
    stats.messagesSent += sentCount;
    stats.lastMessageTime = Date.now();
  }
  
  return sentCount > 0;
}

/**
 * 广播价格更新给所有订阅该 token 的客户端
 * @param {string} tokenId - Token ID
 * @param {object} priceData - 价格数据 { price, bid, ask }
 */
export function broadcastPriceUpdate(tokenId, priceData) {
  let sentCount = 0;

  for (const [userId, userConnections] of clients.entries()) {
    for (const [connectionId, conn] of userConnections.entries()) {
      // 检查客户端是否订阅了这个 token
      if (conn.subscribedTokens.has(tokenId) || conn.subscribedTokens.size === 0) {
        try {
          const message = {
            type: 'price_update',
            tokenId,
            ...priceData,
            timestamp: Date.now(),
          };
          conn.response.write(`data: ${JSON.stringify(message)}\n\n`);
          // 确保数据立即发送
          if (conn.response.flush && typeof conn.response.flush === 'function') {
            conn.response.flush();
          }
          sentCount++;
        } catch {
          clearInterval(conn.heartbeat);
          userConnections.delete(connectionId);
        }
      }
    }

    // 清理空用户条目
    if (userConnections.size === 0) {
      clients.delete(userId);
    }
  }
  
  if (sentCount > 0) {
    stats.messagesSent += sentCount;
    stats.lastMessageTime = Date.now();
  }
  
  return sentCount;
}

/**
 * 广播订单状态更新
 * @param {string} userId - 用户 ID
 * @param {object} orderData - 订单数据
 */
export function broadcastOrderUpdate(userId, orderData) {
  return sendToUser(userId, {
    type: 'order_update',
    ...orderData,
    timestamp: Date.now(),
  });
}

/**
 * 广播持仓更新
 * @param {string} userId - 用户 ID
 * @param {object} positionData - 持仓数据
 */
export function broadcastPositionUpdate(userId, positionData) {
  return sendToUser(userId, {
    type: 'position_update',
    ...positionData,
    timestamp: Date.now(),
  });
}

/**
 * 广播余额更新
 * @param {string} userId - 用户 ID
 * @param {object} balanceData - 余额数据
 */
export function broadcastBalanceUpdate(userId, balanceData) {
  return sendToUser(userId, {
    type: 'balance_update',
    ...balanceData,
    timestamp: Date.now(),
  });
}

/**
 * 向所有客户端广播消息
 * @param {object} data - 消息数据
 */
export function broadcastToAll(data) {
  let sentCount = 0;
  const message = `data: ${JSON.stringify(data)}\n\n`;

  for (const [userId, userConnections] of clients.entries()) {
    for (const [connectionId, conn] of userConnections.entries()) {
      try {
        conn.response.write(message);
        // 确保数据立即发送
        if (conn.response.flush && typeof conn.response.flush === 'function') {
          conn.response.flush();
        }
        sentCount++;
      } catch {
        clearInterval(conn.heartbeat);
        userConnections.delete(connectionId);
      }
    }

    // 清理空用户条目
    if (userConnections.size === 0) {
      clients.delete(userId);
    }
  }
  
  if (sentCount > 0) {
    stats.messagesSent += sentCount;
    stats.lastMessageTime = Date.now();
  }
  
  return sentCount;
}

/**
 * 获取 SSE 服务状态
 */
export function getSSEStats() {
  const userList = [];
  for (const [userId, userConnections] of clients.entries()) {
    userList.push({
      userId,
      connections: userConnections.size,
    });
  }
  
  return {
    ...stats,
    users: userList,
    uniqueUsers: clients.size,
  };
}

/**
 * 检查用户是否已连接
 * @param {string} userId - 用户 ID
 */
export function isClientConnected(userId) {
  const userConnections = clients.get(userId);
  return userConnections && userConnections.size > 0;
}

/**
 * 获取用户的连接数
 * @param {string} userId - 用户 ID
 */
export function getUserConnectionCount(userId) {
  const userConnections = clients.get(userId);
  return userConnections ? userConnections.size : 0;
}

export default {
  addClient,
  updateSubscription,
  sendToUser,
  broadcastPriceUpdate,
  broadcastOrderUpdate,
  broadcastPositionUpdate,
  broadcastBalanceUpdate,
  broadcastToAll,
  getSSEStats,
  isClientConnected,
  getUserConnectionCount,
};
