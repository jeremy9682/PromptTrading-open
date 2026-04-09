/**
 * 外部数据服务
 * 通过 Perplexity 获取实时网络搜索数据
 * 支持直接调用 Perplexity API 或通过 OpenRouter 调用
 * 
 * 新增: 免费数据源 (Reddit + Google News)
 */

import dotenv from 'dotenv';
import { fetchAllFreeData, fetchRedditData, fetchGoogleNewsData, fetchDomeCandlesticks } from './free-data.service.js';

dotenv.config();

const PERPLEXITY_API_KEY = process.env.PERPLEXITY_API_KEY;
const OPENROUTER_BASE_URL = process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1';

/**
 * 从 Perplexity 获取实时网络搜索和 AI 分析
 * 支持直接调用 Perplexity API 或通过 OpenRouter 调用
 * @param {string} title - 事件标题
 * @param {string} description - 事件描述
 * @param {object} options - 可选参数 { openrouterApiKey }
 * @returns {object} 搜索结果和 AI 分析
 */
export async function fetchPerplexityData(title, description = '', options = {}) {
  const { openrouterApiKey } = options;

  // 优先使用直接的 Perplexity API Key
  // 如果没有，则使用 OpenRouter 调用 Perplexity 模型
  const useOpenRouter = !PERPLEXITY_API_KEY && openrouterApiKey;

  if (!PERPLEXITY_API_KEY && !openrouterApiKey) {
    console.warn('[Perplexity] No API key available (neither direct nor via OpenRouter)');
    return null;
  }

  try {
    const query = `${title}${description ? '. ' + description : ''}`;

    const messages = [
      {
        role: 'system',
        content: 'You are a research assistant. Search the web for the most recent and relevant information about the given topic. Provide a concise summary with key facts, recent developments, and any relevant statistics. Focus on factual information that would help predict the outcome.'
      },
      {
        role: 'user',
        content: `Research the following prediction market topic and provide relevant recent information:\n\n${query}`
      }
    ];

    let response;
    let apiSource;

    if (useOpenRouter) {
      // 使用 OpenRouter 调用 Perplexity 在线搜索模型
      console.log('[Perplexity] Using OpenRouter to call Perplexity model');
      apiSource = 'openrouter';

      response = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openrouterApiKey}`,
          'HTTP-Referer': process.env.APP_URL || 'http://localhost:3000',
          'X-Title': process.env.APP_NAME || 'PromptTrading Open',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'perplexity/sonar',  // 使用最新的 Perplexity Sonar 模型（支持在线搜索）
          messages,
          temperature: 0.2,
          max_tokens: 1000
        })
      });
    } else {
      // 使用直接的 Perplexity API
      console.log('[Perplexity] Using direct Perplexity API');
      apiSource = 'direct';

      response = await fetch('https://api.perplexity.ai/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${PERPLEXITY_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'llama-3.1-sonar-small-128k-online',
          messages,
          temperature: 0.2,
          max_tokens: 1000,
          return_citations: true
        })
      });
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Perplexity] API error (${apiSource}):`, response.status, errorText);
      return null;
    }

    const data = await response.json();

    // Debug: 记录完整响应结构，帮助调试
    console.log('[Perplexity] Response keys:', Object.keys(data));
    if (data.citations) {
      console.log('[Perplexity] Citations count:', data.citations.length);
    }

    // OpenRouter 和直接 Perplexity API 可能返回不同格式的 citations
    // 尝试从多个可能的位置获取 sources
    let sources = [];

    // 1. 直接 Perplexity API: data.citations (数组形式)
    if (data.citations && Array.isArray(data.citations)) {
      sources = data.citations;
    }
    // 2. OpenRouter 可能在 choices[0].message.citations 返回
    else if (data.choices?.[0]?.message?.citations && Array.isArray(data.choices[0].message.citations)) {
      sources = data.choices[0].message.citations;
    }
    // 3. 一些模型可能返回 sources 字段
    else if (data.sources && Array.isArray(data.sources)) {
      sources = data.sources;
    }

    console.log('[Perplexity] Final sources count:', sources.length);

    return {
      summary: data.choices?.[0]?.message?.content || '',
      sources,
      model: data.model,
      apiSource
    };
  } catch (error) {
    console.error('[Perplexity] Fetch error:', error.message);
    return null;
  }
}

