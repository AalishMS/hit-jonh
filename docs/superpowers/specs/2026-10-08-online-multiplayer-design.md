# Online Multiplayer — Design

**Date:** 2026-10-08 · **Status:** Revised after design review; awaiting written-spec approval · **Branch:** `online-multiplayer`

## 1. Intent

The owner asked for an **online multiplayer mode**. It is turn-based and backed by a deliberately small ("weak") database, Convex. This moves "Online play" out of SPEC §4.2 *Deferred* for this feature only. Accounts, matchmaking and leaderboards remain deferred.

**Owner decisions (2026-10-08) [DECIDED]:**

| Topic | Decision |
| --- | --- |
| Who plays | Friends via a **room code** (and a shareable `?room=CODE` link). No public matchmaking, no accounts. |
| Timing | **Live session**: everyone is present and watches each shot. Not asynchronous. |
| Trust | **Trust the shooter's client, with light server validation**: turn order, aim ranges, duplicate/out-of-order submissions and map-impossible outcomes are rejected. The server does not re-simulate physics. |
| Shot sync | **Inputs only**: every client re-simulates each shot locally from angle/power. No ball path is stored. |
| Two-step shots | The angle/power are sent **when the shot is fired**; the outcome is sent **when it lands**. Spectators start watching almost immediately. |
| Turn time limit | **Online only:** a connected player has **120 s** to fire, with a visible countdown from 90 s. After that the turn is skipped as a miss. Hot-seat play is unchanged. |
| Deployment | **Out of scope.** Build and test against the Convex dev deployment; the build reads `VITE_CONVEX_URL`. The README documents deployment for later. |

**Success looks like:** 2–4 friends on different devices create or join a room and play a full match (any map selection) with the same rules as local hot-seat. They watch every shot nearly live, recover from a page reload or brief disconnect, never get permanently stuck when someone leaves or goes idle, and can rematch.

**Proposed defaults (not stated by the owner) [PROPOSED]:**
- Online matches use the local multiplayer rules (SPEC §6, §7): 2–4 players, 3 shots per player per round in rotating order, target cycles, scoring, tie-break. The only addition is the turn time limit above.
- Online play never touches solo bests or the Daily Bonk. **Hat unlocks and the shot streak count only the local player's own shots.**
- Hot-seat local multiplayer is unchanged.

## 2. Cross-browser risk of "inputs only" sync

SPEC §8.3 promises reproducibility only within one build, browser and configuration. Launch velocity uses `Math.cos`/`Math.sin` (`src/sim/units.ts:85`, `src/sim/ballistics.ts:69`). Matter also uses trig internally (`Vertices.js:198`, `Body.js:718`). The ECMAScript spec does not require identical results across engines, and every multiplayer map has a ricochet obstacle where tiny differences grow. Chrome vs Safari divergence is therefore a real possibility, not a rare edge case.

