/**
 * Query Understanding Service
 * 
 * Stage 1 of the semantic search pipeline
 * Uses LLM to understand user queries and extract prediction events
 */

import { callSingleModel } from '../ai/openrouter.service.js';
import { createHash } from 'crypto';
import { QUERY_UNDERSTANDING_CONFIG } from '../../config/search.config.js';

// ============================================
// Prompt Templates
// ============================================

const QUERY_UNDERSTANDING_PROMPT = `You are a prediction market search assistant. Analyze the user's input and help search for related prediction markets.

【RULES】
1. ALWAYS generate search keywords, even for short queries like names or topics
2. If input is a question about future events → extract as prediction event
3. If input is just a name/topic (e.g., "马斯克", "Bitcoin") → still generate search keywords
4. Translate ALL non-English input to English keywords
5. Never return empty array unless input is completely irrelevant (e.g., "hello", "thanks")

【INPUT】
{input_text}

【OUTPUT FORMAT - Strict JSON only, no markdown】
{
  "events": [
    {
      "query_keywords": ["keyword1", "keyword2", "keyword3"],
      "query_en": "English search query",
      "intent": "OUTCOME_PROBABILITY | PRICE_PREDICTION | EVENT_OCCURRENCE | KEYWORD_SEARCH",
      "category": "politics | crypto | sports | entertainment | business | science | legal | other",
      "entities": [
        { "type": "PERSON | ORG | ASSET | LOCATION | DATE", "value": "entity name" }
      ],
      "confidence": 0.0-1.0
    }
  ]
}

【EXAMPLES】

Input: "马斯克"
Output:
{
  "events": [
    {
      "query_keywords": ["Elon", "Musk", "Tesla", "SpaceX", "X", "Twitter"],
      "query_en": "Elon Musk",
      "intent": "KEYWORD_SEARCH",
      "category": "business",
      "entities": [{ "type": "PERSON", "value": "Elon Musk" }],
      "confidence": 0.85
    }
  ]
}

Input: "比特币"
Output:
{
  "events": [
    {
      "query_keywords": ["Bitcoin", "BTC", "crypto", "price"],
      "query_en": "Bitcoin",
      "intent": "KEYWORD_SEARCH",
      "category": "crypto",
      "entities": [{ "type": "ASSET", "value": "Bitcoin" }],
      "confidence": 0.85
    }
  ]
}

Input: "特朗普会赢吗"
Output:
{
  "events": [
    {
      "query_keywords": ["Trump", "win", "election", "president"],
      "query_en": "Will Trump win the presidential election",
      "intent": "OUTCOME_PROBABILITY",
      "category": "politics",
      "entities": [{ "type": "PERSON", "value": "Donald Trump" }],
      "confidence": 0.95
    }
  ]
}

Input: "比特币今年能涨到10万美元吗"
Output:
{
  "events": [
    {
      "query_keywords": ["Bitcoin", "BTC", "price", "100000", "2024"],
      "query_en": "Will Bitcoin reach 100000 USD this year",
      "intent": "PRICE_PREDICTION",
      "category": "crypto",
      "entities": [{ "type": "ASSET", "value": "Bitcoin" }],
      "confidence": 0.90
    }
  ]
}

Input: "你好"
Output:
{
  "events": []
}`;

const QUERY_UNDERSTANDING_CACHE_TTL_MS = 60 * 60 * 1000; // 1h
const QUERY_UNDERSTANDING_CACHE_MAX_SIZE = 1000;
const queryUnderstandingCache = new Map();
const queryUnderstandingInFlight = new Map();

