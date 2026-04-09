/**
 * Portfolio Panel Component
 *
 * 侧边面板，显示用户的持仓、挂单、交易历史
 * 参考 Polymarket 的 Portfolio 设计风格
 *
 * 支持模拟盘/实盘模式切换：
 * - 模拟盘模式：显示 paper trading 数据
 * - 实盘模式：显示真实 Polymarket 数据
 *
 * 使用 React Portal 渲染到 body 以避免 z-index 冲突
 */

import React, { useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, RefreshCw, Wallet, TrendingUp, Clock, ExternalLink, Settings } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSafeWallet } from '../../../contexts/SafeWalletContext';
import { usePortfolio } from '../../../hooks/usePortfolio';
import { useDFlowPortfolio } from '../../../hooks/useDFlowPortfolio';
import { useWallet } from '../../../contexts/WalletContext';
import { PositionsList } from './PositionsList';
import { DFlowPositionsList } from './DFlowPositionsList';
import { OpenOrdersList } from './OpenOrdersList';
import { TradeHistoryList } from './TradeHistoryList';
import { SellPositionModal } from './SellPositionModal';
import { DFlowSellModal } from './DFlowSellModal';
import { AutoTradePanel } from '../AutoTradePanel';
import { Position } from '../../../services/polymarket/portfolioService';
import { DFlowPosition } from '../../../services/dflow/dflowPortfolioService';
import { formatDistanceToNow } from 'date-fns';
import { zhCN, enUS } from 'date-fns/locale';
import { translations } from '../../../constants/translations';
import { useAppStore } from '../../../contexts/useAppStore';
import { PaperPortfolioPanel } from '../../../components/paper-trading/PaperPortfolioPanel';

// ============================================
// Types
// ============================================

interface PortfolioPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

type TabType = 'positions' | 'orders' | 'history' | 'settings';
type SourceFilter = 'all' | 'polymarket' | 'kalshi';

// ============================================
// Component
// ============================================

