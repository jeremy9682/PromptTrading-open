/**
 * AI 分析控制器
 * 处理 AI 模型调用和市场分析
 *
 * Dual API Mode:
 * - Platform API: User uses our OpenRouter API key, pays token fee + markup + analysis fee
 * - User's own API: User provides their own API key, pays only analysis fee
 */

import {
  callSingleModel,
  callMultipleModels,
  testConnection,
  getAvailableModels,
  fetchOpenRouterModels
} from '../services/ai/openrouter.service.js';
import { callNativeAPI, supportsNativeAPI } from '../services/ai/native-api.service.js';
import { generateUserPrompt } from '../services/prompt/generator.service.js';
import { getSystemPrompt, parseAIResponse, validateAIResponse } from '../services/prompt/system-prompt.js';
import { calculateBilling, formatBillingForResponse, getBillingConfig } from '../services/billing/api-billing.service.js';
import { getBalanceByPrivyUserId, checkBalance, deductBalance, estimateCost } from '../services/billing/credits.service.js';
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

/**
 * 单模型市场分析
 */
export const analyzeMarket = async (req, res) => {
  try {
    const { prompt, model, dataSources, token } = req.body;
    
    // 从请求头获取用户的 API Key
    const userApiKey = req.headers['x-user-api-key'];

    // 验证必需参数
    if (!prompt || !model) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters: prompt and model'
      });
    }

    // 🔍 提前检查 API Key（避免浪费资源）
    if (!userApiKey) {
      console.log('❌ 缺少 OpenRouter API Key，拒绝请求');
      return res.status(400).json({
        success: false,
        errorCode: 'MISSING_OPENROUTER_API_KEY',
        requiresApiKey: 'OpenRouter API Key'
      });
    }

    console.log('收到 AI 分析请求:', { 
      model, 
      promptLength: prompt.length,
      hasUserApiKey: !!userApiKey 
    });

    // 调用 OpenRouter API，传递用户的 API Key
    const result = await callSingleModel(model, prompt, {
      temperature: 0.7,
      maxTokens: 8000,
      userApiKey: userApiKey
    });

    if (!result.success) {
      return res.status(500).json({
        success: false,
        error: result.error,
        model: model
      });
    }

    // 返回分析结果
    res.json({
      success: true,
      data: {
        content: result.content,
        model: result.model,
        modelName: result.modelName,
        usage: result.usage
      },
      timestamp: result.timestamp
    });

  } catch (error) {
    console.error('AI 分析错误:', error);
    res.status(500).json({
      success: false,
      errorCode: error.errorCode,
      error: error.message
    });
  }
};

/**
 * 多模型对比分析
 */
export const compareModels = async (req, res) => {
  try {
    const { prompt, models } = req.body;
    
    // 从请求头获取用户的 API Key
    const userApiKey = req.headers['x-user-api-key'];

    // 验证必需参数
    if (!prompt || !models || !Array.isArray(models) || models.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters: prompt and models (array)'
      });
    }

    if (models.length > 5) {
      return res.status(400).json({
        success: false,
        error: 'Maximum 5 models can be compared at once'
      });
    }

    // 🔍 提前检查 API Key（避免浪费资源）
    if (!userApiKey) {
      console.log('❌ 缺少 OpenRouter API Key，拒绝请求');
      return res.status(400).json({
        success: false,
        errorCode: 'MISSING_OPENROUTER_API_KEY',
        requiresApiKey: 'OpenRouter API Key'
      });
    }

    console.log('收到多模型对比请求:', { 
      modelCount: models.length, 
      models: models,
      promptLength: prompt.length,
      hasUserApiKey: !!userApiKey 
    });

    // 调用多个模型，传递用户的 API Key
    const result = await callMultipleModels(models, prompt, {
      temperature: 0.7,
      maxTokens: 8000,
      userApiKey: userApiKey
    });

    if (!result.success) {
      return res.status(500).json({
        success: false,
        error: result.error
      });
    }

    // 返回对比结果
    res.json({
      success: true,
      data: {
        results: result.results,
        summary: result.summary
      },
      timestamp: result.timestamp
    });

  } catch (error) {
    console.error('多模型对比错误:', error);
    res.status(500).json({
      success: false,
      errorCode: error.errorCode,
      error: error.message
    });
  }
};

/**
 * 测试 OpenRouter 连接
 */
