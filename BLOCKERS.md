# DASHCUP blockers and next actions
Updated: 2026-10-02

## Git
- Work is in C:\Users\RYZEN V\Documents\ChatGPT\dashcup\dashcup-9289-main on codex/dashcup-rebuild, based on main 2a5222980662f416ce4ab064000878a56e26ed3e.
- Branch is pushed to origin and clean at HEAD a3f551fce895272ad3d34f5ef86a03116bd5a5e6. The remote ref was verified. GitHub combined status for this HEAD reports Vercel success.

## Cloudflare
- Zone status pending; observed DNS is still BigRock. This is the current external blocker to custom-domain activation.
- Pages production deployment succeeded for HEAD at https://ecd3c2ea.dashcup-9289.pages.dev; production_branch is codex/dashcup-rebuild. www.dashcup.com is pending with CNAME record not set.
- No Worker is deployed. Local Wrangler reports that it is not authenticated. Staging/production Worker secrets are not configured; Worker-to-Neon and public API/game routes cannot be verified.

## Provider configuration
- Neon staging base schema and 0002 delivery migration are applied and verified. Production schema and Cloudflare DATABASE_URL secret are not configured.
- Resend account lists only dashcup.com as not_started; mail.dashcup.com is absent. Sender settings are external prerequisites for real reward email; code keeps sending disabled by default.
- MyLead signing key/account/callback is missing, so offer starts and conversions remain disabled.
- Hilltop verification file is present but no ad placement ID exists. Monetag service-worker configuration was supplied; the external script was not independently validated.

## Verification/rights gates
- Deterministic replay implementation and tests remain incomplete. Game is accessible for development, but no score/trophy can be awarded.
- Expo web export succeeded via installed Expo CLI; repository `expo lint` wrapper expects Bun, which is unavailable locally. Direct ESLint reports 0 errors and 68 warnings.
- Alternate npm dependency resolution reports 42 audit findings (1 critical, 18 high, 22 moderate, 1 low); audit canonical Bun-lockfile dependencies before production game delivery.
- Owner says the Expo license is confirmed; license/source asset rights were not independently verified. Verify before commercial game/ad deployment.
- No Worker staging smoke test, browser E2E, or API/game production deployment has occurred. Pages production build/deploy has succeeded, but custom-domain content was not independently fetched in a browser.

## Personal actions
- Complete BigRock delegation and wait until Cloudflare reports active; ensure www.dashcup.com has the Pages CNAME Cloudflare requests.
- Authenticate Wrangler for this Cloudflare account (or provide a permitted deployment credential through the workspace's secret mechanism), then configure Worker staging secrets and deploy/test staging before production.
- Add/verify the Resend sending domain and its DNS records later.
- Provide MyLead callback signing/configuration and Hilltop placement ID if those products should serve ads/offers.
