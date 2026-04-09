import React, { useState, useEffect, useRef } from 'react';
import {
  Brain,
  Layers,
  CheckCircle,
  Star,
  Zap,
  Code,
  Database,
  Lightbulb,
  RefreshCw,
  Target,
  ChevronDown,
  Activity,
  X,
  Settings,
  PlayCircle,
  Info,
  TrendingUp,
  TrendingDown,
  Search,
  Coins,
  Check,
  XCircle,
  Plus,
  AlertCircle
} from 'lucide-react';
import { aiAPI, signingAPI, userAPI } from '../../utils/api';
import { useAuth } from '../../contexts/AuthContext';
// COMMENTED OUT: MetaMask wallet context - kept for future external wallet top-up feature
// import { useWallet } from '../../contexts/WalletContext';
import { hasApiKey, getApiSource } from '../../utils/apikey';
import { useAppStore } from '../../contexts/useAppStore';
import { AILogo } from '../../constants/data.jsx';
// Re-enabled: Agent Wallet widget for Privy embedded wallet
import AgentWalletWidget from '../AgentWalletWidget';

// Hyperliquid 支持的加密货币列表
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

const cardClass = 'bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-700 rounded-2xl shadow-sm';
const mutedTextClass = 'text-gray-600 dark:text-gray-400';

