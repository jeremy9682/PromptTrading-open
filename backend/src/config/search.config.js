/**
 * Semantic Search Configuration
 * 
 * Centralized configuration for the semantic search system
 */

// ============================================
// Environment Variables
// ============================================

// Embedding API - 支持 OpenRouter 或直接 OpenAI
// 优先使用 OpenRouter（已有集成），回退到直接 OpenAI
export const EMBEDDING_PROVIDER = process.env.EMBEDDING_PROVIDER || 'openrouter'; // 'openrouter' | 'openai'
export const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
export const OPENAI_EMBEDDING_MODEL = process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small';
export const OPENAI_EMBEDDING_DIMENSION = 1536;

// Cohere Rerank API
export const COHERE_API_KEY = process.env.COHERE_API_KEY;
export const COHERE_RERANK_MODEL = process.env.COHERE_RERANK_MODEL || 'rerank-multilingual-v3.0';

// ============================================
// Query Understanding (Stage 1)
// ============================================

export const QUERY_UNDERSTANDING_CONFIG = {
  // LLM Model for query understanding (via OpenRouter)
  // Using GPT-4o-mini for faster response (0.5-2s vs 2-8s for DeepSeek)
  model: 'openai/gpt-4o-mini',
  
  // Input constraints
  maxInputLength: 1500,      // Max characters (reduced from 5000 for speed)
  maxOutputEvents: 5,        // Max events to extract (reduced from 10)
  
  // Timeouts
  timeoutMs: 10000,  // 10 seconds (reduced from 30s - GPT-4o-mini is faster)
  
  // Confidence threshold
  minConfidence: 0.7,
  
  // Prompt template version
  promptVersion: 'v1',
};

// ============================================
// Retrieval (Stage 2)
// ============================================

export const RETRIEVAL_CONFIG = {
  // Vector Search
  vector: {
    enabled: true,               // pgvector installed (PostgreSQL 17)
    topK: 30,                    // Candidates to retrieve
    similarityThreshold: 0.35,   // Min cosine similarity
  },
  
  // BM25 / Full-text Search
  bm25: {
    enabled: true,
    topK: 30,
  },
  
  // RRF Fusion
  rrf: {
    k: 60,                       // RRF constant
    vectorWeight: 0.6,           // Weight for vector results
    bm25Weight: 0.4,             // Weight for BM25 results
    outputTopK: 50,              // Candidates for reranker
  },
};

// ============================================
// Reranker (Stage 3)
// ============================================

export const RERANKER_CONFIG = {
  enabled: true,
  
  // Cohere Rerank settings
  topN: 5,                      // Results per event
  timeoutMs: 500,
  
  // Fallback when reranker fails
  fallbackToRRF: true,
};

// ============================================
// Result Formatting (Stage 4)
// ============================================

export const RESULT_CONFIG = {
  // Default limits
  defaultLimit: 10,
  maxLimit: 50,
  
  // Deduplication
  deduplicateSimilarTitles: true,
  titleSimilarityThreshold: 0.9,
};

// ============================================
// Market Sync Job
// ============================================

export const MARKET_SYNC_CONFIG = {
  // Schedule (cron format)
  schedule: '0 */3 * * *',       // Every 3 hours (0:00, 3:00, 6:00, ...)
  
  // Polymarket
  polymarket: {
    enabled: true,
    apiUrl: 'https://gamma-api.polymarket.com',
    batchSize: 500,              // Events per API request
  },
  
  // Kalshi (uses cursor pagination)
  kalshi: {
    enabled: true,
    apiUrl: 'https://api.elections.kalshi.com/trade-api/v2',
    pageSize: 100,      // Events per page
    maxPages: 50,       // Max pages to fetch (50 * 100 = 5000 events max)
  },
  
  // Cleanup: 过期事件 (endDate < now) 直接删除
};

// ============================================
// Embedding Generation
// ============================================

export const EMBEDDING_CONFIG = {
  // Batch processing
  batchSize: 50,
  delayBetweenBatchesMs: 100,
  
  // Retry
  maxRetries: 3,
  retryDelayMs: 1000,
  
  // Text processing
  maxTextLength: 500,            // Tokens (approx)
};

// ============================================
// Performance & Caching
// ============================================

export const PERFORMANCE_CONFIG = {
  // Query caching
  cacheEnabled: true,            // In-memory cache enabled by default
  cacheTTLSeconds: 300,          // 5 minutes
  
  // Concurrency
  maxConcurrentQueries: 50,
  
  // Timeouts
  totalPipelineTimeoutMs: 5000,
};

// ============================================
// Logging
// ============================================

export const LOGGING_CONFIG = {
  logSearchQueries: true,
  logPerformanceMetrics: true,
  logErrors: true,
};

// ============================================
// Helper Functions
// ============================================

/**
 * Validate that required API keys are configured
 */
export function validateSearchConfig() {
  const errors = [];
  const warnings = [];
  
  // Embedding API check
  if (EMBEDDING_PROVIDER === 'openai' && !OPENAI_API_KEY) {
    errors.push('OPENAI_API_KEY is not configured (EMBEDDING_PROVIDER=openai)');
  } else if (EMBEDDING_PROVIDER === 'openrouter') {
    // OpenRouter key is checked at runtime via secrets.js
    warnings.push('Using OpenRouter for embeddings (OPENROUTER_API_KEY required)');
  }
  
  // Reranker check
  if (!COHERE_API_KEY && RERANKER_CONFIG.enabled) {
    warnings.push('COHERE_API_KEY is not configured - reranker will be disabled');
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings,
    embeddingProvider: EMBEDDING_PROVIDER,
  };
}

/**
 * Get safe config for logging (no secrets)
 */
export function getSafeConfig() {
  return {
    queryUnderstanding: QUERY_UNDERSTANDING_CONFIG,
    retrieval: RETRIEVAL_CONFIG,
    reranker: { ...RERANKER_CONFIG, apiKeyConfigured: !!COHERE_API_KEY },
    result: RESULT_CONFIG,
    marketSync: MARKET_SYNC_CONFIG,
    embedding: { 
      ...EMBEDDING_CONFIG, 
      provider: EMBEDDING_PROVIDER,
      model: OPENAI_EMBEDDING_MODEL,
      dimension: OPENAI_EMBEDDING_DIMENSION,
      // OpenRouter key is loaded from secrets, so we can't check here
      apiKeyConfigured: EMBEDDING_PROVIDER === 'openai' ? !!OPENAI_API_KEY : 'runtime-check',
    },
    performance: PERFORMANCE_CONFIG,
  };
}
