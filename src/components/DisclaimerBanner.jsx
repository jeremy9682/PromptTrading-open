/**
 * 免责声明横幅
 * 在关键位置显示风险提示和教育优先信息
 */

import React from 'react';
import { AlertTriangle, Info } from 'lucide-react';

const DisclaimerBanner = ({ language = 'zh', variant = 'info', showIcon = true }) => {
  const variants = {
    info: {
      bg: 'bg-blue-500/10',
      border: 'border-blue-500/20',
      text: 'text-blue-400',
      icon: Info
    },
    warning: {
      bg: 'bg-yellow-500/10',
      border: 'border-yellow-500/20',
      text: 'text-yellow-400',
      icon: AlertTriangle
    },
    danger: {
      bg: 'bg-red-500/10',
      border: 'border-red-500/20',
      text: 'text-red-400',
      icon: AlertTriangle
    }
  };

  const style = variants[variant] || variants.info;
  const Icon = style.icon;

  const content = {
    zh: {
      education: '📚 教育工具：本平台是学习工具，不构成投资建议',
      simulation: '🎮 建议使用测试网：测试网交易无真实资金风险',
      risk: '⚠️ 风险提示：加密货币交易存在高风险，可能导致全部资金损失',
      responsibility: '🔒 自负责任：所有交易决策由用户自行承担',
      noAdvice: '📖 非投资建议：AI 分析仅供学习参考，不构成投资建议',
      mainnetWarning: '⚠️ 主网交易使用真实资金，请充分了解风险后谨慎操作'
    },
    en: {
      education: '📚 Educational Tool: This platform is for learning purposes, not investment advice',
      simulation: '🎮 Use Testnet First: Testnet trading has no real fund risks',
      risk: '⚠️ Risk Warning: Crypto trading is high risk and may result in total loss',
      responsibility: '🔒 Your Responsibility: You are solely responsible for all trading decisions',
      noAdvice: '📖 Not Investment Advice: AI analysis is for educational reference only',
      mainnetWarning: '⚠️ Mainnet uses real funds - please fully understand risks before trading'
    }
  };

  const messages = content[language];

  return (
    <div className={`px-4 py-3 border rounded-lg ${style.bg} ${style.border}`}>
      <div className="flex items-start gap-3">
        {showIcon && <Icon className={`${style.text} flex-shrink-0 mt-0.5`} size={18} />}
        <div className={`text-sm ${style.text} space-y-1`}>
          <p className="font-medium">{messages.education}</p>
          <p>{messages.simulation}</p>
          <p>{messages.risk}</p>
          <p className="font-medium">{messages.noAdvice}</p>
        </div>
      </div>
    </div>
  );
};

export default DisclaimerBanner;

