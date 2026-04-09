/**
 * Polymarket 交易面板组件
 *
 * Gasless 架构特点：
 * - Safe 钱包作为资金持有者 (funder)
 * - EOA 只负责签名 (signer)
 * - signatureType = 2 (POLY_PROXY)
 * - 所有 Gas 由 Builder 代付 = 完全 Gasless
 * - 支持 YES/NO 选择
 * - 支持 Privy Delegated Actions 自动交易
 * 
 * 注意：Safe 钱包状态现在由 UserMenu 组件管理和显示
 */

import React, { useState, useEffect } from 'react';
import { ChevronDown, ChevronUp, AlertCircle, Loader2, Check, Wallet, Info, Zap } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Slider } from './ui/slider';
import { Badge } from './ui/badge';
import { Card, CardContent } from './ui/card';
// Safe 服务 (Gasless)
import {
  getSafeInfo,
  getSafeUSDCBalance,
  executeOrder,
  setTokenApprovals,
  type OrderParams,
  type OrderResult,
  type SafeInfo,
} from '../../services/polymarket/polymarketSafeService';
// Safe 钱包 Hook
import { useSafeWallet } from '../../contexts/SafeWalletContext';
// 翻译
import { translations } from '../../constants/translations';

// ============================================
// 类型定义
// ============================================

type OrderSide = 'BUY' | 'SELL';
type OrderType = 'MARKET' | 'LIMIT';
type TimeInForce = 'FOK' | 'GTC' | 'GTD';

interface OutcomeData {
  tokenId: string;
  name: string;
  price: number;
  bestBid?: number;
  bestAsk?: number;
}

interface TradingPanelProps {
  // 支持单个或多个 outcome
  tokenId?: string;
  outcomeName?: string;
  currentPrice?: number;
  bestBid?: number;
  bestAsk?: number;
  // 新增：两个 outcome 的完整数据
  outcomes?: OutcomeData[];
  eventTitle: string;
  // 认证相关
  walletAddress: string;
  accessToken: string;
  // Privy provider 获取函数
  getProvider: () => Promise<any>;
  signTypedData?: (domain: object, types: object, message: object, primaryType: string) => Promise<string>;
  // 余额 (可选，如果不提供会自动获取)
  usdcBalance?: number;
  // 订单限制 (从市场数据获取)
  orderMinSize?: number; // 最小订单大小 (股数)，默认为 5
  // 回调
  onTradeComplete?: (result: { success: boolean; orderId?: string; error?: string }) => void;
  // 语言
  language?: 'zh' | 'en';
}

// ============================================
// 工具函数
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

function shortenAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

// ============================================
// 注意：Safe 钱包状态组件已移动到 UserMenu
// 这里只保留交易相关的功能
// ============================================

// ============================================
// 主组件
// ============================================

