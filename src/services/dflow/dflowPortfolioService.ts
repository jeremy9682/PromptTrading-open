/**
 * DFlow Portfolio Service
 *
 * Fetches and manages user's DFlow/Kalshi prediction market positions on Solana.
 * Positions are SPL tokens representing outcome shares (YES/NO tokens).
 *
 * Uses the official DFlow API:
 * - POST /api/v1/filter_outcome_mints - Filter user's tokens for prediction market mints
 * - POST /api/v1/markets/batch - Get market details for multiple outcome mints
 *
 * @see https://pond.dflow.net/quickstart/user-prediction-positions
 */

import { Connection, PublicKey } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';

// ============================================
// Types
// ============================================

export interface DFlowPosition {
  // Token info
  tokenMint: string;
  tokenAccount: string;
  balance: number; // UI amount (shares)
  decimals: number;

  // Market info (enriched from market data)
  marketTicker?: string;
  eventTicker?: string;
  eventTitle?: string;
  outcomeType?: 'YES' | 'NO';

  // Pricing
  currentPrice?: number;
  currentValue?: number; // balance * currentPrice
  avgCost?: number; // Average cost per share (from trade history)

  // Source
  source: 'dflow';
}

// Market account info (per collateral type)
interface DFlowMarketAccount {
  marketLedger: string;
  yesMint: string;
  noMint: string;
  isInitialized: boolean;
  redemptionStatus: string;
}

// Market data from /api/v1/markets/batch
interface DFlowMarketBatchResponse {
  markets: Array<{
    ticker: string;
    eventTicker: string;
    title: string;
    subtitle?: string;
    category?: string;
    status: string;
    // Accounts are keyed by collateral mint (e.g., USDC mint address)
    accounts?: Record<string, DFlowMarketAccount>;
    yesAsk?: string;
    noAsk?: string;
    yesBid?: string;
    noBid?: string;
    volume?: string;
    openInterest?: string;
  }>;
}

export interface DFlowTradeHistoryItem {
  txSignature: string;
  timestamp: Date;
  tokenMint?: string; // Token mint address for matching to positions
  marketTicker?: string;
  eventTitle?: string;
  side: 'BUY' | 'SELL';
  outcomeType: 'YES' | 'NO';
  amount: number; // Number of shares
  price: number; // Price per share
  status: 'confirmed' | 'pending' | 'failed';
}

export interface DFlowPortfolioSummary {
  totalValue: number;
  positionsCount: number;
  lastUpdated: Date | null;
}

// ============================================
// Configuration
// ============================================

// 前端使用 PublicNode 免费 RPC，后端使用 Helius（更可靠且 Key 不暴露）
const SOLANA_RPC_URL = import.meta.env.VITE_SOLANA_RPC_URL || 'https://solana-rpc.publicnode.com';

// Backend API URL
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3002/api';
// @ts-ignore
const isDev = import.meta.env.DEV;
const BACKEND_URL = isDev ? 'http://localhost:3002/api' : API_BASE_URL;

// ============================================
// Service Class
// ============================================

class DFlowPortfolioService {
  private connection: Connection;

  constructor() {
    this.connection = new Connection(SOLANA_RPC_URL, 'confirmed');
  }

