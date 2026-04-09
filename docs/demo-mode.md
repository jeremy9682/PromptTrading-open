# Demo Mode — Boundary Reference

This document defines what is safe to expose in a public demo of PromptTrading
and what must remain disabled, mocked, or hidden.

---

## Guiding Principles

1. **No real funds at risk.** A public demo must never execute real trades or
   process real payments.
2. **No secrets exposed.** API keys, private keys, and Privy credentials must
   never appear in client bundles or public URLs.
3. **Read-only data is fine.** Polymarket public market data, educational
   content, and static UI are safe to show.
4. **Paper trading is the hero feature.** It demonstrates the platform's
   capabilities without financial risk.

---

## Frontend Page Safety Matrix

| Route | Page | Demo-safe? | Notes |
|-------|------|:----------:|-------|
| `/` (landing) | Landing Page | ✅ Yes | First-visit splash, fully static |
| `/` (polymarket mode) | Markets Page | ✅ Yes | Public Polymarket data via Gamma API |
| `/` (hyperliquid mode) | CryptoTradingView | ⚠️ Partial | UI safe to show; live trading disabled without keys |
| `/markets` | Polymarket Markets | ✅ Yes | Read-only market browsing |
| `/watchlist` | Watchlist | ⚠️ Partial | Requires auth; shows empty state without login |
| `/traders` | Trader Tracking | ✅ Yes | Public trader data |
| `/traders/:id` | Trader Detail | ✅ Yes | Public trader data |
| `/ai-setup` | AI Configuration | ⚠️ Partial | UI viewable; AI calls require API keys |
| `/wallet` | Wallet Connection | ❌ Disable | Requires Privy keys; shows real wallet flows |
| `/learn` | Educational Content | ✅ Yes | Fully static JSON content |
| `/community` | Community | ✅ Yes | Static community page |
| `/ai-credits` | Credits & Recharge | ❌ Disable | Payment flows (Coinbase Commerce, Helio) |
| `/pro/*` | Pro Terminal | ❌ Disabled | Already blocked in production (`import.meta.env.PROD`) |

### Recommended Demo Flow

