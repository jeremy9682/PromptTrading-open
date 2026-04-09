import React from 'react';
import { BarChart3, CandlestickChart, Users, Settings } from 'lucide-react';
import { useAppStore } from '../contexts/useAppStore';
import DashboardTab from './tabs/DashboardTab';
import TradingDashboardTab from './tabs/TradingDashboardTab';
import MyTradersTab from './tabs/MyTradersTab';
import { CryptoWalletSetup } from './crypto';

const CryptoTradingView = ({ 
  language, 
  t, 
  aiModels, 
  selectedAI, 
  setSelectedAI, 
  compareMode, 
  setCompareMode, 
  tradeAmount, 
  setTradeAmount,
  selectedToken,
  setSelectedToken
}) => {
  // 使用全局状态持久化sub-tab选择
  const cryptoSubTab = useAppStore(state => state.cryptoSubTab || 'tradingPanel');
  const setCryptoSubTab = useAppStore(state => state.setCryptoSubTab);

  return (
    <div className="flex flex-col h-full">
      {/* Horizontal Tab Navigation - 3 Tabs: Trading Panel | Dashboard | My Traders */}
      <div className="flex items-center justify-center gap-3 mb-6 bg-white/50 dark:bg-gray-900/50 backdrop-blur-sm rounded-2xl p-2 border border-gray-200 dark:border-gray-800 relative z-10">
        {/* Trading Panel - Left */}
        <button
          onClick={() => setCryptoSubTab('tradingPanel')}
          className={`flex items-center gap-2 px-5 py-3 rounded-xl transition-all font-medium ${
            cryptoSubTab === 'tradingPanel'
              ? 'bg-blue-500 text-white shadow-lg'
              : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
          }`}
        >
          <CandlestickChart size={18} />
          <span>{t[language].cryptoTabs.tradingPanel}</span>
        </button>

        {/* Dashboard - Center */}
        <button
          onClick={() => setCryptoSubTab('dashboard')}
          className={`flex items-center gap-2 px-5 py-3 rounded-xl transition-all font-medium ${
            cryptoSubTab === 'dashboard'
              ? 'bg-blue-500 text-white shadow-lg'
              : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
          }`}
        >
          <BarChart3 size={18} />
          <span>{t[language].cryptoTabs.dashboard}</span>
        </button>
        
        {/* My Traders - Right (Coming Soon) */}
        <button
          onClick={() => setCryptoSubTab('myTraders')}
          className={`relative flex items-center gap-2 px-5 py-3 rounded-xl transition-all font-medium ${
            cryptoSubTab === 'myTraders'
              ? 'bg-blue-500 text-white shadow-lg'
              : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
          }`}
        >
          <Users size={18} />
          <span>{t[language].cryptoTabs.myTraders}</span>
          <span className="absolute -top-1 -right-1 px-2 py-0.5 bg-yellow-400 text-yellow-900 text-xs rounded-full font-bold shadow-md">
            {language === 'zh' ? '即将上线' : 'Soon'}
          </span>
        </button>

        {/* Settings Tab */}
        <button
          onClick={() => setCryptoSubTab('settings')}
          className={`flex items-center gap-2 px-5 py-3 rounded-xl transition-all font-medium ${
            cryptoSubTab === 'settings'
              ? 'bg-blue-500 text-white shadow-lg'
              : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
          }`}
        >
          <Settings size={18} />
          <span>{language === 'zh' ? '设置' : 'Settings'}</span>
        </button>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto">
        {cryptoSubTab === 'tradingPanel' && (
          <TradingDashboardTab 
            language={language}
            selectedToken={selectedToken}
            setSelectedToken={setSelectedToken}
            tradeAmount={tradeAmount}
          />
        )}
        
        {cryptoSubTab === 'myTraders' && (
          <MyTradersTab 
            language={language}
            t={t}
          />
        )}
        
        {cryptoSubTab === 'dashboard' && (
          <DashboardTab 
            language={language}
            t={t}
            aiModels={aiModels}
            selectedAI={selectedAI}
            setSelectedAI={setSelectedAI}
            compareMode={compareMode}
            setCompareMode={setCompareMode}
            tradeAmount={tradeAmount}
            setTradeAmount={setTradeAmount}
          />
        )}

        {cryptoSubTab === 'settings' && (
          <div className="max-w-2xl mx-auto">
            <CryptoWalletSetup language={language} />
          </div>
        )}
      </div>
    </div>
  );
};

export default CryptoTradingView;

