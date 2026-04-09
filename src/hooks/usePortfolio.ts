/**
 * Portfolio Hooks
 * 
 * 管理用户持仓、挂单、交易历史的数据获取
 * 
 * 重要：无需钱包签名即可查看数据
 * - 持仓：Data API（公开）
 * - 挂单：使用存储的 API 凭证（首次交易时创建）
 * - 取消订单：使用存储的 API 凭证
 */

import { useCallback, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSafeWallet } from '../contexts/SafeWalletContext';
import { useAuth } from '../contexts/AuthContext';
import { useAppStore } from '../contexts/useAppStore';
import {
  Position,
  OpenOrder,
  TradeHistoryItem,
  PortfolioSummary,
  fetchPositions,
  fetchOpenOrders,
  fetchTradeHistory,
  cancelOrder,
  cancelAllOrders,
  calculatePortfolioSummary,
} from '../services/polymarket/portfolioService';

// ============================================
// Constants
// ============================================

const REFRESH_INTERVAL = 3 * 60 * 1000; // 3分钟
const STALE_TIME = 60 * 1000; // 1分钟

// ============================================
// usePositions Hook
// 使用 Data API，无需任何凭证
// ============================================

export function usePositions(enabled: boolean = true) {
  const { safeAddress, isReady } = useSafeWallet();
  const isPaperTrading = useAppStore((state) => state.isPaperTrading);

  // 模拟盘模式下不获取实盘持仓
  const shouldFetch = enabled && !isPaperTrading;

  const query = useQuery({
    queryKey: ['positions', safeAddress],
    queryFn: () => {
      // 额外的安全检查，防止 refetch() 被直接调用时 safeAddress 为 null
      if (!safeAddress) {
        console.log('[usePositions] safeAddress is null, returning empty array');
        return Promise.resolve([]);
      }
      return fetchPositions(safeAddress);
    },
    enabled: shouldFetch && !!safeAddress && isReady,
    refetchInterval: shouldFetch ? REFRESH_INTERVAL : false,
    staleTime: STALE_TIME,
  });
  
  return {
    positions: query.data || [],
    isLoading: query.isLoading,
    isRefetching: query.isRefetching,
    error: query.error,
    refetch: query.refetch,
    lastUpdated: query.dataUpdatedAt ? new Date(query.dataUpdatedAt) : null,
  };
}

// ============================================
// useOpenOrders Hook
// 使用 ClobClient 获取挂单（需要 signer）
// ============================================

export function useOpenOrders(enabled: boolean = true) {
  const { safeAddress, isReady } = useSafeWallet();
  const { getAccessToken, walletAddress, getProvider } = useAuth();
  const isPaperTrading = useAppStore((state) => state.isPaperTrading);

  // 模拟盘模式下不获取实盘挂单
  const shouldFetch = enabled && !isPaperTrading;

  const query = useQuery({
    queryKey: ['openOrders', safeAddress],
    queryFn: async () => {
      // 1. 检查基本条件
      if (!safeAddress || !walletAddress || !getProvider) {
        return [];
      }

      // 2. 获取 access token
      const accessToken = await getAccessToken();
      if (!accessToken) {
        return [];
      }

      // 3. 获取存储的 API 凭证
      const { getStoredApiKey } = await import('../services/polymarket/polymarketAuthService');
      const storedCreds = await getStoredApiKey(accessToken, walletAddress);
      if (!storedCreds) {
        // 没有凭证 = 用户还没交易过，返回空数组
        console.log('[useOpenOrders] No stored credentials, user has not traded yet');
        return [];
      }

      // 4. 转换凭证格式（我们存储的是 apiKey/apiSecret，ClobClient 需要 key/secret）
      // 注意：secret 可能是 URL-safe base64，需要转换为标准 base64
      const convertUrlSafeBase64 = (urlSafe: string) => {
        // 将 URL-safe base64 转换为标准 base64
        let standard = urlSafe.replace(/-/g, '+').replace(/_/g, '/');
        // 添加 padding
        const paddingNeeded = (4 - (standard.length % 4)) % 4;
        standard += '='.repeat(paddingNeeded);
        return standard;
      };

      const credentials = {
        key: storedCreds.apiKey,
        secret: convertUrlSafeBase64(storedCreds.apiSecret),
        passphrase: storedCreds.passphrase,
      };

      // 5. 获取 provider 并创建 signer
      const { ethers: ethers5 } = await import('ethers5');
      const privyProvider = await getProvider();
      if (!privyProvider) {
        console.log('[useOpenOrders] Could not get provider');
        return [];
      }
      const web3Provider = new ethers5.providers.Web3Provider(privyProvider);
      const signer = web3Provider.getSigner();

      // 6. 调用 fetchOpenOrders
      return fetchOpenOrders(signer, safeAddress, credentials);
    },
    enabled: shouldFetch && !!safeAddress && !!walletAddress && isReady,
    refetchInterval: shouldFetch ? REFRESH_INTERVAL : false,
    staleTime: STALE_TIME,
  });

  return {
    openOrders: query.data || [],
    isLoading: query.isLoading,
    isRefetching: query.isRefetching,
    error: query.error,
    refetch: query.refetch,
    lastUpdated: query.dataUpdatedAt ? new Date(query.dataUpdatedAt) : null,
  };
}

