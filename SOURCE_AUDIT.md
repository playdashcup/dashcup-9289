# DASHCUP source audit
Audit date: 2026-10-02

## Frontend
- GitHub repository playdashcup/dashcup-9289 is accessible; audited clean upstream main commit 2a5222980662f416ce4ab064000878a56e26ed3e.
- Next.js 16 App Router and React 19 v0 dashboard is the frontend/design source; static export is configured for Cloudflare Pages.
- public/f50aae93c5fae9b355c1.txt contains the user-provided Hilltop verification token.
- public/sw.js contains the supplied Monetag service-worker settings, Dashcup shell cache, and explicit API/cross-origin request bypass.
- The stable Cloudflare Pages project URL https://dashcup-9289.pages.dev and `www.dashcup.com` return HTTP 200. The `www` CNAME points to the exact Pages project target; public DNS and HTTPS return success.

## Game
- Expo Crossy Road vendored at games/expo-crossy-road with upstream source, README, Bun lock and license.
- Source altered for ChickenDash title, warm material tint, slightly reduced sound playback volume, browser audio enablement and the DASHCUP postMessage bridge.
- Current Expo web export rebuilt successfully into server/game-dist (2.16 MB JavaScript bundle); Expo lint passes with 0 errors and 68 warnings.
- Canonical Bun audit after safe fixes reports 8 advisories (7 high, 1 moderate): unused EAS CLI removed, GSAP upgraded to v3, 99 findings fixed, and compatible overrides resolve PostCSS, node-fetch, and decode-uri-component. Remaining findings include unpatched node-forge, image-size (2.x breaks Metro export), and uuid. CI's audit job reports these findings.
- Worker request handlers cap API bodies at 128 KB and Resend webhook payloads at 64 KB; security digest/signature comparisons use a non-short-circuiting comparison helper.
- Scoreboard remains in the Expo UI. The website passes a server-issued run ID, token, and seed; the iframe validates parent origin/source. The client seed is stored but not passed into Engine or consumed by game logic. No second client run ID is generated. Scores remain pending and award no trophies.
- Random gameplay generation occurs in CrossyGame row type selection, Grass obstacle generation, static/dynamic Water layouts and velocities, Road vehicle count/direction/speed/gaps, Railroad train sizing, and random model selection. CrossyPlayer collision rotations and AudioManager choices also use Math.random. Movement/collision updates advance per render frame; dt is ignored, while movement animation is GSAP-time based. The current event log is insufficient for deterministic server reproduction.
- Structural evidence validation bounds a claimed score by the recorded number of SWIPE_UP inputs, based on the engine's row-score rule. This is a plausibility check only and does not make client scores authoritative.
- Quest definitions and claim path exist, but no progress/completion updates exist. Referral links/association exist; qualification is missing. MyLead start is disabled and no signed callback handler exists.
- Owner states licensing is confirmed. Repository README says the source is for educational purposes and invokes fair use for copyrighted work; the MIT file licenses source code. Neither artifact independently establishes commercial redistribution rights for all included models, images, and audio. Preserve this distinction in release decisions.

