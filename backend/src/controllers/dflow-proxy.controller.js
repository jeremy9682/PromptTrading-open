/**
 * DFlow Prediction Markets API Proxy Controller
 *
 * Proxies requests to DFlow's prediction markets API to avoid CORS issues.
 * DFlow provides access to Kalshi markets on Solana.
 *
 * IMPORTANT: API keys must be kept secret and only used server-side via x-api-key header.
 * Never expose DFLOW_API_KEY to the client.
 */

// Import auto-trade service for Kalshi automated trading
import {
  executeKalshiTrade,
  validateKalshiTradingEligibility,
  recordKalshiTradeHistory,
  updateTradeStatus,
  getSolanaUsdcBalance,
} from '../services/dflow/auto-trade.service.js';
import prisma from '../lib/prisma.js';
import { getDFlowApiKey } from '../config/secrets.js';

// 缓存的 DFlow API Key
let cachedDFlowApiKey = null;

/**
 * 获取 DFlow API Key（带缓存）
 * 开发环境从 .env 读取，生产环境从 AWS Secrets Manager 读取
 */
async function ensureDFlowApiKey() {
  if (cachedDFlowApiKey) return cachedDFlowApiKey;
  cachedDFlowApiKey = await getDFlowApiKey();
  return cachedDFlowApiKey;
}

// DFlow API URLs (Official documentation: https://pond.dflow.net)
// Markets API: https://prediction-markets-api.dflow.net (requires x-api-key header)
// Trade API (PROD): https://a.quote-api.dflow.net (requires x-api-key header for production)
// Trade API (DEV): https://dev-quote-api.dflow.net (for development/testing only)
const DFLOW_MARKETS_API = 'https://prediction-markets-api.dflow.net';
// IMPORTANT: Always use production API for prediction markets
// dev-quote-api.dflow.net does NOT support prediction market tokens
// Only a.quote-api.dflow.net has the prediction market routes
const DFLOW_TRADE_API = process.env.DFLOW_TRADE_API || 'https://a.quote-api.dflow.net';

// Log API key status on module load (async initialization)
(async () => {
  const apiKey = await ensureDFlowApiKey();
  console.log('[DFlow] API Configuration:', {
    marketsApi: DFLOW_MARKETS_API,
    tradeApi: DFLOW_TRADE_API,
    apiKeySet: !!apiKey,
    apiKeyPrefix: apiKey ? apiKey.substring(0, 8) + '...' : 'NOT SET'
  });
})();

/**
 * Proxy requests to DFlow Prediction Markets API
 * GET /api/dflow/markets-api/*
 * 
 * Requires DFLOW_API_KEY for production access to prediction-markets-api.dflow.net
 */
export async function proxyDFlowMarketsAPI(req, res) {
  try {
    const path = req.params[0] || '';
    const queryString = new URLSearchParams(req.query).toString();
    const url = `${DFLOW_MARKETS_API}/api/v1/${path}${queryString ? `?${queryString}` : ''}`;

    console.log(`[DFlow Markets Proxy] Forwarding: ${req.method} ${url}`);

    const headers = {
      'Accept': 'application/json',
      'User-Agent': 'PromptTrading-Backend/1.0',
    };

    // IMPORTANT: API key must be passed via x-api-key header for production
    // 从 AWS Secrets Manager 或本地 .env 获取
    const apiKey = await ensureDFlowApiKey();
    if (apiKey) {
      headers['x-api-key'] = apiKey;
    } else {
      console.warn(`[DFlow Markets Proxy] Warning: No DFLOW_API_KEY set.`);
    }

    const response = await fetch(url, {
      method: req.method,
      headers,
    });

    if (!response.ok) {
      console.warn(`[DFlow Proxy] API returned ${response.status} for ${url}`);
    }

    // Validate response type to prevent HTML error pages
    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      const text = await response.text();
      console.error(`[DFlow Proxy] Non-JSON response: ${text.substring(0, 200)}`);
      return res.status(502).json({
        error: 'Upstream API returned non-JSON response',
        status: response.status,
        contentType: contentType || 'unknown'
      });
    }

    const data = await response.json();

    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    res.status(response.status).json(data);

  } catch (error) {
    console.error('[DFlow Proxy] Error:', error.message);
    res.status(500).json({
      error: 'Failed to proxy DFlow API request',
      message: error.message
    });
  }
}

