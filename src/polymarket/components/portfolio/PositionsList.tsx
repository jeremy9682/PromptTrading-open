/**
 * Positions List Component
 */

import React from 'react';
import { TrendingUp, TrendingDown, ExternalLink } from 'lucide-react';
import { Position } from '../../../services/polymarket/portfolioService';
import { translations } from '../../../constants/translations';
import { useAppStore } from '../../../contexts/useAppStore';

interface PositionsListProps {
  positions: Position[];
  onSellPosition?: (position: Position) => void;
}

export function PositionsList({ positions, onSellPosition }: PositionsListProps) {
  const language = useAppStore((state) => state.language);
  const t = translations[language]?.polymarketPage?.portfolio || translations.en.polymarketPage.portfolio;
  
  if (positions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
        <div className="w-16 h-16 mb-4 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
          <TrendingUp className="w-8 h-8 text-gray-400" />
        </div>
        <p className="text-gray-600 dark:text-gray-400 font-medium mb-2">{t.noPositions}</p>
        <p className="text-sm text-gray-500 dark:text-gray-500">
          {t.noPositionsDesc}
        </p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-gray-100 dark:divide-gray-800">
      {positions.map((position) => (
        <PositionCard 
          key={position.id} 
          position={position} 
          onSell={onSellPosition}
          t={t}
        />
      ))}
    </div>
  );
}

// ============================================
// Position Card Component
// ============================================

interface PositionCardProps {
  position: Position;
  onSell?: (position: Position) => void;
  t: Record<string, string>;
}

function PositionCard({ position, onSell, t }: PositionCardProps) {
  const isProfit = position.pnl >= 0;
  const pricePercent = position.currentPrice * 100;

  return (
    <div className="p-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
      {/* Title Row */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-medium text-gray-900 dark:text-white truncate pr-2">
            {position.title}
          </h3>
          <div className="flex items-center gap-2 mt-1">
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
              position.outcome === 'Yes'
                ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
            }`}>
              {position.outcome}
            </span>
          </div>
        </div>
        
        {/* PnL */}
        <div className="text-right">
          <p className={`text-sm font-semibold ${isProfit ? 'text-green-600' : 'text-red-600'}`}>
            {isProfit ? '+' : ''}{position.pnl.toFixed(2)} USDC
          </p>
          <p className={`text-xs ${isProfit ? 'text-green-500' : 'text-red-500'}`}>
            {isProfit ? '+' : ''}{position.pnlPercent.toFixed(1)}%
          </p>
        </div>
      </div>

      {/* Price Progress Bar */}
      <div className="mb-3">
        <div className="flex items-center justify-between text-xs mb-1">
          <span className="text-gray-500 dark:text-gray-400">{t.currentPrice}</span>
          <span className="font-medium text-gray-900 dark:text-white">
            {pricePercent.toFixed(1)}%
          </span>
        </div>
        <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${
              position.outcome === 'Yes' 
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
          <span className="text-gray-500 dark:text-gray-400">{t.quantity}</span>
          <span className="font-medium text-gray-900 dark:text-white">
            {position.size.toFixed(2)} {t.shares}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500 dark:text-gray-400">{t.avgCost}</span>
          <span className="font-medium text-gray-900 dark:text-white">
            ${position.avgPrice.toFixed(4)}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500 dark:text-gray-400">{t.currentPrice}</span>
          <span className="font-medium text-gray-900 dark:text-white">
            ${position.currentPrice.toFixed(4)}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500 dark:text-gray-400">{t.totalAssets}</span>
          <span className="font-medium text-gray-900 dark:text-white">
            ${position.value.toFixed(2)}
          </span>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="mt-3 flex gap-2">
        <button 
          onClick={() => onSell?.(position)}
          className="flex-1 py-2 px-3 bg-red-500 hover:bg-red-600 text-white text-sm font-medium rounded-lg transition-colors"
        >
          {t.sell}
        </button>
        {position.marketSlug && (
          <a
            href={`https://polymarket.com/event/${position.marketSlug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="p-2 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
            title={t.viewMarket}
          >
            <ExternalLink className="w-4 h-4" />
          </a>
        )}
      </div>
    </div>
  );
}

export default PositionsList;

