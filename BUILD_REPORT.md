# DASHCUP build report
Updated: 2026-10-02

## Repository
- Source of truth: https://github.com/playdashcup/dashcup-9289, audited from current main at 2a5222980662f416ce4ab064000878a56e26ed3e.
- Working branch: `codex/dashcup-rebuild`, tracking origin; the worktree was clean at final verification. The existing implementation and `c28a7b2` history remain preserved; generated dependencies/assets were rebuilt from locked sources.
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
- Cloudflare zone `dashcup.com` is active on the assigned nameservers. The stable Pages project URL https://dashcup-9289.pages.dev, `www.dashcup.com`, manifest and service worker return HTTP 200. The exact project-target proxied CNAME for `www` is configured; public DNS resolves through Cloudflare.
- `www.dashcup.com` is active in Cloudflare Pages and returns HTTP 200 over HTTPS. No API Worker is deployed, so API/game custom domains are not serving this application.
- GameBridge buffers move evidence synchronously and ignores duplicate finish messages for a run. The server checks claimed score against recorded forward inputs rather than an arbitrary score-per-second ceiling; this remains a plausibility check, not deterministic replay.
- No browser E2E, Worker staging deployment, or live API endpoint verification has been performed. CUA browser launch exited because its trusted Node process unexpectedly exited. Wrangler requires authentication. `api.dashcup.com` and `game.dashcup.com` DNS records remain absent, and the game host is not deployed.
- Source re-audit confirmed the Expo seed is received but unused by gameplay. Random row types, obstacles, cars, trains, logs, model variants, and frame-driven collision/movement transitions remain nondeterministic. `/api/game/end` deliberately records suspicious pending runs and awards zero.
- Quest catalogue and claim locking exist, but no code updates quest progress/completion. Referral association exists, but referral qualification is absent. Sponsor/PPI/CPA progression remains disabled without signed provider callbacks.
- Repository README says the vendored source is for educational purposes and says copyrighted game work is used under fair use; LICENSE covers source code. It does not establish redistribution rights for bundled artwork/audio. The owner says licensing is confirmed; that separate permission has not been inspected.
- Canonical Bun audit is not clean: 8 advisories (7 high, 1 moderate). Direct GSAP was upgraded to v3, unused EAS CLI was removed, and 99 issues were fixed by safe updates. Compatible overrides resolved PostCSS, node-fetch, and decode-uri-component advisories. Remaining reports include node-forge with no published safe version, image-size 2.x (incompatible with Expo Metro asset parsing), and uuid.

## Deployment
The Pages production build and `www.dashcup.com` are available and verified. The existing Cloudflare zone is active and its `www` CNAME is configured, but no Worker is deployed and local Wrangler is unauthenticated. Staging Worker deployment, Worker secrets, quest progression, replay, and staged smoke tests remain outstanding. See DEPLOYMENT.md and BLOCKERS.md.

## Live continuation update (2026-10-02; supersedes earlier deployment status)
- Branch `codex/dashcup-rebuild`; HEAD at start of this update: `5c266a7bff07398c06eda34b0f50beb4c0974548`. Existing implementation and Pages frontend preserved; no Pages rebuild or replacement performed.
- Wrangler authenticated; existing staging Worker `dashcup-9289-staging` deployed at https://dashcup-9289-staging.play-dashcup.workers.dev, version `6aef8761-d60c-4470-a024-509679ece2b8`. Replay and reward-email flags remain false.
- Neon staging `DATABASE_URL` is configured as a Cloudflare secret from project `bitter-mode-91626896`, branch `dashcup-staging` (`br-empty-cherry-b4mxu4la`). Plaintext was not emitted. Production database and Worker remain untouched.
- Fresh HTTPS checks: apex, www, `/manifest.webmanifest`, `/sw.js` all returned 200. Cloudflare confirms the active existing zone and Pages project with proxied apex/www CNAME records targeting `dashcup-9289.pages.dev`.
- Staging health/database, bootstrap/session, `/api/me`, quests, leaderboard, referral link, reward status, allowed-origin preflight, denied-origin rejection, invalid-CSRF rejection, `/index.html`, and a game texture asset passed. Valid-CSRF game start returned 200; game end returned 202 pending with zero score/trophies because replay is unavailable. Rate-limit stress check sent 70 concurrent then 70 sequential requests to `/api/health`; all returned 200, no 429 observed. Cloudflare documents this binding as per-location/per-machine and permissive/eventually consistent, so the requested throttle outcome remains unverified.
- Browser E2E remains blocked because CUA trusted Node initialization exits with `apply deny-read ACLs`. No API/game custom domains or production deployment were created. Production migration remains gated.
- Actual source still has unseeded random gameplay generation and time/frame-dependent movement. Seed is not consumed; replay incomplete/disabled. Quest/referral progression and signed provider callbacks remain incomplete. Canonical Bun audit remains 8 advisories (7 high, 1 moderate).