/**
 * Proxy requests to DFlow Trade API
 * GET /api/dflow/trade-api/*
 */
export async function proxyDFlowTradeAPI(req, res) {
  try {
    const path = req.params[0] || '';
    const queryString = new URLSearchParams(req.query).toString();
    const url = `${DFLOW_TRADE_API}/${path}${queryString ? `?${queryString}` : ''}`;

    console.log(`[DFlow Trade Proxy] Forwarding: ${req.method} ${url}`);

    const headers = {
      'Accept': 'application/json',
      'User-Agent': 'PromptTrading-Backend/1.0',
    };

    // Add API key if available (从 AWS Secrets Manager 或本地 .env 获取)
    const apiKey = await ensureDFlowApiKey();
    if (apiKey) {
      headers['x-api-key'] = apiKey;
    }

    // For POST requests, include body
    const fetchOptions = {
      method: req.method,
      headers,
    };

    if (req.method === 'POST' && req.body) {
      headers['Content-Type'] = 'application/json';
      fetchOptions.body = JSON.stringify(req.body);
    }

    const response = await fetch(url, fetchOptions);

    if (!response.ok) {
      console.warn(`[DFlow Trade Proxy] API returned ${response.status} for ${url}`);
    }

    // Validate response type
    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      const text = await response.text();
      console.error(`[DFlow Trade Proxy] Non-JSON response: ${text.substring(0, 200)}`);
      return res.status(502).json({
        error: 'Upstream API returned non-JSON response',
        status: response.status,
        contentType: contentType || 'unknown'
      });
    }

    const data = await response.json();

    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    res.status(response.status).json(data);

  } catch (error) {
    console.error('[DFlow Trade Proxy] Error:', error.message);
    res.status(500).json({
      error: 'Failed to proxy DFlow Trade API request',
      message: error.message
    });
  }
}

/**
 * Get order from DFlow Trade API (Imperative Swap for prediction markets)
 * GET /api/dflow/intent
 * 
 * IMPORTANT: Prediction markets use /order endpoint (imperative swap), NOT /intent (declarative swap)
 * - /intent is for regular token swaps (returns openTransaction for Jito bundles)
 * - /order is for prediction markets (returns transaction for user to sign and submit)
 * 
 * Flow:
 * 1. GET /order - Returns quote + unsigned transaction
 * 2. User signs the transaction
 * 3. User broadcasts the transaction to Solana
 * 
 * @see https://pond.dflow.net/quickstart/trade-api
 */
