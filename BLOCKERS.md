# DASHCUP blockers and next actions
Updated: 2026-10-02

## Ad verification note — 2026-10-04
- The supplied Hilltop VAST URL returned XML containing inline video creatives during the current check. ChickenDash now initializes playback from a user tap. Actual browser playback is not yet confirmed; a user/device/region may still receive no fill, and browser/ad-blocking policy can block the request. A VAST response alone does not prove an impression or revenue.
- The existing Pages preview `https://codex-spawn-adfix.dashcup-9289.pages.dev` is not in the staging Worker CORS allowlist, so preview bootstrap fails. Its Arcade→Quests navigation stayed within DASHCUP and was not hijacked. Full authenticated/browser E2E remains unverified.

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

## Current continuation update (2026-10-02)

- The launcher origin allowlist now includes both apex and www; the iframe sends readiness again when pinged, and the parent retries locally with a 12-second timeout.
- A score that passes existing evidence plausibility checks now awards 1 trophy per score point and increments the active bi-weekly leaderboard atomically. It is explicitly not deterministic server replay.
- The post-loss screen offers Retry and a disabled 5x Reward button. Rewarded ads remain disabled without trusted provider completion proof.
- Quest claims have a brief sound and reduced-motion-aware celebration. New DASHCUP logo assets are in `public/dashcup-logo/` and the header uses the SVG lockup.
- Staging Worker `c17e0fac-6b50-4871-89c9-5ce62d60dd3f` passed Neon-backed score 1 → trophy 1 and duplicate-run rejection (409). Production Worker and Pages publication are pending this commit.
- Frontend lint/build, Worker typecheck/tests, and Wrangler dry-runs passed. Browser E2E remains pending; Chrome/Brave are installed, so a CDP smoke attempt can follow publication.

## Current status — 2026-10-03

- Closed: production game appeared stuck on `Starting…`. The integrated Expo bundle crashed because it used GSAP globals without imports. Explicit imports, a first-move state-commit fix, idempotent/retried iframe handshake, and request timeout are deployed.
- Verified: live browser Start on `www.dashcup.com` reached active gameplay with score 1; final console check had no errors. This verifies launch only, not a complete loss/end/reward flow.
- Verified: production Worker `c06cf1cc-9a75-4774-b6fa-df2d11427bfe`, staging Worker `a6e29250-5a39-4125-b0f9-25aaf0192b8c`, and existing Pages deployment `8c76b54c-ce5a-4ae4-8be9-a38750bfd867`. Repair commits and follow-up status docs are pushed on `codex/dashcup-rebuild`.
- Remaining limits are unchanged: no deterministic replay; rewarded-ad payouts, MyLead/Hilltop rewards, and Resend delivery stay disabled pending trusted provider setup. `5x Reward` remains UI-only.

## Production deployment verification (2026-10-02)

- Pushed commit: `19e1a7e60811a33107bd7f34d56444723d2b53df` (`codex/dashcup-rebuild`).
- Existing Pages project `dashcup-9289`: production deployment `86422c0b-89b7-4332-b6bc-65a656a05b84`; live site serves logo assets and refreshed UI.
- Existing Worker `dashcup-9289`: version `b38fe224-1a9f-4c2d-b319-6f1abd253587`; existing API/game domains confirmed active.
- Health + Neon, game asset and handshake bundle, CORS allow/deny, apex redirect, and anonymous mutation denial passed. Staging proved 1:1 score trophies, leaderboard update and 409 duplicate-run protection.
- Browser E2E remains unverified because installed Brave starts for `--dump-dom`, but remote debugging startup exits with `Multiple targets are not supported in headless mode`.

## 2026-10-03 continuation

- The quest-value/target migration `0005_quest_rewards_and_score_100` has been applied and verified on both existing Neon branches. Staging Worker deploy and quest bootstrap check passed.
- Remaining optimization gate: the current one-start/one-end-per-run protocol is intentionally retained to preserve per-run tokens, evidence, and duplicate protection. A once-daily aggregate sync would require a secure protocol redesign and adversarial coverage; it is not delivered, so 10,000–50,000 DAU capacity is not established. Source-based request/query projections are documented in `RESOURCE_BUDGET.md`.
- Neon live cumulative query metrics could not be read because `pg_stat_statements` is absent. No extension was installed.
- This continuation's final production Worker promotion and Git push are still pending; see the final continuation report/status.

