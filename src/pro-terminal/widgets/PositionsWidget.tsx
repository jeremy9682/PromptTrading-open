import React from 'react';
import { IDockviewPanelProps } from 'dockview';
import { TrendingUp, TrendingDown, X } from 'lucide-react';

interface Position {
  id: string;
  market: string;
  side: 'yes' | 'no';
  size: number;
  avgPrice: number;
  currentPrice: number;
  pnl: number;
  pnlPercent: number;
}

interface PositionsWidgetProps extends IDockviewPanelProps {
  params?: Record<string, any>;
}

export const PositionsWidget: React.FC<PositionsWidgetProps> = ({ params }) => {
  // Mock positions data
  const mockPositions: Position[] = [
    {
      id: '1',
      market: 'BTC > $100k 2024',
      side: 'yes',
      size: 500,
      avgPrice: 0.62,
      currentPrice: 0.67,
      pnl: 25,
      pnlPercent: 8.06,
    },
    {
      id: '2',
      market: 'Fed Rate Cut Jan',
      side: 'yes',
      size: 200,
      avgPrice: 0.70,
      currentPrice: 0.72,
      pnl: 4,
      pnlPercent: 2.86,
    },
    {
      id: '3',
      market: 'ETH > $4k 2024',
      side: 'no',
      size: 150,
      avgPrice: 0.45,
      currentPrice: 0.42,
      pnl: -4.5,
      pnlPercent: -6.67,
    },
  ];

  const totalPnl = mockPositions.reduce((sum, p) => sum + p.pnl, 0);
  const totalValue = mockPositions.reduce((sum, p) => sum + p.size * p.currentPrice, 0);

  return (
    <div className="h-full flex flex-col bg-gray-900 text-white">
      {/* Summary */}
      <div className="p-3 border-b border-gray-800">
        <div className="flex justify-between items-center">
          <div>
            <span className="text-xs text-gray-500">Total Value</span>
            <div className="text-lg font-bold">${totalValue.toFixed(2)}</div>
          </div>
          <div className="text-right">
            <span className="text-xs text-gray-500">Total P&L</span>
            <div className={`text-lg font-bold flex items-center gap-1 ${totalPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {totalPnl >= 0 ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
              ${Math.abs(totalPnl).toFixed(2)}
            </div>
          </div>
        </div>
      </div>

      {/* Positions List */}
      <div className="flex-1 overflow-auto">
        {mockPositions.map((position) => (
          <div
            key={position.id}
            className="p-3 border-b border-gray-800 hover:bg-gray-800/50"
          >
            <div className="flex justify-between items-start mb-2">
              <div>
                <div className="text-sm font-medium">{position.market}</div>
                <div className="text-xs text-gray-500">
                  {position.side.toUpperCase()} · {position.size} shares @ {position.avgPrice.toFixed(2)}
                </div>
              </div>
              <button className="text-gray-500 hover:text-red-400 p-1">
                <X size={14} />
              </button>
            </div>
            <div className="flex justify-between items-center text-xs">
              <div>
                <span className="text-gray-500">Current: </span>
                <span className="font-mono">{position.currentPrice.toFixed(2)}</span>
              </div>
              <div className={`flex items-center gap-1 ${position.pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {position.pnl >= 0 ? '+' : ''}{position.pnl.toFixed(2)} ({position.pnl >= 0 ? '+' : ''}{position.pnlPercent.toFixed(2)}%)
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Actions */}
      <div className="p-3 border-t border-gray-800">
        <button className="w-full py-2 bg-gray-800 hover:bg-gray-700 text-sm rounded transition-colors">
          Close All Positions
        </button>
      </div>
    </div>
  );
};

export default PositionsWidget;
