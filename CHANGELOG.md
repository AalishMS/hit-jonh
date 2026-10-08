# Changelog

## Online multiplayer (branch `online-multiplayer`, 8 October 2026)

Play with 2–4 friends over the internet. One player creates a room and shares a 5-character code or a `?room=CODE` link; the others join. Turns are live: everyone sees each shot as it is fired, and the shooter's result decides the score.

- **No accounts, no matchmaking.** Each browser tab is one player; a reload keeps your seat. The host picks maps and presses Start; anyone can ask for a rematch.
- **Turns can't stall the room.** The server skips a player who goes quiet for 90 s (warning from 60 s), limits a turn to 120 s (countdown from 90 s), and resolves an unreported shot after 40 s.
- **Needs a Convex deployment** (README, "Online play (Convex)"). Without one the Online card is disabled and the game plays as before. Hot-seat play and your saved local players are unchanged.
- **Known limits:** previous-shot trails are empty after a reload; the shooter's client is trusted; Pause and Mute do nothing while someone else aims.
- **Not verified:** the in-browser two-player walkthrough could not be run in this session (see `docs/progress.md`). Automated: 44 test files / 355 tests pass; Convex handlers were smoke-tested on the dev deployment.

## Polish pass (branch `polish-pass`, 7–8 October 2026)

The engineering was solid, but the game looked like a tidy prototype, and the one moment worth clipping (Jonh getting hit) barely happened on screen. The audit (`docs/polish-audit.md`) measured it frame by frame. On the contact frame Jonh was drawn in his ordinary pose. At +400 ms he was upright again. The knock-down finished about 0.9 s after contact. On phones in landscape, the controls sat below the fold. This pass rebuilds the presentation around that moment, under one art direction (`docs/art-direction.md`, "Sunday Funnies"). Simulation, scoring, rules and multiplayer logic are unchanged.

Before and after screenshots: `docs/polish/before/` and `docs/polish/after/`. Impact frame sequences: `docs/polish/after/impact-seq/`.

### The impact moment
- **What changed:** every layer now fires on the same contact frame:
  - hit-stop, then slow motion that eases back to full speed
  - a 1–2 frame flash
  - a comic contact star and a shockwave ring
  - a radial burst of stars, dust, sparks and newspaper scraps
  - a comic word (WHAM!, KA-POW!, …) that pops with overshoot
  - squash on the ball
  - a camera punch-in plus a shake along the ball's direction
  - layered sound: low thump, high crack and Jonh's yelp
- **Why:** the hit is the game. Hit-stop only reads as impact when the frozen frame is the most dramatic one.
- **Jonh's first reaction frame is now his most extreme pose.** He crumples into a "C" around the ball and his face bulges in shock. A one-frame motion smear (a ghost copy plus speed lines) follows as he is launched, then he cartwheels, lands on his back, sees stars, and finally glares. A test asserts that frame 0 is the maximum squash.
- **Intensity scales by hit quality** (`src/fx/impactProfile.ts`), so the big treatment stays special:

  | Hit quality | What fires |
  | --- | --- |
  | Trick shot (ricochet) | Everything, at maximum, plus the replay |
  | Strong body hit | Full treatment, plus the replay |
  | Weak body hit | About 70% of the full treatment |
  | Hat-only | A 45 ms freeze, a light shake and a "PLINK!"; the hat flies |
  | Obstacle / ground | Dust only |

- **The existing slow motion was reviewed** (80 ms freeze, then 35% speed for 240 ms). It froze an ordinary pose and then delayed the payoff, so it read as lag. Now the freeze holds the extreme pose, slow motion covers the launch, and a linear ramp returns to full speed instead of a hard step. All of it is tunable.
- **Determinism is kept.** Hit-stop, slow motion, the ramp and the new cannon wind-up only scale the real time fed to the fixed-step accumulator. The step size never changes. Effect durations run on unscaled real time. A new physics test (`tests/polishDeterminism.test.ts`) proves identical contact point, score and step count on every map at 30, 60 and 144 Hz, with and without effects, and under reduced motion.
- **Reduced motion keeps the comic word (fading in place) and the sound.** Poses cut straight to their settled state. Freeze, slow motion, shake, zoom, flash, flying particles, smear, replay, parallax drift and CSS animation are all off.

### Jonh and the world
- **Jonh is rebuilt as a layered rig.** It has a chair, legs, torso, two arms, the newspaper, a head with 8 swappable faces, a bald-spot tuft and a hat. A pure pose function drives it (`src/fx/jonhPose.ts`), so every reaction can be tweened, paused, replayed and tested.
- **Idle life:** he breathes, blinks, turns a page every 8 seconds and glances suspiciously at the cannon.
- **Anticipation:**
  - He peeks over his paper while you drag to aim.
  - He spots an incoming ball and raises the paper as a shield.
