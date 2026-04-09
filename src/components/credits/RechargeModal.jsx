/**
 * 充值弹窗组件
 * 
 * 当前支持：
 * 1. Safe 钱包转账（推荐）- 从交易账户直接转账 USDC.e
 * 2. Privy 嵌入式钱包转账 - 从 Privy 钱包直接转账 USDC.e
 * 3. LI.FI 跨链充值 - 从任意链跨链充值
 * 
 * 暂时禁用（Coming soon）：
 * 4. 外部充值 - 使用 Privy fundWallet（需要付费 Webhook）
 * 
 * 🔒 安全设计：
 * - 收款地址通过环境变量注入
 * - 后端验证 txHash 确认交易
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { X, Loader2, Check, AlertCircle, Wallet, GripHorizontal, RefreshCw, ArrowRight, CreditCard, ArrowLeftRight, KeyRound } from 'lucide-react';
import { useFundWallet, useSendTransaction } from '@privy-io/react-auth';
import { arbitrum, base, optimism, polygon, mainnet } from 'viem/chains';
import { encodeFunctionData, erc20Abi } from 'viem';
import { useAuth } from '../../contexts/AuthContext';
import { getBalance, createPendingRecharge, submitTransaction } from '../../services/credits.service';
import { getSafeUSDCBalance, transferUSDCFromSafe, getSafeInfo } from '../../services/polymarket/polymarketSafeService';
import { useSafeWallet } from '../../hooks/useSafeWallet';
import { safeLog } from '../../utils/security.utils';
import LiFiRechargeWidget from './LiFiRechargeWidget';

// ⚠️ 重要安全配置 - 收款地址必须通过环境变量显式提供
const PLATFORM_RECEIVER = import.meta.env.VITE_PLATFORM_RECEIVER || '';

// 充值金额选项（测试模式：允许任意金额）
const AMOUNT_OPTIONS = [0.01, 0.1, 1, 5, 10, 20, 50, 100];
const MIN_AMOUNT = 0.01; // 临时放开，测试完恢复为 5

// 链配置（用于外部充值）
const PLATFORM_CONFIG = {
  arbitrum: {
    chainId: 42161,
    chain: arbitrum,
    chainName: 'Arbitrum One',
    shortName: 'Arbitrum',
    receiverAddress: PLATFORM_RECEIVER,
    usdcContract: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
    explorerUrl: 'https://arbiscan.io',
    recommended: true,
  },
  base: {
    chainId: 8453,
    chain: base,
    chainName: 'Base',
    shortName: 'Base',
    receiverAddress: PLATFORM_RECEIVER,
    usdcContract: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    explorerUrl: 'https://basescan.org',
    recommended: true,
  },
  optimism: {
    chainId: 10,
    chain: optimism,
    chainName: 'Optimism',
    shortName: 'OP',
    receiverAddress: PLATFORM_RECEIVER,
    usdcContract: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
    explorerUrl: 'https://optimistic.etherscan.io',
    recommended: false,
  },
  polygon: {
    chainId: 137,
    chain: polygon,
    chainName: 'Polygon',
    shortName: 'Polygon',
    receiverAddress: PLATFORM_RECEIVER,
    usdcContract: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174', // USDC.e
    explorerUrl: 'https://polygonscan.com',
    recommended: false,
  },
  ethereum: {
    chainId: 1,
    chain: mainnet,
    chainName: 'Ethereum',
    shortName: 'ETH',
    receiverAddress: PLATFORM_RECEIVER,
    usdcContract: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    explorerUrl: 'https://etherscan.io',
    recommended: false,
    warning: true,
  },
};

const getSupportedChains = () => {
  return Object.entries(PLATFORM_CONFIG)
    .filter(([_, config]) => config.receiverAddress)
    .map(([key, config]) => ({ id: key, ...config }));
};

// 充值状态
const STEPS = {
  SELECT: 'select',
  SAFE_CONFIRM: 'safe_confirm',  // Safe 转账确认
  SAFE_PROCESSING: 'safe_processing',  // Safe 转账处理中
  WAITING: 'waiting',
  SUCCESS: 'success',
  ERROR: 'error',
};

// 充值方式
const PAYMENT_METHODS = {
  SAFE: 'safe',           // 从 Safe 钱包
  PRIVY_WALLET: 'privy',  // 从 Privy 嵌入式钱包
  EXTERNAL: 'external',   // 外部充值（Privy fundWallet）
  LIFI: 'lifi',           // 跨链充值（LI.FI Widget）
};

// 各链上的 USDC 合约地址（用于嵌入式钱包转账）
// 注意：Polygon 有两种 USDC，分别查询
const USDC_CONTRACTS = {
  arbitrum: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',       // Native USDC
  base: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',           // Native USDC  
  optimism: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',       // Native USDC
  polygon: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',        // Native USDC (Circle 官方)
  'polygon-bridged': '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174', // USDC.e (Bridged，兼容 Polymarket)
  ethereum: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',       // USDC
};

// 链 ID 映射
const CHAIN_IDS = {
  arbitrum: 42161,
  base: 8453,
  optimism: 10,
  polygon: 137,
  'polygon-bridged': 137, // 同样是 Polygon 链，只是不同的代币
  ethereum: 1,
};

// 链 RPC URLs
const CHAIN_RPC_URLS = {
  arbitrum: 'https://arb1.arbitrum.io/rpc',
  base: 'https://mainnet.base.org',
  optimism: 'https://mainnet.optimism.io',
  polygon: 'https://polygon-rpc.com',
  'polygon-bridged': 'https://polygon-rpc.com',
  ethereum: 'https://eth.llamarpc.com',
};

// 链显示名称
const CHAIN_NAMES = {
  arbitrum: 'Arbitrum',
  base: 'Base',
  optimism: 'Optimism',
  polygon: 'Polygon',
  'polygon-bridged': 'Polygon (USDC.e)',
  ethereum: 'Ethereum',
};

// Gas 代币
const GAS_TOKENS = {
  arbitrum: 'ETH',
  base: 'ETH',
  optimism: 'ETH',
  polygon: 'MATIC',
  'polygon-bridged': 'MATIC',
  ethereum: 'ETH',
};

// 后端使用的链名称映射（polygon-bridged 在后端也叫 polygon）
const BACKEND_CHAIN_NAMES = {
  arbitrum: 'arbitrum',
  base: 'base',
  optimism: 'optimism',
  polygon: 'polygon',
  'polygon-bridged': 'polygon', // 后端使用同一个配置
  ethereum: 'ethereum',
};

// 推荐的链（低 Gas）
const RECOMMENDED_CHAINS = ['arbitrum', 'base', 'polygon', 'polygon-bridged'];

const RechargeModal = ({
  isOpen,
  onClose,
  initialAmount = 20,
  language = 'zh',
  onSuccess,
}) => {
  const { accessToken, user, embeddedWalletAddress } = useAuth();
  const { getSigner, safeAddress, isReady: safeIsReady } = useSafeWallet();
  
  // Privy fundWallet
  const { fundWallet } = useFundWallet({
    onUserExited: ({ balance, address, chain, fundingMethod }) => {
      safeLog.info('[Recharge]', '用户退出充值页面', { 
        balance: balance?.toString(), 
        fundingMethod,
        chain: chain?.name 
      });
      if (fundingMethod && paymentMethod === PAYMENT_METHODS.EXTERNAL) {
        setStep(STEPS.WAITING);
      }
    }
  });

  // Privy sendTransaction - 用于从嵌入式钱包发送 USDC 转账
  const { sendTransaction } = useSendTransaction();

  const [step, setStep] = useState(STEPS.SELECT);
  const [error, setError] = useState(null);
  const [initialBalance, setInitialBalance] = useState(null);
  const [newBalance, setNewBalance] = useState(null);
  const [checkCount, setCheckCount] = useState(0);
  
  // 金额和链选择
  const [selectedAmount, setSelectedAmount] = useState(initialAmount);
  const [customAmount, setCustomAmount] = useState('');
  const [selectedChain, setSelectedChain] = useState('arbitrum');
  
  // 充值方式
  const [paymentMethod, setPaymentMethod] = useState(PAYMENT_METHODS.SAFE);
  
  // Safe 余额
  const [safeBalance, setSafeBalance] = useState(null);
  const [loadingSafeBalance, setLoadingSafeBalance] = useState(false);
  const [transferProgress, setTransferProgress] = useState('');
  const [txHash, setTxHash] = useState(null);

  // Privy 嵌入式钱包余额（多链 USDC）
  const [privyWalletBalances, setPrivyWalletBalances] = useState({}); // { chain: balance }
  const [loadingPrivyBalance, setLoadingPrivyBalance] = useState(false);
  const [selectedPrivyChain, setSelectedPrivyChain] = useState('arbitrum'); // 默认 Arbitrum（低 Gas）

  // LI.FI Widget 状态
  const [showLiFiWidget, setShowLiFiWidget] = useState(false);

  const supportedChains = getSupportedChains();
  const chainConfig = PLATFORM_CONFIG[selectedChain] || PLATFORM_CONFIG.arbitrum;
  const isReceiverConfigured = !!chainConfig.receiverAddress;

  // 拖拽状态
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const modalRef = useRef(null);

  // 初始化位置
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
    const maxX = window.innerWidth - (modalRef.current?.offsetWidth || 400);
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

  // 重置状态
  useEffect(() => {
    if (isOpen) {
      setStep(STEPS.SELECT);
      setError(null);
      setInitialBalance(null);
      setNewBalance(null);
      setCheckCount(0);
      setSelectedAmount(initialAmount);
      setTransferProgress('');
      setTxHash(null);
      // 默认支付方式优先级：Privy 钱包 > Safe > LI.FI
      if (embeddedWalletAddress) {
        setPaymentMethod(PAYMENT_METHODS.PRIVY_WALLET);
      } else if (safeAddress && safeIsReady) {
        setPaymentMethod(PAYMENT_METHODS.SAFE);
      } else {
        setPaymentMethod(PAYMENT_METHODS.LIFI);
      }
    }
  }, [isOpen, initialAmount, safeAddress, embeddedWalletAddress, safeIsReady]);

  // 获取初始余额
  useEffect(() => {
    if (isOpen && accessToken) {
      getBalance(accessToken).then(result => {
        if (result.success) {
          setInitialBalance(result.data.balance);
        }
      }).catch(() => {});
    }
  }, [isOpen, accessToken]);

  // 获取 Safe USDC.e 余额
  useEffect(() => {
    if (isOpen && safeAddress && paymentMethod === PAYMENT_METHODS.SAFE) {
      setLoadingSafeBalance(true);
      getSafeUSDCBalance(safeAddress)
        .then(balance => {
          setSafeBalance(balance);
        })
        .catch(err => {
          console.error('Failed to get Safe balance:', err);
          setSafeBalance(0);
        })
        .finally(() => {
          setLoadingSafeBalance(false);
        });
    }
  }, [isOpen, safeAddress, paymentMethod]);

  // 获取 Privy 嵌入式钱包 USDC 余额（多链）
  useEffect(() => {
    const fetchPrivyWalletBalances = async () => {
      if (!isOpen || !embeddedWalletAddress) return;
      
      setLoadingPrivyBalance(true);
      try {
        const { ethers } = await import('ethers');
        const balances = {};
        
        // 并行获取所有链的余额
        const chains = Object.keys(USDC_CONTRACTS);
        const results = await Promise.allSettled(
          chains.map(async (chain) => {
            try {
              const provider = new ethers.JsonRpcProvider(CHAIN_RPC_URLS[chain]);
              const usdcContract = new ethers.Contract(
                USDC_CONTRACTS[chain],
                ['function balanceOf(address) view returns (uint256)'],
                provider
              );
              const balanceRaw = await usdcContract.balanceOf(embeddedWalletAddress);
              return { chain, balance: parseFloat(ethers.formatUnits(balanceRaw, 6)) };
            } catch (err) {
              console.error(`Failed to get ${chain} balance:`, err);
              return { chain, balance: 0 };
            }
          })
        );
        
        results.forEach((result) => {
          if (result.status === 'fulfilled') {
            balances[result.value.chain] = result.value.balance;
          }
        });
        
        setPrivyWalletBalances(balances);
        safeLog.info('[Recharge]', 'Privy wallet USDC balances:', balances);
        
        // 自动选择余额最多的链
        const bestChain = Object.entries(balances)
          .filter(([chain]) => RECOMMENDED_CHAINS.includes(chain)) // 优先推荐链
          .sort(([, a], [, b]) => b - a)[0];
        if (bestChain && bestChain[1] > 0) {
          setSelectedPrivyChain(bestChain[0]);
        }
      } catch (err) {
        console.error('Failed to get Privy wallet balances:', err);
      } finally {
        setLoadingPrivyBalance(false);
      }
    };

    fetchPrivyWalletBalances();
  }, [isOpen, embeddedWalletAddress]);

  // 轮询检查余额变化（用于外部充值）
  useEffect(() => {
    let intervalId;
    
    if (step === STEPS.WAITING && accessToken && initialBalance !== null) {
      intervalId = setInterval(async () => {
        try {
          setCheckCount(prev => prev + 1);
          const result = await getBalance(accessToken);
          
          if (result.success && result.data.balance > initialBalance) {
            setNewBalance(result.data.balance);
              setStep(STEPS.SUCCESS);
              clearInterval(intervalId);
          }
        } catch (err) {
          // 忽略错误
        }
      }, 5000);
    }

    return () => { if (intervalId) clearInterval(intervalId); };
  }, [step, accessToken, initialBalance]);

  // Safe 转账
  const handleSafeTransfer = async () => {
    if (!safeAddress || !safeIsReady) {
      setError(language === 'zh' ? '请先设置交易账户' : 'Please set up trading account first');
      setStep(STEPS.ERROR);
      return;
    }

    if (safeBalance < selectedAmount) {
      setError(language === 'zh' 
        ? `交易账户余额不足 (${safeBalance?.toFixed(2) || 0} USDC.e)` 
        : `Insufficient balance (${safeBalance?.toFixed(2) || 0} USDC.e)`);
      setStep(STEPS.ERROR);
      return;
    }

    setStep(STEPS.SAFE_PROCESSING);
    setTransferProgress(language === 'zh' ? '准备转账...' : 'Preparing transfer...');

    try {
      // 0. 获取 signer
      const signer = await getSigner();
      if (!signer) {
        throw new Error(language === 'zh' ? '无法获取钱包签名器' : 'Failed to get wallet signer');
      }

      // 1. 创建 pending 订单
      safeLog.info('[Recharge]', '创建 Safe 转账订单', { amount: selectedAmount });
      
      const pendingResult = await createPendingRecharge(
        accessToken, 
        selectedAmount, 
        'polygon'  // Safe 在 Polygon 上
      );

      if (!pendingResult.success) {
        throw new Error(pendingResult.error || 'Failed to create order');
      }

      const orderId = pendingResult.data?.orderId;
      safeLog.info('[Recharge]', '订单创建成功', { orderId });

      // 2. 执行 Safe 转账
      const result = await transferUSDCFromSafe(
        signer,
        safeAddress,
        PLATFORM_RECEIVER,
        selectedAmount,
        (progress) => setTransferProgress(progress)
      );

      if (!result.success) {
        throw new Error(result.error || 'Transfer failed');
      }

      safeLog.info('[Recharge]', '转账成功', { txHash: result.txHash });
      setTxHash(result.txHash);

      // 3. 提交 txHash 验证（带重试）
      if (result.txHash && orderId) {
        setTransferProgress(language === 'zh' ? '等待交易确认...' : 'Waiting for confirmation...');
        
        // 重试验证，最多等待 60 秒
        let verifyResult = null;
        let retries = 0;
        const maxRetries = 6;
        const retryDelay = 10000; // 10秒
        
        while (retries < maxRetries) {
          verifyResult = await submitTransaction(accessToken, orderId, result.txHash);
          
          if (verifyResult.success) {
            break; // 验证成功
          }
          
          // 如果是 "not yet mined" 错误，等待后重试
          if (verifyResult.error?.includes('not yet mined') || verifyResult.error?.includes('pending')) {
            retries++;
            if (retries < maxRetries) {
              safeLog.info('[Recharge]', `交易待确认，${retryDelay/1000}秒后重试 (${retries}/${maxRetries})`, { txHash: result.txHash });
              setTransferProgress(
                language === 'zh' 
                  ? `等待交易确认... (${retries}/${maxRetries})` 
                  : `Waiting for confirmation... (${retries}/${maxRetries})`
              );
              await new Promise(resolve => setTimeout(resolve, retryDelay));
              continue;
            }
          }
          
          // 其他错误直接退出
          break;
        }
        
        // 验证最终失败
        if (!verifyResult?.success) {
          const errorMsg = verifyResult?.error || 'Transaction verification failed';
          safeLog.error('[Recharge]', '交易验证失败', { error: errorMsg, txHash: result.txHash });
          throw new Error(
            language === 'zh' 
              ? `交易验证失败: ${errorMsg}` 
              : `Verification failed: ${errorMsg}`
          );
        }
      }

      // 4. 获取新余额
      const balanceResult = await getBalance(accessToken);
      if (balanceResult.success) {
        setNewBalance(balanceResult.data.balance);
      }

      setStep(STEPS.SUCCESS);

    } catch (err) {
      if (err.message?.includes('取消') || err.message?.includes('cancel') || err.message?.includes('rejected')) {
        setStep(STEPS.SELECT);
        return;
      }
      safeLog.error('[Recharge]', '转账失败', { message: err.message });
      setError(err.message || 'Transfer failed');
      setStep(STEPS.ERROR);
    }
  };

  // Privy 嵌入式钱包转账
  const handlePrivyWalletTransfer = async () => {
    if (!embeddedWalletAddress) {
      setError(language === 'zh' ? '未找到嵌入式钱包' : 'Embedded wallet not found');
      setStep(STEPS.ERROR);
      return;
    }

    if (!sendTransaction) {
      setError(language === 'zh' ? '转账功能未启用' : 'Send transaction not enabled');
      setStep(STEPS.ERROR);
      return;
    }

    const currentBalance = privyWalletBalances[selectedPrivyChain] || 0;
    if (currentBalance < selectedAmount) {
      setError(language === 'zh' 
        ? `${CHAIN_NAMES[selectedPrivyChain]} 余额不足 (${currentBalance.toFixed(2)} USDC)` 
        : `Insufficient ${CHAIN_NAMES[selectedPrivyChain]} balance (${currentBalance.toFixed(2)} USDC)`);
      setStep(STEPS.ERROR);
      return;
    }

    setStep(STEPS.SAFE_PROCESSING); // 复用处理中状态
    setTransferProgress(language === 'zh' ? '准备转账...' : 'Preparing transfer...');

    try {
      // 1. 创建 pending 订单
      safeLog.info('[Recharge]', '创建 Privy 钱包转账订单', { 
        amount: selectedAmount, 
        chain: selectedPrivyChain 
      });
      
      const pendingResult = await createPendingRecharge(
        accessToken, 
        selectedAmount, 
        BACKEND_CHAIN_NAMES[selectedPrivyChain] || selectedPrivyChain  // 使用后端链名称
      );

      if (!pendingResult.success) {
        throw new Error(pendingResult.error || 'Failed to create order');
      }

      const orderId = pendingResult.data?.orderId;
      safeLog.info('[Recharge]', '订单创建成功', { orderId, chain: selectedPrivyChain });

      // 2. 构造 ERC-20 transfer 调用数据
      setTransferProgress(language === 'zh' ? '请在钱包中确认交易...' : 'Please confirm in wallet...');
      
      const amountInWei = BigInt(Math.floor(selectedAmount * 1e6)); // USDC has 6 decimals
      const encodedData = encodeFunctionData({
        abi: erc20Abi,
        functionName: 'transfer',
        args: [PLATFORM_RECEIVER, amountInWei]
      });

      // 3. 发送交易（使用 Privy sendTransaction）
      const { hash } = await sendTransaction({
        to: USDC_CONTRACTS[selectedPrivyChain],
        data: encodedData,
        chainId: CHAIN_IDS[selectedPrivyChain]
      });

      if (!hash) {
        throw new Error(language === 'zh' ? '未获取到交易哈希' : 'Failed to get transaction hash');
      }

      safeLog.info('[Recharge]', 'Privy 钱包转账成功', { txHash: hash });
      setTxHash(hash);

      // 4. 提交 txHash 验证（带重试）
      setTransferProgress(language === 'zh' ? '等待交易确认...' : 'Waiting for confirmation...');
      
      let verifyResult = null;
      let retries = 0;
      const maxRetries = 6;
      const retryDelay = 10000; // 10秒
      
      while (retries < maxRetries) {
        verifyResult = await submitTransaction(accessToken, orderId, hash);
        
        if (verifyResult.success) {
          break; // 验证成功
        }
        
        // 如果是 "not yet mined" 错误，等待后重试
        if (verifyResult.error?.includes('not yet mined') || verifyResult.error?.includes('pending')) {
          retries++;
          if (retries < maxRetries) {
            safeLog.info('[Recharge]', `交易待确认，${retryDelay/1000}秒后重试 (${retries}/${maxRetries})`, { txHash: hash });
            setTransferProgress(
              language === 'zh' 
                ? `等待交易确认... (${retries}/${maxRetries})` 
                : `Waiting for confirmation... (${retries}/${maxRetries})`
            );
            await new Promise(resolve => setTimeout(resolve, retryDelay));
            continue;
          }
        }
        
        // 其他错误直接退出
        break;
      }
      
      // 验证最终失败
      if (!verifyResult?.success) {
        const errorMsg = verifyResult?.error || 'Transaction verification failed';
        safeLog.error('[Recharge]', '交易验证失败', { error: errorMsg, txHash: hash });
        throw new Error(
          language === 'zh' 
            ? `交易验证失败: ${errorMsg}` 
            : `Verification failed: ${errorMsg}`
        );
      }

      // 5. 获取新余额
      const balanceResult = await getBalance(accessToken);
      if (balanceResult.success) {
        setNewBalance(balanceResult.data.balance);
      }

      setStep(STEPS.SUCCESS);

    } catch (err) {
      if (err.message?.includes('取消') || err.message?.includes('cancel') || err.message?.includes('rejected') || err.message?.includes('denied')) {
        setStep(STEPS.SELECT);
        return;
      }
      safeLog.error('[Recharge]', 'Privy 钱包转账失败', { message: err.message });
      setError(err.message || 'Transfer failed');
      setStep(STEPS.ERROR);
    }
  };

  // 外部充值（Privy fundWallet）
  const handleExternalFunding = async () => {
    if (!fundWallet) {
      setError(language === 'zh' ? '充值功能未启用' : 'Funding not enabled');
      setStep(STEPS.ERROR);
      return;
    }

    if (!isReceiverConfigured) {
      setError(language === 'zh' ? '平台收款地址未配置' : 'Platform receiver not configured');
      setStep(STEPS.ERROR);
      return;
    }

    if (!accessToken) {
      setError(language === 'zh' ? '请先登录' : 'Please login first');
      setStep(STEPS.ERROR);
      return;
    }

    try {
      safeLog.info('[Recharge]', '创建外部充值订单', { 
        chain: selectedChain, 
        amount: selectedAmount 
      });

      const pendingResult = await createPendingRecharge(
        accessToken, 
        selectedAmount, 
        selectedChain
      );

      if (!pendingResult.success) {
        throw new Error(pendingResult.error || 'Failed to create pending order');
      }

      safeLog.info('[Recharge]', 'Pending 订单创建成功', { 
        orderNo: pendingResult.data?.orderNo 
      });

      await fundWallet({
        address: chainConfig.receiverAddress,
        options: {
          chain: chainConfig.chain,
          asset: 'USDC',
          amount: String(selectedAmount),
          uiConfig: {
            receiveFundsTitle: language === 'zh' 
              ? `充值 ${selectedAmount} USDC` 
              : `Fund ${selectedAmount} USDC`,
            receiveFundsSubtitle: language === 'zh'
              ? `充值到平台地址`
              : `To platform address`
          }
        },
      });

      setStep(STEPS.WAITING);

    } catch (err) {
      if (err.message?.includes('cancelled') || err.message?.includes('closed')) {
        return;
      }
      safeLog.error('[Recharge]', '充值失败', { message: err.message });
      setError(err.message || 'Funding failed');
      setStep(STEPS.ERROR);
    }
  };

  // 手动刷新
  const handleRefresh = async () => {
    if (!accessToken || initialBalance === null) return;
    try {
      const result = await getBalance(accessToken);
      if (result.success && result.data.balance > initialBalance) {
        setNewBalance(result.data.balance);
        setStep(STEPS.SUCCESS);
      }
    } catch (err) {}
  };

  const handleClose = () => {
    if (step === STEPS.SUCCESS && onSuccess) {
      onSuccess(newBalance);
    }
    onClose();
  };

  if (!isOpen) return null;

  const hasSafe = !!safeAddress && safeIsReady;
  const canUseSafe = hasSafe && safeBalance >= MIN_AMOUNT;

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-[9998]" onClick={handleClose} />
      
      <div
        ref={modalRef}
        className="fixed z-[9999] w-[440px] max-w-[95vw] bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden"
        style={{ left: position.x, top: position.y, cursor: isDragging ? 'grabbing' : 'default' }}
      >
        {/* 头部 */}
        <div
          className="flex items-center justify-between px-5 py-4 bg-gradient-to-r from-blue-500 to-purple-600 text-white cursor-grab select-none"
          onMouseDown={handleMouseDown}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
              <Wallet size={20} />
            </div>
            <div>
              <h3 className="font-semibold text-lg">
                {language === 'zh' ? '充值 AI Credits' : 'Recharge AI Credits'}
              </h3>
              <p className="text-white/80 text-xs flex items-center gap-1">
                <GripHorizontal size={12} />
                {language === 'zh' ? '拖拽移动' : 'Drag to move'}
              </p>
            </div>
          </div>
          <button onClick={handleClose} className="no-drag p-2 hover:bg-white/20 rounded-lg transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* 内容 */}
        <div className="p-6 no-drag max-h-[70vh] overflow-y-auto">
          
          {/* 选择步骤 */}
          {step === STEPS.SELECT && (
            <div className="space-y-5">
              {/* 充值方式选择 */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {language === 'zh' ? '充值方式' : 'Payment Method'}
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {/* Privy 嵌入式钱包 */}
                  {embeddedWalletAddress && (
                    <button
                      onClick={() => setPaymentMethod(PAYMENT_METHODS.PRIVY_WALLET)}
                      className={`p-3 rounded-xl border-2 transition-all text-left ${
                        paymentMethod === PAYMENT_METHODS.PRIVY_WALLET
                          ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-500/10'
                          : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <KeyRound size={16} className={paymentMethod === PAYMENT_METHODS.PRIVY_WALLET ? 'text-indigo-600' : 'text-gray-500'} />
                        <span className={`font-medium text-xs ${
                          paymentMethod === PAYMENT_METHODS.PRIVY_WALLET ? 'text-indigo-700 dark:text-indigo-300' : 'text-gray-900 dark:text-white'
                        }`}>
                          {language === 'zh' ? 'Privy 钱包' : 'Privy Wallet'}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {loadingPrivyBalance ? '...' : (
                          Object.values(privyWalletBalances).reduce((sum, b) => sum + b, 0).toFixed(2) + ' USDC'
                        )}
                      </p>
                      {Object.values(privyWalletBalances).reduce((sum, b) => sum + b, 0) < MIN_AMOUNT && !loadingPrivyBalance && (
                        <p className="text-xs text-orange-500 mt-1">
                          {language === 'zh' ? '余额不足' : 'Low'}
                        </p>
                      )}
                    </button>
                  )}

                  {/* Safe 钱包 */}
                  {hasSafe && (
                    <button
                      onClick={() => setPaymentMethod(PAYMENT_METHODS.SAFE)}
                      className={`p-3 rounded-xl border-2 transition-all text-left ${
                        paymentMethod === PAYMENT_METHODS.SAFE
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-500/10'
                          : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <Wallet size={16} className={paymentMethod === PAYMENT_METHODS.SAFE ? 'text-blue-600' : 'text-gray-500'} />
                        <span className={`font-medium text-xs ${
                          paymentMethod === PAYMENT_METHODS.SAFE ? 'text-blue-700 dark:text-blue-300' : 'text-gray-900 dark:text-white'
                        }`}>
                          {language === 'zh' ? '交易账户' : 'Trading'}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {loadingSafeBalance ? '...' : `${safeBalance?.toFixed(2) || '0'} USDC.e`}
                      </p>
                      {!canUseSafe && safeBalance !== null && (
                        <p className="text-xs text-orange-500 mt-1">
                          {language === 'zh' ? '余额不足' : 'Low'}
                        </p>
                      )}
                    </button>
                  )}

                  {/* LI.FI 跨链充值 */}
                  <button
                    onClick={() => setPaymentMethod(PAYMENT_METHODS.LIFI)}
                    className={`p-3 rounded-xl border-2 transition-all text-left ${
                      paymentMethod === PAYMENT_METHODS.LIFI
                        ? 'border-purple-500 bg-purple-50 dark:bg-purple-500/10'
                        : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <ArrowLeftRight size={16} className={paymentMethod === PAYMENT_METHODS.LIFI ? 'text-purple-600' : 'text-gray-500'} />
                      <span className={`font-medium text-xs ${
                        paymentMethod === PAYMENT_METHODS.LIFI ? 'text-purple-700 dark:text-purple-300' : 'text-gray-900 dark:text-white'
                      }`}>
                        {language === 'zh' ? '跨链充值' : 'Cross-Chain'}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {language === 'zh' ? '任意链' : 'Any chain'}
                    </p>
                    <p className="text-xs text-purple-500 mt-1">
                      {language === 'zh' ? '推荐' : 'Recommended'}
                    </p>
                  </button>

                  {/* 外部充值 - 暂时禁用 */}
                  <button
                    disabled
                    className="p-3 rounded-xl border-2 border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 text-left cursor-not-allowed opacity-60"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <CreditCard size={16} className="text-gray-400" />
                      <span className="font-medium text-xs text-gray-400">
                        {language === 'zh' ? '信用卡' : 'Card'}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400">
                      {language === 'zh' ? '法币' : 'Fiat'}
                    </p>
                    <p className="text-xs text-blue-500 mt-1 italic">
                      Soon
                    </p>
                  </button>
                </div>
              </div>

              {/* Privy 钱包链选择 */}
              {paymentMethod === PAYMENT_METHODS.PRIVY_WALLET && (
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    {language === 'zh' ? '选择网络' : 'Select Network'}
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {Object.keys(USDC_CONTRACTS).map((chain) => {
                      const balance = privyWalletBalances[chain] || 0;
                      const isRecommended = RECOMMENDED_CHAINS.includes(chain);
                      return (
                        <button
                          key={chain}
                          onClick={() => setSelectedPrivyChain(chain)}
                          className={`p-2 rounded-lg border-2 transition-all text-left ${
                            selectedPrivyChain === chain
                              ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-500/10'
                              : balance > 0
                                ? 'border-gray-200 dark:border-gray-700 hover:border-gray-300'
                                : 'border-gray-200 dark:border-gray-700 opacity-50'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className={`font-medium text-xs ${
                              selectedPrivyChain === chain ? 'text-indigo-700 dark:text-indigo-300' : 'text-gray-900 dark:text-white'
                            }`}>
                              {CHAIN_NAMES[chain]}
                            </span>
                            {isRecommended && balance > 0 && (
                              <span className="text-[10px] text-green-500">✓</span>
                            )}
                          </div>
                          <p className={`text-xs ${balance > 0 ? 'text-gray-600 dark:text-gray-400' : 'text-gray-400'}`}>
                            {loadingPrivyBalance ? '...' : `${balance.toFixed(2)} USDC`}
                          </p>
                          {chain === 'ethereum' && (
                            <p className="text-[10px] text-orange-500">{language === 'zh' ? 'Gas 高' : 'High gas'}</p>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 金额选择 */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {language === 'zh' ? '选择充值金额' : 'Select Amount'}
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {AMOUNT_OPTIONS.slice(0, 8).map((amount) => {
                    // 检查当前支付方式的余额是否足够
                    const currentPrivyBalance = privyWalletBalances[selectedPrivyChain] || 0;
                    const isDisabled = 
                      (paymentMethod === PAYMENT_METHODS.SAFE && safeBalance < amount) ||
                      (paymentMethod === PAYMENT_METHODS.PRIVY_WALLET && currentPrivyBalance < amount);
                    
                    return (
                      <button
                        key={amount}
                        onClick={() => {
                          setSelectedAmount(amount);
                          setCustomAmount('');
                        }}
                        disabled={isDisabled}
                        className={`py-2 rounded-xl text-sm font-semibold transition-all ${
                          selectedAmount === amount && !customAmount
                            ? 'bg-blue-600 text-white shadow-lg'
                            : isDisabled
                              ? 'bg-gray-100 dark:bg-gray-800 text-gray-400 cursor-not-allowed'
                              : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                        }`}
                      >
                        ${amount}
                      </button>
                    );
                  })}
                </div>
                {/* 自定义金额输入 (测试用) */}
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-gray-500 text-sm">$</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    placeholder={language === 'zh' ? '自定义金额' : 'Custom amount'}
                    value={customAmount}
                    onChange={(e) => {
                      const val = e.target.value;
                      setCustomAmount(val);
                      if (val && parseFloat(val) > 0) {
                        setSelectedAmount(parseFloat(val));
                      }
                    }}
                    className="flex-1 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
                  />
                  <span className="text-xs text-orange-500">测试模式</span>
                </div>
              </div>

              {/* 显示获得的 Credits */}
              <div className="text-center py-4 bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 rounded-xl">
                <p className="text-gray-500 dark:text-gray-400 text-sm mb-1">
                  {language === 'zh' ? '将获得' : 'You will receive'}
                </p>
                <p className="text-3xl font-bold text-gray-900 dark:text-white">
                  ${selectedAmount} <span className="text-lg text-blue-600">AI Credits</span>
                </p>
              </div>

              {/* 外部充值的链选择 - 暂时隐藏，等待 Privy Webhook 集成 */}
              {/* paymentMethod === PAYMENT_METHODS.EXTERNAL - Coming soon */}

              {/* 说明 */}
              <div className="bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/30 rounded-xl p-3">
                <p className="text-blue-600 dark:text-blue-400 text-xs">
                  {paymentMethod === PAYMENT_METHODS.SAFE ? (
                    <>💡 {language === 'zh' 
                      ? '从交易账户直接扣款，无需 Gas 费用'
                      : 'Deduct directly from trading account, no gas fee'}</>
                  ) : paymentMethod === PAYMENT_METHODS.PRIVY_WALLET ? (
                    <>💡 {language === 'zh' 
                      ? `从 ${CHAIN_NAMES[selectedPrivyChain]} 转账（需少量 ${GAS_TOKENS[selectedPrivyChain]} 作为 Gas）`
                      : `Transfer from ${CHAIN_NAMES[selectedPrivyChain]} (requires ${GAS_TOKENS[selectedPrivyChain]} for gas)`}</>
                  ) : (
                    <>💡 {language === 'zh' 
                      ? `最低充值 $${MIN_AMOUNT} USDC | 支持交易所提款、信用卡等`
                      : `Minimum $${MIN_AMOUNT} USDC | Supports exchange, credit card, etc.`}</>
                  )}
                </p>
              </div>

              {/* 当前余额 */}
              {initialBalance !== null && (
                <div className="text-center text-sm text-gray-500 dark:text-gray-400">
                  {language === 'zh' ? '当前 AI Credits' : 'Current AI Credits'}: <span className="font-semibold">${initialBalance.toFixed(2)}</span>
                </div>
              )}

              {/* 充值按钮 */}
              {paymentMethod === PAYMENT_METHODS.PRIVY_WALLET ? (() => {
                const currentBalance = privyWalletBalances[selectedPrivyChain] || 0;
                const canTransfer = embeddedWalletAddress && currentBalance >= selectedAmount;
                return (
                  <button
                    onClick={handlePrivyWalletTransfer}
                    disabled={!canTransfer}
                    className={`w-full py-3 rounded-xl font-medium transition-all text-lg flex items-center justify-center gap-2 ${
                      canTransfer
                        ? 'bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white'
                        : 'bg-gray-300 dark:bg-gray-700 text-gray-500 cursor-not-allowed'
                    }`}
                  >
                    <KeyRound size={20} />
                    {language === 'zh' 
                      ? `从 ${CHAIN_NAMES[selectedPrivyChain]} 充值 $${selectedAmount}` 
                      : `Fund $${selectedAmount} from ${CHAIN_NAMES[selectedPrivyChain]}`}
                  </button>
                );
              })() : paymentMethod === PAYMENT_METHODS.SAFE ? (
                <button
                  onClick={handleSafeTransfer}
                  disabled={!canUseSafe || selectedAmount > safeBalance}
                  className={`w-full py-3 rounded-xl font-medium transition-all text-lg flex items-center justify-center gap-2 ${
                    canUseSafe && selectedAmount <= safeBalance
                      ? 'bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white'
                      : 'bg-gray-300 dark:bg-gray-700 text-gray-500 cursor-not-allowed'
                  }`}
                >
                  <Wallet size={20} />
                  {language === 'zh' ? `从交易账户充值 $${selectedAmount}` : `Fund $${selectedAmount} from Trading`}
                </button>
              ) : paymentMethod === PAYMENT_METHODS.LIFI ? (
                <button
                  onClick={() => setShowLiFiWidget(true)}
                  className="w-full py-3 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white rounded-xl font-medium transition-all text-lg flex items-center justify-center gap-2"
                >
                  <ArrowLeftRight size={20} />
                  {language === 'zh' ? '打开跨链充值' : 'Open Cross-Chain Recharge'}
                </button>
              ) : !isReceiverConfigured ? (
                <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-xl p-4">
                  <p className="text-red-700 dark:text-red-300 text-sm">
                    <AlertCircle size={16} className="inline mr-2" />
                    {language === 'zh' ? '平台收款地址未配置' : 'Platform receiver not configured'}
                  </p>
                </div>
              ) : (
                <button
                  onClick={handleExternalFunding}
                  className="w-full py-3 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white rounded-xl font-medium transition-all text-lg flex items-center justify-center gap-2"
                >
                  <CreditCard size={20} />
                  {language === 'zh' ? `外部充值 $${selectedAmount}` : `External Fund $${selectedAmount}`}
                </button>
              )}
            </div>
          )}

          {/* Safe 转账处理中 */}
          {step === STEPS.SAFE_PROCESSING && (
            <div className="text-center py-8">
              <Loader2 className="w-16 h-16 text-blue-500 animate-spin mx-auto mb-4" />
              <h4 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                {language === 'zh' ? '处理中...' : 'Processing...'}
              </h4>
              <p className="text-gray-500 dark:text-gray-400 text-sm mb-4">
                {transferProgress}
              </p>
              <p className="text-gray-400 text-xs">
                {language === 'zh' 
                  ? '请在钱包中确认交易' 
                  : 'Please confirm in your wallet'}
              </p>
            </div>
          )}

          {/* 等待确认（外部充值） */}
          {step === STEPS.WAITING && (
            <div className="text-center py-8">
              <Loader2 className="w-16 h-16 text-blue-500 animate-spin mx-auto mb-4" />
              <h4 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                {language === 'zh' ? '等待充值确认...' : 'Waiting for confirmation...'}
              </h4>
              <p className="text-gray-500 dark:text-gray-400 text-sm mb-2">
                {language === 'zh' 
                  ? `充值金额: $${selectedAmount}`
                  : `Amount: $${selectedAmount}`}
              </p>
              <p className="text-gray-400 text-xs mb-4">
                {language === 'zh' ? `已检查 ${checkCount} 次` : `Checked ${checkCount} times`}
              </p>
              
              <button
                onClick={handleRefresh}
                className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg text-sm"
                >
                <RefreshCw size={16} />
                {language === 'zh' ? '手动刷新' : 'Refresh'}
              </button>

              <div className="mt-6 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl text-left">
                <p className="text-gray-600 dark:text-gray-400 text-xs">
                  💡 {language === 'zh' 
                    ? '充值通常在 1-2 分钟内到账。'
                    : 'Funding usually arrives within 1-2 minutes.'}
                </p>
              </div>

              <button
                onClick={() => setStep(STEPS.SELECT)}
                className="mt-4 text-blue-600 dark:text-blue-400 text-sm hover:underline"
              >
                {language === 'zh' ? '← 返回' : '← Back'}
              </button>
            </div>
          )}

          {/* 成功 */}
          {step === STEPS.SUCCESS && (
            <div className="text-center py-8">
              <div className="w-16 h-16 bg-green-100 dark:bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <Check className="w-8 h-8 text-green-600 dark:text-green-400" />
              </div>
              <h4 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                {language === 'zh' ? '充值成功！' : 'Recharge Successful!'}
              </h4>
              {newBalance !== null && initialBalance !== null && (
                <div className="bg-green-50 dark:bg-green-500/10 border border-green-200 dark:border-green-500/30 rounded-xl p-4 mb-4">
                  <p className="text-green-700 dark:text-green-300 text-sm">
                    {language === 'zh' ? '充值金额' : 'Amount'}: 
                    <span className="font-bold ml-2">+${(newBalance - initialBalance).toFixed(2)}</span>
                  </p>
                  <p className="text-green-600 dark:text-green-400 text-xs mt-1">
                    {language === 'zh' ? '当前余额' : 'Current balance'}: ${newBalance.toFixed(2)}
                  </p>
                </div>
              )}
              {txHash && (
                <a 
                  href={`https://polygonscan.com/tx/${txHash}`}
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
            <div className="text-center py-8">
              <div className="w-16 h-16 bg-red-100 dark:bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertCircle className="w-8 h-8 text-red-600 dark:text-red-400" />
              </div>
              <h4 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                {language === 'zh' ? '出错了' : 'Error'}
              </h4>
              <p className="text-red-500 text-sm mb-6">{error}</p>
              <div className="flex gap-3">
                <button
                  onClick={() => setStep(STEPS.SELECT)}
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

      {/* LI.FI 跨链充值 Widget */}
      <LiFiRechargeWidget
        isOpen={showLiFiWidget}
        onClose={() => setShowLiFiWidget(false)}
        language={language}
        initialBalance={initialBalance}
        onSuccess={(newBalance) => {
          setNewBalance(newBalance);
          setShowLiFiWidget(false);
          setStep(STEPS.SUCCESS);
        }}
      />
    </>
  );
};

export default RechargeModal;
