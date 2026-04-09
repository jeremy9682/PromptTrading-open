import React, { useState, useEffect } from 'react';
import { Routes, Route, useLocation, Navigate } from 'react-router-dom';

// Check if we're in production environment
const isProduction = import.meta.env.PROD;

// Import constants
import { translations } from './constants/translations';
import { getAiModels, getDexOptions, getStrategies } from './constants/data.jsx';

// Import layout components
import Header from './components/layout/Header';
import Sidebar from './components/layout/Sidebar';
import MobileBottomNav from './components/layout/MobileBottomNav';

// Import tab components
import DashboardTab from './components/tabs/DashboardTab';
import TradingDashboardTab from './components/tabs/TradingDashboardTab';
import LearnTab from './components/tabs/LearnTab';
// TEMPORARILY HIDDEN (待后续处理)
// import StrategyTab from './components/tabs/StrategyTab';
import AISetupTab from './components/tabs/AISetupTab';
import CommunityTab from './components/tabs/CommunityTab';
import WalletTab from './components/tabs/WalletTab';

// Import Crypto Trading View (combines Dashboard + Trading Panel)
import CryptoTradingView from './components/CryptoTradingView';

import { useAppStore } from './contexts/useAppStore';


// Import Landing Page
import LandingPage from './components/LandingPage';

// Import Polymarket Pages
import { MarketsPage } from './polymarket/pages/MarketsPage';
import { WatchlistPage } from './polymarket/pages/WatchlistPage';
import { TradersPage } from './polymarket/pages/TradersPage';
import { TraderDetailPage } from './polymarket/pages/TraderDetailPage';
import { PolymarketLayout } from './polymarket/components/PolymarketLayout';

// Import Paper Trading Components
import { PaperTradingBanner } from './components/paper-trading';

// Import AI Credits Page
import { AICreditsPage } from './components/credits';

// Import Pro Terminal
import { ProTerminal } from './pro-terminal';

