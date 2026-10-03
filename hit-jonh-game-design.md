# Hit Jonh — Game Design and First Build Plan

**Version:** 0.1  
**Date:** 3 October 2026  
**Platform:** 2D web game  
**Modes:** Single player and local multiplayer on one device  
**Status:** Concept and proposed implementation specification

> Set the angle. Set the power. Hit Jonh. He was just trying to have a normal afternoon.

## 1. Purpose and decision status

This document captures the game concept, the direction developed during brainstorming, and a concrete proposal for making the first playable version. It is a design brief rather than a record of an already implemented game.

### Established concept

- The name is **Hit Jonh**. Preserve the spelling “Jonh” throughout the game.
- Players control cannons and aim at Jonh, who stands away from them.
- The two central inputs are cannon angle and firing power.
- Gravity and physics should feel realistic and consistent.
- The game supports solo play and local multiplayer.
- The tone is humorous.

### Recommended starting decisions

The exact scoring, numerical tuning, round structure, and controls below are proposed defaults. They can change after playtesting without changing the core idea.

- Begin with turn-based multiplayer for two to four people sharing one device.
- Give each player a personal cannon identity and saved settings, but use an equivalent launch position for competitive fairness.
- Keep Jonh stationary during the first version's shots.
- Use one cannonball type and three small maps.
- Combine consistent projectile physics with exaggerated character reactions.
- Add simultaneous firing, indirect-hit puzzles, wind, and additional ammunition only after the basic shot loop is enjoyable.

## 2. Game identity

**Genre:** Physics aiming game with slapstick comedy and local competition.

**Player fantasy:** Make a precise shot, watch an outrageous consequence, and prove you can do it with fewer attempts than your friends.

**Core appeal:** A small adjustment to angle or power produces an understandable change in flight. Even misses are entertaining because Jonh reacts and the environment gives feedback.

**What makes it distinctive:** Jonh is a recurring character who believes he has finally found somewhere peaceful. Each new location gives players a different physical problem to solve and gives Jonh another reason to complain.

The game should be easy to start, satisfying to improve at, and funny to watch over someone else's shoulder. Depth should come from aiming, terrain, and physical interactions rather than a large inventory or upgrade system.

## 3. Design pillars

| Pillar | Design consequence |
| --- | --- |
| Learnable aiming | Identical inputs under identical conditions produce the same projectile flight. |
| Useful misses | Players can see where a shot went and preserve their settings for the next attempt. |
| Physical comedy | Impacts, near misses, props, sound, and Jonh's reactions create the humour. |
| Fair local competition | Players get equivalent opportunities, understandable scoring, and equal shot counts. |
| Quick replay | Restarting an attempt or starting another match requires very little friction. |
| Manageable first release | Perfect one projectile and a few maps before adding a broad feature set. |

## 4. Core gameplay loop

1. **Read the scene.** Locate Jonh, the cannon, terrain, and obstacles.
2. **Aim.** Adjust angle and power using visible controls.
3. **Commit.** Fire once; settings cannot change the projectile after launch.
4. **Watch.** Follow the projectile and any resulting physical interactions.
5. **Resolve.** Determine a hit or miss, display feedback, and play a brief reaction.
6. **Continue.** Retry in solo play, hand over to the next player, or advance to the next map.

The player must be able to distinguish an overshoot, an undershoot, and an obstacle collision. Avoid long result animations that delay the next attempt. Provide a skip or continue action once the outcome is known.

### A representative attempt

Jonh is reading in a garden behind a low fence. A low-powered shot hits the fence. The next shot uses a steeper angle and clears it, but lands short. The player increases power slightly, hits Jonh, and sends his newspaper floating into the air. Jonh says, “I hadn't finished that.”

## 5. Aiming and controls

### Primary controls

| Action | Pointer or touch | Keyboard proposal |
| --- | --- | --- |
| Change angle | Angle slider | Left/right arrows |
| Change power | Power slider | Down/up arrows |
| Fire | Fire button | Space |
| Continue or hand over | Continue button | Enter |
| Pause | Pause button | Escape |