## Latest staging rate-guard update
- Shared rate-limit decision helper is used by the Worker; added test verifies a rejected binding result returns HTTP 429 with `RATE_LIMITED`. Worker tests now pass 11/11 and Worker typecheck passes.
- Latest redeploy of the existing staging Worker is version `b5015c4f-de67-42ca-96a4-011f7ca301db`; no game assets changed. Staging health confirms `ok=true`, environment `staging`, and database connected. Replay/email flags remain false.
- Live probe saw 140 successful health responses (70 concurrent, 70 sequential), without a 429. Cloudflare documents this binding as per-location/per-machine and permissive/eventually consistent; live throttle outcome remains unverified. No production Worker or DB changes.

## Continuation update — 2026-10-02

- Preserved `codex/dashcup-rebuild` at starting HEAD `9f4c05d8df36c1bb00aa1ab18db3b12896ed184a`; no reset or replacement worktree.
- Added practical evidence checks: valid UUID/run-token format, at least one forward move (the Expo game emits one when a run starts), bounded ordered inputs, score no greater than recorded forward moves, and max run duration. Replay attempts are logged with reason codes and evidence hashes; raw run tokens are never logged.
- Made one-time run consumption, game-run insertion, and play/PB/referral quest progression a single PostgreSQL statement. Duplicate events cannot advance progress twice. This is plausibility validation, not deterministic replay or authoritative reconstruction of the game engine.
- Staging deployed at `https://dashcup-9289-staging.play-dashcup.workers.dev`, version `c7d9b2d7-e0a5-40d3-8c8d-af4652864849`; Neon staging health reports connected.
- Staging HTTP integration: health/database true; game end 200 with `plausibility_checked`; same-token replay 409; changed-evidence replay 409; play_1, new_pb, pb_3_days and inviter ref_2 advanced; quest claim 200 and duplicate claim 409. Assets responded 200.
- Worker tests 11/11, Worker typecheck, staging dry-run, and root lint pass. Frontend production build was not run and Pages was not redeployed.
- Edited the existing game bridge source to show the exact `5x Reward` label and non-replay copy. This source edit is not live until Pages is rebuilt; the existing published Pages deployment remains untouched.
- Apex, www, manifest, and service worker returned HTTP 200. `api.dashcup.com` and `game.dashcup.com` do not resolve yet.
- Browser E2E retry failed at CUA startup with `apply deny-read ACLs`; no browser E2E pass is claimed.
- Production database and Worker remain unchanged. Replay is not treated as a release blocker. Resend, rewarded payout, and external CPI/PPI/CPA rewards remain disabled pending verified provider configuration.
- Follow-up game export preserved the Expo gameplay and applied the embedded end-screen simplification: the existing source game's offers, settings, share, and leaderboard footer are hidden while running inside the authenticated ChickenDash bridge; the parent Start/Restart/5x Reward controls and game scoreboard remain. The original standalone game screen remains unchanged.
- Expo web export completed (2.16 MB JS bundle) and the existing staging Worker was redeployed with the new game bundle as version `c7d9b2d7-e0a5-40d3-8c8d-af4652864849`. Next.js/Pages was not rebuilt or redeployed.

- Final version `c7d9b2d7-e0a5-40d3-8c8d-af4652864849` staging smoke: `/api/health` 200 with database connected and `Cache-Control: no-store`; allowed preflight 204; denied origin 403; missing CSRF 403; game index and Expo bundle 200 (2,162,206 bytes).
- Neon production preflight confirmed the production branch is still empty. The connected migration-preparation workflow rejected the combined existing migrations at the dollar-quoted trigger function; no production schema changes were applied. Awaiting an approved, tool-supported production migration workflow.

## Authoritative live continuation (2026-10-02)

- Repository: `playdashcup/dashcup-9289`, branch `codex/dashcup-rebuild`. Prior commits were preserved; starting HEAD was `f307a6298ec09a096593f34d6a7ff6051601a70e`. Current changes include allowing both `https://dashcup.com` and `https://www.dashcup.com` origins in the existing production Worker.
- Production Neon project `bitter-mode-91626896`, branch `br-purple-river-b4v27of0`, database `neondb`: approved migrations `0001_initial` and `0002_resend_delivery` are applied; verified 17 public tables. Production Worker health reports `ok=true`, `environment=production`, `database=true`.
- The existing single Worker `dashcup-9289` was deployed with existing game assets to `api.dashcup.com` and `game.dashcup.com`; latest version `7e3b55c8-c35c-44e9-a204-470e5d91841a`. Wrangler deployment history confirms it is live. `GAME_REPLAY_ENABLED=false` and `REWARD_EMAIL_DELIVERY_ENABLED=false` remain set.
- Verified over HTTPS at Cloudflare edge: API health 200 with no-store and database connected; `/api/bootstrap` 200 (this smoke created one anonymous test user/session and the initial quest rows); allowed production CORS preflight 204 for www, denied origin 403; game root and Expo bundle 200. Cloudflare DNS for API/game returns proxied IPv4/IPv6 from the authoritative nameservers and 1.1.1.1. This machine's default resolver still returns NXDOMAIN, so local-default DNS convergence is not yet confirmed.
- Existing Pages deployment was not rebuilt or replaced. Apex, www, manifest and service worker each returned 200. The source-only `5x Reward` change is not reflected in the live Pages output until a Pages deployment; no Pages build/deploy was performed under the instruction to preserve it.
- Worker tests 11/11, Worker TypeScript check, root lint and production Wrangler dry-run passed. Staging integration remains as previously recorded. Browser E2E retry was blocked by CUA startup `apply deny-read ACLs`; it is not claimed as passed. Live Cloudflare rate-limit threshold behavior remains unverified.
- No deterministic game replay: server-side plausibility checks only. This is not a client-score authority; no game trophy award is enabled for unverified runs. CPI/CPA provider rewards, rewarded-ad payout, and reward email delivery remain disabled pending trusted provider configuration and verified Resend production sender/secrets. Canonical Bun audit remains 8 advisories (7 high, 1 moderate), per the existing review.
- The production smoke created 1 anonymous account/session and 9 initial quest rows; no game sessions/runs or reward redemptions were created. No plaintext secrets or reward codes were written into these reports.

