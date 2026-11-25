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
| `glass` / `glassDark` | `#BDE7F5` / `#7FC4E0` | Window panes and breakable glass (translucent fill, paper shine streaks, `glassDark` cel shadow), glass shards. |
| `magic` / `magicDark` / `magicLight` | `#9B6BE0` / `#5E3A9E` / `#E2D2FF` | Portal hoops' swirl and sparkles only (the grape player colour family, so it never reads as bouncy pink). |
| `velvet` / `velvetDark` | `#B8324A` / `#7E1F33` | The magician's tent drapes, stage carpet and the tent's back curtain. |
| `field` / `fieldDark` | `#8FF0FF` / `#2A9CC4` | The scrapyard magnet's field rings, glow and sparks only (electric cyan, a soft dark edge under a bright line). |
| `ice` / `iceDark` / `iceDeep` | `#D3F0FA` / `#8CC6DE` / `#4F86B0` | Frozen Pond: the pond's ice layer (paler and whiter than glass, so it never reads as breakable), its edge line and bubbles, and the dark water under it; ice chips. |
| `snow` / `snowShade` | `#F6FAFD` / `#C9DAE8` | Frozen Pond: snow ground, snow caps, snow puffs and falling flakes, and their cel shadow. |
| `iron` / `brass` | `#3A3F63` / `#F2B33D` | Cannon barrel, cannonball / bands, hub. |
| `jonhShirt` | `#F2643C` | Jonh's cardigan. He is the warmest object in the scene, so he always pops against green and blue. |
| `jonhTrousers` | `#3B4A7A` | |
| `skin` / `skinShade` | `#FFC9A3` / `#F09C78` | |
| `hat` / `hatBand` | `#FFCB45` / `#E2433B` | The straw boater: Jonh's silhouette signature. |
| `pow` | `#FF4B3A` | Comic text fill for top-tier hits, and the danger end of the power meter. |
| `zap` | `#FFE14D` | Impact stars, sparks, mid-tier comic text, the full-power glow. |
| `flash` | `#FFFFFF` | Only for the 1–2 frame impact flash. |

**Cosmetic unlocks** (cannon skins, Jonh outfits) add six tokens to `palette.ts` and nothing else: `coal` / `coalLight` (pirate cannon, tuxedo), `silver` / `silverDark` (moonshot cannon) and `grape` / `grapeDark` (tracksuit). Outfits keep Jonh's silhouette, rig and hat; skins never touch the multiplayer colour band.

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

## Mechanic props (2026-11-24)

- **Breakable glass** looks fragile and see-through: a translucent pane with two or three diagonal paper shine streaks and a 2.6 px ink outline, set in white-painted timber. Brick and timber parts are separate solid colliders, drawn opaque. When a pane breaks it swaps (on that frame) to its smashed texture: only jagged glass teeth where it met the frame, nothing in the middle. Shards fly along the ball's path and fall. Reduced motion keeps the swap and drops the shards.
- **Portal hoops** are a brass ring around a turning purple swirl, with slow twinkling sparkles. The entry hoop is face-on (a circle: anything through the middle disappears). The exit hoop is side-on (squashed along its heading) with a brass chevron pointing the way the ball comes out. A used hoop's swirl dims until the next attempt. Hoops float: no stand is drawn, because nothing that looks solid may lack a collider.
- **Interiors** (greenhouse glass, tent curtain, fishing hut) are flat background with no ink, so they never read as surfaces.
- **Pond ice (2026-11-25)** is drawn as the pond in cross-section: a glossy `ice` layer with paper shine streaks on top of dark `iceDeep` water, a stone kerb at each end, so the landing strip reads against the snow. A skidding ball kicks up `ice` chips; landings on snow and ice throw a white puff instead of dust. The fishing hut is a snow-capped timber roof, a plank back wall and a striped canvas roll-down door whose rolled edge stops a hand's width off the ice: the gap the ball skids through is drawn exactly. Winter gardens have no flowers and a slow background snowfall that stops under reduced motion.

## Skate ramp (2026-11-25) [PROPOSED]

- The **half-pipe** is varnished plywood (`wood` side panel with darker studs, `woodLight` riding skin), drawn from the very arc its collider uses: one SVG arc for the riding face with a heavy ink line, the skin as deep as the collider is thick, and the solid side panel down to the lawn (the space under the curve is closed off by the curve, its deck and the lawn, so it is honest to draw it solid). Steel coping (`ironLight` in ink) sits inside each end face. A `pow` band and a `zap` lightning flash are the skate park's only decoration; both are painted on the panel, not separate props.
- **Jonh's shelter** is a brick side wall and a stone roof slab with gravel on top. The roof's face carries a cream board reading "NO BALL GAMES" in Nunito 900, `pow` red; it is live text so it stays crisp, and it sits inside the slab's collider.
- The deck behind the tall wall is a plywood box with cross-bracing and a plank top flush with the wall's coping.

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

## Wind (2026-11-25) [PROPOSED]

- A windy garden gets a scrubbed pale-blue sky and a **windsock** on a stone-grey pole at the back of the lawn: red and cream stripes, ink outline, brass ring. It points downwind and lifts from limp to flat as the wind grows.
- A "Wind ← 3" caption (Nunito 900, cream fill, thick ink stroke) floats above it so the number reads before the first shot.
- **Streaks** are long, soft, cream strokes with a little curl on the leading end, kept faint (about half opacity) and drifting slowly the way the wind blows. Under reduced motion the sock hangs still and the streaks do not move.
- Nothing wind-related is solid: the pole sits behind the playfield. The only collidable things on a windy map are drawn as ordinary garden furniture (a stone wall, a planter).

## Scrapyard magnet (2026-11-25) [PROPOSED]

- **The electromagnet** is drawn exactly on its collider box, side-on: a squat `iron` drum with rounded corners, a yellow (`hat`) band with diagonal ink hazard stripes, a pale steel (`silver`) face along the bottom with one `paper` shine line, an `ironDark` cel shadow on the right and a small highlight on the upper left, 3 px ink outline.
- It hangs on a **crane cable** (ink under a thin `stoneDark` core) that runs straight up out of shot, and a V of thin **lifting chains** to its top corners with a brass knot. Like the Rubber Yard's chains they are thin and never solid-looking; the crane itself is out of shot (a flat crane silhouette stands in the far background layer, no ink).
- **Field rings** are faint electric cyan (`field` line over a soft `fieldDark` edge): the reach as a dashed ring, the inner ring (full pull) solid, and three rings drifting slowly inwards between them so the field visibly pulls. They sit behind the playfield (over sky and hills, under every solid). As the ball comes near they brighten and the housing glows; in the strong zone a few cyan sparks crackle off its face. Under reduced motion the rings hold still and there are no sparks.
- **Crushed-car stacks** are drawn on their collider box: flattened car bodies in assorted paint (`brick`, `ironLight`, `hat`, `leaf`, `stone`, `jonhTrousers`, never `rubber` pink, which means "bounces"), each with a squashed `glass` window, a crease and two `ironDark` wheels, on an `ironDark` backing with a cel shadow on the right.
- The **scrapyard theme**: a hazy late-afternoon sky, far heaps and a distant crane silhouette, no lollipop trees, and a dusty gravel yard (theme ground colours) that kills a ball's roll.

## Mood references (described, not copied)

- Sunday newspaper strips: flat colour, confident ink lines and onomatopoeia in boxes.
- Saturday-morning slapstick: big squash and stretch, and characters held in the air for a beat before falling.
- British seaside postcards: warm sunlight, deckchairs and a slightly faded palette.