**Rule [DECIDED]:** the **shooter's outcome is authoritative**. The match score and the result label (e.g. "Body hit +100") come from the server's stored outcome. The animation (flight, contact effects, Jonh's reaction) comes from the local simulation. When the local and official outcomes differ, dev builds log a `console.warn` with the shot's `seq`, the local outcome and the official outcome.

**Verify first:** the first implementation task is a cross-browser check. A dev-only page runs a fixed set of shots headlessly (reference solutions plus ricochet-heavy and grazing shots on every MP map) and prints outcome and landing point per shot. Run it in Chrome, Firefox and Safari (or iOS Safari) and compare.
- **If they match:** proceed as designed.
- **If they diverge:** stop and bring it back to the owner. The fallback is sending a thinned ball path with each outcome, roughly 5–10 KB per shot, well inside Convex's 1 MB document limit. It is documented here and not built unless needed.

## 3. Architecture overview

```text
convex/                        server: schema, functions, cron (thin handlers)
  schema.ts                    rooms, players, presence, shots
  rooms.ts                     lobby + match mutations, getRoom / getPresence queries
  crons.ts                     hourly cleanup of inactive rooms
src/rules/seededRandom.ts      pure: deterministic integer PRNG (mulberry32)
src/rules/replayMatch.ts       pure: rebuild a MultiplayerMatchMachine from setup + seed + shots
src/rules/onlineRules.ts       pure: fire/report/skip/resolve validation, turn timing
src/rules/onlineRoster.ts      pure: seat renumbering, appearance assignment, stale pruning, rematch roster
src/rules/onlineMatch.ts       pure: snapshot → my seat, turn, playback queue, skip/timeout duties
src/net/convexClient.ts        creates ConvexClient from VITE_CONVEX_URL (or reports "not configured")
src/net/onlineSession.ts       the only module importing Convex APIs: subscribe, heartbeat, send/retry, token
src/scenes/onlineController.ts glue between session/tracker and PrototypeScene
src/ui/                        Online setup + lobby screens
```

The rules logic exists in one place. The server handlers in `convex/` are thin wrappers: they load rows, call the pure helpers in `src/rules/`, and write the result. Clients use the same helpers to derive state and to fast-forward on join or reload. `src/rules/` and `src/levels/` must stay free of Phaser imports (already required) and must bundle under Convex.

## 4. Data model (Convex)

### Tables

**`rooms`**
| Field | Type | Notes |
| --- | --- | --- |
| `code` | string | 5 chars from an unambiguous alphabet (no `0 O 1 I L`). Unique; indexed `by_code`. |
| `status` | `'lobby' \| 'playing' \| 'finished'` | |
| `maps` | string[] | Non-empty, distinct subset of `MULTIPLAYER.maps`, in play order. |
| `seed` | number | 32-bit seed for the current match's position shuffle. Set at start and rematch. |
| `matchNumber` | number | Starts at 0; incremented on rematch. |
| `matchStartedAt` | number | Server ms when the current match started; the turn timer for `seq 0`. |
| `updatedAt` | number | Server ms of the last **game action** (not heartbeats); drives cleanup. |

The host is always **seat 0** and matters only in the lobby (`setMaps`, `startMatch`). There is no `hostSeat` field.

**`players`**
| Field | Type | Notes |
| --- | --- | --- |
| `roomId` | Id<'rooms'> | Indexed `by_room`. |
| `seat` | number | 0–3. Kept contiguous in the lobby and at rematch (renumbered in join order). **Fixed for the duration of a match.** |
| `name` | string | Sanitized server-side: trimmed, ≤ `MULTIPLAYER.maxNameLength`, fallback "Player N". |
| `color`, `pattern` | number, string | Each is unique within the room. If the requested colour (or pattern) is taken, the first free one from `MULTIPLAYER.colors` (or `.patterns`) is assigned, independently. |
| `token` | string | Client secret (random, ≥ 128 bits). **Never returned by any query.** |
| `left` | boolean | Set by `leaveRoom` during a match. |

**`presence`** (kept separate so heartbeats never re-run `getRoom` or keep a room alive)
| Field | Type | Notes |
| --- | --- | --- |
| `roomId`, `playerId` | Ids | Indexed `by_room`, `by_player`. |
| `lastSeen` | number | Server ms of the last heartbeat. |

**`shots`**
| Field | Type | Notes |
| --- | --- | --- |
| `roomId`, `matchNumber`, `seq` | | Indexed `by_room_match_seq`. `seq` is 0-based within a match. |
| `seat` | number | Shooter. |
| `angle`, `power` | number | Integers within `AIM` ranges. |
| `outcome` | `ClassifiedOutcome \| null` | `null` while the shot is in flight; `ricochet_body \| body \| hat_only \| miss` once resolved. |
| `resolution` | `'shooter' \| 'fallback' \| 'skipped' \| null` | Who supplied the outcome. |
| `firedAt`, `resolvedAt` | number, number \| null | Server ms. `resolvedAt` starts the next turn's timer. |

### Turn lifecycle (server view)

```text
awaiting fire (seat S, seq n) ──fireShot──▶ in flight (outcome null) ──reportOutcome──▶ resolved ──▶ awaiting fire (next seat, seq n+1)
        │                                          │
        ├─skipTurn (S left / S stale / turn limit) ├─resolveStale (shooter left or in flight > staleSeconds)
        ▼                                          ▼
   resolved as 'skipped' miss                 resolved with designated client's local outcome ('fallback')
```

A new shot can be fired only once the previous one is resolved. The turn timer for seq *n* starts at the previous shot's `resolvedAt` (or `matchStartedAt` for seq 0).

### Functions

Every mutation takes the client `token` and authorises by matching it to a `players` row in the room. Match-scoped mutations also take `matchNumber` and reject a stale one (`STALE_MATCH`), so late retries can't land in a rematch.

| Function | Kind | Who | Effect / validation |
| --- | --- | --- | --- |
| `getRoom(code, token)` | query | anyone | Room, players (no tokens), current-match shots, and `you` (caller's seat or `null`). `null` if not found. |
| `getPresence(code)` | query | anyone | `[{ seat, lastSeen }]`. Separate subscription. |
| `createRoom(token, name, color, pattern, maps)` | mutation | anyone | New lobby room with a fresh unique code; caller is seat 0 (host). Returns `code`. |
| `joinRoom(code, token, name, color, pattern)` | mutation | anyone | If the token already has a seat, rejoin it (clear `left`). Otherwise lobby only: first **prunes stale lobby seats** (no heartbeat for `staleSeconds`), then needs a free seat. Errors: `NOT_FOUND`, `FULL`, `ALREADY_STARTED`. |
| `leaveRoom(code, token)` | mutation | member | Lobby: delete the row, renumber the seats (new seat 0 becomes host). Playing/finished: set `left`. |
| `setMaps(code, token, maps)` | mutation | seat 0, lobby | Validates the map list. |
| `startMatch(code, token)` | mutation | seat 0, lobby | Prunes stale lobby seats; needs ≥ `MULTIPLAYER.minPlayers`. Sets `seed`, `matchStartedAt`, `status='playing'`. |
| `fireShot(code, token, matchNumber, seq, angle, power)` | mutation | member, playing | Awaiting fire for the caller's seat, `seq === shots.length`, previous shot resolved, aim valid. Inserts with `outcome: null`. |
| `reportOutcome(code, token, matchNumber, seq, outcome)` | mutation | shooter | Shot `seq` is this caller's, in flight, outcome possible on this map. Sets the outcome. When the match completes, `status='finished'`. |
| `resolveStale(code, token, matchNumber, seq, outcome)` | mutation | member ≠ shooter | Shot in flight **and** (shooter `left`, or `now − firedAt > staleSeconds`). Sets the outcome with `resolution: 'fallback'`. |
| `skipTurn(code, token, matchNumber, seq)` | mutation | member ≠ active | Awaiting fire **and** (active seat `left`, or presence stale > `staleSeconds`, or `now − turnStart > turnLimitSeconds`). Inserts a resolved `miss` with `resolution: 'skipped'` and the seat's last aim. |
| `heartbeat(code, token)` | mutation | member | Updates `presence.lastSeen` only; returns server `now` for clock-offset estimation. |
| `rematch(code, token, matchNumber)` | mutation | **any active member**, finished | Applies only if `matchNumber` matches (so simultaneous presses are harmless). Roster: drop seats that `left` or are stale; renumber; need ≥ `minPlayers`. Then `matchNumber++`, new `seed`, `matchStartedAt`, `status='playing'`; delete the previous match's shots. Maps are kept. |
| cleanup | internal mutation + hourly cron | — | Deletes rooms (players, presence, shots) whose `updatedAt` is older than `ONLINE.roomTtlHours`. |

**Idempotency:** `fireShot`, `reportOutcome` and `resolveStale` return success without writing when the identical write already happened. A different write to the same `seq` (e.g. the shooter's late report after a fallback, or a fire after the turn was skipped) returns `CONFLICT` / `NOT_YOUR_TURN`. The client turns that into a user-visible message (§7).

**Other errors** are `ConvexError` with a `code`: `NOT_FOUND`, `FULL`, `ALREADY_STARTED`, `NOT_HOST`, `NOT_YOUR_TURN`, `OUT_OF_ORDER`, `INVALID_AIM`, `IMPOSSIBLE_OUTCOME` (e.g. `ricochet_body` on a map without ricochet surfaces), `NOT_ALLOWED_YET` (skip/fallback before its time), `STALE_MATCH`, `CONFLICT`.

### Pure shared rules

- **`seededRandom(seed)`** returns a `() => number` in `[0, 1)` using integer-only maths (mulberry32), so it is identical across engines.
- **`replayMatch({ players, maps, seed, shots })`**:
  - Constructs `new MultiplayerMatchMachine(setups, maps, seededRandom(seed))`, with setups ordered by seat and first-shot aim 45°/50% as in `defaultPlayerSetups`.
  - For each resolved shot it calls `startAiming → fire(angle, power) → resolveShot(outcome) → continueFromResult → (nextRound if round_result)`.
  - A trailing in-flight shot stops after `fire`.
  - Returns the machine plus `{ awaitingSeat, inFlightSeq, nextSeq, isMatchComplete }`. It throws if a stored shot's seat disagrees with the machine, which would be a server bug.
- **`onlineRules.ts`**: `validateFire`, `validateReport`, `validateResolveStale`, `validateSkip` (each returns `ok` or an error code given room, players, presence, shots and `now`), plus `turnStartedAt(room, shots)`.
- **`onlineRoster.ts`**: `assignAppearance`, `renumberSeats`, `pruneStaleLobbySeats`, `rematchRoster`.
- Seats that left mid-match stay in that match's machine; their turns are skipped.

## 5. Client architecture

### New modules

- **`src/net/convexClient.ts`**: a `ConvexClient` (`convex/browser`) from `import.meta.env.VITE_CONVEX_URL`. If unset, the Online card shows "Online play isn't configured" and is disabled; nothing else changes.
- **`src/net/onlineSession.ts`**: the only module importing Convex APIs.
  - Token: generated once with `crypto.getRandomValues` and stored in `hitJonh.v1` as an optional `online` field `{ token, profile: { name, color, pattern } }`. A missing or corrupt value is regenerated.
  - Subscribes to `getRoom` and `getPresence` and emits snapshots.
  - Heartbeat every `ONLINE.heartbeatSeconds`, **plus one immediately on `visibilitychange` → visible**. The returned server time maintains a clock offset, so presence ages, turn countdowns and skip deadlines are all computed in server time.
  - Sends `fireShot` / `reportOutcome` with exponential-backoff retry (`ONLINE.retryDelaysSeconds`), duplicate-safe by idempotency. After the last retry fails it raises a blocking "Couldn't reach the room — Retry" banner.
  - Exposes `client.connectionState()` for a "Reconnecting…" banner.
- **`src/rules/onlineMatch.ts`** (pure): an `OnlineMatchTracker` fed with room snapshots, presence and server-time `now`. It derives:
  - `mySeat`, from the snapshot's `you`.
  - `authoritative`, i.e. `replayMatch` over the server shots.
  - The **playback queue**: server shots with `seq ≥ presentedSeq`. In-flight shots are included, so playback starts on fire.
  - `isMyTurnToAim`: the presentation has caught up and the server is awaiting my seat.
  - Turn countdown: seconds left of `turnLimitSeconds`, shown from `turnWarnSeconds`.
  - **Duties for this client:** whether it is the designated client (lowest-seated connected seat that isn't the active/shooting seat), and therefore should call `skipTurn` or `resolveStale` now.
  - Rematch detection: `matchNumber` changed, so the presentation must be reset.
- **`src/scenes/onlineController.ts`**: glue that owns the session and tracker and calls scene hooks. It keeps `PrototypeScene` (~1,400 lines) from growing further.

### Scene changes (`PrototypeScene`)

- New `activeMode: 'online'`, reusing `MultiplayerMatchMachine`, `MultiCoordinator`, `PlayerHistory` trails, target cycles and the round/match overlays.
- **Fast-forward** on join, reload or resync: the controller builds the machine with `replayMatch`, assigns it to `this.multiMachine`, then calls `loadMultiplayerMap`. That already constructs a fresh `MultiCoordinator` from `this.multiMachine` (`PrototypeScene.ts:1265`, as `startMultiplayer` does at :1214), so `MultiCoordinator` needs no change.
- **Local shot (my turn):**
  - Fire launches locally at once and calls `fireShot`.
  - At resolution: score locally (optimistic), call `reportOutcome`, record hat/streak progress (own shot).
  - If `fireShot` or `reportOutcome` is rejected because the turn was skipped or a fallback won, show **"Your turn was skipped"** (or "Your shot timed out") when the local shot ends, then resync from the server.
- **Remote shot:**
  - When a shot appears (outcome may still be `null`), load its angle/power and run the normal fire path with input locked.
  - At local resolution: if the official outcome has arrived, score and label with it. Otherwise hold the result label as "…" until it arrives, and start the auto-advance timer only once it is known.
  - Jonh's reaction comes from the local simulation. No progress or hat recording.
- Spectators: controls inert; status shows "{name} is aiming…" plus the countdown once in the warning window.

### Constants

New `ONLINE` block in `src/config/tuning.ts` [PROPOSED][TUNE], imported by server and client: `heartbeatSeconds: 15`, `staleWarnSeconds: 60`, `staleSeconds: 90`, `turnWarnSeconds: 90`, `turnLimitSeconds: 120`, `roomTtlHours: 24`, `codeLength: 5`, `codeAlphabet`, `retryDelaysSeconds: [0.5, 1, 2, 4, 8]`.

`staleSeconds` is deliberately above 60 s. Chrome throttles chained timers in tabs hidden for more than 5 minutes to about once a minute, so a 45 s limit would wrongly skip a player in a background tab.

## 6. Player flow

**Main menu:** a new **Online** card beside Solo and Multiplayer. Local multiplayer is untouched.

**Online setup:** name plus colour/pattern (existing picker), prefilled from the saved online profile. Two actions: **Create room**, and **Join** with a code input (case-insensitive, spaces ignored). Opening `…/?room=CODE` skips to Join with the code filled in.

**Lobby:**
- Large room code, **Copy link**, and up to 4 player rows (colour, pattern, name, connected dot).
- Seat 0 (host) chooses maps with the existing map cards and presses **Start** (enabled at ≥ 2 players). Others see "Waiting for host…". **Leave** is always available.
- If the host leaves, the seats are renumbered and the new seat 0 is host.
- Disconnected players are pruned automatically when someone joins or the host starts, so ghosts can't fill the room.
- Joining a started match is refused with "That match has already started", except when rejoining your own seat.

**Match:**
- Handover overlay: **"Your turn!"** for the local player, **"{name} is up"** otherwise. Same auto-advance timing as local.
- Spectators watch each shot from the moment it is fired. The aiming player's cannon is **not** streamed (no live aim writes).
- **Turn timer:** from `turnWarnSeconds` (90 s) everyone sees "{name}: 30 s left" counting down. The aiming player sees it on their HUD. At 120 s the designated client calls `skipTurn`.
- Pause is local-only and does **not** stop the turn timer. The pause menu offers **Resume** / **Leave match**. Home also leaves (`leaveRoom`).
- **Missing player:** from `staleWarnSeconds`, everyone sees "Waiting for {name}… skipping in Ns". At `staleSeconds` the designated client skips automatically. A player who left is skipped immediately.
- **Shooter vanishes mid-flight:** after `staleSeconds` (or immediately if they left), the designated client reports its own local outcome (`resolveStale`).
- Own connection lost: "Reconnecting…" banner; the queue catches up on reconnect.

**End:** the existing match result overlay. **Any active player** can press **Rematch**: same maps, new seed, players who left or went stale removed, needs ≥ 2. Everyone can **Leave**. A rematch resets every client's presentation to the new match.

## 7. Error handling

| Situation | Behaviour |
| --- | --- |
| `VITE_CONVEX_URL` unset | Online card disabled with an explanation; the rest of the game is unaffected. |
| Create/join fails (network) | Inline error on the setup screen; the buttons stay usable. |
| `NOT_FOUND` / `FULL` / `ALREADY_STARTED` | Friendly inline messages on the Join screen. |
| Rematch fails (fewer than 2 active) | "Not enough players for a rematch" on the result screen. |
| Send failure after all retries | Blocking "Couldn't reach the room — Retry" banner. Nobody's turn advances until it is accepted or the timeout/fallback rules resolve it. |
| My fire/report rejected (`NOT_YOUR_TURN`, `CONFLICT`) | "Your turn was skipped" / "Your shot timed out" once the local shot ends, then resync. |
| Other rejection (`OUT_OF_ORDER`, `STALE_MATCH`) | Resync from the server snapshot; dev-build warning. |
| Room disappears (cleanup, or not found on reload) | "This room has ended" overlay; return to the Online menu. |
| Local vs official outcome mismatch | Official outcome is used; dev-only `console.warn` (§2). |
| Page reload mid-match | `?room=CODE` stays in the URL; the stored token rejoins the seat; fast-forward, then live. |

Pause, the fixed stepper and `AutoAdvance` work as today. Pausing never affects other clients.

**Known limitation [ACCEPTED]:** after a reload or late resync, players' previous-shot trails are empty until they fire again. Restoring them would mean re-simulating every earlier shot.

**Accepted by design:** because the shooter's client reports the outcome, a player who edits the page can claim hits. That is acceptable for friends-only rooms (owner decision, §1).

## 8. Testing

**Automated (Vitest, node, no network):**
- `seededRandom`: same seed gives the same sequence; values lie in `[0, 1)`.
- `replayMatch`: for N = 2, 3, 4 and single-map and tour selections, replaying a list of shots gives the same scores, winners, turn order and position schedule as driving the machine by hand. The same seed gives the same schedule. Skipped shots score 0 and advance the turn. A trailing in-flight shot leaves the machine in `simulating`.
- `onlineRules`:
  - Fire: accept the correct next fire; reject wrong seat, wrong `seq`, previous shot unresolved, out-of-range or non-integer aim, stale `matchNumber`.
  - Report: shooter only; impossible ricochet rejected.
  - Fallback: allowed only after `staleSeconds` or when the shooter left.
  - Skip: allowed only for a left seat, stale presence or turn limit, and never for the active seat itself.
  - Idempotent duplicates and conflicting duplicates for every write.
  - Turn start time.
- `onlineRoster`: appearance assignment with clashes; renumbering after leaves (host passes to the new seat 0); stale lobby pruning; rematch roster drops left/stale seats and enforces the minimum.
- `OnlineMatchTracker`:
  - Playback queue order, including in-flight shots.
  - `isMyTurnToAim` only once caught up.
  - Countdown values.
  - Designated-client selection and duties, with clock offset.
  - Rematch reset; fast-forward on join.
- Room code generator: length, alphabet, no ambiguous characters.
- Storage: the optional `online` field round-trips; a corrupt value is regenerated; existing saves without it still load.
- All existing tests stay green (`npm run check`).

**Manual (reported honestly in `docs/progress.md`):**
- The cross-browser check (§2): Chrome vs Firefox vs Safari/iOS Safari.
- Real Convex round trips: two-tab and two-device (LAN) play.
- Reload/rejoin; leave and stale skips; turn timeout; mid-flight fallback; skip-vs-fire race message.
- Background-tab survival (> 5 min hidden).
- Rematch, and the cleanup cron.

`convex-test` is not added (YAGNI). Server handlers stay thin over the tested pure helpers.

## 9. Documentation and repo changes

- `SPEC.md`:
  - New §6.1 *Online multiplayer* [DECIDED by owner 2026-10-08] summarising §1, §2, §6 and §7 here, including the online-only turn limit.
  - §4.2 updated: online play via room codes is no longer deferred; accounts, matchmaking and leaderboards still are.
- `README.md`: Convex setup (`npx convex dev`, `.env.local` with `VITE_CONVEX_URL`), and later deployment notes (Convex prod plus any static host).
- `docs/progress.md` and `CHANGELOG.md` updated per milestone.
- `package.json`: `convex` pinned exactly (1.46.0 at time of writing). `tsconfig`/ESLint cover `convex/` and ignore `convex/_generated/`.
- One-time owner step: run `npx convex dev` interactively to create the project. After that, the Convex MCP can inspect tables, run functions and read logs.

## 10. Out of scope

Public matchmaking, accounts, chat, non-player spectators, streaming live aim, server-side physics verification, storing ball paths (unless §2's check fails), asynchronous play and notifications, deployment, mid-match joining of new players, changing maps between rematches, and kicking players.
