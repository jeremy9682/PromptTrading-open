import { Card } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { 
  Plus, 
  TrendingUp, 
  TrendingDown, 
  BarChart3, 
  Activity,
  Settings,
  Trash2,
  ChevronRight,
  Target
} from 'lucide-react';
import { Trader } from '../types';
import { useState } from 'react';
import { CreateTraderDialog } from './CreateTraderDialogAdvanced';
import { translations } from '../../constants/translations';

interface TradersOverviewProps {
  traders: Trader[];
  onSelectTrader: (traderId: string) => void;
  onCreateTrader: (trader: Trader) => void;
  onDeleteTrader: (traderId: string) => void;
  watchlist: string[];
  isAuthenticated?: boolean;
  language?: 'zh' | 'en';
}

const traderColors: Record<string, { bg: string; border: string; text: string }> = {
  blue: {
    bg: 'bg-blue-50 dark:bg-blue-950/20',
    border: 'border-blue-200 dark:border-blue-800',
    text: 'text-blue-600 dark:text-blue-400'
  },
  green: {
    bg: 'bg-green-50 dark:bg-green-950/20',
    border: 'border-green-200 dark:border-green-800',
    text: 'text-green-600 dark:text-green-400'
  },
  purple: {
    bg: 'bg-purple-50 dark:bg-purple-950/20',
    border: 'border-purple-200 dark:border-purple-800',
    text: 'text-purple-600 dark:text-purple-400'
  },
  orange: {
    bg: 'bg-orange-50 dark:bg-orange-950/20',
    border: 'border-orange-200 dark:border-orange-800',
    text: 'text-orange-600 dark:text-orange-400'
  }
};

