import React, { useState, useEffect, useRef } from 'react';
import { EquityChart } from '../ui/EquityChart';
import {
  Activity,
  Wallet,
  PauseCircle,
  PlayCircle,
  XCircle,
  AlertCircle,
  Info,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Settings,
  CheckCircle,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { accountAPI, aiAPI, signingAPI } from '../../utils/api';
import { useAppStore } from '../../contexts/useAppStore';
import { useAuth } from '../../contexts/AuthContext';
// COMMENTED OUT: MetaMask wallet context - kept for future external wallet top-up feature
// import { useWallet } from '../../contexts/WalletContext';

// SVG 折线图组件
const LineChart = ({ data, color = '#3b82f6', height = 300 }) => {
  // ✅ 增强的数据验证
  if (!data || !Array.isArray(data) || data.length === 0) return null;

  // ✅ 过滤掉 NaN、Infinity 和无效数值
  const validData = data.filter(v => typeof v === 'number' && isFinite(v));

  if (validData.length === 0) return null;

  const width = 100; // percentage
  const padding = 5;

  // ✅ 使用验证后的数据计算最大最小值
  const max = Math.max(...validData);
  const min = Math.min(...validData);
  const range = max - min || 1;
  
  // 生成路径点 - 使用验证后的数据
  const points = validData.map((value, index) => {
    const x = (index / (validData.length - 1)) * width;
    const y = padding + ((max - value) / range) * (100 - padding * 2);
    return `${x},${y}`;
  }).join(' ');

  // 生成面积填充路径 - 使用验证后的数据
  const areaPath = `M 0,${100 - padding} L ${validData.map((value, index) => {
    const x = (index / (validData.length - 1)) * width;
    const y = padding + ((max - value) / range) * (100 - padding * 2);
    return `${x},${y}`;
  }).join(' L ')} L ${width},${100 - padding} Z`;
  
  return (
    <div className="w-full" style={{ height: `${height}px` }}>
      <svg 
        viewBox={`0 0 ${width} 100`}
        className="w-full h-full"
        preserveAspectRatio="none"
      >
        {/* 网格线 */}
        <line x1="0" y1="25" x2={width} y2="25" stroke="#374151" strokeWidth="0.2" opacity="0.3" />
        <line x1="0" y1="50" x2={width} y2="50" stroke="#374151" strokeWidth="0.2" opacity="0.5" />
        <line x1="0" y1="75" x2={width} y2="75" stroke="#374151" strokeWidth="0.2" opacity="0.3" />
        
        {/* 面积填充 */}
        <path
          d={areaPath}
          fill={`url(#gradient-${color.replace('#', '')})`}
          opacity="0.3"
        />
        
        {/* 折线 */}
        <polyline
          points={points}
          fill="none"
          stroke={color}
          strokeWidth="0.5"
          vectorEffect="non-scaling-stroke"
        />
        
        {/* 渐变定义 */}
        <defs>
          <linearGradient id={`gradient-${color.replace('#', '')}`} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={color} stopOpacity="0.4" />
            <stop offset="100%" stopColor={color} stopOpacity="0.0" />
          </linearGradient>
        </defs>
      </svg>
    </div>
  );
};

const cardClass = 'bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-700 rounded-2xl shadow-sm';
const mutedText = 'text-gray-600 dark:text-gray-400';
const badgeClass = 'px-2 py-0.5 rounded-full text-xs font-medium';

const TradingDashboardTab = ({ language, selectedToken, setSelectedToken, tradeAmount }) => {
  // Privy Auth Context - embedded wallet for all services
  const { authenticated, walletAddress, isAgentActive, agentInfo, getAgentKey, effectiveChainId, getAccessToken } = useAuth();

  // Map Privy auth to component variables for compatibility
  const account = walletAddress;
  const isConnected = authenticated;
  // Use effectiveChainId directly - it's already computed based on network mode (testnet/mainnet)
  const chainId = effectiveChainId;

  // COMMENTED OUT: MetaMask wallet context - kept for future external wallet top-up feature
  // const { isConnected, account, chainId, isAgentActive, agentInfo, getAgentKey } = useWallet();
  // Agent Wallet state now comes from useAuth (Privy embedded wallet + Agent)

  const [analyzing, setAnalyzing] = useState(false);
  const [aiResults, setAiResults] = useState(null);
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
  const [showClosePositionModal, setShowClosePositionModal] = useState(false);
  const [selectedPositionToClose, setSelectedPositionToClose] = useState(null);
  const [selectedTimeframe, setSelectedTimeframe] = useState('7D');
  const [closingPosition, setClosingPosition] = useState(false);

  // Network mode - testnet (simulation) vs mainnet
  const isSimulationMode = useAppStore(state => state.isSimulationMode);

  // AI 自动交易状态 - 使用全局状态管理（持久化，切换tab不丢失）
  const autoTradingEnabled = useAppStore(state => state.autoTradingEnabled);
  const setAutoTradingEnabled = useAppStore(state => state.setAutoTradingEnabled);
  const tradingInterval = useAppStore(state => state.tradingInterval);
  const setTradingInterval = useAppStore(state => state.setTradingInterval);
  const nextRunTime = useAppStore(state => state.nextRunTime); // 持久化下次执行时间
  const setNextRunTime = useAppStore(state => state.setNextRunTime);
  const tradingHistory = useAppStore(state => state.tradingHistory);
  const addTradingRecord = useAppStore(state => state.addTradingRecord);
  const autoTradingConfig = useAppStore(state => state.autoTradingConfig);
  const setAutoTradingConfig = useAppStore(state => state.setAutoTradingConfig);

  // 本地UI状态（切换tab后重置也没关系）
  const [intervalInputValue, setIntervalInputValue] = useState(String(tradingInterval)); // 输入框的值
  const [intervalError, setIntervalError] = useState(''); // 验证错误信息
  const [showIntervalSettings, setShowIntervalSettings] = useState(true);
  const [isAnalyzing, setIsAnalyzing] = useState(false); // 当前是否正在分析
  const [expandedPrompts, setExpandedPrompts] = useState({}); // 跟踪哪些记录的prompt是展开的
  const [expandedReasonings, setExpandedReasonings] = useState({}); // 跟踪哪些记录的reasoning是展开的

  // Hyperliquid 账户数据状态（使用全局持久化存储）
  const userAddress = useAppStore(state => state.userAddress);
  const setUserAddress = useAppStore(state => state.setUserAddress);
  const customPrompts = useAppStore(state => state.customPrompts);

  // 定时器引用
  const autoTradingTimerRef = useRef(null);
  const autoTradingTimeoutRef = useRef(null); // 用于存储 setTimeout
  const [accountData, setAccountData] = useState(null);
  const [positions, setPositions] = useState([]);
  const [openOrders, setOpenOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // 同步 tradingInterval 到输入框（当从全局状态恢复时）
  useEffect(() => {
    setIntervalInputValue(String(tradingInterval));
  }, [tradingInterval]);

  // 历史数据存储 - 真实累积的时间序列数据
  // 初始化为空数组，等待 userAddress 设置后再从 localStorage 加载
  const [accountValueHistory, setAccountValueHistory] = useState([]);
  
  // Running strategies state (保持模拟数据)
  const [runningStrategies, setRunningStrategies] = useState([
    { 
      id: 1, 
      name: language === 'zh' ? '系统化交易策略' : 'Systematic Trading',
      status: 'running',
      startTime: '2025-10-24 08:00',
      totalTrades: 156,
      winRate: '83%',
      pnl: '+$313.09',
      nextAction: '3 min'
    },
    {
      id: 2,
      name: language === 'zh' ? 'EMA交叉策略' : 'EMA Crossover',
      status: 'paused',
      startTime: '2025-10-23 14:30',
      totalTrades: 42,
      winRate: '71%',
      pnl: '-$127.50',
      nextAction: 'Paused'
    }
  ]);

  // 获取 Hyperliquid 账户数据
  const fetchAccountData = async (signal) => {
    if (!userAddress) return;

    setLoading(true);
    setError(null);

    try {
      // ✅ 检查请求是否已取消
      if (signal && signal.aborted) {
        console.log('请求已取消');
        return;
      }

      console.log('获取账户数据:', userAddress);
      
      // 获取账户概览
      const overview = await accountAPI.getOverview(userAddress, 10000, chainId || 421614);

      // ✅ 再次检查请求是否已取消（API 响应后）
      if (signal && signal.aborted) {
        console.log('请求已在响应后取消，忽略结果');
        return;
      }

      // ✅ 添加完整的 API 响应验证
      if (overview && overview.success && overview.data) {
        setAccountData(overview.data);
        
        // 设置持仓数据
        if (overview.data.positions && Array.isArray(overview.data.positions) && overview.data.positions.length > 0) {
          const formattedPositions = overview.data.positions.map((pos, index) => ({
            id: index + 1,
            coin: pos.coin,
            type: pos.side,
            entry: pos.entryPrice,
            current: pos.currentPrice,
            leverage: pos.leverage,
            size: pos.size,
            pnl: pos.unrealizedPnl >= 0 ? `+$${pos.unrealizedPnl.toFixed(2)}` : `-$${Math.abs(pos.unrealizedPnl).toFixed(2)}`,
            pnlPercent: pos.returnPercent >= 0 ? `+${pos.returnPercent.toFixed(2)}%` : `${pos.returnPercent.toFixed(2)}%`,
            liquidationPrice: pos.liquidationPrice,
            marginUsed: pos.marginUsed
          }));
          setPositions(formattedPositions);
        } else {
          setPositions([]);
        }
        
        // 设置未成交订单
        if (overview.data.openOrders && Array.isArray(overview.data.openOrders)) {
          setOpenOrders(overview.data.openOrders);
        } else {
          setOpenOrders([]);
        }

        // 记录真实的历史数据点
        // ✅ 添加安全的属性访问和类型验证
        const currentValue = (overview.data.performance && typeof overview.data.performance.currentValue === 'number')
          ? overview.data.performance.currentValue
          : 0;
        const currentPnl = (overview.data.positionStats && typeof overview.data.positionStats.totalUnrealizedPnl === 'number')
          ? overview.data.positionStats.totalUnrealizedPnl
          : 0;
        const timestamp = Date.now();
        
        setAccountValueHistory(prev => {
          // 避免在短时间内重复添加相同的数据点（1分钟内）
          const lastPoint = prev[prev.length - 1];
          if (lastPoint && (timestamp - lastPoint.time) < 60 * 1000) {
            // 更新最后一个点的数据，而不是跳过
            const updated = [...prev];
            updated[updated.length - 1] = {
              time: timestamp,
              accountValue: currentValue,
              pnl: currentPnl
            };
            return updated;
          }
          
          const newPoint = {
            time: timestamp,
            accountValue: currentValue,
            pnl: currentPnl
          };
          
          // 保留最近 30 天的数据（每分钟一个点，最多 43200 个点）
          const newHistory = [...prev, newPoint];
          const maxPoints = 43200;
          return newHistory.slice(-maxPoints);
        });
        
        console.log('✅ 账户数据已更新');
        console.log('账户价值:', currentValue);
        console.log('真实盈亏:', currentPnl);
        console.log('历史数据点数:', accountValueHistory.length);
      } else {
        // ✅ API 响应无效时的处理
        console.warn('⚠️ API 响应无效或不完整:', overview);
        setError('无法获取账户数据，请稍后重试');
      }
    } catch (err) {
      console.error('获取账户数据失败:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };
  
  // 保存历史数据到 localStorage（按网络隔离）
  useEffect(() => {
    if (accountValueHistory.length > 0 && chainId) {
      try {
        // ✅ 规范化地址（转换为小写）并添加网络标识
        const normalizedAddress = userAddress.toLowerCase();
        const networkSuffix = chainId === 42161 ? '_mainnet' : '_testnet';
        const key = `accountHistory_${normalizedAddress}${networkSuffix}`;
        const data = JSON.stringify(accountValueHistory);

        // ✅ 检查 localStorage 容量
        try {
          localStorage.setItem(key, data);
        } catch (quotaError) {
          if (quotaError.name === 'QuotaExceededError') {
            console.warn('⚠️ localStorage 容量已满，尝试清理旧数据');
            // 尝试保留最近一半的数据
            const halfHistory = accountValueHistory.slice(Math.floor(accountValueHistory.length / 2));
            localStorage.setItem(key, JSON.stringify(halfHistory));
            setAccountValueHistory(halfHistory);
          } else {
            throw quotaError;
          }
        }
      } catch (error) {
        console.error('保存历史数据失败:', error);
        // 不阻止应用继续运行
      }
    }
  }, [accountValueHistory, userAddress, chainId]); // 添加 chainId 依赖

  // 初始化加载账户数据
  useEffect(() => {
    // 🔧 修复：当用户连接钱包时，始终更新地址（即使已有旧地址）
    if (account && account !== userAddress) {
      console.log(`✅ 更新用户地址: ${userAddress} -> ${account}`);
      setUserAddress(account);
    }

    // 只有在用户已登录且 userAddress 存在时才开始获取数据
    if (!isConnected || !userAddress) {
      return;
    }

    // ✅ 使用 Set 管理多个 AbortController
    const abortControllers = new Set();
    let isMounted = true;

    const fetchWithAbort = async () => {
      if (!isMounted) return;

      const controller = new AbortController();
      abortControllers.add(controller);

      try {
        await fetchAccountData(controller.signal);
      } finally {
        abortControllers.delete(controller);
      }
    };

    // 立即执行第一次
    fetchWithAbort();

    // 每5分钟刷新一次数据
    const interval = setInterval(fetchWithAbort, 5 * 60 * 1000);

    // ✅ 清理函数：取消所有进行中的请求
    return () => {
      isMounted = false;
      abortControllers.forEach(c => c.abort());
      clearInterval(interval);
    };
  }, [account, userAddress, chainId, isConnected]); // 添加 isConnected 和 chainId 依赖
  
  // 当地址或网络改变时，重新加载对应的历史数据
  useEffect(() => {
    if (!isConnected || !userAddress || !chainId) {
      setAccountValueHistory([]);
      return;
    }

    try {
      // ✅ 规范化地址（转换为小写）并添加网络标识
      const normalizedAddress = userAddress.toLowerCase();
      const networkSuffix = chainId === 42161 ? '_mainnet' : '_testnet';
      const key = `accountHistory_${normalizedAddress}${networkSuffix}`;
      const saved = localStorage.getItem(key);
      setAccountValueHistory(saved ? JSON.parse(saved) : []);
      console.log(`📊 加载历史数据 (${chainId === 42161 ? '主网' : '测试网'}): ${saved ? JSON.parse(saved).length : 0} 条记录`);
    } catch (error) {
      console.error('加载历史数据失败:', error);
      setAccountValueHistory([]);
    }
  }, [userAddress, chainId, isConnected]); // 添加 isConnected 依赖

  // 网络切换时清除旧的分析结果和停止自动交易
  const prevChainIdRef = useRef(chainId);
  useEffect(() => {
    // 只在 chainId 真正改变时执行（不包括初始化）
    if (prevChainIdRef.current && chainId && prevChainIdRef.current !== chainId) {
      console.log(`🔄 网络切换: ${prevChainIdRef.current === 42161 ? '主网' : '测试网'} → ${chainId === 42161 ? '主网' : '测试网'}`);
      
      // 清除旧的 AI 分析结果
      setAiResults(null);
      
      // 如果自动交易正在运行，停止它
      if (autoTradingEnabled) {
        console.log('⚠️ 网络切换，自动停止自动交易');
        setAutoTradingEnabled(false);
        if (autoTradingTimeoutRef.current) {
          clearTimeout(autoTradingTimeoutRef.current);
          autoTradingTimeoutRef.current = null;
        }
        if (autoTradingTimerRef.current) {
          clearInterval(autoTradingTimerRef.current);
          autoTradingTimerRef.current = null;
        }
        setNextRunTime(null);
        
        // 显示提示
        setTimeout(() => {
          alert(language === 'zh'
            ? '⚠️ 网络已切换，自动交易已停止。请在新网络重新启动。'
            : '⚠️ Network switched. Auto trading stopped. Please restart on new network.');
        }, 100);
      }
      
      console.log(`✅ 网络切换完成，已清除旧数据`);
    }
    
    // 更新 ref
    prevChainIdRef.current = chainId;
  }, [chainId, autoTradingEnabled, language]); // 监听 chainId 变化

  // 格式化账户余额数据
  const getAccountBalance = () => {
    // ✅ 增强的 null/undefined 检查
    if (!accountData || !accountData.performance) {
      return {
        accountValue: 0,
        unrealizedPnl: 0,
        unrealizedPnlPercent: 0,
        marginUsed: 0,
        marginUsedPercent: 0,
        availableCash: 0,
        availableCashPercent: 0
      };
    }

    const { performance, positionStats } = accountData;

    // ✅ 安全的数值提取，带类型检查
    const accountValue = (performance && typeof performance.currentValue === 'number')
      ? performance.currentValue
      : 0;

    // ⚠️ 重要：使用 positionStats 中的真实盈亏数据，而不是 performance.unrealizedPnl
    // positionStats.totalUnrealizedPnl 是从所有持仓计算出的准确值
    const unrealizedPnl = (positionStats && typeof positionStats.totalUnrealizedPnl === 'number')
      ? positionStats.totalUnrealizedPnl
      : 0;

    const marginUsed = (performance && typeof performance.marginUsed === 'number')
      ? performance.marginUsed
      : 0;
    const availableCash = (performance && typeof performance.availableCash === 'number')
      ? performance.availableCash
      : 0;

    // 计算盈亏百分比：相对于已用保证金（更能反映实际收益率）
    // ✅ 添加除零检查
    const unrealizedPnlPercent = (marginUsed > 0 && !isNaN(unrealizedPnl))
      ? (unrealizedPnl / marginUsed) * 100
      : 0;

    return {
      accountValue: isNaN(accountValue) ? 0 : accountValue,
      unrealizedPnl: isNaN(unrealizedPnl) ? 0 : unrealizedPnl,
      unrealizedPnlPercent: isNaN(unrealizedPnlPercent) ? 0 : unrealizedPnlPercent,
      marginUsed: isNaN(marginUsed) ? 0 : marginUsed,
      marginUsedPercent: (accountValue > 0 && !isNaN(marginUsed))
        ? (marginUsed / accountValue) * 100
        : 0,
      availableCash: isNaN(availableCash) ? 0 : availableCash,
      availableCashPercent: (accountValue > 0 && !isNaN(availableCash))
        ? (availableCash / accountValue) * 100
        : 0
    };
  };

  const balance = getAccountBalance();

  const getPortfolioHistory = () => {
    if (!accountData || !accountData.portfolio?.raw) {
      console.log('📊 [PortfolioHistory] 无账户数据');
      return {
        balance: [],
        pnl: [],
        currentBalance: 0,
        currentPnl: 0,
      };
    }
    let data = accountData.portfolio.raw;
    switch (selectedTimeframe) {
      case '24H':
        data = data.day;
        break;
      case '7D':
        data = data.week;
        break;
      case '30D':
        data = data.month;
        break;
      default:
        data = data.day;
    }

    // 🔍 调试：检查数据是否存在
    if (!data || !data.accountValueHistory || data.accountValueHistory.length === 0) {
      console.warn(`⚠️ [PortfolioHistory] ${selectedTimeframe} 时间段无数据`);
      return {
        balance: [],
        pnl: [],
        currentBalance: accountData.portfolio?.allTime?.accountValue || 0,
        currentPnl: accountData.portfolio?.allTime?.pnl || 0,
      };
    }

    // 🔧 关键修复：先过滤掉无效数据点（value <= 1），再计算初始余额
    const validAccountValueHistory = data.accountValueHistory.filter(([timestamp, value]) => {
      const parsedValue = parseFloat(value);
      return parsedValue > 1; // 过滤掉 0 或小于 1 的无效数据
    });

    if (validAccountValueHistory.length === 0) {
      console.warn(`⚠️ [PortfolioHistory] ${selectedTimeframe} 过滤后无有效数据`);
      return {
        balance: [],
        pnl: [],
        currentBalance: accountData.portfolio?.allTime?.accountValue || 0,
        currentPnl: accountData.portfolio?.allTime?.pnl || 0,
      };
    }

    // 计算初始余额（使用过滤后的第一个有效数据点）
    const initialBalance = parseFloat(validAccountValueHistory[0][1]);

    // 🔍 调试：打印初始余额和数据点数量
    console.log(`📊 [${selectedTimeframe}] 初始余额: ${initialBalance}, 原始数据点数: ${data.accountValueHistory.length}, 有效数据点数: ${validAccountValueHistory.length}`);

    const balanceData = validAccountValueHistory.map(([timestamp, value], idx) => {
      const currentValue = parseFloat(value);
      const pnl = currentValue - initialBalance;
      const pnl_pct = initialBalance !== 0 ? (pnl / initialBalance) * 100 : 0;

      return {
        timestamp,
        total_equity: currentValue,
        pnl: pnl,
        pnl_pct: pnl_pct,
        cycle_number: idx + 1,
      };
    });

    // 🔍 调试：打印第一个和最后一个数据点的百分比
    if (balanceData.length > 0) {
      console.log(`📊 [${selectedTimeframe}] 第一个点 pnl_pct: ${balanceData[0].pnl_pct.toFixed(2)}%`);
      console.log(`📊 [${selectedTimeframe}] 最后一个点 pnl_pct: ${balanceData[balanceData.length - 1].pnl_pct.toFixed(2)}%`);
    }

    // 同样过滤 pnlHistory（虽然通常不需要，但保持一致性）
    const validPnlHistory = data.pnlHistory?.filter(([timestamp, value]) => {
      return true; // PnL 可以是负数，所以不过滤
    }) || [];

    return {
      balance: balanceData,
      pnl: validPnlHistory.map(([timestamp, value], idx) => {
        const pnlValue = parseFloat(value);
        // PnL 历史数据：使用累计盈亏，百分比基于初始余额
        const pnl_pct = initialBalance !== 0 ? (pnlValue / initialBalance) * 100 : 0;

        return {
          timestamp,
          total_equity: pnlValue,
          pnl: pnlValue,
          pnl_pct: pnl_pct,
          cycle_number: idx + 1,
        };
      }),
      currentBalance: accountData.portfolio.allTime.accountValue,
      currentPnl: accountData.portfolio.allTime.pnl,
    }
  }
  const portfolioHistory = getPortfolioHistory();

  // 获取图表数据 - 使用真实的历史数据
  const getChartData = () => {
    const currentValue = balance.accountValue || 0;
    const currentPnl = balance.unrealizedPnl || 0;
    
    // 确定时间范围（毫秒）
    let timeRangeMs;
    switch (selectedTimeframe) {
      case '24H':
        timeRangeMs = 24 * 60 * 60 * 1000;
        break;
      case '7D':
        timeRangeMs = 7 * 24 * 60 * 60 * 1000;
        break;
      case '30D':
        timeRangeMs = 30 * 24 * 60 * 60 * 1000;
        break;
      default:
        timeRangeMs = 7 * 24 * 60 * 60 * 1000;
    }
    
    const now = Date.now();
    const cutoffTime = now - timeRangeMs;
    
    // 过滤出时间范围内的历史数据
    const filteredHistory = accountValueHistory.filter(point => point.time >= cutoffTime);
    
    // 如果历史数据不足，用模拟数据补充开头部分
    const minPoints = selectedTimeframe === '24H' ? 48 : 
                     selectedTimeframe === '7D' ? 84 : 60;
    
    let accountValueData = [];
    let pnlData = [];
    
    if (filteredHistory.length === 0) {
      // 完全没有历史数据，生成初始模拟数据
      const baseValue = currentValue * 0.95;
      const basePnl = currentPnl * 0.8;
      
      for (let i = 0; i < minPoints; i++) {
        const progress = i / (minPoints - 1);
        accountValueData.push(baseValue + (currentValue - baseValue) * progress);
        pnlData.push(basePnl + (currentPnl - basePnl) * progress);
      }
    } else {
      // 有历史数据
      if (filteredHistory.length < minPoints) {
        // 数据点不足，在前面补充平滑过渡
        const needPoints = minPoints - filteredHistory.length;
        const firstValue = filteredHistory[0].accountValue;
        const firstPnl = filteredHistory[0].pnl;
        
        for (let i = needPoints - 1; i >= 0; i--) {
          const progress = (needPoints - i) / needPoints;
          accountValueData.push(firstValue * (0.95 + 0.05 * progress));
          pnlData.push(firstPnl * (0.8 + 0.2 * progress));
        }
      }
      
      // 添加真实历史数据
      filteredHistory.forEach(point => {
        accountValueData.push(point.accountValue);
        pnlData.push(point.pnl);
      });
    }
    
    // 确保最后一个点是最新的真实数据
    if (accountValueData.length > 0 && currentValue > 0) {
      accountValueData[accountValueData.length - 1] = currentValue;
      pnlData[pnlData.length - 1] = currentPnl;
    }
    
    return { accountValueData, pnlData };
  };

  // 验证时间间隔输入
  const validateInterval = (value) => {
    // 检查是否为空
    if (!value || value.trim() === '') {
      return language === 'zh' ? '请输入时间间隔' : 'Please enter interval';
    }

    // 检查是否为数字
    const numValue = Number(value);
    if (isNaN(numValue)) {
      return language === 'zh' ? '请输入有效的数字' : 'Please enter a valid number';
    }

    // 检查是否为正整数
    if (!Number.isInteger(numValue) || numValue <= 0) {
      return language === 'zh' ? '请输入正整数' : 'Please enter a positive integer';
    }

    // 检查最小值（至少1分钟）
    if (numValue < 1) {
      return language === 'zh' ? '时间间隔至少为1分钟' : 'Minimum interval is 1 minute';
    }

    // 检查最大值（建议不超过1440分钟，即24小时）
    if (numValue > 1440) {
      return language === 'zh' ? '时间间隔不能超过1440分钟（24小时）' : 'Maximum interval is 1440 minutes (24 hours)';
    }

    return ''; // 验证通过
  };

  // 处理时间间隔输入
  const handleIntervalChange = (value) => {
    setIntervalInputValue(value);
    const error = validateInterval(value);
    setIntervalError(error);

    // 如果验证通过，更新实际的时间间隔
    if (!error) {
      setTradingInterval(Number(value));
    }
  };

  // 自动执行交易决策
  const executeTradeDecisions = async (analysis) => {
    try {
      const tradingDecisions = analysis.trading_decisions || [];

      // 过滤掉HOLD决策
      const decisionsToExecute = tradingDecisions.filter(d => d.action !== 'HOLD');

      if (decisionsToExecute.length === 0) {
        console.log('ℹ️ 没有需要执行的交易（都是HOLD）');
        return {
          success: true,
          executed: 0,
          message: language === 'zh' ? '无需执行交易（全部为HOLD）' : 'No trades to execute (all HOLD)'
        };
      }

      console.log(`📋 准备执行 ${decisionsToExecute.length} 个交易决策`);

      // Check user authentication (Privy login)
      if (!isConnected || !account) {
        throw new Error(language === 'zh' ? '请先登录' : 'Please login first');
      }

      // COMMENTED OUT: MetaMask network validation - using Privy embedded wallet now
      // // 验证网络支持
      // if (chainId !== 421614 && chainId !== 42161) {
      //   throw new Error(language === 'zh'
      //     ? '请切换到 Arbitrum 网络（测试网或主网）'
      //     : 'Please switch to Arbitrum network (Testnet or Mainnet)');
      // }

      // Trading risk confirmation (always show for safety)
      const confirmed = window.confirm(
        language === 'zh'
          ? '⚠️ 交易风险确认\n\n' +
            `您即将执行 ${decisionsToExecute.length} 笔交易。\n\n` +
            '风险提示：\n' +
            '• 加密货币市场波动极大，可能导致重大损失\n' +
            '• 杠杆交易会放大亏损，可能损失全部保证金\n' +
            '• AI 分析仅供参考，不构成投资建议\n' +
            '• 您对所有交易决策完全负责\n\n' +
            '免责声明：本平台是教育学习工具，不提供投资建议。\n\n' +
            '是否继续？'
          : '⚠️ Trading Risk Confirmation\n\n' +
            `You are about to execute ${decisionsToExecute.length} trades.\n\n` +
            'Risk Warnings:\n' +
            '• Crypto markets are highly volatile, may cause significant losses\n' +
            '• Leverage amplifies losses, may lose all margin\n' +
            '• AI analysis is reference only, not investment advice\n' +
            '• You are fully responsible for all trading decisions\n\n' +
            'Disclaimer: This platform is an educational tool, not investment advice.\n\n' +
            'Continue?'
      );
      if (!confirmed) {
        throw new Error(language === 'zh' ? '用户取消了交易' : 'User cancelled transaction');
      }

      // COMMENTED OUT: Agent Wallet check - using server-side execution with embedded wallet
      // if (!isAgentActive || !agentInfo) {
      //   throw new Error(language === 'zh'
      //     ? '请先创建 Agent Wallet。为了资金安全，服务器不再支持直接交易。'
      //     : 'Please create Agent Wallet first. For security reasons, server no longer supports direct trading.');
      // }

      // 构造订单
      const orders = decisionsToExecute.map(decision => {
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

        return {
          coin: decision.coin,
          side: side,
          quantity: decision.quantity,
          limitPrice: decision.entry_price || 0,  // 0 = 市价
          reduceOnly: isClose,
          leverage: decision.leverage,
          stop_loss: decision.stop_loss,
          take_profit: decision.take_profit,
          risk_reward_ratio: decision.risk_reward_ratio
        };
      });

      // Execute trading using server-side execution with embedded wallet
      let result;

      // COMMENTED OUT: MetaMask Agent Wallet execution - kept for reference
      // if (isAgentActive && agentInfo) {
      //   console.log('✅ 使用 Agent Wallet 执行交易');
      //
      //   const agentPrivateKey = await getAgentKey();
      //   if (!agentPrivateKey) {
      //     throw new Error(language === 'zh' ? 'Agent 私钥获取失败' : 'Failed to get Agent private key');
      //   }
      //
      //   result = await signingAPI.executeWithAgent({
      //     orders,
      //     mainWalletAddress: account,
      //     agentPrivateKey: agentPrivateKey,
      //     agentData: agentInfo,
      //     chainId: chainId
      //   });
      // } else {
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

      // 统计结果
      const successCount = result.results?.filter(r => r.success).length || 0;
      const failedCount = result.results?.filter(r => !r.success).length || 0;

      return {
        success: true,
        executed: successCount,
        failed: failedCount,
        total: decisionsToExecute.length,
        details: result.results,
        message: `${language === 'zh' ? '执行完成' : 'Executed'}: ${successCount}/${decisionsToExecute.length}`
      };

    } catch (error) {
      console.error('❌ 交易执行失败:', error);
      return {
        success: false,
        error: error.message,
        message: error.message
      };
    }
  };

  // 设置自动交易定时器（智能恢复保存的时间）
  const setupAutoTradingTimer = (executeImmediately = false) => {
    // 清除旧的定时器
    if (autoTradingTimeoutRef.current) {
      clearTimeout(autoTradingTimeoutRef.current);
      autoTradingTimeoutRef.current = null;
    }
    if (autoTradingTimerRef.current) {
      clearInterval(autoTradingTimerRef.current);
      autoTradingTimerRef.current = null;
    }

    const intervalMs = tradingInterval * 60 * 1000;
    const now = Date.now();

    // 检查是否有保存的 nextRunTime
    if (nextRunTime && !executeImmediately) {
      const scheduledTime = new Date(nextRunTime).getTime();
      const timeUntilNext = scheduledTime - now;

      if (timeUntilNext > 0) {
        // 保存的时间未过期，使用 setTimeout 等待到那个时间点
        console.log('📅 恢复保存的执行计划，距离下次执行:', Math.round(timeUntilNext / 1000), '秒');
        console.log('⏰ 下次执行时间:', new Date(scheduledTime).toLocaleString());

        autoTradingTimeoutRef.current = setTimeout(() => {
          runAIAnalysis();
          // 第一次执行后，启动周期性定时器
          autoTradingTimerRef.current = setInterval(() => {
            runAIAnalysis();
          }, intervalMs);
        }, timeUntilNext);

        return; // 使用保存的时间，直接返回
      } else {
        // 保存的时间已过期
        console.log('⏰ 保存的时间已过期，立即执行');
      }
    }

    // 没有保存的时间，或时间已过期，或要求立即执行
    if (executeImmediately) {
      console.log('🚀 立即执行第一次分析');
      runAIAnalysis();
    }

    // 设置周期性定时器
    const nextTime = new Date(now + intervalMs);
    setNextRunTime(nextTime);
    console.log('⏰ 设置定时器，下次执行时间:', nextTime.toLocaleString());

    autoTradingTimerRef.current = setInterval(() => {
      runAIAnalysis();
    }, intervalMs);
  };

  // 执行一次AI分析 + 自动交易
  const runAIAnalysis = async () => {
    if (isAnalyzing) {
      console.log('⏳ AI分析正在进行中，跳过本次执行');
      return;
    }

    setIsAnalyzing(true);
    const timestamp = new Date();

    try {
      console.log('🤖 开始执行自动AI分析...', {
        time: timestamp.toLocaleString(),
        interval: tradingInterval,
        config: autoTradingConfig
      });

      // 获取选择的币种
      const selectedCoinsArray = autoTradingConfig.selectedCoins || ['BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'DOGE'];

      // 获取选择的数据源
      const dataSources = autoTradingConfig.dataSources || {};

      // 获取自定义prompt
      const customPrompt = customPrompts[language] || '';

      // 调用AI分析API
      const primaryModel = Array.isArray(autoTradingConfig.selectedAI)
        ? autoTradingConfig.selectedAI[0]
        : autoTradingConfig.selectedAI;

      // 获取 Privy access token（使用平台 API 时需要）
      const accessToken = await getAccessToken?.();

      const result = await aiAPI.smartAnalysis({
        model: primaryModel,
        coins: selectedCoinsArray,
        dataSources: dataSources,
        customPrompt: customPrompt,
        userAddress: userAddress,
        initialBalance: balance.accountValue ?? 0,  // 🔧 使用实际余额，空账户传 0
        riskPreference: autoTradingConfig.riskPreference || 'balanced',
        language: language,
        chainId: effectiveChainId  // Use effectiveChainId from AuthContext (421614 testnet, 42161 mainnet)
      }, userAddress, accessToken);

      console.log('✅ AI分析完成:', result);

      if (result.success) {
        const analysis = result.data.analysis;
        const prompts = result.data.prompts || {};

        // 提取交易决策
        const decisions = (analysis.trading_decisions || []).map(decision => ({
          coin: decision.coin,
          action: decision.action,
          confidence: Math.round(decision.confidence * 100),
          reasoning: decision.reasoning
        }));

        // 🔄 自动执行交易
        console.log('🚀 开始自动执行交易...');
        const executionResult = await executeTradeDecisions(analysis);

        // 格式化 Chain of Thought（AI的完整思考过程）
        let chainOfThought = analysis.comprehensive_analysis || '';

        // 如果没有 comprehensive_analysis，则显示完整的分析JSON
        if (!chainOfThought) {
          chainOfThought = JSON.stringify(analysis, null, 2);
        }

        // 添加到历史记录（最多保留5条）
        const newRecord = {
          timestamp: timestamp.toISOString(),
          status: executionResult.success ? 'success' : 'failed',
          summary: analysis.strategy_overview || (language === 'zh' ? 'AI分析完成' : 'AI Analysis Completed'),
          decisions: decisions,
          model: primaryModel,
          rawAnalysis: analysis,
          // User Prompt（从后端返回的完整提示词）
          userPrompt: prompts.userPrompt || customPrompt || (language === 'zh' ? '使用默认策略分析' : 'Default strategy analysis'),
          // Chain of Thought（AI的思考过程）
          chainOfThought: chainOfThought.trim(),
          // 交易执行结果
          executionResult: {
            executed: executionResult.executed || 0,
            failed: executionResult.failed || 0,
            total: executionResult.total || 0,
            message: executionResult.message,
            details: executionResult.details
          }
        };

        // 使用全局状态管理添加记录（自动保留最新5条）
        addTradingRecord(newRecord);

        console.log('📝 历史记录已更新（含交易执行结果）');

        // 刷新账户数据
        await fetchAccountData();
      } else {
        throw new Error(result.error || 'Analysis failed');
      }
    } catch (error) {
      console.error('❌ AI分析失败:', error);

      // 添加失败记录
      const failedRecord = {
        timestamp: timestamp.toISOString(),
        status: 'failed',
        summary: error.message || (language === 'zh' ? 'AI分析失败' : 'AI Analysis Failed'),
        decisions: [],
        error: error.message
      };

      // 使用全局状态管理添加记录
      addTradingRecord(failedRecord);
    } finally {
      setIsAnalyzing(false);
      // 更新下次执行时间
      const nextTime = new Date(Date.now() + tradingInterval * 60 * 1000);
      setNextRunTime(nextTime);
    }
  };

  // 处理自动交易启动/停止
  const handleToggleAutoTrading = () => {
    // 如果要启动自动交易，先验证
    if (!autoTradingEnabled) {
      // 1. 验证时间间隔
      const error = validateInterval(intervalInputValue);
      if (error) {
        setIntervalError(error);
        alert(language === 'zh'
          ? '请先设置有效的时间间隔（1-1440分钟）'
          : 'Please set a valid interval (1-1440 minutes)');
        return;
      }
      
      // 2. Check user authentication (Privy login)
      if (!isConnected || !account) {
        alert(language === 'zh' ? '请先登录' : 'Please login first');
        return;
      }

      // COMMENTED OUT: MetaMask network validation - using Privy embedded wallet now
      // // 3. 验证网络支持
      // if (chainId !== 421614 && chainId !== 42161) {
      //   alert(language === 'zh'
      //     ? '请切换到 Arbitrum 网络（测试网或主网）'
      //     : 'Please switch to Arbitrum network (Testnet or Mainnet)');
      //   return;
      // }

      // COMMENTED OUT: Agent Wallet validation - using server-side execution with embedded wallet
      // // 4. 验证 Agent Wallet
      // if (!isAgentActive || !agentInfo) {
      //   alert(language === 'zh'
      //     ? '请先创建 Agent Wallet。自动交易需要 Agent 授权。'
      //     : 'Please create Agent Wallet first. Auto trading requires Agent authorization.');
      //   return;
      // }

      // Auto trading risk warning (always show)
      const confirmed = window.confirm(
        language === 'zh'
          ? '⚠️ 自动交易风险警告\n\n' +
            `您即将启动自动交易，间隔 ${tradingInterval} 分钟。\n` +
            '这将自动执行交易。\n\n' +
            '重要风险提示：\n' +
            '• 自动交易可能在您不在线时执行，请确保充分理解\n' +
            '• 市场波动可能导致快速亏损\n' +
            '• AI 分析仅供参考，不保证盈利，可能产生错误建议\n' +
            '• 您对所有自动执行的交易完全负责\n\n' +
            '免责声明：本平台是教育学习工具，不提供投资建议。\n\n' +
            '是否继续？'
          : '⚠️ Auto Trading Risk Warning\n\n' +
            `You are about to start auto trading with ${tradingInterval} min interval.\n` +
            'This will automatically execute trades.\n\n' +
            'Important Risk Warnings:\n' +
            '• Auto trading may execute while you\'re offline, ensure full understanding\n' +
            '• Market volatility may cause rapid losses\n' +
            '• AI analysis is reference only, not guaranteed profitable, may err\n' +
            '• You are fully responsible for all auto-executed trades\n\n' +
            'Disclaimer: This platform is an educational tool, not investment advice.\n\n' +
            'Continue?'
      );
      if (!confirmed) {
        console.log('用户取消了自动交易');
        return;
      }

      // 启动自动交易
      setAutoTradingEnabled(true);

      // 使用新的定时器设置函数，立即执行一次
      setupAutoTradingTimer(true);

      console.log(`🚀 自动交易已启动，间隔: ${tradingInterval}分钟`);
    } else {
      // 停止自动交易
      setAutoTradingEnabled(false);

      // 清除所有定时器
      if (autoTradingTimeoutRef.current) {
        clearTimeout(autoTradingTimeoutRef.current);
        autoTradingTimeoutRef.current = null;
      }
      if (autoTradingTimerRef.current) {
        clearInterval(autoTradingTimerRef.current);
        autoTradingTimerRef.current = null;
      }

      setNextRunTime(null);
      console.log('⏹️ 自动交易已停止');
    }
  };

  // 组件挂载时恢复自动交易定时器（如果之前是开启状态）
  useEffect(() => {
    if (autoTradingEnabled && !autoTradingTimerRef.current && !autoTradingTimeoutRef.current) {
      console.log('🔄 检测到自动交易已开启，恢复定时器...');
      // 使用新的定时器设置函数，不立即执行（使用保存的时间）
      setupAutoTradingTimer(false);
      console.log(`✅ 自动交易定时器已恢复，间隔: ${tradingInterval}分钟`);
    }

    // 组件卸载时清除所有定时器
    return () => {
      if (autoTradingTimeoutRef.current) {
        clearTimeout(autoTradingTimeoutRef.current);
        autoTradingTimeoutRef.current = null;
      }
      if (autoTradingTimerRef.current) {
        clearInterval(autoTradingTimerRef.current);
        autoTradingTimerRef.current = null;
      }
    };
  }, []); // 只在挂载时运行一次

  // 监听 autoTradingEnabled 变化，自动清理定时器
  useEffect(() => {
    if (!autoTradingEnabled) {
      if (autoTradingTimeoutRef.current || autoTradingTimerRef.current) {
        console.log('⏹️ 自动交易已停止，清除所有定时器');
        if (autoTradingTimeoutRef.current) {
          clearTimeout(autoTradingTimeoutRef.current);
          autoTradingTimeoutRef.current = null;
        }
        if (autoTradingTimerRef.current) {
          clearInterval(autoTradingTimerRef.current);
          autoTradingTimerRef.current = null;
        }
        setNextRunTime(null);
      }
    }
  }, [autoTradingEnabled]);

  // 🔧 修复：监听 tradingInterval 变化，如果自动交易正在运行，重新设置定时器
  useEffect(() => {
    // 只在自动交易已启动且有定时器的情况下才重新设置
    if (autoTradingEnabled && (autoTradingTimerRef.current || autoTradingTimeoutRef.current)) {
      console.log(`🔄 时间间隔已更新为 ${tradingInterval} 分钟，重新设置定时器...`);

      // 使用新的定时器设置函数，不立即执行（将在新的间隔后执行）
      setupAutoTradingTimer(false);

      console.log(`✅ 定时器已更新，新间隔: ${tradingInterval} 分钟`);
    }
  }, [tradingInterval]); // 只监听 tradingInterval 变化

  // Handle position close
  const handleClosePosition = (position) => {
    setSelectedPositionToClose(position);
    setShowClosePositionModal(true);
  };

  const confirmClosePosition = async () => {
    if (!selectedPositionToClose) return;

    setClosingPosition(true);
    setError(null);

    try {
      console.log('Closing position:', selectedPositionToClose.coin);

      // Use Agent Wallet (approved by Privy embedded wallet)
      if (!isAgentActive || !agentInfo) {
        throw new Error(language === 'zh'
          ? '请先创建 Agent Wallet。前往钱包管理页面创建。'
          : 'Please create an Agent Wallet first. Go to Wallet tab to create one.');
      }

      console.log('🔐 Getting Agent private key for close position...');
      const agentPrivateKey = await getAgentKey();

      if (!agentPrivateKey) {
        throw new Error(language === 'zh'
          ? '无法获取 Agent 私钥。请重新创建 Agent Wallet。'
          : 'Failed to get Agent private key. Please recreate Agent Wallet.');
      }

      // Prepare close position request with Agent wallet credentials
      const closePositionData = {
        coin: selectedPositionToClose.coin,
        address: userAddress || account,
        size: selectedPositionToClose.size,
        agentPrivateKey: agentPrivateKey,     // Agent wallet private key for signing
        agentData: agentInfo,                 // Agent info (address, permissions, etc.)
        chainId: effectiveChainId             // Testnet or mainnet based on simulation mode
      };

      // COMMENTED OUT: MetaMask Agent Wallet execution - kept for reference
      // if (isAgentActive && agentInfo) {
      //   console.log('✅ 使用 Agent Wallet 执行平仓');
      //   const agentPrivateKey = await getAgentKey();
      //
      //   if (!agentPrivateKey) {
      //     throw new Error(language === 'zh' ? 'Agent 私钥获取失败' : 'Failed to get Agent private key');
      //   }
      //
      //   closePositionData.agentPrivateKey = agentPrivateKey;
      //   closePositionData.agentData = agentInfo;
      //   closePositionData.chainId = chainId;  // 传递当前网络 ID
      // } else {
      //   throw new Error(language === 'zh'
      //     ? '请先创建 Agent Wallet。服务器不再支持直接执行平仓。'
      //     : 'Please create an Agent Wallet first. Server no longer supports direct close position.');
      // }

      console.log('📤 Sending close position request:', {
        coin: selectedPositionToClose.coin,
        network: isSimulationMode ? 'Testnet' : 'Mainnet'
      });

      const result = await accountAPI.closePosition(closePositionData);

      if (result.success) {
        console.log('✅ 平仓成功:', result.message);
        // 刷新账户数据以获取最新持仓
        await fetchAccountData();
        setShowClosePositionModal(false);
        setSelectedPositionToClose(null);
      } else {
        setError(result.error || '平仓失败');
      }
    } catch (err) {
      console.error('平仓失败:', err);
      setError(err.message || '平仓失败，请重试');
    } finally {
      setClosingPosition(false);
    }
  };


  return (
    <div className="space-y-6 text-gray-900 dark:text-white">
      {/* COMMENTED OUT: Network warning - using Privy embedded wallet now */}
      {/* {isConnected && chainId && chainId !== 421614 && chainId !== 42161 && (
        <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-red-700 text-sm">
            {language === 'zh'
              ? '⚠️ 不支持的网络。请切换到 Arbitrum Sepolia (测试网) 或 Arbitrum One (主网)'
              : '⚠️ Unsupported network. Please switch to Arbitrum Sepolia (Testnet) or Arbitrum One (Mainnet)'}
          </p>
        </div>
      )} */}
      
      {/* 顶部账户数据卡片 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        <div className={`${cardClass} p-3 md:p-4`}>
          <div className={`${mutedText} text-xs mb-1`}>{language === 'zh' ? '账户余额' : 'Account Balance'}</div>
          <div className="text-lg md:text-2xl font-bold text-gray-900 dark:text-white truncate">${balance.accountValue.toFixed(2)}</div>
          <div className={`${mutedText} text-xs mt-1`}>USDC</div>
        </div>
        <div className={`${cardClass} p-3 md:p-4`}>
          <div className={`${mutedText} text-xs mb-1`}>{language === 'zh' ? '浮动盈亏' : 'Unrealized P&L'}</div>
          <div className={`text-lg md:text-2xl font-bold truncate ${balance.unrealizedPnl >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`}>
            {balance.unrealizedPnl >= 0 ? '+' : ''}${balance.unrealizedPnl.toFixed(2)}
          </div>
          <div className={`text-xs mt-1 ${balance.unrealizedPnl >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`}>
            {balance.unrealizedPnlPercent >= 0 ? '+' : ''}{balance.unrealizedPnlPercent.toFixed(2)}%
          </div>
        </div>
        <div className={`${cardClass} p-3 md:p-4`}>
          <div className={`${mutedText} text-xs mb-1`}>{language === 'zh' ? '已用保证金' : 'Used Margin'}</div>
          <div className="text-lg md:text-2xl font-bold text-gray-900 dark:text-white truncate">${balance.marginUsed.toFixed(2)}</div>
          <div className="text-xs text-yellow-600 dark:text-yellow-400 mt-1">{balance.marginUsedPercent.toFixed(1)}%</div>
        </div>
        <div className={`${cardClass} p-3 md:p-4`}>
          <div className={`${mutedText} text-xs mb-1`}>{language === 'zh' ? '可用资金' : 'Available'}</div>
          <div className="text-lg md:text-2xl font-bold text-gray-900 dark:text-white truncate">${balance.availableCash.toFixed(2)}</div>
          <div className={`${mutedText} text-xs mt-1`}>{balance.availableCashPercent.toFixed(1)}%</div>
        </div>
      </div>

      {/* 主体两栏布局 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
        {/* 左侧栏：K线图 + Positions */}
        <div className="lg:col-span-2 space-y-4 md:space-y-6">
          {/* 账户权益K线图 */}
          <div className={`${cardClass} p-4 md:p-6`}>
            <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-4 gap-3">
              <div>
                <h3 className="text-gray-900 dark:text-white font-semibold text-base md:text-lg mb-1 flex items-center gap-2">
                  <TrendingUp className="text-blue-500 dark:text-blue-400" size={18} />
                  {language === 'zh' ? '账户权益' : 'Account Equity'}
                </h3>
                <div className="flex items-baseline gap-2">
                  <span className="text-xl md:text-3xl font-bold text-blue-600 dark:text-blue-400 truncate">
                    ${portfolioHistory.currentBalance.toFixed(2)}
                  </span>
                  <span className={`${mutedText} text-xs md:text-sm`}>USDC</span>
                </div>
              </div>
              <div className="flex items-center bg-gray-100 dark:bg-gray-900 rounded-lg p-1">
                {['24H', '7D', '30D', 'ALL'].map(tf => (
                  <button
                    key={tf}
                    onClick={() => setSelectedTimeframe(tf)}
                    className={`px-3 py-1.5 text-xs rounded transition-colors ${
                      selectedTimeframe === tf
                        ? 'bg-blue-500 text-white'
                        : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
                    }`}
                  >
                    {tf === 'ALL' ? (language === 'zh' ? '全部' : 'All Time') : tf}
                  </button>
                ))}
              </div>
            </div>
            <EquityChart
              language={language}
              history={portfolioHistory.balance}
              account={{ total_equity: portfolioHistory.currentBalance }}
              selectedTimeframe={selectedTimeframe}
            />
          </div>

          {/* Positions列表 */}
          <div className={`${cardClass} p-4 md:p-6`}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-gray-900 dark:text-white font-semibold text-base md:text-lg flex items-center gap-2">
                <Wallet className="text-blue-500 dark:text-blue-400" size={18} />
                {language === 'zh' ? '当前持仓' : 'Current Positions'}
              </h3>
            </div>

            {/* Positions Table */}
            {positions.length > 0 ? (
              <div className="overflow-x-auto -mx-4 md:mx-0">
                <table className="w-full min-w-[640px]">
                  <thead>
                    <tr className="text-left border-b border-gray-200 dark:border-gray-800">
                      <th className={`${mutedText} text-xs md:text-sm font-medium pb-2 px-2`}>{language === 'zh' ? '币种' : 'Coin'}</th>
                      <th className={`${mutedText} text-xs md:text-sm font-medium pb-2 px-2`}>{language === 'zh' ? '方向' : 'Side'}</th>
                      <th className={`${mutedText} text-xs md:text-sm font-medium pb-2 px-2`}>{language === 'zh' ? '杠杆' : 'Lev'}</th>
                      <th className={`${mutedText} text-xs md:text-sm font-medium pb-2 px-2`}>{language === 'zh' ? '数量' : 'Size'}</th>
                      <th className={`${mutedText} text-xs md:text-sm font-medium pb-2 px-2`}>{language === 'zh' ? '开仓价' : 'Entry'}</th>
                      <th className={`${mutedText} text-xs md:text-sm font-medium pb-2 px-2`}>{language === 'zh' ? '当前价' : 'Current'}</th>
                      <th className={`${mutedText} text-xs md:text-sm font-medium pb-2 px-2`}>{language === 'zh' ? '盈亏' : 'P&L'}</th>
                      <th className={`${mutedText} text-xs md:text-sm font-medium pb-2 px-2`}>{language === 'zh' ? '操作' : 'Action'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {positions.map(position => (
                      <tr key={position.id} className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-900/30">
                        <td className="py-2 px-2">
                          <div className="text-gray-900 dark:text-white font-medium text-xs md:text-sm">{position.coin}</div>
                        </td>
                        <td className="py-2 px-2">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] md:text-xs font-medium ${
                            position.type === 'SHORT'
                              ? 'bg-red-100 text-red-600 dark:bg-red-500/20 dark:text-red-400'
                              : 'bg-green-100 text-green-600 dark:bg-green-500/20 dark:text-green-400'
                          }`}>
                            {position.type}
                          </span>
                        </td>
                        <td className="py-2 px-2 text-gray-700 dark:text-gray-300 text-xs md:text-sm">{position.leverage}x</td>
                        <td className="py-2 px-2 text-gray-700 dark:text-gray-300 text-xs md:text-sm">{position.size}</td>
                        <td className="py-2 px-2 text-gray-700 dark:text-gray-300 text-xs md:text-sm">{position.entry.toFixed(2)}</td>
                        <td className="py-2 px-2 text-gray-700 dark:text-gray-300 text-xs md:text-sm">{position.current.toFixed(2)}</td>
                        <td className="py-2 px-2">
                          <div className={position.pnl.startsWith('+') ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}>
                            <div className="font-medium text-xs md:text-sm">{position.pnl}</div>
                            <div className="text-[10px] md:text-xs">{position.pnlPercent}</div>
                          </div>
                        </td>
                        <td className="py-2 px-2">
                          <button
                            onClick={() => handleClosePosition(position)}
                            className="px-2 md:px-3 py-1 bg-red-100 text-red-600 rounded text-[10px] md:text-sm hover:bg-red-200 dark:bg-red-500/20 dark:text-red-300 dark:hover:bg-red-500/30 whitespace-nowrap"
                          >
                            {language === 'zh' ? '平仓' : 'Close'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                {language === 'zh' ? '当前无持仓' : 'No open positions'}
              </div>
            )}
          </div>
        </div>

        {/* 右侧栏：AI自动交易面板 */}
        <div className="col-span-1 space-y-4">
          {/* AI自动交易控制面板 */}
          <div className={`${cardClass} p-4`}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-gray-900 dark:text-white font-semibold flex items-center gap-2">
                <Activity className="text-purple-500 dark:text-purple-400" size={18} />
                {language === 'zh' ? 'AI 自动交易' : 'AI Auto Trading'}
              </h3>
              <button
                onClick={() => setShowIntervalSettings(!showIntervalSettings)}
                className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              >
                <Settings className="text-gray-500 dark:text-gray-400" size={16} />
              </button>
            </div>

            {/* 提示信息 */}
            <div className="mb-3 p-2 bg-blue-50 dark:bg-blue-500/10 border border-blue-100 dark:border-blue-500/20 rounded-lg">
              <p className="text-blue-700 dark:text-blue-300 text-xs flex items-start gap-2">
                <Info size={14} className="mt-0.5 flex-shrink-0" />
                {language === 'zh'
                  ? '自动交易使用的 Prompts 和模型可以在 Dashboard 标签页自定义。这里默认使用您上次在 Dashboard 的选择。'
                  : 'Prompts and models for auto trading can be customized in Dashboard tab. This uses your last Dashboard settings by default.'}
              </p>
            </div>

            {/* 时间间隔设置（可折叠） */}
            {showIntervalSettings && (
              <div className="mb-3 p-3 bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-lg space-y-2">
                <label className="text-gray-900 dark:text-white text-sm">
                  {language === 'zh' ? '分析时间间隔（分钟）' : 'Analysis Interval (minutes)'}
                </label>
                <div className="space-y-1.5">
                  <div className="relative">
                    <input
                      type="text"
                      value={intervalInputValue}
                      onChange={(e) => handleIntervalChange(e.target.value)}
                      placeholder={language === 'zh' ? '输入1-1440之间的整数' : 'Enter 1-1440'}
                      className={`w-full bg-white dark:bg-gray-800 border ${
                        intervalError ? 'border-red-400 dark:border-red-500' : 'border-gray-200 dark:border-gray-700'
                      } text-gray-900 dark:text-white rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-blue-500 transition-colors`}
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 text-sm">
                      {language === 'zh' ? '分钟' : 'min'}
                    </span>
                  </div>

                  {/* 错误提示 */}
                  {intervalError && (
                    <div className="flex items-center gap-2 text-red-500 dark:text-red-400 text-xs">
                      <AlertCircle size={14} />
                      <span>{intervalError}</span>
                    </div>
                  )}

                  {/* 成功提示 */}
                  {!intervalError && intervalInputValue && (
                    <div className="flex items-center gap-2 text-green-600 dark:text-green-400 text-xs">
                      <CheckCircle size={14} />
                      <span>
                        {language === 'zh'
                          ? `AI 将每 ${tradingInterval} 分钟自动分析一次`
                          : `AI will analyze every ${tradingInterval} minutes`}
                        {autoTradingEnabled && (
                          <span className="ml-1 text-yellow-400">
                            {language === 'zh' ? '(定时器已更新)' : '(timer updated)'}
                          </span>
                        )}
                      </span>
                    </div>
                  )}
                </div>

                {/* 提示信息 */}
                <div className="p-2 bg-blue-50 dark:bg-blue-500/10 border border-blue-100 dark:border-blue-500/20 rounded text-xs text-blue-700 dark:text-blue-300">
                  {language === 'zh'
                    ? '💡 建议：15-60分钟适合短线交易，60-240分钟适合中长线'
                    : '💡 Tip: 15-60 min for short-term, 60-240 min for long-term'}
                </div>
              </div>
            )}

            {/* 启动/停止按钮 */}
            <button
              onClick={handleToggleAutoTrading}
              disabled={!autoTradingEnabled && intervalError}
              className={`w-full px-4 py-2.5 rounded-lg font-medium flex items-center justify-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                autoTradingEnabled
                  ? 'bg-red-500 hover:bg-red-600 text-white'
                  : 'bg-green-500 hover:bg-green-600 text-white'
              }`}
            >
              {autoTradingEnabled ? (
                <>
                  <PauseCircle size={20} />
                  {language === 'zh' ? '停止自动交易' : 'Stop Auto Trading'}
                </>
              ) : (
                <>
                  <PlayCircle size={20} />
                  {language === 'zh' ? '开始自动交易' : 'Start Auto Trading'}
                </>
              )}
            </button>

            {/* 运行状态 */}
            {autoTradingEnabled && (
              <div className="mt-3 p-2.5 bg-green-50 dark:bg-green-500/10 border border-green-100 dark:border-green-500/20 rounded-lg space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-green-500 dark:bg-green-400 rounded-full animate-pulse" />
                    <span className="text-green-700 dark:text-green-300 text-sm font-medium">
                      {isAnalyzing
                        ? (language === 'zh' ? '分析中...' : 'Analyzing...')
                        : (language === 'zh' ? '运行中' : 'Running')}
                    </span>
                  </div>
                  {isAnalyzing && <RefreshCw className="text-green-400 animate-spin" size={16} />}
                </div>
                {nextRunTime && !isAnalyzing && (
                  <div className={`${mutedText} text-xs`}>
                    {language === 'zh' ? '下次执行: ' : 'Next run: '}
                    {new Date(nextRunTime).toLocaleTimeString(language === 'zh' ? 'zh-CN' : 'en-US', {
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* AI分析历史记录 */}
          <div className={`${cardClass} p-4`}>
            <h4 className="text-gray-900 dark:text-white font-semibold mb-3 flex items-center gap-2">
              <RefreshCw className="text-blue-500 dark:text-blue-400" size={16} />
              {language === 'zh' ? '最近分析记录' : 'Recent Analysis'}
            </h4>

            {tradingHistory.length > 0 ? (
              <div className="space-y-2.5">
                {tradingHistory.slice(0, 3).map((record, idx) => {
                  return (
                    <div
                      key={idx}
                      className="bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-lg p-3"
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <span className={`${mutedText} text-xs`}>
                          {new Date(record.timestamp).toLocaleString(language === 'zh' ? 'zh-CN' : 'en-US')}
                        </span>
                        <span className={`px-2 py-0.5 rounded text-xs ${
                          record.status === 'success'
                            ? 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-300'
                            : 'bg-red-100 text-red-600 dark:bg-red-500/20 dark:text-red-300'
                        }`}>
                          {record.status === 'success'
                            ? (language === 'zh' ? '成功' : 'Success')
                            : (language === 'zh' ? '失败' : 'Failed')}
                        </span>
                      </div>

                      {/* 分析摘要或错误信息 */}
                      <div className="text-gray-900 dark:text-white text-sm mb-1.5 whitespace-pre-wrap">
                        {record.status === 'success' ? record.summary : (
                          <div className="space-y-2">
                            <div className="text-red-600 dark:text-red-400 font-medium">
                              {language === 'zh' ? '失败原因：' : 'Error:'}
                            </div>
                            <div className="text-red-700 dark:text-gray-300 text-xs bg-red-50 dark:bg-red-500/10 border border-red-100 dark:border-red-500/20 rounded p-2">
                              {record.error}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* User Prompt - 可折叠 */}
                      {record.userPrompt && record.status === 'success' && (
                        <div className="mb-1.5">
                          <button
                            onClick={() => {
                              setExpandedPrompts(prev => ({
                                ...prev,
                                [idx]: !prev[idx]
                              }));
                            }}
                            className="flex items-center gap-1.5 text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white text-xs transition-colors w-full text-left"
                          >
                            {expandedPrompts[idx] ? (
                              <ChevronDown size={14} className="text-blue-500 dark:text-blue-400" />
                            ) : (
                              <ChevronDown size={14} className="text-gray-400 transform -rotate-90" />
                            )}
                            <span className="font-medium text-blue-600 dark:text-blue-400">
                              {language === 'zh' ? '用户提示词' : 'User Prompt'}
                            </span>
                          </button>
                          {expandedPrompts[idx] && (
                            <div className="mt-1.5 ml-5 p-2 bg-gray-100 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded text-xs text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                              {record.userPrompt}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Chain of Thought - 可折叠 */}
                      {record.chainOfThought && record.status === 'success' && (
                        <div className="mb-1.5">
                          <button
                            onClick={() => {
                              setExpandedReasonings(prev => ({
                                ...prev,
                                [idx]: !prev[idx]
                              }));
                            }}
                            className="flex items-center gap-1.5 text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white text-xs transition-colors w-full text-left"
                          >
                            {expandedReasonings[idx] ? (
                              <ChevronDown size={14} className="text-purple-500 dark:text-purple-400" />
                            ) : (
                              <ChevronDown size={14} className="text-gray-400 transform -rotate-90" />
                            )}
                            <span className="font-medium text-purple-600 dark:text-purple-400">
                              {language === 'zh' ? 'AI 思考过程' : 'Chain of Thought'}
                            </span>
                          </button>
                          {expandedReasonings[idx] && (
                            <div className="mt-1.5 ml-5 p-2 bg-gray-100 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded text-xs text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                              {record.chainOfThought}
                            </div>
                          )}
                        </div>
                      )}

                      {/* AI决策 */}
                      {record.decisions && record.decisions.length > 0 && (
                        <div className="mb-1.5">
                          <div className={`${mutedText} text-xs mb-1`}>
                            {language === 'zh' ? 'AI决策:' : 'AI Decisions:'}
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {record.decisions.map((decision, dIdx) => (
                              <span
                                key={dIdx}
                                className={`px-2 py-1 rounded text-xs ${
                                  decision.action === 'BUY'
                                    ? 'bg-green-100 text-green-700 border border-green-200 dark:bg-green-500/10 dark:border-green-500/20 dark:text-green-300'
                                    : decision.action === 'SELL'
                                    ? 'bg-red-100 text-red-600 border border-red-200 dark:bg-red-500/10 dark:border-red-500/20 dark:text-red-300'
                                    : 'bg-blue-100 text-blue-700 border border-blue-200 dark:bg-blue-500/10 dark:border-blue-500/20 dark:text-blue-300'
                                }`}
                              >
                                {decision.coin}: {decision.action}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* 交易执行结果 */}
                      {record.executionResult && (
                        <div className="mt-1.5 pt-1.5 border-t border-gray-200 dark:border-gray-800">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <CheckCircle className="text-green-600 dark:text-green-400" size={14} />
                              <span className={`${mutedText} text-xs`}>
                                {language === 'zh' ? '执行结果:' : 'Execution:'}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 text-xs">
                              <span className="text-green-600 dark:text-green-400">
                                {record.executionResult.executed || 0} {language === 'zh' ? '成功' : 'success'}
                              </span>
                              {record.executionResult.failed > 0 && (
                                <span className="text-red-600 dark:text-red-400">
                                  {record.executionResult.failed} {language === 'zh' ? '失败' : 'failed'}
                                </span>
                              )}
                            </div>
                          </div>
                          {record.executionResult.message && (
                            <div className={`${mutedText} text-xs mt-1`}>
                              {record.executionResult.message}
                            </div>
                          )}

                          {/* 显示详细的执行结果 */}
                          {record.executionResult.details && record.executionResult.details.length > 0 && (
                            <div className="mt-2 space-y-1">
                              {record.executionResult.details.map((detail, dIdx) => (
                                <div
                                  key={dIdx}
                                  className={`text-xs p-2 rounded ${
                                    detail.success
                                      ? 'bg-green-50 text-green-700 dark:bg-green-500/10 dark:text-green-300'
                                      : 'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-300'
                                  }`}
                                >
                                  <div className="flex items-center justify-between">
                                    <span className="font-medium">{detail.coin}</span>
                                    <span>{detail.success ? '✓' : '✗'}</span>
                                  </div>
                                  {detail.error && (
                                    <div className="mt-1 text-xs opacity-80">
                                      {detail.error}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-6">
                <div className="text-gray-500 text-sm mb-1.5">
                  {language === 'zh' ? '暂无分析记录' : 'No analysis records yet'}
                </div>
                <div className="text-gray-500 dark:text-gray-400 text-xs">
                  {language === 'zh'
                    ? '启动自动交易后，AI分析结果将在此显示'
                    : 'AI analysis results will appear here after starting auto trading'}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Close Position Modal */}
      {showClosePositionModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 max-w-md mx-4 border border-gray-200 dark:border-gray-800 shadow-2xl">
            <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
              {language === 'zh' ? '确认平仓' : 'Confirm Close Position'}
            </h3>
            
            {selectedPositionToClose && (
              <div className="space-y-3 mb-6">
                <div className="bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-700 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className={mutedText}>{language === 'zh' ? '币种' : 'Coin'}</span>
                    <span className="text-gray-900 dark:text-white font-medium">{selectedPositionToClose.coin}</span>
                  </div>
                  <div className="flex items-center justify-between mb-2">
                    <span className={mutedText}>{language === 'zh' ? '方向' : 'Side'}</span>
                    <span className={selectedPositionToClose.type === 'SHORT' ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}>
                      {selectedPositionToClose.type}
                    </span>
                  </div>
                  <div className="flex items-center justify-between mb-2">
                    <span className={mutedText}>{language === 'zh' ? '数量' : 'Size'}</span>
                    <span className="text-gray-900 dark:text-white">{selectedPositionToClose.size}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className={mutedText}>{language === 'zh' ? '预计盈亏' : 'Est. P&L'}</span>
                    <span className={selectedPositionToClose.pnl.startsWith('+') ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}>
                      {selectedPositionToClose.pnl}
                    </span>
                  </div>
                </div>
                
                <div className="p-3 bg-yellow-50 dark:bg-yellow-500/10 border border-yellow-100 dark:border-yellow-500/20 rounded-lg">
                  <p className="text-yellow-700 dark:text-yellow-300 text-sm flex items-start gap-2">
                    <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
                    {language === 'zh'
                      ? '平仓后将按当前市场价格结算，实际盈亏可能与显示有差异。'
                      : 'Position will be closed at market price. Actual P&L may differ from displayed.'}
                  </p>
                </div>

                {/* COMMENTED OUT: Agent Wallet warning - using Privy embedded wallet now */}
                {/* {!isAgentActive && (
                  <div className="p-3 bg-blue-50 dark:bg-blue-500/10 border border-blue-100 dark:border-blue-500/20 rounded-lg">
                    <p className="text-blue-700 dark:text-blue-300 text-sm flex items-start gap-2">
                      <Info size={16} className="mt-0.5 flex-shrink-0" />
                      {language === 'zh'
                        ? '未检测到 Agent Wallet。如果您想使用自己的账户执行平仓，请先在右侧面板创建 Agent Wallet。'
                        : 'No Agent Wallet detected. To close positions with your own account, please create an Agent Wallet in the right panel first.'}
                    </p>
                  </div>
                )} */}
              </div>
            )}
            
            <div className="flex gap-3">
              <button
                onClick={() => setShowClosePositionModal(false)}
                disabled={closingPosition}
                className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-gray-800 dark:text-white dark:hover:bg-gray-700"
              >
                {language === 'zh' ? '取消' : 'Cancel'}
              </button>
              <button
                onClick={confirmClosePosition}
                disabled={closingPosition}
                className="flex-1 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {closingPosition && <RefreshCw size={16} className="animate-spin" />}
                {closingPosition
                  ? (language === 'zh' ? '平仓中...' : 'Closing...')
                  : (language === 'zh' ? '确认平仓' : 'Confirm Close')}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default TradingDashboardTab;
