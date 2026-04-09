import React from 'react';
import { useAppStore } from '../../contexts/useAppStore';

/**
 * 模拟盘全局提示条组件
 * 当处于模拟盘模式时，在页面顶部显示醒目提示
 */
export function PaperTradingBanner({ language = 'en' }) {
  const isPaperTrading = useAppStore((state) => state.isPaperTrading);

  const texts = {
    zh: {
      title: '模拟交易模式',
      subtitle: '使用虚拟资金，不涉及真实交易'
    },
    en: {
      title: 'Paper Trading Mode',
      subtitle: 'Using virtual funds, no real trades'
    }
  };

  const t = texts[language] || texts.en;

  // 不是模拟盘模式时不显示
  if (!isPaperTrading) {
    return null;
  }

  return (
    <div className="bg-gradient-to-r from-amber-500/20 to-orange-500/20 border-b border-amber-500/30 px-4 py-2">
      <div className="flex items-center justify-center max-w-screen-2xl mx-auto">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 bg-amber-400 rounded-full animate-pulse" />
          <span className="text-amber-700 dark:text-amber-300 font-medium text-sm">
            {t.title}
          </span>
          <span className="hidden sm:inline text-amber-600/70 dark:text-amber-400/70 text-xs">
            - {t.subtitle}
          </span>
        </div>
      </div>
    </div>
  );
}

export default PaperTradingBanner;
