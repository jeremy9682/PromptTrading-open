/**
 * Polymarket AI 分析控制器
 * 处理预测市场事件的 AI 分析请求
 */

import { callSingleModel } from '../services/ai/openrouter.service.js';
import { callNativeAPI } from '../services/ai/native-api.service.js';
import { generatePolymarketPrompt, generateSystemPrompt } from '../services/polymarket/prompt-generator.service.js';
import { parsePolymarketResponse } from '../services/polymarket/response-parser.service.js';
import { fetchPerplexityData, fetchExternalData } from '../services/polymarket/external-data.service.js';
import { fetchDomeCandlesticks } from '../services/polymarket/free-data.service.js';
import { analyzeComments } from '../services/polymarket/comment-analysis.service.js';
import { deductBalance, getUserBalance } from '../services/billing/credits.service.js';
import prisma from '../lib/prisma.js';
import { getOpenRouterApiKey } from '../config/secrets.js';

// 缓存的 OpenRouter API Key
let cachedOpenRouterApiKey = null;

/**
 * 获取平台的 OpenRouter API Key（从 AWS Secrets Manager 或本地环境变量）
 */
async function getPlatformApiKey() {
  if (cachedOpenRouterApiKey) {
    return cachedOpenRouterApiKey;
  }
  cachedOpenRouterApiKey = await getOpenRouterApiKey();
  return cachedOpenRouterApiKey;
}

// 步骤消息的中英文翻译映射
const stepMessages = {
  startAnalysis: { zh: '开始分析', en: 'Starting analysis' },
  collectingMarketData: { zh: '收集市场数据...', en: 'Collecting market data...' },
  marketDataCollected: { zh: '市场数据收集完成', en: 'Market data collection completed' },
  searchingInfo: { zh: '搜索相关信息...', en: 'Searching for related information...' },
  searchCompleted: { zh: '搜索完成', en: 'Search completed' },
  searchFailed: { zh: '搜索失败', en: 'Search failed' },
  generatingPrompt: { zh: '生成分析 Prompt...', en: 'Generating analysis prompt...' },
  promptGenerated: { zh: 'Prompt 生成完成', en: 'Prompt generation completed' },
  parsingResults: { zh: '解析分析结果...', en: 'Parsing analysis results...' },
  parsingCompleted: { zh: '解析完成', en: 'Parsing completed' },
  analysisCompleted: { zh: '分析完成', en: 'Analysis completed' },
  platformApiNotAvailable: { zh: '平台 API 暂不可用', en: 'Platform API not available' },
  configureApiKey: { zh: '请配置您的 OpenRouter API Key', en: 'Please configure your OpenRouter API Key' },
};

// 获取翻译后的消息
function getStepMessage(key, language = 'zh') {
  const messages = stepMessages[key];
  if (!messages) return key;
  return messages[language] || messages.en || key;
}

// 最低余额要求（美元），低于此余额不允许使用平台 API
// 提高到 $0.05 以确保足够支付大多数模型的单次分析费用
const MINIMUM_BALANCE_REQUIRED = 0.05;
// 浮点数比较容差值，用于处理精度问题（如 0.001 可能存储为 0.00099999...）
const BALANCE_EPSILON = 0.0000001;

/**
 * 验证用户是否可以使用平台 AI API
 * 
 * @param {string} walletAddress - 用户钱包地址
 * @returns {Promise<{ valid: boolean, user?: object, error?: string, errorCode?: string }>}
 */
async function validatePlatformApiAccess(walletAddress) {
  // 1. 必须提供钱包地址（必须登录）
  if (!walletAddress) {
    return {
      valid: false,
      error: '请先登录后再使用平台 AI 服务',
      errorCode: 'LOGIN_REQUIRED'
    };
  }

  // 2. 查找用户（使用不区分大小写的查询，因为数据库可能存储混合大小写的地址）
  const user = await prisma.user.findFirst({
    where: {
      walletAddress: {
        equals: walletAddress,
        mode: 'insensitive'
      }
    }
  });

  if (!user) {
    return {
      valid: false,
      error: '用户未找到，请先登录',
      errorCode: 'USER_NOT_FOUND'
    };
  }

  // 3. 检查余额（使用容差值处理浮点数精度问题）
  const balance = Number(user.aiCreditsBalance || 0);
  // 当余额 + 容差值仍小于最低要求时，才认为余额不足
  if (balance + BALANCE_EPSILON < MINIMUM_BALANCE_REQUIRED) {
    return {
      valid: false,
      error: `AI Credits 余额不足。当前余额: $${balance.toFixed(4)}，最低要求: $${MINIMUM_BALANCE_REQUIRED}`,
      errorCode: 'INSUFFICIENT_BALANCE',
      balance
    };
  }

  return {
    valid: true,
    user,
    balance
  };
}

// 存储分析状态（生产环境应使用 Redis）
const analysisStore = new Map();
const ANALYSIS_STORE_MAX_SIZE = 1000; // 最大存储数量
const ANALYSIS_STORE_TTL = 15 * 60 * 1000; // 15 分钟过期

// 清理过期的分析记录
function cleanupAnalysisStore() {
  const now = Date.now();
  for (const [key, value] of analysisStore.entries()) {
    if (value.timestamp && now - value.timestamp > ANALYSIS_STORE_TTL) {
      analysisStore.delete(key);
    }
  }
  // 如果仍然超过最大数量，删除最旧的记录
  if (analysisStore.size > ANALYSIS_STORE_MAX_SIZE) {
    const entries = Array.from(analysisStore.entries());
    entries.sort((a, b) => (a[1].timestamp || 0) - (b[1].timestamp || 0));
    const deleteCount = analysisStore.size - ANALYSIS_STORE_MAX_SIZE;
    for (let i = 0; i < deleteCount; i++) {
      analysisStore.delete(entries[i][0]);
    }
  }
}

// 每 5 分钟清理一次
setInterval(cleanupAnalysisStore, 5 * 60 * 1000);

// 调试日志工具 - 使用环境变量控制
const DEBUG = process.env.NODE_ENV !== 'production';

