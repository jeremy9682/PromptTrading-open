import React from 'react';
import { AlertCircle, Globe, Sun, Moon } from 'lucide-react';
import { useAppStore } from '../../contexts/useAppStore';
import { useAuth } from '../../contexts/AuthContext';
import { LoginButton, UserMenu } from '../auth';
import { PortfolioButton } from '../../polymarket/components/portfolio';
import { NotificationBell } from '../../polymarket/components/NotificationBell';
import { TradingModeSwitch } from '../paper-trading';
import { ProModeSwitch } from '../pro-terminal';

const Header = ({
  activeTab,
  language,
  setLanguage,
  theme,
  setTheme,
  isSimulationMode,
  setIsSimulationMode,
  t
}) => {
  // Privy authentication state
  const { ready, authenticated, walletAddress, effectiveChainId } = useAuth();

  // Use Privy authentication status
  const effectiveConnected = authenticated;

  // Network status based on effectiveChainId (controlled by isSimulationMode)
  const isTestnet = effectiveChainId === 421614;
  const isMainnet = effectiveChainId === 42161;
  // For Hyperliquid, we always support testnet and mainnet
  const networkSupported = authenticated ? true : false;

  const tradingMode = useAppStore(state => state.tradingMode);
  const cryptoSubTab = useAppStore(state => state.cryptoSubTab);

  // Get page title based on active tab and trading mode
  const getPageTitle = () => {
    // If in Crypto Trading mode dashboard tab, show sub-tab title
    if (tradingMode === 'hyperliquid' && activeTab === 'dashboard') {
      if (cryptoSubTab === 'tradingPanel') return t[language].cryptoTabs.tradingPanel;
      if (cryptoSubTab === 'myTraders') return t[language].cryptoTabs.myTraders;
      if (cryptoSubTab === 'dashboard') return t[language].cryptoTabs.dashboard;
    }

    // Default page titles
    if (activeTab === 'dashboard') return t[language].dashboard;
    if (activeTab === 'trading-dashboard') return t[language].tradingDashboard;
    if (activeTab === 'ai-setup') return t[language].aiConfig;
    if (activeTab === 'strategy') return t[language].strategy;
    if (activeTab === 'learn') return t[language].learn;
    if (activeTab === 'wallet') return t[language].wallet;
    if (activeTab === 'community') return t[language].community;

    return t[language].dashboard;
  };

  return (
  <div className="bg-white/80 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-800 px-4 md:px-8 py-3 md:py-4 backdrop-blur-sm relative z-50">
    <div className="flex items-center justify-between gap-2 md:gap-4">
      <div className="min-w-0 flex-1">
        <h2 className="text-base md:text-xl font-semibold text-gray-900 dark:text-white truncate">
          {getPageTitle()}
        </h2>
        <p className="text-gray-500 dark:text-gray-400 text-xs md:text-sm hidden sm:block truncate">{t[language].subtitle}</p>
      </div>

      <div className="flex items-center gap-1.5 md:gap-4 flex-shrink-0">
        {/* Pro Terminal 切换按钮 */}
        <ProModeSwitch language={language} />

        {/* Paper/Live 切换 - 仅在 Polymarket 模式显示 */}
        {tradingMode === 'polymarket' && (
          <TradingModeSwitch language={language} />
        )}

        {/* 网络切换 - 仅在 Hyperliquid 模式显示 */}
        {tradingMode === 'hyperliquid' && (
          <>
            {!effectiveConnected ? (
              <div className="hidden sm:block bg-gray-200 dark:bg-gray-800 rounded-lg px-2 md:px-3 py-1.5 md:py-2 opacity-50">
                <span className="text-gray-500 dark:text-gray-400 text-xs md:text-sm">
                  {language === 'zh' ? '请先登录' : 'Login first'}
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-1 md:gap-2 bg-gray-200 dark:bg-gray-800 rounded-lg p-0.5 md:p-1">
                <button
                  onClick={() => {
                    // Switch to testnet (simulation mode)
                    if (!isTestnet) {
                      setIsSimulationMode(true);
                    }
                  }}
                  className={`px-2 md:px-3 py-1 rounded text-xs md:text-sm transition-all whitespace-nowrap ${
                    isTestnet
                      ? 'bg-blue-500 text-white'
                      : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                  }`}
                >
                  {language === 'zh' ? '测试网' : 'Test'}
                </button>
                <button
                  onClick={() => {
                    // Switch to mainnet (requires confirmation via setIsSimulationMode)
                    if (!isMainnet) {
                      setIsSimulationMode(false); // This will show confirmation dialog
                    }
                  }}
                  className={`px-2 md:px-3 py-1 rounded text-xs md:text-sm transition-all whitespace-nowrap ${
                    isMainnet
                      ? 'bg-green-500 text-white'
                      : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                  }`}
                >
                  {language === 'zh' ? '主网' : 'Main'}
                </button>
              </div>
            )}
          </>
        )}

        {/* Social Media Links */}
        <div className="hidden md:flex items-center gap-2 bg-gray-100 dark:bg-gray-800/50 rounded-lg px-2 py-1">
          {/* Telegram Channel */}
          <a
            href="https://t.me/prompttradingai"
            target="_blank"
            rel="noopener noreferrer"
            className="p-1.5 hover:bg-blue-500/10 rounded-lg transition-all group hover:scale-110"
            title="Telegram Channel"
          >
            <svg
              viewBox="0 0 24 24"
              className="w-5 h-5"
            >
              <circle cx="12" cy="12" r="12" fill="#7dd3fc"/>
              <path
                fill="white"
                d="M17.562 8.161c-.18.717-1.968 9.289-2.563 11.351-.252.877-.746 1.17-1.224 1.198-.537.032-1.088-.286-1.687-.705-1.008-.71-1.577-1.152-2.553-1.845-1.128-.8-.397-1.24.246-1.958.168-.188 3.088-2.831 3.145-3.073.007-.03.014-.142-.053-.201-.067-.06-.165-.04-.236-.023-.1.023-1.699 1.08-4.791 3.17-.454.312-.865.463-1.234.453-.406-.011-1.187-.23-1.767-.419-.712-.232-1.278-.355-1.229-.749.025-.204.311-.413.857-.626 3.357-1.462 5.596-2.426 6.718-2.894 3.196-1.328 3.861-1.559 4.294-1.566.095-.001.308.022.446.134.117.095.149.222.164.312.015.09.034.295.02.456z"
              />
            </svg>
          </a>

          {/* Telegram Group */}
          <a
            href="https://t.me/infoprompttrading"
            target="_blank"
            rel="noopener noreferrer"
            className="p-1.5 hover:bg-blue-500/10 rounded-lg transition-all group hover:scale-110"
            title="Telegram Group"
          >
            <svg
              viewBox="0 0 24 24"
              className="w-5 h-5"
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
          </a>

          {/* X (Twitter) */}
          <a
            href="https://x.com/prompttrading"
            target="_blank"
            rel="noopener noreferrer"
            className="p-1.5 hover:bg-gray-700 rounded-lg transition-all group hover:scale-110"
            title="X (Twitter)"
          >
            <svg
              viewBox="0 0 24 24"
              className="w-5 h-5 fill-white"
            >
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
            </svg>
          </a>
        </div>

        {/* Theme Switch */}
        <button
          onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
          className="flex items-center gap-1 md:gap-2 px-2 md:px-3 py-1.5 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          title={theme === 'light' ? (language === 'zh' ? '切换到暗色' : 'Switch to Dark') : (language === 'zh' ? '切换到浅色' : 'Switch to Light')}
        >
          {theme === 'light' ? (
            <Moon size={14} className="text-gray-600 dark:text-gray-400 flex-shrink-0" />
          ) : (
            <Sun size={14} className="text-gray-600 dark:text-gray-400 flex-shrink-0" />
          )}
        </button>

        {/* Language Switch */}
        <button
          onClick={() => setLanguage(language === 'zh' ? 'en' : 'zh')}
          className="flex items-center gap-1 md:gap-2 px-2 md:px-3 py-1.5 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
        >
          <Globe size={14} className="text-gray-600 dark:text-gray-400 flex-shrink-0" />
          <span className="text-gray-900 dark:text-white text-xs md:text-sm whitespace-nowrap">{language === 'zh' ? 'EN' : '中文'}</span>
        </button>

        {/* Notification Bell - 登录后显示 */}
        {authenticated && <NotificationBell />}

        {/* Portfolio Button - Polymarket 模式下显示 */}
        {authenticated && <PortfolioButton language={language} />}

        {/* Privy Authentication - Login/User Menu */}
        {authenticated ? (
          <UserMenu language={language} />
        ) : (
          <LoginButton language={language} variant="gradient" />
        )}
      </div>
    </div>

    {/* 网络状态和免责声明 */}
    <div className="mt-3 space-y-2">
      {/* 网络状态 - 仅在 Hyperliquid 模式显示 */}
      {tradingMode === 'hyperliquid' && effectiveConnected && (
        <div className={`px-2 md:px-3 py-1.5 border rounded-lg flex items-center justify-center ${
          isTestnet
            ? 'bg-blue-100 dark:bg-blue-500/10 border-blue-300 dark:border-blue-500/20'
            : 'bg-red-100 dark:bg-red-500/10 border-red-300 dark:border-red-500/30'
        }`}>
          <div className="flex items-center gap-1.5 md:gap-2 flex-wrap justify-center">
            <div className={`w-2 h-2 rounded-full animate-pulse flex-shrink-0 ${
              isTestnet ? 'bg-blue-600 dark:bg-blue-400' : 'bg-red-600 dark:bg-red-400'
            }`} />
            <span className={`text-xs md:text-sm font-medium ${
              isTestnet ? 'text-blue-700 dark:text-blue-400' : 'text-red-700 dark:text-red-400'
            }`}>
              {isTestnet
                ? (language === 'zh' ? 'Arbitrum Sepolia (测试网)' : 'Arbitrum Sepolia (Testnet)')
                : (language === 'zh' ? 'Arbitrum One (主网)' : 'Arbitrum One (Mainnet)')}
            </span>
            {isMainnet && (
              <span className="text-yellow-600 dark:text-yellow-300 font-bold text-xs md:text-sm">
                {language === 'zh' ? '⚠️ 真实资金 高风险' : '⚠️ Real Funds High Risk'}
              </span>
            )}
          </div>
        </div>
      )}

      {/* 教育优先和风险提示 - 根据交易模式显示不同内容 */}
      <div className="px-2 md:px-3 py-1.5 md:py-2 bg-gradient-to-r from-purple-100 to-blue-100 dark:from-purple-500/10 dark:to-blue-500/10 border border-purple-300 dark:border-purple-500/20 rounded-lg">
        <p className="text-purple-700 dark:text-purple-300 text-[10px] md:text-xs text-center leading-relaxed">
          {tradingMode === 'polymarket' ? (
            // Polymarket 模式的免责声明
            language === 'zh'
              ? '📚 教育学习工具，非投资建议，您需对所有决策负责'
              : '📚 Educational Tool, Not Investment Advice, You Are Fully Responsible'
          ) : (
            // Hyperliquid 模式的免责声明
            language === 'zh'
              ? '📚 教育学习工具，非投资建议，您需对所有决策负责'
              : '📚 Educational Tool, Not Investment Advice, You Are Fully Responsible'
          )}
        </p>
      </div>
    </div>

  </div>
  );
};

export default Header;

