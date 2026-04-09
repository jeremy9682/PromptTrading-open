import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Badge } from './ui/badge';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { TradePosition } from '../types';

interface TradeHistoryProps {
  positions: TradePosition[];
}

export function TradeHistory({ positions }: TradeHistoryProps) {
  // Filter only buy and sell actions
  const trades = positions.filter(p => p.action !== 'hold').slice(-10).reverse();

  if (trades.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <p className="text-sm">暂无交易记录</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>时间</TableHead>
            <TableHead>操作</TableHead>
            <TableHead className="text-right">仓位</TableHead>
            <TableHead className="text-right">账户价值</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {trades.map((trade, index) => (
            <TableRow key={`${trade.timestamp}-${index}`}>
              <TableCell className="text-sm">
                {new Date(trade.timestamp).toLocaleString('zh-CN', {
                  month: '2-digit',
                  day: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit'
                })}
              </TableCell>
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
              <TableCell className="text-right">
                {trade.position.toFixed(0)} 股
              </TableCell>
              <TableCell className="text-right">
                ${trade.value.toFixed(2)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
