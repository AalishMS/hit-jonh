# Progress — Hit Jonh

_Last updated: 2026-10-04_

## Current milestone

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

**Next task:** Owner playtest of target positions; no further gameplay changes are included in this milestone.



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

**Next task:** Owner playtest/tune launch and impact feel. Replacement art, recorded audio and world aiming remain separate future milestones.

## Rubber Yard Map Addition � 2026-10-05

**Done/current:** Implemented the "Rubber Yard" map featuring a bouncy rubber ceiling and a solid concrete wall obstacle, satisfying the original design proposal for a trick-shot arena. Authored unique rendering for the new ubber material to distinguish it from concrete and wood. Determined and proved stable, exclusive reference solutions for standard play and multiplayer target positions. Passed all physics and orchestration tests.

**Lifecycle/accessibility decisions:**
- Kept MULTIPLAYER.maps to the core 3 maps (ackyard, ence, ooftop) to preserve existing competitive round tracking/match lengths, treating "Rubber Yard" as a distinct/optional map for solo practice or explicit selection.
- Rubber material has high restitution (0.9) to allow rich bounce gameplay without breaking standard impact dampening on grass.
- Multiplayer offsets were standardized to -2, 0, 3 to match other levels and ensure physical exclusion of trick shots.
- SceneryRenderer gives the rubber surface a distinct pink/red color with a soft highlight and thick border, clearly signaling its bouncy nature to the player.

**Actual automated summaries:**
- 
pm run check passed typecheck/lint, **26 test files / 176 tests**, duration **1.40s**.
- 
pm run build passed: **71 modules transformed / 1.34s**.
- Brute-forced exclusive trick-shot solutions in headless tests, ensuring physical solvability despite the high 7.0m concrete wall blocking direct shots to Jonh.

**Next task:** Owner playtest/tune Rubber Yard trick shots. Determine if the map should be added to the default 3-map cycle or kept as a bonus unlock/practice stage.

## Polish pass — 2026-10-07/08 (branch `polish-pass`)

Owner request: make the game look and feel polished and shareable. Audit: `docs/polish-audit.md`. Style guide: `docs/art-direction.md`. Running notes per phase below; full summary in `CHANGELOG.md`.

**Phase 2.1 — impact moment.** Art pipeline: SVG parts in `src/art/` rasterized once at boot (`BootScene`, `render/artTextures.ts`) at 2–3× for crisp zooms. Jonh rebuilt as a layered rig (`render/jonhRenderer.ts`) driven by a pure pose function (`fx/jonhPose.ts`), so the hit-stop holds frame 0 (his most extreme, crumpled pose) and every reaction is replayable. On the contact frame: hit-stop + slow motion with an eased ramp (time fed to the accumulator only), 1–2 frame flash, contact star, shockwave ring, radial particle burst, comic word with overshoot (Luckiest Guy), ball squash, camera punch-in and directional shake, and layered sound (thump + crack + yelp). Intensity is chosen per hit quality (`fx/impactProfile.ts`: trick > strong > weak > hat > obstacle > ground). Reduced motion keeps the comic word and sound, cuts poses, and drops freeze/slow/shake/flash/particles/camera motion. Decisions: body hits now hold the result for 2.6 s (`FLOW.bodyHitResultSeconds`) so the knock-back lands; stored multiplayer colours remain as save identifiers and are mapped to the new palette when drawn.

**Phase 2.2 — Jonh and the world.** Jonh's rig now has idle life (breathing, blinks, a page turn every 8 s, suspicious glances), anticipation (peeks over the paper while the player drags to aim; flinches and raises the paper as the ball closes in) and distinct reactions: weak/strong/trick knock-backs, hat-only (hat flies, he pats his bald head), duck (overhead), smug (short), glare (over) and wince (obstacle). Scenery is four parallax layers (sky+sun+drifting clouds, far hills/skyline, mid hills with trees and birds, garden fence) plus a tiled ground with an ink edge on the collider top; each map has its own light (midday, afternoon, golden-hour town, pink late afternoon). Obstacles are drawn per collider box (shed, fence post, brick terrace, stone wall, rubber beam on chains); flowers/tufts sway. Memory is kept low by tiling small textures. Ambient motion runs on real time and stops under reduced motion.

