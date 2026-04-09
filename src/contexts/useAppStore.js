import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const useAppStore = create(
  persist(
    (set, get) => ({
      // Hydration state - tracks if store has been restored from localStorage
      _hasHydrated: false,
      setHasHydrated: (state) => set({ _hasHydrated: state }),

      language: 'en',
      setLanguage: (lang) => set({ language: lang }),
      toggleLanguage: () => set({ language: get().language === 'zh' ? 'en' : 'zh' }),

      // 交易模式管理
      tradingMode: 'hyperliquid', // 'polymarket' | 'hyperliquid'
      setTradingMode: (mode) => set({ tradingMode: mode }),

      // Pro Terminal 界面模式
      interfaceMode: 'standard', // 'standard' | 'pro'
      setInterfaceMode: (mode) => set({ interfaceMode: mode }),
      toggleInterfaceMode: () => set((state) => ({
        interfaceMode: state.interfaceMode === 'standard' ? 'pro' : 'standard'
      })),

      // Pro Terminal 布局管理
      currentProLayout: 'crypto', // 'crypto' | 'fed' | 'election' | 'multi-asset' | 'custom'
      setCurrentProLayout: (layout) => set({ currentProLayout: layout }),

      // 用户自定义布局存储 (Dockview 序列化数据)
      savedProLayouts: {},
      saveProLayout: (name, layoutData) => set((state) => ({
        savedProLayouts: { ...state.savedProLayouts, [name]: layoutData }
      })),
      deleteProLayout: (name) => set((state) => {
        const { [name]: _, ...rest } = state.savedProLayouts;
        return { savedProLayouts: rest };
      }),

      // Paper Trading (模拟盘) 状态管理
      isPaperTrading: true, // 默认开启模拟盘模式
      setIsPaperTrading: (value) => {
        // 切换到实盘需要确认
        if (!value) {
          const lang = get().language;
          const message = lang === 'zh'
            ? '⚠️ 切换到实盘模式\n\n' +
              '这将使用真实资金进行交易。\n\n' +
              '重要提示：\n' +
              '• 实盘交易使用您的真实 USDC\n' +
              '• 预测市场交易存在高风险\n' +
              '• 您对所有交易决策完全负责\n\n' +
              '是否继续？'
            : '⚠️ Switch to Live Mode\n\n' +
              'This will use real funds for trading.\n\n' +
              'Important:\n' +
              '• Live trading uses your real USDC\n' +
              '• Prediction market trading involves high risk\n' +
              '• You are fully responsible for all trading decisions\n\n' +
              'Continue?';
          const confirmed = window.confirm(message);
          if (!confirmed) return;
        }
        set({ isPaperTrading: value });
      },

      // 模拟盘账户数据 (主要从数据库加载，不再持久化到 localStorage)
      paperBalance: 10000, // 初始模拟资金 $10,000
      paperPositions: [],
      paperTradeHistory: [],
      paperAnalysisHistory: [],
      _paperDataLoaded: false, // 标记是否已从数据库加载

      // 设置模拟盘数据 (从数据库加载后调用)
      setPaperBalance: (balance) => set({ paperBalance: balance }),
      setPaperPositions: (positions) => set({ paperPositions: positions || [] }),
      setPaperTradeHistory: (trades) => set({ paperTradeHistory: trades || [] }),
      setPaperAnalysisHistory: (history) => set({ paperAnalysisHistory: history || [] }),

      // 本地更新函数 (仅用于乐观更新，实际数据以数据库为准)
      addPaperPosition: (position) => set((state) => ({
        paperPositions: [...state.paperPositions, {
          ...position,
          id: position.id || Date.now().toString(),
          createdAt: position.createdAt || new Date().toISOString()
        }]
      })),
      updatePaperPosition: (id, updates) => set((state) => ({
        paperPositions: state.paperPositions.map(p =>
          p.id === id ? { ...p, ...updates } : p
        )
      })),
      removePaperPosition: (id) => set((state) => ({
        paperPositions: state.paperPositions.filter(p => p.id !== id)
      })),
      addPaperTradeHistory: (trade) => set((state) => ({
        paperTradeHistory: [{
          ...trade,
          id: trade.id || Date.now().toString(),
          executedAt: trade.executedAt || new Date().toISOString()
        }, ...state.paperTradeHistory].slice(0, 100)
      })),
      addPaperAnalysisHistory: (analysis) => set((state) => ({
        paperAnalysisHistory: [{
          ...analysis,
          id: analysis.id || Date.now().toString(),
          createdAt: analysis.createdAt || new Date().toISOString()
        }, ...state.paperAnalysisHistory].slice(0, 50)
      })),
      clearPaperAnalysisHistory: () => set({ paperAnalysisHistory: [] }),

      // 重置模拟账户 (调用后端 API)
      resetPaperAccount: async (accessToken, walletAddress) => {
        const lang = get().language;
        const message = lang === 'zh'
          ? '确定要重置模拟账户吗？\n\n这将清空所有模拟持仓、交易历史和分析记录，\n余额将重置为 $10,000。'
          : 'Reset paper account?\n\nThis will clear all positions, trade history, and analysis records.\nBalance will be reset to $10,000.';

        const confirmed = window.confirm(message);
        if (!confirmed) return { success: false };

        // 先重置本地状态
        set({
          paperBalance: 10000,
          paperPositions: [],
          paperTradeHistory: [],
          paperAnalysisHistory: []
        });

        // 调用后端重置
        if (accessToken && walletAddress) {
          try {
            const { paperTradingAPI } = await import('../utils/api.js');
            await paperTradingAPI.reset(accessToken, walletAddress);
            console.log('[PaperTrading] Account reset on backend');
          } catch (error) {
            console.warn('[PaperTrading] Failed to reset on backend:', error.message);
          }
        }

        return { success: true };
      },

      // 从后端加载模拟账户数据 (应用启动时调用)
      loadPaperAccountFromBackend: async (accessToken, walletAddress) => {
        if (!accessToken || !walletAddress) {
          console.log('[PaperTrading] No auth, using default values');
          return { success: false };
        }

        try {
          const { paperTradingAPI } = await import('../utils/api.js');
          const response = await paperTradingAPI.getAccount(accessToken, walletAddress);

          if (response.success && response.data) {
            const { balance, positions, trades } = response.data;
            set({
              paperBalance: balance ?? 10000,
              paperPositions: positions || [],
              paperTradeHistory: trades || [],
              _paperDataLoaded: true
            });
            console.log('[PaperTrading] ✅ Loaded from database:', {
              balance: balance ?? 10000,
              positions: (positions || []).length,
              trades: (trades || []).length
            });
            return { success: true };
          }
        } catch (error) {
          console.warn('[PaperTrading] Failed to load from backend:', error.message);
        }

        // 如果后端加载失败，使用默认值
        set({
          paperBalance: 10000,
          paperPositions: [],
          paperTradeHistory: [],
          _paperDataLoaded: true
        });
        return { success: false };
      },

      // 同步本地数据到后端 (不再需要，因为所有操作都直接写数据库)
      syncPaperAccountToBackend: async (accessToken, walletAddress) => {
        // 保留此函数以保持向后兼容，但不再主动使用
        console.log('[PaperTrading] syncPaperAccountToBackend is deprecated');
        return { success: true };
      },

      // 主题管理
      theme: 'light', // 'light' | 'dark'
      setTheme: (theme) => set({ theme: theme }),
      toggleTheme: () => set({ theme: get().theme === 'light' ? 'dark' : 'light' }),

      // 网络状态管理（由钱包网络决定）
      networkStatus: {
        isTestnet: null, // null = 未知，true = 测试网，false = 主网
        isMainnet: null,
        chainId: null,
        supported: false,
        displayName: ''
      },
      setNetworkStatus: (status) => set({ networkStatus: status }),
      
      // 保留为兼容性，但不再强制
      isSimulationMode: true, // 默认测试网，但可切换
      setIsSimulationMode: (value) => {
        // 主网确认
        if (!value) {
          const lang = get().language;
          const message = lang === 'zh'
            ? '⚠️ 切换到主网模式\n\n' +
              '这将使用真实资金进行交易。\n\n' +
              '重要提示：\n' +
              '• 本平台是教育学习工具，不提供投资建议\n' +
              '• 建议新用户先在测试网充分练习\n' +
              '• 加密货币交易存在高风险，可能损失全部资金\n' +
              '• 您对所有交易决策完全负责\n\n' +
              '是否继续？'
            : '⚠️ Switch to Mainnet Mode\n\n' +
              'This will use real funds for trading.\n\n' +
              'Important:\n' +
              '• This platform is an educational tool, not financial advice\n' +
              '• New users should practice on testnet first\n' +
              '• Crypto trading involves high risk, you may lose all funds\n' +
              '• You are fully responsible for all trading decisions\n\n' +
              'Continue?';
          const confirmed = window.confirm(message);
          if (!confirmed) return;
        }
        set({ isSimulationMode: value });
      },
      enableSimulationMode: () => set({ isSimulationMode: true }),
      enableLiveMode: () => get().setIsSimulationMode(false),

      showOnboarding: true,
      setShowOnboarding: (value) => set({ showOnboarding: Boolean(value) }),
      hideOnboarding: () => set({ showOnboarding: false }),

      // Landing Page 显示状态（首次访问显示）
      showLandingPage: true,
      setShowLandingPage: (value) => set({ showLandingPage: Boolean(value) }),
      hideLandingPage: () => set({ showLandingPage: false }),

      // Crypto Trading Sub-Tab State (持久化内部tab选择)
      cryptoSubTab: 'tradingPanel', // 'tradingPanel' | 'myTraders' | 'dashboard'
      setCryptoSubTab: (tab) => set({ cryptoSubTab: tab }),

      // Persist user's custom prompts per language
      customPrompts: { en: '', zh: '' },
      setCustomPromptForLanguage: (lang, value) =>
        set((state) => ({
          customPrompts: { ...state.customPrompts, [lang]: value || '' }
        })),
      clearCustomPromptForLanguage: (lang) =>
        set((state) => ({
          customPrompts: { ...state.customPrompts, [lang]: '' }
        })),

      // Persist user's Hyperliquid address
      userAddress: '',
      setUserAddress: (address) => set({ userAddress: String(address || '').trim() }),

      // Trading Panel - Auto Trading State (persist across tab switches)
      autoTradingEnabled: false,
      setAutoTradingEnabled: (value) => set({ autoTradingEnabled: Boolean(value) }),

      tradingInterval: 60, // minutes
      setTradingInterval: (value) => set({ tradingInterval: Number(value) || 60 }),

      nextRunTime: null, // 下次自动交易执行时间（ISO 8601字符串）
      setNextRunTime: (time) => set({ nextRunTime: time ? new Date(time).toISOString() : null }),

      tradingHistory: [],
      setTradingHistory: (history) => set({ tradingHistory: Array.isArray(history) ? history : [] }),
      addTradingRecord: (record) =>
        set((state) => ({
          tradingHistory: [record, ...state.tradingHistory].slice(0, 5) // Keep only latest 5
        })),

      // Auto Trading Config (from Dashboard)
      autoTradingConfig: {
        selectedAI: ['claude'],
        selectedCoins: ['BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'DOGE'],
        dataSources: {
          price: true,
          ema: true,
          macd: true,
          rsi: true,
          volume: true,
          funding: true,
          oi: false,
          liquidation: false,
          sentiment: false
        },
        riskPreference: 'balanced'
      },
      setAutoTradingConfig: (config) => set({ autoTradingConfig: config }),

      // Dashboard AI Analysis State (persist across tab switches)
      dashboardAnalyzing: false,
      setDashboardAnalyzing: (value) => set({ dashboardAnalyzing: Boolean(value) }),
      
      dashboardAiResults: null,
      setDashboardAiResults: (results) => set({ dashboardAiResults: results }),
      clearDashboardAiResults: () => set({ dashboardAiResults: null }),
      
      // Dashboard execution state
      dashboardExecuting: false,
      setDashboardExecuting: (value) => set({ dashboardExecuting: Boolean(value) }),
      
      dashboardExecutionResults: null,
      setDashboardExecutionResults: (results) => set({ dashboardExecutionResults: results }),

      // Trader Creation Draft (persist across tab switches)
      traderCreationDraft: null,
      traderCreationStep: 1,
      setTraderCreationDraft: (draft) => set({ traderCreationDraft: draft }),
      setTraderCreationStep: (step) => set({ traderCreationStep: step }),
      clearTraderCreationDraft: () => set({ traderCreationDraft: null, traderCreationStep: 1 }),

      // My Traders List (persist across tab switches)
      myTraders: [],
      myTradersInitialized: false, // 标记是否已经初始化过
      setMyTraders: (traders) => set({ myTraders: Array.isArray(traders) ? traders : [], myTradersInitialized: true }),
      addTrader: (trader) => set((state) => ({ myTraders: [...state.myTraders, trader] })),
      updateTrader: (id, updates) => set((state) => ({
        myTraders: state.myTraders.map(t => t.id === id ? { ...t, ...updates } : t)
      })),
      deleteTrader: (id) => set((state) => ({
        myTraders: state.myTraders.filter(t => t.id !== id)
      }))
    }),
    {
      name: 'prompttrading_app_store',
      version: 12, // v12: 添加 Pro Terminal 界面模式和布局管理
      onRehydrateStorage: () => (state) => {
        // Called when hydration is complete
        state?.setHasHydrated(true);
      },
      migrate: (persistedState, version) => {
        // 版本迁移：确保新字段有默认值
        if (version < 4) {
          persistedState.nextRunTime = null;
        }
        if (version < 5) {
          persistedState.tradingMode = 'hyperliquid';
        }
        if (version < 6) {
          // 如果是老用户（已有数据），不显示Landing Page
          persistedState.showLandingPage = false;
        }
        if (version < 7) {
          persistedState.cryptoSubTab = 'tradingPanel';
        }
        if (version < 8) {
          // Paper Trading 模拟盘默认值
          persistedState.isPaperTrading = true;
        }
        // v9, v10 的迁移逻辑不再需要，因为数据从数据库加载
        if (version < 11) {
          // v11: 清除 localStorage 中的旧 paper trading 数据
          // 这些数据现在从数据库加载
          delete persistedState.paperBalance;
          delete persistedState.paperPositions;
          delete persistedState.paperTradeHistory;
          delete persistedState.paperAnalysisHistory;
          console.log('[Migration] v11: Cleared localStorage paper trading data, will load from database');
        }
        if (version < 12) {
          // v12: Pro Terminal 界面模式
          persistedState.interfaceMode = 'standard';
          persistedState.currentProLayout = 'crypto';
          persistedState.savedProLayouts = {};
          console.log('[Migration] v12: Added Pro Terminal interface mode');
        }
        return persistedState;
      },
      partialize: (state) => ({
        language: state.language,
        tradingMode: state.tradingMode,
        // Pro Terminal 状态
        interfaceMode: state.interfaceMode,
        currentProLayout: state.currentProLayout,
        savedProLayouts: state.savedProLayouts,
        cryptoSubTab: state.cryptoSubTab,
        theme: state.theme,
        networkStatus: state.networkStatus,
        isSimulationMode: state.isSimulationMode, // 保留为兼容
        showOnboarding: state.showOnboarding,
        showLandingPage: state.showLandingPage,
        customPrompts: state.customPrompts,
        userAddress: state.userAddress,
        // Paper Trading - 只保存模式开关，数据从数据库加载
        isPaperTrading: state.isPaperTrading,
        // 注意：paperBalance, paperPositions, paperTradeHistory, paperAnalysisHistory
        // 不再持久化到 localStorage，而是从数据库加载
        // Trading Panel state
        autoTradingEnabled: state.autoTradingEnabled,
        tradingInterval: state.tradingInterval,
        nextRunTime: state.nextRunTime,
        tradingHistory: state.tradingHistory,
        autoTradingConfig: state.autoTradingConfig,
        // Dashboard state (persist across tab switches)
        // NOTE: dashboardAnalyzing and dashboardExecuting are NOT persisted
        // because they are temporary loading states that should reset on page refresh
        dashboardAiResults: state.dashboardAiResults,
        dashboardExecutionResults: state.dashboardExecutionResults,
        // Trader creation draft (persist across tab switches)
        traderCreationDraft: state.traderCreationDraft,
        traderCreationStep: state.traderCreationStep,
        // My Traders list (persist across tab switches)
        myTraders: state.myTraders,
        myTradersInitialized: state.myTradersInitialized
      })
    }
  )
);