export function TradersOverview({ 
  traders, 
  onSelectTrader, 
  onCreateTrader,
  onDeleteTrader,
  watchlist,
  isAuthenticated = false,
  language = 'zh'
}: TradersOverviewProps) {
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const t = translations[language]?.polymarketPage?.tradersOverview || translations.en.polymarketPage.tradersOverview;

  const totalValue = traders.reduce((sum, t) => sum + t.totalValue, 0);
  const totalPnL = traders.reduce((sum, t) => sum + t.totalPnL, 0);
  const activeTraders = traders.filter(t => t.isActive).length;

  return (
    <div className="space-y-6">
      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground mb-1">{t.totalAssets}</p>
              <p className="text-2xl">${totalValue.toFixed(2)}</p>
            </div>
            <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-950 flex items-center justify-center">
              <BarChart3 className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
          </div>
        </Card>

        <Card className={`p-4 ${
          totalPnL >= 0 
            ? 'bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800' 
            : 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800'
        }`}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground mb-1">{t.totalPnL}</p>
              <p className={`text-2xl ${totalPnL >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                {totalPnL >= 0 ? '+' : ''}${totalPnL.toFixed(2)}
              </p>
              <p className={`text-xs ${totalPnL >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                {((totalPnL / (totalValue - totalPnL)) * 100).toFixed(2)}%
              </p>
            </div>
            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
              totalPnL >= 0 ? 'bg-green-500' : 'bg-red-500'
            }`}>
              {totalPnL >= 0 ? (
                <TrendingUp className="w-5 h-5 text-white" />
              ) : (
                <TrendingDown className="w-5 h-5 text-white" />
              )}
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground mb-1">{t.traders}</p>
              <p className="text-2xl">{traders.length}</p>
              <p className="text-xs text-muted-foreground">{activeTraders} {t.running}</p>
            </div>
            <div className="w-10 h-10 rounded-full bg-purple-100 dark:bg-purple-950 flex items-center justify-center">
              <Target className="w-5 h-5 text-purple-600 dark:text-purple-400" />
            </div>
          </div>
        </Card>

        <Card className="p-4 bg-gradient-to-br from-blue-50 to-purple-50 dark:from-blue-950/20 dark:to-purple-950/20 border-blue-200 dark:border-blue-800">
          <Button 
            className="w-full h-full" 
            size="lg"
            onClick={() => setShowCreateDialog(true)}
            disabled={!isAuthenticated}
            title={!isAuthenticated ? t.pleaseLogin : undefined}
          >
            <Plus className="w-5 h-5 mr-2" />
            {isAuthenticated ? t.createNew : t.pleaseLogin}
          </Button>
        </Card>
      </div>

      {/* Traders List */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2>{t.title}</h2>
          <Badge variant="secondary">{traders.length} {t.count}</Badge>
        </div>

        {traders.length === 0 ? (
          <Card className="p-12 text-center">
            <Target className="w-16 h-16 text-muted-foreground mx-auto mb-4 opacity-20" />
            <h3 className="text-muted-foreground mb-2">{t.noTraders}</h3>
            <p className="text-sm text-muted-foreground mb-4">
              {isAuthenticated ? t.noTradersDesc : t.pleaseLoginDesc}
            </p>
            <Button 
              onClick={() => setShowCreateDialog(true)}
              disabled={!isAuthenticated}
            >
              <Plus className="w-4 h-4 mr-2" />
              {isAuthenticated ? t.createNew : t.pleaseLogin}
            </Button>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {traders.map((trader) => {
              const colorScheme = traderColors[trader.color] || traderColors.blue;
              return (
                <Card
                  key={trader.id}
                  className={`p-5 cursor-pointer transition-all hover:shadow-lg ${colorScheme.bg} ${colorScheme.border}`}
                  onClick={() => onSelectTrader(trader.id)}
                >
                  <div className="space-y-4">
                    {/* Header */}
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h3>{trader.name}</h3>
                          {trader.isActive && (
                            <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-500/20 border border-green-500/30">
                              <Activity className="w-3 h-3 text-green-600 dark:text-green-400 animate-pulse" />
                              <span className="text-xs text-green-700 dark:text-green-400">{t.active}</span>
                            </div>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground line-clamp-2">
                          {trader.prompt}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          const confirmMsg = (t.confirmDelete || '').replace('{name}', trader.name);
                          if (confirm(confirmMsg)) {
                            onDeleteTrader(trader.id);
                          }
                        }}
                        className="shrink-0"
                      >
                        <Trash2 className="w-4 h-4 text-red-500" />
                      </Button>
                    </div>

                    {/* Stats */}
                    <div className="grid grid-cols-3 gap-3">
                      <div className="bg-white/50 dark:bg-slate-900/50 rounded-lg p-2">
                        <p className="text-xs text-muted-foreground">{t.monitoredEvents}</p>
                        <p className="text-lg">{(trader.eventIds || trader.assignedEvents || []).length}</p>
                      </div>
                      <div className="bg-white/50 dark:bg-slate-900/50 rounded-lg p-2">
                        <p className="text-xs text-muted-foreground">{t.totalAssets}</p>
                        <p className="text-lg">${((trader.totalValue || trader.capital || 0) / 1000).toFixed(1)}k</p>
                      </div>
                      <div className="bg-white/50 dark:bg-slate-900/50 rounded-lg p-2">
                        <p className="text-xs text-muted-foreground">{t.pnl}</p>
                        <p className={`text-lg ${(trader.totalPnL || 0) >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                          {(trader.totalPnL || 0) >= 0 ? '+' : ''}{(trader.totalPnL || 0).toFixed(0)}
                        </p>
                      </div>
                    </div>

                    {/* Footer */}
                    <div className="flex items-center justify-between pt-2 border-t border-black/5 dark:border-white/5">
                      <p className="text-xs text-muted-foreground">
                        {t.createdAt} {new Date(trader.createdAt).toLocaleDateString(language === 'zh' ? 'zh-CN' : 'en-US')}
                      </p>
                      <ChevronRight className={`w-4 h-4 ${colorScheme.text}`} />
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Create Trader Dialog */}
      <CreateTraderDialog
        open={showCreateDialog}
        onClose={() => setShowCreateDialog(false)}
        onCreate={onCreateTrader}
        watchlist={watchlist}
      />
    </div>
  );
}