# DASHCUP deployment record
Updated: 2026-10-02

## Intended topology
- Cloudflare Pages serves the existing static Next.js frontend at www.dashcup.com.
- One Cloudflare Worker serves /api/* and game assets for api.dashcup.com and game.dashcup.com.
- Neon PostgreSQL is the only database.
- No D1, Neon Functions, or extra state services.
- Staging and production are configured separately in Wrangler; secrets must be set independently.

## Current verified provider state
- Cloudflare connection can read the intended account and Pages project dashcup-9289. A fresh GET /zones?name=dashcup.com returned no zones; Worker custom-domain setup needs the existing zone visible in this account. Do not create a duplicate zone or change nameservers from the application.
- The Pages project is connected to the repository, production branch codex/dashcup-rebuild. Production build/deployment for source commit 83d2718ce3b260e6801c1315a6efc912ac527066 succeeded at https://54b1f03c.dashcup-9289.pages.dev. Cloudflare reports www.dashcup.com active; direct HTTPS GETs to both the custom domain and Pages URL returned HTTP 200.
- The connected account currently lists no dashcup.com zone and no Worker scripts. api.dashcup.com and game.dashcup.com currently fail DNS lookup. Staging explicitly sets `routes: []` so it cannot inherit production custom domains. Restore access to the existing zone and authenticate Wrangler before staging deployment; no duplicate zone was created.
- Neon project bitter-mode-91626896 has ready branches dashcup-staging (br-empty-cherry-b4mxu4la) and dashcup (br-purple-river-b4v27of0). Read-only migration check confirms `0001_initial` and `0002_resend_delivery` on staging. Production has no `schema_migrations` relation yet; do not migrate production until staging Worker gates pass.
- Resend currently lists only dashcup.com with status not_started; mail.dashcup.com is not listed in the connected account. Reward delivery remains disabled.
- Configure RESEND_WEBHOOK_SECRET from the Resend webhook signing secret and point it to /webhooks/resend to reconcile provider acceptance and delivery outcomes.

## Resend setup later
Create and verify a sending domain such as mail.dashcup.com in Resend. Add the exact DNS records Resend provides to the authoritative Cloudflare DNS zone after delegation is active. Configure the Worker secret RESEND_API_KEY and variable RESEND_FROM_EMAIL for the verified sender; configure REWARD_ENCRYPTION_KEY and only then set REWARD_EMAIL_DELIVERY_ENABLED=true. Keep the API key, encryption key and reward admin token in Worker secrets, never frontend/NEXT_PUBLIC variables. Test one controlled redemption before public delivery.

The code uses the redemption UUID as Resend Idempotency-Key and stores accepted, sent, rejected, and provider_unknown delivery states. Resend webhooks verify signed Svix headers and deduplicate event IDs. Ambiguous sends require webhook reconciliation or manual support review; the UI must never say a code was sent on provider acceptance alone.

## Before deployment
1. Keep GitHub branch codex/dashcup-rebuild as Pages production source and verify subsequent documentation-only builds.
2. Restore/confirm access to the existing dashcup.com zone in the connected Cloudflare account. The Pages custom domain is active; use only Cloudflare-displayed DNS targets for Worker custom domains.
3. Authenticate Wrangler in the workspace with `wrangler login`. Configure staging Worker secrets and Neon staging pooled DATABASE_URL, deploy staging, then smoke-test health, bootstrap, sessions, CSRF and static game assets.
4. Add api/game Worker custom domains after the Worker staging gates pass; validate DNS/TLS and CORS.
5. Migrate production Neon only after staging verification; set production secrets and deploy production only after gates pass.
6. Keep replay, ad rewards and reward email disabled unless their trusted provider verification and prerequisites are in place.
7. Resolve/triage the canonical Bun audit's 14 remaining advisories (10 high, 4 moderate) before release. CI runs `bun audit` from `games/expo-crossy-road/bun.lock`; frontend and Worker build/test jobs pass independently.

## Local commands
Frontend: pnpm install --frozen-lockfile, pnpm lint, pnpm build.
Worker: cd server; pnpm install --frozen-lockfile; pnpm test; pnpm typecheck; pnpm exec wrangler deploy --dry-run.
Game CI uses Bun in games/expo-crossy-road: bun install --frozen-lockfile; bunx expo lint; bunx expo export -p web --output-dir ../../server/game-dist.
