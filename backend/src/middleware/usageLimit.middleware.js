/**
 * Daily Usage Limit Middleware (Tier-Aware)
 *
 * Per-user daily business call limits. Pro users get unlimited access.
 * Uses in-memory Map for counts, keyed with date for automatic daily reset.
 * User tier is cached in memory for 60 seconds to avoid DB hits on every request.
 */

import prisma from '../lib/prisma.js';
import { getUserQuota } from '../config/quotas.js';

// Usage counts: key = `${userId}:${YYYY-MM-DD}`, value = count
const usageCounts = new Map();

// Tier cache: key = privyUserId, value = { tier, expiresAt, cachedAt }
const tierCache = new Map();
const TIER_CACHE_TTL_MS = 60 * 1000; // 60 seconds

// Hourly cleanup of stale usage counts
setInterval(() => {
  const today = getUTCDateString();
  for (const key of usageCounts.keys()) {
    if (!key.endsWith(`:${today}`)) {
      usageCounts.delete(key);
    }
  }
}, 60 * 60 * 1000);

function getUTCDateString() {
  return new Date().toISOString().slice(0, 10);
}

function getUTCResetTime() {
  const now = new Date();
  const tomorrow = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  return tomorrow.toISOString();
}

/**
 * Get user tier from DB with 60-second in-memory cache
 */
async function getUserTier(privyUserId) {
  const cached = tierCache.get(privyUserId);
  if (cached && Date.now() - cached.cachedAt < TIER_CACHE_TTL_MS) {
    return cached.tier;
  }

  const user = await prisma.user.findUnique({
    where: { privyUserId },
    select: { subscriptionTier: true, subscriptionExpiresAt: true },
  });

  if (!user) {
    return 'free';
  }

  let tier = user.subscriptionTier || 'free';

  // Auto-downgrade expired Pro
  if (tier === 'pro' && user.subscriptionExpiresAt && new Date() > user.subscriptionExpiresAt) {
    tier = 'free';
    // Fire-and-forget downgrade
    prisma.user.update({
      where: { privyUserId },
      data: { subscriptionTier: 'free' },
    }).catch(() => {});
  }

  tierCache.set(privyUserId, { tier, cachedAt: Date.now() });
  return tier;
}

/**
 * Invalidate tier cache for a user (call from webhook handlers after activation)
 */
export function invalidateTierCache(privyUserId) {
  tierCache.delete(privyUserId);
}

/**
 * Create a tier-aware daily usage limiter
 * @param {Object} options
 * @param {string} options.featureName - Feature name (for logging)
 */
export function createDailyUsageLimiter({ featureName = 'feature' } = {}) {
  return async (req, res, next) => {
    const userId = req.privyUser?.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
        errorCode: 'LOGIN_REQUIRED',
      });
    }

    // Get user tier
    const tier = await getUserTier(userId);
    res.set('X-Subscription-Tier', tier);

    const quota = getUserQuota(tier);
    const limit = quota.dailySentimentAnalysis;

    // Pro users with Infinity limit: skip counting
    if (limit === Infinity) {
      res.set('X-Usage-Limit', 'unlimited');
      res.set('X-Usage-Remaining', 'unlimited');
      return next();
    }

    const today = getUTCDateString();
    const key = `${userId}:${today}`;
    const current = usageCounts.get(key) || 0;
    const resetsAt = getUTCResetTime();

    // Set usage headers
    res.set('X-Usage-Limit', String(limit));
    res.set('X-Usage-Remaining', String(Math.max(0, limit - current)));
    res.set('X-Usage-Reset', resetsAt);

    if (current >= limit) {
      console.warn(`[UsageLimit] Daily limit reached for ${featureName}: user=${userId}, used=${current}/${limit}`);
      return res.status(429).json({
        success: false,
        error: `Daily ${featureName} limit reached. Resets at UTC midnight.`,
        errorCode: 'DAILY_LIMIT_REACHED',
        usage: {
          used: current,
          limit,
          resetsAt,
        },
      });
    }

    // Increment count
    usageCounts.set(key, current + 1);
    res.set('X-Usage-Remaining', String(Math.max(0, limit - current - 1)));

    next();
  };
}

/**
 * Sentiment analysis daily limiter (tier-aware)
 */
export const sentimentUsageLimiter = createDailyUsageLimiter({
  featureName: 'sentiment analysis',
});
