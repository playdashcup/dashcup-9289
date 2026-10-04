# DASHCUP deployment record
Updated: 2026-10-02

## Intended topology
- Cloudflare Pages serves the existing static Next.js frontend at www.dashcup.com.
- One Cloudflare Worker serves /api/* and game assets for api.dashcup.com and game.dashcup.com.
- Neon PostgreSQL is the only database.
- No D1, Neon Functions, or extra state services.
- Staging and production are configured separately in Wrangler; secrets must be set independently.

## Current verified provider state
- The existing `dashcup.com` zone is active in the intended account on `blakely.ns.cloudflare.com` and `norman.ns.cloudflare.com`. Do not create a duplicate zone or change the nameservers from the application.
- The Pages project is connected to the repository, production branch `codex/dashcup-rebuild`. Stable project URL https://dashcup-9289.pages.dev and `www.dashcup.com` return HTTP 200; the manifest and service worker also return HTTP 200. A proxied CNAME `www.dashcup.com` → `dashcup-9289.pages.dev` is configured and public DNS resolves through Cloudflare.
- No Worker scripts are deployed. Local Wrangler is unauthenticated. `api.dashcup.com` and `game.dashcup.com` have no DNS records pending deployment of the single Worker. Staging explicitly sets `routes: []`. Local Worker tests, typecheck, staging dry-run, and production dry-run pass.
- The apex DNS record is an unproxied A record to `127.0.0.1`; apex routing/redirect is not verified. Do not claim `dashcup.com` itself is serving the site.
- Neon project bitter-mode-91626896 has ready branches dashcup-staging (br-empty-cherry-b4mxu4la) and dashcup (br-purple-river-b4v27of0). Read-only migration check confirms `0001_initial` and `0002_resend_delivery` on staging. Production has no `schema_migrations` relation yet; do not migrate production until staging Worker gates pass.
- Resend currently lists only dashcup.com with status not_started; mail.dashcup.com is not listed in the connected account. Reward delivery remains disabled.
- Configure RESEND_WEBHOOK_SECRET from the Resend webhook signing secret and point it to /webhooks/resend to reconcile provider acceptance and delivery outcomes.

## Resend setup later
Create and verify a sending domain such as mail.dashcup.com in Resend. Add the exact DNS records Resend provides to the authoritative Cloudflare DNS zone after delegation is active. Configure the Worker secret RESEND_API_KEY and variable RESEND_FROM_EMAIL for the verified sender; configure REWARD_ENCRYPTION_KEY and only then set REWARD_EMAIL_DELIVERY_ENABLED=true. Keep the API key, encryption key and reward admin token in Worker secrets, never frontend/NEXT_PUBLIC variables. Test one controlled redemption before public delivery.

The code uses the redemption UUID as Resend Idempotency-Key and stores accepted, sent, rejected, and provider_unknown delivery states. Resend webhooks verify signed Svix headers and deduplicate event IDs. Ambiguous sends require webhook reconciliation or manual support review; the UI must never say a code was sent on provider acceptance alone.

## Before deployment
1. Keep GitHub branch codex/dashcup-rebuild as Pages production source and verify subsequent documentation-only builds.
2. The existing zone is now active and `www` CNAME is configured. Authenticate Wrangler in the workspace with `wrangler login` or use a securely configured deployment environment. Use only Cloudflare-provided/custom-domain targets.
3. Configure staging Worker secrets and Neon staging pooled DATABASE_URL, deploy staging, then smoke-test health, bootstrap, sessions, CSRF and static game assets.
4. Add api/game Worker custom domains after the Worker staging gates pass; validate DNS/TLS and CORS.
5. Migrate production Neon only after staging verification; set production secrets and deploy production only after gates pass.
6. Keep replay, ad rewards and reward email disabled unless their trusted provider verification and prerequisites are in place.
7. Resolve/triage the canonical Bun audit's 8 remaining advisories (7 high, 1 moderate) before release. CI runs `bun audit` from `games/expo-crossy-road/bun.lock`; frontend and Worker build/test jobs pass independently.

## Local commands
Frontend: pnpm install --frozen-lockfile, pnpm lint, pnpm build.
Worker: cd server; pnpm install --frozen-lockfile; pnpm test; pnpm typecheck; pnpm exec wrangler deploy --dry-run.
Game CI uses Bun in games/expo-crossy-road: bun install --frozen-lockfile; bunx expo lint; bunx expo export -p web --output-dir ../../server/game-dist.

## Live continuation status (2026-10-02; supersedes older deployment status)
- Existing Pages project `dashcup-9289` remains the frontend source of truth. Cloudflare confirms active `dashcup.com` zone, Pages domains `dashcup-9289.pages.dev`, apex, and www, and proxied apex/www CNAMEs to the existing Pages hostname. Apex, www, manifest, and service worker returned HTTPS 200.
- Wrangler authenticated and deployed the existing Worker config to staging only: script `dashcup-9289-staging`, https://dashcup-9289-staging.play-dashcup.workers.dev, version `6aef8761-d60c-4470-a024-509679ece2b8`. Replay and reward email remain disabled.
- Staging Neon `DATABASE_URL` is stored as a Worker secret from project `bitter-mode-91626896`, branch `dashcup-staging` (`br-empty-cherry-b4mxu4la`). No production secret/migration was applied.
- Staging API/asset checks are detailed in BUILD_REPORT.md. Browser E2E did not run because CUA initialization exits; rate-limit outcome is unverified.
- Do not deploy production or bind production `api.dashcup.com`/`game.dashcup.com` yet. Remaining release gates: browser E2E, actual deterministic replay/tests, quest/referral event progression, trusted provider callbacks and Bun audit triage. After staging passes, migrate production Neon from existing migrations, verify schema, configure production secrets, deploy the existing single Worker, then validate Cloudflare custom domains/TLS.

## Latest staging rate-guard update
- Shared rate-limit decision helper is used by the Worker; added test verifies a rejected binding result returns HTTP 429 with `RATE_LIMITED`. Worker tests now pass 11/11 and Worker typecheck passes.
- Latest redeploy of the existing staging Worker is version `b5015c4f-de67-42ca-96a4-011f7ca301db`; no game assets changed. Staging health confirms `ok=true`, environment `staging`, and database connected. Replay/email flags remain false.
- Live probe saw 140 successful health responses (70 concurrent, 70 sequential), without a 429. Cloudflare documents this binding as per-location/per-machine and permissive/eventually consistent; live throttle outcome remains unverified. No production Worker or DB changes.

## Current verified deployment — 2026-10-02

- Existing Pages project and frontend were preserved. `https://dashcup.com`, `https://www.dashcup.com`, `https://dashcup.com/manifest.webmanifest`, and `https://www.dashcup.com/sw.js` each returned HTTP 200.
- Existing staging Worker was deployed, not replaced: `https://dashcup-9289-staging.play-dashcup.workers.dev`, version `c7d9b2d7-e0a5-40d3-8c8d-af4652864849`. Wrangler reports the existing account and staging rate-limit binding `60 requests / 60 seconds`; provider-specific live throttling remains unproven.
- Neon project `bitter-mode-91626896`, staging branch `br-empty-cherry-b4mxu4la`: health query succeeded. No production migration or production secret change was made.
- Staging integration verified one-time game session submission, plausibility checks, duplicate/tampered replay rejection, daily/weekly play and PB progression, qualifying referral progress, and idempotent quest claim behavior.
- `api.dashcup.com` and `game.dashcup.com` do not resolve as of this check. Production custom domains and Worker deployment remain pending.
- Pages was not rebuilt. The existing GameBridge source has the requested `5x Reward` text, but the published site does not receive that edit until a Pages deployment is allowed.
- Reward email, rewarded-ad payouts, and MyLead/Hilltop-dependent rewards remain disabled until their real external configurations are verified. See `BLOCKERS.md` for remaining release gates.
- The exported Expo game build was served through the existing staging Worker; this is a game asset update, not a Pages/frontend rebuild.
- Latest staging smoke after the Expo asset refresh: API health/database, no-store response, allowed CORS preflight, denied-origin CORS, missing-CSRF rejection, game index, and the 2.16 MB Expo JS bundle passed.
- Production migration is not applied: connected Neon preflight rejected the existing combined migrations at the `record_reward_email_change()` dollar-quoted function. Production branch remains unchanged; an approved supported migration path is still needed.

## Production deployment — verified 2026-10-02

- Existing Pages project and frontend were preserved. `https://dashcup.com/`, `https://www.dashcup.com/`, `https://dashcup.com/manifest.webmanifest`, and `https://www.dashcup.com/sw.js` returned 200. No Pages build or deployment was performed in this continuation.
- The existing Worker `dashcup-9289` serves both `api.dashcup.com` and `game.dashcup.com` as custom domains. Production deploy version: `7e3b55c8-c35c-44e9-a204-470e5d91841a`; Wrangler deployment list confirms 100% traffic on that version. Game root and Expo JavaScript asset returned 200 over HTTPS.
- Neon `bitter-mode-91626896` production branch `br-purple-river-b4v27of0`, database `neondb`: migrations `0001_initial` and `0002_resend_delivery` applied; 17 public base tables verified. Production `DATABASE_URL` is a Cloudflare Worker secret and was not printed or stored in source. API health reports database connected.
- Production CORS preflight allows www (and config now allows the apex); allow response was HTTP 204 with credentialed origin/no-store. An unlisted web origin was rejected with 403.
- Cloudflare authoritative nameservers and resolver 1.1.1.1 resolve API/game. Workstation default DNS still reports NXDOMAIN after resolver cache flush. Recheck from another resolver/device if needed; the Cloudflare Worker routes and TLS have been verified by fixed-edge HTTPS requests with the correct Host/SNI.
- Staging Worker remains `https://dashcup-9289-staging.play-dashcup.workers.dev`, version `c7d9b2d7-e0a5-40d3-8c8d-af4652864849`; staging integration evidence is in BUILD_REPORT.md.
- Existing website Pages output was intentionally left untouched. Source updates to GameBridge remain unpublished pending a separately authorized Pages deployment. `GAME_REPLAY_ENABLED=false`; `REWARD_EMAIL_DELIVERY_ENABLED=false`.
- Later Resend setup: create/verify a sending domain such as `mail.dashcup.com` in Resend, add the exact DNS records Resend provides to the authoritative Cloudflare zone, set the server-side `RESEND_FROM_EMAIL` and API/webhook secrets, then explicitly enable production delivery. Do not place the Resend key in frontend or `NEXT_PUBLIC_*` variables.
- A production bootstrap smoke check created one anonymous test user/session and its initial quest rows; no gameplay or redemption data was created.


## Resend account verification (2026-10-02)
The connected Resend account lists dashcup.com (status 
ot_started, sending capability enabled) and does not list mail.dashcup.com. No domain is verified for this app yet. Keep reward-email delivery disabled. When the intended subdomain is created, add the precise DNS records Resend supplies to Cloudflare, confirm verification, set the Worker sender/API/webhook secrets, then enable delivery.


## Staged anti-cheat rollout (2026-10-02)

- Staging version `49ccb780-68e1-49db-b1bf-0bf43ff832b9` runs the strengthened evidence checks and restored `60 requests / 60 seconds` global-per-IP Worker binding. A temporary staging threshold of 5/min returned 429, after which staging was restored to 60/min.
- Smoke validated start auth/CSRF, high score velocity rejection, server-issued start-time matching, acceptable submission, one-time run replay rejection, referral qualification and quest progress. Suspicious repeated evidence is recorded with hashes/reason codes.
- No staging or production database schema change was needed for this update. Production Neon migrations remain `0001_initial`, `0002_resend_delivery`.
- Staging passes worker tests (11/11), typecheck, root lint and Wrangler dry-run. Next step is deploy the same Worker source to the existing production Worker and run read-only health/CORS/game-asset smoke checks. Pages remains unchanged.
- Deterministic replay is not required. Keep replay flag false and do not call plausibility-checked scores perfect authoritative reconstructions.

## Production anti-cheat Worker release (2026-10-02)

- Deployed existing `dashcup-9289` Worker to custom domains `api.dashcup.com` and `game.dashcup.com`, version `5f3cc03f-e822-415a-a097-36de130f6148`. No second Worker/zone was created.
- Staging version `49ccb780-68e1-49db-b1bf-0bf43ff832b9` passed practical anti-cheat, session/CSRF, replay protection, quest progression and referral qualification smoke checks before promotion.
- Production health and Neon connectivity returned 200/true. Apex/www CORS preflights returned 204; unknown origin returned 403; no-session game-start returned 403. Game root returned 200 and full Expo JS asset returned 200 at 2,162,206 bytes. HTTPS routes are live.
- Production Neon schema remains on already applied migrations `0001_initial` and `0002_resend_delivery`; no additional migration was needed. Replay and reward email flags remain false.
- Rate limiter restored to 60/min per IP across API routes. Staging-only five/min test produced 429; reverted to 60/min before production.
- Existing Pages deployment remains untouched by this release; no frontend build or Pages deploy occurred.

## Resource optimization rollout — 2026-10-02

- Existing Pages project `dashcup-9289` remains connected to `codex/dashcup-rebuild`; custom domains remain `dashcup.com` and `www.dashcup.com`. No new Pages project or rebuild from a different frontend source was created. Source changes are included in the current branch release.
- Existing Worker production deployment version: `abb362f1-c420-48b5-9511-21ce7851a1d5`, custom domains `api.dashcup.com` and `game.dashcup.com`; staging version: `0449293a-0203-4d1c-b032-2f761e0511c8`.
- Both rate bindings are configured in staging/production: shared API 60/60s and expensive mutation 30/60s per key/IP. Cloudflare documents rate-limit bindings as location-scoped and eventually consistent; a configured threshold is not a strict global limit ([Cloudflare Rate Limiting](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/)).
- API health returns 200 with Neon connected. Production CORS allows the exact apex/www origins and rejects an unrelated origin. Unauthenticated game start returns 403. Game root and the 2,162,206-byte hashed Expo bundle return 200; the bundle cache header is one-year immutable and API health stays `no-store`.
- Existing `dashcup.com` verification file, manifest, `sw.js`, apex and `www` return 200. No database migration was run in this optimization release.
- Staging lifecycle: session bootstrap, CSRF-protected start/end, daily play quest progress/claim, duplicate claim rejection (409), reward status, CORS allow/deny and game asset all verified. Resend delivery and ad/provider conversions remain disabled.
- Git-connected Pages deployment is associated with the existing project and production branch. Confirm the newest Pages deployment after the source commit push; custom-domain HTTP checks returned 200 before this optimization was published.

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

## Continuation deployment state (2026-10-02)

- Updated Expo web export was deployed to staging Worker `dashcup-9289-staging`, version `c17e0fac-6b50-4871-89c9-5ce62d60dd3f`.
- Staging Neon flow passed: bootstrap/start/end 200; score 1 awarded one trophy; duplicate end returned 409.
- Production Worker and existing Pages project have not yet received this continuation. Frontend lint/build and Worker tests/typecheck/dry-runs pass locally.
- The app favicon/header logo now use `public/dashcup-logo/logo-icon.svg` and `logo.svg`; the transparent logo pack is also downloadable as a ZIP.

## Production release (2026-10-02)

- Production commit `19e1a7e60811a33107bd7f34d56444723d2b53df` is pushed; Pages deployment `86422c0b-89b7-4332-b6bc-65a656a05b84` from the existing `dashcup-9289` project serves the new logo and UI.
- Production Worker version `b38fe224-1a9f-4c2d-b319-6f1abd253587` serves the existing API and game custom domains. Health/Neon, game asset, CORS allow/deny, apex redirect and anonymous start denial were checked live.
- The current production game host bundle contains `dashcup:ping`, `dashcup:ready` and apex origin support. Staging checked score award/leaderboard and duplicate run rejection.
- Browser E2E is not verified: Brave can render the page via `--dump-dom`, while CDP startup exits with `Multiple targets are not supported in headless mode`.

## ChickenDash launch hotfix (2026-10-03)

- Existing Pages project `dashcup-9289`: deployment `8c76b54c-ce5a-4ae4-8be9-a38750bfd867` succeeded and retains `dashcup.com`/`www.dashcup.com`.
- Existing Worker `dashcup-9289`: production version `c06cf1cc-9a75-4774-b6fa-df2d11427bfe` on `api.dashcup.com` and `game.dashcup.com`; staging version `a6e29250-5a39-4125-b0f9-25aaf0192b8c`.
- The Expo bundle now imports the GSAP compatibility names used by the game, fixes the initial move timing race, retries the iframe handshake safely, and gates web audio until a gesture in the iframe.
- Live production browser Start reached gameplay with score 1; production health reports Neon connected. Staging confirmed score 1 → 1 trophy and duplicate-end 409.
- Repair source commits and follow-up deployment documentation are pushed on `codex/dashcup-rebuild`.

## Anti-cheat telemetry release (2026-10-03)

- Worker `dashcup-9289` production version `da81baae-b14b-4961-9e4e-a084924cba2c` is active on `api.dashcup.com` and `game.dashcup.com`; staging version is `1ba67064-d21d-4326-8886-638c9bf3e3cc`.
- Existing Pages project `dashcup-9289` deployed source commit `4f0986b` as active deployment `2ded517f-db0c-4de8-9289-41a721d0e549`.
- Production health reports Neon connected; game asset responds 200 and credentialed CORS allows `https://www.dashcup.com`.
- Staging verified bootstrap, CSRF rejection, start/end, sanitized client signals, and duplicate end rejection (409). No production game-end submission was made.
- Replay remains disabled (`GAME_REPLAY_ENABLED=false`); Resend and reward payouts remain disabled.

## Redeem inventory/admin portal rollout (2026-10-03)

- The existing Cloudflare Worker `dashcup-9289` now also serves `https://admin.dashcup.com/`; this is the same Worker, not a second service. The portal is not linked from public navigation, has noindex/no-store/CSP headers, and its APIs require exact admin origin plus a hashed database session in an HttpOnly/Secure/SameSite=Strict cookie.
- `run_worker_first` covers `/api/*`, `/`, and `/index.html` so the admin page reaches its host-specific Worker handler. The `/` Worker invocation also applies to the game host; other assets continue through the existing asset fast path. API replies remain no-store.
- Neon project `bitter-mode-91626896`: staging `br-empty-cherry-b4mxu4la` and production `br-purple-river-b4v27of0` both contain migration markers `0006_reward_inventory_admin` and `0007_reward_email_verification`. Production has exactly 100 inventory slots (20 per reward type), currently all empty.
- Latest deployed staging Worker version is `cd358f26-edb5-4447-9d6d-ec8350806c4a`; production is `0e2f9d1e-c064-4eda-a155-0b254d37ebba`. Production health/database, admin portal security headers, admin API CORS, unauthenticated 401, unconfigured-login 503, game root and bootstrap all passed. Reward delivery remains explicitly disabled.
- Configure admin access only after choosing the username/password. In `server`, set `DASHCUP_ADMIN_PASSWORD` in the current PowerShell process without echoing it, run `node scripts/hash-admin-password.mjs`, copy only the resulting PBKDF2 hash into the interactive `wrangler secret put REWARD_ADMIN_PASSWORD_HASH` prompt, then remove the local environment variable. Set `REWARD_ADMIN_USERNAME` through Wrangler's secret prompt too. Use `--env staging` for staging; use `--env=""` for the production top-level config. Never put the plaintext password in Git, command history, the site, or a committed env file.
- Cloudflare Workers Web Crypto supports at most 100,000 PBKDF2 iterations. `scripts/hash-admin-password.mjs` emits that supported work factor and the Worker accepts only that exact count; hashes created with higher iteration counts will fail in Workers even if Node.js can verify them.

## Admin sign-in recovery — 2026-10-04 (current)

- The old admin hash used an unsupported 310,000 PBKDF2 iteration count. The Worker verifier, hash utility, and tests now use Cloudflare Workers' supported 100,000 iteration ceiling.
- Production credentials were updated through Wrangler secret storage. No credential values are recorded here. Current active Worker version: `b3d7f1e5-c56a-4d16-bfc6-c8c7076c0675` (100%). Live verification: login 200, authenticated session confirmed, logout 200, subsequent session 401. No Pages deployment or database migration was needed.
- The admin sign-in blocker is resolved. Reward-code imports and email delivery remain disabled until their separate encryption, inventory, and Resend requirements are configured.
- Admin username and password hash, `REWARD_ENCRYPTION_KEY`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, and `RESEND_WEBHOOK_SECRET` are not configured in production. Generate a random 32-byte encryption key and enter it through Wrangler's secret prompt. Add codes in the admin portal only after encryption is set and carefully verify each code/category; never paste codes in logs or chat.
- To enable real mail later: verify the sending domain and sender address in Resend, add the provider's exact DNS records to Cloudflare, set all four email/encryption values above as Worker secrets, configure the Resend webhook to `https://api.dashcup.com/webhooks/resend`, verify its signing secret, and only then change `REWARD_EMAIL_DELIVERY_ENABLED` from `false` to `true` for the intended environment and deploy. The feature flag is intentionally false in `wrangler.jsonc`. Keep it false until an owner has verified domain, sender, credentials, webhook, encryption and tested a controlled delivery.
- The admin delivery panel reports configured/not-configured booleans only; it never returns the API key. Rejected delivery can be retried for the same redemption/code. `provider_unknown` must first be checked against Resend; the portal provides explicit “Confirm sent” (requires the provider message ID) and “Confirm not sent” reconciliation actions. Never confirm based only on a browser status.
- Production API health, bootstrap (5 reward types, zero inventory), admin host portal/security headers, CORS preflight, unauthorized inventory denial, disabled login behavior and game asset routing were checked. Tests: Worker 20/20, typecheck, frontend lint/build, staging and production Wrangler dry-runs. Real credentialed admin login, code import, reward email, Resend webhook, and simultaneous redemption tests remain unverified until real configuration and stock exist. No Resend plugin/account tools are connected in this workspace, so sender-domain verification could not be independently checked here.

## CPAlead sponsor offer deployment gate — 2026-10-03

- Publisher ID `3364343` is configured as the non-secret Worker variable `CPALEAD_PUBLISHER_ID` in the existing production/staging config. CPAlead’s official Offers API requires the publisher ID, not the publisher API key. The implementation does not poll its conversions/reversals endpoints.
- The existing staging Worker is deployed as version `00e5af8a-cf3a-45d9-b49d-3c17d37847df`. Authenticated bootstrap passed and returned the new catalog (8 visible quests, no CPA-only quest, 60,000/200,000 sponsor rewards). Without `CPALEAD_POSTBACK_PASSWORD`, offers are empty and start returns `SPONSOR_OFFERS_DISABLED`. Production Worker and Pages have not been deployed for this change.
- After selecting a new strong postback password in CPAlead, store that value with Wrangler’s secret prompt as `CPALEAD_POSTBACK_PASSWORD` on staging first. Configure the CPAlead publisher postback URL with CPAlead’s supported macros: `https://<staging-api-host>/webhooks/cpalead?subid={subid}&lead_id={lead_id}&campaign_id={campaign_id}&country_iso={country_iso}&password={password}`. Do not use the API key as the callback password and do not place either secret in source.
- Exercise staging with provider test callbacks, duplicate `lead_id`, invalid password, unknown campaign/click, and country/device mismatch. Then set the same callback password as a production Worker secret, configure CPAlead to call `https://api.dashcup.com/webhooks/cpalead?...`, deploy the existing Worker and Pages project, and run production health/quest smoke checks.
- Offer metadata is fetched from the documented `https://www.cpalead.com/api/offers` endpoint using selected fields only and cached for 10 minutes in Worker memory/Cloudflare cache with request coalescing. Eligibility uses Cloudflare `cf.country` and a server-side User-Agent/client-hint platform classification, intersects both with the publisher’s explicitly supplied campaign allowlist and tighter country/device rules, and returns only title/action/type to authenticated clients. No offer tracking URL is exposed in bootstrap.
- On a Go click, the existing Worker rechecks eligibility, stores an opaque UUID `subid` with its user/campaign mapping in the existing click table, and appends that subid to CPAlead’s exact returned signed tracking URL. Clicks do not complete quests. A password-verified CPAlead postback records the provider’s unique `lead_id` and progresses both sponsor quests atomically; repeated postbacks cannot advance them again.
- One view adds zero Worker requests beyond the existing bootstrap/quest response and zero Neon reads for offers. A cache miss may call CPAlead once per cache location per 10-minute window. Offer start costs one Worker request and one attribution insert. Conversion costs one callback Worker request and one atomic Neon statement; no polling or infrastructure was added.
- The owner-provided CPAlead API key appeared in chat. Rotate it before further use. It is not needed for this Offers API/postback design; CPAlead’s postback uses its separately configured password.

### Current sponsor release state (2026-10-04)

- The CPAlead sponsor flow is enabled on production Worker `dashcup-9289` version `fd2e3a6f-41df-47f2-b008-b982d7aff1de`; the callback password is stored as a Worker secret. Staging offer start and production offer start both returned 200; a click alone did not change quest progress, and an unearned quest claim returned 409.
- Set the CPAlead publisher postback to this production URL (keep the CPAlead macros exactly as shown): `https://api.dashcup.com/webhooks/cpalead?subid={subid}&lead_id={lead_id}&campaign_id={campaign_id}&country_iso={country_iso}&password={password}`. The callback URL previously provided was the staging Worker URL, so live conversions would not reach the production database until this is changed.
- Complete one real qualifying offer after updating the callback to confirm a genuine conversion advances the daily and weekly sponsor quest rows. No synthetic conversion was inserted. The `GO!` offer list is targeted: it appears only when the visitor's country and device match a currently live CPAlead campaign.

## Biweekly trophy reset and reward claims — 2026-10-04

- The public trophy total and active leaderboard use cycle-scoped `cycle_scores`. They reset to 0 for a player at the start of each 14-day cycle; closed-cycle rankings preserve prior scores. The old `users.trophies` lifetime accumulator is no longer used in API output and is no longer updated by new game/quest events.
- The previous cycle's Top 20 can claim once that cycle ends, during the next full 14-day cycle. The server exposes `claimWindowOpensAt` / `claimWindowClosesAt` and checks the active window and the immediately previous cycle on redemption. At the next cycle boundary, older-cycle winners and unclaimed codes are no longer eligible.
- Staging version `703363c1-d2f3-4a02-a558-ff1cf46157e1` passed 23/23 Worker tests, typecheck/lint/build and Wrangler dry-runs; staging end-to-end validated ten game completions, the 1,000-trophy quest claim, and consistent 1,010 current-cycle totals. Production deployment is still pending.

### Production promotion — 2026-10-04

- After the staging end-to-end check passed, deployed to the existing production Worker `dashcup-9289`, active version `66400b8d-5a72-45cd-b087-a85778663d92` (100%). Production API health, apex, and www returned HTTP 200 after deployment. No Neon migration or Pages project replacement was done.
- The Rewards copy is live through existing Pages deployment `46478491-668f-4cb3-989b-409c45ee2d57` for commit `8b7470e` (Active). Apex/www returned 200 and the published JS contains the updated text. Production bootstrap returned 200 with cycle `2026-09-28`, current-cycle trophies `0` for a new session, and deadline `2026-10-12T00:00:00Z`.

## Ad and mobile UI follow-up — 2026-10-04

- Commit `9be94334179ed201295adcdea6afcc0bb2abeb51` was pushed to the existing `codex/dashcup-rebuild` production branch. Cloudflare Pages deployment `7d8f0981-58da-408d-9ad3-587d96867a45` succeeded for project `dashcup-9289`; apex and www point to that deployment. No Worker deployment was needed.
- Live assets no longer include the Hilltop banner loader or Monetag service-worker import. In-browser navigation to Quests stayed in the application without opening a new tab. The VAST URL returned HTTP 200 with VAST 3.0 video creatives; actual browser playback remains unverified and requires the user to tap Play ad.

## Arcade ads and Rewards copy — 2026-10-04

- Removed the Rewards eligibility/rank card from frontend source. Server-controlled redemption eligibility and timing remain enforced by the existing API.
- Initially isolated the supplied `peacefulbicycle.com` script in an Arcade-only sandboxed iframe, then removed it after live browser inspection showed it injecting repeated fake “Google Chrome” security warnings. The Arcade now shows a paused placement notice; do not re-enable this tag. Request a clean banner-only creative from the provider.
- Added a visible VAST 3.0 “Play video ad” control under ChickenDash; it opens the existing player and does not call the DASHCUP API or Neon. Automatic ad pacing remains every 10 completed local runs. Playback requires a gesture and a no-fill response is possible.
- After removing the unsafe loader, frontend lint, static production build, and `git diff --check` passed; built output contains neither the removed eligibility copy nor the unsafe ad URL. Commit `bd596bde6c25f4d6083509d5481593fbd1a11db5` is live as Pages deployment `13fea7c6-5c6f-484c-a16d-301c801599dd`, but it still has the unsafe ad loader and will be superseded after the fix is pushed. Browser test of the visible VAST control returned “No video ad available”. No Worker deployment, API endpoint, migration, or database change is part of this update.

### Final Arcade/Rewards publish — 2026-10-04

- Existing Pages project `dashcup-9289` deployed `f71e48d5793c8233ed59e5139f43bc79fd66e7ae` as `520c3ed1-906b-4910-aaab-d92079264ec5`; the deployment completed and retains `https://dashcup.com` and `https://www.dashcup.com` aliases. Live www returned HTTP 200.
- The commit after the initial publish removed the supplied ad script after a live browser showed fake Chrome security alerts. Final source has only a paused placement notice. Browser UI confirms that text, the new visible VAST action, and removal of the requested Rewards eligibility block.
- A manual live VAST attempt returned “No video ad available”. Video playback cannot be claimed; Hilltop/provider must make a creative available. No Worker or Neon action occurred.
