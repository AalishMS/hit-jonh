# Online Multiplayer — Design

**Date:** 2026-10-08 · **Status:** Approved in conversation; awaiting written-spec review · **Branch:** `online-multiplayer`

## 1. Intent

The owner asked for an **online multiplayer mode**. It is turn-based and backed by a deliberately small ("weak") database, Convex. This promotes "Online play" out of SPEC §4.2 *Deferred* for this feature only. Accounts, matchmaking and leaderboards remain deferred.

**Owner decisions (2026-10-08) [DECIDED]:**

| Topic | Decision |
| --- | --- |
| Who plays | Friends via a **room code** (and a shareable `?room=CODE` link). No public matchmaking, no accounts. |
| Timing | **Live session**: everyone is present and watches each shot. Not asynchronous. |
| Trust | **Trust the shooter's client, with light server validation**: turn order, aim ranges, duplicate/out-of-order submissions and map-impossible outcomes are rejected. The server does not re-simulate physics. |
| Shot sync | **Inputs only**: the server stores angle/power/outcome. Every client re-simulates the shot locally from angle/power. |
| Deployment | **Out of scope.** Build and test against the Convex dev deployment; the build reads `VITE_CONVEX_URL`. The README documents deployment for later. |

**Success looks like:** 2–4 friends on different devices create/join a room, play a full multiplayer match (any map selection) with the same rules as local hot-seat, see every shot animate, recover from a page reload or brief disconnect, get unstuck when someone leaves, and can rematch.

**Assumptions (not stated by the owner) [PROPOSED]:**
- Online matches use exactly the local multiplayer rules (SPEC §6, §7): 2–4 players, 3 shots per player per round in rotating order, target cycles, scoring, tie-break.
- Online play never touches solo bests or the Daily Bonk. Hat unlocks from online shots behave as they do for local multiplayer shots.
- Hot-seat local multiplayer is unchanged.

## 2. Known consequence of "inputs only" sync

SPEC §8.3 promises reproducibility only within one build, browser and configuration. A spectator's local simulation can therefore, rarely, differ from the shooter's.

