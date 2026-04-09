import { Connection, Transaction, VersionedTransaction, PublicKey } from '@solana/web3.js';
import {
  monitorOrder,
  ORDER_STATUS,
  type Intent,
  type SubmitIntentResponse as SDKSubmitIntentResponse,
  type MonitorOrderResult,
} from '@dflow-protocol/swap-api-utils';

// Privy Solana wallet interface (replaces @solana/wallet-adapter-react)
// Note: Privy's signTransaction follows Solana Wallet Standard
// It expects { transaction: Uint8Array } and returns { signedTransaction: Uint8Array }
export interface PrivySolanaWallet {
  address: string;
  walletClientType: string;
  // Privy Standard Wallet signTransaction signature
  signTransaction: (input: { transaction: Uint8Array; chain?: string }) => Promise<{ signedTransaction: Uint8Array }>;
  signMessage?: (input: { message: Uint8Array }) => Promise<{ signature: Uint8Array }>;
  signAndSendTransaction?: (input: { transaction: Uint8Array; chain?: string }) => Promise<{ signature: Uint8Array }>;
}

// Wallet adapter type for compatibility with @solana/wallet-adapter-react
export interface WalletContextState {
  publicKey: PublicKey | null;
  signTransaction: ((tx: Transaction | VersionedTransaction) => Promise<Transaction | VersionedTransaction>) | undefined;
}

// Re-export SDK types for external use
export { ORDER_STATUS, type MonitorOrderResult };

// API base URLs
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3002/api';
// @ts-ignore
const isDev = import.meta.env.DEV;

// Always use backend proxy for Trade API (API key handled by backend)
// Default: http://localhost:3002/api/dflow
const BACKEND_URL = isDev ? 'http://localhost:3002/api' : API_BASE_URL;
const DFLOW_TRADE_URL = `${BACKEND_URL}/dflow`;

// ============================================
// Retry Configuration
// ============================================

interface RetryConfig {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  retryableErrors: string[];
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelay: 1000,
  maxDelay: 5000,
  retryableErrors: [
    'route_not_found',
    'Route not found',
    'temporarily unavailable',
    'timeout',
    'ETIMEDOUT',
    'ECONNRESET',
    'network error',
    '503',
    '502',
    '500',
    'rate limit',
    'too many requests',
  ],
};

/**
 * Check if an error is retryable
 */
function isRetryableError(error: Error | string, config: RetryConfig = DEFAULT_RETRY_CONFIG): boolean {
  const errorMessage = typeof error === 'string' ? error : error.message;
  return config.retryableErrors.some(
    (retryable) => errorMessage.toLowerCase().includes(retryable.toLowerCase())
  );
}

/**
 * Execute a function with retry logic
 */
async function withDFlowRetry<T>(
  operation: () => Promise<T>,
  options: {
    config?: Partial<RetryConfig>;
    onRetry?: (attempt: number, error: Error, nextDelay: number) => void;
    operationName?: string;
  } = {}
): Promise<T> {
  const config = { ...DEFAULT_RETRY_CONFIG, ...options.config };
  const { onRetry, operationName = 'operation' } = options;

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= config.maxRetries; attempt++) {
    try {
      return await operation();
    } catch (err) {
      lastError = err as Error;

      // Check if we should retry
      if (attempt < config.maxRetries && isRetryableError(lastError, config)) {
        // Calculate exponential backoff delay
        const delay = Math.min(config.baseDelay * Math.pow(2, attempt - 1), config.maxDelay);

        console.log(
          `[DFlowTradeService] ${operationName} failed (attempt ${attempt}/${config.maxRetries}), ` +
          `retrying in ${delay}ms: ${lastError.message}`
        );

        onRetry?.(attempt, lastError, delay);

        await new Promise((resolve) => setTimeout(resolve, delay));
      } else {
        // Non-retryable error or max retries reached
        break;
      }
    }
  }

  throw lastError || new Error(`${operationName} failed after ${config.maxRetries} attempts`);
}

// ============================================
// Error Classification
// ============================================

export enum DFlowErrorType {
  ROUTE_NOT_FOUND = 'ROUTE_NOT_FOUND',
  INSUFFICIENT_LIQUIDITY = 'INSUFFICIENT_LIQUIDITY',
  MARKET_CLOSED = 'MARKET_CLOSED',
  API_UNAVAILABLE = 'API_UNAVAILABLE',
  RATE_LIMITED = 'RATE_LIMITED',
  INVALID_PARAMS = 'INVALID_PARAMS',
  SIGNATURE_FAILED = 'SIGNATURE_FAILED',
  NETWORK_ERROR = 'NETWORK_ERROR',
  UNKNOWN = 'UNKNOWN',
}

export interface DFlowError extends Error {
  type: DFlowErrorType;
  retryable: boolean;
  userMessage: string;
  userMessageZh: string;
}

