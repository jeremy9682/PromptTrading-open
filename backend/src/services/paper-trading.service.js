/**
 * Paper Trading Service (模拟盘服务)
 *
 * 处理模拟交易的核心业务逻辑
 */

import prisma from '../lib/prisma.js';

const DEFAULT_INITIAL_BALANCE = 10000;

/**
 * 获取或创建用户的模拟账户
 */
export async function getOrCreatePaperAccount(userId) {
  let account = await prisma.paperTradingAccount.findUnique({
    where: { userId },
    include: {
      positions: true,
      trades: {
        orderBy: { executedAt: 'desc' },
        take: 50 // 最近50条交易记录
      }
    }
  });

  if (!account) {
    account = await prisma.paperTradingAccount.create({
      data: {
        userId,
        balance: DEFAULT_INITIAL_BALANCE,
        initialBalance: DEFAULT_INITIAL_BALANCE
      },
      include: {
        positions: true,
        trades: true
      }
    });
    console.log(`[PaperTrading] Created new paper account for user: ${userId}`);
  }

  return account;
}

/**
 * 获取账户详情（包括持仓和交易历史）
 */
export async function getPaperAccountDetails(userId) {
  const account = await getOrCreatePaperAccount(userId);

  // 计算总资产和盈亏
  const positionValue = account.positions.reduce((sum, pos) => {
    // 简单计算：使用入场价格作为当前价值（实际应该获取实时价格）
    return sum + parseFloat(pos.size) * parseFloat(pos.entryPrice);
  }, 0);

  const totalAssets = parseFloat(account.balance) + positionValue;
  const totalPnL = totalAssets - parseFloat(account.initialBalance);
  const totalPnLPercent = (totalPnL / parseFloat(account.initialBalance)) * 100;

  return {
    id: account.id,
    balance: parseFloat(account.balance),
    initialBalance: parseFloat(account.initialBalance),
    positionValue,
    totalAssets,
    totalPnL,
    totalPnLPercent,
    positions: account.positions.map(formatPosition),
    trades: account.trades.map(formatTrade),
    lastResetAt: account.lastResetAt,
    createdAt: account.createdAt,
    updatedAt: account.updatedAt
  };
}

/**
 * 执行模拟买入
 */
export async function executePaperBuy(userId, params) {
  const {
    eventId,
    eventTitle,
    side,        // 'YES' | 'NO'
    price,       // 0-1 之间的价格
    amount,      // 投入的 USDC 金额
    source = 'POLYMARKET',  // 市场来源: 'POLYMARKET' | 'KALSHI'
    traderId = null,        // 可选: 关联的 PaperTrader ID
    fromAiAnalysis = false,
    aiConfidence = null
  } = params;

  // 获取账户
  const account = await getOrCreatePaperAccount(userId);

  // 检查余额
  if (parseFloat(account.balance) < amount) {
    return {
      success: false,
      error: 'Insufficient balance',
      availableBalance: parseFloat(account.balance)
    };
  }

  // 计算获得的 shares
  const shares = amount / price;

  // 开始事务
  const result = await prisma.$transaction(async (tx) => {
    // 1. 扣减余额
    await tx.paperTradingAccount.update({
      where: { id: account.id },
      data: {
        balance: { decrement: amount }
      }
    });

    // 2. 查找现有持仓
    const existingPosition = await tx.paperPosition.findUnique({
      where: {
        accountId_eventId_side: {
          accountId: account.id,
          eventId,
          side
        }
      }
    });

    let position;
    if (existingPosition) {
      // 合并持仓：计算新的平均价格
      const newSize = parseFloat(existingPosition.size) + shares;
      const newTotalCost = parseFloat(existingPosition.totalCost) + amount;
      const newEntryPrice = newTotalCost / newSize;

      position = await tx.paperPosition.update({
        where: { id: existingPosition.id },
        data: {
          size: newSize,
          entryPrice: newEntryPrice,
          totalCost: newTotalCost
        }
      });
    } else {
      // 创建新持仓
      position = await tx.paperPosition.create({
        data: {
          accountId: account.id,
          eventId,
          eventTitle,
          side,
          size: shares,
          entryPrice: price,
          totalCost: amount,
          source  // 保存市场来源
        }
      });
    }

    // 3. 记录交易
    const trade = await tx.paperTrade.create({
      data: {
        accountId: account.id,
        traderId,  // 关联 PaperTrader (可选)
        eventId,
        eventTitle,
        action: 'BUY',
        side,
        size: shares,
        price,
        amount,
        source,    // 保存市场来源
        fromAiAnalysis,
        aiConfidence
      }
    });

    return { position, trade };
  });

  console.log(`[PaperTrading] BUY executed: ${amount} USDC -> ${shares.toFixed(2)} ${side} shares @ ${(price * 100).toFixed(0)}¢`);

  return {
    success: true,
    trade: formatTrade(result.trade),
    position: formatPosition(result.position),
    newBalance: parseFloat(account.balance) - amount
  };
}

