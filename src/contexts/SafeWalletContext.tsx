/**
 * Safe 钱包全局 Context
 * 
 * 方案 A: 只使用 Embedded Wallet 进行交易
 * 
 * 设计原则：
 * - Safe 地址从 Privy 嵌入式钱包派生（唯一且固定）
 * - 一个用户 = 一个嵌入式钱包 = 一个 Safe
 * - 外部钱包（MetaMask 等）只用于登录，不用于交易
 * 
 * 功能：
 * - 用户登录后自动初始化 Safe 钱包
 * - 全局共享 Safe 状态
 * - 用户无需手动初始化，像 Polymarket 一样直接使用
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from './AuthContext';
import { useAppStore } from './useAppStore';
import {
  getSafeInfo,
  getSafeUSDCBalance,
  deriveSafeAddressFromEOA,
  initializeTradingSession,
  clearRelayClient,
  saveSafeAddress,
} from '../services/polymarket/polymarketSafeService';
// API 凭证将在每次交易时动态创建（像官方示例一样）
import { ethers as ethers5 } from 'ethers5';

// ============================================
// Types
// ============================================

export interface SafeWalletState {
  // Safe 状态
  safeAddress: string | null;
  isDeployed: boolean;
  approvalsSet: boolean;
  isReady: boolean;
  
  // 余额
  usdcBalance: number;
  loadingBalance: boolean;
  
  // 初始化
  isInitializing: boolean;
  initProgress: string;
  initError: string | null;
  
  // 是否在 Polymarket 模式
  isPolymarketMode: boolean;
  
  // 操作
  initializeSafe: () => Promise<boolean>;
  refreshBalance: () => Promise<number>;
}

const defaultState: SafeWalletState = {
  safeAddress: null,
  isDeployed: false,
  approvalsSet: false,
  isReady: false,
  usdcBalance: 0,
  loadingBalance: false,
  isInitializing: false,
  initProgress: '',
  initError: null,
  isPolymarketMode: false,
  initializeSafe: async () => false,
  refreshBalance: async () => 0,
};

// ============================================
// Context
// ============================================

const SafeWalletContext = createContext<SafeWalletState>(defaultState);

export function useSafeWallet(): SafeWalletState {
  return useContext(SafeWalletContext);
}

// ============================================
// Provider
// ============================================

export function SafeWalletProvider({ children }: { children: React.ReactNode }) {
  // Auth context
  // 方案 A: 使用 embeddedWalletAddress（嵌入式钱包地址）派生 Safe
  // 这确保每个用户只有一个固定的 Safe 地址
  const { authenticated, embeddedWalletAddress, getProvider, getAccessToken, walletsReady } = useAuth();
  
  // Trading mode
  const tradingMode = useAppStore((state) => state.tradingMode);
  const hasHydrated = useAppStore((state) => state._hasHydrated);
  const isPaperTrading = useAppStore((state) => state.isPaperTrading);
  
  // Safe 状态
  const [safeAddress, setSafeAddress] = useState<string | null>(null);
  const [isDeployed, setIsDeployed] = useState(false);
  const [approvalsSet, setApprovalsSet] = useState(false);
  
  // 余额
  const [usdcBalance, setUsdcBalance] = useState(0);
  const [loadingBalance, setLoadingBalance] = useState(false);
  
  // 初始化状态
  const [isInitializing, setIsInitializing] = useState(false);
  const [initProgress, setInitProgress] = useState('');
  const [initError, setInitError] = useState<string | null>(null);
  
  // 防止重复初始化
  const initAttemptedRef = useRef(false);
  const autoInitInProgressRef = useRef(false);

  // 存储 initializeSafe 的 ref，避免 useEffect 依赖导致无限循环
  const initializeSafeRef = useRef<(() => Promise<boolean>) | null>(null);

  // 跟踪 embedded wallet 地址稳定性
  const lastEmbeddedAddressRef = useRef<string | null>(null);
  const walletStableTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [isWalletStable, setIsWalletStable] = useState(false);
  
  const isPolymarketMode = tradingMode === 'polymarket';
  const isReady = isDeployed && approvalsSet;

  /**
   * 获取 Safe USDC 余额
   */
  const fetchSafeBalance = useCallback(async (address: string) => {
    if (!address) return;
    
    setLoadingBalance(true);
    try {
      const balance = await getSafeUSDCBalance(address);
      setUsdcBalance(balance);
    } catch (err) {
      console.error('[SafeWalletContext] Failed to fetch balance:', err);
    } finally {
      setLoadingBalance(false);
    }
  }, []);

  /**
   * 刷新余额，返回最新余额值
   */
  const refreshBalance = useCallback(async (): Promise<number> => {
    if (safeAddress) {
      setLoadingBalance(true);
      try {
        const balance = await getSafeUSDCBalance(safeAddress);
        setUsdcBalance(balance);
        return balance;
      } catch (err) {
        console.error('[SafeWalletContext] Failed to refresh balance:', err);
        return usdcBalance; // 返回当前值
      } finally {
        setLoadingBalance(false);
      }
    }
    return 0;
  }, [safeAddress, usdcBalance]);

  /**
   * 初始化 Safe 钱包
   */
  const initializeSafe = useCallback(async (): Promise<boolean> => {
    if (!authenticated || !embeddedWalletAddress || !getProvider || !getAccessToken) {
      console.log('[SafeWalletContext] Cannot initialize: missing auth or embedded wallet');
      return false;
    }

    // 已经初始化
    if (isReady && safeAddress) {
      console.log('[SafeWalletContext] Safe already ready');
      return true;
    }

    // 防止重复初始化
    if (isInitializing || autoInitInProgressRef.current) {
      console.log('[SafeWalletContext] Already initializing');
      return false;
    }

    setIsInitializing(true);
    autoInitInProgressRef.current = true;
    setInitError(null);
    initAttemptedRef.current = true;

    try {
      setInitProgress('正在获取钱包...');
      
      const accessToken = await getAccessToken();
      if (!accessToken) {
        throw new Error('无法获取访问令牌');
      }

      const privyProvider = await getProvider();
      if (!privyProvider) {
        throw new Error('无法获取钱包 Provider');
      }

      // 使用 ethers v5 创建 signer
      const web3Provider = new ethers5.providers.Web3Provider(privyProvider);
      const signer = web3Provider.getSigner();

      setInitProgress('正在初始化交易账户...');

      const result = await initializeTradingSession(signer, accessToken, setInitProgress);

      if (result.success && result.safeAddress) {
        setSafeAddress(result.safeAddress);
        setIsDeployed(true);
        setApprovalsSet(true);
        
        // 刷新余额
        await fetchSafeBalance(result.safeAddress);
        
        // API 凭证将在每次交易时动态创建（像官方示例一样）
        console.log('[SafeWalletContext] ✅ Safe initialized:', result.safeAddress);
        return true;
      } else {
        setInitError(result.error || '初始化失败');
        return false;
      }
    } catch (err) {
      console.error('[SafeWalletContext] Initialize failed:', err);
      setInitError(err instanceof Error ? err.message : '初始化失败');
      return false;
    } finally {
      setIsInitializing(false);
      autoInitInProgressRef.current = false;
      setInitProgress('');
    }
  }, [
    authenticated,
    embeddedWalletAddress,
    getProvider,
    getAccessToken,
    isReady,
    safeAddress,
    isInitializing,
    fetchSafeBalance,
  ]);

  // 更新 ref，供 useEffect 使用（避免依赖循环）
  initializeSafeRef.current = initializeSafe;

  /**
   * 检测 embedded wallet 地址是否稳定
   * 等待地址不再变化后（300ms）才标记为稳定
   * 这避免了钱包加载过程中地址变化导致的问题
   */
  useEffect(() => {
    // 清除之前的定时器
    if (walletStableTimerRef.current) {
      clearTimeout(walletStableTimerRef.current);
      walletStableTimerRef.current = null;
    }

    // 如果没有地址或钱包未准备好，重置稳定状态
    if (!embeddedWalletAddress || !walletsReady) {
      setIsWalletStable(false);
      lastEmbeddedAddressRef.current = null;
      return;
    }

    // 如果地址变化了，重置稳定状态
    if (lastEmbeddedAddressRef.current !== embeddedWalletAddress) {
      setIsWalletStable(false);
      lastEmbeddedAddressRef.current = embeddedWalletAddress;

      // 设置定时器，300ms 后如果地址没有再变化，标记为稳定
      walletStableTimerRef.current = setTimeout(() => {
        if (lastEmbeddedAddressRef.current === embeddedWalletAddress) {
          console.log('[SafeWalletContext] 📍 Embedded wallet address stabilized:', embeddedWalletAddress);
          setIsWalletStable(true);
        }
      }, 300);
    }

    return () => {
      if (walletStableTimerRef.current) {
        clearTimeout(walletStableTimerRef.current);
      }
    };
  }, [embeddedWalletAddress, walletsReady]);

  /**
   * 自动加载和初始化 Safe
   * 方案 A: 使用嵌入式钱包地址派生 Safe
   * - 用户登录 + Polymarket 模式 = 自动检查并初始化
   */
  useEffect(() => {
    const autoInitSafe = async () => {
      // 前置条件检查（必须有嵌入式钱包且钱包已准备好且地址已稳定）
      if (!authenticated || !embeddedWalletAddress || !isPolymarketMode || !hasHydrated || !walletsReady || !isWalletStable) {
        return;
      }

      // 已经在初始化中
      if (autoInitInProgressRef.current || isInitializing) {
        return;
      }

      // 已经准备好了
      if (isReady && safeAddress) {
        return;
      }

      console.log('[SafeWalletContext] 🔄 Checking Safe status...');

      try {
        const accessToken = await getAccessToken?.();
        if (!accessToken) {
          console.log('[SafeWalletContext] No access token, will retry...');
          return;
        }

        // 1. 派生 SAFE 钱包地址（用于比较/日志）
        // deploy() 使用 SAFE-CREATE 类型，地址由 deriveSafe() 派生
        const derivedSafeAddress = deriveSafeAddressFromEOA(embeddedWalletAddress);
        console.log('[SafeWalletContext] 📍 Derived SAFE wallet from embedded wallet:', derivedSafeAddress);
        console.log('[SafeWalletContext] 📍 Embedded wallet address:', embeddedWalletAddress);
        
        // 2. 从后端获取钱包状态
        const safeInfo = await getSafeInfo(accessToken);

        if (safeInfo && safeInfo.safeAddress) {
          // 使用后端存储的实际钱包地址（这是 RelayClient 部署时返回的地址）
          // 验证后端地址与派生的 SAFE 地址是否一致
          if (safeInfo.safeAddress.toLowerCase() !== derivedSafeAddress.toLowerCase()) {
            // 如果不一致，可能是数据问题，记录警告
            console.warn('[SafeWalletContext] ⚠️ Backend address differs from derived SAFE address');
            console.log('[SafeWalletContext] Backend address:', safeInfo.safeAddress);
            console.log('[SafeWalletContext] Derived SAFE address:', derivedSafeAddress);
          } else {
            console.log('[SafeWalletContext] ✅ Backend address matches derived SAFE address');
          }

          // 使用后端返回的地址（这是正确的已部署钱包地址）
          setSafeAddress(safeInfo.safeAddress);
          const deployed = safeInfo.isDeployed;
          const approvals = deployed ? safeInfo.approvalsSet : false;
          setIsDeployed(deployed);
          setApprovalsSet(approvals);
          setUsdcBalance(safeInfo.usdcBalance || 0);
          
          console.log('[SafeWalletContext] 📋 Loaded Safe status:', {
            address: safeInfo.safeAddress,
            isDeployed: deployed,
            approvalsSet: approvals,
            balance: safeInfo.usdcBalance,
          });
          
          // 如果已部署且已授权，无需初始化
          if (deployed && approvals) {
            console.log('[SafeWalletContext] ✅ Safe already ready!');
            // API 凭证将在每次交易时动态创建（像官方示例一样）
            return;
          }
          
          // 需要初始化
          if (!initAttemptedRef.current) {
            console.log('[SafeWalletContext] 🚀 Auto-initializing Safe...');
            initializeSafeRef.current?.();
          }
        } else {
          // 后端没有记录，从嵌入式钱包派生 SAFE 地址并自动初始化
          // deploy() 使用 SAFE-CREATE 类型，地址由 deriveSafe() 派生
          const derivedAddress = deriveSafeAddressFromEOA(embeddedWalletAddress);
          setSafeAddress(derivedAddress);
          console.log('[SafeWalletContext] 📍 Derived SAFE wallet from embedded wallet:', derivedAddress);

          // 自动初始化（新用户）
          if (!initAttemptedRef.current) {
            console.log('[SafeWalletContext] 🚀 Auto-initializing for new user...');
            // 延迟执行，确保状态已更新
            setTimeout(() => {
              initializeSafeRef.current?.();
            }, 500);
          }
        }
      } catch (err) {
        console.error('[SafeWalletContext] Auto-init error:', err);

        // 即使失败，也从嵌入式钱包派生 SAFE 地址
        if (embeddedWalletAddress) {
          try {
            const derivedAddress = deriveSafeAddressFromEOA(embeddedWalletAddress);
            setSafeAddress(derivedAddress);
          } catch (deriveErr) {
            console.error('[SafeWalletContext] Failed to derive SAFE address:', deriveErr);
          }
        }
      }
    };

    autoInitSafe();
    // 注意：initializeSafe 通过 ref 调用，避免依赖循环
  }, [authenticated, embeddedWalletAddress, isPolymarketMode, hasHydrated, getAccessToken, isReady, safeAddress, isInitializing, walletsReady, isWalletStable]);

  /**
   * 定期刷新余额
   * 注意：模拟盘模式下不刷新实盘余额，节省 API 调用
   */
  useEffect(() => {
    // 模拟盘模式下跳过实盘余额刷新
    if (!safeAddress || !isPolymarketMode || !isReady || isPaperTrading) return;

    // 初始加载
    fetchSafeBalance(safeAddress);

    // 每 30 秒刷新
    const interval = setInterval(() => {
      fetchSafeBalance(safeAddress);
    }, 30000);

    return () => clearInterval(interval);
  }, [safeAddress, isPolymarketMode, isReady, isPaperTrading, fetchSafeBalance]);

  /**
   * 用户登出时清除状态
   */
  useEffect(() => {
    if (!authenticated) {
      setSafeAddress(null);
      setIsDeployed(false);
      setApprovalsSet(false);
      setUsdcBalance(0);
      setInitError(null);
      initAttemptedRef.current = false;
      autoInitInProgressRef.current = false;
      // 清除钱包稳定性跟踪
      setIsWalletStable(false);
      lastEmbeddedAddressRef.current = null;
      if (walletStableTimerRef.current) {
        clearTimeout(walletStableTimerRef.current);
        walletStableTimerRef.current = null;
      }
      clearRelayClient();
    }
  }, [authenticated]);

  const value: SafeWalletState = {
    safeAddress,
    isDeployed,
    approvalsSet,
    isReady,
    usdcBalance,
    loadingBalance,
    isInitializing,
    initProgress,
    initError,
    isPolymarketMode,
    initializeSafe,
    refreshBalance,
  };

  return (
    <SafeWalletContext.Provider value={value}>
      {children}
    </SafeWalletContext.Provider>
  );
}

export default SafeWalletContext;

