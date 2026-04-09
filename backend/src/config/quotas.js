/**
 * User Quota Configuration
 * Defines limits for free and paid users
 */

// Free tier limits
export const FREE_TIER_QUOTAS = {
  maxWatchlistItems: 20,      // Maximum events in watchlist
  maxTraders: 3,              // Maximum total traders
  maxActiveTraders: 2,        // Maximum simultaneously running traders
  minAnalysisInterval: 15,    // Minimum minutes between analysis
  dailySentimentAnalysis: 5,  // Daily community sentiment analysis calls
};

// Pro tier limits (for future use)
export const PRO_TIER_QUOTAS = {
  maxWatchlistItems: 100,
  maxTraders: 10,
  maxActiveTraders: 5,
  minAnalysisInterval: 5,
  dailySentimentAnalysis: Infinity,  // Unlimited
};

/**
 * Get user quota based on tier
 * @param {string} tier - 'free' or 'pro'
 * @returns {object} Quota limits
 */
export function getUserQuota(tier = 'free') {
  switch (tier) {
    case 'pro':
      return PRO_TIER_QUOTAS;
    case 'free':
    default:
      return FREE_TIER_QUOTAS;
  }
}

export default { FREE_TIER_QUOTAS, PRO_TIER_QUOTAS, getUserQuota };
