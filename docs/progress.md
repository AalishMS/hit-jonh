# Progress — Hit Jonh

_Last updated: 2026-11-24_

## Current milestone

**Current (2026-11-24): "real game" pass complete on branch `real-game-pass` (not merged or pushed).** All ten gaps from the ranked list are fixed. The list, per-item notes, evidence and the next-10 proposal are in the "Real game pass" section at the end of this file.

Final `npm run check`: `Test Files 58 passed (58)`, `Tests 585 passed | 10 skipped (595)`. `npm run build`: 194 modules; main 389 kB (116 kB gzip). The production build was checked through `vite preview`: no dev globals, a shot played through Skip, no console errors or warnings.

**Current (2026-10-08): owner-requested polish pass complete on branch `polish-pass`.** See `CHANGELOG.md` and the "Polish pass" entries at the end of this file. The earlier text below is historical.

**Current: Owner-requested usability pass complete on the M0–M5 foundation.** Canvas aiming, automatic shot/turn progression, an obstacle on every map, vocal sound effects, illustrated Home, gameplay Home navigation and multiplayer arena selection are implemented. Final `npm run check`: typecheck/lint passed, **21 test files / 140 tests passed** (1.28s). `npm run build`: **67 modules transformed, built in 1.15s**. Production browser verification is recorded below. The prior M0–M5 release evidence remains historical; it did not establish the subjective completeness of the UI or game feel. See `docs/game-audit.md` for the current remaining-work assessment.

## Completed

- **Owner usability pass (2026-10-04):**
  - Added pointer-captured vertical canvas aiming, including touch pointers; sliders and keyboard remain available. Aiming locks during shots, overlays and pause; active drags cancel on firing/pause/Home/window blur.
  - Added a cancellable presentation timer: 1.4 s reaction/result, 1.2 s named handover, 2.4 s round summary. Pause freezes the timer; manual skip, Home, map changes and rematch cancel obsolete work. Final solo/match screens remain for retry/rematch.
  - Confirmed the existing pure match rules already alternate players. Made the actual flow automatic and added an active-player/score strip. Multiplayer arena cards select one map (one round) or the three-map tour. Round counts, score arrays and rematch use the selected map list.
  - Added a collidable garden shed to Backyard and windows/floors to the existing Rooftop building. Removed one obsolete low-angle Backyard reference; retained two proven arc solutions. New actual-Matter tests confirm all maps block a low maximum-power shot.
  - Added alternating synthesized vocal yelps on body hits and a voiced/noise FAAH once per shot when the ball leaves any visible edge; top exits remain simulated normally. All effects share existing mute/volume controls.
  - Rebuilt Home, mode selection, map cards, player setup and gameplay controls with a coherent ink/mint/indigo/yellow cartoon style. Added gameplay Home (also visible over game overlays) and keyboard focus containment for menus.
  - Independent code review found a keyboard navigation regression: Space on Home could fire. Fixed native Enter/Space activation on non-Fire buttons, preserving physical Space tracking and Fire's fresh-release guard; added a regression test. Follow-up review reported no remaining actionable findings.
  - Tests cover drag direction/range/resize maths, timer pause/cancel/one-time dispatch/background delay, selected-map alternation/rematch/validation, obstacle blockage, physics reset body counts and keyboard navigation. No dependency changes.

- **M5 (2026-10-03): Polish and readiness.**
  - **Pure Session Coordinator (`src/rules/sessionCoordinator.ts`):** Framework-agnostic pause/resume/quit helper with pausable evaluation per SPEC §12 and accumulator resets at both boundaries. The scene directly gates its fixed-step and cosmetic update paths on pause/inactive state; helper advancement tests do not instantiate Phaser.
  - **Input Lifecycle & Accidental-Action Rules (`src/input/controls.ts`):** Space release tracked unconditionally across pauses/menus/text focus; fresh press required for firing; Escape resumes from pause (repeat ignored); gameplay shortcuts blocked when typing in text/select/textarea controls (range sliders treated as native sliders); native menu buttons activated without bypass.
  - **Settings & Audio (`src/audio/audioManager.ts`, `src/storage/storage.ts`, `src/ui/menuOverlay.ts`):** Settings menu reachable from Main Menu with persisted mute toggle, master volume slider (0–100%) with accessible label (`id="settings-volume"`, `aria-label="Master Volume"`), and persisted reduced motion toggle; AudioContext master gain and first-gesture unlock.
  - **Reduced Motion Support (`src/render/jonhRenderer.ts`):** Suppresses screen shake, rapid fluttering, blinding flashes, and impact dust/stars while keeping clear, satisfying slapstick hit pose and speech bubble reaction. State persists reliably across reloads and mid-game changes.
  - **Accessible Boot Status & Dev-Only Debug (`index.html`, `src/bootstrap.ts`, `src/main.ts`, `src/scenes/PrototypeScene.ts`):** Accessible boot status banner hidden on `READY`; bootstrap catches dynamic module/startup failures and presents a friendly Retry action. Debug HUD is gated by development mode and the debug parameter.
  - **Idempotent Scene Cleanup & Inert Controls (`src/scenes/PrototypeScene.ts`, `src/ui/htmlControls.ts`):** Quit returns cleanly to Main Menu, clearing physics bodies and destroying renderers; controls made inert/disabled under menus, pause, and result overlays; restored cleanly on retry or map load.


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
- **Verification limits:** Interactive Chrome production walkthrough is complete for the cases recorded in `docs/release-verification.md`. Physical touchscreen reliability, perceived audio balance, visual enjoyment, actual hardware FPS/CPU throttling and heap leak profiling are **NOT VERIFIED**; appropriate hardware/listening/profiling was unavailable.
- Phaser chunk is ~1.43 MB (≈375 kB gzipped); acceptable bundle size for current asset-free build.
- Audio requires an initial user interaction (click/touch/key). First-gesture wiring and gain handling were inspected/tested; subjective audio quality remains unverified.
- Node emitted an experimental localStorage availability warning during Vitest; all tests passed. A sandbox worker-cache failure was resolved by rerunning checks outside the sandbox, without changing test configuration.
- Visual enjoyment, sound balance, and hardware touch testing remain owner judgments, never inferred from passing tests.

## Next task

Complete owner playtesting of pacing, audio and physical touch. Suggested next implementation: an interactive aiming tutorial, then more expressive character animation/recorded vocals and richer obstacle layouts. Optional practice mode remains deferred until requested. See `docs/game-audit.md`.

## Lead acceptance evidence — 2026-10-03

### Historical Lead Audit (M3 restoration / pre-M4)

- Codex inspected phase diffs and returned concrete corrections before proceeding; M2 timing and M3 transition/storage/rendering fixes are checkpointed in `df19f1a` and `dbf6bb3`.
- Chrome production preview: menu -> Solo Challenge -> map select; Fence best/style survived reload; visible Rooftop building/props; Rooftop reference hit -> immediate Continue -> three-star result -> Retry without reload. Three weak Rooftop misses progressed through 2/1 attempts remaining -> failure -> Retry back to 3, retaining aim. Reset during flight was ignored. Captured warning/error logs were empty. See `docs/orchestration-log.md` for build-specific coverage limits.
- After preserving interrupted M4 and restoring M3, Codex reran `npm run check`: typecheck/lint pass, **15 test files passed, 102 tests passed**. `npm run build`: **57 modules transformed, built in 812ms**; Phaser remains **375.59 kB gzip**.
- Multiplayer and M5/browser full-transition/performance/hardware-touch gates are **not verified** at that time, because M4 was interrupted and M5 had not run. Art enjoyment and perceived sound balance remain owner playtest judgments.

### Current M5 Status & Lead Verification

- **M4:** Full two-player, 18-shot production match through all three rounds: 300 → 675 → 1050 points each, nine body hits each, shared tie; rematch retained setup/aim and reset the match. Separate four-player setup showed all labelled patterns/slots. N=2/3/4 ordering/counts and tie-breaks also have pure tests.
- **M5:** Production pause during aiming, flight and shot result; frozen screenshots during a long pause; resume, keyboard actions, quit/restart, persisted settings, labelled volume and inert result controls verified. At 500px viewport there was no horizontal overflow. Production `?debug` did not expose debug controls.
- **Boot:** Temporarily withheld one generated main module, observed the friendly failure/Retry UI, restored the module immediately, then Retry reached Main Menu. No generated backup remains.
- **Final correction:** Change Map now performs cleanup and opens map selection instead of stopping at Main Menu. Verified on the final build through solo hit → result → Change Map → map selection → Back.
- **Automated evidence:** Final check passed: 19 files / 129 tests, typecheck/lint passed; build passed: 64 modules / 861ms. Removed one test that merely copied a callback rather than exercising production code.
- **Environment and limits:** Requested dev server remains on port 5173. Captured normal browser warning/error logs were empty. Hardware/sensory/performance limits are listed above and in `docs/release-verification.md`.





## Owner usability pass — 2026-10-04

This pass implements the requested controls, pacing, obstacles, audio triggers, navigation and multiplayer setup changes. SPEC v0.2 records the owner-directed changes. No deferred gameplay systems were added.

Automated evidence on the final functional source: `npm run check` passed typecheck/lint and **21 files / 140 tests**, in 1.28 s. `npm run build` passed, **67 modules transformed / 1.15 s**. An initial sandbox run could not share Vitest's temporary cache across workers (ENOENT); the normal command passed outside the sandbox. No test configuration or dependency was changed.

Production browser walkthrough used the in-app browser at `http://127.0.0.1:4173`, served by `npm run preview`:

| Case | Observed result |
| --- | --- |
| Home and mode/menu flow | Illustrated Home → Let's play → mode cards → solo/map selection or multiplayer setup. Saved screenshot: `docs/hit-jonh-home.png`. |
| Canvas drag | Upward drag changed 45° → 61°; downward drag restored 45° in dev. Upward drag also changed 45° → 61° in production. A drag during an 85° shot left angle locked at 85°. |
| Selected multiplayer map | Chose Rooftop only; gameplay showed Round 1/1. |
| Automatic multiplayer flow | Played all six shots without Continue: Ace 1 → Bo 1 → Ace 2 → Bo 2 → Ace 3 → Bo 3. Automatic round summary/final result showed shared win, 375 points and three body hits each. |
| Rematch | Retained Rooftop and player names/settings; reset both scores to zero and started Ace's shot 1/3. |
| Keyboard Home | Enter on gameplay Home opened Home without firing. Space on Home also opened Home without firing. |
| Solo automatic continuation | A 0% Fence miss automatically restored aiming with two attempts left. A 45° / 24% hit then automatically showed a two-star solo result. Retry restored three attempts, retaining 45° / 24%. Best two-shot/style result appeared in map selection. |
| Pause | Paused the first solo shot in flight. After other work, the pause screen remained. Resume continued the same first attempt; no extra shot was consumed. Presentation timer pause/cancel behavior also has pure tests. |
| Home during flight | Fired an 85° / 100% shot and immediately returned Home. Gameplay controls disappeared and no next turn/result displaced Home. |
| Narrow layout | At 500×800, document/client/scroll width all equalled 500; canvas stayed logically 1280×560; gameplay action buttons measured 44 px high. Four-player setup retained all labelled names/patterns and map choices in a vertically scrolling panel, with no horizontal overflow. Viewport override reset afterwards. |

Independent code review found the keyboard Home regression and verified the correction. Browser warning/error logs were empty in the recorded production flow. That does not verify audio balance: actual listening quality, physical touch hardware, hardware stress/performance and long-session memory profiling remain **not verified**. Full three/four-player browser matches were not replayed in this pass; the N=2/3/4 rule tests cover alternating order/counts and the earlier three-map browser walkthrough remains historical evidence.

See `docs/game-audit.md` for suggested future work: an aiming tutorial, stronger character animation/recorded vocals, richer obstacle layouts and optional practice mode. Current owner-requested functionality is complete; sensory playtesting can inform later tuning.

## Multiplayer target cycles — 2026-10-04

**Done/current:** Implemented the approved repeat-hit farming fix. Every map has three authored horizontal positions, independently shuffled without replacement for matches/rematches. Everyone faces the same position within a shot cycle. Jonh stays at the finished shot's position during results and relocates only at the next cycle's handover. Reset/pause do not change the schedule. Saved personal aim/trails remain; status shows the cycle and asks players to adjust after movement. Solo, scoring, obstacles and physics are unchanged. The schedule is match-local, with no save migration. SPEC records the new scene-reset exception.

**Positions and decisions:** Backyard centres 15/18/21 m; Fence 14/17/20 m; Rooftop 16/18.5/21 m. Each effective level supplies matching renderer, Matter and swept geometry without modifying the base map. The tea table is placed to Jonh's left at the far Rooftop position so it stays on the roof. Each position has a physics-proven reference shot that misses both alternatives. Movement does not force misses: incidental rolling/ricochet hits at multiple positions are still possible under the unchanged physics rules.

**Automated evidence:** Final `npm run check` passed typecheck/lint and **23 files / 155 tests**, Vitest duration **1.66 s**. Final `npm run build` passed: **68 modules transformed / 765 ms**. Added 15 tests covering N=2/3/4 cycle fairness, stable result positions, duplicate scoring, reset and pause/resume stability, injected shuffle randomness, selected-map rematch reshuffling, all nine supported/in-bounds/clear target positions, immutable base data and reference-shot cross-position replays. The initial sandboxed full check encountered the known Vitest worker temporary-cache ENOENT; the unchanged required command passed outside the sandbox. Node emitted its experimental localStorage warning during tests.

**Production browser evidence:** Walkthrough at `http://127.0.0.1:4175` using `npm run preview`:

