import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Badge } from './ui/badge';
import { Trader, PolymarketEvent } from '../types';
import { useState } from 'react';
import { Sparkles, Target } from 'lucide-react';
import { translations } from '../../constants/translations';
import { useAppStore } from '../../contexts/useAppStore';

interface CreateTraderDialogProps {
  open: boolean;
  onClose: () => void;
  onCreate: (trader: Trader) => void;
  watchlist?: string[];
}

// Mock events for selection
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

const promptTemplates = [
  {
    key: 'conservative',
    prompt: 'Analyze conservatively focusing on: 1) Risk factors 2) Historical accuracy 3) Only recommend trades with >75% confidence',
    color: 'blue'
  },
  {
    key: 'aggressive',
    prompt: 'Analyze aggressively for maximum returns: 1) Identify mispriced markets 2) Early trend detection 3) Recommend trades with >55% confidence',
    color: 'orange'
  },
  {
    key: 'balanced',
    prompt: 'Analyze this event considering: 1) Recent news and trends 2) Historical similar events 3) Market sentiment 4) Statistical probability',
    color: 'green'
  },
  {
    key: 'datadriven',
    prompt: 'Pure quantitative analysis: 1) Historical outcomes 2) Statistical models 3) Market volume patterns 4) Price momentum',
    color: 'purple'
  }
];

export function CreateTraderDialog({ open, onClose, onCreate, watchlist }: CreateTraderDialogProps) {
  const language = useAppStore((state) => state.language);
  const t = translations[language]?.polymarketPage?.createTrader || translations.en.polymarketPage.createTrader;
  
  const [name, setName] = useState('');
  const [prompt, setPrompt] = useState(promptTemplates[0].prompt);
  const [selectedColor, setSelectedColor] = useState(promptTemplates[0].color);
  const [selectedEventIds, setSelectedEventIds] = useState<string[]>([]);

  // Auto-select watchlist events when dialog opens
  useState(() => {
    if (open && watchlist && watchlist.length > 0) {
      setSelectedEventIds(watchlist);
    }
  });

  const handleCreate = () => {
    if (!name.trim()) {
      alert(t.enterName);
      return;
    }
    if (selectedEventIds.length === 0) {
      alert(t.selectEvent);
      return;
    }

    const newTrader: Trader = {
      id: `trader-${Date.now()}`,
      name: name.trim(),
      prompt,
      eventIds: selectedEventIds,
      isActive: false,
      createdAt: Date.now(),
      totalValue: 10000,
      totalPnL: 0,
      color: selectedColor
    };

    onCreate(newTrader);
    
    // Reset form
    setName('');
    setPrompt(promptTemplates[0].prompt);
    setSelectedColor(promptTemplates[0].color);
    setSelectedEventIds([]);
    onClose();
  };

  const toggleEvent = (eventId: string) => {
    setSelectedEventIds(prev => 
      prev.includes(eventId) 
        ? prev.filter(id => id !== eventId)
        : [...prev, eventId]
    );
  };

  const applyTemplate = (template: typeof promptTemplates[0]) => {
    setPrompt(template.prompt);
    setSelectedColor(template.color);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-h-[90vh] overflow-y-auto" style={{ width: '95vw', maxWidth: '42rem' }}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Target className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            {t.title}
          </DialogTitle>
          <DialogDescription>
            {t.subtitle}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Trader Name */}
          <div className="space-y-2">
            <Label htmlFor="name">{t.traderName}</Label>
            <Input
              id="name"
              placeholder={t.namePlaceholder}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          {/* Strategy Templates */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="w-4 h-4 text-yellow-500" />
              <Label>{t.selectStrategy}</Label>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {promptTemplates.map((template) => (
                <Button
                  key={template.key}
                  variant={prompt === template.prompt ? "default" : "outline"}
                  className="justify-start h-auto py-3"
                  onClick={() => applyTemplate(template)}
                >
                  <div className="text-left">
                    <p className="font-medium">{t.strategies?.[template.key] || template.key}</p>
                    <p className="text-xs opacity-70 line-clamp-1">{template.prompt.slice(0, 40)}...</p>
                  </div>
                </Button>
              ))}
            </div>
          </div>

          {/* Custom Prompt */}
          <div className="space-y-2">
            <Label htmlFor="prompt">{t.customStrategy}</Label>
            <Textarea
              id="prompt"
              rows={4}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              className="font-mono text-sm"
              placeholder={t.customStrategyPlaceholder}
            />
          </div>

          {/* Event Selection */}
          <div className="space-y-2">
            <Label>{t.selectEvents} ({selectedEventIds.length} {t.eventsSelected})</Label>
            <div className="space-y-2 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
              {mockEvents.map((event) => {
                const isSelected = selectedEventIds.includes(event.id);
                return (
                  <div
                    key={event.id}
                    className={`p-3 rounded-lg border cursor-pointer transition-all ${
                      isSelected 
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/20' 
                        : 'border-border hover:border-blue-300'
                    }`}
                    onClick={() => toggleEvent(event.id)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="text-sm">{event.title}</h4>
                          <Badge variant="outline" className="text-xs">
                            {event.category}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground line-clamp-1">
                          {event.description}
                        </p>
                      </div>
                      {isSelected && (
                        <div className="w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center shrink-0">
                          <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button variant="outline" onClick={onClose}>
            {t.cancel}
          </Button>
          <Button onClick={handleCreate}>
            {t.create}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}