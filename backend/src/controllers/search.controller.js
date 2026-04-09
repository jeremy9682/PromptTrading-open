/**
 * Search Controller
 * 
 * Handles API requests for semantic search
 */

import { 
  semanticSearch, 
  quickSearch,
  quickSearchBatch,
  getSearchStats,
  runMarketSync,
  getSyncStats,
  runEmbeddingJob,
  getEmbeddingCoverage,
  isRerankerAvailable,
} from '../services/search/index.js';
import { findRelatedEvents } from '../services/search/relationship.service.js';
import { validateSearchConfig, getSafeConfig } from '../config/search.config.js';

const QUICK_BATCH_LIMITS = {
  maxBlocks: 12,
  maxTextLengthPerBlock: 1200,
  maxPayloadBytes: 64 * 1024, // 64KB
  maxConcurrentRequests: 24,
};

let activeQuickBatchRequests = 0;

// ============================================
// Search Endpoints
// ============================================

/**
 * POST /api/search
 * Main semantic search endpoint
 */
export async function search(req, res) {
  try {
    const {
      text,
      limit = 10,
      maxEvents = 5,
      minConfidence = 0.7,
      source,
      category,
      status = 'ACTIVE',
    } = req.body;
    
    // Validate input
    if (!text || typeof text !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Missing or invalid "text" parameter',
      });
    }
    
    if (text.length > 5000) {
      return res.status(400).json({
        success: false,
        error: 'Text too long (max 5000 characters)',
      });
    }
    
    // Get user ID if authenticated
    const userId = req.user?.userId || null;
    
    // Execute search
    const result = await semanticSearch(text, {
      limit: Math.min(limit, 50),
      maxEvents: Math.min(maxEvents, 10),
      minConfidence,
      source,
      category,
      status,
      userId,
      searchSource: 'api',
    });
    
    return res.json({
      success: true,
      ...result,
    });
    
  } catch (error) {
    console.error('[SearchController] Search error:', error);
    return res.status(500).json({
      success: false,
      error: 'Search failed',
      message: error.message,
    });
  }
}

/**
 * POST /api/search/quick
 * Quick search endpoint (simplified pipeline)
 */
export async function searchQuick(req, res) {
  try {
    const {
      text,
      limit = 5,
      source,
    } = req.body;
    
    if (!text || typeof text !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Missing or invalid "text" parameter',
      });
    }
    
    const result = await quickSearch(text, {
      limit: Math.min(limit, 20),
      source,
    });
    
    return res.json({
      success: true,
      ...result,
    });
    
  } catch (error) {
    console.error('[SearchController] Quick search error:', error);
    return res.status(500).json({
      success: false,
      error: 'Quick search failed',
      message: error.message,
    });
  }
}

/**
 * POST /api/search/quick-batch
 * Batch quick search endpoint for multiple text blocks
 */
export async function searchQuickBatch(req, res) {
  if (activeQuickBatchRequests >= QUICK_BATCH_LIMITS.maxConcurrentRequests) {
    return res.status(503).json({
      success: false,
      error: 'Quick batch service is busy, please retry',
      code: 'BATCH_CONCURRENCY_LIMIT',
    });
  }

  activeQuickBatchRequests++;
  try {
    const {
      blocks,
      limit = 5,
      source,
    } = req.body;

    if (!Array.isArray(blocks)) {
      return res.status(400).json({
        success: false,
        error: 'Missing or invalid "blocks" parameter (must be array)',
      });
    }

    if (blocks.length === 0) {
      return res.status(400).json({
        success: false,
        error: '"blocks" cannot be empty',
      });
    }

    if (blocks.length > QUICK_BATCH_LIMITS.maxBlocks) {
      return res.status(400).json({
        success: false,
        error: `"blocks" too large (max ${QUICK_BATCH_LIMITS.maxBlocks})`,
      });
    }

    const normalizedBlocks = blocks.map((block, index) => ({
      id: block?.id ?? index,
      text: typeof block?.text === 'string' ? block.text.trim() : '',
    }));

    const invalidBlock = normalizedBlocks.find(block => block.text.length === 0);
    if (invalidBlock) {
      return res.status(400).json({
        success: false,
        error: 'Each block must include non-empty "text"',
      });
    }

    const oversizeBlock = normalizedBlocks.find(
      block => block.text.length > QUICK_BATCH_LIMITS.maxTextLengthPerBlock
    );
    if (oversizeBlock) {
      return res.status(400).json({
        success: false,
        error: `Block text too long (max ${QUICK_BATCH_LIMITS.maxTextLengthPerBlock} chars each)`,
      });
    }

    const payloadBytes = Buffer.byteLength(
      JSON.stringify({ blocks: normalizedBlocks, limit, source }),
      'utf8'
    );
    if (payloadBytes > QUICK_BATCH_LIMITS.maxPayloadBytes) {
      return res.status(413).json({
        success: false,
        error: `Payload too large (max ${QUICK_BATCH_LIMITS.maxPayloadBytes} bytes)`,
      });
    }

    const result = await quickSearchBatch(normalizedBlocks, {
      limit: Math.min(limit, 20),
      source,
    });

    return res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error('[SearchController] Quick batch search error:', error);
    return res.status(500).json({
      success: false,
      error: 'Quick batch search failed',
      message: error.message,
    });
  } finally {
    activeQuickBatchRequests = Math.max(0, activeQuickBatchRequests - 1);
  }
}

