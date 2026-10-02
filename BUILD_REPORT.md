# DASHCUP build report
Updated: 2026-10-02

## Repository
- Source of truth: https://github.com/playdashcup/dashcup-9289, audited from current main at 2a5222980662f416ce4ab064000878a56e26ed3e.
- Working branch: codex/dashcup-rebuild. Implementation commit: 799d6581af06b1bfd2368d4b7fe0a6ffc52367d8. Latest tested source commit: c28a7b28765b3c29d1c4f46d42eb0a67e20b5a14, pushed and verified on origin.
- Existing v0 Next.js frontend remains the source of the website design.
- Expo Crossy Road source is integrated under games/expo-crossy-road and branded ChickenDash. The owner confirmed licensing in chat; bundle redistribution rights have not been independently audited.

## Implemented in this worktree
- Next.js static Pages export; ESLint configuration, CI workflow, Worker API foundation, Neon initial schema, PWA manifest/service worker, reports.
- Server sessions, HTTP-only cookie, CSRF, CORS allow list, Worker rate limit, evidence limits/hash, honeypot, suspicious-run logging, quest/leaderboard/referral read/claim endpoints.
- Game iframe bridge, ChickenDash title, scoreboard, simplified Start/Restart controls, disabled 5x Reward Ad button, light texture tint and audio level adjustment. GAME_REPLAY_ENABLED remains false and unverified game scores award no trophies.
- AES-256-GCM reward-code helper, authenticated server-side inventory import route, atomic stock reservation, Resend send client/template, delivery/idempotency states, email change limit and status endpoint. Sending is off unless explicit environment configuration enables it.
- Worker-wide 128 KB API and 64 KB Resend webhook body caps; fixed-time comparison helper for CSRF/admin digests and Resend signatures.
- Hilltop verification token copied to public/f50aae93c5fae9b355c1.txt; supplied Monetag service-worker configuration merged with offline shell cache while the local handler bypasses /api and cross-origin requests.

## Checks
- Frontend lint: PASS after final frontend copy changes.
- Frontend production build: PASS after final frontend copy changes.
- Worker unit tests: PASS, 10/10 including body-limit streamed request checks, fixed-time comparison, malformed evidence, quest catalog, AES-GCM and Resend idempotency/outcomes.
- Worker TypeScript: PASS after reward, webhook and inventory changes.
- Wrangler production and staging dry runs: PASS; each read 196 assets (303.87 KiB / 79.45 KiB gzip). CI now runs both environment dry-runs. An initial staging dry run exposed inherited production domains; `routes: []` is now set in staging and the repeat dry run reports no inherited routes.
- Expo web export: PASS using Expo CLI; 2.22 MB JavaScript bundle exported to server/game-dist. Direct ESLint: 0 errors, 68 warnings. Expo lint wrapper selects Bun, which is unavailable locally.
- Neon staging: migration versions `0001_initial` and `0002_resend_delivery` confirmed; the expected base schema and delivery-status/webhook tables were verified previously. Production branch is ready but currently has no `schema_migrations` table, so no production schema is deployed.
- Cloudflare Pages production build and deploy: PASS for source commit c28a7b28765b3c29d1c4f46d42eb0a67e20b5a14 at https://89448680.dashcup-9289.pages.dev. GitHub combined status reports Vercel success for this commit.
- `www.dashcup.com` is active in Cloudflare Pages and returns HTTP 200 over HTTPS. No API Worker is deployed, so API/game custom domains are not serving this application.
- GameBridge buffers move evidence synchronously and ignores duplicate finish messages for a run. The server checks claimed score against recorded forward inputs rather than an arbitrary score-per-second ceiling; this remains a plausibility check, not deterministic replay.
- No browser E2E, Worker staging deployment, or live API endpoint verification has been performed. CUA browser launch exited unexpectedly with the workspace ACL startup error; the game host is not deployed.
- Source re-audit confirmed the Expo seed is received but unused by gameplay. Random row types, obstacles, cars, trains, logs, model variants, and frame-driven collision/movement transitions remain nondeterministic. `/api/game/end` deliberately records suspicious pending runs and awards zero.
- Quest catalogue and claim locking exist, but no code updates quest progress/completion. Referral association exists, but referral qualification is absent. Sponsor/PPI/CPA progression remains disabled without signed provider callbacks.
- Repository README says the vendored source is for educational purposes and says copyrighted game work is used under fair use; LICENSE covers source code. It does not establish redistribution rights for bundled artwork/audio. The owner says licensing is confirmed; that separate permission has not been inspected.
- Alternate local npm dependency resolution for Expo reported 42 audit findings (1 critical, 18 high, 22 moderate, 1 low); canonical Bun-lockfile audit is now a CI step and its result is pending a run on the updated commit.

## Deployment
The Pages production build and `www.dashcup.com` are available and verified. The connected Cloudflare account currently returns no zone for `dashcup.com` and lists no Worker scripts; local Wrangler is unauthenticated. Staging Worker deployment, Worker secrets, quest progression, replay, and staged smoke tests remain outstanding. See DEPLOYMENT.md and BLOCKERS.md.
