/**
 * API Key 配置对话框
 * 当用户未配置 OpenRouter API Key 时显示
 */

import { useState } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { AlertCircle, Key, ExternalLink, CheckCircle2 } from 'lucide-react';
import { saveApiKey, validateApiKey, API_PROVIDERS, saveApiSource } from '../../utils/apikey';

interface ApiKeyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}

export function ApiKeyDialog({ open, onOpenChange, onSaved }: ApiKeyDialogProps) {
  const [apiKey, setApiKey] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const { user } = usePrivy();
  const userAddress = user?.wallet?.address || null;

  const handleSave = async () => {
    if (!userAddress) {
      setError('请先连接钱包');
      return;
    }

    // 验证 API Key 格式
    const validation = validateApiKey(apiKey, API_PROVIDERS.OPENROUTER);
    if (!validation.valid) {
      setError(validation.message);
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      // 保存 API Key
      const success = saveApiKey(userAddress, apiKey, API_PROVIDERS.OPENROUTER);
      if (success) {
        // 同时设置 API source 为 user
        saveApiSource(userAddress, 'user');
        setSaved(true);
        setTimeout(() => {
          onOpenChange(false);
          setSaved(false);
          setApiKey('');
          if (onSaved) {
            onSaved();
          }
        }, 1000);
      } else {
        setError('保存失败，请重试');
      }
    } catch (err) {
      setError('保存失败，请重试');
    } finally {
      setIsSaving(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setApiKey(e.target.value);
    setError(null);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Key className="w-5 h-5 text-blue-600" />
            配置 OpenRouter API Key
          </DialogTitle>
          <DialogDescription>
            AI 分析功能需要您提供自己的 OpenRouter API Key。
            这是一个一次性设置，您的 API Key 将安全地保存在本地。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* 提示信息 */}
          <div className="p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-200 dark:border-blue-800">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
              <div className="text-sm text-blue-800 dark:text-blue-200">
                <p className="font-medium mb-1">如何获取 API Key：</p>
                <ol className="list-decimal list-inside space-y-1 text-xs">
                  <li>访问 <a href="https://openrouter.ai" target="_blank" rel="noopener noreferrer" className="underline hover:text-blue-600">openrouter.ai</a> 并注册账号</li>
                  <li>在 API Keys 页面创建新的 Key</li>
                  <li>复制 Key 并粘贴到下方输入框</li>
                </ol>
              </div>
            </div>
          </div>

          {/* API Key 输入 */}
          <div className="space-y-2">
            <label className="text-sm font-medium">OpenRouter API Key</label>
            <Input
              type="password"
              placeholder="sk-or-v1-..."
              value={apiKey}
              onChange={handleInputChange}
              disabled={isSaving || saved}
              className={error ? 'border-red-500' : ''}
            />
            {error && (
              <p className="text-xs text-red-600 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />
                {error}
              </p>
            )}
          </div>

          {/* 成功提示 */}
          {saved && (
            <div className="p-3 bg-green-50 dark:bg-green-950/30 rounded-lg border border-green-200 dark:border-green-800">
              <div className="flex items-center gap-2 text-green-700 dark:text-green-300">
                <CheckCircle2 className="w-4 h-4" />
                <span className="text-sm">API Key 已保存成功！</span>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="sm:justify-between">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => window.open('https://openrouter.ai/keys', '_blank')}
            className="text-xs gap-1"
          >
            <ExternalLink className="w-3 h-3" />
            获取 API Key
          </Button>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSaving}
            >
              取消
            </Button>
            <Button
              onClick={handleSave}
              disabled={!apiKey || isSaving || saved}
            >
              {isSaving ? '保存中...' : saved ? '已保存' : '保存'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
