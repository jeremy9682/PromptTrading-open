import { Card } from './ui/card';
import { Badge } from './ui/badge';
import { TrendingUp, TrendingDown, Activity } from 'lucide-react';
import { useState, useEffect } from 'react';

interface EventMonitorCardProps {
  event: {
    id: string;
    title: string;
    category: string;
    yesPrice: number;
    noPrice: number;
    volume: number;
  };
  isActive: boolean;
}

export function EventMonitorCard({ event, isActive }: EventMonitorCardProps) {
  const [currentYesPrice, setCurrentYesPrice] = useState(event.yesPrice);
  const [position, setPosition] = useState(0);
  const [pnl, setPnl] = useState(0);
  const [priceChange, setPriceChange] = useState(0);

  // Simulate price changes and trading
  useEffect(() => {
    if (!isActive) return;

    const interval = setInterval(() => {
      const change = (Math.random() - 0.5) * 0.02;
      const newPrice = Math.max(0.05, Math.min(0.95, currentYesPrice + change));
      const posChange = (Math.random() - 0.5) * 50;
      
      setCurrentYesPrice(newPrice);
      setPriceChange(((newPrice - event.yesPrice) / event.yesPrice) * 100);
      setPosition(prev => prev + posChange);
      setPnl(prev => prev + posChange * 0.3);
    }, 3000);

    return () => clearInterval(interval);
  }, [isActive, currentYesPrice, event.yesPrice]);

  return (
    <Card className="p-4 hover:shadow-md transition-shadow">
      <div className="space-y-3">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1">
            <h4 className="text-sm mb-1 line-clamp-2">{event.title}</h4>
            <Badge variant="outline" className="text-xs">{event.category}</Badge>
          </div>
          {isActive && (
            <Activity className="w-4 h-4 text-green-600 dark:text-green-400 animate-pulse shrink-0" />
          )}
        </div>

        {/* Current Prices */}
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-green-50 dark:bg-green-950/20 rounded p-2">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-muted-foreground">YES</span>
              {priceChange !== 0 && (
                <Badge variant="outline" className={`text-xs h-4 ${priceChange >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {priceChange >= 0 ? '+' : ''}{priceChange.toFixed(1)}%
                </Badge>
              )}
            </div>
            <p className="text-lg">{(currentYesPrice * 100).toFixed(1)}¢</p>
          </div>
          <div className="bg-red-50 dark:bg-red-950/20 rounded p-2">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-muted-foreground">NO</span>
            </div>
            <p className="text-lg">{((1 - currentYesPrice) * 100).toFixed(1)}¢</p>
          </div>
        </div>

        {/* Position & P&L */}
        {isActive && position !== 0 && (
          <div className="pt-3 border-t space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">持仓</span>
              <span>{position.toFixed(0)} 股</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">盈亏</span>
              <span className={pnl >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>
                {pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}
              </span>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
