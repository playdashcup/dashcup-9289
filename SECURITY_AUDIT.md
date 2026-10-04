# DASHCUP security audit

Updated: 2026-10-02

## Present protections
- Server-generated random sessions; only hashes stored in Neon. Session cookies are HttpOnly, Secure, SameSite=Lax.
- Mutation endpoints require a server session and CSRF token. API applies explicit credentialed CORS allowlisting, no-store and rate limiting. All `/api/*` request bodies are capped at 128 KB and the Resend webhook body at 64 KB before route JSON parsing. CSRF, admin-token, and webhook signature values are SHA-256 normalized and compared with Cloudflare Workers' `crypto.subtle.timingSafeEqual` primitive.
- Game evidence request stream is capped at 128 KB; event count, time range, ordering, move enum and claimed-score plausibility against forward inputs are bounded. Evidence hash, one-use run token, honeypot and suspicious-run records are stored.
- Game scores are pending/suspicious and never award trophies. The passed seed is not consumed by a deterministic server simulation. Keep GAME_REPLAY_ENABLED=false.
- Reward codes use AES-256-GCM, random IV, category AAD and a duplicate fingerprint. Plaintext is not returned by import/redeem APIs and is not logged.
- Redemption uses a user-row lock and SKIP LOCKED stock selection, keeps at least 20 codes in stock, enforces top-20 closed-cycle rank, and persists status with redemption ID as provider idempotency key.
- Resend API key/sender/encryption/admin/webhook tokens are server-only Worker bindings. Delivery is disabled unless explicit configuration enables it. Provider HTTP acceptance is separate from sent/delivered status; network/provider ambiguity is stored as provider_unknown.
- Resend webhook events verify signed Svix headers and timestamp age, deduplicate event IDs, then reconcile accepted, sent/delivered, and rejected states.
- Reward email changes are limited to three per seven-day window using database updates.
- PWA fetch handler skips API routes, non-GET methods, and cross-origin requests.
- GameBridge now buffers input evidence synchronously in a ref before end-of-run submission and ignores duplicate finish messages for the current server run ID; this avoids a React state batching race and repeated end requests.
- Evidence validation rejects a reported score above the input transcript's forward-move count, derived from the current engine's one-row-per-forward-move scoring rule. This does not perform replay verification or award score.

## Not yet established
- No independent security review, hostile-input API integration tests, browser cookie/CORS/iframe tests, or deployed Worker smoke tests. Browser automation could not start because the CUA trusted Node process exited unexpectedly; Cloudflare has no deployed Worker/staging endpoint to test.
- GAME_REPLAY_ENABLED has not been enabled; deterministic replay and verified event progression/referral qualification are absent.
- The server-issued seed is unused by the client engine. Gameplay generation includes random map/obstacle/vehicle/log choices and per-frame movement/collision updates, so the current input transcript cannot establish a reproducible score. This is a hard reward-security gate, not a client UI toggle.
- Quest catalogue/claim code is present but no server event advances progress or marks quests complete; do not describe quests as end-to-end active.
- MyLead callback signing and conversion anti-replay are absent. Rewarded-ad success is disabled. Provider scripts/assets were not audited independently; only user-provided Monetag settings are present.
- Do not configure reward delivery until sender domain, encryption key, admin token, secret storage, domain verification, inventory and a real email test are verified.
- Canonical Bun 1.4.2 audit reports 8 advisories (7 high, 1 moderate, no critical) after safe updates, compatible overrides, removing unused EAS CLI, and upgrading GSAP to v3. Remaining findings include `node-forge` (no published safe version), Expo Metro's `image-size` 2.x incompatibility, and `uuid`; delivery remains gated pending triage.
- Current local rerun: frontend lint/build, Worker TypeScript, 10 unit tests, both Wrangler dry-runs, direct game ESLint (0 errors, 68 warnings), and Expo web export pass. Wrangler authentication is absent, so no Worker/API deployment or staging/browser E2E has run. No Worker or api/game DNS records are available.
- Disable-devtool deterrence, obfuscation and CSP policy are not claimed as implemented. These are deterrence measures and do not replace server validation.

