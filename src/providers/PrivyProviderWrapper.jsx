/**
 * Privy Provider Wrapper (v3.x compatible)
 *
 * Login methods are controlled by Privy Dashboard:
 * https://console.privy.io → Your App → Login Methods
 *
 * Enable these in Dashboard:
 * - Email
 * - Google
 * - External Wallets (for MetaMask, WalletConnect, etc.)
 * - Embedded Wallets → Create on login: All users
 *
 * Account Funding (enabled in Dashboard):
 * - Pay with Card (MoonPay) - for users without crypto
 * - External Wallet Transfer - for users with MetaMask
 *
 * Architecture:
 * - Embedded EVM wallet: For paying service subscriptions/credits, Polymarket trading
 * - Embedded Solana wallet: For DFlow/Kalshi trading on Solana
 * - External wallets: Optional, for power users
 */

import React from 'react';
import { PrivyProvider } from '@privy-io/react-auth';
import { toSolanaWalletConnectors } from '@privy-io/react-auth/solana';
import { arbitrum, arbitrumSepolia, polygon, mainnet } from 'viem/chains';
import { createSolanaRpc, createSolanaRpcSubscriptions } from '@solana/kit';

// Solana wallet connectors for external wallets (Phantom, etc.)
const solanaConnectors = toSolanaWalletConnectors({
  // Only show wallets that are detected/installed
  shouldAutoConnect: true,
});

const PRIVY_APP_ID = import.meta.env.VITE_PRIVY_APP_ID;

// Solana RPC configuration - 前端使用 PublicNode 免费 RPC
const SOLANA_RPC_URL = import.meta.env.VITE_SOLANA_RPC_URL || 'https://solana-rpc.publicnode.com';
const SOLANA_WS_URL = SOLANA_RPC_URL.replace('https://', 'wss://').replace('http://', 'ws://');

if (!PRIVY_APP_ID) {
  console.error('Missing VITE_PRIVY_APP_ID in environment variables');
}

export const PrivyProviderWrapper = ({ children }) => {
  return (
    <PrivyProvider
      appId={PRIVY_APP_ID}
      config={{
        // Let Dashboard control login methods - don't override here
        // Just configure appearance and chains

        appearance: {
          theme: 'auto',
          accentColor: '#6366f1',
          showWalletLoginFirst: false,
        },

        // Embedded wallets - ENABLED for all users
        // EVM wallet: For Polymarket trading on Polygon, service payments
        // Solana wallet: For DFlow/Kalshi trading on Solana
        embeddedWallets: {
          createOnLogin: 'all-users',
          // Enable Solana embedded wallets
          solana: {
            createOnLogin: 'all-users',
          },
        },

        // External wallet connectors
        externalWallets: {
          // Solana external wallets (Phantom, Solflare, etc.)
          solana: {
            connectors: solanaConnectors,
          },
        },

        // Chain configuration (EVM chains)
        defaultChain: arbitrumSepolia,
        supportedChains: [
          arbitrumSepolia,
          arbitrum,
          polygon,
          mainnet,
        ],

        // Solana RPC configuration for embedded wallet transaction signing (v3.0 format)
        solana: {
          rpcs: {
            'solana:mainnet': {
              rpc: createSolanaRpc(SOLANA_RPC_URL),
              rpcSubscriptions: createSolanaRpcSubscriptions(SOLANA_WS_URL),
            },
          },
        },
      }}
      onSuccess={(user, isNewUser) => {
        console.log('✅ Privy login success:', {
          userId: user.id,
          isNewUser,
          linkedAccounts: user.linkedAccounts,
          wallet: user.wallet,
        });
      }}
      onError={(error) => {
        console.error('❌ Privy error:', error);
      }}
    >
      {children}
    </PrivyProvider>
  );
};

export default PrivyProviderWrapper;
