/**
 * 原生 AI API 服务
 * 支持直接调用各家官方 API：DeepSeek、Qwen、Claude、OpenAI、Google
 * 
 * 注意：此服务独立于 OpenRouter 服务，互不影响
 */

import axios from 'axios';

/**
 * 调用 DeepSeek API
 * 官方文档: https://api-docs.deepseek.com/
 * @param {string} prompt - 提示词
 * @param {object} options - 选项 { systemPrompt, temperature, maxTokens, apiKey }
 * @returns {Promise<object>} 分析结果
 */
export const callDeepSeek = async (prompt, options = {}) => {
  try {
    const apiKey = options.apiKey;
    
    if (!apiKey) {
      throw new Error('未提供 DeepSeek API Key');
    }

    console.log('调用 DeepSeek 官方 API...');

    const messages = [];
    if (options.systemPrompt) {
      messages.push({
        role: 'system',
        content: options.systemPrompt
      });
    }
    messages.push({
      role: 'user',
      content: prompt
    });

    const response = await axios.post(
      'https://api.deepseek.com/v1/chat/completions',
      {
        model: 'deepseek-chat', // DeepSeek 主模型
        messages: messages,
        temperature: options.temperature || 0.7,
        max_tokens: options.maxTokens || 2000,
        stream: false
      },
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 60000
      }
    );

    const result = response.data;

    return {
      success: true,
      provider: 'deepseek',
      content: result.choices[0].message.content,
      usage: result.usage,
      timestamp: new Date().toISOString()
    };

  } catch (error) {
    console.error('DeepSeek API 调用失败:', error.response?.data || error.message);
    
    return {
      success: false,
      provider: 'deepseek',
      error: error.response?.data?.error?.message || error.message,
      timestamp: new Date().toISOString()
    };
  }
};

/**
 * 调用 Qwen（通义千问）API
 * 官方文档: https://help.aliyun.com/zh/model-studio/
 * 使用 OpenAI 兼容模式
 * @param {string} prompt - 提示词
 * @param {object} options - 选项 { systemPrompt, temperature, maxTokens, apiKey }
 * @returns {Promise<object>} 分析结果
 */
export const callQwen = async (prompt, options = {}) => {
  try {
    const apiKey = options.apiKey;
    
    if (!apiKey) {
      throw new Error('未提供 Qwen API Key');
    }

    console.log('调用通义千问（Qwen）官方 API...');

    const messages = [];
    if (options.systemPrompt) {
      messages.push({
        role: 'system',
        content: options.systemPrompt
      });
    }
    messages.push({
      role: 'user',
      content: prompt
    });

    // 使用阿里云 DashScope 的 OpenAI 兼容接口
    const response = await axios.post(
      'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
      {
        model: 'qwen-plus', // Qwen Plus 模型（性价比高）
        messages: messages,
        temperature: options.temperature || 0.7,
        max_tokens: options.maxTokens || 2000
      },
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 60000
      }
    );

    const result = response.data;

    return {
      success: true,
      provider: 'qwen',
      content: result.choices[0].message.content,
      usage: result.usage,
      timestamp: new Date().toISOString()
    };

  } catch (error) {
    console.error('Qwen API 调用失败:', error.response?.data || error.message);
    
    return {
      success: false,
      provider: 'qwen',
      error: error.response?.data?.error?.message || error.message,
      timestamp: new Date().toISOString()
    };
  }
};

/**
 * 调用 Claude API
 * @param {string} prompt - 提示词
 * @param {object} options - 选项 { systemPrompt, temperature, maxTokens, apiKey }
 * @returns {Promise<object>} 分析结果
 */
export const callClaude = async (prompt, options = {}) => {
  try {
    const apiKey = options.apiKey;
    
    if (!apiKey) {
      throw new Error('未提供 Claude API Key');
    }

    console.log('调用 Claude 官方 API...');

    const messages = [];
    if (options.systemPrompt) {
      // Claude 使用 system 参数，不是 messages
    }
    messages.push({
      role: 'user',
      content: prompt
    });

    const response = await axios.post(
      'https://api.anthropic.com/v1/messages',
      {
        model: 'claude-3-5-sonnet-20241022', // 最新版本
        max_tokens: options.maxTokens || 2000,
        temperature: options.temperature || 0.7,
        system: options.systemPrompt || undefined,
        messages: messages
      },
      {
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json'
        },
        timeout: 60000
      }
    );

    const result = response.data;

    return {
      success: true,
      provider: 'claude',
      content: result.content[0].text,
      usage: result.usage,
      timestamp: new Date().toISOString()
    };

  } catch (error) {
    console.error('Claude API 调用失败:', error.response?.data || error.message);
    
    return {
      success: false,
      provider: 'claude',
      error: error.response?.data?.error?.message || error.message,
      timestamp: new Date().toISOString()
    };
  }
};

