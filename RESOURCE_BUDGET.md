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

## Staging anti-cheat validation (2026-10-02)

- No new Cloudflare resources or Neon objects/migrations were added for the anti-cheat update.
- Staging Worker is version `49ccb780-68e1-49db-b1bf-0bf43ff832b9`, with its original rate-limit binding restored to 60 per 60 seconds after a temporary staging-only five/minute exercise that demonstrated HTTP 429.
- Production config remains 60/min; existing production Worker version `7e3b55c8-c35c-44e9-a204-470e5d91841a` needs the staged code update. Production Neon schema is unchanged.
- Validation: 11/11 worker tests, Worker typecheck, root lint, production dry-run. Staging smoke confirmed session/CSRF, anomalous score and duration rejection, accepted plausibility-only run, duplicate-run rejection, referral/quest progression, and repeated-suspicious-run logging. Browser E2E remains unavailable.

## Production Worker update (2026-10-02)

- Production Worker version `5f3cc03f-e822-415a-a097-36de130f6148` is live on existing API/game domains. Rate-limit binding is 60 requests/60 seconds per IP; `GAME_REPLAY_ENABLED=false` and reward email stays disabled.
- Game root and full 2.16 MB Expo JS bundle returned 200; API health and Neon connectivity 200/true. No Pages deployment or new Cloudflare resource was created.
- Tests after the source update: Worker 11/11, typecheck pass, root lint pass, Wrangler production dry-run pass; staging flow smoke passed before promotion.

## Resource optimization snapshot — 2026-10-02

- Architecture unchanged: one existing Pages project, one production Worker serving API/game, one staging Worker, and Neon only. No additional Cloudflare storage/service or database was created.
- Dashboard load: one `/api/bootstrap` HTTP request. Existing-session bootstrap has 5 SQL statements after optimization (CSRF/session update; idempotent quest seed; combined profile+quest select; active top-20 query; closed top-20 query that also determines current-user eligibility). Before it had 8 statements; removed three by combining session lookup/CSRF rotation, profile/quest read, and closed leaderboard/eligibility.
- Game lifecycle: 2 API Worker requests per run (start/end); gameplay has zero API requests, zero parent React updates per input, and zero Neon calls. The end response includes current profile/quests, removing two GET requests and 4 SQL statements compared with completion followed by `/api/me` and `/api/quests`. Request body remains capped at 128 KB; inputs capped at 2,000.
- Quest claim: 1 POST, with a CSRF/session query plus one atomic SQL claim/wallet/leaderboard transaction (2 SQL statements). Returned claim state removes the previous two GETs/four SQL statements. Reward details save: 1 POST and one update statement after auth; response returns the saved values, avoiding two old GETs/four SQL statements.
- Reward redemption remains one explicit mutation; no inventory polling. The transaction keeps row lock, threshold check and `SKIP LOCKED`; email stays disabled. No provider polling exists.
- Leaderboards are top-20 bounded and use `cycle_scores_rank_idx`. Staging EXPLAIN uses that index. Shared public caching was not applied to authenticated/private API responses.
- Worker rate limits configured at API 60/60s and expensive mutation 30/60s. Cloudflare binding accounting is regional/eventually consistent; these are settings, not proven strict global quotas.
- Expo hashed JS/media assets receive one-year immutable caching; the measured 2,162,206-byte JS asset was confirmed HTTP 200 with that header in staging and production. `/api/health` is `no-store`. Static assets use the Worker assets binding; only `/api/*` is configured to run application Worker first.
- Counts above are code-path counts from the implementation and staging flow. No production load test, billable usage measurement, or DAU capacity assertion was made. Neon `pg_stat_statements` is absent, so cumulative query/write telemetry was not available.