export function PortfolioPanel({ isOpen, onClose }: PortfolioPanelProps) {
  const [activeTab, setActiveTab] = useState<TabType>('positions');
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');
  const [sellModalOpen, setSellModalOpen] = useState(false);
  const [selectedPosition, setSelectedPosition] = useState<Position | null>(null);
  // DFlow/Kalshi sell modal state
  const [dflowSellModalOpen, setDflowSellModalOpen] = useState(false);
  const [selectedDflowPosition, setSelectedDflowPosition] = useState<DFlowPosition | null>(null);

  const language = useAppStore((state) => state.language);
  const isPaperTrading = useAppStore((state) => state.isPaperTrading);
  const t = translations[language]?.polymarketPage?.portfolio || translations.en.polymarketPage.portfolio;

  // 所有 hooks 必须在条件语句之前调用
  const { safeAddress, isReady } = useSafeWallet();
  const {
    positions,
    openOrders,
    history,
    summary,
    usdcBalance,
    isLoading,
    isRefetching,
    refreshAll,
    lastUpdated,
  } = usePortfolio();

  // DFlow/Kalshi Portfolio
  const {
    positions: dflowPositions,
    tradeHistory: dflowTradeHistory,
    summary: dflowSummary,
    isLoading: dflowLoading,
    isRefetching: dflowRefetching,
    refreshPositions: refreshDFlow,
  } = useDFlowPortfolio();

  // Solana wallet balance
  const { solanaBalance } = useWallet();

  // Handle Polymarket sell button click
  const handleSellPosition = useCallback((position: Position) => {
    setSelectedPosition(position);
    setSellModalOpen(true);
  }, []);

  // Handle Polymarket sell success
  const handleSellSuccess = useCallback(() => {
    setSellModalOpen(false);
    setSelectedPosition(null);
    // Refresh portfolio data
    refreshAll();
    refreshDFlow();
  }, [refreshAll, refreshDFlow]);

  // Handle DFlow/Kalshi sell button click
  const handleDflowSellPosition = useCallback((position: DFlowPosition) => {
    setSelectedDflowPosition(position);
    setDflowSellModalOpen(true);
  }, []);

  // Handle DFlow/Kalshi sell success
  const handleDflowSellSuccess = useCallback(() => {
    setDflowSellModalOpen(false);
    setSelectedDflowPosition(null);
    // Refresh portfolio data
    refreshDFlow();
  }, [refreshDFlow]);

  // Combined refresh
  const handleRefreshAll = useCallback(async () => {
    await Promise.all([refreshAll(), refreshDFlow()]);
  }, [refreshAll, refreshDFlow]);

  // Combined loading state
  const combinedLoading = isLoading || dflowLoading;
  const combinedRefetching = isRefetching || dflowRefetching;

  // Combined positions count
  const totalPositionsCount = positions.length + dflowPositions.length;
  const polymarketPositionsCount = positions.length;
  const kalshiPositionsCount = dflowPositions.length;

  // Combined total value
  const combinedTotalValue = summary.totalValue + dflowSummary.totalValue;
  const kalshiBalance = solanaBalance?.balance || 0;

  // 如果是模拟盘模式，直接渲染 PaperPortfolioPanel
  if (isPaperTrading) {
    return (
      <PaperPortfolioPanel
        open={isOpen}
        onClose={onClose}
        language={language}
      />
    );
  }

  // Tab 配置
  const tabs: { key: TabType; label: string; count?: number; icon: React.ReactNode }[] = [
    { key: 'positions', label: t.positions || 'Positions', count: totalPositionsCount, icon: <TrendingUp className="w-4 h-4" /> },
    { key: 'orders', label: t.orders || 'Orders', count: openOrders.length, icon: <Clock className="w-4 h-4" /> },
    { key: 'history', label: t.history || 'History', count: history.length + dflowTradeHistory.length, icon: <Wallet className="w-4 h-4" /> },
    { key: 'settings', label: t.settings || 'Settings', icon: <Settings className="w-4 h-4" /> },
  ];

  // 格式化最后更新时间
  const formatLastUpdated = () => {
    if (!lastUpdated) return t.neverUpdated || 'Never updated';
    return formatDistanceToNow(lastUpdated, { addSuffix: true, locale: language === 'zh' ? zhCN : enUS });
  };

  // 格式化地址
  const formatAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  // 使用 Portal 渲染到 body，避免父级 stacking context 影响
  const panelContent = (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* 背景遮罩 */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 z-[9998]"
            onClick={onClose}
            style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0 }}
          />

          {/* 面板 */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed right-0 top-0 h-full w-full max-w-md bg-white dark:bg-gray-900 shadow-2xl z-[9999] flex flex-col"
            style={{ position: 'fixed', top: 0, right: 0, height: '100vh' }}
          >
            {/* 头部 */}
            <div className="px-4 py-4 border-b border-gray-200 dark:border-gray-800">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Wallet className="w-5 h-5 text-blue-500" />
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                    My Portfolio
                  </h2>
                </div>
                <button
                  onClick={onClose}
                  className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>

              {/* Safe 地址 */}
              {safeAddress && (
                <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 mb-4">
                  <span>Safe:</span>
                  <code className="px-2 py-0.5 bg-gray-100 dark:bg-gray-800 rounded text-xs">
                    {formatAddress(safeAddress)}
                  </code>
                  <a
                    href={`https://polygonscan.com/address/${safeAddress}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-500 hover:text-blue-600"
                  >
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              )}

              {/* 资产概览 */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20 rounded-xl">
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{t.totalAssets}</p>
                  <p className="text-xl font-bold text-gray-900 dark:text-white">
                    ${combinedTotalValue.toFixed(2)}
                  </p>
                  {summary.totalPnl !== 0 && (
                    <p className={`text-xs ${summary.totalPnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {summary.totalPnl >= 0 ? '+' : ''}{summary.totalPnl.toFixed(2)} ({summary.totalPnlPercent.toFixed(1)}%)
                    </p>
                  )}
                </div>
                <div className="p-3 bg-gradient-to-br from-green-50 to-green-100 dark:from-green-900/20 dark:to-green-800/20 rounded-xl">
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{t.availableBalance}</p>
                  <div className="flex items-baseline gap-2">
                    <p className="text-xl font-bold text-gray-900 dark:text-white">
                      ${(usdcBalance + kalshiBalance).toFixed(2)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-blue-500" />
                      Poly: ${usdcBalance.toFixed(2)}
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-purple-500" />
                      Kalshi: ${kalshiBalance.toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Tab 切换 */}
            <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-800">
              <div className="flex gap-1 p-1 bg-gray-100 dark:bg-gray-800 rounded-lg">
                {tabs.map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key)}
                    className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium transition-all ${
                      activeTab === tab.key
                        ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                        : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                    }`}
                  >
                    {tab.icon}
                    <span>{tab.label}</span>
                    {tab.count !== undefined && tab.count > 0 && (
                      <span className={`px-1.5 py-0.5 rounded-full text-xs ${
                        activeTab === tab.key
                          ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400'
                          : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                      }`}>
                        {tab.count}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* 内容区域 */}
            <div className="flex-1 overflow-y-auto">
              {!isReady ? (
                <div className="flex flex-col items-center justify-center h-full text-gray-500 dark:text-gray-400">
                  <Wallet className="w-12 h-12 mb-4 opacity-50" />
                  <p>{t.connectWallet}</p>
                </div>
              ) : combinedLoading ? (
                <div className="flex items-center justify-center h-full">
                  <RefreshCw className="w-8 h-8 animate-spin text-blue-500" />
                </div>
              ) : (
                <>
                  {activeTab === 'positions' && (
                    <div>
                      {/* Source Filter */}
                      <div className="px-4 py-2 border-b border-gray-100 dark:border-gray-800">
                        <div className="flex gap-1 p-0.5 bg-gray-100 dark:bg-gray-800 rounded-lg text-xs">
                          <button
                            onClick={() => setSourceFilter('all')}
                            className={`flex-1 px-3 py-1.5 rounded-md font-medium transition-all ${
                              sourceFilter === 'all'
                                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                                : 'text-gray-600 dark:text-gray-400'
                            }`}
                          >
                            {language === 'zh' ? '全部' : 'All'} ({totalPositionsCount})
                          </button>
                          <button
                            onClick={() => setSourceFilter('polymarket')}
                            className={`flex-1 px-3 py-1.5 rounded-md font-medium transition-all flex items-center justify-center gap-1 ${
                              sourceFilter === 'polymarket'
                                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                                : 'text-gray-600 dark:text-gray-400'
                            }`}
                          >
                            <span className="w-2 h-2 rounded-full bg-blue-500" />
                            Poly ({polymarketPositionsCount})
                          </button>
                          <button
                            onClick={() => setSourceFilter('kalshi')}
                            className={`flex-1 px-3 py-1.5 rounded-md font-medium transition-all flex items-center justify-center gap-1 ${
                              sourceFilter === 'kalshi'
                                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                                : 'text-gray-600 dark:text-gray-400'
                            }`}
                          >
                            <span className="w-2 h-2 rounded-full bg-purple-500" />
                            Kalshi ({kalshiPositionsCount})
                          </button>
                        </div>
                      </div>
                      
                      {/* Positions List by Source */}
                      {(sourceFilter === 'all' || sourceFilter === 'polymarket') && positions.length > 0 && (
                        <>
                          {sourceFilter === 'all' && polymarketPositionsCount > 0 && (
                            <div className="px-4 py-2 bg-blue-50 dark:bg-blue-900/20 border-b border-blue-100 dark:border-blue-800">
                              <span className="text-xs font-medium text-blue-600 dark:text-blue-400 flex items-center gap-1">
                                <span className="w-2 h-2 rounded-full bg-blue-500" />
                                Polymarket ({polymarketPositionsCount})
                              </span>
                            </div>
                          )}
                          <PositionsList
                            positions={positions}
                            onSellPosition={handleSellPosition}
                          />
                        </>
                      )}
                      
                      {(sourceFilter === 'all' || sourceFilter === 'kalshi') && dflowPositions.length > 0 && (
                        <>
                          {sourceFilter === 'all' && kalshiPositionsCount > 0 && (
                            <div className="px-4 py-2 bg-purple-50 dark:bg-purple-900/20 border-b border-purple-100 dark:border-purple-800">
                              <span className="text-xs font-medium text-purple-600 dark:text-purple-400 flex items-center gap-1">
                                <span className="w-2 h-2 rounded-full bg-purple-500" />
                                Kalshi ({kalshiPositionsCount})
                              </span>
                            </div>
                          )}
                          <DFlowPositionsList
                            positions={dflowPositions}
                            onSellPosition={handleDflowSellPosition}
                          />
                        </>
                      )}
                      
                      {/* Empty state */}
                      {sourceFilter === 'polymarket' && positions.length === 0 && (
                        <div className="flex flex-col items-center justify-center py-12 text-gray-500 dark:text-gray-400">
                          <TrendingUp className="w-12 h-12 mb-4 opacity-50" />
                          <p>{language === 'zh' ? '暂无 Polymarket 持仓' : 'No Polymarket positions'}</p>
                        </div>
                      )}
                      {sourceFilter === 'kalshi' && dflowPositions.length === 0 && (
                        <div className="flex flex-col items-center justify-center py-12 text-gray-500 dark:text-gray-400">
                          <TrendingUp className="w-12 h-12 mb-4 opacity-50" />
                          <p>{language === 'zh' ? '暂无 Kalshi 持仓' : 'No Kalshi positions'}</p>
                        </div>
                      )}
                      {sourceFilter === 'all' && totalPositionsCount === 0 && (
                        <div className="flex flex-col items-center justify-center py-12 text-gray-500 dark:text-gray-400">
                          <TrendingUp className="w-12 h-12 mb-4 opacity-50" />
                          <p>{t.noPositions || 'No positions yet'}</p>
                        </div>
                      )}
                    </div>
                  )}
                  {activeTab === 'orders' && <OpenOrdersList orders={openOrders} />}
                  {activeTab === 'history' && <TradeHistoryList history={history} />}
                  {activeTab === 'settings' && (
                    <div className="p-4">
                      <AutoTradePanel
                        walletAddress={safeAddress || ''}
                        className="border-0 shadow-none"
                      />
                    </div>
                  )}
                </>
              )}
            </div>

            {/* 底部 - 刷新状态 */}
            <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-800">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {combinedRefetching ? (t.refreshing || 'Refreshing...') : `${t.updatedAt || 'Updated at'} ${formatLastUpdated()}`}
                </span>
                <button
                  onClick={handleRefreshAll}
                  disabled={combinedRefetching}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors disabled:opacity-50"
                >
                  <RefreshCw className={`w-4 h-4 ${combinedRefetching ? 'animate-spin' : ''}`} />
                  {t.refresh || 'Refresh'}
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );

  // 使用 Portal 渲染到 document.body
  if (typeof document !== 'undefined') {
    return (
      <>
        {createPortal(panelContent, document.body)}
        <SellPositionModal
          position={selectedPosition}
          isOpen={sellModalOpen}
          onClose={() => {
            setSellModalOpen(false);
            setSelectedPosition(null);
          }}
          onSuccess={handleSellSuccess}
        />
        <DFlowSellModal
          position={selectedDflowPosition}
          isOpen={dflowSellModalOpen}
          onClose={() => {
            setDflowSellModalOpen(false);
            setSelectedDflowPosition(null);
          }}
          onSuccess={handleDflowSellSuccess}
        />
      </>
    );
  }
  
  return null;
}

export default PortfolioPanel;