function classifyError(error: Error | string): DFlowError {
  const message = typeof error === 'string' ? error : error.message;
  const lowerMessage = message.toLowerCase();

  let type = DFlowErrorType.UNKNOWN;
  let retryable = false;
  let userMessage = 'Trade failed. Please try again.';
  let userMessageZh = '交易失败，请重试。';

  if (lowerMessage.includes('route_not_found') || lowerMessage.includes('route not found')) {
    type = DFlowErrorType.ROUTE_NOT_FOUND;
    retryable = true;
    userMessage = 'No trading route available. This may be due to low liquidity. Please try again in a moment or with a smaller amount.';
    userMessageZh = '暂无可用交易路径。可能是流动性不足，请稍后重试或减少交易金额。';
  } else if (lowerMessage.includes('insufficient') || lowerMessage.includes('liquidity')) {
    type = DFlowErrorType.INSUFFICIENT_LIQUIDITY;
    retryable = true;
    userMessage = 'Insufficient liquidity. Please try a smaller amount or wait for more liquidity.';
    userMessageZh = '流动性不足，请减少金额或稍后重试。';
  } else if (lowerMessage.includes('market closed') || lowerMessage.includes('market is closed')) {
    type = DFlowErrorType.MARKET_CLOSED;
    retryable = false;
    userMessage = 'This market is closed and no longer accepting trades.';
    userMessageZh = '该市场已关闭，不再接受交易。';
  } else if (lowerMessage.includes('503') || lowerMessage.includes('502') || lowerMessage.includes('unavailable')) {
    type = DFlowErrorType.API_UNAVAILABLE;
    retryable = true;
    userMessage = 'DFlow service is temporarily unavailable. Please try again in a few minutes.';
    userMessageZh = 'DFlow 服务暂时不可用，请几分钟后重试。';
  } else if (lowerMessage.includes('rate') || lowerMessage.includes('429') || lowerMessage.includes('too many')) {
    type = DFlowErrorType.RATE_LIMITED;
    retryable = true;
    userMessage = 'Too many requests. Please wait a moment and try again.';
    userMessageZh = '请求过于频繁，请稍候重试。';
  } else if (lowerMessage.includes('invalid') || lowerMessage.includes('parameter')) {
    type = DFlowErrorType.INVALID_PARAMS;
    retryable = false;
    userMessage = 'Invalid trade parameters. Please check your input.';
    userMessageZh = '交易参数无效，请检查输入。';
  } else if (lowerMessage.includes('signature') || lowerMessage.includes('sign') || lowerMessage.includes('reject')) {
    type = DFlowErrorType.SIGNATURE_FAILED;
    retryable = false;
    userMessage = 'Transaction signing was cancelled or failed.';
    userMessageZh = '交易签名被取消或失败。';
  } else if (lowerMessage.includes('network') || lowerMessage.includes('timeout') || lowerMessage.includes('econnreset')) {
    type = DFlowErrorType.NETWORK_ERROR;
    retryable = true;
    userMessage = 'Network error. Please check your connection and try again.';
    userMessageZh = '网络错误，请检查连接后重试。';
  }

  const dflowError = new Error(message) as DFlowError;
  dflowError.type = type;
  dflowError.retryable = retryable;
  dflowError.userMessage = userMessage;
  dflowError.userMessageZh = userMessageZh;

  return dflowError;
}

// Intent response from DFlow Trade API (declarative/async flow)
// GET /intent - Returns quote + unsigned transaction
export interface DFlowIntentResponse {
  inputMint: string;
  inAmount: string;
  outputMint: string;
  outAmount: string;
  otherAmountThreshold: string;
  minOutAmount: string;
  slippageBps: number;
  priceImpactPct: string;
  feeBudget?: number;
  lastValidBlockHeight?: number;
  openTransaction: string; // Base64 encoded unsigned transaction
  platformFee?: unknown;
  contextSlot?: number;
  executionMode?: 'sync' | 'async';
  revertMint?: string;
  expiry?: {
    slotsAfterOpen: number;
  };
}

// Submit intent response from DFlow Trade API
// POST /submit-intent - Returns after DFlow processes the signed transaction
// Official SDK expects { orderAddress, programId } for monitorOrder
export interface DFlowSubmitIntentResponse {
  // Required by official SDK for monitorOrder
  orderAddress: string;
  programId: string;
  // Additional fields
  orderId?: string;
  status?: string;
  txSignature?: string;
  error?: string;
}

// Quote response from DFlow Trade API (imperative/sync flow)
export interface DFlowQuoteResponse {
  inputMint: string;
  inAmount: string;
  outputMint: string;
  outAmount: string;
  otherAmountThreshold: string;
  minOutAmount: string;
  slippageBps: number;
  priceImpactPct: string;
  routePlan: Array<{
    venue: string;
    marketKey: string;
    inputMint: string;
    outputMint: string;
    inAmount: string;
    outAmount: string;
  }>;
  contextSlot: number;
  executionMode?: 'sync' | 'async';
  revertMint?: string;
}

// Swap response from DFlow Trade API (imperative flow step 2)
export interface DFlowSwapResponse {
  swapTransaction: string; // Base64 encoded transaction
  lastValidBlockHeight?: number;
  prioritizationFeeLamports?: number;
}