export const testOpenRouter = async (req, res) => {
  try {
    // 从请求头获取用户的 API Key
    const userApiKey = req.headers['x-user-api-key'];
    
    const result = await testConnection(userApiKey);
    
    res.json(result);

  } catch (error) {
    res.status(500).json({
      success: false,
      errorCode: error.errorCode,
      error: error.message
    });
  }
};

/**
 * 智能交易分析
 * 自动生成 Prompt，调用 AI，解析结构化响应
 *
 * API Source (X-API-Source header):
 * - 'user': User provides their own API key (default)
 * - 'platform': User wants to use platform's API key (will be charged token fee + markup)
 */
export const smartTradingAnalysis = async (req, res) => {
  try {
    // API configuration from headers
    const userApiKey = req.headers['x-user-api-key']; // User's OpenRouter API Key
    const apiMode = req.headers['x-api-mode'] || 'openrouter'; // API mode: openrouter or native
    const apiSource = req.headers['x-api-source'] || 'user'; // 'platform' or 'user'
    const deepseekApiKey = req.headers['x-deepseek-api-key'];
    const qwenApiKey = req.headers['x-qwen-api-key'];
    const claudeApiKey = req.headers['x-claude-api-key'];
    const openaiApiKey = req.headers['x-openai-api-key'];
    const googleApiKey = req.headers['x-google-api-key'];

    const {
      model = 'deepseek',
      coins = ['BTC', 'ETH', 'SOL'],
      dataSources = {
        price: true,
        ema: true,
        macd: true,
        rsi: true,
        volume: true,
        funding: true,
        oi: false
      },
      customPrompt = '',
      userAddress = null,
      initialBalance = 10000,
      riskPreference = 'balanced',
      language = 'zh'
    } = req.body;

    // Check if platform API is available
    const platformApiKey = await getPlatformApiKey();
    const platformApiKeyAvailable = !!platformApiKey;

    console.log('收到智能交易分析请求:', {
      model,
      coins,
      dataSources,
      customPrompt: customPrompt ? `已提供 (${customPrompt.length} 字符)` : '未提供',
      userAddress: userAddress ? '已提供' : '未提供',
      initialBalance,
      riskPreference,
      language,
      apiMode,
      apiSource,
      platformApiKeyAvailable,
      hasDeepSeekKey: !!deepseekApiKey,
      hasQwenKey: !!qwenApiKey,
      hasOpenRouterKey: !!userApiKey,
      hasClaudeKey: !!claudeApiKey,
      hasOpenAIKey: !!openaiApiKey,
      hasGoogleKey: !!googleApiKey
    });

    // Step 0: Validate API Key availability
    console.log('步骤 0: 验证 API Key...');

    // Determine if user wants to use platform key
    const wantsPlatformKey = apiSource === 'platform';
    let usePlatformKey = false;
    let userDbId = null;
    let estimatedCostInfo = null;

    // 如果用户想用平台 API，需要检查余额
    if (wantsPlatformKey) {
      if (!platformApiKeyAvailable) {
        return res.status(400).json({
          success: false,
          errorCode: 'PLATFORM_API_NOT_AVAILABLE',
          error: 'Platform API not available, please use your own API Key',
        });
      }

      // 需要 Privy 认证才能使用平台 API
      if (!req.privyUser?.userId) {
        return res.status(401).json({
          success: false,
          errorCode: 'AUTH_REQUIRED',
          error: 'Login required to use Platform API',
        });
      }

      // 获取用户余额
      try {
        const userBalance = await getBalanceByPrivyUserId(req.privyUser.userId);
        userDbId = userBalance.userId;

        // 预估费用
        estimatedCostInfo = estimateCost(model, 5000);
        const estimatedCost = estimatedCostInfo.estimatedCost;

        console.log(`[AI] 用户余额: $${userBalance.balance.toFixed(4)}, 预估费用: $${estimatedCost.toFixed(4)}`);

        // 检查余额是否足够（预估费用的 1.5 倍作为安全边际）
        const safetyMargin = estimatedCost * 1.5;
        if (userBalance.balance < safetyMargin) {
          return res.status(402).json({
            success: false,
            errorCode: 'INSUFFICIENT_BALANCE',
            error: 'Insufficient balance, please recharge',
            currentBalance: userBalance.balance,
            estimatedCost: estimatedCost,
            requiredBalance: safetyMargin,
          });
        }

        usePlatformKey = true;
        console.log('✅ 使用平台的 OpenRouter API Key');
      } catch (error) {
        console.error('[AI] 获取用户余额失败:', error);
        return res.status(500).json({
          success: false,
          errorCode: 'BALANCE_CHECK_FAILED',
          error: 'Unable to check balance, please try again later',
        });
      }
    }

    if (apiMode === 'native' && supportsNativeAPI(model)) {
      // Native API mode: Check for corresponding native API Key
      let requiredKey = null;
      let keyName = '';

      switch (model) {
        case 'deepseek':
          requiredKey = deepseekApiKey;
          keyName = 'DeepSeek API Key';
          break;
        case 'qwen':
          requiredKey = qwenApiKey;
          keyName = 'Qwen API Key';
          break;
        case 'claude':
          requiredKey = claudeApiKey;
          keyName = 'Claude API Key';
          break;
        case 'gpt4':
          requiredKey = openaiApiKey;
          keyName = 'OpenAI API Key';
          break;
        case 'gemini':
          requiredKey = googleApiKey;
          keyName = 'Google API Key';
          break;
      }

      if (!requiredKey) {
        console.log(`❌ 缺少 ${keyName}，拒绝请求`);
        return res.status(400).json({
          success: false,
          errorCode: 'MISSING_NATIVE_API_KEY',
          details: keyName,
          requiresApiKey: keyName
        });
      }

      console.log(`✅ ${keyName} 已提供`);

    } else {
      // OpenRouter mode: Check for API Key (user's or platform's)
      if (!userApiKey && !usePlatformKey) {
        // No user key and platform key not available or not requested
        console.log('❌ 缺少 API Key，拒绝请求');
        return res.status(400).json({
          success: false,
          errorCode: 'MISSING_OPENROUTER_API_KEY',
          requiresApiKey: 'OpenRouter API Key',
          platformApiAvailable: platformApiKeyAvailable
        });
      }

      if (!usePlatformKey) {
        console.log('✅ 使用用户的 OpenRouter API Key');
      }
    }

    // 1. 生成 User Prompt
    console.log('步骤 1: 生成 User Prompt...');
    
    // 获取网络信息（从中间件或默认测试网）
    const isTestnet = req.isTestnet !== undefined ? req.isTestnet : true;
    const networkName = isTestnet ? '测试网' : '主网';
    console.log(`   使用网络: ${networkName}`);
    
    const userPrompt = await generateUserPrompt({
      coins,
      dataSources,
      customPrompt,
      userAddress,
      initialBalance,
      riskPreference,
      language,
      isTestnet  // 传递网络参数
    });

    console.log(`User Prompt 生成成功 (${userPrompt.length} 字符)`);
    console.log('\n' + '='.repeat(80));
    console.log('📝 USER PROMPT (完整内容)');
    console.log('='.repeat(80));
    console.log(userPrompt);
    console.log('='.repeat(80) + '\n');

    // 2. 获取 System Prompt
    const systemPrompt = getSystemPrompt(language);
    console.log(`System Prompt 加载成功 (${systemPrompt.length} 字符)`);
    console.log('\n' + '='.repeat(80));
    console.log('⚙️  SYSTEM PROMPT (完整内容)');
    console.log('='.repeat(80));
    console.log(systemPrompt);
    console.log('='.repeat(80) + '\n');

    // 3. 调用 AI 模型（智能路由）
    console.log('步骤 2: 调用 AI 模型...');
    console.log(`API 模式: ${apiMode}`);
    
    let aiResult;
    
    // 智能路由：根据模式和可用的 API Key 选择调用方式
    if (apiMode === 'native' && supportsNativeAPI(model)) {
      // 原生 API 模式
      console.log(`使用原生 API 调用 ${model}`);
      
      aiResult = await callNativeAPI(model, userPrompt, {
        deepseekApiKey,
        qwenApiKey,
        claudeApiKey,
        openaiApiKey,
        googleApiKey,
        systemPrompt: systemPrompt,
        temperature: 0.7,
        maxTokens: 8000  // 增加到 8000 以支持完整的 JSON 响应
      });
      
    } else {
      // OpenRouter mode - supports both platform and user API keys
      console.log(`使用 OpenRouter 调用 ${model}, API Source: ${usePlatformKey ? 'platform' : 'user'}`);

      // 确定使用哪个 API Key
      const effectiveApiKey = usePlatformKey ? platformApiKey : userApiKey;

      aiResult = await callSingleModel(model, userPrompt, {
        temperature: 0.7,
        maxTokens: 8000,
        systemPrompt: systemPrompt,
        userApiKey: effectiveApiKey,
      });
      
      // 标记 API 来源
      aiResult.apiSource = usePlatformKey ? 'platform' : 'user';
    }

    if (!aiResult.success) {
      return res.status(500).json({
        success: false,
        error: aiResult.error,
        model: model
      });
    }

    console.log('AI 响应接收成功');
    console.log('\n' + '='.repeat(80));
    console.log('🤖 AI RAW RESPONSE (原始响应)');
    console.log('='.repeat(80));
    console.log(aiResult.content);
    console.log('='.repeat(80) + '\n');

    // 4. 解析 AI 响应
    console.log('步骤 3: 解析 AI 响应...');
    const parsed = parseAIResponse(aiResult.content);

    if (!parsed.success) {
      console.error('AI 响应解析失败:', parsed.error);
      return res.status(500).json({
        success: false,
        error: 'AI response format incorrect',
        details: parsed.error,
        rawResponse: parsed.raw
      });
    }

    // 5. 验证响应完整性
    const validation = validateAIResponse(parsed.data);
    if (!validation.valid) {
      console.warn('AI 响应不完整，缺少字段:', validation.missing);
    }

    console.log('AI 分析完成');

    // 6. 过滤 User Prompt - 移除"额外说明"部分（支持中英文）
    let filteredUserPrompt = userPrompt;
    const extraSectionMarkers = ['## 额外说明', '## Additional Instructions'];
    let extraSectionIndex = -1;
    
    // 查找中文或英文的"额外说明"标记
    for (const marker of extraSectionMarkers) {
      const index = userPrompt.indexOf(marker);
      if (index !== -1) {
        extraSectionIndex = index;
        break;
      }
    }
    
    if (extraSectionIndex !== -1) {
      // 找到"额外说明"之前的内容
      filteredUserPrompt = userPrompt.substring(0, extraSectionIndex).trim();
      
      // 找到"额外说明"后面的结束语部分（如果有）
      const endingPhrases = [
        '\n\n请基于以上数据进行深度分析，并提供具体的交易建议。',
        '\n\nPlease provide in-depth analysis based on the above data and specific trading recommendations.'
      ];
      
      for (const phrase of endingPhrases) {
        const endingIndex = userPrompt.indexOf(phrase, extraSectionIndex);
        if (endingIndex !== -1) {
          filteredUserPrompt += phrase;
          break;
        }
      }
    }

    // 7. Calculate billing based on API source
    const actualApiSource = aiResult.apiSource || (usePlatformKey ? 'platform' : 'user');
    const billing = calculateBilling(model, aiResult.usage, actualApiSource);
    const formattedBilling = formatBillingForResponse(billing);

    console.log('计费信息:', formattedBilling);

    // 8. 如果使用平台 API，执行扣费
    let deductionResult = null;
    let newBalance = null;

    if (usePlatformKey && userDbId) {
      try {
        // 获取 OpenRouter 返回的实际费用
        // 优先使用 API 返回的 cost，如果没有则基于 token 估算
        let actualCost = aiResult.usage?.total_cost || aiResult.usage?.cost || 0;
        
        // 🔒 安全措施：如果 OpenRouter 没有返回成本，基于 token 估算
        // 使用保守的估算价格（避免免费使用平台 API）
        if (actualCost === 0 && aiResult.usage) {
          const promptTokens = aiResult.usage.prompt_tokens || 0;
          const completionTokens = aiResult.usage.completion_tokens || 0;
          
          // 使用模型的估算价格（每 1M tokens 的价格）
          const MODEL_FALLBACK_PRICES = {
            deepseek: { prompt: 0.14, completion: 0.28 },
            qwen: { prompt: 0.12, completion: 0.24 },
            'gpt4': { prompt: 5.0, completion: 15.0 },
            'gpt-4o': { prompt: 5.0, completion: 15.0 },
            claude: { prompt: 3.0, completion: 15.0 },
            grok: { prompt: 5.0, completion: 15.0 },
            gemini: { prompt: 1.25, completion: 5.0 },
            mixtral: { prompt: 0.24, completion: 0.24 },
            llama3: { prompt: 0.59, completion: 0.79 },
          };
          
          const prices = MODEL_FALLBACK_PRICES[model] || MODEL_FALLBACK_PRICES.deepseek;
          const estimatedPromptCost = (promptTokens / 1_000_000) * prices.prompt;
          const estimatedCompletionCost = (completionTokens / 1_000_000) * prices.completion;
          actualCost = estimatedPromptCost + estimatedCompletionCost;
          
          console.log(`[AI] ⚠️ OpenRouter 未返回成本，使用 token 估算: $${actualCost.toFixed(6)}`);
        }
        
        // 只有在有成本时才扣费
        if (actualCost > 0) {
          deductionResult = await deductBalance(userDbId, {
            type: 'ai_analysis',
            description: `AI Market Analysis (${model})`,
            aiModel: model,
            aiModelName: aiResult.modelName,
            promptTokens: aiResult.usage?.prompt_tokens || 0,
            completionTokens: aiResult.usage?.completion_tokens || 0,
            openRouterCost: actualCost,
          });

          newBalance = deductionResult.newBalance;
          console.log(`[AI] ✅ 扣费成功: $${deductionResult.totalCost.toFixed(6)}, 新余额: $${newBalance.toFixed(6)}`);
        } else {
          console.log('[AI] ⚠️ 成本为 0，跳过扣费');
        }
      } catch (deductError) {
        console.error('[AI] ❌ 扣费失败:', deductError);
        // 扣费失败不阻止返回结果，但记录错误
        // 实际项目中可能需要更严格的处理
      }
    }

    // 9. Return structured result with billing
    res.json({
      success: true,
      data: {
        analysis: parsed.data,
        metadata: {
          model: aiResult.model,
          modelName: aiResult.modelName,
          usage: aiResult.usage,
          timestamp: aiResult.timestamp,
          validation: validation
        },
        billing: {
          ...formattedBilling,
          // 如果使用平台 API，添加扣费信息
          ...(usePlatformKey && {
            charged: deductionResult?.success || false,
            amountCharged: deductionResult?.totalCost || 0,
            newBalance: newBalance,
          }),
        },
        prompts: {
          userPrompt: filteredUserPrompt,
          systemPrompt: systemPrompt.substring(0, 200) + '...'
        }
      }
    });

  } catch (error) {
    console.error('智能交易分析错误:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

/**
 * 获取本地配置的可用模型列表
 */
export const getModels = async (req, res) => {
  try {
    const models = getAvailableModels();
    
    res.json({
      success: true,
      data: models,
      count: models.length,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      errorCode: error.errorCode,
      error: error.message
    });
  }
};

/**
 * 从 OpenRouter API 获取所有可用模型（实时数据）
 */
export const fetchModels = async (req, res) => {
  try {
    // 从请求头获取用户的 API Key
    const userApiKey = req.headers['x-user-api-key'];

    console.log('获取模型列表请求:', { hasUserApiKey: !!userApiKey });

    const result = await fetchOpenRouterModels(userApiKey);

    res.json(result);

  } catch (error) {
    res.status(500).json({
      success: false,
      errorCode: error.errorCode,
      error: error.message
    });
  }
};

/**
 * Get billing configuration and platform API availability
 * Frontend uses this to determine if platform API option should be shown
 */
export const getBillingInfo = async (req, res) => {
  try {
    const platformApiKey = await getPlatformApiKey();
    const platformApiAvailable = !!platformApiKey;
    const billingConfig = getBillingConfig();

    res.json({
      success: true,
      data: {
        platformApiAvailable,
        billingConfig: {
          platformMarkupPercentage: billingConfig.platformMarkupPercentage,
        },
        description: {
          platform: {
            en: 'Use our API - Pay AI Credits (token cost + 20% markup)',
            zh: '使用平台API - 支付 AI Credits (Token费用 + 20%加价)'
          },
          user: {
            en: 'Use your own API - Free (you pay OpenRouter directly)',
            zh: '使用您的API - 免费 (您直接向OpenRouter付费)'
          }
        },
        pricing: {
          note: 'Cost = OpenRouter price × 1.2',
          examples: [
            { model: 'deepseek', perAnalysis: '$0.08-0.15' },
            { model: 'claude', perAnalysis: '$0.15-0.30' },
            { model: 'gpt4', perAnalysis: '$0.20-0.40' },
          ]
        }
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