## Resend account check (2026-10-02)

- The connected Resend account currently lists `dashcup.com` with status `not_started` and sending capability enabled; it does not list `mail.dashcup.com`. Domain verification is therefore not confirmed. Production delivery remains disabled; no test email was sent.

## Practical anti-cheat continuation (2026-10-02)

- No deterministic replay simulator was added. `GAME_REPLAY_ENABLED=false` remains in both environments; the documented integrity level is plausibility checks, not exact game-score reconstruction.
- Strengthened existing evidence validation: JSON object/field validation; first emitted action must be forward within five seconds; minimum/maximum duration; at least 50 ms between ordered events; a rolling input-density ceiling; score no greater than submitted forward moves; and a conservative score-velocity ceiling. Evidence hashes now cover score, duration and inputs. Repeated exact suspicious evidence is flagged after recurrence. Server database start time must match submitted duration within a 10-second network/clock tolerance.
- Run credential, one-use/expiry, session, CSRF and evidence-hash checks remain. DB accepts are atomic with play/PB/referral quest progression; plausible game submissions report `plausibility_checked` and award zero immediate game trophies.
- API rate-limit key is now per IP across all API paths rather than path-specific. Temporary staging configuration at 5/min produced HTTP 429; staging was restored to 60/min and redeployed. Cloudflare counters remain location-local and eventually consistent.
- Staging Worker `dashcup-9289-staging` version `49ccb780-68e1-49db-b1bf-0bf43ff832b9` (60/min restored). Smoke: unauthenticated start 403; bootstrap/session 200; missing-CSRF start 403; impossible score velocity 422; server-duration mismatch 409; plausible run 200; duplicate run 409; referral qualification and quest progression succeeded. Repeated suspicious-evidence reason was observed in staging Neon.
- Worker tests 11/11, typecheck, root lint and production Wrangler dry-run pass. Browser E2E remains blocked by the previously observed CUA ACL initialization failure.
- Production Worker still runs version `7e3b55c8-c35c-44e9-a204-470e5d91841a` until the staged anti-cheat update is released. Production migration is already applied. Existing Pages was not rebuilt.

## Production release of practical anti-cheat (2026-10-02)

- Deployed the staged Worker update to the existing production Worker `dashcup-9289`; new production version `5f3cc03f-e822-415a-a097-36de130f6148`. Existing custom domains remain `api.dashcup.com` and `game.dashcup.com`; limiter restored at 60/min. `GAME_REPLAY_ENABLED=false`, reward delivery disabled.
- Production post-deploy smoke: API health 200 and Neon connected; apex/www credentialed CORS preflight 204; unlisted origin 403; unauthenticated game start 403; game root 200; full 2,162,206-byte Expo JS asset 200. Both game/API HTTPS/TLS custom routes answered through Cloudflare.
- Production Neon migrations/schema were unchanged. Staging version `49ccb780-68e1-49db-b1bf-0bf43ff832b9` passed the score velocity, duration, replay, referral and quest cases before production.
- Git implementation is pushed on `codex/dashcup-rebuild`; reports will be committed separately after this release verification. Existing Pages was not rebuilt/deployed.

## Resource optimization and production rollout — 2026-10-02

