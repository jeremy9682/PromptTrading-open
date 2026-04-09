/**
 * Agent Wallet 配置弹窗
 * 允许用户配置 Agent 权限并创建
 */

import React, { useState } from 'react';
import { Shield, AlertCircle, Clock, DollarSign, X, Loader } from 'lucide-react';

const AgentConfigModal = ({ isOpen, onClose, onCreateAgent, language = 'zh' }) => {
  const [maxOrderSize, setMaxOrderSize] = useState(1000);
  const [expirationHours, setExpirationHours] = useState(24);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState(null);

  const handleCreate = async () => {
    setCreating(true);
    setError(null);

    try {
      const permissions = {
        maxOrderSize: parseFloat(maxOrderSize),
        expirationTime: Date.now() + expirationHours * 60 * 60 * 1000
      };

      await onCreateAgent(permissions);
      onClose();
    } catch (err) {
      console.error('创建 Agent 失败:', err);
      setError(err.message);
    } finally {
      setCreating(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-gray-900 rounded-xl max-w-lg w-full border border-gray-800 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
              <Shield className="text-blue-400" size={20} />
            </div>
            <div>
              <h3 className="text-xl font-bold text-white">
                {language === 'zh' ? '创建 Agent Wallet' : 'Create Agent Wallet'}
              </h3>
              <p className="text-sm text-gray-400">
                {language === 'zh' ? '配置自动交易权限' : 'Configure trading permissions'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
          >
            <X size={20} className="text-gray-400" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-6">
          {/* 说明 */}
          <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg">
            <div className="flex items-start gap-3">
              <AlertCircle className="text-blue-400 flex-shrink-0 mt-0.5" size={18} />
              <div className="text-sm text-blue-300">
                {language === 'zh' ? (
                  <>
                    <strong>Agent Wallet</strong> 是一个临时授权的钱包，用于自动执行交易。
                    您的主钱包私钥始终安全存储在 MetaMask 中。
                  </>
                ) : (
                  <>
                    <strong>Agent Wallet</strong> is a temporary authorized wallet for automatic trading.
                    Your main wallet's private key always stays secure in MetaMask.
                  </>
                )}
              </div>
            </div>
          </div>

          {/* 最大订单金额 */}
          <div>
            <label className="flex items-center gap-2 text-gray-300 text-sm font-medium mb-2">
              <DollarSign size={16} />
              {language === 'zh' ? '最大单笔订单金额' : 'Max Order Size'}
            </label>
            <div className="relative">
              <input
                type="number"
                value={maxOrderSize}
                onChange={(e) => setMaxOrderSize(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white pr-16"
                min="100"
                max="10000"
                step="100"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 text-sm">
                USDT
              </span>
            </div>
            <div className="flex gap-2 mt-2">
              {[500, 1000, 2000, 5000].map(amount => (
                <button
                  key={amount}
                  onClick={() => setMaxOrderSize(amount)}
                  className={`px-3 py-1 rounded text-xs transition-colors ${
                    maxOrderSize === amount
                      ? 'bg-blue-500 text-white'
                      : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                  }`}
                >
                  ${amount}
                </button>
              ))}
            </div>
          </div>

          {/* 过期时间 */}
          <div>
            <label className="flex items-center gap-2 text-gray-300 text-sm font-medium mb-2">
              <Clock size={16} />
              {language === 'zh' ? '授权有效期' : 'Expiration Time'}
            </label>
            <div className="relative">
              <input
                type="number"
                value={expirationHours}
                onChange={(e) => setExpirationHours(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white pr-20"
                min="1"
                max="168"
                step="1"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 text-sm">
                {language === 'zh' ? '小时' : 'hours'}
              </span>
            </div>
            <div className="flex gap-2 mt-2">
              {[1, 6, 24, 72].map(hours => (
                <button
                  key={hours}
                  onClick={() => setExpirationHours(hours)}
                  className={`px-3 py-1 rounded text-xs transition-colors ${
                    expirationHours === hours
                      ? 'bg-blue-500 text-white'
                      : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                  }`}
                >
                  {hours}h
                </button>
              ))}
            </div>
          </div>

          {/* 错误提示 */}
          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
              <p className="text-red-400 text-sm flex items-start gap-2">
                <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
                {error}
              </p>
            </div>
          )}

          {/* 权限摘要 */}
          <div className="p-4 bg-gray-800/50 rounded-lg border border-gray-700">
            <h4 className="text-sm font-medium text-gray-300 mb-3">
              {language === 'zh' ? '权限摘要' : 'Permission Summary'}
            </h4>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-400">{language === 'zh' ? '最大订单' : 'Max Order'}:</span>
                <span className="text-white font-medium">${maxOrderSize} USDT</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">{language === 'zh' ? '有效期' : 'Expires'}:</span>
                <span className="text-white font-medium">{expirationHours} {language === 'zh' ? '小时' : 'hours'}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-3 p-6 border-t border-gray-800">
          <button
            onClick={onClose}
            disabled={creating}
            className="flex-1 px-4 py-3 bg-gray-800 text-gray-300 rounded-lg hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {language === 'zh' ? '取消' : 'Cancel'}
          </button>
          <button
            onClick={handleCreate}
            disabled={creating}
            className="flex-1 px-4 py-3 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-lg hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-all"
          >
            {creating && <Loader size={16} className="animate-spin" />}
            {creating 
              ? (language === 'zh' ? '创建中...' : 'Creating...')
              : (language === 'zh' ? '创建 Agent' : 'Create Agent')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AgentConfigModal;