export const TradingPanel: React.FC<TradingPanelProps> = ({
  tokenId: legacyTokenId,
  outcomeName: legacyOutcomeName,
  currentPrice: legacyCurrentPrice,
  bestBid: legacyBestBid,
  bestAsk: legacyBestAsk,
  outcomes: propsOutcomes,
  eventTitle,
  walletAddress,
  accessToken,
  getProvider,
  signTypedData,
  usdcBalance: propsUsdcBalance,
  orderMinSize: propsOrderMinSize,
  onTradeComplete,
  language = 'zh',
}) => {
  const t = translations[language]?.polymarketPage?.trading || translations.en.polymarketPage.trading;
  // 最小订单大小 (股数) - 使用市场的值，如果没有则使用默认值 5
  const minOrderSize = propsOrderMinSize || 5;
  // ============================================
  // 构建 outcomes 数组（兼容旧 props）
  // ============================================
  const outcomes: OutcomeData[] = propsOutcomes || [
    {
      tokenId: legacyTokenId || '',
      name: legacyOutcomeName || 'Yes',
      price: legacyCurrentPrice || 0.5,
      bestBid: legacyBestBid,
      bestAsk: legacyBestAsk,
    },
    {
      tokenId: '',
      name: 'No',
      price: 1 - (legacyCurrentPrice || 0.5),
      bestBid: legacyBestAsk ? 1 - legacyBestAsk : undefined,
      bestAsk: legacyBestBid ? 1 - legacyBestBid : undefined,
    },
  ];

  // ============================================
  // 选中的 outcome
  // ============================================
  const [selectedOutcomeIndex, setSelectedOutcomeIndex] = useState(0);
  const selectedOutcome = outcomes[selectedOutcomeIndex];

  // ============================================
  // Safe 钱包状态 (来自全局 SafeWalletContext)
  // ============================================
  const {
    safeAddress,
    isReady,
    isInitializing,
    initProgress,
    initError,
    usdcBalance: safeUsdcBalance,
    refreshBalance,
  } = useSafeWallet();
  
  // 使用 props 余额或 hook 余额
  const usdcBalance = propsUsdcBalance || safeUsdcBalance || 0;

  // ============================================
  // 交易状态
  // ============================================
  const [amount, setAmount] = useState<number>(10);
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
  const [orderSide, setOrderSide] = useState<OrderSide>('BUY');
  const [orderType, setOrderType] = useState<OrderType>('MARKET');
  const [limitPrice, setLimitPrice] = useState<number>(selectedOutcome.price);
  const [timeInForce, setTimeInForce] = useState<TimeInForce>('FOK');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isReapproving, setIsReapproving] = useState(false);

  // ============================================
  // 重新授权处理 (当检测到授权缺失时)
  // ============================================
  const handleReapprove = async () => {
    if (!safeAddress || isReapproving) return;

    try {
      setIsReapproving(true);
      setError(null);

      const provider = await getProvider();
      const { ethers: ethers5 } = await import('ethers5');
      const web3Provider = new ethers5.providers.Web3Provider(provider);
      const signer = web3Provider.getSigner();

      console.log('[TradingPanel] Re-approving token authorizations...');
      const result = await setTokenApprovals(signer, safeAddress, (step) => {
        console.log('[TradingPanel] Approval progress:', step);
      });

      if (result.success) {
        setError(null);
        console.log('[TradingPanel] Re-approval successful');
      } else {
        setError(`${t.errors?.authFailed || 'Authorization failed'}: ${result.error}`);
      }
    } catch (err) {
      console.error('[TradingPanel] Re-approval error:', err);
      setError(err instanceof Error ? err.message : (t.errors?.reAuthFailed || 'Re-authorization failed'));
    } finally {
      setIsReapproving(false);
    }
  };

  // 检查错误是否是授权缺失
  const isApprovalMissing = error?.startsWith('APPROVAL_MISSING:');
  const displayError = isApprovalMissing ? error.replace('APPROVAL_MISSING:', '') : error;

  // ============================================
  // 当切换 outcome 时，更新限价
  // ============================================
  useEffect(() => {
    setLimitPrice(selectedOutcome.price);
  }, [selectedOutcomeIndex, selectedOutcome.price]);

  // ============================================
  // Safe 状态现在由 useSafeWallet hook 管理
  // 不再需要手动初始化逻辑
  // ============================================

  // ============================================
  // 计算
  // ============================================
  const currentPrice = selectedOutcome.price;
  const bestAsk = selectedOutcome.bestAsk;
  const bestBid = selectedOutcome.bestBid;
  const executionPrice = orderType === 'LIMIT' ? limitPrice : (bestAsk || currentPrice);
  const estimate = amount > 0 && executionPrice > 0
    ? calculatePotentialProfit(amount, executionPrice)
    : null;

  // ============================================
  // 金额处理
  // ============================================
  const handleAmountChange = (value: number) => {
    setAmount(Math.max(0, Math.min(value, usdcBalance || 10000)));
    setError(null);
  };

  const quickAmounts = [
    { label: '+1', value: 1, action: 'add' as const },
    { label: '+10', value: 10, action: 'add' as const },
    { label: '25%', value: 0.25, action: 'percent' as const },
    { label: '50%', value: 0.5, action: 'percent' as const },
    { label: '75%', value: 0.75, action: 'percent' as const },
    { label: 'MAX', value: 1, action: 'percent' as const },
  ];

  const handleQuickAmount = (quick: typeof quickAmounts[0]) => {
    if (quick.action === 'add') {
      handleAmountChange(amount + quick.value);
    } else {
      handleAmountChange(Math.floor(usdcBalance * quick.value * 100) / 100);
    }
  };

  // ============================================
  // 下单 (Gasless)
  // ============================================
  const handleTrade = async () => {
    if (!walletAddress || !accessToken) {
      setError(t.errors?.connectWallet || 'Please connect wallet first');
      return;
    }

    if (!isReady || !safeAddress) {
      setError(t.errors?.initSafeWallet || 'Please initialize Safe wallet first');
      return;
    }

    if (amount <= 0) {
      setError(t.errors?.invalidAmount || 'Please enter a valid amount');
      return;
    }

    if (amount > usdcBalance) {
      setError(t.errors?.insufficientBalance || 'Insufficient balance');
      return;
    }

    if (!selectedOutcome.tokenId) {
      setError(t.errors?.invalidTarget || 'Invalid trading target');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const provider = await getProvider();
      if (!provider) {
        throw new Error(t.errors?.cannotGetProvider || 'Cannot get wallet Provider');
      }

      // 将 EIP-1193 provider 转换为 ethers5 signer
      const { ethers: ethers5 } = await import('ethers5');
      const web3Provider = new ethers5.providers.Web3Provider(provider);
      const signer = web3Provider.getSigner();

      const orderParams: OrderParams = {
        tokenId: selectedOutcome.tokenId,
        side: orderSide,
        type: orderType,
        amount,
        price: orderType === 'LIMIT' ? limitPrice : undefined,
        timeInForce,
        // 传入当前UI显示的价格作为回退
        fallbackPrice: selectedOutcome.price,
      };

      // 使用 Safe 模式下单 (Gasless)
      const result = await executeOrder(signer, accessToken, safeAddress, orderParams, minOrderSize);

      if (result.success) {
        onTradeComplete?.({ success: true, orderId: result.orderId });
        setAmount(10);
        // 刷新余额
        await refreshBalance();
      } else {
        setError(result.errorMsg || (t.errors?.orderFailed || 'Order failed'));
        onTradeComplete?.({ success: false, error: result.errorMsg });
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : (t.errors?.tradeFailed || 'Trade failed');
      setError(errorMsg);
      onTradeComplete?.({ success: false, error: errorMsg });
    } finally {
      setIsLoading(false);
    }
  };

  // ============================================
  // 渲染
  // ============================================
  return (
    <div className="space-y-4">
      {/* Safe 状态提示 (如果正在初始化) */}
      {!isReady && (
        <Card className="border-blue-500/50 bg-blue-50/50 dark:bg-blue-900/10">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 text-blue-700 dark:text-blue-400 text-sm">
              {isInitializing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>{initProgress || t.initializingAccount}</span>
                </>
              ) : initError ? (
                <>
                  <AlertCircle className="w-4 h-4 text-red-500" />
                  <span className="text-red-600">{initError}</span>
                </>
              ) : (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>{t.preparingAccount}</span>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* YES/NO 选择器 */}
      <div className="grid grid-cols-2 gap-2">
        {outcomes.map((outcome, index) => (
          <button
            key={outcome.name}
            onClick={() => setSelectedOutcomeIndex(index)}
            disabled={!outcome.tokenId}
            className={`p-3 rounded-lg border-2 transition-all ${
              selectedOutcomeIndex === index
                ? outcome.name.toLowerCase() === 'yes'
                  ? 'border-green-500 bg-green-50 dark:bg-green-900/20'
                  : 'border-red-500 bg-red-50 dark:bg-red-900/20'
                : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'
            } ${!outcome.tokenId ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <div className="flex items-center justify-between">
              <span className={`font-medium ${
                outcome.name.toLowerCase() === 'yes' ? 'text-green-600' : 'text-red-600'
              }`}>
                {outcome.name}
              </span>
              <span className="font-bold text-lg">{formatPrice(outcome.price)}</span>
            </div>
          </button>
        ))}
      </div>

      {/* 当前选择提示 */}
      <div className="flex items-center justify-between text-sm">
        <span className="text-gray-500 dark:text-gray-400">{t.currentPrice}</span>
        <div className="flex items-center gap-2">
          <Badge variant={selectedOutcome.name.toLowerCase() === 'yes' ? 'default' : 'destructive'}>
            {selectedOutcome.name}
          </Badge>
          <span className="font-semibold">{formatPrice(selectedOutcome.price)}</span>
        </div>
      </div>

      {/* 金额输入 */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
            <Input
              type="number"
              value={amount}
              onChange={(e) => handleAmountChange(parseFloat(e.target.value) || 0)}
              className="pl-7 text-lg font-semibold"
              min={0}
              max={usdcBalance}
              step={1}
              disabled={!isReady}
            />
          </div>
          <div className="flex gap-1">
            {quickAmounts.slice(0, 2).map((quick) => (
              <Button
                key={quick.label}
                variant="outline"
                size="sm"
                onClick={() => handleQuickAmount(quick)}
                className="px-2"
                disabled={!isReady}
              >
                {quick.label}
              </Button>
            ))}
          </div>
        </div>

        <Slider
          value={[amount]}
          onValueChange={([v]) => handleAmountChange(v)}
          max={usdcBalance || 1000}
          step={1}
          className="w-full"
          disabled={!isReady}
        />

        <div className="flex gap-1 justify-end">
          {quickAmounts.slice(2).map((quick) => (
            <Button
              key={quick.label}
              variant="ghost"
              size="sm"
              onClick={() => handleQuickAmount(quick)}
              className="text-xs px-2 h-6"
              disabled={!isReady}
            >
              {quick.label}
            </Button>
          ))}
        </div>
      </div>

      {/* 价格超出范围警告 - Polymarket 大多数市场 tickSize=0.01，价格范围 1%-99% */}
      {selectedOutcome && (selectedOutcome.price < 0.01 || selectedOutcome.price > 0.99) && isReady && (
        <Card className="border bg-red-50 dark:bg-red-900/20 border-red-400 dark:border-red-600">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 text-red-600 dark:text-red-400 text-sm">
              <AlertCircle size={16} />
              <span>
                {selectedOutcome.price < 0.01 
                  ? (t.priceTooLow || 'Price too low ({price}%), minimum 1%. Cannot place order.').replace('{price}', (selectedOutcome.price * 100).toFixed(2))
                  : (t.priceTooHigh || 'Price too high ({price}%), maximum 99%. Cannot place order.').replace('{price}', (selectedOutcome.price * 100).toFixed(2))
                }
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 预估信息 */}
      {estimate && isReady && selectedOutcome && selectedOutcome.price >= 0.01 && selectedOutcome.price <= 0.99 && (
        <Card className={`border ${estimate.shares < minOrderSize ? 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-400 dark:border-yellow-600' : 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'}`}>
          <CardContent className="p-3 space-y-1">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600 dark:text-gray-400">{t.expectedShares}</span>
              <span className={`font-medium ${estimate.shares < minOrderSize ? 'text-yellow-600 dark:text-yellow-400' : ''}`}>
                {estimate.shares.toFixed(2)} {t.shares}
              </span>
            </div>
            {/* 最小订单警告 */}
            {estimate.shares < minOrderSize && (
              <div className="flex items-center gap-1 text-xs text-yellow-600 dark:text-yellow-400 bg-yellow-100 dark:bg-yellow-900/30 px-2 py-1 rounded">
                <AlertCircle size={12} />
                <span>{(t.minOrderWarning || 'Minimum {shares} shares required, please increase amount to {amount} USDC').replace('{shares}', String(minOrderSize)).replace('{amount}', (selectedOutcome?.price ? selectedOutcome.price * minOrderSize : 0.5).toFixed(2))}</span>
              </div>
            )}
            <div className="flex justify-between text-sm">
              <span className="text-gray-600 dark:text-gray-400">{t.potentialProfit}</span>
              <span className="font-semibold text-green-600 dark:text-green-400">
                {formatAmount(estimate.potentialProfit)}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600 dark:text-gray-400">{t.returnRate}</span>
              <span className="font-medium text-green-600 dark:text-green-400">
                {estimate.roi.toFixed(1)}%
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 高级选项切换 */}
      <button
        onClick={() => setIsAdvancedOpen(!isAdvancedOpen)}
        className="flex items-center justify-center gap-1 w-full py-1 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
        disabled={!isReady}
      >
        {isAdvancedOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        {isAdvancedOpen ? t.collapseAdvanced : t.expandAdvanced}
      </button>

      {/* 高级选项 */}
      {isAdvancedOpen && isReady && (
        <div className="space-y-3 pt-2 border-t border-gray-200 dark:border-gray-700">
          {/* Buy/Sell 切换 */}
          <div className="flex gap-2">
            <Button
              variant={orderSide === 'BUY' ? 'default' : 'outline'}
              className={`flex-1 ${orderSide === 'BUY' ? 'bg-green-500 hover:bg-green-600' : ''}`}
              onClick={() => setOrderSide('BUY')}
            >
              {t.buy}
            </Button>
            <Button
              variant={orderSide === 'SELL' ? 'default' : 'outline'}
              className={`flex-1 ${orderSide === 'SELL' ? 'bg-red-500 hover:bg-red-600' : ''}`}
              onClick={() => setOrderSide('SELL')}
            >
              {t.sell}
            </Button>
          </div>

          {/* Market/Limit 切换 */}
          <div className="flex gap-2">
            <Button
              variant={orderType === 'MARKET' ? 'default' : 'outline'}
              size="sm"
              className="flex-1"
              onClick={() => setOrderType('MARKET')}
            >
              {t.market}
            </Button>
            <Button
              variant={orderType === 'LIMIT' ? 'default' : 'outline'}
              size="sm"
              className="flex-1"
              onClick={() => setOrderType('LIMIT')}
            >
              {t.limit}
            </Button>
          </div>

          {/* 限价输入 */}
          {orderType === 'LIMIT' && (
            <div className="space-y-1">
              <label className="text-sm text-gray-500">{t.limitPrice} (0-1)</label>
              <Input
                type="number"
                value={limitPrice}
                onChange={(e) => setLimitPrice(parseFloat(e.target.value) || 0)}
                min={0}
                max={1}
                step={0.01}
              />
            </div>
          )}

          {/* 执行类型 */}
          <div className="space-y-1">
            <label className="text-sm text-gray-500">{t.executionType}</label>
            <div className="flex gap-1">
              {(['FOK', 'GTC', 'GTD'] as TimeInForce[]).map((tif) => (
                <Button
                  key={tif}
                  variant={timeInForce === tif ? 'default' : 'outline'}
                  size="sm"
                  className="flex-1 text-xs"
                  onClick={() => setTimeInForce(tif)}
                >
                  {tif}
                </Button>
              ))}
            </div>
            <p className="text-xs text-gray-400">
              {timeInForce === 'FOK' && t.fokDesc}
              {timeInForce === 'GTC' && t.gtcDesc}
              {timeInForce === 'GTD' && t.gtdDesc}
            </p>
          </div>
        </div>
      )}

      {/* 错误提示 */}
      {error && (
        <div className="p-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg text-sm">
          <div className="flex items-center gap-2">
            <AlertCircle size={16} />
            <span>{displayError}</span>
          </div>
          {/* 授权缺失时显示重新授权按钮 */}
          {isApprovalMissing && (
            <Button
              onClick={handleReapprove}
              disabled={isReapproving}
              variant="outline"
              size="sm"
              className="mt-2 w-full border-red-300 text-red-600 hover:bg-red-100"
            >
              {isReapproving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t.reAuthing}
                </>
              ) : (
                t.reAuth
              )}
            </Button>
          )}
        </div>
      )}

      {/* 下单按钮 - Polymarket 价格范围 1%-99% (tickSize=0.01) */}
      <Button
        onClick={handleTrade}
        disabled={
          !isReady || 
          isLoading || 
          amount <= 0 || 
          amount > usdcBalance || 
          !selectedOutcome.tokenId ||
          selectedOutcome.price < 0.01 ||  // 价格太低 (< 1%)
          selectedOutcome.price > 0.99     // 价格太高 (> 99%)
        }
        className={`w-full h-12 text-lg ${
          orderSide === 'BUY'
            ? 'bg-green-500 hover:bg-green-600'
            : 'bg-red-500 hover:bg-red-600'
        }`}
      >
        {isLoading ? (
          <>
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            {t.processing}
          </>
        ) : !isReady ? (
          isInitializing ? (
            <>
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              {t.initializing}
            </>
          ) : t.prepareAccount
        ) : !selectedOutcome.tokenId ? (
          t.invalidTarget
        ) : selectedOutcome.price < 0.01 || selectedOutcome.price > 0.99 ? (
          t.priceOutOfRange
        ) : (
          <>
            {orderSide === 'BUY' ? `${t.buy} ${selectedOutcome.name}` : `${t.sell} ${selectedOutcome.name}`}
            {estimate && (
              <span className="ml-2 text-sm opacity-80">
                {t.toWin} {formatAmount(estimate.potentialProfit)}
              </span>
            )}
          </>
        )}
      </Button>

      {/* 余额信息 */}
      <div className="flex justify-between text-xs text-gray-500">
        <span>{t.safeBalance}</span>
        <span>{formatAmount(usdcBalance)} USDC</span>
      </div>

      {/* 提示信息 */}
      {isReady && (
        <div className="text-xs text-green-500 text-center flex items-center justify-center gap-1">
          <Zap className="w-3 h-3" />
          {t.gasless} • {t.noGasFee} • {t.polygonNetwork}
        </div>
      )}
    </div>
  );
};

export default TradingPanel;
