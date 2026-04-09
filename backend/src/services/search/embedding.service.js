/**
 * Embedding Service
 * 
 * Generates and manages vector embeddings for market events
 * using OpenAI's text-embedding-3-small model
 * 
 * Supports two providers:
 * 1. OpenRouter (default) - reuses existing OPENROUTER_API_KEY
 * 2. OpenAI (direct) - requires separate OPENAI_API_KEY
 */

import prisma from '../../lib/prisma.js';
import { createHash } from 'crypto';
import { getOpenRouterApiKey } from '../../config/secrets.js';
import {
  EMBEDDING_PROVIDER,
  OPENAI_API_KEY,
  OPENAI_EMBEDDING_MODEL,
  OPENAI_EMBEDDING_DIMENSION,
  EMBEDDING_CONFIG,
} from '../../config/search.config.js';

// ============================================
// Configuration
// ============================================

const OPENAI_EMBEDDING_URL = 'https://api.openai.com/v1/embeddings';
const OPENROUTER_EMBEDDING_URL = 'https://openrouter.ai/api/v1/embeddings';

// Cached OpenRouter API key
let cachedOpenRouterApiKey = null;

async function getEmbeddingApiKey() {
  if (EMBEDDING_PROVIDER === 'openai') {
    return { apiKey: OPENAI_API_KEY, url: OPENAI_EMBEDDING_URL };
  }
  
  // Use OpenRouter
  if (!cachedOpenRouterApiKey) {
    cachedOpenRouterApiKey = await getOpenRouterApiKey();
  }
  return { apiKey: cachedOpenRouterApiKey, url: OPENROUTER_EMBEDDING_URL };
}

// Statistics
let embeddingStats = {
  totalGenerated: 0,
  totalTokens: 0,
  errors: 0,
  lastRunAt: null,
};

// Query embedding cache + in-flight dedupe
const queryEmbeddingCache = new Map();
const queryEmbeddingInFlight = new Map();
const QUERY_EMBEDDING_CACHE_MAX_SIZE = 5000;
const QUERY_EMBEDDING_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const EMBEDDING_METRICS_WINDOW_SIZE = 2000;

const embeddingRuntimeMetrics = {
  queryRequests: 0,
  cacheHits: 0,
  cacheMisses: 0,
  inFlightHits: 0,
  latencySamplesMs: [],
};

function getEmbeddingCacheKey(text) {
  const normalized = (text || '').toLowerCase().replace(/\s+/g, ' ').trim();
  return createHash('sha256').update(normalized).digest('hex');
}

function getCachedQueryEmbedding(cacheKey) {
  const cached = queryEmbeddingCache.get(cacheKey);
  if (!cached) return null;

  if (Date.now() - cached.timestamp > QUERY_EMBEDDING_CACHE_TTL_MS) {
    queryEmbeddingCache.delete(cacheKey);
    return null;
  }

  return cached.embedding;
}

function setCachedQueryEmbedding(cacheKey, embedding) {
  if (!Array.isArray(embedding) || embedding.length === 0) return;

  if (!queryEmbeddingCache.has(cacheKey) && queryEmbeddingCache.size >= QUERY_EMBEDDING_CACHE_MAX_SIZE) {
    const oldestKey = queryEmbeddingCache.keys().next().value;
    if (oldestKey) queryEmbeddingCache.delete(oldestKey);
  }

  queryEmbeddingCache.set(cacheKey, {
    timestamp: Date.now(),
    embedding,
  });
}

function recordEmbeddingLatency(latencyMs) {
  if (!Number.isFinite(latencyMs) || latencyMs < 0) return;
  embeddingRuntimeMetrics.latencySamplesMs.push(latencyMs);
  if (embeddingRuntimeMetrics.latencySamplesMs.length > EMBEDDING_METRICS_WINDOW_SIZE) {
    embeddingRuntimeMetrics.latencySamplesMs.shift();
  }
}

function computeP95(samples) {
  if (!Array.isArray(samples) || samples.length === 0) return 0;
  const sorted = [...samples].sort((a, b) => a - b);
  const idx = Math.ceil(sorted.length * 0.95) - 1;
  return sorted[Math.max(0, idx)];
}

