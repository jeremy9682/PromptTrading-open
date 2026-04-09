/**
 * Open Orders List Component
 * 
 * 显示用户的挂单列表
 */

import React, { useState } from 'react';
import { Clock, X, Loader2, AlertCircle } from 'lucide-react';
import { OpenOrder } from '../../../services/polymarket/portfolioService';
import { useCancelOrder, useCancelAllOrders } from '../../../hooks/usePortfolio';
import { formatDistanceToNow } from 'date-fns';
import { zhCN } from 'date-fns/locale';

interface OpenOrdersListProps {
  orders: OpenOrder[];
}

export function OpenOrdersList({ orders }: OpenOrdersListProps) {
  const { cancelOrder, isLoading: isCancelling } = useCancelOrder();
  const { cancelAllOrders, isLoading: isCancellingAll } = useCancelAllOrders();
  const [cancellingOrderId, setCancellingOrderId] = useState<string | null>(null);

  const handleCancelOrder = async (orderId: string) => {
    setCancellingOrderId(orderId);
    try {
      await cancelOrder(orderId);
    } finally {
      setCancellingOrderId(null);
    }
  };

  if (orders.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
        <div className="w-16 h-16 mb-4 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
          <Clock className="w-8 h-8 text-gray-400" />
        </div>
        <p className="text-gray-600 dark:text-gray-400 font-medium mb-2">暂无挂单</p>
        <p className="text-sm text-gray-500 dark:text-gray-500">
          您的限价单将显示在这里
        </p>
      </div>
    );
  }

  return (
    <div>
      {/* 批量操作 */}
      {orders.length > 1 && (
        <div className="px-4 py-2 border-b border-gray-100 dark:border-gray-800">
          <button
            onClick={() => cancelAllOrders()}
            disabled={isCancellingAll}
            className="flex items-center gap-1.5 text-sm text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 disabled:opacity-50"
          >
            {isCancellingAll ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <X className="w-4 h-4" />
            )}
            取消全部挂单
          </button>
        </div>
      )}

      {/* 订单列表 */}
      <div className="divide-y divide-gray-100 dark:divide-gray-800">
        {orders.map((order) => (
          <OrderRow
            key={order.orderId}
            order={order}
            onCancel={handleCancelOrder}
            isCancelling={cancellingOrderId === order.orderId}
          />
        ))}
      </div>
    </div>
  );
}

// ============================================
// Order Row Component
// ============================================

interface OrderRowProps {
  order: OpenOrder;
  onCancel: (orderId: string) => void;
  isCancelling: boolean;
}

function OrderRow({ order, onCancel, isCancelling }: OrderRowProps) {
  const isBuy = order.side === 'BUY';
  const fillPercent = order.fillPercent;
  const hasPartialFill = fillPercent > 0 && fillPercent < 100;

  // 格式化时间
  const formatTime = () => {
    try {
      return formatDistanceToNow(new Date(order.createdAt), {
        addSuffix: true,
        locale: zhCN,
      });
    } catch {
      return order.createdAt;
    }
  };

  return (
    <div className="p-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
      {/* 标题行 */}
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-medium text-gray-900 dark:text-white truncate pr-2">
            {order.title}
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
              {order.outcome}
            </span>
          </div>
        </div>

        {/* 取消按钮 */}
        <button
          onClick={() => onCancel(order.orderId)}
          disabled={isCancelling}
          className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors disabled:opacity-50"
          title="取消订单"
        >
          {isCancelling ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <X className="w-4 h-4" />
          )}
        </button>
      </div>

      {/* 订单详情 */}
      <div className="grid grid-cols-3 gap-2 text-xs mb-2">
        <div>
          <span className="text-gray-500 dark:text-gray-400">价格</span>
          <p className="font-medium text-gray-900 dark:text-white">
            ${order.price.toFixed(4)}
          </p>
        </div>
        <div>
          <span className="text-gray-500 dark:text-gray-400">数量</span>
          <p className="font-medium text-gray-900 dark:text-white">
            {order.size.toFixed(2)}
          </p>
        </div>
        <div>
          <span className="text-gray-500 dark:text-gray-400">总价</span>
          <p className="font-medium text-gray-900 dark:text-white">
            ${(order.price * order.size).toFixed(2)}
          </p>
        </div>
      </div>

      {/* 成交进度 */}
      {hasPartialFill && (
        <div className="mb-2">
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-gray-500 dark:text-gray-400">已成交</span>
            <span className="text-yellow-600 dark:text-yellow-400">
              {fillPercent.toFixed(1)}%
            </span>
          </div>
          <div className="h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-yellow-500 rounded-full transition-all"
              style={{ width: `${fillPercent}%` }}
            />
          </div>
        </div>
      )}

      {/* 状态和时间 */}
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-1.5">
          <span className={`w-2 h-2 rounded-full ${
            order.status === 'live' ? 'bg-green-500' : 'bg-yellow-500'
          }`} />
          <span className="text-gray-500 dark:text-gray-400 capitalize">
            {order.status === 'live' ? '等待成交' : order.status}
          </span>
        </div>
        <span className="text-gray-400 dark:text-gray-500">
          {formatTime()}
        </span>
      </div>
    </div>
  );
}

export default OpenOrdersList;


















