# Release Verification — Hit Jonh Phase 4 / M5 Polish & Readiness

Date: 2026-10-03  
Target: Phase 4 / M5 (Pause, settings, audio sliders, input lifecycle, polish)

## 1. Automated Verification Evidence

Commands executed in environment:

### `npm run check`
Output summary:
```text
> hit-jonh@0.0.1 check
> npm run typecheck && npm run lint && npm run test

> hit-jonh@0.0.1 typecheck
> tsc --noEmit

> hit-jonh@0.0.1 lint
> eslint .

> hit-jonh@0.0.1 test
> vitest run

 RUN  v5.0.3 E:/pet_project/Kill Jonh

 Test Files  19 passed (19)
      Tests  128 passed (128)
   Start at  22:54:41
   Duration  761ms (transform 57%, import 20%, tests 19%, worker 5%)
```
Result: **100% PASSING** (0 errors, 0 warnings).

### `npm run build`
Output summary:
```text
> hit-jonh@0.0.1 build
> tsc --noEmit && vite build

vite v8.3.2 building client environment for production...
transforming...
✓ 62 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                               0.91 kB │ gzip:   0.46 kB
dist/assets/index-CTEJRON0.css                4.00 kB │ gzip:   1.46 kB
dist/assets/rolldown-runtime-CbXtAM7H.js      0.58 kB │ gzip:   0.36 kB
dist/assets/index-C6MdPDmt.js                97.81 kB │ gzip:  24.02 kB │ map:    302.90 kB
dist/assets/phaser-BDua2ZS6.js            1,431.43 kB │ gzip: 375.59 kB │ map: 11,566.34 kB

✓ built in 686ms
```
Result: **SUCCESSFUL PRODUCTION BUILD**.

---

## 2. Invariants Verified by Automated Suites

| Area | Invariant Tested | Verification Method |
|---|---|---|
| **Pause Stepping** | Physics stepping and reaction timers completely stop advancing while paused | `tests/sessionCoordinator.test.ts` advance with FixedStepper |
| **Boundary Accumulator** | Stepper accumulator is reset at BOTH pause entry and resume exit (no catch-up burst) | `tests/sessionCoordinator.test.ts` FixedStepper step count assertion |
| **State Preservation** | Projectile position, velocity, and shot attempt state are identical across pause/resume | `tests/sessionCoordinator.test.ts` with real `MatterAdapter` & `ShotAttemptMachine` |
| **Quit Invalidation** | Quitting clears session machines and prevents subsequent score dispatch or updates | `tests/sessionCoordinator.test.ts` |
| **Pausable States** | Pause permitted during Aiming, Simulating, and in-game Result (including terminal solo result before modal); disallowed in menus or when modals are open | `tests/sessionCoordinator.test.ts` SPEC §12 matrix |
| **Space Handover Leak** | Held Space during handover or pause cannot leak into accidental fire upon aiming | `tests/input.test.ts` |
| **Form Element Focus** | Gameplay shortcuts ignored when typing in text/select/textarea fields; range sliders correctly classified as non-text controls | `tests/input.test.ts` |
| **Native Menu Activation** | Space and Enter on focused menu buttons do not trigger game fire or continue, preserving native button activation without bypass | `tests/input.test.ts` |
| **Key Repeat & Escape** | Escape key repeats ignored; Escape works when paused to resume; Arrow keys prevent double slider increments | `tests/input.test.ts` |
| **Settings Persistence** | Volume, mute, and reducedMotion settings persist in `localStorage` under `hitJonh.v1` schema | `tests/storage.test.ts` |
| **Audio Volume Clamping** | Volume levels clamped to `[0, 1]` with master gain updates and uninitialized AudioContext safety | `tests/audio.test.ts` |

---

## 3. Browser & Environmental Verification Status (For Codex Lead Review)

Per AGENTS rule 9 and worker instructions regarding the Chrome DevTools profile conflict, browser-interactive and sensory items are explicitly recorded below:

- [ ] **Interactive Pause Overlay Appearance**: **NOT VERIFIED by worker** (Delegated to Codex lead browser walkthrough).
- [ ] **In-Game Settings UI (Mute / Volume / Reduced Motion)**: **NOT VERIFIED by worker** (Delegated to Codex lead browser walkthrough).
- [ ] **Audio Master Volume Attenuation Perception**: **NOT VERIFIED by worker** (Requires real audio listening).
- [ ] **Physical Touchscreen Tap & Drag Reliability**: **NOT VERIFIED by worker** (Requires mobile / touch hardware).
- [ ] **Real-time 60fps/120fps Frame Throttling & Profiling**: **NOT VERIFIED by worker** (Delegated to Codex preview walkthrough).
- [ ] **Full Multi-round Match End-to-End Walkthrough**: **NOT VERIFIED by worker** (Delegated to Codex).
