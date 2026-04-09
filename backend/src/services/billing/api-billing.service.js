/**
 * API Billing Service
 * Handles usage tracking and cost calculation for AI API calls
 *
 * Billing Model:
 * - Platform API: OpenRouter 返回的价格 × 1.2 (加20%)
 * - User's own API: 免费（用户自己的 API Key）
 *
 * Note: We use OpenRouter's Usage Accounting feature (usage: {include: true})
 * to get the actual cost (total_cost) directly from the API response.
 */

/**
 * Platform markup percentage for using platform's API key
 * Total charge = OpenRouter cost × (1 + markup)
 */
const PLATFORM_MARKUP_PERCENTAGE = parseFloat(process.env.PLATFORM_MARKUP_PERCENTAGE) || 0.20; // 20% markup

/**
 * Calculate total billing for an API call using OpenRouter's actual cost
 * @param {string} modelId - Model ID
 * @param {object} usage - Token usage from API response (includes total_cost from OpenRouter)
 * @param {string} apiSource - 'platform' or 'user'
 * @returns {object} Complete billing breakdown
 */
export const calculateBilling = (modelId, usage, apiSource) => {
  // Extract token counts from usage
  const promptTokens = usage?.prompt_tokens || 0;
  const completionTokens = usage?.completion_tokens || 0;
  const totalTokens = promptTokens + completionTokens;

  // Get actual cost from OpenRouter (returned when usage: {include: true} is set)
  // This is the real cost charged by OpenRouter
  const actualCost = usage?.total_cost || usage?.cost || 0;

  if (apiSource === 'user') {
    // User's own API: 免费
    return {
      apiSource: 'user',
      openRouterCost: 0,
      platformMarkup: 0,
      totalCharge: 0,
      breakdown: {
        modelId,
        promptTokens,
        completionTokens,
        totalTokens,
        actualCostFromProvider: actualCost,
        note: 'User provides own API key - free'
      }
    };
  }

  // Platform API: OpenRouter 价格 + 20%
  const platformMarkup = actualCost * PLATFORM_MARKUP_PERCENTAGE;
  const totalCharge = actualCost + platformMarkup; // 即 actualCost * 1.2

  return {
    apiSource: 'platform',
    openRouterCost: parseFloat(actualCost.toFixed(6)),
    platformMarkup: parseFloat(platformMarkup.toFixed(6)),
    totalCharge: parseFloat(totalCharge.toFixed(6)),
    breakdown: {
      modelId,
      promptTokens,
      completionTokens,
      totalTokens,
      actualCostFromProvider: actualCost,
      markupPercentage: `${PLATFORM_MARKUP_PERCENTAGE * 100}%`,
    }
  };
};

/**
 * Get billing configuration
 * @returns {object} Current billing configuration
 */
export const getBillingConfig = () => {
  return {
    platformMarkupPercentage: PLATFORM_MARKUP_PERCENTAGE * 100,
    pricingMethod: 'dynamic',
    note: 'Total = OpenRouter price × 1.2 (20% markup)'
  };
};

/**
 * Format billing for response (convert to user-friendly format)
 * @param {object} billing - Billing result from calculateBilling
 * @returns {object} Formatted billing info
 */
export const formatBillingForResponse = (billing) => {
  return {
    apiSource: billing.apiSource,
    charges: {
      openRouterCost: `$${billing.openRouterCost.toFixed(4)}`,
      platformMarkup: `$${billing.platformMarkup.toFixed(4)}`,
      total: `$${billing.totalCharge.toFixed(4)}`,
    },
    tokensUsed: {
      prompt: billing.breakdown.promptTokens,
      completion: billing.breakdown.completionTokens,
      total: billing.breakdown.totalTokens,
    },
  };
};

export default {
  calculateBilling,
  getBillingConfig,
  formatBillingForResponse,
};