- Resolved: the quest catalog Worker promotion completed as version `77d7cd6b-def8-40c8-a66c-f8edff96c3a9`. Production API health/Neon, quest bootstrap and game asset route were checked after deployment. Pages was correctly left untouched because the UI reads the API catalog and had no source change.

## Current external setup required — 2026-10-03

- **Admin login is not configured.** Production Worker secrets contain only `DATABASE_URL`. The private portal is live at `https://admin.dashcup.com/`, but login returns `503 ADMIN_NOT_CONFIGURED` until the owner chooses an admin username/password and sets `REWARD_ADMIN_USERNAME` and `REWARD_ADMIN_PASSWORD_HASH` Worker secrets. The password must be PBKDF2-hashed with `server/scripts/hash-admin-password.mjs`; never store the plaintext password.
- **No redeem codes are loaded.** Production Neon has 100 empty slots, exactly 20 per reward type. Set `REWARD_ENCRYPTION_KEY` before importing codes, then use the admin portal to fill the correct slots. No test/fabricated codes were inserted.
- **Reward delivery is safely disabled.** Production `REWARD_EMAIL_DELIVERY_ENABLED=false`; the production secret list has no `RESEND_API_KEY`, sender address, webhook signing secret or encryption key. Configure a verified Resend sender and the secret values, point the signed webhook at `https://api.dashcup.com/webhooks/resend`, test, and explicitly enable the feature flag. Resend tools were not connected in this workspace, so domain verification is not independently confirmed.
- **Runtime test gaps:** With no admin credentials and no real stock, successful admin login, real slot import, concurrent redemption allocation, end-to-end email acceptance/webhook, and delivery retry/reconcile against Resend remain unverified. Unit tests, staging and production smoke checks pass as recorded in BUILD_REPORT.md.
- Resolved for the implementation release: commit `477148de4098ae13a6474673d80fd6ce9fcf5efc` was pushed to `origin/codex/dashcup-rebuild`; Pages deployment `ab68310e-5afb-4db1-b5b2-f458c5bb176c` succeeded for that commit. `www.dashcup.com` returned 200 with the new Rewards UI assets. The external setup blockers above remain.

## CPAlead sponsor offer setup — 2026-10-03

- Source implements the CPAlead feed, allowlisted campaigns, geo/device filtering, offer-click attribution, signed postback checks, duplicate protection, and sponsor quest progression. Staging Worker version `00e5af8a-cf3a-45d9-b49d-3c17d37847df` is deployed and passed bootstrap/reward smoke checks; production remains on its previously verified Worker version and Pages has not been redeployed.
- Offers intentionally remain hidden and start requests return `SPONSOR_OFFERS_DISABLED` until the owner sets a strong `CPALEAD_POSTBACK_PASSWORD` Worker secret and configures the matching CPAlead postback. The CPAlead API key does not serve as this password.
- Configure CPAlead’s postback endpoint as `https://api.dashcup.com/webhooks/cpalead?subid={subid}&lead_id={lead_id}&campaign_id={campaign_id}&country_iso={country_iso}&password={password}`. Store the same new random password as the Worker secret in staging and production only when ready; do not paste it into chat or commit it.

## Admin sign-in correction — 2026-10-04

- The previously recorded admin-login blockers above are historical. Production secrets now include both `REWARD_ADMIN_USERNAME` and `REWARD_ADMIN_PASSWORD_HASH` (confirmed by secret names only). Sign-in failed because the stored PBKDF2 hash used 310,000 rounds, above Workers' 100,000-round ceiling. The verifier and generator now use the supported limit. Production hash replacement and live verification are complete; login/session succeeded, logout succeeded, and the revoked session returned 401. Active production Worker version: `b3d7f1e5-c56a-4d16-bfc6-c8c7076c0675`.
- No credential value is recorded here. Admin inventory, reward-code imports, Resend delivery, and encryption remain independently disabled/unconfigured.
- The CPAlead API key was pasted into the conversation. Rotate it in CPAlead before using it elsewhere. This integration does not need that key for the Offers API and intentionally does not use the conversions polling API.
- Campaign IDs are server-allowlisted and current feed metadata was verified. Some feed payout types/actions and signed link hosts differ from labels/hosts in the pasted list; rendering uses live feed metadata while enforcing the narrower country/device restrictions provided by the owner.
- No production Worker or Pages deployment, provider postback, or real conversion was made. Valid/duplicate CPA/CPI/PPI callback verification still requires the CPAlead callback password and provider-side postback configuration.

