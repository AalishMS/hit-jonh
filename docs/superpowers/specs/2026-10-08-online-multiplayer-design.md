# Online Multiplayer — Design

**Date:** 2026-10-08 · **Status:** Revised after third design review; awaiting written-spec approval · **Branch:** `online-multiplayer`

## 1. Intent

The owner asked for an **online multiplayer mode**. It is turn-based and backed by a deliberately small ("weak") database, Convex. This moves "Online play" out of SPEC §4.2 *Deferred* for this feature only. Accounts, matchmaking and leaderboards remain deferred.

**Owner decisions (2026-10-08) [DECIDED]:**

| Topic | Decision |
| --- | --- |
| Who plays | Friends via a **room code** (and a shareable `?room=CODE` link). No public matchmaking, no accounts. |
| Timing | **Live session**: everyone is present and watches each shot. Not asynchronous. |
| Trust | **Trust the shooter's client, with light server validation**: turn order, aim ranges, duplicate/out-of-order submissions and map-impossible outcomes are rejected. The server does not re-simulate physics. |
| Shot sync | **Inputs only**: every client re-simulates each shot locally from angle/power. No ball path is stored. |
| Two-step shots | The angle/power are sent **when the shot is fired**; the outcome is sent **when it lands**. Spectators start watching almost immediately. If the shooter never reports, another player's locally simulated outcome is used. |
| Turn time limit | **Online only:** a connected player has **120 s** to fire, with a visible countdown from 90 s. After that the turn is skipped as a miss. Hot-seat play is unchanged. |
| Deployment | **Out of scope.** Build and test against the Convex dev deployment; the build reads `VITE_CONVEX_URL`. The README documents deployment for later. |

**Success looks like:** 2–4 friends on different devices create or join a room and play a full match (any map selection) with the same rules as local hot-seat. They watch every shot nearly live, recover from a page reload or brief disconnect, never get permanently stuck when someone leaves or goes idle, and can rematch without anyone being dropped by surprise.

**Proposed defaults (not stated by the owner) [PROPOSED]:**
- Online matches use the local multiplayer rules (SPEC §6, §7): 2–4 players, 3 shots per player per round in rotating order, target cycles, scoring, tie-break. The only addition is the turn time limit above.
- Online play never touches solo bests or the Daily Bonk. **Hat unlocks and the shot streak count only the local player's own shots.**
- **Hot-seat local multiplayer is unchanged, including its saved roster.** Online mode never calls `saveMultiplayerSetup` (today called from the shared fire callback, `PrototypeScene.ts:1268`); the online profile is stored separately (§5).

## 2. Cross-browser risk of "inputs only" sync

SPEC §8.3 promises reproducibility only within one build, browser and configuration. Launch velocity uses `Math.cos`/`Math.sin` (`src/sim/units.ts:85`, `src/sim/ballistics.ts:69`). Matter also uses trig internally (`Vertices.js:198`, `Body.js:718`). The ECMAScript spec does not require identical results across engines, and every multiplayer map has a ricochet obstacle where tiny differences grow. Chrome vs Safari divergence is therefore a real possibility.

**Rule [DECIDED]:** the **official outcome is authoritative**. The match score and the result label (e.g. "Body hit +100") come from the server's stored outcome. The animation (flight, contact effects, Jonh's reaction) comes from the local simulation. When the local and official outcomes differ, dev builds log a `console.warn` with the shot's `seq`, the local outcome and the official outcome.

**Verify first:** the first implementation task is a cross-browser check. A dev-only page runs a fixed set of shots headlessly (reference solutions plus ricochet-heavy and grazing shots on every MP map) and prints outcome and landing point per shot. Run it in Chrome, Firefox and Safari (or iOS Safari) and compare.
- **If they match:** proceed as designed.
- **If they diverge:** stop and bring it back to the owner. The fallback is sending a thinned ball path with each outcome, roughly 5–10 KB per shot, well inside Convex's 1 MB document limit. It is documented here and not built unless needed.

## 3. Architecture overview

