import { EventMarket } from '../components/EventMarket';
import { PolymarketNav } from '../components/PolymarketNav';
import { usePolymarketStore } from '../../contexts/usePolymarketStore';
import { useAppStore } from '../../contexts/useAppStore';

export function MarketsPage() {
  const language = useAppStore((state) => state.language);
  const isPaperTrading = useAppStore((state) => state.isPaperTrading);

  // 实盘数据
  const watchlist = usePolymarketStore((state) => state.watchlist);
  const addToWatchlist = usePolymarketStore((state) => state.addToWatchlist);
  const removeFromWatchlist = usePolymarketStore((state) => state.removeFromWatchlist);

  // 模拟盘数据
  const paperWatchlist = usePolymarketStore((state) => state.paperWatchlist);
  const addToPaperWatchlist = usePolymarketStore((state) => state.addToPaperWatchlist);
  const removeFromPaperWatchlist = usePolymarketStore((state) => state.removeFromPaperWatchlist);

  // 根据当前模式选择数据
  const currentWatchlist = isPaperTrading ? paperWatchlist : watchlist;
  const handleAdd = isPaperTrading ? addToPaperWatchlist : addToWatchlist;
  const handleRemove = isPaperTrading ? removeFromPaperWatchlist : removeFromWatchlist;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
      <div className="container mx-auto px-4 py-6">
        <PolymarketNav />
        <EventMarket
          watchlist={currentWatchlist}
          onAddToWatchlist={handleAdd}
          onRemoveFromWatchlist={handleRemove}
          language={language}
        />
      </div>
    </div>
  );
}

