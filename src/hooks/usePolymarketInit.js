import { useEffect, useRef } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { usePolymarketStore } from '../contexts/usePolymarketStore';
import { useAppStore } from '../contexts/useAppStore';

/**
 * Hook to initialize Polymarket store with Privy authentication
 * Should be used in a component that wraps Polymarket pages
 */
export function usePolymarketInit() {
  const { authenticated, user, getAccessToken } = usePrivy();
  const initialize = usePolymarketStore(state => state.initialize);
  const clearAuth = usePolymarketStore(state => state.clearAuth);
  const isAuthenticated = usePolymarketStore(state => state.isAuthenticated);
  const isLoading = usePolymarketStore(state => state.isLoading);

  // Paper trading data loader
  const loadPaperAccountFromBackend = useAppStore(state => state.loadPaperAccountFromBackend);

  const initRef = useRef(false);

  useEffect(() => {
    const initStore = async () => {
      if (authenticated && user && !initRef.current) {
        initRef.current = true;

        try {
          // Get Privy access token
          const accessToken = await getAccessToken();

          // Get wallet address from user's linked accounts
          const walletAccount = user.linkedAccounts?.find(
            account => account.type === 'wallet'
          );
          const walletAddress = walletAccount?.address || null;

          console.log('🔄 Initializing Polymarket store...', {
            hasToken: !!accessToken,
            walletAddress
          });

          // Initialize the store with auth
          await initialize(accessToken, walletAddress);

          // 同时从数据库加载模拟盘账户数据
          console.log('🔄 Loading paper trading data from database...');
          await loadPaperAccountFromBackend(accessToken, walletAddress);

          console.log('✅ Polymarket store initialized');
        } catch (error) {
          console.error('❌ Failed to initialize Polymarket store:', error);
          initRef.current = false;
        }
      } else if (!authenticated && isAuthenticated) {
        // User logged out
        console.log('🚪 User logged out, clearing Polymarket auth');
        clearAuth();
        initRef.current = false;
      }
    };

    initStore();
  }, [authenticated, user, initialize, clearAuth, getAccessToken, isAuthenticated, loadPaperAccountFromBackend]);

  return { isLoading, isAuthenticated };
}

/**
 * Hook to get current auth info for API calls
 */
export function usePolymarketAuth() {
  const { authenticated, getAccessToken } = usePrivy();
  const walletAddress = usePolymarketStore(state => state.walletAddress);
  const isAuthenticated = usePolymarketStore(state => state.isAuthenticated);

  const getAuthInfo = async () => {
    if (!authenticated) {
      return { accessToken: null, walletAddress: null };
    }

    try {
      const accessToken = await getAccessToken();
      return { accessToken, walletAddress };
    } catch (error) {
      console.error('Failed to get auth info:', error);
      return { accessToken: null, walletAddress: null };
    }
  };

  return {
    isAuthenticated,
    walletAddress,
    getAuthInfo
  };
}