const DashboardTab = ({ language, t, aiModels, selectedAI, setSelectedAI, compareMode, setCompareMode, tradeAmount, setTradeAmount }) => {
  // Privy Auth Context - embedded wallet for all services
  const { authenticated, walletAddress, getProvider, isAgentActive, agentInfo, getAgentKey, effectiveChainId, getAccessToken } = useAuth();

  // Map Privy auth to component variables for compatibility
  const account = walletAddress;
  const isConnected = authenticated;
  // Use effectiveChainId directly - it's already computed based on network mode (testnet/mainnet)
  const chainId = effectiveChainId;

  // COMMENTED OUT: MetaMask wallet context - kept for future external wallet top-up feature
  // const { account, signer, chainId, isConnected, isAgentActive, getAgentKey, agentInfo } = useWallet();
  // Agent Wallet state now comes from useAuth (Privy embedded wallet + Agent)
  
  // 🔧 使用全局状态管理 AI 分析（切换 tab 不丢失）
  const analyzing = useAppStore(state => state.dashboardAnalyzing);
  const setAnalyzing = useAppStore(state => state.setDashboardAnalyzing);
  const aiResults = useAppStore(state => state.dashboardAiResults);
  const setAiResults = useAppStore(state => state.setDashboardAiResults);
  const executing = useAppStore(state => state.dashboardExecuting);
  const setExecuting = useAppStore(state => state.setDashboardExecuting);
  const executionResults = useAppStore(state => state.dashboardExecutionResults);
  const setExecutionResults = useAppStore(state => state.setDashboardExecutionResults);

  // Network mode - testnet (simulation) vs mainnet
  const isSimulationMode = useAppStore(state => state.isSimulationMode);

  const [selectedDataSources, setSelectedDataSources] = useState({
    price: true,
    ema: true,
    macd: true,
    rsi: true,
    volume: true,
    funding: true,
    oi: false,
    liquidation: false,
    sentiment: false
  });
  const [customPrompt, setCustomPrompt] = useState('');
  const lastAutoPromptRef = useRef('');
  const [promptEdited, setPromptEdited] = useState(false);

  // Persisted custom prompts via Zustand
  const customPrompts = useAppStore(state => state.customPrompts);
  const setCustomPromptForLanguage = useAppStore(state => state.setCustomPromptForLanguage);
  const clearCustomPromptForLanguage = useAppStore(state => state.clearCustomPromptForLanguage);

  // Auto trading config (shared with Trading Panel)
  const setAutoTradingConfig = useAppStore(state => state.setAutoTradingConfig);
  const [expandedSections, setExpandedSections] = useState({
    userPrompt: false,  // User Prompt 窗口默认折叠
    comprehensiveAnalysis: false  // AI 完整分析默认折叠
  });
  
  // 数据源展开状态
  const [showMoreDataSources, setShowMoreDataSources] = useState(false);
  
  // 风险偏好状态
  const [riskPreference, setRiskPreference] = useState('balanced'); // conservative, balanced, aggressive
  
  // 币种选择相关状态
  const [selectedCoins, setSelectedCoins] = useState(['BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'DOGE']);
  const [coinSearchQuery, setCoinSearchQuery] = useState('');
  const [showCoinSelector, setShowCoinSelector] = useState(false);
  
  // 交易执行相关状态（本地UI状态）
  const [editedParams, setEditedParams] = useState({});
  const [selectedDecisionIndex, setSelectedDecisionIndex] = useState(null);

  // 用户额度状态 - TEMPORARILY HIDDEN (待后续处理)
  // const [userQuota, setUserQuota] = useState(null);

  // Hyperliquid 账户地址状态 - 使用用户连接的钱包地址
  const [userAddress, setUserAddress] = useState('');
  
  // 加载用户额度 - TEMPORARILY HIDDEN (待后续处理)
  // useEffect(() => {
  //   if (account) {
  //     fetchUserQuota();
  //     setUserAddress(account); // 使用连接的钱包地址
  //   }
  // }, [account]);
  
  // 仅设置用户地址（钱包连接时）
  useEffect(() => {
    if (account) {
      setUserAddress(account); // 使用连接的钱包地址
    }
  }, [account]);

  // Reset stuck loading states on component mount
  // This handles cases where the page was refreshed during analysis
  useEffect(() => {
    if (analyzing) {
      console.log('🔧 Resetting stuck analyzing state on mount');
      setAnalyzing(false);
    }
    if (executing) {
      console.log('🔧 Resetting stuck executing state on mount');
      setExecuting(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run on mount
  
  // TEMPORARILY HIDDEN (待后续处理)
  // const fetchUserQuota = async () => {
  //   if (!account) return;
  //   try {
  //     const result = await userAPI.getQuota(account);
  //     if (result.success) {
  //       setUserQuota(result.data);
  //     }
  //   } catch (error) {
  //     console.error('获取额度失败:', error);
  //   }
  // };

  // Generate prompt based on selected data sources
  const generatePromptFromDataSources = () => {
    const basePrompt = language === 'zh' ?
`你是一家顶级量化基金的系统化交易员，在 Hyperliquid 上执行交易。
当前时间: {current_time}
账户信息: 可用资金 {account_balance} USDC

核心原则：
- 追求扣除费用后的最大利润
- 避免过度交易，每个信号都需要明确优势
- 考虑0.09%的双向手续费+滑点+资金费率
- 严格风险管理，不加仓现有头寸

分析以下币种（按优先级）：
{selected_coins}

每个币种数据：` :
`You are a systematic trader on Hyperliquid, aiming for maximum profit after fees.
Current time: {current_time}
Account: Available {account_balance} USDC

Core principles:
- Maximum profit after fees
- Avoid over-trading, need clear edge for each signal
- Consider 0.09% round-trip fees + slippage + funding
- Strict risk management, no pyramiding

Analyze these coins (by priority):
{selected_coins}

Data per coin:`;

    let dataSection = '';
    
    if (selectedDataSources.price) {
      dataSection += language === 'zh' ? '\n- 当前价格: {current_price}' : '\n- Current price: {current_price}';
    }
    if (selectedDataSources.ema) {
      dataSection += language === 'zh' ? '\n- 20周期EMA: {ema20} / 50周期EMA: {ema50}' : '\n- 20-period EMA: {ema20} / 50-period EMA: {ema50}';
    }
    if (selectedDataSources.macd) {
      dataSection += language === 'zh' ? '\n- MACD指标: {macd_value} (信号: {macd_signal})' : '\n- MACD: {macd_value} (Signal: {macd_signal})';
    }
    if (selectedDataSources.rsi) {
      dataSection += language === 'zh' ? '\n- RSI(7): {rsi_7} / RSI(14): {rsi_14}' : '\n- RSI(7): {rsi_7} / RSI(14): {rsi_14}';
    }
    if (selectedDataSources.volume) {
      dataSection += language === 'zh' ? '\n- 成交量: {volume} (平均: {avg_volume})' : '\n- Volume: {volume} (Avg: {avg_volume})';
    }
    if (selectedDataSources.funding) {
      dataSection += language === 'zh' ? '\n- 资金费率: {funding_rate}' : '\n- Funding rate: {funding_rate}';
    }
    if (selectedDataSources.oi) {
      dataSection += language === 'zh' ? '\n- 持仓量变化: {open_interest_change}' : '\n- Open interest change: {open_interest_change}';
    }
    if (selectedDataSources.liquidation) {
      dataSection += language === 'zh' ? '\n- 爆仓数据: {liquidation_data}' : '\n- Liquidation data: {liquidation_data}';
    }
    if (selectedDataSources.sentiment) {
      dataSection += language === 'zh' ? '\n- 市场情绪指数: {sentiment_index}' : '\n- Market sentiment: {sentiment_index}';
    }

    const decisionRequirements = language === 'zh' ? `

仓位计算方法：
1. 基于置信度计算保证金 (5%-100%可用资金)
2. 应用杠杆 (最小5x，根据币种调整)
3. 计算风险 (保证金的0.2-0.8倍)
4. 定义名义价值、数量、止损距离

决策输出要求：
- 每个币种一个操作：买入/卖出/持有/平仓
- 提供止损价、止盈价、置信度
- 只在预期收益显著超过成本时开仓
- 最大6个并发持仓` : `

Position sizing method:
1. Calculate margin based on confidence (5%-100% of cash)
2. Apply leverage (minimum 5x, varies by coin)
3. Derive risk (0.2-0.8 of margin)
4. Define notional, quantity, stop distance

Decision requirements:
- One action per coin: BUY/SELL/HOLD/CLOSE
- Provide stop loss, take profit, confidence
- Only enter if expected move significantly exceeds costs
- Maximum 6 concurrent positions`;

    return basePrompt + dataSection + decisionRequirements;
  };

  // 🔧 修复：每次组件挂载或语言切换时，从全局状态加载自定义 prompt
  useEffect(() => {
    const saved = customPrompts?.[language] || '';
    if (saved) {
      // 用户有保存的自定义 prompt，使用保存的
      setCustomPrompt(saved);
      lastAutoPromptRef.current = generatePromptFromDataSources();
      setPromptEdited(true);
      console.log('✅ 从全局状态加载自定义 Prompt:', saved.substring(0, 50) + '...');
    } else {
      // 没有保存的，使用默认生成的
      const initial = generatePromptFromDataSources();
      setCustomPrompt(initial);
      lastAutoPromptRef.current = initial;
      setPromptEdited(false);
      console.log('📝 使用默认 Prompt');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language, customPrompts]); // 🔧 监听 language 和 customPrompts 变化

  // Reset edited parameters when new AI results come in
  useEffect(() => {
    if (aiResults) {
      setEditedParams({});
    }
  }, [aiResults]);

  const handleDataSourceToggle = (sourceId) => {
    setSelectedDataSources(prev => ({
      ...prev,
      [sourceId]: !prev[sourceId]
    }));
  };

  const toggleSection = (section) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  // 币种选择处理
  const toggleCoinSelection = (symbol) => {
    setSelectedCoins(prev => 
      prev.includes(symbol) 
        ? prev.filter(s => s !== symbol)
        : [...prev, symbol]
    );
  };

  // 过滤币种（基于搜索）
  const filteredCoins = HYPERLIQUID_COINS.filter(coin => 
    coin.symbol.toLowerCase().includes(coinSearchQuery.toLowerCase()) ||
    coin.name.toLowerCase().includes(coinSearchQuery.toLowerCase())
  );

  // 获取主流6个币种
  const majorCoins = HYPERLIQUID_COINS.filter(coin => coin.category === 'major');

  const handleAnalyze = async () => {
    // Check if user is authenticated (Privy login)
    if (!isConnected || !account) {
      alert(language === 'zh'
        ? '请先登录以使用 AI 分析功能'
        : 'Please login first to use AI analysis');
      return;
    }

    // Check API source - platform API doesn't need user API key
    const apiSource = getApiSource(account);
    if (apiSource === 'user' && !hasApiKey(account)) {
      alert(language === 'zh'
        ? '请先前往 "AI 设置" 标签页设置您的 OpenRouter API Key\n\n或选择使用平台 API'
        : 'Please set your OpenRouter API Key in AI Setup tab first\n\nOr select to use Platform API');
      return;
    }

    // 保存当前配置到全局状态（供 Trading Panel 的自动交易使用）
    try {
      setAutoTradingConfig({
        selectedAI,
        selectedCoins,
        dataSources: selectedDataSources,
        riskPreference
      });
      console.log('✅ 自动交易配置已保存到全局状态');
    } catch (err) {
      console.warn('保存配置失败:', err);
    }

    setAnalyzing(true);
    setAiResults(null);

    // 🔧 MOCK RESPONSE - Set to true for testing without API
    const MOCK_MODE = false;
    if (MOCK_MODE) {
      setTimeout(() => {
        const mockAnalysis = {
          strategy_overview: "Market shows bullish momentum with BTC leading. ETH consolidating near resistance. Risk-on sentiment favors selective long positions.",
          current_positions_analysis: "No active positions",
          technical_analysis: {
            summary: "BTC above EMA20/50 crossover, MACD bullish, RSI 62 (neutral). ETH testing resistance at $2,000.",
            key_signals: [
              "BTC: EMA20 > EMA50, bullish crossover confirmed",
              "ETH: MACD histogram positive, momentum building",
              "SOL: RSI 58, neutral zone with upside potential"
            ],
            support_resistance: {
              support_levels: [45000, 43500],
              resistance_levels: [48000, 50000]
            }
          },
          risk_management: {
            overall_risk_level: "Medium",
            position_sizing_advice: "Use 30-50% of available capital with 5-10x leverage",
            leverage_recommendation: "5-10x for majors",
            stop_loss_strategy: "Place stops below recent support levels"
          },
          trading_decisions: [
            {
              coin: "BTC",
              action: "BUY",
              confidence: 0.78,
              reasoning: "Strong bullish momentum with EMA crossover. Price above key support at $46,000. MACD shows increasing momentum.",
              entry_price: 46500,
              quantity: 0.05,
              leverage: 8,
              stop_loss: 45200,
              take_profit: 48500,
              invalidation_condition: "Close below EMA50 on 4H",
              expected_return: "4.3%",
              risk_reward_ratio: "1:3"
            },
            {
              coin: "ETH",
              action: "BUY",
              confidence: 0.65,
              reasoning: "Consolidating at resistance. Breaking $2,000 could trigger rally to $2,200.",
              entry_price: 2000,
              quantity: 1.2,
              leverage: 5,
              stop_loss: 1920,
              take_profit: 2180,
              invalidation_condition: "Rejection at $2,000 with high volume",
              expected_return: "9%",
              risk_reward_ratio: "1:2.25"
            },
            {
              coin: "BNB",
              action: "HOLD",
              confidence: 0.45,
              reasoning: "BNB is slightly below EMA20 but remains profitable. MACD suggests bearishness, but RSI is neutral. Hold and monitor.",
              entry_price: 310,
              quantity: 0,
              leverage: 0,
              stop_loss: 0,
              take_profit: 0,
              invalidation_condition: "Break below $305",
              expected_return: "0%",
              risk_reward_ratio: "N/A"
            }
          ]
        };

        setAiResults({
          thoughtProcess: {
            strategy: mockAnalysis.strategy_overview,
            currentPositions: [{ status: mockAnalysis.current_positions_analysis }],
            technicalAnalysis: {
              summary: mockAnalysis.technical_analysis.summary,
              details: mockAnalysis.technical_analysis.key_signals.map((signal, idx) => ({
                signal: signal,
                action: 'ANALYZING'
              }))
            },
            riskManagement: {
              accountValue: tradeAmount,
              availableCash: tradeAmount * 0.7,
              totalReturn: "-2.3%",
              sharpeRatio: "1.2",
              decision: [
                `Risk Level: ${mockAnalysis.risk_management.overall_risk_level}`,
                mockAnalysis.risk_management.position_sizing_advice,
                mockAnalysis.risk_management.stop_loss_strategy
              ].filter(Boolean).join('\n')
            },
            finalDecision: mockAnalysis.trading_decisions
              .map(d => `${d.coin}: ${d.action} (Confidence: ${(d.confidence * 100).toFixed(0)}%)`)
              .join('\n')
          },
          decisions: mockAnalysis.trading_decisions.map(decision => ({
            coin: decision.coin,
            action: decision.action,
            currentPosition: decision.action === 'HOLD' ? 'SHORT' : null,
            entry: decision.entry_price || 0,
            current: decision.entry_price || 0,
            unrealizedPnl: '',
            confidence: Math.round(decision.confidence * 100),
            reason: decision.reasoning || '',
            quantity: decision.quantity,
            leverage: decision.leverage,
            stop_loss: decision.stop_loss,
            take_profit: decision.take_profit,
            risk_reward_ratio: decision.risk_reward_ratio
          })),
          rawAnalysis: mockAnalysis,
          metadata: { model: 'mock', timestamp: Date.now() }
        });
        setAnalyzing(false);
      }, 1500); // Simulate API delay
      return;
    }
    // 🔧 END MOCK RESPONSE

    try {
      // selectedAI 是数组（支持多模型），取第一个作为主模型
      const primaryModel = Array.isArray(selectedAI) ? selectedAI[0] : selectedAI;
      
      console.log('🚀 开始调用后端 AI 分析...', {
        model: primaryModel,
        coins: selectedCoins,
        dataSources: selectedDataSources,
        userAddress: account
      });

      // 获取 Privy access token（使用平台 API 时需要）
      const accessToken = await getAccessToken?.();

      // 调用真实的后端 API
      const result = await aiAPI.smartAnalysis({
        model: primaryModel,  // 使用字符串，不是数组
        coins: selectedCoins,
        dataSources: selectedDataSources,
        customPrompt: customPrompt,
        userAddress: userAddress,  // 传递用户地址以获取账户信息
        initialBalance: parseFloat(tradeAmount) || 100,  // 确保是数字类型
        riskPreference: riskPreference,  // 风险偏好
        language: language,
        chainId: effectiveChainId  // Use effectiveChainId from AuthContext (421614 testnet, 42161 mainnet)
      }, userAddress, accessToken);

      console.log('✅ AI 分析返回:', result);

      if (result.success) {
        const analysis = result.data.analysis;
        
        // 转换为前端展示格式
        setAiResults({
        thoughtProcess: {
          strategy: analysis.strategy_overview || (language === 'zh' ? '正在生成策略分析...' : 'Generating strategy analysis...'),
          comprehensiveAnalysis: analysis.comprehensive_analysis || (language === 'zh' ? '正在生成完整分析...' : 'Generating comprehensive analysis...')
        },
        
        decisions: (analysis.trading_decisions || []).map(decision => ({
          coin: decision.coin,
          action: decision.action,
          currentPosition: decision.action === 'HOLD' ? 'SHORT' : null,
          entry: decision.entry_price || 0,
          current: decision.entry_price || 0,
          unrealizedPnl: '',
          confidence: Math.round(decision.confidence * 100),
          reason: decision.reasoning || '',
          // Trading parameters
          quantity: decision.quantity,
          leverage: decision.leverage,
          stop_loss: decision.stop_loss,
          take_profit: decision.take_profit,
          risk_reward_ratio: decision.risk_reward_ratio
        })),
        
        // 保存原始数据
        rawAnalysis: analysis,
        metadata: result.data.metadata,
        
        // 保存 User Prompt（用于透明度展示）
        userPrompt: result.data.prompts?.userPrompt || ''
      });

      console.log('✅ AI 分析完成');
    } else {
      console.error('❌ 分析失败:', result.error);
      alert(`分析失败: ${result.error}\n\n请检查:\n1. 后端运行在 http://localhost:3001\n2. OpenRouter API Key 已配置`);
    }
  } catch (error) {
    console.error('❌ 错误:', error);
    alert(`错误: ${error.message}\n\n可能原因:\n1. 后端未运行\n2. 网络连接问题\n3. API 配置错误`);
  } finally {
    setAnalyzing(false);
  }
};

  // Execute trading decisions (using Privy embedded wallet)
  const handleExecuteDecisions = async () => {
    if (!aiResults || !aiResults.rawAnalysis || !aiResults.rawAnalysis.trading_decisions) {
      alert(language === 'zh' ? '没有可执行的交易决策' : 'No trading decisions to execute');
      return;
    }

    // 1. Check user authentication (Privy login)
    if (!isConnected || !account) {
      alert(language === 'zh' ? '请先登录以执行交易' : 'Please login first to execute trades');
      return;
    }

    // COMMENTED OUT: MetaMask network validation - using Privy embedded wallet now
    // // 验证网络支持
    // if (chainId !== 421614 && chainId !== 42161) {
    //   alert(language === 'zh'
    //     ? '请切换到 Arbitrum 网络（测试网或主网）'
    //     : 'Please switch to Arbitrum network (Testnet or Mainnet)');
    //   return;
    // }

    // Trading risk confirmation (always show for safety)
    const confirmed = window.confirm(
      language === 'zh'
        ? '⚠️ 交易风险确认\n\n' +
          '您即将执行交易。\n\n' +
          '风险提示：\n' +
          '• 加密货币市场波动极大，可能导致重大损失\n' +
          '• 杠杆交易会放大亏损，可能损失全部保证金\n' +
          '• AI 分析仅供参考，不构成投资建议\n' +
          '• 您对所有交易决策完全负责\n\n' +
          '免责声明：本平台是教育学习工具，不提供投资建议。\n\n' +
          '是否继续？'
        : '⚠️ Trading Risk Confirmation\n\n' +
          'You are about to execute trades.\n\n' +
          'Risk Warnings:\n' +
          '• Crypto markets are highly volatile, may cause significant losses\n' +
          '• Leverage amplifies losses, may lose all margin\n' +
          '• AI analysis is reference only, not investment advice\n' +
          '• You are fully responsible for all trading decisions\n\n' +
          'Disclaimer: This platform is an educational tool, not investment advice.\n\n' +
          'Continue?'
    );
    if (!confirmed) return;

    // 2. 检查额度 - TEMPORARILY HIDDEN (待后续处理)
    // if (userQuota && userQuota.totalQuota <= 0) {
    //   alert(language === 'zh' ? 'AI使用额度已用完，请前往钱包标签页充值' : 'AI quota exhausted, please recharge in Wallet tab');
    //   return;
    // }

    // 3. 确认执行（只跳过 HOLD，CLOSE 需要执行）
    const decisions = aiResults.rawAnalysis.trading_decisions.filter(
      d => d.action !== 'HOLD'
    );
    
    if (decisions.length === 0) {
      alert(language === 'zh' ? '没有需要执行的交易（都是HOLD）' : 'No trades to execute (all HOLD)');
      return;
    }
    
    // 统计操作类型
    const buyCount = decisions.filter(d => d.action === 'BUY').length;
    const sellCount = decisions.filter(d => d.action === 'SELL').length;
    const closeCount = decisions.filter(d => d.action === 'CLOSE').length;
    
    // 构造详细的确认信息
    let confirmMsg = language === 'zh' 
      ? `即将执行 ${decisions.length} 个交易决策：\n\n`
      : `Will execute ${decisions.length} trading decisions:\n\n`;
    
    if (buyCount > 0) confirmMsg += `${language === 'zh' ? '开仓做多' : 'Buy'}: ${buyCount} ${language === 'zh' ? '个' : ''}\n`;
    if (sellCount > 0) confirmMsg += `${language === 'zh' ? '开仓做空' : 'Sell'}: ${sellCount} ${language === 'zh' ? '个' : ''}\n`;
    if (closeCount > 0) confirmMsg += `${language === 'zh' ? '平仓' : 'Close'}: ${closeCount} ${language === 'zh' ? '个' : ''}\n`;
    
    confirmMsg += `\n${language === 'zh' ? '注意：将使用您的嵌入式钱包执行（无需签名）' : 'Note: Will execute via your embedded wallet (no signature required)'}\n\n${language === 'zh' ? '确认执行？' : 'Confirm?'}`;
    
    if (!confirm(confirmMsg)) {
      return;
    }

    setExecuting(true);
    setExecutionResults(null);

    try {
      console.log('🚀 使用 Privy 嵌入式钱包执行订单...');

      // 4. 构造订单（只处理业务逻辑，格式化交给 SDK）
      const positions = aiResults?.accountData?.positions || [];
      const orders = decisions.map((decision, idx) => {
        const isClose = decision.action === 'CLOSE';
        let side = decision.action;

        // 判断平仓方向
        if (isClose) {
          const position = positions.find(p => p.coin === decision.coin);
          if (position) {
            const szi = parseFloat(position.szi || 0);
            side = szi > 0 ? 'SELL' : 'BUY';
          } else {
            side = 'SELL';  // 默认
          }
        }

        // Get raw decision for full data
        const rawDecision = aiResults.rawAnalysis.trading_decisions.find(d => d.coin === decision.coin) || decision;

        return {
          coin: decision.coin,
          side: side,
          quantity: editedParams[idx]?.quantity ?? (decision.quantity || rawDecision.quantity || decision.size),
          limitPrice: decision.entry_price || rawDecision.entry_price || 0,  // 0 = 让 SDK 获取市价
          reduceOnly: isClose,
          // Trading parameters
          leverage: editedParams[idx]?.leverage ?? (decision.leverage || rawDecision.leverage),
          stop_loss: editedParams[idx]?.stop_loss ?? (decision.stop_loss || rawDecision.stop_loss),
          take_profit: editedParams[idx]?.take_profit ?? (decision.take_profit || rawDecision.take_profit),
          risk_reward_ratio: decision.risk_reward_ratio || rawDecision.risk_reward_ratio
        };
      });

      // 5. Execute using Privy embedded wallet (server-side execution)
      // The backend will handle signing with the platform's agent wallet on behalf of the user
      let result;

      // COMMENTED OUT: MetaMask Agent Wallet logic - kept for reference
      // if (isAgentActive && agentInfo) {
      //   console.log('✅ 使用 Agent Wallet 新模式');
      //
      //   // 获取 Agent 私钥
      //   const agentPrivateKey = await getAgentKey();
      //   if (!agentPrivateKey) {
      //     throw new Error(language === 'zh' ? 'Agent 私钥获取失败' : 'Failed to get Agent private key');
      //   }
      //
      //   // 🔍 调试日志
      //   console.log('📤 发送到后端的数据:', {
      //     mainWalletAddress: account,
      //     agentAddress: agentInfo.address,
      //     agentData: {
      //       address: agentInfo.address,
      //       permissions: agentInfo.permissions,
      //       approvalSignature: agentInfo.approvalSignature?.substring(0, 20) + '...'
      //     }
      //   });
      //
      //   // 使用新模式调用 API
      //   result = await signingAPI.executeWithAgent({
      //     orders,
      //     mainWalletAddress: account,
      //     agentPrivateKey: agentPrivateKey,
      //     agentData: agentInfo,
      //     chainId: chainId // 传递当前网络 ID
      //   });
      //
      //   console.log('✅ Agent Wallet 新模式执行完成');
      // } else {
      //   // 旧模式已移除，必须使用 Agent Wallet
      //   throw new Error(language === 'zh'
      //     ? '请先创建 Agent Wallet。服务器不再支持直接执行交易。'
      //     : 'Please create an Agent Wallet first. Server no longer supports direct trading.');
      // }

      // Execute using Agent Wallet (approved by Privy embedded wallet)
      // This keeps the embedded wallet's private key secure - only Agent signs trades
      if (!isAgentActive || !agentInfo) {
        throw new Error(language === 'zh'
          ? '请先创建 Agent Wallet。前往钱包管理页面创建。'
          : 'Please create an Agent Wallet first. Go to Wallet tab to create one.');
      }

      console.log('🔐 Getting Agent private key for signing...');
      const agentPrivateKey = await getAgentKey();

      if (!agentPrivateKey) {
        throw new Error(language === 'zh'
          ? '无法获取 Agent 私钥。请重新创建 Agent Wallet。'
          : 'Failed to get Agent private key. Please recreate Agent Wallet.');
      }

      console.log('📤 Sending trade request:', {
        mainWalletAddress: account,
        agentAddress: agentInfo.address,
        ordersCount: orders.length,
        network: isSimulationMode ? 'Testnet' : 'Mainnet',
        chainId: effectiveChainId
      });

      result = await signingAPI.executeWithAgent({
        orders,
        mainWalletAddress: account,           // Privy embedded wallet address (main account)
        agentPrivateKey: agentPrivateKey,     // Agent wallet private key for signing
        agentData: agentInfo,                 // Agent info (address, permissions, etc.)
        chainId: effectiveChainId             // Testnet or mainnet based on simulation mode
      });

      console.log('✅ Trade execution completed:', result);

      // 6. 更新额度 - TEMPORARILY HIDDEN (待后续处理)
      // await fetchUserQuota();

      // 7. 显示结果
      const executionSummary = result.data || {};
      const orderResults = executionSummary.results || [];
      
      const displayResults = orderResults.map(r => ({
        coin: r.coin,
        success: r.success,
        rejected: r.rejected,
        message: r.success 
          ? (r.filled ? `已成交 @ $${r.filled.avgPx}` : '执行成功')
          : (r.rejected ? `平台拒绝: ${r.error}` : `失败: ${r.error}`)
      }));
      
      setExecutionResults({
        success: true,
        data: executionSummary,
        message: result.message,
        results: displayResults,
        successCount: executionSummary.success || 0,
        rejectedCount: executionSummary.rejected || 0,
        failureCount: executionSummary.failed || 0,
        timestamp: Date.now()
      });

    } catch (error) {
      console.error('❌ 交易执行失败:', error);

      if (error.message.includes('额度')) {
        alert(error.message);
      } else {
        alert(`${language === 'zh' ? '交易执行失败' : 'Trade execution failed'}: ${error.message}`);
      }
      
      // 获取决策列表（如果有的话）
      const decisions = aiResults?.rawAnalysis?.trading_decisions?.filter(
        d => d.action !== 'HOLD'
      ) || [];
      
      const failedResults = decisions.map(d => ({
        coin: d.coin,
        action: d.action,
        success: false,
        message: error.message
      }));
      
      setExecutionResults({
        success: false,
        error: error.message,
        results: failedResults,  // 添加 results 数组
        successCount: 0,
        failureCount: decisions.length,
        timestamp: Date.now()
      });
    } finally {
      setExecuting(false);
    }
  };

  return (
    <div className="space-y-6 text-gray-900 dark:text-white">
      {/* Login prompt */}
      {!isConnected && (
        <div className="bg-yellow-50 dark:bg-yellow-500/10 border border-yellow-200 dark:border-yellow-500/20 rounded-xl p-4 shadow-sm">
          <p className="text-yellow-700 dark:text-yellow-400 text-sm flex items-center gap-2">
            <AlertCircle size={16} />
            {language === 'zh'
              ? '请先登录以使用 AI 分析和交易功能'
              : 'Please login first to use AI analysis and trading features'}
          </p>
        </div>
      )}

      {/* Agent Wallet Widget moved to execution section - only shows when needed */}

      {/* AI 额度显示 - TEMPORARILY HIDDEN (待后续处理) */}
      {/* {isConnected && userQuota && (
        <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Zap className="text-yellow-400" size={20} />
              <span className="text-gray-400 text-sm">
                {language === 'zh' ? 'AI 分析额度' : 'AI Analysis Quota'}
              </span>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-green-400 text-sm">
                {language === 'zh' ? '免费' : 'Free'}: {userQuota.freeQuota}
              </span>
              <span className="text-blue-400 text-sm">
                {language === 'zh' ? '付费' : 'Paid'}: {userQuota.paidQuota}
              </span>
              <span className="text-white font-medium">
                {language === 'zh' ? '总计' : 'Total'}: {userQuota.totalQuota}
              </span>
              <button
                onClick={fetchUserQuota}
                className="p-1 hover:bg-gray-700 rounded transition-colors"
              >
                <RefreshCw size={14} className="text-gray-400" />
              </button>
            </div>
          </div>
          {userQuota.totalQuota === 0 && (
            <div className="mt-2 pt-2 border-t border-gray-700">
              <p className="text-red-400 text-xs">
                {language === 'zh' ? '额度已用完，请前往钱包标签页充值或设置自有 API Key' : 'Quota exhausted, please recharge or set your own API Key in Wallet tab'}
              </p>
            </div>
          )}
        </div>
      )} */}

      {/* AI Model Selection with Compare Mode */}
      <div className={`${cardClass} p-6`}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-gray-900 dark:text-white font-semibold text-lg flex items-center gap-2">
            <Brain className="text-blue-500 dark:text-blue-400" />
            {t[language].selectAI}
          </h3>
          <div className="flex flex-col items-end gap-1">
            <button
              disabled
              className="px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-500 cursor-not-allowed opacity-60"
            >
              <Layers size={16} className="inline mr-1" />
              {t[language].multiAI}
            </button>
            <span className="text-xs text-gray-500 dark:text-gray-500 italic">
              {language === 'zh' ? '功能即将到来 ✨' : 'Coming Soon ✨'}
            </span>
          </div>
        </div>

        {/* 主推荐模型 - 5个 */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-4">
          {aiModels.map(model => (
            <div 
              key={model.id}
              onClick={() => {
                // 多模型对比功能暂时禁用，只支持单选
                setSelectedAI([model.id]);
              }}
              className={`border rounded-2xl p-4 cursor-pointer transition-all hover:scale-[1.02] ${
                selectedAI.includes(model.id) 
                  ? 'border-blue-200 bg-blue-50 text-blue-700 shadow-md dark:border-blue-500 dark:bg-blue-500/10 dark:text-white' 
                  : 'border-gray-200 bg-white hover:border-blue-200 shadow-sm dark:border-gray-700 dark:bg-gray-900'
              }`}
            >
              <div className="flex items-center justify-between mb-3">
                {/* 品牌 Logo */}
                <AILogo modelId={model.id} size={32} className="flex-shrink-0" />
                {selectedAI.includes(model.id) && (
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

        {/* 其他可选模型 - 下拉选择 */}
        <div className="pt-4 border-t border-gray-100 dark:border-gray-700">
          <label className={`${mutedTextClass} text-sm mb-2 block`}>
            {language === 'zh' ? '或选择其他 OpenRouter 模型' : 'Or select other OpenRouter models'}
          </label>
          <select 
            onChange={(e) => {
              const modelId = e.target.value;
              if (modelId) {
                // 多模型对比功能暂时禁用，只支持单选
                setSelectedAI([modelId]);
                e.target.value = ''; // 重置选择
              }
            }}
            className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-blue-500"
          >
            <option value="">
              {language === 'zh' ? '-- 选择其他模型 --' : '-- Select Other Model --'}
            </option>
            <option value="gemini">✨ Gemini 2.5 Pro - $1.25/M input</option>
            <option value="mixtral">🎯 Mixtral 8x7B - $0.005/1k tokens</option>
            <option value="llama3">🦙 LLaMA 3.1 70B - $0.004/1k tokens</option>
          </select>
        </div>

        {/* 已选择的模型显示 */}
        {selectedAI.length > 0 && (
          <div className="mt-4 flex items-center gap-2 flex-wrap">
            <span className="text-gray-400 text-sm">
              {language === 'zh' ? '当前选择：' : 'Current:'}
            </span>
            {selectedAI.map(modelId => {
              const model = aiModels.find(m => m.id === modelId) || 
                           { id: modelId, name: modelId, icon: '🤖', brandColor: 'from-gray-600 to-gray-700' };
              return (
                <span
                  key={modelId}
                  className="px-3 py-2 bg-blue-50 text-blue-600 dark:bg-blue-500/20 dark:text-blue-300 rounded-lg text-sm flex items-center gap-2 border border-blue-100 dark:border-blue-500/30"
                >
                  <AILogo modelId={model.id} size={20} className="flex-shrink-0" />
                  <span className="font-medium">{model.name}</span>
                </span>
              );
            })}
          </div>
        )}
      </div>

      {/* 币种选择器 */}
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

        {/* 主流6个币种 - 多选 */}
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
                  selectedCoins.includes(coin.symbol)
                    ? 'border-blue-300 bg-blue-50 shadow-md dark:border-blue-500 dark:bg-blue-500/10'
                    : 'border-gray-200 bg-white hover:border-blue-200 dark:border-gray-700 dark:bg-gray-900/50'
                }`}
              >
                <div className="flex flex-col items-center gap-2">
                  {/* 图标 */}
                  <div className={`w-12 h-12 rounded-full bg-gradient-to-br ${coin.color} flex items-center justify-center text-white text-2xl font-bold shadow-lg`}>
                    {coin.icon}
                  </div>
                  {/* 币种信息 */}
                  <div className="text-center">
                    <div className="text-gray-900 dark:text-white font-bold text-sm">{coin.symbol}</div>
                    <div className="text-gray-500 dark:text-gray-400 text-xs">{coin.name}</div>
                  </div>
                </div>
                {selectedCoins.includes(coin.symbol) && (
                  <div className="absolute top-2 right-2 w-6 h-6 bg-blue-500 text-white rounded-full flex items-center justify-center shadow-lg">
                    <Check size={14} className="text-white" />
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* 已选择的币种显示 */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`${mutedTextClass} text-sm font-medium`}>
            {language === 'zh' ? '已选择：' : 'Selected:'}
          </span>
          {selectedCoins.map(symbol => {
            const coin = HYPERLIQUID_COINS.find(c => c.symbol === symbol);
            return (
              <span
                key={symbol}
                className="px-3 py-1.5 bg-blue-50 text-blue-600 dark:bg-blue-500/20 dark:text-blue-300 rounded-lg text-sm flex items-center gap-2 border border-blue-100 dark:border-blue-500/30"
              >
                {coin?.icon && (
                  <span className="text-base">{coin.icon}</span>
                )}
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
          {selectedCoins.length === 0 && (
            <span className="text-gray-500 text-sm">
              {language === 'zh' ? '未选择任何币种' : 'No coins selected'}
            </span>
          )}
        </div>

        {/* 展开的搜索和更多币种选择 */}
        {showCoinSelector && (
          <div className="mt-6 pt-6 border-t border-gray-700">
            {/* 搜索框 */}
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

            {/* 所有币种列表 */}
            <div className="max-h-64 overflow-y-auto">
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                {filteredCoins.map(coin => (
                  <button
                    key={coin.symbol}
                    onClick={() => toggleCoinSelection(coin.symbol)}
                    className={`relative p-3 rounded-lg border transition-all text-left hover:scale-[1.01] ${
                      selectedCoins.includes(coin.symbol)
                        ? 'border-blue-300 bg-blue-50 dark:border-blue-500 dark:bg-blue-500/10'
                        : 'border-gray-200 bg-white hover:border-gray-300 dark:border-gray-700 dark:bg-gray-900/30'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {/* 图标 */}
                      <div className={`w-8 h-8 rounded-full bg-gradient-to-br ${coin.color} flex items-center justify-center text-white text-sm font-bold flex-shrink-0`}>
                        {coin.icon}
                      </div>
                      {/* 币种信息 */}
                      <div className="flex-1 min-w-0">
                        <div className="text-gray-900 dark:text-white font-medium text-sm">{coin.symbol}</div>
                        <div className="text-gray-500 text-xs truncate">{coin.name}</div>
                      </div>
                      {/* 选中标记 */}
                      {selectedCoins.includes(coin.symbol) && (
                        <Check size={16} className="text-blue-500 dark:text-blue-400 flex-shrink-0" />
                      )}
                    </div>
                  </button>
                ))}
              </div>
              {filteredCoins.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  {language === 'zh' ? '未找到匹配的币种' : 'No matching coins found'}
                </div>
              )}
            </div>

            {/* 提示信息 */}
            <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-500/10 border border-blue-100 dark:border-blue-500/20 rounded-lg">
              <p className="text-blue-600 dark:text-blue-400 text-sm flex items-start gap-2">
                <Info size={16} className="mt-0.5 flex-shrink-0" />
                {language === 'zh' 
                  ? `所有币种均为 Hyperliquid 平台支持的交易对。已选择 ${selectedCoins.length} 个币种。`
                  : `All coins are supported trading pairs on Hyperliquid. ${selectedCoins.length} coins selected.`}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Advanced Trading Panel with Prompt Customization */}
      <div className={`${cardClass} p-6`}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-gray-900 dark:text-white font-semibold text-lg flex items-center gap-2">
            <Zap className="text-yellow-500 dark:text-yellow-400" />
            {language === 'zh' ? '智能交易决策中心' : 'Smart Trading Decision Center'}
          </h3>
        </div>

        {/* Prompt Template Section */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <label className="text-gray-900 dark:text-white font-medium flex items-center gap-2">
              <span className="text-xl">🪄</span>
              {language === 'zh' ? '打造你的 AI 交易魔法' : 'Create Your Trading Magic'}
            </label>
            <button
              onClick={() => {
                const resetVal = generatePromptFromDataSources();
                setCustomPrompt(resetVal);
                lastAutoPromptRef.current = resetVal;
                setPromptEdited(false);
                // Clearing saved custom prompt so it's treated as default
                clearCustomPromptForLanguage(language);
              }}
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
              value={customPrompt}
              onChange={(e) => {
                const val = e.target.value;
                setCustomPrompt(val);
                const edited = val !== lastAutoPromptRef.current;
                setPromptEdited(edited);
                if (edited) {
                  setCustomPromptForLanguage(language, val);
                  console.log('💾 保存自定义 Prompt 到全局状态 (语言:', language, ')');
                } else {
                  // If user reverted to default exactly, clear saved custom to avoid false positives
                  clearCustomPromptForLanguage(language);
                  console.log('🗑️ 清除自定义 Prompt (恢复默认)');
                }
              }}
              placeholder={language === 'zh' 
                ? '✨ 在这里告诉 AI 你的交易想法，比如"我更喜欢短线交易"、"避开高风险币种"等...' 
                : '✨ Tell the AI your trading ideas here, like "I prefer short-term trades", "Avoid high-risk coins", etc...'}
            />
          </div>
          
          <div className="mt-2 p-2 bg-purple-50 dark:bg-purple-500/10 border border-purple-100 dark:border-purple-500/20 rounded-lg">
            <p className="text-purple-600 dark:text-purple-300 text-xs flex items-start gap-2">
              <span className="text-base">💡</span>
              <span>
                {language === 'zh' 
                  ? '你可以直接编辑上面的文字，加入你自己的想法！花括号里的内容（如 {account_balance}、{selected_coins}）会由系统自动填充真实数据，你不需要改动。重点是告诉 AI 你的交易风格和偏好。'
                  : "Edit the text above freely! Content in curly braces (like {account_balance}, {selected_coins}) will be automatically filled with real data—no need to change them. Focus on telling the AI your trading style and preferences."}
              </span>
            </p>
          </div>
        </div>

        {/* Data Source Selection */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <label className="text-gray-900 dark:text-white font-medium flex items-center gap-2">
              <span className="text-xl">📊</span>
              {language === 'zh' ? '选择你想要的数据来分析' : 'Choose Your Analysis Data'}
            </label>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {[
              {
                id: 'price', 
                name: language === 'zh' ? '价格数据' : 'Price Data', 
                required: true,
                tooltip: language === 'zh' 
                  ? '币种的实时价格，最基础的交易数据'
                  : 'Real-time coin price, the most basic trading data'
              },
              { 
                id: 'ema', 
                name: language === 'zh' ? 'EMA 均线' : 'EMA Lines', 
                required: false,
                tooltip: language === 'zh'
                  ? '看趋势的指标，就像看天气预报，告诉你价格接下来可能涨还是跌'
                  : 'Trend indicator, like a weather forecast, tells you if price will likely go up or down'
              },
              { 
                id: 'macd', 
                name: 'MACD', 
                required: false,
                tooltip: language === 'zh'
                  ? '看涨跌力量的指标，告诉你现在是买的人多还是卖的人多'
                  : 'Shows buying vs selling power. Tells you if more people are buying or selling'
              },
              { 
                id: 'rsi', 
                name: 'RSI', 
                required: false,
                tooltip: language === 'zh'
                  ? '看价格贵不贵的指标，就像温度计。>70 太热（贵了），<30 太冷（便宜了）'
                  : 'Price temperature check. >70 too hot (expensive), <30 too cold (cheap)'
              },
              { 
                id: 'volume', 
                name: language === 'zh' ? '成交量' : 'Volume', 
                required: false,
                tooltip: language === 'zh'
                  ? '有多少人在交易，人越多越热闹，趋势信号越可靠'
                  : 'How many people are trading. More people = more reliable signals'
              },
              { 
                id: 'funding', 
                name: language === 'zh' ? '资金费率' : 'Funding Rate', 
                required: false,
                tooltip: language === 'zh'
                  ? '持仓要付的小费用。正数=看涨的人多，负数=看跌的人多'
                  : 'Small cost to hold positions. Positive = more bulls, negative = more bears'
              },
              { 
                id: 'oi', 
                name: language === 'zh' ? '持仓量' : 'Open Interest', 
                required: false,
                tooltip: language === 'zh'
                  ? '有多少人还没平仓。数字变大说明更多人进场交易了'
                  : "How many haven't closed yet. Increasing = more people entering trades"
              },
              { 
                id: 'liquidation', 
                name: language === 'zh' ? '爆仓数据' : 'Liquidations', 
                required: false,
                tooltip: language === 'zh'
                  ? '有多少人亏钱被强制平仓。大量爆仓往往是价格转折点'
                  : 'How many got forced out. Large liquidations often mean price turning point'
              },
              { 
                id: 'sentiment', 
                name: language === 'zh' ? '市场情绪' : 'Sentiment', 
                required: false,
                tooltip: language === 'zh'
                  ? '大家是乐观还是悲观。别人恐慌时可能是好的买入机会'
                  : 'Is everyone optimistic or scared? Fear can be a good buying opportunity'
              },
            ]
            .filter((source, index) => {
              // 前6个始终显示，后面的根据展开状态显示
              return index < 6 || showMoreDataSources;
            })
            .map(source => (
              <div key={source.id} className="relative group">
                <label 
                  className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition-all ${
                    selectedDataSources[source.id]
                      ? 'bg-blue-50 border-blue-200 dark:bg-blue-500/10 dark:border-blue-500/30' 
                      : 'bg-white border-gray-200 hover:border-blue-200 dark:bg-gray-900/50 dark:border-gray-700 hover:dark:border-gray-600'
                  } ${source.required ? 'opacity-100 cursor-not-allowed' : ''}`}
                >
                  <input 
                    type="checkbox" 
                    checked={selectedDataSources[source.id]}
                    disabled={source.required}
                    onChange={() => !source.required && handleDataSourceToggle(source.id)}
                    className="rounded border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">{source.name}</span>
                </label>
                
                {/* Tooltip - only show for non-required items */}
                {!source.required && (
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 p-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50 pointer-events-none">
                    <div className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed">
                      {source.tooltip}
                    </div>
                    {/* Arrow */}
                    <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-px">
                      <div className="border-4 border-transparent border-t-gray-200 dark:border-t-gray-600"></div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
          
          {/* 展开/收起按钮 */}
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
          
          <div className="mt-3 p-3 bg-yellow-50 dark:bg-yellow-500/10 border border-yellow-100 dark:border-yellow-500/20 rounded-lg">
            <p className="text-yellow-700 dark:text-yellow-300 text-xs flex items-start gap-2">
              <Lightbulb size={12} className="mt-0.5 flex-shrink-0" />
              {language === 'zh' 
                ? '提示：这些数据源会由后端自动获取并包含在市场数据中。您可以在上方 Prompt 中添加自定义的分析指令。'
                : 'Tip: These data sources will be automatically fetched by the backend and included in market data. You can add custom analysis instructions in the prompt above.'}
            </p>
          </div>
        </div>

        {/* Trading Amount - 突出显示 */}
        <div className="mb-6 p-5 bg-gradient-to-br from-blue-50 to-purple-50 dark:from-blue-500/5 dark:to-purple-500/5 border border-blue-100 dark:border-blue-500/20 rounded-xl">
          <label className="text-gray-900 dark:text-white font-semibold text-base mb-3 block flex items-center gap-2">
            <span className="text-xl">💰</span>
            {language === 'zh' ? '你想用多少钱来交易？' : 'How Much Do You Want to Trade?'}
          </label>
          
          <div className="flex items-center gap-3 mb-3">
            <div className="flex-1">
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-lg">$</span>
                <input
                  type="number"
                  value={tradeAmount}
                  onChange={(e) => setTradeAmount(e.target.value)}
                  min="10"
                  step="10"
                  placeholder="100"
                  className="w-full bg-white dark:bg-gray-900 border-2 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white rounded-lg pl-8 pr-20 py-3 text-lg font-semibold focus:outline-none focus:border-blue-500 transition-colors"
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 text-sm">USDC</span>
              </div>
            </div>
          </div>
          
          {/* 快捷金额按钮 */}
          <div className="flex items-center gap-2 mb-2">
            <span className={`${mutedTextClass} text-xs`}>{language === 'zh' ? '快速选择：' : 'Quick select:'}</span>
            {[50, 100, 500, 1000].map(amount => (
              <button
                key={amount}
                onClick={() => setTradeAmount(amount.toString())}
                className="px-3 py-1.5 bg-white border border-gray-200 text-gray-600 rounded-lg text-xs hover:bg-gray-50 transition-colors dark:bg-gray-800 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-700"
              >
                ${amount}
              </button>
            ))}
          </div>
          
          <p className="text-xs text-blue-600 dark:text-blue-400 flex items-center gap-1">
            <Info size={12} />
            {language === 'zh' 
              ? '最小 $10，建议从小金额开始试试'
              : 'Min $10, suggest starting with a small amount'}
          </p>
        </div>

        {/* 其他设置 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
          <div>
            <label className={`${mutedTextClass} text-sm mb-2 block`}>
              {language === 'zh' ? '风险偏好' : 'Risk Preference'}
            </label>
            <select 
              value={riskPreference}
              onChange={(e) => setRiskPreference(e.target.value)}
              className="w-full bg-white border border-gray-200 text-gray-900 rounded-lg px-4 py-2 dark:bg-gray-900 dark:border-gray-700 dark:text-white"
            >
              <option value="conservative">{language === 'zh' ? '保守 (5-10x)' : 'Conservative (5-10x)'}</option>
              <option value="balanced">{language === 'zh' ? '平衡 (10-15x)' : 'Balanced (10-15x)'}</option>
              <option value="aggressive">{language === 'zh' ? '激进 (15-20x)' : 'Aggressive (15-20x)'}</option>
            </select>
          </div>
          <div>
            <label className={`${mutedTextClass} text-sm mb-2 block`}>
              {language === 'zh' ? '交易所' : 'Exchange'}
            </label>
            <select className="w-full bg-white border border-gray-200 text-gray-900 rounded-lg px-4 py-2 dark:bg-gray-900 dark:border-gray-700 dark:text-white">
              <option>Hyperliquid (0.02%)</option>
              <option disabled className="text-gray-600">Aster (0.03%) - {language === 'zh' ? '即将推出' : 'Coming Soon'}</option>
            </select>
          </div>
        </div>

        {/* Analyze Button */}
        <button 
          onClick={handleAnalyze}
          disabled={analyzing}
          className="w-full px-4 py-3 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-lg hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2 mb-6"
        >
          {analyzing ? (
            <>
              <RefreshCw className="animate-spin" size={16} />
              {language === 'zh' ? 'AI 正在分析市场数据...' : 'AI Analyzing Market Data...'}
            </>
          ) : (
            <>
              <Brain size={16} />
              {language === 'zh' ? '开始 AI 分析' : 'Start AI Analysis'}
            </>
          )}
        </button>

        {/* 🎯 提示：状态会在切换tab后保持 */}
        {(analyzing || aiResults) && (
          <div className="mb-6 p-3 bg-green-50 dark:bg-green-500/10 border border-green-100 dark:border-green-500/20 rounded-lg">
            <p className="text-green-700 dark:text-green-300 text-xs flex items-center gap-2">
              <CheckCircle size={14} />
              {language === 'zh'
                ? '💡 提示：您的分析结果会自动保存，可以安全地切换到其他标签页。'
                : '💡 Tip: Your analysis results are auto-saved. Feel free to switch to other tabs.'}
            </p>
          </div>
        )}

        {/* User Prompt Display - 可折叠窗口（在按钮和 Chain of Thought 之间） */}
        {aiResults && aiResults.userPrompt && (
          <div className="mb-6 bg-blue-50/80 dark:bg-gray-900/50 border border-blue-100 dark:border-blue-500/20 rounded-2xl overflow-hidden">
            <button
              onClick={() => toggleSection('userPrompt')}
              className="w-full flex items-center justify-between p-4 hover:bg-blue-100/60 dark:hover:bg-gray-800/30 transition-colors"
            >
              <div className="flex items-center gap-2">
                <Info className="text-blue-500 dark:text-blue-400" size={16} />
                <h4 className="text-gray-900 dark:text-white font-medium">
                  {language === 'zh' ? '📊 AI 看到了什么' : '📊 What AI Sees'}
                </h4>
              </div>
              <ChevronDown 
                className={`text-gray-500 dark:text-gray-400 transition-transform ${expandedSections.userPrompt ? 'rotate-180' : ''}`} 
                size={16} 
              />
            </button>
            
            {expandedSections.userPrompt && (
              <div className="p-4 pt-0">
                <div className="bg-white dark:bg-gray-800/50 rounded-lg p-4 max-h-[500px] overflow-y-auto border border-gray-100 dark:border-gray-700">
                  <pre className="text-gray-700 dark:text-gray-300 text-xs font-mono whitespace-pre-wrap leading-relaxed">
                    {aiResults.userPrompt}
                  </pre>
                </div>
                <p className="mt-3 text-gray-500 dark:text-gray-400 text-xs">
                  {language === 'zh' 
                    ? '💡 这里显示发送给 AI 的所有信息：市场数据（价格、指标）、您的持仓、以及分析要求。完全透明，让您放心。'
                    : '💡 This shows everything sent to AI: market data (prices, indicators), your positions, and analysis instructions. Fully transparent for your peace of mind.'}
                </p>
              </div>
            )}
          </div>
        )}

        {/* AI Chain of Thought & Results */}
        {aiResults && (
          <div className="space-y-6">
            {/* Chain of Thought Process */}
            <div className="bg-gray-50 dark:bg-gray-900/50 border border-gray-100 dark:border-gray-700 rounded-2xl p-6 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h4 className="text-gray-900 dark:text-white font-medium text-lg flex items-center gap-2">
                  <Brain className="text-purple-500 dark:text-purple-400" />
                  {language === 'zh' ? 'AI 思维链分析' : 'AI Chain of Thought'}
                </h4>
              </div>

              {/* Strategy Overview - Always visible */}
              <div className="mb-4 p-4 bg-white dark:bg-gray-800/50 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm">
                <h5 className="text-gray-900 dark:text-white font-medium mb-2 flex items-center gap-2">
                  <Target size={14} className="text-blue-500 dark:text-blue-400" />
                  {language === 'zh' ? '策略概述' : 'Strategy Overview'}
                </h5>
                <p className="text-gray-600 dark:text-gray-300 text-sm leading-relaxed">
                  {aiResults.thoughtProcess.strategy}
                </p>
              </div>

              {/* AI Comprehensive Analysis - Collapsible */}
              <div className="bg-blue-50 dark:bg-blue-500/10 border border-blue-100 dark:border-blue-500/20 rounded-xl overflow-hidden">
                <button
                  onClick={() => toggleSection('comprehensiveAnalysis')}
                  className="w-full flex items-center justify-between p-4 hover:bg-blue-100/70 dark:hover:bg-blue-500/5 transition-colors"
                >
                  <h5 className="text-blue-600 dark:text-blue-300 font-medium flex items-center gap-2">
                    <CheckCircle size={14} />
                    {language === 'zh' ? 'AI 完整分析' : 'AI Comprehensive Analysis'}
                  </h5>
                  <ChevronDown 
                    className={`text-blue-600 dark:text-blue-300 transition-transform ${expandedSections.comprehensiveAnalysis ? 'rotate-180' : ''}`} 
                    size={16} 
                  />
                </button>
                
                {expandedSections.comprehensiveAnalysis && (
                  <div className="px-4 pb-4">
                    <div className="text-gray-600 dark:text-gray-300 text-sm leading-relaxed whitespace-pre-line">
                      {aiResults.thoughtProcess.comprehensiveAnalysis}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Trading Decisions */}
            <div className="space-y-4">
              <h4 className="text-gray-900 dark:text-white font-medium flex items-center gap-2">
                <Activity className="text-green-400" />
                {language === 'zh' ? '交易决策执行' : 'Trading Decision Execution'}
              </h4>

              {/* Decisions Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {aiResults.decisions.map((decision, idx) => (
                  <div
                    key={idx}
                    onClick={() => setSelectedDecisionIndex(idx)}
                    className={`rounded-2xl p-4 cursor-pointer transition-all ${
                      selectedDecisionIndex === idx
                        ? 'border-2 border-blue-300 bg-blue-50 shadow-md dark:border-blue-500 dark:bg-blue-500/10'
                        : 'border-2 border-gray-100 bg-white hover:border-blue-200 dark:border-gray-700 dark:bg-gray-900/50'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-lg font-bold text-gray-900 dark:text-white">{decision.coin}</span>
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                        decision.action === 'HOLD'
                          ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-500/20 dark:text-yellow-300'
                          : 'bg-blue-100 text-blue-600 dark:bg-blue-500/20 dark:text-blue-300'
                      }`}>
                        {decision.action}
                      </span>
                    </div>

                    <div className="space-y-2 text-sm">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <span className={`${mutedTextClass} text-xs`}>{language === 'zh' ? '当前仓位' : 'Position'}</span>
                          <div className="text-gray-900 dark:text-white font-medium">{decision.currentPosition}</div>
                        </div>
                        <div>
                          <span className={`${mutedTextClass} text-xs`}>{language === 'zh' ? '浮动盈亏' : 'Unrealized PnL'}</span>
                          <div className={`font-medium ${
                            decision.unrealizedPnl?.startsWith('+') ? 'text-green-400' : 'text-red-400'
                          }`}>
                            {decision.unrealizedPnl}
                          </div>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <span className={mutedTextClass}>{language === 'zh' ? '入场' : 'Entry'}</span>
                          <div className="text-gray-700 dark:text-gray-300">{decision.entry}</div>
                        </div>
                        <div>
                          <span className={mutedTextClass}>{language === 'zh' ? '当前' : 'Current'}</span>
                          <div className="text-gray-700 dark:text-gray-300">{decision.current}</div>
                        </div>
                      </div>

                      <div className="flex justify-between items-center">
                        <span className={`${mutedTextClass} text-xs`}>
                          {language === 'zh' ? '置信度' : 'Confidence'}
                        </span>
                        <div className="flex items-center gap-2">
                          <div className="w-20 bg-gray-200 dark:bg-gray-800 rounded-full h-2">
                            <div 
                              className="bg-gradient-to-r from-blue-500 to-purple-600 h-2 rounded-full"
                              style={{ width: `${decision.confidence}%` }}
                            />
                          </div>
                          <span className="text-gray-900 dark:text-white text-xs">{decision.confidence}%</span>
                        </div>
                      </div>
                    </div>

                    {/* Trading Parameters - Customizable */}
                    <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-800 space-y-2">
                      <h6 className={`${mutedTextClass} text-xs font-medium mb-2`}>
                        {language === 'zh' ? '交易参数' : 'Trading Parameters'}
                      </h6>

                      <div className="grid grid-cols-2 gap-2">
                        {/* Quantity */}
                        <div>
                          <label className={`${mutedTextClass} text-xs block mb-1`}>
                            {language === 'zh' ? '数量' : 'Quantity'}
                          </label>
                          <input
                            type="number"
                            min="0"
                            step="0.001"
                            value={editedParams[idx]?.quantity ?? decision.quantity}
                            onChange={(e) => {
                              const value = parseFloat(e.target.value);
                              if (value >= 0 || e.target.value === '') {
                                setEditedParams(prev => ({
                                  ...prev,
                                  [idx]: { ...prev[idx], quantity: value }
                                }));
                              }
                            }}
                            className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white rounded px-2 py-1 text-xs focus:outline-none focus:border-blue-500"
                          />
                        </div>

                        {/* Leverage */}
                        <div>
                          <label className={`${mutedTextClass} text-xs block mb-1`}>
                            {language === 'zh' ? '杠杆' : 'Leverage'}
                          </label>
                          <input
                            type="number"
                            min="1"
                            max="20"
                            step="1"
                            value={editedParams[idx]?.leverage ?? decision.leverage}
                            onChange={(e) => {
                              const value = parseInt(e.target.value);
                              if ((value >= 1 && value <= 20) || e.target.value === '') {
                                setEditedParams(prev => ({
                                  ...prev,
                                  [idx]: { ...prev[idx], leverage: value }
                                }));
                              }
                            }}
                            className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white rounded px-2 py-1 text-xs focus:outline-none focus:border-blue-500"
                          />
                        </div>

                        {/* Stop Loss */}
                        <div>
                          <label className={`${mutedTextClass} text-xs block mb-1`}>
                            {language === 'zh' ? '止损' : 'Stop Loss'}
                          </label>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={editedParams[idx]?.stop_loss ?? decision.stop_loss}
                            onChange={(e) => {
                              const value = parseFloat(e.target.value);
                              if (value >= 0 || e.target.value === '') {
                                setEditedParams(prev => ({
                                  ...prev,
                                  [idx]: { ...prev[idx], stop_loss: value }
                                }));
                              }
                            }}
                            className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white rounded px-2 py-1 text-xs focus:outline-none focus:border-blue-500"
                          />
                        </div>

                        {/* Take Profit */}
                        <div>
                          <label className={`${mutedTextClass} text-xs block mb-1`}>
                            {language === 'zh' ? '止盈' : 'Take Profit'}
                          </label>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={editedParams[idx]?.take_profit ?? decision.take_profit}
                            onChange={(e) => {
                              const value = parseFloat(e.target.value);
                              if (value >= 0 || e.target.value === '') {
                                setEditedParams(prev => ({
                                  ...prev,
                                  [idx]: { ...prev[idx], take_profit: value }
                                }));
                              }
                            }}
                            className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white rounded px-2 py-1 text-xs focus:outline-none focus:border-blue-500"
                          />
                        </div>
                      </div>

                      {/* Risk/Reward Ratio - Display Only */}
                      <div className="flex justify-between items-center text-xs">
                        <span className={mutedTextClass}>{language === 'zh' ? '风险/收益比' : 'Risk/Reward'}</span>
                        <span className="text-blue-600 dark:text-blue-300 font-medium">{decision.risk_reward_ratio}</span>
                      </div>
                    </div>

                    <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-800">
                      <p className={`${mutedTextClass} text-xs dark:text-gray-400`}>{decision.reason}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* MVP 提示 */}
              <div className="bg-blue-50 dark:bg-blue-500/10 border border-blue-100 dark:border-blue-500/20 rounded-lg p-4">
                <h5 className="text-blue-600 dark:text-blue-300 font-medium flex items-center gap-2 mb-2">
                  <Info size={14} />
                  {language === 'zh' ? 'MVP 测试模式' : 'MVP Test Mode'}
                </h5>
                <p className="text-gray-600 dark:text-gray-300 text-sm">
                  {language === 'zh' 
                    ? '当前使用项目测试账号执行交易，无需配置私钥。所有交易在 Hyperliquid 测试网上进行，不涉及真实资金。'
                    : 'Currently using project test account for execution. All trades are executed on Hyperliquid testnet with no real funds.'}
                </p>
              </div>

              {/* Agent Wallet Widget - Show when user needs to create Agent before executing */}
              {isConnected && !isAgentActive && (
                <AgentWalletWidget language={language} selectedCoins={selectedCoins} />
              )}

              {/* Execute Button - Only enabled when Agent Wallet is active */}
              <button
                onClick={handleExecuteDecisions}
                disabled={executing || !isAgentActive}
                className={`w-full px-4 py-3 rounded-lg flex items-center justify-center gap-2 font-medium transition-all ${
                  isAgentActive
                    ? 'bg-gradient-to-r from-green-500 to-blue-500 text-white hover:opacity-90 disabled:opacity-50'
                    : 'bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400 cursor-not-allowed'
                }`}
                title={!isAgentActive ? (language === 'zh' ? '请先创建 Agent Wallet' : 'Please create Agent Wallet first') : ''}
              >
                {executing ? (
                  <>
                    <RefreshCw className="animate-spin" size={20} />
                    {language === 'zh' ? '执行中...' : 'Executing...'}
                  </>
                ) : !isAgentActive ? (
                  <>
                    <AlertCircle size={20} />
                    {language === 'zh' ? '需要 Agent Wallet' : 'Agent Wallet Required'}
                  </>
                ) : (
                  <>
                    <PlayCircle size={20} />
                    {language === 'zh' ? '执行决策 (测试网)' : 'Execute Decisions (Testnet)'}
                  </>
                )}
              </button>

              {/* Execution Results */}
              {executionResults && (
                <div className="bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-700 rounded-lg p-4 space-y-3">
                  <h5 className="text-gray-900 dark:text-white font-medium flex items-center gap-2">
                    <CheckCircle size={14} className="text-green-500 dark:text-green-400" />
                    {language === 'zh' ? '执行结果' : 'Execution Results'}
                  </h5>
                  
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-green-50 dark:bg-green-500/10 border border-green-100 dark:border-green-500/20 rounded p-2">
                      <div className="text-green-700 dark:text-green-300 text-xs">{language === 'zh' ? '成功' : 'Success'}</div>
                      <div className="text-gray-900 dark:text-white font-bold text-lg">{executionResults.successCount}</div>
                    </div>
                    <div className="bg-red-50 dark:bg-red-500/10 border border-red-100 dark:border-red-500/20 rounded p-2">
                      <div className="text-red-700 dark:text-red-300 text-xs">{language === 'zh' ? '失败' : 'Failed'}</div>
                      <div className="text-gray-900 dark:text-white font-bold text-lg">{executionResults.failureCount}</div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    {executionResults.results && executionResults.results.map((result, index) => (
                      <div 
                        key={index}
                        className={`p-2 rounded text-sm ${
                          result.success 
                            ? 'bg-green-50 dark:bg-green-500/10 border border-green-100 dark:border-green-500/20 text-green-700 dark:text-green-300'
                            : 'bg-red-50 dark:bg-red-500/10 border border-red-100 dark:border-red-500/20 text-red-700 dark:text-red-300'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-medium">{result.coin} - {result.action}</span>
                          {result.success ? (
                            <Check size={14} />
                          ) : (
                            <XCircle size={14} />
                          )}
                        </div>
                        <div className="text-xs mt-1 opacity-80">{result.message}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default DashboardTab;