Show the current angle in degrees and power as a percentage. Keep numeric values readable and allow small adjustments. A provisional tuning is one degree per normal angle step and one percentage point per power step; finer adjustment can be added if necessary.

Angle and power ranges should be tuned around the maps. Every map must be solvable within the available range. Do not require players to manipulate physical units such as newtons in the interface.

### Aiming assistance

- Show the cannon barrel's actual orientation.
- Show a short initial-direction guide near the muzzle.
- Preserve the player's latest angle and power.
- Show the player's previous projectile trail and terminal position.
- Display simple results such as “Fence hit,” “Short,” or “Over Jonh” when the classification is unambiguous.

Normal play should not reveal the entire future trajectory. Figuring out the shot is the central challenge. A full trajectory preview can be an optional solo practice aid later.

### Prevent accidental actions

Disable firing while a shot is resolving. Require a fresh key press for the next shot so a held Space key cannot fire for the next player. Ignore gameplay shortcuts while a name field or menu input has focus.

## 6. Physics model

### Physical consistency

Use a coherent world scale measured internally in metres, seconds, and kilograms. Rendering converts world coordinates into pixels; resizing the screen must not change the physical scene.

Use downward gravity of approximately **9.81 m/s²**. The world coordinate convention should be explicit. In the equations below, positive y points upward; a renderer may invert y when drawing to the screen.

For launch speed `v` and angle `θ`:

```text
vx = v × cos(θ)
vy = v × sin(θ)

x(t) = x0 + vx × t
y(t) = y0 + vy × t − 0.5 × g × t²
```

These equations describe unobstructed flight without air resistance. Collision handling and later environmental effects extend that model.

### What “power” means

The visible percentage is a gameplay control mapped to a defined launch impulse. A simple first mapping is:

```text
J = Jmin + p × (Jmax − Jmin), where p is between 0 and 1
launch speed = J / projectile mass
```

Impulse is force accumulated over time. If cannon force is modelled explicitly, use a fixed firing duration so a selected power has an unambiguous effect. Holding the Fire button longer should not secretly change the shot in the first version.

Keep projectile mass constant initially. Introducing different masses later means deciding whether equal displayed power gives equal impulse or equal speed; equal impulse is the natural continuation of this proposal.

### Mass and gravity

Without air resistance, heavier objects do not fall faster merely because they are heavier. Mass affects the speed produced by a given impulse and the outcome of collisions. Drag can distinguish objects of different shape, area, and mass later.

### Simulation stability

- Start with a fixed simulation step of `1/120` second, then validate performance on target devices.
- Decouple physics updates from rendering. Use an accumulator and optional visual interpolation.
- Use swept collision tests, continuous collision detection, or adequate substeps for fast projectiles. A small timestep alone does not guarantee a thin obstacle cannot be skipped.
- Spawn the projectile outside the barrel so it does not immediately collide with its own cannon.
- Pause on a hidden browser tab rather than processing a large backlog on return.
- Treat reproducibility as a goal within a given build and configuration; do not assume bit-identical results across every engine or device without testing.

### Surfaces and collisions

| Surface | Intended behaviour |
| --- | --- |
| Dirt or grass | Low bounce; shots stop relatively quickly. |
| Concrete | Some bounce and predictable deflection. |
| Rubber | Stronger rebound for dedicated puzzle maps. |
| Wood | Solid obstacle in the first release; loose or breakable props later. |
| Glass | Breakable feature for a later release with clear impact feedback. |

Restitution and friction values are tuning parameters. Keep their visual appearance consistent with their behaviour. Do not let an identical-looking fence randomly behave differently on successive attempts.

### End conditions

A shot resolves when a valid hit is registered, the projectile leaves the playable bounds, or relevant moving bodies settle. Add a generous safety timeout for stuck simulations. That timeout must not silently cut off a legitimate long arc or a useful bounce.

### Realistic flight and comic aftermath

Keep aiming and flight grounded in the physical model. Use animation, ragdoll posing, facial expressions, particles, and sound for exaggeration after impact.

