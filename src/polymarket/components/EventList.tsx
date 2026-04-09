import { Card } from './ui/card';
import { Badge } from './ui/badge';
import { Input } from './ui/input';
import { TrendingUp, Calendar, DollarSign, Search } from 'lucide-react';
import { PolymarketEvent } from '../types';
import { useState, useEffect } from 'react';

interface EventListProps {
  onSelectEvent: (event: PolymarketEvent) => void;
  selectedEventId?: string;
}

// Mock data
const mockEvents: PolymarketEvent[] = [
  {
    id: '1',
    title: '2024美国总统大选结果',
    description: '共和党候选人是否会赢得2024年美国总统大选？',
    endDate: '2024-11-05',
    volume: 125000000,
    yesPrice: 0.52,
    noPrice: 0.48,
    category: '政治'
  },
  {
    id: '2',
    title: 'AI将在2025年通过图灵测试',
    description: '主流AI系统是否会在2025年底前通过标准图灵测试？',
    endDate: '2025-12-31',
    volume: 5600000,
    yesPrice: 0.34,
    noPrice: 0.66,
    category: '科技'
  },
  {
    id: '3',
    title: '比特币价格突破10万美元',
    description: '比特币价格是否会在2024年底前突破$100,000？',
    endDate: '2024-12-31',
    volume: 45000000,
    yesPrice: 0.68,
    noPrice: 0.32,
    category: '加密货币'
  },
  {
    id: '4',
    title: 'SpaceX成功载人登月',
    description: 'SpaceX是否会在2025年成功完成载人登月任务？',
    endDate: '2025-12-31',
    volume: 12000000,
    yesPrice: 0.28,
    noPrice: 0.72,
    category: '太空'
  },
  {
    id: '5',
    title: '全球气温上升1.5°C',
    description: '2024年全球平均气温是否会比工业化前高1.5°C？',
    endDate: '2024-12-31',
    volume: 3200000,
    yesPrice: 0.76,
    noPrice: 0.24,
    category: '气候'
  }
];

export function EventList({ onSelectEvent, selectedEventId }: EventListProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [autoScrollIndex, setAutoScrollIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  // Auto-scroll through events
  useEffect(() => {
    if (isPaused || searchQuery) return;
    
    const interval = setInterval(() => {
      setAutoScrollIndex((prev) => (prev + 1) % mockEvents.length);
    }, 4000);

    return () => clearInterval(interval);
  }, [isPaused, searchQuery]);

  // Auto-select event when scrolling
  useEffect(() => {
    if (!isPaused && !searchQuery && !selectedEventId) {
      onSelectEvent(mockEvents[autoScrollIndex]);
    }
  }, [autoScrollIndex, isPaused, searchQuery]);

  const filteredEvents = mockEvents.filter(event => 
    event.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    event.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
    event.category.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2>热门事件</h2>
        <Badge variant="secondary">{mockEvents.length} 个事件</Badge>
      </div>

      {/* Search Box */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="搜索事件..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Auto-scroll indicator */}
      {!searchQuery && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>自动轮播中 {autoScrollIndex + 1}/{mockEvents.length}</span>
          <button
            onClick={() => setIsPaused(!isPaused)}
            className="text-blue-600 dark:text-blue-400 hover:underline"
          >
            {isPaused ? '继续' : '暂停'}
          </button>
        </div>
      )}

      <div className="space-y-3 max-h-[calc(100vh-280px)] overflow-y-auto pr-2 custom-scrollbar">
        {filteredEvents.map((event, index) => (
          <Card
            key={event.id}
            className={`p-4 cursor-pointer transition-all hover:shadow-md ${
              selectedEventId === event.id
                ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-950/20 shadow-md'
                : autoScrollIndex === index && !searchQuery
                ? 'border-blue-300 bg-blue-50/30 dark:bg-blue-950/10'
                : 'hover:border-blue-300'
            }`}
            onClick={() => {
              onSelectEvent(event);
              setIsPaused(true);
            }}
          >
            <div className="space-y-3">
              <div>
                <div className="flex items-start justify-between gap-2 mb-1">
                  <h3 className="text-sm">{event.title}</h3>
                  <Badge variant="outline" className="text-xs shrink-0">
                    {event.category}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground line-clamp-2">
                  {event.description}
                </p>
              </div>

              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <div className="flex items-center gap-1">
                  <DollarSign className="w-3 h-3" />
                  <span>${(event.volume / 1000000).toFixed(1)}M</span>
                </div>
                <div className="flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  <span>{new Date(event.endDate).toLocaleDateString('zh-CN')}</span>
                </div>
              </div>

              <div className="flex gap-2">
                <div className="flex-1 bg-green-100 dark:bg-green-950/30 rounded px-2 py-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-green-700 dark:text-green-400">YES</span>
                    <span className="text-green-900 dark:text-green-300">{(event.yesPrice * 100).toFixed(0)}%</span>
                  </div>
                </div>
                <div className="flex-1 bg-red-100 dark:bg-red-950/30 rounded px-2 py-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-red-700 dark:text-red-400">NO</span>
                    <span className="text-red-900 dark:text-red-300">{(event.noPrice * 100).toFixed(0)}%</span>
                  </div>
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {filteredEvents.length === 0 && (
        <div className="text-center py-8 text-muted-foreground">
          <Search className="w-12 h-12 mx-auto mb-2 opacity-20" />
          <p className="text-sm">未找到匹配的事件</p>
        </div>
      )}
    </div>
  );
}