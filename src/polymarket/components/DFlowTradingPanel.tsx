/**
 * DFlow/Kalshi Trading Panel
 *
 * Trades on Kalshi prediction markets via DFlow on Solana.
 * Uses Privy Solana wallet (embedded or Phantom) for signing transactions.
 * Includes USDC balance checking and cross-chain deposit integration.
 */

import React, { useState, useCallback, useEffect } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { Connection, PublicKey } from '@solana/web3.js';
import { ChevronDown, ChevronUp, AlertCircle, Loader2, Check, Wallet, Info, Zap, Plus, RefreshCw } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Slider } from './ui/slider';
import { Badge } from './ui/badge';
import { Card, CardContent } from './ui/card';
import { dflowTradeService } from '../../services/dflow/dflowTradeService';
import { dflowPortfolioService } from '../../services/dflow/dflowPortfolioService';
import { translations } from '../../constants/translations';
import UnifiedDepositWidget from '../../components/wallet/UnifiedDepositWidget';

// Solana RPC and token config
// 前端使用 PublicNode 免费 RPC，后端使用 Helius（更可靠且 Key 不暴露）
const SOLANA_RPC_URL = import.meta.env.VITE_SOLANA_RPC_URL || 'https://solana-rpc.publicnode.com';
const SOLANA_USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

