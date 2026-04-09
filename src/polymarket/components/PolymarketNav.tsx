import { useLocation, useNavigate } from 'react-router-dom';
import { Store, Star, TrendingUp } from 'lucide-react';
import { usePolymarketStore } from '../../contexts/usePolymarketStore';
import { useAppStore } from '../../contexts/useAppStore';
import { translations } from '../../constants/translations';

export function PolymarketNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const language = useAppStore((state) => state.language);
  const isPaperTrading = useAppStore((state) => state.isPaperTrading);

  // 实盘数据
  const watchlist = usePolymarketStore((state) => state.watchlist);
  const traders = usePolymarketStore((state) => state.traders);

  // 模拟盘数据
  const paperWatchlist = usePolymarketStore((state) => state.paperWatchlist);
  const paperTraders = usePolymarketStore((state) => state.paperTraders);

  // 根据当前模式选择数据
  const currentWatchlist = isPaperTrading ? paperWatchlist : watchlist;
  const currentTraders = isPaperTrading ? paperTraders : traders;

  const t = translations[language]?.polymarketPage?.nav || translations.en.polymarketPage.nav;

  const navItems = [
    {
      path: '/markets',
      icon: Store,
      label: t.eventMarket,
      count: null,
    },
    {
      path: '/watchlist',
      icon: Star,
      label: t.myWatchlist,
      count: currentWatchlist.length,
    },
    {
      path: '/traders',
      icon: TrendingUp,
      label: t.myTraders,
      count: currentTraders.length,
    },
  ];

  const isActive = (path: string) => location.pathname === path;

  return (
    <div className="flex justify-center mb-6">
      <div className="grid grid-cols-3 w-fit h-12 bg-gray-100 dark:bg-gray-800/70 p-1 rounded-lg shadow-sm">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.path);
          
          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={`flex items-center gap-2 px-6 rounded-md transition-all ${
                active
                  ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{item.label}</span>
              {item.count !== null && item.count > 0 && (
                <span className="ml-1.5 text-xs font-semibold">
                  {item.count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