- Continued on existing `codex/dashcup-rebuild`, base `011720fe6f79d0d48d388880109fba2d2a91cdb9`; existing Pages project `dashcup-9289`, Worker `dashcup-9289`, game, API, and Neon architecture are preserved.
- Reduced existing-session dashboard bootstrap from 8 SQL statements to 5 by combining session validation with CSRF rotation, profile and quest reads, and closed-cycle leaderboard plus eligibility. Quest definitions stay static in code. Bootstrap's seed uses `ON CONFLICT DO NOTHING`, inserting only missing cycle rows.
- Game play remains fully client-side: one `/api/game/start`, one bounded `/api/game/end`, and zero network requests during play. Completion returns fresh profile/quest state, removing `/api/me` and `/api/quests` refreshes (2 Worker requests, 4 SQL statements). Quest claim returns updated quest/wallet state, removing two follow-up requests and four SQL statements. Saving reward details returns saved values, removing two follow-up requests and four SQL statements.
- Added a separate Cloudflare Worker mutation limiter, configured to 30 requests/60 seconds per IP for game start/end, quest claim, reward detail changes/redemption, MyLead start, and Resend callbacks. The shared API limiter remains 60/60 seconds. Cloudflare counters are regional/eventually consistent, so these are configured thresholds rather than strict global quotas.
- Immutable hashed Expo JS/media assets return `Cache-Control: public, max-age=31536000, immutable`; API responses remain `no-store`. Added matching Pages `_headers` rules for fingerprinted static files.
- Production Worker deployed on the existing custom domains, version `abb362f1-c420-48b5-9511-21ce7851a1d5`; staging Worker version `0449293a-0203-4d1c-b032-2f761e0511c8`. Neon remains on existing staging/production branches; no migration or new service/resource was created.
- Staging HTTP checks passed health/Neon, bootstrap/session, CSRF, game start/end, daily quest progression/claim, duplicate-claim rejection (409), reward status, allowed CORS (204), denied origin (403), game root and 2,162,206-byte JS bundle. Production checked health/Neon, CORS allow/deny, anonymous start denial, apex/www, manifest, service worker, verification file, game root and the same game bundle; all returned expected 200/204/403 results. Cache headers were verified. Browser-driven E2E was not available.
- Worker tests 12/12; Worker typecheck; frontend lint/build; Wrangler staging/production dry-runs; Expo lint (0 errors, 68 existing warnings) passed.
- Canonical Expo Bun audit against `games/expo-crossy-road/bun.lock`: 8 findings (7 high, 1 moderate). `bun audit fix --dry-run` cannot resolve these within current dependency ranges; lockfiles were left unchanged. Frontend `pnpm audit --prod` reports 56 advisories (1 critical, 22 high, 27 moderate, 6 low), including the installed Next version below patched 16.3.6. Dependency changes need their own compatibility-checked security update.
- No DAU/cost capacity load test was run. Neon query stats are unavailable because `pg_stat_statements` is not installed; per-flow SQL counts above are derived from inspected code, not live cumulative usage.

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

## Game launch, trophy scoring, quest feedback, and logo — 2026-10-02

- Fixed the iframe origin handshake for both `https://dashcup.com` and `https://www.dashcup.com`. The parent retries `dashcup:ping` locally until the game replies ready; startup now has a 12-second recovery state even after readiness. Ping messages do not create API requests.
- Re-exported the existing Expo Crossy Road source to the existing Worker asset directory. The game remains the same project and existing scoreboard; no new game implementation was substituted.
- A newly consumed run that passes evidence plausibility checks awards one trophy per accepted score point and adds those trophies to the active 14-day leaderboard. The wallet and leaderboard updates happen atomically in the existing game-end statement. This is practical evidence validation, not perfect server reproduction.
- The end screen shows the score, trophy amount, Retry, and a disabled `5x Reward` choice. It appears only after a successful game-end response. Ad multipliers remain disabled pending trusted SDK completion verification.
- Quest claims now play a short Web Audio chime and animate the claimed card/trophy; the effect honors reduced-motion settings and makes no network calls.
- Created DASHCUP chicken lockup/icon SVGs, PNGs and a downloadable ZIP, and placed the lockup in the existing website header.
- Staging Worker version `c17e0fac-6b50-4871-89c9-5ce62d60dd3f` passed a real Neon-backed flow: bootstrap 200, start 200, score 1 end 200 with one trophy (0 before, 1 after), and duplicate end 409. This staging run is a smoke check, not browser E2E.
- Frontend lint/build, Worker tests 12/12, Worker typecheck, and production/staging Wrangler dry-runs passed. Production promotion and Pages publication are pending this change being committed and pushed; browser E2E is not yet verified.

## Current implementation update (2026-10-02)

- Repaired the game iframe handshake: apex + www origin allowlist, ping/ready retry, and bounded startup timeout. No API polling or gameplay traffic was added.
- Game end now credits a plausibility-checked score as trophies at 1:1 and updates the active bi-weekly leaderboard in the same database statement. Staging confirms a score of 1 increments the wallet by 1; reuse is rejected with 409. Client claims are still plausibility checked, not perfectly reproduced.
- Loss UI shows Retry and disabled `5x Reward`; no multiplier payout is possible without trusted rewarded-ad verification.
- Quest claims now play a short Web Audio chime and animate the trophy/card, with reduced-motion support.
- Exported updated existing Expo assets to `server/game-dist`; no replacement game was integrated.
- Staging version `c17e0fac-6b50-4871-89c9-5ce62d60dd3f` deployed and passed live Worker/Neon score and replay-protection smoke. Production deployment is still pending.
- DASHCUP logo lockup/icon have SVG and PNG variants, a ZIP bundle, and website header/favicon integration under `public/dashcup-logo/`.

## Production release verification (2026-10-02)

