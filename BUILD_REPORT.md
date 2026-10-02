# DASHCUP build report
Updated: 2026-10-02

## Repository
- Source of truth: https://github.com/playdashcup/dashcup-9289, audited from current main at 2a5222980662f416ce4ab064000878a56e26ed3e.
- Working branch: codex/dashcup-rebuild. Preserved c28a7b2 history and pushed follow-ups; latest commit 83d2718ce3b260e6801c1315a6efc912ac527066 is on origin.
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
- Expo lint: PASS (0 errors, 68 warnings); Expo web export: PASS, 2.21 MB JavaScript bundle exported to server/game-dist. Bun 1.4.2 was run via npm exec against the canonical Bun lockfile. `bun audit` after safe in-range fixes and EAS CLI removal reports 14 advisories (10 high, 4 moderate; no critical), so the dedicated CI game-audit job fails pending safe resolution/triage.
- Neon staging: migration versions `0001_initial` and `0002_resend_delivery` confirmed; the expected base schema and delivery-status/webhook tables were verified previously. Production branch is ready but currently has no `schema_migrations` table, so no production schema is deployed.
- GitHub Actions run 36978367485: frontend lint/build PASS; Worker Expo lint/export, typecheck, 10/10 tests, staging dry-run, and production dry-run PASS; canonical Bun audit FAIL for 14 advisories. Vercel status PASS.
- Cloudflare Pages production build and deploy: PASS for source commit 83d2718ce3b260e6801c1315a6efc912ac527066 at https://54b1f03c.dashcup-9289.pages.dev. `www.dashcup.com` is active and both hostnames returned HTTP 200.
- `www.dashcup.com` is active in Cloudflare Pages and returns HTTP 200 over HTTPS. No API Worker is deployed, so API/game custom domains are not serving this application.
- GameBridge buffers move evidence synchronously and ignores duplicate finish messages for a run. The server checks claimed score against recorded forward inputs rather than an arbitrary score-per-second ceiling; this remains a plausibility check, not deterministic replay.
- No browser E2E, Worker staging deployment, or live API endpoint verification has been performed. CUA browser launch exited with the workspace ACL startup error; api.dashcup.com and game.dashcup.com fail DNS lookup, and the game host is not deployed.
- Source re-audit confirmed the Expo seed is received but unused by gameplay. Random row types, obstacles, cars, trains, logs, model variants, and frame-driven collision/movement transitions remain nondeterministic. `/api/game/end` deliberately records suspicious pending runs and awards zero.
- Quest catalogue and claim locking exist, but no code updates quest progress/completion. Referral association exists, but referral qualification is absent. Sponsor/PPI/CPA progression remains disabled without signed provider callbacks.
- Repository README says the vendored source is for educational purposes and says copyrighted game work is used under fair use; LICENSE covers source code. It does not establish redistribution rights for bundled artwork/audio. The owner says licensing is confirmed; that separate permission has not been inspected.
- Canonical Bun audit is not clean: 14 remaining advisories (10 high, 4 moderate). Direct GSAP was upgraded to v3 and 99 issues were removed by safe updates/removing unused EAS CLI. Remaining reports include node-forge with no published safe version, and image-size, node-fetch, and PostCSS blocked by dependency ranges.

## Deployment
The Pages production build and `www.dashcup.com` are available and verified. The connected Cloudflare account currently returns no zone for `dashcup.com` and lists no Worker scripts; local Wrangler is unauthenticated. Staging Worker deployment, Worker secrets, quest progression, replay, and staged smoke tests remain outstanding. See DEPLOYMENT.md and BLOCKERS.md.
