/**
 * Polymarket USDC授权服务
 *
 * 用于检查和管理USDC的授权额度
 */

import { POLYMARKET_CONTRACTS } from '../../types/polymarketTrading';

// Polygon RPC URL
// Polygon 官方 RPC 端点
const POLYGON_RPC = 'https://polygon-rpc.com';

// ERC20 ABI片段
const ERC20_ABI = {
  allowance: 'function allowance(address owner, address spender) view returns (uint256)',
  approve: 'function approve(address spender, uint256 amount) returns (bool)',
  balanceOf: 'function balanceOf(address account) view returns (uint256)',
};

// 最大授权额度 (2^256 - 1)
const MAX_UINT256 = '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff';

// USDC小数位
const USDC_DECIMALS = 6;

/**
 * 将USDC金额转换为最小单位
 */
export function toUsdcUnits(amount: number): bigint {
  return BigInt(Math.floor(amount * Math.pow(10, USDC_DECIMALS)));
}

/**
 * 将最小单位转换为USDC金额
 */
export function fromUsdcUnits(units: bigint): number {
  return Number(units) / Math.pow(10, USDC_DECIMALS);
}

/**
 * 编码函数调用数据
 */
function encodeFunctionData(functionSig: string, params: string[]): string {
  // 简单的ABI编码（仅支持address和uint256）
  const functionHash = getFunctionSelector(functionSig);
  let data = functionHash;

  for (const param of params) {
    // 填充到32字节
    if (param.startsWith('0x')) {
      // 地址类型
      data += param.slice(2).padStart(64, '0');
    } else {
      // uint256类型
      data += BigInt(param).toString(16).padStart(64, '0');
    }
  }

  return data;
}

/**
 * 获取函数选择器（前4字节）
 */
function getFunctionSelector(functionSig: string): string {
  // 简化版：使用预计算的选择器
  const selectors: Record<string, string> = {
    'allowance(address,address)': '0xdd62ed3e',
    'approve(address,uint256)': '0x095ea7b3',
    'balanceOf(address)': '0x70a08231',
  };

  // 从函数签名中提取简化版本
  const match = functionSig.match(/function (\w+)\(([^)]*)\)/);
  if (match) {
    const name = match[1];
    const params = match[2].split(',').map(p => p.trim().split(' ')[0]).join(',');
    const key = `${name}(${params})`;
    return selectors[key] || '0x00000000';
  }

  return '0x00000000';
}

/**
 * 调用RPC方法
 */
async function callRpc(method: string, params: unknown[]): Promise<unknown> {
  const response = await fetch(POLYGON_RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method,
      params,
      id: Date.now(),
    }),
  });

  const data = await response.json();
  if (data.error) {
    throw new Error(data.error.message);
  }

  return data.result;
}

/**
 * 检查USDC授权额度
 */
export async function checkAllowance(
  ownerAddress: string,
  spenderAddress: string = POLYMARKET_CONTRACTS.CTF_EXCHANGE
): Promise<bigint> {
  const data = encodeFunctionData(ERC20_ABI.allowance, [ownerAddress, spenderAddress]);

  const result = await callRpc('eth_call', [
    {
      to: POLYMARKET_CONTRACTS.USDC,
      data,
    },
    'latest',
  ]) as string;

  if (!result || result === '0x') {
    return BigInt(0);
  }

  return BigInt(result);
}

/**
 * 检查是否需要授权
 */
export async function needsApproval(
  ownerAddress: string,
  amount: number,
  spenderAddress: string = POLYMARKET_CONTRACTS.CTF_EXCHANGE
): Promise<boolean> {
  const allowance = await checkAllowance(ownerAddress, spenderAddress);
  const requiredAmount = toUsdcUnits(amount);

  return allowance < requiredAmount;
}

/**
 * 获取USDC余额
 */
export async function getUsdcBalance(address: string): Promise<number> {
  const data = encodeFunctionData(ERC20_ABI.balanceOf, [address]);

  const result = await callRpc('eth_call', [
    {
      to: POLYMARKET_CONTRACTS.USDC,
      data,
    },
    'latest',
  ]) as string;

  if (!result || result === '0x') {
    return 0;
  }

  return fromUsdcUnits(BigInt(result));
}

/**
 * 构建Approve交易数据
 */
export function buildApproveTransaction(
  spenderAddress: string = POLYMARKET_CONTRACTS.CTF_EXCHANGE,
  amount: string = MAX_UINT256
): {
  to: string;
  data: string;
  value: string;
} {
  const data = encodeFunctionData(ERC20_ABI.approve, [spenderAddress, amount]);

  return {
    to: POLYMARKET_CONTRACTS.USDC,
    data,
    value: '0x0',
  };
}

/**
 * 发送Approve交易
 * 需要传入sendTransaction函数（来自Privy钱包）
 */
