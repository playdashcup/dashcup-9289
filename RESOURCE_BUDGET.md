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

## Resource optimization continuation — 2026-10-02

- Fixed stale quest progress in `/api/game/end` responses. PostgreSQL data-modifying CTEs share one statement snapshot, so reading the quest table again inside that same statement returned old values even though the update persisted. The response now uses `RETURNING` rows from play, personal-best, and referral quest mutations, and reads unchanged quests from storage. The lifecycle remains one `/api/game/start` plus one `/api/game/end` request.
- Staging Worker `dashcup-9289-staging` version `7eb1ded5-3677-4473-8d27-20f6e60a95c9` passed a live session flow: bootstrap returns nine quests; missing CSRF is rejected (403); valid game start/end returns plausibility-checked score and immediate `play_1` progress `1/1`; atomic claim awards 100 once; duplicate claim and duplicate run return 409; quests, leaderboard, referral-link, and reward-status reads return 200.
- Promoted the same Worker source to existing production Worker `dashcup-9289`, version `6eb7c18a-cedc-4382-846a-43b0733a7718`. Production Neon migrations `0001_initial` and `0002_resend_delivery` were verified before deploy. No schema change or additional Cloudflare resource was made.
- Production HTTP checks: `dashcup.com`, `www.dashcup.com`, manifest, and `sw.js` return 200; API health returns 200 with database connected; game host/root and Expo JavaScript bundle return 200; the 2,162,206-byte hashed JS bundle uses one-year immutable caching; credentialed CORS allows both website origins and denies an unlisted origin; anonymous game start is rejected (403). Existing Pages was not rebuilt or deployed.
- Worker tests 12/12, Worker typecheck, frontend lint/build, and staging plus production Wrangler dry-runs pass. Browser E2E remains unavailable in this workspace: Playwright is not installed and the in-app browser/Windows browser runtime is unavailable.
- Release limitations remain: replay is intentionally not a release requirement and client scores are only plausibility-checked; game trophies remain zero; rewarded ads, Resend delivery, and MyLead/Hilltop rewards remain disabled pending trusted provider configuration. Canonical Expo Bun audit remains 8 advisories (7 high, 1 moderate); frontend dependency audit findings remain unresolved. No production DAU/cost capacity claim is made.

## Frontend polish and game-launch fix — 2026-10-02

- Added the requested referrer metadata: `no-referrer-when-downgrade`; generated export was checked and contains the exact tag.
- Updated the existing DASHCUP dashboard and ChickenDash control shell to the requested Playful Pop direction: navy/indigo gradients with cyan, pink and lime accents, tactile outlined surfaces, soft bevel shadows, rounded arcade buttons and clearer game-ready/loading feedback. Existing game and scoreboard remain intact; the disabled `5x Reward` control remains UI only.
- Investigated the reported Start issue. The production game accepts `www.dashcup.com` as its parent origin but not the apex host. Added a Cloudflare 302 redirect rule (ruleset `634c8942a94a4d50abf03a317f8c4a2a`) from `dashcup.com` to `www.dashcup.com`, preserving path and query. Live checks confirmed the apex, query, and manifest redirect correctly. No Worker, database, or game bundle deployment was made.
- The parent message listener now installs in a layout effect so it is ready before the embedded game's startup message, and a 10-second timeout displays a recovery message if the game does not acknowledge the run.
- Frontend lint/build passed; the generated static HTML contains the exact referrer tag. Worker tests (12/12), typecheck and production dry-run pass; Worker source did not change.
- A Pages deployment is warranted for this frontend change and will be triggered by the pushed frontend commit. Browser E2E remains unavailable; no visual/gameplay E2E pass is claimed.

## Final polish publication verification — 2026-10-02

- Frontend source commit `5de96b3951524d6f9b3a791cd57af4c8563a43ab` is deployed by the existing Cloudflare Pages project. Deployment `0695a61c-75b5-4c49-8d9c-6e95be52f9a1` completed all build/deploy stages successfully and retains the existing apex and `www` aliases.
- Live `www.dashcup.com` returns the exact `no-referrer-when-downgrade` meta tag; its loaded Next.js client bundle includes `ChickenDash`, `5x Reward`, and the loading recovery message. The apex returns 302 to `https://www.dashcup.com/` and preserves URL path/query.
- Production Worker remains `6eb7c18a-cedc-4382-846a-43b0733a7718`; no Worker, database, or game asset was rebuilt for this frontend publish. The apex redirect is a zone redirect rule.
- Bun 1.4.2 audit was rerun against the canonical Expo lock: 8 advisories (2 image-size high, 5 node-forge high, 1 uuid moderate). `bun audit fix --dry-run` fixed 0/8 because image-size/uuid updates exceed dependency ranges and node-forge has no fix available to Bun's audit resolver. No lockfile changes were made.
- Browser E2E remains unverified: Playwright is absent from the project and desktop browser startup previously failed with the ACL error. The live click-to-start sequence is not claimed as browser-tested.