  /**
   * Fetch all token accounts for a wallet and filter for DFlow prediction market tokens.
   *
   * Uses the official DFlow API flow:
   * 1. Fetch all user's token accounts (TOKEN_PROGRAM_ID + TOKEN_2022_PROGRAM_ID)
   * 2. Filter mints via POST /filter-outcome-mints
   * 3. Get market details via POST /markets-batch
   *
   * @see https://pond.dflow.net/quickstart/user-prediction-positions
   */
  async fetchPositions(walletAddress: string): Promise<DFlowPosition[]> {
    if (!walletAddress) {
      console.log('[DFlowPortfolio] No wallet address provided');
      return [];
    }

    try {
      console.log('[DFlowPortfolio] Fetching positions for:', walletAddress);

      // Step 1: Get all token accounts for the wallet
      const walletPubkey = new PublicKey(walletAddress);

      // Fetch from both TOKEN_PROGRAM_ID and TOKEN_2022_PROGRAM_ID
      const [tokenAccounts, token2022Accounts] = await Promise.all([
        this.connection.getParsedTokenAccountsByOwner(walletPubkey, { programId: TOKEN_PROGRAM_ID }),
        this.connection.getParsedTokenAccountsByOwner(walletPubkey, { programId: TOKEN_2022_PROGRAM_ID }),
      ]);

      const allAccounts = [...tokenAccounts.value, ...token2022Accounts.value];
      console.log('[DFlowPortfolio] Found', allAccounts.length, 'total token accounts');

      // Build map of mint -> token account info
      const tokenAccountMap = new Map<string, { pubkey: string; balance: number; decimals: number }>();
      const allMints: string[] = [];

      for (const { account, pubkey } of allAccounts) {
        const parsedInfo = account.data.parsed?.info;
        if (!parsedInfo) continue;

        const mint = parsedInfo.mint;
        const balance = parsedInfo.tokenAmount?.uiAmount || 0;
        const decimals = parsedInfo.tokenAmount?.decimals || 6;

        // Skip zero balances
        if (balance <= 0) continue;

        allMints.push(mint);
        tokenAccountMap.set(mint, {
          pubkey: pubkey.toBase58(),
          balance,
          decimals,
        });
      }

      if (allMints.length === 0) {
        console.log('[DFlowPortfolio] No non-zero token balances found');
        return [];
      }

      console.log('[DFlowPortfolio] Filtering', allMints.length, 'mints for prediction market tokens');

      // Step 2: Filter mints using DFlow API
      const filteredMints = await this.filterOutcomeMints(allMints);

      if (filteredMints.length === 0) {
        console.log('[DFlowPortfolio] No prediction market tokens found');
        return [];
      }

      console.log('[DFlowPortfolio] Found', filteredMints.length, 'prediction market tokens');

      // Step 3: Get market details for these mints
      const marketDetails = await this.getMarketsBatch(filteredMints);

      if (!marketDetails || marketDetails.length === 0) {
        console.log('[DFlowPortfolio] No market details returned');
        return [];
      }

      // Step 4: Build positions
      // Accounts are keyed by collateral mint (e.g., USDC, CASH), not by "solana"
      const positions: DFlowPosition[] = [];

      console.log('[DFlowPortfolio] Building positions from', marketDetails.length, 'markets');
      console.log('[DFlowPortfolio] User token mints:', Array.from(tokenAccountMap.keys()));

      for (const market of marketDetails) {
        console.log('[DFlowPortfolio] Processing market:', market.ticker, 'accounts:', market.accounts);
        if (!market.accounts) {
          console.log('[DFlowPortfolio] Market has no accounts, skipping');
          continue;
        }

        // Iterate through all collateral types (USDC, CASH, etc.)
        for (const [collateralMint, accountInfo] of Object.entries(market.accounts)) {
          const typedAccountInfo = accountInfo as DFlowMarketAccount;
          const yesMint = typedAccountInfo.yesMint;
          const noMint = typedAccountInfo.noMint;

          console.log('[DFlowPortfolio] Collateral:', collateralMint, 'yesMint:', yesMint, 'noMint:', noMint);
          console.log('[DFlowPortfolio] User has yesMint?', yesMint ? tokenAccountMap.has(yesMint) : 'N/A');
          console.log('[DFlowPortfolio] User has noMint?', noMint ? tokenAccountMap.has(noMint) : 'N/A');

          // Check if user holds YES token
          if (yesMint && tokenAccountMap.has(yesMint)) {
            const tokenInfo = tokenAccountMap.get(yesMint)!;
            const price = market.yesAsk ? parseFloat(market.yesAsk) : undefined;
            console.log('[DFlowPortfolio] ✅ Found YES position:', yesMint, 'balance:', tokenInfo.balance);

            positions.push({
              tokenMint: yesMint,
              tokenAccount: tokenInfo.pubkey,
              balance: tokenInfo.balance,
              decimals: tokenInfo.decimals,
              marketTicker: market.ticker,
              eventTicker: market.eventTicker,
              eventTitle: market.title,
              outcomeType: 'YES',
              currentPrice: price,
              currentValue: price ? tokenInfo.balance * price : undefined,
              source: 'dflow',
            });
          }

          // Check if user holds NO token
          if (noMint && tokenAccountMap.has(noMint)) {
            const tokenInfo = tokenAccountMap.get(noMint)!;
            const price = market.noAsk ? parseFloat(market.noAsk) : undefined;
            console.log('[DFlowPortfolio] ✅ Found NO position:', noMint, 'balance:', tokenInfo.balance);

            positions.push({
              tokenMint: noMint,
              tokenAccount: tokenInfo.pubkey,
              balance: tokenInfo.balance,
              decimals: tokenInfo.decimals,
              marketTicker: market.ticker,
              eventTicker: market.eventTicker,
              eventTitle: market.title,
              outcomeType: 'NO',
              currentPrice: price,
              currentValue: price ? tokenInfo.balance * price : undefined,
              source: 'dflow',
            });
          }
        }
      }

      console.log('[DFlowPortfolio] Found', positions.length, 'DFlow positions');
      return positions;
    } catch (error) {
      console.error('[DFlowPortfolio] Failed to fetch positions:', error);
      return [];
    }
  }

