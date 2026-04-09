import dotenv from 'dotenv';
// 必须在所有其他导入之前调用，确保环境变量可用
dotenv.config();

// Polyfill: 设置全局 crypto（Polymarket SDK 需要 Web Crypto API）
import { webcrypto } from 'crypto';
if (!globalThis.crypto) {
  globalThis.crypto = webcrypto;
}
console.log('[Server] Global crypto polyfill applied');

import express from 'express';
import cors from 'cors';
import compression from 'compression';
import axios from 'axios';
import aiRoutes from './routes/ai.routes.js';
import accountRoutes from './routes/account.routes.js';
import userRoutes from './routes/user.routes.js';
import signingRoutes from './routes/signing.routes.js';
import agentRoutes from './routes/agent.routes.js';
import authRoutes from './routes/auth.routes.js';
import polymarketRoutes from './routes/polymarket.routes.js';
import polymarketTradingRoutes from './routes/polymarket-trading.routes.js';
import polymarketBuilderRoutes from './routes/polymarket-builder.routes.js';
import polymarketAutoTradeRoutes from './routes/polymarket-auto-trade.routes.js';
import notificationRoutes from './routes/notification.routes.js';
import sseRoutes from './routes/sse.routes.js';
import rechargeRoutes from './routes/recharge.routes.js';
import creditsRoutes from './routes/credits.routes.js';
import adminRoutes from './routes/admin.routes.js';
import paperTradingRoutes from './routes/paper-trading.routes.js';
import dflowRoutes from './routes/dflow.routes.js';
import searchRoutes from './routes/search.routes.js';
import subscriptionRoutes from './routes/subscription.routes.js';
import { privyAuthMiddleware } from './middleware/privyAuth.middleware.js';
import { getServiceStats as getNotificationStats } from './services/notification.service.js';
import { initializeScheduler, getSchedulerStatus } from './services/trader-scheduler.service.js';
import { startPriceCacheService, getCacheStatus } from './services/polymarket/price-cache.service.js';
import { startMarketCacheService, getCacheStatus as getMarketCacheStatus } from './services/polymarket/market-cache.service.js';
import { startUserCacheService, getCacheStats as getUserCacheStats } from './services/user-cache.service.js';
import { startPositionMonitor, getMonitorStatus } from './services/position-monitor.service.js';
import { startAutoCleanup, getRetentionStats } from './services/billing/data-retention.service.js';
import { startDepositScanner } from './jobs/depositScanner.js';
import { startMarketSyncScheduler } from './jobs/market-sync.job.js';

// Configure axios with browser-like headers to bypass Cloudflare bot detection
// This affects @polymarket/clob-client which uses axios internally
axios.defaults.headers.common['User-Agent'] = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
axios.defaults.headers.common['Accept-Language'] = 'en-US,en;q=0.9';
console.log('[Server] Axios configured with browser-like headers for Polymarket API');

const app = express();
const PORT = process.env.PORT || 3002;  // 后端默认端口

// 中间件
// CORS 配置：支持开发环境和生产环境
const allowedOrigins = process.env.FRONTEND_URL 
  ? [
      process.env.FRONTEND_URL,
      ...(process.env.FRONTEND_URL.includes('https://') 
        ? [process.env.FRONTEND_URL.replace('https://', 'http://')] 
        : []),
      ...(process.env.FRONTEND_LOCAL ? [process.env.FRONTEND_LOCAL] : []),
    ]
  : ['http://localhost:3000', 'http://localhost:3001', 'http://localhost:3002', 'http://localhost:5173'];

app.use(cors({
  origin: function (origin, callback) {
    // 允许无源请求（如移动应用或Postman）
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) !== -1 || process.env.NODE_ENV === 'development') {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  // 允许 Polymarket Builder 认证头（用于 relayer-proxy 交易）
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Wallet-Address',
    // Polymarket Builder 认证头
    'POLY_BUILDER_SIGNATURE',
    'POLY_BUILDER_TIMESTAMP',
    'POLY_BUILDER_API_KEY',
    'POLY_BUILDER_PASSPHRASE',
    // 小写版本（浏览器可能会转换）
    'poly_builder_signature',
    'poly_builder_timestamp',
    'poly_builder_api_key',
    'poly_builder_passphrase',
  ],
}));
app.use(compression({
  threshold: 1024,
  filter: (req, res) => {
    const contentType = String(res.getHeader('Content-Type') || '');
    if (contentType.includes('text/event-stream') || req.path.startsWith('/api/sse')) {
      return false;
    }
    return compression.filter(req, res);
  },
}));
app.use(express.json({
  verify: (req, res, buf) => {
    // Preserve raw body for webhook signature verification
    if (req.url.startsWith('/api/subscription/webhook')) {
      req.rawBody = buf;
    }
  },
}));
app.use(express.text({ type: 'text/plain' })); // Support text/plain for RelayClient
app.use(express.urlencoded({ extended: true }));

// Request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Privy authentication middleware (runs on all requests)
// Extracts and verifies Privy token if present
app.use(privyAuthMiddleware);

