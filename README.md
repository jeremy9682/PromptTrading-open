<p align="center">
  <img src="public/logo.png" alt="PromptTrading" width="80" />
</p>

<h1 align="center">PromptTrading</h1>

<p align="center">
  <strong>Turn one prompt into a 24/7 AI quant trader</strong>
</p>

<p align="center">
  <a href="#quick-start">Quick Start</a> &middot;
  <a href="#features">Features</a> &middot;
  <a href="#architecture">Architecture</a> &middot;
  <a href="#demo-mode">Demo Mode</a> &middot;
  <a href="#contributing">Contributing</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License" />
  <img src="https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg" alt="Node" />
  <img src="https://img.shields.io/badge/react-18-61dafb.svg" alt="React" />
  <img src="https://img.shields.io/badge/prisma-ORM-2D3748.svg" alt="Prisma" />
</p>

---

## What is PromptTrading?

PromptTrading is an open-source, AI-powered multi-market trading platform. Write a single prompt describing your trading strategy, and the platform orchestrates **automated crypto trading** and **Polymarket prediction-market strategies** on your behalf -- 24/7 market monitoring, order execution, and risk management, all driven by AI.

### The Problem

Manual traders can't watch every market, every hour. Algorithmic trading platforms are complex, expensive, and require coding expertise. Existing "AI trading" tools are usually black boxes with no transparency.

### The Solution

PromptTrading lets you describe a strategy in plain language. The platform's multi-model AI engine (GPT-4, Claude, DeepSeek) translates that into executable trading logic, manages risk, and places real orders across multiple markets -- with full transparency into every decision.

---

## Features

### Two Trading Modes, One Platform

| Polymarket Prediction Engine | Crypto AI Quant Trading |
|---|---|
| Trade on global politics, sports, tech events | BTC, ETH, SOL and 100+ assets |
| AI detects mispriced odds and asymmetric payoffs | Multi-factor technical analysis |
| From small experimental bets to systematic strategies | Smart position sizing and drawdown protection |

### Core Capabilities

- **Multi-Model AI** -- Aggregate GPT-4, Claude, DeepSeek and more. Cross-validate trade ideas to reduce hallucination risk
- **Prompt-to-Order Pipeline** -- From natural language strategy to signal generation, risk checks, and live order execution
- **Real-Time Dashboard** -- Monitor each AI Trader's positions, PnL curves, and risk metrics in real time
- **Downside-First Risk Control** -- Set max drawdown, per-trade loss caps, and stepwise de-risking rules
- **Paper Trading** -- Ship with a $10,000 simulated account. Test strategies without risking real funds
- **Pro Terminal** -- Bloomberg-style dockable workspace (DockView) for power users
- **Multi-Language** -- Full English and Chinese (zh-CN) support throughout the UI
- **Wallet Auth** -- Privy-powered embedded wallets and WalletConnect for external wallets
- **Safe Wallet Integration** -- Gnosis Safe multi-sig support for Polymarket trading
- **Agent Wallet** -- Delegated trading wallets that sign on your behalf while your main key stays secure
- **Semantic Search** -- Embedding-based market discovery with optional Cohere reranking
- **Credit System** -- On-chain USDC recharge with multi-chain support (Arbitrum, Base, Polygon, Optimism, Ethereum)

---

## Architecture

```
Browser
  |
  v
Frontend (React + Vite, port 3001)
  |  /api/*
  v
Backend API (Express + Prisma, port 3002)
  |
  +---> PostgreSQL
  +---> AI Providers (OpenRouter / OpenAI / DeepSeek)
  +---> Polymarket (CLOB + Gamma API)
  +---> Hyperliquid (Perps)
  +---> DFlow / Solana
  +---> Privy Auth
  
User Management (Strapi, port 1337)  [optional]
  +---> PostgreSQL
```

### Repo Structure

```
src/                   React + Vite frontend
  polymarket/          Polymarket markets, watchlists, trader tracking
  pro-terminal/        Bloomberg-style dockable trading terminal
  components/          Dashboard, trading, wallet, credits UI
  services/            API clients, wallet connectors, CLOB integration
  hooks/               Trading flows, delegation, paper trading
  contexts/            Global state (Zustand)

backend/               Node.js / Express API server
  controllers/         Route handlers
  services/            Business logic (AI, trading, billing, search)
  middleware/          Auth, rate limiting, network switching
  jobs/                Background workers (deposit scanner, market sync)
  prisma/              Database schema and migrations

user-management/       Strapi CMS (wallet auth, user profiles)
docs/                  Decision records, deployment guides
```

