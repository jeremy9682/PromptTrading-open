/**
 * Agent Wallet 状态小部件
 * 显示 Agent 状态、权限和管理操作
 */

import React, { useState } from 'react';
import { Shield, Clock, DollarSign, Trash2, AlertCircle, CheckCircle, Copy, List, RefreshCw, Loader2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { getCurrentAgent } from '../services/agentWallet.service';

const cardClass = 'bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-700 rounded-2xl shadow-sm';
const mutedText = 'text-gray-600 dark:text-gray-400';

const AgentWalletWidget = ({ language = 'zh', selectedCoins = ['BTC', 'ETH', 'SOL'] }) => {
  // Use Privy Auth Context instead of MetaMask WalletContext
  const {
    isAgentActive,
    agentInfo,
    createAgent,
    revokeAgent,
    authenticated: isConnected,
    walletAddress: account,
    effectiveChainId: chainId
  } = useAuth();

  const [showRevokeConfirm, setShowRevokeConfirm] = useState(false);
  const [copied, setCopied] = useState(false);
  const [creating, setCreating] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [error, setError] = useState(null);

  // Create Agent with default permissions
  const handleCreateAgent = async () => {
    setCreating(true);
    setError(null);
    try {
      await createAgent({
        maxOrderSize: 10000,
        expirationTime: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days
      }, '');
      console.log('✅ Agent 创建成功');
    } catch (err) {
      console.error('创建 Agent 失败:', err);
      setError(err.message);
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async () => {
    setRevoking(true);
    setError(null);
    try {
      await revokeAgent();
      setShowRevokeConfirm(false);
    } catch (err) {
      console.error('撤销 Agent 失败:', err);
      setError(err.message);
    } finally {
      setRevoking(false);
    }
  };

  const copyAddress = () => {
    if (agentInfo?.address) {
      navigator.clipboard.writeText(agentInfo.address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // 未连接钱包
  if (!isConnected) {
    return null;
  }

  // 检查是否有其他网络的 Agent
  const hasAgentInStorage = getCurrentAgent() !== null;
  const agentInOtherNetwork = hasAgentInStorage && (!isAgentActive || !agentInfo);
  
  // 没有 Agent - 显示创建按钮
  if (!isAgentActive || !agentInfo) {
    return (
      <div className={`${cardClass} p-4`}>
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-lg bg-yellow-50 dark:bg-yellow-500/20 flex items-center justify-center">
            <Shield className="text-yellow-500 dark:text-yellow-400" size={20} />
          </div>
          <div>
            <h3 className="text-gray-900 dark:text-white font-medium flex items-center gap-2">
              Agent Wallet
              <span className="px-2 py-0.5 text-xs rounded bg-yellow-100 text-yellow-700 dark:bg-yellow-500/20 dark:text-yellow-300">
                {language === 'zh' ? '需要创建' : 'Required'}
              </span>
            </h3>
            <p className={`${mutedText} text-xs`}>
              {language === 'zh' ? '交易签名授权' : 'Trade signing authorization'}
            </p>
          </div>
        </div>

        {/* Network indicator */}
        <div className="mb-3 flex items-center gap-2">
          <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
            chainId === 421614
              ? 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300'
              : 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300'
          }`}>
            {chainId === 421614 ? 'Testnet' : 'Mainnet'}
          </span>
        </div>

        <p className={`${mutedText} text-sm mb-4`}>
          {language === 'zh'
            ? 'Agent Wallet 用于签名交易，您的嵌入式钱包私钥始终安全。'
            : 'Agent Wallet signs trades on your behalf. Your embedded wallet private key stays secure.'}
        </p>

        {/* Error message */}
        {error && (
          <div className="mb-3 p-3 bg-red-50 dark:bg-red-500/10 border border-red-100 dark:border-red-500/20 rounded-lg">
            <p className="text-red-600 dark:text-red-300 text-xs">{error}</p>
          </div>
        )}

        <button
          onClick={handleCreateAgent}
          disabled={creating}
          className="w-full px-4 py-2.5 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-lg hover:opacity-90 transition-all font-medium flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {creating ? (
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
    );
  }

  // 有 Agent - 显示状态
  return (
    <>
      <div className={`${cardClass} p-4`}>
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-green-50 dark:bg-green-500/20 flex items-center justify-center">
              <Shield className="text-green-500 dark:text-green-400" size={20} />
            </div>
            <div>
              <h3 className="text-gray-900 dark:text-white font-medium flex items-center gap-2">
                Agent Wallet
                <span className="flex items-center gap-1 px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs dark:bg-green-500/20 dark:text-green-300">
                  <CheckCircle size={12} />
                  {language === 'zh' ? '活跃' : 'Active'}
                </span>
                {chainId && (
                  <span className={`px-2 py-0.5 text-xs rounded ${
                    chainId === 42161 
                      ? 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-300' 
                      : 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300'
                  }`}>
                    {chainId === 42161 
                      ? (language === 'zh' ? '主网' : 'Mainnet')
                      : (language === 'zh' ? '测试网' : 'Testnet')}
                  </span>
                )}
              </h3>
              <button
                onClick={copyAddress}
                className="text-gray-500 dark:text-gray-400 text-xs hover:text-gray-700 dark:hover:text-white transition-colors flex items-center gap-1"
              >
                {agentInfo.shortAddress}
                {copied ? <CheckCircle size={12} className="text-green-400" /> : <Copy size={12} />}
              </button>
            </div>
          </div>

          <button
            onClick={() => setShowRevokeConfirm(true)}
            className="p-2 hover:bg-red-50 dark:hover:bg-red-500/20 rounded-lg transition-colors group"
            title={language === 'zh' ? '撤销 Agent' : 'Revoke Agent'}
          >
            <Trash2 size={16} className="text-gray-500 group-hover:text-red-500 dark:text-gray-400 dark:group-hover:text-red-400" />
          </button>
        </div>

        {/* 权限信息 */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className={`${mutedText} flex items-center gap-2`}>
              <DollarSign size={14} />
              {language === 'zh' ? '最大订单' : 'Max Order'}
            </span>
            <span className="text-gray-900 dark:text-white font-medium">{agentInfo.maxOrderSize}</span>
          </div>

          <div className="flex items-center justify-between text-sm">
            <span className={`${mutedText} flex items-center gap-2`}>
              <Clock size={14} />
              {language === 'zh' ? '剩余时间' : 'Time Left'}
            </span>
            <span className={`font-medium ${agentInfo.isExpiringSoon ? 'text-yellow-600 dark:text-yellow-400' : 'text-gray-900 dark:text-white'}`}>
              {agentInfo.expiresIn}
            </span>
          </div>
        </div>

        {/* 过期警告 */}
        {agentInfo.isExpiringSoon && (
          <div className="mt-3 p-2 bg-yellow-50 dark:bg-yellow-500/10 border border-yellow-100 dark:border-yellow-500/20 rounded-lg">
            <p className="text-yellow-700 dark:text-yellow-300 text-xs flex items-start gap-2">
              <AlertCircle size={12} className="mt-0.5 flex-shrink-0" />
              {language === 'zh' ? 'Agent 即将过期，请重新创建' : 'Agent expiring soon, please recreate'}
            </p>
          </div>
        )}

        {/* 创建时间 */}
        <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
          <p className={`text-xs ${mutedText}`}>
            {language === 'zh' ? '创建于' : 'Created at'}: {agentInfo.createdAt}
          </p>
        </div>
      </div>

      {/* 撤销确认弹窗 */}
      {showRevokeConfirm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 max-w-md border border-gray-100 dark:border-gray-800 shadow-2xl">
            <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-3">
              {language === 'zh' ? '确认撤销 Agent' : 'Confirm Revoke Agent'}
            </h3>
            
            <p className={`${mutedText} mb-4`}>
              {language === 'zh' 
                ? '撤销后，所有自动交易权限将被移除。您可以随时重新创建。'
                : 'After revoking, all auto-trading permissions will be removed. You can recreate anytime.'}
            </p>

            <div className="p-3 bg-yellow-50 dark:bg-yellow-500/10 border border-yellow-100 dark:border-yellow-500/20 rounded-lg mb-4">
              <p className="text-yellow-700 dark:text-yellow-300 text-sm flex items-start gap-2">
                <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
                {language === 'zh' 
                  ? '进行中的交易将立即停止。'
                  : 'Ongoing trades will be stopped immediately.'}
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowRevokeConfirm(false)}
                disabled={revoking}
                className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
              >
                {language === 'zh' ? '取消' : 'Cancel'}
              </button>
              <button
                onClick={handleRevoke}
                disabled={revoking}
                className="flex-1 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {revoking && <RefreshCw size={16} className="animate-spin" />}
                {revoking
                  ? (language === 'zh' ? '撤销中...' : 'Revoking...')
                  : (language === 'zh' ? '确认撤销' : 'Confirm Revoke')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default AgentWalletWidget;