/**
 * 执行模拟卖出（平仓）
 */
export async function executePaperSell(userId, params) {
  const {
    positionId,   // 持仓 ID
    sellPrice,    // 卖出价格 (0-1)
    traderId = null,  // 可选: 关联的 PaperTrader ID
    fromAiAnalysis = false,
    aiConfidence = null
  } = params;

  // 获取账户
  const account = await getOrCreatePaperAccount(userId);

  // 获取持仓
  const position = await prisma.paperPosition.findFirst({
    where: {
      id: positionId,
      accountId: account.id
    }
  });

  if (!position) {
    return {
      success: false,
      error: 'Position not found'
    };
  }

  // 计算卖出金额和盈亏
  const sellAmount = parseFloat(position.size) * sellPrice;
  const pnl = sellAmount - parseFloat(position.totalCost);

  // 开始事务
  const result = await prisma.$transaction(async (tx) => {
    // 1. 增加余额
    await tx.paperTradingAccount.update({
      where: { id: account.id },
      data: {
        balance: { increment: sellAmount }
      }
    });

    // 2. 删除持仓
    await tx.paperPosition.delete({
      where: { id: position.id }
    });

    // 3. 记录交易
    const trade = await tx.paperTrade.create({
      data: {
        accountId: account.id,
        traderId,  // 关联 PaperTrader (可选)
        eventId: position.eventId,
        eventTitle: position.eventTitle,
        action: 'SELL',
        side: position.side,
        size: parseFloat(position.size),
        price: sellPrice,
        amount: sellAmount,
        pnl,
        source: position.source || 'POLYMARKET',  // 从持仓继承市场来源
        fromAiAnalysis,
        aiConfidence
      }
    });

    return { trade };
  });

  console.log(`[PaperTrading] SELL executed: ${parseFloat(position.size).toFixed(2)} shares -> ${sellAmount.toFixed(2)} USDC (PnL: ${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)})`);

  return {
    success: true,
    trade: formatTrade(result.trade),
    pnl,
    newBalance: parseFloat(account.balance) + sellAmount
  };
}

/**
 * 重置模拟账户
 */
export async function resetPaperAccount(userId) {
  const account = await prisma.paperTradingAccount.findUnique({
    where: { userId }
  });

  if (!account) {
    // 如果账户不存在，创建一个新的
    return getOrCreatePaperAccount(userId);
  }

  // 开始事务：删除所有持仓和交易记录，重置余额
  await prisma.$transaction(async (tx) => {
    // 删除所有持仓
    await tx.paperPosition.deleteMany({
      where: { accountId: account.id }
    });

    // 删除所有交易记录（可选：保留交易记录用于统计）
    await tx.paperTrade.deleteMany({
      where: { accountId: account.id }
    });

    // 重置账户
    await tx.paperTradingAccount.update({
      where: { id: account.id },
      data: {
        balance: DEFAULT_INITIAL_BALANCE,
        initialBalance: DEFAULT_INITIAL_BALANCE,
        lastResetAt: new Date()
      }
    });
  });

  console.log(`[PaperTrading] Account reset for user: ${userId}`);

  return {
    success: true,
    balance: DEFAULT_INITIAL_BALANCE,
    message: 'Paper account reset successfully'
  };
}

/**
 * 获取交易历史
 */
export async function getPaperTradeHistory(userId, options = {}) {
  const { limit = 50, offset = 0 } = options;

  const account = await prisma.paperTradingAccount.findUnique({
    where: { userId }
  });

  if (!account) {
    return { trades: [], total: 0 };
  }

  const [trades, total] = await Promise.all([
    prisma.paperTrade.findMany({
      where: { accountId: account.id },
      orderBy: { executedAt: 'desc' },
      take: limit,
      skip: offset
    }),
    prisma.paperTrade.count({
      where: { accountId: account.id }
    })
  ]);

  return {
    trades: trades.map(formatTrade),
    total,
    hasMore: offset + trades.length < total
  };
}

