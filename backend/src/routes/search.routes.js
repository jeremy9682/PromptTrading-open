/**
 * Search Routes
 * 
 * API endpoints for semantic search
 */

import express from 'express';
import {
  search,
  searchQuick,
  searchQuickBatch,
  searchRelated,
  searchStats,
  searchConfig,
  triggerSync,
  syncStatus,
  triggerEmbeddings,
  embeddingStatus,
} from '../controllers/search.controller.js';

const router = express.Router();

// ============================================
// Public Search Endpoints
// ============================================

/**
 * POST /api/search
 * Main semantic search
 * 
 * Body:
 * - text: string (required) - Search query (1-5000 chars)
 * - limit: number (optional, default 10, max 50) - Results per event
 * - maxEvents: number (optional, default 5, max 10) - Max events to extract
 * - minConfidence: number (optional, default 0.7) - Min event confidence
 * - source: string (optional) - Filter by source (POLYMARKET | KALSHI)
 * - category: string (optional) - Filter by category
 * - status: string (optional, default 'ACTIVE') - Filter by status
 */
router.post('/', search);

/**
 * POST /api/search/quick
 * Quick search (simplified, faster)
 * 
 * Body:
 * - text: string (required) - Search query
 * - limit: number (optional, default 5) - Max results
 * - source: string (optional) - Filter by source
 */
router.post('/quick', searchQuick);

/**
 * POST /api/search/quick-batch
 * Batch quick search (multiple text blocks in one request)
 *
 * Body:
 * - blocks: Array<{ id?: string|number, text: string }> (required)
 * - limit: number (optional, default 5)
 * - source: string (optional)
 */
router.post('/quick-batch', searchQuickBatch);

/**
 * POST /api/search/related
 * Find related events and classify relationships
 * 
 * Body:
 * - market: object (required) - Source market event { title, description?, yesPrice?, source? }
 * - limit: number (optional, default 5, max 10) - Max related events
 * - types: string[] (optional) - Filter by relationship type (SIMILAR, CAUSAL, HEDGE, CORRELATED, PREREQUISITE)
 */
router.post('/related', searchRelated);

// ============================================
// Status & Analytics Endpoints
// ============================================

/**
 * GET /api/search/stats
 * Get search statistics
 * 
 * Query:
 * - days: number (optional, default 7) - Period in days
 */
router.get('/stats', searchStats);

/**
 * GET /api/search/config
 * Get search configuration (safe version, no secrets)
 */
router.get('/config', searchConfig);

/**
 * GET /api/search/sync/status
 * Get market sync status
 */
router.get('/sync/status', syncStatus);

/**
 * GET /api/search/embeddings/status
 * Get embedding coverage status
 */
router.get('/embeddings/status', embeddingStatus);

// ============================================
// Admin Endpoints (should add admin auth in production)
// ============================================

/**
 * POST /api/search/sync
 * Manually trigger market data sync
 */
router.post('/sync', triggerSync);

/**
 * POST /api/search/embeddings/generate
 * Manually trigger embedding generation
 */
router.post('/embeddings/generate', triggerEmbeddings);

export default router;