// ============================================
// Text Processing
// ============================================

/**
 * Prepare text for embedding (combine title + description, truncate)
 */
function prepareTextForEmbedding(title, description = '') {
  // Combine title and description
  let text = title || '';
  if (description) {
    text += ' ' + description;
  }
  
  // Clean up text
  text = text
    .replace(/\s+/g, ' ')  // Collapse whitespace
    .trim();
  
  // Truncate to approximate token limit (rough estimate: 4 chars = 1 token)
  const maxChars = EMBEDDING_CONFIG.maxTextLength * 4;
  if (text.length > maxChars) {
    text = text.slice(0, maxChars);
  }
  
  return text;
}

// ============================================
// Embedding API (OpenRouter or OpenAI)
// ============================================

/**
 * Call Embedding API for a single text
 * Supports both OpenRouter and direct OpenAI
 */
async function callEmbeddingAPI(text) {
  const { apiKey, url } = await getEmbeddingApiKey();
  
  if (!apiKey) {
    throw new Error(`Embedding API key not configured (provider: ${EMBEDDING_PROVIDER})`);
  }
  
  // Build model name - OpenRouter uses 'openai/model' format
  const model = EMBEDDING_PROVIDER === 'openrouter' 
    ? `openai/${OPENAI_EMBEDDING_MODEL}`
    : OPENAI_EMBEDDING_MODEL;
  
  console.log(`[Embedding] Using ${EMBEDDING_PROVIDER}, model: ${model}`);
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: model,
      input: text,
      dimensions: OPENAI_EMBEDDING_DIMENSION,
    }),
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Embedding API error (${EMBEDDING_PROVIDER}): ${response.status} - ${error}`);
  }
  
  const data = await response.json();
  
  return {
    embedding: data.data[0].embedding,
    tokens: data.usage?.total_tokens || 0,
  };
}

/**
 * Call Embedding API for multiple texts (batch)
 */
async function callEmbeddingAPIBatch(texts) {
  const { apiKey, url } = await getEmbeddingApiKey();
  
  if (!apiKey) {
    throw new Error(`Embedding API key not configured (provider: ${EMBEDDING_PROVIDER})`);
  }
  
  if (texts.length === 0) {
    return { embeddings: [], tokens: 0 };
  }
  
  const model = EMBEDDING_PROVIDER === 'openrouter' 
    ? `openai/${OPENAI_EMBEDDING_MODEL}`
    : OPENAI_EMBEDDING_MODEL;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: model,
      input: texts,
      dimensions: OPENAI_EMBEDDING_DIMENSION,
    }),
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Embedding API error (${EMBEDDING_PROVIDER}): ${response.status} - ${error}`);
  }
  
  const data = await response.json();
  
  // Sort by index to maintain order
  const sortedData = data.data.sort((a, b) => a.index - b.index);
  
  return {
    embeddings: sortedData.map(d => d.embedding),
    tokens: data.usage?.total_tokens || 0,
  };
}

// ============================================
// Single Embedding Generation
// ============================================

/**
 * Generate embedding for a single text
 */
export async function generateEmbedding(text) {
  const result = await callEmbeddingAPI(text);
  embeddingStats.totalGenerated++;
  embeddingStats.totalTokens += result.tokens;
  return result.embedding;
}

/**
 * Generate embedding for a query (used in search)
 */
export async function generateQueryEmbedding(query) {
  const startTime = Date.now();
  embeddingRuntimeMetrics.queryRequests += 1;
  const preparedText = prepareTextForEmbedding(query);
  const cacheKey = getEmbeddingCacheKey(preparedText);

  const cachedEmbedding = getCachedQueryEmbedding(cacheKey);
  if (cachedEmbedding) {
    embeddingRuntimeMetrics.cacheHits += 1;
    recordEmbeddingLatency(Date.now() - startTime);
    return cachedEmbedding;
  }
  embeddingRuntimeMetrics.cacheMisses += 1;

  if (queryEmbeddingInFlight.has(cacheKey)) {
    embeddingRuntimeMetrics.inFlightHits += 1;
    return queryEmbeddingInFlight.get(cacheKey);
  }

  const promise = (async () => {
    const embedding = await generateEmbedding(preparedText);
    setCachedQueryEmbedding(cacheKey, embedding);
    return embedding;
  })();

  queryEmbeddingInFlight.set(cacheKey, promise);
  try {
    const embedding = await promise;
    recordEmbeddingLatency(Date.now() - startTime);
    return embedding;
  } finally {
    queryEmbeddingInFlight.delete(cacheKey);
  }
}

