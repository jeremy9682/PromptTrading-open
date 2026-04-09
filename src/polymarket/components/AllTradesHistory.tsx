import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Badge } from './ui/badge';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { useState, useEffect } from 'react';

interface Trade {
  id: string;
  timestamp: number;
  eventTitle: string;
  action: 'buy' | 'sell';
  amount: number;
  price: number;
  total: number;
}

interface AllTradesHistoryProps {
  traderId: string;
}

export function AllTradesHistory({ traderId }: AllTradesHistoryProps) {
  const [trades, setTrades] = useState<Trade[]>([]);

  // Simulate trades
  useEffect(() => {
    const eventTitles = [
      '2024美国总统大选',
      '比特币突破10万',
      'AI通过图灵测试'
    ];

    const interval = setInterval(() => {
      const newTrade: Trade = {
        id: `trade-${Date.now()}`,
        timestamp: Date.now(),
        eventTitle: eventTitles[Math.floor(Math.random() * eventTitles.length)],
        action: Math.random() > 0.5 ? 'buy' : 'sell',
        amount: Math.floor(Math.random() * 100) + 10,
        price: 0.4 + Math.random() * 0.4,
        total: 0
      };
      newTrade.total = newTrade.amount * newTrade.price;

      setTrades(prev => [newTrade, ...prev.slice(0, 19)]);
    }, 5000);

    return () => clearInterval(interval);
  }, [traderId]);

  if (trades.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <p className="text-sm">暂无交易记录，等待AI执行交易...</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>时间</TableHead>
            <TableHead>事件</TableHead>
            <TableHead>操作</TableHead>
            <TableHead className="text-right">数量</TableHead>
            <TableHead className="text-right">价格</TableHead>
            <TableHead className="text-right">总额</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {trades.map((trade) => (
            <TableRow key={trade.id}>
              <TableCell className="text-sm">
                {new Date(trade.timestamp).toLocaleTimeString('zh-CN', {
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit'
                })}
              </TableCell>
              <TableCell className="text-sm">{trade.eventTitle}</TableCell>
              <TableCell>
                <Badge 
                  variant={trade.action === 'buy' ? 'default' : 'destructive'}
                  className="flex items-center gap-1 w-fit"
                >
                  {trade.action === 'buy' ? (
                    <>
                      <TrendingUp className="w-3 h-3" />
                      买入
                    </>
                  ) : (
                    <>
                      <TrendingDown className="w-3 h-3" />
                      卖出
                    </>
                  )}
                </Badge>
              </TableCell>
              <TableCell className="text-right">{trade.amount}</TableCell>
              <TableCell className="text-right">{(trade.price * 100).toFixed(1)}¢</TableCell>
              <TableCell className="text-right">${trade.total.toFixed(2)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