If a deliberately amplified launch of Jonh is added for comedy, make it an explicit post-hit effect. Do not secretly alter the incoming trajectory or collision position. Players should be able to trust what they aimed at.

## 7. Hit detection and shot attribution

A direct hit occurs when the projectile contacts Jonh's active body collider. A hat is a separate optional collider and does not count as a body hit unless the projectile subsequently contacts his body.

Use a simple body collider at first. Cosmetic animation must stay sufficiently aligned with it that visible hits feel correct. Later, multiple body parts can support ragdoll reactions without requiring headshot rules.

For the first release, classify outcomes as:

- Direct body hit.
- Body hit after a deliberate surface ricochet.
- Hat-only hit.
- Miss.

Record the outcome once. Multiple collision callbacks must not award repeated points. An ordinary bounce along the ground should not automatically earn a stylish ricochet bonus.

Later indirect-hit levels need shot ownership on activated props. If a cannonball sends a bin into Jonh, that bin's hit belongs to the initiating shot. Simultaneous mode requires an explicit attribution policy before implementation.

## 8. Jonh's character and humour

Jonh is an ordinary, stubborn person attempting ordinary tasks. He is funny because his reactions are disproportionately calm compared with what just happened.

### Personality

- Dry, mildly annoyed, and convinced the next spot will be peaceful.
- Recognisable silhouette, readable expressions, and a distinctive hat or accessory.
- No complicated backstory required.
- More situational comedy than constant text jokes.

### Reaction catalogue

| Event | Example reaction |
| --- | --- |
| Shot passes overhead | Jonh lowers his newspaper and looks toward the cannon. |
| Near miss | His hat spins away; he sighs and retrieves it after resolution. |
| Fence struck | “That was my good fence.” |
| Weak body hit | He tumbles out of his chair. |
| Strong body hit | He slides or tumbles into an environmental prop. |
| Several consecutive misses | “Take your time. Apparently you need it.” |
| New location | “Much quieter here.” |

Use a small reaction pool and avoid repeating the same line on consecutive shots. Randomness can choose cosmetic dialogue, but should not change a shot's collision result.

### Behaviour rules

In the first version, idle movement is cosmetic and Jonh's target collider stays fixed. After a shot, restore the scene before the next competitive attempt.

Later, walking Jonh should follow a visible repeating route with a consistent start state. Do not use unpredictable last-second dodges. Movement should create a timing challenge the player can understand.

Use slapstick presentation: tumbling, hats, dust, bent props, and annoyed expressions. Graphic injury is unnecessary for the intended humour.

## 9. Single-player mode

### First release: solo challenges

- Choose a map and attempt to hit Jonh within three shots.
- Preserve aiming settings and show the previous shot trail.
- End immediately on a valid body hit.
- If three shots are used without a hit, show a short result and offer an immediate retry.
- Record the best successful attempt count locally.

Proposed rating: three stars for a first-shot hit, two for a second-shot hit, and one for a third-shot hit. A ricochet may earn a separate style marker rather than complicating that rating.

Keep all initial maps selectable so learning one map does not block access to the others. No account or server leaderboard is required.

### Practice option

If inexpensive to implement, provide unlimited-shot practice using the same maps and physics. It should not overwrite a challenge result. Full trajectory assistance is a later option, not a requirement for the first build.

## 10. Local multiplayer

### First release: turn-based, shared device

Support two to four players, each with a name, cannon colour or pattern, and personal aiming settings.

**Proposed match format:** Three rounds, using one map per round. Every player gets three shots per round. Players shoot in rotating order rather than using all three shots consecutively. Rotate the starting player between rounds.

The round must finish every player's allocated attempts even if someone hits Jonh on the first shot. This avoids a first-hit rule unfairly ending other players' opportunities.

### Cannon placement and fairness

Each player owns a cannon logically and visually. For the first competitive mode, their cannon occupies the same launch location when active; inactive cannons can appear as decorative slots outside the playfield.

