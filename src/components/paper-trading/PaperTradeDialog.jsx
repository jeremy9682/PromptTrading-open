import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { X, Lightbulb, TrendingUp, TrendingDown, AlertCircle, CheckCircle } from 'lucide-react';
import { useAppStore } from '../../contexts/useAppStore';
import { paperTradingAPI } from '../../utils/api';
import { usePrivy } from '@privy-io/react-auth';

/**
 * 模拟交易弹窗组件
 * 用于在模拟盘模式下下单
 * 支持多选市场（如 Kalshi 的 Super Bowl 冠军预测）
 */
export function PaperTradeDialog({
  open,
  onClose,
  event,
  language = 'en',
  onOutcomeChange  // 多选市场：当用户切换选项时回调
}) {
  const [selectedSide, setSelectedSide] = useState('YES'); // 'YES' | 'NO'
  const [amount, setAmount] = useState('100');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  const { getAccessToken, user } = usePrivy();

  const paperBalance = useAppStore((state) => state.paperBalance);
  const setPaperBalance = useAppStore((state) => state.setPaperBalance);
  const addPaperPosition = useAppStore((state) => state.addPaperPosition);
  const addPaperTradeHistory = useAppStore((state) => state.addPaperTradeHistory);
  const paperPositions = useAppStore((state) => state.paperPositions);

  const texts = {
    zh: {
      title: '模拟交易',
      paperMode: '模拟交易模式',
      selectOption: '选择选项',
      selectDirection: '选择方向',
      buyYes: '买 YES',
      buyNo: '买 NO',
      amount: '投入金额 (虚拟 USDC)',
      availableBalance: '可用余额',
      estimatedShares: '预计获得',
      shares: 'shares',
      ifYesWins: '如果 YES 获胜',
      ifNoWins: '如果 NO 获胜',
      confirmBuy: '确认模拟买入',
      disclaimer: '这是模拟交易，不会使用您的真实资金',
      insufficientBalance: '余额不足',
      currentPrice: '当前价格',
      processing: '处理中...',
      success: '交易成功！',
      alreadyHavePosition: '您已有此事件的持仓',
      currentSelection: '当前选择',
      clickToChange: '点击切换选项'
    },
    en: {
      title: 'Paper Trade',
      paperMode: 'Paper Trading Mode',
      selectOption: 'Select Option',
      selectDirection: 'Select Direction',
      buyYes: 'Buy YES',
      buyNo: 'Buy NO',
      amount: 'Amount (Virtual USDC)',
      availableBalance: 'Available Balance',
      estimatedShares: 'Estimated Shares',
      shares: 'shares',
      ifYesWins: 'If YES wins',
      ifNoWins: 'If NO wins',
      confirmBuy: 'Confirm Paper Buy',
      disclaimer: 'This is paper trading, no real funds will be used',
      insufficientBalance: 'Insufficient balance',
      currentPrice: 'Current Price',
      processing: 'Processing...',
      success: 'Trade successful!',
      alreadyHavePosition: 'You already have a position in this event',
      currentSelection: 'Current Selection',
      clickToChange: 'Click to change option'
    }
  };

  const t = texts[language] || texts.en;

  // 检测市场来源 (Kalshi 事件 ID 通常以 KX 开头或符合特定格式)
  const isKalshiEvent = event?.source === 'KALSHI' ||
    (event?.id && /^KX|^[A-Z]{2,}[A-Z0-9-]+$/.test(event.id));
  const marketSource = isKalshiEvent ? 'KALSHI' : 'POLYMARKET';

  // 获取价格 - Kalshi 和 Polymarket 可能有不同的价格字段
  const yesPrice = event?.yesPrice ?? 0.5;
  const noPrice = event?.noPrice ?? (1 - yesPrice);

  // 当前选择的价格
  const currentPrice = selectedSide === 'YES' ? yesPrice : noPrice;

  // 计算预计获得的 shares
  const amountNum = parseFloat(amount) || 0;
  const estimatedShares = amountNum > 0 ? amountNum / currentPrice : 0;

  // 计算潜在盈亏
  const potentialProfit = estimatedShares * 1 - amountNum; // 如果赢了，每个 share 值 $1
  const potentialLoss = -amountNum; // 如果输了，损失全部

  // 检查是否余额足够
  const hasEnoughBalance = amountNum <= paperBalance;

  // 检查是否已有该事件的持仓（多选市场使用 marketTicker）
  const positionEventId = event?.marketTicker || event?.id;
  const existingPosition = paperPositions.find(
    p => p.eventId === positionEventId && p.side === selectedSide
  );

  // 处理提交 - 数据库优先，本地状态用于乐观更新
  const handleSubmit = async () => {
    if (!hasEnoughBalance || amountNum <= 0) return;

    setIsSubmitting(true);

    // 获取 tokenId - Kalshi 和 Polymarket 有不同的字段结构
    // Polymarket: event.yesTokenId / event.noTokenId
    // Kalshi: 可能在 outcomes 数组中，或者使用 eventId 作为标识
    let tokenId;
    if (isKalshiEvent) {
      // Kalshi 事件：尝试从 outcomes 中获取 tokenId，或使用 eventId
      const outcome = event.outcomes?.find(o =>
        (selectedSide === 'YES' && o.name?.toLowerCase() !== 'no') ||
        (selectedSide === 'NO' && o.name?.toLowerCase() === 'no')
      );
      tokenId = outcome?.tokenId || `${event.id}-${selectedSide.toLowerCase()}`;
    } else {
      // Polymarket 事件
      tokenId = selectedSide === 'YES' ? event.yesTokenId : event.noTokenId;
    }

    try {
      // 必须调用后端 API (数据库是主存储)
      if (!user) {
        throw new Error(language === 'zh' ? '请先登录' : 'Please login first');
      }

      const accessToken = await getAccessToken();
      const walletAddress = user?.wallet?.address;

      if (!accessToken || !walletAddress) {
        throw new Error(language === 'zh' ? '认证失败，请重新登录' : 'Authentication failed, please re-login');
      }

      // 构建事件标题（多选市场包含选项名称）
      const eventTitle = event.isMultiOption && event.selectedOutcomeName
        ? `${event.title || event.question} - ${event.selectedOutcomeName}`
        : event.title || event.question;

      // 调用后端买入 API
      const response = await paperTradingAPI.buy({
        eventId: event.marketTicker || event.id,  // 多选市场使用 marketTicker 作为唯一标识
        eventTitle,
        eventImage: event.image || event.imageUrl,
        side: selectedSide,
        price: currentPrice,
        amount: amountNum,
        tokenId: tokenId,
        source: marketSource  // 传递市场来源 (POLYMARKET | KALSHI)
      }, accessToken, walletAddress);

      if (!response.success) {
        throw new Error(response.error || (language === 'zh' ? '交易失败' : 'Trade failed'));
      }

      console.log('[PaperTrade] ✅ Backend buy success:', response.data);

      // 后端成功后，使用后端返回的数据更新本地状态
      const { balance, position, trade } = response.data || {};

      // 更新余额 (使用后端返回的余额)
      if (balance !== undefined) {
        setPaperBalance(balance);
      } else {
        setPaperBalance(paperBalance - amountNum);
      }

      // 更新持仓 (使用后端返回的持仓数据)
      if (position) {
        if (existingPosition) {
          const updatePaperPosition = useAppStore.getState().updatePaperPosition;
          updatePaperPosition(existingPosition.id, {
            size: position.size,
            entryPrice: position.entryPrice,
            totalCost: position.totalCost
          });
        } else {
          addPaperPosition({
            id: position.id,
            eventId: position.eventId || event.marketTicker || event.id,
            eventTitle: position.eventTitle || eventTitle,
            eventImage: position.eventImage || event.image || event.imageUrl,
            tokenId: position.tokenId || tokenId,
            side: position.side || selectedSide,
            size: position.size || estimatedShares,
            entryPrice: position.entryPrice || currentPrice,
            totalCost: position.totalCost || amountNum,
            currentValue: position.currentValue || amountNum,
            unrealizedPnL: position.unrealizedPnL || 0,
            source: position.source || marketSource  // 保存市场来源
          });
        }
      }

      // 添加交易历史 (使用后端返回的交易数据)
      if (trade) {
        addPaperTradeHistory({
          id: trade.id,
          eventId: trade.eventId || event.marketTicker || event.id,
          eventTitle: trade.eventTitle || eventTitle,
          side: trade.side || selectedSide,
          action: trade.action || 'BUY',
          size: trade.size || estimatedShares,
          price: trade.price || currentPrice,
          amount: trade.amount || amountNum,
          executedAt: trade.executedAt,
          source: trade.source || marketSource  // 保存市场来源
        });
      }

      // 显示成功消息
      setShowSuccess(true);
      setTimeout(() => {
        setShowSuccess(false);
        onClose();
        setAmount('100');
        setSelectedSide('YES');
      }, 1500);

    } catch (error) {
      console.error('[PaperTrade] Error:', error);
      alert(error.message || (language === 'zh' ? '交易失败，请重试' : 'Trade failed, please retry'));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!open || !event) return null;

  // 使用 Portal 渲染到 document.body，确保在最上层
  const dialogContent = (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={(e) => {
        // 只有点击背景（而非对话框内容）时才关闭
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      {/* 成功提示 */}
      {showSuccess && (
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10 bg-green-500 text-white px-6 py-4 rounded-xl shadow-2xl flex items-center gap-3 animate-bounce">
          <CheckCircle size={24} />
          <span className="font-semibold">{language === 'zh' ? '交易成功！' : 'Trade successful!'}</span>
        </div>
      )}

      <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl border border-amber-500/30">
        {/* 模拟盘标识 */}
        <div className="bg-gradient-to-r from-amber-500/20 to-orange-500/20 px-4 py-2 flex items-center justify-center gap-2 border-b border-amber-500/30">
          <div className="w-2 h-2 bg-amber-400 rounded-full animate-pulse" />
          <span className="text-amber-700 dark:text-amber-400 font-medium text-sm">
            {t.paperMode}
          </span>
          {/* 市场来源标识 */}
          <span className={`px-2 py-0.5 rounded text-xs font-medium ${
            isKalshiEvent
              ? 'bg-purple-500/20 text-purple-700 dark:text-purple-400'
              : 'bg-blue-500/20 text-blue-700 dark:text-blue-400'
          }`}>
            {isKalshiEvent ? 'Kalshi' : 'Polymarket'}
          </span>
        </div>

        {/* 头部 */}
        <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-start justify-between">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            {event.image && (
              <img
                src={event.image}
                alt=""
                className="w-12 h-12 rounded-lg object-cover flex-shrink-0"
              />
            )}
            <div className="min-w-0">
              <h3 className="font-semibold text-gray-900 dark:text-white truncate">
                {event.title || event.question}
              </h3>
              {/* 多选市场：显示当前选择的选项 */}
              {event.isMultiOption && event.selectedOutcomeName && (
                <p className="text-purple-600 dark:text-purple-400 text-sm font-medium truncate">
                  → {event.selectedOutcomeName}
                </p>
              )}
              <p className="text-gray-500 dark:text-gray-400 text-sm">
                {t.currentPrice}: YES {(yesPrice * 100).toFixed(0)}¢ / NO {(noPrice * 100).toFixed(0)}¢
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-1"
          >
            <X size={20} />
          </button>
        </div>

        {/* 交易表单 */}
        <div className="p-4 space-y-4">
          {/* 多选市场：选项选择器 */}
          {event.isMultiOption && event.outcomes && event.outcomes.length > 0 && (
            <div>
              <label className="text-gray-600 dark:text-gray-400 text-sm mb-2 block">
                {t.selectOption}
              </label>
              <div className="grid grid-cols-2 gap-2 max-h-[180px] overflow-y-auto mb-2">
                {event.outcomes.map((outcome, idx) => {
                  const outcomeYesPrice = outcome.yesPrice ?? outcome.price ?? 0.5;
                  const isSelected = idx === event.selectedOutcomeIndex;
                  return (
                    <button
                      key={outcome.id || idx}
                      onClick={() => onOutcomeChange?.(idx)}
                      className={`p-2 rounded-lg border text-left transition-all ${
                        isSelected
                          ? 'border-purple-500 bg-purple-50 dark:bg-purple-950/30'
                          : 'border-gray-200 dark:border-gray-700 hover:border-purple-300 hover:bg-purple-50/50 dark:hover:bg-purple-950/20'
                      }`}
                    >
                      <p className="text-sm font-medium truncate text-gray-900 dark:text-white">
                        {outcome.name}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        YES: {(outcomeYesPrice * 100).toFixed(0)}%
                      </p>
                    </button>
                  );
                })}
              </div>
              {event.selectedOutcomeName && (
                <p className="text-xs text-purple-600 dark:text-purple-400 font-medium">
                  {t.currentSelection}: {event.selectedOutcomeName}
                </p>
              )}
            </div>
          )}

          {/* 方向选择 */}
          <div>
            <label className="text-gray-600 dark:text-gray-400 text-sm mb-2 block">
              {t.selectDirection}
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setSelectedSide('YES')}
                className={`py-3 rounded-lg font-semibold transition-all flex items-center justify-center gap-2 ${
                  selectedSide === 'YES'
                    ? 'bg-green-500 text-white border-2 border-green-400'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-2 border-transparent hover:border-green-500 hover:bg-green-500/10'
                }`}
              >
                <TrendingUp size={16} />
                {t.buyYes} ({(yesPrice * 100).toFixed(0)}¢)
              </button>
              <button
                onClick={() => setSelectedSide('NO')}
                className={`py-3 rounded-lg font-semibold transition-all flex items-center justify-center gap-2 ${
                  selectedSide === 'NO'
                    ? 'bg-red-500 text-white border-2 border-red-400'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-2 border-transparent hover:border-red-500 hover:bg-red-500/10'
                }`}
              >
                <TrendingDown size={16} />
                {t.buyNo} ({(noPrice * 100).toFixed(0)}¢)
              </button>
            </div>
          </div>

          {/* 金额输入 */}
          <div>
            <label className="text-gray-600 dark:text-gray-400 text-sm mb-2 block">
              {t.amount}
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">$</span>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full bg-gray-100 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg py-3 px-8 text-gray-900 dark:text-white text-lg font-semibold focus:border-amber-500 focus:ring-1 focus:ring-amber-500 outline-none"
                placeholder="100"
                min="1"
                max={paperBalance}
              />
              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex gap-1">
                <button
                  onClick={() => setAmount(String(Math.floor(paperBalance * 0.25)))}
                  className="px-2 py-1 bg-gray-200 dark:bg-gray-700 rounded text-xs hover:bg-gray-300 dark:hover:bg-gray-600"
                >
                  25%
                </button>
                <button
                  onClick={() => setAmount(String(Math.floor(paperBalance * 0.5)))}
                  className="px-2 py-1 bg-gray-200 dark:bg-gray-700 rounded text-xs hover:bg-gray-300 dark:hover:bg-gray-600"
                >
                  50%
                </button>
                <button
                  onClick={() => setAmount(String(Math.floor(paperBalance)))}
                  className="px-2 py-1 bg-gray-200 dark:bg-gray-700 rounded text-xs hover:bg-gray-300 dark:hover:bg-gray-600"
                >
                  MAX
                </button>
              </div>
            </div>
            <p className="text-gray-500 dark:text-gray-400 text-xs mt-1">
              {t.availableBalance}: ${paperBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </p>
          </div>

          {/* 余额不足提示 */}
          {!hasEnoughBalance && amountNum > 0 && (
            <div className="flex items-center gap-2 text-red-500 text-sm bg-red-500/10 rounded-lg p-2">
              <AlertCircle size={16} />
              {t.insufficientBalance}
            </div>
          )}

          {/* 预计收益 */}
          <div className="bg-gray-100 dark:bg-gray-900/50 rounded-lg p-3 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600 dark:text-gray-400">{t.estimatedShares}</span>
              <span className="text-gray-900 dark:text-white font-semibold">
                {estimatedShares.toFixed(2)} {t.shares}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600 dark:text-gray-400">
                {selectedSide === 'YES' ? t.ifYesWins : t.ifNoWins}
              </span>
              <span className="text-green-600 dark:text-green-400 font-semibold">
                +${potentialProfit.toFixed(2)} (+{((potentialProfit / amountNum) * 100 || 0).toFixed(1)}%)
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600 dark:text-gray-400">
                {selectedSide === 'YES' ? t.ifNoWins : t.ifYesWins}
              </span>
              <span className="text-red-600 dark:text-red-400 font-semibold">
                -${amountNum.toFixed(2)} (-100%)
              </span>
            </div>
          </div>

          {/* 已有持仓提示 */}
          {existingPosition && (
            <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 text-sm bg-amber-500/10 rounded-lg p-2">
              <AlertCircle size={16} />
              {t.alreadyHavePosition}
            </div>
          )}

          {/* 确认按钮 */}
          <button
            onClick={handleSubmit}
            disabled={!hasEnoughBalance || amountNum <= 0 || isSubmitting}
            className="w-full bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 disabled:from-gray-400 disabled:to-gray-500 text-black font-bold py-4 rounded-xl transition-all flex items-center justify-center gap-2"
          >
            <Lightbulb size={18} />
            {isSubmitting ? t.processing : t.confirmBuy}
          </button>

          <p className="text-center text-gray-500 dark:text-gray-400 text-xs">
            {t.disclaimer}
          </p>
        </div>
      </div>
    </div>
  );

  // 使用 Portal 渲染到 document.body
  if (typeof document !== 'undefined') {
    return createPortal(dialogContent, document.body);
  }

  return null;
}

export default PaperTradeDialog;
