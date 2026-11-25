# Hit Jonh

> Set the angle. Set the power. Hit Jonh. He was just trying to have a normal afternoon.

A humorous 2D browser game: adjust a cannon's angle and power to hit Jonh. Consistent gravity, slapstick reactions, solo challenges and 2–4 player local hot-seat matches.

**Status:** Playable. It has:
- a solo campaign through twelve gardens, including smashable glass, a magician's portal hoops, a windy washing line and Jonh out for a walk, with stars, trick-shot badges, unlocks and practice on cleared gardens;
- a first-garden coach for new players, a Feats screen of 22 long-term goals, and a Daily Bonk you can share;
- 2–4 player hot-seat (with sudden death when it's still level) and online rooms with emotes, stakes callouts, taunts and a winning-shot replay;
- a hand-drawn "Sunday Funnies" look, installable for offline play;
- layered impact effects with slow-motion replays, an original soundtrack and unlockable cosmetics;
- remappable keys, screen-reader announcements and 44 px touch targets.

See [`CHANGELOG.md`](CHANGELOG.md) for what changed and [`docs/progress.md`](docs/progress.md) for history.

## How to play

| Action | Mouse / touch | Keyboard |
| --- | --- | --- |
| Aim | Drag the cannon (it points at your finger; distance is power) or drag the field up/down for angle | ← / → angle, ↓ / ↑ power |
| Fire | FIRE button | Space |
| Skip a rolling ball or a result | Skip / Next pill, or touch the aim | Space or Enter |
| Retry / next garden / practice (result screen) | Buttons | R / N / P |
| Pause | Pause button | Escape |

On a phone in landscape, the sliders icon at top right shows the precise Angle/Power sliders. Every key except Escape can be changed in Settings → Keys. Practice (unlimited shots, nothing saved) opens from the Challenge/Practice switch on the garden list once you have cleared a garden. The Daily Bonk result card has a Share button, and a `?daily` link opens that day's challenge.

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

## Install on a phone, play offline

The production build is an installable web app (it is never one in `npm run dev`). Open the site once over HTTPS (or `localhost`), then use the browser's **Install app** / **Add to Home screen** option: Hit Jonh gets its own icon and opens full screen. After that first visit, solo, hot-seat and Daily Bonk work with no connection; online rooms still need one. A small service worker (`build/sw.template.js`, written to `dist/sw.js`) keeps the built files under a cache named for the build; a new deploy takes over on the next load and shows a short "Updated" note. It never touches requests to the Convex backend. The icons in `public/icons/` come from `node scripts/make-icons.mjs` (set `CHROME` to a Chromium; only needed when the art changes).

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
