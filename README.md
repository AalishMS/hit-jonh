# Hit Jonh

> Set the angle. Set the power. Hit Jonh. He was just trying to have a normal afternoon.

A humorous 2D browser game: adjust a cannon's angle and power to hit Jonh. Consistent gravity, slapstick reactions, solo challenges and 2–4 player local hot-seat matches.

**Status:** Project setup complete (Milestone 0). Gameplay starts in Milestone 1 — see [`docs/progress.md`](docs/progress.md).

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

Open http://localhost:5173. Append `?debug` to the URL to see Matter physics bodies (dev only).

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

## Project documents

- [`SPEC.md`](SPEC.md) — authoritative implementation specification.
- [`AGENTS.md`](AGENTS.md) — working rules for contributors and coding agents.
- [`docs/progress.md`](docs/progress.md) — progress, decisions, next task.
- [`hit-jonh-game-design.md`](hit-jonh-game-design.md) — original design brief.
