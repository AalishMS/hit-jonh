# Progress — Hit Jonh

_Last updated: 2026-10-03_

## Current milestone

**Current: Phase 4 / M5 (Polish and readiness) implementation complete; automated acceptance passing, awaiting Codex browser acceptance.** All Phase 4 requirements (pause/resume/quit state machine, accumulator reset at both boundaries, input lifecycle and accidental-action rules, held Space tracking across handover/pause/text boundaries, Settings menu with persisted mute/volume/reducedMotion, reduced motion suppression in renderer, idempotent cleanup, dev-only opt-in debug gate) verified via `npm run check` (19 test files, 128 tests passing) and `npm run build` (686ms). Automated evidence and explicit NOT VERIFIED entries for browser/sensory inspection documented in `docs/release-verification.md`.

## Completed

- **M5 (2026-10-03): Polish and readiness.**
  - **Pure Session Coordinator (`src/rules/sessionCoordinator.ts`):** Framework-agnostic state machine managing pause/resume/quit states, pausable evaluation per SPEC §12 (Aiming, Simulating, in-game Result; disallowed in menus/modals), FixedStepper advancement gating, and accumulator resets at both pause entry and resume exit to eliminate catch-up bursts.
  - **Input Lifecycle & Accidental-Action Rules (`src/input/controls.ts`):** Space release tracked unconditionally across pauses/menus/text focus; fresh press required for firing; Escape resumes from pause (repeat ignored); gameplay shortcuts blocked when typing in text/select/textarea controls (range sliders treated as native sliders); native menu buttons activated without bypass.
  - **Settings & Audio (`src/audio/audioManager.ts`, `src/storage/storage.ts`, `src/ui/menuOverlay.ts`):** Settings menu reachable from Main Menu with persisted mute toggle, master volume slider (0–100%), and reduced motion toggle; AudioContext master gain and first-gesture unlock.
  - **Reduced Motion Support (`src/render/jonhRenderer.ts`):** Suppresses screen shake, rapid fluttering, blinding flashes, and impact dust/stars while keeping clear, satisfying slapstick hit pose and speech bubble reaction.
  - **Idempotent Scene Cleanup & Inert Controls (`src/scenes/PrototypeScene.ts`, `src/ui/htmlControls.ts`):** Quit returns cleanly to Main Menu, clearing physics bodies and destroying renderers; controls made inert/disabled under menus and handover modals; developer debug HUD and `KeyD` shortcut gated strictly to explicit dev opt-in (`?debug`).


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

