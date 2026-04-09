// Buffer polyfill for browser environment (required by Privy/ethers)
import { Buffer } from 'buffer'
globalThis.Buffer = Buffer

import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from './App.jsx'
import './index.css'

// Privy authentication providers
// Note: Privy now handles both EVM and Solana wallets
// - EVM: For Polymarket trading on Polygon
// - Solana: For DFlow/Kalshi trading
import { PrivyProviderWrapper } from './providers/PrivyProviderWrapper'
import { AuthProvider } from './contexts/AuthContext'
import { SafeWalletProvider } from './contexts/SafeWalletContext'
import { WalletProvider } from './contexts/WalletContext'

// Create React Query client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000, // 1 minute
      refetchOnWindowFocus: false,
    },
  },
})

// Note: React.StrictMode removed to fix Privy SDK DOM conflict
// Privy SDK's internal DOM manipulation conflicts with StrictMode's double-mounting
// This is a known compatibility issue with some third-party auth libraries
ReactDOM.createRoot(document.getElementById('root')).render(
  <QueryClientProvider client={queryClient}>
    <PrivyProviderWrapper>
      <AuthProvider>
        <SafeWalletProvider>
          <WalletProvider>
            <BrowserRouter>
              <App />
            </BrowserRouter>
          </WalletProvider>
        </SafeWalletProvider>
      </AuthProvider>
    </PrivyProviderWrapper>
  </QueryClientProvider>,
)

