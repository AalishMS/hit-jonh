# AGENTS.md — Hit Jonh

Instructions for any coding agent (or human) working in this repo. Spell it **Jonh**.

## Commands

```bash
npm install          # install exact locked deps (use `npm ci` in CI)
npm run dev          # dev server → http://localhost:5173  (add ?debug for Matter debug draw)
npm run typecheck    # tsc --noEmit
npm run lint         # eslint .
npm run test         # vitest run
npm run check        # typecheck + lint + test
npm run build        # typecheck + production build → dist/
npm run preview      # serve dist/ locally
```

## Rules

1. **Read `SPEC.md` before implementing a task.** It is authoritative. Labels matter: `[PROPOSED]`/`[TUNE]` are unapproved defaults, `[OPEN]` must not be silently decided.
2. **Implement only the requested milestone.** No speculative features from later milestones.
3. **Keep each completed milestone playable** via `npm run dev`.
4. **Separate concerns:** `sim/` (physics maths), `physics/` (Matter adapter), `render/`, `input/`, `levels/` (data), `rules/` (match/solo logic). `sim/`, `rules/`, `levels/` must not import Phaser.
5. **Centralise tuning** in `src/config/tuning.ts` or level data. No magic numbers in scenes.
6. **Simulation is frame-rate independent:** Matter runs with `autoUpdate: false` and is stepped only via `FixedStepper` at the fixed `dt`. Never pass the frame delta to `matter.world.step`.
7. **Preserve unrelated changes.** Don't reformat, delete, or rewrite files outside the task. Keep `hit-jonh-game-design.md` untouched.
8. **Run relevant checks and report evidence:** `npm run check` and `npm run build` at minimum; paste the actual result summary.
9. **Never claim a feature was tested if it was not.** Say "not verified" and why.
10. **Update `docs/progress.md`** after each milestone (done, current, known issues, decisions, next task).
11. **Checkpoint verified work with Git:** small commits with clear messages after checks pass. Never force-push.

## Gotchas

- Matter.js has no CCD — fast shots need the swept guard and thickness rules (SPEC §9.2).
- Matter velocity units are px per 1000/60 ms; convert only in `sim/units.ts` / the physics adapter.
- TypeScript is pinned to 6.0.x because `typescript-eslint` 8.x does not support TS 7.
