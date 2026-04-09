import React, { useState, useEffect } from 'react';
import { X, ChevronRight, ChevronLeft, Check, Brain, Star, Coins, Info, Search, XCircle, Zap, Lightbulb, CheckCircle, ChevronDown, Plus, RefreshCw, Layers } from 'lucide-react';
import { AILogo } from '../constants/data.jsx';
import AgentWalletWidget from './AgentWalletWidget';
import { useAuth } from '../contexts/AuthContext';
import { useAppStore } from '../contexts/useAppStore';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../polymarket/components/ui/select";

// Hyperliquid supported cryptocurrencies (从 DashboardTab 复制)
const HYPERLIQUID_COINS = [
  { symbol: 'BTC', name: 'Bitcoin', category: 'major', icon: '₿', color: 'from-orange-500 to-orange-600' },
  { symbol: 'ETH', name: 'Ethereum', category: 'major', icon: '⟠', color: 'from-blue-500 to-indigo-600' },
  { symbol: 'SOL', name: 'Solana', category: 'major', icon: '◎', color: 'from-purple-500 to-purple-600' },
  { symbol: 'BNB', name: 'BNB', category: 'major', icon: '◆', color: 'from-yellow-500 to-amber-600' },
  { symbol: 'XRP', name: 'Ripple', category: 'major', icon: '✦', color: 'from-blue-400 to-cyan-500' },
  { symbol: 'DOGE', name: 'Dogecoin', category: 'major', icon: '🐕', color: 'from-yellow-400 to-yellow-500' },
  { symbol: 'AVAX', name: 'Avalanche', category: 'popular', icon: '▲', color: 'from-red-500 to-red-600' },
  { symbol: 'MATIC', name: 'Polygon', category: 'popular', icon: '⬢', color: 'from-purple-600 to-purple-700' },
  { symbol: 'LINK', name: 'Chainlink', category: 'popular', icon: '⬡', color: 'from-blue-600 to-blue-700' },
  { symbol: 'UNI', name: 'Uniswap', category: 'popular', icon: '🦄', color: 'from-pink-500 to-pink-600' },
  { symbol: 'ATOM', name: 'Cosmos', category: 'popular', icon: '⚛', color: 'from-indigo-500 to-indigo-600' },
  { symbol: 'LTC', name: 'Litecoin', category: 'popular', icon: 'Ł', color: 'from-gray-400 to-gray-500' },
  { symbol: 'DOT', name: 'Polkadot', category: 'popular', icon: '●', color: 'from-pink-600 to-pink-700' },
  { symbol: 'ADA', name: 'Cardano', category: 'popular', icon: '₳', color: 'from-blue-500 to-blue-600' },
  { symbol: 'NEAR', name: 'NEAR Protocol', category: 'popular', icon: 'Ⓝ', color: 'from-green-500 to-green-600' },
  { symbol: 'APT', name: 'Aptos', category: 'popular', icon: '◉', color: 'from-teal-500 to-teal-600' },
  { symbol: 'ARB', name: 'Arbitrum', category: 'popular', icon: '◭', color: 'from-cyan-500 to-cyan-600' },
  { symbol: 'OP', name: 'Optimism', category: 'popular', icon: '⭕', color: 'from-red-500 to-red-600' },
  { symbol: 'SUI', name: 'Sui', category: 'popular', icon: '💧', color: 'from-blue-400 to-blue-500' },
  { symbol: 'FTM', name: 'Fantom', category: 'popular', icon: '👻', color: 'from-blue-600 to-blue-700' },
  { symbol: 'HYPE', name: 'Hyperliquid', category: 'popular', icon: 'Ⓗ', color: 'from-green-400 to-green-500' },
  { symbol: 'PEPE', name: 'Pepe', category: 'meme', icon: '🐸', color: 'from-green-500 to-green-600' },
  { symbol: 'SHIB', name: 'Shiba Inu', category: 'meme', icon: '🐕', color: 'from-orange-400 to-orange-500' },
  { symbol: 'WIF', name: 'dogwifhat', category: 'meme', icon: '🧢', color: 'from-purple-400 to-purple-500' },
  { symbol: 'BONK', name: 'Bonk', category: 'meme', icon: '🔨', color: 'from-amber-500 to-amber-600' },
];

