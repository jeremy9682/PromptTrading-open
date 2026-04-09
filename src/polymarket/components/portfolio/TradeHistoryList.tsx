/**
 * Trade History List Component
 * 
 * 显示用户的交易历史
 */

import React from 'react';
import { History, ExternalLink, Check, X, Clock } from 'lucide-react';
import { TradeHistoryItem } from '../../../services/polymarket/portfolioService';
import { format } from 'date-fns';
import { zhCN } from 'date-fns/locale';

interface TradeHistoryListProps {
  history: TradeHistoryItem[];
}

export function TradeHistoryList({ history }: TradeHistoryListProps) {
  if (history.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
        <div className="w-16 h-16 mb-4 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
          <History className="w-8 h-8 text-gray-400" />
        </div>
        <p className="text-gray-600 dark:text-gray-400 font-medium mb-2">暂无交易记录</p>
        <p className="text-sm text-gray-500 dark:text-gray-500">
          您的交易记录将显示在这里
        </p>
      </div>
    );
  }

  // 按日期分组
  const groupedHistory = groupByDate(history);

  return (
    <div>
      {Object.entries(groupedHistory).map(([date, items]) => (
        <div key={date}>
          {/* 日期分隔 */}
          <div className="px-4 py-2 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-100 dark:border-gray-800">
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
              {date}
            </span>
          </div>

          {/* 当日交易 */}
          <div className="divide-y divide-gray-100 dark:divide-gray-800">
            {items.map((item) => (
              <TradeHistoryRow key={item.id} item={item} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ============================================
// Trade History Row Component
// ============================================

interface TradeHistoryRowProps {
  item: TradeHistoryItem;
}

function TradeHistoryRow({ item }: TradeHistoryRowProps) {
  const isBuy = item.side === 'BUY';
  // 后端存储 'executed'，CLOB API 返回 'matched'，都代表已成交
  const isMatched = item.status === 'matched' || item.status === 'executed';
  const isCancelled = item.status === 'cancelled' || item.status === 'failed';

  // 格式化时间
  const formatTime = () => {
    try {
      return format(new Date(item.createdAt), 'HH:mm', { locale: zhCN });
    } catch {
      return '';
    }
  };

  // 状态图标
  const StatusIcon = () => {
    if (isMatched) return <Check className="w-3.5 h-3.5 text-green-500" />;
    if (isCancelled) return <X className="w-3.5 h-3.5 text-red-500" />;
    return <Clock className="w-3.5 h-3.5 text-yellow-500" />;
  };

  // 状态文本
  const getStatusText = () => {
    if (isMatched) return '已成交';
    if (isCancelled) return '已取消';
    return '已过期';
  };

  return (
    <div className="p-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
      {/* 标题行 */}
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-medium text-gray-900 dark:text-white truncate pr-2">
            {item.title}
          </h3>
          <div className="flex items-center gap-2 mt-1">
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
              isBuy
                ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
            }`}>
              {isBuy ? 'BUY' : 'SELL'}
            </span>
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {item.outcome}
            </span>
          </div>
        </div>

        {/* 时间和链接 */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400 dark:text-gray-500">
            {formatTime()}
          </span>
          {item.transactionHash && (
            <a
              href={`https://polygonscan.com/tx/${item.transactionHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-500 hover:text-blue-600"
              title="查看交易"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
        </div>
      </div>

      {/* 交易详情 */}
      <div className="grid grid-cols-3 gap-2 text-xs mb-2">
        <div>
          <span className="text-gray-500 dark:text-gray-400">价格</span>
          <p className="font-medium text-gray-900 dark:text-white">
            ${item.price.toFixed(4)}
          </p>
        </div>
        <div>
          <span className="text-gray-500 dark:text-gray-400">数量</span>
          <p className="font-medium text-gray-900 dark:text-white">
            {item.size.toFixed(2)}
          </p>
        </div>
        <div>
          <span className="text-gray-500 dark:text-gray-400">总价</span>
          <p className="font-medium text-gray-900 dark:text-white">
            ${item.total.toFixed(2)}
          </p>
        </div>
      </div>

      {/* 状态 */}
      <div className="flex items-center gap-1.5">
        <StatusIcon />
        <span className={`text-xs ${
          isMatched 
            ? 'text-green-600 dark:text-green-400' 
            : isCancelled 
              ? 'text-red-600 dark:text-red-400'
              : 'text-yellow-600 dark:text-yellow-400'
        }`}>
          {getStatusText()}
        </span>
      </div>
    </div>
  );
}

// ============================================
// Helper Functions
// ============================================

function groupByDate(items: TradeHistoryItem[]): Record<string, TradeHistoryItem[]> {
  const groups: Record<string, TradeHistoryItem[]> = {};

  items.forEach((item) => {
    try {
      const date = format(new Date(item.createdAt), 'yyyy年MM月dd日', { locale: zhCN });
      if (!groups[date]) {
        groups[date] = [];
      }
      groups[date].push(item);
    } catch {
      // 忽略无效日期
    }
  });

  return groups;
}

export default TradeHistoryList;