- Rooftop-only six-shot match used near → far → middle positions. Both players hit near at 65°/56%; Player 1 repeated that aim at far after reset and pause/resume, missed and retained 100 points. Player 2 adjusted to 65°/68% and hit far. Middle reference 75°/81% hit for both. Final result was Player 2 350 points/3 hits, Player 1 225 points/2 hits. Rematch retained Rooftop/aim, cleared scores and returned to cycle 1.
- After loading the final build, completed an 18-shot three-map tour. Backyard sequence far → near → middle; Fence far → middle → near; Rooftop middle → far → near. Observed all three cycles and alternating players, with Player 2 starting Fence and Player 1 starting Rooftop. Scores stayed equal at round boundaries: 250 → 575 → 925 each; final shared win with eight hits each (both first Backyard shots deliberately missed). Jonh/scenery remained aligned with the visible hit locations, each player's own trail persisted, and map transitions cleared old map trails.
- Final Rooftop far screenshot verified the corrected tea table stays on the roof. Final tour rematch restored Backyard round 1/cycle 1, zero scores and saved 65°/56% aim. Captured browser warning/error logs were empty.

**Review/known issues:** Independent code review found no blocking correctness issues; the rooftop scenery finding was corrected and re-reviewed. Full three/four-player browser matches, hardware touch and sensory/performance testing were not repeated in this pass; N=3/4 rule behavior is covered by automated tests. Visual enjoyment and target-difficulty balance still require owner playtesting.

**Next task:** a real-browser background-tab test (item 13), and the not-yet-observed browser cases (shared outage across the turn limit, never-returning player, background-tab spectator).



## Launch and impact polish — 2026-10-05

**Done/current:** Completed the owner-approved effects milestone. Accepted fire adds flash/smoke and cosmetic barrel recoil. First confirmed body contact resolves scoring immediately and starts an 80 ms contact freeze, 240 ms reaction at 35% speed, then normal reaction. Matter still receives only the fixed timestep. The impact has a camera shake/zoom punch, contact compression/rebound/tumble, ball squash, bounded dust/hat-coloured flecks/stars and a clamped fading BONK label. Existing hat/newspaper flight remains; duplicated old dust/stars were removed. All effect tuning lives in JUICE. No replacement assets, audio changes or aiming changes were added.

**Lifecycle/accessibility decisions:** Effects use explicitly advanced active presentation time rather than Phaser timer/tween clocks, so pause holds them exactly. The 1.4 s result window remains real-time and includes effects. Next now settles Jonh/ball and clears camera/effects; reset, Home, map loads, handovers, retry/rematch and shutdown use the same cleanup. Hidden-tab restoration discards the first catch-up frame. Saved/OS reduced motion suppresses moving effects and hit timing but keeps a static fading BONK and existing audio/reactions. Enabling it during a sequence cancels remaining motion. The impact label uses the existing system font; replacement typography is outside this milestone.

**Corrections found during verification:** Skipping a successful shot could leave the terminal ball visually squashed; cleanup now redraws it normally and settles Jonh. Per-frame recoil drawing initially picked the next multiplayer player's cannon colour during results; it now retains the shooter's colour/pattern until handover.

**Actual automated summaries:** Final npm run check passed typecheck/lint, **26 test files / 169 tests**, duration **1.45 s**. Production npm run build passed, **70 modules transformed / 897 ms**. git diff --check passed. Added timeline boundary/integration tests at 30/60/144 Hz, pause/reset/reduced-motion/duplicate impact coverage, renderer launch/camera restoration/cancellation/bounded particles/label clamping, and actual Matter replay comparisons for all three maps plus a hat-only case. Reference contacts, classifications, scores and one-shot results are identical across tested frame rates and effects modes. Headless reference incoming speeds include Backyard 11.794 m/s (strong) and Fence 8.347 m/s (weak). Initial sandbox Vitest failed with the historical shared temporary-cache ENOENT; the unchanged required command passed outside the sandbox. Node emitted the existing experimental localStorage warning.

**Production browser evidence:** Walkthrough used npm run preview at http://127.0.0.1:4176. Screenshots were inspected inline during the walkthrough.

- Fence 45°/24% showed BONK at contact and the 125-point ricochet/three-star result. Pausing immediately after contact held the same visible pose across subsequent work; Resume continued the result. Next now opened the result immediately; Retry retained aim.
- Backyard 45°/40% produced DIRECT HIT (100 points) with BONK. Backyard 25°/62% produced HAT HIT (20 points), flying-hat reaction and no BONK/body effects. A 0% multiplayer miss produced SHORT and automatically restored Player 2's own aim.
- Reduced-motion Fence hit showed the static label and settled Jonh, with no moving burst. Home during this result and during a later flight returned to Home without stale effects or delayed transitions.
- At 500×800, document client/scroll widths were both 500. BONK remained inside the canvas and action controls remained usable. The viewport override was reset.
- Final two-player Fence-only six-shot match used near → far → middle, reference aims 65°/34%, 65°/55%, 65°/44%. Both finished at 325 points and three body hits. Player 2's striped blue cannon remained blue during its hit despite the next player becoming active in the rules. Skips/handovers cleared effects, targets moved at cycle boundaries, personal trails persisted, and rematch restored cycle 1 with zero scores, clean scenery/trails and saved 65°/44% aim.
- Captured browser warning/error logs were empty. The final preview remains available for owner playtesting.

**Known issues/verification limits:** Actual physical touch, hardware FPS/stress and long-session heap profiling were not verified. Perceived sound balance and visual enjoyment require owner playtesting. Browser screenshots confirmed contact cues and cleanup; the very brief muzzle flash/recoil were not reliably captured manually, so their timing/render commands are verified by renderer tests rather than claimed as visually verified. OS preference changes during play and the in-flight saved-setting toggle were not manually exercised; cancellation is covered by automated controller/renderer tests and existing preference wiring.

**Next task:** a real-browser background-tab test (item 13), and the not-yet-observed browser cases (shared outage across the turn limit, never-returning player, background-tab spectator).

## Rubber Yard Map Addition � 2026-10-05

**Done/current:** Implemented the "Rubber Yard" map featuring a bouncy rubber ceiling and a solid concrete wall obstacle, satisfying the original design proposal for a trick-shot arena. Authored unique rendering for the new 
ubber material to distinguish it from concrete and wood. Determined and proved stable, exclusive reference solutions for standard play and multiplayer target positions. Passed all physics and orchestration tests.

**Lifecycle/accessibility decisions:**
- Kept MULTIPLAYER.maps to the core 3 maps (ackyard, ence, 
ooftop) to preserve existing competitive round tracking/match lengths, treating "Rubber Yard" as a distinct/optional map for solo practice or explicit selection.
- Rubber material has high restitution (0.9) to allow rich bounce gameplay without breaking standard impact dampening on grass.
- Multiplayer offsets were standardized to -2, 0, 3 to match other levels and ensure physical exclusion of trick shots.
- SceneryRenderer gives the rubber surface a distinct pink/red color with a soft highlight and thick border, clearly signaling its bouncy nature to the player.

**Actual automated summaries:**
- 
pm run check passed typecheck/lint, **26 test files / 176 tests**, duration **1.40s**.
- 
pm run build passed: **71 modules transformed / 1.34s**.
- Brute-forced exclusive trick-shot solutions in headless tests, ensuring physical solvability despite the high 7.0m concrete wall blocking direct shots to Jonh.

**Next task:** a real-browser background-tab test (item 13), and the not-yet-observed browser cases (shared outage across the turn limit, never-returning player, background-tab spectator).

## Polish pass — 2026-10-07/08 (branch `polish-pass`)

Owner request: make the game look and feel polished and shareable. Audit: `docs/polish-audit.md`. Style guide: `docs/art-direction.md`. Running notes per phase below; full summary in `CHANGELOG.md`.

**Phase 2.1 — impact moment.** Art pipeline: SVG parts in `src/art/` rasterized once at boot (`BootScene`, `render/artTextures.ts`) at 2–3× for crisp zooms. Jonh rebuilt as a layered rig (`render/jonhRenderer.ts`) driven by a pure pose function (`fx/jonhPose.ts`), so the hit-stop holds frame 0 (his most extreme, crumpled pose) and every reaction is replayable. On the contact frame: hit-stop + slow motion with an eased ramp (time fed to the accumulator only), 1–2 frame flash, contact star, shockwave ring, radial particle burst, comic word with overshoot (Luckiest Guy), ball squash, camera punch-in and directional shake, and layered sound (thump + crack + yelp). Intensity is chosen per hit quality (`fx/impactProfile.ts`: trick > strong > weak > hat > obstacle > ground). Reduced motion keeps the comic word and sound, cuts poses, and drops freeze/slow/shake/flash/particles/camera motion. Decisions: body hits now hold the result for 2.6 s (`FLOW.bodyHitResultSeconds`) so the knock-back lands; stored multiplayer colours remain as save identifiers and are mapped to the new palette when drawn.

**Phase 2.2 — Jonh and the world.** Jonh's rig now has idle life (breathing, blinks, a page turn every 8 s, suspicious glances), anticipation (peeks over the paper while the player drags to aim; flinches and raises the paper as the ball closes in) and distinct reactions: weak/strong/trick knock-backs, hat-only (hat flies, he pats his bald head), duck (overhead), smug (short), glare (over) and wince (obstacle). Scenery is four parallax layers (sky+sun+drifting clouds, far hills/skyline, mid hills with trees and birds, garden fence) plus a tiled ground with an ink edge on the collider top; each map has its own light (midday, afternoon, golden-hour town, pink late afternoon). Obstacles are drawn per collider box (shed, fence post, brick terrace, stone wall, rubber beam on chains); flowers/tufts sway. Memory is kept low by tiling small textures. Ambient motion runs on real time and stops under reduced motion.

