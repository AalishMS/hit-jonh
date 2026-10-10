# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

`AGENTS.md` holds the binding working rules (read it) and `SPEC.md` is the authoritative spec — labels `[PROPOSED]`/`[TUNE]` are unapproved defaults, `[OPEN]` must not be silently decided. Spell the name **Jonh**. Leave `hit-jonh-game-design.md` untouched. Update `docs/progress.md` after each milestone.

## Commands

```bash
npm run dev          # http://localhost:5173 (?debug draws Matter bodies, dev only)
npm run check        # typecheck + lint + test (run before reporting work done)
npm run build        # tsc --noEmit + vite build → dist/
npx vitest run tests/swept.test.ts            # single test file
npx vitest run -t "name fragment"             # single test by name
npm run test:watch
```

Tests live in `tests/*.test.ts` (Vitest, node environment, no browser). Physics tests run real Matter headlessly via the `@matter-js` alias (Phaser's bundled `CustomMain.js`, see `vite.config.ts`).

## Architecture

Hit Jonh is a 2D cannon-physics browser game (Phaser 4 + Matter.js, TypeScript strict, Vite). The design splits pure logic from the Phaser/DOM layer so most behaviour is unit-testable without a browser:

- **Pure, no Phaser imports** (enforced rule): `src/sim/` (unit conversion, ballistics, swept-circle guard, shot classification, `FixedStepper`), `src/rules/` (state machines and coordinators), `src/levels/` (data + validation).
- **`src/physics/matterAdapter.ts`** — the only bridge from SI-unit level/spawn data to Matter bodies; also usable headless in tests. Matter velocity units (px per 1000/60 ms) are converted only here and in `sim/units.ts`.
- **`src/scenes/PrototypeScene.ts`** (~900 lines, the real game scene; `EmptyGameScene` is just the M0 stub) is a thin orchestrator wiring stepper → physics → rules → renderers/input/UI. `src/main.ts` configures Phaser (logical world fixed at design size, `Scale.FIT`); `bootstrap.ts` handles load failure/Retry.
- **`src/render/`** — Phaser drawing only (scenery, cannon, Jonh, ball, trail, impact timeline, shot effects, debug HUD). **`src/input/`** — keyboard (`controls.ts`, with accidental-action rules like fresh-Space-release-to-fire and ignoring shortcuts while typing) and pointer aiming (`canvasAim.ts`). **`src/ui/`** — HTML/CSS overlays (menus, sliders, Fire/Reset); **`src/audio/`** — synthesized WebAudio; **`src/storage/`** — persisted settings and solo results.

### Rules layer
`ShotAttemptMachine` runs one shot (`aiming → simulating → resolved`: hit, out-of-bounds, settled, 15 s timeout). `SoloChallengeMachine`/`SoloCoordinator` and `MultiplayerMatchMachine`/`MultiCoordinator` layer solo and 2–4 player hot-seat modes on top; `SessionCoordinator` owns pause/resume/quit; `AutoAdvance` is the cancellable presentation timer driving automatic reaction → handover → round-summary flow; `reactions.ts` picks Jonh's reactions.

### Levels
Maps (`backyard`, `fence`, `rooftop`, `rubber`, `bankshot`, `trampoline`, `moon`, `valley`) are plain `LevelData` in SI metres registered in `levels/index.ts` (`MAPS`); every mode (solo, daily, hot-seat, online) uses that one list, and `MAP_PRESETS` are the multiplayer shortcuts. A level may override gravity and the cannon's speed range (`levels/levelPhysics.ts`); a level wider than 25.6 m is shown zoomed out (`levelView` in `fx/cameraDirector.ts`). `levels/validation.ts` checks structure and collider thickness; the tests (`levels`, `multiplayerPositions`, `headlessShot`) fire every reference solution through real Matter and prove it hits, and `tests/difficulty.test.ts` caps how much of an aim grid hits (run it with `DIFFICULTY_REPORT=1` for the tuning table). Adding or changing an obstacle must keep those tests green. Target positions per map come from `multiplayerPositions.ts`.

## Invariants that are easy to break

- Matter runs with `autoUpdate: false` and is stepped **only** by `FixedStepper` at the fixed dt (1/120 s); never pass the frame delta to `world.step`. Pause/resume must reset the stepper accumulator.
- Matter has no CCD: fast shots rely on the swept guard (`sim/swept.ts`) plus minimum collider thickness `max(0.2 m, v_max·dt)` (SPEC §9.2).
- Bounces are owned by the swept guard in `matterAdapter.stepProjectile`: impacts faster than `PHYSICS.bounceMinNormalSpeedMs` are re-bounced from the incoming velocity with the material's restitution (Matter's own solver damps every material alike). Changing a material, the guard or rolling damping shifts every map's solution space — rerun the difficulty report and re-derive reference shots.
- Tuning numbers belong in `src/config/tuning.ts` or level data, not scenes.
- TypeScript is pinned to 6.0.x (typescript-eslint 8.x doesn't support TS 7); deps are exact-pinned.
- Commit small after checks pass; never force-push. Don't claim something was tested if it wasn't.

<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->
