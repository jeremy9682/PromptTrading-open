/**
 * Sell Position Modal Component
 * 
 * 卖出持仓的模态框
 * 支持市价卖出和限价卖出
 */

import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, Loader2, AlertCircle, TrendingDown, Info, Zap, GripHorizontal } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Position } from '../../../services/polymarket/portfolioService';
import {
  executeOrder,
  setTokenApprovals,
  type OrderParams,
} from '../../../services/polymarket/polymarketSafeService';
import { useSafeWallet } from '../../../contexts/SafeWalletContext';
import { useAuth } from '../../../contexts/AuthContext';
import { usePrivy, useWallets } from '@privy-io/react-auth';

// ============================================
// Types
// ============================================

interface SellPositionModalProps {
  position: Position | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

type OrderType = 'MARKET' | 'LIMIT';

// ============================================
// Component
// ============================================

export function SellPositionModal({ 
  position, 
  isOpen, 
  onClose,
  onSuccess 
}: SellPositionModalProps) {
  const [orderType, setOrderType] = useState<OrderType>('MARKET');
  const [sellAmount, setSellAmount] = useState<number>(0);
  const [limitPrice, setLimitPrice] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isReapproving, setIsReapproving] = useState(false);

  const { safeAddress, isReady } = useSafeWallet();
  const { getAccessToken, walletAddress } = useAuth();
  const { wallets } = useWallets();

  // Reset state when position changes
  useEffect(() => {
    if (position) {
      setSellAmount(position.size);
      setLimitPrice(position.currentPrice);
      setError(null);
      setSuccess(false);
    }
  }, [position]);

  // Calculate estimates
  const estimatedValue = orderType === 'LIMIT' 
    ? sellAmount * limitPrice 
    : sellAmount * (position?.currentPrice || 0);
  
  const maxSellable = position?.size || 0;

  // Get provider from primary wallet
  const getProvider = async () => {
    const primaryWallet = wallets.find(w => w.walletClientType === 'privy');
    if (primaryWallet?.getEthereumProvider) {
      return primaryWallet.getEthereumProvider();
    }
    return null;
  };

  // Handle sell
  const handleSell = async () => {
    if (!position || !safeAddress || !walletAddress) return;
    if (sellAmount <= 0 || sellAmount > maxSellable) return;

    setIsLoading(true);
    setError(null);

    try {
      const accessToken = await getAccessToken();
      if (!accessToken) {
        throw new Error('请先登录');
      }

      const provider = await getProvider();
      if (!provider) {
        throw new Error('无法获取钱包 Provider');
      }

      // Convert to ethers5 signer
      const { ethers: ethers5 } = await import('ethers5');
      const web3Provider = new ethers5.providers.Web3Provider(provider);
      const signer = web3Provider.getSigner();

      const orderParams: OrderParams = {
        tokenId: position.tokenId,
        side: 'SELL',
        type: orderType,
        amount: sellAmount, // For SELL, amount is shares
        price: orderType === 'LIMIT' ? limitPrice : undefined,
        fallbackPrice: position.currentPrice,
        timeInForce: 'GTC',
      };

      console.log('[SellPositionModal] Executing sell order:', orderParams);

      const result = await executeOrder(signer, accessToken, safeAddress, orderParams);

      if (result.success) {
        setSuccess(true);
        setTimeout(() => {
          onSuccess?.();
          onClose();
        }, 2000);
      } else {
        // 保留 APPROVAL_MISSING 前缀用于显示重新授权按钮
        setError(result.errorMsg || '卖出失败');
      }
    } catch (err) {
      console.error('[SellPositionModal] Error:', err);
      const errMsg = err instanceof Error ? err.message : '卖出失败';
      setError(errMsg);
    } finally {
      setIsLoading(false);
    }
  };

