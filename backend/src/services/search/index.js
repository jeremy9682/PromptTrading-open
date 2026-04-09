/**
 * Semantic Search Pipeline
 * 
 * Main entry point for the search system
 * Orchestrates all stages: Query Understanding → Retrieval → Reranking → Formatting
 */

import prisma from '../../lib/prisma.js';
import { createHash } from 'crypto';
import { understandQuery } from './query-understanding.service.js';
import { hybridSearch } from './retrieval.service.js';
import { rerankResults } from './reranker.service.js';
import { getEmbeddingRuntimeMetrics } from './embedding.service.js';
import { 
  mergeEventResults, 
  buildSearchResponse, 
  buildErrorResponse,
  extractMatchHighlights,
} from './result-formatter.service.js';
import { RESULT_CONFIG, LOGGING_CONFIG, PERFORMANCE_CONFIG } from '../../config/search.config.js';

// ============================================
// Quick Search Cache + In-flight Dedupe
// ============================================

const quickSearchCache = new Map();
const quickSearchInFlight = new Map();
const QUICK_SEARCH_CACHE_MAX_SIZE = 2000;
const METRICS_WINDOW_SIZE = 2000;

const runtimeMetrics = {
  quickSearch: {
    requests: 0,
    cacheHits: 0,
    cacheMisses: 0,
    inFlightHits: 0,
    latencySamplesMs: [],
  },
  batch: {
    requests: 0,
    inputBlocks: 0,
    validBlocks: 0,
    uniqueBlocks: 0,
    latencySamplesMs: [],
  },
};