- **Phase 1 — finish M2 outcomes and reactions (2026-10-03):**
  - **Correction of earlier completion claim:** Earlier M2 notes recorded hat-only and overhead reactions as deferred/unresolved, and pure 4-way classification (body, ricochet body, hat-only, miss) was incomplete. Phase 1 closes these gaps completely.
  - **Pure Classification & Scoring Module (`src/sim/classification.ts`):**
    - Implemented `ShotClassifier` and `classifyShot` without Phaser imports (SPEC §7.1, §13.2).
    - Proposed points centralized in `src/config/tuning.ts`: `body` (100 pts), `ricochet_body` (125 pts), `hat_only` (20 pts), `miss` (0 pts).
    - Highest outcome wins once. Body contact finalizes scoring immediately; duplicate callbacks cannot change or repeat it.
    - Hat-only contact waits until shot ends (settled, out of bounds, timeout). Hat-then-body resolves to body (or ricochet body if ricochet surface hit prior).
    - Ground never qualifies for ricochet. Obstacle contacts and ricochet flags are tracked.
  - **Physics Adapter Contact Propagation (`src/physics/matterAdapter.ts`):**
    - Swept-circle collision detection against hat sensor (does not reflect projectile velocity).
    - Overhead pass detection when projectile crosses Jonh's column above his head/hat within `LOOK.overheadAltitudeMarginMetres`.
    - Obstacle contacts recorded with IDs, materials, and ricochet eligibility from level data.
    - Full state reset (`removeProjectile`, `clear`) clears all contact, overhead, and ricochet records.
  - **Slapstick Reactions & Renderer (`src/render/jonhRenderer.ts`):**
    - Authored hat removal / near-miss reaction: Jonh stays seated in deckchair, newspaper lowered in disbelief, hat spins off along parabolic arc, speech bubble pops.
    - Authored overhead reaction: Jonh stays seated with hat on, newspaper lowered to lap, glares sharply leftwards towards cannon with side-eye pupils and furrowed brows.
    - Strict invariant maintained: Jonh physics colliders remain 100% stationary throughout all animations.
    - Reaction duration <= 1.5s, immediate and skippable.
  - **Dialogue & Feedback (`src/rules/reactions.ts`):**
    - Added SPEC §10.1 pools for `hat`, `overhead`, and `fence` ("That was my good fence.").
    - Guaranteed non-repetition across consecutive shots using cosmetic RNG.
    - Rich feedback banner displays category, points, and correction guidance.
  - **Mid-Flight Reaction Orchestration (`src/scenes/PrototypeScene.ts`):**
    - Addressed lead review presentation gap: cosmetic reactions (hat removal and overhead glare) now trigger immediately mid-flight at actual contact/pass during simulation, rather than waiting seconds for ball to settle or time out.
    - Hat scoring remains strictly unresolved until shot end.
    - Avoids replaying reaction animations or re-rolling quotes upon shot resolution; reuses the active mid-flight quote in the feedback banner.
    - Body hit override: a shot that touches hat and later strikes body triggers direct/ricochet body knockdown and selects a fresh body reaction line without repeating the hat line.
    - State guards (`hatReactionTriggered`, `overheadReactionTriggered`, `activeReactionQuote`) reset cleanly in both `fire()` and `reset()`.
  - **Input & State Guards (`src/scenes/PrototypeScene.ts`, `src/input/controls.ts`):**
    - Angle and power tweaks guarded during simulation.
    - Fresh press and text-focus shortcut rules strictly verified across all keys.
    - Scene reset clears all contact, classification, and reaction state every attempt.
  - **Regression Coverage & Evidence:**
    - Added regressions in `tests/reactions.test.ts` and `tests/matterAdapter.test.ts` covering mid-flight triggering, quote reuse on resolution, hat-then-body override, and clean reset.
    - All 12 test files passed, 87 total tests passed (`npm run check`).
    - Build clean (`npm run build`). Browser verification not performed in this step due to existing Chrome profile conflict.

- **Phase 2 — M3 solo challenge and three maps (2026-10-03):**
  - **Maps & Obstacles (`src/levels/`):**
    - Created "The Fence Dispute" map with a 1.8m wooden fence obstacle.
    - Created "Rooftop Lunch" map with a 5m tall concrete building obstacle.
    - Exposed all maps dynamically in `src/levels/index.ts`.
    - Integrated safe physics-thickness limits avoiding floating-point bugs in validation.
  - **State Machine & Rules (`src/rules/soloChallenge.ts`):**
    - Pure 3-attempt solo state machine (`aiming`, `simulating`, `result`, `solo_result`).
    - Earns 3/2/1 stars depending on which shot succeeds.
    - Records ricochet style bonus marker.
  - **Persistence (`src/storage/storage.ts`):**
    - Defensive, version-guarded JSON storage (`hitJonh.v1`).
    - Stores best solo shots per map and style flags, persisting across restarts without overwrite failure if an attempt is worse.
    - Saves last-aim per map.
    - Migrates `hitJonh.v1.muted` gracefully.
    - Fallback and `warn`-only guard handling for QuotaExceeded errors in `localStorage`.
  - **UI/Orchestration Integration (`src/ui/menuOverlay.ts`, `src/scenes/PrototypeScene.ts`, `src/rules/soloCoordinator.ts`):**
    - Extracted `SoloCoordinator` to test production transitions and manage rules logic independently.
    - Dynamically swaps maps in Phaser without full page reloads by resetting renderer and physics cleanly.
    - Displays a map select overlay with a Main Menu screen and proper back navigation.
    - Blocks background game interaction when menus or result overlays are visible.
    - Shows remaining attempts (`Attempt X/3`), and changes quick-reset text to "Continue" between attempts.
    - Ends in a challenge result overlay prompting "Retry Map" or "Change Map" after final shot continue, rather than relying on an unmanaged timeout.
  - **Review Fixes (M3):**
    - Corrected storage shape-safety to gracefully handle malformed JSON strings, untyped property access, clamp defaults, and safely render map scores in UI using textContent to prevent XSS. Migrated missing attempts from 999 to `null`.
    - Disabled reset inputs during simulation flight to prevent broken states.
    - Added comprehensive scenery generation for Rooftop and Fence obstacles matching physics colliders, retaining original prop offsets accurately on elevated grounds.
  - **Testing Coverage:**
    - `npm run check` completed with 15 test files, 102 tests passed, 0 lint errors, 0 type errors.
    - Headless reference solutions verified using the actual `MatterAdapter` simulating step-by-step through validation.
    - Full orchestration testing of the transition logic in `soloCoordinator.test.ts`.

