# DASHCUP source audit
Audit date: 2026-10-02

## Frontend
- GitHub repository playdashcup/dashcup-9289 is accessible; audited clean upstream main commit 2a5222980662f416ce4ab064000878a56e26ed3e.
- Next.js 16 App Router and React 19 v0 dashboard is the frontend/design source; static export is configured for Cloudflare Pages.
- public/f50aae93c5fae9b355c1.txt contains the user-provided Hilltop verification token.
- public/sw.js contains the supplied Monetag service-worker settings, Dashcup shell cache, and explicit API/cross-origin request bypass.
- No production build has been published.

## Game
- Expo Crossy Road vendored at games/expo-crossy-road with upstream source, README, Bun lock and license.
- Source altered for ChickenDash title, warm material tint, slightly reduced sound playback volume, browser audio enablement and the DASHCUP postMessage bridge.
- Current Expo web export rebuilt successfully into server/game-dist (2.22 MB JavaScript bundle).
- Direct ESLint reported 0 errors and 68 warnings. Alternate npm dependency resolution reported 42 audit findings; canonical Bun-lockfile audit remains pending.
- Scoreboard remains in the Expo UI. Server rejects no client score as authoritative; replay is unavailable and game rewards stay disabled.
- Owner states license is confirmed; this statement has not been independently verified against a rights document. The vendored source README describes educational use and included assets may have separate rights.

## API/database/providers
- Hono Worker and two SQL migrations; staging Neon branch bitter-mode-91626896 / dashcup-staging is ready, base tables and Resend delivery schema verified.
- Worker architecture serves /api/* and game static assets; no D1, Neon Functions, or second API Worker.
- Resend client/template are implemented but sending is gated by server secrets and a verified sender. Current Resend inventory lists dashcup.com as not_started; mail.dashcup.com is not listed.
- MyLead signed conversion callback/account config is not implemented. Monetag user supplied a zone configuration, but live behavior is not independently verified. Hilltop banner placement ID was not provided; no placement is fabricated.
