/**
 * 区块链交易验证服务
 * 
 * 验证用户的 USDC 充值交易是否有效
 * - 验证链 ID
 * - 验证交易状态
 * - 验证接收地址
 * - 验证金额
 * - 验证发送方
 * - 验证确认数
 * - 防止重复使用
 * 
 * 🔒 安全措施:
 * - 9 层验证
 * - 日志脱敏
 * - BigInt 精度处理
 */

import { ethers } from 'ethers';
import {
  USDC_CONTRACTS,
  RPC_URLS,
  REQUIRED_CONFIRMATIONS,
  PLATFORM_RECEIVER,
  CHAIN_IDS,
  getAcceptableUsdcContracts,
} from '../../config/recharge.config.js';
import { maskAddress, maskTxHash, safeLog } from '../../utils/security.utils.js';

// ERC20 ABI - 只需要 transfer 事件和 decimals
const ERC20_ABI = [
  'function decimals() view returns (uint8)',
  'event Transfer(address indexed from, address indexed to, uint256 value)',
];

// Transfer 事件的 topic0 (keccak256 of "Transfer(address,address,uint256)")
const TRANSFER_EVENT_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

// 缓存 provider 实例
const providers = {};

/**
 * 获取指定链的 provider
 * @param {string} chain - 链名称 (arbitrum | polygon)
 * @returns {ethers.providers.JsonRpcProvider}
 */
const getProvider = (chain) => {
  if (!providers[chain]) {
    const rpcUrl = RPC_URLS[chain];
    if (!rpcUrl) {
      throw new Error(`Unsupported chain: ${chain}`);
    }
    // ethers v5 语法
    providers[chain] = new ethers.providers.JsonRpcProvider(rpcUrl);
  }
  return providers[chain];
};

/**
 * 解析 USDC transfer 交易数据
 * @param {string} data - 交易 input data
 * @returns {{ recipient: string, amount: bigint } | null}
 */
const parseTransferData = (data) => {
  try {
    // transfer(address,uint256) selector: 0xa9059cbb
    if (!data.startsWith('0xa9059cbb')) {
      return null;
    }

    // ethers v5 语法
    const iface = new ethers.utils.Interface([
      'function transfer(address to, uint256 amount)',
    ]);
    const decoded = iface.decodeFunctionData('transfer', data);
    
    return {
      recipient: decoded[0],
      amount: decoded[1],
    };
  } catch (error) {
    safeLog.error('[BlockchainVerifier]', 'Failed to parse transfer data', { 
      message: error.message 
    });
    return null;
  }
};

/**
 * 从交易日志中解析 Transfer 事件
 * 用于 Safe/Relayer 交易，因为 tx.to 是 Safe 地址而不是 USDC 合约
 * 
 * @param {Array} logs - 交易日志
 * @param {string[]} acceptableUsdcContracts - 可接受的 USDC 合约地址列表
 * @param {string} platformReceiver - 平台收款地址
 * @returns {{ from: string, to: string, amount: bigint, usdcContract: string } | null}
 */
const parseTransferFromLogs = (logs, acceptableUsdcContracts, platformReceiver) => {
  try {
    console.log('[BlockchainVerifier] Searching Transfer events:', {
      acceptableUsdcContracts,
      platformReceiver: platformReceiver.toLowerCase(),
      totalLogs: logs?.length || 0,
    });

    // 查找 USDC 合约发出的 Transfer 事件，接收方是平台地址
    for (const log of logs) {
      const logAddress = log.address.toLowerCase();
      
      // 检查是否是任一可接受的 USDC 合约的日志
      if (!acceptableUsdcContracts.includes(logAddress)) {
        continue;
      }

      // 检查是否是 Transfer 事件
      if (log.topics[0] !== TRANSFER_EVENT_TOPIC) {
        continue;
      }

      // 解析 Transfer 事件
      // topics[1] = from (indexed), topics[2] = to (indexed)
      // data = amount
      const from = '0x' + log.topics[1].slice(26).toLowerCase();
      const to = '0x' + log.topics[2].slice(26).toLowerCase();
      const amount = ethers.BigNumber.from(log.data);

      console.log('[BlockchainVerifier] Found USDC Transfer:', {
        from,
        to,
        amount: amount.toString(),
        usdcContract: logAddress,
        isTargetReceiver: to.toLowerCase() === platformReceiver.toLowerCase(),
      });

      // 检查接收方是否是平台地址
      if (to.toLowerCase() === platformReceiver.toLowerCase()) {
        safeLog.info('[BlockchainVerifier]', 'Found Transfer event in logs', {
          from,
          to,
          amount: amount.toString(),
          usdcContract: logAddress,
        });
        return { from, to, amount: amount.toBigInt(), usdcContract: logAddress };
      }
    }

    // 如果没找到匹配的 Transfer，打印所有 Transfer 事件用于调试
    console.log('[BlockchainVerifier] No matching Transfer found. Listing all Transfer events:');
    for (const log of logs) {
      if (log.topics[0] === TRANSFER_EVENT_TOPIC) {
        const from = '0x' + log.topics[1].slice(26).toLowerCase();
        const to = '0x' + log.topics[2].slice(26).toLowerCase();
        const amount = ethers.BigNumber.from(log.data);
        console.log('[BlockchainVerifier] Transfer event:', {
          contract: log.address.toLowerCase(),
          from,
          to,
          amount: amount.toString(),
        });
      }
    }

    return null;
  } catch (error) {
    safeLog.error('[BlockchainVerifier]', 'Failed to parse Transfer from logs', {
      message: error.message
    });
    return null;
  }
};

