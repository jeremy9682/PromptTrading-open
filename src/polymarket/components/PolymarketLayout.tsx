import { useEffect, useRef } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { usePolymarketStore } from '../../contexts/usePolymarketStore';
import { Loader2 } from 'lucide-react';
import { QuotaAlertDialog } from './QuotaAlertDialog';

const DEMO_MODE = !import.meta.env.VITE_PRIVY_APP_ID;

interface PolymarketLayoutProps {
  children: React.ReactNode;
}

/**
 * Polymarket 布局组件
 * 处理用户认证和数据初始化
 */
export function PolymarketLayout({ children }: PolymarketLayoutProps) {
  // Demo mode: skip Privy auth, render children directly
  if (DEMO_MODE) {
    return <>{children}<QuotaAlertDialog /></>;
  }

  return <PolymarketLayoutAuth>{children}</PolymarketLayoutAuth>;
}

function PolymarketLayoutAuth({ children }: PolymarketLayoutProps) {
  const { authenticated, user, ready, getAccessToken } = usePrivy();
  const initialize = usePolymarketStore(state => state.initialize);
  const clearAuth = usePolymarketStore(state => state.clearAuth);
  const isLoading = usePolymarketStore(state => state.isLoading);
  const storeAuthenticated = usePolymarketStore(state => state.isAuthenticated);
  const lastSyncTime = usePolymarketStore(state => state.lastSyncTime);

  const initRef = useRef(false);
  const userIdRef = useRef<string | null>(null);

  useEffect(() => {
    const initStore = async () => {
      // Wait for Privy to be ready
      if (!ready) return;

      // If user is authenticated and we haven't initialized yet (or user changed)
      if (authenticated && user && (!initRef.current || userIdRef.current !== user.id)) {
        initRef.current = true;
        userIdRef.current = user.id;

        try {
          // Get Privy access token
          const accessToken = await getAccessToken();

          // Get wallet address from user's linked accounts
          const walletAccount = user.linkedAccounts?.find(
            (account: any) => account.type === 'wallet'
          );
          const walletAddress = walletAccount?.address || null;

          console.log('🔄 Initializing Polymarket store...', {
            hasToken: !!accessToken,
            walletAddress,
            userId: user.id
          });

          // Initialize the store with auth
          await initialize(accessToken, walletAddress);

          console.log('✅ Polymarket store initialized');
        } catch (error) {
          console.error('❌ Failed to initialize Polymarket store:', error);
          initRef.current = false;
        }
      } else if (!authenticated && storeAuthenticated) {
        // User logged out
        console.log('🚪 User logged out, clearing Polymarket auth');
        clearAuth();
        initRef.current = false;
        userIdRef.current = null;
      }
    };

    initStore();
  }, [ready, authenticated, user, initialize, clearAuth, getAccessToken, storeAuthenticated]);

  // Show loading indicator while Privy is initializing or data is loading
  if (!ready || (authenticated && isLoading && !lastSyncTime)) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
          <p className="text-sm text-muted-foreground">加载中...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      {children}
      <QuotaAlertDialog />
    </>
  );
}
