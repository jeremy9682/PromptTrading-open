import { useNavigate, useParams } from 'react-router-dom';
import { TraderDetail } from '../components/TraderDetailNew';
import { usePolymarketStore } from '../../contexts/usePolymarketStore';
import { useAppStore } from '../../contexts/useAppStore';
import { translations } from '../../constants/translations';

export function TraderDetailPage() {
  const navigate = useNavigate();
  const language = useAppStore((state) => state.language);
  const isPaperTrading = useAppStore((state) => state.isPaperTrading);
  const t = translations[language]?.polymarketPage?.tradersOverview || translations.en.polymarketPage.tradersOverview;
  const { traderId } = useParams<{ traderId: string }>();

  // 实盘数据
  const traders = usePolymarketStore((state) => state.traders);
  const updateTrader = usePolymarketStore((state) => state.updateTrader);

  // 模拟盘数据
  const paperTraders = usePolymarketStore((state) => state.paperTraders);
  const updatePaperTrader = usePolymarketStore((state) => state.updatePaperTrader);

  // 根据当前模式选择数据
  const currentTraders = isPaperTrading ? paperTraders : traders;
  const handleUpdate = isPaperTrading ? updatePaperTrader : updateTrader;

  const trader = currentTraders.find((t) => t.id === traderId);

  if (!trader) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
        <div className="container mx-auto px-4 py-6">
          <div className="text-center py-12">
            <h2 className="text-2xl font-bold mb-4">
              {language === 'zh' ? 'Trader 不存在' : 'Trader not found'}
            </h2>
            <button
              onClick={() => navigate('/traders')}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              {language === 'zh' ? '返回 Traders 列表' : 'Back to Traders'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
      <div className="container mx-auto px-4 py-6">
        <TraderDetail
          trader={trader}
          onBack={() => navigate('/traders')}
          onUpdate={(updates) => handleUpdate(trader.id, updates)}
          language={language}
        />
      </div>
    </div>
  );
}