const CreateTraderDialog = ({ language, t, aiModels, onClose, onCreate }) => {
  // Use Privy authentication
  const { authenticated, walletAddress } = useAuth();
  const isConnected = authenticated;
  const account = walletAddress;
  
  // 🔧 使用全局状态来持久化创建进度
  const traderCreationDraft = useAppStore(state => state.traderCreationDraft);
  const traderCreationStep = useAppStore(state => state.traderCreationStep);
  const setTraderCreationDraft = useAppStore(state => state.setTraderCreationDraft);
  const setTraderCreationStep = useAppStore(state => state.setTraderCreationStep);
  const clearTraderCreationDraft = useAppStore(state => state.clearTraderCreationDraft);

  // 默认配置
  const defaultConfig = {
    name: '',
    selectedAI: ['deepseek'],
    selectedCoins: ['BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'DOGE'],
    riskPreference: 'balanced',
    tradeAmount: '100',
    selectedDataSources: {
      price: true,
      ema: true,
      macd: true,
      rsi: true,
      volume: true,
      funding: true,
      oi: false,
      liquidation: false,
      sentiment: false
    },
    customPrompt: ''
  };
  
  // 使用全局状态或默认值
  const [currentStep, setCurrentStep] = useState(traderCreationStep);
  const [traderConfig, setTraderConfig] = useState(traderCreationDraft || defaultConfig);

  const [coinSearchQuery, setCoinSearchQuery] = useState('');
  const [showCoinSelector, setShowCoinSelector] = useState(false);
  const [showMoreDataSources, setShowMoreDataSources] = useState(false);

  // 🔧 保存进度到全局状态
  useEffect(() => {
    setTraderCreationDraft(traderConfig);
    setTraderCreationStep(currentStep);
  }, [traderConfig, currentStep, setTraderCreationDraft, setTraderCreationStep]);

  // 生成默认 Prompt (与 Dashboard 相同)
  const generateDefaultPrompt = () => {
    const basePrompt = language === 'zh' ?
`你是一家顶级量化基金的系统化交易员，在 Hyperliquid 上执行交易。
当前时间: {current_time}
账户信息: 可用资金 {account_balance} USDC

核心原则：
- 追求扣除费用后的最大利润
- 避免过度交易，每个信号都需要明确优势
- 考虑0.09%的双向手续费+滑点+资金费率
- 严格风险管理，不加仓现有头寸` :
`You are a systematic trader on Hyperliquid, aiming for maximum profit after fees.
Current time: {current_time}
Account: Available {account_balance} USDC

Core principles:
- Maximum profit after fees
- Avoid over-trading, need clear edge for each signal
- Consider 0.09% round-trip fees + slippage + funding
- Strict risk management, no pyramiding`;
    
    return basePrompt;
  };

  // 初始化默认 prompt
  useEffect(() => {
    if (!traderConfig.customPrompt) {
      setTraderConfig(prev => ({
        ...prev,
        customPrompt: generateDefaultPrompt()
      }));
    }
  }, [language]);

  // 显示恢复提示（仅在有草稿时显示一次）
  useEffect(() => {
    if (traderCreationDraft && traderCreationStep > 1) {
      const message = language === 'zh'
        ? `检测到未完成的Trader创建草稿（步骤 ${traderCreationStep}/3）\n已自动恢复您的进度。`
        : `Detected incomplete Trader creation draft (Step ${traderCreationStep}/3)\nYour progress has been restored.`;
      
      // 使用setTimeout避免在组件挂载时立即显示
      const timer = setTimeout(() => {
        console.log('✅', message);
      }, 100);
      
      return () => clearTimeout(timer);
    }
  }, []); // 只在组件挂载时检查一次

  const handleNext = () => {
    if (currentStep < 3) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handlePrevious = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleCreate = () => {
    onCreate(traderConfig);
    clearTraderCreationDraft(); // 清除草稿
    onClose();
  };

  const handleClose = () => {
    // 用户可以选择保留草稿或清除
    const confirmed = window.confirm(
      language === 'zh' 
        ? '退出创建？您的进度将被保存，下次打开会自动恢复。' 
        : 'Exit creation? Your progress will be saved and restored next time.'
    );
    if (confirmed) {
      onClose();
    }
  };

  const toggleCoinSelection = (symbol) => {
    setTraderConfig(prev => ({
      ...prev,
      selectedCoins: prev.selectedCoins.includes(symbol)
        ? prev.selectedCoins.filter(s => s !== symbol)
        : [...prev.selectedCoins, symbol]
    }));
  };

  const handleDataSourceToggle = (sourceId) => {
    setTraderConfig(prev => ({
      ...prev,
      selectedDataSources: {
        ...prev.selectedDataSources,
        [sourceId]: !prev.selectedDataSources[sourceId]
      }
    }));
  };

  const filteredCoins = HYPERLIQUID_COINS.filter(coin =>
    coin.symbol.toLowerCase().includes(coinSearchQuery.toLowerCase()) ||
    coin.name.toLowerCase().includes(coinSearchQuery.toLowerCase())
  );

  const majorCoins = HYPERLIQUID_COINS.filter(coin => coin.category === 'major');

  const cardClass = 'bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-700 rounded-2xl shadow-sm';
  const mutedTextClass = 'text-gray-600 dark:text-gray-400';

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white dark:bg-gray-900 rounded-2xl max-w-5xl w-full my-8 border border-gray-200 dark:border-gray-800 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-800 sticky top-0 bg-white dark:bg-gray-900 z-10">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
              {language === 'zh' ? '创建新的AI Trader' : 'Create New AI Trader'}
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              {language === 'zh' ? '步骤' : 'Step'} {currentStep} / 3
              {traderCreationDraft && (
                <span className="ml-2 text-xs text-blue-600 dark:text-blue-400">
                  {language === 'zh' ? '(已保存草稿)' : '(Draft saved)'}
                </span>
              )}
            </p>
          </div>
          <button
            onClick={handleClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
          >
            <X size={20} className="text-gray-600 dark:text-gray-400" />
          </button>
        </div>

        {/* Progress Bar */}
        <div className="px-6 pt-4">
          <div className="flex items-center gap-2">
            {[1, 2, 3].map(step => (
              <div
                key={step}
                className={`flex-1 h-2 rounded-full transition-all ${
                  step <= currentStep
                    ? 'bg-gradient-to-r from-blue-500 to-purple-600'
                    : 'bg-gray-200 dark:bg-gray-800'
                }`}
              />
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6 max-h-[calc(100vh-280px)] overflow-y-auto">
          {/* Step 1: Basic Info + Agent Wallet + AI Selection */}
          {currentStep === 1 && (
            <div className="space-y-6">
              {/* Trader Name */}
              <div>
                <label className="block text-gray-900 dark:text-white font-medium mb-2">
                  {language === 'zh' ? 'Trader名称' : 'Trader Name'}
                </label>
                <input
                  type="text"
                  value={traderConfig.name}
                  onChange={(e) => setTraderConfig(prev => ({ ...prev, name: e.target.value }))}
                  placeholder={language === 'zh' ? '例如：稳健收益策略' : 'e.g., Stable Profit Strategy'}
                  className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white rounded-lg px-4 py-3 focus:outline-none focus:border-blue-500"
                />
              </div>

              {/* Agent Wallet Widget */}
              {isConnected && (
                <div>
                  <h3 className="text-gray-900 dark:text-white font-medium mb-3">
                    {language === 'zh' ? 'Agent钱包设置' : 'Agent Wallet Setup'}
                  </h3>
                  <AgentWalletWidget language={language} selectedCoins={traderConfig.selectedCoins} />
                </div>
              )}

              {/* AI Model Selection */}
              <div className={`${cardClass} p-6`}>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-gray-900 dark:text-white font-semibold text-lg flex items-center gap-2">
                    <Brain className="text-blue-500 dark:text-blue-400" />
                    {t[language].selectAI}
                  </h3>
                </div>

                {/* 主推荐模型 */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                  {aiModels.map(model => (
                    <div 
                      key={model.id}
                      onClick={() => setTraderConfig(prev => ({ ...prev, selectedAI: [model.id] }))}
                      className={`border rounded-2xl p-4 cursor-pointer transition-all hover:scale-[1.02] ${
                        traderConfig.selectedAI.includes(model.id) 
                          ? 'border-blue-200 bg-blue-50 text-blue-700 shadow-md dark:border-blue-500 dark:bg-blue-500/10 dark:text-white' 
                          : 'border-gray-200 bg-white hover:border-blue-200 shadow-sm dark:border-gray-700 dark:bg-gray-900'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-3">
                        <AILogo modelId={model.id} size={32} className="flex-shrink-0" />
                        {traderConfig.selectedAI.includes(model.id) && (
                          <CheckCircle className="text-blue-500 dark:text-blue-400" size={18} />
                        )}
                      </div>
                      <h4 className="text-gray-900 dark:text-white font-semibold text-sm">{model.name}</h4>
                      <p className="text-gray-500 dark:text-gray-400 text-xs mt-1">{model.strength}</p>
                      <div className="mt-3 flex items-center justify-between">
                        <div className="flex items-center gap-1">
                          <Star className="text-yellow-400" size={12} />
                          <span className="text-xs text-gray-500 dark:text-gray-400">{model.rating}</span>
                        </div>
                        <span className="text-xs text-green-600 dark:text-green-400 font-medium">{model.profitRate}</span>
                      </div>
                      <div className="mt-2 text-xs text-gray-500 dark:text-gray-500">
                        {model.apiCost}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Trading Configuration (币种 + 配置) */}
          {currentStep === 2 && (
            <div className="space-y-6">
              {/* 币种选择器 (从 Dashboard 复制) */}
              <div className={`${cardClass} p-6`}>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-gray-900 dark:text-white font-semibold text-lg flex items-center gap-2">
                    <Coins className="text-yellow-500 dark:text-yellow-400" />
                    {language === 'zh' ? '选择交易币种' : 'Select Trading Coins'}
                  </h3>
                  <button
                    onClick={() => setShowCoinSelector(!showCoinSelector)}
                    className="text-blue-600 dark:text-blue-400 text-sm hover:underline flex items-center gap-1"
                  >
                    {showCoinSelector ? (
                      language === 'zh' ? '收起' : 'Collapse'
                    ) : (
                      <>
                        <Plus size={16} />
                        {language === 'zh' ? '展开更多' : 'Expand More'}
                      </>
                    )}
                  </button>
                </div>

                {/* 主流6个币种 */}
                <div className="mb-4">
                  <label className={`${mutedTextClass} text-sm mb-2 block`}>
                    {language === 'zh' ? '主流加密货币（可多选）' : 'Major Cryptocurrencies (Multi-select)'}
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
                    {majorCoins.map(coin => (
                      <button
                        key={coin.symbol}
                        onClick={() => toggleCoinSelection(coin.symbol)}
                        className={`relative p-4 rounded-2xl border-2 transition-all hover:scale-[1.02] ${
                          traderConfig.selectedCoins.includes(coin.symbol)
                            ? 'border-blue-300 bg-blue-50 shadow-md dark:border-blue-500 dark:bg-blue-500/10'
                            : 'border-gray-200 bg-white hover:border-blue-200 dark:border-gray-700 dark:bg-gray-900/50'
                        }`}
                      >
                        <div className="flex flex-col items-center gap-2">
                          <div className={`w-12 h-12 rounded-full bg-gradient-to-br ${coin.color} flex items-center justify-center text-white text-2xl font-bold shadow-lg`}>
                            {coin.icon}
                          </div>
                          <div className="text-center">
                            <div className="text-gray-900 dark:text-white font-bold text-sm">{coin.symbol}</div>
                            <div className="text-gray-500 dark:text-gray-400 text-xs">{coin.name}</div>
                          </div>
                        </div>
                        {traderConfig.selectedCoins.includes(coin.symbol) && (
                          <div className="absolute top-2 right-2 w-6 h-6 bg-blue-500 text-white rounded-full flex items-center justify-center shadow-lg">
                            <Check size={14} className="text-white" />
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 已选择的币种 */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`${mutedTextClass} text-sm font-medium`}>
                    {language === 'zh' ? '已选择：' : 'Selected:'}
                  </span>
                  {traderConfig.selectedCoins.map(symbol => {
                    const coin = HYPERLIQUID_COINS.find(c => c.symbol === symbol);
                    return (
                      <span
                        key={symbol}
                        className="px-3 py-1.5 bg-blue-50 text-blue-600 dark:bg-blue-500/20 dark:text-blue-300 rounded-lg text-sm flex items-center gap-2 border border-blue-100 dark:border-blue-500/30"
                      >
                        {coin?.icon && <span className="text-base">{coin.icon}</span>}
                        <span className="font-medium">{symbol}</span>
                        <button
                          onClick={() => toggleCoinSelection(symbol)}
                          className="hover:bg-blue-500/30 rounded-full p-0.5 transition-colors"
                        >
                          <XCircle size={14} />
                        </button>
                      </span>
                    );
                  })}
                </div>

                {/* 展开的搜索和更多币种 */}
                {showCoinSelector && (
                  <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
                    <div className="mb-4">
                      <label className={`${mutedTextClass} text-sm mb-2 block`}>
                        {language === 'zh' ? '搜索 Hyperliquid 币种' : 'Search Hyperliquid Coins'}
                      </label>
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                        <input
                          type="text"
                          value={coinSearchQuery}
                          onChange={(e) => setCoinSearchQuery(e.target.value)}
                          placeholder={language === 'zh' ? '输入币种名称或代码...' : 'Type coin name or symbol...'}
                          className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white rounded-lg pl-10 pr-4 py-2 focus:outline-none focus:border-blue-500"
                        />
                      </div>
                    </div>

                    <div className="max-h-64 overflow-y-auto">
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                        {filteredCoins.map(coin => (
                          <button
                            key={coin.symbol}
                            onClick={() => toggleCoinSelection(coin.symbol)}
                            className={`relative p-3 rounded-lg border transition-all text-left hover:scale-[1.01] ${
                              traderConfig.selectedCoins.includes(coin.symbol)
                                ? 'border-blue-300 bg-blue-50 dark:border-blue-500 dark:bg-blue-500/10'
                                : 'border-gray-200 bg-white hover:border-gray-300 dark:border-gray-700 dark:bg-gray-900/30'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <div className={`w-8 h-8 rounded-full bg-gradient-to-br ${coin.color} flex items-center justify-center text-white text-sm font-bold flex-shrink-0`}>
                                {coin.icon}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="text-gray-900 dark:text-white font-medium text-sm">{coin.symbol}</div>
                                <div className="text-gray-500 text-xs truncate">{coin.name}</div>
                              </div>
                              {traderConfig.selectedCoins.includes(coin.symbol) && (
                                <Check size={16} className="text-blue-500 dark:text-blue-400 flex-shrink-0" />
                              )}
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* 交易配置 */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={`${mutedTextClass} text-sm mb-2 block`}>
                    {language === 'zh' ? '风险偏好' : 'Risk Preference'}
                  </label>
                  <Select 
                    value={traderConfig.riskPreference}
                    onValueChange={(value) => setTraderConfig(prev => ({ ...prev, riskPreference: value }))}
                  >
                    <SelectTrigger className="w-full bg-white border border-gray-200 text-gray-900 rounded-lg px-4 py-2 dark:bg-gray-900 dark:border-gray-700 dark:text-white focus:outline-none focus:border-blue-500">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="conservative">{language === 'zh' ? '保守 (5-10x)' : 'Conservative (5-10x)'}</SelectItem>
                      <SelectItem value="balanced">{language === 'zh' ? '平衡 (10-15x)' : 'Balanced (10-15x)'}</SelectItem>
                      <SelectItem value="aggressive">{language === 'zh' ? '激进 (15-20x)' : 'Aggressive (15-20x)'}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className={`${mutedTextClass} text-sm mb-2 block`}>
                    {language === 'zh' ? '交易资金' : 'Trading Capital'}
                  </label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">$</span>
                    <input
                      type="number"
                      value={traderConfig.tradeAmount}
                      onChange={(e) => setTraderConfig(prev => ({ ...prev, tradeAmount: e.target.value }))}
                      min="10"
                      step="10"
                      className="w-full bg-white border border-gray-200 text-gray-900 rounded-lg pl-8 pr-20 py-2 dark:bg-gray-900 dark:border-gray-700 dark:text-white focus:outline-none focus:border-blue-500"
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 text-sm">USDC</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Data Sources + Custom Prompt */}
          {currentStep === 3 && (
            <div className="space-y-6">
              {/* Data Source Selection (从 Dashboard 复制) */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <label className="text-gray-900 dark:text-white font-medium flex items-center gap-2">
                    <span className="text-xl">📊</span>
                    {language === 'zh' ? '选择你想要的数据来分析' : 'Choose Your Analysis Data'}
                  </label>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {[
                    { id: 'price', name: language === 'zh' ? '价格数据' : 'Price Data', required: true },
                    { id: 'ema', name: language === 'zh' ? 'EMA 均线' : 'EMA Lines' },
                    { id: 'macd', name: 'MACD' },
                    { id: 'rsi', name: 'RSI' },
                    { id: 'volume', name: language === 'zh' ? '成交量' : 'Volume' },
                    { id: 'funding', name: language === 'zh' ? '资金费率' : 'Funding Rate' },
                    { id: 'oi', name: language === 'zh' ? '持仓量' : 'Open Interest' },
                    { id: 'liquidation', name: language === 'zh' ? '爆仓数据' : 'Liquidations' },
                    { id: 'sentiment', name: language === 'zh' ? '市场情绪' : 'Sentiment' },
                  ]
                  .filter((source, index) => index < 6 || showMoreDataSources)
                  .map(source => (
                    <label 
                      key={source.id}
                      className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition-all ${
                        traderConfig.selectedDataSources[source.id]
                          ? 'bg-blue-50 border-blue-200 dark:bg-blue-500/10 dark:border-blue-500/30' 
                          : 'bg-white border-gray-200 hover:border-blue-200 dark:bg-gray-900/50 dark:border-gray-700 hover:dark:border-gray-600'
                      } ${source.required ? 'opacity-100 cursor-not-allowed' : ''}`}
                    >
                      <input 
                        type="checkbox" 
                        checked={traderConfig.selectedDataSources[source.id]}
                        disabled={source.required}
                        onChange={() => !source.required && handleDataSourceToggle(source.id)}
                        className="rounded border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800"
                      />
                      <span className="text-sm text-gray-700 dark:text-gray-300">{source.name}</span>
                    </label>
                  ))}
                </div>
                
                <div className="mt-3 flex justify-center">
                  <button
                    onClick={() => setShowMoreDataSources(!showMoreDataSources)}
                    className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg text-sm transition-colors flex items-center gap-2 dark:bg-gray-800 dark:hover:bg-gray-700 dark:text-gray-300"
                  >
                    <span>{language === 'zh' ? (showMoreDataSources ? '收起' : '显示更多数据源') : (showMoreDataSources ? 'Show Less' : 'Show More Data Sources')}</span>
                    <ChevronDown 
                      size={16} 
                      className={`transition-transform ${showMoreDataSources ? 'rotate-180' : ''}`}
                    />
                  </button>
                </div>
              </div>

              {/* Custom Prompt */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <label className="text-gray-900 dark:text-white font-medium flex items-center gap-2">
                    <span className="text-xl">🪄</span>
                    {language === 'zh' ? '打造你的 AI 交易魔法' : 'Create Your Trading Magic'}
                  </label>
                  <button
                    onClick={() => setTraderConfig(prev => ({ ...prev, customPrompt: generateDefaultPrompt() }))}
                    className="px-3 py-1.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-lg text-xs hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors flex items-center gap-1"
                  >
                    <RefreshCw size={12} />
                    {language === 'zh' ? '恢复默认' : 'Reset Default'}
                  </button>
                </div>
                
                <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
                  <textarea 
                    className="w-full bg-transparent text-gray-900 dark:text-gray-300 text-sm font-mono leading-relaxed resize-none focus:outline-none"
                    rows="10"
                    value={traderConfig.customPrompt}
                    onChange={(e) => setTraderConfig(prev => ({ ...prev, customPrompt: e.target.value }))}
                    placeholder={language === 'zh' 
                      ? '✨ 在这里告诉 AI 你的交易想法...' 
                      : '✨ Tell the AI your trading ideas here...'}
                  />
                </div>
                
                <div className="mt-2 p-2 bg-purple-50 dark:bg-purple-500/10 border border-purple-100 dark:border-purple-500/20 rounded-lg">
                  <p className="text-purple-600 dark:text-purple-300 text-xs flex items-start gap-2">
                    <span className="text-base">💡</span>
                    <span>
                      {language === 'zh' 
                        ? '你可以直接编辑上面的文字，加入你自己的想法！花括号里的内容会由系统自动填充真实数据。'
                        : 'Edit the text above freely! Content in curly braces will be automatically filled with real data.'}
                    </span>
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-6 border-t border-gray-200 dark:border-gray-800 sticky bottom-0 bg-white dark:bg-gray-900">
          <div className="flex items-center gap-3">
            <button
              onClick={handleClose}
              className="px-6 py-2 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            >
              {language === 'zh' ? '取消' : 'Cancel'}
            </button>
            {traderCreationDraft && (
              <button
                onClick={() => {
                  clearTraderCreationDraft();
                  setTraderConfig(defaultConfig);
                  setCurrentStep(1);
                }}
                className="px-4 py-2 text-red-600 dark:text-red-400 text-sm hover:underline"
              >
                {language === 'zh' ? '清除草稿' : 'Clear Draft'}
              </button>
            )}
          </div>

          <div className="flex items-center gap-3">
            {currentStep > 1 && (
              <button
                onClick={handlePrevious}
                className="px-6 py-2 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors flex items-center gap-2"
              >
                <ChevronLeft size={16} />
                {language === 'zh' ? '上一步' : 'Previous'}
              </button>
            )}

            {currentStep < 3 ? (
              <button
                onClick={handleNext}
                disabled={currentStep === 1 && !traderConfig.name}
                className="px-6 py-2 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-lg hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2"
              >
                {language === 'zh' ? '下一步' : 'Next'}
                <ChevronRight size={16} />
              </button>
            ) : (
              <button
                onClick={handleCreate}
                className="px-8 py-2 bg-gradient-to-r from-green-500 to-blue-500 text-white rounded-lg hover:opacity-90 transition-all flex items-center gap-2 font-medium"
              >
                <Check size={16} />
                {language === 'zh' ? '创建Trader' : 'Create Trader'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CreateTraderDialog;
