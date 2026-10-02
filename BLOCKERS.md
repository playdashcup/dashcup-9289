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

## Latest staging rate-guard update
- Shared rate-limit decision helper is used by the Worker; added test verifies a rejected binding result returns HTTP 429 with `RATE_LIMITED`. Worker tests now pass 11/11 and Worker typecheck passes.
- Latest redeploy of the existing staging Worker is version `b5015c4f-de67-42ca-96a4-011f7ca301db`; no game assets changed. Staging health confirms `ok=true`, environment `staging`, and database connected. Replay/email flags remain false.
- Live probe saw 140 successful health responses (70 concurrent, 70 sequential), without a 429. Cloudflare documents this binding as per-location/per-machine and permissive/eventually consistent; live throttle outcome remains unverified. No production Worker or DB changes.

## Continuation blockers — 2026-10-02

- Browser E2E remains blocked: the single permitted retry exited before browser setup with `windows sandbox failed: helper_unknown_error: apply deny-read ACLs`. HTTP integration checks were used; no browser result is claimed.
- Public `api.dashcup.com` and `game.dashcup.com` currently fail DNS resolution. Add the exact Worker custom-domain records/configuration after production release gates are met; no target was fabricated.
- Production Neon is not migrated and the production Worker is not deployed. The staging API flow is now verified for practical evidence checks, play/PB progress, referral qualification, and duplicate claims. Continue remaining security/integration gates before production.
- Production game UI has not been refreshed: the existing source now says `5x Reward`, but Pages was intentionally not rebuilt. Current published frontend still reflects its previous build.
- MyLead PPI/CPA and sponsor quest completion remain disabled until the actual callback verification contract and credentials are available. Hilltop remains disabled without a real banner placement ID. Monetag configuration is present but live behavior has not been verified.
- Resend reward delivery remains disabled until the sending domain/sender, Worker secrets, webhook signing, and a controlled send are verified in the connected account.
- Canonical Bun audit was not rerun in this continuation because dependency manifests and `bun.lock` were unchanged. Existing reviewed state remains 8 findings (7 high, 1 moderate); the remaining findings and Expo compatibility constraints are recorded above.
- Deterministic replay is explicitly not required for this release. Scores are only plausibility-checked against bounded input evidence; this does not prove the actual game score.
- Production schema migration and production Worker release remain pending. Neon’s migration workflow requires explicit user approval after reviewing its prepared production migration; no production data/schema has been changed.
- Production migration preflight: production Neon branch `br-purple-river-b4v27of0` was read and is empty (no tables). The connected Neon `prepare_database_migration` tool rejected the existing combined `0001_initial.sql` + `0002_resend_delivery.sql` script with `INVALID_ARGUMENT: unterminated dollar-quoted string` at `record_reward_email_change()`; no production schema was changed. This tool requires user approval before its production apply step. Do not use an alternate direct production SQL path without that approval.

## Current blockers and release boundaries (2026-10-02)

- **Local DNS cache/resolver convergence:** Cloudflare authoritative and 1.1.1.1 queries resolve `api.dashcup.com` and `game.dashcup.com` to Cloudflare proxy addresses, and their TLS Worker routes return HTTPS responses when tested through the resolved Cloudflare edge. This workstation's default resolver still reports NXDOMAIN after cache flush. No DNS record needs to be fabricated; recheck the local resolver later.
- **Browser E2E:** the one allowed retry failed before browser startup with `windows sandbox failed: helper_unknown_error: apply deny-read ACLs`. HTTP integration checks were used; browser behavior is not verified.
- **Rate limiting:** the Worker has a 60-per-60-second Cloudflare binding and a unit test for 429 handling; live threshold behavior has not been proven (previous 140-request probe returned no 429).
- **Game score integrity:** replay is not deterministic or implemented. Evidence is plausibility-checked only; keep `GAME_REPLAY_ENABLED=false` and do not make unverified client score authoritative.
- **Frontend publish:** Pages remains the existing source of truth and was not rebuilt/deployed. The requested `5x Reward` source text is therefore not confirmed live.
- **External providers:** Resend delivery, rewarded ads, MyLead conversions and Hilltop placements remain disabled until verified sender/secrets, trusted ad callback, and provider credentials/placement configuration exist. Do not invent values.
- **Dependency audit:** canonical Bun audit remains 8 known advisories (7 high, 1 moderate); Bun is unavailable in the present local validation setup. No npm substitute is claimed as the canonical audit.
- Production Neon migrations are approved, applied and verified; the existing production Worker is deployed. These are no longer blockers. Staging remains `https://dashcup-9289-staging.play-dashcup.workers.dev`, version `c7d9b2d7-e0a5-40d3-8c8d-af4652864849`.


