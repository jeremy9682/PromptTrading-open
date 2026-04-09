import React from 'react';
import { Lightbulb, DollarSign } from 'lucide-react';
import { useAppStore } from '../../contexts/useAppStore';

/**
 * 模拟盘/实盘切换器组件
 * 放置在 Header 右侧，用于切换交易模式
 * 注意：余额信息在 PaperTradingBanner 中显示，这里只提供模式切换
 */
export function TradingModeSwitch({ language = 'en' }) {
  const isPaperTrading = useAppStore((state) => state.isPaperTrading);
  const setIsPaperTrading = useAppStore((state) => state.setIsPaperTrading);

  const texts = {
    zh: {
      paper: '模拟盘',
      live: '实盘'
    },
    en: {
      paper: 'Paper',
      live: 'Live'
    }
  };

  const t = texts[language] || texts.en;

  return (
    <div className="flex items-center gap-1 bg-gray-200 dark:bg-gray-800 rounded-lg p-1">
      <button
        onClick={() => setIsPaperTrading(true)}
        className={`px-3 py-1.5 rounded-md text-xs md:text-sm font-medium transition-all flex items-center gap-1.5 ${
          isPaperTrading
            ? 'bg-amber-500 text-black shadow-sm'
            : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
        }`}
      >
        <Lightbulb size={14} className={isPaperTrading ? 'animate-pulse' : ''} />
        <span className="hidden sm:inline">{t.paper}</span>
      </button>
      <button
        onClick={() => setIsPaperTrading(false)}
        className={`px-3 py-1.5 rounded-md text-xs md:text-sm font-medium transition-all flex items-center gap-1.5 ${
          !isPaperTrading
            ? 'bg-green-500 text-white shadow-sm'
            : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
        }`}
      >
        <DollarSign size={14} />
        <span className="hidden sm:inline">{t.live}</span>
      </button>
    </div>
  );
}

export default TradingModeSwitch;