// 路由
app.get('/', (req, res) => {
  res.json({
    name: 'PromptTrading Open Backend',
    version: '1.0.0',
    status: 'running',
    endpoints: {
      health: '/health',
      ai: {
        smartAnalysis: 'POST /api/ai/smart-analysis',
        analyze: 'POST /api/ai/analyze',
        compare: 'POST /api/ai/compare',
        test: 'GET /api/ai/test'
      },
      polymarket: {
        analyzeStream: 'POST /api/polymarket/analyze-stream (SSE)',
        analyze: 'POST /api/polymarket/analyze',
        testConnection: 'GET /api/polymarket/test-connection'
      },
      account: {
        balance: 'GET /api/account/balance?address=0x...',
        performance: 'GET /api/account/performance?address=0x...',
        positions: 'GET /api/account/positions?address=0x...',
        overview: 'GET /api/account/overview?address=0x...',
        test: 'GET /api/account/test'
      },
      trading: {
        executeWithAgent: 'POST /api/signing/execute-with-agent'
      },
      agent: {
        register: 'POST /api/agent/register'
      }
    },
    timestamp: new Date().toISOString()
  });
});

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    message: 'PromptTrading Open Backend',
    timestamp: new Date().toISOString(),
    scheduler: getSchedulerStatus(),
    priceCache: getCacheStatus(),
    marketCache: getMarketCacheStatus(),
    userCache: getUserCacheStats(),
    positionMonitor: getMonitorStatus(),
    notifications: getNotificationStats(),
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/account', accountRoutes);
app.use('/api/user', userRoutes);
app.use('/api/signing', signingRoutes);
app.use('/api/agent', agentRoutes);
// 更具体的路由先注册，避免被通配符路由拦截
app.use('/api/polymarket/trading', polymarketTradingRoutes);
app.use('/api/polymarket/auto-trade', polymarketAutoTradeRoutes);
app.use('/api/polymarket', polymarketBuilderRoutes);
app.use('/api/polymarket', polymarketRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/sse', sseRoutes);
app.use('/api/recharge', rechargeRoutes);
app.use('/api/credits', creditsRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/paper-trading', paperTradingRoutes);
app.use('/api/dflow', dflowRoutes);  // DFlow/Kalshi prediction markets
app.use('/api/search', searchRoutes);  // Semantic search
app.use('/api/subscription', subscriptionRoutes);  // Pro subscription

// 错误处理
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    success: false,
    error: err.message || 'Internal Server Error'
  });
});

// 404 处理
app.use((req, res) => {
  console.log(`[404] Route not found: ${req.method} ${req.path}`);
  res.status(404).json({
    success: false,
    error: 'API endpoint not found',
    path: req.path,
    method: req.method
  });
});

// 启动服务器
app.listen(PORT, '127.0.0.1', async () => {
  console.log(`\n🚀 后端服务器运行在 http://localhost:${PORT}`);
  console.log(`📊 健康检查: http://localhost:${PORT}/health`);
  console.log(`🤖 AI API: http://localhost:${PORT}/api/ai`);
  console.log(`💱 Trading API: http://localhost:${PORT}/api/signing/execute-with-agent`);
  console.log(`👤 Account API: http://localhost:${PORT}/api/account`);

  // 启动价格缓存服务（WebSocket 连接 Polymarket）
  try {
    startPriceCacheService();
    console.log(`💰 Price Cache Service: started (WebSocket)`);
  } catch (error) {
    console.error('Failed to start price cache service:', error);
  }

  // 启动市场元数据缓存服务（LRU + TTL）
  try {
    startMarketCacheService();
    console.log(`📊 Market Cache Service: started (LRU + TTL)`);
  } catch (error) {
    console.error('Failed to start market cache service:', error);
  }

  // 启动用户缓存服务
  try {
    startUserCacheService();
    console.log(`👤 User Cache Service: started (LRU + TTL)`);
  } catch (error) {
    console.error('Failed to start user cache service:', error);
  }

  // 初始化自动交易调度器
  try {
    await initializeScheduler();
    console.log(`🤖 Auto-Trade Scheduler: initialized`);
  } catch (error) {
    console.error('Failed to initialize scheduler:', error);
  }

  // 启动止盈止损监控服务
  try {
    startPositionMonitor();
    console.log(`📈 Position Monitor: started (Stop-Loss/Take-Profit)`);
  } catch (error) {
    console.error('Failed to start position monitor:', error);
  }

  // 启动数据保留服务（每天凌晨 3:00 清理 30 天前的使用记录）
  try {
    startAutoCleanup();
    console.log(`🗑️  Data Retention: started (30-day cleanup at 3:00 AM)`);
  } catch (error) {
    console.error('Failed to start data retention service:', error);
  }

  // 启动充值扫描器（每分钟扫描平台地址的 USDC 转入，处理漏单）
  try {
    startDepositScanner();
    console.log(`💰 Deposit Scanner: started (1-minute interval)`);
  } catch (error) {
    console.error('Failed to start deposit scanner:', error);
  }

  // 启动市场数据同步调度器（每 5 分钟同步 Polymarket/Kalshi 数据）
  try {
    startMarketSyncScheduler();
    console.log(`🔍 Market Sync Scheduler: started (5-minute interval)`);
  } catch (error) {
    console.error('Failed to start market sync scheduler:', error);
  }

  console.log(`\n✅ All services started successfully\n`);
});