  // 重新授权处理
  const handleReapprove = async () => {
    if (!safeAddress || isReapproving) return;

    try {
      setIsReapproving(true);
      setError(null);

      const provider = await getProvider();
      if (!provider) {
        throw new Error('无法获取钱包 Provider');
      }

      const { ethers: ethers5 } = await import('ethers5');
      const web3Provider = new ethers5.providers.Web3Provider(provider);
      const signer = web3Provider.getSigner();

      console.log('[SellPositionModal] Re-approving token authorizations...');
      const result = await setTokenApprovals(signer, safeAddress, (step) => {
        console.log('[SellPositionModal] Approval progress:', step);
      });

      if (result.success) {
        setError(null);
        console.log('[SellPositionModal] Re-approval successful, retrying sell...');
      } else {
        setError(`授权失败: ${result.error}`);
      }
    } catch (err) {
      console.error('[SellPositionModal] Re-approval error:', err);
      setError(err instanceof Error ? err.message : '重新授权失败');
    } finally {
      setIsReapproving(false);
    }
  };

  // 检查错误是否是授权缺失
  const isApprovalMissing = error?.startsWith('APPROVAL_MISSING:');
  const displayError = isApprovalMissing ? error.replace('APPROVAL_MISSING:', '') : error;

  // Handle percent buttons
  const handlePercentClick = (percent: number) => {
    setSellAmount(Number((maxSellable * percent).toFixed(2)));
  };

  // Ref for drag constraints
  const constraintsRef = useRef(null);

  if (!position) return null;

