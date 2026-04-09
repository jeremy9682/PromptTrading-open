/**
 * AuthContext
 * Bridges Privy authentication with the existing app state
 * Provides unified auth interface for the entire app
 *
 * Wallet Architecture:
 * - Embedded wallet (Privy): Auto-created for all users, main wallet for trading
 * - Agent Wallet: Delegated wallet for signing trades (approved by embedded wallet)
 *   - User's embedded wallet private key stays secure
 *   - Only Agent private key is used for trading operations
 */

import { createContext, useContext, useEffect, useMemo, useCallback, useState } from 'react';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import { useWallets as useSolanaWallets, useCreateWallet as useCreateSolanaWallet } from '@privy-io/react-auth/solana';
import { ethers } from 'ethers';
import { useAppStore } from './useAppStore';
import { syncUserData } from '../services/auth.service';
import {
  generateAgentWallet,
  saveAgent,
  getCurrentAgent,
  getAgentPrivateKey,
  clearAgent,
  formatAgentInfo,
} from '../services/agentWallet.service';

const AuthContext = createContext(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

/**
 * AuthProvider
 * Manages authentication state and syncs with Zustand store
 */
export const AuthProvider = ({ children }) => {
  const {
    ready,
    authenticated,
    user,
    login,
    logout,
    linkEmail,
    linkGoogle,
    linkApple,
    linkWallet,
    unlinkEmail,
    unlinkGoogle,
    unlinkApple,
    unlinkWallet,
    getAccessToken,
    exportWallet, // For exporting embedded wallet private key
  } = usePrivy();

  const { wallets, ready: walletsReady } = useWallets();

  // Solana wallets (for DFlow/Kalshi trading)
  const { wallets: solanaWallets, ready: solanaWalletsReady } = useSolanaWallets();
  const { createWallet: createSolanaWalletFn } = useCreateSolanaWallet();

  // Debug: Log wallet state changes (including user.wallet from Privy)
  useEffect(() => {
    console.log('🔍 Wallet Debug:', {
      walletsReady,
      walletsCount: wallets.length,
      wallets: wallets.map(w => ({
        address: w.address,
        type: w.walletClientType,
        chainId: w.chainId,
      })),
      // Solana wallets - detailed logging
      solanaWalletsReady,
      solanaWalletsCount: solanaWallets.length,
      solanaWallets: solanaWallets.map(w => ({
        address: w.address,
        type: w.walletClientType,
      })),
      // Also check user object for embedded wallet info
      userWallet: user?.wallet,
      linkedAccounts: user?.linkedAccounts?.map(a => ({ type: a.type, address: a.address })),
      authenticated,
      userId: user?.id,
    });

    // Detailed Solana wallet log
    if (solanaWalletsReady) {
      if (solanaWallets.length > 0) {
        console.log('✅ [Solana] Wallets found:', solanaWallets.map(w => w.address));
      } else {
        console.log('⚠️ [Solana] No Solana wallets found. You may need to create one.');
      }
    }
  }, [wallets, walletsReady, solanaWallets, solanaWalletsReady, authenticated, user]);

  // Backend sync state
  const [backendUser, setBackendUser] = useState(null);
  const [syncStatus, setSyncStatus] = useState('idle'); // 'idle' | 'syncing' | 'synced' | 'error'

  // Access Token state (for components that need the token value directly)
  const [accessToken, setAccessToken] = useState(null);

  // Agent Wallet state
  const [agentWallet, setAgentWallet] = useState(null);
  const [isAgentActive, setIsAgentActive] = useState(false);

  // Selected wallet for Hyperliquid trading (can be embedded or external)
  // null = use embedded wallet, address string = use that external wallet
  const [selectedTradingWalletAddress, setSelectedTradingWalletAddress] = useState(null);

  // Zustand store actions
  const setUserAddress = useAppStore((state) => state.setUserAddress);
  const setNetworkStatus = useAppStore((state) => state.setNetworkStatus);

  // Sync user data with backend after login
  const syncWithBackend = useCallback(async () => {
    if (!authenticated || syncStatus === 'syncing') return;

    setSyncStatus('syncing');
    try {
      const token = await getAccessToken();
      if (!token) {
        setSyncStatus('error');
        return;
      }

      const result = await syncUserData(token);
      if (result.success) {
        setBackendUser(result.user);
        setSyncStatus('synced');
        console.log('AuthContext: User synced with backend:', result.user.privyUserId);
      } else {
        console.error('AuthContext: Backend sync failed:', result.error);
        setSyncStatus('error');
      }
    } catch (error) {
      console.error('AuthContext: Sync error:', error);
      setSyncStatus('error');
    }
  }, [authenticated, getAccessToken, syncStatus]);

  // Auto-sync when user authenticates
  useEffect(() => {
    if (authenticated && ready && syncStatus === 'idle') {
      syncWithBackend();
    }
    // Reset sync status on logout
    if (!authenticated) {
      setBackendUser(null);
      setSyncStatus('idle');
    }
  }, [authenticated, ready, syncStatus, syncWithBackend]);

  // Fetch and maintain access token when authenticated
  useEffect(() => {
    let isMounted = true;

    const fetchAccessToken = async () => {
      if (authenticated && ready) {
        try {
          const token = await getAccessToken();
          if (isMounted && token) {
            setAccessToken(token);
            console.log('AuthContext: Access token fetched');
          }
        } catch (error) {
          console.error('AuthContext: Failed to fetch access token:', error);
        }
      } else if (!authenticated) {
        setAccessToken(null);
      }
    };

    fetchAccessToken();

    // Refresh token periodically (every 5 minutes) while authenticated
    const refreshInterval = authenticated ? setInterval(fetchAccessToken, 5 * 60 * 1000) : null;

    return () => {
      isMounted = false;
      if (refreshInterval) clearInterval(refreshInterval);
    };
  }, [authenticated, ready, getAccessToken]);

  // ============================================
  // 方案 A: 只使用 Embedded Wallet 进行交易
  // ============================================
  // 
  // Privy 为每个用户创建唯一的嵌入式钱包（HD wallet index=0）
  // 这个地址是确定性的、永不改变的
  // 我们强制使用这个钱包进行所有交易操作
  //
  // embeddedWallet: 专门用于交易的嵌入式钱包（唯一）
  // primaryWallet: 兼容旧代码，优先返回 embeddedWallet
  // ============================================

  // 获取嵌入式钱包（用于交易，唯一且固定）
  const embeddedWallet = useMemo(() => {
    // 1. 首先从 useWallets hook 中查找嵌入式钱包
    if (walletsReady && wallets.length > 0) {
      const embedded = wallets.find(w => w.walletClientType === 'privy');
      if (embedded) {
        return embedded;
      }
    }

    // 2. 如果 useWallets 还没准备好，从 user.wallet 获取
    // 这在登录后 useWallets 更新前可能发生
    if (user?.wallet?.address) {
      return {
        address: user.wallet.address,
        walletClientType: 'privy',
        chainId: user.wallet.chainId || null,
        getEthereumProvider: async () => null, // stub，稍后会更新
      };
    }

    return null;
  }, [wallets, walletsReady, user?.wallet]);

  // 嵌入式钱包地址（用于 Safe 派生，这是唯一的交易身份）
  const embeddedWalletAddress = useMemo(() => {
    return embeddedWallet?.address || null;
  }, [embeddedWallet]);

  // primaryWallet - 用于交易的钱包
  // 如果用户选择了外部钱包，使用外部钱包；否则使用嵌入式钱包
  const primaryWallet = useMemo(() => {
    // 如果用户选择了特定的外部钱包地址
    if (selectedTradingWalletAddress && walletsReady) {
      const selectedWallet = wallets.find(
        w => w.address?.toLowerCase() === selectedTradingWalletAddress.toLowerCase()
      );
      if (selectedWallet) {
        console.log('[AuthContext] Using selected external wallet for trading:', selectedWallet.address);
        return selectedWallet;
      }
    }

    // 默认使用嵌入式钱包
    if (embeddedWallet) {
      return embeddedWallet;
    }

    // 如果没有嵌入式钱包且用户已登录，打印警告
    if (authenticated && walletsReady) {
      console.warn('[AuthContext] No embedded wallet found. Trading requires embedded wallet.');
    }
    return null;
  }, [embeddedWallet, authenticated, walletsReady, selectedTradingWalletAddress, wallets]);

  // Function to select which wallet to use for trading
  const selectTradingWallet = useCallback((walletAddress) => {
    console.log('[AuthContext] Selecting trading wallet:', walletAddress || 'embedded');
    setSelectedTradingWalletAddress(walletAddress);
    // Clear existing agent when switching wallets
    setAgentWallet(null);
    setIsAgentActive(false);
  }, []);

  // ============================================
  // Solana Wallet (for DFlow/Kalshi trading)
  // ============================================

  // Get the primary Solana wallet (prefer embedded, fall back to external)
  const primarySolanaWallet = useMemo(() => {
    if (!solanaWalletsReady || solanaWallets.length === 0) {
      return null;
    }

    // Prefer embedded Solana wallet
    const embeddedSolana = solanaWallets.find(w => w.walletClientType === 'privy');
    if (embeddedSolana) {
      return embeddedSolana;
    }

    // Fall back to first available Solana wallet (external like Phantom)
    return solanaWallets[0];
  }, [solanaWallets, solanaWalletsReady]);

  // Solana wallet address
  const solanaWalletAddress = useMemo(() => {
    return primarySolanaWallet?.address || null;
  }, [primarySolanaWallet]);

  // Check if Solana wallet is connected and ready
  const isSolanaWalletReady = useMemo(() => {
    return solanaWalletsReady && primarySolanaWallet !== null;
  }, [solanaWalletsReady, primarySolanaWallet]);

  // Sign a Solana transaction using Privy wallet
  const signSolanaTransaction = useCallback(async (transaction) => {
    if (!primarySolanaWallet) {
      throw new Error('No Solana wallet connected');
    }

    try {
      console.log('🔐 [Solana] Signing transaction with Privy wallet:', primarySolanaWallet.address);
      const signedTx = await primarySolanaWallet.signTransaction(transaction);
      console.log('✅ [Solana] Transaction signed');
      return signedTx;
    } catch (error) {
      console.error('❌ [Solana] Failed to sign transaction:', error);
      throw error;
    }
  }, [primarySolanaWallet]);

  // Sign and send a Solana transaction
  const signAndSendSolanaTransaction = useCallback(async (transaction, connection) => {
    if (!primarySolanaWallet) {
      throw new Error('No Solana wallet connected');
    }

    try {
      console.log('🔐 [Solana] Signing and sending transaction...');

      // Use Privy's signAndSendTransaction if available
      if (primarySolanaWallet.signAndSendTransaction) {
        const { signature } = await primarySolanaWallet.signAndSendTransaction(transaction);
        console.log('✅ [Solana] Transaction sent:', signature);
        return signature;
      }

      // Fall back to manual sign + send
      const signedTx = await primarySolanaWallet.signTransaction(transaction);
      const signature = await connection.sendRawTransaction(signedTx.serialize());
      console.log('✅ [Solana] Transaction sent:', signature);

      // Wait for confirmation
      await connection.confirmTransaction(signature, 'confirmed');
      return signature;
    } catch (error) {
      console.error('❌ [Solana] Failed to send transaction:', error);
      throw error;
    }
  }, [primarySolanaWallet]);

  // Sign a message with Solana wallet
  const signSolanaMessage = useCallback(async (message) => {
    if (!primarySolanaWallet) {
      throw new Error('No Solana wallet connected');
    }

    try {
      const encodedMessage = typeof message === 'string'
        ? new TextEncoder().encode(message)
        : message;
      const signature = await primarySolanaWallet.signMessage(encodedMessage);
      return signature;
    } catch (error) {
      console.error('❌ [Solana] Failed to sign message:', error);
      throw error;
    }
  }, [primarySolanaWallet]);

  // Sync wallet address to global store
  useEffect(() => {
    if (primaryWallet?.address) {
      console.log('AuthContext: Syncing wallet address:', primaryWallet.address);
      setUserAddress(primaryWallet.address);
    } else if (!authenticated) {
      setUserAddress('');
    }
  }, [primaryWallet?.address, authenticated, setUserAddress]);

  // Get current effective chainId (from store's isSimulationMode)
  // Must be defined before useEffect that uses it
  const isSimulationMode = useAppStore((state) => state.isSimulationMode);
  const effectiveChainId = isSimulationMode ? 421614 : 42161;

  // Update network status when chain changes or when authenticated
  useEffect(() => {
    let chainIdNum = null;

    // Try to get chainId from wallet first
    if (primaryWallet?.chainId) {
      chainIdNum = parseInt(primaryWallet.chainId, 16) || primaryWallet.chainId;
    } else if (authenticated) {
      // If authenticated but no wallet chainId yet, use effectiveChainId (based on simulation mode)
      chainIdNum = effectiveChainId;
    }

    if (chainIdNum) {
      const isTestnet = chainIdNum === 421614; // Arbitrum Sepolia
      const isMainnet = chainIdNum === 42161; // Arbitrum One

      setNetworkStatus({
        isTestnet,
        isMainnet,
        chainId: chainIdNum,
        supported: isTestnet || isMainnet,
        displayName: isTestnet
          ? 'Arbitrum Sepolia'
          : isMainnet
          ? 'Arbitrum One'
          : `Chain ${chainIdNum}`,
      });
    }
  }, [primaryWallet?.chainId, authenticated, effectiveChainId, setNetworkStatus]);

  // Get user display info
  const userDisplayInfo = useMemo(() => {
    if (!user) return null;

    // Email
    const email = user.email?.address;

    // Linked accounts
    const google = user.google;
    const apple = user.apple;

    // Check for embedded wallet in user.linkedAccounts
    const embeddedWalletAccount = user.linkedAccounts?.find(
      (a) => a.type === 'wallet' && a.walletClientType === 'privy'
    );

    // Display name priority: google > apple > email > wallet
    let displayName = 'User';
    if (google?.name) displayName = google.name;
    else if (apple?.email) displayName = apple.email.split('@')[0];
    else if (email) displayName = email.split('@')[0];
    else if (primaryWallet?.address) {
      displayName = `${primaryWallet.address.slice(0, 6)}...${primaryWallet.address.slice(-4)}`;
    }

    // Check for embedded wallet from multiple sources
    const hasEmbeddedWallet =
      wallets.some((w) => w.walletClientType === 'privy') ||
      !!user.wallet?.address ||
      !!embeddedWalletAccount;

    // Get external (non-Privy) wallets
    const externalWallets = wallets.filter((w) => w.walletClientType !== 'privy');

    return {
      id: user.id,
      email,
      google: google?.email,
      apple: apple?.email,
      displayName,
      hasLinkedWallet: externalWallets.length > 0,
      hasEmbeddedWallet,
      // Also expose the embedded wallet address directly for convenience
      embeddedWalletAddress: primaryWallet?.address || user.wallet?.address || embeddedWalletAccount?.address,
      // Expose external wallets for display
      externalWallets: externalWallets.map((w) => ({
        address: w.address,
        type: w.walletClientType, // e.g., 'metamask', 'rainbow', etc.
      })),
    };
  }, [user, wallets, primaryWallet]);

  // Get provider from wallet (for ethers.js compatibility)
  const getProvider = async () => {
    if (!primaryWallet) return null;
    try {
      const provider = await primaryWallet.getEthereumProvider();
      return provider;
    } catch (error) {
      console.error('Error getting provider:', error);
      return null;
    }
  };

  // Switch chain
  const switchChain = async (chainId) => {
    if (!primaryWallet) return;
    try {
      await primaryWallet.switchChain(chainId);
    } catch (error) {
      console.error('Error switching chain:', error);
      throw error;
    }
  };

  // Sign message
  const signMessage = async (message) => {
    if (!primaryWallet) throw new Error('No wallet connected');
    const provider = await primaryWallet.getEthereumProvider();
    const signedMessage = await provider.request({
      method: 'personal_sign',
      params: [message, primaryWallet.address],
    });
    return signedMessage;
  };

  // Export embedded wallet private key (for Hyperliquid trading)
  // This allows the user to export their embedded wallet to MetaMask
  const exportWalletPrivateKey = async () => {
    if (!primaryWallet) throw new Error('No wallet connected');

    // Only embedded wallets can export private key
    if (primaryWallet.walletClientType !== 'privy') {
      throw new Error('Only embedded wallets can export private key. External wallets must use Agent Wallet.');
    }

    if (!exportWallet) {
      throw new Error('Export wallet function not available');
    }

    try {
      // Privy's exportWallet opens a modal where user can see and copy their private key
      // The private key is never exposed to the app - only shown to the user in Privy's secure modal
      await exportWallet({ address: primaryWallet.address });
      return true; // Export modal was opened successfully
    } catch (error) {
      console.error('Error exporting wallet private key:', error);
      throw error;
    }
  };

  // Sign typed data (EIP-712) - required for Hyperliquid
  const signTypedData = async (domain, types, value) => {
    if (!primaryWallet) throw new Error('No wallet connected');
    const provider = await primaryWallet.getEthereumProvider();
    const signedData = await provider.request({
      method: 'eth_signTypedData_v4',
      params: [primaryWallet.address, JSON.stringify({ domain, types, primaryType: 'Agent', message: value })],
    });
    return signedData;
  };

  // ========== Agent Wallet Functions ==========

  // Get ethers signer from Privy embedded wallet
  // Note: This may be hijacked by MetaMask extension, use signWithPrivyWallet for embedded wallets
  const getEthersSigner = async () => {
    if (!primaryWallet) throw new Error('No wallet connected');
    const ethereumProvider = await primaryWallet.getEthereumProvider();
    if (!ethereumProvider) throw new Error('No provider available');
    const provider = new ethers.BrowserProvider(ethereumProvider);
    return await provider.getSigner();
  };

  /**
   * Get the wallet to use for signing (respects selectedTradingWalletAddress)
   * This ensures we use the correct wallet for Hyperliquid operations
   */
  const getSigningWallet = () => {
    // Must use wallet from useWallets hook, not the stub from user.wallet
    if (!walletsReady) {
      throw new Error('Wallets not ready. Please wait a moment and try again.');
    }

    // If user has selected an external wallet, use it
    if (selectedTradingWalletAddress) {
      const selectedWallet = wallets.find(
        w => w.address?.toLowerCase() === selectedTradingWalletAddress.toLowerCase()
      );
      if (selectedWallet) {
        console.log('🔐 Using selected external wallet for signing:', selectedWallet.address);
        return selectedWallet;
      }
    }

    // Default: Find the embedded wallet from useWallets
    const embeddedWallet = wallets.find(w => w.walletClientType === 'privy');
    if (embeddedWallet) {
      return embeddedWallet;
    }

    // Fall back to first wallet if no embedded wallet
    if (wallets.length > 0) {
      return wallets[0];
    }

    throw new Error('No wallet available. Please ensure you are logged in.');
  };

  // Alias for backward compatibility
  const getRealPrivyWallet = getSigningWallet;

  /**
   * Sign typed data using the appropriate wallet provider
   * - For embedded wallets: use Privy's provider
   * - For external wallets (MetaMask, etc.): use window.ethereum directly
   */
  const signWithPrivyWallet = async (domain, types, message, primaryType = 'AgentApproval') => {
    // Get the wallet to use for signing
    const realWallet = getRealPrivyWallet();
    const isExternalWallet = realWallet.walletClientType !== 'privy';

    console.log('🔐 [Signing] Wallet info:', {
      address: realWallet.address,
      type: realWallet.walletClientType,
      isExternal: isExternalWallet,
      chainId: realWallet.chainId,
    });

    let provider;
    
    if (isExternalWallet) {
      // For external wallets, use window.ethereum directly
      // This ensures MetaMask/Rabby handles the signing, not Privy
      if (!window.ethereum) {
        throw new Error('No wallet extension found. Please install MetaMask or Rabby.');
      }
      provider = window.ethereum;
      console.log('🔐 [Signing] Using external wallet provider (window.ethereum)');
      
      // Switch chain if needed
      const requiredChainId = domain.chainId;
      if (requiredChainId) {
        const chainIdHex = '0x' + requiredChainId.toString(16);
        try {
          // First check current chain
          const currentChainHex = await provider.request({ method: 'eth_chainId' });
          const currentChainId = parseInt(currentChainHex, 16);
          
          console.log('🔗 [Chain] Required:', requiredChainId, 'Current:', currentChainId);
          
          if (currentChainId !== requiredChainId) {
            console.log('🔄 [Chain] Switching to:', requiredChainId);
            try {
              await provider.request({
                method: 'wallet_switchEthereumChain',
                params: [{ chainId: chainIdHex }],
              });
              console.log('✅ [Chain] Switched successfully');
              await new Promise(resolve => setTimeout(resolve, 500));
            } catch (switchError) {
              // If chain not added, try to add it
              if (switchError.code === 4902) {
                const chainName = requiredChainId === 421614 ? 'Arbitrum Sepolia' : 'Arbitrum One';
                const rpcUrl = requiredChainId === 421614 
                  ? 'https://sepolia-rollup.arbitrum.io/rpc'
                  : 'https://arb1.arbitrum.io/rpc';
                await provider.request({
                  method: 'wallet_addEthereumChain',
                  params: [{
                    chainId: chainIdHex,
                    chainName,
                    rpcUrls: [rpcUrl],
                    nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
                  }],
                });
              } else {
                throw switchError;
              }
            }
          }
        } catch (chainError) {
          console.error('❌ [Chain] Error:', chainError);
          const chainName = requiredChainId === 421614 ? 'Arbitrum Sepolia (Testnet)' : 'Arbitrum One (Mainnet)';
          throw new Error(
            `Please switch your wallet to ${chainName} (Chain ID: ${requiredChainId}) and try again.`
          );
        }
      }
      
      // Verify the wallet address matches what we expect
      const accounts = await provider.request({ method: 'eth_accounts' });
      if (!accounts || accounts.length === 0) {
        throw new Error('No accounts connected. Please connect your wallet.');
      }
      
      const activeAccount = accounts[0].toLowerCase();
      if (activeAccount !== realWallet.address.toLowerCase()) {
        console.warn('⚠️ [Signing] Active account mismatch:', {
          expected: realWallet.address,
          actual: accounts[0],
        });
        throw new Error(
          `Please switch to account ${realWallet.address.slice(0, 6)}...${realWallet.address.slice(-4)} in your wallet and try again.\n\n` +
          `Currently active: ${accounts[0].slice(0, 6)}...${accounts[0].slice(-4)}`
        );
      }
    } else {
      // For Privy embedded wallet, use Privy's provider
      provider = await realWallet.getEthereumProvider();
      if (!provider) {
        throw new Error('Wallet provider not available. Please ensure your wallet is fully initialized.');
      }
      console.log('🔐 [Signing] Using Privy embedded wallet provider');
    }

    // Build EIP712Domain dynamically based on the domain object
    const eip712DomainFields = [];
    if (domain.name !== undefined) eip712DomainFields.push({ name: 'name', type: 'string' });
    if (domain.version !== undefined) eip712DomainFields.push({ name: 'version', type: 'string' });
    if (domain.chainId !== undefined) eip712DomainFields.push({ name: 'chainId', type: 'uint256' });
    if (domain.verifyingContract !== undefined) eip712DomainFields.push({ name: 'verifyingContract', type: 'address' });

    // Format the typed data for EIP-712
    const typedData = {
      types: {
        EIP712Domain: eip712DomainFields,
        ...types,
      },
      domain,
      primaryType,
      message,
    };

    console.log('📝 [Privy] Requesting signature for:', primaryType);

    // Use the provider's request method directly
    // Privy's embedded wallet provider handles this internally without MetaMask
    const signature = await provider.request({
      method: 'eth_signTypedData_v4',
      params: [realWallet.address, JSON.stringify(typedData)],
    });

    console.log('✅ [Privy] Signature obtained');
    return signature;
  };

  // Note: isSimulationMode and effectiveChainId are defined earlier in the component

  // Load existing Agent on mount or when network/wallet changes
  useEffect(() => {
    if (authenticated && primaryWallet?.address) {
      const existingAgent = getCurrentAgent(effectiveChainId);
      if (existingAgent && existingAgent.mainWallet?.toLowerCase() === primaryWallet.address.toLowerCase()) {
        console.log('AuthContext: Loaded existing Agent for chain', effectiveChainId, ':', existingAgent.address);
        setAgentWallet(existingAgent);
        setIsAgentActive(true);
      } else {
        // No agent found for this chain/wallet combination, clear state
        console.log('AuthContext: No agent found for chain', effectiveChainId, ', clearing state');
        setAgentWallet(null);
        setIsAgentActive(false);
      }
    } else {
      // Not authenticated or no wallet, clear agent state
      setAgentWallet(null);
      setIsAgentActive(false);
    }
  }, [authenticated, primaryWallet?.address, effectiveChainId]);

  /**
   * Create a new Agent Wallet
   * 1. Generate random Agent keypair
   * 2. Sign approval with embedded wallet (EIP-712) using Privy native method
   * 3. Register Agent on Hyperliquid
   * 4. Save Agent locally
   */
  const createAgent = async (permissions = {}, agentName = '') => {
    if (!primaryWallet?.address) {
      throw new Error('No wallet connected. Please login first.');
    }

    // Ensure wallets are ready before attempting to sign
    if (!walletsReady) {
      throw new Error('Wallets are still initializing. Please wait a moment and try again.');
    }

    try {
      const signingWallet = getSigningWallet();
      console.log('🔧 Creating Agent Wallet...');
      console.log('📍 Signing wallet:', signingWallet.address);
      console.log('📍 Wallet type:', signingWallet.walletClientType);
      console.log('📍 Is external wallet:', selectedTradingWalletAddress ? 'Yes' : 'No');
      console.log('📍 Available wallets:', wallets.map(w => ({ address: w.address, type: w.walletClientType })));

      // 1. Generate Agent keypair
      const { privateKey, address } = generateAgentWallet();
      console.log('📝 Generated Agent address:', address);

      // 2. Set permissions with effective chainId
      const timestamp = Date.now();
      const expirationTime = permissions.expirationTime || (timestamp + 24 * 60 * 60 * 1000); // 24 hours
      const signedPermissions = {
        ...permissions,
        chainId: effectiveChainId,
        expirationTime,
        maxOrderSize: permissions.maxOrderSize || 10000,
        nonce: timestamp,
      };

      // 3. Sign approval with the selected wallet
      console.log('📝 Requesting wallet signature for Agent approval...');
      console.log('📍 Wallet being used:', signingWallet.address);

      // EIP-712 Domain for our app
      const domain = {
        name: 'PromptTrading Agent Authorization',
        version: '1',
        chainId: effectiveChainId,
      };

      // Agent approval types
      const types = {
        AgentApproval: [
          { name: 'agentAddress', type: 'address' },
          { name: 'maxOrderSize', type: 'uint256' },
          { name: 'expirationTime', type: 'uint256' },
          { name: 'nonce', type: 'uint256' },
        ],
      };

      // Message to sign
      const message = {
        agentAddress: address,
        maxOrderSize: ethers.parseUnits((signedPermissions.maxOrderSize || 1000).toString(), 6).toString(),
        expirationTime: Math.floor(expirationTime / 1000),
        nonce: timestamp,
      };

      // Sign using Privy wallet directly
      const signature = await signWithPrivyWallet(domain, types, message, 'AgentApproval');
      console.log('✅ Agent approval signature obtained');

      // 4. Register Agent on Hyperliquid
      if (effectiveChainId === 421614 || effectiveChainId === 42161) {
        console.log('📤 Registering Agent on Hyperliquid...');

        const isTestnet = effectiveChainId === 421614;
        const hyperliquidAPI = isTestnet
          ? 'https://api.hyperliquid-testnet.xyz/exchange'
          : 'https://api.hyperliquid.xyz/exchange';

        // Sign the Hyperliquid-specific approval using Privy wallet
        const hyperliquidApproval = await signHyperliquidAgentApprovalWithPrivy(address, agentName, effectiveChainId);

        const registerPayload = {
          action: hyperliquidApproval.action,
          nonce: hyperliquidApproval.action.nonce,
          signature: {
            r: hyperliquidApproval.r,
            s: hyperliquidApproval.s,
            v: hyperliquidApproval.v,
          },
        };

        const response = await fetch(hyperliquidAPI, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(registerPayload),
        });

        const result = await response.json();
        if (result.status !== 'ok') {
          throw new Error(`Hyperliquid registration failed: ${result.response || 'Unknown error'}`);
        }
        console.log('✅ Agent registered on Hyperliquid');
      }

      // 5. Save Agent locally (use signingWallet.address to ensure consistency)
      const agentData = await saveAgent(
        privateKey,
        address,
        signingWallet.address,
        signedPermissions,
        signature,
        agentName
      );

      // 6. Update state
      setAgentWallet(agentData);
      setIsAgentActive(true);

      console.log('✅ Agent Wallet created successfully!');
      return agentData;
    } catch (error) {
      console.error('❌ Failed to create Agent:', error);
      throw error;
    }
  };

  /**
   * Sign Hyperliquid-specific Agent approval
   * Uses the selected trading wallet (embedded or external)
   */
  const signHyperliquidAgentApprovalWithPrivy = async (agentAddress, agentName, chainId) => {
    const isTestnet = chainId === 421614;
    const timestamp = Date.now();

    // Hyperliquid action structure
    const action = {
      type: 'approveAgent',
      hyperliquidChain: isTestnet ? 'Testnet' : 'Mainnet',
      signatureChainId: chainId === 421614 ? '0x66eee' : '0xa4b1',
      agentAddress: agentAddress,
      agentName: agentName || null,
      nonce: timestamp,
    };

    // EIP-712 domain for Hyperliquid
    const domain = {
      name: 'HyperliquidSignTransaction',
      version: '1',
      chainId: chainId,
      verifyingContract: '0x0000000000000000000000000000000000000000',
    };

    // Hyperliquid Agent types
    const types = {
      'HyperliquidTransaction:ApproveAgent': [
        { name: 'hyperliquidChain', type: 'string' },
        { name: 'agentAddress', type: 'address' },
        { name: 'agentName', type: 'string' },
        { name: 'nonce', type: 'uint64' },
      ],
    };

    const message = {
      hyperliquidChain: action.hyperliquidChain,
      agentAddress: action.agentAddress,
      agentName: action.agentName || '',
      nonce: action.nonce,
    };

    // Sign using the selected wallet (embedded or external)
    const signature = await signWithPrivyWallet(domain, types, message, 'HyperliquidTransaction:ApproveAgent');

    // Parse signature
    const sig = ethers.Signature.from(signature);
    return {
      action,
      r: sig.r,
      s: sig.s,
      v: sig.v,
    };
  };

  /**
   * Revoke Agent Wallet
   */
  const revokeAgent = async () => {
    const currentAgent = getCurrentAgent(effectiveChainId);
    if (!currentAgent) {
      clearAgent(effectiveChainId);
      setAgentWallet(null);
      setIsAgentActive(false);
      return;
    }

    try {
      console.log('🗑️ Revoking Agent Wallet...');

      const agentChainId = currentAgent.permissions.chainId;
      const agentIsTestnet = agentChainId === 421614;

      // Sign revoke request for Hyperliquid using Privy wallet
      if (agentChainId === 421614 || agentChainId === 42161) {
        const hyperliquidAPI = agentIsTestnet
          ? 'https://api.hyperliquid-testnet.xyz/exchange'
          : 'https://api.hyperliquid.xyz/exchange';

        const revokeAction = await signHyperliquidAgentRevokeWithPrivy(currentAgent.agentName, agentChainId);

        const response = await fetch(hyperliquidAPI, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: revokeAction.action,
            nonce: revokeAction.action.nonce,
            signature: {
              r: revokeAction.r,
              s: revokeAction.s,
              v: revokeAction.v,
            },
          }),
        });

        const result = await response.json();
        if (result.status === 'ok') {
          console.log('✅ Agent revoked on Hyperliquid');
        } else {
          console.warn('⚠️ Hyperliquid revoke failed:', result);
        }
      }

      // Clear local data for this specific chain
      clearAgent(agentChainId);
      setAgentWallet(null);
      setIsAgentActive(false);

      console.log('✅ Agent revoked');
    } catch (error) {
      console.error('❌ Failed to revoke Agent:', error);
      // Clear local data even if Hyperliquid fails
      clearAgent(effectiveChainId);
      setAgentWallet(null);
      setIsAgentActive(false);
      throw error;
    }
  };

  /**
   * Sign Hyperliquid Agent revoke using Privy wallet directly
   */
  const signHyperliquidAgentRevokeWithPrivy = async (agentName, chainId) => {
    const isTestnet = chainId === 421614;
    const timestamp = Date.now();

    const action = {
      type: 'approveAgent',
      hyperliquidChain: isTestnet ? 'Testnet' : 'Mainnet',
      signatureChainId: chainId === 421614 ? '0x66eee' : '0xa4b1',
      agentAddress: '0x0000000000000000000000000000000000000000', // Zero address = revoke
      agentName: agentName || null,
      nonce: timestamp,
    };

    const domain = {
      name: 'HyperliquidSignTransaction',
      version: '1',
      chainId: chainId,
      verifyingContract: '0x0000000000000000000000000000000000000000',
    };

    const types = {
      'HyperliquidTransaction:ApproveAgent': [
        { name: 'hyperliquidChain', type: 'string' },
        { name: 'agentAddress', type: 'address' },
        { name: 'agentName', type: 'string' },
        { name: 'nonce', type: 'uint64' },
      ],
    };

    const message = {
      hyperliquidChain: action.hyperliquidChain,
      agentAddress: action.agentAddress,
      agentName: action.agentName || '',
      nonce: action.nonce,
    };

    // Sign using Privy wallet directly (bypasses MetaMask)
    const signature = await signWithPrivyWallet(domain, types, message, 'HyperliquidTransaction:ApproveAgent');
    const sig = ethers.Signature.from(signature);

    return {
      action,
      r: sig.r,
      s: sig.s,
      v: sig.v,
    };
  };

  /**
   * Revoke a specific Agent by name (used by AgentListModal)
   * This allows revoking any Agent, not just the currently active one
   */
  const revokeAgentByName = async (agentName, chainId = effectiveChainId) => {
    if (!primaryWallet?.address) {
      throw new Error('No wallet connected');
    }

    try {
      console.log('🗑️ Revoking Agent by name:', agentName);

      const isTestnet = chainId === 421614;
      const hyperliquidAPI = isTestnet
        ? 'https://api.hyperliquid-testnet.xyz/exchange'
        : 'https://api.hyperliquid.xyz/exchange';

      // Sign revoke request using Privy wallet
      const revokeAction = await signHyperliquidAgentRevokeWithPrivy(agentName, chainId);

      const response = await fetch(hyperliquidAPI, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: revokeAction.action,
          nonce: revokeAction.action.nonce,
          signature: {
            r: revokeAction.r,
            s: revokeAction.s,
            v: revokeAction.v,
          },
        }),
      });

      const result = await response.json();
      if (result.status === 'ok') {
        console.log('✅ Agent revoked successfully');
        return { success: true };
      } else {
        console.warn('⚠️ Hyperliquid revoke failed:', result);
        throw new Error(result.response || 'Revoke failed');
      }
    } catch (error) {
      console.error('❌ Failed to revoke Agent:', error);
      throw error;
    }
  };

  /**
   * Get Agent private key (for signing trades)
   */
  const getAgentKey = async () => {
    if (!primaryWallet?.address) return null;
    return await getAgentPrivateKey(primaryWallet.address, effectiveChainId);
  };

  /**
   * Load existing Agent from storage
   */
  const loadExistingAgent = () => {
    const agent = getCurrentAgent(effectiveChainId);
    if (agent && agent.mainWallet?.toLowerCase() === primaryWallet?.address?.toLowerCase()) {
      setAgentWallet(agent);
      setIsAgentActive(true);
      return agent;
    }
    return null;
  };

  // Get formatted Agent info for UI and API
  const agentInfo = useMemo(() => {
    if (!agentWallet) return null;
    return formatAgentInfo(agentWallet, effectiveChainId);
  }, [agentWallet, effectiveChainId]);

  const contextValue = {
    // Auth state
    ready,
    authenticated,
    user,
    userInfo: userDisplayInfo,

    // Backend sync state
    backendUser,
    syncStatus,
    syncWithBackend,

    // Access Token (for components that need it directly)
    accessToken,

    // Wallet state
    wallets,
    primaryWallet,
    walletsReady,
    walletAddress: primaryWallet?.address || null,
    chainId: primaryWallet?.chainId || null,
    
    // 方案 A: 嵌入式钱包专用于交易
    // embeddedWallet: Privy 嵌入式钱包（唯一，用于签名）
    // embeddedWalletAddress: 用于派生 Safe 地址的固定地址
    embeddedWallet,
    embeddedWalletAddress,

    // Trading wallet selection (for Hyperliquid)
    // Allows using external wallet instead of embedded wallet
    selectedTradingWalletAddress,
    selectTradingWallet,

    // Solana wallet (for DFlow/Kalshi trading)
    solanaWallets,
    solanaWalletsReady,
    primarySolanaWallet,
    solanaWalletAddress,
    isSolanaWalletReady,
    createSolanaWallet: createSolanaWalletFn,
    signSolanaTransaction,
    signAndSendSolanaTransaction,
    signSolanaMessage,

    // Auth actions
    login,
    logout: async () => {
      setUserAddress('');
      setBackendUser(null);
      setSyncStatus('idle');
      setAccessToken(null);
      // Clear Agent on logout
      clearAgent();
      setAgentWallet(null);
      setIsAgentActive(false);
      await logout();
    },

    // Account linking
    linkEmail,
    linkGoogle,
    linkApple,
    linkWallet,
    unlinkEmail,
    unlinkGoogle,
    unlinkApple,
    unlinkWallet,

    // Token
    getAccessToken,

    // Wallet operations
    getProvider,
    switchChain,
    signMessage,
    signTypedData,
    signWithPrivyWallet,
    exportWalletPrivateKey,
    getEthersSigner,

    // Agent Wallet
    agentWallet,
    isAgentActive,
    agentInfo,
    createAgent,
    revokeAgent,
    revokeAgentByName,
    getAgentKey,
    loadExistingAgent,
    effectiveChainId,
  };

  return <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>;
};

export default AuthProvider;