export async function getDFlowIntent(req, res) {
  try {
    const {
      userPublicKey,
      inputMint,
      outputMint,
      amount,
      slippageBps = 50
    } = req.query;

    if (!userPublicKey || !inputMint || !outputMint || !amount) {
      return res.status(400).json({
        error: 'Missing required parameters: userPublicKey, inputMint, outputMint, amount'
      });
    }

    // Use /order endpoint for prediction markets (imperative swap)
    // Note: /intent is for regular token swaps (declarative swap)
    const url = new URL(`${DFLOW_TRADE_API}/order`);
    url.searchParams.set('userPublicKey', userPublicKey);
    url.searchParams.set('inputMint', inputMint);
    url.searchParams.set('outputMint', outputMint);
    url.searchParams.set('amount', amount);
    url.searchParams.set('slippageBps', slippageBps);

    console.log(`[DFlow Order] Fetching order: ${url.toString()}`);
    console.log(`[DFlow Order] Using Trade API: ${DFLOW_TRADE_API}`);

    const headers = {
      'Accept': 'application/json',
      'User-Agent': 'PromptTrading-Backend/1.0',
    };

    // IMPORTANT: API key must be passed via x-api-key header for production
    // 从 AWS Secrets Manager 或本地 .env 获取
    const apiKey = await ensureDFlowApiKey();
    if (apiKey) {
      headers['x-api-key'] = apiKey;
      console.log(`[DFlow Order] Using API key: ${apiKey.substring(0, 8)}...`);
    } else {
      console.warn(`[DFlow Order] Warning: No DFLOW_API_KEY set. Production API will fail.`);
    }

    const response = await fetch(url.toString(), { headers });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[DFlow Order] API error: ${response.status} - ${errorText}`);
      return res.status(response.status).json({
        error: 'Failed to get order from DFlow',
        details: errorText,
        hint: response.status === 403 ? 'API key may be missing or invalid' : undefined
      });
    }

    const data = await response.json();
    console.log(`[DFlow Order] Response received, inAmount: ${data.inAmount}, outAmount: ${data.outAmount}`);

    // Validate that we got the transaction
    if (!data.transaction) {
      console.warn(`[DFlow Order] Warning: Response missing transaction field`);
    }

    // Map response to match expected format
    // The /order endpoint returns 'transaction', but frontend expects 'openTransaction'
    const normalizedData = {
      ...data,
      openTransaction: data.transaction,  // Add openTransaction alias for frontend compatibility
    };

    res.json(normalizedData);

  } catch (error) {
    console.error('[DFlow Order] Error:', error.message);
    res.status(500).json({
      error: 'Failed to get DFlow order',
      message: error.message
    });
  }
}

/**
 * Get quote from DFlow Trade API
 * GET /api/dflow/quote
 */
export async function getDFlowQuote(req, res) {
  try {
    const {
      inputMint,
      outputMint,
      amount,
      slippageBps = 50
    } = req.query;

    if (!inputMint || !outputMint || !amount) {
      return res.status(400).json({
        error: 'Missing required parameters: inputMint, outputMint, amount'
      });
    }

    const url = new URL(`${DFLOW_TRADE_API}/quote`);
    url.searchParams.set('inputMint', inputMint);
    url.searchParams.set('outputMint', outputMint);
    url.searchParams.set('amount', amount);
    url.searchParams.set('slippageBps', slippageBps);

    console.log(`[DFlow Quote] Fetching quote: ${url.toString()}`);

    const headers = {
      'Accept': 'application/json',
      'User-Agent': 'PromptTrading-Backend/1.0',
    };

    const apiKey = await ensureDFlowApiKey();
    if (apiKey) {
      headers['x-api-key'] = apiKey;
    }

    const response = await fetch(url.toString(), { headers });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[DFlow Quote] API error: ${response.status} - ${errorText}`);
      return res.status(response.status).json({
        error: 'Failed to get quote from DFlow',
        details: errorText
      });
    }

    const data = await response.json();
    console.log(`[DFlow Quote] Response:`, JSON.stringify(data, null, 2));

    res.json(data);

  } catch (error) {
    console.error('[DFlow Quote] Error:', error.message);
    res.status(500).json({
      error: 'Failed to get DFlow quote',
      message: error.message
    });
  }
}

/**
 * Get swap transaction from DFlow Trade API
 * POST /api/dflow/swap
 */
