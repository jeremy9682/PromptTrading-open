/**
 * Subscription Webhook Service
 *
 * Handles webhook signature verification and event processing
 * for Coinbase Commerce and Helio (MoonPay Commerce).
 */

import crypto from 'crypto';
import prisma from '../../lib/prisma.js';
import { getSubscriptionCredentials } from '../../config/secrets.js';
import { activateSubscription } from './subscription.service.js';
import { safeLog } from '../../utils/security.utils.js';

// ============================================
// Coinbase Commerce
// ============================================

/**
 * Verify Coinbase Commerce webhook signature (HMAC-SHA256)
 *
 * @param {Buffer} rawBody - Raw request body
 * @param {string} signature - X-CC-Webhook-Signature header
 * @returns {boolean}
 */
export const verifyCoinbaseSignature = async (rawBody, signature) => {
  if (!rawBody || !signature) return false;

  const credentials = await getSubscriptionCredentials();
  if (!credentials.coinbaseWebhookSecret) {
    safeLog.warn('[Webhook]', 'Coinbase webhook secret not configured', {});
    return false;
  }

  const hmac = crypto.createHmac('sha256', credentials.coinbaseWebhookSecret);
  hmac.update(rawBody);
  const expectedSignature = hmac.digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
};

/**
 * Handle Coinbase Commerce webhook event
 *
 * Only processes `charge:confirmed` events.
 *
 * @param {Object} event - Parsed webhook event
 */
export const handleCoinbaseWebhook = async (event) => {
  const eventType = event.type;
  const eventId = event.id;

  safeLog.info('[Webhook]', 'Coinbase event received', {
    type: eventType,
    eventId,
  });

  // Only process confirmed charges
  if (eventType !== 'charge:confirmed') {
    safeLog.info('[Webhook]', 'Skipping non-confirmed Coinbase event', { type: eventType });
    return { processed: false, reason: `Ignored event type: ${eventType}` };
  }

  const chargeData = event.data;
  const chargeId = chargeData?.id;

  if (!chargeId) {
    throw new Error('Missing charge ID in webhook payload');
  }

  // Find order by providerChargeId
  const order = await prisma.subscriptionOrder.findFirst({
    where: { providerChargeId: chargeId, provider: 'coinbase' },
  });

  if (!order) {
    safeLog.warn('[Webhook]', 'No matching order for Coinbase charge', { chargeId });
    throw new Error(`No order found for charge: ${chargeId}`);
  }

  // Activate subscription
  await activateSubscription(order.id, eventId, event);

  return { processed: true, orderNo: order.orderNo };
};

// ============================================
// Helio (MoonPay Commerce)
// ============================================

/**
 * Verify Helio webhook signature (Bearer token comparison)
 *
 * @param {string} authHeader - Authorization header value
 * @returns {boolean}
 */
export const verifyHelioSignature = async (authHeader) => {
  if (!authHeader) return false;

  const credentials = await getSubscriptionCredentials();
  if (!credentials.helioWebhookSecret) {
    safeLog.warn('[Webhook]', 'Helio webhook secret not configured', {});
    return false;
  }

  const token = authHeader.replace(/^Bearer\s+/i, '');
  return crypto.timingSafeEqual(
    Buffer.from(token),
    Buffer.from(credentials.helioWebhookSecret)
  );
};

/**
 * Handle Helio webhook event
 *
 * Only processes `CREATED` events (payment completed).
 *
 * @param {Object} event - Parsed webhook event
 */
export const handleHelioWebhook = async (event) => {
  const eventType = event.event;
  const transactionId = event.transactionId || event.id;

  safeLog.info('[Webhook]', 'Helio event received', {
    type: eventType,
    transactionId,
  });

  // Only process CREATED events (payment confirmed)
  if (eventType !== 'CREATED') {
    safeLog.info('[Webhook]', 'Skipping non-CREATED Helio event', { type: eventType });
    return { processed: false, reason: `Ignored event type: ${eventType}` };
  }

  const paylinkId = event.paylinkId || event.paymentId;

  if (!paylinkId) {
    throw new Error('Missing paylink ID in webhook payload');
  }

  // Find order by providerChargeId
  const order = await prisma.subscriptionOrder.findFirst({
    where: { providerChargeId: paylinkId, provider: 'moonpay' },
  });

  if (!order) {
    safeLog.warn('[Webhook]', 'No matching order for Helio paylink', { paylinkId });
    throw new Error(`No order found for paylink: ${paylinkId}`);
  }

  // Activate subscription
  const eventId = `helio-${transactionId}`;
  await activateSubscription(order.id, eventId, event);

  return { processed: true, orderNo: order.orderNo };
};

export default {
  verifyCoinbaseSignature,
  handleCoinbaseWebhook,
  verifyHelioSignature,
  handleHelioWebhook,
};