## API/database/providers
- Hono Worker and two SQL migrations; staging Neon branch bitter-mode-91626896 / dashcup-staging is ready, base tables and Resend delivery schema verified.
- Worker architecture serves /api/* and game static assets; no D1, Neon Functions, or second API Worker.
- Resend client/template are implemented but sending is gated by server secrets and a verified sender. Current Resend inventory lists dashcup.com as not_started; mail.dashcup.com is not listed.
- MyLead signed conversion callback/account config is not implemented. Monetag user supplied a zone configuration, but live behavior is not independently verified. Hilltop banner placement ID was not provided; no placement is fabricated.
- Cloudflare API now reports the existing zone active, with the assigned nameservers, and no Worker scripts. Pages remains connected and deployed; `www` DNS/HTTPS are verified. `api.dashcup.com` and `game.dashcup.com` DNS records are absent until the single Worker is deployed. Wrangler CLI is unauthenticated. The apex A record points unproxied to `127.0.0.1` and is not considered a verified site route.

## Live deployment recheck (2026-10-02)
- Cloudflare confirms active existing `dashcup.com` zone; existing Pages project `dashcup-9289` has project hostname, apex, and www domains. Apex/www proxied CNAMEs target the existing Pages project. Apex, www, manifest and `/sw.js` returned 200.
- Existing Worker is deployed to staging script `dashcup-9289-staging`, version `6aef8761-d60c-4470-a024-509679ece2b8`; staging Neon secret configured. Production not deployed.
- Staging API/data health, bootstrap/session, quest catalog, leaderboard, referral link, reward status and game assets returned expected responses. CORS/CSRF checks passed; game end remained pending with zero awards.
- Replay assessment remains unchanged: gameplay has multiple unseeded `Math.random` sources, frame/time-dependent movement/collisions, and does not consume the server seed. No deterministic replay is verified.

## Latest staging rate-guard update
- Shared rate-limit decision helper is used by the Worker; added test verifies a rejected binding result returns HTTP 429 with `RATE_LIMITED`. Worker tests now pass 11/11 and Worker typecheck passes.
- Latest redeploy of the existing staging Worker is version `b5015c4f-de67-42ca-96a4-011f7ca301db`; no game assets changed. Staging health confirms `ok=true`, environment `staging`, and database connected. Replay/email flags remain false.
- Live probe saw 140 successful health responses (70 concurrent, 70 sequential), without a 429. Cloudflare documents this binding as per-location/per-machine and permissive/eventually consistent; live throttle outcome remains unverified. No production Worker or DB changes.

## Practical anti-cheat and progression audit — 2026-10-02

- Game end requires an authenticated session, a server-issued run ID/token, token hash match, unexpired and unused run, valid UUID/token format, bounded input count, allowed move enums, ordered timestamps with at least 50 ms spacing, duration no greater than 180 seconds, a forward move, and client score no greater than recorded `SWIPE_UP` inputs.
- Evidence uses a SHA-256 hash. Run token consumption, `game_runs` insertion, and game/PB/referral quest progression run in one Neon statement. Unique run IDs, one-time token consumption, referral referee uniqueness, PB day uniqueness, and conditional referral qualification make duplicate events idempotent.
- Failed run retries are recorded as suspicious with evidence hashes and bounded reason codes. Plain run tokens are not persisted in logs.
- Staging verified daily play, PB, weekly PB-day, and referral progression; duplicate claims are rejected after the first successful claim.
- This only checks plausible client evidence. It does not replay the game engine or establish a trustworthy score. No deterministic replay or perfect score verification is claimed. The browser remains capable of fabricating structurally plausible input evidence; this is a residual risk until a trusted gameplay signal exists.
- Provider-controlled sponsor/PPI/CPA quest events remain disabled without an authenticated provider callback contract. No client endpoint can set provider quest progress.
- Embedded Expo game now suppresses the original promotional/utility game-over footer while the bridge run is active. Standalone source behavior remains intact; the scoreboard and parent controls are retained.

## Live deployment/source status (2026-10-02)

- Existing upstream repo and v0 frontend are retained. Branch `codex/dashcup-rebuild`; baseline before final config/report changes `f307a6298ec09a096593f34d6a7ff6051601a70e`.
- Existing Expo Crossy Road source is exported to Worker assets. Current source/control styling retains scoreboard and Start/Restart/5x Reward; gameplay replay remains nondeterministic because game randomness and movement are not reconstructed from the server seed.
- Production Worker `dashcup-9289`, version `7e3b55c8-c35c-44e9-a204-470e5d91841a`, runs on `api.dashcup.com` and serves game assets on `game.dashcup.com`. Production Neon `bitter-mode-91626896` / `br-purple-river-b4v27of0`: both migrations applied; 17 tables. Existing Pages at apex/www was not rebuilt.
- API/game custom domains resolve via Cloudflare authoritative DNS and 1.1.1.1; the local default resolver still has NXDOMAIN. Existing site and PWA resources return 200.
- Staging integration and validation are recorded in BUILD_REPORT.md. Browser E2E is blocked by Windows CUA startup ACL error. Reward/ad/provider flows and deterministic replay remain disabled/unverified. The canonical Bun audit has 8 known advisories (7 high, 1 moderate).

## Practical anti-cheat implementation update (2026-10-02)

- Existing Expo game and gameplay engine were preserved; no deterministic score simulator was introduced. Existing run evidence capture remains in GameBridge/Expo integration.
- Server now checks evidence shape, initial input transition, move ordering/frequency/density, duration, score/input relationship, score velocity, and server-issued run start time. It hashes submitted evidence and flags repeated suspicious payloads while preserving one-use hashed run tokens, expiry, CSRF and session checks.
- Quest/PB/referral CTE flow remains atomic after plausibility acceptance. Game completion returns `plausibility_checked`; it does not directly award game trophies. Staging referral qualification and progress were exercised.
- Staging anti-cheat Worker version `49ccb780-68e1-49db-b1bf-0bf43ff832b9` is live with 60/min restored. Production still requires deployment of this update. Pages remains untouched; source UI edits are not yet published.

## Production release note (2026-10-02)

- Existing Worker is updated in production at version `5f3cc03f-e822-415a-a097-36de130f6148`, serving API and Expo game assets on the existing domains.
- The strengthened evidence checks from this source audit were staged, tested, then deployed. They provide practical anti-cheat, not exact server-side Crossy Road score reconstruction. Replay remains disabled; verified referrals/quests are tied to plausibility-accepted authenticated sessions.
- Existing Pages output was preserved without rebuild/deploy. Consequently the live frontend may not yet show source-only GameBridge updates such as exact `5x Reward` copy; the Worker/game host itself was verified.

## Resource optimization source audit — 2026-10-02

- Existing component and API architecture retained. Dashboard uses one bootstrap call; an in-flight guard prevents duplicate concurrent bootstrap calls. GameBridge continues to buffer evidence locally and sends a single bounded end-run payload.
- Run completion updates Dashboard profile/quests from the API mutation response and avoids `/api/me` + `/api/quests`. Quest claim updates local server-authoritative state from claim response and avoids refetching me/quests. Reward email update returns saved server values and updates local UI without a follow-up GET.
- Bootstrap now executes 5 SQL statements for a valid existing session: CSRF/session update, idempotent cycle quest seed, combined user/quest snapshot, active top-20 leaderboard, and a closed top-20 leaderboard query which also provides current-user eligibility/redemption status. Static quest metadata remains in `server/src/domain.ts`.
- The previous 8-statement bootstrap is reduced by three: session select plus CSRF update became one update-returning statement; user and quest selects became one snapshot; closed leaderboard and eligibility became a top-20 query. Profile/quest data and public rank data are bounded by the current user and 20 entries.
- Game start/end and claims remain atomic for durable writes; game completion currently performs one post-mutation profile/quest snapshot query to return current state. Input data causes no SQL until game end. SQL statement counts are code-path estimates, as Neon query statistics are unavailable.
- `server/src/security/rate-limit.ts` scopes stricter limiter to expensive mutations; Wrangler config has 30/60s staging and production binding alongside existing 60/60s API binding. No new service.
- `server/game-dist/_headers` and Expo public `_headers` set immutable caching only for hashed JS/media assets. `/api/*` still runs Worker first and receives `no-store`; static asset misses use the existing assets handler.
- No unbounded table read, `SELECT *`, N+1, polling/heartbeat, per-frame game request, new migration, or additional infrastructure was introduced in this pass.

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
