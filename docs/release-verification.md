# Release verification — Hit Jonh

Date: 2026-10-03. M0–M5 scope accepted by Codex after AGY implementation and corrections. No deployment or push was performed.

## Final automated evidence

Checks ran after the final Change Map source correction, following checkpoint `8118398`:

```text
npm run check
  tsc --noEmit: passed
  eslint .: passed
  Vitest v5.0.3
  Test Files  19 passed (19)
       Tests  129 passed (129)
    Start at  23:30:19
    Duration  1.03s

npm run build
  tsc --noEmit && vite build: passed
  Vite v8.3.2
  64 modules transformed
  built in 861ms
```

The Phaser chunk is 1,431.43 kB / 375.59 kB gzip; the game main chunk is 98.25 kB / 23.97 kB gzip. Node emitted an experimental warning about localStorage being unavailable without its file option. A sandbox-only Vitest worker-cache ENOENT failure preceded the successful outside-sandbox rerun; no test configuration was changed to hide it.

Coverage includes classification/idempotency, actual Matter reference solutions and reset state, fixed stepping and swept collision guards, solo progression/storage, N=2/3/4 multiplayer counts/order and ties, history isolation, input guards, settings parsing and audio gain clamping.

The session helper tests exercise its own gates and callbacks. They do not instantiate Phaser or prove scene timer/cleanup integration. Source inspection established that `PrototypeScene.update()` exits before physics and cosmetic updates when paused/inactive, and pause/resume reset its accumulator; browser checks below exercise that integration. Heap leak freedom and exact reaction timing are not inferred from these tests.

## Production browser acceptance

Codex used real Chrome UI through the browser extension against the production preview on port 4174. All actions were native UI actions; readonly DOM inspection measured layout. Earlier build-specific observations are retained in `orchestration-log.md`.

| Area | Observed evidence | Build scope |
| --- | --- | --- |
| Solo maps | Visible Fence/Rooftop geometry, reference ricochet hits, explicit Continue, three-star result, retained best/style after reload, retry with aim retained | Corrected M3 `dbf6bb3` |
| Solo failure | Three weak shots progressed through two/one attempts remaining to Challenge Failed; Retry restored three attempts and aim | M3 and M5 walkthroughs |
| Multiplayer | Completed 18 actual shots over all three maps for two players. Each player scored 300, then 675, then 1050; nine body hits each; final shared tie. Round starters alternated Player 1/2/1, and each shot/round required Continue | `4c109ee`, repeated on `8118398` |
| Personal history/rematch | Player-owned coloured prior trail/landing returned on the next turn; inactive patterned slot visible. Rematch reset scores/rounds while retaining setup and aim | `4c109ee` |
| Four-player setup | Count 2→3→4 exposed labelled name fields; blank name became Player 4. Active red and inactive blue striped, green dotted and orange checked slots visible; Pause/Quit returned to menu | `8118398` |
| Pause/input | Escape pause/resume during aiming and result; focused slider changed 45→46 once; focused Fire+Space fired once; Enter continued result. Long shot paused in flight; two screenshots taken after elapsed time were byte-identical; resume continued the existing attempt; Quit and new solo session worked | M5 production walkthrough |
| Settings | Mute on, volume 40 and reduced motion on all survived reload. AX tree exposed Master Volume and associated checkbox labels | `ae894a6` and subsequent build |
| Narrow layout | At 500×800 viewport, document/scroll widths both 500; logical canvas 1280×560 rendered at 468×204.75; buttons were 42px high. Viewport override was reset | M5 production walkthrough |
| Menus/result safety | Native Space on Solo Challenge opened map selection; solo result exposed only result actions, with gameplay controls inert; final match Main Menu and Pause/Quit cleanup returned to menus without stale controls | M5 production walkthrough |
| Production debug | Loading the production page with `?debug` did not expose debug controls; source gates both rendering and shortcut by development mode | Final production walkthrough |
| Boot failure/retry | Temporarily renamed exactly one generated main module; fresh page displayed friendly failure and Retry with no canvas. Immediately restored the module; Retry reached Main Menu. No backup remains | `8118398` |
| Change Map | Solo body hit → Continue → result → Change Map opened Select Map with all three maps; Back returned to Main Menu | Final 64-module build after one-line navigation fix |

Captured warning/error logs were empty during normal post-reload/post-Retry flows. The intentionally withheld boot module produced the expected failure; it was restored before retry. The complete multiplayer replay preceded the final Change Map-only patch; that patch affects solo navigation and received its own final-build browser check.

## Review and corrections

Fresh independent AGY Pro High review approved the change, but overstated scene-level coverage and missed actual settings/boot defects. Codex acceptance caught reduced-motion persistence, the volume label, missing boot failure handling and Change Map navigation. AGY corrected the settings/UI gaps; Codex added the small bootstrap boundary and final navigation correction. One callback-copying test was removed, bringing the final suite from 130 to 129 meaningful tests. Review scratch artifacts were removed by exact path.

## Verification limits

- Physical touchscreen taps/drags: not verified; no touch hardware was available.
- Perceived audio volume/balance and visual enjoyment: not verified; require owner listening/playtest.
- Actual FPS, CPU-throttled hardware performance and heap leak profiling: not verified; no profiler/hardware measurements were performed. Build sizes and automated fixed-step regressions are evidence for their respective properties only.
- Browser walkthroughs cover the recorded cases, not every possible input sequence. Three/four-player full matches and all scoring tie variants are covered by pure tests rather than complete browser matches.

The requested dev server remains available at http://localhost:5173. No implementation task remains in the requested scope; optional owner playtest can inform later tuning without treating proposed values as approved.

## Usability pass verification — 4 October 2026

The owner's new requirements supersede the manual Continue/default-map assumptions in the historical walkthrough above. Current production walkthrough: automatic two-player single-map match, all six alternating shots, clean selected-map rematch, solo automatic miss/hit/result/retry, canvas drag and flight lock, pause/resume, keyboard Home and Home during flight, and 500×800 four-player setup without horizontal overflow. Full details and final check/build summaries are in `docs/progress.md`; the remaining-work assessment is in `docs/game-audit.md`.

The new home preview is `docs/hit-jonh-home.png`. Audio is synthesized, with hit yelps and a FAAH cue at visible canvas exits. Audible quality/balance and physical touch remain not verified. The current production preview is served at `http://127.0.0.1:4173`.