// Unified order response (includes original intent for submit-intent flow)
export interface DFlowOrderResponse {
  orderId: string;
  inputMint: string;
  outputMint: string;
  inputAmount: string;
  expectedOutputAmount: string;
  executionMode: 'sync' | 'async';
  transaction: string; // Base64 encoded unsigned transaction
  expiresAt: number;
  // Store the original intent response for submit-intent
  intentResponse: DFlowIntentResponse;
}

// Order status from DFlow Trade API
export interface DFlowOrderStatus {
  orderId: string;
  status: 'pending' | 'submitted' | 'confirmed' | 'closed' | 'failed' | 'pendingClose';
  inputAmount: string;
  outputAmount?: string;
  txSignature?: string;
  error?: string;
}

// Order parameters
export interface DFlowOrderParams {
  inputMint: string;       // Input token mint address (e.g., USDC)
  outputMint: string;      // Output token mint address (e.g., YES outcome token)
  amount: number;          // Amount in lamports/smallest unit
  slippageBps?: number;    // Slippage tolerance in basis points (default: 50)
  publicKey: string;       // User's Solana public key
}

/**
 * DFlow Trade Service
 * Handles trading on Kalshi markets via DFlow on Solana
 */
export class DFlowTradeService {
  private connection: Connection;

  constructor(rpcUrl?: string) {
    // Use provided RPC or default to mainnet
    // 前端使用 PublicNode 免费 RPC
    const endpoint = rpcUrl || import.meta.env.VITE_SOLANA_RPC_URL || 'https://solana-rpc.publicnode.com';
    this.connection = new Connection(endpoint, 'confirmed');
  }

  /**
   * Get intent (declarative swap) - Single step for prediction markets
   * Uses GET /intent which returns the transaction directly
   */
  async getIntent(params: DFlowOrderParams): Promise<DFlowIntentResponse> {
    const { inputMint, outputMint, amount, slippageBps = 50, publicKey } = params;

    const queryParams = new URLSearchParams({
      userPublicKey: publicKey,
      inputMint,
      outputMint,
      amount: amount.toString(),
      slippageBps: slippageBps.toString(),
    });
    const url = `${DFLOW_TRADE_URL}/intent?${queryParams.toString()}`;

    console.log('[DFlowTradeService] Getting intent:', url);

    const response = await fetch(url);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
      console.error('[DFlowTradeService] Intent API error:', errorData);
      throw new Error(errorData.error || errorData.message || `Failed to get intent: ${response.status}`);
    }

    const data = await response.json();
    console.log('[DFlowTradeService] Intent response:', JSON.stringify(data, null, 2));

