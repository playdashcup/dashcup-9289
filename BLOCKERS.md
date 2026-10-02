# DASHCUP blockers and next actions
Updated: 2026-10-02

## Git
- Work is in C:\Users\RYZEN V\Documents\ChatGPT\dashcup\dashcup-9289-main on codex/dashcup-rebuild, based on main 2a5222980662f416ce4ab064000878a56e26ed3e.
- Changes are uncommitted. Push/commit have not been verified.
- GitHub connector access previously rejected branch creation; retry local push after tests. If denied, repository write authentication is required.

## Cloudflare
- Zone status pending; observed DNS is still BigRock. This is the current external blocker to custom-domain activation.
- Pages exists but has no deployments and references the obsolete codex/dashcup-polish branch. Update after branch push.
- No Worker deployed. Staging/production secrets are not configured; cannot verify Worker-to-Neon or public routes.

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
- No staging smoke test, browser E2E, production deployment or final public verification has occurred.

## Personal actions
- Complete BigRock delegation and wait until Cloudflare reports active.
- Add/verify the Resend sending domain and its DNS records later.
- Provide MyLead callback signing/configuration and Hilltop placement ID if those products should serve ads/offers.
