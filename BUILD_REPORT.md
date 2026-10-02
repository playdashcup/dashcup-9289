# DASHCUP build report
Updated: 2026-10-02

## Repository
- Source of truth: https://github.com/playdashcup/dashcup-9289, audited from current main at 2a5222980662f416ce4ab064000878a56e26ed3e.
- Working branch: `codex/dashcup-rebuild`; HEAD `4867d653ed251b55549aed03b6751cfe5906bbc2` is pushed to origin. The worktree was clean at the start of this continuation; generated dependencies/assets were rebuilt from locked sources.
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
- Rechecked locally on 2026-10-02 after repairing a broken generated `server/node_modules`: Worker tests 10/10, TypeScript, staging dry-run and production dry-run PASS. Dry-runs read 196 assets (303.87 KiB / 79.45 KiB gzip). Local Wrangler authentication check reports unauthenticated.
- Rechecked locally: root frontend lint/build PASS. Game ESLint direct run PASS (0 errors, 68 warnings); Expo web export PASS at 2.16 MB. Expo CLI's lint launcher printed that `bun` is not in PATH, so direct ESLint was used for the local result. Canonical Bun audit was not rerun in this continuation; latest CI/report state remains 8 findings (7 high, 1 moderate).
- Wrangler production and staging dry runs: PASS; each read 196 assets (303.87 KiB / 79.45 KiB gzip). CI now runs both environment dry-runs. An initial staging dry run exposed inherited production domains; `routes: []` is now set in staging and the repeat dry run reports no inherited routes.
- Expo lint: PASS (0 errors, 68 warnings); Expo web export: PASS, 2.16 MB JavaScript bundle exported to server/game-dist. Bun 1.4.2 was run via npm exec against the canonical Bun lockfile. `bun audit` after safe updates, compatible overrides and EAS CLI removal reports 8 advisories (7 high, 1 moderate; no critical). The CI game-audit job reports these remaining advisories.
- Neon staging: migration versions `0001_initial` and `0002_resend_delivery` confirmed; the expected base schema and delivery-status/webhook tables were verified previously. Production branch is ready but currently has no `schema_migrations` table, so no production schema is deployed.
- GitHub Actions run 36979194379: frontend lint/build PASS; Worker Expo lint/export, typecheck, 10/10 tests, staging dry-run, and production dry-run PASS; canonical Bun audit reports 8 advisories. Vercel status PASS.
- Cloudflare zone `dashcup.com` is now active on the assigned nameservers. Latest Pages deployment for HEAD succeeded at https://a5a0728c.dashcup-9289.pages.dev. Added the exact project-target proxied CNAME for `www`; public DNS resolution and HTTPS return 200.
- `www.dashcup.com` is active in Cloudflare Pages and returns HTTP 200 over HTTPS. No API Worker is deployed, so API/game custom domains are not serving this application.
- GameBridge buffers move evidence synchronously and ignores duplicate finish messages for a run. The server checks claimed score against recorded forward inputs rather than an arbitrary score-per-second ceiling; this remains a plausibility check, not deterministic replay.
- No browser E2E, Worker staging deployment, or live API endpoint verification has been performed. CUA browser launch exited because its trusted Node process unexpectedly exited. Wrangler requires authentication. `api.dashcup.com` and `game.dashcup.com` DNS records remain absent, and the game host is not deployed.
- Source re-audit confirmed the Expo seed is received but unused by gameplay. Random row types, obstacles, cars, trains, logs, model variants, and frame-driven collision/movement transitions remain nondeterministic. `/api/game/end` deliberately records suspicious pending runs and awards zero.
- Quest catalogue and claim locking exist, but no code updates quest progress/completion. Referral association exists, but referral qualification is absent. Sponsor/PPI/CPA progression remains disabled without signed provider callbacks.
- Repository README says the vendored source is for educational purposes and says copyrighted game work is used under fair use; LICENSE covers source code. It does not establish redistribution rights for bundled artwork/audio. The owner says licensing is confirmed; that separate permission has not been inspected.
- Canonical Bun audit is not clean: 8 advisories (7 high, 1 moderate). Direct GSAP was upgraded to v3, unused EAS CLI was removed, and 99 issues were fixed by safe updates. Compatible overrides resolved PostCSS, node-fetch, and decode-uri-component advisories. Remaining reports include node-forge with no published safe version, image-size 2.x (incompatible with Expo Metro asset parsing), and uuid.

## Deployment
The Pages production build and `www.dashcup.com` are available and verified. The existing Cloudflare zone is active and its `www` CNAME is configured, but no Worker is deployed and local Wrangler is unauthenticated. Staging Worker deployment, Worker secrets, quest progression, replay, and staged smoke tests remain outstanding. See DEPLOYMENT.md and BLOCKERS.md.
