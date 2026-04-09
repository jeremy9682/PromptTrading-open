import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Slider } from './ui/slider';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Card } from './ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import { Trader } from '../types';
import { useState, useEffect } from 'react';
import { Sparkles, Target, Shield, TrendingUp, Brain, Zap, AlertTriangle, Cpu, Wallet, Database, BarChart3, Users, Link2, LineChart, User } from 'lucide-react';
import { Checkbox } from './ui/checkbox';
import { translations } from '../../constants/translations';
import { useAppStore } from '../../contexts/useAppStore';

interface CreateTraderDialogProps {
  open: boolean;
  onClose: () => void;
  onCreate: (trader: Trader) => void;
  watchlist?: string[];
}


const promptTemplates = [
  { key: 'conservative', prompt: 'Analyze conservatively focusing on: 1) Risk factors 2) Historical accuracy 3) Only recommend trades with >75% confidence', color: 'blue' },
  { key: 'aggressive', prompt: 'Analyze aggressively for maximum returns: 1) Identify mispriced markets 2) Early trend detection 3) Recommend trades with >55% confidence', color: 'orange' },
  { key: 'balanced', prompt: 'Analyze this event considering: 1) Recent news and trends 2) Historical similar events 3) Market sentiment 4) Statistical probability', color: 'green' },
  { key: 'datadriven', prompt: 'Pure quantitative analysis: 1) Historical outcomes 2) Statistical models 3) Market volume patterns 4) Price momentum', color: 'purple' }
];

