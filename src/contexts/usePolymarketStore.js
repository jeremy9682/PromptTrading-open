import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { polymarketAPI, paperTradingAPI } from '../utils/api';
import { useAppStore } from './useAppStore';

/**
 * Polymarket 状态管理
 * 后端优先策略：登录后从后端加载数据，操作同步到后端
 *
 * 支持模拟盘/实盘独立数据：
 * - 实盘: watchlist, traders (同步到后端)
 * - 模拟盘: paperWatchlist, paperTraders (仅本地存储)
 */

/**
 * 获取当前交易模式
 */
const getIsPaperTrading = () => {
  return useAppStore.getState().isPaperTrading;
};

export const usePolymarketStore = create(
  persist(
    (set, get) => ({
      // ============================================
      // 认证状态
      // ============================================
      isAuthenticated: false,
      accessToken: null,
      walletAddress: null,
      isLoading: false,
      lastSyncTime: null,

      // ============================================
      // 配额错误状态
      // ============================================
      quotaError: null, // { type: 'WATCHLIST' | 'TRADERS' | 'ACTIVE_TRADERS', message: string, limit: number }

      /**
       * 设置配额错误（用于显示弹窗）
       */
      setQuotaError: (error) => {
        set({ quotaError: error });
      },

      /**
       * 清除配额错误
       */
      clearQuotaError: () => {
        set({ quotaError: null });
      },

      /**
       * 设置认证信息
       */
      setAuth: (accessToken, walletAddress) => {
        set({
          isAuthenticated: !!accessToken,
          accessToken,
          walletAddress
        });
      },

      /**
       * 清除认证信息
       */
      clearAuth: () => {
        set({
          isAuthenticated: false,
          accessToken: null,
          walletAddress: null
        });
      },

      // ============================================
      // Watchlist 状态 (实盘)
      // ============================================
      watchlist: [], // 事件 ID 数组

      // ============================================
      // Paper Watchlist 状态 (模拟盘)
      // ============================================
      paperWatchlist: [], // 模拟盘关注列表

      /**
       * 从后端加载 Watchlist
       */
      loadWatchlist: async () => {
        const { accessToken, walletAddress, isAuthenticated } = get();

        if (!isAuthenticated || !accessToken) {
          console.log('Not authenticated, using local watchlist');
          return;
        }

        try {
          set({ isLoading: true });
          const response = await polymarketAPI.getWatchlist(accessToken, walletAddress);

          if (response.success) {
            const eventIds = response.data.map(item => item.eventId);
            set({
              watchlist: eventIds,
              lastSyncTime: Date.now()
            });
            console.log('Watchlist loaded from backend:', eventIds.length, 'items');
          }
        } catch (error) {
          console.error('Failed to load watchlist:', error);
        } finally {
          set({ isLoading: false });
        }
      },

      /**
       * 添加到关注列表
       */
      addToWatchlist: async (eventId) => {
        const { accessToken, walletAddress, isAuthenticated, watchlist, setQuotaError } = get();

        // 先更新本地状态（乐观更新）
        if (!watchlist.includes(eventId)) {
          set({ watchlist: [...watchlist, eventId] });
        }

        // 如果已认证，同步到后端
        if (isAuthenticated && accessToken) {
          try {
            await polymarketAPI.addToWatchlist(eventId, accessToken, walletAddress);
            console.log('Added to watchlist (synced):', eventId);
          } catch (error) {
            console.error('Failed to sync add to watchlist:', error);
            // 回滚本地状态
            set({ watchlist: watchlist });

            // 检查是否是配额错误
            if (error.code === 'QUOTA_EXCEEDED' || error.message?.includes('上限')) {
              setQuotaError({
                type: 'WATCHLIST',
                message: error.message || '关注列表已达上限 (20 个)',
                limit: error.limit || 20,
                current: error.current
              });
            }
          }
        }
      },

      /**
       * 从关注列表移除
       */
      removeFromWatchlist: async (eventId) => {
        const { accessToken, walletAddress, isAuthenticated, watchlist } = get();

        // 先更新本地状态（乐观更新）
        const newWatchlist = watchlist.filter(id => id !== eventId);
        set({ watchlist: newWatchlist });

        // 如果已认证，同步到后端
        if (isAuthenticated && accessToken) {
          try {
            await polymarketAPI.removeFromWatchlist(eventId, accessToken, walletAddress);
            console.log('Removed from watchlist (synced):', eventId);
          } catch (error) {
            console.error('Failed to sync remove from watchlist:', error);
            // 回滚本地状态
            set({ watchlist: watchlist });
          }
        }
      },

      /**
       * 同步整个关注列表到后端
       */
      syncWatchlistToBackend: async () => {
        const { accessToken, walletAddress, isAuthenticated, watchlist } = get();

        if (!isAuthenticated || !accessToken) {
          console.log('Not authenticated, cannot sync watchlist');
          return;
        }

        try {
          set({ isLoading: true });
          await polymarketAPI.syncWatchlist(watchlist, accessToken, walletAddress);
          set({ lastSyncTime: Date.now() });
          console.log('Watchlist synced to backend');
        } catch (error) {
          console.error('Failed to sync watchlist:', error);
        } finally {
          set({ isLoading: false });
        }
      },

      // ============================================
      // Paper Watchlist 操作 (模拟盘 - 仅本地存储)
      // ============================================

      /**
       * 添加到模拟盘关注列表
       */
      addToPaperWatchlist: (eventId) => {
        const { paperWatchlist } = get();
        if (!paperWatchlist.includes(eventId)) {
          set({ paperWatchlist: [...paperWatchlist, eventId] });
          console.log('Added to paper watchlist:', eventId);
        }
      },

      /**
       * 从模拟盘关注列表移除
       */
      removeFromPaperWatchlist: (eventId) => {
        const { paperWatchlist } = get();
        set({ paperWatchlist: paperWatchlist.filter(id => id !== eventId) });
        console.log('Removed from paper watchlist:', eventId);
      },

      /**
       * 获取当前模式的 Watchlist
       * 根据 isPaperTrading 返回对应的关注列表
       */
      getCurrentWatchlist: () => {
        const isPaper = getIsPaperTrading();
        return isPaper ? get().paperWatchlist : get().watchlist;
      },

      /**
       * 检查事件是否在当前模式的关注列表中
       */
      isInCurrentWatchlist: (eventId) => {
        const isPaper = getIsPaperTrading();
        const list = isPaper ? get().paperWatchlist : get().watchlist;
        return list.includes(eventId);
      },

      /**
       * 添加到当前模式的关注列表
       */
      addToCurrentWatchlist: async (eventId) => {
        const isPaper = getIsPaperTrading();
        if (isPaper) {
          get().addToPaperWatchlist(eventId);
        } else {
          await get().addToWatchlist(eventId);
        }
      },

      /**
       * 从当前模式的关注列表移除
       */
      removeFromCurrentWatchlist: async (eventId) => {
        const isPaper = getIsPaperTrading();
        if (isPaper) {
          get().removeFromPaperWatchlist(eventId);
        } else {
          await get().removeFromWatchlist(eventId);
        }
      },

      // ============================================
      // Traders 状态 (实盘)
      // ============================================
      traders: [],

      /**
       * 从后端加载 Traders
       */
      loadTraders: async () => {
        const { accessToken, walletAddress, isAuthenticated } = get();

        if (!isAuthenticated || !accessToken) {
          console.log('Not authenticated, using local traders');
          return;
        }

        try {
          set({ isLoading: true });
          const response = await polymarketAPI.getTraders(accessToken, walletAddress);

          if (response.success) {
            // 过滤掉任何 isPaper: true 的 trader（确保实盘和模拟盘完全分离）
            const liveTraders = (response.data || []).filter(t => !t.isPaper);
            set({
              traders: liveTraders,
              lastSyncTime: Date.now()
            });
            console.log('Traders loaded from backend:', liveTraders.length, 'items (filtered out paper traders)');
          }
        } catch (error) {
          console.error('Failed to load traders:', error);
        } finally {
          set({ isLoading: false });
        }
      },

      /**
       * 创建 Trader
       * 🔒 安全限制：必须登录才能创建 Trader
       */
      createTrader: async (traderData) => {
        const { accessToken, walletAddress, isAuthenticated, traders, setQuotaError } = get();

        // 🔒 必须登录才能创建 Trader
        if (!isAuthenticated || !accessToken) {
          const error = new Error('请先登录后再创建 Trader');
          error.code = 'LOGIN_REQUIRED';
          throw error;
        }

        try {
          set({ isLoading: true });
          const response = await polymarketAPI.createTrader(traderData, accessToken, walletAddress);

          if (response.success) {
            set({ traders: [...traders, response.data] });
            console.log('Trader created (synced):', response.data.id);
            return response.data;
          }
        } catch (error) {
          console.error('Failed to create trader:', error);

          // 检查是否是配额错误
          if (error.code === 'QUOTA_EXCEEDED' || error.message?.includes('上限')) {
            if (error.message?.includes('Trader 数量') || error.message?.includes('maxTraders')) {
              setQuotaError({
                type: 'TRADERS',
                message: error.message || 'Trader 数量已达上限 (3 个)',
                limit: error.limit || 3,
                current: error.current
              });
            } else if (error.message?.includes('同时运行') || error.message?.includes('Active')) {
              setQuotaError({
                type: 'ACTIVE_TRADERS',
                message: error.message || '同时运行的 Trader 已达上限 (2 个)',
                limit: error.limit || 2,
                current: error.current
              });
            } else {
              // 默认当作 Trader 数量限制
              setQuotaError({
                type: 'TRADERS',
                message: error.message || 'Trader 数量已达上限',
                limit: error.limit || 3,
                current: error.current
              });
            }
          }
          throw error;
        } finally {
          set({ isLoading: false });
        }
      },

      /**
       * 更新 Trader
       */
      updateTrader: async (traderId, updates) => {
        const { accessToken, walletAddress, isAuthenticated, traders, setQuotaError } = get();

        // 先更新本地状态（乐观更新）
        const updatedTraders = traders.map(trader =>
          trader.id === traderId ? { ...trader, ...updates } : trader
        );
        set({ traders: updatedTraders });

        // 如果已认证，同步到后端
        if (isAuthenticated && accessToken) {
          try {
            const response = await polymarketAPI.updateTrader(traderId, updates, accessToken, walletAddress);

            if (response.success) {
              // 用后端返回的数据更新
              const finalTraders = traders.map(trader =>
                trader.id === traderId ? response.data : trader
              );
              set({ traders: finalTraders });
              console.log('Trader updated (synced):', traderId);
            }
          } catch (error) {
            console.error('Failed to sync update trader:', error);
            // 回滚本地状态
            set({ traders: traders });

            // 检查是否是配额错误
            if (error.code === 'QUOTA_EXCEEDED' || error.message?.includes('上限')) {
              if (error.message?.includes('同时运行') || error.message?.includes('Active')) {
                setQuotaError({
                  type: 'ACTIVE_TRADERS',
                  message: error.message || '同时运行的 Trader 已达上限 (2 个)',
                  limit: error.limit || 2,
                  current: error.current
                });
              }
            }
          }
        }
      },

      /**
       * 删除 Trader
       */
      deleteTrader: async (traderId) => {
        const { accessToken, walletAddress, isAuthenticated, traders } = get();

        // 先更新本地状态（乐观更新）
        const newTraders = traders.filter(trader => trader.id !== traderId);
        set({ traders: newTraders });

        // 如果已认证，同步到后端
        if (isAuthenticated && accessToken) {
          try {
            await polymarketAPI.deleteTrader(traderId, accessToken, walletAddress);
            console.log('Trader deleted (synced):', traderId);
          } catch (error) {
            console.error('Failed to sync delete trader:', error);
            // 回滚本地状态
            set({ traders: traders });
          }
        }
      },

      /**
       * 同步所有 Traders 到后端
       */
      syncTradersToBackend: async () => {
        const { accessToken, walletAddress, isAuthenticated, traders } = get();

        if (!isAuthenticated || !accessToken) {
          console.log('Not authenticated, cannot sync traders');
          return;
        }

        try {
          set({ isLoading: true });
          await polymarketAPI.syncTraders(traders, accessToken, walletAddress);
          set({ lastSyncTime: Date.now() });
          console.log('Traders synced to backend');
        } catch (error) {
          console.error('Failed to sync traders:', error);
        } finally {
          set({ isLoading: false });
        }
      },

      // ============================================
      // Paper Traders 状态 (模拟盘 - 独立数据库存储)
      // ============================================
      paperTraders: [],

      /**
       * 从后端加载模拟盘 Traders（独立的数据库表）
       * 后端不可用时静默使用 localStorage 中的数据
       */
      loadPaperTraders: async () => {
        const { accessToken, walletAddress, isAuthenticated } = get();

        if (!isAuthenticated || !accessToken) {
          console.log('📝 [Paper] Not authenticated, using local paper traders');
          return;
        }

        try {
          set({ isLoading: true });
          const response = await paperTradingAPI.getTraders(accessToken, walletAddress);

          if (response.success) {
            // Map assignedEvents to eventIds for frontend compatibility
            const traders = (response.data || []).map(trader => ({
              ...trader,
              eventIds: trader.assignedEvents || trader.eventIds || []
            }));
            set({
              paperTraders: traders,
              lastSyncTime: Date.now()
            });
            console.log('📝 [Paper] Traders loaded from backend:', traders.length, 'items');
          }
        } catch (error) {
          // 404 等错误时静默使用 localStorage（zustand persist 会自动恢复）
          console.log('📝 [Paper] Backend unavailable, using localStorage');
        } finally {
          set({ isLoading: false });
        }
      },

      /**
       * 创建模拟盘 Trader
       * 优先保存到后端独立数据库，失败时回退到本地 localStorage
       */
      createPaperTrader: async (traderData) => {
        const { accessToken, walletAddress, isAuthenticated, paperTraders, setQuotaError } = get();

        // 如果已认证，优先使用后端创建
        if (isAuthenticated && accessToken) {
          try {
            set({ isLoading: true });
            const response = await paperTradingAPI.createTrader(traderData, accessToken, walletAddress);

            if (response.success) {
              // Map assignedEvents to eventIds for frontend compatibility
              const newTrader = {
                ...response.data,
                eventIds: response.data.assignedEvents || response.data.eventIds || []
              };
              set({ paperTraders: [...paperTraders, newTrader] });
              console.log('📝 [Paper] Trader created (synced to backend):', newTrader.id);
              return newTrader;
            }
          } catch (error) {
            console.error('📝 [Paper] Failed to create trader on backend:', error);

            // 检查是否是配额错误（这种情况不应该回退到本地）
            if (error.code === 'QUOTA_EXCEEDED' || error.message?.includes('上限')) {
              setQuotaError({
                type: 'PAPER_TRADERS',
                message: error.message || '模拟盘 Trader 数量已达上限',
                limit: error.limit || 3,
                current: error.current
              });
              throw error;
            }
            // 其他错误（如 404）回退到本地存储
            console.log('📝 [Paper] Falling back to localStorage...');
          } finally {
            set({ isLoading: false });
          }
        }

        // 回退：保存到本地 localStorage
        const newTrader = {
          ...traderData,
          id: `paper-trader-${Date.now()}`,
          createdAt: new Date().toISOString(),
          isPaper: true
        };
        set({ paperTraders: [...paperTraders, newTrader] });
        console.log('📝 [Paper] Trader created locally:', newTrader.id);
        return newTrader;
      },

      /**
       * 更新模拟盘 Trader
       * 优先同步到后端，失败时保留本地更新（不回滚）
       */
      updatePaperTrader: async (traderId, updates) => {
        const { accessToken, walletAddress, isAuthenticated, paperTraders } = get();

        // 先更新本地状态
        const updatedTraders = paperTraders.map(trader =>
          trader.id === traderId ? { ...trader, ...updates } : trader
        );
        set({ paperTraders: updatedTraders });

        // 如果已认证，尝试同步到后端
        if (isAuthenticated && accessToken) {
          try {
            const response = await paperTradingAPI.updateTrader(traderId, updates, accessToken, walletAddress);

            if (response.success) {
              // Map assignedEvents to eventIds for frontend compatibility
              const updatedTrader = {
                ...response.data,
                eventIds: response.data.assignedEvents || response.data.eventIds || []
              };
              const finalTraders = updatedTraders.map(trader =>
                trader.id === traderId ? updatedTrader : trader
              );
              set({ paperTraders: finalTraders });
              console.log('📝 [Paper] Trader updated (synced to backend):', traderId);
            }
          } catch (error) {
            // 后端失败时不回滚，保留本地更新
            console.warn('📝 [Paper] Backend sync failed, keeping local update:', traderId);
          }
        } else {
          console.log('📝 [Paper] Trader updated locally:', traderId);
        }
      },

      /**
       * 删除模拟盘 Trader
       * 优先同步到后端，失败时保留本地删除（不回滚）
       */
      deletePaperTrader: async (traderId) => {
        const { accessToken, walletAddress, isAuthenticated, paperTraders } = get();

        // 先更新本地状态
        const newTraders = paperTraders.filter(trader => trader.id !== traderId);
        set({ paperTraders: newTraders });

        // 如果已认证，尝试同步到后端
        if (isAuthenticated && accessToken) {
          try {
            await paperTradingAPI.deleteTrader(traderId, accessToken, walletAddress);
            console.log('📝 [Paper] Trader deleted (synced to backend):', traderId);
          } catch (error) {
            // 后端失败时不回滚，保留本地删除
            console.warn('📝 [Paper] Backend sync failed, keeping local delete:', traderId);
          }
        } else {
          console.log('📝 [Paper] Trader deleted locally:', traderId);
        }
      },

      /**
       * 获取当前模式的 Traders
       */
      getCurrentTraders: () => {
        const isPaper = getIsPaperTrading();
        return isPaper ? get().paperTraders : get().traders;
      },

      /**
       * 创建当前模式的 Trader
       */
      createCurrentTrader: async (traderData) => {
        const isPaper = getIsPaperTrading();
        if (isPaper) {
          return await get().createPaperTrader(traderData);
        } else {
          return await get().createTrader(traderData);
        }
      },

      /**
       * 更新当前模式的 Trader
       */
      updateCurrentTrader: async (traderId, updates) => {
        const isPaper = getIsPaperTrading();
        if (isPaper) {
          get().updatePaperTrader(traderId, updates);
        } else {
          await get().updateTrader(traderId, updates);
        }
      },

      /**
       * 删除当前模式的 Trader
       */
      deleteCurrentTrader: async (traderId) => {
        const isPaper = getIsPaperTrading();
        if (isPaper) {
          get().deletePaperTrader(traderId);
        } else {
          await get().deleteTrader(traderId);
        }
      },

      // ============================================
      // 通用操作
      // ============================================

      /**
       * 初始化：从后端加载所有数据（实盘和模拟盘分别加载）
       */
      initialize: async (accessToken, walletAddress) => {
        set({
          isAuthenticated: !!accessToken,
          accessToken,
          walletAddress,
          isLoading: true
        });

        if (accessToken) {
          try {
            // 并行加载 watchlist, traders 和 paper traders
            await Promise.all([
              get().loadWatchlist(),
              get().loadTraders(),
              get().loadPaperTraders() // 从独立的数据库表加载模拟盘 traders
            ]);
          } catch (error) {
            console.error('Failed to initialize:', error);
          }
        }

        set({ isLoading: false });
      },

      /**
       * 重置所有状态
       */
      reset: () => {
        set({
          isAuthenticated: false,
          accessToken: null,
          walletAddress: null,
          isLoading: false,
          lastSyncTime: null,
          watchlist: [],
          traders: [],
          paperWatchlist: [],
          paperTraders: [],
        });
      },
    }),
    {
      name: 'polymarket-storage',
      partialize: (state) => ({
        // 只持久化数据，不持久化认证信息
        // 实盘数据
        watchlist: state.watchlist,
        traders: state.traders,
        lastSyncTime: state.lastSyncTime,
        // 模拟盘数据
        paperWatchlist: state.paperWatchlist,
        paperTraders: state.paperTraders,
      }),
    }
  )
);
