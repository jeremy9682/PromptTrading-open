/**
 * AI API Key 管理工具
 * 支持多种 API 提供商：OpenRouter、Claude、OpenAI、Google 等
 */

/**
 * 支持的 API 提供商
 * 按推荐顺序排列：deepseek, qwen 在最前面
 */
export const API_PROVIDERS = {
  DEEPSEEK: 'deepseek',
  QWEN: 'qwen',
  OPENROUTER: 'openrouter',
  CLAUDE: 'claude',
  OPENAI: 'openai',
  GOOGLE: 'google'
};

/**
 * 获取指定提供商的 API Key
 * @param {string} address - 钱包地址
 * @param {string} provider - API 提供商 (openrouter, claude, openai, google)
 * @returns {string|null} API Key 或 null
 */
export const getApiKey = (address, provider = API_PROVIDERS.OPENROUTER) => {
  if (!address) return null;
  
  try {
    const key = localStorage.getItem(`${provider}_apikey_${address}`);
    return key || null;
  } catch (error) {
    console.error(`获取 ${provider} API Key 失败:`, error);
    return null;
  }
};

/**
 * 获取所有已设置的 API Keys
 * @param {string} address - 钱包地址
 * @returns {object} 所有 API Keys
 */
export const getAllApiKeys = (address) => {
  if (!address) return {};
  
  const keys = {};
  Object.values(API_PROVIDERS).forEach(provider => {
    const key = getApiKey(address, provider);
    if (key) {
      keys[provider] = key;
    }
  });
  
  return keys;
};

/**
 * 保存 API Key
 * @param {string} address - 钱包地址
 * @param {string} apiKey - API Key
 * @param {string} provider - API 提供商
 * @returns {boolean} 是否保存成功
 */
export const saveApiKey = (address, apiKey, provider = API_PROVIDERS.OPENROUTER) => {
  if (!address || !apiKey) {
    console.error('地址或 API Key 为空');
    return false;
  }

  try {
    localStorage.setItem(`${provider}_apikey_${address}`, apiKey);
    console.log(`✅ ${provider} API Key 已保存`);
    return true;
  } catch (error) {
    console.error(`保存 ${provider} API Key 失败:`, error);
    return false;
  }
};

/**
 * 删除 API Key
 * @param {string} address - 钱包地址
 * @param {string} provider - API 提供商
 * @returns {boolean} 是否删除成功
 */
export const deleteApiKey = (address, provider = API_PROVIDERS.OPENROUTER) => {
  if (!address) return false;

  try {
    localStorage.removeItem(`${provider}_apikey_${address}`);
    console.log(`🗑️ ${provider} API Key 已删除`);
    return true;
  } catch (error) {
    console.error(`删除 ${provider} API Key 失败:`, error);
    return false;
  }
};

/**
 * 验证 API Key 格式
 * @param {string} apiKey - API Key
 * @param {string} provider - API 提供商
 * @returns {object} { valid: boolean, message: string }
 */
export const validateApiKey = (apiKey, provider = API_PROVIDERS.OPENROUTER) => {
  if (!apiKey || apiKey.trim() === '') {
    return {
      valid: false,
      message: 'API Key 不能为空'
    };
  }

  // 根据不同提供商验证格式
  switch (provider) {
    case API_PROVIDERS.DEEPSEEK:
      if (!apiKey.startsWith('sk-')) {
        return { valid: false, message: 'DeepSeek API Key 应以 "sk-" 开头' };
      }
      break;
    
    case API_PROVIDERS.QWEN:
      if (!apiKey.startsWith('sk-')) {
        return { valid: false, message: 'Qwen API Key 应以 "sk-" 开头' };
      }
      break;
    
    case API_PROVIDERS.OPENROUTER:
      if (!apiKey.startsWith('sk-')) {
        return { valid: false, message: 'OpenRouter API Key 应以 "sk-" 开头' };
      }
      break;
    
    case API_PROVIDERS.CLAUDE:
      if (!apiKey.startsWith('sk-ant-')) {
        return { valid: false, message: 'Claude API Key 应以 "sk-ant-" 开头' };
      }
      break;
    
    case API_PROVIDERS.OPENAI:
      if (!apiKey.startsWith('sk-')) {
        return { valid: false, message: 'OpenAI API Key 应以 "sk-" 开头' };
      }
      break;
    
    case API_PROVIDERS.GOOGLE:
      if (!apiKey.startsWith('AIza')) {
        return { valid: false, message: 'Google API Key 应以 "AIza" 开头' };
      }
      break;
  }

  // 长度检查（通常 > 30 个字符）
  if (apiKey.length < 30) {
    return {
      valid: false,
      message: 'API Key 长度不足，请检查是否完整'
    };
  }

  return {
    valid: true,
    message: 'API Key 格式正确'
  };
};

/**
 * 检查是否有可用的 API Key（任意提供商）
 * @param {string} address - 钱包地址
 * @returns {boolean} 是否有可用的 API Key
 */
export const hasApiKey = (address) => {
  // 优先检查 OpenRouter（推荐）
  const openrouterKey = getApiKey(address, API_PROVIDERS.OPENROUTER);
  if (openrouterKey) return true;
  
  // 检查其他提供商
  const allKeys = getAllApiKeys(address);
  return Object.keys(allKeys).length > 0;
};

/**
 * 检查指定提供商是否有 API Key
 * @param {string} address - 钱包地址
 * @param {string} provider - API 提供商
 * @returns {boolean} 是否有可用的 API Key
 */
export const hasProviderApiKey = (address, provider) => {
  const key = getApiKey(address, provider);
  return key !== null && key.trim() !== '';
};

/**
 * 获取 API 模式偏好设置
 * @param {string} address - 钱包地址
 * @returns {string} 'openrouter' 或 'native'
 */
export const getApiMode = (address) => {
  if (!address) return 'openrouter';
  
  try {
    const mode = localStorage.getItem(`api_mode_${address}`);
    return mode || 'openrouter'; // 默认使用 OpenRouter
  } catch (error) {
    return 'openrouter';
  }
};

/**
 * 保存 API 模式偏好设置
 * @param {string} address - 钱包地址
 * @param {string} mode - 'openrouter' 或 'native'
 */
export const saveApiMode = (address, mode) => {
  if (!address) return;

  try {
    localStorage.setItem(`api_mode_${address}`, mode);
    console.log(`✅ API 模式设置为: ${mode}`);
  } catch (error) {
    console.error('保存 API 模式失败:', error);
  }
};

/**
 * Get API source preference (platform or user)
 * @param {string} address - Wallet address
 * @returns {string} 'platform' or 'user'
 */
export const getApiSource = (address) => {
  if (!address) return 'platform';

  try {
    const source = localStorage.getItem(`api_source_${address}`);
    return source || 'platform'; // Default to platform API
  } catch (error) {
    return 'platform';
  }
};

/**
 * Save API source preference
 * @param {string} address - Wallet address
 * @param {string} source - 'platform' or 'user'
 */
export const saveApiSource = (address, source) => {
  if (!address) return;

  try {
    localStorage.setItem(`api_source_${address}`, source);
    console.log(`✅ API source set to: ${source}`);
  } catch (error) {
    console.error('Failed to save API source:', error);
  }
};

