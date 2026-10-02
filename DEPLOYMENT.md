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