- **Phase 3 — M4 local competition integration correction (2026-10-03):**
  - **Pure Multiplayer State Machine & Coordinator (`src/rules/`):**
    - `MultiplayerMatchMachine`: Enforces strict 2..4 player limits; tracks active player, round index across 3 maps (`backyard`, `fence`, `rooftop`), and starting player rotation ($r \pmod N$); preserves player setup and aim across rematches while cleanly resetting scores; prevents out-of-state aim mutations; resolves shots once via typed `ClassifiedOutcome`; returns read-only `MPPlayerView` instances with defensively copied score arrays to prevent caller mutation; calculates winner rankings with tie-breaking by body hits.
    - `MultiCoordinator`: Encapsulates multi-player orchestration and state gates (`handover`, `aiming`, `simulating`, `result`, `round_result`, `match_result`); guards fire and aim adjustment during handover, flight, and results; steps `ShotAttemptMachine` to resolution before invoking shot scoring; advances via explicit `continueFromResult()`.
    - `PlayerHistory<T>`: Pure generic mapping of player index to per-player shot history; records each player's active flight path and terminal landing marker upon shot completion; promotes current shot to ghost trajectory (`asPreviousTrail`) for handover display.
  - **Rendering & Visual Identity (`src/render/`):**
    - `CannonRenderer`: Renders active cannon with player's designated color and pattern overlay (solid, stripes, checker, dots) with enhanced contrast (alpha 0.85).
    - `CannonSlotsRenderer`: Renders simple labelled inactive decorative cannon slots outside the playable ground without physics colliders; dynamically positioned and cleanly destroyed on map unload.
    - `TrailRenderer`: Supports per-player color tints via `setPlayerColor()`; exports and imports `TrailData` cleanly to preserve personal flight and landing feedback between turns.
  - **Defensive Storage & Setup Validation (`src/storage/storage.ts`):**
    - Enforces domain validation for allowed colors and patterns against `MULTIPLAYER` tuning; trims and bounds player names with fallback to `Player N`; clamps integer aims within physics bounds (`AIM.minAngleDeg`..`AIM.maxAngleDeg`, 0..100% power); rejects invalid player counts (<2 or >4); saves setup synchronously to prevent stale asynchronous overwrite.
  - **Scene & UI Integration (`src/scenes/PrototypeScene.ts`, `src/ui/menuOverlay.ts`):**
    - Captures shooter identity at `fire()` so trails and scores remain attributed to the correct player even after turn progression.
    - Eliminates fallback Backyard reload on match conclusion: checks for `match_result` state and displays final result directly without reloading another map.
    - Requires explicit `Continue` action from shot result to round result modal, preventing premature overlay of Jonh's slapstick reaction.
    - Properly positions `triggerArrival()` after level reset to prevent speech bubbles from being immediately cleared.
    - Labels name inputs with `maxLength=16` and autofocuses modal action buttons.
  - **Testing Coverage:**
    - `tests/multiplayerMatch.test.ts`: Table-driven tests for $N \in \{2, 3, 4\}$ asserting exact 3 shots each across all 3 maps, round rotation $r \pmod N$, early body hits not truncating rounds, aim/fire state guards, clean rematches, and valid tie breaking (e.g. 4 ricochets vs 5 body hits = 500 pts each).
    - `tests/multiCoordinator.test.ts`: Fully rewritten to exercise actual production state machines and step resolution without private property hacking or `@ts-expect-error`.
    - `tests/playerHistory.test.ts`: Tests history isolation, overwrite semantics, and ghost trajectory promotion.
    - `tests/matterAdapter.test.ts`: Headless Matter adapter comparison test verifying identical static bodies/positions/tags before and after a real shot, live projectile removal, zero stale contact flags, and identical launch positioning for next player.
    - `tests/storage.test.ts`: Tests setup defaults, name sanitization, count validation, and domain-bounded storage parsing.
    - All 18 test files (117 tests) passed cleanly with 0 type errors and 0 lint warnings.