```text
convex/                        server: schema, functions, scheduled timers, cron (thin handlers)
  schema.ts                    rooms, players, presence, shots
  rooms.ts                     lobby/match mutations, getRoom / getPresence queries
  timers.ts                    internal scheduled mutations: checkTurn, checkInFlight, startRematch
  crons.ts                     hourly cleanup of inactive rooms
src/rules/seededRandom.ts      pure: deterministic integer PRNG (mulberry32)
src/rules/replayMatch.ts       pure: rebuild a MultiplayerMatchMachine from setup + seed + shots
src/rules/onlineRules.ts       pure: validation for every write, turn timing, timer decisions
src/rules/onlineRoster.ts      pure: seats, appearance, lobby pruning, rematch readiness/roster
src/rules/onlineMatch.ts       pure: snapshot → my seat, turn, playback queue, countdowns
src/net/convexClient.ts        creates ConvexClient from VITE_CONVEX_URL (or reports "not configured")
src/net/onlineSession.ts       the only module importing Convex APIs: subscribe, heartbeat, send/retry, token
src/scenes/onlineController.ts glue between session/tracker and PrototypeScene
src/ui/                        Online setup + lobby screens
```

The rules logic exists in one place. The server handlers in `convex/` are thin wrappers: they load rows, call the pure helpers in `src/rules/`, and write the result. Clients use the same helpers to derive state and to fast-forward on join or reload. `src/rules/` and `src/levels/` must stay free of Phaser imports (already required) and must bundle under Convex.

**All timeouts run on the server.** They use Convex's scheduler (`ctx.scheduler.runAfter`), scheduled inside the mutation that starts the waiting period, so a timer exists only if that mutation commits. Scheduled mutations run once, in server time, and are serialised with every other write. Clients have **no** cleanup duties: no designated client, no clock-offset decisions, no races between browsers. Clients only display countdowns, using a clock offset from the heartbeat.

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
| `matchStartedAt` | number | Server ms when the current match started; turn start for `seq 0`. |
| `rematchDeadline` | number \| null | Server ms when the rematch window closes; set by the first Rematch press. |
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
| `left` | boolean | Set by `leaveRoom` during a match or on the result screen. |
| `rematchReady` | boolean | Set by Rematch on the result screen; cleared when a match starts. |

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
| `witnessOutcome` | `ClassifiedOutcome \| null` | First outcome reported by a spectator's local simulation while the shot was still unresolved. |
| `resolution` | `'shooter' \| 'witness' \| 'timeout' \| 'skipped' \| null` | Where the official outcome came from. |
| `firedAt`, `resolvedAt` | number, number \| null | Server ms. `resolvedAt` starts the next turn. |

### Turn lifecycle (server view)

```text
awaiting fire (seat S, seq n) ──fireShot──▶ in flight (outcome null) ──reportOutcome──▶ resolved ──▶ awaiting fire (seq n+1)
        │                                          │
        │ checkTurn timer:                         │ checkInFlight timer (inFlightTimeoutSeconds after fire),
        │  S left / S stale / turn limit           │ or reportWitness after the shooter left:
        ▼                                          ▼
   resolved 'skipped' (miss)                 resolved with witnessOutcome ('witness'), or 'miss' if none ('timeout')
```

A new shot can be fired only once the previous one is resolved. Turn start for seq *n* is the previous shot's `resolvedAt` (or `matchStartedAt` for seq 0).

### Client-callable functions

Every mutation takes the client `token` and authorises by matching it to a `players` row in the room. Match-scoped mutations also take `matchNumber` and reject a stale one (`STALE_MATCH`), so late retries can't land in a rematch.

