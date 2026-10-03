# Hit Jonh — remaining work plan

Prepared 2026-10-03. The owner requested phased execution through Antigravity; Codex owns scope, acceptance, review and delivery. This resumes feature work after the Backyard appearance pass. Visual enjoyment, sound balance and hardware touch testing remain owner judgments, never inferred from passing tests.

## Execution contract

- Read `AGENTS.md`, `SPEC.md`, and `docs/progress.md` before each phase. SPEC is authoritative.
- Run the checked-in prompt for exactly one phase. Preserve verified flight, swept collision guards, fixed stepping, first-contact feedback, and the current art direction.
- Keep pure simulation, levels and rules free of Phaser. Centralize tuning. Leave `hit-jonh-game-design.md` untouched.
- Proposed numbers stay proposed. Log reversible defaults for open choices; do not claim owner approval. Initially show only the active player's previous trail, and propose fence/building faces as eligible ricochet surfaces; ground is never eligible.
- Run `npm run check` and `npm run build`, report actual summaries, document browser checks separately, and label unavailable checks `not verified` with a reason.
- Update progress with done/current/issues/decisions/next task, then make a small local checkpoint commit after checks pass (AGENTS rule 11). Do not push, publish, deploy, or add deferred features.
- Codex inspects each result, relevant changes and tests before advancing. Fix material gaps through a focused AGY continuation.

## Phase 1 — finish M2 outcomes and reactions

Model: `gemini-3.8-flash-high`; effort: high. Prompt: `docs/agy-prompts/phase-1-m2.md`.

Wire body, ricochet body, hat-only and miss classification through actual adapter contacts. Highest outcome wins once; hat contact must not end a shot before a later body hit. Add hat/overhead reactions and obstacle feedback without changing flight. Preserve immediate skippable hit feedback, previous trails and incoming impact speed.

Gate: classification, event idempotency, hat-then-body, reset and dialogue regressions; existing physics regressions pass; game remains playable; actual check/build evidence recorded. Obstacles may be tested with data fixtures before playable maps arrive.

## Phase 2 — M3 solo challenge and three maps

Model: `gemini-3.1-pro-high`; effort: high. Prompt: `docs/agy-prompts/phase-2-m3.md`.

Add Fence and Rooftop data/rendering, map selection, main menu/solo setup, pure three-attempt challenge rules, stars/style and safe versioned storage. Restore scene before every attempt while preserving aim and previous trail. All maps unlocked; body success ends the challenge, hat-only does not. Implement retry and return to map selection.

Gate: actual Matter adapter proves every reference solution; geometry validation; success/failure/retry and best-result/corrupt-storage tests; browser challenge walkthrough if tools permit; check/build pass.

## Phase 3 — M4 local competition

Model: `gemini-3.1-pro-high`; effort: high. Prompt: `docs/agy-prompts/phase-3-m4.md`.

Add 2–4-player setup with optional names, colour and pattern, saved personal aim/trail, explicit handover, three maps/rounds with rotating start, three shots per player per round, scores, round/match results, tie-breaks and rematch. All shots use the same launch position and identical reset state; early hits do not shorten a round.

Gate: N=2/3/4 shot counts/order; out-of-turn and duplicate score rejection; winners/ties; actual adapter reset comparisons; clean rematch preserving setup/aim; browser handover/rematch if possible; check/build pass.

## Phase 4 — M5 polish and release readiness

Model: `gemini-3.8-flash-high`; effort: high. Prompt: `docs/agy-prompts/phase-4-m5.md`.

Finish first-gesture audio, persisted mute/volume/reduced motion, settings, pause/resume/quit, loading and responsive accessible controls. Freeze physics and cosmetic timers while paused; clear transient state on quit/restart. Hide developer controls in normal production play. Measure performance before choosing a fix; preserve fixed physics at throttled frame rates. Walk every SPEC section 12 transition, including production preview.

Gate: meaningful settings/pause/input/timing/lifecycle regressions; scripted transition evidence and console checks; narrow viewport and resize checks; real-device touch/audio quality explicitly unverified if unavailable; check/build pass.

## Phase 5 — independent review and delivery

Model: `gemini-3.1-pro-high`; effort: high. Prompt: `docs/agy-prompts/phase-5-review.md`.

Read-only fresh AGY conversation reviews changes from baseline `ec0e120` for correctness, repo standards, SPEC alignment and security. Findings need concrete triggers, file/line and evidence. Codex assesses findings; material fixes return to the implementation conversation, then receive appropriate checks and a checkpoint. Record remaining owner playtest judgments and verification limits. No deployment is part of this request.

Gate: no unresolved actionable release blocker; final check/build summaries, commit list and known limitations available to the owner.