This gives equal physical conditions without requiring several different launch positions to have equal difficulty. Later, visibly separate cannons can use mirrored or otherwise balanced setups.

### Scene state between shots

Reset Jonh, props, and obstacle positions before every competitive attempt. Preserve each player's latest settings and previous trajectory. The map stays the same throughout the round.

Players will learn from one another's shots. That is part of the shared-screen experience. Rotating the opening player helps distribute the disadvantage of shooting without prior information.

### Proposed scoring

| Outcome | Points |
| --- | ---: |
| Body hit | 100 |
| Body hit after a qualifying surface ricochet | 125 total |
| Hat-only hit | 20 |
| Miss | 0 |

Award only the highest applicable outcome for a shot. A hat contact followed by a body hit earns the body result, not both. Do not award near-miss points initially; the objective should remain hitting Jonh.

Highest total wins. Break ties by body-hit count; if still tied, allow a shared win. A later optional tie-breaker can give every tied player one attempt on the same fresh setup and repeat only after everyone has fired.

### Later mode: simultaneous firing

Everyone sets angle and power, locks in, and then all cannons fire together. This creates spectacle and can support projectile interactions.

Shared-screen controls mean this is a lock-in mode, not automatically a secret-aim mode. Before adding it, decide whether projectiles collide with each other, how moving Jonh remains hittable after an early impact, and who owns indirect prop hits. These choices materially affect fairness.

### Later mode: cooperative puzzles

Players coordinate shots to knock props into position or create a chain reaction that reaches Jonh. This requires persistent state between cooperative turns, unlike the competitive reset rule.

## 11. Maps and level design

Every map should have an obvious target, readable obstacles, and at least one verified solution. The player should understand why a shot failed from what happened on screen.

### First three maps

| Map | Scene | Main skill |
| --- | --- | --- |
| Jonh's Backyard | Jonh reads on level ground with no major obstacle. | Learn power, angle, and range. |
| The Fence Dispute | A low fence blocks direct low-angle shots. | Clear an obstacle without overshooting. |
| Rooftop Lunch | Jonh eats on an elevated platform. | Aim at a target at a different height. |

Keep the opening map simple. Each subsequent map should introduce one main complication rather than combining several unfamiliar systems.

### Expansion ideas

- **Bus Stop:** A shelter creates a constrained opening or overhead route.
- **Construction Site:** A loose plank can be knocked into Jonh.
- **The Safe Bunker:** Jonh is behind cover with a visible opening above him.
- **Rubber Yard:** A dedicated ricochet surface enables an unusual angle.
- **Seesaw Incident:** A shot launches a bin that then hits Jonh.
- **Moving Walkway:** Jonh follows a predictable repeating path.

Avoid invisible barriers, tiny unexplained hit windows, and decorative geometry that appears solid but has no collision unless that distinction is visually clear.

## 12. Visual and audio direction

### Visual presentation

A clean, expressive cartoon style suits realistic projectile motion and slapstick reactions. Keep the cannon, cannonball, Jonh, and relevant obstacles recognisable at small sizes.

- Side-view composition with the cannon toward one side and Jonh further away.
- Simple backgrounds that do not compete with the flight path.
- Clear muzzle flash, projectile trail, contact effect, and landing marker.
- Distinct player colours paired with names or patterns.
- A fixed camera for the first three compact maps.
- Later camera tracking only if maps become larger than the viewport.

The art style is a proposed direction; pixel art or hand-drawn art could also work if readability is preserved.

### Audio presentation

Prioritise a few effective sounds: adjusting the cannon, firing, airborne motion, ground impact, body impact, and Jonh's reaction. Surface impacts should sound different where gameplay depends on their material.

Start audio after an intentional user interaction. Provide mute and volume controls. Essential hit feedback should also be visible.

### Feedback restraint

Use brief camera shake or slow motion only when it improves a result. Offer reduced-motion settings. Do not alter simulation timing to create slow motion unless physics advances consistently under the chosen time scale.

## 13. Screens and match flow

### Required screens

