/**
 * Privy Session Signers Hook (TEE Mode)
 *
 * 管理用户的钱包 Session Signer 状态，支持：
 * - 检查用户是否已添加 Session Signer
 * - 请求用户添加 Session Signer (调用 Privy addSessionSigners())
 * - 撤销 Session Signer
 *
 * 添加 Session Signer 后，后端可以通过 Privy Server SDK 代签交易，
 * 实现 AI 自动交易功能。
 *
 * 支持的钱包类型：
 * - EVM (Polygon): 用于 Polymarket 交易
 * - Solana: 用于 Kalshi/DFlow 交易
 *
 * 注意: 此应用使用 TEE (Trusted Execution Environment) 模式，
 * 必须使用 useSessionSigners 而不是 useDelegatedActions
 *
 * 参考: https://docs.privy.io/wallets/using-wallets/session-signers/add-session-signers
 */

import { useState, useEffect, useCallback } from 'react';
import { usePrivy, useWallets, useSessionSigners, WalletWithMetadata } from '@privy-io/react-auth';
import { useWallets as useSolanaWallets } from '@privy-io/react-auth/solana';
import { createApiCredentialsAuto } from '../services/polymarket/polymarketAuthService';

// Session Signer ID - 从 Privy Dashboard 的 Wallet infrastructure > Authorization keys 获取
// 这个 ID 对应在 Dashboard 创建的 Key Quorum
const SESSION_SIGNER_ID = import.meta.env.VITE_PRIVY_SESSION_SIGNER_ID || '';

export interface DelegationStatus {
  isDelegated: boolean;
  isLoading: boolean;
  error: string | null;
  walletAddress: string | null;
  // Solana delegation status (for Kalshi/DFlow)
  solanaAddress: string | null;
  isSolanaDelegated: boolean;
}

export interface UseDelegationReturn {
  status: DelegationStatus;
  requestDelegation: () => Promise<boolean>;
  revokeDelegation: () => Promise<boolean>;
  refreshStatus: () => Promise<void>;
}

// API Base URL
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3002';

/**
 * Privy Session Signer 状态管理 Hook (TEE Mode)
 *
 * 同时支持 EVM (Polygon) 和 Solana 钱包的 Session Signer
 */
