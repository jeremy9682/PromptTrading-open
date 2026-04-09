# Vercel Deployment Guide

This document explains how to deploy the PromptTrading frontend to Vercel as a
**demo-safe static SPA**, and what cannot be deployed there.

---

## What Vercel Can Host

Vercel is suitable for the **frontend only** (React + Vite SPA in `src/`).

| Component | Vercel? | Notes |
|-----------|:-------:|-------|
| Frontend SPA | ✅ | Static build via `npm run build` → `dist/` |
| Backend API | ❌ | Express server with WebSocket, cron jobs, Prisma/PostgreSQL |
| User Management | ❌ | Strapi CMS requires persistent server + database |

The backend and user-management services must be hosted separately (e.g.,
Railway, Render, Fly.io, or a VPS) if you need a working API behind the demo.

---

## Architecture: Demo-Safe Public Deploy

```
┌──────────────────────────────────────────────┐
│              Vercel (Frontend)                │
│                                              │
│  React SPA (static build)                    │
│  ├── Market browsing UI                      │
│  ├── Paper trading UI                        │
│  ├── Educational content                     │
│  └── AI setup UI (read-only without keys)    │
│                                              │
│  Rewrites:                                   │
│  /gamma-api/* → gamma-api.polymarket.com     │
│  /clob-api/*  → clob.polymarket.com          │
│  /*           → /index.html (SPA fallback)   │
└──────────────┬───────────────────────────────┘
               │
               │ /api/* (optional — only if backend is hosted)
               ▼
┌──────────────────────────────────────────────┐
│    Separate Host (Backend API) — optional     │
│                                              │
│  Express + Prisma + PostgreSQL               │
│  Paper trading, AI analysis, auth            │
│  ⚠️  No trading keys in demo config          │
└──────────────────────────────────────────────┘
```

### Frontend-Only Demo (No Backend)

The frontend works in a degraded but functional state without a backend:

- **Works:** Landing page, market browsing (Polymarket public APIs via
  Vercel rewrites), Learn tab, Community tab, UI exploration
- **Shows empty/error state:** Wallet, paper trading, AI analysis, credits
- **Blocked:** All trading, payments, admin

This is the safest public demo configuration.

### Frontend + Backend Demo

For a richer demo, host the backend separately and set `VITE_API_URL` to point
to it. Ensure the backend is configured with **no trading keys** (see
[demo-mode.md](./demo-mode.md) for which keys must remain unset).

---

## Vercel Environment Variables

Set these in the Vercel project dashboard under Settings → Environment Variables.

### Required

| Variable | Value | Purpose |
|----------|-------|---------|
| `VITE_API_URL` | `https://your-backend.example.com/api` or leave empty | Backend API URL. Empty = frontend-only mode |
| `VITE_API_BASE_URL` | `https://your-backend.example.com` or leave empty | Backend base URL for non-`/api` paths |

### Optional (enable specific features)

| Variable | Value | Purpose |
|----------|-------|---------|
| `VITE_PRIVY_APP_ID` | Your Privy app ID | Enables wallet login (leave empty to disable) |
| `VITE_PRIVY_SESSION_SIGNER_ID` | Privy session signer | Required with Privy |
| `VITE_WALLETCONNECT_PROJECT_ID` | WalletConnect project ID | Enables WalletConnect modal |

### Must NOT Set (demo safety)

Do not set these in a public demo — they are backend-only secrets:

- `POLYMARKET_BUILDER_*`
- `HYPERLIQUID_API_WALLET_PRIVATE_KEY`
- `DFLOW_API_KEY`
- `COINBASE_COMMERCE_*` / `HELIO_*`
- `ADMIN_API_KEY`

These are never used by the frontend build and should only exist in the
backend's environment.

---

## vercel.json Explained

The included `vercel.json` at the repository root configures:

1. **Framework:** Vite (auto-detected, but explicit for clarity)
2. **Build:** `npm run build` → outputs to `dist/`
3. **Rewrites:**
   - `/gamma-api/*` → Polymarket Gamma API (public market data)
   - `/clob-api/*` → Polymarket CLOB API (public market queries)
   - All other non-API paths → `/index.html` (SPA client-side routing)
4. **Security headers:** `X-Content-Type-Options`, `X-Frame-Options`,
   `Referrer-Policy`

### What About `/api/*` Requests?

The `vercel.json` does **not** rewrite `/api/*` to any backend. In a
frontend-only deploy, `/api/*` requests will return Vercel's default 404.
The frontend handles these gracefully (error states, empty data).

To connect a backend, set `VITE_API_URL` and `VITE_API_BASE_URL` to point to
your separately hosted backend. The frontend's API client uses these variables
to construct request URLs at build time.

---

## Deployment Steps

```bash
# 1. Fork or clone this repo
git clone https://github.com/your-org/PromptTrading-open.git

# 2. Import into Vercel (via dashboard or CLI)
vercel link

# 3. Set environment variables (see table above)
vercel env add VITE_API_URL

# 4. Deploy
vercel --prod
```

Or simply connect the GitHub repo in the Vercel dashboard — it will auto-detect
the Vite framework and use the settings from `vercel.json`.

---

## Limitations & Known Issues

1. **No SSR.** The app is a client-side SPA. Vercel's serverless functions
   are not used.
2. **Polymarket API rewrites depend on Polymarket uptime.** If Polymarket's
   APIs are down, market data won't load.
3. **Node polyfills in Vite.** The build uses `vite-plugin-node-polyfills` for
   Polymarket SDK compatibility. This increases bundle size but is necessary.
4. **No backend = no paper trading.** The paper-trading feature requires the
   Express backend and PostgreSQL database.
