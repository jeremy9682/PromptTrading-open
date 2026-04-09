/**
 * DFlow API Routes
 *
 * Routes for proxying DFlow Prediction Markets API (Kalshi markets on Solana)
 */

import { Router } from 'express';
import {
  proxyDFlowMarketsAPI,
  proxyDFlowTradeAPI,
  getDFlowIntent,
  getDFlowQuote,
  postDFlowSwap,
  getDFlowOrder,
  getDFlowOrderStatus,
  postDFlowSubmitIntent,
  postFilterOutcomeMints,
  postMarketsBatch,
  executeDFlowAutoTrade
} from '../controllers/dflow-proxy.controller.js';
import { privyAuthMiddleware } from '../middleware/privyAuth.middleware.js';

const router = Router();

// Prediction Markets Metadata API proxy
// GET /api/dflow/markets-api/events
// GET /api/dflow/markets-api/markets
// GET /api/dflow/markets-api/market/:ticker
// GET /api/dflow/markets-api/orderbook/:ticker
router.get('/markets-api/*', proxyDFlowMarketsAPI);

// === Portfolio/Positions API ===
// POST /api/dflow/filter-outcome-mints - Filter user's tokens for prediction market mints
router.post('/filter-outcome-mints', postFilterOutcomeMints);

// POST /api/dflow/markets-batch - Get market details for multiple outcome mints
router.post('/markets-batch', postMarketsBatch);

// Trade API proxy (generic)
// GET/POST /api/dflow/trade-api/*
router.get('/trade-api/*', proxyDFlowTradeAPI);
router.post('/trade-api/*', proxyDFlowTradeAPI);

// === Declarative Swap API (for prediction markets - async trades) ===
// Step 1: GET /api/dflow/intent?userPublicKey=...&inputMint=...&outputMint=...&amount=...
// Returns openTransaction directly in a single call
router.get('/intent', getDFlowIntent);

// Step 2: POST /api/dflow/submit-intent { quoteResponse, signedOpenTransaction }
// Submits signed transaction to DFlow for execution via Jito bundles
router.post('/submit-intent', postDFlowSubmitIntent);

// === Imperative Swap API (for regular token swaps - sync trades) ===
// Step 1: GET /api/dflow/quote?inputMint=...&outputMint=...&amount=...
router.get('/quote', getDFlowQuote);

// Step 2: POST /api/dflow/swap { quoteResponse, userPublicKey }
router.post('/swap', postDFlowSwap);

// Legacy endpoint (redirects to quote)
// GET /api/dflow/order?inputMint=...&outputMint=...&amount=...&publicKey=...
router.get('/order', getDFlowOrder);

// GET /api/dflow/order-status?orderId=...
router.get('/order-status', getDFlowOrderStatus);

// === Auto Trade API (requires authentication) ===
// POST /api/dflow/auto-trade/execute - Execute automated Kalshi trade with server-side signing
router.post('/auto-trade/execute', privyAuthMiddleware, executeDFlowAutoTrade);

export default router;
