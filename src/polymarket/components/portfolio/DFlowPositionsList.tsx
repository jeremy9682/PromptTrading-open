/**
 * DFlow Positions List Component
 *
 * Displays user's DFlow/Kalshi prediction market positions from Solana.
 * Styled to match Polymarket's PositionsList component.
 */

import React from 'react';
import { ExternalLink, TrendingUp } from 'lucide-react';
import { DFlowPosition } from '../../../services/dflow/dflowPortfolioService';
import { useAppStore } from '../../../contexts/useAppStore';
import { translations } from '../../../constants/translations';

interface DFlowPositionsListProps {
  positions: DFlowPosition[];
  onSellPosition?: (position: DFlowPosition) => void;
}

export function DFlowPositionsList({ positions, onSellPosition }: DFlowPositionsListProps) {
  const language = useAppStore((state) => state.language);
  const t = translations[language]?.polymarketPage?.portfolio || translations.en.polymarketPage.portfolio;

  if (positions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
        <div className="w-16 h-16 mb-4 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
          <TrendingUp className="w-8 h-8 text-gray-400" />
        </div>
        <p className="text-gray-600 dark:text-gray-400 font-medium mb-2">
          {language === 'zh' ? '暂无 Kalshi 持仓' : 'No Kalshi positions'}
        </p>
        <p className="text-sm text-gray-500 dark:text-gray-500">
          {language === 'zh' ? '通过 DFlow 交易 Kalshi 市场' : 'Trade Kalshi markets via DFlow'}
        </p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-gray-100 dark:divide-gray-800">
      {positions.map((position) => (
        <DFlowPositionCard
          key={position.tokenMint}
          position={position}
          onSell={onSellPosition}
          t={t}
          language={language}
        />
      ))}
    </div>
  );
}

interface DFlowPositionCardProps {
  position: DFlowPosition;
  onSell?: (position: DFlowPosition) => void;
  t: Record<string, string>;
  language: string;
}

function DFlowPositionCard({ position, onSell, t, language }: DFlowPositionCardProps) {
  // Use actual average cost from trade history, fallback to current price if unknown
  const avgCost = position.avgCost ?? position.currentPrice ?? 0;
  const currentPrice = position.currentPrice || 0;
  const hasTradeHistory = position.avgCost !== undefined;

  // Calculate PnL only if we have both avg cost and current price
  const pnl = hasTradeHistory ? position.balance * (currentPrice - avgCost) : 0;
  const pnlPercent = hasTradeHistory && avgCost > 0
    ? ((currentPrice - avgCost) / avgCost) * 100
    : 0;
  const isProfit = pnl >= 0;
  const pricePercent = currentPrice * 100;
  const totalValue = position.currentValue || position.balance * currentPrice;

  return (
    <div className="p-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
      {/* Title Row */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-medium text-gray-900 dark:text-white truncate pr-2">
            {position.eventTitle || position.marketTicker || 'Unknown Market'}
          </h3>
          <div className="flex items-center gap-2 mt-1">
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
              position.outcomeType === 'YES'
                ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
            }`}>
              {position.outcomeType}
            </span>
            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400">
              Kalshi
            </span>
          </div>
        </div>

        {/* PnL */}
        <div className="text-right">
          {hasTradeHistory ? (
            <>
              <p className={`text-sm font-semibold ${isProfit ? 'text-green-600' : 'text-red-600'}`}>
                {isProfit ? '+' : ''}{pnl.toFixed(2)} USDC
              </p>
              <p className={`text-xs ${isProfit ? 'text-green-500' : 'text-red-500'}`}>
                {isProfit ? '+' : ''}{pnlPercent.toFixed(1)}%
              </p>
            </>
          ) : (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {language === 'zh' ? '无历史' : 'No history'}
            </p>
          )}
        </div>
      </div>

      {/* Price Progress Bar */}
      <div className="mb-3">
        <div className="flex items-center justify-between text-xs mb-1">
          <span className="text-gray-500 dark:text-gray-400">{t.currentPrice || 'Current Price'}</span>
          <span className="font-medium text-gray-900 dark:text-white">
            {pricePercent.toFixed(1)}%
          </span>
        </div>
        <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${
              position.outcomeType === 'YES'
                ? 'bg-gradient-to-r from-green-400 to-green-500'
                : 'bg-gradient-to-r from-red-400 to-red-500'
            }`}
            style={{ width: `${Math.min(pricePercent, 100)}%` }}
          />
        </div>
      </div>

      {/* Detailed Data */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
        <div className="flex justify-between">
          <span className="text-gray-500 dark:text-gray-400">{t.quantity || 'Quantity'}</span>
          <span className="font-medium text-gray-900 dark:text-white">
            {position.balance.toFixed(2)} {t.shares || 'shares'}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500 dark:text-gray-400">{t.avgCost || 'Avg Cost'}</span>
          <span className="font-medium text-gray-900 dark:text-white">
            {hasTradeHistory ? `$${avgCost.toFixed(4)}` : '-'}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500 dark:text-gray-400">{t.currentPrice || 'Current Price'}</span>
          <span className="font-medium text-gray-900 dark:text-white">
            ${currentPrice.toFixed(4)}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500 dark:text-gray-400">{t.totalAssets || 'Total Assets'}</span>
          <span className="font-medium text-gray-900 dark:text-white">
            ${totalValue.toFixed(2)}
          </span>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="mt-3 flex gap-2">
        {onSell && (
          <button
            onClick={() => onSell(position)}
            className="flex-1 py-2 px-3 bg-red-500 hover:bg-red-600 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {t.sell || 'Sell'}
          </button>
        )}
        <a
          href={`https://solscan.io/token/${position.tokenMint}`}
          target="_blank"
          rel="noopener noreferrer"
          className="p-2 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
          title={language === 'zh' ? '在 Solscan 查看' : 'View on Solscan'}
        >
          <ExternalLink className="w-4 h-4" />
        </a>
      </div>
    </div>
  );
}

export default DFlowPositionsList;
