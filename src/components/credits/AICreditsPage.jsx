/**
 * AI Credits 使用中心页面
 * 
 * 功能：
 * - 余额和统计卡片
 * - 花费趋势图表
 * - 模型使用分布
 * - 详细使用/充值记录
 */

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Sparkles,
  TrendingUp,
  Zap,
  DollarSign,
  RefreshCw,
  Download,
  Calendar,
  Filter,
  ChevronDown,
  Plus,
  Minus,
  CheckCircle,
  Clock,
  XCircle,
  Loader2,
  BarChart3,
  PieChart,
  History,
  CreditCard,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import * as creditsService from '../../services/credits.service';
import RechargeModal from './RechargeModal';
import { translations } from '../../constants/translations';
import { useAppStore } from '../../contexts/useAppStore';

// 简单柱状图组件
const SimpleBarChart = ({ data, height = 120, noDataText = 'No data' }) => {
  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400">
        {noDataText}
      </div>
    );
  }

  // 过滤有消费数据的天数
  const hasSpendData = data.some(d => d.spend > 0);
  const maxValue = Math.max(...data.map(d => d.spend || 0), 0.001);
  
  // 如果没有任何消费数据，显示提示
  if (!hasSpendData) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400">
        {noDataText}
      </div>
    );
  }
  
  return (
    <div className="flex items-end justify-between gap-1 h-full px-2">
      {data.slice(-14).map((item, index) => {
        const spend = item.spend || 0;
        const barHeight = (spend / maxValue) * 100;
        return (
          <div key={index} className="flex flex-col items-center flex-1 min-w-0 h-full">
            <div className="flex-1 w-full flex items-end">
              <div 
                className="w-full bg-gradient-to-t from-blue-500 to-purple-500 rounded-t transition-all hover:from-blue-600 hover:to-purple-600"
                style={{ height: `${Math.max(barHeight, spend > 0 ? 5 : 0)}%` }}
                title={`${item.date}: $${spend.toFixed(4)}`}
              />
            </div>
            {index % 2 === 0 && (
              <span className="text-[10px] text-gray-400 mt-1 truncate flex-shrink-0">
                {item.date?.slice(5) || ''}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
};

// 智能金额格式化（处理小额精度问题）
const formatAmount = (amount, minDecimals = 2) => {
  if (amount === 0) return '0.00';
  // 小额（< 0.01）显示更多精度
  if (Math.abs(amount) < 0.01) {
    return amount.toFixed(6).replace(/0+$/, '').replace(/\.$/, '');
  }
  // 中等金额（< 1）显示4位小数
  if (Math.abs(amount) < 1) {
    return amount.toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
  }
  // 普通金额显示2位小数
  return amount.toFixed(minDecimals);
};

// 模型分布饼图（简化版）
const ModelPieChart = ({ data, noDataText = 'No data' }) => {
  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400">
        {noDataText}
      </div>
    );
  }

  const colors = [
    'bg-blue-500', 'bg-purple-500', 'bg-green-500', 
    'bg-yellow-500', 'bg-red-500', 'bg-pink-500'
  ];

  return (
    <div className="space-y-2">
      {data.slice(0, 5).map((item, index) => (
        <div key={item.model} className="flex items-center gap-2">
          <div className={`w-3 h-3 rounded-full ${colors[index % colors.length]}`} />
          <span className="flex-1 text-sm text-gray-700 dark:text-gray-300 truncate">
            {item.model}
          </span>
          <span className="text-sm font-medium text-gray-900 dark:text-white">
            {item.percentage}%
          </span>
        </div>
      ))}
    </div>
  );
};

export const AICreditsPage = () => {
  const navigate = useNavigate();
  const { authenticated, getAccessToken } = useAuth();
  const language = useAppStore((state) => state.language);
  const t = translations[language]?.aiCredits || translations.en.aiCredits;
  
  // 时间范围选项
  const TIME_RANGES = [
    { value: 7, label: t.days7 },
    { value: 30, label: t.days30 },
    { value: 90, label: t.days90 },
  ];
  
  // 状态
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [timeRange, setTimeRange] = useState(30);
  const [activeRecordTab, setActiveRecordTab] = useState('usage'); // 'usage' | 'recharge'
  
  // 数据
  const [balance, setBalance] = useState(0);
  const [dailySummary, setDailySummary] = useState([]);
  const [totals, setTotals] = useState({ totalSpend: 0, totalRecharge: 0, totalRequests: 0 });
  const [modelBreakdown, setModelBreakdown] = useState([]);
  const [usageRecords, setUsageRecords] = useState([]);
  const [rechargeRecords, setRechargeRecords] = useState([]);
  const [usagePagination, setUsagePagination] = useState({ page: 1, total: 0 });
  const [rechargePagination, setRechargePagination] = useState({ page: 1, total: 0 });
  
  // 充值弹窗
  const [showRechargeModal, setShowRechargeModal] = useState(false);
  const [rechargeAmount, setRechargeAmount] = useState(20);

  // 获取所有数据
  const fetchAllData = useCallback(async () => {
    if (!authenticated) return;
    
    setLoading(true);
    try {
      const token = await getAccessToken();
      
      const [balanceRes, dailyRes, modelRes, usageRes, rechargeRes] = await Promise.all([
        creditsService.getBalance(token),
        creditsService.getDailySummary(token, timeRange),
        creditsService.getModelBreakdown(token, timeRange),
        creditsService.getTransactionHistory(token, { type: 'usage', pageSize: 10 }),
        creditsService.getTransactionHistory(token, { type: 'recharge', pageSize: 10 }),
      ]);
      
      if (balanceRes.success) {
        setBalance(balanceRes.data.balance);
      }
      
      if (dailyRes.success) {
        setDailySummary(dailyRes.data.summary);
        setTotals(dailyRes.data.totals);
      }
      
      if (modelRes.success) {
        setModelBreakdown(modelRes.data.breakdown);
      }
      
      if (usageRes.success) {
        setUsageRecords(usageRes.data.records);
        setUsagePagination(usageRes.data.pagination);
      }
      
      if (rechargeRes.success) {
        setRechargeRecords(rechargeRes.data.records);
        setRechargePagination(rechargeRes.data.pagination);
      }
      
    } catch (error) {
      console.error('Failed to fetch data:', error);
    } finally {
      setLoading(false);
    }
  }, [authenticated, getAccessToken, timeRange]);

  // 刷新数据
  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchAllData();
    setRefreshing(false);
  };

  // 初始加载
  useEffect(() => {
    fetchAllData();
  }, [fetchAllData]);

  // 时间范围变化时重新加载
  useEffect(() => {
    if (!loading) {
      fetchAllData();
    }
  }, [timeRange]);

  // 导出 CSV
  const handleExport = () => {
    // 简单的 CSV 导出
    const records = activeRecordTab === 'usage' ? usageRecords : rechargeRecords;
    if (records.length === 0) return;

    const headers = language === 'zh' 
      ? ['时间', '类型', '金额', '描述']
      : ['Time', 'Type', 'Amount', 'Description'];
    const rows = records.map(r => [
      new Date(r.createdAt).toLocaleString(language === 'zh' ? 'zh-CN' : 'en-US'),
      r.type === 'usage' ? (language === 'zh' ? '消费' : 'Usage') : (language === 'zh' ? '充值' : 'Recharge'),
      r.type === 'usage' ? `-$${r.amount.toFixed(4)}` : `+$${r.amount.toFixed(2)}`,
      r.description || '-',
    ]);

    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `ai-credits-${activeRecordTab}-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  // 格式化时间
  const formatTime = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleString(language === 'zh' ? 'zh-CN' : 'en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // 充值成功
  const handleRechargeSuccess = (newBalance) => {
    setBalance(newBalance);
    setShowRechargeModal(false);
    fetchAllData(); // 刷新数据
  };

  if (!authenticated) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <Sparkles size={48} className="mx-auto mb-4 text-gray-400" />
          <p className="text-gray-500">{t.pleaseLogin}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* 头部 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate(-1)}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
          >
            <ArrowLeft size={20} className="text-gray-600 dark:text-gray-400" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <Sparkles className="text-purple-500" />
              {t.title}
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              {t.subtitle}
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          {/* 时间范围选择 */}
          <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
            {TIME_RANGES.map(range => (
              <button
                key={range.value}
                onClick={() => setTimeRange(range.value)}
                className={`px-3 py-1.5 text-sm rounded-md transition-colors
                  ${timeRange === range.value 
                    ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm' 
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'}`}
              >
                {range.label}
              </button>
            ))}
          </div>
          
          {/* 刷新按钮 */}
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
          >
            <RefreshCw size={20} className={`text-gray-600 dark:text-gray-400 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={32} className="animate-spin text-purple-500" />
        </div>
      ) : (
        <>
          {/* 统计卡片 */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* 余额卡片 */}
            <div className="bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl p-5 text-white">
              <div className="flex items-center justify-between mb-3">
                <span className="text-white/80 text-sm">{t.currentBalance}</span>
                <DollarSign size={20} className="text-white/60" />
              </div>
              <div className="text-3xl font-bold mb-4">
                ${formatAmount(balance)}
              </div>
              <button
                onClick={() => setShowRechargeModal(true)}
                className="w-full py-2 bg-white/20 hover:bg-white/30 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
              >
                <Plus size={16} />
                {t.recharge}
              </button>
            </div>

            {/* 本期花费 */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between mb-3">
                <span className="text-gray-500 text-sm">{t.periodSpend}</span>
                <TrendingUp size={20} className="text-red-400" />
              </div>
              <div className="text-2xl font-bold text-gray-900 dark:text-white">
                ${totals.totalSpend.toFixed(4)}
              </div>
              <p className="text-xs text-gray-400 mt-1">
                {t.pastDays.replace('{days}', timeRange)}
              </p>
            </div>

            {/* 请求次数 */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between mb-3">
                <span className="text-gray-500 text-sm">{t.requestCount}</span>
                <Zap size={20} className="text-yellow-400" />
              </div>
              <div className="text-2xl font-bold text-gray-900 dark:text-white">
                {totals.totalRequests}
              </div>
              <p className="text-xs text-gray-400 mt-1">
                {t.avgPerRequest}: ${totals.totalRequests > 0 ? (totals.totalSpend / totals.totalRequests).toFixed(4) : '0'}
              </p>
            </div>

            {/* 本期充值 */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between mb-3">
                <span className="text-gray-500 text-sm">{t.periodRecharge}</span>
                <CreditCard size={20} className="text-green-400" />
              </div>
              <div className="text-2xl font-bold text-gray-900 dark:text-white">
                ${formatAmount(totals.totalRecharge)}
              </div>
              <p className="text-xs text-gray-400 mt-1">
                {t.pastDays.replace('{days}', timeRange)}
              </p>
            </div>
          </div>

          {/* 图表区域 */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* 花费趋势 */}
            <div className="md:col-span-2 bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                  <BarChart3 size={18} className="text-blue-500" />
                  {t.spendTrend}
                </h3>
              </div>
              <div className="h-32">
                <SimpleBarChart data={dailySummary} noDataText={t.noData} />
              </div>
            </div>

            {/* 模型分布 */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                  <PieChart size={18} className="text-purple-500" />
                  {t.modelDistribution}
                </h3>
              </div>
              <ModelPieChart data={modelBreakdown} noDataText={t.noData} />
            </div>
          </div>

          {/* 记录列表 */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            {/* Tab 切换 */}
            <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-700 px-5">
              <div className="flex">
                <button
                  onClick={() => setActiveRecordTab('usage')}
                  className={`px-4 py-4 text-sm font-medium border-b-2 transition-colors
                    ${activeRecordTab === 'usage'
                      ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                      : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}
                >
                  <span className="flex items-center gap-2">
                    <History size={16} />
                    {t.usageRecords}
                  </span>
                </button>
                <button
                  onClick={() => setActiveRecordTab('recharge')}
                  className={`px-4 py-4 text-sm font-medium border-b-2 transition-colors
                    ${activeRecordTab === 'recharge'
                      ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                      : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}
                >
                  <span className="flex items-center gap-2">
                    <CreditCard size={16} />
                    {t.rechargeRecords}
                  </span>
                </button>
              </div>
              
              <button
                onClick={handleExport}
                className="flex items-center gap-1 px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              >
                <Download size={14} />
                {t.export}
              </button>
            </div>

            {/* 记录表格 */}
            <div className="divide-y divide-gray-100 dark:divide-gray-700">
              {(activeRecordTab === 'usage' ? usageRecords : rechargeRecords).length === 0 ? (
                <div className="py-12 text-center text-gray-500">
                  <History size={32} className="mx-auto mb-2 opacity-50" />
                  {t.noRecords}
                </div>
              ) : (
                (activeRecordTab === 'usage' ? usageRecords : rechargeRecords).map((record) => (
                  <div key={record.id} className="flex items-center justify-between px-5 py-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                    <div className="flex items-center gap-4">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center
                        ${record.type === 'recharge' 
                          ? 'bg-green-100 dark:bg-green-900/30' 
                          : 'bg-red-100 dark:bg-red-900/30'}`}
                      >
                        {record.type === 'recharge' ? (
                          <Plus size={18} className="text-green-600 dark:text-green-400" />
                        ) : (
                          <Minus size={18} className="text-red-600 dark:text-red-400" />
                        )}
                      </div>
                      <div>
                        <p className="font-medium text-gray-900 dark:text-white">
                          {record.description || (record.type === 'recharge' ? t.rechargeAction : t.aiAnalysis)}
                        </p>
                        <p className="text-sm text-gray-500">
                          {formatTime(record.createdAt)}
                          {record.aiModel && <span className="ml-2 text-xs bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded">{record.aiModel}</span>}
                        </p>
                      </div>
                    </div>
                    <div className={`text-right font-semibold
                      ${record.type === 'recharge' ? 'text-green-600' : 'text-red-600'}`}
                    >
                      {record.type === 'recharge' ? '+' : '-'}${formatAmount(record.amount)}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}

      {/* 充值弹窗 */}
      <RechargeModal
        isOpen={showRechargeModal}
        onClose={() => setShowRechargeModal(false)}
        initialAmount={rechargeAmount}
        language={language}
        onSuccess={handleRechargeSuccess}
      />
    </div>
  );
};

export default AICreditsPage;