1. Landing Page → "Get Started"
2. Markets Page (Polymarket mode) — browse live prediction markets
3. Trader Tracking — view top traders and their strategies
4. Paper Trading — demonstrate simulated trading with $10,000 balance
5. Learn Tab — show educational content
6. AI Setup — show the model selection UI (analysis won't fire without keys)

---

## Backend Route Safety Matrix

### Safe for Demo (read-only / simulated)

| Route prefix | Purpose | Why safe |
|---|---|---|
| `GET /health` | Health check | No sensitive data |
| `/api/polymarket` (GET endpoints) | Market data, search, timeline | Public Polymarket data, cached |
| `/api/paper-trading/*` | Paper trading | Simulated balances, no real funds |
| `/api/search/*` | Semantic search | Read-only; degrades gracefully without embedding keys |
| `/api/ai/test` | AI connection test | No side effects |

### Must Disable / Not Expose in Demo

| Route prefix | Purpose | Risk |
|---|---|---|
| `/api/polymarket/trading/*` | CLOB order execution | Real money trades on Polymarket |
| `/api/polymarket/auto-trade/*` | Automated trading | Autonomous real money trades |
| `/api/polymarket` (builder routes) | Builder order relay | Real money order relay |
| `/api/signing/*` | Hyperliquid trade signing | Real money trades |
| `/api/agent/*` | Agent wallet management | Private key operations |
| `/api/account/*` | Hyperliquid account data | Exposes real balances/positions |
| `/api/recharge/*` | Payment processing | Real USDC deposits |
| `/api/subscription/*` | Subscription management | Real payment flows |
| `/api/dflow/*` | Solana swaps | Real token swaps |
| `/api/admin/*` | Admin operations | Privileged access |

### Conditional (safe if keys absent — will return errors gracefully)

| Route prefix | Purpose | Behavior without keys |
|---|---|---|
| `/api/ai/*` (analysis endpoints) | LLM analysis | Returns error — no side effects |
| `/api/auth/*` | Privy authentication | Returns auth error — safe |
| `/api/credits/*` | Usage tracking | Requires auth — returns 401 |
| `/api/user/*` | User profile | Requires auth — returns 401 |
| `/api/notifications/*` | Push notifications | Requires auth — no side effects |
| `/api/sse/*` | Server-sent events | Requires auth — closes connection |

---

## Environment Variable Boundaries

### Frontend — Required for Demo

```env
# Minimal demo config — only these are needed for market browsing
VITE_API_URL=http://localhost:3002/api
VITE_API_BASE_URL=http://localhost:3002

# Leave blank / placeholder — features degrade gracefully
VITE_PRIVY_APP_ID=
VITE_WALLETCONNECT_PROJECT_ID=
VITE_PLATFORM_RECEIVER=
VITE_POLYGON_RPC_URL=
VITE_SOLANA_RPC_URL=
```

### Backend — Required for Demo

```env
NODE_ENV=development
PORT=3002
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@localhost:5432/prompttrading

# Everything else can be empty / placeholder.
# The server starts and serves market data endpoints
# without any third-party API keys.
```

### Must Never Be Set in a Public Demo

These keys authorize real financial operations and must never appear in a
public deployment:

- `POLYMARKET_BUILDER_*` — Polymarket trading credentials
- `HYPERLIQUID_API_WALLET_PRIVATE_KEY` — Hyperliquid signing key
- `DFLOW_API_KEY` — Solana swap authorization
- `COINBASE_COMMERCE_API_KEY` / `HELIO_API_KEY` — Payment processing
- `PLATFORM_USDC_RECEIVER` — Real USDC receiving address
- `ADMIN_API_KEY` — Admin access
- `AWS_SECRET_NAME` / `AWS_REGION` — Secrets Manager (production secrets)

---

## Existing Safety Mechanisms

The codebase already has several demo-friendly features:

1. **Paper Trading (default ON)** — `isPaperTrading: true` in Zustand store.
   Users start in simulated mode with $10,000 balance. Switching to live
   requires explicit confirmation dialog.

2. **Production Pro Terminal block** — `/pro/*` routes redirect to `/` when
   `import.meta.env.PROD` is true.

3. **Testnet default** — `USE_TESTNET=true` in backend `.env.example`.
   Hyperliquid defaults to testnet endpoints.

4. **Privy auth gate** — Most backend routes require a valid Privy JWT.
   Without Privy keys configured, all authenticated endpoints return 401.

5. **Rate limiting & usage quotas** — Built-in per-user limits prevent abuse.

6. **Mainnet confirmation dialog** — Switching from testnet to mainnet
   requires explicit user confirmation with risk warnings.

---

## Code-Side Demo Boundary Decisions

### What We Are NOT Changing (and Why)

We deliberately avoid large-scale code changes for demo mode in this round.
Reasons:

1. **The existing paper-trading + auth-gate pattern already provides strong
   demo safety.** Without API keys, dangerous endpoints are unreachable.

2. **A `VITE_DEMO_MODE` feature flag would touch dozens of components** —
   conditionally hiding wallet buttons, disabling trade forms, swapping
   API calls for stubs. This is a full feature branch, not a documentation
   round.

3. **Mock data services would duplicate the existing paper-trading system.**
   Paper trading already provides the "safe playground" experience.

4. **The right architectural boundary is at deployment, not in code.** A
   Vercel-hosted frontend with no backend keys configured is inherently
   demo-safe — dangerous API calls simply fail with auth errors.

### What Could Be Added Later (Future Work)

If a polished public demo is needed beyond "Vercel frontend + limited backend":

- **`VITE_DEMO_MODE=true` flag** — Hides wallet connection, payment, and
  live-trading UI elements. Shows banner: "This is a read-only demo."
- **Mock API responses** — Static JSON responses for market data so the demo
  works without any backend at all.
- **Demo user session** — Pre-authenticated read-only session that shows the
  full UI without requiring Privy.
- **Guided tour overlay** — Step-by-step walkthrough of platform features.

These are tracked as potential enhancements, not blockers for the current
Vercel-ready prep.
