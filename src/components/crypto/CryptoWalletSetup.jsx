/**
 * CryptoWalletSetup Component
 * 
 * Crypto Trading 模式下的钱包设置组件
 * 提供两种选项：
 * 1. 连接外部钱包（MetaMask）- 推荐给已有 Hyperliquid 账户的用户
 * 2. 使用嵌入式钱包 - 需要先入金，可导出私钥到 MetaMask
 */

import React, { useState, useCallback } from 'react';
import {
  Wallet,
  ExternalLink,
  Copy,
  Check,
  Key,
  AlertTriangle,
  Info,
  Link,
  Shield,
  ChevronDown,
  DollarSign,
  ArrowRight,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useAppStore } from '../../contexts/useAppStore';
import { useFundWallet, useLinkAccount } from '@privy-io/react-auth';
import { arbitrum } from 'viem/chains';

const cardClass = 'bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-700 rounded-2xl shadow-sm';

const CryptoWalletSetup = ({ language = 'en' }) => {
  const {
    authenticated,
    walletAddress,
    primaryWallet,
    userInfo,
    exportWalletPrivateKey,
    linkWallet,
    embeddedWalletAddress,
    selectedTradingWalletAddress,
    selectTradingWallet,
  } = useAuth();

  const tradingMode = useAppStore((state) => state.tradingMode);

  // State
  const [copied, setCopied] = useState(false);
  const [showExportGuide, setShowExportGuide] = useState(false);
  const [showFundingGuide, setShowFundingGuide] = useState(false);
  const [exportError, setExportError] = useState(null);

  // Privy hooks
  const { fundWallet } = useFundWallet();
  const { linkWallet: privyLinkWallet } = useLinkAccount({
    onSuccess: (user, linkedAccount) => {
      console.log('✅ Wallet linked:', linkedAccount);
    },
    onError: (error) => {
      console.error('❌ Link wallet error:', error);
    },
  });

  // Check if this is an embedded wallet (Privy)
  // Every user has an embedded wallet, but primaryWallet might be set to external if linked
  const isEmbeddedWallet = primaryWallet?.walletClientType === 'privy';
  const hasEmbeddedWallet = userInfo?.hasEmbeddedWallet || isEmbeddedWallet;
  const hasExternalWallet = userInfo?.hasLinkedWallet;

  // Debug logging
  console.log('[CryptoWalletSetup] Debug:', {
    tradingMode,
    authenticated,
    walletAddress,
    primaryWalletType: primaryWallet?.walletClientType,
    isEmbeddedWallet,
    hasEmbeddedWallet,
    hasExternalWallet,
    userInfo,
  });

  // Only show in Hyperliquid mode
  if (tradingMode !== 'hyperliquid' || !authenticated) {
    return null;
  }

  const copyAddress = () => {
    if (walletAddress) {
      navigator.clipboard.writeText(walletAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const formatAddress = (addr) => {
    if (!addr) return '';
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  // Handle connect external wallet
  const handleConnectWallet = () => {
    if (linkWallet) {
      linkWallet();
    } else if (privyLinkWallet) {
      privyLinkWallet();
    }
  };

  // Handle export private key
  const handleExportPrivateKey = async () => {
    if (!isEmbeddedWallet && !hasEmbeddedWallet) {
      setExportError(language === 'zh' 
        ? '只有嵌入式钱包可以导出私钥' 
        : 'Only embedded wallets can export private key');
      return;
    }

    setExportError(null);

    try {
      // Privy's exportWallet opens a modal - it handles the UI
      // We don't need to show a loading state since Privy shows their own modal
      await exportWalletPrivateKey();
    } catch (error) {
      console.error('Export error:', error);
      setExportError(error.message || (language === 'zh' ? '导出失败' : 'Export failed'));
    }
    // No loading state needed - Privy handles the modal UI
  };

  // Handle fund wallet
  const handleFundWallet = async () => {
    if (!fundWallet || !walletAddress) return;

    try {
      await fundWallet({
        address: walletAddress,
        options: {
          chain: arbitrum,
        },
      });
    } catch (error) {
      console.error('Fund wallet error:', error);
    }
  };

  return (
    <div className={`${cardClass} p-6`}>
      {/* Header */}
      <h3 className="text-gray-900 dark:text-white font-semibold text-lg mb-4 flex items-center gap-2">
        <Wallet className="text-blue-600 dark:text-blue-400" />
        {language === 'zh' ? 'Crypto Trading 设置' : 'Crypto Trading Setup'}
      </h3>

      {/* Current Trading Wallet Display */}
      <div className="mb-6 p-4 bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 border border-blue-200 dark:border-blue-700/50 rounded-xl">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
            {language === 'zh' ? '当前交易钱包' : 'Current Trading Wallet'}
          </span>
          <span className={`text-xs px-2 py-0.5 rounded-full ${
            isEmbeddedWallet 
              ? 'bg-purple-100 dark:bg-purple-500/20 text-purple-600 dark:text-purple-400'
              : 'bg-orange-100 dark:bg-orange-500/20 text-orange-600 dark:text-orange-400'
          }`}>
            {isEmbeddedWallet 
              ? (language === 'zh' ? '嵌入式钱包' : 'Embedded') 
              : (primaryWallet?.walletClientType || 'External')}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <code className="flex-1 text-sm font-mono text-gray-900 dark:text-white">
            {walletAddress || '...'}
          </code>
          <button
            onClick={copyAddress}
            className="p-2 hover:bg-white/50 dark:hover:bg-gray-700/50 rounded-lg transition-colors"
            title={language === 'zh' ? '复制地址' : 'Copy address'}
          >
            {copied ? (
              <Check size={16} className="text-green-500" />
            ) : (
              <Copy size={16} className="text-gray-500" />
            )}
          </button>
          <a
            href={`https://arbiscan.io/address/${walletAddress}`}
            target="_blank"
            rel="noopener noreferrer"
            className="p-2 hover:bg-white/50 dark:hover:bg-gray-700/50 rounded-lg transition-colors"
            title={language === 'zh' ? '在区块浏览器查看' : 'View on Explorer'}
          >
            <ExternalLink size={16} className="text-gray-500" />
          </a>
        </div>
        {/* Info about current wallet */}
        <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
          {language === 'zh' 
            ? '此地址将用于 Hyperliquid 交易。如需使用其他钱包，请在下方切换。'
            : 'This address will be used for Hyperliquid trading. Switch below if needed.'}
        </p>
      </div>

      {/* Wallet Selection */}
      <div className="mb-6">
        <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
          {language === 'zh' ? '选择交易钱包' : 'Select Trading Wallet'}
        </h4>
        <div className="space-y-2">
          {/* Embedded Wallet Option */}
          <button
            onClick={() => selectTradingWallet(null)}
            className={`w-full p-3 rounded-xl border-2 transition-all flex items-center gap-3 ${
              !selectedTradingWalletAddress
                ? 'border-blue-500 bg-blue-50 dark:bg-blue-500/10'
                : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
            }`}
          >
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
              !selectedTradingWalletAddress 
                ? 'bg-blue-500 text-white' 
                : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
            }`}>
              <Key size={16} />
            </div>
            <div className="flex-1 text-left">
              <div className="text-sm font-medium text-gray-900 dark:text-white">
                {language === 'zh' ? '嵌入式钱包' : 'Embedded Wallet'}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400 font-mono">
                {embeddedWalletAddress?.slice(0, 6)}...{embeddedWalletAddress?.slice(-4)}
              </div>
            </div>
            {!selectedTradingWalletAddress && (
              <Check size={18} className="text-blue-500" />
            )}
          </button>

          {/* External Wallets */}
          {userInfo?.externalWallets?.map((wallet, idx) => (
            <button
              key={idx}
              onClick={() => selectTradingWallet(wallet.address)}
              className={`w-full p-3 rounded-xl border-2 transition-all flex items-center gap-3 ${
                selectedTradingWalletAddress?.toLowerCase() === wallet.address?.toLowerCase()
                  ? 'border-orange-500 bg-orange-50 dark:bg-orange-500/10'
                  : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
              }`}
            >
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                selectedTradingWalletAddress?.toLowerCase() === wallet.address?.toLowerCase()
                  ? 'bg-orange-500 text-white' 
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
              }`}>
                <Wallet size={16} />
              </div>
              <div className="flex-1 text-left">
                <div className="text-sm font-medium text-gray-900 dark:text-white flex items-center gap-2">
                  {wallet.type || 'External Wallet'}
                  <span className="text-xs px-1.5 py-0.5 bg-green-100 dark:bg-green-500/20 text-green-600 dark:text-green-400 rounded">
                    {language === 'zh' ? '推荐' : 'Recommended'}
                  </span>
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 font-mono">
                  {wallet.address?.slice(0, 6)}...{wallet.address?.slice(-4)}
                </div>
              </div>
              {selectedTradingWalletAddress?.toLowerCase() === wallet.address?.toLowerCase() && (
                <Check size={18} className="text-orange-500" />
              )}
            </button>
          ))}

          {/* Connect New Wallet Button */}
          <button
            onClick={handleConnectWallet}
            className="w-full p-3 rounded-xl border-2 border-dashed border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500 transition-all flex items-center justify-center gap-2 text-gray-600 dark:text-gray-400"
          >
            <Link size={16} />
            <span className="text-sm">
              {language === 'zh' ? '连接新钱包 (MetaMask/Rabby)' : 'Connect New Wallet (MetaMask/Rabby)'}
            </span>
          </button>
        </div>
      </div>

      {/* Additional Options - Only show for embedded wallet */}
      {!selectedTradingWalletAddress && (
        <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
          <button
            onClick={() => setShowExportGuide(!showExportGuide)}
            className="w-full p-4 flex items-center gap-4 text-left hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
          >
            <div className="w-10 h-10 bg-gradient-to-br from-purple-400 to-purple-600 rounded-xl flex items-center justify-center flex-shrink-0">
              <Key size={20} className="text-white" />
            </div>
            <div className="flex-1">
              <div className="font-semibold text-gray-900 dark:text-white">
                {language === 'zh' ? '嵌入式钱包工具' : 'Embedded Wallet Tools'}
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {language === 'zh'
                  ? '导出私钥、入金指南'
                  : 'Export private key, funding guide'}
              </p>
            </div>
            <ChevronDown
              size={20}
              className={`text-gray-400 transition-transform ${showExportGuide ? 'rotate-180' : ''}`}
            />
          </button>

          {showExportGuide && (
            <div className="px-4 pb-4 space-y-4">
              {/* Action Buttons */}
              <div className="grid grid-cols-2 gap-3">
                {/* Export Private Key */}
                <button
                  onClick={handleExportPrivateKey}
                  className="flex items-center justify-center gap-2 py-3 bg-purple-100 dark:bg-purple-500/20 hover:bg-purple-200 dark:hover:bg-purple-500/30 text-purple-700 dark:text-purple-300 rounded-xl font-medium transition-all"
                >
                  <Key size={18} />
                  {language === 'zh' ? '导出私钥' : 'Export Key'}
                </button>

                {/* Fund Wallet */}
                <button
                  onClick={() => setShowFundingGuide(!showFundingGuide)}
                  className="flex items-center justify-center gap-2 py-3 bg-green-100 dark:bg-green-500/20 hover:bg-green-200 dark:hover:bg-green-500/30 text-green-700 dark:text-green-300 rounded-xl font-medium transition-all"
                >
                  <DollarSign size={18} />
                  {language === 'zh' ? '入金指南' : 'Funding Guide'}
                </button>
              </div>

              {/* Export Error */}
              {exportError && (
                <div className="p-3 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-lg">
                  <p className="text-sm text-red-700 dark:text-red-300">{exportError}</p>
                </div>
              )}

              {/* Funding Guide */}
              {showFundingGuide && (
                <div className="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl space-y-3">
                  <h4 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                    <DollarSign size={16} className="text-green-500" />
                    {language === 'zh' ? '如何入金到嵌入式钱包' : 'How to Fund Your Embedded Wallet'}
                  </h4>
                  
                  <div className="space-y-2 text-sm text-gray-700 dark:text-gray-300">
                    <p>1. {language === 'zh' ? '复制上方的钱包地址' : 'Copy the wallet address above'}</p>
                    <p>2. {language === 'zh' ? '从交易所提取 USDC 到此地址' : 'Withdraw USDC from an exchange to this address'}</p>
                    <p className="text-red-600 dark:text-red-400 font-medium">
                      3. {language === 'zh' ? '重要：选择 Arbitrum One 网络！' : 'Important: Select Arbitrum One network!'}
                    </p>
                  </div>

                  <button
                    onClick={handleFundWallet}
                    className="w-full py-2.5 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white rounded-xl font-medium transition-all flex items-center justify-center gap-2"
                  >
                    <DollarSign size={16} />
                    {language === 'zh' ? '通过 Privy 入金' : 'Fund via Privy'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Footer */}
      <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
          <Shield size={12} />
          {language === 'zh'
            ? '您的钱包由 Privy 安全保护，私钥存储在安全的飞地中'
            : 'Your wallet is secured by Privy with keys stored in secure enclaves'}
        </div>
      </div>
    </div>
  );
};

export default CryptoWalletSetup;
