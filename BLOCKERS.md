# DASHCUP blockers and next actions
Updated: 2026-10-02

## Git
- Work is in C:\Users\RYZEN V\Documents\ChatGPT\dashcup\dashcup-9289-main on codex/dashcup-rebuild, based on main 2a5222980662f416ce4ab064000878a56e26ed3e.
- Latest tested source commit a09430c0007e2392a17a0d33d6805e9a6cd76e65 is pushed and verified on origin. GitHub reports Vercel success; Cloudflare Pages built and deployed it successfully.

## Cloudflare
- Connected Cloudflare API currently returns no dashcup.com zone for the account; Pages project access still works. Its www.dashcup.com domain is pending with “CNAME record not set”. The previously observed zone was pending during the last successful zone query; re-check when account/DNS state changes.
- Pages production deployment for latest tested source commit succeeded at https://159c952c.dashcup-9289.pages.dev; production_branch is codex/dashcup-rebuild.
- Worker scripts list is empty. Local Wrangler reports not authenticated. Staging/production secrets are not configured; Worker-to-Neon and public API/game routes cannot be verified.
- Staging Wrangler configuration sets `routes: []` to prevent inheritance of production custom domains; repeat staging dry run passed without that warning.

## Provider configuration
- Neon staging `schema_migrations` contains `0001_initial` and `0002_resend_delivery`; production `schema_migrations` relation is absent. Production `DATABASE_URL` Worker secret is not configured.
- Resend account lists only dashcup.com as not_started; mail.dashcup.com is absent. Sender settings are external prerequisites for real reward email; code keeps sending disabled by default.
- MyLead signing key/account/callback is missing, so offer starts and conversions remain disabled.
- Hilltop verification file is present but no ad placement ID exists. Monetag service-worker configuration was supplied; the external script was not independently validated.

## Verification/rights gates
- Deterministic replay implementation and tests remain incomplete. Game can be run only where its asset host is available; the deployed Pages build points to game.dashcup.com, which is not deployed. No score/trophy can be awarded.
- Source audit found the seeded server run is not consumed by game logic; multiple map/vehicle/obstacle sources use Math.random and movement/collisions are frame-dependent. Replacing this with a simplified simulator would violate the guide; port/refactor the actual transitions before enabling replay.
- Quest definitions and claim logic exist, but no event updates quest progress/completion. Referral qualification and signed MyLead conversion callbacks are absent.
- Expo web export succeeded via installed Expo CLI; repository `expo lint` wrapper expects Bun, which is unavailable locally. Direct ESLint reports 0 errors and 68 warnings.
- Alternate npm dependency resolution reports 42 audit findings (1 critical, 18 high, 22 moderate, 1 low); audit canonical Bun-lockfile dependencies before production game delivery.
- Owner says the Expo license is confirmed; license/source asset rights were not independently verified. Verify before commercial game/ad deployment.
- No Worker staging smoke test, browser E2E, or API/game production deployment has occurred. Pages production build/deploy has succeeded, but CUA browser startup failed and custom-domain content was not independently fetched.
- Connected Cloudflare zone query returned no `dashcup.com` zone; no Worker is present. The user must finish DNS delegation and Wrangler authentication/restore the correct zone access before staging deployment can proceed.

## Personal actions
- Complete BigRock delegation and wait until Cloudflare reports active; ensure www.dashcup.com has the Pages CNAME Cloudflare requests.
- Authenticate Wrangler for this Cloudflare account (or provide a permitted deployment credential through the workspace's secret mechanism), then configure Worker staging secrets and deploy/test staging before production.
- Add/verify the Resend sending domain and its DNS records later.
- Provide MyLead callback signing/configuration and Hilltop placement ID if those products should serve ads/offers.