**Phase 2.3 — cannon and shooting.** New cannon (carriage, spoked wheel, brass-banded barrel painted in the player's colour and pattern). Fire now has anticipation (0.12 s wind-up: barrel squash + fuse sparks + fizz while simulation time is held), then muzzle flash, smoke puffs, sparks and recoil that rolls the carriage. The ball stretches with speed and leaves a speed ribbon; trails are a comic dotted path with an inked X landing mark. Aiming is in the world: grab the cannon (it points at the pointer, distance = power) or drag anywhere (↕ angle, ↔ power, axis-locked), with a 0.3 s analytic launch preview (direction and power, never the landing; SPEC §3.2) and a fairground power meter under the cannon. Sliders and keys remain as the accessible fallback.

**Phase 2.4 — camera and replay.** A camera rig (`render/cameraRig.ts`, pure framing in `fx/cameraDirector.ts`) frames the full field while aiming, follows the ball at a gentle 1.15× in flight, zooms out (bottom-anchored, never below the ground) when the ball climbs above the view, punches in on Jonh at impact (zoom + directional shake on real time, so it moves during the hit-stop) and returns to the full view on reset. Strong and trick hits get a slow-motion replay (`fx/replay.ts`): after Jonh lands, letterbox bars and a blinking REPLAY tag appear, the camera follows the recorded ball at 2.1× and 40 % speed, Jonh (back in his chair) spots it coming, and the full impact replays before easing out. Replays are presentation only (recorded positions + the pure pose curve), skippable with Next/Enter, frozen by pause, and absent under reduced motion. After a body hit the ball now bounces away cosmetically instead of freezing in mid-air. Decision: weak hits and hat hits get no replay, to keep multiplayer turns brisk; the body-hit result window stretches to fit the replay.

**Phase 2.5 — audio.** Kenney "Impact Sounds" (CC0, 15 files, 165 kB Ogg) are layered with synthesized parts; every hit plays a low thump (sine kick + punch sample), a high crack (band-passed noise + wood sample) and Jonh's formant yelp on the same AudioContext time, with a slide whistle for strong hits and a bell for trick shots. Surfaces sound different (grass, wood, stone, rubber "boing"), the hat gets a tinny plink + "fwip", the cannon has a fuse fizz, a sub kick, a crack and air. A speed-following whoosh plays in flight. Every play is pitch-randomised (cosmetic RNG); nothing is slowed during hit-stop or replay. A light 8-bar swung loop ("Sunday Stroll", marimba/pizzicato bass/shaker, synthesized) and occasional birdsong run on a separate music bus with its own setting; everything passes a master compressor. Measured in headless Chrome: all 15 samples decode, output peaks 0.22 (music), 0.73 (launch), 0.88 (hit), no clipping. **Not verified:** how any of it actually sounds to a listener; no listening was possible. If Ogg decoding fails (very old Safari), the synthesized layers still play.

**Phase 2.6 — UI and screens.** One display face (Luckiest Guy) and one UI face (Nunito), self-hosted. The page is a halftone comic backdrop; the game is a full-screen comic panel (height-limited, 16:7) with the HUD laid over the canvas: map chip + cannonball attempt pips or player score chips, sound/pause icon buttons, a pop-in caption, a big pulsing FIRE button where the right thumb rests, a "Next" pill after a shot and a collapsible "Precise aim" panel that keeps the native sliders as the accessible fallback (always shown in portrait). Title screen: animated logo over a live attract scene (Jonh reading in the Backyard). All menus/results restyled (mode cards, illustrated map cards with stars, coloured handover name with auto-advance bar, ranked score rows, stars that pop in, NEW BEST/TRICK SHOT ribbons, switch-style settings incl. a new Music toggle); cards pop in, an iris opens into play; button clicks tick. Reduced motion (setting or OS) also turns off CSS animation. Phone landscape now fits everything on one screen (previously the controls were below the fold); portrait stacks controls under the canvas with a rotate hint.