/**
 * POST /api/search/related
 * Find related events and classify relationships
 */
export async function searchRelated(req, res) {
  try {
    const {
      market,
      limit = 5,
      types,
    } = req.body;
    
    if (!market || !market.title) {
      return res.status(400).json({
        success: false,
        error: 'Missing or invalid "market" parameter (must include title)',
      });
    }
    
    const result = await findRelatedEvents(market, {
      limit: Math.min(limit, 10),
      types: Array.isArray(types) ? types : null,
    });
    
    return res.json({
      success: true,
      ...result,
    });
    
  } catch (error) {
    console.error('[SearchController] Related search error:', error);
    return res.status(500).json({
      success: false,
      error: 'Related event search failed',
      message: error.message,
    });
  }
}

// ============================================
// Admin/Management Endpoints
// ============================================

/**
 * GET /api/search/stats
 * Get search statistics
 */
export async function searchStats(req, res) {
  try {
    const days = parseInt(req.query.days) || 7;
    const stats = await getSearchStats(days);
    
    return res.json({
      success: true,
      stats,
    });
    
  } catch (error) {
    console.error('[SearchController] Stats error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get stats',
    });
  }
}

/**
 * GET /api/search/config
 * Get search configuration (safe version)
 */
export async function searchConfig(req, res) {
  try {
    const validation = validateSearchConfig();
    const config = getSafeConfig();
    
    return res.json({
      success: true,
      valid: validation.valid,
      errors: validation.errors,
      config,
      rerankerAvailable: isRerankerAvailable(),
    });
    
  } catch (error) {
    console.error('[SearchController] Config error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get config',
    });
  }
}

/**
 * POST /api/search/sync
 * Trigger market data sync
 */
export async function triggerSync(req, res) {
  try {
    console.log('[SearchController] Manual sync triggered');
    
    // Run sync (don't await - return immediately)
    runMarketSync().catch(err => {
      console.error('[SearchController] Sync error:', err);
    });
    
    return res.json({
      success: true,
      message: 'Sync started',
    });
    
  } catch (error) {
    console.error('[SearchController] Sync trigger error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to trigger sync',
    });
  }
}

/**
 * GET /api/search/sync/status
 * Get sync status
 */
export async function syncStatus(req, res) {
  try {
    const stats = getSyncStats();
    
    return res.json({
      success: true,
      stats,
    });
    
  } catch (error) {
    console.error('[SearchController] Sync status error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get sync status',
    });
  }
}

/**
 * POST /api/search/embeddings/generate
 * Trigger embedding generation
 */
export async function triggerEmbeddings(req, res) {
  try {
    console.log('[SearchController] Manual embedding generation triggered');
    
    // Run embedding job (don't await)
    runEmbeddingJob().catch(err => {
      console.error('[SearchController] Embedding error:', err);
    });
    
    return res.json({
      success: true,
      message: 'Embedding generation started',
    });
    
  } catch (error) {
    console.error('[SearchController] Embedding trigger error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to trigger embedding generation',
    });
  }
}

/**
 * GET /api/search/embeddings/status
 * Get embedding coverage status
 */
export async function embeddingStatus(req, res) {
  try {
    const coverage = await getEmbeddingCoverage();
    
    return res.json({
      success: true,
      coverage,
    });
    
  } catch (error) {
    console.error('[SearchController] Embedding status error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get embedding status',
    });
  }
}

export default {
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
};
