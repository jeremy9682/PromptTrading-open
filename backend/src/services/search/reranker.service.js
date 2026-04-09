/**
 * Reranker Service
 * 
 * Stage 3 of the semantic search pipeline
 * Uses Cohere Rerank API for precise relevance scoring
 */

import {
  COHERE_API_KEY,
  COHERE_RERANK_MODEL,
  RERANKER_CONFIG,
} from '../../config/search.config.js';
import { createHash } from 'crypto';

// ============================================
// Configuration
// ============================================

const COHERE_RERANK_URL = 'https://api.cohere.ai/v1/rerank';

// Statistics
let rerankerStats = {
  totalRequests: 0,
  successfulRequests: 0,
  failedRequests: 0,
  fallbackUsed: 0,
  totalLatencyMs: 0,
};

const RERANK_CACHE_TTL_MS = 30 * 60 * 1000;
const RERANK_CACHE_MAX_SIZE = 1000;
const rerankerCache = new Map();
const rerankerInFlight = new Map();

function getRerankCacheKey(query, documents, topN) {
  const docHash = createHash('sha256').update(documents.join('\n')).digest('hex');
  return createHash('sha256')
    .update(`${query}|${docHash}|${topN}|${COHERE_RERANK_MODEL}`)
    .digest('hex');
}

function getCachedRerankResult(key) {
  const cached = rerankerCache.get(key);
  if (!cached) return null;
  if (Date.now() - cached.timestamp > RERANK_CACHE_TTL_MS) {
    rerankerCache.delete(key);
    return null;
  }
  return cached.value;
}

function setCachedRerankResult(key, value) {
  if (rerankerCache.has(key)) rerankerCache.delete(key);
  rerankerCache.set(key, { value, timestamp: Date.now() });
  if (rerankerCache.size > RERANK_CACHE_MAX_SIZE) {
    const oldestKey = rerankerCache.keys().next().value;
    if (oldestKey) rerankerCache.delete(oldestKey);
  }
}

// ============================================
// Cohere Rerank API
// ============================================

/**
 * Call Cohere Rerank API
 * 
 * @param {string} query - The search query
 * @param {Array} documents - Documents to rerank
 * @param {number} topN - Number of top results to return
 * @returns {Promise<Array>} Reranked results with scores
 */
async function callCohereRerank(query, documents, topN) {
  if (!COHERE_API_KEY) {
    throw new Error('COHERE_API_KEY is not configured');
  }
  
  const response = await fetch(COHERE_RERANK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${COHERE_API_KEY}`,
    },
    body: JSON.stringify({
      model: COHERE_RERANK_MODEL,
      query: query,
      documents: documents,
      top_n: topN,
      return_documents: false,  // We only need indices and scores
    }),
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Cohere API error: ${response.status} - ${error}`);
  }
  
  const data = await response.json();
  return data.results;
}

// ============================================
// Document Preparation
// ============================================

/**
 * Prepare documents for reranking
 * Combines title and description for better context
 */
function prepareDocuments(events) {
  return events.map(event => {
    let doc = event.title || '';
    if (event.description) {
      doc += ' ' + event.description.slice(0, 500);  // Limit description length
    }
    return doc;
  });
}

// ============================================
// Reranking Functions
// ============================================

/**
 * Rerank search results using Cohere
 * 
 * @param {string} query - Original search query
 * @param {Array} candidates - Candidate events from retrieval
 * @param {object} options - Reranking options
 * @returns {Promise<Array>} Reranked events
 */
export async function rerankResults(query, candidates, options = {}) {
  const startTime = Date.now();
  const {
    topN = RERANKER_CONFIG.topN,
    fallbackToRRF = RERANKER_CONFIG.fallbackToRRF,
  } = options;
  
  rerankerStats.totalRequests++;
  let activeCacheKey = null;
  
  // If reranker is disabled or no candidates, return as-is
  if (!RERANKER_CONFIG.enabled || !candidates || candidates.length === 0) {
    return candidates.slice(0, topN);
  }
  
  // If not enough candidates, no need to rerank
  if (candidates.length <= topN) {
    return candidates;
  }
  
  try {
    // Prepare documents
    const documents = prepareDocuments(candidates);
    const cacheKey = getRerankCacheKey(query, documents, topN);
    activeCacheKey = cacheKey;
    const cached = getCachedRerankResult(cacheKey);
    if (cached) {
      rerankerStats.successfulRequests++;
      rerankerStats.totalLatencyMs += Date.now() - startTime;
      return cached;
    }

    if (rerankerInFlight.has(cacheKey)) {
      const shared = await rerankerInFlight.get(cacheKey);
      rerankerStats.successfulRequests++;
      rerankerStats.totalLatencyMs += Date.now() - startTime;
      return shared;
    }
    
    // Call Cohere with timeout
    const rerankPromise = Promise.race([
      callCohereRerank(query, documents, topN),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Reranker timeout')), RERANKER_CONFIG.timeoutMs)
      ),
    ]);
    rerankerInFlight.set(cacheKey, rerankPromise);
    const reranked = await rerankPromise;
    
    // Map reranked results back to original events
    const rerankedEvents = reranked.map(result => ({
      ...candidates[result.index],
      _rerankerScore: result.relevance_score,
      _originalRank: result.index + 1,
    }));
    setCachedRerankResult(cacheKey, rerankedEvents);
    
    rerankerStats.successfulRequests++;
    rerankerStats.totalLatencyMs += Date.now() - startTime;
    
    return rerankedEvents;
    
  } catch (error) {
    console.error('[Reranker] Error:', error.message);
    rerankerStats.failedRequests++;
    
    // Fallback to original RRF order
    if (fallbackToRRF) {
      rerankerStats.fallbackUsed++;
      console.log('[Reranker] Using fallback (RRF scores)');
      return candidates.slice(0, topN).map(event => ({
        ...event,
        _rerankerScore: event._rrfScore || 0,
        _fallback: true,
      }));
    }
    
    throw error;
  } finally {
    if (activeCacheKey) rerankerInFlight.delete(activeCacheKey);
  }
}

/**
 * Rerank results for multiple queries (batch)
 * 
 * @param {Array<{query: string, candidates: Array}>} batches - Query-candidates pairs
 * @param {object} options - Reranking options
 * @returns {Promise<Array<Array>>} Reranked results for each query
 */
export async function rerankBatch(batches, options = {}) {
  const results = await Promise.all(
    batches.map(({ query, candidates }) => 
      rerankResults(query, candidates, options)
    )
  );
  
  return results;
}

// ============================================
// Statistics
// ============================================

/**
 * Get reranker service statistics
 */
export function getRerankerStats() {
  const avgLatency = rerankerStats.successfulRequests > 0
    ? Math.round(rerankerStats.totalLatencyMs / rerankerStats.successfulRequests)
    : 0;
  
  return {
    ...rerankerStats,
    averageLatencyMs: avgLatency,
    successRate: rerankerStats.totalRequests > 0
      ? ((rerankerStats.successfulRequests / rerankerStats.totalRequests) * 100).toFixed(2) + '%'
      : '0%',
  };
}

/**
 * Reset reranker statistics
 */
export function resetRerankerStats() {
  rerankerStats = {
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    fallbackUsed: 0,
    totalLatencyMs: 0,
  };
}

/**
 * Check if reranker is configured and enabled
 */
export function isRerankerAvailable() {
  return RERANKER_CONFIG.enabled && !!COHERE_API_KEY;
}

export default {
  rerankResults,
  rerankBatch,
  getRerankerStats,
  resetRerankerStats,
  isRerankerAvailable,
};
