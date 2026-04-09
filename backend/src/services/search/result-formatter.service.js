/**
 * Result Formatter Service
 * 
 * Stage 4 of the semantic search pipeline
 * Merges, deduplicates, and formats search results
 */

import { RESULT_CONFIG } from '../../config/search.config.js';

// ============================================
// Deduplication
// ============================================

/**
 * Calculate simple similarity between two titles
 * Uses Jaccard similarity on word sets
 */
function calculateTitleSimilarity(title1, title2) {
  if (!title1 || !title2) return 0;
  
  const words1 = new Set(title1.toLowerCase().split(/\s+/).filter(w => w.length > 2));
  const words2 = new Set(title2.toLowerCase().split(/\s+/).filter(w => w.length > 2));
  
  if (words1.size === 0 || words2.size === 0) return 0;
  
  const intersection = new Set([...words1].filter(x => words2.has(x)));
  const union = new Set([...words1, ...words2]);
  
  return intersection.size / union.size;
}

/**
 * Deduplicate results by ID and similar titles
 * 
 * @param {Array} results - Search results
 * @param {number} threshold - Similarity threshold for deduplication
 * @returns {Array} Deduplicated results
 */
export function deduplicateResults(results, threshold = RESULT_CONFIG.titleSimilarityThreshold) {
  if (!results || results.length === 0) return [];
  
  const seen = new Map();  // Map of ID -> result
  const seenTitles = [];   // Array of {title, id} for similarity check
  const deduplicated = [];
  
  for (const result of results) {
    // Skip if already seen by ID
    if (seen.has(result.id)) {
      // Update matched events if this is a duplicate
      const existing = seen.get(result.id);
      if (result._matchedEventIndex !== undefined) {
        existing._matchedEventIndices = existing._matchedEventIndices || [];
        if (!existing._matchedEventIndices.includes(result._matchedEventIndex)) {
          existing._matchedEventIndices.push(result._matchedEventIndex);
        }
      }
      continue;
    }
    
    // Check for similar titles
    if (RESULT_CONFIG.deduplicateSimilarTitles) {
      let isDuplicate = false;
      
      for (const seenTitle of seenTitles) {
        const similarity = calculateTitleSimilarity(result.title, seenTitle.title);
        if (similarity >= threshold) {
          // This is a similar title, mark as duplicate
          isDuplicate = true;
          
          // Update the existing result's matched events
          const existing = seen.get(seenTitle.id);
          if (existing && result._matchedEventIndex !== undefined) {
            existing._matchedEventIndices = existing._matchedEventIndices || [];
            if (!existing._matchedEventIndices.includes(result._matchedEventIndex)) {
              existing._matchedEventIndices.push(result._matchedEventIndex);
            }
          }
          break;
        }
      }
      
      if (isDuplicate) continue;
    }
    
    // Add to results
    seen.set(result.id, result);
    seenTitles.push({ title: result.title, id: result.id });
    deduplicated.push(result);
  }
  
  return deduplicated;
}

// ============================================
// Result Merging
// ============================================

/**
 * Merge results from multiple event queries
 * 
 * @param {Array<{eventIndex: number, results: Array}>} eventResults - Results per event
 * @returns {Array} Merged and scored results
 */
export function mergeEventResults(eventResults) {
  if (!eventResults || eventResults.length === 0) return [];
  
  // Collect all results with event index
  const allResults = [];
  
  for (const { eventIndex, results } of eventResults) {
    for (const result of results) {
      allResults.push({
        ...result,
        _matchedEventIndex: eventIndex,
      });
    }
  }
  
  // Deduplicate
  const deduplicated = deduplicateResults(allResults);
  
  // Sort by score (use reranker score, then RRF score, then volume)
  deduplicated.sort((a, b) => {
    // Primary: reranker score
    if (a._rerankerScore !== undefined && b._rerankerScore !== undefined) {
      return b._rerankerScore - a._rerankerScore;
    }
    if (a._rerankerScore !== undefined) return -1;
    if (b._rerankerScore !== undefined) return 1;
    
    // Secondary: RRF score
    if (a._rrfScore !== undefined && b._rrfScore !== undefined) {
      return b._rrfScore - a._rrfScore;
    }
    
    // Tertiary: volume
    const volA = parseFloat(a.volume) || 0;
    const volB = parseFloat(b.volume) || 0;
    return volB - volA;
  });
  
  return deduplicated;
}

