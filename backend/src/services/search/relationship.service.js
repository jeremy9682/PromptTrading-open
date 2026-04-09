/**
 * Event Relationship Service
 *
 * Finds related prediction market events using semantic search.
 * Simplified version - no LLM classification, just returns search results.
 */

import { quickSearch } from './index.js';

// ============================================
// In-memory Cache (simple Map + TTL)
// ============================================

const relationCache = new Map();
const CACHE_TTL = 2 * 60 * 60 * 1000; // 2 hours

function getCached(eventId) {
  const cached = relationCache.get(eventId);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }
  if (cached) {
    relationCache.delete(eventId);
  }
  return null;
}

function setCache(eventId, data) {
  if (relationCache.size > 500) {
    const entries = [...relationCache.entries()];
    entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
    for (let i = 0; i < 100; i++) {
      relationCache.delete(entries[i][0]);
    }
  }
  relationCache.set(eventId, { data, timestamp: Date.now() });
}

// ============================================
// Title Similarity (to filter duplicates)
// ============================================

/**
 * Calculate simple word-overlap similarity between two titles.
 * Used to filter obvious duplicates (same event on different platforms).
 */
function titleSimilarity(a, b) {
  if (!a || !b) return 0;
  const normalize = (s) => s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(w => w.length > 1);
  const wordsA = normalize(a);
  const wordsB = normalize(b);
  if (wordsA.length === 0 || wordsB.length === 0) return 0;
  const setB = new Set(wordsB);
  const overlap = wordsA.filter(w => setB.has(w)).length;
  return overlap / Math.max(wordsA.length, wordsB.length);
}

// ============================================
// Main Function
// ============================================

/**
 * Find related events for a given market event.
 * Returns DIFFERENT but related events (filters out duplicates that belong in arbitrage).
 * Simplified version - no LLM classification, just semantic search results.
 *
 * @param {object} market - Source market event { id, title, description, source, yesPrice, ... }
 * @param {object} options - { limit: number }
 * @returns {Promise<object>} Related events
 */
export async function findRelatedEvents(market, options = {}) {
  const startTime = Date.now();
  const { limit = 5 } = options;

  if (!market || !market.title) {
    return {
      relationships: [],
      metadata: { latencyMs: Date.now() - startTime, error: 'Missing market title' },
    };
  }

  // Check cache first
  const cacheKey = market.id || market.title.substring(0, 50);
  const cached = getCached(cacheKey);
  if (cached) {
    console.log(`[RelationshipService] Cache hit for: ${market.title.substring(0, 40)}`);
    return {
      relationships: cached.relationships.slice(0, limit),
      metadata: { ...cached.metadata, fromCache: true },
    };
  }

  try {
    console.log(`[RelationshipService] Finding related events for: ${market.title.substring(0, 50)}`);

    const searchResult = await quickSearch(market.title, {
      limit: 15,
      source: null, // All platforms
    });

    let candidates = (searchResult.results || [])
      // Filter out the source event itself
      .filter(r => {
        if (market.id && r.id === market.id) return false;
        if (market.externalId && r.externalId === market.externalId) return false;
        return true;
      });

    // Filter out obvious duplicates (title similarity > 85%)
    // These belong in the arbitrage/cross-market section
    candidates = candidates.filter(r => {
      const sim = titleSimilarity(market.title, r.title);
      if (sim > 0.85) {
        console.log(`[RelationshipService] Filtered duplicate (sim=${sim.toFixed(2)}): ${r.title?.substring(0, 40)}`);
        return false;
      }
      return true;
    });

    // Convert to relationship format (without LLM classification)
    const relationships = candidates.slice(0, limit).map((c, i) => ({
      targetEvent: c,
    }));

    const result = {
      relationships,
      metadata: {
        latencyMs: Date.now() - startTime,
        candidatesFound: candidates.length,
        fromCache: false,
      },
    };

    // Cache the result
    setCache(cacheKey, {
      relationships: candidates.slice(0, 10).map(c => ({ targetEvent: c })),
      metadata: result.metadata,
    });

    console.log(`[RelationshipService] Completed in ${Date.now() - startTime}ms, ${relationships.length} related events found`);

    return result;
  } catch (error) {
    console.error('[RelationshipService] Error:', error);
    return {
      relationships: [],
      metadata: {
        latencyMs: Date.now() - startTime,
        error: error.message,
      },
    };
  }
}

export default {
  findRelatedEvents,
};