function normalizeCacheText(text) {
  return (text || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function hashCacheInput(input) {
  return createHash('sha256').update(input).digest('hex');
}

function getQuickSearchCacheKey(text, limit, source, fallbackToSemantic = true) {
  const normalized = normalizeCacheText(text);
  return `quick:v2:${hashCacheInput(`${normalized}|${limit}|${source || 'all'}|fb:${fallbackToSemantic ? '1' : '0'}`)}`;
}

function summarizeQuickSearchKey(cacheKey) {
  if (!cacheKey || typeof cacheKey !== 'string') return 'unknown';
  const tail = cacheKey.length > 12 ? cacheKey.slice(-12) : cacheKey;
  return `...${tail}`;
}

function getCachedQuickSearch(cacheKey) {
  if (!PERFORMANCE_CONFIG.cacheEnabled) return null;

  const cached = quickSearchCache.get(cacheKey);
  if (!cached) return null;

  const ttlMs = PERFORMANCE_CONFIG.cacheTTLSeconds * 1000;
  if (Date.now() - cached.timestamp > ttlMs) {
    quickSearchCache.delete(cacheKey);
    return null;
  }

  return cached.data;
}

function setQuickSearchCache(cacheKey, data) {
  if (!PERFORMANCE_CONFIG.cacheEnabled) return;

  if (!quickSearchCache.has(cacheKey) && quickSearchCache.size >= QUICK_SEARCH_CACHE_MAX_SIZE) {
    const oldestKey = quickSearchCache.keys().next().value;
    if (oldestKey) quickSearchCache.delete(oldestKey);
  }

  quickSearchCache.set(cacheKey, {
    timestamp: Date.now(),
    data,
  });
}

function recordLatency(samples, latencyMs) {
  if (!Number.isFinite(latencyMs) || latencyMs < 0) return;
  samples.push(latencyMs);
  if (samples.length > METRICS_WINDOW_SIZE) {
    samples.shift();
  }
}

function computeP95(samples) {
  if (!Array.isArray(samples) || samples.length === 0) return 0;
  const sorted = [...samples].sort((a, b) => a - b);
  const idx = Math.ceil(sorted.length * 0.95) - 1;
  return sorted[Math.max(0, idx)];
}

// ============================================
// Main Search Function
// ============================================

/**
 * Execute semantic search pipeline
 * 
 * @param {string} inputText - User's search input
 * @param {object} options - Search options
 * @returns {Promise<object>} Search response
 */
export async function semanticSearch(inputText, options = {}) {
  const pipelineStartTime = Date.now();
  const stageLatencies = {};
  
  const {
    limit = RESULT_CONFIG.defaultLimit,
    maxEvents = 5,
    minConfidence = 0.7,
    source = null,
    category = null,
    status = 'ACTIVE',
    userId = null,
  } = options;
  
  try {
    // ========================================
    // Stage 1: Query Understanding
    // ========================================
    const stage1Start = Date.now();
    
    const queryResult = await understandQuery(inputText);
    
    stageLatencies.queryUnderstanding = Date.now() - stage1Start;
    
    // 如果 LLM 失败（超时等），降级到快速搜索
    if (!queryResult.success) {
      console.warn('[Search] Query understanding failed, falling back to quick search:', queryResult.error);
      
      // 截取输入文本的前 200 字符作为快速搜索查询
      const shortQuery = inputText.substring(0, 200).trim();
      const quickResult = await quickSearch(shortQuery, { limit, source, fallbackToSemantic: false });
      
      return buildSearchResponse({
        inputText,
        detectedEvents: [],
        results: quickResult.results || [],
        metadata: {
          latencyMs: Date.now() - pipelineStartTime,
          stages: stageLatencies,
          fallback: 'quick_search',
          fallbackReason: queryResult.error,
        },
        limit,
      });
    }
    
    // Filter events by confidence and limit
    const detectedEvents = queryResult.events
      .filter(e => e.confidence >= minConfidence)
      .slice(0, maxEvents);
    
    // If no events detected, try quick search as fallback
    if (detectedEvents.length === 0) {
      console.log('[Search] No events detected, trying quick search');
      
      const shortQuery = inputText.substring(0, 200).trim();
      const quickResult = await quickSearch(shortQuery, { limit, source, fallbackToSemantic: false });
      
      return buildSearchResponse({
        inputText,
        detectedEvents: [],
        results: quickResult.results || [],
        metadata: {
          latencyMs: Date.now() - pipelineStartTime,
          stages: stageLatencies,
          fallback: 'quick_search',
        },
        limit,
      });
    }
    
    // ========================================
    // Stage 2: Hybrid Retrieval (parallel)
    // ========================================
    const stage2Start = Date.now();
    
    // 为每个事件单独检索，并保留独立的市场列表
    const retrievalPromises = detectedEvents.map(async (event, index) => {
      const result = await hybridSearch(event, { source, category, status });
      return {
        eventIndex: index,
        event: event,
        results: result.results,
      };
    });
    
    const retrievalResults = await Promise.all(retrievalPromises);
    
    stageLatencies.retrieval = Date.now() - stage2Start;
    
    // ========================================
    // Stage 3: Reranking (per event)
    // ========================================
    const stage3Start = Date.now();
    
    // 为每个事件单独 rerank，保留独立的市场列表
    const eventsWithMarkets = await Promise.all(
      retrievalResults.map(async ({ eventIndex, event, results }) => {
        // 跳过没有结果的事件
        if (!results || results.length === 0) {
          return {
            eventIndex,
            event,
            markets: [],
          };
        }
        
        // Rerank this event's results
        const rerankedResults = await rerankResults(
          event.query_en,
          results,
          { topN: Math.min(5, limit) }  // 每个事件最多返回 5 个市场
        );
        
        return {
          eventIndex,
          event,
          markets: rerankedResults,
        };
      })
    );
    
    stageLatencies.reranking = Date.now() - stage3Start;
    
    // ========================================
    // Stage 4: Format Results
    // ========================================
    const stage4Start = Date.now();
    
    // 合并所有市场用于兼容旧的 results 字段
    const mergedCandidates = mergeEventResults(
      eventsWithMarkets.map(e => ({ eventIndex: e.eventIndex, results: e.markets }))
    );
    
    // Add match highlights
    const allKeywords = detectedEvents.flatMap(e => e.query_keywords || []);
    const resultsWithHighlights = mergedCandidates.slice(0, limit).map(result => ({
      ...result,
      _matchHighlights: extractMatchHighlights(result.title, allKeywords),
    }));
    
    stageLatencies.formatting = Date.now() - stage4Start;
    
    // Build response (包含每个事件独立的市场列表)
    const response = buildSearchResponse({
      inputText,
      detectedEvents,
      eventsWithMarkets,  // 新增：每个事件的独立市场列表
      results: resultsWithHighlights,
      metadata: {
        totalCandidates: mergedCandidates.length,
        latencyMs: Date.now() - pipelineStartTime,
        stages: stageLatencies,
      },
      limit,
    });
    
    // ========================================
    // Logging
    // ========================================
    if (LOGGING_CONFIG.logSearchQueries) {
      logSearch({
        inputText,
        inputLength: inputText.length,
        eventsDetected: detectedEvents.length,
        resultsReturned: response.results.length,
        latencyMs: Date.now() - pipelineStartTime,
        stageLatencies,
        userId,
        source: options.searchSource || 'api',
      }).catch(err => console.error('[Search] Log error:', err.message));
    }
    
    return response;
    
  } catch (error) {
    console.error('[Search] Pipeline error:', error);
    
    return buildErrorResponse(error, inputText);
  }
}

/**
 * Smart search (先快后慢策略)
 * 1. 先用快速检索（纯关键词/向量搜索）
 * 2. 如果没有结果，降级到完整语义搜索（LLM 理解意图）
 */
export async function quickSearch(text, options = {}) {
  const startTime = Date.now();
  runtimeMetrics.quickSearch.requests += 1;
  
  const {
    limit = 5,
    source = null,
    fallbackToSemantic = true,  // 是否在无结果时降级到语义搜索
  } = options;

  const cacheKey = getQuickSearchCacheKey(text, limit, source, fallbackToSemantic);
  const inFlightKey = cacheKey;

  const cachedResult = getCachedQuickSearch(cacheKey);
  if (cachedResult) {
    console.log(`[QuickSearchCache] cache=hit key=${summarizeQuickSearchKey(cacheKey)} limit=${limit} source=${source || 'all'} fb=${fallbackToSemantic ? '1' : '0'}`);
    runtimeMetrics.quickSearch.cacheHits += 1;
    recordLatency(runtimeMetrics.quickSearch.latencySamplesMs, Date.now() - startTime);
    return {
      ...cachedResult,
      metadata: {
        ...(cachedResult.metadata || {}),
        fromCache: true,
      },
    };
  }
  console.log(`[QuickSearchCache] cache=miss key=${summarizeQuickSearchKey(cacheKey)} limit=${limit} source=${source || 'all'} fb=${fallbackToSemantic ? '1' : '0'}`);
  runtimeMetrics.quickSearch.cacheMisses += 1;

  if (quickSearchInFlight.has(inFlightKey)) {
    runtimeMetrics.quickSearch.inFlightHits += 1;
    return quickSearchInFlight.get(inFlightKey);
  }
  
  const executionPromise = (async () => {
    try {
    // ========================================
    // Step 1: 快速检索（无 LLM）
    // ========================================
    console.log('[SmartSearch] Step 1: Quick retrieval for:', text);
    
    // 简单关键词提取（保留所有语言的字母和数字）
    // 使用 Unicode 属性 \p{L} 匹配任何语言的字母，\p{N} 匹配数字
    const keywords = text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .filter(w => w.length > 1)
      .slice(0, 10);
    
    if (keywords.length > 0) {
      // 直接检索（向量搜索支持跨语言）
      const { results } = await hybridSearch({
        query_keywords: keywords,
        query_en: text,
      }, { source });
      
      if (results.length > 0) {
        const formattedResults = formatQuickResults(results, limit);
        console.log(`[SmartSearch] Step 1 success: ${formattedResults.length} results in ${Date.now() - startTime}ms`);
        const response = {
          results: formattedResults,
          metadata: {
            totalResults: formattedResults.length,
            latencyMs: Date.now() - startTime,
            stage: 'quick',
            fromCache: false,
          },
        };
        setQuickSearchCache(cacheKey, response);
        return response;
      }
    }
    
    // ========================================
    // Step 2: 降级到语义搜索（使用 LLM）
    // ========================================
    if (!fallbackToSemantic) {
      console.log('[SmartSearch] No results and fallback disabled');
      const response = {
        results: [],
        metadata: { latencyMs: Date.now() - startTime, stage: 'quick', fromCache: false },
      };
      setQuickSearchCache(cacheKey, response);
      return response;
    }
    
    console.log('[SmartSearch] Step 2: Falling back to semantic search');
    
    // 调用完整语义搜索管道
    const semanticResult = await semanticSearch(text, { limit, source });
    
    if (semanticResult.success && semanticResult.results?.length > 0) {
      // 转换为 quickSearch 格式
      const formattedResults = semanticResult.results.slice(0, limit).map((r, i) => ({
        id: r.id,
        externalId: r.externalId,
        source: r.source,
        title: r.title,
        description: r.description,
        category: r.category,
        yesPrice: r.yesPrice,
        noPrice: r.noPrice,
        volume: r.volume,
        openTime: r.openTime || null,
        endDate: r.endDate || null,
        url: r.url,
        rank: i + 1,
      }));
      
      console.log(`[SmartSearch] Step 2 success: ${formattedResults.length} results in ${Date.now() - startTime}ms`);
      const response = {
        results: formattedResults,
        metadata: {
          totalResults: formattedResults.length,
          latencyMs: Date.now() - startTime,
          stage: 'semantic',
          detectedEvents: semanticResult.detectedEvents,
          fromCache: false,
        },
      };
      setQuickSearchCache(cacheKey, response);
      return response;
    }
    
    // 两步都没有结果
    console.log(`[SmartSearch] No results after both stages in ${Date.now() - startTime}ms`);
    const response = {
      results: [],
      metadata: {
        latencyMs: Date.now() - startTime,
        stage: 'semantic',
        fromCache: false,
      },
    };
    setQuickSearchCache(cacheKey, response);
    return response;
    
  } catch (error) {
    console.error('[SmartSearch] Error:', error);
    return {
      results: [],
      metadata: {
        error: error.message,
        latencyMs: Date.now() - startTime,
        fromCache: false,
      },
    };
  }
  })();

  quickSearchInFlight.set(inFlightKey, executionPromise);
  try {
    const result = await executionPromise;
    recordLatency(runtimeMetrics.quickSearch.latencySamplesMs, Date.now() - startTime);
    return result;
  } finally {
    quickSearchInFlight.delete(inFlightKey);
  }
}

/**
 * Batch quick search for multiple text blocks.
 * Deduplicates identical blocks before retrieval.
 */
export async function quickSearchBatch(blocks, options = {}) {
  const startTime = Date.now();
  runtimeMetrics.batch.requests += 1;
  const {
    limit = 5,
    source = null,
  } = options;

  const safeBlocks = Array.isArray(blocks) ? blocks : [];
  runtimeMetrics.batch.inputBlocks += safeBlocks.length;
  if (safeBlocks.length === 0) {
    recordLatency(runtimeMetrics.batch.latencySamplesMs, Date.now() - startTime);
    return {
      blockResults: [],
      metadata: {
        latencyMs: Date.now() - startTime,
        inputBlocks: 0,
        uniqueBlocks: 0,
      },
    };
  }

  const preparedBlocks = safeBlocks
    .map((block, index) => ({
      blockId: block?.id ?? index,
      text: typeof block?.text === 'string' ? block.text.trim() : '',
    }))
    .filter(block => block.text.length > 0);
  runtimeMetrics.batch.validBlocks += preparedBlocks.length;

  const uniqueBlocksMap = new Map();
  for (const block of preparedBlocks) {
    const normalized = normalizeCacheText(block.text);
    const uniqueKey = hashCacheInput(normalized);
    if (!uniqueBlocksMap.has(uniqueKey)) {
      uniqueBlocksMap.set(uniqueKey, block.text);
    }
  }

  const uniqueEntries = Array.from(uniqueBlocksMap.entries());
  runtimeMetrics.batch.uniqueBlocks += uniqueEntries.length;
  const searchResultsByKey = new Map();

  await Promise.all(uniqueEntries.map(async ([uniqueKey, text]) => {
    const result = await quickSearch(text, {
      limit,
      source,
      fallbackToSemantic: true,
    });
    searchResultsByKey.set(uniqueKey, result.results || []);
  }));

  const blockResults = preparedBlocks.map((block) => {
    const uniqueKey = hashCacheInput(normalizeCacheText(block.text));
    return {
      blockId: block.blockId,
      text: block.text,
      results: searchResultsByKey.get(uniqueKey) || [],
    };
  });

  const response = {
    blockResults,
    metadata: {
      latencyMs: Date.now() - startTime,
      inputBlocks: safeBlocks.length,
      validBlocks: preparedBlocks.length,
      uniqueBlocks: uniqueEntries.length,
    },
  };
  recordLatency(runtimeMetrics.batch.latencySamplesMs, response.metadata.latencyMs);
  return response;
}

export function getRuntimeSearchMetrics() {
  const quickRequests = runtimeMetrics.quickSearch.requests;
  const quickCacheHits = runtimeMetrics.quickSearch.cacheHits;
  const quickCacheMisses = runtimeMetrics.quickSearch.cacheMisses;
  const batchInputBlocks = runtimeMetrics.batch.inputBlocks;
  const batchUniqueBlocks = runtimeMetrics.batch.uniqueBlocks;
  const batchSavedCalls = Math.max(0, batchInputBlocks - batchUniqueBlocks);

  return {
    quickSearch: {
      requests: quickRequests,
      cacheHits: quickCacheHits,
      cacheMisses: quickCacheMisses,
      cacheHitRatio: quickRequests > 0 ? Number((quickCacheHits / quickRequests).toFixed(4)) : 0,
      inFlightHits: runtimeMetrics.quickSearch.inFlightHits,
      p95LatencyMs: computeP95(runtimeMetrics.quickSearch.latencySamplesMs),
    },
    quickBatch: {
      requests: runtimeMetrics.batch.requests,
      inputBlocks: batchInputBlocks,
      validBlocks: runtimeMetrics.batch.validBlocks,
      uniqueBlocks: batchUniqueBlocks,
      dedupedBlocks: batchSavedCalls,
      dedupeRate: batchInputBlocks > 0 ? Number((batchSavedCalls / batchInputBlocks).toFixed(4)) : 0,
      p95LatencyMs: computeP95(runtimeMetrics.batch.latencySamplesMs),
    },
  };
}

/**
 * 格式化快速搜索结果
 */
function formatQuickResults(results, limit) {
  return results.slice(0, limit).map((event, index) => ({
    id: event.id,
    externalId: event.externalId,
    source: event.source,
    title: event.title,
    yesPrice: event.yesPrice ? parseFloat(event.yesPrice) : null,
    noPrice: event.noPrice ? parseFloat(event.noPrice) : null,
    volume: event.volume ? parseFloat(event.volume) : null,
    openTime: event.openTime || null,
    endDate: event.endDate || null,
    url: event.url,
    rank: index + 1,
  }));
}

// ============================================
// Search Logging
// ============================================

async function logSearch(params) {
  try {
    await prisma.searchLog.create({
      data: {
        userId: params.userId,
        inputText: params.inputText,
        inputLength: params.inputLength,
        eventsDetected: params.eventsDetected,
        queryData: params.stageLatencies,
        resultsReturned: params.resultsReturned,
        latencyMs: params.latencyMs,
        stageLatencies: params.stageLatencies,
        source: params.source,
      },
    });
  } catch (error) {
    // Silently fail - logging should not break search
    console.warn('[Search] Failed to log search:', error.message);
  }
}

// ============================================
// Search Analytics
// ============================================

/**
 * Get search statistics
 */
export async function getSearchStats(days = 7) {
  const since = new Date();
  since.setDate(since.getDate() - days);
  
  const [totalSearches, avgLatency, topQueries] = await Promise.all([
    prisma.searchLog.count({
      where: { createdAt: { gte: since } },
    }),
    prisma.searchLog.aggregate({
      where: { createdAt: { gte: since } },
      _avg: { latencyMs: true },
    }),
    prisma.searchLog.groupBy({
      by: ['inputText'],
      where: { createdAt: { gte: since } },
      _count: true,
      orderBy: { _count: { inputText: 'desc' } },
      take: 10,
    }),
  ]);
  
  return {
    period: `${days} days`,
    totalSearches,
    averageLatencyMs: Math.round(avgLatency._avg.latencyMs || 0),
    runtimeMetrics: {
      ...getRuntimeSearchMetrics(),
      embedding: getEmbeddingRuntimeMetrics(),
    },
    topQueries: topQueries.map(q => ({
      query: q.inputText.slice(0, 100),
      count: q._count,
    })),
  };
}

// ============================================
// Exports
// ============================================

export { understandQuery } from './query-understanding.service.js';
export { hybridSearch, vectorSearch, bm25Search } from './retrieval.service.js';
export { rerankResults, isRerankerAvailable } from './reranker.service.js';
export { generateQueryEmbedding, runEmbeddingJob, getEmbeddingCoverage, getEmbeddingRuntimeMetrics } from './embedding.service.js';
export { runMarketSync, startMarketSyncScheduler, getSyncStats } from '../../jobs/market-sync.job.js';

export default {
  semanticSearch,
  quickSearch,
  quickSearchBatch,
  getRuntimeSearchMetrics,
  getSearchStats,
};