## Decisions (implementer, delegated by owner)

- **Stack: Phaser 4.2.1 + Matter.js 0.20 (bundled), TypeScript 6.0.3, Vite 8.3.2.** Chosen over plain canvas for scene/input/tween/audio/scaling support and rigid bodies for future props; pure-TS `sim/` keeps exact maths and testability. See SPEC §13.1.
- **Manual fixed stepping.** Phaser 4's `MatterRunnerConfig` has no fixed-step option (verified in bundled types), so Matter runs with `autoUpdate: false` and our accumulator.
- **No CCD in Matter** → swept-circle guard + thickness validation + tunnelling tests required (SPEC §9.2). Swept guard is integrated into `MatterAdapter` to apply reflection directly.
- **Headless Matter testing verified:** Matter can be driven in Node/Vitest by resolving `phaser/src/physics/matter-js/CustomMain.js` (aliased as `@matter-js`), removing any browser requirement for automated physics integration tests.
- **TypeScript pinned to 6.0.3**: TS 7.0.2 is latest, but `typescript-eslint` 8.71 peer range is `<6.1.0`.
- **Impulse range 24–80 N·s (6–20 m/s)** so shots fit a 25.6 m world — `[PROPOSED]`.
- **Procedural Web Audio synthesis**: Synthesizing cannon boom, body hit bonk, and ground thud via Web Audio API oscillators and filtered noise buffers prevents missing asset load errors and provides instant, zero-latency feedback without extra network requests.
- **Ground rolling damping 0.985**: Resolves Matter.js frictionless rolling of rigid circles on flat surfaces without adding any air drag during free flight.
- **Scoring and ricochet rules (Phase 1):** Body (100 pts), ricochet body (125 pts), hat-only (20 pts), miss (0 pts). Ground is never eligible for ricochet. Obstacle ricochet eligibility is determined per level data `ricochet: boolean`.
- **UI Architecture (Phase 2):** Overlay map select / result screens using HTML inside the single `PrototypeScene` is cleaner than heavy Phaser scene transitions, preserving rendering layout stability and avoiding audio re-init.
- **Floating-point validation fixes (Phase 2):** Extended bounding box borders by `±0.01` in map definitions to safely pass `>0.2m` validation without running into `0.199999` IEEE 754 truncations in TS.

## Known issues

- **Historical quota audit (2026-10-03):** Earlier Pro 3.1 run stopped during initial M4 with `RESOURCE_EXHAUSTED`. Work was subsequently resumed and completed under Gemini Flash 3.8 High.
- **Interactive browser playthrough / hardware touch:** Automated test suite (117 tests) and production build are verified passing; interactive browser playthrough and visual/sound balance are **NOT VERIFIED** in this automated run and are left for Codex browser review due to environment Chrome DevTools profile conflict.
- Phaser chunk is ~1.43 MB (≈375 kB gzipped); acceptable for now, revisit in M5.
- Audio requires an initial user interaction (click/touch/key) per browser autoplay policies; verified that audio initializes cleanly after the first gesture.
- Visual enjoyment, sound balance, and hardware touch testing remain owner judgments, never inferred from passing tests.

## Next task

Codex browser acceptance review for M4, then proceed to Phase 4 / M5 (Pause, settings, audio sliders, polish).

## Lead acceptance evidence — 2026-10-03

- Codex inspected phase diffs and returned concrete corrections before proceeding; M2 timing and M3 transition/storage/rendering fixes are checkpointed in `df19f1a` and `dbf6bb3`.
- Chrome production preview: menu -> Solo Challenge -> map select; Fence best/style survived reload; visible Rooftop building/props; Rooftop reference hit -> immediate Continue -> three-star result -> Retry without reload. Three weak Rooftop misses progressed through 2/1 attempts remaining -> failure -> Retry back to 3, retaining aim. Reset during flight was ignored. Captured warning/error logs were empty. See `docs/orchestration-log.md` for build-specific coverage limits.
- After preserving interrupted M4 and restoring M3, Codex reran `npm run check`: typecheck/lint pass, **15 test files passed, 102 tests passed**. `npm run build`: **57 modules transformed, built in 812ms**; Phaser remains **375.59 kB gzip**.
- Multiplayer and M5/browser full-transition/performance/hardware-touch gates are **not verified**, because M4 was interrupted and M5 has not run. Art enjoyment and perceived sound balance remain owner playtest judgments.