**Rule [DECIDED]:** the **shooter's outcome is authoritative**. The match score and the result label (e.g. "Body hit +100") come from the server's stored outcome. The animation (flight, contact effects, Jonh's reaction) comes from the local simulation. When local and official outcomes differ, dev builds log a `console.warn` with the shot's `seq`, the local outcome and the official outcome. Production shows the official label without comment.

## 3. Architecture overview

```text
convex/                      server (Convex functions, schema, cron)
  schema.ts                  rooms, players, shots
  rooms.ts                   getRoom query + lobby/match mutations
  crons.ts                   hourly cleanup of inactive rooms
  lib/                       pure validation helpers (no Convex imports where avoidable)
src/rules/seededRandom.ts    pure: deterministic PRNG from a 32-bit seed
src/rules/replayMatch.ts     pure: rebuild a MultiplayerMatchMachine from setup + seed + shots
src/rules/onlineMatch.ts     pure: snapshot → my seat, turn, playback queue, skip eligibility
src/net/convexClient.ts      creates ConvexClient from VITE_CONVEX_URL (or reports "not configured")
src/net/onlineSession.ts     the only module that talks to Convex: subscribe, heartbeat, submit/retry, token
src/scenes/onlineController.ts  glue between OnlineSession/onlineMatch and PrototypeScene
src/ui/                      Online setup + lobby screens (in MenuOverlay or a sibling module)
```

The rules logic exists in one place. `replayMatch` drives the existing pure `MultiplayerMatchMachine`. The server uses it to validate submissions; clients use it to derive state and to fast-forward on join or reload. `src/rules/` and `src/levels/` must stay free of Phaser imports, which already holds. They must now also bundle cleanly under Convex.

## 4. Data model (Convex)

### Tables

**`rooms`**
| Field | Type | Notes |
| --- | --- | --- |
| `code` | string | 5 chars from an unambiguous alphabet (no `0 O 1 I L`). Unique; indexed `by_code`. |
| `status` | `'lobby' \| 'playing' \| 'finished'` | |
| `hostSeat` | number | Seat index of the host. |
| `maps` | string[] | Non-empty, distinct subset of `MULTIPLAYER.maps`, in play order. |
| `seed` | number | 32-bit seed for the current match's position shuffle. Set at start and rematch. |
| `matchNumber` | number | Starts at 0; incremented on rematch. |
| `updatedAt` | number | Server ms. Bumped by every mutation; drives cleanup. |

**`players`**
| Field | Type | Notes |
| --- | --- | --- |
| `roomId` | Id<'rooms'> | Indexed `by_room`. |
| `seat` | number | 0–3 in join order. In the lobby, seats are renumbered to stay contiguous when someone leaves. From `startMatch` on they are fixed. |
| `name` | string | Sanitized server-side: trimmed, ≤ `MULTIPLAYER.maxNameLength`, fallback "Player N". |
| `color`, `pattern` | number, string | Each is unique within the room. If the requested colour (or pattern) is taken, the server assigns the first free one from `MULTIPLAYER.colors` (or `.patterns`), independently. |
| `token` | string | Client secret (random, ≥ 128 bits). **Never returned by any query.** |
| `lastSeen` | number | Server ms of the last heartbeat or mutation. |
| `left` | boolean | Set by `leaveRoom`. Seats are never deleted mid-match. |

**`shots`**
| Field | Type | Notes |
| --- | --- | --- |
| `roomId`, `matchNumber`, `seq` | | Indexed `by_room_match_seq`. `seq` is 0-based within a match. |
| `seat` | number | Shooter. |
| `angle`, `power` | number | Integers within `AIM` ranges. |
| `outcome` | `ClassifiedOutcome` | `ricochet_body \| body \| hat_only \| miss`. |
| `skipped` | boolean | True for server-recorded skips (outcome `miss`). |

### Functions

All mutations take the client `token` and authorise by matching it to a `players` row in the room.

| Function | Kind | Who | Effect / validation |
| --- | --- | --- | --- |
| `getRoom(code, token)` | query | anyone | Room, players (without tokens), shots for the current `matchNumber`, and `you`: the caller's seat, or `null`. Returns `null` if not found. |
| `createRoom(token, name, color, pattern, maps)` | mutation | anyone | Creates a lobby room with a fresh unique code; caller takes seat 0 and becomes host. Returns `code`. |
| `joinRoom(code, token, name, color, pattern)` | mutation | anyone | If the token already holds a seat, rejoin it (clears `left`, refreshes `lastSeen`). Otherwise, only allowed in `lobby` with fewer than `MULTIPLAYER.maxPlayers` seats. Errors: `NOT_FOUND`, `FULL`, `ALREADY_STARTED`. |
| `leaveRoom(code, token)` | mutation | member | In `playing`/`finished`, sets `left`. In `lobby`, deletes the row, renumbers the remaining seats, and moves host to the new seat 0 if the host left. |
| `setMaps(code, token, maps)` | mutation | host, lobby | Validates the map list. |
| `startMatch(code, token)` | mutation | host, lobby | Needs ≥ `MULTIPLAYER.minPlayers` non-left players. Sets `seed`, `status='playing'`. |
| `submitShot(code, token, seq, angle, power, outcome)` | mutation | member, playing | See validation below. Sets `status='finished'` when the match completes. |
| `skipTurn(code, token, seq)` | mutation | member, playing | Allowed only if the active seat `left`, or its `lastSeen` is older than `ONLINE.staleSeconds`. Records `{ skipped: true, outcome: 'miss' }` with that seat's last aim. |
| `heartbeat(code, token)` | mutation | member | Updates `lastSeen`; returns server `now` (used for clock-offset estimation). |
| `rematch(code, token)` | mutation | host, finished | `matchNumber++`, new `seed`, `status='playing'`. Previous matches' shots are deleted. |
| cleanup | internal mutation + hourly cron | — | Deletes rooms (with their players and shots) whose `updatedAt` is older than `ONLINE.roomTtlHours`. |

**`submitShot` validation:**
1. Rebuild the match with `replayMatch(room, players, shots)`.
2. Idempotency: if a shot with this `seq` already exists from the same seat with identical fields, return success without writing. A different seat or different fields gives `CONFLICT`.
3. `seq === shots.length`, the match is awaiting a shot, and the active seat equals the caller's seat. Otherwise `NOT_YOUR_TURN` / `OUT_OF_ORDER`.
4. `angle`/`power` are integers within `AIM.minAngleDeg..AIM.maxAngleDeg` / `0..100`. Otherwise `INVALID_AIM`.
5. `ricochet_body` only if the current map has a `ricochet: true` obstacle. Otherwise `IMPOSSIBLE_OUTCOME`. (All current MP maps have one; the check stays data-driven.)

Errors are `ConvexError` with a `code` field from the list above. The validation logic lives in pure helpers under `convex/lib/` (or `src/rules/`) so it is unit-testable in Vitest without a Convex runtime.

### Pure shared rules

- **`seededRandom(seed)`** returns a `() => number` in `[0, 1)` (mulberry32). It is deterministic across JS engines because it uses integer maths only.
- **`replayMatch({ players, maps, seed, shots })`** constructs `new MultiplayerMatchMachine(setups, maps, seededRandom(seed))`. For each shot it calls `startAiming → fire(angle, power) → resolveShot(outcome) → continueFromResult → (nextRound if round_result)`. It returns the machine plus a derived summary: `awaitingSeat | null`, `seq`, `isMatchComplete`. If a stored shot disagrees with the machine (wrong seat), it throws, which is a server bug.
- Player setups for the machine come from `players` ordered by seat. The first-shot aim defaults are 45°/50%, as in `defaultPlayerSetups`.
- Seats that left mid-match remain in the machine; their turns are skipped.

## 5. Client architecture

### New modules

- **`src/net/convexClient.ts`**: creates a `ConvexClient` (`convex/browser`) from `import.meta.env.VITE_CONVEX_URL`. If unset, reports "not configured". The Online card then shows "Online play isn't configured" and is disabled; nothing else changes.
- **`src/net/onlineSession.ts`**: the only module importing Convex APIs.
  - Token: generated once with `crypto.getRandomValues` and stored in the `hitJonh.v1` save as an optional `online` field `{ token, profile: { name, color, pattern } }`. A missing or corrupt value is regenerated.
  - Subscribes to `getRoom(code)` and emits room snapshots.
  - Heartbeat every `ONLINE.heartbeatSeconds` while in a room. It uses the returned server time to keep a clock offset, so presence ages are computed in server time.
  - `submitShot` with retry: exponential backoff (0.5 s, 1 s, 2 s, 4 s, 8 s). Duplicate-safe thanks to `seq` idempotency. After the last retry fails, it surfaces an error to the UI ("Couldn't send your shot — Retry").
  - Exposes the connection state (`client.connectionState()`) for a "Reconnecting…" banner.
- **`src/rules/onlineMatch.ts`** (pure, no Convex or Phaser imports): an `OnlineMatchTracker` fed with snapshots. It derives:
  - `mySeat`, from the snapshot's `you` field. The server resolves it from the token, so lobby renumbering is handled.
  - `authoritative`, i.e. `replayMatch` over all server shots.
  - `pendingShots`, i.e. server shots with `seq ≥ presentedSeq` (the playback queue).
  - `isMyTurnToAim`: the presentation has caught up with the server, and the awaiting seat is mine.
  - Skip state: whether the active seat is left or stale, the seconds until a skip, and whether **this** client is the designated skipper (lowest-seated connected, non-active seat).
  - Rematch detection: the `matchNumber` changed, so a reset is needed.
- **`src/scenes/onlineController.ts`**: glue that owns the session and tracker and tells the scene what to do. It keeps `PrototypeScene` from growing further.

### Scene changes (`PrototypeScene`)

- New `activeMode: 'online'`, reusing `MultiplayerMatchMachine`, `MultiCoordinator`, `PlayerHistory` trails, target cycles and the round/match overlays.
- The local presentation machine advances only as shots are shown. On joining or reloading mid-match, it is fast-forwarded with `replayMatch` up to the last fully shown shot (or all server shots, on reload), then continues live.
- **Remote shot hook:** load the shot's angle/power into the cannon, then run the normal fire path with input locked. On resolution, score with the **server's outcome** (§2) and pick the result label from it.
- **Local shot hook:** aiming and Fire are allowed only when `isMyTurnToAim`. On resolution, score locally at once (optimistic) and call `submitShot`. On a non-retryable rejection, rebuild the local machine from the server state.
- Spectators: controls inert; status shows "{name} is aiming…".

### Constants

New `ONLINE` block in `src/config/tuning.ts` [PROPOSED][TUNE]: `heartbeatSeconds: 15`, `staleWarnSeconds: 25`, `staleSeconds: 45`, `roomTtlHours: 24`, `codeLength: 5`, `codeAlphabet`, `submitRetryDelaysSeconds: [0.5, 1, 2, 4, 8]`. Server and client import the same values.

## 6. Player flow

**Main menu:** a new **Online** card beside Solo and Multiplayer. Local multiplayer is untouched.

**Online setup:** name plus colour/pattern (existing picker), prefilled from the saved online profile. Two actions: **Create room**, and **Join** with a code input (case-insensitive, spaces ignored). Opening `…/?room=CODE` skips to Join with the code filled in.

**Lobby:**
- Large room code, **Copy link**, and up to 4 player rows (colour, pattern, name, connected dot).
- The host chooses maps with the existing map cards and presses **Start** (enabled at ≥ 2 players). Others see "Waiting for host…". **Leave** is always available.
- If the host leaves the lobby, the seats are renumbered and host passes to the new seat 0.
- Joining a started match is refused with "That match has already started", except when rejoining your own seat.

**Match:**
- Handover overlay: **"Your turn!"** for the local player, **"{name} is up"** otherwise. Same auto-advance timing as local.
- Spectators watch each shot when it arrives. The aiming player's cannon is **not** streamed (no live aim writes).
- Pause is local-only. The menu offers **Resume** / **Leave match**. Home also leaves (`leaveRoom`).
- Stale active player: after `staleWarnSeconds` everyone sees "Waiting for {name}… skipping in Ns". At `staleSeconds` the designated skipper's client calls `skipTurn` automatically. A player who `left` is skipped immediately, with no countdown.
- Own connection lost: "Reconnecting…" banner. On reconnect the queue catches up.

**End:** the existing match result overlay. The host sees **Rematch** (same maps, new seed). Others see "Waiting for host…". Everyone can **Leave**. A rematch on the server resets every client's presentation to the new match.

## 7. Error handling

| Situation | Behaviour |
| --- | --- |
| `VITE_CONVEX_URL` unset | Online card disabled with an explanation; the rest of the game is unaffected. |
| Create/join fails (network) | Inline error on the setup screen; the buttons stay usable. |
| `NOT_FOUND` / `FULL` / `ALREADY_STARTED` | Friendly inline messages on the Join screen. |
| `submitShot` network failure | Backoff retries, then a blocking "Couldn't send your shot — Retry" banner. The turn does not advance for anyone until the shot is accepted. |
| `submitShot` rejected (`NOT_YOUR_TURN`, `OUT_OF_ORDER`, `CONFLICT`) | Rebuild local state from the server snapshot and continue. A dev-build warning is logged. |
| Room disappears (cleanup, or not found on reload) | "This room has ended" overlay; return to the Online menu. |
| Local/official outcome mismatch | Official outcome is used; dev-only `console.warn` (§2). |
| Page reload mid-match | `?room=CODE` stays in the URL; the token in storage rejoins the seat; fast-forward, then live. |

Pause, the fixed stepper and `AutoAdvance` work as today. Pausing never affects other clients.

## 8. Testing

**Automated (Vitest, node, no network):**
- `seededRandom`: same seed gives the same sequence; values lie in `[0, 1)`.
- `replayMatch`: for N = 2, 3, 4 and single-map and tour selections, replaying a list of shots gives the same scores, winners, turn order and position schedule as driving the machine by hand. The same seed gives the same position schedule. Skipped shots score 0 and advance the turn.
- Shot validation helpers: accept the correct next shot; reject wrong seat, wrong `seq`, out-of-range or non-integer aim, impossible ricochet; idempotent duplicate; conflicting duplicate.
- `OnlineMatchTracker`: playback queue order; `isMyTurnToAim` only once caught up; skip eligibility and designated-skipper selection (lowest connected non-active seat; left seats skipped immediately; clock-offset handling); rematch resets; fast-forward on join.
- Room code generator: length, alphabet, no ambiguous characters.
- Storage: the optional `online` field round-trips; a corrupt value is regenerated; existing saves without it still load.
- All existing tests stay green (`npm run check`).

**Not automated (manual, reported honestly):** real Convex round trips, two-tab and two-device (LAN) play, reload/rejoin, leave/skip, rematch and the cleanup cron. These are recorded as a scripted walkthrough in `docs/progress.md`, with what was and wasn't verified. `convex-test` is not added (YAGNI). Server handlers stay thin over the tested pure helpers.

## 9. Documentation and repo changes

- `SPEC.md`: new §6.1 *Online multiplayer* [DECIDED by owner 2026-10-08] summarising §1–§2, §6 and §7 of this doc; §4.2 updated so online play via room codes is no longer deferred (accounts, matchmaking and leaderboards still are).
- `README.md`: Convex setup (`npx convex dev`, `.env.local` with `VITE_CONVEX_URL`), and later deployment notes (Convex prod plus any static host).
- `docs/progress.md` and `CHANGELOG.md` updated per milestone.
- `package.json`: `convex` pinned exactly (1.46.0 at time of writing). `tsconfig`/ESLint cover `convex/` and ignore `convex/_generated/`.
- One-time owner step: run `npx convex dev` interactively to create the project. After that, the Convex MCP can be used to inspect tables, run functions and read logs.

## 10. Out of scope

Public matchmaking, accounts, chat, spectators who aren't players, streaming live aim, server-side physics verification, asynchronous play and notifications, deployment, mid-match joining of new players, and per-turn time limits for a *connected* player.
