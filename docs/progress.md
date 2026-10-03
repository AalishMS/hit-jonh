# Progress — Hit Jonh

_Last updated: 2026-10-03_

## Current milestone

**M2 — Make hitting Jonh satisfying: complete and verified.** Next: **M3 — Solo play and maps** (SPEC §14).

## Completed

- **M0 (2026-10-03):** Vite + TypeScript + Phaser 4 project; strict tsconfig; ESLint; Vitest; `.gitignore`; lockfile.
  - Minimal page: title + empty Phaser scene (`src/scenes/EmptyGameScene.ts`) with Matter initialised (`autoUpdate: false`) and stepped by `FixedStepper` at 1/120 s.
  - Pure modules: `src/sim/units.ts` (SI ↔ px, Matter gravity derivation, power→speed), `src/sim/fixedStep.ts`; tuning in `src/config/tuning.ts`.
  - Docs: `SPEC.md`, `AGENTS.md`, `README.md`, this file.
  - Verified: `npm run check` (typecheck, lint, 7 tests pass), `npm run build` succeeds. In Chrome via DevTools: page renders title and scene, Phaser 4.2.1 WebGL, no console errors, Matter gravity.y = 0.4905, `autoUpdate` false, Matter timestamp advancing; at 500 px viewport the canvas scales (468×263 CSS) while the logical world stays 1280×720.