const App = () => {
  const location = useLocation();
  const language = useAppStore(state => state.language);
  const setLanguage = useAppStore(state => state.setLanguage);
  const theme = useAppStore(state => state.theme);
  const setTheme = useAppStore(state => state.setTheme);
  const tradingMode = useAppStore(state => state.tradingMode);
  
  // 从路径推断 activeTab，用于 Sidebar 高亮
  const getActiveTabFromPath = () => {
    const path = location.pathname;
    if (path === '/ai-setup') return 'ai-setup';
    if (path === '/wallet') return 'wallet';
    if (path === '/learn') return 'learn';
    if (path === '/community') return 'community';
    if (path === '/ai-credits') return 'ai-credits';
    if (path === '/markets' || path === '/watchlist' || path.startsWith('/traders')) return 'dashboard'; // Polymarket 相关页面
    return 'dashboard'; // 默认是 dashboard
  };
  
  const activeTab = getActiveTabFromPath();
  const [selectedAI, setSelectedAI] = useState(['deepseek']);
  const [selectedDex, setSelectedDex] = useState('hyperliquid');
  const showLandingPage = useAppStore(state => state.showLandingPage);
  const hideLandingPage = useAppStore(state => state.hideLandingPage);
  const [apiKeyModal, setApiKeyModal] = useState(false);
  const [promptTemplate, setPromptTemplate] = useState('smart_money');
  const [tradeAmount, setTradeAmount] = useState('100');
  const [selectedToken, setSelectedToken] = useState('ETH/USDT');
  const isSimulationMode = useAppStore(state => state.isSimulationMode);
  const setIsSimulationMode = useAppStore(state => state.setIsSimulationMode);
  const [showTermExplanation, setShowTermExplanation] = useState(null);
  const [compareMode, setCompareMode] = useState(false);
  const [autoPilot, setAutoPilot] = useState(false);


  // Get data with current language
  const aiModels = getAiModels(language);
  const dexOptions = getDexOptions(language);
  // TEMPORARILY HIDDEN (待后续处理)
  // const strategies = getStrategies(language, translations);
  const t = translations;

  // language persistence handled by Zustand persist

  // Apply theme to document
  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  // Handle Get Started from Landing Page
  const handleGetStarted = () => {
    hideLandingPage();
  };

  // Show Landing Page for first-time users
  if (showLandingPage) {
    return <LandingPage onGetStarted={handleGetStarted} language={language} t={t} />;
  }

  // Pro Terminal - 独立全屏渲染
  // In production, redirect to home page; in dev/test, show Pro Terminal
  if (location.pathname.startsWith('/pro')) {
    if (isProduction) {
      return <Navigate to="/" replace />;
    }
    return <ProTerminal />;
  }

  return (
    <div className="h-screen bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-white flex flex-col md:flex-row">
        <Sidebar 
        activeTab={activeTab}
        language={language}
        t={t}
        compareMode={compareMode}
        selectedAI={selectedAI}
        autoPilot={autoPilot}
        setAutoPilot={setAutoPilot}
      />
      
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header
          activeTab={activeTab}
          language={language}
          setLanguage={setLanguage}
          theme={theme}
          setTheme={setTheme}
          isSimulationMode={isSimulationMode}
          setIsSimulationMode={setIsSimulationMode}
          t={t}
        />

        {/* Paper Trading Banner - 仅在 Polymarket 模式显示 */}
        {tradingMode === 'polymarket' && (
          <PaperTradingBanner language={language} />
        )}

        {/* Main Content with Routes */}
        <div className="p-4 pb-20 md:p-8 flex-1 overflow-y-auto min-h-0">
          <Routes>
            {/* Dashboard Route - 根据 tradingMode 显示不同内容 */}
            <Route path="/" element={
              tradingMode === 'hyperliquid' ? (
                <CryptoTradingView
                  language={language}
                  t={t}
                  aiModels={aiModels}
                  selectedAI={selectedAI}
                  setSelectedAI={setSelectedAI}
                  compareMode={compareMode}
                  setCompareMode={setCompareMode}
                  tradeAmount={tradeAmount}
                  setTradeAmount={setTradeAmount}
                  selectedToken={selectedToken}
                  setSelectedToken={setSelectedToken}
                />
              ) : (
                <MarketsPage />
              )
            } />
            
            {/* Polymarket Routes (with auth initialization) */}
            <Route path="/markets" element={<PolymarketLayout><MarketsPage /></PolymarketLayout>} />
            <Route path="/watchlist" element={<PolymarketLayout><WatchlistPage /></PolymarketLayout>} />
            <Route path="/traders" element={<PolymarketLayout><TradersPage /></PolymarketLayout>} />
            <Route path="/traders/:traderId" element={<PolymarketLayout><TraderDetailPage /></PolymarketLayout>} />
            
            {/* AI Setup Route */}
            <Route path="/ai-setup" element={
              <AISetupTab language={language} />
            } />
            
            {/* Wallet Route */}
            <Route path="/wallet" element={
              <WalletTab language={language} />
            } />
            
            {/* Learn Route */}
            <Route path="/learn" element={
              <LearnTab 
                t={t}
                language={language}
              />
            } />
            
            {/* Community Route */}
            <Route path="/community" element={
              <CommunityTab 
                t={t}
                language={language}
              />
            } />
            
            {/* AI Credits Route */}
            <Route path="/ai-credits" element={
              <AICreditsPage language={language} />
            } />
          </Routes>
        </div>
      </div>


      {/* Term Explanation Tooltip */}
      {showTermExplanation && (
        <div className="fixed z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3 max-w-xs shadow-xl" 
             style={{ top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }}>
          <h4 className="text-gray-900 dark:text-white font-medium mb-1">
            {language === 'zh' ? '交易对' : 'Trading Pair'}
          </h4>
          <p className="text-gray-600 dark:text-gray-400 text-sm">
            {language === 'zh'
              ? '两种加密货币之间的交换比例，比如 ETH/USDT 表示用 USDT 买卖 ETH'
              : 'Exchange ratio between two cryptocurrencies, like ETH/USDT means buying/selling ETH with USDT'}
          </p>
        </div>
      )}

      {/* Mobile Bottom Navigation - 只在移动端显示 */}
      <MobileBottomNav
        activeTab={activeTab}
        language={language}
        t={t}
      />
    </div>
  );
};

export default App;

