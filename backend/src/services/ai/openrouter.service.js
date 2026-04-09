/**
 * OpenRouter AI 服务
 * 负责调用 OpenRouter API 进行 AI 分析
 */

import axios from 'axios';
import { getOpenRouterApiKey } from '../../config/secrets.js';

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
 * 前端模型 ID 到 OpenRouter 模型名称的映射
 * 确保前端发送的模型名称能够正确映射到 OpenRouter API 所需的格式
 * 按照用户要求的顺序：deepseek, 通义千问, chatgpt, claude, grok
 */
const MODEL_MAPPING = {
  // 主要推荐模型（按顺序）- 已验证可用
  'deepseek': 'deepseek/deepseek-chat',
  'qwen': 'qwen/qwen-2.5-72b-instruct',
  'gpt4': 'openai/gpt-4o',
  'gpt-4': 'openai/gpt-4o',           // 前端兼容性
  'gpt-4o': 'openai/gpt-4o',          // 前端兼容性
  'gpt-4o-mini': 'openai/gpt-4o-mini', // GPT-4o Mini
  'claude': 'anthropic/claude-3-5-sonnet-20241022',
  'claude-3-5-sonnet': 'anthropic/claude-3-5-sonnet-20241022', // 前端兼容性
  'claude-sonnet-3.5': 'anthropic/claude-3-5-sonnet-20241022', // 前端兼容性
  'grok': 'x-ai/grok-beta',

  // 其他常用模型（已验证可用）
  'gemini': 'google/gemini-2.5-pro',
  'mixtral': 'mistralai/mixtral-8x7b-instruct',
  'llama3': 'meta-llama/llama-3.1-70b-instruct'

  // 注意：以下模型在 OpenRouter 可能不可用或已下架，已移除：
  // 'command-r-plus': 需要验证具体的模型 ID
  // 'yi-large': OpenRouter 上可能不可用
};

/**
 * 获取 OpenRouter 模型名称
 * @param {string} modelId - 前端模型 ID 或完整的 OpenRouter 模型 ID
 * @returns {string} OpenRouter 模型名称
 */
export const getOpenRouterModelName = (modelId) => {
  // 如果已经是完整的 OpenRouter 模型 ID（包含 /），直接返回
  if (modelId && modelId.includes('/')) {
    return modelId;
  }

  // 旧版短名称映射（向后兼容）
  const modelName = MODEL_MAPPING[modelId];
  if (!modelName) {
    // 如果没有映射，使用默认模型
    console.warn(`未知的模型 ID: ${modelId}，使用默认模型 deepseek/deepseek-chat`);
    return 'deepseek/deepseek-chat';
  }
  return modelName;
};

/**
 * 调用单个 AI 模型进行分析
 * @param {string} modelId - 模型 ID (如 'claude', 'gpt4')
 * @param {string} prompt - 提示词
 * @param {object} options - 额外选项 { systemPrompt, temperature, maxTokens, userApiKey, usePlatformKey }
 * @returns {Promise<object>} AI 分析结果
 */
export const callSingleModel = async (modelId, prompt, options = {}) => {
  try {
    const baseUrl = process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1';
    const platformApiKey = await getPlatformApiKey();

    // 确定使用哪个 API Key
    let apiKey = options.userApiKey;
    let apiSource = 'user';

    // 如果明确指定使用平台 Key，或者用户没有提供 Key 但平台 Key 可用
    if (options.usePlatformKey && platformApiKey) {
      apiKey = platformApiKey;
      apiSource = 'platform';
      console.log('✅ 使用平台的 OpenRouter API Key');
    } else if (apiKey) {
      console.log('✅ 使用用户的 OpenRouter API Key');
    }

    if (!apiKey) {
      const error = new Error('MISSING_OPENROUTER_API_KEY');
      error.errorCode = 'MISSING_OPENROUTER_API_KEY';
      throw error;
    }

    // 获取对应的 OpenRouter 模型名称
    const modelName = getOpenRouterModelName(modelId);
    
    console.log(`调用模型: ${modelId} -> ${modelName}`);
    
    // 构建消息数组
    const messages = [];
    
    // 如果有 system prompt，添加为 system 消息
    if (options.systemPrompt) {
      messages.push({
        role: 'system',
        content: options.systemPrompt
      });
    }
    
    // 添加用户消息
    messages.push({
      role: 'user',
      content: prompt
    });

    console.log(`发送请求到 OpenRouter, 消息数: ${messages.length}`);

    const response = await axios.post(
      `${baseUrl}/chat/completions`,
      {
        model: modelName,
        messages: messages,
        temperature: options.temperature || 0.7,
        max_tokens: options.maxTokens || 8000,  // 默认 8000，配合提示词长度限制确保完整性
        usage: { include: true },  // 启用实时费用返回，获取 total_cost
      },
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'HTTP-Referer': process.env.APP_URL || 'http://localhost:3000',
          'X-Title': process.env.APP_NAME || 'PromptTrading Open',
          'Content-Type': 'application/json'
        },
        timeout: 120000 // 120秒超时，支持大模型完整响应
      }
    );

    const result = response.data;

    return {
      success: true,
      model: modelId,
      modelName: modelName,
      content: result.choices[0].message.content,
      usage: result.usage,
      apiSource: apiSource, // 'platform' or 'user' - for billing calculation
      timestamp: new Date().toISOString()
    };

  } catch (error) {
    const errorMessage = error.response?.data?.error?.message || error.message;
    console.error(`调用模型 ${modelId} 失败:`, errorMessage);

    // 关键错误应该抛出而不是静默返回，让调用者知道失败了
    const wrappedError = new Error(errorMessage);
    wrappedError.errorCode = error.errorCode || 'AI_CALL_FAILED';
    wrappedError.model = modelId;
    throw wrappedError;
  }
};