// Retry helper for RPC calls that may hit rate limits
async function withRpcRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  delayMs = 1000
): Promise<T> {
  let lastError: Error | null = null;
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (err: unknown) {
      lastError = err as Error;
      const errMsg = lastError?.message || '';
      // Only retry on rate limit (403) or temporary errors (500)
      if (errMsg.includes('403') || errMsg.includes('500') || errMsg.includes('429')) {
        console.log(`[DFlowTradingPanel] RPC retry ${i + 1}/${maxRetries} after error:`, errMsg);
        await new Promise(resolve => setTimeout(resolve, delayMs * (i + 1)));
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}

// ============================================
// Types
// ============================================

type OrderSide = 'BUY' | 'SELL';

interface OutcomeData {
  tokenId: string;  // Mint address for DFlow
  name: string;
  price: number;
  bestBid?: number;
  bestAsk?: number;
}

interface DFlowTradingPanelProps {
  // Market data
  marketTicker: string;
  eventTitle: string;
  outcomes?: OutcomeData[];
  // Single outcome fallback
  tokenId?: string;
  outcomeName?: string;
  currentPrice?: number;
  bestBid?: number;
  bestAsk?: number;
  // Callbacks
  onTradeComplete?: (result: { success: boolean; orderId?: string; txSignature?: string; error?: string }) => void;
  // Language
  language?: 'zh' | 'en';
  // Pre-selection for multi-option markets
  initialSide?: 'YES' | 'NO';
}

// ============================================
// Helper Functions
// ============================================

function formatPrice(price: number): string {
  return `${(price * 100).toFixed(1)}¢`;
}

function formatAmount(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

function calculatePotentialProfit(amount: number, price: number): {
  shares: number;
  potentialProfit: number;
  roi: number;
} {
  const shares = amount / price;
  const potentialProfit = shares - amount;
  const roi = ((potentialProfit / amount) * 100);
  return { shares, potentialProfit, roi };
}

// ============================================
// Component
// ============================================

export function DFlowTradingPanel({
  marketTicker,
  eventTitle,
  outcomes,
  tokenId: singleTokenId,
  outcomeName: singleOutcomeName,
  currentPrice: singlePrice,
  bestBid: singleBestBid,
  bestAsk: singleBestAsk,
  onTradeComplete,
  language = 'zh',
  initialSide
}: DFlowTradingPanelProps) {
  // Privy auth and Solana wallet
  const { login } = usePrivy();
  const {
    authenticated,
    isSolanaWalletReady,
    primarySolanaWallet,
    solanaWalletAddress,
    signSolanaTransaction,
    createSolanaWallet,
  } = useAuth();

  // Translation
  const t = translations[language]?.tradingPanel || translations.en.tradingPanel || {};

  // State
  const [isExpanded, setIsExpanded] = useState(true);
  const [orderSide, setOrderSide] = useState<OrderSide>('BUY');
  const [amount, setAmount] = useState<string>('');
  const [slippageBps, setSlippageBps] = useState<number>(50); // 0.5%
  const [selectedOutcome, setSelectedOutcome] = useState<'YES' | 'NO'>(initialSide || 'YES');
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionStatus, setExecutionStatus] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ orderId: string; txSignature: string } | null>(null);

  // USDC Balance state
  const [usdcBalance, setUsdcBalance] = useState<number | null>(null);
  const [isLoadingBalance, setIsLoadingBalance] = useState(false);
  const [showDepositWidget, setShowDepositWidget] = useState(false);

  // API availability state
  const [isApiUnavailable, setIsApiUnavailable] = useState(false);

  // Fetch USDC balance with retry logic for rate-limited RPC
  const fetchUsdcBalance = useCallback(async () => {
    if (!solanaWalletAddress) {
      setUsdcBalance(null);
      return;
    }

    setIsLoadingBalance(true);
    try {
      const connection = new Connection(SOLANA_RPC_URL, 'confirmed');
      const walletPubkey = new PublicKey(solanaWalletAddress);
      const usdcMint = new PublicKey(SOLANA_USDC_MINT);

      // Get token accounts for this wallet with retry
      const tokenAccounts = await withRpcRetry(() =>
        connection.getParsedTokenAccountsByOwner(walletPubkey, {
          mint: usdcMint,
        })
      );

      if (tokenAccounts.value.length > 0) {
        const balance = tokenAccounts.value[0].account.data.parsed.info.tokenAmount.uiAmount;
        setUsdcBalance(balance);
        console.log('[DFlowTradingPanel] USDC balance:', balance);
      } else {
        setUsdcBalance(0);
        console.log('[DFlowTradingPanel] No USDC token account found');
      }
    } catch (err) {
      console.error('[DFlowTradingPanel] Failed to fetch USDC balance:', err);
      // Set balance to 0 instead of null on error to allow trading
      // Users can manually refresh or proceed without balance display
      setUsdcBalance(0);
    } finally {
      setIsLoadingBalance(false);
    }
  }, [solanaWalletAddress]);

  // Fetch balance when wallet is ready
  useEffect(() => {
    if (isSolanaWalletReady && solanaWalletAddress) {
      fetchUsdcBalance();
    }
  }, [isSolanaWalletReady, solanaWalletAddress, fetchUsdcBalance]);

  // Check if balance is sufficient
  const amountNum = parseFloat(amount) || 0;
  const hasInsufficientBalance = usdcBalance !== null && amountNum > usdcBalance;

  // Determine outcome data
  const getOutcomeData = useCallback((): OutcomeData | null => {
    if (outcomes && outcomes.length >= 2) {
      const yesOutcome = outcomes.find(o => o.name === 'Yes' || o.name === 'YES');
      const noOutcome = outcomes.find(o => o.name === 'No' || o.name === 'NO');
      return selectedOutcome === 'YES' ? (yesOutcome || outcomes[0]) : (noOutcome || outcomes[1]);
    }
    if (singleTokenId) {
      return {
        tokenId: singleTokenId,
        name: singleOutcomeName || 'Yes',
        price: singlePrice || 0.5,
        bestBid: singleBestBid,
        bestAsk: singleBestAsk
      };
    }
    return null;
  }, [outcomes, selectedOutcome, singleTokenId, singleOutcomeName, singlePrice, singleBestBid, singleBestAsk]);

  const outcomeData = getOutcomeData();
  const executionPrice = outcomeData?.bestAsk || outcomeData?.price || 0.5;

  // Calculate potential profit
  const estimate = amountNum > 0 && executionPrice > 0
    ? calculatePotentialProfit(amountNum, executionPrice)
    : null;

  // Handle trade execution
  const handleExecuteTrade = async () => {
    // Check if user is authenticated
    if (!authenticated) {
      login();
      return;
    }

    // Check if Solana wallet is ready
    if (!isSolanaWalletReady || !primarySolanaWallet) {
      // Try to create embedded Solana wallet if not exists
      try {
        setExecutionStatus(language === 'zh' ? '正在创建 Solana 钱包...' : 'Creating Solana wallet...');
        await createSolanaWallet();
      } catch (err) {
        setError(language === 'zh' ? '请先连接 Solana 钱包' : 'Please connect a Solana wallet first');
      }
      return;
    }

    if (!outcomeData?.tokenId || amountNum <= 0) {
      setError('Invalid trade parameters');
      return;
    }

    // Check for insufficient balance - prompt to deposit
    if (hasInsufficientBalance) {
      setShowDepositWidget(true);
      return;
    }

    setIsExecuting(true);
    setError(null);
    setSuccess(null);
    setExecutionStatus('');

    try {
      // USDC mint address on Solana mainnet
      const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

      const result = await dflowTradeService.executeTradeWithPrivy(
        {
          inputMint: orderSide === 'BUY' ? USDC_MINT : outcomeData.tokenId,
          outputMint: orderSide === 'BUY' ? outcomeData.tokenId : USDC_MINT,
          amount: Math.floor(amountNum * 1_000_000), // Convert to USDC decimals (6)
          slippageBps,
          publicKey: solanaWalletAddress!
        },
        primarySolanaWallet,
        (status) => setExecutionStatus(status)
      );

      setSuccess({
        orderId: result.orderId,
        txSignature: result.txSignature
      });

      // Save trade to history with tokenMint for avg cost calculation
      if (solanaWalletAddress) {
        // Use execution price (bestAsk for buys, or current price)
        const tradePrice = executionPrice;
        // Calculate shares received: amount / price
        const sharesReceived = amountNum / tradePrice;

        dflowPortfolioService.saveTradeToHistory(solanaWalletAddress, {
          txSignature: result.txSignature,
          timestamp: new Date(),
          tokenMint: outcomeData.tokenId, // Token mint for matching to positions
          marketTicker: marketTicker,
          eventTitle: eventTitle,
          side: orderSide,
          outcomeType: selectedOutcome,
          amount: sharesReceived, // Number of shares (not USDC amount)
          price: tradePrice, // Price per share
          status: 'confirmed',
        });
      }

      onTradeComplete?.({
        success: true,
        orderId: result.orderId,
        txSignature: result.txSignature
      });

    } catch (err: any) {
      console.error('[DFlowTradingPanel] Trade error:', err);
      const errorMessage = err.message || 'Trade execution failed';

      // Detect API unavailability (403 errors)
      if (errorMessage.includes('403') || errorMessage.includes('Failed to get intent')) {
        setIsApiUnavailable(true);
        const apiError = language === 'zh'
          ? 'DFlow 交易 API 暂时不可用。需要有效的 API 密钥。请联系 hello@dflow.net 获取访问权限。'
          : 'DFlow Trade API is temporarily unavailable. A valid API key is required. Please contact hello@dflow.net for access.';
        setError(apiError);
      } else {
        setError(errorMessage);
      }

      onTradeComplete?.({ success: false, error: errorMessage });
    } finally {
      setIsExecuting(false);
      setExecutionStatus('');
    }
  };

  // Handle wallet connection (login with Privy)
  const handleConnectWallet = () => {
    if (!authenticated) {
      login();
    } else if (!isSolanaWalletReady) {
      // Create Solana wallet if user is authenticated but doesn't have one
      createSolanaWallet().catch(console.error);
    }
  };

  return (
    <Card className="border shadow-sm">
      <CardContent className="p-4">
        {/* Header */}
        <div
          className="flex items-center justify-between cursor-pointer"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
              Kalshi
            </Badge>
            <h3 className="font-semibold text-sm">{t.title || 'Trade'}</h3>
          </div>
          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>

        {isExpanded && (
          <div className="mt-4 space-y-4">
            {/* API Unavailable Warning */}
            {isApiUnavailable && (
              <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                      {language === 'zh' ? 'Kalshi 交易暂不可用' : 'Kalshi Trading Unavailable'}
                    </p>
                    <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
                      {language === 'zh'
                        ? 'DFlow Trade API 需要有效的生产环境 API 密钥。正在联系 DFlow 获取访问权限。'
                        : 'DFlow Trade API requires a valid production API key. We are working on obtaining access.'}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Wallet Status */}
            {!authenticated ? (
              <div className="p-3 bg-amber-50 dark:bg-amber-950/30 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <Wallet className="w-4 h-4 text-amber-600" />
                  <span className="text-sm font-medium text-amber-800 dark:text-amber-200">
                    {language === 'zh' ? '需要登录' : 'Login Required'}
                  </span>
                </div>
                <p className="text-xs text-amber-700 dark:text-amber-300 mb-2">
                  {language === 'zh'
                    ? '请登录以在 Kalshi 市场上交易。系统将自动为您创建 Solana 钱包。'
                    : 'Please login to trade on Kalshi markets. A Solana wallet will be created for you.'}
                </p>
                <Button
                  size="sm"
                  onClick={handleConnectWallet}
                  className="w-full"
                >
                  <Wallet className="w-4 h-4 mr-2" />
                  {language === 'zh' ? '登录' : 'Login'}
                </Button>
              </div>
            ) : !isSolanaWalletReady ? (
              <div className="p-3 bg-amber-50 dark:bg-amber-950/30 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <Wallet className="w-4 h-4 text-amber-600" />
                  <span className="text-sm font-medium text-amber-800 dark:text-amber-200">
                    {language === 'zh' ? '需要 Solana 钱包' : 'Solana Wallet Required'}
                  </span>
                </div>
                <p className="text-xs text-amber-700 dark:text-amber-300 mb-2">
                  {language === 'zh'
                    ? '您的账户还没有 Solana 钱包。点击下方按钮创建一个，用于 Kalshi 交易。'
                    : 'Your account does not have a Solana wallet yet. Click below to create one for Kalshi trading.'}
                </p>
                <Button
                  size="sm"
                  onClick={async () => {
                    try {
                      setIsExecuting(true);
                      setExecutionStatus(language === 'zh' ? '正在创建 Solana 钱包...' : 'Creating Solana wallet...');
                      setError(null);
                      const result = await createSolanaWallet();
                      console.log('✅ Solana wallet created:', result);
                      setExecutionStatus('');
                      setSuccess({ orderId: 'wallet-created', txSignature: result?.wallet?.address || '' });
                    } catch (err: any) {
                      console.error('❌ Failed to create Solana wallet:', err);
                      setError(err.message || 'Failed to create Solana wallet');
                      setExecutionStatus('');
                    } finally {
                      setIsExecuting(false);
                    }
                  }}
                  className="w-full"
                  disabled={isExecuting}
                >
                  {isExecuting ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      {executionStatus || (language === 'zh' ? '创建中...' : 'Creating...')}
                    </>
                  ) : (
                    <>
                      <Wallet className="w-4 h-4 mr-2" />
                      {language === 'zh' ? '创建 Solana 钱包' : 'Create Solana Wallet'}
                    </>
                  )}
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                {/* Wallet Address */}
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <div className="w-2 h-2 rounded-full bg-green-500" />
                    {solanaWalletAddress?.slice(0, 4)}...{solanaWalletAddress?.slice(-4)}
                    <Badge variant="outline" className="ml-1 text-[10px] px-1 py-0">
                      {primarySolanaWallet?.walletClientType === 'privy' ? 'Embedded' : 'External'}
                    </Badge>
                  </span>
                </div>

                {/* USDC Balance */}
                <div className="flex items-center justify-between p-2 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                      USDC {language === 'zh' ? '余额' : 'Balance'}:
                    </span>
                    {isLoadingBalance ? (
                      <Loader2 className="w-3 h-3 animate-spin text-gray-400" />
                    ) : (
                      <span className={`text-sm font-semibold ${hasInsufficientBalance ? 'text-red-500' : 'text-green-600 dark:text-green-400'}`}>
                        ${usdcBalance?.toFixed(2) ?? '--'}
                      </span>
                    )}
                    <button
                      onClick={fetchUsdcBalance}
                      className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
                      disabled={isLoadingBalance}
                    >
                      <RefreshCw className={`w-3 h-3 text-gray-400 ${isLoadingBalance ? 'animate-spin' : ''}`} />
                    </button>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    onClick={() => setShowDepositWidget(true)}
                  >
                    <Plus className="w-3 h-3 mr-1" />
                    {language === 'zh' ? '充值' : 'Deposit'}
                  </Button>
                </div>

                {/* Insufficient Balance Warning */}
                {hasInsufficientBalance && (
                  <div className="p-2 bg-red-50 dark:bg-red-950/30 rounded-lg flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                    <span className="text-xs text-red-600 dark:text-red-400">
                      {language === 'zh'
                        ? `余额不足，需要 $${amountNum.toFixed(2)}，当前 $${usdcBalance?.toFixed(2)}`
                        : `Insufficient balance. Need $${amountNum.toFixed(2)}, have $${usdcBalance?.toFixed(2)}`}
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Event Title */}
            <div className="text-xs text-muted-foreground truncate" title={eventTitle}>
              {eventTitle}
            </div>

            {/* Outcome Selection */}
            {outcomes && outcomes.length >= 2 && (
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant={selectedOutcome === 'YES' ? 'default' : 'outline'}
                  size="sm"
                  className={selectedOutcome === 'YES' ? 'bg-green-600 hover:bg-green-700' : ''}
                  onClick={() => setSelectedOutcome('YES')}
                >
                  YES {formatPrice(outcomes.find(o => o.name === 'Yes')?.price || 0.5)}
                </Button>
                <Button
                  variant={selectedOutcome === 'NO' ? 'default' : 'outline'}
                  size="sm"
                  className={selectedOutcome === 'NO' ? 'bg-red-600 hover:bg-red-700' : ''}
                  onClick={() => setSelectedOutcome('NO')}
                >
                  NO {formatPrice(outcomes.find(o => o.name === 'No')?.price || 0.5)}
                </Button>
              </div>
            )}

            {/* Buy/Sell Toggle */}
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant={orderSide === 'BUY' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setOrderSide('BUY')}
              >
                {t.buy || 'Buy'}
              </Button>
              <Button
                variant={orderSide === 'SELL' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setOrderSide('SELL')}
              >
                {t.sell || 'Sell'}
              </Button>
            </div>

            {/* Amount Input */}
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">
                {t.amount || 'Amount'} (USDC)
              </label>
              <Input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="10"
                min="1"
                step="1"
              />
            </div>

            {/* Quick Amount Buttons */}
            <div className="flex gap-1">
              {[5, 10, 25, 50, 100].map((val) => (
                <Button
                  key={val}
                  variant="outline"
                  size="sm"
                  className="flex-1 text-xs"
                  onClick={() => setAmount(val.toString())}
                >
                  ${val}
                </Button>
              ))}
            </div>

            {/* Slippage */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs text-muted-foreground">
                  {t.slippage || 'Slippage'}
                </label>
                <span className="text-xs">{(slippageBps / 100).toFixed(1)}%</span>
              </div>
              <Slider
                value={[slippageBps]}
                onValueChange={(val) => setSlippageBps(val[0])}
                min={10}
                max={500}
                step={10}
              />
            </div>

            {/* Estimate */}
            {estimate && (
              <div className="p-3 bg-slate-50 dark:bg-slate-900 rounded-lg space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">{t.executionPrice || 'Price'}</span>
                  <span>{formatPrice(executionPrice)}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">{t.shares || 'Shares'}</span>
                  <span>{estimate.shares.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-xs font-medium">
                  <span className="text-muted-foreground">{t.potentialProfit || 'If Win'}</span>
                  <span className="text-green-600">
                    +{formatAmount(estimate.potentialProfit)} ({estimate.roi.toFixed(0)}%)
                  </span>
                </div>
              </div>
            )}

            {/* Error/Success Messages */}
            {error && (
              <div className="p-2 bg-red-50 dark:bg-red-950/30 rounded-lg flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-red-700 dark:text-red-300">{error}</p>
              </div>
            )}

            {success && (
              <div className="p-2 bg-green-50 dark:bg-green-950/30 rounded-lg flex items-start gap-2">
                <Check className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
                <div className="text-xs text-green-700 dark:text-green-300">
                  <p className="font-medium">{language === 'zh' ? '交易成功！' : 'Trade Successful!'}</p>
                  <a
                    href={`https://solscan.io/tx/${success.txSignature}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline"
                  >
                    {language === 'zh' ? '查看交易' : 'View Transaction'}
                  </a>
                </div>
              </div>
            )}

            {/* Execute Button */}
            <Button
              className={`w-full ${hasInsufficientBalance ? 'bg-amber-600 hover:bg-amber-700' : ''} ${isApiUnavailable ? 'opacity-50' : ''}`}
              onClick={handleExecuteTrade}
              disabled={!isSolanaWalletReady || isExecuting || amountNum <= 0 || isApiUnavailable}
            >
              {isExecuting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  {executionStatus || (language === 'zh' ? '处理中...' : 'Processing...')}
                </>
              ) : hasInsufficientBalance ? (
                <>
                  <Plus className="w-4 h-4 mr-2" />
                  {language === 'zh' ? '充值后交易' : 'Deposit & Trade'}
                </>
              ) : (
                <>
                  <Zap className="w-4 h-4 mr-2" />
                  {orderSide === 'BUY'
                    ? (language === 'zh' ? `买入 ${selectedOutcome}` : `Buy ${selectedOutcome}`)
                    : (language === 'zh' ? `卖出 ${selectedOutcome}` : `Sell ${selectedOutcome}`)}
                </>
              )}
            </Button>

            {/* Info */}
            <div className="flex items-start gap-2 text-xs text-muted-foreground">
              <Info className="w-3 h-3 flex-shrink-0 mt-0.5" />
              <span>
                {language === 'zh'
                  ? 'Kalshi 市场通过 DFlow 在 Solana 上交易。登录后系统会自动创建 Solana 钱包，需要 USDC。'
                  : 'Kalshi markets trade via DFlow on Solana. A Solana wallet is created automatically on login. Requires USDC.'}
              </span>
            </div>
          </div>
        )}
      </CardContent>

      {/* Deposit Widget */}
      <UnifiedDepositWidget
        isOpen={showDepositWidget}
        onClose={() => setShowDepositWidget(false)}
        language={language}
        defaultTarget="kalshi"
        destinationAddress={solanaWalletAddress || undefined}
        onSuccess={async (result) => {
          console.log('[DFlowTradingPanel] Deposit success:', result);
          setShowDepositWidget(false);
          // Wait for transaction to be confirmed on blockchain before refreshing balance
          // Solana needs time to finalize the transaction and for RPC to index it
          console.log('[DFlowTradingPanel] Waiting for transaction confirmation...');
          await new Promise(resolve => setTimeout(resolve, 3000));
          // Retry balance fetch with delay to handle RPC indexing lag
          for (let attempt = 1; attempt <= 3; attempt++) {
            await fetchUsdcBalance();
            // If balance found, stop retrying
            if (usdcBalance !== null && usdcBalance > 0) break;
            if (attempt < 3) {
              console.log(`[DFlowTradingPanel] Balance still 0, retrying in ${attempt * 2}s...`);
              await new Promise(resolve => setTimeout(resolve, attempt * 2000));
            }
          }
        }}
      />
    </Card>
  );
}

export default DFlowTradingPanel;