/**
 * 调用 OpenAI API
 * @param {string} prompt - 提示词
 * @param {object} options - 选项 { systemPrompt, temperature, maxTokens, apiKey }
 * @returns {Promise<object>} 分析结果
 */
export const callOpenAI = async (prompt, options = {}) => {
  try {
    const apiKey = options.apiKey;
    
    if (!apiKey) {
      throw new Error('未提供 OpenAI API Key');
    }

    console.log('调用 OpenAI 官方 API...');

    const messages = [];
    if (options.systemPrompt) {
      messages.push({
        role: 'system',
        content: options.systemPrompt
      });
    }
    messages.push({
      role: 'user',
      content: prompt
    });

    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4o', // GPT-4o 模型
        messages: messages,
        temperature: options.temperature || 0.7,
        max_tokens: options.maxTokens || 2000
      },
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 60000
      }
    );

    const result = response.data;

    return {
      success: true,
      provider: 'openai',
      content: result.choices[0].message.content,
      usage: result.usage,
      timestamp: new Date().toISOString()
    };

  } catch (error) {
    console.error('OpenAI API 调用失败:', error.response?.data || error.message);
    
    return {
      success: false,
      provider: 'openai',
      error: error.response?.data?.error?.message || error.message,
      timestamp: new Date().toISOString()
    };
  }
};

/**
 * 调用 Google Gemini API
 * @param {string} prompt - 提示词
 * @param {object} options - 选项 { systemPrompt, temperature, maxTokens, apiKey }
 * @returns {Promise<object>} 分析结果
 */
export const callGoogle = async (prompt, options = {}) => {
  try {
    const apiKey = options.apiKey;
    
    if (!apiKey) {
      throw new Error('未提供 Google API Key');
    }

    console.log('调用 Google Gemini 官方 API...');

    // Gemini 的 prompt 格式
    let fullPrompt = prompt;
    if (options.systemPrompt) {
      fullPrompt = `${options.systemPrompt}\n\n${prompt}`;
    }

    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-pro:generateContent?key=${apiKey}`,
      {
        contents: [{
          parts: [{
            text: fullPrompt
          }]
        }],
        generationConfig: {
          temperature: options.temperature || 0.7,
          maxOutputTokens: options.maxTokens || 2000
        }
      },
      {
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 60000
      }
    );

    const result = response.data;

    return {
      success: true,
      provider: 'google',
      content: result.candidates[0].content.parts[0].text,
      usage: result.usageMetadata,
      timestamp: new Date().toISOString()
    };

  } catch (error) {
    console.error('Google API 调用失败:', error.response?.data || error.message);
    
    return {
      success: false,
      provider: 'google',
      error: error.response?.data?.error?.message || error.message,
      timestamp: new Date().toISOString()
    };
  }
};

/**
 * 根据模型选择调用相应的原生 API
 * @param {string} modelId - 模型 ID
 * @param {string} prompt - 提示词
 * @param {object} options - 选项（包含各个 API Key）
 * @returns {Promise<object>} 分析结果
 */
export const callNativeAPI = async (modelId, prompt, options = {}) => {
  // 根据模型 ID 选择调用哪个原生 API
  // options 应该包含：{ deepseekApiKey, qwenApiKey, claudeApiKey, openaiApiKey, googleApiKey, systemPrompt, temperature, maxTokens }
  
  console.log(`调用原生 API - 模型: ${modelId}`);

  switch (modelId) {
    case 'deepseek':
      return await callDeepSeek(prompt, {
        ...options,
        apiKey: options.deepseekApiKey
      });
    
    case 'qwen':
      return await callQwen(prompt, {
        ...options,
        apiKey: options.qwenApiKey
      });
    
    case 'claude':
      return await callClaude(prompt, {
        ...options,
        apiKey: options.claudeApiKey
      });
    
    case 'gpt4':
      return await callOpenAI(prompt, {
        ...options,
        apiKey: options.openaiApiKey
      });
    
    case 'gemini':
      return await callGoogle(prompt, {
        ...options,
        apiKey: options.googleApiKey
      });
    
    // 其他模型默认使用 OpenRouter
    default:
      throw new Error(`模型 ${modelId} 不支持原生 API 模式，请使用 OpenRouter 模式`);
  }
};

/**
 * 检查模型是否支持原生 API
 * @param {string} modelId - 模型 ID
 * @returns {boolean} 是否支持
 */
export const supportsNativeAPI = (modelId) => {
  const supportedModels = ['deepseek', 'qwen', 'claude', 'gpt4', 'gemini'];
  return supportedModels.includes(modelId);
};