export function getEmbeddingRuntimeMetrics() {
  const requests = embeddingRuntimeMetrics.queryRequests;
  const cacheHits = embeddingRuntimeMetrics.cacheHits;

  return {
    queryRequests: requests,
    cacheHits,
    cacheMisses: embeddingRuntimeMetrics.cacheMisses,
    cacheHitRatio: requests > 0 ? Number((cacheHits / requests).toFixed(4)) : 0,
    inFlightHits: embeddingRuntimeMetrics.inFlightHits,
    p95LatencyMs: computeP95(embeddingRuntimeMetrics.latencySamplesMs),
  };
}

// ============================================
// Batch Embedding Generation
// ============================================

/**
 * Generate embeddings for market events that don't have one
 */
export async function generateMissingEmbeddings(limit = EMBEDDING_CONFIG.batchSize) {
  console.log('[Embedding] Generating missing embeddings...');
  embeddingStats.lastRunAt = new Date();
  
  // Find events without embeddings
  const events = await prisma.marketEvent.findMany({
    where: {
      embeddingGeneratedAt: null,
      status: 'ACTIVE',
    },
    select: {
      id: true,
      title: true,
      description: true,
    },
    take: limit,
    orderBy: { createdAt: 'desc' },
  });
  
  if (events.length === 0) {
    console.log('[Embedding] No events need embeddings');
    return { processed: 0, errors: 0 };
  }
  
  console.log(`[Embedding] Processing ${events.length} events...`);
  
  let processed = 0;
  let errors = 0;
  
  // Process in batches
  const batchSize = EMBEDDING_CONFIG.batchSize;
  
  for (let i = 0; i < events.length; i += batchSize) {
    const batch = events.slice(i, i + batchSize);
    
    try {
      // Prepare texts
      const texts = batch.map(e => prepareTextForEmbedding(e.title, e.description));
      
      // Generate embeddings
      const result = await callEmbeddingAPIBatch(texts);
      
      // Update database with raw SQL (Prisma doesn't support vector type)
      for (let j = 0; j < batch.length; j++) {
        const event = batch[j];
        const embedding = result.embeddings[j];
        
        try {
          // Format embedding as PostgreSQL vector literal
          const vectorLiteral = `[${embedding.join(',')}]`;
          
          await prisma.$executeRaw`
            UPDATE market_events 
            SET embedding = ${vectorLiteral}::vector,
                embedding_generated_at = NOW(),
                updated_at = NOW()
            WHERE id = ${event.id}
          `;
          
          processed++;
          embeddingStats.totalGenerated++;
        } catch (dbError) {
          console.error(`[Embedding] DB error for event ${event.id}:`, dbError.message);
          errors++;
          embeddingStats.errors++;
        }
      }
      
      embeddingStats.totalTokens += result.tokens;
      
      console.log(`[Embedding] Batch ${Math.floor(i / batchSize) + 1}: processed ${batch.length} events`);
      
      // Rate limiting delay
      if (i + batchSize < events.length) {
        await new Promise(resolve => setTimeout(resolve, EMBEDDING_CONFIG.delayBetweenBatchesMs));
      }
      
    } catch (batchError) {
      console.error(`[Embedding] Batch error:`, batchError.message);
      errors += batch.length;
      embeddingStats.errors += batch.length;
      
      // Retry delay on error
      await new Promise(resolve => setTimeout(resolve, EMBEDDING_CONFIG.retryDelayMs));
    }
  }
  
  console.log(`[Embedding] Complete: ${processed} processed, ${errors} errors`);
  
  return { processed, errors };
}

/**
 * Regenerate embedding for a specific event
 */