## Live staging check (2026-10-02)
- Wrangler authenticated; only staging Worker `dashcup-9289-staging` deployed. Neon staging `DATABASE_URL` is stored as Cloudflare `secret_text`; its value was not emitted. No production secret/deploy/migration occurred.
- Staging health confirmed database connectivity. Bootstrap/session and `/api/me` succeeded; allowed-origin preflight returned 204, disallowed origin 403, invalid CSRF 403; game start succeeded with bootstrap CSRF and game end returned pending/score zero/trophies zero. Static index and a texture asset returned 200.
- Browser cookie/iframe E2E is not verified: CUA trusted Node initialization fails with workspace ACL startup error. A 70 concurrent + 70 sequential request probe saw no 429; Cloudflare documents the Worker binding as a permissive per-location/per-machine counter, so intended throttle behavior remains unverified. API checks do not substitute for browser testing.
- Replay and reward email remain disabled; no client score is awarded. Do not deploy production before replay/progression and browser release gates pass.

## Latest staging rate-guard update
- Shared rate-limit decision helper is used by the Worker; added test verifies a rejected binding result returns HTTP 429 with `RATE_LIMITED`. Worker tests now pass 11/11 and Worker typecheck passes.
- Latest redeploy of the existing staging Worker is version `b5015c4f-de67-42ca-96a4-011f7ca301db`; no game assets changed. Staging health confirms `ok=true`, environment `staging`, and database connected. Replay/email flags remain false.
- Live probe saw 140 successful health responses (70 concurrent, 70 sequential), without a 429. Cloudflare documents this binding as per-location/per-machine and permissive/eventually consistent; live throttle outcome remains unverified. No production Worker or DB changes.

## Continuation security review — 2026-10-02

- Verified the new run path in staging: normal bounded evidence accepted; same-token replay and altered-evidence replay returned 409; quest claim succeeded once and returned 409 on duplicate.
- Invalid run credentials and malformed evidence are rejected and recorded as reason codes. Reused-run logging stores hashes/reason codes, never raw bearer tokens. Database writes for accepted run/progression are atomic in one SQL statement.
- Staging CSRF, exact-origin CORS, session cookies, request limits, and mocked Cloudflare limiter rejection were covered by existing checks. The Cloudflare Rate Limiting binding is configured at 60/60s; measured traffic did not reliably trigger 429, so this is not reported as a proven live threshold.
- Residual: evidence remains client generated, and no deterministic replay validates the actual game state. The score ceiling is an input-count plausibility rule only. `GAME_REPLAY_ENABLED` remains false and no game-run trophies are directly awarded.
- Reward-ad, Resend, MyLead PPI/CPA, and Hilltop payouts remain disabled until real server-verifiable provider configuration exists. Secrets remain server-side.
- The existing Expo game bundle was exported and served via the staging Worker's existing asset binding. The modified embedded game-over path suppresses the unrelated original source-game offers and utility controls; this does not change game rules or trust client scores.

## Current production security verification (2026-10-02)

- Production API health: HTTP 200, database connected, `Cache-Control: no-store`. Credentialed CORS preflight for `https://www.dashcup.com`: 204; unlisted origin: 403. Both apex and www are allowed by the newly deployed Worker config.
- API/game requests use the existing Cloudflare Worker custom domains and TLS. API/game DNS resolves at Cloudflare authoritative DNS and 1.1.1.1; the local system default resolver remained stale during this check.
- Production game replay remains disabled; evidence is plausibility-checked only. No game trophy should be considered earned from an unverified browser score. Rewarded-ad, provider conversion and Resend delivery remain disabled until trusted provider verification/secrets exist.
- Production `DATABASE_URL` is stored as a Cloudflare Worker secret; secret values were neither printed nor committed. Reports contain no plaintext reward codes or API credentials. Production smoke bootstrap created a single anonymous test account/session plus initial quests; no gameplay or redemption records.
- Browser E2E is unverified due the CUA startup error. Cloudflare live rate-threshold behavior also remains unproven despite configured binding and unit coverage. See BLOCKERS.md.

## Resend account check (2026-10-02)

