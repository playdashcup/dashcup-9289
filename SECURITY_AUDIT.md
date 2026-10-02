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