export function CreateTraderDialog({ open, onClose, onCreate, watchlist }: CreateTraderDialogProps) {
  const language = useAppStore((state) => state.language);
  const t = translations[language]?.polymarketPage?.createTrader || translations.en.polymarketPage.createTrader;
  
  const [name, setName] = useState('');
  const [capital, setCapital] = useState(1000);
  const [prompt, setPrompt] = useState(promptTemplates[0].prompt);
  const [selectedColor, setSelectedColor] = useState(promptTemplates[0].color);
  const [selectedEventIds, setSelectedEventIds] = useState<string[]>([]);
  const [aiModel, setAiModel] = useState('gpt-4');
  
  // Advanced settings
  const [minConfidence, setMinConfidence] = useState([65]);
  const [maxPosition, setMaxPosition] = useState([30]);
  const [stopLossPrice, setStopLossPrice] = useState([20]);
  const [takeProfitPrice, setTakeProfitPrice] = useState([80]);
  const [newsWeight, setNewsWeight] = useState([40]);
  const [dataWeight, setDataWeight] = useState([35]);
  const [sentimentWeight, setSentimentWeight] = useState([25]);
  const [analysisInterval, setAnalysisInterval] = useState(15);

  // Data sources
  const [dataSources, setDataSources] = useState({
    marketDepth: true,
    historyData: true,
    relatedEvents: false,
    technicalIndicators: false,
    participantBehavior: false,
    userAccount: false,
    reddit: true,
    googleNews: true,
  });

  const toggleDataSource = (key: keyof typeof dataSources) => {
    setDataSources(prev => ({ ...prev, [key]: !prev[key] }));
  };

  // Auto-select watchlist events when dialog opens
  useEffect(() => {
    if (open && watchlist && watchlist.length > 0 && selectedEventIds.length === 0) {
      setSelectedEventIds(watchlist);
    }
  }, [open, watchlist]);

  const handleCreate = () => {
    if (!name.trim()) {
      alert(t.enterName);
      return;
    }
    if (selectedEventIds.length === 0) {
      alert(t.selectEvent);
      return;
    }

    // 创建完整的 Trader 配置对象，发送所有字段到后端
    const newTrader: Trader = {
      id: `trader-${Date.now()}`,
      name: name.trim(),
      color: selectedColor,

      // Strategy
      prompt: prompt,
      aiModel: aiModel,

      // Capital & Performance
      capital: capital,
      totalValue: capital,
      totalPnL: 0,

      // Risk Management
      minConfidence: minConfidence[0],
      maxPosition: maxPosition[0],
      stopLossPrice: stopLossPrice[0],
      takeProfitPrice: takeProfitPrice[0],

      // Analysis Weights
      newsWeight: newsWeight[0],
      dataWeight: dataWeight[0],
      sentimentWeight: sentimentWeight[0],

      // Analysis Configuration
      analysisInterval: analysisInterval,
      dataSources: dataSources,

      // Status & Events
      isActive: false,
      eventIds: selectedEventIds,

      // Timestamps
      createdAt: Date.now(),
    };

    onCreate(newTrader);
    
    // Reset form
    setName('');
    setCapital(1000);
    setPrompt(promptTemplates[0].prompt);
    setSelectedColor(promptTemplates[0].color);
    setSelectedEventIds([]);
    setMinConfidence([65]);
    setMaxPosition([30]);
    setStopLossPrice([20]);
    setTakeProfitPrice([80]);
    setNewsWeight([40]);
    setDataWeight([35]);
    setSentimentWeight([25]);
    setAnalysisInterval(15);
    setDataSources({
      marketDepth: true,
      historyData: true,
      relatedEvents: false,
      technicalIndicators: false,
      participantBehavior: false,
      userAccount: false,
      reddit: true,
      googleNews: true,
    });
    onClose();
  };

  const applyTemplate = (template: typeof promptTemplates[0]) => {
    setPrompt(template.prompt);
    setSelectedColor(template.color);
    
    // Set defaults based on template
    switch (template.key) {
      case 'conservative':
        setMinConfidence([75]);
        setMaxPosition([20]);
        setStopLossPrice([30]);
        setTakeProfitPrice([70]);
        break;
      case 'aggressive':
        setMinConfidence([55]);
        setMaxPosition([50]);
        setStopLossPrice([10]);
        setTakeProfitPrice([90]);
        break;
      case 'balanced':
        setMinConfidence([65]);
        setMaxPosition([30]);
        setStopLossPrice([20]);
        setTakeProfitPrice([80]);
        break;
      case 'datadriven':
        setMinConfidence([70]);
        setStopLossPrice([15]);
        setTakeProfitPrice([85]);
        setDataWeight([60]);
        setNewsWeight([25]);
        setSentimentWeight([15]);
        break;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-h-[90vh] overflow-y-auto" style={{ width: '95vw', maxWidth: '56rem' }}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Target className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            {t.title}
          </DialogTitle>
          <DialogDescription>
            {t.subtitleAdvanced}
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="basic" className="mt-4">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="basic">{t.basicConfig}</TabsTrigger>
            <TabsTrigger value="advanced">{t.advancedSettings}</TabsTrigger>
          </TabsList>

          {/* Basic Configuration */}
          <TabsContent value="basic" className="space-y-3 mt-3">
            {/* Basic Info Card */}
            <Card className="p-3">
              <div className="flex items-center gap-2 mb-2">
                <Target className="w-4 h-4 text-blue-600" />
                <h4 className="text-sm font-medium">{t.basicInfo}</h4>
              </div>
              <div className="space-y-3">
                {/* Trader Name */}
                <div className="space-y-1">
                  <Label htmlFor="name" className="text-xs">{t.traderName}</Label>
                  <Input
                    id="name"
                    placeholder={t.namePlaceholder}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="h-8"
                  />
                </div>

                {/* Capital Amount */}
                <div className="space-y-1">
                  <div className="flex items-center gap-1">
                    <Wallet className="w-3 h-3 text-green-500" />
                    <Label htmlFor="capital" className="text-xs">{t.availableFunds}</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      id="capital"
                      type="number"
                      min={100}
                      step={100}
                      placeholder="1000"
                      value={capital}
                      onChange={(e) => setCapital(Number(e.target.value) || 0)}
                      className="flex-1 h-8"
                    />
                    <span className="text-xs text-muted-foreground">USDC</span>
                  </div>
                </div>
              </div>
            </Card>

            {/* Strategy Card */}
            <Card className="p-3">
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="w-4 h-4 text-yellow-500" />
                <h4 className="text-sm font-medium">{t.tradingStrategy}</h4>
              </div>
              <div className="space-y-3">
                {/* Strategy Templates */}
                <div className="space-y-1">
                  <Label className="text-xs">{t.selectStrategy}</Label>
                  <div className="grid grid-cols-2 gap-1.5">
                    {promptTemplates.map((template) => (
                      <Button
                        key={template.key}
                        variant={prompt === template.prompt ? "default" : "outline"}
                        className="justify-start h-auto py-2 px-2 w-full overflow-hidden"
                        onClick={() => applyTemplate(template)}
                      >
                        <div className="text-left w-full overflow-hidden">
                          <p className="text-xs font-medium truncate">{t.strategies?.[template.key] || template.key}</p>
                          <p className="text-[10px] opacity-70 truncate">{template.prompt.slice(0, 25)}...</p>
                        </div>
                      </Button>
                    ))}
                  </div>
                </div>

                {/* Custom Prompt */}
                <div className="space-y-1">
                  <Label htmlFor="prompt" className="text-xs">{t.customStrategy}</Label>
                  <Textarea
                    id="prompt"
                    rows={3}
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    className="font-mono text-xs"
                    placeholder={t.customStrategyPlaceholder}
                  />
                </div>
              </div>
            </Card>

            {/* AI Model Card */}
            <Card className="p-3">
              <div className="flex items-center gap-2 mb-2">
                <Cpu className="w-4 h-4 text-purple-500" />
                <h4 className="text-sm font-medium">{t.aiConfig}</h4>
              </div>
              <div className="space-y-3">
                {/* AI Model Selection */}
                <div className="space-y-1">
                  <Label htmlFor="aiModel" className="text-xs">{t.aiModel}</Label>
                  <Select value={aiModel} onValueChange={setAiModel}>
                    <SelectTrigger id="aiModel" className="h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="gpt-4">
                        <div className="flex flex-col items-start">
                          <span className="text-sm font-medium">GPT-4 Turbo</span>
                          <span className="text-xs text-muted-foreground">{t.modelGpt4Turbo}</span>
                        </div>
                      </SelectItem>
                      <SelectItem value="gpt-4o">
                        <div className="flex flex-col items-start">
                          <span className="text-sm font-medium">GPT-4o</span>
                          <span className="text-xs text-muted-foreground">{t.modelGpt4Mini}</span>
                        </div>
                      </SelectItem>
                      <SelectItem value="claude-3.5-sonnet">
                        <div className="flex flex-col items-start">
                          <span className="text-sm font-medium">Claude 3.5 Sonnet</span>
                          <span className="text-xs text-muted-foreground">{t.modelClaude3Sonnet}</span>
                        </div>
                      </SelectItem>
                      <SelectItem value="claude-3-opus">
                        <div className="flex flex-col items-start">
                          <span className="text-sm font-medium">Claude 3 Opus</span>
                          <span className="text-xs text-muted-foreground">{t.modelClaude3Opus}</span>
                        </div>
                      </SelectItem>
                      <SelectItem value="gpt-3.5-turbo">
                        <div className="flex flex-col items-start">
                          <span className="text-sm font-medium">GPT-3.5 Turbo</span>
                          <span className="text-xs text-muted-foreground">{t.modelDeepseek}</span>
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Analysis Frequency */}
                <div className="space-y-2">
                  <div className="flex items-center gap-1">
                    <Zap className="w-3 h-3 text-yellow-500" />
                    <Label className="text-xs">{t.analysisFrequency}</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min={1}
                      max={1440}
                      value={analysisInterval}
                      onChange={(e) => setAnalysisInterval(Math.max(1, Math.min(1440, Number(e.target.value) || 1)))}
                      className="w-20 h-8"
                    />
                    <span className="text-xs text-muted-foreground">{t.minutes} (1-1440)</span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    <Button
                      variant={analysisInterval === 1 ? 'default' : 'outline'}
                      onClick={() => setAnalysisInterval(1)}
                      size="sm"
                      className="h-6 px-2 text-xs"
                    >
                      {t.minute1}
                    </Button>
                    <Button
                      variant={analysisInterval === 5 ? 'default' : 'outline'}
                      onClick={() => setAnalysisInterval(5)}
                      size="sm"
                      className="h-6 px-2 text-xs"
                    >
                      {t.minute5}
                    </Button>
                    <Button
                      variant={analysisInterval === 15 ? 'default' : 'outline'}
                      onClick={() => setAnalysisInterval(15)}
                      size="sm"
                      className="h-6 px-2 text-xs"
                    >
                      {t.minute15}
                    </Button>
                    <Button
                      variant={analysisInterval === 60 ? 'default' : 'outline'}
                      onClick={() => setAnalysisInterval(60)}
                      size="sm"
                      className="h-6 px-2 text-xs"
                    >
                      {t.hour1}
                    </Button>
                    <Button
                      variant={analysisInterval === 360 ? 'default' : 'outline'}
                      onClick={() => setAnalysisInterval(360)}
                      size="sm"
                      className="h-6 px-2 text-xs"
                    >
                      {t.hour6}
                    </Button>
                    <Button
                      variant={analysisInterval === 1440 ? 'default' : 'outline'}
                      onClick={() => setAnalysisInterval(1440)}
                      size="sm"
                      className="h-6 px-2 text-xs"
                    >
                      {t.hour24}
                    </Button>
                  </div>
                </div>
              </div>
            </Card>

            {/* Data Sources Card */}
            <Card className="p-3">
              <div className="flex items-center gap-2 mb-2">
                <Database className="w-4 h-4 text-cyan-500" />
                <h4 className="text-sm font-medium">{t.dataSources}</h4>
              </div>
              <div className="space-y-2">
                {/* Core Data - Always enabled */}
                <div className="flex items-center gap-2 px-2 py-1.5 rounded bg-muted/50">
                  <Checkbox checked disabled className="opacity-60" />
                  <div className="flex items-center gap-1.5 flex-1">
                    <BarChart3 className="w-3 h-3 text-blue-500" />
                    <span className="text-xs font-medium">{t.coreData}</span>
                  </div>
                  <span className="text-[10px] text-muted-foreground">{t.coreDataDesc}</span>
                </div>

                {/* Optional Data Sources */}
                <div className="space-y-1.5">
                  <label 
                    className={`flex items-center gap-2 px-2 py-2 rounded border cursor-pointer transition-colors ${dataSources.marketDepth ? 'border-cyan-500 bg-cyan-500/10' : 'border-border hover:border-muted-foreground'}`}
                    onClick={() => toggleDataSource('marketDepth')}
                  >
                    <Checkbox checked={dataSources.marketDepth} />
                    <BarChart3 className="w-3.5 h-3.5 text-green-500 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <span className="text-xs font-medium">{t.marketDepth}</span>
                      <span className="text-[10px] text-muted-foreground ml-1">({t.marketDepthDesc})</span>
                    </div>
                  </label>

                  <label 
                    className={`flex items-center gap-2 px-2 py-2 rounded border cursor-pointer transition-colors ${dataSources.historyData ? 'border-cyan-500 bg-cyan-500/10' : 'border-border hover:border-muted-foreground'}`}
                    onClick={() => toggleDataSource('historyData')}
                  >
                    <Checkbox checked={dataSources.historyData} />
                    <LineChart className="w-3.5 h-3.5 text-yellow-500 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <span className="text-xs font-medium">{t.historyData}</span>
                      <span className="text-[10px] text-muted-foreground ml-1">({t.historyDataDesc})</span>
                    </div>
                  </label>

                  <label 
                    className={`flex items-center gap-2 px-2 py-2 rounded border cursor-pointer transition-colors ${dataSources.relatedEvents ? 'border-cyan-500 bg-cyan-500/10' : 'border-border hover:border-muted-foreground'}`}
                    onClick={() => toggleDataSource('relatedEvents')}
                  >
                    <Checkbox checked={dataSources.relatedEvents} />
                    <Link2 className="w-3.5 h-3.5 text-orange-500 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <span className="text-xs font-medium">{t.relatedEvents}</span>
                      <span className="text-[10px] text-muted-foreground ml-1">({t.relatedEventsDesc})</span>
                    </div>
                  </label>

                  <label 
                    className={`flex items-center gap-2 px-2 py-2 rounded border cursor-pointer transition-colors ${dataSources.technicalIndicators ? 'border-cyan-500 bg-cyan-500/10' : 'border-border hover:border-muted-foreground'}`}
                    onClick={() => toggleDataSource('technicalIndicators')}
                  >
                    <Checkbox checked={dataSources.technicalIndicators} />
                    <TrendingUp className="w-3.5 h-3.5 text-red-500 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <span className="text-xs font-medium">{t.technicalIndicators}</span>
                      <span className="text-[10px] text-muted-foreground ml-1">({t.technicalIndicatorsDesc})</span>
                    </div>
                  </label>

                  <label 
                    className={`flex items-center gap-2 px-2 py-2 rounded border cursor-pointer transition-colors ${dataSources.participantBehavior ? 'border-cyan-500 bg-cyan-500/10' : 'border-border hover:border-muted-foreground'}`}
                    onClick={() => toggleDataSource('participantBehavior')}
                  >
                    <Checkbox checked={dataSources.participantBehavior} />
                    <Users className="w-3.5 h-3.5 text-purple-500 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <span className="text-xs font-medium">{t.participantBehavior}</span>
                      <span className="text-[10px] text-muted-foreground ml-1">({t.participantBehaviorDesc})</span>
                    </div>
                  </label>

                  <label 
                    className={`flex items-center gap-2 px-2 py-2 rounded border cursor-pointer transition-colors ${dataSources.userAccount ? 'border-cyan-500 bg-cyan-500/10' : 'border-border hover:border-muted-foreground'}`}
                    onClick={() => toggleDataSource('userAccount')}
                  >
                    <Checkbox checked={dataSources.userAccount} />
                    <User className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <span className="text-xs font-medium">{t.userAccount}</span>
                      <span className="text-[10px] text-muted-foreground ml-1">({t.userAccountDesc})</span>
                    </div>
                  </label>
                </div>

                {/* Social & News Data Sources */}
                <div className="mt-3 pt-3 border-t border-dashed">
                  <p className="text-xs font-medium mb-2 flex items-center gap-1">
                    🌐 {t.socialData}
                  </p>
                  <div className="space-y-1.5">
                    <label 
                      className={`flex items-center gap-2 px-2 py-2 rounded border cursor-pointer transition-colors ${dataSources.reddit ? 'border-orange-500 bg-orange-500/10' : 'border-border hover:border-muted-foreground'}`}
                      onClick={() => toggleDataSource('reddit')}
                    >
                      <Checkbox checked={dataSources.reddit} />
                      <span className="text-base shrink-0">💬</span>
                      <div className="flex-1 min-w-0">
                        <span className="text-xs font-medium">{t.reddit}</span>
                        <span className="text-[10px] text-muted-foreground ml-1">({t.redditDesc})</span>
                      </div>
                    </label>

                    <label 
                      className={`flex items-center gap-2 px-2 py-2 rounded border cursor-pointer transition-colors ${dataSources.googleNews ? 'border-blue-500 bg-blue-500/10' : 'border-border hover:border-muted-foreground'}`}
                      onClick={() => toggleDataSource('googleNews')}
                    >
                      <Checkbox checked={dataSources.googleNews} />
                      <span className="text-base shrink-0">📰</span>
                      <div className="flex-1 min-w-0">
                        <span className="text-xs font-medium">{t.googleNews}</span>
                        <span className="text-[10px] text-muted-foreground ml-1">({t.googleNewsDesc})</span>
                      </div>
                    </label>
                  </div>
                </div>
              </div>
            </Card>
          </TabsContent>

          {/* Advanced Settings */}
          <TabsContent value="advanced" className="space-y-6 mt-4">
            {/* Risk Management */}
            <Card className="p-4">
              <div className="flex items-center gap-2 mb-4">
                <Shield className="w-5 h-5 text-blue-600" />
                <h4>{t.riskManagement}</h4>
              </div>
              <div className="space-y-4">
                <div>
                  <div className="flex justify-between mb-2">
                    <Label>{t.minConfidence}</Label>
                    <span className="text-sm text-muted-foreground">{minConfidence[0]}%</span>
                  </div>
                  <Slider value={minConfidence} onValueChange={setMinConfidence} min={50} max={95} step={5} />
                </div>

                <div>
                  <div className="flex justify-between mb-2">
                    <Label>{t.maxPosition}</Label>
                    <span className="text-sm text-muted-foreground">{maxPosition[0]}%</span>
                  </div>
                  <Slider value={maxPosition} onValueChange={setMaxPosition} min={10} max={100} step={5} />
                </div>

                <div className="space-y-4">
                  <div>
                    <div className="flex justify-between mb-2">
                      <Label className="flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3 text-red-500" />
                        {t.stopLoss}
                      </Label>
                      <span className="text-sm font-medium text-red-500">{stopLossPrice[0]}%</span>
                    </div>
                    <Slider value={stopLossPrice} onValueChange={setStopLossPrice} min={5} max={50} step={1} />
                  </div>
                  <div>
                    <div className="flex justify-between mb-2">
                      <Label className="flex items-center gap-1">
                        <TrendingUp className="w-3 h-3 text-green-500" />
                        {t.takeProfit}
                      </Label>
                      <span className="text-sm font-medium text-green-500">{takeProfitPrice[0]}%</span>
                    </div>
                    <Slider value={takeProfitPrice} onValueChange={setTakeProfitPrice} min={50} max={500} step={10} />
                  </div>
                </div>
              </div>
            </Card>

            {/* Analysis Weights */}
            <Card className="p-4">
              <div className="flex items-center gap-2 mb-4">
                <Brain className="w-5 h-5 text-purple-600" />
                <h4>{t.analysisWeight}</h4>
              </div>
              <div className="space-y-4">
                <div>
                  <div className="flex justify-between mb-2">
                    <Label>{t.newsWeight}</Label>
                    <span className="text-sm text-muted-foreground">{newsWeight[0]}%</span>
                  </div>
                  <Slider value={newsWeight} onValueChange={setNewsWeight} min={0} max={100} step={5} />
                </div>

                <div>
                  <div className="flex justify-between mb-2">
                    <Label>{t.dataWeight}</Label>
                    <span className="text-sm text-muted-foreground">{dataWeight[0]}%</span>
                  </div>
                  <Slider value={dataWeight} onValueChange={setDataWeight} min={0} max={100} step={5} />
                </div>

                <div>
                  <div className="flex justify-between mb-2">
                    <Label>{t.sentimentWeight}</Label>
                    <span className="text-sm text-muted-foreground">{sentimentWeight[0]}%</span>
                  </div>
                  <Slider value={sentimentWeight} onValueChange={setSentimentWeight} min={0} max={100} step={5} />
                </div>

                <div className="pt-2 border-t">
                  <p className="text-xs text-muted-foreground">
                    {newsWeight[0] + dataWeight[0] + sentimentWeight[0]}% 
                    {newsWeight[0] + dataWeight[0] + sentimentWeight[0] !== 100 && (
                      <span className="text-orange-600 ml-1">({t.analysisWeightDesc})</span>
                    )}
                  </p>
                </div>
              </div>
            </Card>
          </TabsContent>

        </Tabs>

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