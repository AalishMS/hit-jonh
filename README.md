# Hit Jonh

> Set the angle. Set the power. Hit Jonh. He was just trying to have a normal afternoon.

A humorous 2D browser game: adjust a cannon's angle and power to hit Jonh. Consistent gravity, slapstick reactions, solo challenges and 2–4 player local hot-seat matches.

**Status:** Playable, with four gardens, solo and 2–4 player hot-seat modes, a hand-drawn "Sunday Funnies" look, layered impact effects with slow-motion replays, an original soundtrack, unlockable hats and a Daily Bonk. See [`CHANGELOG.md`](CHANGELOG.md) for the polish pass and [`docs/progress.md`](docs/progress.md) for history.

## Stack

TypeScript 6 · Vite 8 · Phaser 4 (Matter.js physics) · Vitest · ESLint. Details and rationale in [`SPEC.md`](SPEC.md) §13.

## Requirements

- Node.js **22.12+** (tested with 26.3.0) and npm.

## Install

```bash
npm install
```

Dependencies are pinned to exact versions in `package.json` and locked in `package-lock.json`. For clean, reproducible installs (e.g. CI) use `npm ci`.

## Develop

```bash
npm run dev
```

Open http://localhost:5173. Dev-only URL flags:

- `?debug` draws the Matter physics bodies.
- `?tune` opens a live panel for every presentation value (hit-stop, slow motion, shake, zoom, particles, replay). **Copy JSON** gives values to paste into `src/config/tuning.ts`.

## Build

```bash
npm run build     # type-check, then bundle to dist/
npm run preview   # serve the production build locally
```

`dist/` is a static site (relative asset paths) and can be hosted anywhere.

## Checks

```bash
npm run typecheck   # TypeScript, strict
npm run lint        # ESLint
npm run test        # Vitest unit tests
npm run check       # all three
```

## Online play (Convex)

Online rooms need a Convex deployment. Without one the game runs normally and the Online card is disabled.

1. `npx convex dev` (first time: log in and create a project). This writes `CONVEX_DEPLOYMENT` and `VITE_CONVEX_URL` to `.env.local` (git-ignored).
2. Keep `npx convex dev` running while editing `convex/`, or push once with `npx convex dev --once`.
3. `npm run dev -- --host` and open the printed LAN URL on each device. Every browser tab is a separate player: open each player in a **new** tab, not with "Duplicate tab" (a duplicated tab copies `sessionStorage`, so it would share the first tab's seat). On a plain `http://` LAN address the browser offers no Clipboard API, so the lobby's Copy link shows the link selected for you to copy by hand.
4. `crosscheck.html` (dev server only) checks that shots score identically across browsers.

Deploying later: `npx convex deploy` creates the production backend. Build with `VITE_CONVEX_URL` set to the production URL (`npm run build`), then serve `dist/` from any static host.

## Project documents

- [`SPEC.md`](SPEC.md) — authoritative implementation specification.
- [`AGENTS.md`](AGENTS.md) — working rules for contributors and coding agents.
- [`docs/progress.md`](docs/progress.md) — progress, decisions, next task.
- [`hit-jonh-game-design.md`](hit-jonh-game-design.md) — original design brief.
- [`docs/art-direction.md`](docs/art-direction.md) — the visual style everything follows.
- [`docs/polish-audit.md`](docs/polish-audit.md) — the audit that motivated the polish pass.
- [`CHANGELOG.md`](CHANGELOG.md) — what changed and why.
- [`CREDITS.md`](CREDITS.md) — third-party assets and their licences.
