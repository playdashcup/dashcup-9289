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

## Resource/dependency update — 2026-10-02

- No additional infrastructure was created. Existing single Worker, Pages project, Neon project, and staging rate-limit binding are reused. No D1/KV/R2/Redis/Durable Objects/second Worker was added.
- Staging database operations used the existing Neon staging branch. Production database and Worker were not modified.
- Worker tests 11/11, Worker TypeScript check, Wrangler staging dry-run, and frontend lint passed. No frontend production build was run.
- Canonical Bun lockfile and package manifests were unchanged; the previously reviewed Bun audit remains 7 high and 1 moderate. Bun audit was not rerun in this continuation.
- Browser-tool initialization remains unavailable due the Windows `apply deny-read ACLs` error; no browser E2E or visual playtest cost/result is claimed.

## Live resource snapshot (2026-10-02)

- One existing Cloudflare Pages project (unchanged), one production Worker `dashcup-9289` serving API/game, and one staging Worker. No D1, KV, R2, Redis, Durable Objects, second zone, or second production Worker was created.
- Production Neon project `bitter-mode-91626896`, branch `br-purple-river-b4v27of0`; staging branch `br-empty-cherry-b4mxu4la`. Production and staging migrations are applied. Production Worker version `7e3b55c8-c35c-44e9-a204-470e5d91841a`; staging version `c7d9b2d7-e0a5-40d3-8c8d-af4652864849`.
- Expo Worker asset bundle approx. 2.16 MB JavaScript; Wrangler uploaded 307.84 KiB source package (80.36 KiB gzip) on latest deploy. Existing Pages frontend was not rebuilt.
- Latest Worker tests 11/11, TypeScript check, root lint, and Wrangler production dry-run passed. Canonical Bun audit remains 8 advisories (7 high, 1 moderate). Live rate-limit threshold and browser E2E remain unverified.
- Resend delivery, reward-ad payouts and external conversion integrations remain disabled, so no provider delivery/usage is currently incurred by these flows.