function normalizeQueryForCache(inputText) {
  return (inputText || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function getQueryUnderstandingCacheKey(inputText, options = {}) {
  const normalized = normalizeQueryForCache(inputText);
  const optionsKey = JSON.stringify({
    forceRefresh: !!options.forceRefresh,
  });
  return createHash('sha256').update(`${normalized}|${optionsKey}`).digest('hex');
}

function getCachedQueryUnderstanding(key) {
  const cached = queryUnderstandingCache.get(key);
  if (!cached) return null;
  if (Date.now() - cached.timestamp > QUERY_UNDERSTANDING_CACHE_TTL_MS) {
    queryUnderstandingCache.delete(key);
    return null;
  }
  return cached.value;
}

function setCachedQueryUnderstanding(key, value) {
  if (queryUnderstandingCache.has(key)) {
    queryUnderstandingCache.delete(key);
  }
  queryUnderstandingCache.set(key, { value, timestamp: Date.now() });
  if (queryUnderstandingCache.size > QUERY_UNDERSTANDING_CACHE_MAX_SIZE) {
    const oldestKey = queryUnderstandingCache.keys().next().value;
    if (oldestKey) queryUnderstandingCache.delete(oldestKey);
  }
}

// ============================================
// Response Parsing
// ============================================

/**
 * Parse LLM response to extract structured events
 */
function parseLLMResponse(response) {
  // Try to extract JSON from the response
  let jsonStr = response;
  
  // Remove markdown code blocks if present
  const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    jsonStr = jsonMatch[1];
  }
  
  // Try to find JSON object
  const objectMatch = jsonStr.match(/\{[\s\S]*\}/);
  if (objectMatch) {
    jsonStr = objectMatch[0];
  }
  
  try {
    const parsed = JSON.parse(jsonStr);
    
    // Validate structure
    if (!parsed.events || !Array.isArray(parsed.events)) {
      return { events: [] };
    }
    
    // Validate and clean each event
    const validEvents = parsed.events
      .filter(event => {
        // Must have query_keywords or query_en
        if (!event.query_keywords && !event.query_en) return false;
        // Must have confidence above threshold
        if (event.confidence && event.confidence < QUERY_UNDERSTANDING_CONFIG.minConfidence) return false;
        return true;
      })
      .map(event => ({
        query_keywords: Array.isArray(event.query_keywords) ? event.query_keywords : [],
        query_en: event.query_en || event.query_keywords?.join(' ') || '',
        intent: event.intent || 'OUTCOME_PROBABILITY',
        category: event.category || 'other',
        entities: Array.isArray(event.entities) ? event.entities : [],
        confidence: typeof event.confidence === 'number' ? event.confidence : 0.8,
      }))
      .slice(0, QUERY_UNDERSTANDING_CONFIG.maxOutputEvents);
    
    return { events: validEvents };
    
  } catch (parseError) {
    console.error('[QueryUnderstanding] JSON parse error:', parseError.message);
    return { events: [] };
  }
}

/**
 * Create fallback response when LLM fails
 */
function createFallbackResponse(inputText) {
  // Simple keyword extraction as fallback
  // 使用 Unicode 属性 \p{L} 匹配任何语言的字母，\p{N} 匹配数字
  const words = inputText
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')  // Keep letters (any language) and numbers
    .split(/\s+/)
    .filter(w => w.length > 1)
    .slice(0, 10);
  
  if (words.length === 0) {
    return { events: [] };
  }
  
  return {
    events: [{
      query_keywords: words,
      query_en: words.join(' '),
      intent: 'OUTCOME_PROBABILITY',
      category: 'other',
      entities: [],
      confidence: 0.5,
      _fallback: true,
    }],
  };
}

// ============================================
// Main Function
// ============================================

/**
 * Understand and parse user query
 * 
 * @param {string} inputText - User's input text (can be short query or long text)
 * @param {object} options - Additional options
 * @returns {Promise<object>} Structured query understanding result
 */
export async function understandQuery(inputText, options = {}) {
  const startTime = Date.now();
  
  // Validate input
  if (!inputText || typeof inputText !== 'string') {
    return {
      success: false,
      events: [],
      error: 'Invalid input',
      latencyMs: Date.now() - startTime,
    };
  }
  
  // Truncate if too long
  const truncatedInput = inputText.slice(0, QUERY_UNDERSTANDING_CONFIG.maxInputLength);
  const cacheKey = getQueryUnderstandingCacheKey(truncatedInput, options);

  if (!options.forceRefresh) {
    const cachedResult = getCachedQueryUnderstanding(cacheKey);
    if (cachedResult) {
      return {
        ...cachedResult,
        _cache: 'hit',
        latencyMs: Date.now() - startTime,
      };
    }

    if (queryUnderstandingInFlight.has(cacheKey)) {
      const inFlightResult = await queryUnderstandingInFlight.get(cacheKey);
      return {
        ...inFlightResult,
        _cache: 'in_flight',
        latencyMs: Date.now() - startTime,
      };
    }
  }
  
  // Check if input contains non-ASCII (Chinese, etc.) - needs translation
  const hasNonAscii = /[^\x00-\x7F]/.test(truncatedInput);
  
  // Check if input is too short for LLM
  // For non-ASCII (Chinese), always use LLM for translation
  // For ASCII, use fallback if less than 3 characters
  if (!hasNonAscii && truncatedInput.length < 3) {
    const fallback = createFallbackResponse(truncatedInput);
    const result = {
      success: true,
      ...fallback,
      _method: 'direct',
      latencyMs: Date.now() - startTime,
    };
    setCachedQueryUnderstanding(cacheKey, result);
    return result;
  }
  
  const executionPromise = (async () => {
  try {
    // Build prompt
    const prompt = QUERY_UNDERSTANDING_PROMPT.replace('{input_text}', truncatedInput);
    
    // Call LLM
    const response = await Promise.race([
      callSingleModel(
        QUERY_UNDERSTANDING_CONFIG.model,
        prompt,
        {
          usePlatformKey: true,
          temperature: 0.3,  // Low temperature for consistent output
          maxTokens: 1000,
        }
      ),
      // Timeout promise
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Timeout')), QUERY_UNDERSTANDING_CONFIG.timeoutMs)
      ),
    ]);
    
    // Extract content from response
    const content = response?.content || response?.text || response;
    
    if (!content || typeof content !== 'string') {
      console.warn('[QueryUnderstanding] Empty LLM response, using fallback');
      const fallback = createFallbackResponse(truncatedInput);
      const result = {
        success: true,
        ...fallback,
        _method: 'fallback_empty',
        latencyMs: Date.now() - startTime,
      };
      return result;
    }
    
    // Parse response
    const parsed = parseLLMResponse(content);
    
    // If no events extracted, try fallback
    if (parsed.events.length === 0) {
      const fallback = createFallbackResponse(truncatedInput);
      if (fallback.events.length > 0) {
        const result = {
          success: true,
          ...fallback,
          _method: 'fallback_no_events',
          latencyMs: Date.now() - startTime,
        };
        return result;
      }
    }
    
    const result = {
      success: true,
      ...parsed,
      _method: 'llm',
      latencyMs: Date.now() - startTime,
    };
    setCachedQueryUnderstanding(cacheKey, result);
    return result;
    
  } catch (error) {
    console.error('[QueryUnderstanding] LLM error:', error.message);
    
    // Use fallback on error
    const fallback = createFallbackResponse(truncatedInput);
    const result = {
      success: true,
      ...fallback,
      _method: 'fallback_error',
      _error: error.message,
      latencyMs: Date.now() - startTime,
    };
    return result;
  }
  })();

  queryUnderstandingInFlight.set(cacheKey, executionPromise);
  try {
    return await executionPromise;
  } finally {
    queryUnderstandingInFlight.delete(cacheKey);
  }
}

/**
 * Quick keyword extraction (skip LLM for simple queries)
 */
export function extractKeywords(text) {
  if (!text) return [];
  
  // 使用 Unicode 属性 \p{L} 匹配任何语言的字母，\p{N} 匹配数字
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(w => w.length > 1)
    .filter((w, i, arr) => arr.indexOf(w) === i)  // Unique
    .slice(0, 20);
}

/**
 * Detect language of input text
 */
export function detectLanguage(text) {
  if (!text) return 'en';
  
  // Simple heuristic: check for Chinese characters
  const chineseChars = text.match(/[\u4e00-\u9fff]/g);
  if (chineseChars && chineseChars.length > text.length * 0.1) {
    return 'zh';
  }
  
  return 'en';
}

export default {
  understandQuery,
  extractKeywords,
  detectLanguage,
};
