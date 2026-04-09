/**
 * UserMenu Component
 * Dropdown menu showing user info, wallet, funding options, and logout
 *
 * Features:
 * - Multi-chain support (Arbitrum for Hyperliquid, Polygon for Polymarket)
 * - USDC balance display based on current trading mode
 * - Dynamic Fund Wallet with chain selection
 * - Link accounts (Wallet, Email, Google)
 * - Protected by Privy branding
 * - Polymarket 模式: 显示 Safe 地址作为"交易账户"
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  User,
  Wallet,
  Copy,
  Check,
  LogOut,
  ExternalLink,
  RefreshCw,
  ChevronDown,
  Mail,
  Loader2,
  AlertTriangle,
  Link,
  PlusCircle,
  Shield,
  Zap,
  DollarSign,
  Sparkles,
} from 'lucide-react';
import { useFundWallet, useLinkAccount } from '@privy-io/react-auth';
import { useFundWallet as useFundSolanaWallet } from '@privy-io/react-auth/solana';
import { arbitrum, polygon } from 'viem/chains';
import { useAuth } from '../../contexts/AuthContext';
import { useAppStore } from '../../contexts/useAppStore';
import { useSafeWallet } from '../../contexts/SafeWalletContext';
import { useWallet } from '../../contexts/WalletContext';
import { AICreditsPanel, RechargeModal } from '../credits';

// USDC Contract addresses per chain
const USDC_CONTRACTS = {
  arbitrum: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', // Arbitrum One - Native USDC
  polygon: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',   // Polygon - USDC.e (bridged) - Polymarket 只支持这个！
};

// Chain configurations
const CHAIN_CONFIG = {
  hyperliquid: {
    chain: arbitrum,
    chainId: 42161,
    name: 'Arbitrum One',
    symbol: 'ETH',
    usdcContract: USDC_CONTRACTS.arbitrum,
    explorer: 'https://arbiscan.io',
    rpcUrl: 'https://arb1.arbitrum.io/rpc',
  },
  polymarket: {
    chain: polygon,
    chainId: 137,
    name: 'Polygon',
    symbol: 'POL',
    usdcContract: USDC_CONTRACTS.polygon,
    explorer: 'https://polygonscan.com',
    rpcUrl: 'https://polygon-rpc.com', // Polygon 官方 RPC
  },
};

// ERC20 balanceOf ABI
const ERC20_BALANCE_ABI = ['function balanceOf(address) view returns (uint256)'];

export const UserMenu = ({ language = 'en' }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copiedSafe, setCopiedSafe] = useState(false);
  const [copiedSolana, setCopiedSolana] = useState(false);
  const [nativeBalance, setNativeBalance] = useState(null);
  const [usdcBalance, setUsdcBalance] = useState(null);
  const [loadingBalance, setLoadingBalance] = useState(false);

  const {
    authenticated,
    userInfo,
    walletAddress,
    primaryWallet,
    walletsReady,
    logout,
    getProvider,
    linkWallet,
    linkEmail,
    linkGoogle,
    // Solana wallet
    solanaWalletAddress,
    isSolanaWalletReady,
  } = useAuth();

  // Multi-chain wallet state
  const {
    solanaBalance,
    solBalance,
    solBalanceLoading,
    refreshSolanaBalance,
  } = useWallet();

  // Safe 钱包状态 (Polymarket 模式)
  const {
    safeAddress,
    isReady: safeReady,
    isInitializing: safeInitializing,
    initProgress: safeInitProgress,
    initError: safeInitError,
    usdcBalance: safeUsdcBalance,
    loadingBalance: safeLoadingBalance,
    initializeSafe,
    refreshBalance: refreshSafeBalance,
    isPolymarketMode,
  } = useSafeWallet();

  // Privy hooks - EVM
  const { fundWallet } = useFundWallet();
  // Privy hooks - Solana
  const { fundWallet: fundSolanaWallet } = useFundSolanaWallet();
  const { linkWallet: privyLinkWallet } = useLinkAccount({
    onSuccess: (user, linkedAccount) => {
      console.log('✅ Account linked:', linkedAccount);
    },
    onError: (error) => {
      console.error('❌ Link account error:', error);
    },
  });

  // Get current trading mode from store
  const tradingMode = useAppStore((state) => state.tradingMode);
  const networkStatus = useAppStore((state) => state.networkStatus);
  const hasHydrated = useAppStore((state) => state._hasHydrated);

  // Get chain config based on trading mode
  const currentChainConfig = CHAIN_CONFIG[tradingMode] || CHAIN_CONFIG.hyperliquid;

  // Track current fetch to prevent stale results
  const fetchIdRef = useRef(0);

  // Check if user needs to link external wallet for trading
  const isNonCryptoSignup = userInfo?.email || userInfo?.google;
  const hasExternalWallet = userInfo?.hasLinkedWallet;
  const needsExternalWalletForTrading = isNonCryptoSignup && !hasExternalWallet;

  // Fetch balances (native + USDC) based on current chain
  // Uses fetchId to prevent stale results from overwriting newer data
  const fetchBalances = useCallback(async (chainConfig, fetchId) => {
    if (!primaryWallet?.address) {
      setNativeBalance(null);
      setUsdcBalance(null);
      return;
    }

    setLoadingBalance(true);
    try {
      const { rpcUrl, usdcContract } = chainConfig;

      // Fetch native balance
      const nativeResponse = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'eth_getBalance',
          params: [primaryWallet.address, 'latest'],
          id: 1,
        }),
      });
      const nativeData = await nativeResponse.json();
      
      // Check if this fetch is still current
      if (fetchIdRef.current !== fetchId) return;
      
      if (nativeData.result) {
        const balanceWei = BigInt(nativeData.result);
        const balanceEth = Number(balanceWei) / 1e18;
        setNativeBalance(balanceEth.toFixed(4));
      }

      // Fetch USDC balance
      // balanceOf(address) = 0x70a08231
      const balanceOfData = '0x70a08231000000000000000000000000' + primaryWallet.address.slice(2);
      const usdcResponse = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'eth_call',
          params: [
            {
              to: usdcContract,
              data: balanceOfData,
            },
            'latest',
          ],
          id: 2,
        }),
      });
      const usdcData = await usdcResponse.json();
      
      // Check if this fetch is still current
      if (fetchIdRef.current !== fetchId) return;
      
      if (usdcData.result && usdcData.result !== '0x') {
        const usdcWei = BigInt(usdcData.result);
        // USDC has 6 decimals
        const usdcAmount = Number(usdcWei) / 1e6;
        setUsdcBalance(usdcAmount.toFixed(2));
      } else {
        setUsdcBalance('0.00');
      }
    } catch (error) {
      console.error('Error fetching balances:', error);
      if (fetchIdRef.current === fetchId) {
        setNativeBalance(null);
        setUsdcBalance(null);
      }
    } finally {
      if (fetchIdRef.current === fetchId) {
        setLoadingBalance(false);
      }
    }
  }, [primaryWallet?.address]);

  // Wrapper for manual refresh button
  const handleRefreshBalance = useCallback(() => {
    const fetchId = ++fetchIdRef.current;
    fetchBalances(currentChainConfig, fetchId);
  }, [fetchBalances, currentChainConfig]);

  // Fetch balances when wallet or trading mode changes
  // Wait for store hydration to ensure tradingMode is loaded from localStorage
  useEffect(() => {
    if (!primaryWallet?.address || !hasHydrated) return;

    // Clear old balances immediately when mode changes
    setNativeBalance(null);
    setUsdcBalance(null);
    setLoadingBalance(true);

    // Increment fetch ID to invalidate any in-flight requests
    const fetchId = ++fetchIdRef.current;
    
    // Get the correct chain config for current mode
    const chainConfig = CHAIN_CONFIG[tradingMode] || CHAIN_CONFIG.hyperliquid;
    
    fetchBalances(chainConfig, fetchId);
  }, [primaryWallet?.address, tradingMode, hasHydrated, fetchBalances]);

  // Use walletAddress from primaryWallet, or fallback to userInfo.embeddedWalletAddress
  const displayWalletAddress = walletAddress || userInfo?.embeddedWalletAddress;

  const copyAddress = () => {
    if (displayWalletAddress) {
      navigator.clipboard.writeText(displayWalletAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const copySafeAddress = () => {
    if (safeAddress) {
      navigator.clipboard.writeText(safeAddress);
      setCopiedSafe(true);
      setTimeout(() => setCopiedSafe(false), 2000);
    }
  };

  const copySolanaAddress = () => {
    if (solanaWalletAddress) {
      navigator.clipboard.writeText(solanaWalletAddress);
      setCopiedSolana(true);
      setTimeout(() => setCopiedSolana(false), 2000);
    }
  };

  // Polymarket 模式下显示的"交易账户"地址（Safe 地址）
  const tradingAccountAddress = isPolymarketMode ? safeAddress : displayWalletAddress;
  const tradingAccountBalance = isPolymarketMode ? safeUsdcBalance : usdcBalance;

  // 备用充值弹窗状态（如果 Privy fundWallet 失败时使用）
  const [showDepositModal, setShowDepositModal] = useState(false);

  // AI Credits 面板状态
  const [showAICreditsPanel, setShowAICreditsPanel] = useState(false);
  const [showRechargeModal, setShowRechargeModal] = useState(false);
  const [rechargeAmount, setRechargeAmount] = useState(20);

  // Handle Fund Wallet with dynamic chain based on trading mode
  // Privy fundWallet 支持向任意地址充值 ("to any given wallet")
  // Polymarket 模式直接向 Safe 地址充值
  const handleFundWallet = async () => {
    // 检查 fundWallet 函数是否可用
    if (!fundWallet) {
      console.error('❌ Fund Wallet: fundWallet function not available from Privy');
      alert('充值功能未启用，请检查 Privy Dashboard 配置');
      return;
    }

    // 确定目标地址：Polymarket 模式用 Safe 地址，其他模式用 EOA 地址
    const targetAddress = isPolymarketMode ? safeAddress : displayWalletAddress;
    
    if (!targetAddress) {
      console.error('❌ Fund Wallet: No wallet address available');
      if (isPolymarketMode) {
        // Safe 地址不可用，可能需要先初始化
        console.log('💡 Safe address not available, please initialize first');
        alert('请先初始化交易账户');
      } else {
        alert('钱包地址不可用');
      }
      return;
    }

    // Validate address format before calling Privy
    if (!targetAddress.startsWith('0x') || targetAddress.length !== 42) {
      console.error('❌ Fund Wallet: Invalid address format:', targetAddress);
      alert('无效的钱包地址格式');
      return;
    }

    console.log('💰 Fund Wallet called with:', {
      address: targetAddress,
      chain: currentChainConfig.chain.name,
      chainId: currentChainConfig.chainId,
      isPolymarketMode,
      isSafeAddress: isPolymarketMode,
    });

    try {
      // Privy SDK 支持向任意地址充值
      // See: https://docs.privy.io/wallets/funding/prompting-users-to-fund/evm
      // 
      // 使用 {erc20: address} 格式指定 USDC.e (Bridged USDC on Polygon)
      // 注意：指定 asset 后，信用卡选项会被隐藏（Privy 的预期行为）
      const fundOptions = {
        chain: currentChainConfig.chain,
      };
      
      // Polymarket 模式：指定 USDC.e 合约地址
      if (isPolymarketMode) {
        fundOptions.asset = { erc20: USDC_CONTRACTS.polygon }; // USDC.e: 0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174
      }
      
      console.log('💰 Fund options:', fundOptions);
      
      await fundWallet({
        address: targetAddress,
        options: fundOptions,
      });
      console.log('✅ Fund Wallet modal opened successfully');
    } catch (error) {
      console.error('❌ Fund Wallet error:', error);
      alert(`充值失败: ${error.message || '未知错误'}`);
    }
  };

  // 备用：手动充值说明（如果 Privy 不支持 Safe 地址时使用）
  const handleManualDeposit = () => {
    if (!safeAddress) {
      console.error('❌ Manual Deposit: Safe address not available');
      return;
    }
    setShowDepositModal(true);
  };

  // Solana USDC 充值（使用 Privy）
  const handleSolanaDeposit = async () => {
    if (!fundSolanaWallet) {
      console.error('❌ Solana Fund Wallet: fundSolanaWallet not available');
      alert('Solana 充值功能未启用');
      return;
    }

    if (!solanaWalletAddress) {
      console.error('❌ Solana Fund Wallet: No Solana wallet address');
      alert('Solana 钱包地址不可用');
      return;
    }

    console.log('💰 Solana Fund Wallet called with:', {
      address: solanaWalletAddress,
    });

    try {
      await fundSolanaWallet({
        address: solanaWalletAddress,
      });
      console.log('✅ Solana Fund Wallet modal opened');
    } catch (error) {
      console.error('❌ Solana Fund Wallet error:', error);
      alert(`充值失败: ${error.message || '未知错误'}`);
    }
  };

  // Handle link actions
  const handleLinkWallet = () => {
    if (linkWallet) {
      linkWallet();
    } else if (privyLinkWallet) {
      privyLinkWallet();
    }
  };

  const handleLinkEmail = () => {
    if (linkEmail) linkEmail();
  };

  const handleLinkGoogle = () => {
    if (linkGoogle) linkGoogle();
  };

  if (!authenticated) return null;

  const formatAddress = (addr) => {
    if (!addr) return '';
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  return (
    <div
      className="relative"
      onMouseEnter={() => setIsOpen(true)}
      onMouseLeave={() => setIsOpen(false)}
    >
      {/* Trigger Button */}
      <button
        className="flex items-center gap-2 px-3 py-1.5 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full text-white transition-all hover:opacity-90"
      >
        <div className="w-6 h-6 bg-white/20 rounded-full flex items-center justify-center">
          <User size={14} />
        </div>
        <span className="hidden sm:inline text-sm font-medium max-w-[100px] truncate">
          {userInfo?.displayName || 'User'}
        </span>
        <ChevronDown size={14} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute right-0 top-full pt-2 w-80 z-[9999]">
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-2xl overflow-hidden">
            {/* User Info Section */}
            <div className="p-4 bg-gradient-to-r from-blue-500/10 to-purple-500/10 border-b border-gray-200 dark:border-gray-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
                  <User size={20} className="text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-gray-900 dark:text-white font-medium truncate">
                    {userInfo?.displayName}
                  </div>
                  {userInfo?.email && (
                    <div className="flex items-center gap-1 text-gray-500 dark:text-gray-400 text-xs truncate">
                      <Mail size={10} />
                      {userInfo.email}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Main Content */}
            <div className="p-4 space-y-3 max-h-[60vh] overflow-y-auto">
              {/* Total Balance - Different display based on trading mode */}
              <div className="bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg p-3 text-white">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-white/80">
                    {language === 'zh' ? '总资产' : 'Total Balance'}
                  </span>
                  <button
                    onClick={() => {
                      if (isPolymarketMode) {
                        refreshSafeBalance?.();
                        refreshSolanaBalance?.();
                      } else {
                        handleRefreshBalance();
                      }
                    }}
                    className="p-1 hover:bg-white/20 rounded transition-colors"
                  >
                    <RefreshCw size={12} className={`${
                      isPolymarketMode 
                        ? (safeLoadingBalance || solanaBalance?.loading)
                        : loadingBalance
                      ? 'animate-spin' : ''}`} />
                  </button>
                </div>
                <div className="text-2xl font-bold mt-1">
                  {isPolymarketMode 
                    ? `$${((safeUsdcBalance || 0) + (solanaBalance?.balance || 0)).toFixed(2)}`
                    : `$${usdcBalance || '0.00'}`
                  }
                </div>
                <div className="text-xs text-white/70 mt-1">
                  {isPolymarketMode
                    ? `USDC ${language === 'zh' ? '跨链总计' : 'across chains'}`
                    : `USDC (${currentChainConfig.name})`
                  }
                </div>
              </div>

              {/* ========== Market Cards ========== */}

              {/* Polymarket Card */}
              {isPolymarketMode && (
                <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                  {/* Market Header */}
                  <div className="flex items-center justify-between px-3 py-2 bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/30 dark:to-emerald-900/30 border-b border-gray-200 dark:border-gray-700">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 bg-gradient-to-br from-green-400 to-emerald-500 rounded-lg flex items-center justify-center">
                        <span className="text-white text-xs font-bold">P</span>
                      </div>
                      <span className="font-semibold text-gray-900 dark:text-white">Polymarket</span>
                    </div>
                    {safeReady ? (
                      <span className="text-xs px-2 py-0.5 bg-green-100 dark:bg-green-500/20 text-green-600 dark:text-green-400 rounded-full flex items-center gap-1">
                        <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                        {language === 'zh' ? '已就绪' : 'Ready'}
                      </span>
                    ) : (
                      <span className="text-xs px-2 py-0.5 bg-yellow-100 dark:bg-yellow-500/20 text-yellow-600 dark:text-yellow-400 rounded-full">
                        {language === 'zh' ? '准备中' : 'Loading'}
                      </span>
                    )}
                  </div>

                  {/* Balance & Actions */}
                  <div className="p-3">
                    {safeAddress ? (
                      <>
                        {/* Balance Display */}
                        <div className="flex items-center justify-between mb-3">
                          <div>
                            <div className="text-xs text-gray-500 dark:text-gray-400">
                              {language === 'zh' ? '可用余额' : 'Available'}
                            </div>
                            <div className="text-xl font-bold text-gray-900 dark:text-white">
                              ${safeLoadingBalance ? '...' : safeUsdcBalance?.toFixed(2) || '0.00'}
                            </div>
                          </div>
                          <button
                            onClick={handleFundWallet}
                            disabled={!safeReady}
                            className="px-4 py-2 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 disabled:opacity-50 text-white rounded-lg transition-all text-sm font-medium"
                          >
                            {language === 'zh' ? '充值' : 'Deposit'}
                          </button>
                        </div>

                        {/* Wallet Details (Collapsible) */}
                        <details className="group">
                          <summary className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 cursor-pointer hover:text-gray-700 dark:hover:text-gray-300">
                            <ChevronDown size={12} className="transition-transform group-open:rotate-180" />
                            {language === 'zh' ? '钱包详情' : 'Wallet Details'}
                          </summary>
                          <div className="mt-2 p-2 bg-gray-50 dark:bg-gray-900/50 rounded-lg space-y-2">
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-gray-500 dark:text-gray-400">{language === 'zh' ? '网络' : 'Network'}</span>
                              <span className="text-gray-700 dark:text-gray-300">Polygon</span>
                            </div>
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-gray-500 dark:text-gray-400">{language === 'zh' ? '代币' : 'Token'}</span>
                              <span className="text-gray-700 dark:text-gray-300">USDC.e (Bridged)</span>
                            </div>
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-gray-500 dark:text-gray-400">{language === 'zh' ? '地址' : 'Address'}</span>
                              <div className="flex items-center gap-1">
                                <span className="text-gray-700 dark:text-gray-300 font-mono">{formatAddress(safeAddress)}</span>
                                <button onClick={copySafeAddress} className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded">
                                  {copiedSafe ? <Check size={10} className="text-green-500" /> : <Copy size={10} className="text-gray-400" />}
                                </button>
                                <a href={`https://polygonscan.com/address/${safeAddress}`} target="_blank" rel="noopener noreferrer" className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded">
                                  <ExternalLink size={10} className="text-gray-400" />
                                </a>
                              </div>
                            </div>
                          </div>
                        </details>
                      </>
                    ) : (
                      <div className="flex flex-col items-center gap-2 py-4">
                        <Loader2 size={20} className="animate-spin text-green-500" />
                        <span className="text-gray-600 dark:text-gray-300 text-sm">
                          {safeInitProgress || (language === 'zh' ? '正在准备...' : 'Preparing...')}
                        </span>
                        {safeInitError && (
                          <div className="text-xs text-red-500">{safeInitError}</div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Kalshi Card - Only show in Polymarket mode */}
              {isPolymarketMode && isSolanaWalletReady && solanaWalletAddress && (
                <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                  {/* Market Header */}
                  <div className="flex items-center justify-between px-3 py-2 bg-gradient-to-r from-purple-50 to-violet-50 dark:from-purple-900/30 dark:to-violet-900/30 border-b border-gray-200 dark:border-gray-700">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 bg-gradient-to-br from-purple-400 to-violet-500 rounded-lg flex items-center justify-center">
                        <span className="text-white text-xs font-bold">K</span>
                      </div>
                      <span className="font-semibold text-gray-900 dark:text-white">Kalshi</span>
                    </div>
                    <span className="text-xs px-2 py-0.5 bg-purple-100 dark:bg-purple-500/20 text-purple-600 dark:text-purple-400 rounded-full flex items-center gap-1">
                      <div className="w-1.5 h-1.5 rounded-full bg-purple-500" />
                      DFlow
                    </span>
                  </div>

                  {/* Balance & Actions */}
                  <div className="p-3">
                    {/* Balance Display */}
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          {language === 'zh' ? '可用余额' : 'Available'}
                        </div>
                        <div className="text-xl font-bold text-gray-900 dark:text-white">
                          ${solanaBalance?.loading ? '...' : solanaBalance?.balance?.toFixed(2) || '0.00'}
                        </div>
                      </div>
                      <button
                        onClick={handleSolanaDeposit}
                        className="px-4 py-2 bg-gradient-to-r from-purple-500 to-violet-600 hover:from-purple-600 hover:to-violet-700 text-white rounded-lg transition-all text-sm font-medium"
                      >
                        {language === 'zh' ? '充值' : 'Deposit'}
                      </button>
                    </div>

                    {/* Wallet Details (Collapsible) */}
                    <details className="group">
                      <summary className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 cursor-pointer hover:text-gray-700 dark:hover:text-gray-300">
                        <ChevronDown size={12} className="transition-transform group-open:rotate-180" />
                        {language === 'zh' ? '钱包详情' : 'Wallet Details'}
                      </summary>
                      <div className="mt-2 p-2 bg-gray-50 dark:bg-gray-900/50 rounded-lg space-y-2">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-gray-500 dark:text-gray-400">{language === 'zh' ? '网络' : 'Network'}</span>
                          <span className="text-gray-700 dark:text-gray-300">Solana</span>
                        </div>
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-gray-500 dark:text-gray-400">{language === 'zh' ? '代币' : 'Token'}</span>
                          <span className="text-gray-700 dark:text-gray-300">USDC (Native)</span>
                        </div>
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-gray-500 dark:text-gray-400">{language === 'zh' ? 'SOL余额' : 'SOL Balance'}</span>
                          <span className={`font-mono ${(solBalance || 0) < 0.005 ? 'text-red-500 font-semibold' : 'text-gray-700 dark:text-gray-300'}`}>
                            {solBalanceLoading ? (
                              <Loader2 size={10} className="animate-spin" />
                            ) : (
                              `${(solBalance || 0).toFixed(4)} SOL`
                            )}
                            {(solBalance || 0) < 0.005 && !solBalanceLoading && (
                              <span className="ml-1 text-red-500" title={language === 'zh' ? '需要至少 0.01 SOL 才能交易' : 'Need at least 0.01 SOL to trade'}>
                                ⚠️
                              </span>
                            )}
                          </span>
                        </div>
                        {(solBalance || 0) < 0.005 && !solBalanceLoading && (
                          <div className="text-xs text-red-500 bg-red-50 dark:bg-red-900/20 p-2 rounded">
                            {language === 'zh' 
                              ? '⚠️ 需要充值 SOL 才能交易（建议 0.01 SOL）' 
                              : '⚠️ Deposit SOL to trade (recommend 0.01 SOL)'}
                          </div>
                        )}
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-gray-500 dark:text-gray-400">{language === 'zh' ? '地址' : 'Address'}</span>
                          <div className="flex items-center gap-1">
                            <span className="text-gray-700 dark:text-gray-300 font-mono">{formatAddress(solanaWalletAddress)}</span>
                            <button onClick={copySolanaAddress} className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded">
                              {copiedSolana ? <Check size={10} className="text-green-500" /> : <Copy size={10} className="text-gray-400" />}
                            </button>
                            <a href={`https://solscan.io/account/${solanaWalletAddress}`} target="_blank" rel="noopener noreferrer" className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded">
                              <ExternalLink size={10} className="text-gray-400" />
                            </a>
                          </div>
                        </div>
                      </div>
                    </details>
                  </div>
                </div>
              )}
              
              {/* 非 Polymarket 模式: 原始钱包地址 */}
              {!isPolymarketMode && (
                <div className="bg-gray-100 dark:bg-gray-800/50 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
                      <Wallet size={12} />
                      {language === 'zh' ? '钱包地址' : 'Wallet Address'}
                    </span>
                    {displayWalletAddress && (primaryWallet?.walletClientType === 'privy' || userInfo?.hasEmbeddedWallet) && (
                      <span className="text-xs px-1.5 py-0.5 bg-purple-100 dark:bg-purple-500/20 text-purple-600 dark:text-purple-400 rounded">
                        {language === 'zh' ? '内置钱包' : 'Embedded'}
                      </span>
                    )}
                  </div>
                  {!walletsReady && !displayWalletAddress ? (
                    <div className="flex items-center gap-2 py-1">
                      <Loader2 size={14} className="animate-spin text-purple-500" />
                      <span className="text-gray-500 dark:text-gray-400 text-sm">
                        {language === 'zh' ? '正在加载钱包...' : 'Loading wallet...'}
                      </span>
                    </div>
                  ) : displayWalletAddress ? (
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-gray-900 dark:text-white font-mono text-sm">
                        {formatAddress(displayWalletAddress)}
                      </span>
                      <button
                        onClick={copyAddress}
                        className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
                        title={language === 'zh' ? '复制地址' : 'Copy address'}
                      >
                        {copied ? (
                          <Check size={14} className="text-green-400" />
                        ) : (
                          <Copy size={14} className="text-gray-600 dark:text-gray-400" />
                        )}
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 py-1">
                      <Loader2 size={14} className="animate-spin text-purple-500" />
                      <span className="text-gray-500 dark:text-gray-400 text-sm">
                        {language === 'zh' ? '正在创建钱包...' : 'Creating wallet...'}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Balances - Native + USDC (仅非 Polymarket 模式显示) */}
              {!isPolymarketMode && displayWalletAddress && (
                <div className="bg-gray-100 dark:bg-gray-800/50 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      {language === 'zh' ? '余额' : 'Balance'} ({currentChainConfig.name})
                    </div>
                    <button
                      onClick={handleRefreshBalance}
                      disabled={loadingBalance}
                      className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors disabled:opacity-50"
                      title={language === 'zh' ? '刷新余额' : 'Refresh'}
                    >
                      <RefreshCw
                        size={12}
                        className={`text-gray-600 dark:text-gray-400 ${loadingBalance ? 'animate-spin' : ''}`}
                      />
                    </button>
                  </div>
                  <div className="space-y-2">
                    {/* USDC Balance - Primary */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center">
                          <span className="text-white text-[10px] font-bold">$</span>
                        </div>
                        <span className="text-gray-600 dark:text-gray-300 text-sm">USDC</span>
                      </div>
                      <span className="text-gray-900 dark:text-white font-semibold">
                        {loadingBalance ? '...' : `${usdcBalance || '0.00'}`}
                      </span>
                    </div>
                    {/* Native Balance */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 bg-gray-500 rounded-full flex items-center justify-center">
                          <span className="text-white text-[10px] font-bold">
                            {currentChainConfig.symbol.charAt(0)}
                          </span>
                        </div>
                        <span className="text-gray-600 dark:text-gray-300 text-sm">
                          {currentChainConfig.symbol}
                        </span>
                      </div>
                      <span className="text-gray-900 dark:text-white font-semibold">
                        {loadingBalance ? '...' : `${nativeBalance || '0.0000'}`}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* AI Credits 管理按钮 */}
              <button
                onClick={() => {
                  setShowAICreditsPanel(true);
                  setIsOpen(false);
                }}
                className="flex items-center justify-center gap-2 w-full py-2.5 bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white rounded-lg transition-all text-sm font-medium shadow-sm"
              >
                <Sparkles size={16} />
                {language === 'zh' ? 'AI Credits' : 'AI Credits'}
              </button>

              {/* External Wallet Required Warning */}
              {needsExternalWalletForTrading && tradingMode === 'hyperliquid' && (
                <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 rounded-lg p-3">
                  <div className="flex items-start gap-2 mb-2">
                    <AlertTriangle size={16} className="text-amber-500 flex-shrink-0 mt-0.5" />
                    <div>
                      <div className="text-amber-700 dark:text-amber-400 text-sm font-medium">
                        {language === 'zh' ? '交易需要外部钱包' : 'External Wallet Required'}
                      </div>
                      <p className="text-amber-600 dark:text-amber-400/80 text-xs mt-1">
                        {language === 'zh'
                          ? '要在 Hyperliquid 上执行交易，请连接您的加密钱包。'
                          : 'To trade on Hyperliquid, please connect your crypto wallet.'}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={handleLinkWallet}
                    className="w-full flex items-center justify-center gap-2 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg transition-colors text-sm font-medium"
                  >
                    <Link size={14} />
                    {language === 'zh' ? '连接钱包' : 'Connect Wallet'}
                  </button>
                </div>
              )}

              {/* Logout Button */}
              <button
                onClick={logout}
                className="flex items-center justify-center gap-2 w-full py-2 bg-red-100 dark:bg-red-500/10 hover:bg-red-200 dark:hover:bg-red-500/20 text-red-600 dark:text-red-400 rounded-lg transition-colors text-sm"
              >
                <LogOut size={14} />
                {language === 'zh' ? '退出登录' : 'Log Out'}
              </button>
            </div>

            {/* Protected by Privy Footer */}
            <div className="px-4 py-3 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-center gap-1.5">
                <Shield size={12} className="text-gray-400" />
                <span className="text-xs text-gray-400">Protected by</span>
                <span className="text-xs font-semibold text-purple-500">Privy</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* AI Credits 管理面板 */}
      <AICreditsPanel
        isOpen={showAICreditsPanel}
        onClose={() => setShowAICreditsPanel(false)}
        onRecharge={(amount) => {
          setRechargeAmount(amount);
          setShowRechargeModal(true);
        }}
        language={language}
      />

      {/* AI Credits 充值弹窗 */}
      <RechargeModal
        isOpen={showRechargeModal}
        onClose={() => setShowRechargeModal(false)}
        initialAmount={rechargeAmount}
        language={language}
        onSuccess={(newBalance) => {
          console.log('✅ AI Credits recharged, new balance:', newBalance);
          setShowRechargeModal(false);
        }}
      />

      {/* Polymarket 充值说明弹窗 */}
      {showDepositModal && safeAddress && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[10000]" onClick={() => setShowDepositModal(false)}>
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl max-w-md w-full mx-4 overflow-hidden" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="p-4 bg-gradient-to-r from-green-500 to-emerald-600 text-white">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <DollarSign size={20} />
                {language === 'zh' ? '充值 USDC.e 到交易账户' : 'Deposit USDC.e to Trading Account'}
              </h3>
              <p className="text-sm text-white/80 mt-1">
                {language === 'zh' ? 'Polygon 网络 · 无需 Gas 费' : 'Polygon Network · Gasless'}
              </p>
            </div>

            {/* Content */}
            <div className="p-4 space-y-4">
              {/* 说明 */}
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                <p className="text-sm text-blue-800 dark:text-blue-300">
                  {language === 'zh' 
                    ? '将 USDC.e (Bridged USDC) 发送到以下地址即可开始交易。Polymarket 只支持 USDC.e！' 
                    : 'Send USDC.e (Bridged USDC) to the address below to start trading. Polymarket only supports USDC.e!'}
                </p>
              </div>

              {/* 地址显示 */}
              <div className="bg-gray-100 dark:bg-gray-800 rounded-lg p-4">
                <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                  {language === 'zh' ? '交易账户地址' : 'Trading Account Address'}
                </div>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-sm font-mono text-gray-900 dark:text-white break-all">
                    {safeAddress}
                  </code>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(safeAddress);
                      setCopiedSafe(true);
                      setTimeout(() => setCopiedSafe(false), 2000);
                    }}
                    className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors flex-shrink-0"
                  >
                    {copiedSafe ? (
                      <Check size={18} className="text-green-500" />
                    ) : (
                      <Copy size={18} className="text-gray-500" />
                    )}
                  </button>
                </div>
              </div>

              {/* 充值方式 */}
              <div className="space-y-2">
                <div className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {language === 'zh' ? '支持的充值方式：' : 'Supported deposit methods:'}
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-3 p-2 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                    <div className="w-8 h-8 bg-purple-500 rounded-full flex items-center justify-center">
                      <span className="text-white text-xs font-bold">U</span>
                    </div>
                    <div className="flex-1">
                      <div className="text-sm font-medium text-gray-900 dark:text-white">
                        USDC.e (Bridged)
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {language === 'zh' ? '从钱包转账 USDC.e (不是 Native USDC)' : 'Transfer USDC.e from wallet (not Native USDC)'}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-2 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                    <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center">
                      <span className="text-white text-xs font-bold">C</span>
                    </div>
                    <div className="flex-1">
                      <div className="text-sm font-medium text-gray-900 dark:text-white">
                        Coinbase / Exchange
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {language === 'zh' ? '提款 USDC.e 到此地址 (选择 Polygon-USDC.e)' : 'Withdraw USDC.e to this address (select Polygon-USDC.e)'}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* 警告 */}
              <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
                <div className="flex items-start gap-2">
                  <AlertTriangle size={16} className="text-amber-500 flex-shrink-0 mt-0.5" />
                  <div className="text-xs text-amber-700 dark:text-amber-400">
                    {language === 'zh' 
                      ? '⚠️ 重要：只发送 USDC.e (Bridged USDC)！Native USDC 无法用于 Polymarket 交易！' 
                      : '⚠️ Important: Only send USDC.e (Bridged USDC)! Native USDC cannot be used for Polymarket trading!'}
                  </div>
                </div>
              </div>

              {/* 外部链接 */}
              <a
                href={`https://polygonscan.com/address/${safeAddress}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full py-2 bg-purple-100 dark:bg-purple-500/10 hover:bg-purple-200 dark:hover:bg-purple-500/20 text-purple-600 dark:text-purple-400 rounded-lg transition-colors text-sm"
              >
                <ExternalLink size={14} />
                {language === 'zh' ? '在 Polygonscan 查看' : 'View on Polygonscan'}
              </a>
            </div>

            {/* Footer */}
            <div className="p-4 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-200 dark:border-gray-700">
              <button
                onClick={() => setShowDepositModal(false)}
                className="w-full py-2.5 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-800 dark:text-white rounded-lg transition-colors text-sm font-medium"
              >
                {language === 'zh' ? '关闭' : 'Close'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserMenu;
