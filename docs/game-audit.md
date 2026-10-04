# Game audit — 4 October 2026

The original M0–M5 implementation covered the physics and match rules, but still presented much of the experience as a prototype. Passing those acceptance tests did not establish satisfying pacing, memorable art, or good sound. This pass addresses the owner's specific control, pacing, obstacle, navigation, audio and multiplayer setup requests.

## What the inspection found

| Area | Before this pass | Change |
| --- | --- | --- |
| Aiming | Sliders/keyboard only; no interaction with the field | Drag up/down anywhere on the canvas. Accessible sliders and keyboard remain. |
| Local turns | Pure rules already alternated players; repeated blocking handovers obscured the flow | Automatic named handovers, one shot per player in sequence, visible player scores and active marker. |
| Map difficulty | Backyard had no obstacle | A solid shed blocks low shots; fence/building remain solid on the other maps. Each layout has verified reference shots. |
| Shot pacing | Every result required Continue | 1.4-second reaction window, automatic retry/turn/result, 1.2-second handover and 2.4-second round summary. Optional skip buttons remain. |
| Audio | Generic synthesized impact sounds | Alternating vocal yelps and a formant-synthesized FAAH when the ball leaves the visible canvas. |
| Navigation | A basic mode menu was the starting screen | Illustrated Home → mode menu → setup. Persistent gameplay Home cleans the session immediately. |
| Multiplayer setup | Plain name fields; fixed three-map sequence | Styled player rows/pattern labels and arena cards: choose one map or the three-map tour. Rematch retains that choice. |

The fixed timestep, swept collision guard, scoring idempotency, individual saved aiming settings and trails, best solo results, mute/volume, reduced motion, pause and quick rematch already existed. They were preserved rather than replaced.

## What is still left

These are suggested future tasks, not features implemented in this pass:

1. **A short interactive first-shot tutorial.** Explain the relationship between angle, power and obstacle clearance without revealing a full trajectory. The current instructions explain controls but do not teach aiming.
2. **More expressive Jonh animation and recorded vocal performances.** The current drawing and authored reactions are simple; synthesized audio is a working, asset-free option, but a recorded voice could carry more personality.
3. **Richer obstacle layouts and difficulty progression.** There are only three fixed arenas. New maps should each introduce a clear shot-planning challenge and retain automated solvability checks.
4. **An optional practice mode.** Unlimited retries would help players learn without changing challenge scores. This remains deferred by the spec until requested.
5. **Physical mobile/touch and performance playtesting.** Responsive browser layout checks cannot establish real-device touch feel, speaker balance, frame-rate stability under hardware stress or memory use over long sessions.

Online play, destructible props, ragdolls, extra ammo, AI opponents and moving targets remain deferred. They are unnecessary to address the specific problems raised here.

## Verification

Final results and browser coverage for this pass are recorded in `docs/progress.md`. Automated physics/rule checks do not establish subjective sound quality or visual enjoyment.
