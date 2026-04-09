import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Brain, TrendingUp, Star, Store } from 'lucide-react';

import { TradersOverview } from './components/TradersOverview';
import { TraderDetail } from './components/TraderDetailNew';
import { EventMarket } from './components/EventMarket';
import { MyWatchlist } from './components/MyWatchlist';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from './components/ui/tabs';
import { Badge } from './components/ui/badge';
import { useAppStore } from '../contexts/useAppStore';
import { translations } from '../constants/translations';

export function PolymarketDashboard() {
  const language = useAppStore((state) => state.language);
  const t = translations[language]?.polymarketPage || translations.en.polymarketPage;
  const [searchParams, setSearchParams] = useSearchParams();
  
  // 从 URL 读取参数
  const activeTab = searchParams.get('tab') || 'market';
  const traderIdFromUrl = searchParams.get('trader');
  
  const [watchlist, setWatchlist] = useState(['1', '3']);
  const [traders, setTraders] = useState([]);
  const [selectedTraderId, setSelectedTraderId] = useState<string | null>(traderIdFromUrl);

  const selectedTrader = traders.find((t) => t.id === selectedTraderId);

  const addToWatchlist = (eventId) => {
    if (!watchlist.includes(eventId)) {
      setWatchlist((prev) => [...prev, eventId]);
    }
  };

  const removeFromWatchlist = (eventId) => {
    setWatchlist((prev) => prev.filter((id) => id !== eventId));
  };

  const updateTrader = (traderId, updates) => {
    setTraders((prev) =>
      prev.map((trader) =>
        trader.id === traderId ? { ...trader, ...updates } : trader,
      ),
    );
  };

  const createTrader = (trader) => {
    setTraders((prev) => [...prev, trader]);
    setSearchParams({ tab: 'traders' });
  };

  const deleteTrader = (traderId) => {
    setTraders((prev) => prev.filter((trader) => trader.id !== traderId));
    if (selectedTraderId === traderId) {
      setSelectedTraderId(null);
    }
  };

  const handleSelectTrader = (traderId) => {
    setSelectedTraderId(traderId);
    setSearchParams({ tab: 'traders', trader: traderId });
  };
  
  const handleBackFromTrader = () => {
    setSelectedTraderId(null);
    // 移除 trader 参数，保留 tab 参数
    const newParams = new URLSearchParams(searchParams);
    newParams.delete('trader');
    setSearchParams(newParams);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
      <div className="container mx-auto px-4 py-6">
        {selectedTrader ? (
          <TraderDetail
            trader={selectedTrader}
            onBack={handleBackFromTrader}
            onUpdate={(updates) => updateTrader(selectedTrader.id, updates)}
          />
        ) : (
          <Tabs value={activeTab} onValueChange={(value) => setSearchParams({ tab: value })} className="space-y-6">
            <div className="flex justify-center mb-6">
              <TabsList className="grid w-fit grid-cols-3 h-12 bg-gray-100 dark:bg-gray-800/70 p-1 rounded-lg shadow-sm">
              <TabsTrigger value="market" className="flex items-center gap-2 px-6 data-[state=active]:bg-white data-[state=active]:text-gray-900 data-[state=active]:shadow-sm text-gray-600 dark:text-gray-400 dark:data-[state=active]:bg-gray-700 dark:data-[state=active]:text-white">
                <Store className="w-4 h-4" />
                <span>{t.nav.eventMarket}</span>
              </TabsTrigger>
              <TabsTrigger value="watchlist" className="flex items-center gap-2 px-6 relative data-[state=active]:bg-white data-[state=active]:text-gray-900 data-[state=active]:shadow-sm text-gray-600 dark:text-gray-400 dark:data-[state=active]:bg-gray-700 dark:data-[state=active]:text-white">
                <Star className="w-4 h-4" />
                <span>{t.nav.myWatchlist}</span>
                {watchlist.length > 0 && (
                  <span className="ml-1.5 text-xs font-semibold">
                    {watchlist.length}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="traders" className="flex items-center gap-2 px-6 relative data-[state=active]:bg-white data-[state=active]:text-gray-900 data-[state=active]:shadow-sm text-gray-600 dark:text-gray-400 dark:data-[state=active]:bg-gray-700 dark:data-[state=active]:text-white">
                <TrendingUp className="w-4 h-4" />
                <span>{t.nav.myTraders}</span>
                {traders.length > 0 && (
                  <span className="ml-1.5 text-xs font-semibold">
                    {traders.length}
                  </span>
                )}
              </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="market" className="space-y-6">
              <EventMarket
                watchlist={watchlist}
                onAddToWatchlist={addToWatchlist}
                onRemoveFromWatchlist={removeFromWatchlist}
                language={language}
              />
            </TabsContent>

            <TabsContent value="watchlist" className="space-y-6">
              <MyWatchlist
                watchlist={watchlist}
                onRemoveFromWatchlist={removeFromWatchlist}
                onCreateTrader={(trader) => {
                  createTrader(trader); // Save the trader first
                  // createTrader already navigates to traders tab
                }}
                traders={traders}
                language={language}
              />
            </TabsContent>

            <TabsContent value="traders" className="space-y-6">
              <TradersOverview
                traders={traders}
                onSelectTrader={handleSelectTrader}
                onCreateTrader={createTrader}
                onDeleteTrader={deleteTrader}
                watchlist={watchlist}
                language={language}
              />
            </TabsContent>
          </Tabs>
        )}
      </div>
    </div>
  );
}

export default PolymarketDashboard;