export async function regenerateEventEmbedding(eventId) {
  const event = await prisma.marketEvent.findUnique({
    where: { id: eventId },
    select: { id: true, title: true, description: true },
  });
  
  if (!event) {
    throw new Error(`Event not found: ${eventId}`);
  }
  
  const text = prepareTextForEmbedding(event.title, event.description);
  const embedding = await generateEmbedding(text);
  
  const vectorLiteral = `[${embedding.join(',')}]`;
  
  await prisma.$executeRaw`
    UPDATE market_events 
    SET embedding = ${vectorLiteral}::vector,
        embedding_generated_at = NOW(),
        updated_at = NOW()
    WHERE id = ${eventId}
  `;
  
  return { success: true };
}

// ============================================
// Statistics & Status
// ============================================

/**
 * Get embedding service statistics
 */
export function getEmbeddingStats() {
  return { ...embeddingStats };
}

/**
 * Get count of events needing embeddings
 */
export async function getEmbeddingQueueSize() {
  return prisma.marketEvent.count({
    where: {
      embeddingGeneratedAt: null,
      status: 'ACTIVE',
    },
  });
}

/**
 * Get embedding coverage statistics
 */
export async function getEmbeddingCoverage() {
  const [total, withEmbedding] = await Promise.all([
    prisma.marketEvent.count({ where: { status: 'ACTIVE' } }),
    prisma.marketEvent.count({ 
      where: { 
        status: 'ACTIVE',
        embeddingGeneratedAt: { not: null },
      } 
    }),
  ]);
  
  return {
    total,
    withEmbedding,
    coverage: total > 0 ? (withEmbedding / total * 100).toFixed(2) + '%' : '0%',
    pending: total - withEmbedding,
  };
}

// ============================================
// Batch Job Runner
// ============================================

/**
 * Run embedding generation job (called by scheduler)
 * Processes all pending embeddings in batches until complete
 */
export async function runEmbeddingJob() {
  console.log('[Embedding] ========================================');
  console.log('[Embedding] Starting embedding generation job...');
  const startTime = Date.now();
  
  let totalProcessed = 0;
  let totalErrors = 0;
  let batchCount = 0;
  const MAX_BATCHES = 200; // Safety limit: 200 batches * 50 = 10,000 events max
  
  try {
    // Check initial queue size
    let queueSize = await getEmbeddingQueueSize();
    
    if (queueSize === 0) {
      console.log('[Embedding] No events in queue');
      return { processed: 0, errors: 0, queueRemaining: 0 };
    }
    
    console.log(`[Embedding] Queue size: ${queueSize}`);
    
    // Process in batches until queue is empty or max batches reached
    while (queueSize > 0 && batchCount < MAX_BATCHES) {
      batchCount++;
      console.log(`[Embedding] Processing batch ${batchCount}/${MAX_BATCHES}...`);
      
      // Process batch
      const result = await generateMissingEmbeddings();
      totalProcessed += result.processed;
      totalErrors += result.errors;
      
      // If no progress, break to avoid infinite loop
      if (result.processed === 0 && result.errors === 0) {
        console.log('[Embedding] No progress made, stopping');
        break;
      }
      
      // Update queue size
      queueSize = await getEmbeddingQueueSize();
      
      // Short delay between batches
      if (queueSize > 0) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }
    
    const duration = Date.now() - startTime;
    console.log('[Embedding] ========================================');
    console.log(`[Embedding] Job complete in ${Math.round(duration / 1000)}s`);
    console.log(`[Embedding] Total batches: ${batchCount}`);
    console.log(`[Embedding] Total processed: ${totalProcessed}, Errors: ${totalErrors}`);
    console.log(`[Embedding] Queue remaining: ${queueSize}`);
    
    return { processed: totalProcessed, errors: totalErrors, queueRemaining: queueSize };
  } catch (error) {
    console.error('[Embedding] Job failed:', error);
    throw error;
  }
}

export default {
  generateEmbedding,
  generateQueryEmbedding,
  generateMissingEmbeddings,
  regenerateEventEmbedding,
  getEmbeddingStats,
  getEmbeddingRuntimeMetrics,
  getEmbeddingQueueSize,
  getEmbeddingCoverage,
  runEmbeddingJob,
};
