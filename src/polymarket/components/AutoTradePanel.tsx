/**
 * 自动交易面板组件
 *
 * 用于管理 Privy Delegated Actions 和 AI 自动交易设置
 *
 * 功能:
 * - 启用/禁用自动交易授权
 * - 显示委托状态
 * - 配置自动交易参数
 */

import React, { useState } from 'react';
import {
  Bot,
  Shield,
  AlertTriangle,
  Check,
  Loader2,
  Settings,
  Zap,
  Info,
} from 'lucide-react';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Badge } from './ui/badge';
import { Switch } from './ui/switch';
import { usePrivyDelegation } from '../../hooks/usePrivyDelegation';

interface AutoTradePanelProps {
  walletAddress: string;
  className?: string;
}

export const AutoTradePanel: React.FC<AutoTradePanelProps> = ({
  walletAddress,
  className = '',
}) => {
  const {
    status,
    requestDelegation,
    revokeDelegation,
    refreshStatus,
  } = usePrivyDelegation();

  const [isEnabling, setIsEnabling] = useState(false);
  const [isDisabling, setIsDisabling] = useState(false);

  const handleEnableDelegation = async () => {
    setIsEnabling(true);
    try {
      await requestDelegation();
    } finally {
      setIsEnabling(false);
    }
  };

  const handleDisableDelegation = async () => {
    setIsDisabling(true);
    try {
      await revokeDelegation();
    } finally {
      setIsDisabling(false);
    }
  };

  return (
    <Card className={`${className}`}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bot className="w-5 h-5 text-purple-500" />
            <CardTitle className="text-base">AI 自动交易</CardTitle>
          </div>
          {status.isDelegated ? (
            <Badge variant="outline" className="bg-green-100 text-green-700 border-green-300">
              <Check className="w-3 h-3 mr-1" />
              已启用
            </Badge>
          ) : (
            <Badge variant="outline" className="bg-gray-100 text-gray-600 border-gray-300">
              未启用
            </Badge>
          )}
        </div>
        <CardDescription className="text-xs">
          启用后，AI 可以根据分析信号自动下单
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* 状态说明 */}
        {status.isLoading ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
            <span className="ml-2 text-sm text-gray-500">加载中...</span>
          </div>
        ) : status.isDelegated ? (
          <>
            {/* 已启用状态 */}
            <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
              <div className="flex items-start gap-2">
                <Shield className="w-4 h-4 text-green-600 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-green-700 dark:text-green-300">
                    自动交易已启用
                  </p>
                  <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                    AI 现在可以根据分析信号自动执行交易。您的私钥安全存储在 Privy 安全飞地中。
                  </p>
                </div>
              </div>
            </div>

            {/* 自动交易设置 */}
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <div className="flex items-center gap-2">
                  <Zap className="w-4 h-4 text-yellow-500" />
                  <span className="text-sm">自动跟单 AI 信号</span>
                </div>
                <Switch defaultChecked />
              </div>

              <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <div className="flex items-center gap-2">
                  <Settings className="w-4 h-4 text-gray-500" />
                  <span className="text-sm">单笔最大金额</span>
                </div>
                <span className="text-sm font-medium">$100</span>
              </div>
            </div>

            {/* 禁用按钮 */}
            <Button
              variant="outline"
              size="sm"
              onClick={handleDisableDelegation}
              disabled={isDisabling}
              className="w-full text-red-600 border-red-300 hover:bg-red-50"
            >
              {isDisabling ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  撤销中...
                </>
              ) : (
                '撤销自动交易授权'
              )}
            </Button>
          </>
        ) : (
          <>
            {/* 未启用状态 */}
            <div className="p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-200 dark:border-purple-800">
              <div className="flex items-start gap-2">
                <Info className="w-4 h-4 text-purple-600 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-purple-700 dark:text-purple-300">
                    如何工作？
                  </p>
                  <ul className="text-xs text-purple-600 dark:text-purple-400 mt-1 space-y-1">
                    <li>• 您授权应用代签交易</li>
                    <li>• 私钥存储在 Privy 安全飞地中</li>
                    <li>• AI 分析产生信号后自动执行</li>
                    <li>• 您可以随时撤销授权</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* 安全提示 */}
            <div className="p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5" />
                <div className="flex-1">
                  <p className="text-xs text-amber-700 dark:text-amber-300">
                    <strong>安全说明：</strong>您的私钥永远不会被开发者或任何第三方访问。
                    签名在 Privy 的安全飞地内完成，私钥立即销毁。
                  </p>
                </div>
              </div>
            </div>

            {/* 启用按钮 */}
            <Button
              onClick={handleEnableDelegation}
              disabled={isEnabling}
              className="w-full bg-purple-500 hover:bg-purple-600"
            >
              {isEnabling ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  授权中...
                </>
              ) : (
                <>
                  <Bot className="w-4 h-4 mr-2" />
                  启用 AI 自动交易
                </>
              )}
            </Button>
          </>
        )}

        {/* 错误提示 */}
        {status.error && (
          <div className="p-2 bg-red-50 dark:bg-red-900/20 rounded-lg">
            <p className="text-xs text-red-600 dark:text-red-400">
              {status.error}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default AutoTradePanel;