## Current CPAlead sponsor status — 2026-10-04 (supersedes the historical setup state above)

- The ambiguous Postgres parameter failure on sponsor offer start was fixed and deployed. Staging version: `1064ba80-edea-4a50-bbd6-3583056c3bc3`; production version: `fd2e3a6f-41df-47f2-b008-b982d7aff1de`.
- The production Worker now has `CPALEAD_POSTBACK_PASSWORD` in secret storage. Staging and production offer reads/start were smoke-tested; an eligible offer appeared for an India/desktop test client and returned a `subid`. A click alone did not advance quest progress; claiming at zero progress returned 409. Missing/wrong callback passwords returned 403.
- **Owner action for real conversions:** update the CPAlead dashboard callback from the staging `workers.dev` host to the production callback shown in `DEPLOYMENT.md`. Then complete one qualifying offer to verify the real callback and quest progression. No synthetic conversion was inserted.
- No frontend Pages redeploy or Neon schema migration was needed for this fix. Other previously listed admin, inventory, Resend and ad-provider blockers are unchanged.

## Biweekly cycle/reward-window update — 2026-10-04

- Existing logic already bound redemption to the latest closed cycle, but the UI omitted its timing. This is now explicit: claim opens when a 14-day cycle ends and remains available for the following 14-day cycle only; the redeem API enforces the deadline and cannot grant an older cycle's reward.
- Public/current trophy totals now come from the active biweekly score ledger and reset to 0 at cycle start; older cycle ranks remain historical. Fixed quest claim points to accrue in the correct biweekly ledger. No external blocker remains for this change; it passed staging but production deployment remains pending.

### Production promotion — 2026-10-04

- The existing Worker was promoted after staging validation; production version `66400b8d-5a72-45cd-b087-a85778663d92` is active at 100%. API health and both apex/www returned HTTP 200. No database migration or infrastructure change was needed.
- The existing Pages project is live on deployment `46478491-668f-4cb3-989b-409c45ee2d57` for commit `8b7470e`; the published JS contains the Rewards copy and apex/www return 200. No external blocker remains for this cycle/reward change.

## Ad and UI follow-up — 2026-10-04

- Removed the Hilltop banner and Monetag service-worker ad loaders after reports that ad behavior was opening during dashboard navigation. The 10-accepted-run VAST player remains user-gesture gated.
- Published Pages deployment `7d8f0981-58da-408d-9ad3-587d96867a45`; live browser navigation to Quests stayed in the app without opening a new tab. The supplied VAST tag returned VAST 3.0 creatives, but browser-level video playback still needs verification. Provider fill varies by browser, device, geography, and inventory.

## Current Arcade ad publication status — 2026-10-04

- The Rewards eligibility/rank notice is removed and the VAST player control is visible on the live Arcade page. A direct browser test of the VAST player ended in “No video ad available”; provider-side inventory/tag configuration must be corrected before video can play.
- The submitted banner/push script was tested on the live page and rendered many fake “Google Chrome” security-warning panels. It has been removed from source; a visible paused-placement notice replaces it. Do not restore this tag. A clean banner-only creative is needed from the ad provider.
- The removal is committed locally as a follow-up to `bd596bde6c25f4d6083509d5481593fbd1a11db5`; Pages currently still runs that earlier deployment until the follow-up is pushed and published. No Worker/database/API blocker is implicated.

## Final live check — 2026-10-04

- Resolved the unsafe-banner deployment quickly: final commit `f71e48d5793c8233ed59e5139f43bc79fd66e7ae` is deployed as Pages deployment `520c3ed1-906b-4910-aaab-d92079264ec5`; apex/www aliases are active.
- Browser verification shows the eligibility/rank block removed, a visible VAST control, and a paused banner placeholder. A manual VAST request returned no video ad. Obtain a clean banner-only creative and provider-side VAST fill/configuration before ads can be active.
- No Worker, database, or API blocker is implicated; frontend lint/build passed.