1. **Main menu:** Solo, local multiplayer, and settings.
2. **Solo setup:** Select a map and start.
3. **Multiplayer setup:** Choose player count, enter optional names, and start.
4. **Game screen:** Playfield, active player, round/attempt count, angle, power, Fire, and Pause.
5. **Shot result:** Outcome and points where relevant; Continue or Retry.
6. **Match result:** Standings, rematch, and return to menu.

Use default names such as Player 1 so setup never requires typing. A handover message should clearly identify whose turn it is.

### Gameplay state machine

```text
setup → aiming → firing → simulating → result
result → handover/aiming, next round, or match complete
```

Only the aiming state accepts angle/power changes and firing. Pausing freezes simulation and resuming restores the previous state. Restart clears live bodies, trails as appropriate, score events, and pending timers.

## 14. Technical structure

This is an architecture proposal, not a committed framework or physics-library selection. Choose tooling after testing the core shot and collision requirements.

### Runtime

- Browser application with a 2D canvas or equivalent renderer.
- Separate modules for simulation, drawing, input, match rules, and audio.
- Static hosting is sufficient for the initial local-only game.
- No login, backend, online multiplayer, or cloud saves needed initially.
- Local storage can retain settings and solo best results.

### Data model

| Entity | Important fields |
| --- | --- |
| Level | ID, bounds, cannon spawn, Jonh spawn, colliders, materials, scenery. |
| Player | ID, name, visual identity, angle, power, score, hit count, last trail. |
| Shot | Owner, initial inputs, projectile body, elapsed time, trail, outcome. |
| Match | Mode, player order, round, attempt slot, level, state. |
| Physics configuration | Gravity, timestep, mass, power mapping, material properties. |

Keep levels data-driven so adding a fence or moving Jonh does not require rewriting match logic. Save a shot's initial conditions for debugging and future replay support.

### Collision implementation decision

A custom projectile model can be sufficient for basic arcs and static obstacles. If articulated ragdolls, moving props, or chain reactions enter scope, a rigid-body engine becomes more useful. Prototype the needed collisions before committing to a complex integration.

### Responsive behaviour

Rescale the world for different viewport sizes while preserving geometry and physics. Keep controls outside the playfield where they would obstruct aiming. Design for desktop first and make the sliders and buttons usable on touch devices; verify the playable scene remains legible at narrow widths.

## 15. First playable scope

### Include

- One projectile type.
- Angle and power controls with numeric values.
- Consistent gravity and robust collisions.
- Stationary Jonh with a short idle and hit reaction.
- Three maps.
- Solo three-shot challenges.
- Two-to-four-player turn-based matches.
- Personal saved aim settings and previous-shot feedback.
- Clear outcomes, scoring, handover, restart, and rematch.
- Essential sound effects, mute, and reduced motion.

### Defer

- Online multiplayer and accounts.
- Simultaneous firing.
- AI opponents.
- Wind, air drag, and weather.
- Multiple ammunition types.
- Full articulated ragdolls if a simple reaction already sells the impact.
- Destructible terrain and extensive chain reactions.
- Upgrades, shops, battle passes, or persistent economic progression.
- Level editor and global leaderboard.

These are scope boundaries for the initial release, not permanent exclusions.

## 16. Build sequence and acceptance criteria

### Milestone 1 — Prove the shot

Build one flat scene with one cannon, one projectile, and a stationary target. Implement angle, power, gravity, firing, collision, and retry.

**Done when:** Identical shots repeat reliably; high-speed hits register; angle and power changes have understandable effects; viewport resizing does not change flight.

### Milestone 2 — Make hitting Jonh satisfying

Replace the target with Jonh. Add readable impacts, one good hit reaction, near-miss feedback, previous-shot trail, and a short reaction pool.

**Done when:** A hit is immediately obvious and repeated attempts remain enjoyable. A miss gives enough information to make a deliberate adjustment.

### Milestone 3 — Establish solo play and maps

Add the fence and elevated-target maps, three-shot challenges, best results, and map selection.

**Done when:** Every map has a verified solution, its main challenge is readable, and challenge/retry transitions work without reloading the page.

