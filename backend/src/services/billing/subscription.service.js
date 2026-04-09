/**
 * Subscription Service
 *
 * Handles Pro subscription lifecycle:
 * - Check subscription status
 * - Create checkout sessions (Coinbase Commerce / Helio)
 * - Activate subscription on payment confirmation
 *
 * Follows recharge.service.js patterns (Prisma transactions, safeLog).
 */

import crypto from 'crypto';
import prisma from '../../lib/prisma.js';
import { SUBSCRIPTION_PLANS, COINBASE_CONFIG, HELIO_CONFIG, ORDER_EXPIRY_MINUTES } from '../../config/subscription.config.js';
import { getSubscriptionCredentials } from '../../config/secrets.js';
import { safeLog } from '../../utils/security.utils.js';

/**
 * Generate unique order number
 * Format: SUB-{timestamp}-{random}
 */
const generateOrderNo = () => {
  const timestamp = Date.now();
  const random = crypto.randomBytes(4).toString('hex');
  return `SUB-${timestamp}-${random}`;
};

/**
 * Get subscription status for a user
 *
 * @param {string} userId - Database user ID
 * @returns {{ tier: string, expiresAt: Date|null, isActive: boolean, daysRemaining: number }}
 */
export const getSubscriptionStatus = async (userId) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      subscriptionTier: true,
      subscriptionExpiresAt: true,
      subscriptionProvider: true,
    },
  });

  if (!user) {
    throw new Error('User not found');
  }

  // Auto-downgrade expired Pro users
  if (user.subscriptionTier === 'pro' && user.subscriptionExpiresAt) {
    if (new Date() > user.subscriptionExpiresAt) {
      await prisma.user.update({
        where: { id: userId },
        data: { subscriptionTier: 'free' },
      });

      safeLog.info('[Subscription]', 'Auto-downgraded expired Pro user', {
        userId: userId.slice(0, 8) + '...',
      });

      return {
        tier: 'free',
        expiresAt: null,
        isActive: false,
        daysRemaining: 0,
      };
    }

    const daysRemaining = Math.ceil(
      (user.subscriptionExpiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    );

    return {
      tier: 'pro',
      expiresAt: user.subscriptionExpiresAt,
      isActive: true,
      daysRemaining,
      provider: user.subscriptionProvider,
    };
  }

  return {
    tier: user.subscriptionTier || 'free',
    expiresAt: user.subscriptionExpiresAt,
    isActive: user.subscriptionTier === 'pro',
    daysRemaining: 0,
  };
};

/**
 * Create a Coinbase Commerce checkout session
 *
 * @param {string} userId - Database user ID
 * @returns {{ orderNo: string, hostedUrl: string }}
 */
