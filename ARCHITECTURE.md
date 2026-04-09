# Architecture

PromptTrading is a monorepo with three independently runnable services that together form an AI-powered prediction market trading platform.

```
┌──────────────────────────────────────────────────────────┐
│                     Browser (User)                       │
└──────────┬──────────────────────────────────┬────────────┘
           │                                  │
           ▼                                  ▼
┌─────────────────────┐          ┌─────────────────────────┐
│  Frontend (Vite)    │          │  Polymarket Public APIs  │
│  React SPA          │          │  (gamma-api, clob-api)   │
│  Port 3001          │          └─────────────────────────┘
│                     │
│  src/               │
│  ├── components/    │
│  ├── polymarket/    │
│  ├── pro-terminal/  │
│  ├── hooks/         │
│  ├── services/      │
│  ├── contexts/      │
│  └── constants/     │
└──────────┬──────────┘
           │ /api/*
           ▼
┌─────────────────────┐          ┌─────────────────────────┐
│  Backend API        │◄────────►│  PostgreSQL              │
│  Express + Prisma   │          │  (backend database)      │
│  Port 3002          │          └─────────────────────────┘
│                     │
│  backend/src/       │          ┌─────────────────────────┐
│  ├── controllers/   │────────►│  External APIs           │
│  ├── services/      │          │  OpenRouter, Privy,      │
│  ├── routes/        │          │  Polymarket, DFlow,      │
│  ├── middleware/     │          │  Hyperliquid, Solana     │
│  ├── jobs/          │          └─────────────────────────┘
│  ├── models/        │
│  └── config/        │
└─────────────────────┘

┌─────────────────────┐          ┌─────────────────────────┐
│  User Management    │◄────────►│  PostgreSQL              │
│  Strapi CMS         │          │  (Strapi database)       │
│  Port 1337          │          └─────────────────────────┘
│                     │
│  user-management/   │
│  ├── src/api/       │  Wallet-based auth, user profiles,
│  ├── config/        │  content-type schemas (sessions,
│  └── src/utils/     │  payments, strategies, trade logs)
└─────────────────────┘
```

## Services

### Frontend (`src/`)

React + Vite single-page application. Key areas:

- **`polymarket/`** — Polymarket market browsing, watchlists, trader tracking
- **`pro-terminal/`** — Advanced dockable trading terminal (DockView)
- **`components/tabs/`** — Dashboard, trading, AI setup, wallet, community pages
- **`services/`** — API clients, wallet connectors, Polymarket CLOB integration
- **`hooks/`** — React hooks for trading flows, delegation, paper trading
- **`contexts/`** — Global state via Zustand (`useAppStore`)

The Vite dev server proxies `/api/*` to the backend and `/gamma-api`, `/clob-api` to Polymarket public endpoints.

### Backend API (`backend/`)

Node.js/Express server with Prisma ORM against PostgreSQL. Handles:

- **AI analysis** — LLM-powered market analysis via OpenRouter / OpenAI
- **Polymarket integration** — Market data caching, CLOB trading, builder order relay, auto-trade
- **Hyperliquid** — Perpetual futures account management, signing, delegation
- **DFlow / Solana** — Solana swap proxy
- **Billing** — Credit system, recharge orders, subscription management, blockchain deposit verification
- **Paper trading** — Simulated trading without real funds
- **Semantic search** — Embedding-based market search with optional Cohere reranking
- **Background jobs** — Deposit scanning, market sync, price caching, position monitoring

Authentication is handled via Privy (`privyAuth.middleware.js`). Admin endpoints use a separate API-key middleware.

### User Management (`user-management/`)

Strapi 5 CMS providing:

- Wallet-based authentication (signature verification via ethers)
- User profiles, sessions, payments, strategies, trade logs, AI usage logs
- Rate-limit rules and notification content types
- Optional Redis caching layer

This service is **optional** for basic development — the backend API can run independently with its own Prisma-based user model.

## Data Flow

1. User connects wallet via Privy in the frontend
2. Frontend calls `/api/*` for AI analysis, trading, account management
3. Backend authenticates via Privy JWT, routes to appropriate service
4. Trading flows: backend signs and relays orders to Polymarket/Hyperliquid/DFlow
5. Market data: frontend fetches public data from Polymarket APIs (proxied through Vite), backend caches and enriches it
6. Billing: frontend initiates recharge → backend verifies on-chain deposit → credits user

## Database

The backend uses Prisma with PostgreSQL. Key models (see `backend/prisma/schema.prisma`):

- `User` — Privy-authenticated user with wallet, delegation, subscription, credits
- `PolymarketWatchlistItem`, `PolymarketTrader` — Market tracking
- `PolymarketAnalysisHistory` — AI analysis results
- `AutoTradeHistory` — Automated trade records
- `RechargeOrder`, `UsageRecord`, `SubscriptionOrder` — Billing

## Configuration

Each service reads from its own `.env` file. See:

- `.env.example` — Frontend variables (`VITE_*`)
- `backend/.env.example` — Backend variables (database, API keys, chain RPCs)
- `user-management/.env.example` — Strapi variables (database, secrets)