export function usePrivyDelegation(): UseDelegationReturn {
  const { authenticated, user, getAccessToken } = usePrivy();
  const { wallets, ready: walletsReady } = useWallets();
  const { addSessionSigners, removeSessionSigners } = useSessionSigners();

  // Solana wallet hooks (from @privy-io/react-auth/solana)
  const { wallets: solanaWallets, ready: solanaWalletsReady } = useSolanaWallets();
  // Note: useSessionSigners from main module works for ALL wallet types including Solana

  const [status, setStatus] = useState<DelegationStatus>({
    isDelegated: false,
    isLoading: true,
    error: null,
    walletAddress: null,
    solanaAddress: null,
    isSolanaDelegated: false,
  });

  // 获取 EVM 嵌入式钱包 (Polygon/Polymarket)
  const embeddedWallet = walletsReady
    ? wallets.find((w) => w.walletClientType === 'privy')
    : null;

  // 获取 Solana 嵌入式钱包 (Kalshi/DFlow)
  // Solana embedded wallets from Privy - use first available wallet with fallback
  const solanaEmbeddedWallet = solanaWalletsReady
    ? solanaWallets.find((w) => w.walletClientType === 'privy') || solanaWallets[0]
    : null;

  /**
   * 检查 EVM 嵌入式钱包是否有我们的 Session Signer
   * 在 TEE 模式下，检查 wallet 的 session_signers 字段
   */
  const hasSessionSigner = useCallback((): boolean => {
    if (!user?.linkedAccounts || !embeddedWallet?.address || !SESSION_SIGNER_ID) return false;

    const wallet = user.linkedAccounts.find(
      (account) =>
        account.type === 'wallet' &&
        (account as WalletWithMetadata).address?.toLowerCase() === embeddedWallet.address.toLowerCase()
    ) as WalletWithMetadata | undefined;

    // TEE 模式下检查是否有 session signers
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const walletWithSigners = wallet as any;
    if (walletWithSigners?.sessionSigners) {
      return walletWithSigners.sessionSigners.some(
        (signer: { signerId: string }) => signer.signerId === SESSION_SIGNER_ID
      );
    }

    // 兼容: 也检查 delegated 字段 (某些情况下可能仍然有效)
    return wallet?.delegated === true;
  }, [user?.linkedAccounts, embeddedWallet?.address]);

  /**
   * 检查 Solana 嵌入式钱包是否有我们的 Session Signer
   */
  const hasSolanaSessionSigner = useCallback((): boolean => {
    if (!user?.linkedAccounts || !solanaEmbeddedWallet?.address || !SESSION_SIGNER_ID) return false;

    // Solana 钱包的 chainType 是 'solana'
    const solanaWallet = user.linkedAccounts.find(
      (account) =>
        account.type === 'wallet' &&
        (account as any).chainType === 'solana' &&
        (account as WalletWithMetadata).address === solanaEmbeddedWallet.address
    ) as WalletWithMetadata | undefined;

    // TEE 模式下检查是否有 session signers
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const walletWithSigners = solanaWallet as any;
    if (walletWithSigners?.sessionSigners) {
      return walletWithSigners.sessionSigners.some(
        (signer: { signerId: string }) => signer.signerId === SESSION_SIGNER_ID
      );
    }

    // 兼容: 也检查 delegated 字段
    return solanaWallet?.delegated === true;
  }, [user?.linkedAccounts, solanaEmbeddedWallet?.address]);

  /**
   * 从后端获取委托状态
   * 同时检查 Privy 中是否有 Session Signer (EVM 和 Solana)
   */
  const fetchDelegationStatus = useCallback(async () => {
    if (!authenticated || !embeddedWallet?.address) {
      setStatus((prev) => ({
        ...prev,
        isDelegated: false,
        isLoading: false,
        walletAddress: null,
        solanaAddress: solanaEmbeddedWallet?.address || null,
        isSolanaDelegated: false,
      }));
      return;
    }

    try {
      setStatus((prev) => ({ ...prev, isLoading: true, error: null }));

      // 检查 EVM 钱包的 Session Signer
      const privyHasSessionSigner = hasSessionSigner();
      // 检查 Solana 钱包的 Session Signer
      const privyHasSolanaSessionSigner = hasSolanaSessionSigner();

      const accessToken = await getAccessToken();
      if (!accessToken) {
        throw new Error('Failed to get access token');
      }

      // 使用 auto-trade/status API
      const response = await fetch(`${API_BASE_URL}/api/polymarket/auto-trade/status`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'X-Wallet-Address': embeddedWallet.address,
        },
      });

      if (!response.ok) {
        // 如果 404 或其他错误，默认为未授权
        setStatus({
          isDelegated: false,
          isLoading: false,
          error: null,
          walletAddress: embeddedWallet.address,
          solanaAddress: solanaEmbeddedWallet?.address || null,
          isSolanaDelegated: privyHasSolanaSessionSigner,
        });
        return;
      }

      const data = await response.json();
      if (data.success && data.data) {
        // 只有当 Privy 有 Session Signer 和后端都显示已委托时才算真正委托
        const backendDelegated = data.data.isDelegated || false;
        const hasApiCredentials = data.data.hasApiCredentials || false;
        // TEE 模式下，如果没有配置 SESSION_SIGNER_ID，暂时只依赖后端状态
        const actuallyDelegated = SESSION_SIGNER_ID
          ? (privyHasSessionSigner && backendDelegated)
          : backendDelegated;

        if (backendDelegated && !privyHasSessionSigner && SESSION_SIGNER_ID) {
          console.warn('[useDelegation] Backend shows delegated but no Session Signer in Privy. User may need to add session signer.');
        }

        // 如果已启用 delegation 但没有 API 凭证，自动创建
        if (actuallyDelegated && !hasApiCredentials) {
          try {
            const accessToken = await getAccessToken();
            if (accessToken) {
              await createApiCredentialsAuto(accessToken, embeddedWallet.address);
            }
          } catch (credError) {
            // 凭证创建失败不影响状态
          }
        }

        let errorMsg = null;
        if (!SESSION_SIGNER_ID) {
          errorMsg = 'Session Signer ID not configured. Please set VITE_PRIVY_SESSION_SIGNER_ID.';
        } else if (backendDelegated && !privyHasSessionSigner) {
          errorMsg = 'EVM Session Signer missing. Please re-enable delegation.';
        }

        setStatus({
          isDelegated: actuallyDelegated,
          isLoading: false,
          error: errorMsg,
          walletAddress: embeddedWallet.address,
          solanaAddress: solanaEmbeddedWallet?.address || null,
          isSolanaDelegated: privyHasSolanaSessionSigner,
        });
      } else {
        setStatus({
          isDelegated: false,
          isLoading: false,
          error: null,
          walletAddress: embeddedWallet.address,
          solanaAddress: solanaEmbeddedWallet?.address || null,
          isSolanaDelegated: privyHasSolanaSessionSigner,
        });
      }
    } catch (error) {
      console.error('[useDelegation] Error fetching status:', error);
      setStatus((prev) => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }));
    }
  }, [authenticated, embeddedWallet?.address, solanaEmbeddedWallet?.address, getAccessToken, hasSessionSigner, hasSolanaSessionSigner]);

  // 初始化时获取状态
  useEffect(() => {
    // 等待 EVM 和 Solana 钱包都准备好
    if (authenticated && walletsReady && solanaWalletsReady) {
      fetchDelegationStatus();
    }
  }, [authenticated, walletsReady, solanaWalletsReady, fetchDelegationStatus]);

  /**
   * 请求用户授权 Session Signer (TEE Mode)
   * 同时为 EVM (Polygon) 和 Solana 钱包添加 Session Signer
   *
   * 1. 先调用 Privy addSessionSigners() 添加 EVM Session Signer
   * 2. 然后调用 Privy addSolanaSessionSigners() 添加 Solana Session Signer
   * 3. 最后通知后端更新数据库状态
   */
  const requestDelegation = useCallback(async (): Promise<boolean> => {
    if (!embeddedWallet) {
      setStatus((prev) => ({
        ...prev,
        error: 'No embedded wallet found',
      }));
      return false;
    }

    if (!SESSION_SIGNER_ID) {
      setStatus((prev) => ({
        ...prev,
        error: 'Session Signer ID not configured. Please set VITE_PRIVY_SESSION_SIGNER_ID in your .env file.',
      }));
      console.error('[useDelegation] SESSION_SIGNER_ID is not configured!');
      console.error('[useDelegation] Please create a Key Quorum in Privy Dashboard:');
      console.error('[useDelegation] Dashboard -> Wallet infrastructure -> Authorization keys -> Create new key');
      console.error('[useDelegation] Then add VITE_PRIVY_SESSION_SIGNER_ID to your .env file');
      return false;
    }

    try {
      setStatus((prev) => ({ ...prev, isLoading: true, error: null }));

      // Step 1: 调用 Privy addSessionSigners() 添加 EVM Session Signer
      console.log('[useDelegation] Adding EVM Session Signer...');

      try {
        await addSessionSigners({
          address: embeddedWallet.address,
          signers: [
            {
              signerId: SESSION_SIGNER_ID,
              policyIds: [], // 可以添加 policy 限制，目前为空表示无限制
            },
          ],
        });
      } catch (privyError: any) {
        // 如果是 "Duplicate signer" 错误，说明已经添加过了，视为成功
        if (privyError?.message?.includes('Duplicate signer')) {
          // Already exists, continue
        } else {
          throw privyError;
        }
      }

      // Step 2: 如果有 Solana 钱包，也添加 Session Signer
      // Note: addSessionSigners from useSessionSigners works for ALL wallet types
      let solanaDelegated = false;

      if (solanaEmbeddedWallet?.address) {
        console.log('[useDelegation] Adding Solana Session Signer...');

        try {
          // The same addSessionSigners works for Solana wallets too
          await addSessionSigners({
            address: solanaEmbeddedWallet.address,
            signers: [
              {
                signerId: SESSION_SIGNER_ID,
                policyIds: [],
              },
            ],
          });
          solanaDelegated = true;
        } catch (solanaError: any) {
          if (solanaError?.message?.includes('Duplicate signer')) {
            solanaDelegated = true;
          } else {
            // Solana 失败不阻止 EVM delegation，只记录警告
            console.warn('[useDelegation] ⚠️ Failed to add Solana Session Signer:', solanaError.message);
            console.warn('[useDelegation] Kalshi/DFlow auto-trading will not work until Solana Session Signer is enabled.');
          }
        }
      }

      // Step 3: 通知后端更新数据库状态
      const accessToken = await getAccessToken();
      if (!accessToken) {
        throw new Error('Failed to get access token');
      }

      const response = await fetch(`${API_BASE_URL}/api/polymarket/auto-trade/delegation`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'X-Wallet-Address': embeddedWallet.address,
        },
        body: JSON.stringify({
          enabled: true,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to update delegation status in backend');
      }

      // Step 4: 自动创建 Polymarket API 凭证
      // 这是自动交易所需的，在用户启用 Session Signer 后自动完成
      try {
        await createApiCredentialsAuto(accessToken, embeddedWallet.address);
      } catch (credError) {
        // 凭证创建失败不阻止 delegation 成功
        console.warn('[useDelegation] Failed to create API credentials:', credError);
      }

      setStatus({
        isDelegated: true,
        isLoading: false,
        error: null,
        walletAddress: embeddedWallet.address,
        solanaAddress: solanaEmbeddedWallet?.address || null,
        isSolanaDelegated: solanaDelegated,
      });

      return true;
    } catch (error) {
      console.error('[useDelegation] Error adding session signer:', error);
      setStatus((prev) => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to add session signer',
      }));
      return false;
    }
  }, [embeddedWallet, solanaEmbeddedWallet, solanaWallets, solanaWalletsReady, addSessionSigners, getAccessToken]);

  /**
   * 撤销 Session Signer 授权 (TEE Mode)
   * 同时移除 EVM 和 Solana 钱包的 Session Signer
   *
   * 1. 先调用 Privy removeSessionSigners() 移除 EVM Session Signer
   * 2. 然后调用 removeSolanaSessionSigners() 移除 Solana Session Signer
   * 3. 最后通知后端更新数据库状态
   */
  const revokeDelegation = useCallback(async (): Promise<boolean> => {
    if (!embeddedWallet) {
      setStatus((prev) => ({
        ...prev,
        error: 'No embedded wallet found',
      }));
      return false;
    }

    try {
      setStatus((prev) => ({ ...prev, isLoading: true, error: null }));

      // Step 1: 移除 EVM Session Signer
      if (SESSION_SIGNER_ID && hasSessionSigner()) {
        await removeSessionSigners({
          address: embeddedWallet.address,
          signerIds: [SESSION_SIGNER_ID],
        });
      }

      // Step 2: 移除 Solana Session Signer
      if (SESSION_SIGNER_ID && solanaEmbeddedWallet?.address && hasSolanaSessionSigner()) {
        try {
          await removeSessionSigners({
            address: solanaEmbeddedWallet.address,
            signerIds: [SESSION_SIGNER_ID],
          });
        } catch (solanaError) {
          // Solana 移除失败不影响 EVM 撤销
        }
      }

      // Step 3: 通知后端更新数据库状态
      const accessToken = await getAccessToken();
      if (!accessToken) {
        throw new Error('Failed to get access token');
      }

      const response = await fetch(`${API_BASE_URL}/api/polymarket/auto-trade/delegation`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'X-Wallet-Address': embeddedWallet.address,
        },
        body: JSON.stringify({
          enabled: false,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to disable delegation');
      }

      setStatus({
        isDelegated: false,
        isLoading: false,
        error: null,
        walletAddress: embeddedWallet.address,
        solanaAddress: solanaEmbeddedWallet?.address || null,
        isSolanaDelegated: false,
      });

      return true;
    } catch (error) {
      console.error('[useDelegation] Error removing session signer:', error);
      setStatus((prev) => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to remove session signer',
      }));
      return false;
    }
  }, [embeddedWallet, solanaEmbeddedWallet, removeSessionSigners, hasSessionSigner, hasSolanaSessionSigner, getAccessToken]);

  return {
    status,
    requestDelegation,
    revokeDelegation,
    refreshStatus: fetchDelegationStatus,
  };
}

export default usePrivyDelegation;