  /**
   * Filter token mints to get only prediction market outcome tokens
   * POST /api/dflow/filter-outcome-mints
   */
  private async filterOutcomeMints(addresses: string[]): Promise<string[]> {
    try {
      const response = await fetch(`${BACKEND_URL}/dflow/filter-outcome-mints`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ addresses }),
      });

      if (!response.ok) {
        console.warn('[DFlowPortfolio] filter-outcome-mints failed:', response.status);
        return [];
      }

      const data = await response.json();
      // API returns { outcomeMints: [...] }
      return data.outcomeMints || data.mints || [];
    } catch (error) {
      console.error('[DFlowPortfolio] filterOutcomeMints error:', error);
      return [];
    }
  }

  /**
   * Get market details for multiple outcome mints
   * POST /api/dflow/markets-batch
   */
  private async getMarketsBatch(mints: string[]): Promise<DFlowMarketBatchResponse['markets']> {
    try {
      console.log('[DFlowPortfolio] Calling markets-batch with mints:', mints);
      const response = await fetch(`${BACKEND_URL}/dflow/markets-batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mints }),
      });

      if (!response.ok) {
        console.warn('[DFlowPortfolio] markets-batch failed:', response.status);
        return [];
      }

      const data = await response.json();
      console.log('[DFlowPortfolio] markets-batch response:', JSON.stringify(data, null, 2));
      return data.markets || [];
    } catch (error) {
      console.error('[DFlowPortfolio] getMarketsBatch error:', error);
      return [];
    }
  }

  /**
   * Get portfolio summary
   */
  async getPortfolioSummary(walletAddress: string): Promise<DFlowPortfolioSummary> {
    const positions = await this.fetchPositions(walletAddress);
    
    const totalValue = positions.reduce((sum, pos) => sum + (pos.currentValue || 0), 0);
    
    return {
      totalValue,
      positionsCount: positions.length,
      lastUpdated: new Date(),
    };
  }

  /**
   * Fetch trade history from local storage (transactions are stored after successful trades)
   */
  getTradeHistory(walletAddress: string): DFlowTradeHistoryItem[] {
    try {
      const key = `dflow_trades_${walletAddress}`;
      const stored = localStorage.getItem(key);
      if (!stored) return [];
      
      const trades = JSON.parse(stored) as DFlowTradeHistoryItem[];
      // Convert date strings back to Date objects
      return trades.map(t => ({
        ...t,
        timestamp: new Date(t.timestamp),
      }));
    } catch (error) {
      console.error('[DFlowPortfolio] Failed to load trade history:', error);
      return [];
    }
  }

  /**
   * Save a trade to history
   */
  saveTradeToHistory(walletAddress: string, trade: DFlowTradeHistoryItem): void {
    try {
      const key = `dflow_trades_${walletAddress}`;
      const existing = this.getTradeHistory(walletAddress);
      existing.unshift(trade); // Add to beginning

      // Keep only last 100 trades
      const trimmed = existing.slice(0, 100);
      localStorage.setItem(key, JSON.stringify(trimmed));

      console.log('[DFlowPortfolio] Saved trade to history:', trade.txSignature);
    } catch (error) {
      console.error('[DFlowPortfolio] Failed to save trade:', error);
    }
  }

  /**
   * Calculate average cost for a position based on trade history
   * Uses FIFO method: tracks running average of buy trades
   *
   * @param walletAddress - Wallet address
   * @param tokenMint - Token mint address
   * @param marketTicker - Market ticker (fallback matching)
   * @param outcomeType - YES or NO
   * @returns Average cost per share, or undefined if no trades found
   */
  calculateAverageCost(
    walletAddress: string,
    tokenMint: string,
    marketTicker?: string,
    outcomeType?: 'YES' | 'NO'
  ): number | undefined {
    const trades = this.getTradeHistory(walletAddress);

    // Filter trades for this position
    const relevantTrades = trades.filter(t => {
      // Match by tokenMint if available
      if (t.tokenMint && tokenMint) {
        return t.tokenMint === tokenMint && t.side === 'BUY' && t.status === 'confirmed';
      }
      // Fallback: match by marketTicker and outcomeType
      if (marketTicker && outcomeType) {
        return t.marketTicker === marketTicker &&
               t.outcomeType === outcomeType &&
               t.side === 'BUY' &&
               t.status === 'confirmed';
      }
      return false;
    });

    if (relevantTrades.length === 0) {
      console.log('[DFlowPortfolio] No trade history for position:', tokenMint);
      return undefined;
    }

    // Calculate weighted average cost
    let totalCost = 0;
    let totalShares = 0;

    for (const trade of relevantTrades) {
      // Validate that amount and price are valid numbers
      const amount = typeof trade.amount === 'number' ? trade.amount : parseFloat(String(trade.amount));
      const price = typeof trade.price === 'number' ? trade.price : parseFloat(String(trade.price));

      if (!isNaN(amount) && !isNaN(price) && amount > 0 && price > 0) {
        totalCost += amount * price;
        totalShares += amount;
      } else {
        console.warn('[DFlowPortfolio] Skipping invalid trade (amount:', trade.amount, 'price:', trade.price, ')');
      }
    }

    const avgCost = totalShares > 0 ? totalCost / totalShares : undefined;
    console.log('[DFlowPortfolio] Calculated avg cost for', tokenMint, ':', avgCost,
                '(from', relevantTrades.length, 'trades)');

    return avgCost;
  }

  /**
   * Fetch positions with average cost enrichment
   */
  async fetchPositionsWithCost(walletAddress: string): Promise<DFlowPosition[]> {
    const positions = await this.fetchPositions(walletAddress);

    // Enrich each position with average cost from trade history
    for (const position of positions) {
      position.avgCost = this.calculateAverageCost(
        walletAddress,
        position.tokenMint,
        position.marketTicker,
        position.outcomeType
      );
    }

    return positions;
  }
}

// Singleton instance
export const dflowPortfolioService = new DFlowPortfolioService();
export default dflowPortfolioService;
