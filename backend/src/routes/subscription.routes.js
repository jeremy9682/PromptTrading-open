/**
 * Subscription Routes
 *
 * Handles Pro subscription API:
 * - GET  /status          - Get current subscription status
 * - POST /create-checkout - Create checkout session (Coinbase or MoonPay)
 * - POST /webhook/coinbase - Coinbase Commerce webhook
 * - POST /webhook/moonpay  - Helio (MoonPay) webhook
 */

import express from 'express';
import { requirePrivyAuth } from '../middleware/privyAuth.middleware.js';
import { createRateLimiter } from '../middleware/rateLimit.middleware.js';
import prisma from '../lib/prisma.js';
import {
  getSubscriptionStatus,
  createCoinbaseCheckout,
  createHelioCheckout,
} from '../services/billing/subscription.service.js';
import {
  verifyCoinbaseSignature,
  handleCoinbaseWebhook,
  verifyHelioSignature,
  handleHelioWebhook,
} from '../services/billing/subscription-webhook.service.js';
import { invalidateTierCache } from '../middleware/usageLimit.middleware.js';

const router = express.Router();

const checkoutRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 5,
  message: 'Too many checkout requests, please try again later',
});

// ============================================
// Authenticated Routes
// ============================================

/**
 * GET /api/subscription/status
 * Get current subscription status
 */
router.get('/status', requirePrivyAuth, async (req, res) => {
  try {
    const privyUserId = req.privyUser.userId;

    const user = await prisma.user.findUnique({
      where: { privyUserId },
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
      });
    }

    const status = await getSubscriptionStatus(user.id);

    res.json({
      success: true,
      data: status,
    });
  } catch (error) {
    console.error('[Subscription] Status error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/subscription/create-checkout
 * Create a checkout session for Pro subscription
 * Body: { provider: 'coinbase' | 'moonpay' }
 */
router.post('/create-checkout', requirePrivyAuth, checkoutRateLimiter, async (req, res) => {
  try {
    const { provider } = req.body;
    const privyUserId = req.privyUser.userId;

    if (!provider || !['coinbase', 'moonpay'].includes(provider)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid provider. Must be "coinbase" or "moonpay".',
      });
    }

    const user = await prisma.user.findUnique({
      where: { privyUserId },
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found. Please sync your account first.',
      });
    }

    let result;
    if (provider === 'coinbase') {
      result = await createCoinbaseCheckout(user.id);
    } else {
      result = await createHelioCheckout(user.id);
    }

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('[Subscription] Create checkout error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// ============================================
// Webhook Routes (No Auth — signature verified)
// ============================================

/**
 * POST /api/subscription/webhook/coinbase
 * Coinbase Commerce webhook handler
 */
router.post('/webhook/coinbase', async (req, res) => {
  try {
    const signature = req.headers['x-cc-webhook-signature'];
    const rawBody = req.rawBody;

    if (!rawBody || !signature) {
      return res.status(400).json({ error: 'Missing signature or body' });
    }

    const valid = await verifyCoinbaseSignature(rawBody, signature);
    if (!valid) {
      console.warn('[Webhook] Invalid Coinbase signature');
      return res.status(401).json({ error: 'Invalid signature' });
    }

    const event = JSON.parse(rawBody.toString());
    const result = await handleCoinbaseWebhook(event);

    // Invalidate tier cache for the user
    if (result.processed && result.orderNo) {
      const order = await prisma.subscriptionOrder.findUnique({
        where: { orderNo: result.orderNo },
        include: { user: { select: { privyUserId: true } } },
      });
      if (order?.user?.privyUserId) {
        invalidateTierCache(order.user.privyUserId);
      }
    }

    res.status(200).json({ success: true, ...result });
  } catch (error) {
    console.error('[Webhook] Coinbase webhook error:', error);
    // Return 200 to prevent retries for known errors
    res.status(200).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/subscription/webhook/moonpay
 * Helio (MoonPay Commerce) webhook handler
 */
router.post('/webhook/moonpay', async (req, res) => {
  try {
    const authHeader = req.headers['authorization'];

    const valid = await verifyHelioSignature(authHeader);
    if (!valid) {
      console.warn('[Webhook] Invalid Helio signature');
      return res.status(401).json({ error: 'Invalid signature' });
    }

    const event = req.body;
    const result = await handleHelioWebhook(event);

    // Invalidate tier cache for the user
    if (result.processed && result.orderNo) {
      const order = await prisma.subscriptionOrder.findUnique({
        where: { orderNo: result.orderNo },
        include: { user: { select: { privyUserId: true } } },
      });
      if (order?.user?.privyUserId) {
        invalidateTierCache(order.user.privyUserId);
      }
    }

    res.status(200).json({ success: true, ...result });
  } catch (error) {
    console.error('[Webhook] Helio webhook error:', error);
    res.status(200).json({ success: false, error: error.message });
  }
});

export default router;