// ============================================
// useTradeHistory Hook
// 从后端获取，无需 CLOB 凭证
// ============================================

export function useTradeHistory(enabled: boolean = true, limit: number = 50) {
  const { isReady } = useSafeWallet();
  const { getAccessToken, walletAddress } = useAuth();
  const isPaperTrading = useAppStore((state) => state.isPaperTrading);

  // 模拟盘模式下不获取实盘交易历史
  const shouldFetch = enabled && !isPaperTrading;

  const query = useQuery({
    queryKey: ['tradeHistory', walletAddress, limit],
    queryFn: async () => {
      const accessToken = await getAccessToken();
      if (!accessToken || !walletAddress) return [];
      return fetchTradeHistory(accessToken, walletAddress, limit);
    },
    enabled: shouldFetch && !!walletAddress && isReady,
    refetchInterval: shouldFetch ? REFRESH_INTERVAL : false,
    staleTime: STALE_TIME,
  });
  
  return {
    history: query.data || [],
    isLoading: query.isLoading,
    isRefetching: query.isRefetching,
    error: query.error,
    refetch: query.refetch,
    lastUpdated: query.dataUpdatedAt ? new Date(query.dataUpdatedAt) : null,
  };
}

// ============================================
// useCancelOrder Hook
// 需要 signer 来签名取消请求
// ============================================

export function useCancelOrder() {
  const queryClient = useQueryClient();
  const { safeAddress } = useSafeWallet();
  const { getAccessToken, walletAddress, getProvider } = useAuth();

  const mutation = useMutation({
    mutationFn: async (orderId: string) => {
      // 1. 检查基本条件
      if (!safeAddress || !walletAddress || !getProvider) {
        throw new Error('Missing authentication');
      }

      // 2. 获取 access token
      const accessToken = await getAccessToken();
      if (!accessToken) {
        throw new Error('Missing access token');
      }

      // 3. 获取存储的 API 凭证
      const { getStoredApiKey } = await import('../services/polymarket/polymarketAuthService');
      const storedCreds = await getStoredApiKey(accessToken, walletAddress);
      if (!storedCreds) {
        throw new Error('No stored API credentials');
      }

      // 4. 转换凭证格式
      const convertUrlSafeBase64 = (urlSafe: string) => {
        let standard = urlSafe.replace(/-/g, '+').replace(/_/g, '/');
        const paddingNeeded = (4 - (standard.length % 4)) % 4;
        standard += '='.repeat(paddingNeeded);
        return standard;
      };

      const credentials = {
        key: storedCreds.apiKey,
        secret: convertUrlSafeBase64(storedCreds.apiSecret),
        passphrase: storedCreds.passphrase,
      };

      // 5. 获取 provider 并创建 signer
      const { ethers: ethers5 } = await import('ethers5');
      const privyProvider = await getProvider();
      if (!privyProvider) {
        throw new Error('Could not get provider');
      }
      const web3Provider = new ethers5.providers.Web3Provider(privyProvider);
      const signer = web3Provider.getSigner();

      // 6. 调用 cancelOrder
      const success = await cancelOrder(signer, safeAddress, credentials, orderId);
      if (!success) {
        throw new Error('Failed to cancel order');
      }
      return orderId;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['openOrders'] });
    },
  });

  return {
    cancelOrder: mutation.mutate,
    cancelOrderAsync: mutation.mutateAsync,
    isLoading: mutation.isPending,
    error: mutation.error,
  };
}

// ============================================
// useCancelAllOrders Hook
// 需要 signer 来签名取消请求
// ============================================

