import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, TrendingUp, History, Loader2, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppStore } from '../../contexts/useAppStore';
import { paperTradingAPI } from '../../utils/api';
import { usePrivy } from '@privy-io/react-auth';

const CLOB_API_URL = 'https://clob.polymarket.com';

// DFlow/Kalshi API URL
const isDev = import.meta.env?.DEV;
const API_BASE_URL = import.meta.env?.VITE_API_URL || 'http://localhost:3002/api';
const BACKEND_URL = isDev ? 'http://localhost:3002/api' : API_BASE_URL;
const DFLOW_API_URL = `${BACKEND_URL}/dflow/markets-api`;

/**
 * 检测是否为 Kalshi 事件 ID
 */
function isKalshiEventId(eventId) {
  if (!eventId) return false;
  // Kalshi 事件 ID 通常格式: KX开头 或 大写字母+数字+连字符
  return /^KX|^[A-Z]{2,}[A-Z0-9-]+$/.test(eventId);
}

/**
 * 获取 Polymarket token 的实时价格
 */
async function fetchPolymarketPrice(tokenId) {
  if (!tokenId) return null;
  try {
    const response = await fetch(`${CLOB_API_URL}/price?token_id=${tokenId}&side=sell`);
    if (!response.ok) return null;
    const data = await response.json();
    return parseFloat(data.price) || null;
  } catch (error) {
    console.warn('[PaperPortfolio] Failed to fetch Polymarket price for token:', tokenId, error.message);
    return null;
  }
}

/**
 * 获取 Kalshi/DFlow 事件的实时价格
 */
async function fetchKalshiPrice(eventId, side) {
  if (!eventId) return null;
  try {
    // 通过后端代理获取 DFlow 市场数据
    const response = await fetch(`${DFLOW_API_URL}/markets?status=active&limit=200`);
    if (!response.ok) return null;
    const data = await response.json();

    // 查找匹配的市场
    const market = data.markets?.find(m =>
      m.eventTicker === eventId || m.ticker === eventId
    );

    if (!market) return null;

    // 根据 side 返回对应价格
    if (side === 'YES') {
      const yesBid = market.yesBid ? parseFloat(market.yesBid) : null;
      const yesAsk = market.yesAsk ? parseFloat(market.yesAsk) : null;
      if (yesBid !== null && yesAsk !== null) return (yesBid + yesAsk) / 2;
      return yesBid ?? yesAsk ?? 0.5;
    } else {
      const noBid = market.noBid ? parseFloat(market.noBid) : null;
      const noAsk = market.noAsk ? parseFloat(market.noAsk) : null;
      if (noBid !== null && noAsk !== null) return (noBid + noAsk) / 2;
      return noBid ?? noAsk ?? 0.5;
    }
  } catch (error) {
    console.warn('[PaperPortfolio] Failed to fetch Kalshi price for event:', eventId, error.message);
    return null;
  }
}

/**
 * 获取 token/event 的实时价格（自动识别来源）
 */
async function fetchTokenPrice(tokenId, source, eventId, side) {
  // 根据 source 或 eventId 格式判断使用哪个 API
  if (source === 'KALSHI' || (eventId && isKalshiEventId(eventId))) {
    return fetchKalshiPrice(eventId, side);
  }
  return fetchPolymarketPrice(tokenId);
}

/**
 * 模拟持仓面板组件
 * 显示模拟账户的持仓和交易历史
 * 支持从后端加载数据，并获取实时价格
 */