**Phase 2.3 — cannon and shooting.** New cannon (carriage, spoked wheel, brass-banded barrel painted in the player's colour and pattern). Fire now has anticipation (0.12 s wind-up: barrel squash + fuse sparks + fizz while simulation time is held), then muzzle flash, smoke puffs, sparks and recoil that rolls the carriage. The ball stretches with speed and leaves a speed ribbon; trails are a comic dotted path with an inked X landing mark. Aiming is in the world: grab the cannon (it points at the pointer, distance = power) or drag anywhere (↕ angle, ↔ power, axis-locked), with a 0.3 s analytic launch preview (direction and power, never the landing; SPEC §3.2) and a fairground power meter under the cannon. Sliders and keys remain as the accessible fallback.

**Phase 2.4 — camera and replay.** A camera rig (`render/cameraRig.ts`, pure framing in `fx/cameraDirector.ts`) frames the full field while aiming, follows the ball at a gentle 1.15× in flight, zooms out (bottom-anchored, never below the ground) when the ball climbs above the view, punches in on Jonh at impact (zoom + directional shake on real time, so it moves during the hit-stop) and returns to the full view on reset. Strong and trick hits get a slow-motion replay (`fx/replay.ts`): after Jonh lands, letterbox bars and a blinking REPLAY tag appear, the camera follows the recorded ball at 2.1× and 40 % speed, Jonh (back in his chair) spots it coming, and the full impact replays before easing out. Replays are presentation only (recorded positions + the pure pose curve), skippable with Next/Enter, frozen by pause, and absent under reduced motion. After a body hit the ball now bounces away cosmetically instead of freezing in mid-air. Decision: weak hits and hat hits get no replay, to keep multiplayer turns brisk; the body-hit result window stretches to fit the replay.

**Phase 2.5 — audio.** Kenney "Impact Sounds" (CC0, 15 files, 165 kB Ogg) are layered with synthesized parts; every hit plays a low thump (sine kick + punch sample), a high crack (band-passed noise + wood sample) and Jonh's formant yelp on the same AudioContext time, with a slide whistle for strong hits and a bell for trick shots. Surfaces sound different (grass, wood, stone, rubber "boing"), the hat gets a tinny plink + "fwip", the cannon has a fuse fizz, a sub kick, a crack and air. A speed-following whoosh plays in flight. Every play is pitch-randomised (cosmetic RNG); nothing is slowed during hit-stop or replay. A light 8-bar swung loop ("Sunday Stroll", marimba/pizzicato bass/shaker, synthesized) and occasional birdsong run on a separate music bus with its own setting; everything passes a master compressor. Measured in headless Chrome: all 15 samples decode, output peaks 0.22 (music), 0.73 (launch), 0.88 (hit), no clipping. **Not verified:** how any of it actually sounds to a listener; no listening was possible. If Ogg decoding fails (very old Safari), the synthesized layers still play.

**Phase 2.6 — UI and screens.** One display face (Luckiest Guy) and one UI face (Nunito), self-hosted. The page is a halftone comic backdrop; the game is a full-screen comic panel (height-limited, 16:7) with the HUD laid over the canvas: map chip + cannonball attempt pips or player score chips, sound/pause icon buttons, a pop-in caption, a big pulsing FIRE button where the right thumb rests, a "Next" pill after a shot and a collapsible "Precise aim" panel that keeps the native sliders as the accessible fallback (always shown in portrait). Title screen: animated logo over a live attract scene (Jonh reading in the Backyard). All menus/results restyled (mode cards, illustrated map cards with stars, coloured handover name with auto-advance bar, ranked score rows, stars that pop in, NEW BEST/TRICK SHOT ribbons, switch-style settings incl. a new Music toggle); cards pop in, an iris opens into play; button clicks tick. Reduced motion (setting or OS) also turns off CSS animation. Phone landscape now fits everything on one screen (previously the controls were below the fold); portrait stacks controls under the canvas with a rotate hint.

**Phase 2.7 — retention (three cheapest replay reasons).** Chosen for cost vs. pull: (1) **Unlockable hats** — eight hats for Jonh (art already part of the rig), unlocked by milestones (first hit, hat-only hit, trick shot, three stars, a Daily Bonk hit, 25 hits, three stars everywhere); selected in a hat locker and worn everywhere including the title scene. Gives long-term goals and makes clips visibly different. (2) **Daily Bonk** — a date-seeded pick of a map + one of its already physics-validated multiplayer target positions, so every day is solvable with zero new level work; only the first run of the day is recorded, with a day streak; it never touches solo bests. (3) **Hit streak** — consecutive solo body hits, shown as a HUD chip and on results, best streak saved. Pure rules in `rules/progression.ts` (tested), persisted as an optional `progress` field in the existing `hitJonh.v1` save (older saves load unchanged; corrupt progress is sanitised field by field).

**Verification and evidence (end of the polish pass).**

- `npm run check`: typecheck and lint pass, with **34 test files / 218 tests** passing.
- `npm run build`: passes. Phaser is 1.43 MB (375.6 kB gzip, unchanged) and game code is 193 kB (57 kB gzip). New shipped assets are 56 kB of fonts and 165 kB of audio, about 660 kB transferred in total without sourcemaps.
- **Headless Chrome (CDP) walkthroughs** with screenshots in `docs/polish/after/`:
  - every screen at 1440x900, 844x390 (phone landscape) and 390x844 (portrait)
  - impact frame sequences stepped at exactly 16.667 ms for strong, hat-only, reduced-motion and replay (`impact-seq/`); every layer fires on the contact frame
  - a 2-player Fence match: alternating turns, the same position per cycle, 325/325 tie with crowns, and a clean rematch
  - pause in flight and during the replay: frozen exactly, then resumes
  - a Daily Bonk run that unlocked hats
  - the production `vite preview` build: no console errors, no dev globals, no tuning panel
- **Audio** (measured, not listened to): all 15 samples decode; output peaks are 0.22 for music, 0.73 for launch and 0.88 for a hit.
- **Performance** under 4x CPU throttle in headless Chrome: during flight and impact, update p95 is about 2 ms and render CPU p95 about 8 ms. The contact frame is about 25 ms (about 6 ms unthrottled). The one remaining spike (~77 ms at 4x) happens when the result screen builds its HTML, not during play.

**Known issues / not verified.**

- **Sound and feel:** no listening and no hands-on play were possible.
- **Real-device frame rate:** headless Chrome renders with SwiftShader, so GPU cost on a phone is unknown.
- **Ogg decoding on old Safari:** if it fails, the synthesized layers still play.
- **The hat-locker screen** builds data URLs from textures on first open (a few ms).

**Next task:** a real-browser background-tab test (item 13), and the not-yet-observed browser cases (shared outage across the turn limit, never-returning player, background-tab spectator).

## Online multiplayer — 2026-10-08 (branch `online-multiplayer`)

**Built.** Online rooms by code for 2–4 players (SPEC §6.1), on Convex. Each browser tab is one player; the shooter's client reports the official outcome while every client re-simulates locally. The server (`convex/`) owns turn order, aim and duplicate checks, the timers (120 s turn, 90 s stale player, 40 s unreported shot), rematch and an hourly room cleanup. Client modules: room code and session logic, a replay-based match tracker, online setup/lobby/notice screens, and an `OnlineController` wired into `PrototypeScene` (`activeMode` stays `multi`, online is `online?.inMatch`). Hot-seat play and the saved local roster are unchanged by design and unit-tested (walkthrough item 17 NOT VERIFIED). Setup: README "Online play (Convex)".

**Cross-browser determinism (Task 1).** The user ran `crosscheck.html` in Chrome and Firefox: 639 shots, outcomes and step counts identical (94 Body, 26 Ricochet Body, 2 Hat Only, 517 Miss). One shot (rooftop/near 76/90) ends about 1.08e-11 apart (float rounding) with the same outcome (miss) and 1801 steps. Safari: **NOT VERIFIED** (no digest provided). The user accepted the Chrome+Firefox match on 2026-10-08.

**Automated evidence (run at the end of Task 15).**
- `npm run check`: typecheck and lint pass; `Test Files 44 passed (44)`, `Tests 355 passed (355)`, duration 2.35 s.
- `npm run build`: passes; `167 modules transformed`, `built in 824ms`; Phaser 1,431.43 kB (375.59 kB gzip); `main` 287.01 kB (84.57 kB gzip).
- Node printed its usual experimental localStorage warning during Vitest.

**Manual walkthrough (Task 15 Step 1): run 2026-10-08 via the chrome-devtools MCP** (one Chromium, three pages in separate browser contexts, Convex dev `proper-lapwing-569`). Full evidence: `.superpowers/sdd/2026-10-08-online-multiplayer/task-15-walkthrough-2.md`. Result: 12 PASS, 1 FAIL (item 12), 1 NOT VERIFIED (item 13), 5 PARTIAL. Same engine and machine throughout, so no cross-browser, phone or Safari/Firefox coverage.

| # | Item | Status | Observed |
| --- | --- | --- | --- |
| 1 | Create in tab A; join from B by lowercase code with a space and by link; distinct colour/pattern | PASS | `rx kyd` joined as seat 2; `?room=` link prefilled and joined as seat 3; colours/patterns distinct. |
| 2 | Bad code `K0QPX` rejected locally; unknown valid code says "No room with that code." | PASS | Both messages seen. |
| 3 | Host changes arena and B sees it; B has no Start; Start enabled at 2 players | PASS | Arena change reached B within 1.5 s; Start disabled at 1 player, enabled at 2. |
| 4 | Full single-map match: shots animate on both tabs from fire, scores match, handover text | PASS (ball not eyeballed mid-air) | Both tabs showed "in flight" at fire time; final scores matched (Bob 100, Alice 0). No screenshot of the ball in the air on the spectator tab. |
| 5 | On the other player's turn Space/arrows/drag/Fire do nothing; "{name} is aiming…" | PASS (canvas drag not tried) | Keys changed nothing; Fire, sliders and Aim again were disabled. |
| 6 | Pause during the other player's flight; their next shot waits and plays once on resume | PASS | Shot played once after Resume. |
| 7 | Reload A mid-turn rejoins; reload during own flight replays and reports; B not stuck | PASS (re-run) | Re-run 2: host tab reloaded on its own turn, rejoined seat 0 (\"Your turn!\"), fired, match advanced, never marked `left`. Reload while the ball is airborne not re-tested. |
| 8 | Leave on own turn: skipped at once, "{name} was skipped", no cannon fire | PARTIAL | Turn advanced with no gap and later turns read "was skipped", but the first skip banner was missed and "no cannon fire" was not checked by screenshot. |
| 9 | Close B's tab on B's turn: warning at 60 s, skip at 90 s | PASS | Warning at 52 s, skip at 82 s after close (about 8 s before the last heartbeat, consistent with 60/90). |
| 10 | Idle 120 s on own turn: countdown from 90 s, then skip | PASS | "30 s left to fire" at ~88 s, counted to 1 s, then "Your turn was skipped". |
| 11 | A offline over 40 s mid-flight: B reports witness outcome; A sees "Your shot timed out" | PASS | Witness outcome recorded 40.0 s after fire; shooter saw "Your shot timed out" within 3 s of reconnecting. |
| 12 | Shared outage over 120 s: no skips, fresh turn clock, in-flight shot reported by shooter | PASS (re-run 3, after `1d97b08`) | Three pages offline, restored staggered (first back 50-61 s before the last): no player who was still reconnecting was skipped; `rooms.lastQuiet` recorded; the in-flight shot was resolved by the shooter's own report. Never-returning player and background-tab spectator NOT VERIFIED in a browser (unit tests only). After an outage the turn clock runs from the last restart in the quiet period (about 54 s were left when the last player returned). |
| 13 | Background tab over 5 minutes: not skipped while away | NOT VERIFIED | Needs a real hidden window for over 5 minutes. See bug note below. |
| 14 | Lobby host quiet over 90 s: B becomes host; A rejoins; Leave does not rejoin | PASS | Host handed over at 85 s; A rejoined automatically on reconnect; Leave did not rejoin. |
| 15 | Rematch: both ready starts at once; one ready counts down; "You weren't included"; "Not enough players…" | PASS (re-run) | Re-run 2 with three players: both-ready starts at once; two ready showed \"Rematch starts in 23 s… 2 s\", then the third saw \"YOU WEREN'T INCLUDED IN THE REMATCH.\" \"Not enough players\" seen in run 1. |
| 16 | Skip-vs-fire race at about 119 s: loser sees "Your turn was skipped", clients agree | PASS (timing approximate) | Fire at "1 s left" won; fire at "0 s left" lost and both clients agreed. Fire time only approximately 119-120 s. |
| 17 | Hot-seat roster still shows saved local players after online play | PASS | Hot-seat names Zed/Yan survived; online profile stored separately. Roster was entered after the online session. |
| 18 | Cleanup cron registered and hourly runs error-free; 24 h deletion | PARTIAL | `convex/crons.ts` registers hourly `cleanupRooms`; logs show one Cron run, error null, 0 documents touched. Only one run seen, so "hourly" repeats and the 24 h deletion NOT VERIFIED. |
| 19 | Dev console `[online] shot … local …, official …` mismatch warnings across browsers | PARTIAL | No mismatch warning in Alice's console. Bob's console not read; single engine, so nothing about cross-browser. |

**Item 12 fix and re-run (evidence: `.superpowers/sdd/2026-10-08-online-multiplayer/task-15-walkthrough-3.md`).**
- Commits `47ada62` (rules: skips and shot timeouts now need evidence of life; `isRoomEmpty` replaced by `lastLife`/`isRoomQuiet`/`isOutlived`; 9 new or changed tests failed first) and `f14a3d2` (spec). Pushed to dev only. `npm run check`: 45 files, 374 tests pass; `npm run build` passes. Three old tests changed meaning (turn-limit skip needs a later check-in; wait interval is 2 heartbeats; a shooter who left with no witness waits for a check-in).
- Re-run in a real browser: M1 PASS (focus stayed on Leave through ~21 countdown re-renders); items 7 and 15 PASS (above); item 12 still FAIL because of bug A.
- **Bug A (open, not fixed): reconnect race.** After a shared outage the first player back makes everyone not yet reconnected look missing; one `reportOutcome` skipped two turns, and `checkTurn` has the same race. Proposed fix: record on the room when a quiet period ends and count staleness and the 2-heartbeat margin from then (needs a new schema field).
- **Bug B (new behaviour):** the turn-limit skip can land up to 15 s after the limit ("0 s left to fire" shows for up to 15 s; a fire in that window is still accepted).
- **Bug C (new behaviour):** an abandoned room (players quiet but never left) now runs its check timer every 30 s instead of 90 s until the 24 h cleanup, about 2,880 runs per room per day.
- **"This match ended unexpectedly" cause (open, not fixed):** not a server skip. The client marked itself left: in `src/scenes/onlineController.ts`, `update()` reads state at line 326, may start a playback at 339-341, then calls `isCutShort(view)` at 343 with the stale state. When the last shot of a match is a skip, `startPlayback` marks it presented at once, so `isCutShort` sees a finished room with every shot presented and returns true; `endCutShort` calls `leaveRoom` (`convex/rooms.ts:160` sets `left`). Reproduced without a frozen tab (Carol left on the final turn while Alice watched). Proposed fix: return right after `startPlayback` or re-read the presentation before `isCutShort`, with a controller test for a final-shot skip.

**Bug A and `isCutShort` fixes (evidence: `task-15-walkthrough-4.md`, `-5.md` in `.superpowers/sdd/2026-10-08-online-multiplayer/`).**
- `a617f40` (client): `onlineController.update()` re-reads the presentation before `isCutShort`, so a final-shot skip shows the result instead of "This match ended unexpectedly" and no longer marks the watcher `left`. Browser: PASS (watcher stayed on "WATCHER WINS!", `left: false` in Convex dev). Genuine cut-shorts still end unexpectedly (regression test).
- `1d97b08` + `7c426d3` (bug A): `touchPresence` (`convex/model.ts`) records the new optional `rooms.lastQuiet = { start, end }` when a check-in ends a quiet period; staleness and the 2-heartbeat margin count from `end`, for `checkTurn`, `checkInFlight`, report-driven turn start and the client "Waiting for…" warning. Eight new tests (six watched failing). Pushed to dev only. Trade-off, written into the spec: with a once-a-minute background-tab spectator, a truly missing player can be skipped up to about a minute late.
- Evidence now: `npm run check` 45 files, 386 tests pass; `npm run build` passes.
- **Bug B (fixed with option B3, commits `50ac35b`, `92cc4b7`):** after the limit the server rechecks every 2 s (`ONLINE.turnLimitRecheckSeconds`) and each client sends one heartbeat when its countdown hits 0 (`OnlineMatchTracker.takeTurnExpiry`). Browser: the skip landed 2.014 s after the limit, twice (both pages connected; active player offline). A short single-player outage still did not skip. NOT VERIFIED in a browser: a shared outage across the limit (unit tests only). Caveats: if the client's server-clock estimate runs ahead, the 0 s check-in can miss the limit and the skip falls back to the old up-to-15 s worst case; if every tab is hidden the 0 s heartbeat doesn't fire (game loop stops) and the skip waits for a regular heartbeat. Evidence: `task-15-walkthrough-6.md`. `npm run check`: 45 files, 392 tests; build passes.
- **Bug C (accepted, option C3, no change):** abandoned rooms keep their check timer running (about 2,880 runs/room/day, about 5,760 with a shot in flight) until the 24 h cleanup. Revisit with C2 (stop while quiet, re-arm from the `lastQuiet` check-in) if Convex usage becomes a concern.
- Minor: "0 s left" showed for 0.5-5 s right after a reconnect.

**Bugs / notes from the walkthrough (run 1).**
- Item 12 FAIL (above): look at `checkTurnDecision` and the presence-staleness threshold.
- A tab that was not the DevTools-selected page froze (countdown stuck), stopped heartbeating, was marked `left`, and its match ended with "This match ended unexpectedly." Likely test-environment throttling, not a controlled test, but it is the same area as item 13 and needs a real-browser background test.
- Minor transient UI after reconnect: "Waiting for Bob… skipping in 6 s" shown for ~2 s on the reconnecting tab; the lobby showed stale host state for ~2 s.
- Layout: on the spectator tab the other player's cannon is drawn below the ground strip with a "Bob · stripes" label; whether the "is aiming…" banner is ever visibly shown was not verified.
- No JS errors other than the expected offline WebSocket failures.

**Still not verified:** items 13 and 12's in-flight part, repeated hourly cron runs and 24 h deletion, the `IMPOSSIBLE_OUTCOME` rejection, phone/touch, Safari/Firefox, cross-browser mismatch warnings.

**How to re-run.** Have `.env.local` from `npx convex dev`, run `npm run dev -- --host`, and open each player in a NEW tab, not "Duplicate tab" (a duplicate shares `sessionStorage` and so the first tab's seat). Use DevTools Offline for items 11-12.

**How to run the walkthrough yourself.** Have `.env.local` from `npx convex dev`, run `npm run dev -- --host`, and open two tabs (or a desktop browser plus a phone on the same Wi-Fi); each tab is its own player. Open each player in a NEW tab, not "Duplicate tab": a duplicated tab copies `sessionStorage` and so shares the first tab's seat. Work through the 19 items above, using DevTools Offline for items 11–12, and record PASS/FAIL here.

**Decisions.**
- One player per tab: the token lives in `sessionStorage`, not `localStorage` (approved deviation), so two tabs can play each other.
- `activeMode` stays `multi` and online play is `online?.inMatch` (approved; the spec wording said `'online'`).
- The shooter's client is trusted for the official outcome; the server never re-simulates physics.
- Chrome+Firefox identical outcomes accepted as the cross-browser gate; float drift only affects animation.
- The Convex deployment `proper-lapwing-569` is treated as dev; nothing was run against the production deployment.
- `heartbeat` and `leaveRoom` silently no-op for unknown tokens; room codes are normalized client-side before any server call.
- A reopened `?room=CODE` link into a seat marked left shows Join prefilled and never auto-rejoins.
- Server `startTurn` logs and finishes a match that cannot be replayed instead of throwing (a throw inside a timer would wedge it); the client then leaves with "This match ended unexpectedly."

**Known limitations / deferred.**
- Previous-shot trails are empty after a reload until each player fires again.
- Trust model: a modified client could report any outcome that is possible on the map.
- `joinRoom` clears `left` only when the room is `playing`, so a left seat in a finished room is not cleared by Join.
- Minor review items remain: unbounded `.collect()` in a few reads, `destroy()` does not stop a pending create/join, some hard-coded colours in `menu.css`, and small a11y/focus nits on the online screens.
- Convex tooling also wrote Convex guidance blocks into `AGENTS.md`/`CLAUDE.md` and files under `.agents/`, `.claude/` and `skills-lock.json`. They are not part of this work and are left uncommitted for the owner.

**Final review fix wave (after the whole-branch review).**
- I1 (browser: PARTIAL PASS: offline Create then Back stayed on the mode screen and the late room was left empty; late Join and late link NOT VERIFIED): Create, Join and a `?room=` link now act only if the user is still on the screen they started from. Convex queues calls while offline, so a reply could land late and pop a lobby over a solo game or leave an orphan seat; a late Create/Join now gives its seat back (`leaveRoom(code)`). Covered by 5 new controller tests and 1 session test, each watched failing first.
- I2: on another player's turn the HUD is no longer inert. Mute and Pause stay usable (touch players have no Escape/M), while Fire, the aim sliders and Reset are disabled. Hot-seat is unchanged (there `canUserAct()` is always true). Browser: PASS (Mute toggled and Pause worked while Fire, sliders and Aim again were disabled).
- I3: Copy link did nothing on non-secure origins (it never crashed). `navigator.clipboard` is undefined on a LAN `http://` address. Fixed with a fallback: the lobby shows the link in a read-only, selected field labelled "Copy this link". The pure `copyText()` helper is unit-tested; browser: PASS with `navigator.clipboard` set to undefined (selected read-only field appeared and survived a lobby re-render; the clipboard success path was not exercised).
- M1: the online result screen keeps keyboard focus across its once-a-second countdown re-renders (browser: PARTIAL PASS: focus on Leave held across a Rematch press and the "Not enough players" note; the "Rematch starts in Ns" re-renders were not observed).
- M2: `cleanupRooms` schedules another run immediately after deleting a full batch of 50 rooms. Pushed to dev only (`npx convex dev --once`); not exercised (no smoke run).
- Docs: SPEC §6.1 now names the `online` field of the `hitJonh.v1` save; README and this file say each player needs a NEW tab, not "Duplicate tab".
- Evidence after this wave: `npm run check` passes with `Test Files 45 passed (45)` and `Tests 364 passed (364)`. `npm run build` passes: `168 modules transformed`, `main` 288.17 kB (84.91 kB gzip).
- Scope note: `main` does not contain `polish-pass`, so merging this branch also lands the 18 polish-pass commits (`eae4f6b..b13980b`).

**Next task:** a real-browser background-tab test (item 13), and the not-yet-observed browser cases (shared outage across the turn limit, never-returning player, background-tab spectator).

## Online screens UI pass (2026-10-10)

- Play online setup now matches the other menus: a white profile card with a live cannon preview (it updates as you change the colour, pattern or name), chip-style colour and pattern pickers (the native radios are still inside them), styled name and room-code inputs, "Create room · or · Join" on one row, and a normal `Back` button. The cannon preview comes from `cannonFigureSvg()` in `art/cannonArt.ts`, which reuses the in-game barrel, carriage and wheel art.
- Lobby: the room code uses the display font on a dashed ticket next to Copy link. Each player row shows that player's cannon, and empty seats collapse into one "N open seats" row. Guests now see the arena as the same card the host picks from, not as plain text. A note explains why Start is disabled.
- Flicker fix: `MenuOverlay.open()` no longer replays the card entrance when it re-renders the view already on show, and `.is-refresh` turns off child entrance animations (score rows). It also keeps the scroll position. Lobby map switches, presence changes and the result countdown now update in place.
- Map previews get unique gradient ids for each render. "Three-garden tour" uses a new triptych `tourPreview()` (local Pass-the-cannon too) instead of repeating the backyard art.
- Online banner and rematch ready-chips now use the shared ink/paper tokens.
- Browser: PASS. Setup preview changed live (purple + checks + name). Room created, guest joined in a second tab, and the host switched maps 4×: 0 `animationstart` events fired on the host or the guest card, and the guest's arena card updated live. Checked the phone layout (390 px). `npm run check`: 392 tests pass.

## Shared maps, harder maps and four mechanic maps (2026-10-10)

Owner request: every mode uses the same maps; the existing maps were too easy; add creative maps (ricochet/bank, trampoline, very zoomed out, plus low gravity). Owner decisions: multiplayer uses a "pick any set" checklist with presets; existing maps retuned harder; low gravity is the only extra mechanic.

**Done**
- **One map list.** `MAPS` (8 maps) drives solo, Daily Bonk, hot-seat and online; `MULTIPLAYER.maps` is gone. Hot-seat and the online host pick any distinct set from a checklist (`src/ui/mapSetPicker.ts`) with presets Classic tour / Trick shots / Every map (`MAP_PRESETS`, default Classic); guests see a read-only card. The server's `validMaps` accepts any distinct subset of `MAP_IDS` (no Convex schema change). Fixes the crash when Rubber Yard was picked in hot-seat. Map previews are drawn from level data; maps carry a difficulty rating shown as pips.
- **Per-level physics.** `levelPhysics(level)` (gravity, launch-speed scale) feeds the scene, headless runner, aim guide, debug readout and thickness rule.
- **Zoomed-out maps.** `levelView` zooms maps wider than 25.6 m out (bottom-anchored, same aspect); camera frames, scenery extents, landing label, cannon slots, grab distances, power meter and speech bubble follow it. Ordinary maps are unchanged (tested).
- **Bounce fix (physics behaviour change).** Matter's contact solver resolved most impacts before the swept guard and damped every material to ~0.15 restitution, so materials barely mattered. Impacts faster than `PHYSICS.bounceMinNormalSpeedMs` are now re-bounced from the incoming velocity with the material's restitution (drop test from 7 m: trampoline rebounds to 6.9 m, rubber 6.0 m, concrete 3.0 m). Rolling damping now applies on any flat top (roofs, decks), default 0.975/step, with per-material overrides (regolith, gravel, sand, rug: 0.88–0.95).
- **New materials + art:** trampoline, steel, leaves (canopy/hedge), rock, regolith, gravel, sand, rug; carport, billboard, planters, awning, tree trunk, hedge, floor slabs; moon theme (stars, Earth, grey ground, no fence/flora), desert valley theme.
- **Difficulty tooling.** `src/dev/difficulty.ts` + `tests/difficulty.test.ts`: the default run caps the hit share of a 5°×5% grid per target position (`DIFFICULTY.maxCoarseHitFraction` 8%) and checks trick-shot shares (Bank Shot 100%, Bounce House ≥ 90%). `DIFFICULTY_REPORT=1 npx vitest run tests/difficulty.test.ts` prints the 1°×1% table and suggests reference aims that do not also hit the other positions.

**Measured difficulty** (share of the 1°×1% grid that scores a body hit, near / middle / far). Baseline = previous maps with the previous physics.

| Map | Before | After |
| --- | --- | --- |
| Jonh's Backyard | 9.5 / 11.5 / 11.9% | 3.3 / 5.8 / 3.8% |
| The Fence Dispute | 8.7 / 14.1 / 15.4% | 1.6 / 5.2 / 6.1% |
| Rooftop Lunch | 8.9 / 10.9 / 12.5% | 4.9 / 7.1 / 5.6% |
| Rubber Yard | 0.9 / 3.6 / 8.4% | 0.3 / 2.4 / 4.5% |
| Billboard Bank Shot (new) | — | 4.1 / 6.9 / 6.2% (all bank shots) |
| Bounce House (new) | — | 1.2 / 1.2 / 0.6% (95–100% trick) |
| Lunar Picnic (new) | — | 1.6 / 3.3 / 2.9% |
| Across the Valley (new) | — | 2.0 / 2.5 / 2.8% |

**Verified**
- `npm run check`: typecheck + lint clean; 458 tests passed, 8 skipped (the opt-in difficulty report).
- `npm run build`: succeeded.
- Browser (dev server, Playwright): all 8 maps listed with previews in Solo; Lunar Picnic flight and curved aim guide; Across the Valley resting view at 0.4×, flight follow, readable meter and speech bubble, reference shot 30°/53% scored a direct hit with replay; Bounce House reference 80°/74% scored a trick shot; Billboard bank shot rebounds into the carport; hot-seat "Trick shots" preset starts a 4-round match on Billboard Bank Shot; hot-seat Rubber Yard-only match starts (previously threw); `?debug` collider outlines on the Valley; no console errors.
- **Not verified:** online play against a Convex deployment (no local deployment used); covered by `onlineRules`/`onlineController` tests only. Real-device touch aiming on the zoomed-out map.

**Known issues / consequences**
- Crown hat ("three stars on every garden") now needs all 8 maps; players who had it lose it until they earn the new maps.
- Daily Bonk draws from all 8 maps, so the date → map mapping changed.
- Saved solo best results on the 4 retuned maps were earned on the easier layouts.
- `?debug` HUD text stays at world size on the zoomed-out Valley (tiny, overlaps the meter); dev only.
- Bounce House allows a rare direct flat lob (≤ 10% of hits).

**Next task**
- Owner playtest of the new difficulty; tune `DIFFICULTY` caps and map geometry from feedback.


## Multiplayer player panel (2026-10-10)

**Done / current**
- Added a persistent vertical roster for local and online matches, outside the arena. Each player has their patterned cannon, name, total points and an explicit active-turn label (Up next, Aiming, Firing, Shot complete). Seat order stays stable. Round/match summaries clear the active-player marker; shot results keep the player who fired highlighted until handover.
- Online shows the room code, a You label and Online / Away / Left presence. During a server connection outage it shows Connection unknown instead of claiming other players are online. Presence uses the existing tracker and refresh cadence; no backend changes.
- Removed overlapping score chips. The panel moves below the arena/HUD on portrait phones. Short landscape screens use compact rows, and the HUD stays sized to the arena even when four player rows are taller. Solo and menus hide the panel.

**Decisions**
- Owner-requested player panel supersedes SPEC ?6's score strip. Matches retain their existing turn order, scoring and rules; the panel has no new gameplay controls.

**Verified**
- `npm run check`: typecheck and lint passed; actual Vitest summary: `Test Files 48 passed (48)`; `Tests 459 passed | 8 skipped (467)` (opt-in difficulty reports skipped).
- `npm run build`: succeeded; `176 modules transformed`; main 311.36 kB (91.90 kB gzip).
- Collaborative browser: local two-player aiming ? firing ? handover highlighted the right player; Home hid the roster. Portrait 390?844 had no horizontal overflow. Four-player local match at 844?390 kept Fire within the canvas and page height at 390 px. Desktop panel stayed beside the arena with the HUD over only the arena.
- Online browser fixture (not a live room): four rows with 100/125/20/0 points, You, Online/Away/Left, long-name wrapping and Connection unknown during reconnection. Controller test checks live presence, the stale threshold, a departed player, connection outage and room exit.
- Read-only second-agent review caught the tall-roster HUD positioning issue; fixed and checked in four-player landscape.

**Known issues / not verified**
- Live online two-device gameplay was not verified: Create room returned "Couldn't reach the server. Check your connection and try again." No deployment was changed.
- Real-device touch and assistive-technology announcement testing not verified; browser viewport checks only.

**Next task**
- Verify the panel during a live online match once the configured server is reachable; owner playtest of roster sizing.

## Empty multiplayer map selection (2026-10-10)

**Done / current**
- Local setup and the online host can untick every arena. Start match becomes disabled and gray immediately; selecting a map or a preset enables it again (online still requires at least two players).
- Empty selection shows "Choose at least one arena to start." Online guests see "The host is choosing arenas."
- Online lobby map updates accept an empty list; the server rejects starting with no maps. Match rules still require at least one map.

**Decisions**
- Owner request supersedes the previous picker rule that prevented unticking the last arena. Updated SPEC section 6.

**Verified**
- `npm run check`: typecheck and lint passed; `Test Files 48 passed (48)`; `Tests 459 passed | 8 skipped (467)`.
- `npm run build`: succeeded; `176 modules transformed`.
- `npx tsc --noEmit -p convex/tsconfig.json`: passed.
- `npx convex dev --once`: Convex functions ready on dev `proper-lapwing-569`; no schema change.
- Collaborative browser: zero checked local maps, Start disabled with `grayscale(1)`, disabled click stayed in setup; selecting Rubber Yard restored Start and began a one-round match.
- Online browser fixture: unticking the last map emitted an empty selection and disabled Start; disabled click did not call Start; refresh with no maps kept Start disabled; selecting Lunar Picnic enabled Start; guests received the empty-selection message.

**Known issues / not verified**
- Live online two-device selection synchronization was not verified; online UI verified using a fixture, backend compiled and synced to dev.

**Next task**
- Owner playtest; verify online selection synchronization with two connected devices.

## Jonh moves only when hit (2026-10-10)

**Done / current**
- Multiplayer Jonh no longer relocates every shot cycle. He stays put through misses and hat-only shots, and moves to the next position in the map's shuffled schedule only after a body or ricochet-body hit (`MultiplayerMatchMachine.moveCount`). The move is applied when the result is dismissed, so the result screen still shows the old spot. Three hits wrap back to the first position; every round and rematch starts at the first position.
- When he moves he says a line from the new `moved` reaction pool (`rules/reactions.ts`), shown in his speech bubble like the map arrival line. The "Jonh has moved—adjust your aim" status now follows `moveCount`.
- Online matches use the same machine through `replayMatch`, so the schedule stays deterministic from seed + recorded outcomes. No backend change.

**Decisions**
- Hat-only is not a hit for moving (it is not counted as a body hit in scoring ties either). Solo and daily modes are unchanged: Jonh never moves.

**Verified**
- `npm run check`: typecheck and lint passed; `Test Files 48 passed (48)`; `Tests 464 passed | 8 skipped (472)`. `tests/multiplayerCycles.test.ts` rewritten for hit-driven moves.

**Known issues / not verified**
- The new speech line and the move in the browser, and online two-device play, were not verified.


## Player presence dots (2026-10-10)

- Removed redundant Here labels from local player cards. Only the active player's shot phase is shown.
- Online player names now have a green circle when connected and a red circle when away, departed, or the client is disconnected. Tooltips and accessible labels retain Online / Away / Left / Connection unknown details; status text below the name shows only the active shot phase.
- Browser fixture verified local cards contain no Here labels and online dots compute green for Online and red for Away. Live online connection changes not verified: the configured server was previously unreachable.
- `npm run check`: typecheck and lint passed; `Test Files 48 passed (48)`; `Tests 464 passed | 8 skipped (472)`. `npm run build`: succeeded, 176 modules transformed.
- Current: requested presence presentation complete. Next: verify live online disconnect/reconnect once the server is reachable.


## Real game pass (2026-11-24)

The owner asked for Hit Jonh to feel like a polished game people want to keep playing for 30 minutes. They asked for the gaps to be listed and ranked by value per unit of effort, then fixed in that order with small commits.

**How the list was made.** I played the dev build in headless Chromium: desktop 1440 wide, phone landscape 844×390 and portrait 390×844. I also timed 99 shots per map with real Matter (9 angles × 11 powers).

**Top-10 gaps, ranked by value per unit of effort**

1. **Slow shot loop.** A typical miss took 5.5 s of simulation, and 4.5 s of that was the ball rolling after it landed. A ball rolling off either end of the ground fell until the 15 s timeout. With the 1.4 s result window, it was about 7 s from Fire to aiming again.
2. **Phone landscape broken.** At 844×390 the canvas is cropped: the ground, the cannon and Jonh are hidden behind the slider bar.
3. **Jonh has about 35 lines and no memory.** Nothing escalates, nothing depends on the map, and lines repeat within minutes.
4. **No campaign.** After a win the only options are Retry and Change map. All 8 maps sit unlocked in a flat grid, with no star total.
5. **Every launch is identical.** A 5% shot and a 100% shot get the same flash, smoke, recoil and boom.
6. **The title card covers Jonh.** There is no character on the title screen.
7. **Multiplayer lacks party energy.** No taunts, no replay of the winning shot, no final-round moment.
8. **Only hats unlock.** There are no cannon skins or outfits.
9. **Every obstacle is a static box.** There are no breakables and no portals.
10. **Abrupt transitions.** Maps swap instantly, and the FIRE button covers part of the field on desktop.

**Rules followed throughout.** These stay unchanged: scoring (100/125/20/0, [OPEN]), three solo shots ([OPEN]), shot outcomes, the aim ranges and the "no full trajectory preview" rule. Unlockable maps and the new mechanics are owner requests; they supersede SPEC §5 ("all unlocked") and the §4.2 deferral and are recorded there.

### 1. Snappy shot loop — done

**Done**
- **Fast-forward after landing** (`src/fx/settleClock.ts`, `FX.settle*` [TUNE]). It applies once a missed ball has touched the ground or an obstacle and is either crawling (< 0.8 m/s) or rolling (< 4 m/s) at least 2.5 m from Jonh.
  - Presentation time then eases up to 4×. `FixedStepper.advance` takes a matching step cap, so no steps are dropped at 30 Hz.
  - Fast bounces and anything close to Jonh stay at real speed.
- **Skip.** While the ball is fast-forwarding, the HUD pill reads "Skip »", and Space, Enter or the pill finishes the shot within one frame. It runs the same fixed steps without per-bounce sound or dust.
- **Floor out-of-bounds** (`ShotAttemptMachine` `floorYMetres` = level bounds minY). A ball below minY − 1 m is out of bounds. Before, a ball that rolled off either end of the ground (x between 25.6 and 26.6 m, or between −1 and 0 m) fell until the 15 s timeout.
- **Miss result window** 1.4 s → 1.0 s (`FLOW.shotResultSeconds` [TUNE]). Body hits keep their longer window and replay.
- **Solo skips.**
  - Aim keys or touching the field during a non-final miss go straight back to aiming.
  - Space skips any result, including a hit's replay.
  - Jonh's line about the miss stays in his bubble while you re-aim.
  - R (and the focused Retry button) retries from the solo result screen.
  - After any skip, Space still needs a fresh release before it fires (accidental-action rule kept).

**Measured** (simulated seconds from Fire to resolution for misses, 9 × 11 aim grid per map, at 60 Hz):

| Map | Before: median / p90 / max | After: median / p90 / max |
| --- | --- | --- |
| Backyard | 5.48 / 7.35 / 9.50 | 2.57 / 4.27 / 5.73 |
| Fence | 5.17 / 7.03 / 9.80 | 2.53 / 3.97 / 5.83 |
| Rooftop | 5.83 / 7.67 / 9.80 | 2.85 / 4.02 / 5.83 |
| Rubber Yard | 5.58 / 7.15 / 15.02 | 2.78 / 4.62 / 10.83 |
| Bank Shot | 5.72 / 7.47 / 10.75 | 2.60 / 4.12 / 6.35 |
| Bounce House | 5.67 / 7.63 / 15.02 | 2.63 / 4.30 / 6.32 |
| Lunar Picnic | 5.40 / 10.70 / 15.02 | 3.72 / 8.23 / 12.93 |
| Valley | 7.72 / 11.28 / 14.70 | 4.63 / 7.22 / 9.57 |

The "before" column already includes the floor fix, so the old timeouts were worse than shown.

Skip makes any landed miss instant. The remaining long tails are legitimate: low-gravity Lunar flights, and an 85°/100% Rubber Yard shot that bounces on top of the rubber ceiling for 13 s.

**Verified**
- `tests/settleFastForward.test.ts` covers all 8 maps × 8 aims (misses plus the reference hit). Fast-forward at 30/60/144 Hz and Skip give identical outcomes, end points, miss reasons and step counts to the plain run, and misses resolve sooner. A Backyard ball that rolls off the end of the ground is now out of bounds in under 6 s.
- Unit tests cover `fastForwardTarget`, `SettleClock`, `distanceToBox`, the raised stepper cap, the floor rule, and Space-skip needing a fresh press before firing.
- `npm run check`: `Test Files 50 passed (50)`, `Tests 484 passed | 8 skipped (492)`.
- **Browser** (dev server, headless Chromium, the game stepped at an exact 60 Hz). The machine was too loaded to run in real time.
  - Fence 45°/0%: Skip offered at 1.6 s, resolved at 2.5 s, aiming again at 3.5 s.
  - Space chain over three misses: fire → Space (finish roll) → Space (skip result) → "Jonh wins", with Retry focused; R restarted at once.
  - Backyard 56°/32%: still a ricochet hit with the full impact and replay, then the result screen.

**Not verified:** real-time feel on a real device. The "R" key hint is hidden on touch-only screens (CSS `hover: none`), but that was not tried on a phone.

### 2. Phone landscape layout — done

**Cause.** Phaser's ScaleManager checks its parent's size only every 500 ms of game time. Entering a game changes the stage size (the HUD and slider bar appear), so the canvas kept its menu-sized scale and was cropped until the next poll. On a slow device that lasts noticeably longer than 0.5 s. Even after the refit, the slider bar shrank the phone-landscape game to 608×266 on an 844×390 screen.

**Done**
- `main.ts`: a `ResizeObserver` on `#game` refits the canvas the moment the stage changes size.
- Short landscape screens (`max-height: 520px`): the Angle/Power sliders fold away and a "Precise aim" HUD toggle (sliders icon, `aria-pressed`, `aria-controls`) floats them over the bottom of the field. Desktop and portrait are unchanged.

**Verified** (headless Chromium, the canvas measured after the first frame in game):

| Viewport | Canvas before | Canvas after |
| --- | --- | --- |
| 844×390 | 817×357 inside a 608×266 frame (cropped), then 608×266 | 832×364 |
| 667×375 | — | 655×287 |
| 932×430 | — | 920×403 |
| 1440×800 | — | 1400×613 (unchanged layout) |
| 390×844 | — | 358×157 (unchanged layout) |

- No horizontal overflow at any size.
- The toggle opens and closes the slider overlay.
- Hot-seat at 844×390 fits the player panel plus a 642×281 canvas.

**Not verified:** a real phone. Safe-area insets were not exercised on a notched device.

### 3. Jonh's personality — done

**Done**
- `src/rules/jonhLines.ts` holds about 120 new lines, in these groups:
  - miss-streak, first-shot, hit-streak, strong and trick hits;
  - per-hat lines for all 8 hats;
  - obstacle complaints matched by id or material (fence, shed, planters, awning, billboard, carport, silo, trampoline, rubber, leaves, rock, concrete, wood);
  - per-garden arrival, miss and hit lines;
  - heckles.
- `JonhReactionSelector.selectReaction(category, context?)` tries the fitting context pools in priority order with cosmetic odds (`JONH_TALK` [PROPOSED]), then falls back to the plain pool.
  - A line does not return within the last 8 picks while the pool has fresh ones. Consecutive repeats are still never allowed (SPEC §10.1).
  - Without a context it behaves as before (existing tests unchanged).
- Added `selectArrival(mapId)` (per-garden opening lines; the level's `arrivalLine` is the fallback) and `selectHeckle(missStreak)`.
- The "Take your time. Apparently you need it." line now belongs to the miss-streak pool, as SPEC §10.1 intended ("several consecutive misses"). Before, it was a random overhead/over line.
- `HeckleTimer` (pure): first heckle after 9 s of untouched aim, then every 15 s, at most twice per aim. Any aim change restarts it.
- `AudioManager.playMutter`: a quiet low formant babble with 2–5 syllables, played with miss lines, arrival lines, heckles and "moved" lines. Hits keep the yelp.
- The scene passes the context: map, hat, obstacles touched and a session miss streak. Solo also passes first shot and hit streak (multiplayer turns are shared, so those two are left out there).

**Verified**
- `tests/jonhTalk.test.ts` (12 tests) covers:
  - each context pool, the miss-streak threshold, and the obstacle id/material match;
  - the fallback when the odds say no;
  - the 8-pick recency window over 200 picks;
  - per-garden arrivals, heckle escalation and the HeckleTimer rules;
  - every line ≤ 60 characters with no "John", and `MAP_LINES` naming only real maps.
- Browser (frame clock): Lunar Picnic opened with "Finally. Some peace and quiet."; after 9 s of untouched aim Jonh said "Lovely afternoon for doing nothing."; no page errors.

**Not verified:** how the mutter sounds (no listening possible); only its scheduling runs.

### 4. Campaign — done

**Done**
- `src/rules/campaign.ts` (pure) derives everything from the existing solo bests in `hitJonh.v1`, so there is no new save field:
  - `CAMPAIGN_ORDER` [PROPOSED]: Backyard → Fence → Rooftop → Rubber Yard → Bank Shot → Lunar Picnic → Bounce House → Valley. Other maps join at the end.
  - Stars by shots used (3/2/1, unchanged), a per-garden trick badge, totals, unlocks, the next garden and the Continue target.
  - Unlock rule [PROPOSED]: clear the previous garden (any star). A garden with an existing record stays open, so saves from before the campaign keep every map they had played.
- **Map select:** numbered cards in campaign order; a star tally with a progress bar, trick shots and gardens cleared; locked cards (greyed preview, padlock, "Clear X to unlock", disabled with an aria-label); "Up next" on the Continue target, which also gets focus; a trick badge on every unlocked card.
- **Win screen:**
  - "Next garden ›" is primary and focused (N); Retry (R) and Map select follow.
  - It shows the campaign star total, an "Unlocked: …" card on a first clear, and a "Trick badge!" ribbon the first time.
  - Several hat unlocks from one shot collapse into one compact card.
  - The buttons stay pinned while the celebration scrolls on short screens.
- **Title:** returning players get a big "Continue · {garden}" button and "All modes ★ n / 24". First-time players still see "Play".
- Daily Bonk, hot-seat and online are not gated. Daily wins show no Next button and no campaign total.

**Decisions:** SPEC §5 "Choose any map (all unlocked)" is superseded by the owner's request. Stars stay "shots used" (SPEC §5 [PROPOSED]). The trick shot is a separate badge rather than a fourth star, so the existing 3/2/1 rating and the crown hat rule ("three stars on every garden") are unchanged.

**Verified**
- `tests/campaign.test.ts` (6 tests):
  - order covers every map, and new maps join at the end;
  - star mapping;
  - a fresh save unlocks only the first garden;
  - clearing unlocks the next, a failed try does not;
  - old records stay open;
  - totals, Next and Continue targets.
- Browser, from a fresh save:
  - only Backyard was open, with 7 padlocks and unlock hints;
  - a Backyard 56°/32% first-shot trick hit showed "Next garden ›" (focused), "Campaign ★ 3 / 24", "Unlocked: The Fence Dispute" and "Trick badge!";
  - N loaded The Fence Dispute;
  - Home then showed "Continue · The Fence Dispute" and "All modes ★ 3 / 24";
  - at 844×390 the result buttons stayed pinned and visible;
  - no page errors.

**Not verified:** touch on a real phone.

### 5. Launch feel scales with power — done

**Done** (all cosmetic, values [TUNE] in `FX.launch*`)
- `ShotEffectsRenderer.launch(…, power)` scales with power:
  - smoke puffs 4 → 12, with spread, speed, size and lifetime;
  - sparks 3 → 13;
  - muzzle flash size ×0.75 → ×1.35, and one extra flash frame above 66%;
  - barrel recoil from 40% of `FX.recoilPx` at 0% power to 100% at full.
- New camera kick backwards along the barrel: up to 9 px plus a small zoom punch at full power. It goes through `CameraRig.impact`, so reduced motion suppresses it.
- Above 60% power the wheels throw up dust from the surface under the cannon (`floorAt`, so it works on the Valley cliff).
- `AudioManager.playCannonFire(power)`: low power is a short, higher "pop"; full power is a deeper, longer boom with a low rumbling tail.

**Verified**
- `tests/shotEffects.test.ts`: a full-power launch has more particles and a bigger recoil peak than a 0% one, bounded by `FX.recoilPx`; reduced motion has no particles or recoil.
- Polish determinism and audio tests unchanged and passing.
- Browser frames 9 and 15 after Fire at 10% and 100%: the full-power shot shows a bigger flash, wheel dust, more smoke and the kick.

**Not verified:** how the boom sounds (no listening possible).

### 6. Title screen with character — done

**Done**
- **Jonh is on stage.** The title card now sits between the cannon (left) and Jonh (right) on desktop and phone landscape; on portrait phones it sits under the stage.
  - The menu backdrop lets pointer events through outside the card, so the garden can be poked.
  - Jonh greets you with a title quip ("Nobody press Play.", "Oh good. Visitors.") and a mutter.
- **Demo shot.** About 4 s after the title appears, then every 11–15 s, the cannon swings round, winds up and fires one of the garden's reference solutions. Clicking or tapping the garden ("Psst: poke the garden.") fires it at once.
  - The flight is a genuine Matter run: `physics/shotRecorder.ts` records it on a private engine and the title animates the recorded path.
  - Impact: the real impact profile with the shared hit-stop clock, comic word, flash, ring, particles, camera punch, hit sound and Jonh's knock-back with a title line ("Was that the tutorial?").
  - Afterwards the ball bounces away, and Jonh climbs back into his chair 3.4 s later.
  - Under reduced motion there is no flying ball; a poke just gets a line.
- **Variety.** The title garden is picked at random from your unlocked gardens of ordinary width, with the selected hat. "Continue" and the star total (item 4) live on the same card.

**Verified**
- `tests/shotRecorder.test.ts`: every map's first reference shot, recorded, reaches Jonh's body, and its trick flag matches the headless runner. Sampling is linear and clamped.
- Browser (frame clock):
  - At 1440, 844×390 and 390×844 the cannon and Jonh are both visible around the card.
  - Clicking the garden fired the Backyard demo trick shot: flash, "TRICK SHOT!", ring and knock-back.
  - Jonh's quip bubble anchors over his head when every frame is rendered. A top-left bubble seen with skipped renders was an artefact of headless stepping: the camera world view updates only on rendered frames.
  - No page errors.

**Not verified:** on real touch hardware, whether the pass-through backdrop ever swallows a scroll gesture on the home card.

### 7a. Multiplayer party: stakes, final round, taunts — done

**Done**
- `src/rules/matchStakes.ts` (pure):
  - `verdictFor` applies the existing SPEC §7.1 winner rule (total, then body hits, else shared) after one more shot.
  - `matchStakes` returns a banner, a stakes line and a "decisive" flag for the active player.
  - `shotsLeftPerPlayer` derives remaining shots from the machine's counters; it uses a new read-only `MultiplayerMatchMachine.shotIndexInRound`, with no rule change.
  - `tauntFor` picks a taunt by outcome.
- **Handover card**, with `HandoverParty` passed to `showMPHandover`:
  - a "Final round", "Your last shot" or "Last shot of the match" banner (the decisive one is red and throbs);
  - the stakes line;
  - a taunt bubble in the previous scorer's colour ("PLAYER 2: 'Watch and learn.'").
  - Cards with extras stay 0.6 s longer and decisive ones 1.2 s longer (`FLOW.*HandoverExtraSeconds` [TUNE]). The auto-advance bar matches.
- `AudioManager.playDrumroll()` plays a snare roll that speeds up and swells, with a cymbal hit, on the match's deciding shot.
- **HUD while aiming:** "Player 1's turn · Only a trick shot wins it! A hit ties." The map chip says "Shot n/3" instead of the jargon "Cycle n/3".
- **Round summary** before the final round: "Final round next. Everything to play for." with a "Final round ›" button.

**Verified**
- `tests/matchStakes.test.ts` (7 tests):
  - the winner rule with the body-hit tie-break;
  - every last-shot line (hat wins, any hit wins, trick only, trick ties, trick wins with a hit tying, can't catch up, already won);
  - the final-round and last-shot banners;
  - `shotsLeftPerPlayer` against real 2/3/4-player two-map matches;
  - taunt pools.
- **Browser:** a two-player Backyard + Fence match showed the "FINAL ROUND" banner; then "PLAYER 2: 'Watch and learn.'" after Player 2's hit; "Trailing Player 2 by 100"; "YOUR LAST SHOT"; then "LAST SHOT OF THE MATCH · Only a trick shot wins it! A hit ties." (also in the HUD); then the result. No page errors.

**Not verified:**
- How the drumroll sounds.
- Online taunts were exercised only through shared code (`applyOfficialOutcome` records the shooter); there was no live online room.

### 7b. Winning-shot replay — done

**Done**
- `render/demoStage.ts` (new) is a self-contained garden that plays a recorded shot at Jonh. The cannon swings, winds up and fires with power-scaled launch effects; the ball follows the recorded Matter path; then the full impact plays (hit-stop clock, comic word, flash, particles, camera punch, sound, knock-back) and the ball bounces away. The title screen (item 6) now uses it too.
- `scenes/ShowcaseScene.ts` (new, registered in `main.ts`) runs over the game when a multiplayer match ends.
  - It shows the garden and Jonh's spot where the winner's best hit happened (`levelAtMultiplayerPosition`), with the winner's cannon colour and pattern.
  - A "Winning shot · {name}" letterbox shows (via a new `ReplayOverlay.setText`), and Jonh delivers a line ("Must we watch it again?").
  - Tap, Enter, Space or Escape skips it. The keys are captured so the game underneath never sees them, and pausing is ignored while it plays.
- Every body hit of a match (hot-seat and online official outcomes) is remembered with its map, position and exact aim. The match result waits for the replay. Rematch, Home and a rebuilt online match stop the replay cleanly.
- It is not played under reduced motion, when the winners never hit Jonh, or when a local re-simulation no longer reaches Jonh (cross-browser drift online).
- The HUD steps aside during the replay (`body.showcase-on`); the player panel stays.

**Verified**
- Browser (frame clock): a two-player Fence match where Player 2 hit with the position's reference shot. At the end, "WINNING SHOT · PLAYER 2" played: the blue striped cannon fired and BONK landed at the hit position. Then "PLAYER 2 WINS!" appeared with Rematch and Main menu. No page errors.
- `npm run check` passes (below). The title screen still plays its demo through `DemoStage`; the recorder tests cover every map.

**Not verified:**
- A live online room.
- Real-time feel and pacing: the browser here runs at about 4 fps, so the replay was stepped at an exact 60 Hz.

### 10. Transitions and HUD polish — done

(Done before items 8 and 9, which are being built in parallel worktrees and merged afterwards.)

**Done**
- **Chapter cards** (`ui/transition.ts`, CSS in `menu.css`). Entering a garden now shows an ink panel stamped with its name and a kicker, then an iris opens onto play (about 1.2 s; decorative; pointer events pass through). Before, maps swapped instantly.
  - Kickers: "Garden 3" (campaign number), "Daily Bonk", "Round 2 of 4", "Final round".
  - Retry never shows a card, so the one-more-try loop stays instant.
  - The first hot-seat or online handover of a round waits out the card, and its auto-advance bar includes that wait.
  - Off under reduced motion. The menu's own iris is skipped when a card is already covering the way in.
- **Desktop FIRE out of the field.** With a mouse (`hover: hover`, `pointer: fine`, at least 1000×640), FIRE (84 px) and the Next/Skip pill sit in the control row under the garden, right of the sliders, so they no longer cover the playfield. Touch screens keep the thumb-side in-canvas button.
- **Readable on phones.** `fx/readability.ts` scales Jonh's speech bubble and the landing label up as the canvas shrinks (1× at full size, about 1.3× at 844×390, capped at 1.6×). It is re-measured whenever the canvas refits.

**Verified**
- `tests/readability.test.ts`.
- Browser: the chapter card read "GARDEN 1 / JONH'S BACKYARD", shown by pausing CSS animations at 320 ms, then the iris opened onto play.
- The desktop rules, injected unconditionally because headless Chrome reports `hover: none` / `pointer: none` and cannot emulate them, put FIRE below the canvas: solo canvas bottom 699 px, FIRE 703–787 px at x 1332–1416, sliders end at x 1140; hot-seat similar; no page overflow.
- At 844×390 the boost measured 1.31 and the bubble read clearly.

**Not verified:** the desktop media query on a real mouse-driven browser (reasoned from the injected-rule check), and card timing in real time (headless runs at about 4 fps).

### Independent review fixes

A read-only Sonnet review of the pass's commits found three bugs and some risks. All are fixed:
- **Stale R/N shortcuts (bug).** Hiding the solo result never removed its key listeners, so R during play re-ran Retry (unlimited attempts) and N reloaded the garden. `MenuOverlay.hide()` now aborts the view's listeners, and shortcuts act only while their view is on show. Browser: after Retry and a miss, R and N during play left "2 of 3 attempts" and the garden unchanged.
- **Second winning-shot replay not skippable by keyboard (bug).** Phaser reuses the scene instance, so its aborted listener controller added nothing the second time. A fresh controller is now made per run.
- **Winning shot on Across the Valley played off-screen (bug).** `DemoStage` now frames a garden with its resting view (`levelView`), zoomed out as in play, with the matching cannon and bubble UI scale.
- **Held Enter/Space pressed the next screen's button (risk).** Key repeats never activate menu buttons now (capture listener on the overlay), so holding a key after a skip cannot hit Retry, Next garden or Rematch. A fresh press still works.
- **Nits:**
  - canvas aim checks pointer type and button before it can skip a result (a right-click or second finger no longer skips);
  - the chapter-card handover delay is cleared when no handover follows, and on Home;
  - Jonh's miss streak resets on Home;
  - the replay's speech bubble gets the phone text boost.

`npm run check`: `Tests 522 passed | 8 skipped`.

### 8a. Cosmetic unlocks: cannon skins and Jonh outfits (art, rules, saved selection, renderer API) — done

The wardrobe screen and the scene wiring are a separate task; this item delivers everything they need.

**Done**
- **Rules** (`src/rules/cosmetics.ts`, pure): `CANNON_SKIN_RULES` and `OUTFIT_RULES`, each with a name, a hint and `unlocked(progress, ctx)`, where `ctx = { stars, cleared }` comes from `cosmeticContext(mapIds, solo)` (built on `campaignStatus`/`campaignTotals`). Helpers: `unlockedCannonSkins`, `unlockedOutfits`, `newlyUnlockedCannonSkins`, `newlyUnlockedOutfits`, `sanitizeCannonSkin`, `sanitizeOutfit`. All thresholds are [PROPOSED] (`COSMETIC_GATES`).
  - Cannon skins: Classic iron (always) · Admiral (6 stars) · Garden Party (clear 4 gardens) · Pirate (3 trick hits) · Moonshot (12 stars) · Golden Bonk (24 stars).
  - Outfits: Cardigan (always) · Argyle jumper (best streak of 5) · Hawaiian shirt (12 stars) · Tracksuit (50 total hits) · Stripy pyjamas (3 stars in a Daily Bonk) · Tuxedo (18 stars) · Sunday best (Daily Bonk on 3 different days).
- **Saved selection:** `Progress.selectedCannon` and `selectedOutfit`. `sanitizeProgress(raw, mapIds, ctx)` falls back to the default for an unknown or locked id and old saves get the defaults. `storage.ts` passes the real star context (from the saved solo bests) on load and on `saveProgress`.
- **Art:** `src/art/cannonSkins.ts` (themes and decals), `cannonArt.ts` (parameterised barrel/carriage/wheel), `src/art/outfitArt.ts` (torso, trousers and both arms per outfit). Every variant has exactly the canvas size, pivot and silhouette of the original, so every pose and the muzzle/recoil/fuse maths are unchanged (a test asserts the sizes and pivots). Six new palette tokens (`coal`, `coalLight`, `silver`, `silverDark`, `grape`, `grapeDark`) in `palette.ts`; nothing else adds a colour.
- **Renderers:** `JonhRenderer` has an `outfitId` option and `setOutfit(id)`; `CannonRenderer` has a sixth constructor argument `skin` and `setSkin(id)`. Switching only swaps textures; everything is rasterized at boot.

**Decisions**
- A skin shows only on the solo/title cannon (`draw()` with no colour). In multiplayer the whole cannon (barrel, carriage, wheel) stays classic so the player's colour and pattern band read exactly as before; the alternative (skin × 4 colours × 4 patterns) would be about 96 more barrel textures.
- Jonh holds a newspaper over most of his torso at rest, so the outfit reads mainly through sleeves and trousers; torsos show fully on hit reactions. The wardrobe figure omits the paper by default.
- Texture keys: `cannonSkinKeys(id)` → `{ barrel, carriage, wheel }`, `outfitKeys(id)` → `{ torso, legs, armFront, armBack }` (classic and cardigan keep the original keys). Inline-SVG preview figures that need no boot: `cannonSkinFigureSvg(id, angleDeg?)` and `outfitFigureSvg(id, hat?, withPaper?)`.

**Verified**
- `tests/cosmetics.test.ts`: every gate boundary, feats, the `newlyUnlocked*` helpers, `cosmeticContext`, sanitising (old saves, unknown ids, locked and unlocked selections), art registered under the documented keys with unique keys, identical sizes and pivots, and preview figures. `tests/storage.test.ts`: a selection is dropped until the saved solo bests unlock it. Existing `jonhPose` tests unchanged.
- **Texture budget (measured in Chromium via the dev server):** 39 new textures (15 cannon + 24 outfit), about 0.64 Mpx ≈ 2.45 MB of the 33.5 MB all art occupies (180 textures); rasterizing them took about 64 ms on a loaded machine. The full `npm run check` and `npm run build` passed.
- **Browser:** the real `JonhRenderer.setOutfit` and `CannonRenderer.setSkin` were run on every id in a throwaway Phaser scene after `loadArt(ALL_ART)`: all seven outfits and six skins drew, no page errors. The inline preview figures were checked on a contact sheet.

**Not verified:** the wardrobe screen and scene wiring (parent task); how the skins look in the full game scene at the 1.8× hit zoom and on zoomed-out maps; real-device performance.

### 8b. Cosmetics wired into the game — done (item 8 complete)

**Done**
- **Wardrobe** (`ui/wardrobe.ts`): Hats, Outfits and Cannons tabs, each with a count. Outfits preview as Jonh in the outfit and your current hat; cannons preview their skin (inline SVG from the art code). Locked items show how to earn them.
  - Picking an item saves it and immediately re-dresses the title-screen Jonh or cannon.
  - The home button reads "Wardrobe n/21".
- **Worn everywhere.**
  - The selected outfit is on Jonh in solo, hot-seat, online, the title screen and the winning-shot replay.
  - The selected skin is on the solo and title cannon. Multiplayer stays classic by design (player colour bands).
- **Unlocks.** Every shot and solo finish checks hats, outfits and skins, using the campaign star totals before and after the result (computed in memory, since the save is deferred past the contact frame).
  - One compact card on the result screen lists all new items ("New cannon: Admiral. Try it on in the wardrobe.").
  - Multiplayer and online show a caption instead. Online only checks feats (online play doesn't change campaign stars).

**Verified**
- Browser, with a save holding 18 stars and the feats:
  - the wardrobe showed Hats 7/8, Outfits 7/7 and Cannons 5/6;
  - choosing the Hawaiian shirt and the Pirate skin saved both;
  - Continue opened Bounce House with Jonh in the Hawaiian shirt and fez and the Pirate cannon.
- Browser, from 5 stars: a first-shot Rooftop clear showed "Campaign ★ 8 / 24", "Unlocked: Rubber Yard" and "New cannon: Admiral".
- No page errors.
- The figures' chairs no longer overlap their captions.

**Not verified:** how skins look at the 1.8× hit zoom on a real screen (seen only at the screenshot scale above).

## Breakable props and portals (2026-11-24, branch `t3/breakables-portals-maps`)

Owner request (2026-11-24): "new obstacle types and map mechanics (moving platforms, breakables, portals or wind), all in SI level data with reference solutions that pass the existing tests". The lead chose breakable props and portals; moving platforms and wind stay deferred.

**Done**
- **Physics** (`src/physics/matterAdapter.ts`, SPEC §8.6). Breakable obstacles (`breakable: { minImpactSpeedMs, speedKept }`): a hit at or above the threshold (normal speed, same incoming velocity a bounce uses) switches the prop off in Matter (collision mask, so the body order never changes) and in the swept guard for the rest of the shot; the ball carries on from the contact point with the kept share of its velocity. One-way portals (`portals: [{ entry disc, exit point + heading }]`): touching an unused entry before any solid teleports the ball to the exit at the same speed, heading the exit's way; once per shot; a blocked exit is skipped. Per-shot state is restored on every spawn. `ProjectileState` gains `brokenObstacleIds`, `portalsUsed` and per-step `events`; the headless runner and difficulty tool report them.
- **Validation**: breakable ranges, unique obstacle/portal ids, portal exits clear of every collider, Jonh (each target position) and every entry, entries out of muzzle reach.
- **Maps** (appended to `MAPS`, so every mode has them): **The Greenhouse** (breakables) and **The Magic Act** (portals), each with three target positions and references that miss the other positions. New materials `glass`, `velvet` [TUNE].
- **Difficulty guard**: `DIFFICULTY.minMechanicShare` (1 for both maps: every hit must smash glass / use the hoop, on every position).
- **Presentation**: `src/render/mechanicsRenderer.ts` (owned by `SceneryRenderer`) draws panes, hoops and interiors and plays the events: shards + glass crash, sparkles + "fwoop", dimmed spent hoop; `reset()` restores everything. Art in `src/art/mechanicArt.ts`; palette tokens and rules in `docs/art-direction.md`. Map previews and blurbs. Audio: glass smash, glass "tink" for an unbroken pane, portal fwoop. The replay holds the ball across a teleport instead of sliding it between hoops.
- **Scene** (`PrototypeScene.ts`): three marked lines only — forward each step's events (a break or teleport is not read as a bounce), reset mechanics in `resetEffects()`, glass/velvet surface sounds.

**Decisions [PROPOSED]**
- Portals keep the speed and set the direction to the exit heading (not the incoming vector), so the hoop always throws the same way and power alone sets the distance. They work from either side.
- Smashing through and going through a portal are never ricochet or obstacle contacts. No surface on the new maps is ricochet-eligible, so both score plain body hits (100).
- Greenhouse glass breaks at 6.5 m/s and keeps 35 % of the velocity. Both maps are difficulty 2.
- Magic Act exit hoop sits inside the tent's left side (heading 65°): at first it was on the right, under the HTML Fire button.
- Map presets unchanged: "Every map" includes the new maps, "Trick shots" is still the four 2026-10-10 mechanic maps. Owner to decide whether to add them.

**Measured difficulty** (share of the aim grid that scores a body hit, near / middle / far)

| Map | 1° × 1% grid | 5° × 5% guard | Hits using the mechanic |
| --- | --- | --- | --- |
| The Greenhouse | 7.10 / 5.11 / 3.83% | 6.2 / 5.0 / 4.2% | 100% smash glass |
| The Magic Act | 2.71 / 3.34 / 2.37% | 2.8 / 3.1 / 2.2% | 100% through the hoop |

References: Greenhouse near 24°/58% (front window), middle 53°/46% (roof), far 44°/57% (roof, off the back wall); Magic Act near 55°/24%, middle 48°/29%, far 42°/40%.

**Existing maps unchanged**
- Per-map cross-check digests (outcomes plus exact end positions and step counts for every reference and a 10 × 7 grid on every position) are identical before the change (`deae97b`) and after (`2a522af`, `ae26c48`).
- The full `DIFFICULTY_REPORT=1` 1° × 1% table for the eight existing maps is byte-identical before (`deae97b`) and after (`ae26c48`): all 24 rows, including hit and ricochet counts, widest runs and suggested references.

**Verified**
- `npm run check`: typecheck and lint passed; `Test Files 50 passed (50)`, `Tests 508 passed | 10 skipped (518)` (the skips are the opt-in difficulty report). `npm run build`: succeeded, 180 modules transformed.
- New tests: `tests/mechanics.test.ts` (smash vs bounce, no contact or ricochet, restore and identical replays, teleport speed and heading, once per shot, blocked exit, validation, low shot stopped by a solid on each mechanic map, headless reporting) and `tests/mechanicsRenderer.test.ts` (pane swap and restore, spent hoop, reduced motion), plus a replay teleport case.
- Browser (Vite dev server on port 5199, headless Chromium via playwright-core, screenshots reviewed): Greenhouse solo 53°/46% smashed a roof pane (shards, jagged gap) and hit Jonh ("Bullseye", 1 shot); 24°/58% smashed the front window and fell short, the window was whole again for attempt 2, and 53°/46% then hit ("hit Jonh in 2 shots"). Magic Act solo 48°/29% went through the hoop, the swirl dimmed, the ball popped out of the exit hoop and hit ("Direct hit +100"). Emulated reduced motion: fixed camera, no shards or sparkles, but the smashed pane and the dimmed hoop still show. The map list shows all ten cards. Hot-seat Greenhouse-only match: four turns, Jonh drawn at the far position, panes whole between turns. No console errors in any run.

**Not verified**
- Sound: the new voices were not listened to (headless browser); unit tests only check they do not throw.
- A hot-seat hit in the browser (my driver's timing around the handover card was flaky); scoring is covered by the automated multiplayer tests.
- Online play on the new maps: needs a Convex redeploy, not done. Real devices, touch, Firefox and Safari.

**Known issues / consequences**
- Online: the Convex server validates map ids from `src/levels` (`MAP_IDS`), so online hosts can pick the new maps only after the Convex functions are redeployed. Nothing was deployed.
- Daily Bonk draws from all maps' target positions, so adding maps changes the date → map mapping.
- The crown hat ("three stars on every garden") now needs all ten maps.
- The scene's cosmetic post-hit ball and bounce-sound lookup read level data, so they do not know a pane is smashed. On these two maps the panes are above the cosmetic ball's arc, so nothing visible happens.
- After a teleport the ball's speed ribbon leaves a short fading streak at the entry hoop.
- Magic Act: a fast flat shot that misses the hoop can rebound off the tent wall back through it from behind. This is legitimate and deterministic.

**Next**
- Owner playtest of both maps; tune the glass and hoop placement from feedback; decide on presets; redeploy Convex so online rooms can use the maps.

### 9b. New gardens wired into the pass — done (item 9 complete; all ten items done)

**Done**
- **Merge.** The only conflict was in `PrototypeScene.ts`: the mechanics hook from the old inline step loop now lives in `simulateStep()`. It runs even during Skip, so broken panes and spent hoops stay correct. All existing outcomes are unchanged.
- **Campaign order** [PROPOSED]: Backyard → Fence → Rooftop → **Greenhouse** → Rubber Yard → Bank Shot → **Magic Act** → Lunar Picnic → Bounce House → Valley, so each mechanic gets its own step. Gardens with a saved record stay open, so existing saves keep their progress.
- **Jonh:** opening, miss and hit lines for both gardens, and complaints about glass ("That glass was imported.") and velvet ("That velvet was hired.").
- **Replays show the mechanics.** `recordShot` captures each step's smash and portal events. `DemoStage` replays them through the same `MechanicsRenderer` (new `playRecorded`), so the title demo and the winning-shot replay smash panes and spin hoops. Every demo starts with whole panes.
- **Trick shots preset** now includes both new maps [PROPOSED].
- **Golden Bonk** now needs every campaign star (`COSMETIC_GATES.starsAll`, derived from the campaign: 30 with ten gardens), as the cosmetics tests intended.

**Verified**
- `npm run check` (below).
- The full fast-forward/Skip identity suite, the recorder suite and the campaign suite now cover all ten maps.
- New test: the Greenhouse reference replay records a `break`, the Magic Act a `portal`, and the Backyard none.
- Browser (dev server and headless Chromium, started and stopped per check):
  - from a save with three gardens cleared, Continue offered The Greenhouse;
  - the map list was `backyard fence rooftop greenhouse rubber(L) bankshot(L) magic(L) moon(L) trampoline(L) valley(L)`;
  - the home tally read ★ 9 / 30;
  - the title demo on The Greenhouse smashed a roof pane with shards and hit Jonh;
  - no page errors.

**Owner follow-ups (not done here)**
- Online rooms can pick the two new maps only after the Convex functions are redeployed (`npx convex dev --once` for dev). No deploy was run.
- Daily Bonk's date-to-map mapping changed (more maps), and the crown hat now needs three stars on all ten gardens.

### Pass summary and next 10

**All ten done**, in value-per-effort order. Item 10 landed before 8 and 9, which were built in parallel worktrees and merged afterwards.
1. Snappy misses: fast-forward, Skip, floor out-of-bounds, instant retry.
2. Phone landscape layout.
3. Jonh's context lines, heckles and mutter.
4. Campaign: stars, trick badges, unlocks, Next garden, Continue.
5. Power-scaled launches.
6. Title screen with demo shots and poke-to-bonk.
7. Party stakes, taunts, drumroll, winning-shot replay.
8. Cannon skins, outfits and wardrobe.
9. Breakables and portals, with The Greenhouse and The Magic Act.
10. Chapter cards, desktop FIRE placement, phone text size.

There were also fixes from an independent review.

**Owner decisions needed** (reversible defaults are in place and labelled [PROPOSED]):
- Ricochet eligibility on the new gardens. Should a portal hit or a glass-smash hit count as a 125-point trick shot? Today neither does (SPEC §7.1 [OPEN]).
- SPEC §4.2 now reads "destructible terrain" (deferred) as different from single breakable props that reset every attempt. Please confirm.
- Unlock thresholds (campaign order, star gates, feats), the Trick shots preset contents and timing values are all [PROPOSED]/[TUNE].
- Online play needs the Convex functions redeployed before rooms can pick the two new gardens.

**Proposed next 10**, ranked by value per unit of effort:
1. **Shareable Daily Bonk result.** A copyable line ("Hit Jonh Daily · 24 Nov · ★★☆ in 2 shots") with the link. Low effort; friends bring friends.
2. **First-garden coach.** A ghost hand shows drag-to-aim on Garden 1. After a first miss, a hint names the fix ("Short: add power"). Better first two minutes.
3. **Practice on cleared gardens.** Unlimited shots that never touch bests or stars (SPEC §4.2 "optional, only if cheap"). Lets players hunt trick badges and star improvements without pressure.
4. **Online emotes.** Quick reactions everyone in the room sees ("Beat that!", "Unlucky"), matching the hot-seat taunts. Needs a small Convex mutation and schema field, plus a deploy.
5. **A wind garden.** A third mechanic: a per-level constant wind with a windsock and streaks, deterministic, with the launch preview bending to match. Variety at modest cost.
6. **Feats screen.** "Hit him on the moon", "three trick shots in a row", with progress bars feeding cosmetics. A long-term goal list.
7. **Sudden-death tie-break for hot-seat.** A one-shot shoot-out on the last garden. Party drama, but SPEC lists it as deferred, so it needs owner approval.
8. **Accessibility pass.** Screen-reader announcements for stakes and results, remappable keys, a colour-blind check of trails and patterns, larger touch targets on small phones.
9. **Mobile performance and install.** Texture atlas, lazy cosmetic rasterising, PWA offline install, measured on a real phone. Today's GPU cost is unknown (headless SwiftShader only).
10. **A walking-Jonh garden.** A predictable route timed from Fire (a timing challenge). SPEC lists "Jonh moving during shots" as deferred, so it needs owner approval.


## Online emotes (2026-11-25, branch t3/online-room-emotes)

Owner request approved 2026-11-25: "Online emotes. Quick reactions everyone in the room sees ('Beat that!', 'Unlucky'), matching the hot-seat taunts. Needs a small Convex mutation and schema field, plus a deploy." Built from `real-game-pass` at ef4bf12. **Nothing was deployed**: the redeploy is the owner's step (`npx convex dev --once` for dev, `npx convex deploy` for production; details in `convex/README.md`).

**Done**
- **Server** (`convex/emotes.ts`, `convex/schema.ts`, `convex/model.ts`).
  - `emotes:sendEmote({ code, token, emote })` authenticates exactly like the other mutations (room by code, member by token; a seat that left is `NOT_MEMBER`). The emote id must be one of the fixed set (`INVALID_EMOTE`), and the seat must have allowance (`RATE_LIMITED`).
  - `emotes:getEmotes({ code, token })` returns each seated player's latest emote, with `mine` for the caller.
  - Stored in a new `emotes` table, one row per player, rewritten in place. A new table keeps every existing document valid (no backfill, no migration).
  - Why a table and not a field on `players`: every turn, shot and rematch mutation reads the `players` row, so an emote patching it would make them retry or conflict. The schema guidelines also say to keep high-churn data off shared documents. This mirrors `presence`. It also gets its own subscription, so emotes never re-run `getRoom`.
  - An emote never calls `touchPresence` and never touches `rooms.updatedAt`: it is not a check-in and cannot keep a dead room alive. It writes only the caller's `emotes` row.
  - Rows are deleted with their player (`deletePlayer`) and with the room (`deleteRoomCascade`).
- **Rules** (`src/rules/onlineEmotes.ts`, pure). The set, the token-bucket limit, `EmoteTracker` (baseline on the first list, per-sender `seq`, own-echo swallowing) and `EmoteBoard` (bubbles for a few seconds, one per seat, newest few).
- **Client.**
  - `OnlineSession` gained a third subscription and `sendEmote` (not retried, since a late emote is stale).
  - `src/ui/emotes.ts` + `emotes.css` hold the button, picker and bubble stack.
  - `PlayerPanel` shows the bubble in the sender's row; `playerPresence.emotes` carries it through the existing refresh path, so `htmlControls` needed no change.
  - `AudioManager.playEmote()` is a quiet two-note pop for other players' emotes.
- **Keyboard and touch.** Emote button (44 px tap target; icon-only on short landscape phones), `E` opens and closes, `1`–`6` pick, Esc closes without pausing the game. A mouse or finger press never leaves a button focused and picking always lets go of focus, because the game ignores Space and Enter while a button has focus. Only opening the picker from the keyboard (Tab to the button, Enter) moves focus into it.
- **Reduced motion.** The bubble pop uses the global reduced-motion rules (verified: 1 ms animation under `prefers-reduced-motion: reduce`).

**Tests added** (628 passed | 10 skipped in the full run)
- `tests/onlineEmotes.test.ts`: the set, the rate limit (burst, refill, fractions, spammer bound, clock going backwards), the tracker and the board.
- `tests/emotesServer.test.ts`: `storeEmote` against an in-memory stand-in for `ctx.db` (auth, validation, rate limit per seat, seq, lobby/playing/finished, writes only its own row). The repo has no Convex runtime test setup (`convex-test` is not a dependency and I did not add one), so this proves the function's own logic only.
- `tests/onlineController.test.ts`: 13 emote tests (baseline, no replay, sound, panel presence and expiry, optimistic bubble and echo, rejection rollback, local burst limit, lobby and result, room change, stale room).
- `tests/onlineSession.test.ts`: the new subscription (updated count, name and args) and `sendEmote`.

**Verified in a real browser** (headless Chromium against the dev server, with a fake session driving the real controller, scene and panel; no backend)
- Desktop 1280×760, phone landscape 844×390 and portrait 390×844: button, picker, dock bubbles, panel bubbles, lobby, handover overlay.
- Pointer click on the button and an option: focus ends on `BODY`. Keyboard: Enter on the button moves focus to the first option, Enter picks, focus ends on `BODY`. Esc closes the picker and leaves the lobby overlay as it was.
- Panel rows keep their height with a bubble except where a long name already wraps (68→68 desktop, 46→46 phone for short names).
- Screenshots (scratch, not committed): `/tmp/claude-1000/-home-aalish--t3-worktrees-hit-jonh-t3-71ae5f1b-06c8d536272d9c76/f2d9db46-8795-4034-8b54-2b82f61b1634/scratchpad/pw/shots/` (`desktop-match2.png`, `phone-match2.png`, `portrait-match2.png`, `phone-lobby-picker.png`, `desktop-lobby.png`).

**Not verified**
- **Anything against a live Convex deployment**: the schema push, the two functions running, validators, OCC behaviour, `getEmotes` reactivity, two real browsers seeing each other's emotes, and an old backend with the new frontend (reasoned: the subscription error is swallowed and the button stays disabled, but not exercised).
- The sound is only unit-tested via the hook; I did not listen to it.
- Real touch devices; screen-reader announcements (the dock's `role="log"` live region is in place but was not tried with a reader).
- `convex/_generated/api.d.ts` was edited by hand (one import and one line for `emotes`); `tsc` accepts it, and the next `npx convex dev`/`deploy` regenerates it.

**[PROPOSED] decisions and open questions for the owner**
- The set of six, and the wording, in `EMOTES`. Ids are stable on the wire, so wording can change without a deploy-order problem.
- Rate limit: burst 3, then one per 2 s (`ONLINE.emoteBurst`, `emoteRefillSeconds`); bubble 4 s; drop an emote delivered over 10 s late; at most 3 bubbles (`emoteShowSeconds`, `emoteMaxAgeSeconds`, `emoteMaxVisible`).
- Emotes are allowed on every screen of a room (lobby, match, result). Spectators do not exist, so every sender is a seated player.
- A seat that has left cannot send (`NOT_MEMBER`).
- Presentation: panel row while the match is on screen, a dock stack elsewhere (lobby, result, overlays, portrait phones); `E` and `1`–`6` shortcuts.
- Emotes do not count as a check-in or game action, so they do not keep a room alive past its 24 h cleanup.
- No per-recipient mute. If an emote ever needs moderating, the fixed set already means there is no text to moderate.

**Files touched that other sessions are also editing:** `src/scenes/PrototypeScene.ts`, one added line in `onlineHooks()` (`playEmoteSound: () => this.audioManager.playEmote()`). Nothing else on the list (`menuOverlay.ts`, `htmlControls.ts`, `menu.css`, `style.css`, `progression.ts`, `cosmetics.ts`, `multiplayerMatch.ts`, `storage.ts`) was touched; the emote styles live in `src/ui/emotes.css`, imported by `src/ui/emotes.ts`.

## Next 10 (2026-11-25)

The owner approved the proposed next 10 ("I like the proposal. Continue with them"), including the two items the spec had deferred (hot-seat sudden death and a walking-Jonh garden). Independent items run in parallel worktrees: the wind garden (5), online emotes (4), mobile performance and install (9) and the walking-Jonh garden (10). Items 1, 2, 3, 6, 7 and 8 are built on `real-game-pass` directly.

### 1. Shareable Daily Bonk result — done
- `rules/dailyShare.ts` builds the text: "Hit Jonh Daily · 25 Nov · ★★☆", one symbol per shot (⬜ miss, 🎩 hat, 💥 hit, 🎱 trick, or "Jonh wins"), "🔥 3-day streak" from two days, and the game's address with `?daily`. Format and symbols are [PROPOSED].
- The day's counted run is saved as `progress.dailyShots` (sanitized: up to three shots, only the last may be a hit). Older saves share stars only.
- The Daily result card offers **Share result** (focused), **Play again** (R) and **Home**. The Daily screen offers Share once today's run exists. A replay shares the counted run and says so.
- Phones get the share sheet (`navigator.share` on coarse pointers); elsewhere the text is copied. Without the Clipboard API (plain-http LAN addresses) the text becomes a selected box to copy by hand.
- `?daily` opens today's Daily Bonk directly, then drops the parameter so a reload starts at Home.
- Verified: `tests/dailyShare.test.ts` (text, codes, dates, saved patterns, share/copy fallbacks). Headless Chromium: `/?daily` opened the Daily screen; a miss then the reference shot gave "★★☆ ⬜🎱 trick shot!"; Share copied exactly the previewed text (read back from the clipboard); the Daily screen then offered Share. Emoji show as boxes in headless Chromium (no emoji font); not checked on a phone.

### 2. First-garden coach — done
- `rules/coach.ts` (pure) decides when to coach and words one fix per miss; values in `COACH` (tuning). Coaching lasts until the first hit ever. All of it is [PROPOSED].
- Ghost glove (`render/coachRenderer.ts`): on the first campaign garden, before the first shot, it presses on the cannon and drags up and away with a red dashed pull line, on a 3 s loop. Touching the aim or firing removes it. Reduced motion: a still glove at the end of the drag.
- Miss tips: the next aiming caption becomes a "Tip" chip (`feedback-coach`, no fade) such as "Short. Add power. 2 shots left." It survives Retry after a failed run. A ball that lands before an obstacle and rolls into it is treated as short, not blocked (it was "Blocked. Aim higher." in the first browser run, which was the wrong advice).
- A brand-new player's home button is now **Play · Garden 1** (one tap into the coach) with **All modes** beside it. Returning players still see Continue.
- Verified: `tests/coach.test.ts`. Headless Chromium at 1280×800 and 844×390 with a fresh save: Play went straight to Garden 1, the glove showed and vanished after one arrow key, and an 8% shot that rolled into the shed gave "Short. Add power. 2 shots left." Screenshots: `/tmp/claude-1000/-home-aalish-hit-jonh/ed121ce8-c677-4dd3-8876-4f92349f6478/scratchpad/pw/shots/47-sheet.png`. Real-time feel of the glove loop not judged (the headless page runs on a manual clock).

### 4. Online emotes — merged
Built in a parallel worktree (branch `t3/online-room-emotes`, section above) and merged after review. **The Convex functions are not deployed**: online rooms need `npx convex dev --once` (dev) or `npx convex deploy` (production) before the new build can send or show emotes. Until then the emote button stays disabled. Not tested against a live deployment.

### 3. Practice on cleared gardens — done
- `SoloChallengeMachine` takes `{ practice: true }`: unlimited shots, never a result, hits counted. Challenge rules are unchanged (`tests/practice.test.ts`).
- In practice the scene records nothing: no progress (hits, streak, unlocks), no solo best or trick badge, no saved aim. Its result window then goes straight back to aiming.
- Entry: a Challenge/Practice switch on the garden list (shown once a garden is cleared; uncleared gardens say "Clear it to practise here"), and **Practice (P)** on the result card of any cleared garden. Pause offers **End practice**, which returns to the practice list.
- HUD: "Practice · {garden}", no attempt pips, "Practice: 2 hits in 4 shots". The chapter card says "Practice · Garden N".
- Rules are [PROPOSED]: only cleared gardens, and nothing counts, including hit totals.
- Verified in headless Chromium (1280×800): the practice list enabled only the cleared Backyard; four practice shots (hit, miss, hit, miss) gave "Practice: 2 hits in 4 shots"; the save was byte-for-byte unchanged afterwards; End practice returned to the practice list; a challenge win offered Practice (P). Screenshots: `/tmp/claude-1000/-home-aalish-hit-jonh/ed121ce8-c677-4dd3-8876-4f92349f6478/scratchpad/pw/shots/48-sheet.png`.