- Commit `19e1a7e60811a33107bd7f34d56444723d2b53df` is pushed to `origin/codex/dashcup-rebuild`; working tree was clean after commit.
- Existing Pages project `dashcup-9289` deployed commit `19e1a7e` as `86422c0b-89b7-4332-b6bc-65a656a05b84`. `www.dashcup.com` serves the new header logo; apex redirects to www. Manifest icon paths and logo SVG/ZIP return 200.
- Production Worker `dashcup-9289` version `b38fe224-1a9f-4c2d-b319-6f1abd253587` is active on the existing `api.dashcup.com` and `game.dashcup.com` custom domains. API health reports Neon connected; game HTML and the refreshed ping/apex-compatible Expo bundle return 200.
- Production CORS preflight allows `www.dashcup.com` and rejects `evil.example` with 403. Anonymous `/api/game/start` remains CSRF denied (403).
- Staging confirmed score 1 → 1 trophy and active leaderboard +1; replay submission returns 409. No production score was injected for testing.
- Interactive browser E2E is still unverified. Brave `--dump-dom` confirmed production HTML rendering, but remote debugging startup exits with `Multiple targets are not supported in headless mode`; no click-through gameplay result is claimed.
- The 5x button is only rendered after an accepted game end and remains disabled until trusted rewarded-ad verification exists. Resend, MyLead, Hilltop rewards remain disabled.

## ChickenDash launch failure repaired — 2026-10-03

