/**
 * Unified Deposit Widget
 *
 * 允许用户从任意链跨链充值到 Solana USDC（用于 DFlow/Kalshi 交易）
 *
 * 核心功能：
 * - 支持多链跨链充值
 * - 自动桥接 + swap 到 Solana USDC
 * - 支持指定目标地址（用户的 Solana 钱包）
 */

import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { LiFiWidget, ChainType, useWidgetEvents, WidgetEvent } from '@lifi/widget';
import { X, Loader2, Check, AlertCircle, ArrowLeftRight } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

// 全局样式：提高 LI.FI 钱包弹窗的 z-index
const LIFI_STYLE_ID = 'lifi-deposit-zindex-fix';
const injectLiFiStyles = () => {
  if (document.getElementById(LIFI_STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = LIFI_STYLE_ID;
  style.textContent = `
    /* LI.FI Widget 内部弹窗 z-index 修复 */
    .MuiModal-root,
    .MuiDrawer-root,
    .MuiDialog-root,
    .MuiPopover-root,
    [class*="lifi"],
    [class*="widget"] .MuiModal-root,
    [data-testid="widget-drawer"],
    [role="presentation"] {
      z-index: 999999 !important;
    }

    .MuiBackdrop-root {
      z-index: 999998 !important;
    }

    .MuiModal-root *,
    .MuiDialog-root *,
    [role="dialog"] * {
      pointer-events: auto !important;
    }

    .MuiPaper-root {
      z-index: 999999 !important;
    }

    /* Fix focus trap conflict between LiFi/MUI and Radix FocusScope */
    /* When LiFi modal is open, prevent Radix from fighting for focus */
    .MuiModal-root[aria-hidden="false"] ~ [data-radix-focus-guard],
    .MuiPopover-root[aria-hidden="false"] ~ [data-radix-focus-guard] {
      display: none !important;
    }

    /* Disable focus containment polling that causes infinite loop */
    [data-focus-lock-disabled="false"] {
      --focus-lock-return-focus: none;
    }
  `;
  document.head.appendChild(style);
};

// Solana USDC 合约地址
const SOLANA_USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

// Solana RPC URL - 前端使用 PublicNode 免费 RPC
const SOLANA_RPC_URL = import.meta.env.VITE_SOLANA_RPC_URL || 'https://solana-rpc.publicnode.com';

// LiFi Solana chain ID
const LIFI_SOLANA_CHAIN_ID = 1151111081099710;

// 步骤状态
const STEPS = {
  WIDGET: 'widget',
  PROCESSING: 'processing',
  SUCCESS: 'success',
  ERROR: 'error',
};

const UnifiedDepositWidget = ({
  isOpen,
  onClose,
  language = 'zh',
  defaultTarget = 'kalshi',
  destinationAddress,
  onSuccess,
}) => {
  const { accessToken } = useAuth();

  const [step, setStep] = useState(STEPS.WIDGET);
  const [error, setError] = useState(null);
  const [txInfo, setTxInfo] = useState(null);

  // LiFi Widget form ref
  const formRef = useRef(null);

  // 存储最新的回调函数引用
  const handlersRef = useRef({
    onCompleted: null,
    onFailed: null,
  });

  // LiFi Widget 事件处理
  const widgetEvents = useWidgetEvents();

  // 注入样式
  useEffect(() => {
    if (isOpen) {
      injectLiFiStyles();
    }
  }, [isOpen]);

  // 调试日志
  useEffect(() => {
    if (isOpen) {
      console.log('[UnifiedDeposit] Set toAddress:', destinationAddress);
    }
  }, [isOpen, destinationAddress]);

  // 通过 formRef 设置目标地址
  useEffect(() => {
    if (!isOpen || !destinationAddress) return;

    let attempts = 0;
    const maxAttempts = 20;

    const checkAndSetAddress = () => {
      attempts++;
      if (formRef.current?.setFieldValue) {
        try {
          formRef.current.setFieldValue('toAddress', {
            address: destinationAddress,
            chainType: ChainType.SVM, // Solana
          });
          console.log('[UnifiedDeposit] Set toAddress via formRef:', destinationAddress);
          return true;
        } catch (err) {
          console.error('[UnifiedDeposit] Failed to set toAddress:', err);
        }
      }
      return false;
    };

    const intervalId = setInterval(() => {
      if (checkAndSetAddress() || attempts >= maxAttempts) {
        clearInterval(intervalId);
        if (attempts >= maxAttempts) {
          console.warn('[UnifiedDeposit] Could not set toAddress after', maxAttempts, 'attempts');
        }
      }
    }, 250);

    return () => clearInterval(intervalId);
  }, [isOpen, destinationAddress]);

  // LI.FI Widget 配置 - 目标是 Solana USDC
  const widgetConfig = useMemo(() => {
    console.log('[UnifiedDeposit] Creating config for Solana USDC');
    console.log('[UnifiedDeposit] Using Solana RPC:', SOLANA_RPC_URL);

    return {
      integrator: 'PromptTrading',

      // 目标：Solana USDC
      toChain: LIFI_SOLANA_CHAIN_ID,
      toToken: SOLANA_USDC,

      // 禁用目标代币修改
      disabledUI: ['toToken'],

      // SDK 配置 - 使用自定义 RPC 避免 403 错误
      sdkConfig: {
        rpcUrls: {
          [LIFI_SOLANA_CHAIN_ID]: [SOLANA_RPC_URL],
        },
      },

      // 外观配置
      appearance: 'auto',
      theme: {
        container: {
          borderRadius: '16px',
          zIndex: 10000,
        },
      },

      variant: 'compact',
      subvariant: 'split',

      walletConfig: {
        walletConnect: {
          projectId: import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || '',
        },
      },
    };
  }, []);

  // 路由执行完成回调
  const handleRouteExecutionCompleted = useCallback(async (route) => {
    console.log('[UnifiedDeposit] Route completed:', route);

    try {
      setStep(STEPS.PROCESSING);

      // 获取交易信息
      const lastStep = route.steps[route.steps.length - 1];
      let destTxHash = null;

      if (lastStep?.execution?.process && lastStep.execution.process.length > 0) {
        const doneProcess = lastStep.execution.process.find(p => p.status === 'DONE' && p.txHash);
        if (doneProcess) {
          destTxHash = doneProcess.txHash;
        }
      }

      const toAmountNumber = Number(route.toAmount) / 1e6; // USDC 6 decimals

      setTxInfo({
        txHash: destTxHash,
        amount: toAmountNumber,
        toChain: route.toChainId,
      });

      setStep(STEPS.SUCCESS);

      // 调用成功回调
      if (onSuccess) {
        onSuccess({
          txHash: destTxHash,
          amount: toAmountNumber,
        });
      }

    } catch (err) {
      console.error('[UnifiedDeposit] Error:', err);
      setError(err.message);
      setStep(STEPS.ERROR);
    }
  }, [onSuccess]);

  // 路由执行失败回调
  const handleRouteExecutionFailed = useCallback((route) => {
    console.error('[UnifiedDeposit] Route failed:', route);
    setError(language === 'zh' ? '跨链交易失败，请重试' : 'Cross-chain transaction failed, please retry');
    setStep(STEPS.ERROR);
  }, [language]);

  // 更新 handlersRef
  handlersRef.current.onCompleted = handleRouteExecutionCompleted;
  handlersRef.current.onFailed = handleRouteExecutionFailed;

  // 订阅 LiFi Widget 事件
  useEffect(() => {
    console.log('[UnifiedDeposit] Setting up event listeners');

    const unsubscribeCompleted = widgetEvents.on(
      WidgetEvent.RouteExecutionCompleted,
      (route) => handlersRef.current.onCompleted?.(route)
    );

    const unsubscribeFailed = widgetEvents.on(
      WidgetEvent.RouteExecutionFailed,
      (route) => handlersRef.current.onFailed?.(route)
    );

    return () => {
      unsubscribeCompleted?.();
      unsubscribeFailed?.();
    };
  }, [widgetEvents]);

  // Fix focus trap conflict between LiFi/MUI and Radix
  // Detect and break infinite focus loop by preventing rapid focus cycling
  useEffect(() => {
    if (!isOpen) return;

    let lastFocusTime = 0;
    let focusCount = 0;
    const FOCUS_THRESHOLD = 10; // Max focus events in 100ms
    const RESET_INTERVAL = 100;

    const handleFocusIn = (e) => {
      const now = Date.now();
      if (now - lastFocusTime < RESET_INTERVAL) {
        focusCount++;
        if (focusCount > FOCUS_THRESHOLD) {
          // Focus loop detected - break it by temporarily disabling focus containment
          console.warn('[UnifiedDeposit] Focus loop detected, breaking...');
          e.stopPropagation();
          e.preventDefault();
          // Reset after a short delay
          setTimeout(() => { focusCount = 0; }, 200);
        }
      } else {
        focusCount = 1;
      }
      lastFocusTime = now;
    };

    document.addEventListener('focusin', handleFocusIn, true);
    return () => {
      document.removeEventListener('focusin', handleFocusIn, true);
    };
  }, [isOpen]);

  // 关闭处理
  const handleClose = useCallback(() => {
    setStep(STEPS.WIDGET);
    setError(null);
    setTxInfo(null);
    onClose();
  }, [onClose]);

  if (!isOpen) return null;

  // 检查配置
  if (!destinationAddress) {
    return (
      <div className="fixed inset-0 bg-black/50 z-[9998] flex items-center justify-center">
        <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 max-w-md">
          <div className="flex items-center gap-3 text-red-500 mb-4">
            <AlertCircle size={24} />
            <h3 className="font-semibold">
              {language === 'zh' ? '配置错误' : 'Configuration Error'}
            </h3>
          </div>
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            {language === 'zh'
              ? '请先连接 Solana 钱包'
              : 'Please connect a Solana wallet first'}
          </p>
          <button
            onClick={onClose}
            className="w-full py-2 bg-gray-200 dark:bg-gray-700 rounded-lg"
          >
            {language === 'zh' ? '关闭' : 'Close'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* 背景遮罩 */}
      <div
        className="fixed inset-0 bg-black/50 z-[50000]"
        onClick={handleClose}
        style={{ pointerEvents: 'auto' }}
      />

      {/* 主容器 */}
      <div className="fixed inset-0 z-[50001] flex items-center justify-center p-4 pointer-events-none">
        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 w-full max-w-lg max-h-[90vh] overflow-hidden pointer-events-auto">

          {/* 头部 */}
          <div className="flex items-center justify-between px-5 py-4 bg-gradient-to-r from-green-500 to-teal-600 text-white">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                <ArrowLeftRight size={20} />
              </div>
              <div>
                <h3 className="font-semibold text-lg">
                  {language === 'zh' ? '充值 USDC' : 'Deposit USDC'}
                </h3>
                <p className="text-white/80 text-xs">
                  {language === 'zh'
                    ? '跨链充值到 Solana 钱包'
                    : 'Cross-chain deposit to Solana wallet'}
                </p>
              </div>
            </div>
            <button
              onClick={handleClose}
              className="p-2 hover:bg-white/20 rounded-lg transition-colors"
            >
              <X size={20} />
            </button>
          </div>

          {/* 内容区域 */}
          <div className="p-4">

            {/* Widget 步骤 */}
            {step === STEPS.WIDGET && (
              <div className="min-h-[400px]">
                {/* 提示信息 */}
                <div className="mb-4 p-3 bg-green-50 dark:bg-green-500/10 border border-green-200 dark:border-green-500/30 rounded-xl">
                  <p className="text-green-600 dark:text-green-400 text-sm">
                    {language === 'zh'
                      ? '选择源链和代币，资金将自动跨链到 Solana 并转换为 USDC'
                      : 'Select source chain and token, funds will be automatically bridged to Solana and converted to USDC'}
                  </p>
                </div>

                {/* LI.FI Widget */}
                <LiFiWidget
                  formRef={formRef}
                  config={widgetConfig}
                  integrator="PromptTrading"
                />

                {/* 目标信息 */}
                <div className="mt-4 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-xl text-sm">
                  <div className="flex justify-between text-gray-600 dark:text-gray-400">
                    <span>{language === 'zh' ? '目标链' : 'Target Chain'}</span>
                    <span className="font-medium">Solana (USDC)</span>
                  </div>
                  <div className="flex justify-between text-gray-600 dark:text-gray-400 mt-1">
                    <span>{language === 'zh' ? '收款地址' : 'Receiver'}</span>
                    <span className="font-mono text-xs">
                      {destinationAddress.slice(0, 6)}...{destinationAddress.slice(-4)}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* 处理中 */}
            {step === STEPS.PROCESSING && (
              <div className="py-12 text-center">
                <Loader2 className="w-16 h-16 text-green-500 animate-spin mx-auto mb-4" />
                <h4 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                  {language === 'zh' ? '处理中...' : 'Processing...'}
                </h4>
                <p className="text-gray-500 dark:text-gray-400 text-sm">
                  {language === 'zh'
                    ? '跨链交易需要几分钟，请耐心等待'
                    : 'Cross-chain transactions take a few minutes, please wait'}
                </p>
              </div>
            )}

            {/* 成功 */}
            {step === STEPS.SUCCESS && (
              <div className="py-12 text-center">
                <div className="w-16 h-16 bg-green-100 dark:bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Check className="w-8 h-8 text-green-600 dark:text-green-400" />
                </div>
                <h4 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                  {language === 'zh' ? '充值成功！' : 'Deposit Successful!'}
                </h4>

                {txInfo?.amount && (
                  <div className="bg-green-50 dark:bg-green-500/10 border border-green-200 dark:border-green-500/30 rounded-xl p-4 mb-4">
                    <p className="text-green-700 dark:text-green-300 text-sm">
                      {language === 'zh' ? '充值金额' : 'Amount'}:
                      <span className="font-bold ml-2">
                        +${txInfo.amount.toFixed(2)} USDC
                      </span>
                    </p>
                  </div>
                )}

                {txInfo?.txHash && (
                  <a
                    href={`https://solscan.io/tx/${txInfo.txHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-green-500 hover:text-green-600 text-xs underline mb-4 block"
                  >
                    {language === 'zh' ? '查看交易详情' : 'View Transaction'}
                  </a>
                )}

                <button
                  onClick={handleClose}
                  className="w-full py-3 bg-green-600 hover:bg-green-700 text-white rounded-xl font-medium transition-all"
                >
                  {language === 'zh' ? '完成' : 'Done'}
                </button>
              </div>
            )}

            {/* 错误 */}
            {step === STEPS.ERROR && (
              <div className="py-12 text-center">
                <div className="w-16 h-16 bg-red-100 dark:bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                  <AlertCircle className="w-8 h-8 text-red-600 dark:text-red-400" />
                </div>
                <h4 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                  {language === 'zh' ? '充值失败' : 'Deposit Failed'}
                </h4>
                <p className="text-red-500 text-sm mb-6">{error}</p>

                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      setStep(STEPS.WIDGET);
                      setError(null);
                    }}
                    className="flex-1 py-3 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-xl font-medium"
                  >
                    {language === 'zh' ? '重试' : 'Retry'}
                  </button>
                  <button
                    onClick={handleClose}
                    className="flex-1 py-3 bg-gray-900 dark:bg-white hover:bg-gray-800 text-white dark:text-gray-900 rounded-xl font-medium"
                  >
                    {language === 'zh' ? '关闭' : 'Close'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

export default UnifiedDepositWidget;