export async function postDFlowSwap(req, res) {
  try {
    const { quoteResponse, userPublicKey } = req.body;

    if (!quoteResponse || !userPublicKey) {
      return res.status(400).json({
        error: 'Missing required parameters: quoteResponse, userPublicKey'
      });
    }

    const url = `${DFLOW_TRADE_API}/swap`;

    console.log(`[DFlow Swap] Creating swap transaction for: ${userPublicKey}`);

    const headers = {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'User-Agent': 'PromptTrading-Backend/1.0',
    };

    const apiKey = await ensureDFlowApiKey();
    if (apiKey) {
      headers['x-api-key'] = apiKey;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(req.body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[DFlow Swap] API error: ${response.status} - ${errorText}`);
      return res.status(response.status).json({
        error: 'Failed to get swap transaction from DFlow',
        details: errorText
      });
    }

    const data = await response.json();
    console.log(`[DFlow Swap] Response:`, JSON.stringify(data, null, 2));

    res.json(data);

  } catch (error) {
    console.error('[DFlow Swap] Error:', error.message);
    res.status(500).json({
      error: 'Failed to get DFlow swap transaction',
      message: error.message
    });
  }
}

/**
 * Get order quote from DFlow Trade API (legacy - redirects to quote + swap)
 * GET /api/dflow/order
 */
export async function getDFlowOrder(req, res) {
  // Redirect to quote endpoint for backwards compatibility
  console.log(`[DFlow Order] Redirecting to quote endpoint`);
  return getDFlowQuote(req, res);
}

/**
 * Get order status from DFlow Trade API
 * GET /api/dflow/order-status
 */
export async function getDFlowOrderStatus(req, res) {
  try {
    const { orderId } = req.query;

    if (!orderId) {
      return res.status(400).json({
        error: 'Missing required parameter: orderId'
      });
    }

    const url = `${DFLOW_TRADE_API}/order-status?orderId=${orderId}`;

    console.log(`[DFlow Order Status] Checking: ${orderId}`);

    const headers = {
      'Accept': 'application/json',
      'User-Agent': 'PromptTrading-Backend/1.0',
    };

    const apiKey = await ensureDFlowApiKey();
    if (apiKey) {
      headers['x-api-key'] = apiKey;
    }

    const response = await fetch(url, { headers });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[DFlow Order Status] API error: ${response.status} - ${errorText}`);
      return res.status(response.status).json({
        error: 'Failed to get order status from DFlow',
        details: errorText
      });
    }

    const data = await response.json();
    res.json(data);

  } catch (error) {
    console.error('[DFlow Order Status] Error:', error.message);
    res.status(500).json({
      error: 'Failed to get DFlow order status',
      message: error.message
    });
  }
}

/**
 * Filter outcome mints from user's token addresses
 * POST /api/dflow/filter-outcome-mints
 *
 * Accepts a list of token addresses and returns only those that are
 * prediction market outcome mints (YES/NO tokens).
 *
 * @see https://pond.dflow.net/quickstart/user-prediction-positions
 */
export async function postFilterOutcomeMints(req, res) {
  try {
    const { addresses } = req.body;

    if (!addresses || !Array.isArray(addresses)) {
      return res.status(400).json({
        error: 'Missing required parameter: addresses (array of token mint addresses)'
      });
    }

    // Max 200 addresses per request per DFlow docs
    const limitedAddresses = addresses.slice(0, 200);

    const url = `${DFLOW_MARKETS_API}/api/v1/filter_outcome_mints`;

    console.log(`[DFlow Filter Mints] Filtering ${limitedAddresses.length} addresses`);

    const headers = {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'User-Agent': 'PromptTrading-Backend/1.0',
    };

    const apiKey = await ensureDFlowApiKey();
    if (apiKey) {
      headers['x-api-key'] = apiKey;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ addresses: limitedAddresses }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[DFlow Filter Mints] API error: ${response.status} - ${errorText}`);
      return res.status(response.status).json({
        error: 'Failed to filter outcome mints',
        details: errorText
      });
    }

    const data = await response.json();
    console.log(`[DFlow Filter Mints] Found ${data.mints?.length || 0} outcome mints`);

    res.json(data);

  } catch (error) {
    console.error('[DFlow Filter Mints] Error:', error.message);
    res.status(500).json({
      error: 'Failed to filter outcome mints',
      message: error.message
    });
  }
}

/**
 * Get market details for multiple outcome mints in batch
 * POST /api/dflow/markets-batch
 *
 * Retrieves comprehensive market data for multiple outcome tokens.
 *
 * @see https://pond.dflow.net/quickstart/user-prediction-positions
 */
export async function postMarketsBatch(req, res) {
  try {
    const { mints } = req.body;

    if (!mints || !Array.isArray(mints)) {
      return res.status(400).json({
        error: 'Missing required parameter: mints (array of outcome mint addresses)'
      });
    }

    const url = `${DFLOW_MARKETS_API}/api/v1/markets/batch`;

    console.log(`[DFlow Markets Batch] Fetching details for ${mints.length} mints`);

    const headers = {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'User-Agent': 'PromptTrading-Backend/1.0',
    };

    const apiKey = await ensureDFlowApiKey();
    if (apiKey) {
      headers['x-api-key'] = apiKey;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ mints }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[DFlow Markets Batch] API error: ${response.status} - ${errorText}`);
      return res.status(response.status).json({
        error: 'Failed to get markets batch',
        details: errorText
      });
    }

    const data = await response.json();
    console.log(`[DFlow Markets Batch] Got ${data.markets?.length || 0} markets`);

    res.json(data);

  } catch (error) {
    console.error('[DFlow Markets Batch] Error:', error.message);
    res.status(500).json({
      error: 'Failed to get markets batch',
      message: error.message
    });
  }
}

