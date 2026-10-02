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
