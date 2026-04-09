/**
 * AICreditsPanel - 可拖拽的 AI Credits 管理面板
 * 
 * 功能：
 * - 显示 AI Credits 余额
 * - 快速充值入口
 * - 充值/使用记录列表
 * - 可拖拽移动位置
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  X,
  Sparkles,
  Plus,
  Minus,
  RefreshCw,
  Clock,
  CheckCircle,
  XCircle,
  Loader2,
  GripHorizontal,
  Zap,
  TrendingUp,
  History,
  ChevronRight,
  BarChart3,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import * as creditsService from '../../services/credits.service';

// 充值金额选项
const AMOUNT_OPTIONS = [5, 10, 20, 50];

export const AICreditsPanel = ({ isOpen, onClose, onRecharge, language = 'en' }) => {
  const navigate = useNavigate();
  const { authenticated, getAccessToken } = useAuth();
  
  // 面板状态
  const [balance, setBalance] = useState(0);
  const [loading, setLoading] = useState(true);
  const [records, setRecords] = useState([]);
  const [recordsLoading, setRecordsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('recharge'); // 'recharge' | 'history'
  
  // 选择的充值金额
  const [selectedAmount, setSelectedAmount] = useState(5);
  
  // 拖拽状态
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const panelRef = useRef(null);
  
  // 初始化位置到屏幕中央
  useEffect(() => {
    if (isOpen && panelRef.current) {
      const rect = panelRef.current.getBoundingClientRect();
      setPosition({
        x: (window.innerWidth - rect.width) / 2,
        y: (window.innerHeight - rect.height) / 2,
      });
    }
  }, [isOpen]);
  
  // 获取余额
  const fetchBalance = useCallback(async () => {
    if (!authenticated) return;
    
    setLoading(true);
    try {
      const token = await getAccessToken();
      const result = await creditsService.getBalance(token);
      if (result.success) {
        setBalance(result.data.balance);
      }
    } catch (error) {
      console.error('Failed to fetch balance:', error);
    } finally {
      setLoading(false);
    }
  }, [authenticated, getAccessToken]);
  
  // 获取交易记录
  const fetchRecords = useCallback(async () => {
    if (!authenticated) return;
    
    setRecordsLoading(true);
    try {
      const token = await getAccessToken();
      const result = await creditsService.getTransactionHistory(token, { limit: 20 });
      if (result.success) {
        setRecords(result.data.records || []);
      }
    } catch (error) {
      console.error('Failed to fetch records:', error);
    } finally {
      setRecordsLoading(false);
    }
  }, [authenticated, getAccessToken]);
  
  // 初始加载数据
  useEffect(() => {
    if (isOpen && authenticated) {
      fetchBalance();
      fetchRecords();
    }
  }, [isOpen, authenticated, fetchBalance, fetchRecords]);
  
  // 拖拽处理
  const handleMouseDown = (e) => {
    if (e.target.closest('.no-drag')) return;
    setIsDragging(true);
    setDragStart({
      x: e.clientX - position.x,
      y: e.clientY - position.y,
    });
  };
  
  const handleMouseMove = useCallback((e) => {
    if (!isDragging) return;
    
    const newX = e.clientX - dragStart.x;
    const newY = e.clientY - dragStart.y;
    
    // 限制在屏幕范围内
    const maxX = window.innerWidth - (panelRef.current?.offsetWidth || 400);
    const maxY = window.innerHeight - (panelRef.current?.offsetHeight || 500);
    
    setPosition({
      x: Math.max(0, Math.min(newX, maxX)),
      y: Math.max(0, Math.min(newY, maxY)),
    });
  }, [isDragging, dragStart]);
  
  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);
  
  // 全局鼠标事件
  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);
  
  // 格式化时间
  const formatTime = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now - date;
    
    if (diff < 60000) return language === 'zh' ? '刚刚' : 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}${language === 'zh' ? '分钟前' : 'm ago'}`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}${language === 'zh' ? '小时前' : 'h ago'}`;
    return date.toLocaleDateString();
  };
  
  // 获取状态图标
  const getStatusIcon = (status) => {
    switch (status) {
      case 'completed':
        return <CheckCircle size={14} className="text-green-500" />;
      case 'pending':
        return <Clock size={14} className="text-yellow-500" />;
      case 'failed':
        return <XCircle size={14} className="text-red-500" />;
      default:
        return <Clock size={14} className="text-gray-400" />;
    }
  };
  
  if (!isOpen) return null;
  
  return (
    <>
      {/* 背景遮罩 */}
      <div 
        className="fixed inset-0 bg-black/30 z-[9998]"
        onClick={onClose}
      />
      
      {/* 可拖拽面板 */}
      <div
        ref={panelRef}
        className="fixed z-[9999] w-[400px] bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden"
        style={{
          left: position.x,
          top: position.y,
          cursor: isDragging ? 'grabbing' : 'default',
        }}
      >
        {/* 可拖拽头部 */}
        <div
          className="flex items-center justify-between p-4 bg-gradient-to-r from-blue-500 to-purple-600 text-white cursor-grab active:cursor-grabbing select-none"
          onMouseDown={handleMouseDown}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
              <Sparkles size={20} />
            </div>
            <div>
              <h3 className="font-semibold text-lg">AI Credits</h3>
              <p className="text-white/80 text-xs flex items-center gap-1">
                <GripHorizontal size={12} />
                {language === 'zh' ? '拖拽移动' : 'Drag to move'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="no-drag p-2 hover:bg-white/20 rounded-lg transition-colors"
          >
            <X size={20} />
          </button>
        </div>
        
        {/* 余额显示 */}
        <div className="p-4 bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                {language === 'zh' ? '当前余额' : 'Current Balance'}
              </p>
              <div className="flex items-baseline gap-1">
                {loading ? (
                  <Loader2 size={24} className="animate-spin text-blue-500" />
                ) : (
                  <>
                    <span className="text-3xl font-bold text-gray-900 dark:text-white">
                      ${balance.toFixed(2)}
                    </span>
                    <span className="text-sm text-gray-500">USDC</span>
                  </>
                )}
              </div>
            </div>
            <button
              onClick={fetchBalance}
              disabled={loading}
              className="no-drag p-2 hover:bg-white dark:hover:bg-gray-800 rounded-lg transition-colors"
            >
              <RefreshCw size={18} className={`text-gray-500 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
          
          {/* 预估分析次数 */}
          <div className="mt-3 flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
            <Zap size={14} className="text-yellow-500" />
            <span>
              ≈ {Math.floor(balance / 0.05)} {language === 'zh' ? '次 AI 分析' : 'AI analyses'}
            </span>
          </div>
        </div>
        
        {/* Tab 切换 */}
        <div className="flex border-b border-gray-200 dark:border-gray-700">
          <button
            onClick={() => setActiveTab('recharge')}
            className={`no-drag flex-1 py-3 text-sm font-medium transition-colors flex items-center justify-center gap-2
              ${activeTab === 'recharge' 
                ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400' 
                : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}
          >
            <TrendingUp size={16} />
            {language === 'zh' ? '充值' : 'Recharge'}
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`no-drag flex-1 py-3 text-sm font-medium transition-colors flex items-center justify-center gap-2
              ${activeTab === 'history' 
                ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400' 
                : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}
          >
            <History size={16} />
            {language === 'zh' ? '记录' : 'History'}
          </button>
        </div>
        
        {/* 内容区域 */}
        <div className="p-4 max-h-[300px] overflow-y-auto no-drag">
          {activeTab === 'recharge' ? (
            /* 充值选项 */
            <div className="space-y-4">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {language === 'zh' 
                  ? '选择充值金额，使用 USDC 支付（Arbitrum 网络）'
                  : 'Select amount to recharge with USDC (Arbitrum network)'}
              </p>
              
              {/* 金额选项 */}
              <div className="grid grid-cols-2 gap-3">
                {AMOUNT_OPTIONS.map((amount) => (
                  <button
                    key={amount}
                    onClick={() => setSelectedAmount(amount)}
                    className={`p-4 rounded-xl border-2 transition-all
                      ${selectedAmount === amount 
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' 
                        : 'border-gray-200 dark:border-gray-700 hover:border-blue-300'}`}
                  >
                    <div className="text-2xl font-bold text-gray-900 dark:text-white">
                      ${amount}
                    </div>
                  </button>
                ))}
              </div>
              
              {/* 充值按钮 */}
              <button
                onClick={() => {
                  onClose(); // 关闭当前面板
                  if (onRecharge) {
                    onRecharge(selectedAmount); // 触发充值流程
                  }
                }}
                className="w-full py-3 bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white rounded-xl font-medium transition-all flex items-center justify-center gap-2 shadow-lg"
              >
                <Sparkles size={18} />
                {language === 'zh' ? `充值 $${selectedAmount}` : `Recharge $${selectedAmount}`}
              </button>
            </div>
          ) : (
            /* 交易记录 */
            <div className="space-y-3">
              {recordsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 size={24} className="animate-spin text-blue-500" />
                </div>
              ) : records.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <History size={32} className="mx-auto mb-2 opacity-50" />
                  <p>{language === 'zh' ? '暂无记录' : 'No records yet'}</p>
                </div>
              ) : (
                records.slice(0, 5).map((record, index) => (
                  <div
                    key={record.id || index}
                    className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center
                        ${record.type === 'recharge' 
                          ? 'bg-green-100 dark:bg-green-900/30' 
                          : 'bg-red-100 dark:bg-red-900/30'}`}
                      >
                        {record.type === 'recharge' ? (
                          <Plus size={16} className="text-green-600 dark:text-green-400" />
                        ) : (
                          <Minus size={16} className="text-red-600 dark:text-red-400" />
                        )}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900 dark:text-white">
                          {record.type === 'recharge' 
                            ? (language === 'zh' ? '充值' : 'Recharge')
                            : (language === 'zh' ? 'AI 分析' : 'AI Analysis')}
                        </p>
                        <p className="text-xs text-gray-500 flex items-center gap-1">
                          {getStatusIcon(record.status)}
                          {formatTime(record.createdAt)}
                        </p>
                      </div>
                    </div>
                    <div className={`text-sm font-semibold
                      ${record.type === 'recharge' ? 'text-green-600' : 'text-red-600'}`}
                    >
                      {record.type === 'recharge' ? '+' : '-'}${Math.abs(record.amount).toFixed(2)}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
        
        {/* 底部链接 - 查看详细统计 */}
        <div className="p-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
          <button
            onClick={() => {
              onClose();
              navigate('/ai-credits');
            }}
            className="no-drag w-full py-2 text-sm text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            <BarChart3 size={16} />
            {language === 'zh' ? '查看详细统计' : 'View detailed statistics'}
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
    </>
  );
};

export default AICreditsPanel;



