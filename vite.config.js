import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

export default defineConfig({
  plugins: [
    react(),
    nodePolyfills({
      // Whether to polyfill `node:` protocol imports
      protocolImports: true,
      // Polyfills for specific modules (Polymarket SDKs need these)
      include: [
        'buffer',
        'process',
        'util',
        'stream',
        'crypto',
        'events',
        'http',
        'https',
        'os',
        'url',
        'assert',
        'path',
      ],
      globals: {
        Buffer: true,
        global: true,
        process: true,
      },
    }),
  ],
  resolve: {
    dedupe: ['react', 'react-dom', '@tanstack/react-query'],
  },
  define: {
    global: 'globalThis',
  },
  optimizeDeps: {
    esbuildOptions: {
      // Node.js global to browser globalThis
      define: {
        global: 'globalThis',
      },
    },
    // Pre-bundle Polymarket SDKs and Privy
    include: [
      '@polymarket/clob-client',
      '@polymarket/builder-relayer-client',
      '@polymarket/builder-signing-sdk',
      '@privy-io/react-auth',
      'ethers',
    ],
  },
  build: {
    // Disable source maps in production to reduce memory usage
    sourcemap: false,
    // Increase chunk size limit to reduce the number of chunks
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      // Split large dependencies into separate chunks
      output: {
        manualChunks: {
          'polymarket': [
            '@polymarket/clob-client',
            '@polymarket/builder-relayer-client',
            '@polymarket/builder-signing-sdk',
          ],
          'ethers': ['ethers'],
          'privy': ['@privy-io/react-auth'],
          'radix-ui': [
            '@radix-ui/react-dialog',
            '@radix-ui/react-dropdown-menu',
            '@radix-ui/react-select',
            '@radix-ui/react-tabs',
          ],
        },
      },
    },
  },
  server: {
    port: 3001,
    open: true,
    // Proxy configuration
    // Note: /api/* requests go to local backend, not Polymarket API
    proxy: {
      // Local backend API (default port 3002)
      '/api': {
        target: 'http://localhost:3002',
        changeOrigin: true,
      },
      // Polymarket Gamma API (public data — market listings)
      '/gamma-api': {
        target: 'https://gamma-api.polymarket.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/gamma-api/, ''),
      },
      // Polymarket CLOB API (query specific markets by condition_id)
      '/clob-api': {
        target: 'https://clob.polymarket.com',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/clob-api/, ''),
        configure: (proxy, options) => {
          proxy.on('error', (err, req, res) => {
            console.log('[CLOB Proxy Error]', err);
          });
          proxy.on('proxyReq', (proxyReq, req, res) => {
            console.log('[CLOB Proxy] ->', req.url);
          });
          proxy.on('proxyRes', (proxyRes, req, res) => {
            console.log('[CLOB Proxy] <-', proxyRes.statusCode, req.url);
          });
        },
      },
    },
  }
})
