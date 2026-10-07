# Art direction — "Sunday Funnies"

**One sentence:** a sunny, perfectly ordinary British suburban afternoon, drawn like a Sunday newspaper comic strip, ruined one cannonball at a time.

The comedy is in the *contrast*. The world is calm, soft, warm and still. Jonh is deadpan and unbothered until he is hit. The impact is the loudest, brightest and most graphic thing on screen. Everything else stays quiet so that moment can be loud.

All tokens below live in code at `src/art/palette.ts` (game) and `src/style.css` `:root` (UI). Nothing outside those files may introduce a new colour.

## Palette

| Token | Hex | Use |
| --- | --- | --- |
| `ink` | `#2A1B2E` | Every outline, all text, UI borders. Plum-black, never pure black. |
| `paper` | `#FFF7E6` | Newspaper, speech bubbles, UI panels, highlights. Never pure white, except the 1–2 frame impact flash. |
| `skyTop` → `skyLow` | `#5EC2EC` → `#FFE6AE` | Vertical sky gradient (afternoon haze at the horizon). Maps shift this pair for time of day. |
| `sun` / `sunGlow` | `#FFD34E` / `#FFF0B3` | Sun disc and its slowly turning rays. |
| `hillFar` / `hillMid` | `#A9D9C0` / `#86C873` | Background layers (atmospheric, desaturated toward the sky). |
| `grass` / `grassDark` | `#5DB34B` / `#3E8D3C` | Playfield ground top / cel shadow. |
| `earth` / `earthDark` | `#DC9852` / `#AE6A33` | Soil band under the grass. |
| `wood` / `woodDark` | `#CD7A40` / `#8F4D25` | Shed, fence, chair, cannon carriage. |
| `brick` | `#D9573B` | Roofs, chimney pots, rooftop parapet. |
| `stone` / `stoneDark` | `#C3BDD6` / `#948DAE` | Concrete building, wall (lavender grey, warm in light). |
| `rubber` / `rubberDark` | `#FF6FA0` / `#C93E73` | Bouncy surfaces. Pink means "this bounces"; it is used for nothing else. |
| `iron` / `brass` | `#3A3F63` / `#F2B33D` | Cannon barrel, cannonball / bands, hub. |
| `jonhShirt` | `#F2643C` | Jonh's cardigan. He is the warmest object in the scene, so he always pops against green and blue. |
| `jonhTrousers` | `#3B4A7A` | |
| `skin` / `skinShade` | `#FFC9A3` / `#F09C78` | |
| `hat` / `hatBand` | `#FFCB45` / `#E2433B` | The straw boater: Jonh's silhouette signature. |
| `pow` | `#FF4B3A` | Comic text fill for top-tier hits, and the danger end of the power meter. |
| `zap` | `#FFE14D` | Impact stars, sparks, mid-tier comic text, the full-power glow. |
| `flash` | `#FFFFFF` | Only for the 1–2 frame impact flash. |

**Player colours (multiplayer):** tomato `#FF5A3C`, sky `#3FA7E8`, leaf `#4DBA4F`, grape `#9B6BE0`. Each is always paired with its pattern (solid, stripes, dots, checks), never colour alone.

## Outline rules

Depth is communicated by **how much outline** a thing gets.

| Layer | Outline | Examples |
| --- | --- | --- |
| Foreground / interactive | **3 px `ink`**, round joins and caps (in the 1280×560 logical space) | Jonh, cannon, ball, obstacles, props Jonh owns, comic text, UI cards |
| Midground | **2 px**, the layer's own dark tone (no ink) | Garden hedges, neighbour fences, trees behind the playfield |
| Background | **None**, flat shapes only | Sky, sun, far hills, distant houses, clouds |
| Particles | None (small), except stars and comic shapes (3 px ink) | Dust, sparks, smoke |

Every filled foreground shape gets **one** flat cel shadow (the dark tone of its colour) on the lower right, because the sun is upper left. Round objects get **one** small `paper` highlight on the upper left. There are no gradients on foreground objects. The sky is the only gradient in the game.

## Shape language

- **Jonh is round.** He has a bean-shaped body, a big round head (about 40% of his height) and soft limbs with no hard corners. Round reads as harmless and squashable. He is the victim, not a threat.
- **Hazards are chunky and boxy, but never sharp.** The cannon, shed, fence, wall and building are rectangles with ≥ 4 px corner radius. They are slightly tapered or bevelled so nothing looks like a primitive.
- **Exaggerate proportions about 1.25×** where it helps reading at small size: bigger head, hat brim, cannon muzzle and ball highlight.
- **Every collider is drawn exactly.** Decoration may overhang a collider by ≤ 2 px. The fence, shed, wall, roof and rubber edges sit on the collider edge, so what you see is what the ball hits.
- **Background silhouettes:** gently rolling hills, lollipop trees, terraced houses with chimneys and a church spire. They are low-detail and sit at most 60% of the viewport height, so the flight corridor stays open.

## Typography

| Role | Face | Rules |
| --- | --- | --- |
| Display | **Luckiest Guy** (Apache-2.0) | Titles, comic impact words (BONK! WHAM!), big numbers and score pops. Always uppercase, with a 3–6 px `ink` stroke and a hard 4 px offset shadow in `ink`. |
| UI | **Nunito** 800/900 (OFL) | Buttons, labels, HUD and dialogue. Use sentence case. Use 600 for body copy. Never use below 13 px. |

Both are self-hosted (`public/fonts/`). No other typefaces are allowed. System fonts are only a load-failure fallback.

## Motion principles

1. **Anticipation → action → overshoot → settle.** Pops use ease-out-back. Recoveries use ease-out-elastic or a damped spring. Use linear motion only for constant drift (clouds, sun rays).
2. **The extreme pose comes first.** A reaction starts on its most extreme frame and relaxes from there. Never ease *into* a hit.
3. **Smears and flashes are allowed to be 1–2 frames.** That is the comic-strip equivalent of motion lines.
4. **The world is calm; the impact is loud.** Ambient motion is slow (≥ 4 s cycles) and small (≤ 6 px). Effect intensity is scaled by hit quality, so the full treatment stays special.
5. **Reduced motion** means no shake, flash, slow motion, smears, replay, parallax drift or particles that fly. Poses still change (as cuts), comic text still appears (as a fade), and sound is unchanged.

## Comic language for hits

| Quality | Word pool | Fill | Treatment |
| --- | --- | --- | --- |
| Ricochet body hit | KA-BLAM! · TRICK SHOT! | `pow` + `zap` | Everything, at maximum, plus a replay |
| Strong body hit (≥ 10 m/s) | WHAM! · BONK! · KA-POW! | `pow` | Full |
| Weak body hit | BONK! · THWACK! | `zap` | Full, about 70% |
| Hat only | PLINK! · YOINK! | `paper` | Small: brief freeze, light shake, the hat flies |
| Obstacle / miss | (no text) or a small "THUD" | — | Dust puff only |

## Mood references (described, not copied)

- Sunday newspaper strips: flat colour, confident ink lines and onomatopoeia in boxes.
- Saturday-morning slapstick: big squash and stretch, and characters held in the air for a beat before falling.
- British seaside postcards: warm sunlight, deckchairs and a slightly faded palette.