/**
 * 获取所有外部数据（包括免费和付费数据源）
 *
 * @param {string} title - 事件标题
 * @param {string} description - 事件描述
 * @param {object} options - 配置选项
 * @param {boolean} options.usePerplexity - 是否使用 Perplexity (付费)
 * @param {boolean} options.useReddit - 是否使用 Reddit (免费)
 * @param {boolean} options.useGoogleNews - 是否使用 Google News (免费)
 * @param {boolean} options.usePriceAnalysis - 是否使用价格走势分析 (Dome API)
 * @param {string} options.conditionId - Polymarket conditionId (用于获取 K 线数据)
 * @param {string} options.openrouterApiKey - OpenRouter API Key
 * @param {string} options.language - 语言
 * @param {string} options.eventCategory - 事件分类
 * @returns {Promise<object>} 聚合后的外部数据
 */
export async function fetchExternalData(title, description = '', options = {}) {
  const {
    usePerplexity = true,
    useReddit = true,
    useGoogleNews = true,
    usePriceAnalysis = true,
    conditionId = null,
    openrouterApiKey,
    language = 'en',
    eventCategory = ''
  } = options;

  console.log(`[ExternalData] Fetching data for: "${title.substring(0, 50)}..."`);
  console.log(`[ExternalData] Data sources: Perplexity=${usePerplexity}, Reddit=${useReddit}, GoogleNews=${useGoogleNews}, PriceAnalysis=${usePriceAnalysis && !!conditionId}`);

  const results = {
    perplexity: null,
    reddit: null,
    googleNews: null,
    wikipedia: null,
    priceAnalysis: null,
    fetchedAt: new Date().toISOString()
  };

  const promises = [];

  // Perplexity (付费，需要 API Key)
  if (usePerplexity && (PERPLEXITY_API_KEY || openrouterApiKey)) {
    promises.push(
      fetchPerplexityData(title, description, { openrouterApiKey })
        .then(data => { results.perplexity = data; })
        .catch(err => {
          console.error('[ExternalData] Perplexity fetch failed:', err.message);
        })
    );
  }

  // 免费数据源 (Reddit + Google News + Wikipedia)
  if (useReddit || useGoogleNews) {
    promises.push(
      fetchAllFreeData(title, description, { useReddit, useGoogleNews, language, eventCategory })
        .then(data => {
          results.reddit = data?.reddit || null;
          results.googleNews = data?.googleNews || null;
          results.wikipedia = data?.wikipedia || null;
        })
        .catch(err => {
          console.error('[ExternalData] Free data fetch failed:', err.message);
        })
    );
  }

  // K 线价格走势分析 (Dome API)
  if (usePriceAnalysis && conditionId) {
    promises.push(
      fetchDomeCandlesticks(conditionId, { interval: '1h', hours: 72 })
        .then(data => {
          if (data?.priceAnalysis) {
            results.priceAnalysis = data.priceAnalysis;
          }
        })
        .catch(err => {
          console.error('[ExternalData] Price analysis fetch failed:', err.message);
        })
    );
  }

  // 并行获取所有数据
  await Promise.all(promises);

  // 统计获取到的数据源
  const sourcesAvailable = [];
  if (results.perplexity) sourcesAvailable.push('perplexity');
  if (results.reddit) sourcesAvailable.push('reddit');
  if (results.googleNews) sourcesAvailable.push('googleNews');
  if (results.wikipedia) sourcesAvailable.push('wikipedia');
  if (results.priceAnalysis) sourcesAvailable.push('priceAnalysis');

  console.log(`[ExternalData] Available sources: ${sourcesAvailable.join(', ') || 'none'}`);

  return results;
}

// 导出免费数据获取函数供其他模块使用
export { fetchAllFreeData, fetchRedditData, fetchGoogleNewsData };