- The connected Resend account currently lists `dashcup.com` with status `not_started` and sending capability enabled; it does not list `mail.dashcup.com`. Domain verification is therefore not confirmed. Production delivery remains disabled; no test email was sent.

## Anti-cheat hardening — staged, not yet production (2026-10-02)

- Structural and plausibility controls now include strict evidence keys/directions, automatic initial forward move, timestamp monotonicity, at least 50 ms separation, duration bounds, per-second density and score-velocity ceilings, score bounded by forward inputs, and a 10-second server-start-time comparison using Neon time.
- Accepted evidence is hashed across score/duration/inputs; repeated exact suspicious payloads are flagged, and run token reuse/tampering, honeypot, bad structure and duration mismatch are written to `suspicious_runs`. Errors log only a whitelisted SQLSTATE code, not evidence values or secrets.
- Staging smoke passed accepted plausible run, speed rejection, server duration mismatch, duplicate token, session/CSRF and referral progression. The submit response explicitly says `plausibility_checked` and pays zero immediate game trophies. Exact game-score reproduction is not claimed; replay remains disabled.
- A global-per-IP Cloudflare rate key prevents path-based key rotation. 429 was observed with a temporary five-per-minute staging configuration; restored staging config is 60/min. This is an eventually consistent regional control, not a global accounting guarantee.
- The above code is staged only until production deployment. Resend, ad payouts, and provider conversions remain disabled.

## Production anti-cheat rollout verification (2026-10-02)

- Production Worker version `5f3cc03f-e822-415a-a097-36de130f6148` is live on the existing API/game custom domains. Health returned 200 with Neon connected; no-session protected POST returned 403; apex/www preflight 204 and unlisted origin 403.
- Staged controls were exercised before promotion: plausible run accepted only as `plausibility_checked` with zero direct game trophies; impossible velocity 422; server duration mismatch 409; duplicate run 409; referral quest progressed on accepted run; repeat suspicious evidence logged. No claim of perfect game-score reproduction is made.
- Cloudflare limiter set at 60/min per-IP across API routes. Temporary staging 5/min returned 429, then staging and production were restored to 60/min. Cloudflare regional counters are eventual/soft and are not a strict global quota.
- Replay and payout/email remain disabled. No frontend rebuild/deployment occurred.

## Resource and request minimization — 2026-10-02

- Practical anti-cheat checks remain before the durable run update where possible; the release does not claim deterministic replay or perfect server-side score reproduction. A valid submitted run earns zero direct game trophies; quest/referral progress follows authenticated plausibility-checked game completion.
- Game input evidence stays in a local bounded buffer and is sent once at run finish. No per-frame/per-input network calls or telemetry stream was found. Existing hashed one-use run token, expiry, evidence hashing, CSRF, exact-origin credentialed CORS, size/input bounds, timing/order/enum checks, score plausibility and suspicious-run handling remain.
- Mutation route limiting is separate from the broad API limit: configured 30/60s vs 60/60s per IP/key. Cloudflare binding counters are per-location and eventually consistent, so treat them as best-effort abuse controls rather than exact global caps ([Cloudflare docs](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/)).
- The closed leaderboard query is limited to the top 20 before selecting eligibility; it does not load the full ranking for each dashboard visit. Existing rank index is used in staging's execution plan. Authenticated user data remains uncacheable (`no-store`); only content-addressed game files are immutable cached.
- Staging verified session/CSRF run start/end, implausible run behavior through existing tests, quest progression/claim, duplicate claim safety, exact-origin CORS and asset delivery. Production verified health/Neon, CORS, unauthenticated start rejection and game/static routes after Worker promotion.
- No game engine replay rewrite or trusted reward from 5x UI input was added. Reward email, rewarded ads, and provider conversion payouts remain disabled until trusted provider verification/configuration exists.

## CPAlead sponsor integration review — 2026-10-03