  const modalContent = (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            ref={constraintsRef}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 z-[10000]"
            onClick={onClose}
          />

          {/* Modal - Draggable */}
          <motion.div
            drag
            dragConstraints={constraintsRef}
            dragElastic={0.1}
            dragMomentum={false}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1, x: '-50%', y: '-50%' }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            style={{ 
              position: 'fixed',
              left: '50%',
              top: '50%',
            }}
            className="w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl shadow-2xl z-[10001] overflow-hidden cursor-move"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header with drag handle */}
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-800 cursor-move select-none">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <TrendingDown className="w-5 h-5 text-red-500" />
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                    卖出持仓
                  </h2>
                  <GripHorizontal className="w-4 h-4 text-gray-400 ml-1" />
                </div>
                <button
                  onClick={onClose}
                  disabled={isLoading}
                  className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>
            </div>

            {/* Content - Not draggable */}
            <div 
              className="p-6 space-y-5 max-h-[60vh] overflow-y-auto cursor-default"
              onPointerDown={(e) => e.stopPropagation()}
            >
              {/* Position Info */}
              <div className="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl">
                <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-2 line-clamp-2">
                  {position.title}
                </h3>
                <div className="flex items-center gap-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                    position.outcome === 'Yes'
                      ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                      : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                  }`}>
                    {position.outcome}
                  </span>
                  <span className="text-sm text-gray-500 dark:text-gray-400">
                    持有 {position.size.toFixed(2)} 股 @ {(position.avgPrice * 100).toFixed(1)}%
                  </span>
                </div>
              </div>

              {/* Order Type Toggle */}
              <div className="flex gap-2 p-1 bg-gray-100 dark:bg-gray-800 rounded-lg">
                <button
                  onClick={() => setOrderType('MARKET')}
                  className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-all ${
                    orderType === 'MARKET'
                      ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                      : 'text-gray-600 dark:text-gray-400'
                  }`}
                >
                  市价卖出
                </button>
                <button
                  onClick={() => setOrderType('LIMIT')}
                  className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-all ${
                    orderType === 'LIMIT'
                      ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                      : 'text-gray-600 dark:text-gray-400'
                  }`}
                >
                  限价卖出
                </button>
              </div>

              {/* Sell Amount */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  卖出数量 (股)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    value={sellAmount}
                    onChange={(e) => setSellAmount(Number(e.target.value))}
                    max={maxSellable}
                    min={0}
                    step={0.01}
                    className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-gray-900 dark:text-white focus:ring-2 focus:ring-red-500 focus:border-transparent"
                    placeholder="0"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 text-sm">
                    / {maxSellable.toFixed(2)}
                  </span>
                </div>
                
                {/* Percent buttons */}
                <div className="flex gap-2 mt-2">
                  {[0.25, 0.5, 0.75, 1].map((percent) => (
                    <button
                      key={percent}
                      onClick={() => handlePercentClick(percent)}
                      className="flex-1 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors"
                    >
                      {percent === 1 ? 'MAX' : `${percent * 100}%`}
                    </button>
                  ))}
                </div>
              </div>

              {/* Limit Price (if limit order) */}
              {orderType === 'LIMIT' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    限价 (%)
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      value={(limitPrice * 100).toFixed(1)}
                      onChange={(e) => setLimitPrice(Number(e.target.value) / 100)}
                      max={99}
                      min={1}
                      step={0.1}
                      className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-gray-900 dark:text-white focus:ring-2 focus:ring-red-500 focus:border-transparent"
                      placeholder="0"
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 text-sm">
                      %
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    当前价格: {(position.currentPrice * 100).toFixed(1)}%
                  </p>
                </div>
              )}

              {/* Estimate */}
              <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-xl">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600 dark:text-gray-400">预计收到</span>
                  <span className="text-lg font-bold text-gray-900 dark:text-white">
                    ${estimatedValue.toFixed(2)} USDC
                  </span>
                </div>
                {orderType === 'MARKET' && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 flex items-center gap-1">
                    <Info className="w-3 h-3" />
                    实际价格可能因滑点略有不同
                  </p>
                )}
              </div>

              {/* Error */}
              {error && (
                <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                    <p className="text-sm text-red-600 dark:text-red-400">{displayError}</p>
                  </div>
                  {/* 授权缺失时显示重新授权按钮 */}
                  {isApprovalMissing && (
                    <button
                      onClick={handleReapprove}
                      disabled={isReapproving}
                      className="mt-2 w-full px-3 py-2 text-sm border border-red-300 text-red-600 rounded-lg hover:bg-red-100 disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {isReapproving ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          重新授权中...
                        </>
                      ) : (
                        '重新授权 Token'
                      )}
                    </button>
                  )}
                </div>
              )}

              {/* Success */}
              {success && (
                <div className="p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-4 h-4 bg-green-500 rounded-full flex items-center justify-center flex-shrink-0">
                      <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <p className="text-sm font-medium text-green-600 dark:text-green-400">卖出订单已成交！</p>
                  </div>
                  <p className="text-xs text-green-500 dark:text-green-500 ml-6">
                    💡 持仓数据可能需要 1-2 分钟更新
                  </p>
                </div>
              )}

              {/* Debug Info (remove in production) */}
              {!isReady && (
                <div className="p-2 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg text-xs text-yellow-700 dark:text-yellow-400">
                  ⚠️ Safe 钱包未就绪，请稍候...
                </div>
              )}
              {!position.tokenId && (
                <div className="p-2 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg text-xs text-orange-700 dark:text-orange-400">
                  ⚠️ 缺少 Token ID，无法卖出此持仓
                </div>
              )}

              {/* Sell Button */}
              <button
                onClick={handleSell}
                disabled={
                  !isReady ||
                  isLoading ||
                  success ||
                  sellAmount <= 0 ||
                  sellAmount > maxSellable ||
                  !position.tokenId ||
                  (orderType === 'LIMIT' && (limitPrice <= 0.01 || limitPrice >= 0.99))
                }
                className="w-full py-3 bg-red-500 hover:bg-red-600 disabled:bg-gray-300 dark:disabled:bg-gray-700 text-white font-semibold rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    处理中...
                  </>
                ) : success ? (
                  '订单已提交'
                ) : (
                  <>
                    卖出 {sellAmount.toFixed(2)} 股
                  </>
                )}
              </button>

              {/* Gasless hint */}
              {isReady && !success && (
                <p className="text-xs text-center text-green-500 flex items-center justify-center gap-1">
                  <Zap className="w-3 h-3" />
                  Gasless 交易 • 无需 Gas 费
                </p>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );

  if (typeof document !== 'undefined') {
    return createPortal(modalContent, document.body);
  }

  return null;
}

export default SellPositionModal;

