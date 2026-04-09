/**
 * Portfolio Button Component
 *
 * 导航栏入口按钮，点击打开 Portfolio 侧边面板
 * 放置在 UserMenu 左侧
 */

import React, { useState, useEffect, useRef } from 'react';
import { Briefcase } from 'lucide-react';
import { usePrivy } from '@privy-io/react-auth';
import { useSafeWallet } from '../../../contexts/SafeWalletContext';
import { useAppStore } from '../../../contexts/useAppStore';
import { PortfolioPanel } from './PortfolioPanel';
import { paperTradingAPI } from '../../../utils/api';

interface PortfolioButtonProps {
  language?: 'zh' | 'en';
}

export function PortfolioButton({ language = 'zh' }: PortfolioButtonProps) {
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const { isReady, usdcBalance } = useSafeWallet();
  const { authenticated, user, getAccessToken } = usePrivy();
  const tradingMode = useAppStore((state) => state.tradingMode);
  const isPaperTrading = useAppStore((state) => state.isPaperTrading);
  const paperBalance = useAppStore((state) => state.paperBalance);
  const paperPositions = useAppStore((state) => state.paperPositions);

  // 跟踪是否已加载数据，避免重复请求
  const hasLoadedRef = useRef(false);

  // 在模拟盘模式下，自动从后端加载数据
  useEffect(() => {
    const loadPaperTradingData = async () => {
      if (!isPaperTrading || !authenticated || !user?.wallet?.address || hasLoadedRef.current) {
        return;
      }

      try {
        const accessToken = await getAccessToken();
        if (!accessToken) return;

        const response = await paperTradingAPI.getAccount(accessToken, user.wallet.address);

        if (response.success && response.data) {
          const { balance, positions, trades } = response.data;
          const { setPaperBalance, setPaperPositions, setPaperTradeHistory } = useAppStore.getState();

          if (balance !== undefined) setPaperBalance(balance);
          if (positions) setPaperPositions(positions);
          if (trades) setPaperTradeHistory(trades);

          hasLoadedRef.current = true;
          console.log('[PortfolioButton] ✅ Loaded paper trading data:', { balance, positions: positions?.length });
        }
      } catch (err) {
        console.warn('[PortfolioButton] Failed to load paper trading data:', err);
      }
    };

    loadPaperTradingData();
  }, [isPaperTrading, authenticated, user?.wallet?.address, getAccessToken]);

  // 当切换到模拟盘模式或用户变化时，重置加载状态
  useEffect(() => {
    hasLoadedRef.current = false;
  }, [user?.wallet?.address, isPaperTrading]);

  // 仅在 Polymarket 模式下显示
  if (tradingMode !== 'polymarket') {
    return null;
  }

  // 计算模拟盘总资产 (余额 + 持仓价值)
  const paperPositionValue = paperPositions.reduce((sum, pos) => {
    const size = parseFloat(String(pos.size)) || 0;
    const entryPrice = parseFloat(String(pos.entryPrice)) || 0;
    return sum + (size * entryPrice);
  }, 0);
  const paperTotalAssets = paperBalance + paperPositionValue;

  // 根据模式选择显示的余额 (模拟盘显示总资产，实盘显示可用余额)
  const displayBalance = isPaperTrading ? paperTotalAssets : usdcBalance;
  const showBalance = isPaperTrading ? paperTotalAssets > 0 : (isReady && usdcBalance > 0);

  return (
    <>
      {/* Portfolio 按钮 */}
      <button
        onClick={() => setIsPanelOpen(true)}
        className={`flex items-center gap-2 px-3 py-1.5 ${
          isPaperTrading
            ? 'bg-amber-50 dark:bg-amber-900/20 hover:bg-amber-100 dark:hover:bg-amber-900/30 border-amber-200 dark:border-amber-700'
            : 'bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 border-gray-200 dark:border-gray-700'
        } border rounded-lg transition-all group`}
        title={language === 'zh' ? '我的账户' : 'My Portfolio'}
      >
        <Briefcase className={`w-4 h-4 ${
          isPaperTrading
            ? 'text-amber-600 dark:text-amber-400'
            : 'text-gray-600 dark:text-gray-400 group-hover:text-blue-500'
        } transition-colors`} />
        <span className={`hidden sm:inline text-sm font-medium ${
          isPaperTrading
            ? 'text-amber-700 dark:text-amber-300'
            : 'text-gray-700 dark:text-gray-300 group-hover:text-gray-900 dark:group-hover:text-white'
        } transition-colors`}>
          {language === 'zh' ? 'Portfolio' : 'Portfolio'}
        </span>
        {showBalance && (
          <span className={`hidden md:inline text-xs px-1.5 py-0.5 rounded-full font-medium ${
            isPaperTrading
              ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'
              : 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
          }`}>
            ${displayBalance.toFixed(0)}
          </span>
        )}
      </button>

      {/* Portfolio 侧边面板 */}
      <PortfolioPanel isOpen={isPanelOpen} onClose={() => setIsPanelOpen(false)} />
    </>
  );
}

export default PortfolioButton;


















