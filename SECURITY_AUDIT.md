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
