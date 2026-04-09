# Open Source Audit

## Scope

- Source repositories reviewed: local PromptTrading working tree and the corresponding private backend codebase
- Open-source snapshot goal: keep shareable application code, remove private or environment-specific material

## Kept

- Frontend source under `src/`
- Minimal public asset(s) under `public/`
- Backend API source under `backend/src/`
- Prisma schema and migrations under `backend/prisma/`
- Strapi user-management service under `user-management/` (config, src, types, database migrations placeholder)
- Core build files and editor config

## Removed Or Excluded

- `.env`, `.env.*`, `backend/.env`, `user-management/.env`, and every real secret-bearing file
- `node_modules/`, `dist/`, `.next/`, `.output/`, `.tmp/`, `.strapi/`, caches, logs, temp files
- `.cursor/`, `.warp/`, local IDE state, and OS metadata files
- `deploy/`, `nginx/`, `.github/workflows/`, deployment READMEs, DNS/server setup notes
- `extension/`, research subprojects, and third-party agent repos
- Backend test files and manual ops scripts that depended on non-public credentials
- Strapi auto-generated API documentation (`full_documentation.json`)
- Strapi `installId` from `package.json` (deployment identifier)
- `yarn.lock` from user-management (generated lockfile)
- Backup files such as `*.backup` and refactor scratch files

## Redactions And Safe Defaults

- Removed real backend secret files that contained OpenRouter, Privy, Polymarket, DFlow, database, and wallet credentials
- Replaced production API host defaults with local `localhost` values or environment-variable lookups
- Removed hardcoded platform receiver wallet fallback from frontend code
- Replaced default AWS secret name with a generic placeholder
- Rewrote environment examples so every credential is a placeholder
- Replaced Strapi UUID with a generic placeholder in user-management package.json

## Retained But Intentionally Config-Driven

- Public third-party API hostnames required by the application protocol remain in source where they are part of the product logic
- Wallet addresses, API keys, payment receivers, and admin settings must now be supplied by the operator

## Known Public Snapshot Limits

- No deployment automation is included
- Some advanced runtime paths will remain disabled until you provide valid third-party credentials and infrastructure
