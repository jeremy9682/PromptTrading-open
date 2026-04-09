/**
 * LI.FI 跨链充值组件
 *
 * 允许用户从任意链、任意钱包直接跨链充值到平台
 *
 * 核心功能：
 * - 支持多链跨链充值（Arbitrum, Base, Ethereum, Optimism 等）
 * - 支持多种钱包（MetaMask, WalletConnect, Privy 等）
 * - 自动桥接 + swap 到 Polygon USDC.e
 * - 交易完成后自动提交后端验证
 */

import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { LiFiWidget, ChainType, useWidgetEvents, WidgetEvent } from '@lifi/widget';
import { X, Loader2, Check, AlertCircle, ArrowLeftRight, GripHorizontal } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { verifyTransaction } from '../../services/credits.service';
import { safeLog } from '../../utils/security.utils';

// 全局样式：提高 LI.FI 钱包弹窗的 z-index
const LIFI_STYLE_ID = 'lifi-zindex-fix-v2';  // 版本更新，强制刷新
const injectLiFiStyles = () => {
  // 移除旧版本样式
  const oldStyle = document.getElementById('lifi-zindex-fix');
  if (oldStyle) oldStyle.remove();

  if (document.getElementById(LIFI_STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = LIFI_STYLE_ID;
  style.textContent = `
    /* LI.FI Widget 内部弹窗（警告、钱包连接等）z-index 修复 */
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

    /* LI.FI 遮罩层 - 需要比我们的 modal 高 */
    .MuiBackdrop-root {
      z-index: 999998 !important;
    }

    /* 确保 LI.FI 内部弹窗按钮可点击 */
    .MuiModal-root *,
    .MuiDialog-root *,
    [role="dialog"] * {
      pointer-events: auto !important;
    }

    /* LI.FI Alert/Warning 弹窗 */
    .MuiPaper-root {
      z-index: 999999 !important;
    }
  `;
  document.head.appendChild(style);
};

// 平台收款地址（与 RechargeModal 保持一致）
const PLATFORM_RECEIVER = import.meta.env.VITE_PLATFORM_RECEIVER || '';

// Polygon USDC.e 合约地址
const POLYGON_USDC_E = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174';

// Solana RPC URL - 前端使用 PublicNode 免费 RPC
const SOLANA_RPC_URL = import.meta.env.VITE_SOLANA_RPC_URL || 'https://solana-rpc.publicnode.com';
const LIFI_SOLANA_CHAIN_ID = 1151111081099710;

// ============================================
// 模块级别状态（跨组件实例和 HMR 持久化）
// 防止多个组件实例或 HMR 热更新导致重复处理
// ============================================
const globalProcessedRoutes = new Set();
let globalProcessingLock = false;

// 状态
const STEPS = {
  WIDGET: 'widget',       // 显示 Widget
  PROCESSING: 'processing', // 处理中
  SUCCESS: 'success',     // 成功
  ERROR: 'error',         // 错误
};

const LiFiRechargeWidget = ({
  isOpen,
  onClose,
  language = 'zh',
  onSuccess,
  initialBalance,
}) => {
  const { accessToken, user, embeddedWalletAddress } = useAuth();

  const [step, setStep] = useState(STEPS.WIDGET);
  const [error, setError] = useState(null);
  const [txInfo, setTxInfo] = useState(null);
  const [newBalance, setNewBalance] = useState(null);
  const [orderId, setOrderId] = useState(null);

  // 拖拽状态
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const modalRef = useRef(null);

  // LiFi Widget form ref - 用于设置表单值
  const formRef = useRef(null);

  // 存储最新的回调函数引用，避免 useEffect 依赖变化
  const handlersRef = useRef({
    onCompleted: null,
    onFailed: null,
  });

  // LiFi Widget 事件处理 - 使用 useWidgetEvents hook
  const widgetEvents = useWidgetEvents();

  // 注入 LI.FI z-index 修复样式
  useEffect(() => {
    if (isOpen) {
      injectLiFiStyles();
    }
  }, [isOpen]);

  // 初始化位置（居中）
  useEffect(() => {
    if (isOpen && modalRef.current) {
      const rect = modalRef.current.getBoundingClientRect();
      setPosition({
        x: (window.innerWidth - rect.width) / 2,
        y: (window.innerHeight - rect.height) / 2,
      });
    }
  }, [isOpen]);

  // 拖拽处理
  const handleMouseDown = (e) => {
    if (e.target.closest('.no-drag')) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
  };

  const handleMouseMove = useCallback((e) => {
    if (!isDragging) return;
    const maxX = window.innerWidth - (modalRef.current?.offsetWidth || 500);
    const maxY = window.innerHeight - (modalRef.current?.offsetHeight || 600);
    setPosition({
      x: Math.max(0, Math.min(e.clientX - dragStart.x, maxX)),
      y: Math.max(0, Math.min(e.clientY - dragStart.y, maxY)),
    });
  }, [isDragging, dragStart]);

  const handleMouseUp = useCallback(() => setIsDragging(false), []);

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  // 调试：打印平台地址
  useEffect(() => {
    console.log('[LiFi Widget] PLATFORM_RECEIVER:', PLATFORM_RECEIVER);
    console.log('[LiFi Widget] ENV:', import.meta.env.VITE_PLATFORM_RECEIVER);
  }, []);

  // 通过 formRef 设置目标地址（widget 初始化后）
  useEffect(() => {
    if (!isOpen || !PLATFORM_RECEIVER) return;

    // 使用 interval 来等待 formRef 可用
    let attempts = 0;
    const maxAttempts = 20; // 最多尝试 20 次，每次 250ms

    const checkAndSetAddress = () => {
      attempts++;
      if (formRef.current?.setFieldValue) {
        try {
          formRef.current.setFieldValue('toAddress', {
            address: PLATFORM_RECEIVER,
            chainType: ChainType.EVM,
          });
          console.log('[LiFi Widget] ✅ Set toAddress via formRef:', PLATFORM_RECEIVER);
          return true;
        } catch (err) {
          console.error('[LiFi Widget] Failed to set toAddress:', err);
        }
      }
      return false;
    };

    const intervalId = setInterval(() => {
      if (checkAndSetAddress() || attempts >= maxAttempts) {
        clearInterval(intervalId);
        if (attempts >= maxAttempts) {
          console.warn('[LiFi Widget] Could not set toAddress after', maxAttempts, 'attempts');
        }
      }
    }, 250);

    return () => clearInterval(intervalId);
  }, [isOpen]);

  // LI.FI Widget 配置
  // 注意：toAddress 通过 formRef.setFieldValue 设置，不在 config 中
  const widgetConfig = useMemo(() => {
    console.log('[LiFi Widget] Creating config (toAddress will be set via formRef)');

    return {
      // 集成商标识
      integrator: 'PromptTrading',

      // 固定目标：Polygon USDC.e（toAddress 通过 formRef 设置）
      toChain: 137,  // Polygon
      toToken: POLYGON_USDC_E,

      // 禁用目标代币修改
      disabledUI: ['toToken'],

      // SDK 配置 - 使用自定义 Solana RPC 避免 403 错误（跨链时需要）
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

      // 变体：紧凑模式
      variant: 'compact',
      subvariant: 'split',

      // 钱包管理配置 - 提高弹窗 z-index
      walletConfig: {
        walletConnect: {
          projectId: import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || '',
        },
      },
    };
  }, []);

  // 验证交易并充值 (txHash-first 模式)
  // 使用新的 verify-tx API，一步完成验证+创建订单+充值
  const verifyAndCredit = useCallback(async (destTxHash) => {
    if (!accessToken) {
      throw new Error(language === 'zh' ? '请先登录' : 'Please login first');
    }

    if (!destTxHash) {
      throw new Error('Missing txHash');
    }

    console.log('[LiFi] Verifying transaction (txHash-first):', destTxHash);

    // 使用重试机制（跨链交易可能需要等待确认）
    let verifyResult = null;
    let retries = 0;
    const maxRetries = 10;  // 跨链可能需要更长时间
    const retryDelay = 15000;  // 15秒

    while (retries < maxRetries) {
      verifyResult = await verifyTransaction(accessToken, destTxHash, 'polygon');

      if (verifyResult.success) {
        console.log('[LiFi] Verification successful:', verifyResult);
        return verifyResult;
      }

      // 如果是 pending 状态（交易还在等待确认），等待后重试
      const isPending = verifyResult.data?.pending ||
                        verifyResult.pending ||
                        verifyResult.error?.includes('not yet mined') ||
                        verifyResult.error?.includes('pending');

      if (isPending) {
        retries++;
        if (retries < maxRetries) {
          safeLog.info('[LiFi]', `交易待确认，${retryDelay/1000}秒后重试 (${retries}/${maxRetries})`);
          await new Promise(resolve => setTimeout(resolve, retryDelay));
          continue;
        }
      }

      // 其他错误直接退出
      console.log('[LiFi] Verification failed:', verifyResult);
      break;
    }

    return verifyResult;
  }, [accessToken, language]);

  // 路由执行完成回调
  const handleRouteExecutionCompleted = useCallback(async (route) => {
    // 防止同一个 route 被重复处理（React Strict Mode、事件重复触发或 HMR）
    const routeId = route?.id;
    if (!routeId) {
      console.log('[LiFi] No route ID, skipping');
      return;
    }

    // 使用模块级别的全局 Set 检查，防止跨组件实例的重复处理
    if (globalProcessedRoutes.has(routeId)) {
      console.log('[LiFi] Route already processed (global), skipping:', routeId);
      return;
    }

    // 检查全局处理锁
    if (globalProcessingLock) {
      console.log('[LiFi] Another route is being processed (global lock), skipping:', routeId);
      return;
    }

    // 立即标记为已处理和锁定，防止竞态条件
    // 使用全局状态确保跨所有组件实例
    globalProcessedRoutes.add(routeId);
    globalProcessingLock = true;
    console.log('[LiFi] Processing route (global):', routeId);

    try {
      safeLog.info('[LiFi]', '路由执行完成', {
        fromChain: route.fromChainId,
        toChain: route.toChainId,
        fromAmount: route.fromAmount,
        toAmount: route.toAmount,
      });

      setStep(STEPS.PROCESSING);

      // 调试：打印完整的 route 结构以找到 txHash
      console.log('[LiFi] Full route structure:', JSON.stringify(route, null, 2));
      console.log('[LiFi] Route steps:', route.steps);

      // 获取目标链 txHash（Polygon）
      // LiFi 的 txHash 可能在多个位置：
      // 1. step.execution.process[].txHash
      // 2. step.execution.txHash (旧版)
      const lastStep = route.steps[route.steps.length - 1];
      let destTxHash = null;

      // 尝试从 process 数组获取 txHash
      if (lastStep?.execution?.process && lastStep.execution.process.length > 0) {
        // 找到状态为 DONE 的 process 并获取其 txHash
        const doneProcess = lastStep.execution.process.find(p => p.status === 'DONE' && p.txHash);
        if (doneProcess) {
          destTxHash = doneProcess.txHash;
          console.log('[LiFi] Found txHash in process (DONE):', destTxHash);
        } else {
          // 如果没有 DONE 的，取最后一个有 txHash 的 process
          for (let i = lastStep.execution.process.length - 1; i >= 0; i--) {
            if (lastStep.execution.process[i].txHash) {
              destTxHash = lastStep.execution.process[i].txHash;
              console.log('[LiFi] Found txHash in process (last with txHash):', destTxHash);
              break;
            }
          }
        }
      }

      // 备用：直接从 execution.txHash 获取
      if (!destTxHash && lastStep?.execution?.txHash) {
        destTxHash = lastStep.execution.txHash;
        console.log('[LiFi] Found txHash in execution.txHash:', destTxHash);
      }

      // 如果是同链 swap，尝试从第一个 step 获取
      if (!destTxHash && route.steps.length > 0) {
        for (const step of route.steps) {
          if (step.execution?.process) {
            for (const proc of step.execution.process) {
              if (proc.txHash) {
                destTxHash = proc.txHash;
                console.log('[LiFi] Found txHash from step process:', destTxHash);
                break;
              }
            }
          }
          if (destTxHash) break;
        }
      }

      const destChain = route.toChainId;

      // 获取源链信息
      const firstStep = route.steps[0];
      let sourceTxHash = null;
      if (firstStep?.execution?.process && firstStep.execution.process.length > 0) {
        sourceTxHash = firstStep.execution.process[0]?.txHash;
      }
      if (!sourceTxHash && firstStep?.execution?.txHash) {
        sourceTxHash = firstStep.execution.txHash;
      }
      const sourceChain = route.fromChainId;

      console.log('[LiFi] Extracted txHashes:', { destTxHash, sourceTxHash });

      // 计算实际到账金额（USDC.e 6位小数）
      const toAmountNumber = Number(route.toAmount) / 1e6;

      setTxInfo({
        sourceTxHash,
        sourceChain,
        destTxHash,
        destChain,
        amount: toAmountNumber,
      });

      // 使用新的 txHash-first 模式：直接验证并充值
      // 不再需要先创建订单
      safeLog.info('[LiFi]', '验证交易并充值 (txHash-first)', { destTxHash });
      const verifyResult = await verifyAndCredit(destTxHash);

      if (verifyResult?.success) {
        // 成功时数据在 data 中
        const resultData = verifyResult.data || verifyResult;
        const actualCredits = resultData.creditsAmount || toAmountNumber;
        const balance = resultData.newBalance;

        setOrderId(resultData.orderId);
        setNewBalance(balance);
        // 更新 txInfo 中的 amount 为后端返回的实际充值金额
        setTxInfo(prev => ({ ...prev, amount: actualCredits }));
        setStep(STEPS.SUCCESS);

        safeLog.info('[LiFi]', '充值成功', {
          orderId: resultData.orderId,
          newBalance: balance,
          actualCredits: actualCredits,
          alreadyProcessed: resultData.alreadyProcessed || false,
        });
      } else {
        // 失败时错误信息可能在 data.error 或 error
        const errorMessage = verifyResult?.data?.error || verifyResult?.error || 'Verification failed';
        console.log('[LiFi] Verification failed, full response:', verifyResult);
        throw new Error(errorMessage);
      }

    } catch (err) {
      safeLog.error('[LiFi]', '充值失败', { message: err.message });
      setError(err.message);
      setStep(STEPS.ERROR);
    } finally {
      // 释放全局处理锁
      globalProcessingLock = false;
    }
  }, [verifyAndCredit]);

  // 路由执行失败回调
  const handleRouteExecutionFailed = useCallback((route) => {
    safeLog.error('[LiFi]', '路由执行失败', {
      fromChain: route.fromChainId,
      toChain: route.toChainId,
    });
    setError(language === 'zh' ? '跨链交易失败，请重试' : 'Cross-chain transaction failed, please retry');
    setStep(STEPS.ERROR);
  }, [language]);

  // 更新 handlersRef 以保持最新的回调函数
  handlersRef.current.onCompleted = handleRouteExecutionCompleted;
  handlersRef.current.onFailed = handleRouteExecutionFailed;

  // 订阅 LiFi Widget 事件（只在 widgetEvents 变化时重新订阅）
  useEffect(() => {
    console.log('[LiFi Widget] Setting up event listeners via useWidgetEvents hook');

    // 订阅路由执行完成事件 - 使用 ref 调用最新的处理函数
    const unsubscribeCompleted = widgetEvents.on(
      WidgetEvent.RouteExecutionCompleted,
      (route) => {
        console.log('[LiFi Widget] WidgetEvent.RouteExecutionCompleted triggered!', route);
        handlersRef.current.onCompleted?.(route);
      }
    );

    // 订阅路由执行失败事件 - 使用 ref 调用最新的处理函数
    const unsubscribeFailed = widgetEvents.on(
      WidgetEvent.RouteExecutionFailed,
      (route) => {
        console.log('[LiFi Widget] WidgetEvent.RouteExecutionFailed triggered!', route);
        handlersRef.current.onFailed?.(route);
      }
    );

    // 订阅路由执行开始事件（用于调试）
    const unsubscribeStarted = widgetEvents.on(
      WidgetEvent.RouteExecutionStarted,
      (route) => {
        console.log('[LiFi Widget] WidgetEvent.RouteExecutionStarted:', route?.id);
      }
    );

    // 订阅路由执行更新事件（用于调试）
    const unsubscribeUpdated = widgetEvents.on(
      WidgetEvent.RouteExecutionUpdated,
      (route) => {
        console.log('[LiFi Widget] WidgetEvent.RouteExecutionUpdated:', route?.id, route?.steps?.[0]?.execution?.status);
      }
    );

    // 清理订阅
    return () => {
      console.log('[LiFi Widget] Cleaning up event listeners');
      unsubscribeCompleted?.();
      unsubscribeFailed?.();
      unsubscribeStarted?.();
      unsubscribeUpdated?.();
    };
    // 注意：handlers 通过 ref 访问，不需要放在依赖数组中
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [widgetEvents]);

  // 关闭处理
  const handleClose = useCallback(() => {
    if (step === STEPS.SUCCESS && onSuccess) {
      onSuccess(newBalance);
    }
    // 重置状态
    setStep(STEPS.WIDGET);
    setError(null);
    setTxInfo(null);
    setNewBalance(null);
    setOrderId(null);
    // 清除全局已处理的路由记录和锁，允许新的交易
    globalProcessedRoutes.clear();
    globalProcessingLock = false;
    onClose();
  }, [step, newBalance, onSuccess, onClose]);

  if (!isOpen) return null;

  // 检查配置
  if (!PLATFORM_RECEIVER) {
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
              ? '平台收款地址未配置，请联系管理员'
              : 'Platform receiver not configured, please contact admin'}
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
      {/* 背景遮罩 - 使用较低的 z-index，让 LiFi 弹窗显示在上层 */}
      <div
        className="fixed inset-0 bg-black/50 z-[50000]"
        onClick={handleClose}
        style={{ pointerEvents: 'auto' }}
      />

      {/* 主容器 - 使用绝对定位支持拖拽 */}
      <div
        ref={modalRef}
        className="fixed z-[50001] w-[480px] max-w-[95vw] bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden"
        style={{ left: position.x, top: position.y, cursor: isDragging ? 'grabbing' : 'default' }}
      >
        {/* 头部 - 可拖拽区域 */}
        <div
          className="flex items-center justify-between px-5 py-4 bg-gradient-to-r from-purple-500 to-blue-600 text-white cursor-grab select-none"
          onMouseDown={handleMouseDown}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
              <ArrowLeftRight size={20} />
            </div>
            <div>
              <h3 className="font-semibold text-lg">
                {language === 'zh' ? '跨链充值' : 'Cross-Chain Recharge'}
              </h3>
              <p className="text-white/80 text-xs flex items-center gap-1">
                <GripHorizontal size={12} />
                {language === 'zh' ? '拖拽移动' : 'Drag to move'}
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="no-drag p-2 hover:bg-white/20 rounded-lg transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* 内容区域 */}
        <div className="p-4 no-drag max-h-[70vh] overflow-y-auto">
          {/* Widget 步骤 */}
          {step === STEPS.WIDGET && (
            <div className="min-h-[400px]">
              {/* 提示信息 */}
              <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/30 rounded-xl">
                <p className="text-blue-600 dark:text-blue-400 text-sm">
                  {language === 'zh'
                    ? '选择源链和代币，资金将自动跨链到 Polygon 并转换为 USDC.e'
                    : 'Select source chain and token, funds will be automatically bridged to Polygon and converted to USDC.e'}
                </p>
              </div>

              {/* LI.FI Widget - 事件通过 widgetEvents 在 config 中处理 */}
              <LiFiWidget
                formRef={formRef}
                config={widgetConfig}
                integrator="PromptTrading"
              />

              {/* 目标信息 */}
              <div className="mt-4 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-xl text-sm">
                <div className="flex justify-between text-gray-600 dark:text-gray-400">
                  <span>{language === 'zh' ? '目标链' : 'Target Chain'}</span>
                  <span className="font-medium">Polygon (USDC.e)</span>
                </div>
                <div className="flex justify-between text-gray-600 dark:text-gray-400 mt-1">
                  <span>{language === 'zh' ? '收款地址' : 'Receiver'}</span>
                  <span className="font-mono text-xs">
                    {PLATFORM_RECEIVER.slice(0, 6)}...{PLATFORM_RECEIVER.slice(-4)}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* 处理中 */}
          {step === STEPS.PROCESSING && (
            <div className="py-12 text-center">
              <Loader2 className="w-16 h-16 text-blue-500 animate-spin mx-auto mb-4" />
              <h4 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                {language === 'zh' ? '验证交易中...' : 'Verifying Transaction...'}
              </h4>
              <p className="text-gray-500 dark:text-gray-400 text-sm mb-4">
                {language === 'zh'
                  ? '跨链交易需要 1-15 分钟，请耐心等待'
                  : 'Cross-chain transactions take 1-15 minutes, please wait'}
              </p>
              {txInfo?.destTxHash && (
                <a
                  href={`https://polygonscan.com/tx/${txInfo.destTxHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-500 hover:text-blue-600 text-xs underline"
                >
                  {language === 'zh' ? '查看交易' : 'View Transaction'}
                </a>
              )}
            </div>
          )}

          {/* 成功 */}
          {step === STEPS.SUCCESS && (
            <div className="py-12 text-center">
              <div className="w-16 h-16 bg-green-100 dark:bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <Check className="w-8 h-8 text-green-600 dark:text-green-400" />
              </div>
              <h4 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                {language === 'zh' ? '充值成功！' : 'Recharge Successful!'}
              </h4>

              {txInfo?.amount && (
                <div className="bg-green-50 dark:bg-green-500/10 border border-green-200 dark:border-green-500/30 rounded-xl p-4 mb-4">
                  <p className="text-green-700 dark:text-green-300 text-sm">
                    {language === 'zh' ? '充值金额' : 'Amount'}:
                    <span className="font-bold ml-2">
                      +${txInfo.amount < 0.01
                        ? txInfo.amount.toFixed(6).replace(/0+$/, '').replace(/\.$/, '')
                        : txInfo.amount.toFixed(2)}
                    </span>
                  </p>
                  {newBalance !== null && (
                    <p className="text-green-600 dark:text-green-400 text-xs mt-1">
                      {language === 'zh' ? '当前余额' : 'Current balance'}: ${newBalance < 0.01
                        ? newBalance.toFixed(6).replace(/0+$/, '').replace(/\.$/, '')
                        : newBalance.toFixed(2)}
                    </p>
                  )}
                </div>
              )}

              {txInfo?.destTxHash && (
                <a
                  href={`https://polygonscan.com/tx/${txInfo.destTxHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-500 hover:text-blue-600 text-xs underline mb-4 block"
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
                {language === 'zh' ? '充值失败' : 'Recharge Failed'}
              </h4>
              <p className="text-red-500 text-sm mb-6">{error}</p>

              {txInfo?.destTxHash && (
                <a
                  href={`https://polygonscan.com/tx/${txInfo.destTxHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-500 hover:text-blue-600 text-xs underline mb-4 block"
                >
                  {language === 'zh' ? '查看交易' : 'View Transaction'}
                </a>
              )}

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
    </>
  );
};

export default LiFiRechargeWidget;
