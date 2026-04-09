import React, { useState, useEffect } from 'react';
import { Plus, Play, Pause, Edit, Trash2, TrendingUp, TrendingDown, Wallet, Copy, CheckCircle, AlertTriangle } from 'lucide-react';
import CreateTraderDialog from '../CreateTraderDialog';
import { useAppStore } from '../../contexts/useAppStore';

const MyTradersTab = ({ language, t }) => {
  const text = t[language].traders;
  
  // 🔧 使用全局状态管理 traders 列表
  const myTraders = useAppStore(state => state.myTraders);
  const myTradersInitialized = useAppStore(state => state.myTradersInitialized);
  const setMyTraders = useAppStore(state => state.setMyTraders);
  const addTrader = useAppStore(state => state.addTrader);
  const updateTrader = useAppStore(state => state.updateTrader);
  const deleteTraderFromStore = useAppStore(state => state.deleteTrader);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [copiedAddress, setCopiedAddress] = useState(null);
  
  const MAX_TRADERS = 3;

  // 🔧 初始化默认数据（仅在从未初始化过时）
  useEffect(() => {
    if (!myTradersInitialized) {
      const defaultTraders = [
        {
          id: 1,
          name: language === 'zh' ? 'BTC激进策略' : 'BTC Aggressive Strategy',
          coins: ['BTC', 'ETH'],
          strategy: 'aggressive',
          status: 'running',
          pnl: 125.50,
          pnlPercent: 7.8,
          totalValue: 1725.00,
          winRate: 75,
          totalTrades: 12,
          lastTrade: language === 'zh' ? '2小时前' : '2h ago',
          created: '2025/11/15',
          walletAddress: '0x1234567890abcdef1234567890abcdef12345678',
          agentWalletBalance: 1725.00
        },
        {
          id: 2,
          name: language === 'zh' ? 'ETH稳健策略' : 'ETH Balanced Strategy',
          coins: ['ETH', 'BNB'],
          strategy: 'balanced',
          status: 'paused',
          pnl: 45.20,
          pnlPercent: 2.1,
          totalValue: 2200.00,
          winRate: 62,
          totalTrades: 8,
          lastTrade: language === 'zh' ? '1天前' : '1d ago',
          created: '2025/11/10',
          walletAddress: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
          agentWalletBalance: 2200.00
        }
      ];
      setMyTraders(defaultTraders);
    }
  }, [myTradersInitialized, setMyTraders, language]); // 检查初始化标记，而不是列表长度

  // 使用本地引用以便在组件内使用
  const traders = myTraders;

  const toggleTraderStatus = (id) => {
    const trader = traders.find(t => t.id === id);
    if (trader) {
      updateTrader(id, { 
        status: trader.status === 'running' ? 'paused' : 'running' 
      });
    }
  };

  const deleteTrader = (id) => {
    if (confirm(language === 'zh' ? '确定删除这个Trader吗？这将同时删除关联的Agent钱包。' : 'Are you sure you want to delete this Trader? This will also delete the associated Agent wallet.')) {
      deleteTraderFromStore(id);
    }
  };

  const handleCreateTrader = (config) => {
    // Generate a new trader with a mock wallet address
    const newTrader = {
      id: Date.now(), // 使用时间戳作为唯一ID
      name: config.name,
      coins: config.selectedCoins,
      strategy: config.riskPreference, // 使用风险偏好作为策略
      status: 'paused',
      pnl: 0,
      pnlPercent: 0,
      totalValue: parseFloat(config.tradeAmount) || 100,
      winRate: 0,
      totalTrades: 0,
      lastTrade: language === 'zh' ? '从未交易' : 'Never',
      created: new Date().toISOString().split('T')[0].replace(/-/g, '/'),
      walletAddress: '0x' + Math.random().toString(16).substr(2, 40),
      agentWalletBalance: parseFloat(config.tradeAmount) || 100,
      config: config // Store full config for later use (包含 AI 模型、数据源、自定义 prompt 等)
    };
    
    addTrader(newTrader);
  };

  const copyAddress = (address) => {
    navigator.clipboard.writeText(address);
    setCopiedAddress(address);
    setTimeout(() => setCopiedAddress(null), 2000);
  };

  const getCoinColor = (coin) => {
    const colors = {
      'BTC': 'from-orange-500 to-orange-600',
      'ETH': 'from-blue-500 to-indigo-600',
      'SOL': 'from-purple-500 to-purple-600',
      'BNB': 'from-yellow-500 to-amber-600',
    };
    return colors[coin] || 'from-gray-500 to-gray-600';
  };

  const getCoinIcon = (coin) => {
    const icons = {
      'BTC': '₿',
      'ETH': '⟠',
      'SOL': '◎',
      'BNB': '◆',
    };
    return icons[coin] || '●';
  };

  return (
    <div className="space-y-6 relative">
      {/* 即将上线遮罩 */}
      <div className="absolute inset-0 bg-white/60 dark:bg-gray-900/60 backdrop-blur-sm z-40 flex items-center justify-center rounded-2xl">
        <div className="text-center max-w-lg p-8">
          <div className="text-6xl mb-4">🚀</div>
          <h3 className="text-3xl font-bold text-gray-900 dark:text-white mb-3">
            {language === 'zh' ? '多 Traders 并发功能' : 'Multi-Trader Concurrent Feature'}
          </h3>
          <p className="text-xl text-gray-700 dark:text-gray-300 mb-6">
            {language === 'zh' ? '即将上线' : 'Coming Soon'}
          </p>
          <div className="bg-blue-50 dark:bg-blue-500/10 border-2 border-blue-200 dark:border-blue-500/30 rounded-xl p-6 text-left">
            <h4 className="font-bold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
              <span className="text-xl">✨</span>
              {language === 'zh' ? '即将推出的功能：' : 'Upcoming Features:'}
            </h4>
            <ul className="space-y-2 text-gray-700 dark:text-gray-300">
              <li className="flex items-start gap-2">
                <span className="text-blue-500 mt-1">•</span>
                <span>{language === 'zh' ? '同时运行多个 AI Traders（最多3个）' : 'Run multiple AI Traders simultaneously (up to 3)'}</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-500 mt-1">•</span>
                <span>{language === 'zh' ? '每个 Trader 独立配置和 Agent 钱包' : 'Independent config and Agent wallet per Trader'}</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-500 mt-1">•</span>
                <span>{language === 'zh' ? '实时监控所有 Traders 的运行状态' : 'Real-time monitoring of all Traders'}</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-500 mt-1">•</span>
                <span>{language === 'zh' ? '独立的启动/停止控制' : 'Independent start/stop controls'}</span>
              </li>
            </ul>
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-4">
            {language === 'zh' 
              ? '🔧 当前请使用"交易面板"进行自动交易' 
              : '🔧 Please use "Trading Panel" for auto-trading'}
          </p>
        </div>
      </div>

      {/* 原有内容（灰掉但保留结构） */}
      <div className="opacity-30 pointer-events-none">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">{text.title}</h2>
            <p className="text-gray-600 dark:text-gray-400 text-sm">{text.subtitle}</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-sm text-gray-600 dark:text-gray-400">
              {traders.length} / {MAX_TRADERS} Traders
            </div>
            <button
              disabled
              className="flex items-center gap-2 px-4 py-2 rounded-lg font-medium bg-gray-300 dark:bg-gray-700 text-gray-500 cursor-not-allowed"
            >
              <Plus size={18} />
              {text.createNew}
            </button>
          </div>
        </div>

        {/* Traders Grid */}
      {traders.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {traders.map(trader => (
            <div
              key={trader.id}
              className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-6 hover:shadow-lg transition-all"
            >
              {/* Header */}
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className={`w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-2xl font-bold shadow-lg`}>
                    {trader.coins[0] && getCoinIcon(trader.coins[0])}
                  </div>
                  <div>
                    <h3 className="text-gray-900 dark:text-white font-bold">{trader.name}</h3>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      {trader.coins.map(coin => (
                        <span key={coin} className="px-2 py-0.5 bg-blue-100 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400 text-xs rounded font-medium">
                          {coin}
                        </span>
                      ))}
                      <span className="px-2 py-0.5 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 text-xs rounded">
                        {text.strategies[trader.strategy]}
                      </span>
                    </div>
                  </div>
                </div>
                <div className={`px-2 py-1 rounded text-xs font-medium ${
                  trader.status === 'running'
                    ? 'bg-green-100 dark:bg-green-500/20 text-green-600 dark:text-green-400'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
                }`}>
                  {trader.status === 'running' ? text.running : text.paused}
                </div>
              </div>

              {/* Agent Wallet Address */}
              <div className="mb-4 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <Wallet size={14} className="text-gray-600 dark:text-gray-400" />
                  <span className="text-xs text-gray-600 dark:text-gray-400 font-medium">
                    {language === 'zh' ? 'Agent钱包地址' : 'Agent Wallet Address'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-xs text-gray-900 dark:text-white bg-white dark:bg-gray-900 px-2 py-1 rounded font-mono">
                    {trader.walletAddress.substring(0, 10)}...{trader.walletAddress.substring(trader.walletAddress.length - 8)}
                  </code>
                  <button
                    onClick={() => copyAddress(trader.walletAddress)}
                    className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
                    title={language === 'zh' ? '复制地址' : 'Copy address'}
                  >
                    {copiedAddress === trader.walletAddress ? (
                      <CheckCircle size={14} className="text-green-500" />
                    ) : (
                      <Copy size={14} className="text-gray-600 dark:text-gray-400" />
                    )}
                  </button>
                </div>
                <div className="mt-2 text-xs text-gray-600 dark:text-gray-400">
                  {language === 'zh' ? '余额' : 'Balance'}: ${trader.agentWalletBalance.toFixed(2)} USDC
                </div>
              </div>

              {/* P&L Display */}
              <div className={`p-4 rounded-xl mb-4 ${
                trader.pnl >= 0
                  ? 'bg-green-50 dark:bg-green-500/10 border border-green-100 dark:border-green-500/20'
                  : 'bg-red-50 dark:bg-red-500/10 border border-red-100 dark:border-red-500/20'
              }`}>
                <div className="text-xs text-gray-600 dark:text-gray-400 mb-1">{text.accumulated}</div>
                <div className={`text-2xl font-bold ${
                  trader.pnl >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                }`}>
                  {trader.pnl >= 0 ? '+' : ''}${trader.pnl.toFixed(2)}
                </div>
                <div className={`text-sm font-medium ${
                  trader.pnl >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                }`}>
                  {trader.pnl >= 0 ? '+' : ''}{trader.pnlPercent}%
                </div>
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div>
                  <div className="text-xs text-gray-600 dark:text-gray-400 mb-1">{text.totalValue}</div>
                  <div className="text-gray-900 dark:text-white font-bold text-sm">${trader.totalValue.toLocaleString()}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-600 dark:text-gray-400 mb-1">{text.winRate}</div>
                  <div className="text-gray-900 dark:text-white font-bold text-sm">{trader.winRate}%</div>
                </div>
                <div>
                  <div className="text-xs text-gray-600 dark:text-gray-400 mb-1">{text.trades}</div>
                  <div className="text-gray-900 dark:text-white font-bold text-sm">{trader.totalTrades}{language === 'zh' ? '笔' : ''}</div>
                </div>
              </div>

              {/* Time Info */}
              <div className="grid grid-cols-2 gap-2 text-xs text-gray-600 dark:text-gray-400 mb-4">
                <div>
                  <span className="block">{text.lastTrade}</span>
                  <span className="text-gray-900 dark:text-white font-medium">{trader.lastTrade}</span>
                </div>
                <div>
                  <span className="block">{text.created}</span>
                  <span className="text-gray-900 dark:text-white font-medium">{trader.created}</span>
                </div>
              </div>

              {/* Action Buttons - 禁用状态 */}
              <div className="flex items-center gap-2">
                <button
                  disabled
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-medium bg-gray-100 dark:bg-gray-800 text-gray-400 cursor-not-allowed"
                >
                  <Play size={16} />
                  <span>{text.resume}</span>
                </button>
                <button
                  disabled
                  className="px-3 py-2 bg-gray-100 dark:bg-gray-800 text-gray-400 rounded-lg cursor-not-allowed"
                >
                  <Edit size={16} />
                </button>
                <button
                  disabled
                  className="px-3 py-2 bg-gray-100 dark:bg-gray-800 text-gray-400 rounded-lg cursor-not-allowed"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}

          {/* Create New Trader Card - 禁用状态 */}
          {traders.length < MAX_TRADERS && (
            <div className="bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-900 border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-2xl p-6 flex flex-col items-center justify-center cursor-not-allowed">
              <div className="w-16 h-16 rounded-full bg-gray-200 dark:bg-gray-800 flex items-center justify-center mb-4">
                <Plus size={32} className="text-gray-400" />
              </div>
              <h3 className="text-gray-400 dark:text-gray-600 font-bold mb-2">{text.createNew}</h3>
              <p className="text-gray-400 dark:text-gray-600 text-sm text-center">{text.addNewTrader}</p>
              <button disabled className="mt-4 px-6 py-2 bg-gray-300 dark:bg-gray-700 text-gray-500 rounded-lg font-medium cursor-not-allowed">
                {text.createTrader}
              </button>
            </div>
          )}
        </div>
      ) : (
        /* Empty State */
        <div className="text-center py-20">
          <div className="w-24 h-24 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mx-auto mb-6">
            <TrendingUp size={48} className="text-gray-400" />
          </div>
          <h3 className="text-2xl font-bold text-gray-400 dark:text-gray-600 mb-3">{text.noTraders}</h3>
          <p className="text-gray-400 dark:text-gray-600 mb-8 max-w-md mx-auto">{text.noTradersDesc}</p>
          <button
            disabled
            className="px-8 py-3 bg-gray-300 dark:bg-gray-700 text-gray-500 rounded-lg font-medium cursor-not-allowed inline-flex items-center gap-2"
          >
            <Plus size={20} />
            {text.createNew}
          </button>
        </div>
      )}

      </div>
    </div>
  );
};

export default MyTradersTab;

