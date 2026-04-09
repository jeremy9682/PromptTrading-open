/**
 * DFlow Sell Position Modal Component
 *
 * Modal for selling Kalshi/DFlow prediction market positions on Solana.
 * Swaps outcome tokens (YES/NO) back to USDC.
 */

import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, Loader2, AlertCircle, TrendingDown, Info, ExternalLink, GripHorizontal } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { DFlowPosition, dflowPortfolioService } from '../../../services/dflow/dflowPortfolioService';
import { dflowTradeService, PrivySolanaWallet } from '../../../services/dflow/dflowTradeService';
import { useAuth } from '../../../contexts/AuthContext';
import { useWallets as useSolanaWallets } from '@privy-io/react-auth/solana';
import { useAppStore } from '../../../contexts/useAppStore';

// USDC mint address on Solana
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

interface DFlowSellModalProps {
  position: DFlowPosition | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function DFlowSellModal({
  position,
  isOpen,
  onClose,
  onSuccess,
}: DFlowSellModalProps) {
  const [sellAmount, setSellAmount] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [txSignature, setTxSignature] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string>('');

  const { solanaWalletAddress } = useAuth();
  const { wallets: solanaWallets } = useSolanaWallets();
  const language = useAppStore((state) => state.language);

  // Ref for drag constraints
  const constraintsRef = useRef(null);

  // Reset state when position changes
  useEffect(() => {
    if (position) {
      setSellAmount(position.balance);
      setError(null);
      setSuccess(false);
      setTxSignature(null);
      setStatusMessage('');
    }
  }, [position]);

  // Calculate estimates
  const currentPrice = position?.currentPrice || 0;
  const estimatedValue = sellAmount * currentPrice;
  const maxSellable = position?.balance || 0;

  // Get the Privy Solana wallet
  const getPrivySolanaWallet = (): PrivySolanaWallet | null => {
    if (!solanaWallets || solanaWallets.length === 0) return null;

    // Find the wallet matching the user's solana address
    const wallet = solanaWallets.find(
      (w) => w.address === solanaWalletAddress
    );

    if (!wallet) return null;

    return {
      address: wallet.address,
      walletClientType: wallet.walletClientType,
      signTransaction: wallet.signTransaction.bind(wallet),
      signMessage: wallet.signMessage?.bind(wallet),
    };
  };

  // Handle sell
  const handleSell = async () => {
    if (!position || !solanaWalletAddress) return;
    if (sellAmount <= 0 || sellAmount > maxSellable) return;

    setIsLoading(true);
    setError(null);
    setStatusMessage('');

    try {
      const wallet = getPrivySolanaWallet();
      if (!wallet) {
        throw new Error(language === 'zh' ? '无法获取 Solana 钱包' : 'Cannot get Solana wallet');
      }

      // Convert sell amount to smallest units (6 decimals for outcome tokens)
      const amountInSmallestUnits = Math.floor(sellAmount * Math.pow(10, position.decimals));

      console.log('[DFlowSellModal] Executing sell:', {
        inputMint: position.tokenMint, // Outcome token
        outputMint: USDC_MINT, // USDC
        amount: amountInSmallestUnits,
        sellAmount,
        decimals: position.decimals,
      });

      // Execute the trade: swap outcome token → USDC
      const result = await dflowTradeService.executeTradeWithPrivy(
        {
          inputMint: position.tokenMint, // Sell outcome token
          outputMint: USDC_MINT, // Receive USDC
          amount: amountInSmallestUnits,
          slippageBps: 100, // 1% slippage for selling
          publicKey: solanaWalletAddress,
        },
        wallet,
        (status) => {
          setStatusMessage(status);
          console.log('[DFlowSellModal] Status:', status);
        }
      );

      console.log('[DFlowSellModal] Sell result:', result);

      if (result.status.status === 'closed' || result.txSignature) {
        setSuccess(true);
        setTxSignature(result.txSignature);

        // Save sell trade to history
        if (solanaWalletAddress) {
          dflowPortfolioService.saveTradeToHistory(solanaWalletAddress, {
            txSignature: result.txSignature,
            timestamp: new Date(),
            tokenMint: position.tokenMint,
            marketTicker: position.marketTicker,
            eventTitle: position.eventTitle,
            side: 'SELL',
            outcomeType: position.outcomeType || 'YES',
            amount: sellAmount,
            price: currentPrice,
            status: 'confirmed',
          });
        }

        setTimeout(() => {
          onSuccess?.();
          onClose();
        }, 3000);
      } else if (result.status.status === 'failed') {
        setError(result.status.error || (language === 'zh' ? '卖出失败' : 'Sell failed'));
      }
    } catch (err) {
      console.error('[DFlowSellModal] Error:', err);
      const errMsg = err instanceof Error ? err.message : (language === 'zh' ? '卖出失败' : 'Sell failed');
      setError(errMsg);
    } finally {
      setIsLoading(false);
      setStatusMessage('');
    }
  };

  // Handle percent buttons
  const handlePercentClick = (percent: number) => {
    setSellAmount(Number((maxSellable * percent).toFixed(2)));
  };

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
                    {language === 'zh' ? '卖出 Kalshi 持仓' : 'Sell Kalshi Position'}
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
                  {position.eventTitle || position.marketTicker || 'Unknown Market'}
                </h3>
                <div className="flex items-center gap-3">
                  <span
                    className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      position.outcomeType === 'YES'
                        ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                        : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                    }`}
                  >
                    {position.outcomeType}
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400">
                    Kalshi
                  </span>
                  <span className="text-sm text-gray-500 dark:text-gray-400">
                    {language === 'zh' ? '持有' : 'Holding'} {position.balance.toFixed(2)}{' '}
                    {language === 'zh' ? '股' : 'shares'} @ ${currentPrice.toFixed(4)}
                  </span>
                </div>
              </div>

              {/* Sell Amount */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  {language === 'zh' ? '卖出数量 (股)' : 'Sell Amount (shares)'}
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

              {/* Estimate */}
              <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-xl">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600 dark:text-gray-400">
                    {language === 'zh' ? '预计收到' : 'Estimated Value'}
                  </span>
                  <span className="text-lg font-bold text-gray-900 dark:text-white">
                    ${estimatedValue.toFixed(2)} USDC
                  </span>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 flex items-center gap-1">
                  <Info className="w-3 h-3" />
                  {language === 'zh'
                    ? '实际价格可能因滑点略有不同'
                    : 'Actual price may vary due to slippage'}
                </p>
              </div>

              {/* Status Message */}
              {statusMessage && (
                <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                  <div className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
                    <p className="text-sm text-blue-600 dark:text-blue-400">{statusMessage}</p>
                  </div>
                </div>
              )}

              {/* Error */}
              {error && (
                <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                    <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
                  </div>
                </div>
              )}

              {/* Success */}
              {success && (
                <div className="p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-4 h-4 bg-green-500 rounded-full flex items-center justify-center flex-shrink-0">
                      <svg
                        className="w-2.5 h-2.5 text-white"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path
                          fillRule="evenodd"
                          d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </div>
                    <p className="text-sm font-medium text-green-600 dark:text-green-400">
                      {language === 'zh' ? '卖出成功！' : 'Sell successful!'}
                    </p>
                  </div>
                  {txSignature && (
                    <a
                      href={`https://solscan.io/tx/${txSignature}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-green-500 dark:text-green-500 ml-6 flex items-center gap-1 hover:underline"
                    >
                      <ExternalLink className="w-3 h-3" />
                      {language === 'zh' ? '在 Solscan 查看交易' : 'View on Solscan'}
                    </a>
                  )}
                </div>
              )}

              {/* Sell Button */}
              <button
                onClick={handleSell}
                disabled={
                  isLoading ||
                  success ||
                  sellAmount <= 0 ||
                  sellAmount > maxSellable ||
                  !solanaWalletAddress
                }
                className="w-full py-3 bg-red-500 hover:bg-red-600 disabled:bg-gray-300 dark:disabled:bg-gray-700 text-white font-semibold rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    {language === 'zh' ? '处理中...' : 'Processing...'}
                  </>
                ) : success ? (
                  language === 'zh' ? '交易已完成' : 'Trade Completed'
                ) : (
                  <>
                    {language === 'zh' ? '卖出' : 'Sell'} {sellAmount.toFixed(2)}{' '}
                    {language === 'zh' ? '股' : 'shares'}
                  </>
                )}
              </button>

              {/* Note */}
              {!success && (
                <p className="text-xs text-center text-gray-500 dark:text-gray-400">
                  {language === 'zh'
                    ? '卖出将通过 DFlow 在 Solana 上执行'
                    : 'Sell will be executed via DFlow on Solana'}
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

export default DFlowSellModal;