export function PaperPortfolioPanel({
  open,
  onClose,
  language = 'en'
}) {
  const [activeTab, setActiveTab] = useState('positions');
  const [isLoading, setIsLoading] = useState(false);
  const [isPriceLoading, setIsPriceLoading] = useState(false);
  const [backendData, setBackendData] = useState(null);
  const [realTimePrices, setRealTimePrices] = useState({});

  const { getAccessToken, user } = usePrivy();

  // 防止重复加载的 ref
  const hasLoadedRef = useRef(false);
  const lastOpenRef = useRef(open);

  // 从 useAppStore 获取本地数据（作为备用）
  const paperBalance = useAppStore((state) => state.paperBalance);
  const localPaperPositions = useAppStore((state) => state.paperPositions);
  const localPaperTradeHistory = useAppStore((state) => state.paperTradeHistory);
  const removePaperPosition = useAppStore((state) => state.removePaperPosition);
  const setPaperBalance = useAppStore((state) => state.setPaperBalance);
  const addPaperTradeHistory = useAppStore((state) => state.addPaperTradeHistory);

  // 始终使用本地数据作为显示源（本地是实时更新的源）
  // 这确保了 Buy/Sell 后立即显示在 UI 中
  const accountBalance = paperBalance;
  const paperPositions = localPaperPositions ?? [];
  const paperTradeHistory = localPaperTradeHistory ?? [];

  // 获取所有持仓的实时价格
  // 使用 useAppStore.getState() 避免依赖 paperPositions 导致无限循环
  const fetchAllPrices = useCallback(async () => {
    const positions = useAppStore.getState().paperPositions ?? [];
    if (!positions || positions.length === 0) return;

    setIsPriceLoading(true);
    const prices = {};

    await Promise.all(
      positions.map(async (pos) => {
        // 使用持仓的 source、eventId、side 来获取价格
        const priceKey = pos.tokenId || `${pos.eventId}-${pos.side}`;
        const price = await fetchTokenPrice(pos.tokenId, pos.source, pos.eventId, pos.side);
        if (price !== null) {
          prices[priceKey] = price;
        }
      })
    );

    setRealTimePrices(prices);
    setIsPriceLoading(false);
    console.log('[PaperPortfolio] Fetched real-time prices:', prices);
  }, []); // 无依赖，避免重复创建

  // 从后端加载数据 (数据库是主存储)
  const loadFromBackend = useCallback(async () => {
    if (!user) return;

    setIsLoading(true);

    try {
      const accessToken = await getAccessToken();
      const walletAddress = user?.wallet?.address;

      if (!accessToken || !walletAddress) {
        console.log('[PaperPortfolio] No auth, using default values');
        return;
      }

      const response = await paperTradingAPI.getAccount(accessToken, walletAddress);

      if (response.success && response.data) {
        const { balance, positions, trades, initialBalance } = response.data;
        setBackendData(response.data);

        // 更新 useAppStore 中的数据 (确保全局状态与数据库一致)
        const { setPaperBalance, setPaperPositions, setPaperTradeHistory } = useAppStore.getState();
        if (balance !== undefined) setPaperBalance(balance);
        if (positions) setPaperPositions(positions);
        if (trades) setPaperTradeHistory(trades);

        console.log('[PaperPortfolio] ✅ Loaded from database:', {
          balance,
          positions: (positions || []).length,
          trades: (trades || []).length
        });
      }
    } catch (err) {
      console.error('[PaperPortfolio] Failed to load from backend:', err);
    } finally {
      setIsLoading(false);
    }
  }, [user, getAccessToken]);

  // 打开面板时加载数据和价格 - 使用 ref 防止重复加载
  useEffect(() => {
    // 只在从关闭到打开时执行一次
    const wasOpen = lastOpenRef.current;
    lastOpenRef.current = open;

    if (open && !wasOpen) {
      // 面板刚打开，重置加载状态
      hasLoadedRef.current = false;
    }

    if (open && !hasLoadedRef.current) {
      hasLoadedRef.current = true;
      loadFromBackend().then(() => {
        // 加载完成后再获取价格
        fetchAllPrices();
      });
    }
  }, [open]); // 只依赖 open，不依赖 callbacks

  // 刷新价格
  const handleRefreshPrices = useCallback(async () => {
    await fetchAllPrices();
  }, []); // fetchAllPrices 是稳定的

  const texts = {
    zh: {
      title: '模拟账户',
      totalAssets: '总资产',
      totalPnL: '总盈亏',
      positions: '持仓',
      history: '历史',
      noPositions: '暂无持仓',
      noHistory: '暂无交易记录',
      sell: '平仓',
      shares: 'shares',
      avgCost: '均价',
      currentPrice: '现价',
      value: '市值',
      cost: '成本',
      refresh: '刷新'
    },
    en: {
      title: 'Paper Account',
      totalAssets: 'Total Assets',
      totalPnL: 'Total P&L',
      positions: 'Positions',
      history: 'History',
      noPositions: 'No positions',
      noHistory: 'No trade history',
      sell: 'Close',
      shares: 'shares',
      avgCost: 'Avg Cost',
      currentPrice: 'Current',
      value: 'Value',
      cost: 'Cost',
      refresh: 'Refresh'
    }
  };

  const t = texts[language] || texts.en;

  // 计算带有实时价格的持仓数据
  // 兼容旧字段名 (shares/avgPrice/outcome) 和新字段名 (size/entryPrice/side)
  const positionsWithPrices = useMemo(() => {
    return paperPositions.map(pos => {
      // 兼容旧字段名
      const size = parseFloat(pos.size) || parseFloat(pos.shares) || 0;
      const entryPrice = parseFloat(pos.entryPrice) || parseFloat(pos.avgPrice) || 0;
      const side = pos.side || (pos.outcome === 'Yes' ? 'YES' : pos.outcome === 'No' ? 'NO' : pos.outcome);
      const totalCost = parseFloat(pos.totalCost) || (size * entryPrice);

      // 获取实时价格 - 支持 Kalshi 和 Polymarket
      const priceKey = pos.tokenId || `${pos.eventId}-${pos.side}`;
      const currentPrice = realTimePrices[priceKey] ?? entryPrice;
      const currentValue = size * currentPrice;
      const pnl = currentValue - totalCost;
      const pnlPercent = totalCost > 0 ? (pnl / totalCost) * 100 : 0;

      // 检测是否为 Kalshi 持仓
      const isKalshi = pos.source === 'KALSHI' || isKalshiEventId(pos.eventId);

      return {
        ...pos,
        size,
        entryPrice,
        side,
        totalCost,
        currentPrice,
        currentValue,
        pnl,
        pnlPercent,
        hasRealTimePrice: realTimePrices[priceKey] !== undefined,
        isKalshi
      };
    });
  }, [paperPositions, realTimePrices]);

  // 计算总资产和盈亏（使用实时价格）
  const initialBalance = backendData?.initialBalance ?? 10000;
  const positionValue = positionsWithPrices.reduce((sum, pos) => sum + pos.currentValue, 0);
  const totalAssets = accountBalance + positionValue;
  const totalCost = positionsWithPrices.reduce((sum, pos) => sum + pos.totalCost, 0);
  const totalPnL = positionsWithPrices.reduce((sum, pos) => sum + pos.pnl, 0);
  const totalPnLPercent = totalCost > 0 ? (totalPnL / totalCost) * 100 : 0;

  // 平仓操作 - 数据库优先
  const handleClosePosition = async (position) => {
    if (!user) {
      alert(language === 'zh' ? '请先登录' : 'Please login first');
      return;
    }

    const size = position.size;
    const currentPrice = position.currentPrice;
    const totalCost = position.totalCost;
    const sellValue = size * currentPrice;
    const pnl = sellValue - totalCost;

    try {
      const accessToken = await getAccessToken();
      const walletAddress = user?.wallet?.address;

      if (!accessToken || !walletAddress) {
        throw new Error(language === 'zh' ? '认证失败' : 'Authentication failed');
      }

      // 调用后端平仓 API
      const response = await paperTradingAPI.sell({
        positionId: position.id,
        sellPrice: currentPrice
      }, accessToken, walletAddress);

      if (!response.success) {
        throw new Error(response.error || (language === 'zh' ? '平仓失败' : 'Close position failed'));
      }

      console.log('[PaperPortfolio] ✅ Position closed:', response.data);

      // 后端成功后，使用后端返回的数据更新本地状态
      const { balance, trade } = response.data || {};

      if (balance !== undefined) {
        setPaperBalance(balance);
      } else {
        setPaperBalance(paperBalance + sellValue);
      }

      if (trade) {
        addPaperTradeHistory({
          id: trade.id,
          eventId: trade.eventId || position.eventId,
          eventTitle: trade.eventTitle || position.eventTitle,
          side: trade.side || position.side,
          action: 'SELL',
          size: trade.size || size,
          price: trade.price || currentPrice,
          amount: trade.amount || sellValue,
          pnl: trade.pnl || pnl,
          executedAt: trade.executedAt
        });
      }

      removePaperPosition(position.id);

    } catch (err) {
      console.error('[PaperPortfolio] Failed to close position:', err);
      alert(err.message || (language === 'zh' ? '平仓失败，请重试' : 'Close position failed, please retry'));
    }
  };

  // 渲染持仓列表
  const renderPositions = () => {
    if (isLoading) {
      return (
        <div className="flex flex-col items-center justify-center h-40 text-gray-500 dark:text-gray-400">
          <Loader2 size={32} className="mb-2 animate-spin" />
          <p>{language === 'zh' ? '加载中...' : 'Loading...'}</p>
        </div>
      );
    }

    if (!Array.isArray(paperPositions) || paperPositions.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center h-40 text-gray-500 dark:text-gray-400">
          <TrendingUp size={32} className="mb-2 opacity-50" />
          <p>{t.noPositions}</p>
        </div>
      );
    }

    return (
      <div className="space-y-3">
        {positionsWithPrices.map((position, index) => {
          if (!position || (!position.id && !position.eventId)) {
            return null;
          }

          const pricePercent = position.currentPrice * 100;

          return (
            <div
              key={position.id || `position-${index}`}
              className="bg-gray-100 dark:bg-gray-900/50 rounded-lg p-3 hover:bg-gray-200 dark:hover:bg-gray-900 transition-colors"
            >
              {/* Title and P&L */}
              <div className="flex items-start justify-between mb-2">
                <div className="flex-1 min-w-0">
                  <span className="font-medium text-sm text-gray-900 dark:text-white truncate block">
                    {position.eventTitle || 'Unknown Event'}
                  </span>
                  <div className="flex items-center gap-1 mt-1">
                    <span className={`inline-block px-1.5 py-0.5 rounded text-xs font-medium ${
                      position.side === 'YES'
                        ? 'bg-green-500/20 text-green-600 dark:text-green-400'
                        : 'bg-red-500/20 text-red-600 dark:text-red-400'
                    }`}>
                      {position.side}
                    </span>
                    {/* 市场来源标识 */}
                    <span className={`inline-block px-1.5 py-0.5 rounded text-xs font-medium ${
                      position.isKalshi
                        ? 'bg-purple-500/20 text-purple-600 dark:text-purple-400'
                        : 'bg-blue-500/20 text-blue-600 dark:text-blue-400'
                    }`}>
                      {position.isKalshi ? 'Kalshi' : 'PM'}
                    </span>
                  </div>
                </div>
                <div className="text-right ml-2">
                  <span className={`font-bold text-sm ${position.pnl >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                    {position.pnl >= 0 ? '+' : ''}${position.pnl.toFixed(2)}
                  </span>
                  <span className={`block text-xs ${position.pnl >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                    {position.pnl >= 0 ? '+' : ''}{position.pnlPercent.toFixed(1)}%
                  </span>
                </div>
              </div>

              {/* Price Progress Bar */}
              <div className="mb-3">
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-gray-500 dark:text-gray-400">{t.currentPrice}</span>
                  <span className="font-medium text-gray-900 dark:text-white flex items-center gap-1">
                    {pricePercent.toFixed(1)}%
                    {isPriceLoading && <Loader2 size={10} className="animate-spin" />}
                    {position.hasRealTimePrice && !isPriceLoading && (
                      <span className="w-1.5 h-1.5 bg-green-500 rounded-full" title="Live price" />
                    )}
                  </span>
                </div>
                <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      position.side === 'YES'
                        ? 'bg-gradient-to-r from-green-400 to-green-500'
                        : 'bg-gradient-to-r from-red-400 to-red-500'
                    }`}
                    style={{ width: `${Math.min(pricePercent, 100)}%` }}
                  />
                </div>
              </div>

              {/* Detailed Data */}
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs mb-3">
                <div className="flex justify-between">
                  <span className="text-gray-500 dark:text-gray-400">{t.shares}</span>
                  <span className="font-medium text-gray-900 dark:text-white">
                    {position.size.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500 dark:text-gray-400">{t.avgCost}</span>
                  <span className="font-medium text-gray-900 dark:text-white">
                    {(position.entryPrice * 100).toFixed(1)}%
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500 dark:text-gray-400">{t.cost}</span>
                  <span className="font-medium text-gray-900 dark:text-white">
                    ${position.totalCost.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500 dark:text-gray-400">{t.value}</span>
                  <span className="font-medium text-gray-900 dark:text-white">
                    ${position.currentValue.toFixed(2)}
                  </span>
                </div>
              </div>

              <button
                onClick={() => handleClosePosition(position)}
                className="w-full py-1.5 bg-red-500/10 text-red-600 dark:text-red-400 rounded text-xs font-medium hover:bg-red-500/20 transition-colors"
              >
                {t.sell}
              </button>
            </div>
          );
        })}
      </div>
    );
  };

  // 渲染交易历史
  const renderHistory = () => {
    if (isLoading) {
      return (
        <div className="flex flex-col items-center justify-center h-40 text-gray-500 dark:text-gray-400">
          <Loader2 size={32} className="mb-2 animate-spin" />
          <p>{language === 'zh' ? '加载中...' : 'Loading...'}</p>
        </div>
      );
    }

    if (!Array.isArray(paperTradeHistory) || paperTradeHistory.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center h-40 text-gray-500 dark:text-gray-400">
          <History size={32} className="mb-2 opacity-50" />
          <p>{t.noHistory}</p>
        </div>
      );
    }

    return (
      <div className="space-y-2">
        {paperTradeHistory.map((trade, index) => {
          // 兼容旧字段名 (shares/outcome) 和新字段名 (size/side)
          const tradeSize = parseFloat(trade.size) || parseFloat(trade.shares) || 0;
          const tradePrice = parseFloat(trade.price) || 0;
          const tradeAmount = parseFloat(trade.amount) || 0;
          const tradeSide = trade.side || (trade.outcome === 'Yes' ? 'YES' : trade.outcome === 'No' ? 'NO' : trade.outcome);

          return (
            <div
              key={trade.id || index}
              className="bg-gray-100 dark:bg-gray-900/50 rounded-lg p-3"
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-medium text-sm text-gray-900 dark:text-white truncate flex-1 mr-2">
                  {trade.eventTitle || 'Unknown Event'}
                </span>
                <span className={`text-sm font-medium ${
                  trade.action === 'BUY' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                }`}>
                  {trade.action}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                <div className="flex items-center gap-2">
                  <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                    tradeSide === 'YES'
                      ? 'bg-green-500/20 text-green-600 dark:text-green-400'
                      : 'bg-red-500/20 text-red-600 dark:text-red-400'
                  }`}>
                    {tradeSide}
                  </span>
                  <span>{tradeSize.toFixed(2)} @ {(tradePrice * 100).toFixed(0)}%</span>
                </div>
                <span>${tradeAmount.toFixed(2)}</span>
              </div>
              {trade.executedAt && (
                <p className="text-xs text-gray-400 mt-1">
                  {new Date(trade.executedAt).toLocaleString()}
                </p>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  // 面板内容
  const panelContent = (
    <AnimatePresence>
      {open && (
        <>
          {/* 背景遮罩 */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 z-[9998]"
            onClick={onClose}
          />

          {/* 面板 */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed right-0 top-0 h-full w-full max-w-md bg-white dark:bg-gray-800 shadow-2xl border-l border-gray-200 dark:border-gray-700 flex flex-col z-[9999]"
          >
            {/* 头部 */}
            <div className="p-4 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-amber-500/10 to-orange-500/10">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-amber-400 rounded-full animate-pulse" />
                  <h3 className="font-bold text-lg text-gray-900 dark:text-white">{t.title}</h3>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleRefreshPrices}
                    disabled={isPriceLoading}
                    className="p-1.5 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
                    title={t.refresh}
                  >
                    <RefreshCw size={16} className={isPriceLoading ? 'animate-spin' : ''} />
                  </button>
                  <button
                    onClick={onClose}
                    className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-1"
                  >
                    <X size={20} />
                  </button>
                </div>
              </div>

              {/* 账户总览 */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-white/50 dark:bg-gray-900/50 rounded-lg p-3">
                  <p className="text-gray-500 dark:text-gray-400 text-xs mb-1">{t.totalAssets}</p>
                  <p className="text-gray-900 dark:text-white font-bold text-xl">
                    ${totalAssets.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                </div>
                <div className="bg-white/50 dark:bg-gray-900/50 rounded-lg p-3">
                  <p className="text-gray-500 dark:text-gray-400 text-xs mb-1">{t.totalPnL}</p>
                  <p className={`font-bold text-xl ${totalPnL >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                    {totalPnL >= 0 ? '+' : ''}${totalPnL.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                  <p className={`text-xs ${totalPnL >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                    {totalPnL >= 0 ? '+' : ''}{totalPnLPercent.toFixed(1)}%
                  </p>
                </div>
              </div>
            </div>

            {/* Tab 切换 */}
            <div className="flex border-b border-gray-200 dark:border-gray-700">
              <button
                onClick={() => setActiveTab('positions')}
                className={`flex-1 py-3 text-sm font-medium transition-colors ${
                  activeTab === 'positions'
                    ? 'text-amber-600 dark:text-amber-400 border-b-2 border-amber-500'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                }`}
              >
                {t.positions} ({paperPositions.length})
              </button>
              <button
                onClick={() => setActiveTab('history')}
                className={`flex-1 py-3 text-sm font-medium transition-colors ${
                  activeTab === 'history'
                    ? 'text-amber-600 dark:text-amber-400 border-b-2 border-amber-500'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                }`}
              >
                {t.history}
              </button>
            </div>

            {/* 内容区域 */}
            <div className="flex-1 overflow-y-auto p-4">
              {activeTab === 'positions' ? renderPositions() : renderHistory()}
            </div>

            {/* 底部提示 */}
            <div className="p-4 border-t border-gray-200 dark:border-gray-700">
              <p className="text-center text-gray-500 dark:text-gray-400 text-sm">
                {language === 'zh'
                  ? '如需添加余额，请联系管理员'
                  : 'To add balance, please contact admin'}
              </p>
              <p className="text-center text-amber-600 dark:text-amber-400 text-sm font-medium mt-1">
                Telegram / Discord
              </p>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );

  // 使用 Portal 渲染到 document.body
  if (typeof document !== 'undefined') {
    return createPortal(panelContent, document.body);
  }

  return null;
}

export default PaperPortfolioPanel;
