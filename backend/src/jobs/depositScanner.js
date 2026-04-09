/**
 * 充值扫描器 (兜底机制)
 *
 * 定时扫描平台收款地址的 USDC 转入交易，处理漏单
 *
 * 使用场景：
 * - 用户转账成功但前端未提交
 * - 网络问题导致前端提交失败
 * - 用户直接转账到平台地址（不通过 LiFi）
 *
 * 扫描间隔：1 分钟
 * 扫描范围：最近 30 个区块（约 1 分钟，与间隔匹配）
 */

import cron from 'node-cron';
import { ethers } from 'ethers';
import prisma from '../lib/prisma.js';
import {
  PLATFORM_RECEIVER,
  USDC_CONTRACTS,
  RPC_URLS,
} from '../config/recharge.config.js';
import { verifyAndCreditTransaction } from '../services/billing/recharge.service.js';
import { safeLog } from '../utils/security.utils.js';

// Transfer 事件的 topic0 (keccak256 of "Transfer(address,address,uint256)")
const TRANSFER_EVENT_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

// 扫描配置
const SCAN_CONFIG = {
  chain: 'polygon',           // 目前只扫描 Polygon
  blocksToScan: 30,           // 扫描最近 30 个区块（约 1 分钟，与扫描间隔匹配）
  minAmountUSDC: 0.001,       // 最小金额 (防止 dust)
};

// 缓存 provider 实例
let provider = null;

/**
 * 获取 Provider
 */
const getProvider = () => {
  if (!provider) {
    const rpcUrl = RPC_URLS[SCAN_CONFIG.chain];
    if (!rpcUrl) {
      throw new Error(`RPC URL not configured for chain: ${SCAN_CONFIG.chain}`);
    }
    provider = new ethers.providers.JsonRpcProvider(rpcUrl);
  }
  return provider;
};

/**
 * 扫描并处理充值
 */
export const scanDeposits = async () => {
  const chain = SCAN_CONFIG.chain;
  const platformReceiver = PLATFORM_RECEIVER[chain]?.toLowerCase();
  const usdcContract = USDC_CONTRACTS[chain]?.toLowerCase();

  if (!platformReceiver || !usdcContract) {
    safeLog.error('[DepositScanner]', 'Missing configuration', {
      chain,
      hasReceiver: !!platformReceiver,
      hasContract: !!usdcContract,
    });
    return;
  }

  try {
    const ethersProvider = getProvider();
    const latestBlock = await ethersProvider.getBlockNumber();
    const fromBlock = Math.max(0, latestBlock - SCAN_CONFIG.blocksToScan);

    safeLog.info('[DepositScanner]', 'Scanning blocks', {
      chain,
      fromBlock,
      toBlock: latestBlock,
      blocksToScan: latestBlock - fromBlock,
    });

    // 查询 Transfer 事件：to = 平台地址
    const logs = await ethersProvider.getLogs({
      fromBlock,
      toBlock: latestBlock,
      address: usdcContract,
      topics: [
        TRANSFER_EVENT_TOPIC,
        null, // from (any)
        ethers.utils.hexZeroPad(platformReceiver, 32), // to = 平台地址
      ],
    });

    if (logs.length === 0) {
      safeLog.info('[DepositScanner]', 'No new deposits found');
      return;
    }

    safeLog.info('[DepositScanner]', `Found ${logs.length} Transfer events`);

    // 处理每个 Transfer 事件
    let processed = 0;
    let skipped = 0;
    let failed = 0;

    for (const log of logs) {
      const txHash = log.transactionHash.toLowerCase();

      // 检查是否已处理
      const existingOrder = await prisma.rechargeOrder.findUnique({
        where: { txHash },
      });

      if (existingOrder) {
        // 已处理，跳过
        skipped++;
        continue;
      }

      // 解析金额
      const amount = ethers.BigNumber.from(log.data);
      const amountUSDC = Number(amount) / 1e6;

      // 检查金额是否太小
      if (amountUSDC < SCAN_CONFIG.minAmountUSDC) {
        safeLog.info('[DepositScanner]', 'Skipping dust transfer', {
          txHash: txHash.slice(0, 16) + '...',
          amount: amountUSDC,
        });
        skipped++;
        continue;
      }

      safeLog.info('[DepositScanner]', 'Found unprocessed deposit', {
        txHash: txHash.slice(0, 16) + '...',
        amount: amountUSDC,
      });

      // 尝试匹配用户
      // 方法 1：从交易的 from 地址查找用户
      const from = '0x' + log.topics[1].slice(26).toLowerCase();

      // 查找钱包地址匹配的用户
      let user = await prisma.user.findFirst({
        where: {
          OR: [
            { walletAddress: from },
            { safeAddress: from },
          ],
        },
      });

      // 方法 2：如果没找到，检查是否有该 txHash 的 pending 订单
      if (!user) {
        const pendingOrder = await prisma.rechargeOrder.findFirst({
          where: {
            status: 'pending',
            payerAddress: from,
          },
          include: { user: true },
        });

        if (pendingOrder?.user) {
          user = pendingOrder.user;
        }
      }

      if (!user) {
        safeLog.warn('[DepositScanner]', 'Cannot match user for deposit', {
          txHash: txHash.slice(0, 16) + '...',
          from: from.slice(0, 16) + '...',
          amount: amountUSDC,
        });
        // 无法匹配用户，记录但不处理
        // TODO: 可以创建一个待认领的充值记录
        failed++;
        continue;
      }

      // 调用验证并充值
      try {
        const result = await verifyAndCreditTransaction(user.id, txHash, chain);

        if (result.success) {
          safeLog.info('[DepositScanner]', '✅ Auto-credited deposit', {
            txHash: txHash.slice(0, 16) + '...',
            userId: user.id.slice(0, 8) + '...',
            amount: result.creditsAmount,
            alreadyProcessed: result.alreadyProcessed || false,
          });
          processed++;
        } else {
          safeLog.warn('[DepositScanner]', 'Failed to credit deposit', {
            txHash: txHash.slice(0, 16) + '...',
            error: result.error,
          });
          failed++;
        }
      } catch (err) {
        safeLog.error('[DepositScanner]', 'Error processing deposit', {
          txHash: txHash.slice(0, 16) + '...',
          error: err.message,
        });
        failed++;
      }
    }

    safeLog.info('[DepositScanner]', 'Scan completed', {
      total: logs.length,
      processed,
      skipped,
      failed,
    });

  } catch (error) {
    safeLog.error('[DepositScanner]', 'Scan error', {
      message: error.message,
    });
  }
};

/**
 * 启动定时扫描任务
 * 间隔：每 1 分钟
 */
export const startDepositScanner = () => {
  // 检查配置
  const chain = SCAN_CONFIG.chain;
  const platformReceiver = PLATFORM_RECEIVER[chain];

  if (!platformReceiver) {
    safeLog.warn('[DepositScanner]', 'Platform receiver not configured, scanner disabled');
    return;
  }

  safeLog.info('[DepositScanner]', 'Starting deposit scanner', {
    chain,
    interval: '1 minute',
    blocksToScan: SCAN_CONFIG.blocksToScan,
  });

  // 每分钟执行一次
  cron.schedule('* * * * *', async () => {
    safeLog.info('[DepositScanner]', 'Running scheduled scan...');
    await scanDeposits();
  });

  // 启动时立即执行一次
  setTimeout(async () => {
    safeLog.info('[DepositScanner]', 'Running initial scan...');
    await scanDeposits();
  }, 5000); // 延迟 5 秒，等待服务器完全启动
};

export default {
  scanDeposits,
  startDepositScanner,
};
