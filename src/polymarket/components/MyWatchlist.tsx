import { Card } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { 
  Star, 
  Trash2, 
  TrendingUp,
  Brain,
  ArrowRight,
  Sparkles,
  Loader2,
  Activity,
  Zap,
  PlusCircle,
  CheckSquare,
  Square,
  Layers,
  Info
} from 'lucide-react';
import { PolymarketEvent, Trader, UnifiedMarketEvent } from '../types';
import { useState, useEffect } from 'react';
import { CreateTraderDialog } from './CreateTraderDialogAdvanced';
import { marketService } from '../../services/markets/marketService';
import { EventDetailDialog } from './EventDetailDialog';
import { translations } from '../../constants/translations';

interface MyWatchlistProps {
  watchlist: string[];
  onRemoveFromWatchlist: (eventId: string) => void;
  onCreateTrader: (trader: Trader) => void;
  traders: Trader[];
  isAuthenticated?: boolean;
  language?: 'zh' | 'en';
}

export function MyWatchlist({ 
  watchlist, 
  onRemoveFromWatchlist,
  onCreateTrader,
  traders,
  isAuthenticated = false,
  language = 'zh'
}: MyWatchlistProps) {
  const t = translations[language]?.polymarketPage?.watchlist || translations.en.polymarketPage.watchlist;
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [allEvents, setAllEvents] = useState<PolymarketEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPendingEventIds, setSelectedPendingEventIds] = useState<string[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<PolymarketEvent | null>(null);

  // 从 API 加载事件数据
  useEffect(() => {
    const loadEvents = async () => {
      setLoading(true);
      try {
        // 加载足够多的事件以涵盖 watchlist
        const events = await marketService.getActiveMarkets(false, 200, 0);
        setAllEvents(events);
      } catch (error) {
        console.error('Failed to load events for watchlist:', error);
      } finally {
        setLoading(false);
      }
    };

    loadEvents();
  }, []);

  // 辅助函数：判断是否为旧版本的测试数据 ID
  const isLegacyTestId = (id: string) => {
    // 旧测试数据：纯数字且长度很短（如 '1', '2', '10' 等）
    return /^\d{1,2}$/.test(id);
  };

  // 1. Filter valid events (排除旧测试数据)
  const validWatchlistIds = watchlist.filter(id => !isLegacyTestId(id));
  const watchedEvents = allEvents.filter(event => validWatchlistIds.includes(event.id));
  
  // 2. Split into Monitored (Active) and Pending (Passive)
  const monitoredEvents = watchedEvents.filter(event =>
    traders.some(trader => (trader.eventIds || trader.assignedEvents || []).includes(event.id))
  );

  const pendingEvents = watchedEvents.filter(event =>
    !traders.some(trader => (trader.eventIds || trader.assignedEvents || []).includes(event.id))
  );

  // 3. Find invalid/missing IDs - 只标记旧测试数据为无效
  const missingEventIds = watchlist.filter(id => isLegacyTestId(id));
  
  // 4. Find events that are in watchlist but not loaded yet (暂未加载但可能有效)
  const notLoadedYetIds = validWatchlistIds.filter(id => !allEvents.some(event => event.id === id));
  
  const unwatchedEventIds = pendingEvents.map(e => e.id);

  const handleCreateTrader = () => {
    if (selectedPendingEventIds.length === 0) {
      // 如果没有选中任何事件，默认选中所有待处理事件（如果只有一个）或者提示用户
      if (pendingEvents.length > 0) {
        setSelectedPendingEventIds(pendingEvents.map(e => e.id));
      } else {
        return; // No events to create trader for
      }
    }
    setShowCreateDialog(true);
  };
  
  const handleCleanupMissingEvents = () => {
    if (missingEventIds.length === 0) return;
    
    const confirmMsg = (t.confirmCleanupLegacy || '')
      .replace('{count}', String(missingEventIds.length))
      .replace('{ids}', missingEventIds.join(', '));
    
    if (window.confirm(confirmMsg)) {
      missingEventIds.forEach(id => onRemoveFromWatchlist(id));
    }
  };

  const handleCleanupNotLoadedEvents = () => {
    if (notLoadedYetIds.length === 0) return;
    
    const confirmMsg = (t.confirmCleanupNotLoaded || '')
      .replace('{count}', String(notLoadedYetIds.length));
    
    if (window.confirm(confirmMsg)) {
      notLoadedYetIds.forEach(id => onRemoveFromWatchlist(id));
    }
  };

  // Toggle selection of a pending event
  const toggleEventSelection = (eventId: string) => {
    setSelectedPendingEventIds(prev => 
      prev.includes(eventId)
        ? prev.filter(id => id !== eventId)
        : [...prev, eventId]
    );
  };

  // Select all pending events
  const toggleSelectAll = () => {
    if (selectedPendingEventIds.length === pendingEvents.length) {
      setSelectedPendingEventIds([]);
    } else {
      setSelectedPendingEventIds(pendingEvents.map(e => e.id));
    }
  };

  if (loading) {
    return (
      <Card className="p-12 text-center">
        <Loader2 className="w-12 h-12 text-blue-500 mx-auto mb-4 animate-spin" />
        <p className="text-muted-foreground">{t.loading}</p>
      </Card>
    );
  }

  if (watchlist.length === 0) {
    return (
      <Card className="p-12 text-center">
        <div className="max-w-md mx-auto">
          <Star className="w-20 h-20 text-muted-foreground mx-auto mb-4 opacity-20" />
          <h3 className="mb-2">{t.noItems}</h3>
          <p className="text-sm text-muted-foreground mb-6">
            {t.noItemsDesc}
          </p>
          <div className="bg-blue-50 dark:bg-blue-950/20 rounded-lg p-4 border border-blue-200 dark:border-blue-800">
            <div className="flex items-start gap-3 text-left">
              <Sparkles className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium mb-1 text-blue-900 dark:text-blue-300">💡 {t.tip}</p>
                <p className="text-blue-700 dark:text-blue-400">
                  {t.tipDesc}
                </p>
              </div>
            </div>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="p-4">
          <p className="text-sm text-muted-foreground mb-1">{t.watchedEvents}</p>
          <p className="text-3xl">{validWatchlistIds.length}</p>
          {missingEventIds.length > 0 && (
            <p className="text-xs text-orange-600 dark:text-orange-400 mt-1">
              ({missingEventIds.length} {t.legacyData})
            </p>
          )}
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground mb-1">{t.loaded}</p>
          <p className="text-3xl text-blue-600 dark:text-blue-400">
            {watchedEvents.length}
          </p>
          {notLoadedYetIds.length > 0 && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              ({notLoadedYetIds.length} {t.notLoaded})
            </p>
          )}
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground mb-1">{t.monitored}</p>
          <p className="text-3xl text-green-600 dark:text-green-400">
            {monitoredEvents.length}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground mb-1">{t.pending}</p>
          <p className="text-3xl text-orange-600 dark:text-orange-400">
            {pendingEvents.length}
          </p>
        </Card>
      </div>

      {/* Top Alert for Legacy Test Data */}
      {missingEventIds.length > 0 && (
        <div className="bg-orange-50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-800 rounded-lg p-4 flex items-center justify-between">
          <div className="flex items-center gap-2 text-orange-700 dark:text-orange-400">
            <Activity className="w-5 h-5" />
            <span>
              {(t.legacyTestData || '').replace('{count}', String(missingEventIds.length)).replace('{ids}', missingEventIds.join(', '))}
            </span>
          </div>
          <Button 
            onClick={handleCleanupMissingEvents}
            variant="outline" 
            size="sm"
            className="border-orange-300 text-orange-600 hover:bg-orange-100 dark:border-orange-700 dark:hover:bg-orange-900/40"
          >
            {t.cleanupInvalid}
          </Button>
        </div>
      )}
      
      {/* Info Alert for Not Yet Loaded Events */}
      {notLoadedYetIds.length > 0 && (
        <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 flex items-start justify-between gap-4">
          <div className="flex items-start gap-2 text-blue-700 dark:text-blue-400 text-sm flex-1">
            <Info className="w-5 h-5 shrink-0 mt-0.5" />
            <div>
              <p className="font-medium mb-1">
                {(t.eventsNotLoaded || '').replace('{count}', String(notLoadedYetIds.length))}
              </p>
              <p className="text-xs opacity-80">
                {t.notLoadedReasons}
              </p>
              <p className="text-xs opacity-80 mt-1">
                {t.keepInWatchlist}
              </p>
            </div>
          </div>
          <Button 
            onClick={handleCleanupNotLoadedEvents}
            variant="outline" 
            size="sm"
            className="border-blue-300 text-blue-600 hover:bg-blue-100 dark:border-blue-700 dark:hover:bg-blue-900/40 shrink-0"
          >
            {t.cleanupNotLoaded}
          </Button>
        </div>
      )}

      {/* Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* Left Column: Watchlist (Pending) - 7/12 width */}
        <div className="lg:col-span-7 space-y-4">
          <div className="flex items-center justify-between mb-2 sticky top-0 bg-gray-50 dark:bg-gray-950 py-2 z-10">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg shadow-sm">
                <Star className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-gray-900 dark:text-white">{t.pendingSection}</h2>
                <p className="text-xs text-muted-foreground">{t.selectEvents}</p>
              </div>
              <Badge variant="secondary" className="bg-gray-200 dark:bg-gray-800">
                {pendingEvents.length}
              </Badge>
            </div>

            {pendingEvents.length > 0 && (
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={toggleSelectAll}
                  className="text-xs h-8"
                >
                  {selectedPendingEventIds.length === pendingEvents.length ? (
                    <>
                      <CheckSquare className="w-4 h-4 mr-1.5" />
                      {t.deselectAll}
                    </>
                  ) : (
                    <>
                      <Square className="w-4 h-4 mr-1.5" />
                      {t.selectAll}
                    </>
                  )}
                </Button>
                <Button 
                  onClick={handleCreateTrader} 
                  disabled={selectedPendingEventIds.length === 0 || !isAuthenticated}
                  size="sm"
                  className="bg-blue-600 hover:bg-blue-700 text-white shadow-sm h-8 text-xs font-medium disabled:opacity-50"
                  title={!isAuthenticated ? t.pleaseLogin : undefined}
                >
                  <PlusCircle className="w-3.5 h-3.5 mr-1.5" />
                  {isAuthenticated 
                    ? (t.createTraderFor || '').replace('{count}', String(selectedPendingEventIds.length))
                    : t.pleaseLogin
                  }
                </Button>
              </div>
            )}
          </div>

          {pendingEvents.length === 0 ? (
            <Card className="p-8 text-center border-dashed">
              <p className="text-sm text-muted-foreground">{t.noPendingEvents}</p>
              <Button variant="link" className="mt-2 text-blue-600">{t.goToMarket}</Button>
            </Card>
          ) : (
            <div className="space-y-3">
              {pendingEvents.map((event) => {
                const isSelected = selectedPendingEventIds.includes(event.id);
                return (
                  <Card
                    key={event.id}
                    onClick={() => toggleEventSelection(event.id)}
                    className={`p-4 transition-all cursor-pointer relative overflow-hidden group border-2 ${
                      isSelected 
                        ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-900/10 shadow-md' 
                        : 'border-transparent hover:border-blue-200 dark:hover:border-blue-800'
                    }`}
                  >
                    <div className="flex justify-between items-start gap-3">
                      {/* Checkbox Indicator */}
                      <div className={`mt-1 w-5 h-5 rounded border flex items-center justify-center transition-colors shrink-0 ${
                        isSelected 
                          ? 'bg-blue-500 border-blue-500 text-white' 
                          : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 group-hover:border-blue-400'
                      }`}>
                        {isSelected && <CheckSquare className="w-3.5 h-3.5" />}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5">{event.category}</Badge>
                          <span className="text-xs text-muted-foreground truncate">{new Date(event.endDate).toLocaleDateString()}</span>
                        </div>
                        <h4 className="font-medium text-sm line-clamp-2 mb-2 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                          {event.title}
                        </h4>
                        
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 text-xs">
                            <div className="bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 px-1.5 py-0.5 rounded">
                              Y: {(event.yesPrice * 100).toFixed(0)}%
                            </div>
                            <div className="bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 px-1.5 py-0.5 rounded">
                              N: {(event.noPrice * 100).toFixed(0)}%
                            </div>
                          </div>

                          {/* Detail Button - Stop propagation */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedEvent(event);
                            }}
                            className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
                          >
                            <Info className="w-3.5 h-3.5" />
                            <span>{t.details}</span>
                          </button>
                        </div>
                      </div>

                      <div className="flex flex-col gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => onRemoveFromWatchlist(event.id)}
                          className="h-7 w-7 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-full"
                          title={t.remove}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Column: Active Monitoring - 5/12 width */}
        <div className="lg:col-span-5 space-y-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg shadow-sm">
                <Zap className="w-5 h-5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                  {t.monitoring}
                  <Badge className="bg-green-500 hover:bg-green-600 border-0">Live</Badge>
                </h2>
                <p className="text-xs text-muted-foreground">{t.activelyMonitored}</p>
              </div>
            </div>
          </div>

          {monitoredEvents.length === 0 ? (
            <div className="border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl p-8 text-center bg-gray-50/50 dark:bg-gray-900/50 flex flex-col items-center justify-center min-h-[200px]">
              <div className="w-12 h-12 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mb-3">
                <Layers className="w-6 h-6 text-gray-400" />
              </div>
              <h3 className="font-medium text-gray-900 dark:text-white mb-1">{t.noMonitoringTasks}</h3>
              <p className="text-xs text-muted-foreground max-w-xs mx-auto">
                {t.selectAndCreate}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {monitoredEvents.map((event) => {
                const monitoringTraders = traders.filter(trader => (trader.eventIds || trader.assignedEvents || []).includes(event.id));
                
                return (
                  <Card
                    key={event.id}
                    className="p-4 border-l-4 border-l-green-500 border-y border-r border-gray-200 dark:border-gray-800 shadow-sm hover:shadow-md transition-all bg-gradient-to-r from-green-50/30 to-transparent dark:from-green-950/10"
                  >
                    <div className="space-y-3">
                      {/* Active Header */}
                      <div className="flex justify-between items-start gap-3">
                        <div>
                          <div className="flex gap-1.5 mb-1.5 flex-wrap">
                            {monitoringTraders.map(trader => (
                              <Badge key={trader.id} variant="secondary" className="text-[10px] px-1.5 py-0 h-5 bg-white dark:bg-gray-800 shadow-sm border border-gray-200 dark:border-gray-700 flex items-center gap-1">
                                <Brain className="w-3 h-3 text-purple-500" />
                                {trader.name}
                              </Badge>
                            ))}
                          </div>
                          <h4 className="font-bold text-sm line-clamp-2 leading-tight">{event.title}</h4>
                        </div>
                      </div>

                      {/* Price Bar & Stats */}
                      <div className="grid grid-cols-2 gap-3 bg-white/50 dark:bg-black/20 rounded-lg p-2.5 border border-gray-100 dark:border-gray-800">
                        <div>
                          <span className="text-[10px] uppercase tracking-wider text-muted-foreground block mb-0.5">Price</span>
                          <div className="flex items-baseline gap-1">
                            <span className="text-lg font-bold text-green-600 dark:text-green-400">
                              {(event.yesPrice * 100).toFixed(0)}¢
                            </span>
                            <span className="text-[10px] text-gray-500">YES</span>
                          </div>
                        </div>
                        <div className="text-right">
                          <span className="text-[10px] uppercase tracking-wider text-muted-foreground block mb-0.5">Volume</span>
                          <div className="font-mono font-medium text-sm">
                            ${(event.volume / 1000000).toFixed(2)}M
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-2 border-t border-gray-100 dark:border-gray-800">
                        <div className="flex items-center gap-1">
                          <Activity className="w-3 h-3 animate-pulse text-green-500" />
                          <span>{t.running}</span>
                        </div>
                        <span>1m ago</span>
                      </div>
                      
                      <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-800 flex justify-end">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setSelectedEvent(event)}
                          className="text-xs h-7 px-2 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20"
                        >
                          <Info className="w-3.5 h-3.5 mr-1.5" />
                          {t.viewDetails}
                        </Button>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Create Trader Dialog */}
      <CreateTraderDialog
        open={showCreateDialog}
        onClose={() => setShowCreateDialog(false)}
        onCreate={(trader) => {
          onCreateTrader(trader); // Pass the trader to save it
          setShowCreateDialog(false);
          setSelectedPendingEventIds([]); // Clear selection after creation
        }}
        watchlist={selectedPendingEventIds.length > 0 ? selectedPendingEventIds : watchlist}
      />

      {/* Event Detail Dialog */}
      <EventDetailDialog
        event={selectedEvent as UnifiedMarketEvent}
        open={!!selectedEvent}
        onClose={() => setSelectedEvent(null)}
        language={language}
      />
    </div>
  );
}