## Current request cost impact (2026-10-02)

- The game still makes one API request at start and one bounded request at end; iframe readiness retries use only same-page `postMessage`, with no network/polling calls.
- Trophy wallet and active-cycle leaderboard credits now share the existing game-end SQL statement with run consumption and quest/referral progression. No additional Worker invocation or schema migration was added.
- Quest claim feedback uses local CSS/Web Audio and adds zero provider, Worker, or Neon calls.

## Post-release resource check (2026-10-02)

- Pages commit `19e1a7e` and Worker version `b38fe224-1a9f-4c2d-b319-6f1abd253587` are live. No architecture resource was added.
- Active play adds no network calls: handshake retries are iframe `postMessage`. Session lifecycle remains one start request and one end request.
- Game score wallet credit, leaderboard upsert, quest/referral changes and one-use run consumption share the existing end SQL statement. Staging score/leaderboard request confirmed 1→1. Quest animation/audio is local-only.
- No workload/cost benchmark or production synthetic scoring test was run.

## Launch repair resource impact (2026-10-03)

- Added an AbortController timeout to the existing request helper and a 12-second cap for game start; this adds no request.
- Handshake retries remain same-page `postMessage` until one acknowledgement. No extra Worker calls, Neon writes, polling, or gameplay heartbeats were added.
- Web audio waits for the first real gesture inside the iframe, avoiding repeated denied playback attempts. No provider calls are involved.
- Lifecycle remains one game-start API request and one bounded game-end request. Worker tests remain 12/12; no workload cost benchmark was run.

## Hilltop VAST pacing (2026-10-03)

- The provided Hilltop VAST feed is requested through the Google IMA HTML5 SDK only after every 15th successful `/api/game/end` response. The SDK loader and VAST request are lazy; no ad SDK request occurs during normal gameplay.
- Accepted-run frequency is stored in browser `localStorage` (with an in-memory page-session fallback). This is only ad pacing, is not identity/progression, and is not used to grant trophies or rewards. The interval is per browser profile, not account-wide.
- This adds no Worker calls, Neon queries/writes, API endpoints, database objects, dependencies, or infrastructure. Each due ad attempt does incur third-party IMA/VAST network requests.
- `pnpm lint` and `pnpm build` pass for this frontend change. No live ad playback, fill, or revenue was verified.

## Lightweight anti-cheat resource impact (2026-10-03)

- Client monitoring runs only on existing key/input, score-update, game-state, focus, and visibility events; no frame polling, DOM scans, debugger loop, or during-play API request was added.
- The existing game-end request now carries a small capped telemetry object. The Worker stores recognized flags in the existing one-use session update; there is no additional query, write, migration, endpoint, binding, provider call, or infrastructure resource.
- Game lifecycle remains one start request and one bounded end request. Telemetry evidence remains capped by the existing 2,000 input limit.
- No CPU/DAU load benchmark was run; no quantitative resource capacity claim is made.

## Quest update and current request budget (2026-10-03)

- Quest catalog changes are server-side and add no API calls, database objects, Worker bindings, or provider calls. Migration `0005_quest_rewards_and_score_100` updates only unclaimed rows; claimed trophy awards are preserved. It has been applied and verified on staging and production.
- Observed from source paths: bootstrap = one Worker request and five SQL statements for an existing session; start = one Worker request/two SQL statements; accepted game end = one Worker request/two SQL statements; quest claim = one Worker request/two SQL statements. Active gameplay between start/end has zero network calls and zero Neon queries. Exceptional invalid/suspicious runs can perform extra logging writes.
- A normal game therefore consumes approximately two Worker invocations and four SQL round trips. For 100 validated runs per DAU/day this is approximately 200 requests and 400 SQL round trips per DAU/day, excluding bootstrap/claims and exceptional paths. At 10,000 DAU that is ~2M Worker requests/~4M SQL round trips daily; at 50,000 it is ~10M/~20M. These are source-based projections only, not measured load or a capacity guarantee.
- The attached optimization request's once-daily client aggregate sync was not implemented: aggregating client-asserted runs would bypass the existing per-run server-issued token/evidence/duplicate checks unless redesigned with a secure bounded token-grant protocol and thorough interruption/retry/multi-device tests. Retained one start + one end request to preserve the current practical anti-cheat contract.
- Neon `pg_stat_statements` is not installed, so live query counters are unavailable without a database extension change. No extension was installed and no additional infrastructure was introduced.
- Staging deployment for this update: `c7892e5b-a092-46ff-be2d-0807088d9ffc`; staging bootstrap and Neon connectivity verified. Worker tests 17/17, typecheck, frontend lint/build, and Wrangler staging/production dry-runs pass. No resource benchmark was run.

