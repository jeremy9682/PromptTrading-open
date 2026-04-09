/**
 * useDFlowPortfolio Hook
 * 
 * React hook for fetching and managing DFlow/Kalshi prediction market positions.
 * Uses the dflowPortfolioService to fetch Solana token positions.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { dflowPortfolioService, DFlowPosition, DFlowTradeHistoryItem, DFlowPortfolioSummary } from '../services/dflow/dflowPortfolioService';

// ============================================
// Types
// ============================================

export interface UseDFlowPortfolioResult {
  // Data
  positions: DFlowPosition[];
  tradeHistory: DFlowTradeHistoryItem[];
  summary: DFlowPortfolioSummary;
  
  // State
  isLoading: boolean;
  isRefetching: boolean;
  error: string | null;
  lastUpdated: Date | null;
  
  // Actions
  refreshPositions: () => Promise<void>;
  saveTradeToHistory: (trade: DFlowTradeHistoryItem) => void;
}

// ============================================
// Hook
// ============================================

export function useDFlowPortfolio(enabled: boolean = true): UseDFlowPortfolioResult {
  const { solanaWalletAddress, isSolanaWalletReady } = useAuth();
  
  const [positions, setPositions] = useState<DFlowPosition[]>([]);
  const [tradeHistory, setTradeHistory] = useState<DFlowTradeHistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefetching, setIsRefetching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  
  // Fetch positions
  const fetchPositions = useCallback(async (isRefetch = false) => {
    if (!enabled || !solanaWalletAddress || !isSolanaWalletReady) {
      return;
    }
    
    if (isRefetch) {
      setIsRefetching(true);
    } else {
      setIsLoading(true);
    }
    setError(null);
    
    try {
      // Use fetchPositionsWithCost to get positions enriched with average cost from trade history
      const fetchedPositions = await dflowPortfolioService.fetchPositionsWithCost(solanaWalletAddress);
      setPositions(fetchedPositions);

      // Also load trade history
      const history = dflowPortfolioService.getTradeHistory(solanaWalletAddress);
      setTradeHistory(history);

      setLastUpdated(new Date());
    } catch (err) {
      console.error('[useDFlowPortfolio] Error fetching positions:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch positions');
    } finally {
      setIsLoading(false);
      setIsRefetching(false);
    }
  }, [enabled, solanaWalletAddress, isSolanaWalletReady]);
  
  // Refresh positions
  const refreshPositions = useCallback(async () => {
    await fetchPositions(true);
  }, [fetchPositions]);
  
  // Save trade to history
  const saveTradeToHistory = useCallback((trade: DFlowTradeHistoryItem) => {
    if (!solanaWalletAddress) return;
    
    dflowPortfolioService.saveTradeToHistory(solanaWalletAddress, trade);
    
    // Update local state
    setTradeHistory(prev => [trade, ...prev].slice(0, 100));
  }, [solanaWalletAddress]);
  
  // Calculate summary
  const summary = useMemo<DFlowPortfolioSummary>(() => {
    const totalValue = positions.reduce((sum, pos) => sum + (pos.currentValue || 0), 0);
    
    return {
      totalValue,
      positionsCount: positions.length,
      lastUpdated,
    };
  }, [positions, lastUpdated]);
  
  // Fetch on mount and when wallet changes
  useEffect(() => {
    if (enabled && solanaWalletAddress && isSolanaWalletReady) {
      fetchPositions(false);
    }
  }, [enabled, solanaWalletAddress, isSolanaWalletReady, fetchPositions]);
  
  return {
    positions,
    tradeHistory,
    summary,
    isLoading,
    isRefetching,
    error,
    lastUpdated,
    refreshPositions,
    saveTradeToHistory,
  };
}

export default useDFlowPortfolio;

