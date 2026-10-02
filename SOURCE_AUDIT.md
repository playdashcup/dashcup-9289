# DASHCUP source audit
Audit date: 2026-10-02

## Frontend
- GitHub repository playdashcup/dashcup-9289 is accessible; audited clean upstream main commit 2a5222980662f416ce4ab064000878a56e26ed3e.
- Next.js 16 App Router and React 19 v0 dashboard is the frontend/design source; static export is configured for Cloudflare Pages.
- public/f50aae93c5fae9b355c1.txt contains the user-provided Hilltop verification token.
- public/sw.js contains the supplied Monetag service-worker settings, Dashcup shell cache, and explicit API/cross-origin request bypass.
- Cloudflare Pages deployment for report commit `307244bfff1f277e52267bd01a5f653eeecdbbe7` succeeded at https://30640269.dashcup-9289.pages.dev. The `www` CNAME points to the exact Pages project target; public DNS and HTTPS return success.

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
