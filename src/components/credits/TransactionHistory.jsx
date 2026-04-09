/**
 * 交易记录组件
 * 
 * 显示用户的充值和消费记录
 */

import React, { useState, useEffect } from 'react';
import { 
  History, 
  ArrowUpCircle, 
  ArrowDownCircle, 
  ExternalLink, 
  Loader2,
  ChevronDown,
  Filter
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { getTransactionHistory } from '../../services/credits.service';

const TransactionHistory = ({ language = 'zh', className = '' }) => {
  const { authenticated, accessToken } = useAuth();
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('all'); // all | recharge | usage
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [totalPages, setTotalPages] = useState(1);

  // 加载记录
  const loadRecords = async (pageNum = 1, filterType = filter) => {
    if (!authenticated || !accessToken) return;

    setLoading(true);
    setError(null);
    try {
      const result = await getTransactionHistory(accessToken, {
        page: pageNum,
        pageSize: 10,
        type: filterType === 'all' ? undefined : filterType,
      });

      if (result.success) {
        if (pageNum === 1) {
          setRecords(result.data.records);
        } else {
          setRecords((prev) => [...prev, ...result.data.records]);
        }
        setTotalPages(result.data.pagination.totalPages);
        setHasMore(pageNum < result.data.pagination.totalPages);
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
    loadRecords(1);
  }, [authenticated, accessToken]);

  // 切换筛选
  const handleFilterChange = (newFilter) => {
    setFilter(newFilter);
    setPage(1);
    loadRecords(1, newFilter);
  };

  // 加载更多
  const loadMore = () => {
    const nextPage = page + 1;
    setPage(nextPage);
    loadRecords(nextPage);
  };

  // 格式化日期
  const formatDate = (dateStr) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return language === 'zh' ? '刚刚' : 'Just now';
    if (diffMins < 60) return `${diffMins} ${language === 'zh' ? '分钟前' : 'min ago'}`;
    if (diffHours < 24) return `${diffHours} ${language === 'zh' ? '小时前' : 'hr ago'}`;
    if (diffDays < 7) return `${diffDays} ${language === 'zh' ? '天前' : 'days ago'}`;
    
    return date.toLocaleDateString(language === 'zh' ? 'zh-CN' : 'en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // 格式化金额
  const formatAmount = (amount, direction) => {
    const sign = direction === 'in' ? '+' : '-';
    return `${sign}$${amount.toFixed(4)}`;
  };

  if (!authenticated) {
    return null;
  }

  return (
    <div className={`bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-700 rounded-2xl shadow-sm ${className}`}>
      {/* 头部 */}
      <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800">
        <div className="flex items-center justify-between">
          <h3 className="text-gray-900 dark:text-white font-semibold text-lg flex items-center gap-2">
            <History className="text-purple-600 dark:text-purple-400" size={20} />
            {language === 'zh' ? '交易记录' : 'Transaction History'}
          </h3>
          
          {/* 筛选按钮 */}
          <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 p-1 rounded-lg">
            {[
              { key: 'all', label: language === 'zh' ? '全部' : 'All' },
              { key: 'recharge', label: language === 'zh' ? '充值' : 'Recharge' },
              { key: 'usage', label: language === 'zh' ? '消费' : 'Usage' },
            ].map((item) => (
              <button
                key={item.key}
                onClick={() => handleFilterChange(item.key)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                  filter === item.key
                    ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 记录列表 */}
      <div className="divide-y divide-gray-100 dark:divide-gray-800">
        {loading && records.length === 0 ? (
          <div className="py-12 text-center">
            <Loader2 className="w-8 h-8 text-gray-400 animate-spin mx-auto" />
          </div>
        ) : error ? (
          <div className="py-12 text-center text-red-500">{error}</div>
        ) : records.length === 0 ? (
          <div className="py-12 text-center text-gray-500 dark:text-gray-400">
            {language === 'zh' ? '暂无记录' : 'No records yet'}
          </div>
        ) : (
          records.map((record) => (
            <div
              key={record.id}
              className="px-6 py-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {/* 图标 */}
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center ${
                      record.direction === 'in'
                        ? 'bg-green-100 dark:bg-green-500/20'
                        : 'bg-orange-100 dark:bg-orange-500/20'
                    }`}
                  >
                    {record.direction === 'in' ? (
                      <ArrowDownCircle
                        size={20}
                        className="text-green-600 dark:text-green-400"
                      />
                    ) : (
                      <ArrowUpCircle
                        size={20}
                        className="text-orange-600 dark:text-orange-400"
                      />
                    )}
                  </div>

                  {/* 描述 */}
                  <div>
                    <p className="text-gray-900 dark:text-white font-medium text-sm">
                      {record.description}
                    </p>
                    <p className="text-gray-500 dark:text-gray-400 text-xs">
                      {formatDate(record.createdAt)}
                      {record.aiModel && (
                        <span className="ml-2 px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 rounded text-xs">
                          {record.aiModel}
                        </span>
                      )}
                    </p>
                  </div>
                </div>

                {/* 金额 */}
                <div className="text-right">
                  <p
                    className={`font-semibold ${
                      record.direction === 'in'
                        ? 'text-green-600 dark:text-green-400'
                        : 'text-orange-600 dark:text-orange-400'
                    }`}
                  >
                    {formatAmount(record.amount, record.direction)}
                  </p>
                  {record.txHash && (
                    <a
                      href={`https://arbiscan.io/tx/${record.txHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1"
                    >
                      {language === 'zh' ? '查看' : 'View'}
                      <ExternalLink size={10} />
                    </a>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* 加载更多 */}
      {hasMore && records.length > 0 && (
        <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-800">
          <button
            onClick={loadMore}
            disabled={loading}
            className="w-full py-2 text-sm text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-500/10 rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {loading ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                {language === 'zh' ? '加载中...' : 'Loading...'}
              </>
            ) : (
              <>
                <ChevronDown size={14} />
                {language === 'zh' ? '加载更多' : 'Load more'}
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
};

export default TransactionHistory;














