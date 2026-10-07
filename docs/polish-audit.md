# Polish audit — 7 October 2026

Baseline: `main` at `7c51661` (Rubber Yard), dev build, headless Chrome 1440×900 plus a 390×844 and 844×390 phone emulation. Screenshots are in `docs/polish/before/`. The impact frame sequence was captured by pausing Phaser's loop and stepping the game manually at exactly 16.667 ms per frame (`docs/polish/before/impact/`), so the timings below are measured, not estimated.

## Verdict

The engineering is careful. The presentation looks like a well-organised prototype: everything is the right shape and nothing is memorable. Nobody would clip this game, because the moment worth clipping barely happens on screen.

## The single worst problem

**The impact (the one moment the game exists for) is almost invisible.**

| Frame | What is on screen |
| --- | --- |
| before (−17 ms) | Ball 10 px from Jonh. Jonh reads his paper. |
| contact (0 ms) | A system-font "BONK!" appears **100 px to the left of Jonh**, overlapping the shed side of the scene. Jonh is drawn in his ordinary idle pose. The ball is drawn on top of his face. There is no flash. |
| +50 ms | Same image (80 ms freeze). The freeze shows a normal pose, so it reads as a frame hitch, not a hit. |
| +150 ms | Jonh is squeezed by about 20%. A ring of 18 dots, each 4 px, starts expanding. The 3 px camera shake is too small to see at 1280 px. |
| +400 ms | **Jonh is upright again with his hat on.** The squash has rebounded, and the tumble has not started yet, because the reaction clock runs in slow motion. The BONK is half faded. |
| +900 ms | Jonh is finally lying on the ground. This is a rigid 90° rotation of the seated drawing that then *swaps* to a different "knocked down" drawing. The hat is a flat ellipse. |

The result is that the strongest pose arrives about a second after contact, after the effects have faded. The first frame after contact, which should be the most extreme, is the most ordinary one. The hit-stop freezes a non-event, and the slow motion delays the payoff rather than savouring it.

## Placeholder and procedural inventory

Everything visual is drawn procedurally with Phaser `Graphics` and redrawn from scratch every frame. There are no image assets.

| Element | How it is built | Problems |
| --- | --- | --- |
| Sky | One flat fill `#d8ebe6` | No gradient, no light, no time of day. All four maps share an identical sky. |
| Clouds | Three groups of three circles | Static. They are the same on every map. |
| Hills/trees | Rows of identical ellipses; two trees mirrored at the edges | They read as wallpaper. There is no parallax or depth layering, because there is one layer. |
| Garden boundary | Pale rectangle with vertical lines | It looks like a placeholder strip. |
| Ground | Two flat rectangles (12 px grass, earth) and some dots | It has no texture, edge or shadow. |
| Shed | Rectangles; the "window" is a sky-coloured rectangle | It is the most finished obstacle, but it is still a box. |
| Fence | A brown 11 px rectangle with lines | It is a bare geometric placeholder. |
| Building (Rooftop) | Grey rectangle with a grid of windows | It is a bare geometric placeholder and looks like an office block. |
| Rubber ceiling / wall | Pink rectangle / plain rectangle | They are bare geometric placeholders, and nothing explains what they are. |
| Jonh | ~250 lines of `fillRoundedRect` calls in four near-duplicate draw functions (idle, hat, overhead, knocked down) | He is 40×90 px, about 7% of the canvas width, and stands rigid and boxy. Reactions are swapped whole drawings, not animated parts, so nothing can ease, overshoot or smear. His face is 32 px wide, so expressions are not readable. |
| Cannon | Rotated rectangle, circle wheel, circle pivot | It has no carriage, so it reads as a stick on a wheel. The player colours (`#ff4444`, `#4444ff`, `#44ff44`, `#ffaa00`) are saturated primaries that clash with the muted garden palette. |
| Ball | 7.5 px circle with a highlight | It is tiny at fixed zoom. It has no motion stretch and no speed trail; only the dotted history trail exists. |
| Trail | Polyline and dots | It is functional. The active trail is the most legible element in the game. |
| Effects | 18 dots, three smoke circles, one flash circle and a Phaser `Text` "BONK!" in `system-ui` | They are under-scaled for the canvas. The label typeface differs from every other piece of type in the game. |
| Speech bubble | White rounded rectangle and triangle | The tail geometry is disconnected, and the text is a bold system font. |