- The client cannot complete a sponsor quest: the offer start is CSRF/session protected, the user-to-subid map is generated/stored server-side, and quest progression only occurs from the callback endpoint.
- `/webhooks/cpalead` accepts a provider GET without browser cookies but requires a separately configured password checked with constant-time comparison, an allowlisted campaign, an allowed country, a recent attributed click UUID and a valid provider `lead_id`. Payout values are ignored. The unique `(provider, transaction_id)` database constraint makes callbacks idempotent, and quest increments share the conversion SQL statement.
- Tracking links and CPAlead credentials are never included in bootstrap. The publisher API key is not needed by the Offers API and is not used. Because it appeared in chat, rotate it before future use. Campaign display remains disabled until the callback password is configured.
- Residual checks: no live callback password/provider setup was available, so staging valid/invalid/duplicate conversion cases, provider reversal behavior, and production deployment are unverified. Country is trusted from Cloudflare at page/start request; device is inferred from request UA/client hints and remains a display filter while CPAlead applies its own landing eligibility.
- No dependency or database schema changes were made. Canonical Bun audit reports 8 Expo advisories (7 high, 1 moderate); frontend production dependency audit reports 56 advisories, including one critical. Browser E2E is unavailable due to environment startup ACL failure.

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

## Game score and loss-screen security update (2026-10-02)

- Trophy awards use only fresh server-issued run IDs/tokens that pass one-use, expiry, session, CSRF, bounded evidence, timestamp, input, duration, and score plausibility checks. Accepted score points convert 1:1 to trophies in the same transaction as leaderboard accounting.
- This is practical anti-tamper filtering. The server does not reproduce the game or prove the exact client score. UI/API wording says `plausibility_checked`.
- A used run cannot be replayed; staging returned 409 for duplicate end submission. Rewarded-ad 5x stays disabled and cannot affect wallet totals.
- The iframe allows only the existing apex/www/staging/local parent origins, validates both source window and origin, and recovers from missed readiness messages with bounded local ping retries.

## Production game protections (2026-10-02)

- Production Worker version `b38fe224-1a9f-4c2d-b319-6f1abd253587` is serving the existing API/game domains. Live checks returned API health 200 with Neon connected, game asset 200, CORS allowed site origin and rejected unlisted origin, anonymous start 403.
- Stage integration showed score 1 produces one wallet trophy and one active-cycle leaderboard point; a replayed end token returns 409. This confirms practical plausibility filtering and duplicate protection; deterministic server score reproduction is not implemented or claimed.
- `GAME_REPLAY_ENABLED=false`; rewarded-ad payouts, Resend delivery and provider rewards remain disabled.

## Startup and evidence verification (2026-10-03)

- The iframe handshake still checks both the exact game origin and source window. Duplicate start messages for the active run repeat only the acknowledgement; they do not reset evidence.
- API start now aborts after 12 seconds and returns a visible recovery state. Parent retries use iframe `postMessage`; gameplay adds no per-input network requests.
- A live production browser click started the game and showed score 1. The smoke run was not ended, so it made no production score/trophy write. Staging separately confirmed score 1 → 1 trophy and duplicate-end 409.
- Web audio is gated until a user gesture inside the iframe. No score validation or reward authority moved to the client.

## Client telemetry update (2026-10-03)

- Lightweight client anti-cheat signals now observe input cadence, score growth, coarse movement targets, state shape/transitions, focus/visibility changes, shortcut events, and rapid restarts. These are client-controlled and are not a trusted boundary.
- The API allow-lists and bounds signal fields and records recognized flags in the existing game's `suspicion_flags` column during the same atomic run-consumption update. The client-provided score is ignored; the server recalculates a bounded score from recognized flags. No decision about validation, trophies, quests, or rewards uses the telemetry.
- No `disable-devtool` package was installed. The existing dependency was absent and the user's lightweight requirement excludes intrusive polling/interaction blocking; event-based shortcut signals are used instead.
- Tests verify unknown flags are dropped, duplicates are removed, counts are server-derived, focus counts are capped, and client-reported suspicion scores are ignored.

## Reward inventory/admin review — 2026-10-03

