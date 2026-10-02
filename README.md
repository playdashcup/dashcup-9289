# dashcup-9289

This is a [Next.js](https://nextjs.org) project bootstrapped with [v0](https://v0.app).

## Built with v0

This repository is linked to a [v0](https://v0.app) project. You can continue developing by visiting the link below -- start new chats to make changes, and v0 will push commits directly to this repo. Every merge to `main` will automatically deploy.

[Continue working on v0 →](https://v0.app/chat/projects/prj_dIDWSjLSyT9kKz2RSZ2OSCLc1yJz)

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## DASHCUP platform

The existing dashboard is exported as static files to `out/` for Cloudflare Pages. Its browser API client reads `NEXT_PUBLIC_API_ORIGIN` at build time; production defaults to `https://api.dashcup.com`.

The single API/game Worker lives in `server/`. It uses Hono and Neon’s serverless Postgres driver. Configure `DATABASE_URL` as a Worker secret for each environment; never add database or provider secrets to a `NEXT_PUBLIC_*` variable. Wrangler configuration targets `/api/*` before its static game asset binding.

The Expo game source is vendored under `games/expo-crossy-road`; the Worker serves its web export from `server/game-dist`. To rebuild those assets, install Bun, run `bun install --frozen-lockfile` in the game directory, then run `bunx expo export -p web --output-dir ../../server/game-dist`. The integration passes a server run ID, one-use token, and seed to the game, and submits bounded input evidence. Replay is not deterministic yet, so run scores and trophies remain unverified and are not awarded. The upstream README states educational use and bundled game-art rights are not cleared for commercial use.

```bash
pnpm install --frozen-lockfile
pnpm build
cd server
pnpm install --frozen-lockfile
pnpm exec wrangler types
pnpm exec tsc --noEmit
pnpm test
pnpm exec wrangler deploy --dry-run --env=""
```

Apply `migrations/0001_initial.sql` to a Neon staging branch using a direct (unpooled) migration connection. Configure a pooled URL for Worker runtime traffic. Keep staging and production URLs separate.

The Worker deliberately returns `REPLAY_ADAPTER_UNAVAILABLE` for game results until the Expo game has a deterministic replay implementation. Reward redemption stays disabled until encrypted code stock, Resend sending-domain verification, and delivery recovery are configured. Do not enable those features by changing UI state.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

## Learn More

To learn more, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.
- [v0 Documentation](https://v0.app/docs) - learn about v0 and how to use it.