/**
 * Execute DFlow/Kalshi auto-trade
 * POST /api/dflow/auto-trade/execute
 *
 * Executes a Kalshi trade using server-side Privy signing (fully automated).
 * Similar to Polymarket auto-trade, but for Solana/DFlow.
 */
export async function executeDFlowAutoTrade(req, res) {
  try {
    const {
      tokenMint,
      side,
      price,
      amount,
      slippageBps = 100,
      eventId,
      eventTitle,
      marketTicker,
      outcomeType,
      traderId,
      signalConfidence,
    } = req.body;

    // Get user from auth
    const userAddress = req.headers['x-wallet-address'];
    if (!userAddress) {
      return res.status(401).json({
        success: false,
        errorMsg: 'Missing wallet address',
      });
    }

    // Get user from database
    const user = await prisma.user.findFirst({
      where: { walletAddress: userAddress },
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        errorMsg: 'User not found',
      });
    }

    console.log('[DFlow AutoTrade] Execute request:', {
      tokenMint,
      side,
      amount,
      eventId,
      traderId,
      userId: user.id,
    });

    // Validate required parameters
    if (!tokenMint || !side || !amount) {
      return res.status(400).json({
        success: false,
        errorMsg: 'Missing required parameters: tokenMint, side, amount',
      });
    }

    // Validate user can trade
    const eligibility = await validateKalshiTradingEligibility(user.privyUserId);
    if (!eligibility.canTrade) {
      console.log('[DFlow AutoTrade] User not eligible:', eligibility.reason);
      return res.status(403).json({
        success: false,
        errorMsg: eligibility.reason,
      });
    }

    // Check Solana USDC balance before attempting trade (for BUY orders)
    if (side === 'BUY') {
      const solanaBalance = await getSolanaUsdcBalance(eligibility.solanaAddress);
      const requiredAmount = amount + 0.5; // Add $0.50 buffer for fees
      
      if (solanaBalance < requiredAmount) {
        console.log(`[DFlow AutoTrade] ❌ Insufficient Solana USDC balance: $${solanaBalance.toFixed(2)} < $${requiredAmount.toFixed(2)}`);
        return res.status(400).json({
          success: false,
          errorMsg: `Insufficient Solana USDC balance: $${solanaBalance.toFixed(2)} available, need $${amount.toFixed(2)} plus fees. Please deposit USDC to your Solana wallet.`,
        });
      }
      console.log(`[DFlow AutoTrade] ✅ Solana balance check passed: $${solanaBalance.toFixed(2)} >= $${requiredAmount.toFixed(2)}`);
    }

    // USDC mint on Solana mainnet
    const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

    // Prepare trade parameters
    const isBuy = side === 'BUY';
    const tradeParams = {
      inputMint: isBuy ? USDC_MINT : tokenMint,
      outputMint: isBuy ? tokenMint : USDC_MINT,
      amount: Math.floor(amount * 1_000_000), // Convert to USDC decimals (6)
      slippageBps,
      side,
      tokenId: tokenMint,
      displayAmount: amount,
      outcomeType: outcomeType || 'YES',
    };

    // Record trade (status = executing)
    const tradeRecord = await recordKalshiTradeHistory({
      userId: user.id,
      traderId: traderId,
      eventId: eventId,
      eventTitle: eventTitle,
      tokenId: tokenMint,
      side: side,
      amount: amount,
      price: price,
      status: 'executing',
      confidence: signalConfidence,
    });

    console.log('[DFlow AutoTrade] Trade record created:', tradeRecord.id);

    // Execute trade with server-side signing
    const tradeResult = await executeKalshiTrade({
      tradeParams,
      privyUserId: user.privyUserId,
      solanaAddress: eligibility.solanaAddress,
    });

    if (tradeResult.success) {
      // Update trade status (use txSignature as orderId for imperative swaps)
      await updateTradeStatus(tradeRecord.id, 'executed', tradeResult.txSignature);

      console.log('[DFlow AutoTrade] ✅ Trade executed successfully:', {
        tradeId: tradeRecord.id,
        txSignature: tradeResult.txSignature,
      });

      return res.json({
        success: true,
        txSignature: tradeResult.txSignature,
        tradeId: tradeRecord.id,
      });
    } else {
      // Update trade status to failed
      await updateTradeStatus(tradeRecord.id, 'failed', null, tradeResult.error);

      console.log('[DFlow AutoTrade] ❌ Trade failed:', tradeResult.error);

      return res.status(400).json({
        success: false,
        errorMsg: tradeResult.error,
        tradeId: tradeRecord.id,
      });
    }

  } catch (error) {
    console.error('[DFlow AutoTrade] Error:', error);
    return res.status(500).json({
      success: false,
      errorMsg: error.message,
    });
  }
}