- Codes are encrypted at rest using AES-256-GCM with reward-type AAD; duplicate fingerprints are SHA-256 normalized before storage. No public API returns code ciphertext, plaintext codes, fingerprints, or the Resend key. The public bootstrap exposes only five available-stock counts.
- Each reward type has 20 unique slots. Redemption locks the authenticated user and one eligible same-type slot/code with `FOR UPDATE SKIP LOCKED`, inserts one redemption under the existing `(user_id,cycle_id)` uniqueness, then reserves the code in a single SQL statement. Failed or ambiguous delivery retains the same reserved code; retries reuse the same redemption and code. Provider-confirmed send marks that one code delivered.
- Admin username/password hash are Worker secrets/configuration; passwords use PBKDF2-SHA256 at the Cloudflare Workers Web Crypto limit of 100,000 iterations and are never persisted. Session tokens are random opaque values with only their SHA-256 digest stored in Neon. The HttpOnly/Secure/SameSite=Strict cookie expires in 8 hours and is path-scoped to `/api/admin`. Every admin API endpoint enforces exact `https://admin.dashcup.com` Origin and server-side session. The portal uses CSP nonce, no-store, noindex, and does not persist credentials or display old code values.
- Resend idempotency uses redemption ID/attempt key. A signed webhook updates delivery state once per event ID. `accepted` remains pending until webhook confirmation; a provider/network ambiguity becomes `provider_unknown` and cannot auto-retry. Admin reconciliation requires an operator to inspect Resend first. Provider errors and logs exclude codes and response bodies.
- Admin sign-in uses configured Worker secrets and was live-verified after correcting the Worker-incompatible PBKDF2 cost. Reward email and inventory import remain fail-closed because the encryption key and Resend sender/API/webhook configuration are absent. `REWARD_EMAIL_DELIVERY_ENABLED=false`. Production has 100 empty slots; no reward codes were added.

## CPAlead sponsor update — 2026-10-04

- The existing staging and production Workers now both have the postback secret bound. Missing and incorrect callback passwords return 403; the secret is not returned or logged by the application.
- Fixed SQLSTATE `42P18` by explicitly typing interpolated string parameters used by the click and callback JSON metadata constructors. Staging and production offer-start checks now return 200 and store the UUID attribution without advancing quest progress.
- Production callback route is deployed on `api.dashcup.com`; the CPAlead dashboard still needs its callback host changed from staging to production. No genuine conversion or duplicate callback test has run yet, so verified quest-progress advancement is not claimed. User claims remain guarded by completed/unclaimed server-side state and the atomic wallet update.

## Cycle-scoped trophies and reward claim authorization — 2026-10-04

- Reward claim rank is calculated from the immediately preceding biweekly `cycle_scores` set, with deterministic tie ordering. Redemption checks that same closed cycle and verifies the 14-day post-close window before reading or reserving inventory. Once the next cycle begins, the prior cycle is no longer eligible; retries are similarly scoped.
- Public trophy totals are sourced from the active cycle ledger, not the legacy lifetime field. Quest claims add into the active biweekly cycle score, remain atomic/idempotent, and no client-provided rank/total participates in reward decisions.
- Staging smoke verified 10 accepted runs and a 1,000 trophy quest claim yielded matching API and bootstrap current-cycle totals of 1,010. Production deployment is pending.

### Production cycle/reward verification — 2026-10-04

- Production Worker `dashcup-9289` version `66400b8d-5a72-45cd-b087-a85778663d92` is active at 100%; health returned 200. Staging validated run/quest-cycle totals and server-authoritative claim-window logic. The redeem path checks current-cycle window before querying/reserving a code. No reward code or email provider was enabled by this release.

## Third-party ad script reduction — 2026-10-04

- Removed the page-mounted Hilltop banner script and third-party Monetag service-worker import after reports that ads were opening during dashboard navigation. The separate Hilltop VAST player remains user-gesture gated and grants no rewards.

## Arcade ad iframe boundary — 2026-10-04

- The supplied external loader was tested in a sandboxed iframe, where it rendered repeated fake browser-security warning panels. It was removed rather than exposed to site visitors. The current Arcade banner slot runs no third-party script.
- No ad click, view, or playback signal is treated as trusted completion or reward evidence. VAST state does not affect trophies or quests.
- Local VAST pacing uses browser storage and is not security-sensitive. App code passes no credentials or user/session identifiers to the ad provider.

## Final live ad safety check — 2026-10-04

