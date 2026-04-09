# Release Privacy Checklist

Pre-release privacy scrub completed on 2026-04-09.

## Checks Performed

1. **File content scan** — No personal emails, usernames, local paths, or private IPs found in source files.
2. **Secrets audit** — All `.env` files excluded; only `.env.example` with placeholders committed.
3. **Package metadata** — No author/maintainer fields exposing personal identity in `package.json` files.
4. **Git history rewrite** — All commit author/committer fields set to:
   - Name: `PromptTrading Open Maintainers`
   - Email: `opensource@prompttrading.local`
5. **Git remotes** — No remote origins configured (clean local repo).
6. **Reflog/GC** — Expired and pruned to remove old identity from object store.

## What to Verify Before Each Release

- [ ] `git log --format='%an <%ae>' | sort -u` shows only the generic maintainer identity
- [ ] `grep -r '<developer-handle>\|<developer-name>' --include='*.ts' --include='*.tsx' --include='*.js' --include='*.json' --include='*.md' --include='*.py' .` returns nothing after replacing the placeholders with any known personal identifiers used during development
- [ ] No `.env` files (only `.env.example`) are tracked: `git ls-files | grep '\.env$'`
- [ ] No private IPs or internal hostnames in source: `grep -rE '192\.168\.|10\.\d+\.\d+' --include='*.ts' --include='*.js' .`
- [ ] `git remote -v` returns empty or points to the intended public repo only