/**
 * 调用多个 AI 模型进行对比分析
 * @param {string[]} modelIds - 模型 ID 数组
 * @param {string} prompt - 提示词
 * @param {object} options - 额外选项 { systemPrompt, temperature, maxTokens, userApiKey }
 * @returns {Promise<object[]>} 多个 AI 分析结果
 */
export const callMultipleModels = async (modelIds, prompt, options = {}) => {
  try {
    console.log(`开始多模型对比分析，模型数量: ${modelIds.length}`);
    
    // 并行调用所有模型，传递相同的 options（包括 userApiKey）
    const promises = modelIds.map(modelId => 
      callSingleModel(modelId, prompt, options)
    );
    
    const results = await Promise.all(promises);
    
    // 统计成功和失败的数量
    const successCount = results.filter(r => r.success).length;
    const failureCount = results.filter(r => !r.success).length;
    
    console.log(`多模型调用完成 - 成功: ${successCount}, 失败: ${failureCount}`);
    
    return {
      success: true,
      results: results,
      summary: {
        total: modelIds.length,
        successful: successCount,
        failed: failureCount
      },
      timestamp: new Date().toISOString()
    };

  } catch (error) {
    console.error('多模型调用失败:', error.message);
    
    return {
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
};

/**
 * 测试 OpenRouter 连接
 * @param {string} userApiKey - 用户的 API Key
 * @returns {Promise<object>} 测试结果
 */
export const testConnection = async (userApiKey = null) => {
  try {
    if (!userApiKey) {
      return {
        success: false,
        message: '需要提供 OpenRouter API Key 来测试连接',
        error: 'MISSING_OPENROUTER_API_KEY'
      };
    }

    // 使用最便宜的模型进行测试
    const result = await callSingleModel('llama3', '回复 "连接成功"', { 
      maxTokens: 50,
      userApiKey 
    });
    
    return {
      success: result.success,
      message: result.success ? 'OpenRouter 连接正常' : 'OpenRouter 连接失败',
      details: result
    };

  } catch (error) {
    return {
      success: false,
      message: 'OpenRouter 连接失败',
      error: error.message
    };
  }
};

/**
 * 获取所有支持的模型映射
 * @returns {object} 模型映射对象
 */
export const getAllModelMappings = () => {
  return MODEL_MAPPING;
};

/**
 * 获取所有支持的模型列表（前端展示用）
 * @returns {Array} 模型列表
 */
export const getAvailableModels = () => {
  const models = [
    // 主要推荐模型
    { id: 'deepseek', name: 'DeepSeek', category: 'recommended', provider: 'DeepSeek' },
    { id: 'qwen', name: 'Qwen 2.5 72B', category: 'recommended', provider: 'Alibaba Cloud' },
    { id: 'gpt4', name: 'GPT-4o', category: 'recommended', provider: 'OpenAI' },
    { id: 'claude', name: 'Claude 3.5 Sonnet', category: 'recommended', provider: 'Anthropic' },
    { id: 'grok', name: 'Grok Beta', category: 'recommended', provider: 'xAI' },
    
    // 其他可用模型（已验证）
    { id: 'gemini', name: 'Gemini Pro 1.5', category: 'other', provider: 'Google' },
    { id: 'mixtral', name: 'Mixtral 8x7B', category: 'other', provider: 'Mistral AI' },
    { id: 'llama3', name: 'LLaMA 3.1 70B', category: 'other', provider: 'Meta' }
    
    // 已移除的模型（OpenRouter 上不可用或 ID 不正确）：
    // { id: 'command-r-plus', name: 'Command R+', category: 'other', provider: 'Cohere' },
    // { id: 'yi-large', name: 'Yi Large', category: 'other', provider: 'Yi' }
  ];
  
  return models;
};

/**
 * 从 OpenRouter API 获取所有可用模型（实时数据）
 * @param {string} userApiKey - 用户的 API Key（可选）
 * @returns {Promise<object>} 模型列表结果
 */
export const fetchOpenRouterModels = async (userApiKey = null) => {
  try {
    // 只使用用户提供的 API Key（不再使用系统后备）
    const apiKey = userApiKey;
    const baseUrl = process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1';
    
    if (!apiKey) {
      // 没有用户 API Key，返回本地配置的模型列表
      console.log('⚠️ 未提供 API Key，返回本地模型列表');
      return {
        success: true,
        fallback: true,
        models: getAvailableModels(),
        count: getAvailableModels().length,
        message: '使用本地配置（未设置 API Key）',
        timestamp: new Date().toISOString()
      };
    }

    console.log('✅ 使用用户的 OpenRouter API Key 获取模型列表');

    const response = await axios.get(
      `${baseUrl}/models`,
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      }
    );

    const models = response.data.data || [];
    
    // 格式化模型数据，只返回必要的信息
    const formattedModels = models.map(model => ({
      id: model.id,
      name: model.name || model.id,
      description: model.description,
      pricing: {
        prompt: model.pricing?.prompt,
        completion: model.pricing?.completion
      },
      context_length: model.context_length,
      architecture: model.architecture
    }));

    return {
      success: true,
      models: formattedModels,
      count: formattedModels.length,
      timestamp: new Date().toISOString()
    };

  } catch (error) {
    console.error('获取 OpenRouter 模型列表失败:', error.response?.data || error.message);
    
    // 如果 API 调用失败，返回本地配置的模型列表
    return {
      success: false,
      error: error.message,
      fallback: true,
      models: getAvailableModels(),
      timestamp: new Date().toISOString()
    };
  }
};