## Audio

Everything is synthesized in `AudioManager` with no samples.

- **Cannon:** a sine sweep from 170 to 35 Hz plus low-passed noise. It is thin, and there is no transient "crack".
- **Body hit:** a triangle sweep from 320 to 90 Hz plus a sine thump. It reads as a toy "boop", not an impact.
- **Ground:** a sine thud and noise.
- **Jonh's yelp:** a sawtooth through three band-passes, cycling through three fixed pitches. It is identifiable as a "voice-ish" sound, and the fixed rotation is audible as a repeat.
- **FAAH:** the same vocal synthesizer with a noise onset.
- **Not present:** music, ambience, UI sounds, pitch randomisation, obstacle- or material-specific sounds (the fence, shed and building all use the generic ground thud), whoosh in flight, and any layering of thump, crack and voice on one frame. The body hit plays two oscillators and the yelp at the same `currentTime`, but there is no high-frequency crack layer.
- **Not verifiable by me:** how any of this actually sounds. I cannot listen. The descriptions above come from the code.

## UI

- **Style:** a generic "friendly SaaS" look. The page uses Trebuchet MS for UI, Impact for the home title, Arial Black for headings and `system-ui` for in-canvas text: four unrelated typefaces. The indigo `#645ee8` accent does not appear anywhere in the game world.
- **Home:** the static SVG illustration is the best-looking screen. It has no motion at all.
- **In game:** the game sits in a card with a *form* underneath it. It has two range sliders, a status banner, four equal-weight buttons (Fire, Aim again, Sound, Pause) and a help line. Fire is barely more prominent than "Sound on". The banner duplicates the map name, which is already shown above it.
- **Results:** a centred modal with ★ glyphs and two buttons. There is no celebration, no stars animating in, no "new best", and nothing to unlock.
- **Transitions:** none. Overlays appear and disappear instantly (`display: flex/none`).
- **Mobile portrait (390×844):** the playfield is 356×156 px, so Jonh is about 13 px tall. Half the screen is empty below the controls.
- **Mobile landscape (844×390):** **the controls are pushed entirely below the fold.** The Fire button, sliders and Pause are not visible without scrolling. The game is effectively unplayable in the natural phone orientation.

## Camera

The camera is fixed for the whole game. Shots that leave the top of the screen are shown as an arrow marker. There is no follow, no framing of the impact and no replay.

## What already works well (keep)

- A deterministic fixed-step stepper; the existing hit-stop correctly scales the time fed to the accumulator, never `dt`.
- Pause, Home, retry and rematch cleanup is careful and centralised (`resetEffects`).
- Reduced motion is plumbed through the effects pipeline.
- The ghost trail and landing label make misses useful.
- The dry dialogue pool is genuinely funny and sets the tone. The art should serve that deadpan.

## Priorities that follow from this audit

1. Make the contact frame the most extreme frame: pose, flash, burst and text all on frame 0, held by hit-stop. Then fly back in slow motion and recover over the following 1.5 s.
2. Make Jonh big enough to read. This means a camera that punches in, plus a character built from parts with a large head and readable face.
3. Give the world depth and light: a parallax sky, hills and garden with small ambient motion. Replace every rectangle obstacle with a drawn prop that matches its collider.
4. Make the controls part of the world: drag on the field with a power meter on the cannon, and a big Fire button where a thumb rests. Fix the landscape-phone layout.
5. Unify the type to one display face and one UI face, matched to the world palette.
