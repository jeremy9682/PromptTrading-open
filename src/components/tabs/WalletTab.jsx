/**
 * 钱包管理标签页
 * 显示用户登录状态、嵌入式钱包信息、Agent Wallet管理、AI Credits等功能
 */

import React, { useState, useCallback } from 'react';
import { Wallet, ExternalLink, Check, Info, User, Shield, AlertCircle, Loader2, Trash2, LogIn } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useAppStore } from '../../contexts/useAppStore';
import { LoginButton } from '../auth';
import { CreditBalanceCard, RechargeModal, TransactionHistory } from '../credits';
import { CryptoWalletSetup } from '../crypto';

const cardClass = 'bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-700 rounded-2xl shadow-sm';
const mutedText = 'text-gray-600 dark:text-gray-400';

const WalletTab = ({ language }) => {
  // Privy Auth Context - embedded wallet and Agent wallet
  const {
    authenticated,
    walletAddress,
    userInfo,
    isAgentActive,
    agentInfo,
    createAgent,
    revokeAgent,
    effectiveChainId
  } = useAuth();

  // Get trading mode from global store
  const tradingMode = useAppStore((state) => state.tradingMode);
  const isHyperliquidMode = tradingMode === 'hyperliquid';

  // Map Privy auth to component variables for compatibility
  const account = walletAddress;
  const isConnected = authenticated;

  // Agent creation state
  const [creatingAgent, setCreatingAgent] = useState(false);
  const [revokingAgent, setRevokingAgent] = useState(false);
  const [agentError, setAgentError] = useState(null);

  // Recharge modal state
  const [showRechargeModal, setShowRechargeModal] = useState(false);
  const [rechargeAmount, setRechargeAmount] = useState(20);
  const [refreshKey, setRefreshKey] = useState(0);

  // Handle recharge button click
  const handleRechargeClick = useCallback((amount) => {
    setRechargeAmount(amount);
    setShowRechargeModal(true);
  }, []);

  // Handle recharge success
  const handleRechargeSuccess = useCallback((newBalance) => {
    console.log('[WalletTab] Recharge success, new balance:', newBalance);
    // 刷新余额和记录组件
    setRefreshKey((prev) => prev + 1);
  }, []);

  // Handle Agent creation
  const handleCreateAgent = async () => {
    setCreatingAgent(true);
    setAgentError(null);
    try {
      await createAgent({
        maxOrderSize: 10000,
        expirationTime: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days
      }, '');
    } catch (error) {
      console.error('Failed to create Agent:', error);
      setAgentError(error.message);
    } finally {
      setCreatingAgent(false);
    }
  };

  // Handle Agent revocation
  const handleRevokeAgent = async () => {
    if (!window.confirm(language === 'zh'
      ? '确定要撤销 Agent Wallet 吗？撤销后需要重新创建才能交易。'
      : 'Are you sure you want to revoke the Agent Wallet? You will need to create a new one to trade.')) {
      return;
    }
    setRevokingAgent(true);
    setAgentError(null);
    try {
      await revokeAgent();
    } catch (error) {
      console.error('Failed to revoke Agent:', error);
      setAgentError(error.message);
    } finally {
      setRevokingAgent(false);
    }
  };

  const isTestnet = effectiveChainId === 421614;

  return (
    <div className="space-y-6 text-gray-900 dark:text-white">
      {/* 用户登录状态 */}
      <div className={`${cardClass} p-6`}>
        <h3 className="text-gray-900 dark:text-white font-semibold text-lg mb-4 flex items-center gap-2">
          <User className="text-blue-600 dark:text-blue-400" />
          {language === 'zh' ? '账户状态' : 'Account Status'}
        </h3>

        {/* Privy Login Button - only show when not connected */}
        {!isConnected && (
          <div className="flex flex-col items-center gap-3 py-4">
            <p className="text-gray-500 dark:text-gray-400 text-sm">
              {language === 'zh' ? '请先登录以使用钱包功能' : 'Please login to use wallet features'}
            </p>
            <LoginButton language={language} variant="gradient" />
          </div>
        )}

        {isConnected && (
          <div className="mt-4 space-y-3">
            <div className="p-4 bg-green-50 dark:bg-green-500/10 border border-green-200 dark:border-green-500/20 rounded-lg">
              <p className="text-green-700 dark:text-green-300 text-sm flex items-center gap-2">
                <Check size={16} />
                {language === 'zh'
                  ? '已登录，您可以开始使用AI分析和交易功能'
                  : 'Logged in, you can now use AI analysis and trading features'}
              </p>
            </div>

            {/* 嵌入式钱包信息 - 仅在非 Hyperliquid 模式显示简单地址 */}
            {account && !isHyperliquidMode && (
              <div className="p-4 bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <Wallet size={16} className="text-blue-500" />
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    {language === 'zh' ? '嵌入式钱包地址' : 'Embedded Wallet Address'}
                  </span>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 font-mono break-all">
                  {account}
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Crypto Trading 钱包设置 - 仅在 Hyperliquid 模式显示 */}
      {isConnected && isHyperliquidMode && (
        <CryptoWalletSetup language={language} />
      )}

      {/* Agent Wallet 管理 - 仅在 Hyperliquid 模式显示 */}
      {isConnected && isHyperliquidMode && (
        <div className={`${cardClass} p-6`}>
          <h3 className="text-gray-900 dark:text-white font-semibold text-lg mb-4 flex items-center gap-2">
            <Shield className="text-purple-600 dark:text-purple-400" />
            {language === 'zh' ? 'Agent Wallet (交易签名)' : 'Agent Wallet (Trade Signing)'}
          </h3>

          {/* Current trading wallet info */}
          <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20 rounded-lg">
            <div className="text-xs text-blue-600 dark:text-blue-400 mb-1">
              {language === 'zh' ? '当前交易钱包' : 'Current Trading Wallet'}
            </div>
            <div className="font-mono text-sm text-blue-800 dark:text-blue-300">
              {account}
            </div>
          </div>

          {/* Network indicator */}
          <div className="mb-4 flex items-center gap-2">
            <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
              isTestnet
                ? 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300'
                : 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300'
            }`}>
              {isTestnet ? 'Testnet' : 'Mainnet'}
            </span>
            <span className="text-xs text-gray-500">
              {language === 'zh' ? `Chain ID: ${effectiveChainId}` : `Chain ID: ${effectiveChainId}`}
            </span>
          </div>

          {/* Agent status */}
          {isAgentActive && agentInfo ? (
            <div className="space-y-4">
              {/* Agent active indicator */}
              <div className="p-4 bg-green-50 dark:bg-green-500/10 border border-green-200 dark:border-green-500/20 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <Check size={16} className="text-green-600" />
                  <span className="text-sm font-medium text-green-700 dark:text-green-300">
                    {language === 'zh' ? 'Agent Wallet 已激活' : 'Agent Wallet Active'}
                  </span>
                </div>
                <div className="space-y-1 text-xs text-gray-600 dark:text-gray-400">
                  <p><span className="font-medium">Address:</span> {agentInfo.shortAddress}</p>
                  <p><span className="font-medium">{language === 'zh' ? '最大订单' : 'Max Order'}:</span> {agentInfo.maxOrderSize}</p>
                  <p><span className="font-medium">{language === 'zh' ? '过期时间' : 'Expires in'}:</span> {agentInfo.expiresIn}</p>
                </div>
              </div>

              {/* Revoke button */}
              <button
                onClick={handleRevokeAgent}
                disabled={revokingAgent}
                className="w-full px-4 py-2 bg-red-100 hover:bg-red-200 dark:bg-red-500/20 dark:hover:bg-red-500/30 text-red-700 dark:text-red-300 rounded-lg flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
              >
                {revokingAgent ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    {language === 'zh' ? '撤销中...' : 'Revoking...'}
                  </>
                ) : (
                  <>
                    <Trash2 size={16} />
                    {language === 'zh' ? '撤销 Agent Wallet' : 'Revoke Agent Wallet'}
                  </>
                )}
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {/* No agent warning */}
              <div className="p-4 bg-yellow-50 dark:bg-yellow-500/10 border border-yellow-200 dark:border-yellow-500/20 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <AlertCircle size={16} className="text-yellow-600" />
                  <span className="text-sm font-medium text-yellow-700 dark:text-yellow-300">
                    {language === 'zh' ? '需要创建 Agent Wallet' : 'Agent Wallet Required'}
                  </span>
                </div>
                <p className="text-xs text-gray-600 dark:text-gray-400">
                  {language === 'zh'
                    ? 'Agent Wallet 用于签名交易，您的嵌入式钱包私钥始终安全。'
                    : 'Agent Wallet signs trades on your behalf. Your embedded wallet private key stays secure.'}
                </p>
              </div>

              {/* Create button */}
              <button
                onClick={handleCreateAgent}
                disabled={creatingAgent}
                className="w-full px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
              >
                {creatingAgent ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    {language === 'zh' ? '创建中...' : 'Creating...'}
                  </>
                ) : (
                  <>
                    <Shield size={16} />
                    {language === 'zh' ? '创建 Agent Wallet' : 'Create Agent Wallet'}
                  </>
                )}
              </button>
            </div>
          )}

          {/* Error message */}
          {agentError && (
            <div className="mt-4 p-3 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-lg">
              <p className="text-sm text-red-700 dark:text-red-300">{agentError}</p>
            </div>
          )}

          {/* How it works */}
          <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {language === 'zh'
                ? '* Agent Wallet 是一个代理钱包，经您的嵌入式钱包授权后，可以代表您签名交易。这样您的主钱包私钥永远不会暴露。'
                : '* Agent Wallet is a delegated wallet authorized by your embedded wallet to sign trades on your behalf. Your main wallet private key is never exposed.'}
            </p>
          </div>
        </div>
      )}

      {/* AI Credits 余额 - 只在登录后显示 */}
      {isConnected && (
        <CreditBalanceCard
          key={`balance-${refreshKey}`}
          language={language}
          onRecharge={handleRechargeClick}
        />
      )}

      {/* 交易记录 - 只在登录后显示 */}
      {isConnected && (
        <TransactionHistory
          key={`history-${refreshKey}`}
          language={language}
        />
      )}

      {/* 帮助信息 */}
      <div className="bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20 rounded-2xl p-6">
        <h3 className="text-blue-700 dark:text-blue-400 font-semibold mb-3 flex items-center gap-2">
          <Info size={18} />
          {language === 'zh' ? '使用说明' : 'Instructions'}
        </h3>
        <ul className="space-y-2 text-gray-700 dark:text-gray-300 text-sm">
          <li className="flex items-start gap-2">
            <span className="text-blue-400 flex-shrink-0">1.</span>
            <span>{language === 'zh' ? '使用邮箱、Google 或 MetaMask 登录' : 'Login with email, Google, or MetaMask'}</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-blue-400 flex-shrink-0">2.</span>
            <span>{language === 'zh' ? '系统会自动为您创建嵌入式钱包' : 'System will automatically create an embedded wallet for you'}</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-blue-400 flex-shrink-0">3.</span>
            <span>{language === 'zh' ? '充值 AI Credits 或设置自己的 API Key' : 'Recharge AI Credits or set your own API Key'}</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-blue-400 flex-shrink-0">4.</span>
            <span>{language === 'zh' ? '创建 Agent Wallet 用于交易签名' : 'Create an Agent Wallet for trade signing'}</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-blue-400 flex-shrink-0">5.</span>
            <span>{language === 'zh' ? '返回控制台开始使用 AI 分析和交易功能' : 'Return to Dashboard to use AI analysis and trading features'}</span>
          </li>
        </ul>
      </div>

      {/* 充值弹窗 */}
      <RechargeModal
        isOpen={showRechargeModal}
        onClose={() => setShowRechargeModal(false)}
        initialAmount={rechargeAmount}
        language={language}
        onSuccess={handleRechargeSuccess}
      />
    </div>
  );
};

export default WalletTab;