- **Reactions:**
  - knock-backs (weak, strong and trick)
  - a hat-only hit, where he pats his bald head
  - ducking when the ball passes overhead
  - smugness when you fall short
  - a glare when you overshoot
  - a wince when you hit an obstacle
- **The background is four parallax layers.** Sky (gradient, turning sun rays, drifting clouds), far hills or town skyline, mid hills with trees and birds, and the garden fence. Each map has its own time of day.
- **Obstacles are drawn exactly to their colliders:** a shed, a fence post, a brick terrace, a stone wall, and a rubber beam hung on chains.
- **Every bare geometric placeholder is gone.** The art is original SVG, rasterized once at boot, at 2–3× for crisp zooms.

### Cannon and shooting
- **New cannon:** carriage, spoked wheel, and a brass-banded barrel painted in the player's colour and pattern.
- **Firing now has a 0.12 s anticipation.** The barrel squashes and the fuse sparks while simulation time is held. Then come a muzzle flash, smoke, sparks, a recoil that rolls the carriage, and a sub-bass boom.
- **In flight,** the ball stretches with speed, leaves a speed ribbon and whooshes. Trails are a comic dotted path with an inked X where the ball lands.
- **Aiming happens in the world.** Grab the cannon and it points at your finger, with distance setting power. Or drag anywhere: up/down sets angle (power stays on the slider). A fairground power meter sits under the cannon.
- **A 0.3 s analytic launch preview** shows direction and power, never the landing point, per SPEC §3.2.
- **The sliders remain as an accessible fallback** in a collapsible "Precise aim" panel. Keyboard aiming and firing are unchanged.

### Camera
- **Aiming:** the full field is shown.
- **Flight:** a gentle 1.15× follow. When the ball climbs out of view the camera zooms out, anchored at the bottom so it never shows below the ground. Beyond that limit, the off-screen marker takes over.
- **Impact:** a punch-in on Jonh.
- **Slow-motion REPLAY** for strong and trick hits: letterbox bars and a blinking REPLAY tag appear. The camera follows the recorded ball at 2.1× and 40% speed, Jonh sees it coming, and the full impact replays. The replay is presentation-only, skippable, frozen by pause, and absent under reduced motion.
- **After a body hit the ball bounces away cosmetically** instead of hanging in mid-air.

### Audio
- **Sources:** CC0 Kenney impact samples (15 files, 165 kB, see `CREDITS.md`) layered with synthesized parts.
- **Layering:** hits play thump + crack + yelp on the same audio frame. Strong hits add a slide whistle, trick shots a bell.
- **Surfaces sound different:** grass, wood, stone and a rubber "boing".
- **Other sounds:** a fuse fizz, a cannon boom with a crack, a flight whoosh, result stings and UI ticks.
- **Pitch is randomised on every play.**
- **Nothing is slowed** during hit-stop or the replay.
- **Music:** a light synthesized swung loop ("Sunday Stroll") with occasional birdsong, on its own bus with a Music setting. A master compressor sits on the output.

### UI and screens
- **One display face** (Luckiest Guy) **and one UI face** (Nunito), self-hosted. The page is a halftone comic backdrop, and the game is a full-screen comic panel.
- **The HUD sits over the canvas:**
  - a map chip, plus cannonball attempt pips or player score chips
  - a streak chip
  - sound and pause icons
  - a pop-in caption
  - a big pulsing FIRE button where the right thumb rests
  - a Next pill after each shot
- **Title screen:** an animated logo over a live attract scene of Jonh reading in his garden.
- **Restyled screens:**
  - mode cards
  - illustrated map cards with stars
  - the multiplayer handover, with the player's name in their colour and an auto-advance bar
  - ranked results with crowns
  - solo results where stars pop in, with NEW BEST / TRICK SHOT ribbons and unlock cards
  - pause
  - settings with switches and a new Music toggle
- **Motion:** cards pop in, an iris opens into play, and buttons click.
- **Phones:** landscape now fits everything on one screen. Portrait stacks the controls under the canvas, with a hint to rotate.

### Retention (three cheapest features)
1. **Unlockable hats.** There are eight hats, earned by milestones: first hit, hat-only hit, trick shot, three stars, a Daily Bonk hit, 25 hits, and three stars everywhere. You pick one in the hat locker and Jonh wears it everywhere. *Why:* the art already existed thanks to the rig. They give long-term goals and make every clip look different.
2. **Daily Bonk.** It is a date-seeded choice of a map plus one of its multiplayer target positions. *Why:* those positions are already physics-validated, so every day is solvable at zero level-design cost. The first run of the day counts and builds a day streak. Solo bests are never touched.
3. **Solo hit streak.** It counts consecutive body hits and shows them in the HUD and results. The best streak is saved. *Why:* tension from one counter.