## Resend verification clarification (2026-10-02)
- Connected Resend domain list contains dashcup.com only, with status 
ot_started; mail.dashcup.com is not listed. No verified sender domain was confirmed, and production reward delivery remains disabled. The account owner should add/verify the intended sending subdomain and configure its exact DNS records before enabling delivery.


## Current release gates after anti-cheat update (2026-10-02)

- Staging passed anti-cheat flow checks: bad score velocity 422, mismatched server duration 409, plausible score accepted as plausibility-checked with zero immediate trophies, duplicate run 409, no-session/missing-CSRF 403, and valid referral progression. Suspicious evidence including recurrence is recorded in staging Neon.
- A temporary five-request/60-second staging rate limit produced 429; staging is restored to the configured 60 requests/60 seconds. Cloudflare documents Worker rate counters as location-local/eventually consistent, so this protects against casual bursts but is not strict global accounting.
- Production Worker source is ready for deploy after the passing staging suite. Production Neon already has both existing migrations and 17 tables. Do not change schema for this release update.
- Remaining: production Worker release/smoke; browser E2E unavailable due CUA startup ACL; canonical Bun audit remains 8 known advisories (7 high, 1 moderate); live frontend still has not received source-only GameBridge button copy because Pages was not redeployed; Resend/ad/provider features remain disabled until verified configuration.
- Replay is explicitly out of scope as a release blocker. Scores are never described as perfectly server-reproduced.

## Production anti-cheat rollout complete (2026-10-02)

- Existing production Worker now runs practical anti-cheat update `5f3cc03f-e822-415a-a097-36de130f6148`, deployed after staging checks passed. Production health, DB connectivity, allowed/disallowed CORS, no-session rejection, game HTML and full game JS asset are verified.
- No additional Neon migration was required. `GAME_REPLAY_ENABLED=false`; exact deterministic replay remains out of scope for this release.
- Remaining release limitations: browser E2E CUA startup ACL; canonical Bun audit 8 known advisories; published Pages was intentionally not rebuilt so its old source UI may not include the newer 5x button text; Resend domain not verified in connected account and sender/API secrets remain disabled; real rewarded-ad/MyLead/Hilltop configs are unavailable.
- Rate limiting uses Cloudflare's eventually consistent regional binding at 60/min per client IP. A temporary five/min staging exercise produced 429, then the configured sixty/minute value was restored and deployed.

## Latest resource optimization state — 2026-10-02

- Code and staging flow checks are complete. Existing production Worker was updated; the frontend optimization is in the same source branch and will be visible on Pages after its existing Git deployment completes.
- Browser E2E remains unavailable because the Windows CUA/browser runtime fails during startup with `apply deny-read ACLs`. Staging HTTP checks cover the authenticated run, quest claim, CORS, and game asset flow.
- No Neon migration is required. `pg_stat_statements` is not installed, so cumulative production query counts could not be measured; code-path SQL round trips are documented in `BUILD_REPORT.md` and `RESOURCE_BUDGET.md`.
- Expo canonical Bun audit has 8 findings; `bun audit fix --dry-run` reports dependency-range blocks. Frontend production audit reports 56 advisories including one critical Next advisory. These require a separate dependency/security update.
- Resend, rewarded ad payouts, MyLead conversion rewards, and Hilltop placements remain disabled pending verified provider configuration and trusted callbacks.