/**
 * 获取持仓列表
 */
export async function getPaperPositions(userId) {
  const account = await prisma.paperTradingAccount.findUnique({
    where: { userId }
  });

  if (!account) {
    return [];
  }

  const positions = await prisma.paperPosition.findMany({
    where: { accountId: account.id },
    orderBy: { updatedAt: 'desc' }
  });

  return positions.map(formatPosition);
}

/**
 * 更新持仓的当前价值（用于实时价格更新）
 */
export async function updatePositionValue(userId, eventId, side, currentPrice) {
  const account = await prisma.paperTradingAccount.findUnique({
    where: { userId }
  });

  if (!account) return null;

  const position = await prisma.paperPosition.findUnique({
    where: {
      accountId_eventId_side: {
        accountId: account.id,
        eventId,
        side
      }
    }
  });

  if (!position) return null;

  // 计算当前价值和未实现盈亏
  const currentValue = parseFloat(position.size) * currentPrice;
  const unrealizedPnL = currentValue - parseFloat(position.totalCost);

  return {
    ...formatPosition(position),
    currentPrice,
    currentValue,
    unrealizedPnL,
    unrealizedPnLPercent: (unrealizedPnL / parseFloat(position.totalCost)) * 100
  };
}

/**
 * 根据 AI 分析执行模拟交易
 */
export async function executeFromAiAnalysis(userId, analysisResult) {
  const {
    eventId,
    eventTitle,
    action,      // 'buy_yes', 'buy_no', 'sell_yes', 'sell_no', 'hold'
    confidence,
    price,
    amount = 100,  // 默认投入 $100
    source = 'POLYMARKET',  // 市场来源: 'POLYMARKET' | 'KALSHI'
    traderId = null  // 可选: 关联的 PaperTrader ID
  } = analysisResult;

  // 如果是 hold，不执行交易
  if (action === 'hold') {
    return {
      success: true,
      executed: false,
      message: 'AI recommends holding, no trade executed'
    };
  }

  // 解析 action
  const isBuy = action.startsWith('buy_');
  const side = action.includes('yes') ? 'YES' : 'NO';

  if (isBuy) {
    return executePaperBuy(userId, {
      eventId,
      eventTitle,
      side,
      price,
      amount,
      source,      // 传递市场来源
      traderId,    // 传递 PaperTrader ID
      fromAiAnalysis: true,
      aiConfidence: confidence
    });
  } else {
    // 卖出：需要找到对应的持仓
    const positions = await getPaperPositions(userId);
    const position = positions.find(p => p.eventId === eventId && p.side === side);

    if (!position) {
      return {
        success: false,
        error: `No ${side} position found for this event`
      };
    }

    return executePaperSell(userId, {
      positionId: position.id,
      sellPrice: price,
      traderId,    // 传递 PaperTrader ID
      fromAiAnalysis: true,
      aiConfidence: confidence
    });
  }
}

// ============================================
// Helper Functions
// ============================================

function formatPosition(position) {
  return {
    id: position.id,
    eventId: position.eventId,
    eventTitle: position.eventTitle,
    side: position.side,
    size: parseFloat(position.size),
    entryPrice: parseFloat(position.entryPrice),
    totalCost: parseFloat(position.totalCost),
    source: position.source || 'POLYMARKET',  // 市场来源
    createdAt: position.createdAt,
    updatedAt: position.updatedAt
  };
}

function formatTrade(trade) {
  return {
    id: trade.id,
    eventId: trade.eventId,
    eventTitle: trade.eventTitle,
    action: trade.action,
    side: trade.side,
    size: parseFloat(trade.size),
    price: parseFloat(trade.price),
    amount: parseFloat(trade.amount),
    pnl: trade.pnl ? parseFloat(trade.pnl) : null,
    source: trade.source || 'POLYMARKET',  // 市场来源
    traderId: trade.traderId,  // 关联的 PaperTrader ID
    fromAiAnalysis: trade.fromAiAnalysis,
    aiConfidence: trade.aiConfidence,
    executedAt: trade.executedAt
  };
}
