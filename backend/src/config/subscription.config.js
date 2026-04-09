/**
 * Subscription Configuration
 *
 * Pro subscription plan pricing and provider settings.
 */

export const SUBSCRIPTION_PLANS = {
  pro: {
    priceUsd: '4.99',
    intervalDays: 30,
    name: 'Pro Monthly',
    description: 'Unlimited AI analysis, all models, unlimited monitors',
  },
};

// Coinbase Commerce configuration
export const COINBASE_CONFIG = {
  apiUrl: 'https://api.commerce.coinbase.com',
};

// Helio (MoonPay Commerce) configuration
export const HELIO_CONFIG = {
  apiUrl: 'https://api.hel.io/v1',
  devnetApiUrl: 'https://api.dev.hel.io/v1',
  // $4.99 in USDC base units (6 decimals)
  priceBaseUnits: 4990000,
};

// Order expiry in minutes
export const ORDER_EXPIRY_MINUTES = 30;

export default {
  SUBSCRIPTION_PLANS,
  COINBASE_CONFIG,
  HELIO_CONFIG,
  ORDER_EXPIRY_MINUTES,
};