export function useCancelAllOrders() {
  const queryClient = useQueryClient();
  const { safeAddress } = useSafeWallet();
  const { getAccessToken, walletAddress, getProvider } = useAuth();

  const mutation = useMutation({
    mutationFn: async () => {
      // 1. 检查基本条件
      if (!safeAddress || !walletAddress || !getProvider) {
        throw new Error('Missing authentication');
      }

      // 2. 获取 access token
      const accessToken = await getAccessToken();
      if (!accessToken) {
        throw new Error('Missing access token');
      }

      // 3. 获取存储的 API 凭证
      const { getStoredApiKey } = await import('../services/polymarket/polymarketAuthService');
      const storedCreds = await getStoredApiKey(accessToken, walletAddress);
      if (!storedCreds) {
        throw new Error('No stored API credentials');
      }

      // 4. 转换凭证格式
      const convertUrlSafeBase64 = (urlSafe: string) => {
        let standard = urlSafe.replace(/-/g, '+').replace(/_/g, '/');
        const paddingNeeded = (4 - (standard.length % 4)) % 4;
        standard += '='.repeat(paddingNeeded);
        return standard;
      };

      const credentials = {
        key: storedCreds.apiKey,
        secret: convertUrlSafeBase64(storedCreds.apiSecret),
        passphrase: storedCreds.passphrase,
      };

      // 5. 获取 provider 并创建 signer
      const { ethers: ethers5 } = await import('ethers5');
      const privyProvider = await getProvider();
      if (!privyProvider) {
        throw new Error('Could not get provider');
      }
      const web3Provider = new ethers5.providers.Web3Provider(privyProvider);
      const signer = web3Provider.getSigner();

      // 6. 调用 cancelAllOrders
      const success = await cancelAllOrders(signer, safeAddress, credentials);
      if (!success) {
        throw new Error('Failed to cancel all orders');
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['openOrders'] });
    },
  });

  return {
    cancelAllOrders: mutation.mutate,
    isLoading: mutation.isPending,
    error: mutation.error,
  };
}

// ============================================
// usePortfolioSummary Hook
// ============================================

export function usePortfolioSummary(enabled: boolean = true) {
  const { positions } = usePositions(enabled);
  const { openOrders } = useOpenOrders(enabled);
  const { usdcBalance } = useSafeWallet();
  
  const summary: PortfolioSummary = useMemo(() => 
    calculatePortfolioSummary(positions, openOrders, usdcBalance),
    [positions, openOrders, usdcBalance]
  );
  
  return summary;
}

// ============================================
// usePortfolio Hook (Combined)
// ============================================

export function usePortfolio(enabled: boolean = true) {
  const { safeAddress, isReady, usdcBalance, refreshBalance } = useSafeWallet();
  
  const positionsQuery = usePositions(enabled);
  const openOrdersQuery = useOpenOrders(enabled);
  const historyQuery = useTradeHistory(enabled);
  const summary = usePortfolioSummary(enabled);
  
  const refreshAll = useCallback(async () => {
    if (!enabled || !safeAddress || !isReady) {
      console.log('[usePortfolio] Skipping refresh - not ready', { enabled, safeAddress: !!safeAddress, isReady });
      return;
    }
    
    console.log('[usePortfolio] Refreshing all data...');
    
    await Promise.all([
      refreshBalance(),
      positionsQuery.refetch(),
      openOrdersQuery.refetch(),
      historyQuery.refetch(),
    ]);
    
    console.log('[usePortfolio] All data refreshed');
  }, [enabled, safeAddress, isReady, refreshBalance, positionsQuery, openOrdersQuery, historyQuery]);
  
  const lastUpdated = useMemo(() => {
    const dates = [
      positionsQuery.lastUpdated,
      openOrdersQuery.lastUpdated,
      historyQuery.lastUpdated,
    ].filter(Boolean) as Date[];
    
    if (dates.length === 0) return null;
    return dates.sort((a, b) => b.getTime() - a.getTime())[0];
  }, [positionsQuery.lastUpdated, openOrdersQuery.lastUpdated, historyQuery.lastUpdated]);
  
  return {
    // 数据
    positions: positionsQuery.positions,
    openOrders: openOrdersQuery.openOrders,
    history: historyQuery.history,
    summary,
    usdcBalance,
    
    // 状态
    isReady,
    isLoading: positionsQuery.isLoading || openOrdersQuery.isLoading,
    isRefetching: positionsQuery.isRefetching || openOrdersQuery.isRefetching,
    
    // 操作
    refreshAll,
    lastUpdated,
  };
}

export default usePortfolio;