### Milestone 4 — Add local competition

Add player setup, rotating turns, equal attempts, scene reset, scores, standings, and rematch.

**Done when:** Two-to-four-player matches finish correctly; players cannot fire out of turn; no collision is scored twice; rematch starts from a clean state.

### Milestone 5 — Polish and release readiness

Improve sound, responsive layout, keyboard/touch controls, loading, settings, and browser performance.

**Done when:** The game is playable end to end with no developer controls, no broken UI states, and no physics speed changes caused by render frame rate.

Do not set calendar estimates before choosing the implementation stack and seeing how quickly the first physics prototype works.

## 17. Verification and playtesting

### Physics checks

- Compare an unobstructed projectile to the analytic trajectory.
- Verify equal-height range changes appropriately with angle and speed.
- Repeat identical shots and compare their outcomes within a stated tolerance.
- Check fast shots against thin obstacles and Jonh's collider.
- Test elevated targets, ground contacts, and map boundaries.
- Compare outcomes under different render frame rates.
- Verify resize, pause, and background-tab handling.

### Rules and interaction checks

- Every player receives exactly the allocated attempts.
- A body collision awards points only once.
- Hat-only hits and qualifying ricochets are classified correctly.
- Player aim settings remain separate.
- Scene resets restore equal competitive conditions.
- Restart and rematch remove previous simulation state.
- Keyboard shortcuts do not interfere with text fields.

### Playtest questions

- Can a new player explain why their shot missed?
- Do they make deliberate changes or move sliders randomly?
- Is the target too small or power adjustment too sensitive?
- Does watching another player's shot help without making the match trivial?
- Are reaction animations fun initially and tolerable after twenty shots?
- Does each map require a different idea?
- Does the group immediately want a rematch?

Prefer direct observation to assuming that realistic numbers alone create satisfying gameplay.

## 18. Main risks and responses

| Risk | Response |
| --- | --- |
| A solved stationary target becomes repetitive. | Introduce different geometry first, then predictable movement and indirect hits. |
| Physics feels inconsistent. | Keep physical units, fixed updates, robust collisions, and controlled random state. |
| Realistic aiming feels excessively difficult. | Increase target readability, improve feedback, and tune launch range before changing gravity. |
| Players copy the last successful shot. | Rotate opening turns and vary maps; accept learning from opponents as part of local play. |
| Distinct cannon positions create unfair difficulty. | Begin with equivalent launch geometry. |
| Comedy slows every turn. | Keep reactions brief and allow continuation after outcome resolution. |
| Ragdolls consume the project. | Start with a simple body and authored reaction; add articulation only when needed. |
| Too many systems delay the first playable version. | Require each new feature to improve the angle/power/hit loop. |

## 19. Decisions to revisit after the prototype

1. Does angle/power input feel better through sliders, direct barrel dragging, or both?
2. Is three shots per solo challenge enough room to learn each map?
3. Does the proposed scoring encourage accurate hits more than bonus hunting?
4. How much physical exaggeration should Jonh's reaction use?
5. Is an authored tumble sufficient, or does the game need a full ragdoll?
6. Should the first expansion focus on trick-shot puzzles or simultaneous multiplayer?
7. Which visual style is fastest to produce while making Jonh memorable?

The prototype can proceed with the defaults in this document. These questions are playtest decisions rather than blockers.

## 20. Compact project brief

**Hit Jonh** is a humorous 2D browser game where one player or a group sharing a device adjusts a cannon's angle and power to hit an ordinary man trying to enjoy his day. Projectile flight follows consistent gravity and collision rules, while Jonh's reactions deliver slapstick comedy. Players learn through visible misses, saved settings, and previous-shot trails. The first release includes one cannonball, three maps, solo three-shot challenges, and fair turn-based multiplayer for two to four people. Later depth comes from ricochets, indirect physical interactions, predictable target movement, and simultaneous firing.

**First action:** Build the smallest scene in which adjusting angle and power, missing, correcting, and finally hitting Jonh already feels good.
