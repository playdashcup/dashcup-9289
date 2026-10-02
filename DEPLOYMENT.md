# DASHCUP deployment record
Updated: 2026-10-02

## Intended topology
- Cloudflare Pages serves the existing static Next.js frontend at www.dashcup.com.
- One Cloudflare Worker serves /api/* and game assets for api.dashcup.com and game.dashcup.com.
- Neon PostgreSQL is the only database.
- No D1, Neon Functions, or extra state services.
- Staging and production are configured separately in Wrangler; secrets must be set independently.

## Current verified provider state
- Cloudflare account: 942b2fca29931220f4a0c0cc604f28d9. Zone dashcup.com ID 10b93ab72926ae60db40ece4e89ba044 is pending, not active.
- Cloudflare expects blakely.ns.cloudflare.com and norman.ns.cloudflare.com; its latest observed delegation is dns1.bigrock.in through dns4.bigrock.in. Do not change nameservers from the application.
- Pages project dashcup-9289 at https://dashcup-9289.pages.dev exists, with no latest deployment. Its production branch still points to the absent codex/dashcup-polish.
- No Worker script is deployed. Custom API/game domains have not been activated.
- Neon project bitter-mode-91626896 has ready branches dashcup-staging (br-empty-cherry-b4mxu4la) and dashcup (br-purple-river-b4v27of0). Base schema plus migration 0002 delivery-status/webhook schema are applied and verified on staging only; production schema not verified.
- Resend currently lists dashcup.com with status not_started. mail.dashcup.com was not present in the current account listing.
- Configure RESEND_WEBHOOK_SECRET from the Resend webhook signing secret and point it to /webhooks/resend to reconcile provider acceptance and delivery outcomes.

## Resend setup later
Create and verify a sending domain such as mail.dashcup.com in Resend. Add the exact DNS records Resend provides to the authoritative Cloudflare DNS zone after delegation is active. Configure the Worker secret RESEND_API_KEY and variable RESEND_FROM_EMAIL for the verified sender; configure REWARD_ENCRYPTION_KEY and only then set REWARD_EMAIL_DELIVERY_ENABLED=true. Keep the API key, encryption key and reward admin token in Worker secrets, never frontend/NEXT_PUBLIC variables. Test one controlled redemption before public delivery.

The code uses the redemption UUID as Resend Idempotency-Key and stores accepted, sent, rejected, and provider_unknown delivery states. Resend webhooks verify signed Svix headers and deduplicate event IDs. Ambiguous sends require webhook reconciliation or manual support review; the UI must never say a code was sent on provider acceptance alone.

## Before deployment
1. Verify GitHub branch is pushed and CI passes.
2. Point Pages production branch to that branch and deploy; check *.pages.dev first.
3. Configure staging Worker secrets and Neon staging pooled DATABASE_URL, deploy staging, then smoke-test health, bootstrap, sessions, CSRF and static game assets.
4. Wait for Cloudflare zone activation. Add www Pages custom domain and api/game Worker custom domains, then validate DNS/TLS and CORS.
5. Migrate production Neon only after staging verification; set production secrets and deploy production only after gates pass.
6. Keep replay, ad rewards and reward email disabled unless their trusted provider verification and prerequisites are in place.
7. Review the 42 findings from alternate npm dependency resolution and audit the canonical Bun lockfile before production use of game assets.

## Local commands
Frontend: pnpm install --frozen-lockfile, pnpm lint, pnpm build.
Worker: cd server; pnpm install --frozen-lockfile; pnpm test; pnpm typecheck; pnpm exec wrangler deploy --dry-run.
Game CI uses Bun in games/expo-crossy-road: bun install --frozen-lockfile; bunx expo lint; bunx expo export -p web --output-dir ../../server/game-dist.
