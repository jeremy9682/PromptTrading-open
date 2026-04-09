import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Brain,
  GraduationCap,
  Users,
  Wallet,
  TrendingUp,
  Target,
  Home,
  Sparkles
} from 'lucide-react';
import { useAppStore } from '../../contexts/useAppStore';

const Sidebar = ({ 
  activeTab, 
  language, 
  t, 
  compareMode, 
  selectedAI,
  autoPilot,
  setAutoPilot
}) => {
  const navigate = useNavigate();
  const [isExpanded, setIsExpanded] = useState(false);
  const tradingMode = useAppStore(state => state.tradingMode);
  const setTradingMode = useAppStore(state => state.setTradingMode);
  const setShowLandingPage = useAppStore(state => state.setShowLandingPage);

  return (
    <div
      className={`hidden md:flex bg-white dark:bg-gray-900 h-screen p-4 border-r border-gray-200 dark:border-gray-800 transition-all duration-300 ease-in-out flex-col ${
        isExpanded ? 'w-64' : 'w-20'
      }`}
      onMouseEnter={() => setIsExpanded(true)}
      onMouseLeave={() => setIsExpanded(false)}
    >
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0">
          <img 
            src="/logo.png" 
            alt="PromptTrading logo" 
            className="w-10 h-10 object-contain"
          />
        </div>
        <div className={`overflow-hidden transition-all duration-300 ${
          isExpanded ? 'opacity-100 w-auto' : 'opacity-0 w-0'
        }`}>
          <h1 className="text-gray-900 dark:text-white font-bold whitespace-nowrap">{t[language].title}</h1>
          <p className="text-gray-500 dark:text-gray-400 text-xs whitespace-nowrap">{t[language].subtitle}</p>
        </div>
      </div>

      {/* Trading Mode Section */}
      <div className="mb-6 border-b border-gray-200 dark:border-gray-800 pb-4">
        <div className={`text-xs font-semibold text-gray-500 dark:text-gray-400 mb-3 transition-all duration-300 ${
          isExpanded ? 'opacity-100 px-3' : 'opacity-0 h-0 mb-0'
        }`}>
          {t[language].tradingMode}
        </div>
        
        <div className="space-y-2">
          {/* Polymarket Mode */}
          <button
            onClick={() => {
              setTradingMode('polymarket');
              navigate('/markets'); // 跳转到 Polymarket Markets 页面
            }}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all ${
              tradingMode === 'polymarket' 
                ? 'bg-orange-50 dark:bg-orange-500/10 border border-orange-200 dark:border-orange-500/30' 
                : 'hover:bg-gray-100 dark:hover:bg-gray-800'
            }`}
          >
            <div className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center ${
              tradingMode === 'polymarket'
                ? 'bg-orange-500 text-white'
                : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
            }`}>
              <Target size={16} />
            </div>
            <div className={`text-left overflow-hidden transition-all duration-300 ${
              isExpanded ? 'opacity-100 w-auto' : 'opacity-0 w-0'
            }`}>
              <div className={`text-sm font-semibold whitespace-nowrap ${
                tradingMode === 'polymarket'
                  ? 'text-orange-600 dark:text-orange-400'
                  : 'text-gray-900 dark:text-white'
              }`}>
                {t[language].polymarket}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
                {t[language].polymarketDesc}
              </div>
            </div>
          </button>

          {/* Hyperliquid Mode */}
          <button
            onClick={() => {
              setTradingMode('hyperliquid');
              navigate('/'); // 回到首页显示 Hyperliquid Dashboard
            }}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all ${
              tradingMode === 'hyperliquid' 
                ? 'bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/30' 
                : 'hover:bg-gray-100 dark:hover:bg-gray-800'
            }`}
          >
            <div className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center ${
              tradingMode === 'hyperliquid'
                ? 'bg-blue-500 text-white'
                : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
            }`}>
              <TrendingUp size={16} />
            </div>
            <div className={`text-left overflow-hidden transition-all duration-300 ${
              isExpanded ? 'opacity-100 w-auto' : 'opacity-0 w-0'
            }`}>
              <div className={`text-sm font-semibold whitespace-nowrap ${
                tradingMode === 'hyperliquid'
                  ? 'text-blue-600 dark:text-blue-400'
                  : 'text-gray-900 dark:text-white'
              }`}>
                {t[language].hyperliquid}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
                {t[language].hyperliquidDesc}
              </div>
            </div>
          </button>
        </div>
      </div>

    <nav className="space-y-2">
      <button
        onClick={() => navigate('/ai-setup')}
        className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
          activeTab === 'ai-setup' ? 'bg-blue-100 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
        }`}
      >
        <Brain size={18} className="flex-shrink-0" />
        <span className={`whitespace-nowrap overflow-hidden transition-all duration-300 ${
          isExpanded ? 'opacity-100 w-auto' : 'opacity-0 w-0'
        }`}>{t[language].aiConfig}</span>
        {compareMode && isExpanded && (
          <span className="ml-auto bg-purple-500 text-xs px-1.5 py-0.5 rounded-full text-white">
            {selectedAI.length}
          </span>
        )}
      </button>

      {/* AI Credits */}
      <button
        onClick={() => navigate('/ai-credits')}
        className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
          activeTab === 'ai-credits' ? 'bg-purple-100 dark:bg-purple-500/10 text-purple-600 dark:text-purple-400' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
        }`}
      >
        <Sparkles size={18} className="flex-shrink-0" />
        <span className={`whitespace-nowrap overflow-hidden transition-all duration-300 ${
          isExpanded ? 'opacity-100 w-auto' : 'opacity-0 w-0'
        }`}>{language === 'zh' ? 'AI Credits' : 'AI Credits'}</span>
      </button>

      {/* 策略工厂 Tab - TEMPORARILY HIDDEN (待后续处理) */}
      {/* <button
        onClick={() => setActiveTab('strategy')}
        className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
          activeTab === 'strategy' ? 'bg-blue-500/10 text-blue-400' : 'text-gray-400 hover:bg-gray-800'
        }`}
      >
        <Zap size={18} />
        <span>{t[language].strategy}</span>
      </button> */}

      <button
        onClick={() => navigate('/learn')}
        className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
          activeTab === 'learn' ? 'bg-blue-100 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
        }`}
      >
        <GraduationCap size={18} className="flex-shrink-0" />
        <span className={`whitespace-nowrap overflow-hidden transition-all duration-300 ${
          isExpanded ? 'opacity-100 w-auto' : 'opacity-0 w-0'
        }`}>{t[language].learn}</span>
        {isExpanded && (
          <span className="ml-auto bg-green-500 text-xs px-1.5 py-0.5 rounded-full text-white">
            {language === 'zh' ? '新' : 'New'}
          </span>
        )}
      </button>

      <button
        onClick={() => navigate('/community')}
        className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
          activeTab === 'community' ? 'bg-blue-100 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
        }`}
      >
        <Users size={18} className="flex-shrink-0" />
        <span className={`whitespace-nowrap overflow-hidden transition-all duration-300 ${
          isExpanded ? 'opacity-100 w-auto' : 'opacity-0 w-0'
        }`}>{t[language].community}</span>
      </button>

      {/* Wallet Tab - DISABLED: Wallet management moved to user dropdown menu with Privy */}
      {/* <button
        onClick={() => navigate('/wallet')}
        className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
          activeTab === 'wallet' ? 'bg-blue-100 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
        }`}
      >
        <Wallet size={18} className="flex-shrink-0" />
        <span className={`whitespace-nowrap overflow-hidden transition-all duration-300 ${
          isExpanded ? 'opacity-100 w-auto' : 'opacity-0 w-0'
        }`}>{t[language].wallet}</span>
      </button> */}
    </nav>

    {/* Social Media Links */}
    <div className="mt-auto pt-6">
      {/* Back to Home Button */}
      <div className="mb-4">
        <button
          onClick={() => setShowLandingPage(true)}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
        >
          <Home size={18} className="flex-shrink-0" />
          <span className={`whitespace-nowrap overflow-hidden transition-all duration-300 ${
            isExpanded ? 'opacity-100 w-auto' : 'opacity-0 w-0'
          }`}>
            {t[language].backToHome}
          </span>
        </button>
      </div>

      <div className={`border-t border-gray-200 dark:border-gray-800 pt-4 transition-all duration-300 ${
        isExpanded ? 'px-3' : 'px-0'
      }`}>
        <div className={`text-xs font-semibold text-blue-600 dark:text-blue-400 mb-3 transition-all duration-300 ${
          isExpanded ? 'opacity-100' : 'opacity-0 h-0 mb-0'
        }`}>
          {language === 'zh' ? '🌟 加入社区' : '🌟 Join Community'}
        </div>

        <div className="flex flex-col gap-2">
          {/* Telegram Channel */}
          <a
            href="https://t.me/prompttradingai"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-500/10 transition-all group hover:scale-105"
            title="Telegram Channel"
          >
            <svg
              viewBox="0 0 24 24"
              className="w-5 h-5 flex-shrink-0"
            >
              <circle cx="12" cy="12" r="12" fill="#7dd3fc"/>
              <path
                fill="white"
                d="M17.562 8.161c-.18.717-1.968 9.289-2.563 11.351-.252.877-.746 1.17-1.224 1.198-.537.032-1.088-.286-1.687-.705-1.008-.71-1.577-1.152-2.553-1.845-1.128-.8-.397-1.24.246-1.958.168-.188 3.088-2.831 3.145-3.073.007-.03.014-.142-.053-.201-.067-.06-.165-.04-.236-.023-.1.023-1.699 1.08-4.791 3.17-.454.312-.865.463-1.234.453-.406-.011-1.187-.23-1.767-.419-.712-.232-1.278-.355-1.229-.749.025-.204.311-.413.857-.626 3.357-1.462 5.596-2.426 6.718-2.894 3.196-1.328 3.861-1.559 4.294-1.566.095-.001.308.022.446.134.117.095.149.222.164.312.015.09.034.295.02.456z"
              />
            </svg>
            <span className={`text-sm text-gray-900 dark:text-white whitespace-nowrap overflow-hidden transition-all duration-300 ${
              isExpanded ? 'opacity-100 w-auto' : 'opacity-0 w-0'
            }`}>
              TG Channel
            </span>
          </a>

          {/* Telegram Group */}
          <a
            href="https://t.me/infoprompttrading"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-500/10 transition-all group hover:scale-105"
            title="Telegram Group"
          >
            <svg
              viewBox="0 0 24 24"
              className="w-5 h-5 flex-shrink-0"
            >
              <circle cx="12" cy="12" r="11" fill="#7dd3fc"/>
              <path
                fill="white"
                d="M7.5 11.5c0-.8.7-1.5 1.5-1.5s1.5.7 1.5 1.5S9.8 13 9 13s-1.5-.7-1.5-1.5zm4.5 0c0-.8.7-1.5 1.5-1.5s1.5.7 1.5 1.5-.7 1.5-1.5 1.5-1.5-.7-1.5-1.5zm3 1.5c.8 0 1.5-.7 1.5-1.5s-.7-1.5-1.5-1.5-1.5.7-1.5 1.5.7 1.5 1.5 1.5z"
              />
              <path
                fill="white"
                d="M12 17c-2.2 0-4-1.3-4-3h8c0 1.7-1.8 3-4 3z"
              />
            </svg>
            <span className={`text-sm text-gray-900 dark:text-white whitespace-nowrap overflow-hidden transition-all duration-300 ${
              isExpanded ? 'opacity-100 w-auto' : 'opacity-0 w-0'
            }`}>
              TG Group
            </span>
          </a>

          {/* X (Twitter) */}
          <a
            href="https://x.com/prompttrading"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-all group hover:scale-105"
            title="X (Twitter)"
          >
            <svg
              viewBox="0 0 24 24"
              className="w-5 h-5 flex-shrink-0 fill-white"
            >
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
            </svg>
            <span className={`text-sm text-gray-900 dark:text-white whitespace-nowrap overflow-hidden transition-all duration-300 ${
              isExpanded ? 'opacity-100 w-auto' : 'opacity-0 w-0'
            }`}>
              @prompttrading
            </span>
          </a>
        </div>
      </div>
    </div>

    {/* Auto Trade Toggle - TEMPORARILY HIDDEN (待后续处理) */}
    {/* <div className="mt-6 p-3 bg-gray-800 rounded-lg">
      <div className="flex items-center justify-between mb-2">
        <span className="text-white text-sm font-medium">{t[language].autoTrade}</span>
        <button
          onClick={() => setAutoPilot(!autoPilot)}
          className={`w-10 h-5 rounded-full transition-colors ${
            autoPilot ? 'bg-green-500' : 'bg-gray-600'
          }`}
        >
          <div className={`w-4 h-4 bg-white rounded-full transition-transform ${
            autoPilot ? 'translate-x-5' : 'translate-x-0.5'
          }`} />
        </button>
      </div>
      {autoPilot && (
        <div className="text-xs text-gray-400 space-y-1">
          <div className="flex items-center gap-1">
            <div className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
            <span>Running Smart Money Strategy</span>
          </div>
          <div>Next trade: 3 min</div>
        </div>
      )}
    </div> */}
    </div>
  );
};

export default Sidebar;
