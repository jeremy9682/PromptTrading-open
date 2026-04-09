/**
 * useAutoSwap Hook
 * 
 * 自动检测 Safe 钱包中的 Native USDC 并转换为 USDC.e
 */

import { useState, useEffect, useCallback } from 'react';
import { useWallets } from '@privy-io/react-auth';
import { ethers as ethers5 } from 'ethers5';
import {
  checkNeedsSwap,
  getTokenBalances,
  executeAutoSwap,
  autoDetectAndSwap,
  getAllBalances,
  TokenBalance,
  SwapResult,
  AllBalances,
  MultiChainBalance,
  AUTO_SWAP_MIN_AMOUNT,
} from '../services/polymarket/autoSwapService';

interface UseAutoSwapOptions {
  safeAddress: string | null;
  eoaAddress?: string | null; // EOA address for multi-chain detection
  enabled?: boolean;
  autoSwapOnDetect?: boolean;
  checkIntervalMs?: number;
  checkOtherChains?: boolean; // Whether to check balances on other chains
}

interface UseAutoSwapReturn {
  // State
  balances: TokenBalance;
  allBalances: AllBalances | null; // Multi-chain balances
  needsSwap: boolean;
  hasOtherChainBalances: boolean; // True if user has USDC on other chains
  isChecking: boolean;
  isSwapping: boolean;
  lastSwapResult: SwapResult | null;
  error: string | null;
  
  // Actions
  checkBalances: () => Promise<void>;
  executeSwap: (amount?: number) => Promise<SwapResult>;
  autoSwap: () => Promise<SwapResult>;
}

export function useAutoSwap({
  safeAddress,
  eoaAddress,
  enabled = true,
  autoSwapOnDetect = false,
  checkIntervalMs = 30000, // Check every 30 seconds
  checkOtherChains = true, // Check other chains by default
}: UseAutoSwapOptions): UseAutoSwapReturn {
  const { wallets } = useWallets();
  
  const [balances, setBalances] = useState<TokenBalance>({ nativeUsdc: 0, usdcE: 0 });
  const [allBalances, setAllBalances] = useState<AllBalances | null>(null);
  const [needsSwap, setNeedsSwap] = useState(false);
  const [hasOtherChainBalances, setHasOtherChainBalances] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [isSwapping, setIsSwapping] = useState(false);
  const [lastSwapResult, setLastSwapResult] = useState<SwapResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  // Get signer from Privy wallet
  const getSigner = useCallback(async (): Promise<ethers5.Signer | null> => {
    const embeddedWallet = wallets.find(w => w.walletClientType === 'privy');
    if (!embeddedWallet) {
      console.warn('[useAutoSwap] No embedded wallet found');
      return null;
    }
    
    try {
      const provider = await embeddedWallet.getEthereumProvider();
      const ethersProvider = new ethers5.providers.Web3Provider(provider as ethers5.providers.ExternalProvider);
      return ethersProvider.getSigner();
    } catch (err) {
      console.error('[useAutoSwap] Failed to get signer:', err);
      return null;
    }
  }, [wallets]);
  
  // Check balances
  const checkBalances = useCallback(async () => {
    if (!safeAddress || !enabled) return;
    
    setIsChecking(true);
    setError(null);
    
    try {
      // Check Polygon balances
      const tokenBalances = await getTokenBalances(safeAddress);
      setBalances(tokenBalances);
      
      const { needsSwap: shouldSwap } = await checkNeedsSwap(safeAddress);
      setNeedsSwap(shouldSwap);
      
      // Check other chains if enabled and EOA address provided
      if (checkOtherChains && eoaAddress) {
        const allChainBalances = await getAllBalances(safeAddress, eoaAddress);
        setAllBalances(allChainBalances);
        setHasOtherChainBalances(allChainBalances.otherChains.length > 0);
        
        console.log('[useAutoSwap] Multi-chain balance check:', {
          polygon: allChainBalances.polygon,
          otherChains: allChainBalances.otherChains,
          totalPotential: allChainBalances.totalPotential,
        });
      } else {
        console.log('[useAutoSwap] Polygon balance check:', {
          nativeUsdc: tokenBalances.nativeUsdc,
          usdcE: tokenBalances.usdcE,
          needsSwap: shouldSwap,
        });
      }
    } catch (err) {
      console.error('[useAutoSwap] Balance check failed:', err);
      setError(err instanceof Error ? err.message : 'Failed to check balances');
    } finally {
      setIsChecking(false);
    }
  }, [safeAddress, eoaAddress, enabled, checkOtherChains]);
  
  // Execute swap
  const executeSwap = useCallback(async (amount?: number): Promise<SwapResult> => {
    if (!safeAddress) {
      return { success: false, error: 'No Safe address' };
    }
    
    setIsSwapping(true);
    setError(null);
    
    try {
      const signer = await getSigner();
      if (!signer) {
        throw new Error('Failed to get signer');
      }
      
      const result = await executeAutoSwap(signer, safeAddress, amount);
      setLastSwapResult(result);
      
      if (result.success) {
        // Refresh balances after successful swap
        await checkBalances();
      } else {
        setError(result.error || 'Swap failed');
      }
      
      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Swap failed';
      setError(errorMessage);
      const result = { success: false, error: errorMessage };
      setLastSwapResult(result);
      return result;
    } finally {
      setIsSwapping(false);
    }
  }, [safeAddress, getSigner, checkBalances]);
  
  // Auto swap (check + swap if needed)
  const autoSwap = useCallback(async (): Promise<SwapResult> => {
    if (!safeAddress) {
      return { success: false, error: 'No Safe address' };
    }
    
    setIsSwapping(true);
    setError(null);
    
    try {
      const signer = await getSigner();
      if (!signer) {
        throw new Error('Failed to get signer');
      }
      
      const result = await autoDetectAndSwap(signer, safeAddress, (msg) => {
        console.log('[useAutoSwap]', msg);
      });
      
      setLastSwapResult(result);
      
      if (result.success) {
        await checkBalances();
      } else if (result.error) {
        setError(result.error);
      }
      
      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Auto swap failed';
      setError(errorMessage);
      const result = { success: false, error: errorMessage };
      setLastSwapResult(result);
      return result;
    } finally {
      setIsSwapping(false);
    }
  }, [safeAddress, getSigner, checkBalances]);
  
  // Initial balance check
  useEffect(() => {
    if (safeAddress && enabled) {
      checkBalances();
    }
  }, [safeAddress, enabled, checkBalances]);
  
  // Periodic balance check
  useEffect(() => {
    if (!safeAddress || !enabled || checkIntervalMs <= 0) return;
    
    const interval = setInterval(() => {
      checkBalances();
    }, checkIntervalMs);
    
    return () => clearInterval(interval);
  }, [safeAddress, enabled, checkIntervalMs, checkBalances]);
  
  // Auto swap on detect
  useEffect(() => {
    if (autoSwapOnDetect && needsSwap && !isSwapping && safeAddress) {
      console.log('[useAutoSwap] Auto-swapping detected Native USDC...');
      autoSwap();
    }
  }, [autoSwapOnDetect, needsSwap, isSwapping, safeAddress, autoSwap]);
  
  return {
    balances,
    allBalances,
    needsSwap,
    hasOtherChainBalances,
    isChecking,
    isSwapping,
    lastSwapResult,
    error,
    checkBalances,
    executeSwap,
    autoSwap,
  };
}

export { AUTO_SWAP_MIN_AMOUNT };

