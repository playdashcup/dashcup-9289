# DASHCUP resource budget
Updated: 2026-10-02

## Architecture
- Cloudflare Pages: static Next.js export.
- One Cloudflare Worker: API plus Expo game assets; configured Worker rate limiter.
- Neon PostgreSQL only; staging and production branches exist. Initial schema and Resend delivery migration are applied and verified on staging only.
- Resend API integration is server-side and sender configuration gated.
- No D1, Neon Functions, KV, R2, Redis or Durable Objects are in use.

## Local measurements
- Latest Wrangler staging dry run: 300.90 KiB upload, 78.73 KiB gzip; Wrangler read 196 static asset files. Staging config does not claim production custom domains.
- Frontend build and lint pass; Expo web export pass (2.22 MB JavaScript bundle).
- Worker unit tests: 8 passing.
- Current run uses one bounded in-memory reference for move evidence and no per-move React state updates; no new platform resource was added.
- Alternate local npm dependency resolution for Expo reported 42 audit findings (1 critical, 18 high, 22 moderate, 1 low); canonical Bun-lockfile audit was not completed.
- Cloudflare Pages production deployment at https://159c952c.dashcup-9289.pages.dev succeeded for source commit a09430c0007e2392a17a0d33d6805e9a6cd76e65. No Worker is deployed; no production API/game usage has been measured.
- No live cost or provider billing data was retrieved. No cost estimate is asserted.
- Production usage, Neon compute, Worker requests, Pages bandwidth and email quotas remain unmeasured.