## Reward inventory/admin request budget — 2026-10-03

- Public bootstrap still uses its existing SQL snapshot statement; the five reward-stock counts are a subquery in that snapshot, so they add no Neon round trip. No recurring poll was added.
- Reward detail save/verification is one existing mutation request and one user-row transaction; it calls Resend only when a new verification token is issued and the configured delivery flag/provider credentials are present. Known rejection clears that token for a deliberate retry; a network ambiguity stays pending. Reward redemption remains one API request with one atomic allocation statement before the one provider call; webhook delivery is provider-triggered, not polled.
- Admin inventory view is one bounded query over exactly 100 slots; delivery history is one query limited to 100 rows. A slot import uses one atomic encrypted insert/slot assignment plus one audit-log write. Admin session/login adds only on portal usage. No new service, Worker, database, cache, or dependency was added.
- Static asset routing now sends `/`, `/index.html`, and `/api/*` through the existing Worker so it can serve the separate admin host and APIs. This causes a lightweight Worker invocation for the game host's root HTML request; the remaining 196 game assets retain the asset fast path. No Neon query is made for game assets.
- Inventory and mail are disabled at production runtime until configuration; no provider calls or code inventory currently exist. Tests/builds and smoke checks do not quantify production cost or validate 10k–50k DAU capacity.

## CPAlead offer feed — 2026-10-03

- Sponsor offers are embedded in the existing bootstrap/quests response: 0 extra Worker invocations and 0 additional Neon reads per normal view. The Worker caches the narrow CPAlead feed for 10 minutes in its isolate and Cloudflare cache, coalesces simultaneous misses, and uses no polling. A cold cache/colo may make one CPAlead request; repeated warm views do not.
- An offer click adds one authenticated start request and one attribution insert into the existing click table. A qualifying callback adds one provider HTTP request (CPAlead → existing Worker) and one atomic Neon statement to dedupe the lead and progress both sponsor quests. No new database, service, Worker, binding, or package was added.
- Gameplay traffic remains unchanged: the feed is only loaded by the existing dashboard/quests response, never during ChickenDash gameplay.

## Biweekly score/claim update — 2026-10-04

- No API request or database round-trip was added. Bootstrap reuses its existing combined leaderboard query to supply the current-cycle trophy total and reward-window metadata. `/api/me` reads cycle score through a left join in its existing query.
- Quest claims removed the redundant user-wallet update and atomically upsert the current biweekly score in the existing claim statement. Game completion reads the resulting cycle score from its existing statement. The 14-day window is computed in Worker code and adds no Neon query.

## Ad and spawn follow-up — 2026-10-04

- River log spawning is local game logic only. No API endpoint, Worker request, Neon query, or write was added.
- Hilltop push and page-level video-slider loaders were removed because they could intercept app navigation. The existing inline banner loads only inside its Arcade placement. The existing VAST flow still requests an ad once per 10 server-accepted runs; tapping Play ad starts the already-requested creative and adds no app API/database call.

## Ad and game UI follow-up — 2026-10-04

- Removed the Hilltop banner loader and Monetag external service-worker import, reducing third-party browser loads and avoiding navigation-level ad handlers. The existing VAST overlay remains one provider request per 10 accepted runs; no per-frame or game API traffic was added.
- Increased mobile game viewport height via CSS aspect ratio only. No Worker invocation, Neon read/write, or API endpoint was added.

## Arcade ad slot restoration — 2026-10-04

- The supplied ad script now loads lazily inside one Arcade-only iframe; non-Arcade sections do not mount it. Script activity is confined to that frame. It adds provider browser traffic only when the Arcade ad slot is visible; no DASHCUP Worker request, Neon query/write, API endpoint, package, or infrastructure is added.
- The VAST player is requested at each 10th completed run and can also be opened from the visible ChickenDash video-ad control. It issues only the existing third-party VAST/IMA requests, never gameplay API traffic. Ad state does not affect rewards.
- The local run counter controls ad pacing only. Browser storage is not used for identity, score, trophies, quest progress, or redemption.
