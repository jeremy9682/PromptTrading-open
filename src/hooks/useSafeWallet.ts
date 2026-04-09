/**
 * Safe 钱包 Hook
 * 
 * 管理 Polymarket Safe 钱包的状态和自动初始化
 * 
 * 特点：
 * - 新用户注册时自动创建 Safe
 * - 提供统一的"交易账户"概念
 * - 隐藏 EOA 地址细节
 * - 余额和充值都围绕 Safe 地址
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useAppStore } from '../contexts/useAppStore';
import {
  getSafeInfo,
  getSafeUSDCBalance,
  deriveSafeAddressFromEOA,
  initializeTradingSession,
  clearRelayClient,
  type SafeInfo,
} from '../services/polymarket/polymarketSafeService';
// 使用 ethers v5 给 builder-relayer-client
import { ethers as ethers5 } from 'ethers5';

// Polygon RPC for balance checks
const POLYGON_RPC = import.meta.env.VITE_POLYGON_RPC_URL || 'https://polygon-rpc.com';

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
  
  // 操作
  initializeSafe: () => Promise<boolean>;
  refreshBalance: () => Promise<void>;
  getSigner: () => Promise<ethers5.Signer | null>;
  
  // 兼容性导出（用于需要 signer 的组件）
  signer: ethers5.Signer | null;
  
  // 是否在 Polymarket 模式
  isPolymarketMode: boolean;
}

export function useSafeWallet(): SafeWalletState {
  // Auth context
  const { authenticated, walletAddress, getProvider, getAccessToken, walletsReady } = useAuth();
  
  // Trading mode
  const tradingMode = useAppStore((state) => state.tradingMode);
  const hasHydrated = useAppStore((state) => state._hasHydrated);
  
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
  
  // Signer (用于 Safe 转账)
  const [signer, setSigner] = useState<ethers5.Signer | null>(null);
  
  // 防止重复初始化
  const initAttemptedRef = useRef(false);
  const autoInitRef = useRef(false);
  
  const isPolymarketMode = tradingMode === 'polymarket';
  const isReady = isDeployed && approvalsSet;

  /**
   * 获取 Signer（用于 Safe 转账）
   */
  const getSigner = useCallback(async (): Promise<ethers5.Signer | null> => {
    if (!authenticated || !getProvider) {
      return null;
    }

    try {
      const privyProvider = await getProvider();
      if (!privyProvider) {
        return null;
      }

      const web3Provider = new ethers5.providers.Web3Provider(privyProvider);
      const newSigner = web3Provider.getSigner();
      setSigner(newSigner);
      return newSigner;
    } catch (err) {
      console.error('[useSafeWallet] Failed to get signer:', err);
      return null;
    }
  }, [authenticated, getProvider]);

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
      console.error('[useSafeWallet] Failed to fetch balance:', err);
    } finally {
      setLoadingBalance(false);
    }
  }, []);

  /**
   * 刷新余额
   */
  const refreshBalance = useCallback(async () => {
    if (safeAddress) {
      await fetchSafeBalance(safeAddress);
    }
  }, [safeAddress, fetchSafeBalance]);

  /**
   * 初始化 Safe 钱包
   */
  const initializeSafe = useCallback(async (): Promise<boolean> => {
    if (!authenticated || !walletAddress || !getProvider || !getAccessToken || !walletsReady) {
      console.log('[useSafeWallet] Cannot initialize: missing auth or wallets not ready');
      return false;
    }

    // 已经初始化
    if (isReady && safeAddress) {
      console.log('[useSafeWallet] Safe already ready');
      return true;
    }

    // 防止重复初始化
    if (isInitializing) {
      console.log('[useSafeWallet] Already initializing');
      return false;
    }

    setIsInitializing(true);
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
        
        console.log('[useSafeWallet] Safe initialized:', result.safeAddress);
        return true;
      } else {
        setInitError(result.error || '初始化失败');
        return false;
      }
    } catch (err) {
      console.error('[useSafeWallet] Initialize failed:', err);
      setInitError(err instanceof Error ? err.message : '初始化失败');
      return false;
    } finally {
      setIsInitializing(false);
      setInitProgress('');
    }
  }, [
    authenticated,
    walletAddress,
    getProvider,
    getAccessToken,
    isReady,
    safeAddress,
    isInitializing,
    fetchSafeBalance,
    walletsReady,
  ]);

  /**
   * 加载 Safe 状态（从后端）
   */
  useEffect(() => {
    const loadSafeStatus = async () => {
      // 必须等待钱包完全准备好
      if (!authenticated || !walletAddress || !isPolymarketMode || !hasHydrated || !walletsReady) {
        return;
      }

      try {
        const accessToken = await getAccessToken?.();
        if (!accessToken) return;

        const safeInfo = await getSafeInfo(accessToken);
        
        if (safeInfo && safeInfo.safeAddress) {
          // 使用后端存储的实际钱包地址（这是 RelayClient 部署时返回的地址）
          // 注意：使用 PROXY 类型时，实际部署的地址可能与 deriveSafe 派生的地址不同
          setSafeAddress(safeInfo.safeAddress);

          // 确保数据一致性：如果未部署，授权状态也应为 false
          const deployed = safeInfo.isDeployed;
          const approvals = deployed ? safeInfo.approvalsSet : false;
          setIsDeployed(deployed);
          setApprovalsSet(approvals);
          setUsdcBalance(safeInfo.usdcBalance || 0);

          console.log('[useSafeWallet] Loaded wallet status:', {
            walletAddress: safeInfo.safeAddress,
            isDeployed: deployed,
            approvalsSet: approvals,
            balance: safeInfo.usdcBalance,
          });
        } else if (walletAddress) {
          // 如果后端没有记录，先派生 SAFE 钱包地址
          // deploy() 使用 SAFE-CREATE 类型，地址由 deriveSafe() 派生
          const derivedAddress = deriveSafeAddressFromEOA(walletAddress);
          setSafeAddress(derivedAddress);

          console.log('[useSafeWallet] Derived SAFE wallet address:', derivedAddress);

          // 自动初始化（新用户）
          if (!autoInitRef.current && !initAttemptedRef.current) {
            autoInitRef.current = true;
            console.log('[useSafeWallet] Auto-initializing for new user...');
            // 延迟一点执行，确保 UI 已渲染
            setTimeout(() => {
              initializeSafe();
            }, 1000);
          }
        }
      } catch (err) {
        console.error('[useSafeWallet] Failed to load Safe status:', err);

        // 即使失败，也尝试派生 SAFE 地址
        if (walletAddress) {
          try {
            const derivedAddress = deriveSafeAddressFromEOA(walletAddress);
            setSafeAddress(derivedAddress);
          } catch (deriveErr) {
            console.error('[useSafeWallet] Failed to derive SAFE address:', deriveErr);
          }
        }
      }
    };

    loadSafeStatus();
  }, [authenticated, walletAddress, isPolymarketMode, hasHydrated, getAccessToken, walletsReady]);

  /**
   * 定期刷新余额（Polymarket 模式）
   */
  useEffect(() => {
    if (!safeAddress || !isPolymarketMode || !isReady) return;

    // 初始加载
    fetchSafeBalance(safeAddress);

    // 每 30 秒刷新一次
    const interval = setInterval(() => {
      fetchSafeBalance(safeAddress);
    }, 30000);

    return () => clearInterval(interval);
  }, [safeAddress, isPolymarketMode, isReady, fetchSafeBalance]);

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
      autoInitRef.current = false;
      clearRelayClient();
    }
  }, [authenticated]);

  return {
    safeAddress,
    isDeployed,
    approvalsSet,
    isReady,
    usdcBalance,
    loadingBalance,
    isInitializing,
    initProgress,
    initError,
    initializeSafe,
    refreshBalance,
    getSigner,
    signer,
    isPolymarketMode,
  };
}

export default useSafeWallet;