export async function sendApproveTransaction(
  sendTransaction: (tx: {
    to: string;
    data: string;
    value: string;
    chainId: number;
  }) => Promise<{ hash: string }>,
  spenderAddress: string = POLYMARKET_CONTRACTS.CTF_EXCHANGE,
  amount: string = MAX_UINT256
): Promise<string> {
  const tx = buildApproveTransaction(spenderAddress, amount);

  const result = await sendTransaction({
    ...tx,
    chainId: 137, // Polygon
  });

  return result.hash;
}

/**
 * 等待交易确认
 */
export async function waitForTransaction(
  txHash: string,
  confirmations: number = 1
): Promise<boolean> {
  const maxAttempts = 60; // 最多等待60次（约2分钟）
  let attempts = 0;

  while (attempts < maxAttempts) {
    try {
      const receipt = await callRpc('eth_getTransactionReceipt', [txHash]) as {
        status: string;
        blockNumber: string;
      } | null;

      if (receipt) {
        // 检查交易状态
        if (receipt.status === '0x1') {
          // 如果需要等待确认
          if (confirmations > 1) {
            const currentBlock = await callRpc('eth_blockNumber', []) as string;
            const txBlock = BigInt(receipt.blockNumber);
            const current = BigInt(currentBlock);

            if (current - txBlock >= BigInt(confirmations - 1)) {
              return true;
            }
          } else {
            return true;
          }
        } else {
          // 交易失败
          return false;
        }
      }
    } catch (error) {
      console.error('Error checking transaction:', error);
    }

    // 等待2秒后重试
    await new Promise(resolve => setTimeout(resolve, 2000));
    attempts++;
  }

  throw new Error('Transaction confirmation timeout');
}

/**
 * 检查并执行授权（如果需要）
 * 返回是否需要授权以及授权结果
 */
export async function checkAndApprove(
  ownerAddress: string,
  amount: number,
  sendTransaction: (tx: {
    to: string;
    data: string;
    value: string;
    chainId: number;
  }) => Promise<{ hash: string }>,
  spenderAddress: string = POLYMARKET_CONTRACTS.CTF_EXCHANGE
): Promise<{
  needed: boolean;
  approved: boolean;
  txHash?: string;
  error?: string;
}> {
  try {
    // 1. 检查是否需要授权
    const needs = await needsApproval(ownerAddress, amount, spenderAddress);

    if (!needs) {
      return { needed: false, approved: true };
    }

    // 2. 发送授权交易
    const txHash = await sendApproveTransaction(sendTransaction, spenderAddress);

    // 3. 等待交易确认
    const confirmed = await waitForTransaction(txHash);

    if (confirmed) {
      return { needed: true, approved: true, txHash };
    } else {
      return { needed: true, approved: false, txHash, error: 'Transaction failed' };
    }
  } catch (error) {
    return {
      needed: true,
      approved: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * 检查所有需要授权的合约
 * Polymarket需要授权给多个合约
 */
export async function checkAllAllowances(ownerAddress: string): Promise<{
  ctfExchange: bigint;
  negRiskExchange: bigint;
  negRiskAdapter: bigint;
}> {
  const [ctfExchange, negRiskExchange, negRiskAdapter] = await Promise.all([
    checkAllowance(ownerAddress, POLYMARKET_CONTRACTS.CTF_EXCHANGE),
    checkAllowance(ownerAddress, POLYMARKET_CONTRACTS.NEG_RISK_EXCHANGE),
    checkAllowance(ownerAddress, POLYMARKET_CONTRACTS.NEG_RISK_ADAPTER),
  ]);

  return {
    ctfExchange,
    negRiskExchange,
    negRiskAdapter,
  };
}

/**
 * 授权所有需要的合约
 */
export async function approveAllContracts(
  sendTransaction: (tx: {
    to: string;
    data: string;
    value: string;
    chainId: number;
  }) => Promise<{ hash: string }>
): Promise<{
  ctfExchange: string;
  negRiskExchange: string;
  negRiskAdapter: string;
}> {
  // 依次授权（不能并行，因为nonce问题）
  const ctfExchange = await sendApproveTransaction(
    sendTransaction,
    POLYMARKET_CONTRACTS.CTF_EXCHANGE
  );
  await waitForTransaction(ctfExchange);

  const negRiskExchange = await sendApproveTransaction(
    sendTransaction,
    POLYMARKET_CONTRACTS.NEG_RISK_EXCHANGE
  );
  await waitForTransaction(negRiskExchange);

  const negRiskAdapter = await sendApproveTransaction(
    sendTransaction,
    POLYMARKET_CONTRACTS.NEG_RISK_ADAPTER
  );
  await waitForTransaction(negRiskAdapter);

  return {
    ctfExchange,
    negRiskExchange,
    negRiskAdapter,
  };
}