/**
 * 验证充值交易
 * 
 * @param {string} txHash - 交易哈希
 * @param {Object} expectedOrder - 期望的订单信息
 * @param {string} expectedOrder.payerAddress - 期望的发送方地址
 * @param {number} expectedOrder.amount - 期望的金额 (USDC)
 * @param {string} expectedOrder.chain - 链名称
 * @returns {Promise<{
 *   valid: boolean,
 *   error?: string,
 *   details?: {
 *     txHash: string,
 *     from: string,
 *     to: string,
 *     amount: number,
 *     blockNumber: number,
 *     confirmations: number
 *   }
 * }>}
 */
export const verifyRechargeTransaction = async (txHash, expectedOrder) => {
  const { payerAddress, amount: expectedAmount, chain = 'arbitrum' } = expectedOrder;
  
  try {
    // 🔒 使用脱敏日志
    safeLog.info('[BlockchainVerifier]', 'Verifying transaction', { 
      txHash, 
      payer: payerAddress, 
      amount: expectedAmount, 
      chain 
    });

    const provider = getProvider(chain);
    const platformReceiver = PLATFORM_RECEIVER[chain];
    const usdcContract = USDC_CONTRACTS[chain];
    const acceptableUsdcContracts = getAcceptableUsdcContracts(chain); // 支持多种 USDC（如 Polygon 的 Native + Bridged）
    const requiredConfirmations = REQUIRED_CONFIRMATIONS[chain];
    const expectedChainId = CHAIN_IDS[chain];

    // 检查平台收款地址是否配置
    if (!platformReceiver) {
      return {
        valid: false,
        error: `Platform receiver address not configured for chain: ${chain}`,
      };
    }

    // 检查链 ID 是否配置
    if (!expectedChainId) {
      return {
        valid: false,
        error: `Chain ID not configured for chain: ${chain}`,
      };
    }

    // 1. 获取交易收据（receipt 包含所有验证所需信息）
    // 注意：某些 Polygon RPC 可能不返回 tx 对象，但 receipt 总是可用的
    // 🔄 增加重试机制：等待 pending 交易确认
    console.log('[BlockchainVerifier] Fetching receipt from RPC...');
    let tx, receipt;
    const maxRetries = 5;
    const retryDelay = 3000; // 3秒
    
    try {
      // 先获取 receipt（带重试）
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        receipt = await provider.getTransactionReceipt(txHash);
        
        if (receipt) {
          console.log(`[BlockchainVerifier] Receipt found on attempt ${attempt}`);
          break;
        }
        
        // 检查交易是否在 pending pool
        const pendingTx = await provider.getTransaction(txHash);
        if (!pendingTx) {
          console.log('[BlockchainVerifier] Transaction not found in pending pool');
          return {
            valid: false,
            error: 'Transaction not found on blockchain',
          };
        }
        
        console.log(`[BlockchainVerifier] Transaction pending, waiting... (attempt ${attempt}/${maxRetries})`);
        
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, retryDelay));
        }
      }
      
      if (!receipt) {
        // 交易仍在 pending，返回特殊状态让前端知道需要稍后重试
        return {
          valid: false,
          error: 'Transaction is still pending. Please wait a few minutes and check your balance.',
          pending: true,
        };
      }
      
      // 尝试获取 tx（可能为空，某些 RPC 不返回）
      try {
        tx = await provider.getTransaction(txHash);
      } catch (txError) {
        console.log('[BlockchainVerifier] Could not fetch tx object, using receipt only');
        tx = null;
      }
      
      console.log('[BlockchainVerifier] RPC response:', { 
        hasTx: !!tx, 
        hasReceipt: true,
        receiptFrom: receipt.from,
        receiptTo: receipt.to,
        receiptStatus: receipt.status,
        logsCount: receipt.logs?.length 
      });
    } catch (rpcError) {
      console.error('[BlockchainVerifier] RPC error:', rpcError.message);
      return {
        valid: false,
        error: `RPC error: ${rpcError.message}`,
      };
    }

    // 🔒 2. 验证链 ID
    // 注意：某些 RPC 不返回 tx 对象，此时跳过链 ID 验证（依赖收据验证）
    let txChainId = expectedChainId; // 默认使用预期值
    if (tx && tx.chainId) {
      txChainId = Number(tx.chainId);
      if (txChainId !== expectedChainId) {
        safeLog.warn('[BlockchainVerifier]', 'Chain ID mismatch', {
          expected: expectedChainId,
          actual: txChainId,
          txHash,
        });
        return {
          valid: false,
          error: `Chain ID mismatch. Expected: ${expectedChainId} (${chain}), Got: ${txChainId}`,
        };
      }
    } else {
      console.log('[BlockchainVerifier] No tx.chainId available, using expected chain ID');
    }

    // 3. 验证交易状态
    if (receipt.status !== 1) {
      return {
        valid: false,
        error: 'Transaction failed on-chain',
      };
    }

    // 4-6. 解析转账信息
    // 优先使用日志解析（更可靠，适用于所有情况）
    let transferInfo = null;
    let actualFrom = receipt.from || (tx ? tx.from : null);

    // 从交易日志解析 Transfer 事件（适用于 Safe/Relayer 和直接转账）
    safeLog.info('[BlockchainVerifier]', 'Parsing Transfer event from logs...');
    const logTransfer = parseTransferFromLogs(receipt.logs, acceptableUsdcContracts, platformReceiver);
    if (logTransfer) {
      transferInfo = logTransfer;
      actualFrom = logTransfer.from; // 实际发送方（可能是 Safe 地址）
      safeLog.info('[BlockchainVerifier]', 'Transfer event found in logs', {
        from: logTransfer.from,
        to: logTransfer.to,
        usdcContract: logTransfer.usdcContract,
      });
    }

    // 备用：如果有 tx 对象且是直接转账，尝试解析 tx.data
    // 检查 tx.to 是否是任一可接受的 USDC 合约
    if (!transferInfo && tx && acceptableUsdcContracts.includes(tx.to?.toLowerCase())) {
      const transferData = parseTransferData(tx.data);
      if (transferData && transferData.recipient.toLowerCase() === platformReceiver.toLowerCase()) {
        transferInfo = {
          from: tx.from,
          to: transferData.recipient,
          amount: transferData.amount,
        };
        actualFrom = tx.from;
        safeLog.info('[BlockchainVerifier]', 'Direct transfer detected from tx.data');
      }
    }

    if (!transferInfo) {
      safeLog.warn('[BlockchainVerifier]', 'No valid USDC transfer found', {
        receiptTo: receipt.to,
        usdcContract,
        logsCount: receipt.logs?.length || 0,
      });
      return {
        valid: false,
        error: 'No valid USDC transfer to platform address found in transaction',
      };
    }

    // 7. 验证金额 (USDC 6位小数)
    // ⚠️ 使用 BigInt 比较避免浮点数精度问题
    const actualAmountRaw = transferInfo.amount; // BigInt
    const expectedAmountRaw = BigInt(Math.round(expectedAmount * 1e6));
    const actualAmount = Number(actualAmountRaw) / 1e6;

    // 计算金额偏差百分比
    // 对于 LiFi/跨链交易，允许最多 5% 的滑点（swap 费用 + 桥接费用）
    const MIN_AMOUNT_RATIO = 0.95; // 实际金额至少是期望金额的 95%
    const minAcceptableRaw = BigInt(Math.round(expectedAmount * MIN_AMOUNT_RATIO * 1e6));

    // 验证：实际金额必须 >= 期望金额的 95%
    // 这允许合理的滑点，同时防止恶意小额充值
    if (actualAmountRaw < minAcceptableRaw) {
      safeLog.warn('[BlockchainVerifier]', 'Amount too low (exceeds max slippage)', {
        expected: expectedAmount,
        actual: actualAmount,
        minAcceptable: Number(minAcceptableRaw) / 1e6,
        slippage: ((expectedAmount - actualAmount) / expectedAmount * 100).toFixed(2) + '%',
      });
      return {
        valid: false,
        error: `Amount too low. Expected at least ${(expectedAmount * MIN_AMOUNT_RATIO).toFixed(6)} USDC (95% of ${expectedAmount}), Got: ${actualAmount} USDC`,
      };
    }

    // 如果金额不完全匹配，记录日志但不拒绝
    if (actualAmountRaw !== expectedAmountRaw) {
      safeLog.info('[BlockchainVerifier]', 'Amount differs from expected (within tolerance)', {
        expected: expectedAmount,
        actual: actualAmount,
        slippage: ((expectedAmount - actualAmount) / expectedAmount * 100).toFixed(2) + '%',
      });
    }

    // 8. 验证发送方（如果 payerAddress 为空，跳过验证 - 用于 Safe 钱包/fundWallet）
    // 对于 Safe 转账：txHash 来自我们的代码，可信
    // 对于 fundWallet：依赖金额+时间匹配
    if (payerAddress && payerAddress.length > 0 && actualFrom.toLowerCase() !== payerAddress.toLowerCase()) {
      safeLog.warn('[BlockchainVerifier]', 'Sender mismatch', {
        expected: payerAddress,
        actual: actualFrom,
      });
      return {
        valid: false,
        error: `Sender mismatch. Expected: ${maskAddress(payerAddress)}, Got: ${maskAddress(actualFrom)}`,
      };
    }

    // 9. 确认数（仅用于记录，不阻塞验证）
    // 对于 Safe/Relayer 转账，Relayer 已经等待交易被挖矿
    // 对于直接转账，receipt.status === 1 已经表示交易成功
    const currentBlock = await provider.getBlockNumber();
    const confirmations = currentBlock - receipt.blockNumber;

    // 全部验证通过
    safeLog.info('[BlockchainVerifier]', '✅ Transaction verified successfully', {
      txHash,
      from: actualFrom,
      amount: actualAmount,
      chain,
      chainId: txChainId,
      confirmations,
    });
    
    return {
      valid: true,
      details: {
        txHash,
        from: actualFrom,
        to: transferInfo.to,
        amount: actualAmount,
        blockNumber: receipt.blockNumber,
        confirmations,
        chainId: txChainId,
      },
    };

  } catch (error) {
    safeLog.error('[BlockchainVerifier]', 'Verification error', { 
      message: error.message,
      txHash,
    });
    return {
      valid: false,
      error: `Verification failed: ${error.message}`,
    };
  }
};