// ============================================
// Response Formatting
// ============================================

/**
 * Format a single market event for API response
 */
function formatMarketEvent(event, index) {
  return {
    // Core fields
    id: event.id,
    externalId: event.externalId,
    source: event.source,
    title: event.title,
    description: event.description ? event.description.slice(0, 300) : null,
    category: event.category,
    
    // Market data
    yesPrice: event.yesPrice ? parseFloat(event.yesPrice) : null,
    noPrice: event.noPrice ? parseFloat(event.noPrice) : null,
    volume: event.volume ? parseFloat(event.volume) : null,
    liquidity: event.liquidity ? parseFloat(event.liquidity) : null,
    
    // Time & URL
    openTime: event.openTime || null,
    endDate: event.endDate,
    url: event.url,
    
    // Relevance info
    relevanceScore: event._rerankerScore || event._rrfScore || null,
    matchedEvents: event._matchedEventIndices || 
      (event._matchedEventIndex !== undefined ? [event._matchedEventIndex] : []),
    
    // Rank
    rank: index + 1,
  };
}

/**
 * Build the final search response
 * 
 * @param {object} params - Response parameters
 * @returns {object} Formatted search response
 */
export function buildSearchResponse(params) {
  const {
    inputText,
    detectedEvents,
    eventsWithMarkets,  // 新增：每个事件的独立市场列表
    results,
    metadata,
    limit = RESULT_CONFIG.defaultLimit,
  } = params;
  
  // Limit results
  const limitedResults = results.slice(0, Math.min(limit, RESULT_CONFIG.maxLimit));
  
  // Format results
  const formattedResults = limitedResults.map((event, index) => 
    formatMarketEvent(event, index)
  );
  
  // 构建每个事件的独立市场列表
  const detectedEventsWithMarkets = detectedEvents.map((event, index) => {
    // 查找该事件对应的市场列表
    const eventData = eventsWithMarkets?.find(e => e.eventIndex === index);
    const markets = eventData?.markets || [];
    
    return {
      index,
      query: event.query_en,
      keywords: event.query_keywords,
      category: event.category,
      intent: event.intent,
      confidence: event.confidence,
      // 新增：该事件独立的市场列表
      markets: markets.slice(0, 5).map((m, i) => formatMarketEvent(m, i)),
    };
  });
  
  return {
    // Success flag (for quickSearch compatibility)
    success: true,
    
    // Input info
    input: {
      text: inputText,
      length: inputText?.length || 0,
    },
    
    // Detected events from Query Understanding (现在包含独立的市场列表)
    detectedEvents: detectedEventsWithMarkets,
    
    // Search results (合并的结果，保持向后兼容)
    results: formattedResults,
    
    // Metadata
    metadata: {
      totalEventsDetected: detectedEvents.length,
      totalResults: formattedResults.length,
      totalCandidates: metadata.totalCandidates || results.length,
      latencyMs: metadata.latencyMs || 0,
      stages: metadata.stages || {},
    },
  };
}

/**
 * Build error response
 */
export function buildErrorResponse(error, inputText) {
  return {
    input: {
      text: inputText,
      length: inputText?.length || 0,
    },
    detectedEvents: [],
    results: [],
    metadata: {
      totalEventsDetected: 0,
      totalResults: 0,
      error: error.message || 'Unknown error',
    },
  };
}

// ============================================
// Highlight Matching
// ============================================

/**
 * Extract matching keywords from title (for UI highlighting)
 */
export function extractMatchHighlights(title, keywords) {
  if (!title || !keywords || keywords.length === 0) return [];
  
  const titleLower = title.toLowerCase();
  const highlights = [];
  
  for (const keyword of keywords) {
    if (keyword.length > 1 && titleLower.includes(keyword.toLowerCase())) {
      highlights.push(keyword);
    }
  }
  
  return highlights.slice(0, 5);  // Limit to 5 highlights
}

export default {
  deduplicateResults,
  mergeEventResults,
  buildSearchResponse,
  buildErrorResponse,
  extractMatchHighlights,
};
