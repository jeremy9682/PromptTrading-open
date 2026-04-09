import { useNavigate } from 'react-router-dom';
import { TradersOverview } from '../components/TradersOverview';
import { PolymarketNav } from '../components/PolymarketNav';
import { usePolymarketStore } from '../../contexts/usePolymarketStore';
import { useAppStore } from '../../contexts/useAppStore';

export function TradersPage() {
  const navigate = useNavigate();
  const language = useAppStore((state) => state.language);
  const isPaperTrading = useAppStore((state) => state.isPaperTrading);

  // 实盘数据
  const traders = usePolymarketStore((state) => state.traders);
  const createTrader = usePolymarketStore((state) => state.createTrader);
  const deleteTrader = usePolymarketStore((state) => state.deleteTrader);
  const watchlist = usePolymarketStore((state) => state.watchlist);

  // 模拟盘数据
  const paperTraders = usePolymarketStore((state) => state.paperTraders);
  const createPaperTrader = usePolymarketStore((state) => state.createPaperTrader);
  const deletePaperTrader = usePolymarketStore((state) => state.deletePaperTrader);
  const paperWatchlist = usePolymarketStore((state) => state.paperWatchlist);

  const isAuthenticated = usePolymarketStore((state) => state.isAuthenticated);

  // 根据当前模式选择数据
  const currentTraders = isPaperTrading ? paperTraders : traders;
  const currentWatchlist = isPaperTrading ? paperWatchlist : watchlist;
  const handleCreate = isPaperTrading ? createPaperTrader : createTrader;
  const handleDelete = isPaperTrading ? deletePaperTrader : deleteTrader;

  const handleSelectTrader = (traderId: string) => {
    navigate(`/traders/${traderId}`);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
      <div className="container mx-auto px-4 py-6">
        <PolymarketNav />
        <TradersOverview
          traders={currentTraders}
          onSelectTrader={handleSelectTrader}
          onCreateTrader={handleCreate}
          onDeleteTrader={handleDelete}
          watchlist={currentWatchlist}
          isAuthenticated={isAuthenticated}
          language={language}
        />
      </div>
    </div>
  );
}