- The brief Pages deployment containing the supplied ad script was superseded with commit `f71e48d5793c8233ed59e5139f43bc79fd66e7ae`. Live browser state now shows only the paused banner message; the submitted remote code is absent from final source and build.
- The VAST control was manually exercised. No ad filled, and no reward/quest state is tied to the ad. Production Worker and Neon were untouched.

## Published VAST autoplay implementation — 2026-10-04

- The existing every-ten-runs VAST trigger now requests autoplay-compatible muted inventory and starts the ad manager as soon as a manager/creative is available. Browser policy may reject autoplay and require a player tap. A prior live request received no fill, so actual play is not verified.
- Removed the extra manual schedule/button and changed only informational Rewards email copy. Ad viewing continues to have no effect on points, quests, or redemption.

## Hilltop banner and corner placement — 2026-10-04

- Frontend commit `4d5cf3857f187d7dfe9b5cf4412bef6e76816dd0` is live on existing Pages project `dashcup-9289`, production deployment `f0854166-9792-4bcb-bd38-f1df0dfbe0c9` (successful). Existing `dashcup.com` and `www.dashcup.com` aliases remain active.
- Live browser verification: the Arcade banner slot visibly rendered a provider banner creative. The requested corner tag rendered a video creative on the initial load; on a later view the corner frame was blank, so its fill/playback is intermittent and controlled by Hilltop inventory. The corner iframe is now mounted on all dashboard tabs.
- Both third-party tags run in separate sandboxed opaque-origin iframes (`allow-scripts allow-popups` only); no Worker/API request, Neon query, or DB write was added. The previously disabled push tag that showed fake browser-security warnings remains absent.
- `pnpm lint`, `pnpm build`, and `git diff --check` passed before deployment. This was frontend-only; Worker and Neon were unchanged.

## Replaced Hilltop run ad tag — 2026-10-04

- Frontend commit `fe72d0edc66d235480c141eeffdf73abf5f73c3c` deployed successfully to existing Pages project `dashcup-9289` as `6045b21d-b456-458e-a822-0ae2704c7d2f`; aliases include `dashcup.com` and `www.dashcup.com`.
- Removed the previous `second-director.com` VAST URL, Google IMA player, and custom full-game video overlay. Removed the prior fixed floating corner iframe. The supplied Hilltop tag is loaded from the page after every tenth completed local run, with a per-run duplicate guard; no extra API or database work was added.
- Production browser check confirms the normal ChickenDash game and Arcade banner still render, with no fixed corner player at page load. Local lint/build and bundled-output checks pass; the supplied tag is present, while the previous VAST tag and “No video ad available” overlay are absent from the built frontend.
- The new tag is an in-page placement script, not a VAST URL. Production playback/creative was not verified by completing ten games; delivery and format depend on Hilltop inventory. The external script runs in the site document and can manage its own placement, as requested.

## Hilltop VAST tag for every tenth run — 2026-10-04

- Frontend commit `c303f7e1b9658272c98cc8069edc0ab9e7bed752` is live on the existing Pages project `dashcup-9289` as deployment `84aeb9c7-eb15-4026-bef8-7ea5083f9fc4`; Cloudflare build/deploy succeeded and apex/www aliases are active.
- Replaced the previous in-page run tag with the user's `hta-code-7484353 (1).txt` endpoint. A direct endpoint check returned HTTP 200 HilltopAds VAST 3.0 XML with 12 MP4/WebM media entries. Production source triggers an IMA ad attempt after each tenth completed local run and keeps the prior local run counter. The old VAST URL, old in-page tag, and “No video ad available” overlay text are absent from the current built bundle.
- Reintroduced only the video surface required by IMA. It has no custom frame/card/error panel; it closes quietly on no-fill or provider failure. Muted autoplay is attempted, with a small “Play ad” fallback for browsers requiring a direct user gesture.
- Live browser check confirms ChickenDash and the Arcade banner load normally with no video overlay at page load. `pnpm lint`, `pnpm build`, and `git diff --check` passed. A real tenth-run IMA playback was not exercised; provider XML has a video creative, but end-to-end playback remains unverified. No Worker/API call, Neon query, database write, or infrastructure change was added.