These are stored as an optional `progress` field in the existing `hitJonh.v1` save. Older saves load unchanged, and corrupt progress is sanitised.

### Developer tools
- **`?tune` (dev only)** opens a live panel for all 26 presentation values: freeze per tier, slow-motion speed and duration, ramp, shake, zoom, flash, particle count, text duration and replay timing. It can copy them as JSON. It is excluded from production builds.
- **The dev build exposes `__HIT_JONH_AUDIO__`,** including an output peak meter used for the level checks.

### Fixes found along the way
- **Contact-frame cost.** At contact, the comic word was re-rendered as canvas text three times. Under 4× CPU throttle, the contact frame went from ~76 ms to ~25 ms after pre-rendering the words and deferring save writes.
- **Tied matches** now show crowns for every winner.
- **Faint lines in the sky,** caused by tiled textures bleeding when they repeat, are gone.

### Tests
- **Totals:** 34 files / 218 tests, up from 26 / 176. New tests cover the pose rig, impact profiles, time-scale integration and the wind-up hold, particles, the camera director, the replay buffer and director, music, in-world aim maths, progression and unlocks, progress persistence, and real-physics determinism with effects.
- **Rewritten:** `tests/shotEffects.test.ts` tested the replaced renderer's internals (Graphics calls). It now asserts the same guarantees against the new renderer: all layers fire on the contact frame, the camera is untouched, reduced motion suppresses motion, particles stay bounded, and reset/destroy clean up.
- **Unchanged and passing:** every other test file.

### Verified, and what was not
- **Verified in headless Chrome:**
  - every screen, at desktop and at phone portrait and landscape sizes
  - the contact frame sequence
  - a full 2-player match, rematch included
  - pause in flight and during the replay (frozen exactly, then resumes)
  - reduced motion
  - the Daily Bonk and the unlocks
  - the production build (no console errors, no dev globals)
  - audio levels: all samples decode; peaks of 0.22 music, 0.73 launch and 0.88 hit, with no clipping
  - frame cost under 4× CPU throttle: update p95 ≈ 2 ms and render p95 ≈ 8 ms during flight and impact
- **Not verified:**
  - **What any of it sounds like.** I could not listen.
  - **Real-device 60 fps.** Headless Chrome renders on the CPU (SwiftShader), so GPU cost on a real phone is unknown, and no physical phone was tested.
  - **How it feels to play.** Timing, shake strength and replay length are judgement calls, left tunable in `?tune`.
  - **Safari/iOS decoding of the Ogg samples.** If it fails, the synthesized layers still play.

### What you need to supply or decide
1. **Listen and tune.** Play with sound on, then adjust levels in `src/audio/audioManager.ts` and timings in `?tune`. I could only measure levels, not judge them.
2. **A real voice for Jonh (optional, high value).** His yelp is a synthesized formant voice. Two or three recorded deadpan grunts ("oof", "hmph", a tired "ow") would add a lot of character. You would need to record them or source them with a clear licence.
3. **iOS/Safari audio format.** The CC0 samples are Ogg Vorbis, as Kenney ships them. If you target older iPhones, provide m4a/mp3 copies; the code already falls back to synthesis if decoding fails.
4. **Fonts.** Luckiest Guy (Apache-2.0) and Nunito (OFL) are self-hosted. Keep them, or swap for a licensed brand face. Only `src/style.css` and `src/art/palette.ts` reference them.
5. **Body-hit result window.** It is now 2.6 s plus the replay (about 5 s on strong hits), up from 1.4 s, and skippable. Decide whether replays should play in multiplayer at all; set `FX.replay = 0` to turn them off.
6. **Hat unlock thresholds and the daily rules** (first run counts; positions come from the multiplayer set). These are product decisions; they are in `src/rules/progression.ts`.
7. **A physical phone test** for frame rate, touch-drag feel and the thumb reach of FIRE.

### Suggested next steps
1. **A shareable clip button.** Record the replay with `MediaRecorder` on the canvas stream as a 3–4 s WebM/MP4, with a "Share your BONK" button on the result screen. The replay already exists and is deterministic, so this is cheap and directly serves the "clip it" goal.
2. **Prop gags on the impact.** The tea table, teapot and garden gnome could react cosmetically: the cup spins off, the teapot spills, the fence wobbles. That gives every map its own signature reaction without touching physics.
3. **A first-shot tutorial ghost.** On a player's very first shot, animate a hand dragging the cannon with the preview dots, then fade it out. It teaches the new in-world aiming in two seconds.
