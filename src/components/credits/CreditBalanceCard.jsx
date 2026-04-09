/**
 * AI Credits 余额卡片组件
 * 
 * 显示用户当前余额和充值入口
 */

import React, { useState, useEffect } from 'react';
import { Wallet, Plus, RefreshCw } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { getBalance } from '../../services/credits.service';

// 充值金额选项（最低 $5）
const AMOUNT_TIERS = [5, 10, 20, 50, 100];
const MIN_AMOUNT = 5;

const CreditBalanceCard = ({ 
  language = 'zh', 
  onRecharge,
  className = '' 
}) => {
  const { authenticated, accessToken } = useAuth();
  const [balance, setBalance] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedAmount, setSelectedAmount] = useState(20);

  // 加载余额
  const loadBalance = async () => {
    if (!authenticated || !accessToken) return;
    
    setLoading(true);
    setError(null);
    try {
      const result = await getBalance(accessToken);
      if (result.success) {
        setBalance(result.data.balance);
      } else {
        setError(result.error);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBalance();
  }, [authenticated, accessToken]);

  // 计算使用百分比
  const usagePercent = balance !== null 
    ? Math.min(100, Math.max(0, (1 - balance / 100) * 100))
    : 0;

  const handleRechargeClick = () => {
    if (onRecharge) {
      onRecharge(selectedAmount);
    }
  };

  if (!authenticated) {
    return null;
  }

  return (
    <div className={`bg-gradient-to-br from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 border border-blue-200 dark:border-blue-500/30 rounded-2xl p-6 ${className}`}>
      {/* 标题 */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-gray-900 dark:text-white font-semibold text-lg flex items-center gap-2">
          <Wallet className="text-blue-600 dark:text-blue-400" size={20} />
          {language === 'zh' ? 'AI Credits 余额' : 'AI Credits Balance'}
        </h3>
        <button
          onClick={loadBalance}
          disabled={loading}
          className="p-2 hover:bg-blue-100 dark:hover:bg-blue-500/20 rounded-lg transition-colors"
          title={language === 'zh' ? '刷新余额' : 'Refresh balance'}
        >
          <RefreshCw size={16} className={`text-blue-600 dark:text-blue-400 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* 余额显示 */}
      <div className="mb-6">
        {loading && balance === null ? (
          <div className="animate-pulse">
            <div className="h-10 bg-gray-200 dark:bg-gray-700 rounded w-32"></div>
          </div>
        ) : error ? (
          <div className="text-red-500 text-sm">{error}</div>
        ) : (
          <>
            <div className="flex items-baseline gap-1">
              <span className="text-4xl font-bold text-gray-900 dark:text-white">
                ${balance?.toFixed(2) || '0.00'}
              </span>
              <span className="text-gray-500 dark:text-gray-400 text-sm">USD</span>
            </div>
            
            {/* 使用进度条 */}
            {balance !== null && balance > 0 && (
              <div className="mt-3">
                <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 mb-1">
                  <span>{language === 'zh' ? '预估剩余' : 'Est. remaining'}</span>
                  <span>~{Math.floor(balance / 0.1)} {language === 'zh' ? '次分析' : 'analyses'}</span>
                </div>
                <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-blue-500 to-purple-500 rounded-full transition-all duration-300"
                    style={{ width: `${100 - usagePercent}%` }}
                  ></div>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* 充值金额选择 */}
      <div className="mb-4">
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
          {language === 'zh' ? '选择充值金额' : 'Select amount'}
        </p>
        <div className="flex flex-wrap gap-2">
          {AMOUNT_TIERS.map((amount) => (
            <button
              key={amount}
              onClick={() => setSelectedAmount(amount)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                selectedAmount === amount
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-500'
              }`}
            >
              ${amount}
            </button>
          ))}
        </div>
      </div>

      {/* 充值按钮 */}
      <button
        onClick={handleRechargeClick}
        className="w-full py-3 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white rounded-xl font-medium flex items-center justify-center gap-2 transition-all shadow-lg shadow-blue-500/25"
      >
        <Plus size={18} />
        {language === 'zh' 
          ? `充值 $${selectedAmount} USDC` 
          : `Recharge $${selectedAmount} USDC`}
      </button>

      {/* 说明 */}
      <p className="mt-3 text-xs text-gray-500 dark:text-gray-400 text-center">
        {language === 'zh' 
          ? `1 USDC = 1 AI Credit | 最低 $${MIN_AMOUNT} | 支持多链`
          : `1 USDC = 1 AI Credit | Min $${MIN_AMOUNT} | Multi-chain`}
      </p>
    </div>
  );
};

export default CreditBalanceCard;

