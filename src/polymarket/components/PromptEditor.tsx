import { Card } from './ui/card';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { Label } from './ui/label';
import { Badge } from './ui/badge';
import { Settings, RotateCcw, Save, Sparkles } from 'lucide-react';
import { useState } from 'react';

interface PromptEditorProps {
  prompt: string;
  setPrompt: (prompt: string) => void;
}

const defaultPrompt = "Analyze this Polymarket event considering: 1) Recent news and trends 2) Historical similar events 3) Market sentiment 4) Statistical probability";

const promptTemplates = [
  {
    name: '保守策略',
    description: '注重风险控制，只在高确定性时交易',
    prompt: 'Analyze conservatively focusing on: 1) Risk factors and potential downsides 2) Market manipulation indicators 3) Historical accuracy of similar predictions 4) Only recommend trades with >75% confidence'
  },
  {
    name: '激进策略',
    description: '追求高收益，接受更高风险',
    prompt: 'Analyze aggressively for maximum returns: 1) Identify mispriced markets 2) Early trend detection 3) Contrarian opportunities 4) Recommend trades with >55% confidence'
  },
  {
    name: '新闻驱动',
    description: '基于最新新闻和舆论进行判断',
    prompt: 'Focus on news and sentiment: 1) Latest breaking news impact 2) Social media sentiment analysis 3) Expert opinions and predictions 4) Media bias detection'
  },
  {
    name: '数据驱动',
    description: '纯粹基于统计数据和历史模式',
    prompt: 'Pure quantitative analysis: 1) Historical event outcomes 2) Statistical probability models 3) Market volume and liquidity patterns 4) Price momentum indicators'
  }
];

export function PromptEditor({ prompt, setPrompt }: PromptEditorProps) {
  const [localPrompt, setLocalPrompt] = useState(prompt);
  const [saved, setSaved] = useState(true);

  const handleChange = (value: string) => {
    setLocalPrompt(value);
    setSaved(false);
  };

  const handleSave = () => {
    setPrompt(localPrompt);
    setSaved(true);
  };

  const handleReset = () => {
    setLocalPrompt(defaultPrompt);
    setSaved(false);
  };

  const applyTemplate = (template: typeof promptTemplates[0]) => {
    setLocalPrompt(template.prompt);
    setSaved(false);
  };

  return (
    <div className="space-y-4">
      <Card className="p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-full bg-purple-100 dark:bg-purple-950 flex items-center justify-center">
            <Settings className="w-5 h-5 text-purple-600 dark:text-purple-400" />
          </div>
          <div>
            <h3>自定义分析Prompt</h3>
            <p className="text-sm text-muted-foreground">调整AI分析的重点和策略</p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label htmlFor="prompt">分析指令</Label>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleReset}
                >
                  <RotateCcw className="w-3 h-3 mr-1" />
                  重置
                </Button>
                <Button
                  variant={saved ? "secondary" : "default"}
                  size="sm"
                  onClick={handleSave}
                  disabled={saved}
                >
                  <Save className="w-3 h-3 mr-1" />
                  {saved ? '已保存' : '保存更改'}
                </Button>
              </div>
            </div>
            <Textarea
              id="prompt"
              value={localPrompt}
              onChange={(e) => handleChange(e.target.value)}
              rows={6}
              className="font-mono text-sm"
              placeholder="输入自定义分析指令..."
            />
            <p className="text-xs text-muted-foreground mt-2">
              字符数: {localPrompt.length} | {saved ? '✓ 已保存' : '○ 未保存'}
            </p>
          </div>
        </div>
      </Card>

      {/* Prompt Templates */}
      <Card className="p-6">
        <div className="flex items-center gap-2 mb-4">
          <Sparkles className="w-4 h-4 text-yellow-500" />
          <h3>预设模板</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {promptTemplates.map((template) => (
            <Card
              key={template.name}
              className="p-4 cursor-pointer hover:border-blue-500 transition-all group"
              onClick={() => applyTemplate(template)}
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm">{template.name}</h4>
                  <Badge variant="outline" className="text-xs opacity-0 group-hover:opacity-100 transition-opacity">
                    应用
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {template.description}
                </p>
              </div>
            </Card>
          ))}
        </div>
      </Card>

      {/* Tips */}
      <Card className="p-6 bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800">
        <h4 className="text-sm mb-3">💡 Prompt编写技巧</h4>
        <ul className="text-xs text-muted-foreground space-y-2">
          <li>• 明确指定分析的关键维度（如：新闻、数据、情绪等）</li>
          <li>• 设定置信度阈值来控制交易频率</li>
          <li>• 包含风险偏好和止损策略</li>
          <li>• 可以要求AI解释推理过程，提高透明度</li>
          <li>• 针对特定类型事件（政治/科技/体育）调整侧重点</li>
        </ul>
      </Card>
    </div>
  );
}
