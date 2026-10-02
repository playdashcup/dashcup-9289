# DASHCUP build report
Updated: 2026-10-02

## Repository
- Source of truth: https://github.com/playdashcup/dashcup-9289, audited from current main at 2a5222980662f416ce4ab064000878a56e26ed3e.
- Working branch: codex/dashcup-rebuild, clean and pushed to origin. Latest verified HEAD: a3f551fce895272ad3d34f5ef86a03116bd5a5e6. Implementation commit: 799d6581af06b1bfd2368d4b7fe0a6ffc52367d8.
- Existing v0 Next.js frontend remains the source of the website design.
- Expo Crossy Road source is integrated under games/expo-crossy-road and branded ChickenDash. The owner confirmed licensing in chat; bundle redistribution rights have not been independently audited.

## Implemented in this worktree
- Next.js static Pages export; ESLint configuration, CI workflow, Worker API foundation, Neon initial schema, PWA manifest/service worker, reports.
- Server sessions, HTTP-only cookie, CSRF, CORS allow list, Worker rate limit, evidence limits/hash, honeypot, suspicious-run logging, quest/leaderboard/referral read/claim endpoints.
- Game iframe bridge, ChickenDash title, scoreboard, simplified Start/Restart controls, disabled 5x Reward Ad button, light texture tint and audio level adjustment. GAME_REPLAY_ENABLED remains false and unverified game scores award no trophies.
- AES-256-GCM reward-code helper, authenticated server-side inventory import route, atomic stock reservation, Resend send client/template, delivery/idempotency states, email change limit and status endpoint. Sending is off unless explicit environment configuration enables it.
- Hilltop verification token copied to public/f50aae93c5fae9b355c1.txt; supplied Monetag service-worker configuration merged with offline shell cache while the local handler bypasses /api and cross-origin requests.

## Checks
- Frontend lint: PASS after final frontend copy changes.
- Frontend production build: PASS after final frontend copy changes.
- Worker unit tests: PASS, 8/8 including Resend idempotency, template escaping, rejection and network ambiguity cases.
- Worker TypeScript: PASS after reward, webhook and inventory changes.
- Wrangler deploy dry run: PASS after final Worker/game export; 196 assets read, 300.86 KiB total / 78.70 KiB gzip.
- Expo web export: PASS using Expo CLI; 2.22 MB JavaScript bundle exported to server/game-dist. Direct ESLint: 0 errors, 68 warnings. Expo lint wrapper selects Bun, which is unavailable locally.
- Neon staging: 16 base tables plus migration 0002 delivery-status columns and webhook table verified.
- Cloudflare Pages production build and deploy: PASS for commit a3f551fce895272ad3d34f5ef86a03116bd5a5e6 at https://ecd3c2ea.dashcup-9289.pages.dev. GitHub combined status reports Vercel success for this commit.
- Pages custom domain www.dashcup.com remains pending because Cloudflare reports “CNAME record not set”. No API Worker is deployed, so API/game custom domains are not serving this application.
- No browser E2E, Worker staging deployment, or live API endpoint verification has been performed.
- Alternate local npm dependency resolution for Expo reported 42 audit findings (1 critical, 18 high, 22 moderate, 1 low); canonical Bun-lockfile audit remains pending.

## Deployment
The Pages production build is available at the deployment URL above, while the custom domain remains pending. Cloudflare zone activation, authenticated Worker deployment, Worker secrets, and staged smoke tests remain outstanding. See DEPLOYMENT.md and BLOCKERS.md.