- **M1 (2026-10-03): First playable cannon prototype on flat map (Jonh's Backyard).**
  - **Physics adapter (`src/physics/matterAdapter.ts`):** Converts level definitions and spawn commands from SI units to Matter bodies, runs headless in tests via `@matter-js` alias (`phaser/src/physics/matter-js/CustomMain.js`), guarantees no accumulated bodies on respawn or reset.
  - **Pure simulation maths (`src/sim/`):**
    - `sim/units.ts`: Explicit physical scale (50 px/m), Matter gravity derivation (0.4905 for 9.81 m/s²), velocity vector conversions (`speedMsToMatterVelocity`, `launchVelocityToWorld`), linear impulse power mapping (24–80 N·s).
    - `sim/ballistics.ts`: Analytic ballistic equations ($x(t)$, $y(t)$, time to ground/altitude, landing position).
    - `sim/swept.ts`: Swept-circle continuous collision detection guard against static colliders preventing tunnelling between discrete steps.
  - **Level data (`src/levels/`):**
    - `levels/backyard.ts`: Flat grass level with cannon spawn at $(2.5, 2.2)\text{ m}$ and Jonh body at $x = 18\text{ m}$.
    - `levels/validation.ts`: Automated thickness validation ($\min \ge \max(0.2\text{ m}, v_{max} \cdot \Delta t)$) and reference solution proofs.
  - **Rules state machine (`src/rules/shotAttempt.ts`):**
    - Enforces shot attempt lifecycle: `aiming` → `simulating` → `resolved`.
    - Detects valid body hits, out-of-bounds ($x < -1\text{ m}$ or $x > 26.6\text{ m}$), settled projectile (speed $< 0.05\text{ m/s}$ for $0.5\text{ s}$), and safety timeout ($15\text{ s}$).
    - Clean reset restores `aiming` while preserving angle and power.
  - **Input & Controls (`src/input/controls.ts`, `src/ui/htmlControls.ts`):**
    - Accessible HTML sliders for Angle ($5^\circ$–$85^\circ$) and Power ($0$–$100\%$) with live numeric readouts.
    - Fire and Reset buttons, with inputs frozen during active shots.
    - Keyboard coordination: Space (fire), Arrow keys (aim adjustment). Accidental-action rules enforced: ignore repeat, require space release after entering aiming, ignore shortcuts when text inputs are focused.
    - Prominent hit/miss feedback banner.
  - **Rendering & Debug View (`src/render/`):**
    - `sceneryRenderer.ts`: Sky gradient, clouds, hedge, ground divider, dirt and grass layers.
    - `cannonRenderer.ts`: Wooden carriage, rotating barrel reflecting exact angle, aim guide, muzzle spawn outside barrel collider.
    - `jonhRenderer.ts`: Geometric placeholder Jonh in deckchair with straw bowler hat, newspaper, and tumble/knockout hit reaction.
    - `ballRenderer.ts`, `trailRenderer.ts`: Visible metallic cannonball, dotted flight trail, and landing marker.
    - `debugRenderer.ts`: Toggleable wireframes (ground, Jonh body, Jonh hat, cannon pivot, muzzle, projectile) and live HUD telemetry overlay.
  - **Scene (`src/scenes/PrototypeScene.ts`):** Thin orchestrator wiring fixed stepping accumulator, physics, rules, input, and renderers.

- **Physics Strengthening and Verification (2026-10-03):**
  - Centralized materials in `src/config/tuning.ts` and made default drag explicit (0).
  - Integrated `sweepCircleVsBox` into `MatterAdapter.stepProjectile` for physical resolution of fast shots, preventing tunnelling by manually reflecting velocity and placing the projectile accurately at the contact point.

- **M2 (2026-10-03): Make hitting Jonh satisfying.**
  - **Recognisable Jonh with Idle Animation (`src/render/jonhRenderer.ts`):**
    - Jonh seated in deckchair with straw bowler hat, glasses, moustache, and newspaper.
    - Smooth cosmetic idle animation: breathing cycle (chest/head oscillation), newspaper rustle/drift, and periodic eye blinks.
    - Strict invariant maintained: Jonh's target collider remains completely stationary during aiming and flight; cosmetic animation stays aligned within collider boundaries.
  - **Authored Hit Reaction (`src/render/jonhRenderer.ts`):**
    - Immediate (< 0.5 s) clear slapstick consequence: Jonh knocked backwards onto the lawn, deckchair collapses/tips back, bowler hat spins off along an upward parabolic arc, newspaper flutters away, impact stars/dust appear, and speech bubble pops above his head.
    - No changes to projectile physics or hit detection.
  - **Previous-Shot Trajectory & Terminal Position Feedback (`src/render/trailRenderer.ts`):**
    - Prior shot flight path preserved as a subtle ghost trail with its terminal landing marker during the next aiming phase.
    - Active flight displays a vibrant trail with impact rings and crosshairs.
    - Full predicted trajectory is never revealed.
  - **Preserved Aiming Settings:**
    - Player's chosen angle and power remain saved across shots, scene resets, and quick continuations.
  - **Short Directional Guide (`src/render/cannonRenderer.ts`):**
    - Muzzle-extended directional guide with distance ticks and directional arrowhead tip matching the true barrel angle.
  - **Procedural Web Audio (`src/audio/audioManager.ts`):**
    - Procedural Web Audio synthesizer with zero external assets: punchy low-frequency cannon blast with filtered propellant crack, comical slapstick body hit thump/bonk, and turf ground impact thud.
    - Audio begins only after explicit user interaction (`click`, `keydown`, `touchstart`).
    - Dedicated Mute control in HTML panel and `KeyM` keyboard shortcut, with persisted state in `localStorage` (`hitJonh.v1.muted`).
  - **Dry Reaction Line Pool (`src/rules/reactions.ts`):**
    - Pool of dry, calm British reactions for hit, short, over, and miss outcomes.
    - Non-repetition guarantee: consecutive shots never repeat the same line, driven by cosmetic RNG completely separate from simulation physics. Unit-tested in `tests/reactions.test.ts`.
  - **Outcome Classification & Quick Continuation (`src/ui/htmlControls.ts`, `src/scenes/PrototypeScene.ts`):**
    - Clear classification labels ("DIRECT HIT", "SHORT", "OVER JONH", "MISS").
    - Enter key, Space, or "Aim Again" button provides immediate quick continuation. Tweaking angle/power automatically transitions back to aiming.
  - **Ground Rolling Damping (`src/config/tuning.ts`):**
    - Centralized `PHYSICS.groundRollingDamping` (0.985) applied on ground contact so cannonballs roll to a natural stop within ~1–2 seconds on grass rather than waiting for the 15-second safety timeout. Unobstructed free flight retains 0 drag (`frictionAir: 0`).
  - **Browser Verification:**
    - Verified in Chrome via Chrome DevTools MCP: UI controls, projectile flight, direct hits (45° / 40% and 73° / 70%), short misses (60° / 10%), overshot misses (45° / 50%), ghost trajectory display, AudioContext unlock upon interaction, and mute toggle all visually and programmatically inspected.

## Decisions (implementer, delegated by owner)

- **Stack: Phaser 4.2.1 + Matter.js 0.20 (bundled), TypeScript 6.0.3, Vite 8.3.2.** Chosen over plain canvas for scene/input/tween/audio/scaling support and rigid bodies for future props; pure-TS `sim/` keeps exact maths and testability. See SPEC §13.1.
- **Manual fixed stepping.** Phaser 4's `MatterRunnerConfig` has no fixed-step option (verified in bundled types), so Matter runs with `autoUpdate: false` and our accumulator.
- **No CCD in Matter** → swept-circle guard + thickness validation + tunnelling tests required (SPEC §9.2). Swept guard is integrated into `MatterAdapter` to apply reflection directly.
- **Headless Matter testing verified:** Matter can be driven in Node/Vitest by resolving `phaser/src/physics/matter-js/CustomMain.js` (aliased as `@matter-js`), removing any browser requirement for automated physics integration tests.
- **TypeScript pinned to 6.0.3**: TS 7.0.2 is latest, but `typescript-eslint` 8.71 peer range is `<6.1.0`.
- **Impulse range 24–80 N·s (6–20 m/s)** so shots fit a 25.6 m world — `[PROPOSED]`.
- **Procedural Web Audio synthesis**: Synthesizing cannon boom, body hit bonk, and ground thud via Web Audio API oscillators and filtered noise buffers prevents missing asset load errors and provides instant, zero-latency feedback without extra network requests.
- **Ground rolling damping 0.985**: Resolves Matter.js frictionless rolling of rigid circles on flat surfaces without adding any air drag during free flight.

## Known issues

- Phaser chunk is ~1.43 MB (≈375 kB gzipped); acceptable for now, revisit in M5.
- Audio requires an initial user interaction (click/touch/key) per browser autoplay policies; verified that audio initializes cleanly after the first gesture.

## Next task

**M3 — Solo play and maps:** Fence and Rooftop maps, map select, three-attempt challenge, stars rating, best results in localStorage.
