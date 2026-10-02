# DASHCUP blockers and next actions
Updated: 2026-10-02

## Git
- Work is in C:\Users\RYZEN V\Documents\ChatGPT\dashcup\dashcup-9289-main on codex/dashcup-rebuild, based on main 2a5222980662f416ce4ab064000878a56e26ed3e.
- The existing `codex/dashcup-rebuild` branch tracks origin; report updates were pushed and the worktree was clean at final verification. Frontend/Worker checks pass; the canonical Bun audit reports 8 known advisories (7 high, 1 moderate).

## Cloudflare
- The existing `dashcup.com` zone is active in the intended account with `blakely.ns.cloudflare.com` and `norman.ns.cloudflare.com`; no duplicate zone was created.
- Pages project `dashcup-9289` is connected to `codex/dashcup-rebuild`; its stable project URL https://dashcup-9289.pages.dev and `www.dashcup.com` return HTTP 200, as do the manifest and service worker. A proxied CNAME `www.dashcup.com` → `dashcup-9289.pages.dev` is configured; public DNS resolves through Cloudflare.
- Worker scripts list is empty. Local Wrangler reports not authenticated. Staging/production secrets are not configured; Worker-to-Neon and public API/game routes cannot be verified. Authenticate Wrangler with `wrangler login` or configure deployment credentials in the approved deployment environment.
- DNS records for `api.dashcup.com` and `game.dashcup.com` are absent until the single Worker is deployed. The existing apex `dashcup.com` record currently points to unproxied `127.0.0.1`; apex serving/redirect is not verified.
- Staging Wrangler configuration sets `routes: []`; staging and production dry-runs pass locally.

## Provider configuration
- Neon staging `schema_migrations` contains `0001_initial` and `0002_resend_delivery`; production `schema_migrations` relation is absent. Production `DATABASE_URL` Worker secret is not configured.
- Resend account lists only dashcup.com as not_started; mail.dashcup.com is absent. Sender settings are external prerequisites for real reward email; code keeps sending disabled by default.
- MyLead signing key/account/callback is missing, so offer starts and conversions remain disabled.
- Hilltop verification file is present but no ad placement ID exists. Monetag service-worker configuration was supplied; the external script was not independently validated.

## Verification/rights gates
- Deterministic replay implementation and tests remain incomplete. Game can be run only where its asset host is available; the deployed Pages build points to game.dashcup.com, which is not deployed. No score/trophy can be awarded.
- Source audit found the seeded server run is not consumed by game logic; multiple map/vehicle/obstacle sources use Math.random and movement/collisions are frame-dependent. Replacing this with a simplified simulator would violate the guide; port/refactor the actual transitions before enabling replay.
- Quest definitions and claim logic exist, but no event updates quest progress/completion. Referral qualification and signed MyLead conversion callbacks are absent.
- Direct ESLint game check passes with 0 errors and 68 warnings; Expo web export passes (2.16 MB JS). Worker typecheck, 10/10 tests, and staging/production Wrangler dry-runs pass locally. Browser E2E could not start because CUA's trusted Node process exited unexpectedly; local Wrangler remains unauthenticated.
- Canonical Bun audit ran locally and in CI. After safe fixes and compatible overrides, 8 remain: 7 high and 1 moderate. `node-forge` has no published safe release; forcing `image-size` 2.x breaks Metro's asset parser, and uuid remains transitive. Release audit is not clean.
- Owner says the Expo license is confirmed; license/source asset rights were not independently verified. Verify before commercial game/ad deployment.
- No Worker staging smoke test, browser E2E, or API/game production deployment has occurred. Pages production deployment, proxied `www` CNAME, public DNS, and HTTPS 200 have been verified.
- No Worker is present; `api.dashcup.com` and `game.dashcup.com` DNS records remain absent. Zone visibility is fixed. Wrangler CLI still requires authentication for staging deployment.

## Personal actions
- Authenticate Wrangler in the project workspace (or provide deployment credentials through the approved CI environment), then configure staging secrets and deploy/test staging before production. Keep using the existing active zone; do not create a duplicate.
- Add/verify the Resend sending domain and its DNS records later.
- Provide MyLead callback signing/configuration and Hilltop placement ID if those products should serve ads/offers.

## Live continuation state (2026-10-02; authoritative over older status bullets)
- Staging Worker `dashcup-9289-staging` is deployed at https://dashcup-9289-staging.play-dashcup.workers.dev, version `6aef8761-d60c-4470-a024-509679ece2b8`. Wrangler is authenticated. Staging `DATABASE_URL` secret is configured from Neon project `bitter-mode-91626896`, branch `dashcup-staging` (`br-empty-cherry-b4mxu4la`).
- Existing Pages apex and www domains, manifest and service worker return HTTPS 200. Cloudflare confirms active zone, existing Pages project, and proxied apex/www CNAME records to the Pages hostname.
- Staging API smoke passed for health/database, bootstrap/session, me, quests, leaderboard, referral link, reward status, CORS preflight/denial, CSRF rejection and valid-CSRF game start/end; game end is pending and awards zero. `/index.html` and a texture asset return 200. A 70-concurrent plus 70-sequential request probe observed only 200s and no 429; Cloudflare documents this binding as per-location/per-machine and permissive/eventually consistent, so throttling remains unverified.
- Remaining gates: browser E2E (CUA exits on `apply deny-read ACLs`), deterministic replay (server seed unused; random game generation and time-dependent movement), quest/referral progress writers, signed MyLead callbacks, Bun audit triage, production custom domains, production migration/deploy. Do not direct production API/game domains to staging.
- No production database changes or production Worker deploy occurred. No personal Wrangler action is needed for staging.
