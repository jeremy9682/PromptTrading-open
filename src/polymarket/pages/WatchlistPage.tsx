import { useNavigate } from 'react-router-dom';
import { MyWatchlist } from '../components/MyWatchlist';
import { PolymarketNav } from '../components/PolymarketNav';
import { usePolymarketStore } from '../../contexts/usePolymarketStore';
import { useAppStore } from '../../contexts/useAppStore';

export function WatchlistPage() {
  const navigate = useNavigate();
  const language = useAppStore((state) => state.language);
  const isPaperTrading = useAppStore((state) => state.isPaperTrading);

  // 实盘数据
  const watchlist = usePolymarketStore((state) => state.watchlist);
  const removeFromWatchlist = usePolymarketStore((state) => state.removeFromWatchlist);
  const traders = usePolymarketStore((state) => state.traders);
  const createTrader = usePolymarketStore((state) => state.createTrader);

  // 模拟盘数据
  const paperWatchlist = usePolymarketStore((state) => state.paperWatchlist);
  const removeFromPaperWatchlist = usePolymarketStore((state) => state.removeFromPaperWatchlist);
  const paperTraders = usePolymarketStore((state) => state.paperTraders);
  const createPaperTrader = usePolymarketStore((state) => state.createPaperTrader);

  const isAuthenticated = usePolymarketStore((state) => state.isAuthenticated);

  // 根据当前模式选择数据
  const currentWatchlist = isPaperTrading ? paperWatchlist : watchlist;
  const currentTraders = isPaperTrading ? paperTraders : traders;
  const handleRemove = isPaperTrading ? removeFromPaperWatchlist : removeFromWatchlist;
  const handleCreateTrader = isPaperTrading ? createPaperTrader : createTrader;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
      <div className="container mx-auto px-4 py-6">
        <PolymarketNav />
        <MyWatchlist
          watchlist={currentWatchlist}
          onRemoveFromWatchlist={handleRemove}
          onCreateTrader={(trader) => {
            handleCreateTrader(trader); // Save the trader
            navigate('/traders'); // Then navigate
          }}
          traders={currentTraders}
          isAuthenticated={isAuthenticated}
          language={language}
        />
      </div>
    </div>
  );
}

