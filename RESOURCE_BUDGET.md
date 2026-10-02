# DASHCUP resource budget
Updated: 2026-10-02

## Architecture
- Cloudflare Pages: static Next.js export.
- One Cloudflare Worker: API plus Expo game assets; configured Worker rate limiter.
- Neon PostgreSQL only; staging and production branches exist. Initial schema and Resend delivery migration are applied and verified on staging only.
- Resend API integration is server-side and sender configuration gated.
- No D1, Neon Functions, KV, R2, Redis or Durable Objects are in use.

## Local measurements
- Latest Wrangler staging dry run: 303.87 KiB upload, 79.45 KiB gzip; Wrangler read 196 static asset files. Staging config does not claim production custom domains.
- Frontend CI build and lint pass; Expo lint/export pass (2.16 MB JavaScript bundle). Canonical Bun audit reports 8 remaining advisories (7 high, 1 moderate), no critical.
- Worker unit tests: 10 passing.
- Current run uses one bounded in-memory reference for move evidence and no per-move React state updates; no new platform resource was added.
- GitHub CI Worker checks: 10 tests, TypeScript and both Wrangler dry-runs pass. Bun audit reports 8 known advisories.
- Cloudflare Pages deployment for report commit `307244bfff1f277e52267bd01a5f653eeecdbbe7` succeeded at https://30640269.dashcup-9289.pages.dev. The zone is active; `www` CNAME is configured and public DNS/HTTPS return success. No Worker is deployed; api/game records are absent; no production API/game usage has been measured. Local Worker dry-runs pass, but Wrangler is unauthenticated.
- No live cost or provider billing data was retrieved. No cost estimate is asserted.
- Production usage, Neon compute, Worker requests, Pages bandwidth and email quotas remain unmeasured.