| Function | Kind | Who | Effect / validation |
| --- | --- | --- | --- |
| `getRoom(code, token)` | query | anyone | Room, players (no tokens), current-match shots, and `you` (caller's seat or `null`). `null` if not found. |
| `getPresence(code)` | query | anyone | `[{ seat, lastSeen }]`. Separate subscription. |
| `createRoom(token, name, color, pattern, maps)` | mutation | anyone | New lobby room with a fresh unique code; caller is seat 0 (host). Returns `code`. |
| `joinRoom(code, token, name, color, pattern)` | mutation | anyone | If the token already has a seat, rejoin it (clear `left` if the match is still running). Otherwise lobby only: prune stale lobby seats, then need a free seat. Errors: `NOT_FOUND`, `FULL`, `ALREADY_STARTED`. |
| `leaveRoom(code, token)` | mutation | member | **Lobby:** delete the row, renumber (new seat 0 is host). **Playing:** set `left`. If it is that seat's turn and the shot isn't fired yet, skip it immediately. **Finished:** set `left`, then re-check rematch readiness. |
| `setMaps(code, token, maps)` | mutation | seat 0, lobby | Validates the map list. |
| `startMatch(code, token)` | mutation | seat 0, lobby | Prunes stale lobby seats; needs ≥ `MULTIPLAYER.minPlayers`. Sets `seed`, `matchStartedAt`, `status='playing'`; schedules `checkTurn` for seq 0. |
| `fireShot(code, token, matchNumber, seq, angle, power)` | mutation | member, playing | Awaiting fire for the caller's seat, `seq === shots.length`, previous shot resolved, aim valid. Inserts with `outcome: null`; schedules `checkInFlight`. |
| `reportOutcome(code, token, matchNumber, seq, outcome)` | mutation | shooter | Shot `seq` is the caller's, still in flight, outcome possible on this map. Resolves it (`'shooter'`). Then either finishes the match or schedules `checkTurn` for `seq+1`. |
| `reportWitness(code, token, matchNumber, seq, outcome)` | mutation | member ≠ shooter | Records `witnessOutcome` if the shot is in flight and has none yet; otherwise a silent no-op. If the shooter has `left`, resolves the shot immediately with it (`'witness'`). |
| `heartbeat(code, token)` | mutation | member | Updates `presence.lastSeen`. **In the lobby it also prunes stale seats** and renumbers, so a vanished host is replaced. Returns server `now` for the client's display clock offset. |
| `requestRematch(code, token, matchNumber)` | mutation | active member, finished | Sets `rematchReady`. If every non-left player is ready, start now. Otherwise, on the first press, set `rematchDeadline = now + rematchWindowSeconds` and schedule `startRematch`. |

### Internal scheduled mutations (`convex/timers.ts`)

All of them first check that the room, `matchNumber` and `seq` still match what they were scheduled for. Otherwise they do nothing.

| Timer | Scheduled by | Behaviour |
| --- | --- | --- |
| `checkTurn(roomId, matchNumber, seq)` | see "Starting a turn" below | If still awaiting fire for `seq`: skip as `'skipped'` miss when the active seat `left`, **or** `now ≥ turnStart + turnLimitSeconds`, **or** presence is stale (`now − lastSeen ≥ staleSeconds`). Otherwise reschedule itself at `min(turnStart + turnLimitSeconds, lastSeen + staleSeconds)`. A skip starts the next turn (or finishes the match). |
| `checkInFlight(roomId, matchNumber, seq)` | `fireShot` | If the shot is still unresolved after `inFlightTimeoutSeconds`, resolve it with `witnessOutcome` (`'witness'`) or `miss` (`'timeout'`). Then continue as after any resolution. |
| `startRematch(roomId, matchNumber)` | first `requestRematch` | At the deadline: if ≥ `minPlayers` are ready, remove every non-ready seat (row + presence), renumber the ready ones, clear readiness, `matchNumber++`, new `seed`, `matchStartedAt`, `status='playing'`, delete the old shots, schedule `checkTurn`. Otherwise clear readiness and `rematchDeadline` (still `finished`; anyone may press again). Maps are kept. |
| cleanup (hourly cron) | `crons.ts` | Deletes rooms (players, presence, shots) whose `updatedAt` is older than `ONLINE.roomTtlHours`. |

Starting a rematch immediately (everyone ready) uses the same code path as `startRematch`.

**Starting a turn** is a shared server helper. It is used by `startMatch`, rematch start, every shot resolution (`reportOutcome`, `reportWitness`, `checkInFlight`) and every skip. It **evaluates `checkTurnDecision` immediately, in the same transaction**. If the new active seat has already left or gone stale, it is skipped at once, and the helper loops to the next turn until it reaches a seat that must be waited for (or the match finishes). Only then does it schedule `checkTurn` at the decision's reschedule time. A player who is already gone is never waited on.

**Presence rows** are created or refreshed (`lastSeen = now`) by `createRoom`, `joinRoom` (new seat **and** rejoin) and `heartbeat`. So a new or returning player is never considered stale on arrival. Stale-seat pruning and `checkTurn` treat a missing presence row as stale; that only happens if a write was lost.

**Idempotency:** `fireShot` and `reportOutcome` return success without writing when the identical write already happened. A different write to the same `seq` returns `CONFLICT` / `NOT_YOUR_TURN`; for example, the shooter's report after a timeout, or a fire after the turn was skipped. `reportWitness`, `requestRematch` and `heartbeat` never fail on repeats or lost races; they are no-ops.

**Other errors** are `ConvexError` with a `code`: `NOT_FOUND`, `FULL`, `ALREADY_STARTED`, `NOT_HOST`, `NOT_YOUR_TURN`, `OUT_OF_ORDER`, `INVALID_AIM`, `IMPOSSIBLE_OUTCOME` (e.g. `ricochet_body` on a map without ricochet surfaces), `STALE_MATCH`, `CONFLICT`.

### Pure shared rules

- **`seededRandom(seed)`** returns a `() => number` in `[0, 1)` using integer-only maths (mulberry32), so it is identical across engines.
- **`replayMatch({ players, maps, seed, shots })`**:
  - Constructs `new MultiplayerMatchMachine(setups, maps, seededRandom(seed))`, with setups ordered by seat and first-shot aim 45°/50% as in `defaultPlayerSetups`.
  - For each resolved shot it calls `startAiming → fire(angle, power) → resolveShot(outcome) → continueFromResult → (nextRound if round_result)`.
  - A trailing in-flight shot stops after `fire`. That gives the server's view, where a shot is in the air.
  - Takes `{ includeInFlight: boolean }`. The **server** passes `true`. **Clients** pass `false`: they rebuild from **resolved shots only** and let normal playback fire any in-flight shot. `MultiCoordinator.fire` works only from `aiming` (`multiCoordinator.ts:17-19`), so a machine left in `simulating` could never launch it.
  - Returns the machine plus `{ awaitingSeat, inFlightSeq, nextSeq, isMatchComplete }`. It throws if a stored shot's seat disagrees with the machine, which would be a server bug.
- **`onlineRules.ts`**: `validateFire`, `validateReport`, `acceptWitness`, `turnStartedAt`, `checkTurnDecision(room, shots, presence, now) → skip | reschedule(at) | none`, `checkInFlightDecision(shot, now) → resolve(outcome, resolution) | none`.
- **`onlineRoster.ts`**: `assignAppearance`, `renumberSeats`, `pruneStaleLobbySeats`, `rematchDecision(players, now, deadline) → startNow | wait | startWith(seats) | reset`.
- Seats that left mid-match stay in that match's machine; their turns are skipped.

## 5. Client architecture

### New modules

- **`src/net/convexClient.ts`**: a `ConvexClient` (`convex/browser`) from `import.meta.env.VITE_CONVEX_URL`. If unset, the Online card shows "Online play isn't configured" and is disabled; nothing else changes.
- **`src/net/onlineSession.ts`**: the only module importing Convex APIs.
  - Token and profile: generated once with `crypto.getRandomValues` and stored in `hitJonh.v1` as an optional `online` field `{ token, profile: { name, color, pattern } }`. A missing or corrupt value is regenerated. This field is separate from the hot-seat roster.
  - Subscribes to `getRoom` and `getPresence` and emits snapshots.
  - Heartbeat every `ONLINE.heartbeatSeconds`, **plus one immediately on `visibilitychange` → visible**. The returned server time maintains a clock offset, used **only for displaying** countdowns.
  - Sends `fireShot` / `reportOutcome` with exponential-backoff retry (`ONLINE.retryDelaysSeconds`), duplicate-safe by idempotency. After the last retry fails it raises a blocking "Couldn't reach the room — Retry" banner.
  - `reportWitness` is sent once, with no retry, and its errors are ignored.
  - Exposes `client.connectionState()` for a "Reconnecting…" banner.
- **`src/rules/onlineMatch.ts`** (pure): an `OnlineMatchTracker` fed with room snapshots, presence and display `now`. It derives:
  - `mySeat`, from the snapshot's `you`. Going from a seat to `null` means:
    - after a rematch: "not included" (§6);
    - in the lobby: pruned while away, so rejoin automatically (§6).
  - `authoritative`, i.e. `replayMatch` over the server shots.
  - The **playback queue**: server shots with `seq ≥ presentedSeq`. In-flight shots are included, so playback starts on fire.
  - **My unfinished shot:** an in-flight shot whose seat is mine but which this page didn't fire, e.g. after a reload or crash. It is played back as **my** shot: re-simulated locally and reported with `reportOutcome`. Same browser and build means the same result.
  - `isMyTurnToAim`: the presentation has caught up and the server is awaiting my seat.
  - Countdowns for display: turn time left (from `turnWarnSeconds`), missing-player skip (from `staleWarnSeconds`), rematch deadline.
  - Rematch detection: `matchNumber` changed, so the presentation must be reset.
- **`src/scenes/onlineController.ts`**: glue that owns the session and tracker and calls scene hooks. It keeps `PrototypeScene` (~1,400 lines) from growing further.

### Scene changes (`PrototypeScene`)

- New `activeMode: 'online'`, reusing `MultiplayerMatchMachine`, `MultiCoordinator`, `PlayerHistory` trails, target cycles and the round/match overlays.
- **Fast-forward** on join, reload or resync: the controller builds the machine with `replayMatch` over **resolved shots only** (`includeInFlight: false`), assigns it to `this.multiMachine`, then calls `loadMultiplayerMap`. Any in-flight shot then enters the playback queue and is fired normally from `aiming`. That already constructs a fresh `MultiCoordinator` from `this.multiMachine` (`PrototypeScene.ts:1265`, as `startMultiplayer` does at :1214), so `MultiCoordinator` needs no change.
- **No hot-seat persistence in online mode:** the `onShotFired` callback skips `saveMultiplayerSetup` when `activeMode === 'online'`.
- **Local shot (my turn, or my unfinished shot after a reload):**
  - Fire launches locally at once and calls `fireShot`; a recovered shot is already fired.
  - At resolution: score locally (optimistic), call `reportOutcome`, record hat/streak progress (own shot).
  - If the server rejects it because the turn was skipped or timed out, show **"Your turn was skipped"** / **"Your shot timed out"** when the local shot ends, then resync.
- **Skipped turn** (`resolution === 'skipped'`, any seat including mine): **nothing is fired or simulated.**
  - Show "{name} was skipped" (or "Your turn was skipped") in the shot-result slot for the normal shot-result window.
  - Advance the local machine without animation: `startAiming → fire(stored aim) → resolveShot('miss')`, plus the attempt-machine reset that `MultiCoordinator` normally does.
  - Then continue to handover or round results as usual. The skipped player's trail and aim are unchanged.
- **Remote shot** (any other resolution, or still in flight):
  - When a shot appears (outcome may still be `null`), load its angle/power and run the normal fire path with input locked.
  - At local resolution: if the official outcome has arrived, score and label with it. Otherwise send `reportWitness` with the local outcome, hold the result label as "…" until the official outcome arrives, and start the auto-advance timer only then.
  - Jonh's reaction comes from the local simulation. No progress or hat recording.
- Spectators: controls inert; status shows "{name} is aiming…" plus the countdown once in the warning window.

### Constants

New `ONLINE` block in `src/config/tuning.ts` [PROPOSED][TUNE], imported by server and client:

| Constant | Value | Purpose |
| --- | --- | --- |
| `heartbeatSeconds` | 15 | Presence check-in interval. |
| `staleWarnSeconds` | 60 | Show "Waiting for {name}…". |
| `staleSeconds` | 90 | Missing-player skip; lobby pruning. Kept above 60 s because Chrome throttles timers in tabs hidden for more than 5 min to about once a minute. |
| `turnWarnSeconds` | 90 | Show the turn countdown. |
| `turnLimitSeconds` | 120 | Turn skipped (owner decision). |
| `inFlightTimeoutSeconds` | 40 | Unfinished-shot fallback. Covers the 15 s shot timeout, the 0.12 s wind-up and the ~15.5 s of retries. Separate from `staleSeconds`; lowering it replaces a briefly offline shooter's real result more often. |
| `rematchWindowSeconds` | 30 | Time for everyone to press Rematch. |
| `roomTtlHours` | 24 | Cleanup age. |
| `codeLength`, `codeAlphabet` | 5, unambiguous | Room codes. |
| `retryDelaysSeconds` | [0.5, 1, 2, 4, 8] | Send retries. |

## 6. Player flow

**Main menu:** a new **Online** card beside Solo and Multiplayer. Local multiplayer is untouched.

**Online setup:** name plus colour/pattern (existing picker), prefilled from the saved online profile. Two actions: **Create room**, and **Join** with a code input (case-insensitive, spaces ignored). Opening `…/?room=CODE` skips to Join with the code filled in.

**Lobby:**
- Large room code, **Copy link**, and up to 4 player rows (colour, pattern, name, connected dot).
- Seat 0 (host) chooses maps with the existing map cards and presses **Start** (enabled at ≥ 2 players). Others see "Waiting for host…". **Leave** is always available.
- If the host leaves, or stops checking in for `staleSeconds`, seats are renumbered on the next heartbeat and the new seat 0 is host.
- **Removed while away:** a player whose phone locked for longer than `staleSeconds` is pruned. When their page notices it is no longer seated in a lobby room, it calls `joinRoom` again with the saved profile and continues silently, possibly in a new seat. If the room has filled up meanwhile, it shows "The room filled up while you were away" and returns to the Online menu. If the match has already started, it shows "That match started without you" and returns to the Online menu.
- Joining a started match is refused with "That match has already started", except when rejoining your own seat.

**Match:**
- Handover overlay: **"Your turn!"** for the local player, **"{name} is up"** otherwise. Same auto-advance timing as local.
- Spectators watch each shot from the moment it is fired. The aiming player's cannon is **not** streamed (no live aim writes).
- **Turn timer:** from 90 s everyone sees "{name}: 30 s left" counting down; the aiming player sees it on their HUD. At 120 s the server skips the turn.
- Pause is local-only and does **not** stop the server's timers. Pausing during your own shot for longer than `inFlightTimeoutSeconds` means another player's result is used ("Your shot timed out"). The pause menu offers **Resume** / **Leave match**. Home also leaves (`leaveRoom`).
- **Missing player:** from `staleWarnSeconds` everyone sees "Waiting for {name}… skipping in Ns"; at `staleSeconds` the server skips. A player who leaves on their turn is skipped immediately.
- **Shooter vanishes mid-flight:** the result label shows "…". After `inFlightTimeoutSeconds` the server uses a spectator's local outcome, or a miss if none was reported. If the shooter explicitly left, the first spectator outcome is used at once.
- **Shooter reloads mid-flight:** their page replays the shot as their own and reports the outcome itself; nobody waits for a timeout.
- Own connection lost: "Reconnecting…" banner; the queue catches up on reconnect.

**End:**
- The existing match result overlay, plus a Rematch row showing who is ready (✓) and, once the first player presses, "Rematch starts in Ns".
- When everyone still in the room is ready, it starts at once. At the deadline it starts with the ready players if there are ≥ 2; otherwise readiness clears and anyone can press again.
- A player not ready at the deadline sees **"You weren't included in the rematch"**, then returns to the Online menu.
- Everyone can **Leave** at any time.

## 7. Error handling

| Situation | Behaviour |
| --- | --- |
| `VITE_CONVEX_URL` unset | Online card disabled with an explanation; the rest of the game is unaffected. |
| Create/join fails (network) | Inline error on the setup screen; the buttons stay usable. |
| `NOT_FOUND` / `FULL` / `ALREADY_STARTED` | Friendly inline messages on the Join screen. |
| Rematch window closes with < 2 ready | Readiness clears; the result screen says "Not enough players — press Rematch to try again". |
| Removed by a rematch | "You weren't included in the rematch" → Online menu. |
| Pruned from the lobby while away | Automatic `joinRoom`. If that fails with `FULL` / `ALREADY_STARTED`: "The room filled up while you were away" / "That match started without you" → Online menu. |
| `fireShot`/`reportOutcome` send failure after all retries | Blocking "Couldn't reach the room — Retry" banner. The server's timers still guarantee others aren't stuck. |
| My fire/report rejected (`NOT_YOUR_TURN`, `CONFLICT`) | "Your turn was skipped" / "Your shot timed out" once the local shot ends, then resync. |
| Other rejection (`OUT_OF_ORDER`, `STALE_MATCH`) | Resync from the server snapshot; dev-build warning. |
| `reportWitness` / `requestRematch` / `heartbeat` errors | Ignored (heartbeat feeds the "Reconnecting…" banner only through the connection state). |
| Room disappears (cleanup, or not found on reload) | "This room has ended" overlay; return to the Online menu. |
| Local vs official outcome mismatch | Official outcome is used; dev-only `console.warn` (§2). |
| Page reload mid-match | `?room=CODE` stays in the URL; the stored token rejoins the seat; fast-forward, then live. My unfinished shot is replayed and reported. |

Pause, the fixed stepper and `AutoAdvance` work as today. Pausing never stops other clients or the server's timers.

**Known limitation [ACCEPTED]:** after a reload or late resync, players' previous-shot trails are empty until they fire again. Restoring them would mean re-simulating every earlier shot.

**Accepted by design:** because the shooter's client reports the outcome, a player who edits the page can claim hits. That is acceptable for friends-only rooms (owner decision, §1).

## 8. Testing

**Automated (Vitest, node, no network):**
- `seededRandom`: same seed gives the same sequence; values lie in `[0, 1)`.
- `replayMatch`: for N = 2, 3, 4 and single-map and tour selections, replaying a list of shots gives the same scores, winners, turn order and position schedule as driving the machine by hand. The same seed gives the same schedule. Skipped shots score 0 and advance the turn. A trailing in-flight shot leaves the machine in `simulating`.
- `onlineRules`:
  - Fire: accept the correct next fire; reject wrong seat, wrong `seq`, previous shot unresolved, out-of-range or non-integer aim, stale `matchNumber`.
  - Report: shooter only; impossible ricochet rejected.
  - Idempotent and conflicting duplicates for fire/report.
  - Witness: first one wins; immediate resolution when the shooter left.
  - `checkTurnDecision`: skip for a left seat, the turn limit, stale presence or a missing presence row; correct reschedule time otherwise; no-op once the turn has moved on.
  - "Starting a turn" loop: consecutive gone seats are all skipped in one call; the loop stops at the first seat that must be waited for, or at match end.
  - `checkInFlightDecision`: witness, else timeout miss; no-op once resolved.
  - Turn start time.
- `onlineRoster`: appearance assignment with clashes; renumbering after leaves (host passes to the new seat 0); stale lobby pruning (including a stale host); `rematchDecision` (all ready → now; deadline with ≥ 2 → start with the ready ones and drop the rest; < 2 → reset; left players excluded).
- `OnlineMatchTracker`:
  - Playback queue order, including in-flight shots.
  - Client rebuild uses resolved shots only, so a queued in-flight shot starts from `aiming` and `MultiCoordinator.canFire()` is true for it.
  - Skipped shots are marked "no animation" and advance the machine to the same state as a played miss.
  - My unfinished shot after a reload is treated as mine.
  - Lobby `you → null` requests an automatic rejoin; rematch `you → null` reports "not included".
  - `isMyTurnToAim` only once caught up.
  - Countdown values.
  - Rematch reset; "not included" detection; fast-forward on join.
- Scene-adjacent rule: online mode never calls `saveMultiplayerSetup`. Covered by a test on the extracted callback decision, or noted as manual if it can't be isolated.
- Room code generator: length, alphabet, no ambiguous characters.
- Storage: the optional `online` field round-trips; a corrupt value is regenerated; existing saves without it still load; the hot-seat roster is untouched by online saves.
- All existing tests stay green (`npm run check`).

**Manual (reported honestly in `docs/progress.md`):**
- The cross-browser check (§2): Chrome vs Firefox vs Safari/iOS Safari.
- Real Convex round trips: two-tab and two-device (LAN) play.
- Reload mid-turn and mid-flight; leave on own turn; stale skip; turn timeout; unfinished-shot timeout with and without a witness.
- Skip-vs-fire race message.
- Background tab (> 5 min hidden).
- Lobby with a vanished host; a player pruned from the lobby who comes back.
- Skipped turns show "{name} was skipped" with no cannon fire.
- Rematch: all ready, partial ready, "not included".
- Cleanup cron.
- Hot-seat roster unchanged after online play.

`convex-test` is not added (YAGNI). Server handlers and timers stay thin over the tested pure helpers.

## 9. Documentation and repo changes

- `SPEC.md`:
  - New §6.1 *Online multiplayer* [DECIDED by owner 2026-10-08] summarising §1, §2, §6 and §7 here, including the online-only turn limit and the rematch window.
  - §4.2 updated: online play via room codes is no longer deferred; accounts, matchmaking and leaderboards still are.
- `README.md`: Convex setup (`npx convex dev`, `.env.local` with `VITE_CONVEX_URL`), and later deployment notes (Convex prod plus any static host).
- `docs/progress.md` and `CHANGELOG.md` updated per milestone.
- `package.json`: `convex` pinned exactly (1.46.0 at time of writing). `tsconfig`/ESLint cover `convex/` and ignore `convex/_generated/`.
- One-time owner step: run `npx convex dev` interactively to create the project. After that, the Convex MCP can inspect tables, run functions and read logs.

## 10. Out of scope

Public matchmaking, accounts, chat, non-player spectators, streaming live aim, server-side physics verification, storing ball paths (unless §2's check fails), asynchronous play and notifications, deployment, mid-match joining of new players, changing maps between rematches, and kicking players.