export const createCoinbaseCheckout = async (userId) => {
  const credentials = await getSubscriptionCredentials();
  if (!credentials.coinbaseApiKey) {
    throw new Error('Coinbase Commerce API key not configured');
  }

  const plan = SUBSCRIPTION_PLANS.pro;
  const orderNo = generateOrderNo();
  const expiresAt = new Date(Date.now() + ORDER_EXPIRY_MINUTES * 60 * 1000);

  // Create charge on Coinbase Commerce
  const response = await fetch(`${COINBASE_CONFIG.apiUrl}/charges`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-CC-Api-Key': credentials.coinbaseApiKey,
      'X-CC-Version': '2018-03-22',
    },
    body: JSON.stringify({
      name: plan.name,
      description: plan.description,
      pricing_type: 'fixed_price',
      local_price: {
        amount: plan.priceUsd,
        currency: 'USD',
      },
      metadata: {
        orderNo,
        userId,
      },
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    safeLog.warn('[Subscription]', 'Coinbase charge creation failed', {
      status: response.status,
      body: errorBody.slice(0, 200),
    });
    throw new Error('Failed to create Coinbase checkout');
  }

  const { data } = await response.json();

  // Create order in DB
  await prisma.subscriptionOrder.create({
    data: {
      userId,
      orderNo,
      amount: parseFloat(plan.priceUsd),
      currency: 'USD',
      provider: 'coinbase',
      providerChargeId: data.id,
      providerCode: data.code,
      hostedUrl: data.hosted_url,
      status: 'pending',
      expiresAt,
    },
  });

  safeLog.info('[Subscription]', 'Coinbase checkout created', {
    orderNo,
    chargeId: data.id,
  });

  return {
    orderNo,
    hostedUrl: data.hosted_url,
  };
};

/**
 * Create a Helio (MoonPay Commerce) checkout session
 *
 * @param {string} userId - Database user ID
 * @returns {{ orderNo: string, hostedUrl: string }}
 */
export const createHelioCheckout = async (userId) => {
  const credentials = await getSubscriptionCredentials();
  if (!credentials.helioApiKey) {
    throw new Error('Helio API key not configured');
  }

  const plan = SUBSCRIPTION_PLANS.pro;
  const orderNo = generateOrderNo();
  const expiresAt = new Date(Date.now() + ORDER_EXPIRY_MINUTES * 60 * 1000);
  const apiUrl = process.env.NODE_ENV === 'development' ? HELIO_CONFIG.devnetApiUrl : HELIO_CONFIG.apiUrl;

  // Create paylink on Helio
  const response = await fetch(`${apiUrl}/paylink/create`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${credentials.helioApiKey}`,
    },
    body: JSON.stringify({
      name: plan.name,
      description: plan.description,
      price: HELIO_CONFIG.priceBaseUnits,
      currency: 'USDC',
      features: { requireEmail: false },
      metadata: JSON.stringify({ orderNo, userId }),
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    safeLog.warn('[Subscription]', 'Helio paylink creation failed', {
      status: response.status,
      body: errorBody.slice(0, 200),
    });
    throw new Error('Failed to create MoonPay checkout');
  }

  const data = await response.json();
  const hostedUrl = data.url || data.paymentUrl || `https://app.hel.io/pay/${data.id}`;

  // Create order in DB
  await prisma.subscriptionOrder.create({
    data: {
      userId,
      orderNo,
      amount: parseFloat(plan.priceUsd),
      currency: 'USD',
      provider: 'moonpay',
      providerChargeId: data.id,
      hostedUrl,
      status: 'pending',
      expiresAt,
    },
  });

  safeLog.info('[Subscription]', 'Helio checkout created', {
    orderNo,
    paylinkId: data.id,
  });

  return {
    orderNo,
    hostedUrl,
  };
};

/**
 * Activate a subscription after payment confirmation
 *
 * Idempotent via webhookEventId uniqueness constraint.
 *
 * @param {string} orderId - SubscriptionOrder.id
 * @param {string} webhookEventId - Unique event ID from webhook (for idempotency)
 * @param {Object} webhookPayload - Raw webhook payload for audit
 */
export const activateSubscription = async (orderId, webhookEventId, webhookPayload) => {
  const plan = SUBSCRIPTION_PLANS.pro;

  const result = await prisma.$transaction(async (tx) => {
    // Fetch order
    const order = await tx.subscriptionOrder.findUnique({
      where: { id: orderId },
    });

    if (!order) {
      throw new Error('Subscription order not found');
    }

    // Already completed — idempotent
    if (order.status === 'completed') {
      safeLog.info('[Subscription]', 'Order already completed (idempotent)', {
        orderNo: order.orderNo,
      });
      return { alreadyCompleted: true, order };
    }

    if (order.status !== 'pending') {
      throw new Error(`Cannot activate order with status: ${order.status}`);
    }

    // Calculate subscription period
    const user = await tx.user.findUnique({
      where: { id: order.userId },
      select: {
        subscriptionTier: true,
        subscriptionExpiresAt: true,
      },
    });

    // If user already has active Pro, extend from current expiry
    let periodStart = new Date();
    if (
      user.subscriptionTier === 'pro' &&
      user.subscriptionExpiresAt &&
      user.subscriptionExpiresAt > new Date()
    ) {
      periodStart = user.subscriptionExpiresAt;
    }

    const periodEnd = new Date(periodStart.getTime() + plan.intervalDays * 24 * 60 * 60 * 1000);

    // Mark order completed
    const updatedOrder = await tx.subscriptionOrder.update({
      where: { id: orderId },
      data: {
        status: 'completed',
        webhookEventId,
        webhookPayload,
        periodStart,
        periodEnd,
        completedAt: new Date(),
      },
    });

    // Update user subscription
    await tx.user.update({
      where: { id: order.userId },
      data: {
        subscriptionTier: 'pro',
        subscriptionExpiresAt: periodEnd,
        subscriptionProvider: order.provider,
      },
    });

    return { alreadyCompleted: false, order: updatedOrder };
  });

  if (!result.alreadyCompleted) {
    safeLog.info('[Subscription]', 'Subscription activated', {
      orderNo: result.order.orderNo,
      provider: result.order.provider,
      periodEnd: result.order.periodEnd,
    });
  }

  return result;
};

export default {
  getSubscriptionStatus,
  createCoinbaseCheckout,
  createHelioCheckout,
  activateSubscription,
};