See [ARCHITECTURE.md](ARCHITECTURE.md) for a detailed system diagram and data flow.

---

## Quick Start

### Prerequisites

- **Node.js** >= 18
- **PostgreSQL** (one server, two databases)

### 1. Clone and configure

```bash
git clone https://github.com/your-org/PromptTrading-open.git
cd PromptTrading-open

# Copy env templates
cp .env.example .env
cp backend/.env.example backend/.env
cp user-management/.env.example user-management/.env
```

Edit the `.env` files:
- `backend/.env` -- set `DATABASE_URL` to your PostgreSQL connection
- `user-management/.env` -- set database credentials and replace all `toBeModified` secrets

### 2. Create databases and install

```bash
createdb prompttrading
createdb strapi

make install          # installs all three services
```

### 3. Initialize the backend database

```bash
cd backend
npx prisma generate
npx prisma migrate deploy
cd ..
```

### 4. Start services (one terminal each)

```bash
make dev-frontend          # port 3001
make dev-backend           # port 3002
make dev-user-management   # port 1337
```

Or manually:

```bash
npm run dev                         # frontend
cd backend && npm run dev           # backend
cd user-management && npm run dev   # user management
```

Run `make help` for all available targets.

---

## What Works Without API Keys

The frontend UI, market browsing (via Polymarket public APIs), and the full backend structure are explorable with zero third-party keys. Features that need your own credentials:

| Feature | Required Keys |
|---------|---------------|
| AI analysis & chat | `OPENROUTER_API_KEY` or `OPENAI_API_KEY` |
| Wallet authentication | `PRIVY_APP_ID`, `PRIVY_APP_SECRET` |
| Polymarket trading | `POLYMARKET_BUILDER_*` credentials |
| DFlow / Solana swaps | `DFLOW_API_KEY` |
| Hyperliquid trading | `HYPERLIQUID_*` credentials |
| Payments / recharge | `COINBASE_COMMERCE_*` or `HELIO_*` keys |
| Semantic search | `COHERE_API_KEY` (optional) |

See `backend/.env.example` for the full list.

---

## Demo Mode

Deploy a **safe, read-only public demo** on Vercel (frontend only) with no trading credentials or real funds at risk.

### Works in Demo

- Live Polymarket data via public APIs
- Top trader tracking and strategy browsing
- Paper trading with a simulated $10,000 account (requires backend)
- Educational content with multi-language articles
- Full UI exploration -- dark mode, responsive layout, AI model selector

### Disabled Without Keys

- Wallet connection, live trading, AI analysis, payment flows

### Deploy to Vercel

```bash
vercel link && vercel --prod
```

The included `vercel.json` handles SPA routing and Polymarket API proxying automatically. See [docs/vercel-deployment.md](docs/vercel-deployment.md) for backend hosting.

### Safety Guarantees

- Paper trading is **on by default** (`isPaperTrading: true`)
- Live trading requires explicit confirmation dialogs
- All trading endpoints return 401 without valid authentication
- No API keys, private keys, or secrets are included in this repository

See [docs/demo-mode.md](docs/demo-mode.md) for the full boundary reference.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, Vite, Tailwind CSS, Zustand, DockView |
| Backend | Node.js, Express, Prisma ORM |
| Database | PostgreSQL |
| Auth | Privy (embedded + external wallets), WalletConnect |
| AI | OpenRouter, OpenAI, DeepSeek, Anthropic Claude |
| Markets | Polymarket CLOB, Hyperliquid, DFlow/Kalshi, Binance, CoinGecko |
| Payments | On-chain USDC (multi-chain), Coinbase Commerce, Helio |
| User Mgmt | Strapi 5 CMS |
| Search | OpenAI embeddings, Cohere reranking |

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## Security

See [SECURITY.md](SECURITY.md) for reporting vulnerabilities.

## License

MIT -- see [LICENSE](LICENSE).

---

## Docs

- [Architecture](ARCHITECTURE.md) -- System diagram and data flow
- [Demo Mode](docs/demo-mode.md) -- Demo-safe boundary reference
- [Vercel Deployment](docs/vercel-deployment.md) -- Frontend deployment guide
- [Open Source Audit](docs/OPEN_SOURCE_AUDIT.md) -- Sanitization policy for this snapshot
- [License Decision](docs/LICENSE_DECISION.md) -- Rationale for the MIT license

---

<p align="center">
  <sub>Built with AI, shipped for everyone.</sub>
</p>
