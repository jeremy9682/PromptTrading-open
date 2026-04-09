import * as AlertDialog from '@radix-ui/react-alert-dialog';
import { AlertTriangle, X } from 'lucide-react';
import { usePolymarketStore } from '../../contexts/usePolymarketStore';

/**
 * 配额超限提醒弹窗
 */
export function QuotaAlertDialog() {
  const quotaError = usePolymarketStore((state) => state.quotaError);
  const clearQuotaError = usePolymarketStore((state) => state.clearQuotaError);

  if (!quotaError) return null;

  // 根据错误类型设置标题和图标颜色
  const getErrorInfo = () => {
    switch (quotaError.type) {
      case 'WATCHLIST':
        return {
          title: '关注列表已满',
          icon: 'text-yellow-500',
          description: '免费用户最多可关注 20 个事件。请移除一些已关注的事件后再添加新的。',
        };
      case 'TRADERS':
        return {
          title: 'Trader 数量已达上限',
          icon: 'text-orange-500',
          description: '免费用户最多可创建 3 个 Trader。请删除一些现有的 Trader 后再创建新的。',
        };
      case 'ACTIVE_TRADERS':
        return {
          title: '同时运行的 Trader 已达上限',
          icon: 'text-red-500',
          description: '免费用户最多可同时运行 2 个 Trader。请先停止其他正在运行的 Trader。',
        };
      default:
        return {
          title: '配额超限',
          icon: 'text-gray-500',
          description: quotaError.message,
        };
    }
  };

  const errorInfo = getErrorInfo();

  return (
    <AlertDialog.Root open={!!quotaError} onOpenChange={(open) => !open && clearQuotaError()}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 animate-in fade-in" />
        <AlertDialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-2xl p-6 animate-in fade-in zoom-in-95">
          {/* Header */}
          <div className="flex items-start gap-4">
            <div className={`flex-shrink-0 p-3 rounded-full bg-slate-100 dark:bg-slate-800 ${errorInfo.icon}`}>
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div className="flex-1">
              <AlertDialog.Title className="text-lg font-semibold text-slate-900 dark:text-white">
                {errorInfo.title}
              </AlertDialog.Title>
              <AlertDialog.Description className="mt-2 text-sm text-slate-600 dark:text-slate-400">
                {errorInfo.description}
              </AlertDialog.Description>
            </div>
            <button
              onClick={clearQuotaError}
              className="flex-shrink-0 p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5 text-slate-400" />
            </button>
          </div>

          {/* Details */}
          <div className="mt-4 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl">
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-600 dark:text-slate-400">当前限制</span>
              <span className="font-medium text-slate-900 dark:text-white">
                {quotaError.limit} 个
              </span>
            </div>
            {quotaError.current !== undefined && (
              <div className="flex items-center justify-between text-sm mt-2">
                <span className="text-slate-600 dark:text-slate-400">当前使用</span>
                <span className="font-medium text-slate-900 dark:text-white">
                  {quotaError.current} 个
                </span>
              </div>
            )}
          </div>

          {/* Upgrade hint */}
          <div className="mt-4 p-3 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-xl border border-blue-100 dark:border-blue-800">
            <p className="text-sm text-blue-700 dark:text-blue-300">
              升级到 Pro 版本可获得更高配额限制
            </p>
          </div>

          {/* Actions */}
          <div className="mt-6 flex justify-end gap-3">
            <AlertDialog.Cancel asChild>
              <button
                className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors"
                onClick={clearQuotaError}
              >
                我知道了
              </button>
            </AlertDialog.Cancel>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
