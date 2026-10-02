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
- The stable Cloudflare Pages project URL https://dashcup-9289.pages.dev is live. The zone is active; `www` CNAME is configured and public DNS/HTTPS return success. No Worker is deployed; api/game records are absent; no production API/game usage has been measured. Local Worker dry-runs pass, but Wrangler is unauthenticated.
- No live cost or provider billing data was retrieved. No cost estimate is asserted.
- Production usage, Neon compute, Worker requests, Pages bandwidth and email quotas remain unmeasured.

## Live continuation update (2026-10-02)
- One existing Pages project and one Worker script are in use; only the staging Worker is deployed. No additional Cloudflare storage/service was created.
- Staging Worker `dashcup-9289-staging`, version `6aef8761-d60c-4470-a024-509679ece2b8`; Wrangler reported 136 assets uploaded, 303.87 KiB total / 79.45 KiB gzip, and 45.89 seconds. These are deployment/upload measurements, not billing data.
- Staging Neon connection configured as Worker secret; production untouched. API checks were limited except a session/game-start/game-end test that awarded zero. Rate-limit probe sent 70 concurrent and 70 sequential health requests (all 200; no 429 observed). No live billing or cost claim is made.

## Latest staging rate-guard update
- Shared rate-limit decision helper is used by the Worker; added test verifies a rejected binding result returns HTTP 429 with `RATE_LIMITED`. Worker tests now pass 11/11 and Worker typecheck passes.
- Latest redeploy of the existing staging Worker is version `b5015c4f-de67-42ca-96a4-011f7ca301db`; no game assets changed. Staging health confirms `ok=true`, environment `staging`, and database connected. Replay/email flags remain false.
- Live probe saw 140 successful health responses (70 concurrent, 70 sequential), without a 429. Cloudflare documents this binding as per-location/per-machine and permissive/eventually consistent; live throttle outcome remains unverified. No production Worker or DB changes.