/**
 * Submit signed intent to DFlow Trade API
 * POST /api/dflow/submit-intent
 *
 * This is the correct flow for declarative swaps (prediction markets):
 * 1. Frontend gets intent from GET /intent
 * 2. User signs the openTransaction
 * 3. Frontend submits to this endpoint with signed transaction
 * 4. DFlow executes via Jito bundles
 *
 * Response contains { orderAddress, programId } for order monitoring
 * @see https://pond.dflow.net/quickstart/trade-api
 */
export async function postDFlowSubmitIntent(req, res) {
  try {
    const { quoteResponse, signedOpenTransaction } = req.body;

    if (!quoteResponse || !signedOpenTransaction) {
      return res.status(400).json({
        error: 'Missing required parameters: quoteResponse, signedOpenTransaction'
      });
    }

    const url = `${DFLOW_TRADE_API}/submit-intent`;

    console.log(`[DFlow Submit Intent] Submitting signed transaction to DFlow...`);

    const headers = {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'User-Agent': 'PromptTrading-Backend/1.0',
    };

    // IMPORTANT: API key must be passed via x-api-key header for production
    // 从 AWS Secrets Manager 或本地 .env 获取
    const apiKey = await ensureDFlowApiKey();
    if (apiKey) {
      headers['x-api-key'] = apiKey;
      console.log(`[DFlow Submit Intent] Using API key for submission`);
    } else {
      console.warn(`[DFlow Submit Intent] Warning: No DFLOW_API_KEY set. Production API will fail.`);
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        quoteResponse,
        signedOpenTransaction,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[DFlow Submit Intent] API error: ${response.status} - ${errorText}`);
      return res.status(response.status).json({
        error: 'Failed to submit intent to DFlow',
        details: errorText,
        hint: response.status === 403 ? 'API key may be missing or invalid' : undefined
      });
    }

    const data = await response.json();
    console.log(`[DFlow Submit Intent] Response:`, JSON.stringify(data, null, 2));

    // Validate response contains required fields for order monitoring
    if (!data.orderAddress || !data.programId) {
      console.warn(`[DFlow Submit Intent] Warning: Response missing orderAddress or programId`);
    }

    res.json(data);

  } catch (error) {
    console.error('[DFlow Submit Intent] Error:', error.message);
    res.status(500).json({
      error: 'Failed to submit intent to DFlow',
      message: error.message
    });
  }
}
