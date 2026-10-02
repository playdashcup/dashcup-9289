# DASHCUP security audit
Updated: 2026-10-02

## Present protections
- Server-generated random sessions; only hashes stored in Neon. Session cookies are HttpOnly, Secure, SameSite=Lax.
- Mutation endpoints require a server session and CSRF token. API applies explicit credentialed CORS allowlisting, no-store and rate limiting.
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
- No independent security review, hostile-input API integration tests, browser cookie/CORS/iframe tests, or deployed smoke tests. Browser automation could not start in this environment; Cloudflare has no deployed Worker/staging endpoint to test.
- GAME_REPLAY_ENABLED has not been enabled; deterministic replay and verified event progression/referral qualification are absent.
- The server-issued seed is unused by the client engine. Gameplay generation includes random map/obstacle/vehicle/log choices and per-frame movement/collision updates, so the current input transcript cannot establish a reproducible score. This is a hard reward-security gate, not a client UI toggle.
- Quest catalogue/claim code is present but no server event advances progress or marks quests complete; do not describe quests as end-to-end active.
- MyLead callback signing and conversion anti-replay are absent. Rewarded-ad success is disabled. Provider scripts/assets were not audited independently; only user-provided Monetag settings are present.
- Do not configure reward delivery until sender domain, encryption key, admin token, secret storage, domain verification, inventory and a real email test are verified.
- Alternate npm dependency resolution for the game reported 42 audit findings (1 critical, 18 high, 22 moderate, 1 low). This is not a Bun-lockfile audit; triage the canonical dependency tree before production game delivery.
- Disable-devtool deterrence, obfuscation and CSP policy are not claimed as implemented. These are deterrence measures and do not replace server validation.