function debugLog(section, data) {
  if (!DEBUG) return;

  const timestamp = new Date().toISOString();
  console.log('\n' + '='.repeat(60));
  console.log(`[${timestamp}] 🔍 ${section}`);
  console.log('='.repeat(60));

  if (typeof data === 'object') {
    console.log(JSON.stringify(data, null, 2));
  } else {
    console.log(data);
  }
  console.log('-'.repeat(60) + '\n');
}

/**
 * 流式分析事件（SSE）
 */
export async function analyzeEventStream(req, res) {
  const {
    event,          // 事件数据 { id, title, description, category, outcomes, volume, ... }
    dataSources,    // 数据源配置 { market: true, news: true, social: true, historical: true, probability: true }
    customPrompt,   // 用户自定义 Prompt
    model,          // AI 模型
    language = 'zh', // 语言
    accountInfo,    // 用户账户信息 { availableBalance, positions, totalPositionsValue, totalPnL }
    riskConfig      // 风控配置 { minConfidence, maxPosition, stopLoss, takeProfit }
  } = req.body;

  // 设置 SSE 响应头
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  // CloudFlare 特定设置 - 禁用响应缓冲
  res.setHeader('CF-Cache-Status', 'DYNAMIC');

  // 立即发送响应头，确保 SSE 连接建立
  res.flushHeaders();

  const analysisId = `analysis-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  // 发送事件的辅助函数 - 确保每次发送后立即 flush
  const sendEvent = (step, status, data = {}) => {
    const event = {
      analysisId,
      step,
      status,
      timestamp: Date.now(),
      ...data
    };
    const message = `data: ${JSON.stringify(event)}\n\n`;
    res.write(message);
    // 确保数据立即发送，不被缓冲
    if (res.flush && typeof res.flush === 'function') {
      res.flush();
    }
  };

  try {
    // 验证必要参数
    if (!event || !event.title) {
      sendEvent('error', 'failed', { error: '缺少事件数据' });
      res.end();
      return;
    }

    // 获取 API 配置
    const apiMode = req.headers['x-api-mode'] || 'openrouter';
    const apiSource = req.headers['x-api-source'] || 'platform';
    const userApiKey = req.headers['x-user-api-key']; // 用户的 OpenRouter API key（也用于 Perplexity 搜索）
    const walletAddress = req.headers['x-wallet-address'];

    // ========== 🔒 安全检查：使用平台 API 必须登录且有足够余额 ==========
    if (apiSource === 'platform' && apiMode !== 'native') {
      console.log('[Polymarket AI] 🔒 检查平台 API 访问权限...');
      const accessCheck = await validatePlatformApiAccess(walletAddress);
      
      if (!accessCheck.valid) {
        console.log(`[Polymarket AI] ❌ 访问被拒绝: ${accessCheck.errorCode} - ${accessCheck.error}`);
        sendEvent('error', 'failed', {
          error: accessCheck.error,
          errorCode: accessCheck.errorCode
        });
        sendEvent('complete', 'failed', {
          error: accessCheck.error,
          errorCode: accessCheck.errorCode
        });
        res.end();
        return;
      }
      
      console.log(`[Polymarket AI] ✅ 访问验证通过，用户余额: $${accessCheck.balance.toFixed(4)}`);
    }

    // ========== DEBUG: 请求信息 ==========
    debugLog('📥 收到分析请求', {
      analysisId,
      apiMode,
      apiSource,
      model: model || 'deepseek',
      language,
      hasCustomPrompt: !!customPrompt,
      dataSources
    });

    debugLog('📋 事件信息', {
      id: event.id,
      title: event.title,
      description: event.description?.substring(0, 200) + '...',
      category: event.category,
      yesPrice: event.yesPrice,
      noPrice: event.noPrice,
      volume: event.volume,
      outcomes: event.outcomes
    });

    // 添加账户信息调试日志
    if (accountInfo) {
      debugLog('💰 用户账户信息', {
        availableBalance: accountInfo.availableBalance,
        totalPositionsValue: accountInfo.totalPositionsValue,
        totalPnL: accountInfo.totalPnL,
        positionsCount: accountInfo.positions?.length || 0
      });
    } else {
      debugLog('💰 用户账户信息', { status: '未提供 accountInfo' });
    }

    // 步骤 1: 开始分析
    sendEvent('init', 'completed', {
      message: getStepMessage('startAnalysis', language),
      data: { eventTitle: event.title }
    });

    // 步骤 2: 收集市场数据
    sendEvent('market_data', 'processing', { message: getStepMessage('collectingMarketData', language) });
    const marketData = {
      price: event.yesPrice || event.outcomes?.[0]?.price || 0.5,
      noPrice: event.noPrice || event.outcomes?.[1]?.price || 0.5,
      volume: event.volume || 0,
      volume24h: event.volume24h || 0,
      liquidity: event.liquidity || 0,
      spread: event.spread || 0,
      bestBid: event.bestBid,
      bestAsk: event.bestAsk,
      oneDayPriceChange: event.oneDayPriceChange,
      oneHourPriceChange: event.oneHourPriceChange
    };

    debugLog('📊 市场数据', marketData);

    sendEvent('market_data', 'completed', {
      message: getStepMessage('marketDataCollected', language),
      data: marketData
    });

    // 步骤 3: 获取网络搜索数据（如果启用）
    // 支持多数据源: Perplexity (付费), Reddit (免费), Google News (免费)
    let searchData = null;

    const needsExternalData = dataSources?.news || dataSources?.social || dataSources?.reddit || dataSources?.googleNews;

    if (needsExternalData) {
      sendEvent('news_search', 'processing', { message: getStepMessage('searchingInfo', language) });
      try {
        // 使用聚合的外部数据获取函数
        const externalData = await fetchExternalData(
          event.title,
          event.description,
          {
            usePerplexity: dataSources?.news && !!userApiKey, // Perplexity 需要 API Key
            useReddit: dataSources?.social !== false || dataSources?.reddit === true, // Reddit: social 未禁用 或 reddit 明确启用
            useGoogleNews: dataSources?.news !== false || dataSources?.googleNews === true, // Google News: news 未禁用 或 googleNews 明确启用
            usePriceAnalysis: true, // 启用 K 线价格走势分析
            conditionId: event.conditionId || event.id, // Polymarket conditionId 用于获取 K 线数据 (id 也是 conditionId)
            openrouterApiKey: userApiKey,
            language: language === 'zh' ? 'zh' : 'en',
            eventCategory: event.category // 传递事件分类以获取更准确的 Reddit 数据
          }
        );

        searchData = {
          perplexity: externalData.perplexity,
          reddit: externalData.reddit,
          googleNews: externalData.googleNews,
          wikipedia: externalData.wikipedia,
          priceAnalysis: externalData.priceAnalysis
        };

        debugLog('📰 搜索数据', {
          hasPerplexity: !!externalData.perplexity,
          perplexitySummary: externalData.perplexity?.summary?.substring(0, 200),
          perplexitySourcesCount: externalData.perplexity?.sources?.length || 0,
          hasReddit: !!externalData.reddit,
          redditPosts: externalData.reddit?.totalPosts || 0,
          redditSentiment: externalData.reddit?.sentiment?.overall,
          hasGoogleNews: !!externalData.googleNews,
          googleNewsArticles: externalData.googleNews?.articlesCount || 0,
          hasWikipedia: !!externalData.wikipedia,
          wikipediaArticles: externalData.wikipedia?.articlesCount || 0,
          hasPriceAnalysis: !!externalData.priceAnalysis,
          priceTrend: externalData.priceAnalysis?.trend || 'N/A'
        });

        sendEvent('news_search', 'completed', {
          message: getStepMessage('searchCompleted', language),
          data: {
            // Perplexity 数据
            searchResults: externalData.perplexity ? 'available' : 'unavailable',
            perplexitySummary: externalData.perplexity?.summary || null,
            sources: externalData.perplexity?.sources || [],
            // Reddit 数据
            reddit: externalData.reddit ? {
              totalPosts: externalData.reddit.totalPosts,
              sentiment: externalData.reddit.sentiment,
              topDiscussions: externalData.reddit.topDiscussions?.slice(0, 3),
              trendingKeywords: externalData.reddit.trendingKeywords?.slice(0, 5),
              activityLevel: externalData.reddit.activityLevel
            } : null,
            // Google News 数据
            googleNews: externalData.googleNews ? {
              articlesCount: externalData.googleNews.articlesCount,
              articles: externalData.googleNews.articles?.slice(0, 3),
              sources: externalData.googleNews.sources?.slice(0, 5)
            } : null,
            // Wikipedia 背景知识
            wikipedia: externalData.wikipedia ? {
              articlesCount: externalData.wikipedia.articlesCount,
              articles: externalData.wikipedia.articles?.slice(0, 3)
            } : null
          }
        });
      } catch (err) {
        console.error('Search fetch error:', err);
        debugLog('❌ 搜索错误', { error: err.message });
        sendEvent('news_search', 'completed', {
          message: getStepMessage('searchFailed', language),
          data: { warning: err.message }
        });
      }
    } else {
      debugLog('⏭️ 跳过搜索', { reason: 'No external data sources enabled' });
    }

    // 步骤 4: 生成 AI Prompt
    sendEvent('prompt_generation', 'processing', { message: getStepMessage('generatingPrompt', language) });
    const systemPrompt = generateSystemPrompt(language);
    const userPrompt = generatePolymarketPrompt({
      event,
      marketData,
      searchData,
      customPrompt,
      dataSources,
      accountInfo,  // 传入用户账户信息
      riskConfig,   // 传入风控配置
      language
    });

    // ============ DEBUG: 完整 Prompt 输出 ============
    console.log('\n' + '='.repeat(80));
    console.log('🔍 [DEBUG] AI 分析完整输入 Prompt');
    console.log('='.repeat(80));
    console.log('\n📋 SYSTEM PROMPT:');
    console.log('-'.repeat(40));
    console.log(systemPrompt);
    console.log('\n📋 USER PROMPT:');
    console.log('-'.repeat(40));
    console.log(userPrompt);
    console.log('\n📏 PROMPT 统计:');
    console.log('-'.repeat(40));
    console.log(`  System Prompt 长度: ${systemPrompt.length} 字符`);
    console.log(`  User Prompt 长度: ${userPrompt.length} 字符`);
    console.log(`  总长度: ${systemPrompt.length + userPrompt.length} 字符`);
    console.log('='.repeat(80) + '\n');
    // ============ END DEBUG ============

    debugLog('📝 System Prompt', systemPrompt.substring(0, 500) + '...');
    debugLog('📝 User Prompt', userPrompt.substring(0, 1000) + '...');
    debugLog('📏 Prompt 长度', {
      systemPromptLength: systemPrompt.length,
      userPromptLength: userPrompt.length,
      totalLength: systemPrompt.length + userPrompt.length
    });

    sendEvent('prompt_generation', 'completed', {
      message: getStepMessage('promptGenerated', language),
      data: {
        promptLength: userPrompt.length,
        hasCustomPrompt: !!customPrompt,
        dataSources: {
          market: dataSources?.market ?? true,
          news: dataSources?.news ?? false
        }
      }
    });

    // 步骤 5: 调用 AI 模型
    sendEvent('ai_analysis', 'processing', {
      message: `AI analyzing (${model || 'deepseek'})...`
    });

    debugLog('🤖 开始调用 AI', {
      model: model || 'deepseek',
      apiMode,
      apiSource,
      hasUserApiKey: !!req.headers['x-user-api-key']
    });

    let aiResponse;
    let usePlatformKey = false; // 移到外层，用于后续扣费判断
    
    try {
      const startTime = Date.now();

      if (apiMode === 'native') {
        // 使用原生 API
        aiResponse = await callNativeAPI(model || 'deepseek', userPrompt, {
          systemPrompt,
          deepseekApiKey: req.headers['x-deepseek-api-key'],
          qwenApiKey: req.headers['x-qwen-api-key'],
          claudeApiKey: req.headers['x-claude-api-key'],
          openaiApiKey: req.headers['x-openai-api-key'],
          googleApiKey: req.headers['x-google-api-key']
        });
      } else {
        // 使用 OpenRouter

        // 确定使用哪个 API Key
        const platformApiKey = await getPlatformApiKey();
        let effectiveApiKey = null;

        if (apiSource === 'platform') {
          // 用户选择使用平台 API
          if (!platformApiKey) {
            console.log('❌ 平台 API Key 未配置');
            sendEvent('ai_analysis', 'failed', {
              error: 'Platform API not available, please use your own API Key',
              errorCode: 'PLATFORM_API_NOT_AVAILABLE'
            });
            sendEvent('complete', 'failed', {
              error: getStepMessage('platformApiNotAvailable', language),
              errorCode: 'PLATFORM_API_NOT_AVAILABLE'
            });
            res.end();
            return;
          }
          effectiveApiKey = platformApiKey;
          usePlatformKey = true;
          console.log('✅ 使用平台的 OpenRouter API Key');
        } else {
          // 用户使用自己的 API Key
          if (!userApiKey) {
            console.log('❌ 用户未提供 OpenRouter API key');
            sendEvent('ai_analysis', 'failed', {
              error: 'Please configure your OpenRouter API Key',
              errorCode: 'USER_API_KEY_REQUIRED'
            });
            sendEvent('complete', 'failed', {
              error: getStepMessage('configureApiKey', language),
              errorCode: 'USER_API_KEY_REQUIRED'
            });
            res.end();
            return;
          }
          effectiveApiKey = userApiKey;
          console.log('✅ 使用用户的 OpenRouter API Key');
        }

        aiResponse = await callSingleModel(
          model || 'deepseek',
          userPrompt,
          { systemPrompt, userApiKey: effectiveApiKey, usePlatformKey }
        );
      }

      const duration = Date.now() - startTime;

      debugLog('✅ AI 响应完成', {
        duration: `${duration}ms`,
        usage: aiResponse.usage,
        contentLength: aiResponse.content?.length || 0
      });

      debugLog('📄 AI 原始响应内容', aiResponse.content);

      sendEvent('ai_analysis', 'completed', {
        message: 'AI analysis completed',
        data: {
          model: model || 'deepseek',
          tokensUsed: aiResponse.usage?.total_tokens,
          promptTokens: aiResponse.usage?.prompt_tokens,
          completionTokens: aiResponse.usage?.completion_tokens
        }
      });

      // ========== 扣费逻辑 ==========
      // 只有使用平台 API 时才扣费
      if (usePlatformKey) {
        try {
          const walletAddress = req.headers['x-wallet-address'];
          if (walletAddress) {
            // 通过钱包地址查找用户
            const user = await prisma.user.findFirst({
              where: { walletAddress: walletAddress.toLowerCase() }
            });

            if (user) {
              // 获取 OpenRouter 返回的实际费用
              let actualCost = aiResponse.usage?.cost || aiResponse.usage?.total_cost || 0;

              // 如果 OpenRouter 没有返回成本，基于 token 估算
              if (actualCost === 0 && aiResponse.usage) {
                const promptTokens = aiResponse.usage.prompt_tokens || 0;
                const completionTokens = aiResponse.usage.completion_tokens || 0;

                const MODEL_FALLBACK_PRICES = {
                  // 旧版短名称
                  deepseek: { prompt: 0.14, completion: 0.28 },
                  qwen: { prompt: 0.12, completion: 0.24 },
                  'gpt4': { prompt: 5.0, completion: 15.0 },
                  'gpt-4o': { prompt: 5.0, completion: 15.0 },
                  claude: { prompt: 3.0, completion: 15.0 },
                  grok: { prompt: 5.0, completion: 15.0 },
                  gemini: { prompt: 1.25, completion: 5.0 },
                  mixtral: { prompt: 0.24, completion: 0.24 },
                  llama3: { prompt: 0.59, completion: 0.79 },
                  // 完整 OpenRouter 模型 ID
                  'openai/gpt-5.2': { prompt: 5.0, completion: 15.0 },
                  'openai/gpt-5.1': { prompt: 5.0, completion: 15.0 },
                  'openai/gpt-5-pro': { prompt: 10.0, completion: 30.0 },
                  'openai/gpt-5-mini': { prompt: 1.0, completion: 3.0 },
                  'openai/gpt-4o': { prompt: 2.5, completion: 10.0 },
                  'openai/o3-mini': { prompt: 1.1, completion: 4.4 },
                  'anthropic/claude-sonnet-4.5': { prompt: 3.0, completion: 15.0 },
                  'anthropic/claude-opus-4.5': { prompt: 15.0, completion: 75.0 },
                  'anthropic/claude-haiku-4.5': { prompt: 0.8, completion: 4.0 },
                  'anthropic/claude-sonnet-4': { prompt: 3.0, completion: 15.0 },
                  'google/gemini-3-pro-preview': { prompt: 1.25, completion: 5.0 },
                  'google/gemini-2.5-pro': { prompt: 1.25, completion: 5.0 },
                  'google/gemini-2.5-flash': { prompt: 0.075, completion: 0.3 },
                  'x-ai/grok-4.1-fast': { prompt: 3.0, completion: 15.0 },
                  'x-ai/grok-4': { prompt: 3.0, completion: 15.0 },
                  'x-ai/grok-4-fast': { prompt: 3.0, completion: 15.0 },
                  'deepseek/deepseek-r1-0528': { prompt: 0.55, completion: 2.19 },
                  'deepseek/deepseek-r1': { prompt: 0.55, completion: 2.19 },
                  'deepseek/deepseek-chat': { prompt: 0.14, completion: 0.28 },
                  'qwen/qwen3-coder': { prompt: 0.3, completion: 0.6 },
                  'qwen/qwen3-max': { prompt: 0.16, completion: 0.64 },
                  'qwen/qwq-32b': { prompt: 0.12, completion: 0.18 },
                  'moonshotai/kimi-k2-0905': { prompt: 1.0, completion: 3.0 },
                  'moonshotai/kimi-k2-thinking': { prompt: 1.0, completion: 3.0 },
                  'moonshotai/kimi-k2': { prompt: 1.0, completion: 3.0 },
                  'meta-llama/llama-4-maverick': { prompt: 0.2, completion: 0.6 },
                  'meta-llama/llama-4-scout': { prompt: 0.08, completion: 0.3 },
                  'mistralai/mistral-large-2512': { prompt: 2.0, completion: 6.0 },
                  'mistralai/codestral-2508': { prompt: 0.3, completion: 0.9 },
                };

                const prices = MODEL_FALLBACK_PRICES[model] || MODEL_FALLBACK_PRICES['deepseek/deepseek-chat'] || MODEL_FALLBACK_PRICES.deepseek;
                const estimatedPromptCost = (promptTokens / 1_000_000) * prices.prompt;
                const estimatedCompletionCost = (completionTokens / 1_000_000) * prices.completion;
                actualCost = estimatedPromptCost + estimatedCompletionCost;

                console.log(`[Polymarket AI] ⚠️ OpenRouter 未返回成本，使用 token 估算: $${actualCost.toFixed(6)}`);
              }

              // 只有在有成本时才扣费
              if (actualCost > 0) {
                const deductionResult = await deductBalance(user.id, {
                  type: 'ai_analysis',
                  description: `Polymarket AI Analysis (${model || 'deepseek'})`,
                  aiModel: model || 'deepseek',
                  aiModelName: aiResponse.modelName || model || 'deepseek',
                  promptTokens: aiResponse.usage?.prompt_tokens || 0,
                  completionTokens: aiResponse.usage?.completion_tokens || 0,
                  openRouterCost: actualCost,
                });

                console.log(`[Polymarket AI] ✅ 扣费成功: $${deductionResult.totalCost.toFixed(6)}, 新余额: $${deductionResult.newBalance.toFixed(6)}`);
              } else {
                console.log('[Polymarket AI] ⚠️ 成本为 0，跳过扣费');
              }
            } else {
              console.log(`[Polymarket AI] ⚠️ 未找到用户: ${walletAddress}`);
            }
          } else {
            console.log('[Polymarket AI] ⚠️ 未提供钱包地址，跳过扣费');
          }
        } catch (deductError) {
          console.error('[Polymarket AI] ❌ 扣费失败:', deductError);
          // 扣费失败不阻止返回结果
        }
      }
    } catch (err) {
      console.error('AI call error:', err);
      debugLog('❌ AI 调用失败', { error: err.message, stack: err.stack });
      sendEvent('ai_analysis', 'failed', {
        error: `AI call failed: ${err.message}`
      });
      sendEvent('complete', 'failed', { error: err.message });
      res.end();
      return;
    }

    // 步骤 6: 解析 AI 响应
    sendEvent('parsing', 'processing', { message: getStepMessage('parsingResults', language) });
    const parsedResult = parsePolymarketResponse(aiResponse.content, language);

    debugLog('🔍 解析结果', {
      hasSummary: !!parsedResult.summary,
      hasReasoning: !!parsedResult.reasoning?.detailedAnalysis,
      factorsCount: parsedResult.reasoning?.factors?.length || 0,
      probability: parsedResult.probability,
      marketAssessment: parsedResult.marketAssessment,
      decision: parsedResult.decision,
      hasParseWarning: !!parsedResult.parseWarning
    });

    if (parsedResult.parseWarning) {
      debugLog('⚠️ 解析警告', parsedResult.parseWarning);
    }

    sendEvent('parsing', 'completed', { message: getStepMessage('parsingCompleted', language) });

    // 步骤 7: 返回最终结果
    const finalResult = {
      analysisId,
      timestamp: Date.now(),
      eventId: event.id,
      eventTitle: event.title,
      model: model || 'deepseek',

      // 市场数据摘要
      marketSummary: marketData,

      // 搜索数据
      searchResult: {
        // Perplexity
        searchSummary: searchData?.perplexity?.summary || null,
        sources: searchData?.perplexity?.sources || [],
        // Reddit
        reddit: searchData?.reddit || null,
        // Google News
        googleNews: searchData?.googleNews || null,
        // Wikipedia 背景知识
        wikipedia: searchData?.wikipedia || null
      },

      // AI 分析结果
      analysis: parsedResult,

      // 原始 AI 响应（可选）
      rawResponse: aiResponse.content,

      // Token 使用情况
      usage: aiResponse.usage
    };

    // 存储结果
    analysisStore.set(analysisId, finalResult);

    debugLog('🎯 最终分析结果', {
      analysisId,
      eventTitle: event.title,
      model: model || 'deepseek',
      summary: parsedResult.summary?.substring(0, 200),
      probability: parsedResult.probability,
      marketAssessment: parsedResult.marketAssessment,
      decision: parsedResult.decision,
      risksCount: parsedResult.risks?.length || 0,
      insightsCount: parsedResult.keyInsights?.length || 0,
      tokensUsed: aiResponse.usage?.total_tokens
    });

    debugLog('✅ 分析完成', `Analysis ID: ${analysisId}`);

    // SSE 只发送 analysisId，前端通过 API 获取完整结果
    // 这样可以避免大数据包被 CloudFlare 缓冲/截断
    sendEvent('complete', 'completed', {
      message: getStepMessage('analysisCompleted', language),
      analysisId: analysisId  // 只发送 ID，不发送完整结果 (10-30KB)
    });

    res.end();
  } catch (err) {
    console.error('Polymarket analysis error:', err);
    debugLog('❌ 分析出错', { error: err.message, stack: err.stack });
    sendEvent('error', 'failed', { error: err.message });
    res.end();
  }
}

/**
 * 一次性分析事件（非流式）
 */
export async function analyzeEvent(req, res) {
  const {
    event,
    dataSources,
    customPrompt,
    model,
    language = 'zh',
    accountInfo     // 用户账户信息
  } = req.body;

  const analysisId = `analysis-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  try {
    // 验证必要参数
    if (!event || !event.title) {
      return res.status(400).json({
        success: false,
        error: '缺少事件数据'
      });
    }

    const apiMode = req.headers['x-api-mode'] || 'openrouter';
    const apiSource = req.headers['x-api-source'] || 'platform';
    const userApiKey = req.headers['x-user-api-key']; // 用户的 OpenRouter API key（也用于 Perplexity 搜索）
    const walletAddress = req.headers['x-wallet-address'];

    // ========== 🔒 安全检查：使用平台 API 必须登录且有足够余额 ==========
    if (apiSource === 'platform' && apiMode !== 'native') {
      console.log('[Polymarket AI 非流式] 🔒 检查平台 API 访问权限...');
      const accessCheck = await validatePlatformApiAccess(walletAddress);
      
      if (!accessCheck.valid) {
        console.log(`[Polymarket AI 非流式] ❌ 访问被拒绝: ${accessCheck.errorCode} - ${accessCheck.error}`);
        return res.status(403).json({
          success: false,
          error: accessCheck.error,
          errorCode: accessCheck.errorCode
        });
      }
      
      console.log(`[Polymarket AI 非流式] ✅ 访问验证通过，用户余额: $${accessCheck.balance.toFixed(4)}`);
    }

    debugLog('📥 [非流式] 收到分析请求', {
      analysisId,
      apiMode,
      apiSource,
      model: model || 'deepseek',
      eventTitle: event.title,
      dataSources
    });

    // 添加账户信息调试日志
    if (accountInfo) {
      debugLog('💰 [非流式] 用户账户信息', {
        availableBalance: accountInfo.availableBalance,
        totalPositionsValue: accountInfo.totalPositionsValue,
        totalPnL: accountInfo.totalPnL,
        positionsCount: accountInfo.positions?.length || 0
      });
    } else {
      debugLog('💰 [非流式] 用户账户信息', { status: '未提供 accountInfo' });
    }

    // 收集市场数据
    const marketData = {
      price: event.yesPrice || event.outcomes?.[0]?.price || 0.5,
      noPrice: event.noPrice || event.outcomes?.[1]?.price || 0.5,
      volume: event.volume || 0,
      volume24h: event.volume24h || 0,
      liquidity: event.liquidity || 0,
      spread: event.spread || 0,
      bestBid: event.bestBid,
      bestAsk: event.bestAsk,
      oneDayPriceChange: event.oneDayPriceChange,
      oneHourPriceChange: event.oneHourPriceChange
    };

    debugLog('📊 [非流式] 市场数据', marketData);

    // 获取搜索数据（支持多数据源）
    let searchData = null;
    const needsExternalData = dataSources?.news || dataSources?.social || dataSources?.reddit || dataSources?.googleNews;

    if (needsExternalData) {
      try {
        // 使用聚合的外部数据获取函数
        const externalData = await fetchExternalData(
          event.title,
          event.description,
          {
            usePerplexity: dataSources?.news && !!userApiKey,
            useReddit: dataSources?.social !== false || dataSources?.reddit === true, // Reddit: social 未禁用 或 reddit 明确启用
            useGoogleNews: dataSources?.news !== false || dataSources?.googleNews === true, // Google News: news 未禁用 或 googleNews 明确启用
            usePriceAnalysis: true, // 启用 K 线价格走势分析
            conditionId: event.conditionId || event.id, // Polymarket conditionId 用于获取 K 线数据 (id 也是 conditionId)
            openrouterApiKey: userApiKey,
            language: language === 'zh' ? 'zh' : 'en',
            eventCategory: event.category // 传递事件分类
          }
        );

        searchData = {
          perplexity: externalData.perplexity,
          reddit: externalData.reddit,
          googleNews: externalData.googleNews,
          wikipedia: externalData.wikipedia,
          priceAnalysis: externalData.priceAnalysis
        };

        debugLog('📰 [非流式] 搜索数据', {
          hasPerplexity: !!externalData.perplexity,
          hasReddit: !!externalData.reddit,
          redditPosts: externalData.reddit?.totalPosts || 0,
          hasGoogleNews: !!externalData.googleNews,
          googleNewsArticles: externalData.googleNews?.articlesCount || 0,
          hasWikipedia: !!externalData.wikipedia,
          wikipediaArticles: externalData.wikipedia?.articlesCount || 0,
          hasPriceAnalysis: !!externalData.priceAnalysis,
          priceTrend: externalData.priceAnalysis?.trend || 'N/A'
        });
      } catch (err) {
        console.error('Search fetch error:', err);
        debugLog('❌ [非流式] 搜索错误', err.message);
      }
    }

    // 生成 Prompt
    const systemPrompt = generateSystemPrompt(language);
    const userPrompt = generatePolymarketPrompt({
      event,
      marketData,
      searchData,
      customPrompt,
      dataSources,
      accountInfo,  // 传入用户账户信息
      language
    });

    // ============ DEBUG: 完整 Prompt 输出 (非流式) ============
    console.log('\n' + '='.repeat(80));
    console.log('🔍 [DEBUG] AI 分析完整输入 Prompt (非流式版本)');
    console.log('='.repeat(80));
    console.log('\n📋 SYSTEM PROMPT:');
    console.log('-'.repeat(40));
    console.log(systemPrompt);
    console.log('\n📋 USER PROMPT:');
    console.log('-'.repeat(40));
    console.log(userPrompt);
    console.log('\n📏 PROMPT 统计:');
    console.log('-'.repeat(40));
    console.log(`  System Prompt 长度: ${systemPrompt.length} 字符`);
    console.log(`  User Prompt 长度: ${userPrompt.length} 字符`);
    console.log(`  总长度: ${systemPrompt.length + userPrompt.length} 字符`);
    console.log('='.repeat(80) + '\n');
    // ============ END DEBUG ============

    debugLog('📝 [非流式] Prompt 长度', {
      systemPromptLength: systemPrompt.length,
      userPromptLength: userPrompt.length
    });

    // 调用 AI
    debugLog('🤖 [非流式] 开始调用 AI', { model: model || 'deepseek', apiMode });
    const startTime = Date.now();

    let aiResponse;
    let usePlatformKey = false; // 移到外层，用于后续扣费判断
    
    if (apiMode === 'native') {
      aiResponse = await callNativeAPI(model || 'deepseek', userPrompt, {
        systemPrompt,
        deepseekApiKey: req.headers['x-deepseek-api-key'],
        qwenApiKey: req.headers['x-qwen-api-key'],
        claudeApiKey: req.headers['x-claude-api-key'],
        openaiApiKey: req.headers['x-openai-api-key'],
        googleApiKey: req.headers['x-google-api-key']
      });
    } else {
      // 使用 OpenRouter

      // 确定使用哪个 API Key
      const platformApiKey = await getPlatformApiKey();
      let effectiveApiKey = null;

      if (apiSource === 'platform') {
        // 用户选择使用平台 API
        if (!platformApiKey) {
          console.log('❌ [非流式] 平台 API Key 未配置');
          return res.status(400).json({
            success: false,
            error: '平台 API 暂不可用，请使用您自己的 API Key',
            errorCode: 'PLATFORM_API_NOT_AVAILABLE'
          });
        }
        effectiveApiKey = platformApiKey;
        usePlatformKey = true;
        console.log('✅ [非流式] 使用平台的 OpenRouter API Key');
      } else {
        // 用户使用自己的 API Key
        if (!userApiKey) {
          console.log('❌ [非流式] 用户未提供 OpenRouter API key');
          return res.status(400).json({
            success: false,
            error: '请配置您的 OpenRouter API Key',
            errorCode: 'USER_API_KEY_REQUIRED'
          });
        }
        effectiveApiKey = userApiKey;
        console.log('✅ [非流式] 使用用户的 OpenRouter API Key');
      }

      aiResponse = await callSingleModel(
        model || 'deepseek',
        userPrompt,
        { systemPrompt, userApiKey: effectiveApiKey, usePlatformKey }
      );
    }

    const duration = Date.now() - startTime;
    debugLog('✅ [非流式] AI 响应完成', {
      duration: `${duration}ms`,
      tokensUsed: aiResponse.usage?.total_tokens
    });

    debugLog('📄 [非流式] AI 原始响应', aiResponse.content);

    // 解析响应
    const parsedResult = parsePolymarketResponse(aiResponse.content, language);

    debugLog('🔍 [非流式] 解析结果', {
      probability: parsedResult.probability,
      decision: parsedResult.decision,
      hasParseWarning: !!parsedResult.parseWarning
    });

    const result = {
      success: true,
      data: {
        analysisId,
        timestamp: Date.now(),
        eventId: event.id,
        eventTitle: event.title,
        model: model || 'deepseek',
        marketSummary: marketData,
        searchResult: {
          // Perplexity
          searchSummary: searchData?.perplexity?.summary || null,
          sources: searchData?.perplexity?.sources || [],
          // Reddit
          reddit: searchData?.reddit || null,
          // Google News
          googleNews: searchData?.googleNews || null,
          // Wikipedia 背景知识
          wikipedia: searchData?.wikipedia || null
        },
        analysis: parsedResult,
        rawResponse: aiResponse.content,
        usage: aiResponse.usage
      }
    };

    // 存储结果
    analysisStore.set(analysisId, result.data);

    debugLog('✅ [非流式] 分析完成', {
      analysisId,
      eventTitle: event.title,
      decision: parsedResult.decision
    });

    // ========== 扣费逻辑 ==========
    // 只有使用平台 API 时才扣费
    if (usePlatformKey) {
      try {
        const walletAddress = req.headers['x-wallet-address'];
        if (walletAddress) {
          // 通过钱包地址查找用户
          const user = await prisma.user.findFirst({
            where: { walletAddress: walletAddress.toLowerCase() }
          });

          if (user) {
            // 获取 OpenRouter 返回的实际费用
            let actualCost = aiResponse.usage?.cost || aiResponse.usage?.total_cost || 0;

            // 如果 OpenRouter 没有返回成本，基于 token 估算
            if (actualCost === 0 && aiResponse.usage) {
              const promptTokens = aiResponse.usage.prompt_tokens || 0;
              const completionTokens = aiResponse.usage.completion_tokens || 0;

              const MODEL_FALLBACK_PRICES = {
                // 旧版短名称
                deepseek: { prompt: 0.14, completion: 0.28 },
                qwen: { prompt: 0.12, completion: 0.24 },
                'gpt4': { prompt: 5.0, completion: 15.0 },
                'gpt-4o': { prompt: 5.0, completion: 15.0 },
                claude: { prompt: 3.0, completion: 15.0 },
                grok: { prompt: 5.0, completion: 15.0 },
                gemini: { prompt: 1.25, completion: 5.0 },
                mixtral: { prompt: 0.24, completion: 0.24 },
                llama3: { prompt: 0.59, completion: 0.79 },
                // 完整 OpenRouter 模型 ID
                'openai/gpt-5.2': { prompt: 5.0, completion: 15.0 },
                'openai/gpt-5.1': { prompt: 5.0, completion: 15.0 },
                'openai/gpt-5-pro': { prompt: 10.0, completion: 30.0 },
                'openai/gpt-5-mini': { prompt: 1.0, completion: 3.0 },
                'openai/gpt-4o': { prompt: 2.5, completion: 10.0 },
                'openai/o3-mini': { prompt: 1.1, completion: 4.4 },
                'anthropic/claude-sonnet-4.5': { prompt: 3.0, completion: 15.0 },
                'anthropic/claude-opus-4.5': { prompt: 15.0, completion: 75.0 },
                'anthropic/claude-haiku-4.5': { prompt: 0.8, completion: 4.0 },
                'anthropic/claude-sonnet-4': { prompt: 3.0, completion: 15.0 },
                'google/gemini-3-pro-preview': { prompt: 1.25, completion: 5.0 },
                'google/gemini-2.5-pro': { prompt: 1.25, completion: 5.0 },
                'google/gemini-2.5-flash': { prompt: 0.075, completion: 0.3 },
                'x-ai/grok-4.1-fast': { prompt: 3.0, completion: 15.0 },
                'x-ai/grok-4': { prompt: 3.0, completion: 15.0 },
                'x-ai/grok-4-fast': { prompt: 3.0, completion: 15.0 },
                'deepseek/deepseek-r1-0528': { prompt: 0.55, completion: 2.19 },
                'deepseek/deepseek-r1': { prompt: 0.55, completion: 2.19 },
                'deepseek/deepseek-chat': { prompt: 0.14, completion: 0.28 },
                'qwen/qwen3-coder': { prompt: 0.3, completion: 0.6 },
                'qwen/qwen3-max': { prompt: 0.16, completion: 0.64 },
                'qwen/qwq-32b': { prompt: 0.12, completion: 0.18 },
                'moonshotai/kimi-k2-0905': { prompt: 1.0, completion: 3.0 },
                'moonshotai/kimi-k2-thinking': { prompt: 1.0, completion: 3.0 },
                'moonshotai/kimi-k2': { prompt: 1.0, completion: 3.0 },
                'meta-llama/llama-4-maverick': { prompt: 0.2, completion: 0.6 },
                'meta-llama/llama-4-scout': { prompt: 0.08, completion: 0.3 },
                'mistralai/mistral-large-2512': { prompt: 2.0, completion: 6.0 },
                'mistralai/codestral-2508': { prompt: 0.3, completion: 0.9 },
              };

              const prices = MODEL_FALLBACK_PRICES[model] || MODEL_FALLBACK_PRICES['deepseek/deepseek-chat'] || MODEL_FALLBACK_PRICES.deepseek;
              const estimatedPromptCost = (promptTokens / 1_000_000) * prices.prompt;
              const estimatedCompletionCost = (completionTokens / 1_000_000) * prices.completion;
              actualCost = estimatedPromptCost + estimatedCompletionCost;

              console.log(`[Polymarket AI 非流式] ⚠️ OpenRouter 未返回成本，使用 token 估算: $${actualCost.toFixed(6)}`);
            }

            // 只有在有成本时才扣费
            if (actualCost > 0) {
              const deductionResult = await deductBalance(user.id, {
                type: 'ai_analysis',
                description: `Polymarket AI Analysis (${model || 'deepseek'})`,
                aiModel: model || 'deepseek',
                aiModelName: aiResponse.modelName || model || 'deepseek',
                promptTokens: aiResponse.usage?.prompt_tokens || 0,
                completionTokens: aiResponse.usage?.completion_tokens || 0,
                openRouterCost: actualCost,
              });

              console.log(`[Polymarket AI 非流式] ✅ 扣费成功: $${deductionResult.totalCost.toFixed(6)}, 新余额: $${deductionResult.newBalance.toFixed(6)}`);
            } else {
              console.log('[Polymarket AI 非流式] ⚠️ 成本为 0，跳过扣费');
            }
          } else {
            console.log(`[Polymarket AI 非流式] ⚠️ 未找到用户: ${walletAddress}`);
          }
        } else {
          console.log('[Polymarket AI 非流式] ⚠️ 未提供钱包地址，跳过扣费');
        }
      } catch (deductError) {
        console.error('[Polymarket AI 非流式] ❌ 扣费失败:', deductError);
        // 扣费失败不阻止返回结果
      }
    }

    res.json(result);
  } catch (err) {
    console.error('Polymarket analysis error:', err);
    debugLog('❌ [非流式] 分析失败', { error: err.message });
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
}

/**
 * 获取分析状态/结果
 */
export async function getAnalysisStatus(req, res) {
  const { analysisId } = req.params;

  const result = analysisStore.get(analysisId);
  if (!result) {
    return res.status(404).json({
      success: false,
      error: '分析结果不存在或已过期'
    });
  }

  res.json({
    success: true,
    data: result
  });
}

/**
 * 测试连接
 */
export async function testConnection(req, res) {
  res.json({
    success: true,
    message: 'Polymarket AI 服务正常',
    timestamp: new Date().toISOString()
  });
}

/**
 * 获取市场 K 线数据 (Dome API)
 * GET /api/polymarket/candlesticks/:conditionId
 */
export async function getCandlesticks(req, res) {
  try {
    const { conditionId } = req.params;
    const { interval = '1h', hours = 72 } = req.query;

    if (!conditionId) {
      return res.status(400).json({
        success: false,
        error: 'conditionId is required'
      });
    }

    console.log(`[Candlesticks API] Fetching data for: ${conditionId.substring(0, 20)}...`);

    const data = await fetchDomeCandlesticks(conditionId, {
      interval,
      hours: parseInt(hours, 10) || 72
    });

    if (!data) {
      return res.json({
        success: true,
        data: null,
        message: 'No candlestick data available for this market'
      });
    }

    res.json({
      success: true,
      data: {
        // 所有 outcome 的 K 线数据（用于多线图表）
        outcomes: data.outcomes || [],
        // 向后兼容：单独返回 yes 的 K 线
        candlesticks: data.yes?.candles || [],
        priceAnalysis: data.priceAnalysis,
        interval: data.interval,
        fetchedAt: data.fetchedAt
      }
    });

  } catch (error) {
    console.error('[Candlesticks API] Error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * 分析事件评论情绪
 * POST /api/polymarket/analyze-comments
 */
export async function analyzeEventComments(req, res) {
  try {
    const { eventId, eventTitle, outcomes, comments, language = 'en' } = req.body;

    if (!eventId || !eventTitle) {
      return res.status(400).json({
        success: false,
        error: 'eventId and eventTitle are required'
      });
    }

    if (!comments || !Array.isArray(comments) || comments.length === 0) {
      // Return empty result if no comments
      return res.json({
        success: true,
        data: {
          overallSentiment: 'neutral',
          confidenceLevel: 'low',
          summary: language === 'zh'
            ? '暂无社区评论数据'
            : 'No community comments available',
          keyArguments: [],
          optionMentions: [],
          notableComments: [],
          analyzedCount: 0,
          totalComments: 0,
          fetchedAt: new Date().toISOString()
        }
      });
    }

    console.log('[Comments API] Analyzing', comments.length, 'comments for:', eventTitle?.substring(0, 50));

    const result = await analyzeComments({
      eventId,
      eventTitle,
      outcomes: outcomes || ['Yes', 'No'],
      comments,
      language
    });

    if (!result) {
      return res.status(500).json({
        success: false,
        error: 'Failed to analyze comments'
      });
    }

    console.log('[Comments API] Returning result:', {
      hasResult: !!result,
      sentiment: result.overallSentiment,
      summary: result.summary?.substring(0, 30),
      analyzedCount: result.analyzedCount,
      totalComments: result.totalComments
    });

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('[Comments API] Error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}
