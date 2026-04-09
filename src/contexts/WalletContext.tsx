/**
 * WalletContext - Multi-chain Wallet Management
 *
 * Manages wallet addresses and USDC balances across multiple chains:
 * - EVM chains (Polygon, Base, Arbitrum) - same address, different balances
 * - Solana - separate address and balance
 *
 * This context provides a unified interface for accessing wallet state
 * across all supported prediction markets.
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useAuth } from './AuthContext';
import { Connection, PublicKey } from '@solana/web3.js';
import { getAssociatedTokenAddress } from '@solana/spl-token';
import { ethers } from 'ethers';
import {
  CHAINS,
  EVM_CHAINS,
  USDC_ADDRESSES,
  MARKETS,
  type ChainType,
} from '../markets/config';

// ============================================
// Types
// ============================================

export interface ChainBalance {
  chainId: number | string;
  chainName: string;
  balance: number;
  loading: boolean;
  error: string | null;
  lastUpdated: Date | null;
}

export interface WalletState {
  // EVM Wallet (shared address across Polygon/Base/Arbitrum)
  evmAddress: string | null;
  evmBalances: Record<number, ChainBalance>; // chainId -> balance info

  // Solana Wallet
  solanaAddress: string | null;
  solanaBalance: ChainBalance | null; // USDC balance
  solBalance: number | null; // Native SOL balance (for gas fees)
  solBalanceLoading: boolean;

  // Loading states
  isLoading: boolean;

  // Actions
  refreshEvmBalance: (chainId: number) => Promise<number>;
  refreshSolanaBalance: () => Promise<number>;
  refreshAllBalances: () => Promise<void>;

  // Helpers
  getBalanceForMarket: (marketId: string) => number;
  getTotalBalance: () => number;
}

const defaultChainBalance: ChainBalance = {
  chainId: 0,
  chainName: '',
  balance: 0,
  loading: false,
  error: null,
  lastUpdated: null,
};

const defaultState: WalletState = {
  evmAddress: null,
  evmBalances: {},
  solanaAddress: null,
  solanaBalance: null,
  solBalance: null,
  solBalanceLoading: false,
  isLoading: false,
  refreshEvmBalance: async () => 0,
  refreshSolanaBalance: async () => 0,
  refreshAllBalances: async () => {},
  getBalanceForMarket: () => 0,
  getTotalBalance: () => 0,
};

// ============================================
// ERC20 ABI (minimal for balanceOf)
// ============================================

const ERC20_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function decimals() view returns (uint8)',
];

// ============================================
// Context
// ============================================

const WalletContext = createContext<WalletState>(defaultState);

export function useWallet(): WalletState {
  return useContext(WalletContext);
}

// ============================================
// Provider
// ============================================

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const {
    authenticated,
    embeddedWalletAddress,
    solanaWalletAddress,
    walletsReady,
    solanaWalletsReady,
  } = useAuth();

  // EVM balances by chain ID
  const [evmBalances, setEvmBalances] = useState<Record<number, ChainBalance>>({});

  // Solana balance (USDC)
  const [solanaBalance, setSolanaBalance] = useState<ChainBalance | null>(null);

  // Native SOL balance (for gas fees)
  const [solBalance, setSolBalance] = useState<number | null>(null);
  const [solBalanceLoading, setSolBalanceLoading] = useState(false);

  // Global loading state
  const [isLoading, setIsLoading] = useState(false);

  // Prevent concurrent fetches
  const fetchingRef = useRef<Set<string>>(new Set());

  // ============================================
  // EVM Balance Fetching
  // ============================================

  /**
   * Fetch USDC balance for a specific EVM chain
   */
  const fetchEvmBalance = useCallback(async (chainId: number): Promise<number> => {
    if (!embeddedWalletAddress) return 0;

    const fetchKey = `evm-${chainId}`;
    if (fetchingRef.current.has(fetchKey)) {
      console.log(`[WalletContext] Already fetching balance for chain ${chainId}`);
      return evmBalances[chainId]?.balance || 0;
    }

    fetchingRef.current.add(fetchKey);

    // Update loading state for this chain
    setEvmBalances(prev => ({
      ...prev,
      [chainId]: {
        ...prev[chainId],
        chainId,
        chainName: Object.values(CHAINS).find(c => c.id === chainId)?.name || `Chain ${chainId}`,
        loading: true,
        error: null,
      },
    }));

    try {
      const chain = Object.values(CHAINS).find(c => c.id === chainId);
      if (!chain || chain.type !== 'evm') {
        throw new Error(`Unsupported EVM chain: ${chainId}`);
      }

      const usdcAddress = USDC_ADDRESSES[chainId];
      if (!usdcAddress) {
        throw new Error(`No USDC address for chain ${chainId}`);
      }

      // Create provider for the specific chain
      const provider = new ethers.JsonRpcProvider(chain.rpcUrl);
      const usdcContract = new ethers.Contract(usdcAddress, ERC20_ABI, provider);

      // Fetch balance
      const balanceRaw = await usdcContract.balanceOf(embeddedWalletAddress);
      const decimals = await usdcContract.decimals();
      const balance = parseFloat(ethers.formatUnits(balanceRaw, decimals));

      console.log(`[WalletContext] ${chain.name} USDC balance:`, balance);

      setEvmBalances(prev => ({
        ...prev,
        [chainId]: {
          chainId,
          chainName: chain.name,
          balance,
          loading: false,
          error: null,
          lastUpdated: new Date(),
        },
      }));

      return balance;
    } catch (error) {
      console.error(`[WalletContext] Failed to fetch balance for chain ${chainId}:`, error);

      setEvmBalances(prev => ({
        ...prev,
        [chainId]: {
          ...prev[chainId],
          chainId,
          chainName: Object.values(CHAINS).find(c => c.id === chainId)?.name || `Chain ${chainId}`,
          loading: false,
          error: error instanceof Error ? error.message : 'Failed to fetch balance',
          lastUpdated: new Date(),
        },
      }));

      return 0;
    } finally {
      fetchingRef.current.delete(fetchKey);
    }
  }, [embeddedWalletAddress, evmBalances]);

  // ============================================
  // Solana Balance Fetching
  // ============================================

  /**
   * Fetch USDC balance on Solana
   */
  const fetchSolanaBalance = useCallback(async (): Promise<number> => {
    if (!solanaWalletAddress) return 0;

    const fetchKey = 'solana';
    if (fetchingRef.current.has(fetchKey)) {
      console.log('[WalletContext] Already fetching Solana balance');
      return solanaBalance?.balance || 0;
    }

    fetchingRef.current.add(fetchKey);

    setSolanaBalance(prev => ({
      ...prev,
      chainId: 'solana-mainnet',
      chainName: 'Solana',
      balance: prev?.balance || 0,
      loading: true,
      error: null,
      lastUpdated: prev?.lastUpdated || null,
    }));

    try {
      const rpcUrl = CHAINS.solana.rpcUrl;
      const connection = new Connection(rpcUrl, 'confirmed');

      const usdcMint = new PublicKey(USDC_ADDRESSES['solana-mainnet']);
      const walletPubkey = new PublicKey(solanaWalletAddress);

      // Fetch native SOL balance (for gas fees)
      setSolBalanceLoading(true);
      try {
        const lamports = await connection.getBalance(walletPubkey);
        const solBalanceValue = lamports / 1_000_000_000; // Convert lamports to SOL
        setSolBalance(solBalanceValue);
        console.log('[WalletContext] Solana SOL balance:', solBalanceValue);
      } catch (err) {
        console.error('[WalletContext] Failed to fetch SOL balance:', err);
        setSolBalance(0);
      } finally {
        setSolBalanceLoading(false);
      }

      // Get associated token account for USDC
      const ataAddress = await getAssociatedTokenAddress(usdcMint, walletPubkey);

      // Check if ATA exists
      const ataInfo = await connection.getAccountInfo(ataAddress);

      let balance = 0;
      if (ataInfo) {
        // Parse token account data
        const tokenBalance = await connection.getTokenAccountBalance(ataAddress);
        balance = tokenBalance.value.uiAmount || 0;
      }

      console.log('[WalletContext] Solana USDC balance:', balance);

      setSolanaBalance({
        chainId: 'solana-mainnet',
        chainName: 'Solana',
        balance,
        loading: false,
        error: null,
        lastUpdated: new Date(),
      });

      return balance;
    } catch (error) {
      console.error('[WalletContext] Failed to fetch Solana balance:', error);

      setSolanaBalance(prev => ({
        chainId: 'solana-mainnet',
        chainName: 'Solana',
        balance: prev?.balance || 0,
        loading: false,
        error: error instanceof Error ? error.message : 'Failed to fetch balance',
        lastUpdated: new Date(),
      }));

      return 0;
    } finally {
      fetchingRef.current.delete(fetchKey);
    }
  }, [solanaWalletAddress, solanaBalance]);

  // ============================================
  // Refresh All Balances
  // ============================================

  const refreshAllBalances = useCallback(async () => {
    if (!authenticated) return;

    setIsLoading(true);

    try {
      const promises: Promise<number>[] = [];

      // Fetch EVM balances for enabled markets
      if (embeddedWalletAddress && walletsReady) {
        // Polygon (Polymarket)
        if (MARKETS.polymarket.enabled) {
          promises.push(fetchEvmBalance(EVM_CHAINS.POLYGON));
        }
        // Base (Limitless) - fetch even if not enabled, for future use
        promises.push(fetchEvmBalance(EVM_CHAINS.BASE));
        // Arbitrum (Opinion) - fetch even if not enabled, for future use
        promises.push(fetchEvmBalance(EVM_CHAINS.ARBITRUM));
      }

      // Fetch Solana balance
      if (solanaWalletAddress && solanaWalletsReady) {
        promises.push(fetchSolanaBalance());
      }

      await Promise.allSettled(promises);
    } catch (error) {
      console.error('[WalletContext] Failed to refresh all balances:', error);
    } finally {
      setIsLoading(false);
    }
  }, [
    authenticated,
    embeddedWalletAddress,
    walletsReady,
    solanaWalletAddress,
    solanaWalletsReady,
    fetchEvmBalance,
    fetchSolanaBalance,
  ]);

  // ============================================
  // Helper Functions
  // ============================================

  /**
   * Get balance for a specific market
   */
  const getBalanceForMarket = useCallback((marketId: string): number => {
    const market = MARKETS[marketId];
    if (!market) return 0;

    if (market.chainType === 'solana') {
      return solanaBalance?.balance || 0;
    }

    // EVM market
    const chainId = market.chainId as number;
    return evmBalances[chainId]?.balance || 0;
  }, [evmBalances, solanaBalance]);

  /**
   * Get total balance across all chains
   */
  const getTotalBalance = useCallback((): number => {
    let total = 0;

    // Sum EVM balances
    Object.values(evmBalances).forEach(b => {
      total += b.balance;
    });

    // Add Solana balance
    if (solanaBalance) {
      total += solanaBalance.balance;
    }

    return total;
  }, [evmBalances, solanaBalance]);

  // ============================================
  // Auto-fetch on wallet ready
  // ============================================

  useEffect(() => {
    if (!authenticated) {
      // Clear state on logout
      setEvmBalances({});
      setSolanaBalance(null);
      setSolBalance(null);
      return;
    }

    // Wait for wallets to be ready
    if (!walletsReady && !solanaWalletsReady) return;

    // Initial balance fetch
    const initialFetch = async () => {
      // Small delay to ensure wallets are fully initialized
      await new Promise(resolve => setTimeout(resolve, 500));
      await refreshAllBalances();
    };

    initialFetch();
  }, [authenticated, walletsReady, solanaWalletsReady]);

  // ============================================
  // Note: Auto-refresh disabled to reduce RPC calls
  // Users can manually refresh via the refresh button in UserMenu
  // ============================================

  // ============================================
  // Context Value
  // ============================================

  const value = useMemo<WalletState>(() => ({
    evmAddress: embeddedWalletAddress,
    evmBalances,
    solanaAddress: solanaWalletAddress,
    solanaBalance,
    solBalance,
    solBalanceLoading,
    isLoading,
    refreshEvmBalance: fetchEvmBalance,
    refreshSolanaBalance: fetchSolanaBalance,
    refreshAllBalances,
    getBalanceForMarket,
    getTotalBalance,
  }), [
    embeddedWalletAddress,
    evmBalances,
    solanaWalletAddress,
    solanaBalance,
    solBalance,
    solBalanceLoading,
    isLoading,
    fetchEvmBalance,
    fetchSolanaBalance,
    refreshAllBalances,
    getBalanceForMarket,
    getTotalBalance,
  ]);

  return (
    <WalletContext.Provider value={value}>
      {children}
    </WalletContext.Provider>
  );
}

export default WalletContext;