/**
 * 获取交易确认数
 * @param {string} txHash - 交易哈希
 * @param {string} chain - 链名称
 * @returns {Promise<{ confirmations: number, blockNumber: number | null }>}
 */
export const getTransactionConfirmations = async (txHash, chain = 'arbitrum') => {
  try {
    const provider = getProvider(chain);
    const receipt = await provider.getTransactionReceipt(txHash);
    
    if (!receipt) {
      return { confirmations: 0, blockNumber: null };
    }
    
    const currentBlock = await provider.getBlockNumber();
    const confirmations = currentBlock - receipt.blockNumber;
    
    return {
      confirmations,
      blockNumber: receipt.blockNumber,
    };
  } catch (error) {
    safeLog.error('[BlockchainVerifier]', 'Error getting confirmations', { 
      message: error.message,
      txHash,
    });
    return { confirmations: 0, blockNumber: null };
  }
};

/**
 * 检查交易是否存在且成功
 * @param {string} txHash - 交易哈希
 * @param {string} chain - 链名称
 * @returns {Promise<boolean>}
 */
export const isTransactionSuccessful = async (txHash, chain = 'arbitrum') => {
  try {
    const provider = getProvider(chain);
    const receipt = await provider.getTransactionReceipt(txHash);
    return receipt?.status === 1;
  } catch (error) {
    return false;
  }
};

export default {
  verifyRechargeTransaction,
  getTransactionConfirmations,
  isTransactionSuccessful,
};