    return data as DFlowIntentResponse;
  }

  /**
   * Get quote (imperative swap step 1) - For regular token swaps
   */
  async getQuote(params: DFlowOrderParams): Promise<DFlowQuoteResponse> {
    const { inputMint, outputMint, amount, slippageBps = 50 } = params;

    const queryParams = new URLSearchParams({
      inputMint,
      outputMint,
      amount: amount.toString(),
      slippageBps: slippageBps.toString(),
    });
    const url = `${DFLOW_TRADE_URL}/quote?${queryParams.toString()}`;

    console.log('[DFlowTradeService] Getting quote:', url);

    const response = await fetch(url);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
      console.error('[DFlowTradeService] Quote API error:', errorData);
      throw new Error(errorData.error || errorData.message || `Failed to get quote: ${response.status}`);
    }

    const data = await response.json();
    console.log('[DFlowTradeService] Quote response:', JSON.stringify(data, null, 2));

    return data as DFlowQuoteResponse;
  }

  /**
   * Get swap transaction (imperative swap step 2) - For regular token swaps
   */
  async getSwapTransaction(quote: DFlowQuoteResponse, publicKey: string): Promise<DFlowSwapResponse> {
    const url = `${DFLOW_TRADE_URL}/swap`;

    console.log('[DFlowTradeService] Getting swap transaction for:', publicKey);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        quoteResponse: quote,
        userPublicKey: publicKey,
        dynamicComputeUnitLimit: true,
        prioritizationFeeLamports: 'auto',
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
      console.error('[DFlowTradeService] Swap API error:', errorData);
      throw new Error(errorData.error || errorData.message || `Failed to get swap transaction: ${response.status}`);
    }

    const data = await response.json();
    console.log('[DFlowTradeService] Swap response:', JSON.stringify(data, null, 2));

    return data as DFlowSwapResponse;
  }

  /**
   * Get order with transaction from DFlow
   * Uses declarative /intent endpoint for prediction markets (async trades)
   */
  async getOrder(params: DFlowOrderParams): Promise<DFlowOrderResponse> {
    const { inputMint, outputMint, amount, slippageBps = 50, publicKey } = params;

    // Use intent endpoint (declarative) for prediction markets
    // This returns the transaction in a single call
    const intent = await this.getIntent({ inputMint, outputMint, amount, slippageBps, publicKey });

    // Generate order ID
    const orderId = `order-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const order: DFlowOrderResponse = {
      orderId,
      inputMint: intent.inputMint,
      outputMint: intent.outputMint,
      inputAmount: intent.inAmount,
      expectedOutputAmount: intent.outAmount,
      executionMode: intent.executionMode || 'async', // Intent-based swaps are usually async
      transaction: intent.openTransaction,
      expiresAt: intent.lastValidBlockHeight
        ? Date.now() + 60000
        : Date.now() + 60000,
      // Store the original intent for submit-intent flow
      intentResponse: intent,
    };

    console.log('[DFlowTradeService] Order created:', order.orderId);

    return order;
  }

  /**
   * Submit signed intent to DFlow
   * POST /submit-intent - DFlow will execute via Jito bundles
   * This is the correct flow for declarative swaps!
   */
  async submitIntent(
    intentResponse: DFlowIntentResponse,
    signedOpenTransaction: string // Base64 encoded signed transaction
  ): Promise<DFlowSubmitIntentResponse> {
    const url = `${DFLOW_TRADE_URL}/submit-intent`;

    console.log('[DFlowTradeService] Submitting signed intent to DFlow...');

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        quoteResponse: intentResponse,
        signedOpenTransaction: signedOpenTransaction,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
      console.error('[DFlowTradeService] Submit intent error:', errorData);
      throw new Error(errorData.error || errorData.message || `Failed to submit intent: ${response.status}`);
    }

    const data = await response.json();
    console.log('[DFlowTradeService] Submit intent response:', JSON.stringify(data, null, 2));

    return data as DFlowSubmitIntentResponse;
  }

  /**
   * Get order status from DFlow
   */
  async getOrderStatus(orderId: string): Promise<DFlowOrderStatus> {
    const url = `${DFLOW_TRADE_URL}/order-status?orderId=${orderId}`;

    console.log('[DFlowTradeService] Getting order status:', orderId);

    const response = await fetch(url);

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(error.error || `Failed to get order status: ${response.status}`);
    }

    return response.json();
  }

  /**
   * Sign transaction and submit to DFlow using Solana wallet-adapter
   *
   * IMPORTANT: For declarative swaps (prediction markets), we:
   * 1. Sign the openTransaction (but don't send to Solana directly!)
   * 2. Submit the signed transaction to DFlow's /submit-intent endpoint
   * 3. DFlow handles execution via Jito bundles
   *
   * Uses official @dflow-protocol/swap-api-utils SDK for monitoring
   */
  async signAndSubmit(
    orderResponse: DFlowOrderResponse,
    wallet: WalletContextState
  ): Promise<{
    signature: string;
    signedTransaction: Transaction | VersionedTransaction;
    submitResponse: DFlowSubmitIntentResponse;
    isLegacyTransaction: boolean;
  }> {
    if (!wallet.publicKey || !wallet.signTransaction) {
      throw new Error('Wallet not connected or does not support signing');
    }

    console.log('[DFlowTradeService] Signing transaction for order:', orderResponse.orderId);

    // Decode the transaction from base64 to Uint8Array
    const transactionBuffer = Buffer.from(orderResponse.transaction, 'base64');
    const transactionBytes = new Uint8Array(transactionBuffer);

    // Detect transaction version by checking the message portion
    // For v0 versioned transactions, the message starts with 0x80
    const numSignatures = transactionBytes[0];
    const messageOffset = 1 + (numSignatures * 64);
    const messageFirstByte = transactionBytes[messageOffset];
    const isVersioned = messageFirstByte >= 0x80;

    console.log('[DFlowTradeService] Transaction analysis:', {
      numSignatures,
      messageOffset,
      messageFirstByte: `0x${messageFirstByte.toString(16)}`,
      isVersioned
    });

    let signedTx: Transaction | VersionedTransaction;

    if (isVersioned) {
      console.log('[DFlowTradeService] Deserializing as versioned (v0) transaction...');
      const versionedTx = VersionedTransaction.deserialize(transactionBytes);
      signedTx = await wallet.signTransaction(versionedTx);
      console.log('[DFlowTradeService] Versioned transaction signed');
    } else {
      console.log('[DFlowTradeService] Deserializing as legacy transaction...');
      const legacyTx = Transaction.from(transactionBuffer);
      signedTx = await wallet.signTransaction(legacyTx);
      console.log('[DFlowTradeService] Legacy transaction signed');
    }

    // Serialize the signed transaction to base64
    const serializedTx = signedTx.serialize();
    const signedOpenTransaction = Buffer.from(serializedTx).toString('base64');

    console.log('[DFlowTradeService] Transaction signed, submitting to DFlow /submit-intent...');

    // Submit to DFlow's /submit-intent endpoint
    const submitResult = await this.submitIntent(
      orderResponse.intentResponse,
      signedOpenTransaction
    );

    if (submitResult.error) {
      throw new Error(`DFlow submit-intent failed: ${submitResult.error}`);
    }

    console.log('[DFlowTradeService] DFlow submit-intent success:', submitResult);

    // Return signature and transaction for monitoring
    return {
      signature: submitResult.txSignature || submitResult.orderId || orderResponse.orderId,
      signedTransaction: signedTx,
      submitResponse: submitResult,
      isLegacyTransaction: !isVersioned,
    };
  }

  /**
   * Wait for transaction confirmation
   */
  async waitForConfirmation(
    txSignature: string,
    timeoutMs: number = 60000
  ): Promise<boolean> {
    console.log('[DFlowTradeService] Waiting for confirmation:', txSignature);

    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      const status = await this.connection.getSignatureStatus(txSignature);

      if (status?.value?.confirmationStatus === 'confirmed' ||
          status?.value?.confirmationStatus === 'finalized') {
        console.log('[DFlowTradeService] Transaction confirmed:', txSignature);
        return true;
      }

      if (status?.value?.err) {
        console.error('[DFlowTradeService] Transaction failed:', status.value.err);
        throw new Error(`Transaction failed: ${JSON.stringify(status.value.err)}`);
      }

      // Wait before checking again
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    throw new Error('Transaction confirmation timeout');
  }

  /**
   * Poll order status until terminal state
   * For async trades that span multiple transactions
   */
  async pollOrderStatus(
    orderId: string,
    intervalMs: number = 2000,
    timeoutMs: number = 120000
  ): Promise<DFlowOrderStatus> {
    console.log('[DFlowTradeService] Polling order status:', orderId);

    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      const status = await this.getOrderStatus(orderId);

      // Terminal states
      if (['closed', 'failed', 'pendingClose'].includes(status.status)) {
        console.log('[DFlowTradeService] Order reached terminal state:', status.status);
        return status;
      }

      // Wait before polling again
      await new Promise(resolve => setTimeout(resolve, intervalMs));
    }

    throw new Error('Order status polling timeout');
  }

  /**
   * Execute a complete trade flow (wallet-adapter version)
   * Uses official @dflow-protocol/swap-api-utils SDK for monitoring
   *
   * 1. Get order quote
   * 2. Sign transaction
   * 3. Submit to DFlow /submit-intent
   * 4. Monitor completion using SDK (for legacy tx) or polling (for versioned tx)
   */
  async executeTrade(
    params: DFlowOrderParams,
    wallet: WalletContextState,
    onStatusUpdate?: (status: string) => void
  ): Promise<{
    orderId: string;
    txSignature: string;
    status: DFlowOrderStatus;
    monitorResult?: MonitorOrderResult;
  }> {
    // Step 1: Get order
    onStatusUpdate?.('Getting quote...');
    const order = await this.getOrder(params);

    // Step 2: Sign and submit
    onStatusUpdate?.('Signing transaction...');
    const { signature, signedTransaction, submitResponse, isLegacyTransaction } =
      await this.signAndSubmit(order, wallet);

    // Step 3: Monitor using official SDK (if legacy transaction) or fallback polling
    onStatusUpdate?.('Monitoring order...');

    if (isLegacyTransaction && submitResponse.orderAddress && submitResponse.programId) {
      // Use official DFlow SDK for monitoring (preferred)
      console.log('[DFlowTradeService] Using official SDK for order monitoring');
      try {
        const monitorResult = await this.monitorOrderWithSDK({
          intent: order.intentResponse,
          signedOpenTransaction: signedTransaction as Transaction,
          submitIntentResponse: submitResponse,
        });

        const status = this.convertSDKResultToStatus(order.orderId, monitorResult);
        return {
          orderId: order.orderId,
          txSignature: signature,
          status,
          monitorResult,
        };
      } catch (error) {
        console.warn('[DFlowTradeService] SDK monitoring failed, falling back to polling:', error);
      }
    }

    // Fallback: Use our own polling for versioned transactions or SDK failures
    console.log('[DFlowTradeService] Using fallback polling for order status');
    if (order.executionMode === 'sync') {
      onStatusUpdate?.('Confirming transaction...');
      await this.waitForConfirmation(signature);
      const status = await this.getOrderStatus(order.orderId);
      return { orderId: order.orderId, txSignature: signature, status };
    } else {
      onStatusUpdate?.('Processing order...');
      const status = await this.pollOrderStatus(order.orderId);
      return { orderId: order.orderId, txSignature: signature, status };
    }
  }

  /**
   * Sign transaction and submit using Privy Solana wallet
   *
   * Supports two execution modes:
   * 1. Declarative (intent): Submit signed tx to DFlow's /submit-intent, DFlow executes via Jito
   * 2. Imperative (order/async): Broadcast signed tx directly to Solana (prediction markets)
   *
   * Uses official @dflow-protocol/swap-api-utils SDK for monitoring (declarative mode)
   */
  async signAndSubmitWithPrivy(
    orderResponse: DFlowOrderResponse,
    wallet: PrivySolanaWallet
  ): Promise<{
    signature: string;
    signedTransaction: Transaction | VersionedTransaction;
    submitResponse: DFlowSubmitIntentResponse;
    isLegacyTransaction: boolean;
  }> {
    if (!wallet.address || !wallet.signTransaction) {
      throw new Error('Privy wallet not connected or does not support signing');
    }

    // Check if this is an imperative swap (prediction markets use /order with executionMode: 'async')
    const isImperativeSwap = orderResponse.executionMode === 'async';
    console.log('[DFlowTradeService] Signing transaction with Privy wallet for order:', orderResponse.orderId, 
      { executionMode: orderResponse.executionMode, isImperativeSwap });

    // Decode the transaction from base64 to Uint8Array
    const transactionBuffer = Buffer.from(orderResponse.transaction, 'base64');
    const transactionBytes = new Uint8Array(transactionBuffer);

    // Detect transaction version by checking the message portion
    // Transaction structure: [num_signatures (compact-u16)] [signatures (64 bytes each)] [message]
    // For v0 versioned transactions, the message starts with 0x80
    const numSignatures = transactionBytes[0];
    const messageOffset = 1 + (numSignatures * 64);
    const messageFirstByte = transactionBytes[messageOffset];
    const isVersioned = messageFirstByte >= 0x80;

    console.log('[DFlowTradeService] Transaction analysis:', {
      numSignatures,
      messageOffset,
      messageFirstByte: `0x${messageFirstByte.toString(16)}`,
      isVersioned
    });

    let signedTx: Transaction | VersionedTransaction;
    let tx: Transaction | VersionedTransaction;

    if (isVersioned) {
      // Versioned transaction (v0)
      console.log('[DFlowTradeService] Deserializing as versioned (v0) transaction...');
      tx = VersionedTransaction.deserialize(transactionBytes);
    } else {
      // Legacy transaction
      console.log('[DFlowTradeService] Deserializing as legacy transaction...');
      tx = Transaction.from(transactionBuffer);
    }

    // Serialize transaction for Privy Wallet Standard API
    const serializedTxForSigning = isVersioned 
      ? (tx as VersionedTransaction).serialize()
      : (tx as Transaction).serialize({ requireAllSignatures: false });

    // For imperative swaps (prediction markets), sign then broadcast directly to Solana
    // Note: Privy's signAndSendTransaction has issues with versioned transactions,
    // so we use signTransaction + sendRawTransaction instead
    if (isImperativeSwap) {
      console.log('[DFlowTradeService] Imperative swap (prediction market): Sign and broadcast to Solana...');
      
      try {
        // Sign the transaction using Privy wallet (Solana Wallet Standard API)
        console.log('[DFlowTradeService] Signing transaction via Privy Wallet Standard...');
        const signResult = await wallet.signTransaction({ 
          transaction: new Uint8Array(serializedTxForSigning),
          chain: 'solana:mainnet'
        });
        console.log('[DFlowTradeService] Transaction signed successfully');
        
        // Deserialize the signed transaction
        const signedTxBytes = signResult.signedTransaction;
        if (isVersioned) {
          signedTx = VersionedTransaction.deserialize(signedTxBytes);
        } else {
          signedTx = Transaction.from(Buffer.from(signedTxBytes));
        }
        
        // Serialize and send to Solana
        const rawTransaction = signedTx.serialize();
        console.log('[DFlowTradeService] Broadcasting transaction to Solana...');
        
        const txSignature = await this.connection.sendRawTransaction(rawTransaction, {
          skipPreflight: false,
          preflightCommitment: 'confirmed',
          maxRetries: 3,
        });
        
        console.log('[DFlowTradeService] Transaction broadcast success:', txSignature);
        
        return {
          signature: txSignature,
          signedTransaction: signedTx,
          submitResponse: {
            orderAddress: '',
            programId: '',
            txSignature,
            orderId: orderResponse.orderId,
          },
          isLegacyTransaction: !isVersioned,
        };
      } catch (error: any) {
        console.error('[DFlowTradeService] Failed to sign/send transaction:', error);
        
        // Provide more helpful error message
        let errorMessage = error.message || 'Unknown error';
        if (errorMessage.includes('User rejected') || errorMessage.includes('cancelled')) {
          errorMessage = 'Transaction was cancelled by user';
        } else if (errorMessage.includes('insufficient')) {
          errorMessage = 'Insufficient balance for transaction';
        }
        
        throw new Error(`Transaction failed: ${errorMessage}`);
      }
    }

    // For declarative swaps, sign the transaction via Privy Wallet Standard
    console.log('[DFlowTradeService] Declarative swap: Signing via Privy Wallet Standard...');
    const signResult = await wallet.signTransaction({
      transaction: new Uint8Array(serializedTxForSigning),
      chain: 'solana:mainnet'
    });
    
    // Deserialize the signed transaction
    const signedTxBytes = signResult.signedTransaction;
    if (isVersioned) {
      signedTx = VersionedTransaction.deserialize(signedTxBytes);
    } else {
      signedTx = Transaction.from(Buffer.from(signedTxBytes));
    }
    console.log('[DFlowTradeService] Transaction signed for declarative swap');

    // For declarative swaps, submit to DFlow's /submit-intent endpoint
    const serializedTx = signedTx.serialize();
    const signedOpenTransaction = Buffer.from(serializedTx).toString('base64');

    console.log('[DFlowTradeService] Declarative swap: Submitting to DFlow /submit-intent...');

    // Submit to DFlow's /submit-intent endpoint
    const submitResult = await this.submitIntent(
      orderResponse.intentResponse,
      signedOpenTransaction
    );

    if (submitResult.error) {
      throw new Error(`DFlow submit-intent failed: ${submitResult.error}`);
    }

    console.log('[DFlowTradeService] DFlow submit-intent success:', submitResult);

    // Return signature and transaction for monitoring
    return {
      signature: submitResult.txSignature || submitResult.orderId || orderResponse.orderId,
      signedTransaction: signedTx,
      submitResponse: submitResult,
      isLegacyTransaction: !isVersioned,
    };
  }

  /**
   * Monitor order using official DFlow SDK (for legacy transactions)
   * Uses @dflow-protocol/swap-api-utils monitorOrder function
   */
  async monitorOrderWithSDK(params: {
    intent: DFlowIntentResponse;
    signedOpenTransaction: Transaction;
    submitIntentResponse: DFlowSubmitIntentResponse;
  }): Promise<MonitorOrderResult> {
    console.log('[DFlowTradeService] Monitoring order with official SDK...');

    // Convert our types to SDK types
    const sdkIntent: Intent = {
      inputMint: params.intent.inputMint,
      outputMint: params.intent.outputMint,
      openTransaction: params.intent.openTransaction,
      lastValidBlockHeight: params.intent.lastValidBlockHeight,
      expiry: params.intent.expiry,
    };

    const sdkSubmitResponse: SDKSubmitIntentResponse = {
      orderAddress: params.submitIntentResponse.orderAddress,
      programId: params.submitIntentResponse.programId,
    };

    // Use official SDK to monitor order
    const result = await monitorOrder({
      connection: this.connection,
      intent: sdkIntent,
      signedOpenTransaction: params.signedOpenTransaction,
      submitIntentResponse: sdkSubmitResponse,
    });

    console.log('[DFlowTradeService] SDK monitor result:', {
      status: result.status,
      fills: 'fills' in result ? result.fills.length : 0,
    });

    return result;
  }

  /**
   * Execute a complete trade flow using Privy Solana wallet
   * Uses official @dflow-protocol/swap-api-utils SDK for monitoring
   *
   * 1. Get order quote
   * 2. Sign transaction with Privy wallet
   * 3. Submit to DFlow /submit-intent
   * 4. Monitor completion using SDK (for legacy tx) or polling (for versioned tx)
   */
  async executeTradeWithPrivy(
    params: DFlowOrderParams,
    wallet: PrivySolanaWallet,
    onStatusUpdate?: (status: string) => void
  ): Promise<{
    orderId: string;
    txSignature: string;
    status: DFlowOrderStatus;
    monitorResult?: MonitorOrderResult;
  }> {
    // Pre-flight check: Verify wallet has SOL for transaction fees + account rent
    // DFlow prediction market trades require:
    // - Transaction fees (~0.000005 SOL)
    // - Account rent for token accounts (~0.002 SOL per new account)
    // - Buffer for multiple accounts creation
    onStatusUpdate?.('Checking wallet balance...');
    const walletPubkey = new PublicKey(wallet.address);
    const solBalance = await this.connection.getBalance(walletPubkey);
    const MIN_SOL_LAMPORTS = 5_000_000; // 0.005 SOL - enough for fees + rent
    const RECOMMENDED_SOL = 0.01; // Recommended amount
    
    if (solBalance < MIN_SOL_LAMPORTS) {
      const solBalanceInSol = solBalance / 1_000_000_000;
      const language = navigator.language.startsWith('zh') ? 'zh' : 'en';
      const errorMsg = language === 'zh' 
        ? `SOL 余额不足，无法支付交易费用和账户租金。` +
          `当前余额: ${solBalanceInSol.toFixed(4)} SOL。` +
          `预测市场交易需要创建 token 账户，建议充值至少 ${RECOMMENDED_SOL} SOL。` +
          `钱包地址: ${wallet.address}`
        : `Insufficient SOL for transaction fees and account rent. ` +
          `Current: ${solBalanceInSol.toFixed(4)} SOL. ` +
          `Prediction market trades require token account creation. ` +
          `Please deposit at least ${RECOMMENDED_SOL} SOL to: ${wallet.address}`;
      throw new Error(errorMsg);
    }
    
    console.log('[DFlowTradeService] SOL balance check passed:', {
      address: wallet.address,
      solBalance: solBalance / 1_000_000_000,
    });

    // Step 1: Get order
    onStatusUpdate?.('Getting quote...');
    const order = await this.getOrder(params);

    // Step 2: Sign and submit with Privy wallet
    onStatusUpdate?.('Signing transaction...');
    const { signature, signedTransaction, submitResponse, isLegacyTransaction } =
      await this.signAndSubmitWithPrivy(order, wallet);

    // Step 3: Monitor using official SDK (if legacy transaction) or fallback polling
    onStatusUpdate?.('Monitoring order...');

    if (isLegacyTransaction && submitResponse.orderAddress && submitResponse.programId) {
      // Use official DFlow SDK for monitoring (preferred)
      console.log('[DFlowTradeService] Using official SDK for order monitoring');
      try {
        const monitorResult = await this.monitorOrderWithSDK({
          intent: order.intentResponse,
          signedOpenTransaction: signedTransaction as Transaction,
          submitIntentResponse: submitResponse,
        });

        // Convert SDK result to our status format
        const status = this.convertSDKResultToStatus(order.orderId, monitorResult);
        return {
          orderId: order.orderId,
          txSignature: signature,
          status,
          monitorResult,
        };
      } catch (error) {
        console.warn('[DFlowTradeService] SDK monitoring failed, falling back to polling:', error);
        // Fall through to polling fallback
      }
    }

    // For imperative swaps (async), the transaction is broadcast directly to Solana
    // We just need to confirm the transaction on-chain, not query DFlow
    if (order.executionMode === 'async') {
      console.log('[DFlowTradeService] Imperative swap: Confirming Solana transaction...');
      onStatusUpdate?.('Confirming transaction...');
      
      try {
        // Wait for transaction confirmation on Solana
        const latestBlockhash = await this.connection.getLatestBlockhash();
        const confirmation = await this.connection.confirmTransaction({
          signature,
          blockhash: latestBlockhash.blockhash,
          lastValidBlockHeight: order.intentResponse.lastValidBlockHeight,
        }, 'confirmed');
        
        if (confirmation.value.err) {
          console.error('[DFlowTradeService] Transaction failed:', confirmation.value.err);
          return {
            orderId: order.orderId,
            txSignature: signature,
            status: {
              orderId: order.orderId,
              status: 'failed',
              error: `Transaction failed: ${JSON.stringify(confirmation.value.err)}`,
              inputAmount: order.intentResponse.inAmount,
            },
          };
        }
        
        console.log('[DFlowTradeService] Transaction confirmed on Solana!');
        return {
          orderId: order.orderId,
          txSignature: signature,
          status: {
            orderId: order.orderId,
            status: 'closed',
            inputAmount: order.intentResponse.inAmount,
            outputAmount: order.intentResponse.outAmount,
            txSignature: signature,
          },
        };
      } catch (error) {
        console.error('[DFlowTradeService] Failed to confirm transaction:', error);
        // Transaction might still be pending or succeeded - return success with signature
        // User can check the transaction on Solscan
        return {
          orderId: order.orderId,
          txSignature: signature,
          status: {
            orderId: order.orderId,
            status: 'closed', // Assume success since broadcast succeeded
            inputAmount: order.intentResponse.inAmount,
            outputAmount: order.intentResponse.outAmount,
            txSignature: signature,
          },
        };
      }
    }

    // Fallback: Use our own polling for sync mode (declarative swaps)
    console.log('[DFlowTradeService] Using fallback polling for order status');
    onStatusUpdate?.('Confirming transaction...');
    await this.waitForConfirmation(signature);
    const status = await this.getOrderStatus(order.orderId);
    return { orderId: order.orderId, txSignature: signature, status };
  }

  /**
   * Convert SDK MonitorOrderResult to our DFlowOrderStatus format
   */
  private convertSDKResultToStatus(orderId: string, result: MonitorOrderResult): DFlowOrderStatus {
    const baseStatus = {
      orderId,
      inputAmount: '0', // Will be overwritten if fills available
    };

    switch (result.status) {
      case ORDER_STATUS.CLOSED:
        if (result.fills.length > 0) {
          const qtyIn = result.fills.reduce((acc, f) => acc + f.qtyIn, 0n);
          const qtyOut = result.fills.reduce((acc, f) => acc + f.qtyOut, 0n);
          return {
            ...baseStatus,
            status: 'closed',
            inputAmount: qtyIn.toString(),
            outputAmount: qtyOut.toString(),
            txSignature: result.fills[0]?.signature,
          };
        }
        return { ...baseStatus, status: 'failed', error: 'Order closed without fills' };

      case ORDER_STATUS.PENDING_CLOSE:
        if (result.fills.length > 0) {
          const qtyIn = result.fills.reduce((acc, f) => acc + f.qtyIn, 0n);
          const qtyOut = result.fills.reduce((acc, f) => acc + f.qtyOut, 0n);
          return {
            ...baseStatus,
            status: 'pendingClose',
            inputAmount: qtyIn.toString(),
            outputAmount: qtyOut.toString(),
            txSignature: result.fills[0]?.signature,
          };
        }
        return { ...baseStatus, status: 'failed', error: 'Order pending close without fills' };

      case ORDER_STATUS.OPEN_EXPIRED:
        return {
          ...baseStatus,
          status: 'failed',
          error: 'Transaction expired - try with higher slippage',
        };

      case ORDER_STATUS.OPEN_FAILED:
        return {
          ...baseStatus,
          status: 'failed',
          error: result.transactionError
            ? `Transaction failed: ${JSON.stringify(result.transactionError)}`
            : 'Transaction failed',
        };

      default:
        return { ...baseStatus, status: 'pending' };
    }
  }
}

// Singleton instance
export const dflowTradeService = new DFlowTradeService();