- Compared the integrated game with [Evan Bacon's Expo Crossy Road source](https://github.com/EvanBacon/Expo-Crossy-Road). The project already used this source; it was not replaced.
- Reproduced production's `Starting…` state. The iframe bundle crashed with `ReferenceError: TimelineMax is not defined`; several files used GSAP compatibility globals without importing them. Added explicit GSAP imports where used.
- Fixed the first-move React state race, made duplicate start messages acknowledge idempotently, retried the iframe handshake until acknowledgement, and capped the API start request at 12 seconds.
- Gated browser audio until a tap/swipe occurs inside the game iframe so cross-origin autoplay denial does not spam errors.
- `pnpm lint`, Expo web export, frontend build, Worker typecheck, Worker tests (12/12), and production Wrangler dry-run passed. Staging Worker version `a6e29250-5a39-4125-b0f9-25aaf0192b8c`; production Worker version `c06cf1cc-9a75-4774-b6fa-df2d11427bfe`.
- Staging API smoke passed health/bootstrap/start/end: score 1 awarded 1 trophy; duplicate end was rejected with 409. Production API health returns 200 and Neon connected.
- Live browser test on `www.dashcup.com`: clicked Start; the iframe became active and score advanced to 1. The final browser console check had no errors. No end request was sent, so this test awarded no production trophies.
- Existing Pages project deployment `8c76b54c-ce5a-4ae4-8be9-a38750bfd867` deployed commit `e6f49f3`. The repair source commits and follow-up status documentation are pushed on `codex/dashcup-rebuild`; working tree was clean after the documentation push.

## Hilltop VAST every 15 accepted runs (2026-10-03)

- Added the provided Hilltop VAST feed to a lazy-loaded Google IMA HTML5 player overlay. A run advances the browser-local counter only after `/api/game/end` succeeds; each 15th accepted run attempts one VAST break. Browsers that require a user gesture receive an explicit Play ad action; a no-fill/error can be dismissed without affecting the game.
- The counter is a per-browser ad frequency preference only. It does not affect identity, score, trophies, quests, or payouts. Rewarded-ad payouts remain disabled.
- No Worker, Neon, schema, dependency, or infrastructure changes were made. The IMA/VAST provider receives network requests only when a 15-run threshold is reached.
- Validation on this working tree: `pnpm lint` passed and `pnpm build` passed. Actual provider fill/playback and live deployment have not yet been verified.

## Lightweight client anti-cheat continuation (2026-10-03)

- Implementation commit: `4f0986b584328fcb9811a92e61f071258fa0e7ae` on `codex/dashcup-rebuild`, pushed to origin.
- Added event-driven local input burst, score velocity, short-run score, movement, state integrity/transition, focus, devtools-shortcut, and rapid-reset signals. These flags are deterrence/telemetry only and never determine score, trophy, quest, or reward eligibility.
- Telemetry is bounded and attached to the existing `/api/game/end` request. The Worker allow-lists flags and persists them on the same one-use game-session update; no endpoint, migration, Worker/Neon call, or additional query/write was added.
- `playdashcup/disable-devtool` is not installed or referenced in the repository. It was not added; the requested lightweight policy permits deterrence only when a dependency already exists and excludes invasive polling/browser restrictions. Shortcut detection is event-based and does not block controls.
- Verification: Worker tests 17/17, Worker typecheck, frontend lint/build, Expo lint (0 errors; 68 existing warnings), and staging Wrangler deployment pass. Staging health/database, bootstrap, CSRF rejection, start/end, game asset, and duplicate end (409) pass. The staging smoke test created an isolated test account and awarded its 1-trophy test run.
- Browser E2E was partial: the published production website loaded the game, Start entered active play, and ArrowUp advanced score 1 to 2. No production end submission was made, so no production game trophies were awarded. A full client-signal end-to-end run remains unverified.
- Staging Worker version: `1ba67064-d21d-4326-8886-638c9bf3e3cc`; production Worker version: `da81baae-b14b-4961-9e4e-a084924cba2c`. Existing Pages project `dashcup-9289` deployed commit `4f0986b` as `2ded517f-db0c-4de8-9289-41a721d0e549` (Active). API health/Neon, game asset, and credentialed CORS were verified after deploy.

## Reward inventory and admin portal — 2026-10-03

- Implemented one-code-per-redemption for the existing five reward types, encrypted inventory, per-type 20-slot inventory, admin audit/history, password-hash login and secure server-side admin sessions. The existing Pages frontend/rewards UI is retained and now shows one chosen reward, stock availability, verified-email state, and safe redemption delivery status.
- Added `0006_reward_inventory_admin.sql` and `0007_reward_email_verification.sql`. Both migrations are recorded on staging (`br-empty-cherry-b4mxu4la`) and production (`br-purple-river-b4v27of0`) in Neon project `bitter-mode-91626896`. Production has 100 slots and all are empty; no reward code was imported.
- Existing Worker `dashcup-9289-staging` is deployed as `cd358f26-edb5-4447-9d6d-ec8350806c4a`; production `dashcup-9289` is `0e2f9d1e-c064-4eda-a155-0b254d37ebba`. The Worker serves the separate `admin.dashcup.com` portal in addition to its existing API/game domains. Static asset routing now invokes the Worker only for `/api/*`, `/`, and `/index.html`; remaining game assets retain the asset fast path.
- A production root-page check initially exposed the asset fast path bypassing the admin handler. After the routing fix, `admin.dashcup.com/` returns the private portal with `Cache-Control: no-store`, CSP and `X-Robots-Tag: noindex, nofollow, noarchive`; API health on the admin host and main API returned 200; game root returned 200; admin inventory without a session returned 401; admin login returns the expected `ADMIN_NOT_CONFIGURED` 503; admin-origin preflight returned 204; bootstrap returned 200 with five zero-stock categories.
- Production Worker secrets currently include only `DATABASE_URL`. `REWARD_EMAIL_DELIVERY_ENABLED=false`; admin username/password hash, reward encryption key, Resend API key/from address/webhook secret are not configured. Reward delivery is not enabled or tested against Resend. Email verification/reward sends cannot function until configured. Admin login remains intentionally fail-closed.
- Tests: Worker suite 20/20, Worker TypeScript check, frontend ESLint, Next production build, staging and production Wrangler dry-runs, plus staging health/bootstrap/CORS/CSRF-denial/game-asset/admin-denial smoke checks all passed. No full browser E2E, real admin login/import, provider send, concurrent inventory redemption, or Resend webhook test was possible without owner secrets and a real configured sender/code inventory.
- Files changed: `components/Dashboard.tsx`, `components/Rewards/RewardPanel.tsx`, `lib/api.ts`, `lib/types.ts`, `server/src/admin/portal.ts`, `server/src/email/reward-template.ts`, `server/src/index.ts`, `server/src/security/admin-auth.ts`, `server/src/security/rate-limit.ts`, `server/tests/domain.test.mjs`, `server/wrangler.jsonc`, `server/scripts/hash-admin-password.mjs`, and migrations `0006_reward_inventory_admin.sql`, `0007_reward_email_verification.sql`.
- Implementation commit `477148de4098ae13a6474673d80fd6ce9fcf5efc` is pushed to `origin/codex/dashcup-rebuild`; the working tree was clean at that point. Existing Pages project `dashcup-9289` deployed that commit as `ab68310e-5afb-4db1-b5b2-f458c5bb176c` with build/deploy stages successful. `www.dashcup.com` returned 200 and its loaded JavaScript contained the updated one-choice reward, verified-email, and unavailable-stock UI.

## Admin sign-in correction — 2026-10-04

- Root cause: the configured admin hash used 310,000 PBKDF2 rounds, exceeding Cloudflare Workers Web Crypto's 100,000-round limit. The verifier, hash script and tests have been corrected to use 100,000 rounds; production secret names for the admin username/hash are present. The previous `ADMIN_LOGIN_FAILED` response was therefore caused by a runtime crypto incompatibility, not proof of a mistyped username/password.
- Worker tests passed 22/22, typecheck and Wrangler production dry-run passed. Deployed the existing Worker as `c45dbc75-1289-4e14-9130-745006c97e4b`, then replaced only the admin username/hash secrets; the active 100% production version is `b3d7f1e5-c56a-4d16-bfc6-c8c7076c0675`. Live sign-in returned 200; `/api/admin/session` confirmed authentication; logout returned 200 and a follow-up session request returned 401. Secret listing confirmed names only. No Pages deployment or database migration was needed.

## Quest reward adjustment and request-cost audit (2026-10-03)

- Updated the existing daily/weekly quest catalog: Play 10 validated matches = 1,000 trophies; Play 80 validated games = 8,000; Play 200 validated games = 25,000; Invite two players = 10,000; score target is now 100 in ChickenDash (reward remains 5,000).
- Added migration `0005_quest_rewards_and_score_100`. It updates unclaimed quest rows, clamps progress to the new target, and leaves already claimed rewards unchanged. Applied and verified on staging and production Neon branch `br-purple-river-b4v27of0` (project `bitter-mode-91626896`).
- Staging Worker `dashcup-9289-staging` deployed version `c7892e5b-a092-46ff-be2d-0807088d9ffc`. Staging health returned `ok=true`, `database=true`; bootstrap returned the requested quest values and targets.
- Validation: Worker tests 17/17; Worker typecheck; frontend lint and production build; Wrangler staging and production dry-runs; `git diff --check`.
- Cost review from source: dashboard bootstrap is one API request (existing-session path performs five SQL statements); each game remains one start + one end Worker request, with zero gameplay network/database activity. Start is two SQL statements. End is two on the ordinary accepted path, including CSRF/session validation plus the atomic game-end CTE. Quest claim is one request/two SQL statements. No per-run aggregation/batched-sync implementation was made: current one-use run tokens and per-run evidence checks are retained rather than replacing them with untrusted client summaries.
- Optimization limitation: the current lifecycle is about 2 Worker invocations and 4 SQL round trips per validated game, excluding exceptional anti-cheat writes. At 100 games/DAU/day this mechanically extrapolates to roughly 2M Worker requests and 4M SQL round trips per 10,000 DAU/day, or 10M and 20M at 50,000 DAU/day. This is arithmetic from the request flow, not a load test or capacity guarantee. Neon `pg_stat_statements` is unavailable, so live cumulative query volume was not measured.
- Production Worker promotion and commit/push are pending final verification in this continuation; no claim is made here that this code is yet live in production.

- Production promotion completed after the staging gate: existing Worker `dashcup-9289` version `77d7cd6b-def8-40c8-a66c-f8edff96c3a9`; existing `api.dashcup.com` health reports Neon connected, production bootstrap returns the requested quest catalog, and `game.dashcup.com/` returns 200. Pages was not redeployed because no frontend source changed.

## CPAlead sponsor quest integration — 2026-10-03

- Updated the existing quest catalog: removed `Complete a CPA offer`; `Complete a sponsor offer` now awards 60,000 and says “Install the app for trophies.”; weekly `Complete sponsor offers` still requires three verified events and now awards 200,000. Existing unclaimed rows receive updated reward values during the current bootstrap/quest response; already claimed values remain untouched.
- Added the 13 campaign IDs supplied by the owner as a server-side allowlist, with country/device restrictions enforced from Cloudflare country metadata and request device hints. The authenticated bootstrap or quests response includes only currently eligible offer descriptions; tracking links remain server-side.
- Queried CPAlead’s documented Publisher Offers API with publisher ID 3364343. Its current metadata confirms all 13 supplied IDs are in the feed, but some payout types and current tracking hosts differ from the pasted list; the UI uses CPAlead’s current types/actions and the exact signed link it returns. Examples include ID 5547025 currently categorized CPA, while 5546840 is CPI. Offers outside the supplied campaign allowlist are never returned.
- Feed data is cached in the Worker isolate and Cloudflare Cache API for 10 minutes, with in-isolate in-flight request coalescing. A cache miss can make one CPAlead API request per Worker cache location/expiry; ordinary cache hits add no provider call and no Neon read. No extra API request or Neon query was added just to show offers.
- Starting an offer uses the existing Worker and one insert into `mylead_clicks` for an opaque UUID `subid`; it appends the subid to the signed CPAlead URL without reconstructing other tracking parameters. Clicks do not advance quests. CPAlead callbacks use `/webhooks/cpalead`, compare the configured callback password in constant time, require campaign/country/click attribution, and insert `provider_conversions` with the existing unique `(provider, transaction_id)` key. One atomic SQL statement then advances the daily one-event sponsor quest and weekly three-event sponsor quest; duplicates are no-ops.
- Provider rewards remain fail-closed: CPAlead offer links are hidden/rejected until `CPALEAD_POSTBACK_PASSWORD` exists. The supplied API key was not added to source or passed to the Offers API; CPAlead documents publisher ID for Offers and a distinct callback password for postbacks. The key is not needed for this non-polling flow.
- Validation: Worker tests 22/22; Worker typecheck; frontend lint/build; staging and production Wrangler dry-runs passed. Pure tests cover GEO/device filters, allowlisted campaigns, platform detection, signed URL preservation/subid, UUID validation, and quest values. Live campaign feed was queried outside production. Existing staging Worker deployed as `00e5af8a-cf3a-45d9-b49d-3c17d37847df`; its authenticated bootstrap returned 8 quests with 60,000/200,000 rewards and no CPA quest, and sponsor start failed closed with `SPONSOR_OFFERS_DISABLED`. No production deployment, Neon migration/write beyond this staging smoke bootstrap, callback credential, or end-to-end provider conversion was performed. Browser E2E remains unverified.

## CPAlead sponsor flow production fix — 2026-10-04

- Reproduced the missing sponsor `GO!` action on staging. The API returned one eligible campaign for the test client (India, desktop), but starting it returned `500 INTERNAL_ERROR`; Wrangler tail showed PostgreSQL SQLSTATE `42P18` while inserting the click attribution row. Parameter types in the CPAlead `jsonb_build_object` calls were ambiguous. Added explicit `text` casts for click and callback metadata parameters.
- Staging Worker `dashcup-9289-staging` deployed version `1064ba80-edea-4a50-bbd6-3583056c3bc3`. Authenticated bootstrap and quest reads returned 200, the eligible campaign appeared, offer start returned 200 with an opaque `subid`, and the click left sponsor quest progress unchanged.
- The same validated Worker source is now deployed to the existing production Worker `dashcup-9289`, version `fd2e3a6f-41df-47f2-b008-b982d7aff1de`. `CPALEAD_POSTBACK_PASSWORD` is configured as a Worker secret; no secret value is stored in source or reports. No Pages rebuild/deployment or Neon migration was needed.
- Production verification: API health, bootstrap and quest reads returned 200; one eligible campaign appeared for the test client, offer start returned 200 with an attributed tracking URL, click-only progress remained zero, and a claim without verified progress returned 409. The callback returned 403 for missing and incorrect passwords. Worker tests 22/22, typecheck, and both Wrangler dry-runs passed.
- No actual CPAlead conversion was submitted. The CPAlead dashboard must use the production callback URL in `DEPLOYMENT.md`; the previously supplied callback pointed at staging. Therefore the real provider callback-to-quest progression and duplicate callback behavior remain unverified with a genuine conversion. Clicks never award progress, and claims remain server-authoritative.

## Biweekly trophies and reward window — 2026-10-04

- The active leaderboard is a biweekly score ledger; the public header/me/game/quest-claim trophy total now reads that active cycle score, so it starts at 0 when a new 14-day cycle begins. Closed-cycle rankings remain available as history. The legacy `users.trophies` accumulator is no longer used for API output or updated by new game/quest events; no migration or destructive balance rewrite was performed.
- Fixed quest rewards being written to daily/weekly identifiers instead of the biweekly leaderboard. New quest claims now update the same active-cycle score ledger as game scores; the claim response and refreshed bootstrap agree.
- Reward eligibility and redemption are tied to Top 20 of the immediately preceding cycle. The claim window opens at that cycle's end/new-cycle start and closes 14 days later at the next cycle boundary. The API returns open/deadline metadata; the redeem endpoint enforces the cycle/window and excludes older-cycle winners.
- Rewards UI explains unlock timing, the following 14-day claim period, expiration of older unclaimed rewards, and the active-cycle trophy reset. No new endpoint, database schema, or infrastructure was added.
- Validation: 23/23 Worker tests, Worker typecheck, frontend lint/build, staging/production Wrangler dry-runs. Staging Worker `703363c1-d2f3-4a02-a558-ff1cf46157e1` passed health/bootstrap/eligibility checks and an end-to-end sequence of 10 validated runs + daily quest claim; the claim returned 1,010 cycle trophies and refreshed bootstrap returned the same. Current staging cycle was `2026-09-28`; its previous-cycle claim deadline was `2026-10-12T00:00:00Z`. Production has not yet been updated for this change.

## Production cycle/reward update — 2026-10-04

- Staging passed before promotion. The existing production Worker was updated without changing Worker count, Neon schema, or provider configuration. Active production version: `66400b8d-5a72-45cd-b087-a85778663d92` (100%). Production API health and the existing apex/www sites returned HTTP 200 after deployment.
- Pages deployment `46478491-668f-4cb3-989b-409c45ee2d57` for commit `8b7470e` is Active on `codex/dashcup-rebuild`. Apex/www returned 200 and the published JS contains the new cycle-unlock/window/reset copy. Production bootstrap returned 200 with current-cycle score `0`, claim window open, deadline `2026-10-12T00:00:00Z`, and no Top-20 eligibility for the new test session.

## Spawn and ad interaction update — 2026-10-04

- Kept the existing Expo Crossy Road engine and row types. Dynamic river rows now spawn three logs with 4.5–6.0 unit gaps instead of randomly spawning two or three with 5–8 unit gaps, reducing long periods without a boardable log. No game API calls or database writes were added.
- Removed the page-wide Hilltop push and MultiTag video-slider loaders. They were not confined to the labeled ad slot and could intercept unrelated navigation clicks. The existing Hilltop banner remains in its labeled Arcade-only placement below the game/referral panel.
- Changed the existing Hilltop VAST player to wait for an explicit Play ad tap before initializing playback. A direct fetch of the supplied tag returned VAST XML containing inline video creatives at check time; live playback can still vary by device, geography, browser settings, and provider inventory.
- Validation: frontend lint/build passed; Expo web export passed; Expo lint had 0 errors and 68 existing warnings. Staging Worker `dashcup-9289-staging`, version `a03d4e3a-0487-47a3-98ac-5d8043b4c2be`, returned 200 for `/api/health`, `/`, `/index.html`, and the new hashed Expo bundle. Staging and production Wrangler dry-runs passed.
- Existing Pages project preview: https://codex-spawn-adfix.dashcup-9289.pages.dev. Browser navigation from Arcade to Quests stayed on the app. Preview bootstrap failed because the preview origin is outside the staging Worker CORS allowlist; this was not a staging or production browser E2E pass.
