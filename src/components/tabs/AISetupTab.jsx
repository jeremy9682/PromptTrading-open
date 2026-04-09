import React, { useState, useEffect } from 'react';
import { Check, AlertCircle, ExternalLink, Info, Eye, EyeOff, Zap, Key } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import {
  API_PROVIDERS,
  getApiKey,
  saveApiKey,
  deleteApiKey,
  validateApiKey,
  getApiMode,
  saveApiMode,
  getApiSource,
  saveApiSource,
  getAllApiKeys
} from '../../utils/apikey';
import { AILogo } from '../../constants/data.jsx';
import { aiAPI } from '../../utils/api';

const cardClass = 'bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-700 rounded-2xl shadow-sm';
const mutedText = 'text-gray-600 dark:text-gray-400';

const AISetupTab = ({ language }) => {
  // Use Privy auth - works with email login, embedded wallet, and external wallets
  const { authenticated, walletAddress } = useAuth();

  // For backwards compatibility, use walletAddress as account
  const account = walletAddress;
  const isConnected = authenticated;

  // API mode: openrouter (recommended) or native
  const [apiMode, setApiMode] = useState('openrouter');

  // API source: 'platform' or 'user'
  const [apiSource, setApiSource] = useState('platform');

  // Platform API availability (fetched from backend) - default to true to allow selection
  const [platformApiAvailable, setPlatformApiAvailable] = useState(true);
  const [billingInfo, setBillingInfo] = useState(null);

  // API Key states
  const [apiKeys, setApiKeys] = useState({
    deepseek: '',
    qwen: '',
    openrouter: '',
    claude: '',
    openai: '',
    google: ''
  });

  const [savedApiKeys, setSavedApiKeys] = useState({});
  const [showApiKeys, setShowApiKeys] = useState({});
  const [saveSuccess, setSaveSuccess] = useState(null);

  // Load saved API Keys, mode, and source
  useEffect(() => {
    if (account) {
      loadSavedApiKeys();
      const mode = getApiMode(account);
      const source = getApiSource(account);
      setApiMode(mode);
      setApiSource(source);
    }
  }, [account]);

  // Fetch billing info on mount
  useEffect(() => {
    const fetchBillingInfo = async () => {
      try {
        const response = await aiAPI.getBillingInfo();
        if (response.success) {
          setPlatformApiAvailable(response.data.platformApiAvailable);
          setBillingInfo(response.data);
        }
      } catch (error) {
        console.error('Failed to fetch billing info:', error);
      }
    };
    fetchBillingInfo();
  }, []);

  const loadSavedApiKeys = () => {
    if (!account) return;
    
    const allKeys = getAllApiKeys(account);
    setSavedApiKeys(allKeys);
    setApiKeys(prev => ({
      ...prev,
      ...allKeys
    }));
  };

  // 保存单个 API Key
  const handleSaveApiKey = (provider) => {
    if (!account) {
      alert(language === 'zh' ? '请先连接钱包' : 'Please connect wallet first');
      return;
    }

    const key = apiKeys[provider];
    if (!key || key.trim() === '') {
      alert(language === 'zh' ? '请输入有效的 API Key' : 'Please enter a valid API Key');
      return;
    }

    // 验证格式
    const validation = validateApiKey(key, provider);
    if (!validation.valid) {
      alert(validation.message);
      return;
    }

    // 保存
    const success = saveApiKey(account, key, provider);
    if (success) {
      setSavedApiKeys(prev => ({ ...prev, [provider]: key }));
      setSaveSuccess(provider);
      setTimeout(() => setSaveSuccess(null), 3000);
    }
  };

  // 删除单个 API Key
  const handleDeleteApiKey = (provider) => {
    if (!confirm(language === 'zh' ? '确定要删除保存的 API Key 吗？' : 'Are you sure to delete saved API Key?')) {
      return;
    }

    deleteApiKey(account, provider);
    setSavedApiKeys(prev => {
      const updated = { ...prev };
      delete updated[provider];
      return updated;
    });
    setApiKeys(prev => ({ ...prev, [provider]: '' }));
  };

  // Switch API mode
  const handleModeChange = (mode) => {
    setApiMode(mode);
    if (account) {
      saveApiMode(account, mode);
    }
  };

  // Switch API source (platform or user)
  const handleApiSourceChange = (source) => {
    setApiSource(source);
    if (account) {
      saveApiSource(account, source);
    }
  };

  // API Key 配置列表（按推荐顺序：deepseek, qwen 在最前面）
  const apiConfigs = [
    {
      provider: API_PROVIDERS.DEEPSEEK,
      name: 'DeepSeek',
      modelId: 'deepseek',
      icon: '🔮',
      brandColor: 'from-indigo-500 to-purple-600',
      placeholder: 'sk-...',
      description: language === 'zh' ? 'DeepSeek 官方 API（高性价比）' : 'DeepSeek Official API (Best Value)',
      link: 'https://platform.deepseek.com/api_keys',
      mode: 'native'
    },
    {
      provider: API_PROVIDERS.QWEN,
      name: language === 'zh' ? '通义千问' : 'Qwen',
      modelId: 'qwen',
      icon: '💫',
      brandColor: 'from-red-500 to-orange-500',
      placeholder: 'sk-...',
      description: language === 'zh' ? '阿里云百炼 API（中文优化）' : 'Alibaba Cloud API (Chinese Optimized)',
      link: 'https://bailian.console.aliyun.com/#/api-key',
      mode: 'native'
    },
    {
      provider: API_PROVIDERS.OPENROUTER,
      name: 'OpenRouter',
      modelId: 'openrouter',
      icon: '🌐',
      brandColor: 'from-blue-600 to-purple-600',
      placeholder: 'sk-or-v1-...',
      description: language === 'zh' ? '一个 Key 访问所有模型（推荐）' : 'One key for all models (Recommended)',
      link: 'https://openrouter.ai/keys',
      mode: 'openrouter' // 只在 OpenRouter 模式显示
    },
    {
      provider: API_PROVIDERS.CLAUDE,
      name: 'Claude',
      modelId: 'claude',
      icon: '🤖',
      brandColor: 'from-amber-600 to-orange-600',
      placeholder: 'sk-ant-...',
      description: language === 'zh' ? 'Anthropic 官方 API' : 'Anthropic Official API',
      link: 'https://console.anthropic.com/account/keys',
      mode: 'native'
    },
    {
      provider: API_PROVIDERS.OPENAI,
      name: 'OpenAI',
      modelId: 'gpt4',
      icon: '🧠',
      brandColor: 'from-green-600 to-teal-600',
      placeholder: 'sk-...',
      description: language === 'zh' ? 'OpenAI 官方 API' : 'OpenAI Official API',
      link: 'https://platform.openai.com/api-keys',
      mode: 'native'
    },
    {
      provider: API_PROVIDERS.GOOGLE,
      name: 'Google AI',
      modelId: 'gemini',
      icon: '✨',
      brandColor: 'from-blue-500 to-red-500',
      placeholder: 'AIza...',
      description: language === 'zh' ? 'Google Gemini API' : 'Google Gemini API',
      link: 'https://makersuite.google.com/app/apikey',
      mode: 'native'
    }
  ];

  // 根据当前模式过滤显示的配置
  const visibleConfigs = apiConfigs.filter(config => 
    config.mode === 'both' || config.mode === apiMode
  );

  return (
    <div className="space-y-6 text-gray-900 dark:text-white">
      {/* 钱包连接提示 */}
      {!isConnected && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
          <p className="text-yellow-700 text-sm flex items-center gap-2">
            <AlertCircle size={16} />
            {language === 'zh' 
              ? '请先前往"钱包"标签页连接 MetaMask'
              : 'Please connect MetaMask in Wallet tab first'}
          </p>
        </div>
      )}

      {/* API Source Selection - Platform vs User's Own */}
      {apiMode === 'openrouter' && (
        <div className={`${cardClass} p-4 md:p-6`}>
          <h3 className="text-white font-semibold text-base md:text-lg mb-4 flex items-center gap-2">
            <Zap size={20} className="text-yellow-400" />
            {language === 'zh' ? 'API 配置' : 'API Configuration'}
          </h3>

          <div className="space-y-4">
            {/* Widget 1: Use Default Platform API */}
            <div
              onClick={() => handleApiSourceChange('platform')}
              className={`p-4 md:p-5 rounded-2xl border-2 transition-all cursor-pointer ${
                apiSource === 'platform'
                  ? 'border-blue-400 bg-gradient-to-r from-blue-50 to-purple-50 shadow-md dark:border-blue-500 dark:from-blue-500/10 dark:to-purple-500/10'
                  : 'border-gray-200 hover:border-blue-300 dark:border-gray-700 dark:hover:border-gray-600'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-xl ${apiSource === 'platform' ? 'bg-blue-500' : 'bg-gray-200 dark:bg-gray-700'}`}>
                    <Zap size={24} className={apiSource === 'platform' ? 'text-white' : 'text-gray-500 dark:text-gray-400'} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-gray-900 dark:text-white font-semibold text-base">
                        {language === 'zh' ? 'PromptTrading 官方 AI' : 'PromptTrading Official AI'}
                      </h4>
                      <span className="text-xs px-2 py-0.5 bg-blue-500 text-white rounded-full font-medium">
                        {language === 'zh' ? '推荐' : 'Recommended'}
                      </span>
                    </div>
                    <p className={`${mutedText} text-sm mt-1`}>
                      {language === 'zh'
                        ? '平台官方AI服务，无需任何设置，即开即用'
                        : 'Official AI service, no setup required, ready to use'}
                    </p>
                  </div>
                </div>
                <div
                  onClick={(e) => {
                    e.stopPropagation();
                    handleApiSourceChange('platform');
                  }}
                  className={`w-5 h-5 rounded-full border-2 flex items-center justify-center cursor-pointer ${
                    apiSource === 'platform'
                      ? 'border-blue-500 bg-blue-500'
                      : 'border-gray-300 dark:border-gray-600 hover:border-blue-400'
                  }`}
                >
                  {apiSource === 'platform' && <Check size={12} className="text-white" />}
                </div>
              </div>

              {!platformApiAvailable && (
                <p className="text-red-500 text-xs mt-3">
                  {language === 'zh' ? '⚠️ 平台API暂不可用' : '⚠️ Platform API not available'}
                </p>
              )}
            </div>

            {/* Widget 2: Use Your Own OpenRouter Key */}
            <div
              className={`p-4 md:p-5 rounded-2xl border-2 transition-all ${
                apiSource === 'user'
                  ? 'border-green-400 bg-gradient-to-r from-green-50 to-emerald-50 shadow-md dark:border-green-500 dark:from-green-500/10 dark:to-emerald-500/10'
                  : 'border-gray-200 hover:border-green-300 dark:border-gray-700 dark:hover:border-gray-600 cursor-pointer'
              }`}
            >
              <div
                onClick={() => handleApiSourceChange('user')}
                className="cursor-pointer"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-xl ${apiSource === 'user' ? 'bg-green-500' : 'bg-gray-200 dark:bg-gray-700'}`}>
                      <Key size={24} className={apiSource === 'user' ? 'text-white' : 'text-gray-500 dark:text-gray-400'} />
                    </div>
                    <div>
                      <h4 className="text-gray-900 dark:text-white font-semibold text-base">
                        {language === 'zh' ? '使用自己的 OpenRouter Key' : 'Use Your Own OpenRouter Key'}
                      </h4>
                      <p className={`${mutedText} text-sm mt-1`}>
                        {language === 'zh'
                          ? '使用您自己的 OpenRouter Key'
                          : 'Use your own OpenRouter Key'}
                      </p>
                    </div>
                  </div>
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                    apiSource === 'user'
                      ? 'border-green-500 bg-green-500'
                      : 'border-gray-300 dark:border-gray-600'
                  }`}>
                    {apiSource === 'user' && <Check size={12} className="text-white" />}
                  </div>
                </div>
              </div>

              {/* API Key Input - Only show when user option selected */}
              {apiSource === 'user' && (
                <div className="mt-4 space-y-3">
                  {/* OpenRouter Key Input Field */}
                  <div className="p-3 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      OpenRouter Key
                    </label>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <div className="flex gap-2 flex-1">
                        <input
                          type={showApiKeys[API_PROVIDERS.OPENROUTER] ? 'text' : 'password'}
                          value={apiKeys[API_PROVIDERS.OPENROUTER] || ''}
                          onChange={(e) => setApiKeys(prev => ({
                            ...prev,
                            [API_PROVIDERS.OPENROUTER]: e.target.value
                          }))}
                          placeholder="sk-or-v1-..."
                          disabled={!isConnected}
                          className="flex-1 min-w-0 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500 disabled:opacity-50 font-mono"
                        />
                        <button
                          onClick={() => setShowApiKeys(prev => ({
                            ...prev,
                            [API_PROVIDERS.OPENROUTER]: !prev[API_PROVIDERS.OPENROUTER]
                          }))}
                          className="px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 dark:bg-gray-700 dark:text-white dark:hover:bg-gray-600"
                        >
                          {showApiKeys[API_PROVIDERS.OPENROUTER] ? <Eye size={16} /> : <EyeOff size={16} />}
                        </button>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleSaveApiKey(API_PROVIDERS.OPENROUTER)}
                          disabled={!isConnected}
                          className="flex-1 sm:flex-none px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium disabled:opacity-50"
                        >
                          {language === 'zh' ? '保存' : 'Save'}
                        </button>
                        {savedApiKeys[API_PROVIDERS.OPENROUTER] && (
                          <button
                            onClick={() => handleDeleteApiKey(API_PROVIDERS.OPENROUTER)}
                            disabled={!isConnected}
                            className="flex-1 sm:flex-none px-4 py-2 bg-red-100 text-red-600 rounded-lg hover:bg-red-200 text-sm disabled:opacity-50 dark:bg-red-500/20 dark:text-red-400 dark:hover:bg-red-500/30"
                          >
                            {language === 'zh' ? '删除' : 'Delete'}
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Success message */}
                    {saveSuccess === API_PROVIDERS.OPENROUTER && (
                      <div className="mt-2 p-2 bg-green-50 dark:bg-green-500/10 border border-green-100 dark:border-green-500/20 rounded-lg animate-pulse">
                        <p className="text-green-700 dark:text-green-300 text-xs flex items-center gap-2">
                          <Check size={14} />
                          {language === 'zh' ? '保存成功！' : 'Saved successfully!'}
                        </p>
                      </div>
                    )}

                    {/* Saved indicator */}
                    {savedApiKeys[API_PROVIDERS.OPENROUTER] && saveSuccess !== API_PROVIDERS.OPENROUTER && (
                      <div className="mt-2 flex items-center gap-2 text-green-600 dark:text-green-400 text-xs">
                        <Check size={14} />
                        {language === 'zh' ? 'OpenRouter Key 已保存' : 'OpenRouter Key saved'}
                      </div>
                    )}

                    {/* Get OpenRouter Key link */}
                    <a
                      href="https://openrouter.ai/keys"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-2 text-green-600 dark:text-green-400 hover:underline text-xs inline-flex items-center gap-1"
                    >
                      {language === 'zh' ? '获取 OpenRouter Key' : 'Get OpenRouter Key'}
                      <ExternalLink size={10} />
                    </a>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* API Mode Selection */}
      <div className={`${cardClass} p-4 md:p-6`}>
        <h3 className="text-white font-semibold text-base md:text-lg mb-4">
          {language === 'zh' ? 'API 配置模式' : 'API Configuration Mode'}
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4">
          {/* OpenRouter Mode (Recommended) */}
          <button
            onClick={() => handleModeChange('openrouter')}
            className={`p-4 rounded-2xl border-2 transition-all text-left ${
              apiMode === 'openrouter'
                ? 'border-blue-300 bg-blue-50 shadow-sm dark:border-blue-500 dark:bg-blue-500/10'
                : 'border-gray-200 hover:border-blue-200 dark:border-gray-700 dark:hover:border-gray-600'
            }`}
          >
            <div className="flex items-center gap-3 mb-2">
              <span className="text-2xl">🔮</span>
              <div>
                <h4 className="text-gray-900 dark:text-white font-medium">OpenRouter</h4>
                <span className="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded-full dark:bg-green-500/20 dark:text-green-300">
                  {language === 'zh' ? '推荐' : 'Recommended'}
                </span>
              </div>
            </div>
            <p className={`${mutedText} text-sm`}>
              {language === 'zh'
                ? '一个 API Key 访问所有 AI 模型，简单方便'
                : 'One API Key for all AI models, simple and convenient'}
            </p>
          </button>

          {/* Native API Mode */}
          <button
            onClick={() => handleModeChange('native')}
            className={`p-4 rounded-2xl border-2 transition-all text-left ${
              apiMode === 'native'
                ? 'border-purple-300 bg-purple-50 shadow-sm dark:border-purple-500 dark:bg-purple-500/10'
                : 'border-gray-200 hover:border-blue-200 dark:border-gray-700 dark:hover:border-gray-600'
            }`}
          >
            <div className="flex items-center gap-3 mb-2">
              <span className="text-2xl">⚙️</span>
              <div>
                <h4 className="text-gray-900 dark:text-white font-medium">
                  {language === 'zh' ? '原生 API' : 'Native API'}
                </h4>
                <span className="text-xs px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full dark:bg-purple-500/20 dark:text-purple-300">
                  {language === 'zh' ? '高级' : 'Advanced'}
                </span>
              </div>
            </div>
            <p className={`${mutedText} text-sm`}>
              {language === 'zh'
                ? '使用各家官方 API，需要多个 Key'
                : 'Use official APIs, requires multiple keys'}
            </p>
          </button>
        </div>
      </div>

      {/* API Keys Setup - Only show for native API mode */}
      {apiMode === 'native' && (
      <div className={`${cardClass} p-4 md:p-6`}>
        <h3 className="text-gray-900 dark:text-white font-semibold text-base md:text-lg mb-4 flex items-center gap-2">
          🔑 {language === 'zh' ? 'API Key 设置' : 'API Key Setup'}
        </h3>

        <div className="space-y-4">
          {visibleConfigs.map(config => {
            const hasSaved = savedApiKeys[config.provider];
            const showKey = showApiKeys[config.provider];
            
            return (
              <div key={config.provider} className="p-3 md:p-4 bg-gray-50 dark:bg-gray-900/50 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm">
                {/* 提供商标题 */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2 md:gap-3 min-w-0 flex-1">
                    {/* 品牌 Logo */}
                    <AILogo modelId={config.modelId} size={28} className="flex-shrink-0" />
                    <div className="min-w-0 flex-1">
                      <h4 className="text-gray-900 dark:text-white font-medium text-sm md:text-base truncate">{config.name}</h4>
                      <p className={`${mutedText} text-xs truncate`}>{config.description}</p>
                    </div>
                  </div>
                  {hasSaved && (
                    <Check size={16} className="text-green-400 flex-shrink-0" />
                  )}
                </div>

                {/* API Key 输入 */}
                <div className="space-y-2">
                  <div className="flex flex-col sm:flex-row gap-2">
                    <div className="flex gap-2 flex-1">
                      <input
                        type={showKey ? 'text' : 'password'}
                        value={apiKeys[config.provider] || ''}
                        onChange={(e) => setApiKeys(prev => ({
                          ...prev,
                          [config.provider]: e.target.value
                        }))}
                        placeholder={config.placeholder}
                        disabled={!isConnected}
                        className="flex-1 min-w-0 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white rounded px-2 md:px-3 py-2 text-xs md:text-sm focus:outline-none focus:border-blue-500 disabled:opacity-50 font-mono"
                      />
                      <button
                        onClick={() => setShowApiKeys(prev => ({
                          ...prev,
                          [config.provider]: !prev[config.provider]
                        }))}
                        className="px-2 md:px-3 py-2 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 flex-shrink-0 dark:bg-gray-700 dark:text-white dark:hover:bg-gray-600"
                      >
                        {showKey ? <Eye size={14} /> : <EyeOff size={14} />}
                      </button>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleSaveApiKey(config.provider)}
                        disabled={!isConnected}
                        className="flex-1 sm:flex-none px-3 md:px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-xs md:text-sm disabled:opacity-50 whitespace-nowrap"
                      >
                        {language === 'zh' ? '保存' : 'Save'}
                      </button>
                      {hasSaved && (
                        <button
                          onClick={() => handleDeleteApiKey(config.provider)}
                          disabled={!isConnected}
                          className="flex-1 sm:flex-none px-3 md:px-4 py-2 bg-red-100 text-red-600 rounded hover:bg-red-200 text-xs md:text-sm disabled:opacity-50 whitespace-nowrap dark:bg-red-500 dark:text-white dark:hover:bg-red-600"
                        >
                          {language === 'zh' ? '删除' : 'Delete'}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* 成功提示 */}
                  {saveSuccess === config.provider && (
                    <div className="p-2 bg-green-50 dark:bg-green-500/10 border border-green-100 dark:border-green-500/20 rounded animate-pulse">
                      <p className="text-green-700 dark:text-green-300 text-xs flex items-center gap-2">
                        <Check size={14} />
                        {language === 'zh' ? '保存成功！' : 'Saved successfully!'}
                      </p>
                    </div>
                  )}

                  {/* 获取链接 */}
                  <a
                    href={config.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 dark:text-blue-400 hover:underline text-xs inline-flex items-center gap-1"
                  >
                    {language === 'zh' ? '获取 API Key' : 'Get API Key'}
                    <ExternalLink size={10} />
                  </a>
                </div>
              </div>
            );
          })}
        </div>

        {/* Mode description */}
        <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-500/10 border border-blue-100 dark:border-blue-500/20 rounded-lg">
          <p className="text-blue-700 dark:text-blue-300 text-sm">
            {apiMode === 'openrouter' ? (
              language === 'zh'
                ? '💡 OpenRouter 模式：只需一个 Key 即可使用所有模型，推荐新手使用'
                : '💡 OpenRouter Mode: One key for all models, recommended for beginners'
            ) : (
              language === 'zh'
                ? '⚙️ 原生 API 模式：使用各家官方 API，需要分别设置 Key，适合有特定需求的用户'
                : '⚙️ Native API Mode: Use official APIs, requires separate keys, for advanced users'
            )}
          </p>
        </div>
      </div>
      )}

      {/* Model cost reference and comparison */}
      <div className={`${cardClass} p-4 md:p-6`}>
        <h3 className="text-white font-semibold text-base md:text-lg mb-4 flex items-center gap-2">
          <Info size={16} className="text-blue-400" />
          {language === 'zh' ? '成本参考与模式对比' : 'Cost Reference & Mode Comparison'}
        </h3>

        {/* 模式对比表 */}
        <div className="mb-6 overflow-x-auto -mx-4 md:mx-0">
          <table className="w-full min-w-[400px] text-xs md:text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <th className="text-left py-2 px-2 md:px-3 text-gray-600 dark:text-gray-400 font-medium">
                  {language === 'zh' ? '对比项' : 'Feature'}
                </th>
                <th className="text-center py-2 px-2 md:px-3 text-blue-600 dark:text-blue-400 font-medium">
                  OpenRouter
                </th>
                <th className="text-center py-2 px-2 md:px-3 text-purple-600 dark:text-purple-400 font-medium">
                  {language === 'zh' ? '原生 API' : 'Native API'}
                </th>
              </tr>
            </thead>
            <tbody className="text-gray-600 dark:text-gray-300">
              <tr className="border-b border-gray-200 dark:border-gray-800">
                <td className="py-2 px-2 md:px-3">{language === 'zh' ? 'API Key 数量' : 'API Keys'}</td>
                <td className="text-center py-2 px-2 md:px-3 text-green-600 dark:text-green-400">1</td>
                <td className="text-center py-2 px-2 md:px-3">3-4</td>
              </tr>
              <tr className="border-b border-gray-200 dark:border-gray-800">
                <td className="py-2 px-2 md:px-3">{language === 'zh' ? '支持模型' : 'Supported Models'}</td>
                <td className="text-center py-2 px-2 md:px-3 text-green-600 dark:text-green-400">{language === 'zh' ? '所有' : 'All'}</td>
                <td className="text-center py-2 px-2 md:px-3">{language === 'zh' ? '仅各自模型' : 'Own models only'}</td>
              </tr>
              <tr className="border-b border-gray-200 dark:border-gray-800">
                <td className="py-2 px-2 md:px-3">{language === 'zh' ? '设置难度' : 'Setup'}</td>
                <td className="text-center py-2 px-2 md:px-3 text-green-600 dark:text-green-400">{language === 'zh' ? '简单' : 'Easy'}</td>
                <td className="text-center py-2 px-2 md:px-3">{language === 'zh' ? '复杂' : 'Complex'}</td>
              </tr>
              <tr className="border-b border-gray-200 dark:border-gray-800">
                <td className="py-2 px-2 md:px-3">{language === 'zh' ? '价格' : 'Pricing'}</td>
                <td className="text-center py-2 px-2 md:px-3">{language === 'zh' ? '统一计费' : 'Unified'}</td>
                <td className="text-center py-2 px-2 md:px-3">{language === 'zh' ? '各家不同' : 'Varies'}</td>
              </tr>
              <tr>
                <td className="py-2 px-2 md:px-3">{language === 'zh' ? '推荐场景' : 'Recommended'}</td>
                <td className="text-center py-2 px-2 md:px-3 text-green-600 dark:text-green-400">{language === 'zh' ? '新手首选' : 'Beginners'}</td>
                <td className="text-center py-2 px-2 md:px-3">{language === 'zh' ? '特定需求' : 'Advanced'}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* 模型成本 */}
        <div className="space-y-3">
          <p className="text-gray-400 text-sm font-medium">
            {language === 'zh' ? 'OpenRouter 模型成本（每 1000 tokens）：' : 'OpenRouter Model Costs (per 1000 tokens):'}
          </p>

          <div className="grid grid-cols-1 gap-2">
            {[
              { modelId: 'qwen', icon: '💫', name: language === 'zh' ? '通义千问' : 'Qwen', cost: '$0.012', tag: language === 'zh' ? '最便宜' : 'Cheapest' },
              { modelId: 'deepseek', icon: '🔮', name: 'DeepSeek', cost: '$0.014', tag: language === 'zh' ? '高性价比' : 'Best Value' },
              { modelId: 'claude', icon: '🤖', name: 'Claude 3.5', cost: '$0.020', tag: language === 'zh' ? '深度分析' : 'Deep Analysis' },
              { modelId: 'grok', icon: '⚡', name: 'Grok', cost: '$0.025', tag: language === 'zh' ? '实时数据' : 'Real-time' },
              { modelId: 'gpt4', icon: '🧠', name: 'GPT-4o', cost: '$0.030', tag: language === 'zh' ? '最强大' : 'Most Powerful' },
            ].map((model, idx) => (
              <div key={idx} className="flex items-center justify-between p-2 md:p-3 bg-gray-50 dark:bg-gray-900/50 rounded-lg border border-gray-100 dark:border-gray-700">
                <div className="flex items-center gap-2 md:gap-3 min-w-0 flex-1">
                  {/* 品牌 Logo */}
                  <AILogo modelId={model.modelId} size={20} className="flex-shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="text-gray-900 dark:text-white font-medium text-xs md:text-sm truncate">{model.name}</div>
                    <div className={`${mutedText} text-xs truncate`}>{model.tag}</div>
                  </div>
                </div>
                <div className="text-blue-600 dark:text-blue-400 font-mono text-xs md:text-sm flex-shrink-0">{model.cost}</div>
              </div>
            ))}
          </div>

          <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-500/10 border border-blue-100 dark:border-blue-500/20 rounded-lg">
            <p className="text-blue-700 dark:text-blue-300 text-xs">
              {language === 'zh' 
                ? '💡 提示：每次分析约 2000-5000 tokens，成本 $0.02-0.15。新用户有 $5-10 免费额度。'
                : '💡 Tip: Each analysis uses ~2000-5000 tokens, costing $0.02-0.15. New users get $5-10 free credits.'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AISetupTab;

