# Online Multiplayer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a live, turn-based online mode where 2–4 friends join a room by code and play a normal multiplayer match, with Convex as the only backend.

**Architecture:**
- Convex stores facts only: rooms, seats, presence and a list of shots. The existing pure `MultiplayerMatchMachine` is replayed over those shots, by the server to validate and by every client to present.
- Shots are sent in two steps (fire, then outcome). Each client re-simulates locally, and the official outcome comes from the shooter.
- Every timeout (turn limit, missing player, unfinished shot, rematch window) runs on the server via the Convex scheduler.
- A new `OnlineController` glues the session, the pure tracker and `PrototypeScene` together. The scene only gains a few hooks.

**Tech Stack:** TypeScript 6.0.3 (strict), Phaser 4.2.1 + Matter, Vite 8, Vitest 5, Convex 1.46.0 (`convex/browser` client, `convex/server` functions).

**Spec:** `docs/superpowers/specs/2026-10-08-online-multiplayer-design.md`. Read it before starting any task. `SPEC.md` and `AGENTS.md` remain binding.

## Global Constraints

- Spell the name **Jonh**. Never edit `hit-jonh-game-design.md`.
- `src/sim/`, `src/rules/`, `src/levels/` must not import Phaser. `src/rules/` files must also not import Convex. They are bundled into Convex functions.
- Matter is stepped only by `FixedStepper`; nothing in this plan changes physics or `dt`.
- Tuning numbers go in `src/config/tuning.ts` (`ONLINE` block); never inline in scenes or Convex handlers.
- Deps are exact-pinned: `convex@1.46.0`. No other new dependencies (no `convex-test`).
- TypeScript stays 6.0.x. Root `tsconfig.json` options (`exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`) apply to `convex/` too.
- Hot-seat multiplayer behaviour and its saved roster (`lastMP`) must not change.
- Online timings: heartbeat 15 s, stale warn 60 s, stale 90 s, turn warn 90 s, turn limit 120 s, unfinished shot 40 s, rematch window 30 s, room TTL 24 h, retries `[0.5, 1, 2, 4, 8]` s.
- Room codes: 5 chars from `ABCDEFGHJKMNPQRSTUVWXYZ23456789` (no `0 O 1 I L`).
- The official outcome (server) always drives score and label. Local simulation drives only animation.
- Run `npm run check` before every commit. Commit small. Never force-push. Never claim something was tested if it wasn't.
- Update `docs/progress.md` at the end (Task 15).

## Decisions made while planning (deviations from the spec, flagged for the owner)

1. **Per-tab player token.** The spec (§5) stores the token in `hitJonh.v1`, i.e. localStorage. That makes every tab of one browser the **same** player, so the spec's own manual "two-tab" test could never seat two players. This plan instead:
   - keeps the token in **sessionStorage** (`hitJonh.v1.onlineToken`), so a reload keeps the seat and each new tab is a new player;
   - keeps the name/colour/pattern profile in `hitJonh.v1.online`.
2. **No new `activeMode`.** The scene keeps `activeMode === 'multi'` and checks `this.online?.inMatch` instead of adding `'online'`. A new mode would have to be threaded through every existing `'multi'` branch and `SessionCoordinator.canPause`'s type for no behavioural gain.
3. **Extra error codes:** `NOT_MEMBER`, `NOT_ENOUGH_PLAYERS` and `INVALID_MAPS`.
4. **Stale rematch timers are ignored.** `startRematch` carries the deadline it was scheduled for and does nothing if the room's `rematchDeadline` has changed since.
5. **Reload detection without stored state.** On reload, `getRoom(code, token).you` decides whether to rejoin silently. No `lastRoom` is stored.

## Review Focus

1. **Two tabs in one browser** must be two different players, and reloading a tab must keep its seat. Test in Task 6 (`onlineToken` per store).
2. **Typed room codes** with lowercase, spaces, dashes or look-alike characters (`0`, `O`, `1`, `I`, `L`) must be normalised or rejected with a clear message before any server call. Test in Task 2 (`normalizeRoomCode`).
3. **Input on someone else's turn:** Fire, Space, arrow keys or dragging during another player's turn, or while this client is still catching up on shots, must do nothing. Test in Task 10 (`isMyTurnToAim`).
4. **A shot that arrives while paused,** with a menu open or mid-handover, must wait and then play exactly once. Test in Task 10 (`nextPlayback` stable until `markPresented`).
5. **Duplicate snapshots:** the same snapshot delivered twice, or presence-only updates, must never rebuild the match twice or replay a shot. Test in Task 10 (`update` idempotency).

---

### Task 1: Cross-browser determinism check (GATE)

Spec §2 "Verify first". This task builds a headless shot runner and a dev-only page. **The owner must run the page in Chrome, Firefox and Safari before Task 7 starts.**

**Files:**
- Create: `src/physics/headlessShot.ts`
- Create: `src/dev/crossCheck.ts`
- Create: `src/dev/crossCheckPage.ts`
- Create: `crosscheck.html` (repo root; dev server only, not part of the build input)
- Test: `tests/headlessShot.test.ts`

**Interfaces:**
- Produces: `runHeadlessShot(level: LevelData, angleDeg: number, powerPercent: number): HeadlessShotResult` where `HeadlessShotResult = { outcome: ClassifiedOutcome; endXSim: number; endYSim: number; steps: number }`.
- Produces: `buildCrossCheckShots(): CrossCheckShot[]`, `runCrossCheck(shots): CrossCheckReport`, `fnv1a(text: string): string`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/headlessShot.test.ts
import { describe, expect, it } from 'vitest';
import { MULTIPLAYER } from '../src/config/tuning';
import { MAPS } from '../src/levels';
import { levelAtMultiplayerPosition } from '../src/levels/multiplayerPositions';
import { runHeadlessShot } from '../src/physics/headlessShot';
import { buildCrossCheckShots, fnv1a, runCrossCheck } from '../src/dev/crossCheck';

describe('headless shot runner', () => {
  for (const mapId of MULTIPLAYER.maps) {
    const base = MAPS.find(m => m.id === mapId)!;
    for (const position of base.multiplayerPositions!) {
      it(`${mapId}/${position.id} reference solutions hit Jonh`, () => {
        const level = levelAtMultiplayerPosition(base, position.id);
        for (const ref of position.referenceSolutions) {
          const result = runHeadlessShot(level, ref.angleDeg, ref.powerPercent);
          expect(['body', 'ricochet_body']).toContain(result.outcome);
        }
      });
    }
  }

  it('is deterministic within one engine', () => {
    const level = MAPS.find(m => m.id === 'fence')!;
    expect(runHeadlessShot(level, 41, 83)).toEqual(runHeadlessShot(level, 41, 83));
  });
});

describe('cross-check report', () => {
  it('hashes with 32-bit FNV-1a', () => {
    expect(fnv1a('')).toBe('811c9dc5');
    expect(fnv1a('a')).toBe('e40c292c');
  });

  it('covers every MP position with references plus a 10 x 7 grid', () => {
    const expected = MULTIPLAYER.maps.reduce((sum, id) => {
      const base = MAPS.find(m => m.id === id)!;
      return sum + base.multiplayerPositions!.reduce((s, p) => s + p.referenceSolutions.length + 70, 0);
    }, 0);
    expect(buildCrossCheckShots()).toHaveLength(expected);
  });

  it('produces stable digests for the same shots', () => {
    const shots = buildCrossCheckShots().slice(0, 12);
    const a = runCrossCheck(shots);
    const b = runCrossCheck(shots);
    expect(a.outcomeDigest).toBe(b.outcomeDigest);
    expect(a.exactDigest).toBe(b.exactDigest);
    expect(a.count).toBe(12);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run tests/headlessShot.test.ts`
Expected: FAIL, "Failed to resolve import ../src/physics/headlessShot".

- [ ] **Step 3: Implement the runner.** It mirrors the scene's fire → step → resolve → classify path (`PrototypeScene.update` and `handleResolution`) and the existing `tests/multiplayerPositions.test.ts` helper.

```ts
// src/physics/headlessShot.ts
import Matter from '@matter-js';
import { AIM, PHYSICS, PROJECTILE, SHOT, WORLD } from '../config/tuning';
import type { LevelData } from '../levels/types';
import { ShotAttemptMachine } from '../rules/shotAttempt';
import { ShotClassifier, type ClassifiedOutcome } from '../sim/classification';
import { launchVelocityToWorld, matterGravityY, metresToPixels, powerToLaunchSpeed, simYToWorldY } from '../sim/units';
import { MatterAdapter } from './matterAdapter';

export interface HeadlessShotResult {
  outcome: ClassifiedOutcome;
  endXSim: number;
  endYSim: number;
  steps: number;
}

/** Runs one shot with real Matter and no rendering, classified exactly as the scene does. */
export function runHeadlessShot(level: LevelData, angleDeg: number, powerPercent: number): HeadlessShotResult {
  const ppm = WORLD.pixelsPerMetre;
  const engine = Matter.Engine.create({
    gravity: { x: 0, y: matterGravityY(PHYSICS.gravity, ppm, PHYSICS.matterGravityScale), scale: PHYSICS.matterGravityScale },
  });
  const adapter = new MatterAdapter(engine.world, ppm, WORLD.designHeightPx);
  adapter.setupLevel(level);
  const angle = angleDeg * Math.PI / 180;
  const offset = AIM.barrelLengthMetres + PROJECTILE.radiusMetres + AIM.muzzleGapMetres;
  adapter.spawnProjectile(
    metresToPixels(level.cannonSpawn.x + offset * Math.cos(angle), ppm),
    simYToWorldY(level.cannonSpawn.y + offset * Math.sin(angle), WORLD.designHeightPx, ppm),
    PROJECTILE.radiusMetres * ppm,
    launchVelocityToWorld(powerToLaunchSpeed(powerPercent, AIM.minImpulseNs, AIM.maxImpulseNs, PROJECTILE.massKg), angleDeg, ppm),
  );
  const attempt = new ShotAttemptMachine(level.bounds.maxX, SHOT.settledSpeedMs,
    SHOT.settledSeconds, SHOT.timeoutSeconds, SHOT.boundsMarginMetres);
  attempt.fire(angleDeg, powerPercent);
  const classifier = new ShotClassifier();
  const maxSteps = Math.ceil(SHOT.timeoutSeconds / PHYSICS.fixedStepSeconds) + 1;
  for (let step = 1; step <= maxSteps; step++) {
    Matter.Engine.update(engine, PHYSICS.fixedStepSeconds * 1000);
    const state = adapter.stepProjectile(level, PROJECTILE.radiusMetres);
    if (!state) break;
    const result = attempt.step(PHYSICS.fixedStepSeconds, {
      x: state.xSim, y: state.ySim, speed: state.speedMs, hitBody: state.hitJonh, hitHat: state.hitHat,
    });
    if (!result.resolved) continue;
    for (const obs of state.obstacleContacts) classifier.recordContact({ role: 'obstacle', id: obs.id, ricochet: obs.ricochet });
    if (state.hitGround) classifier.recordContact({ role: 'ground' });
    if (state.hitHat || result.hadHatHit) classifier.recordContact({ role: 'jonhHat' });
    if (state.hitJonh) classifier.recordContact({ role: 'jonhBody' });
    if (state.passedOverhead) classifier.recordOverhead();
    return { outcome: classifier.classify(true).outcome, endXSim: state.xSim, endYSim: state.ySim, steps: step };
  }
  return { outcome: 'miss', endXSim: Number.NaN, endYSim: Number.NaN, steps: maxSteps };
}
```

If TypeScript rejects `result.hadHatHit` or the `recordContact` literal shapes, open `src/rules/shotAttempt.ts` and `src/sim/classification.ts` (`ContactEvent`). Match the exact names; `PrototypeScene.handleResolution` (lines ~738-747) uses the same calls.

- [ ] **Step 4: Implement the report builder**

```ts
// src/dev/crossCheck.ts
import { MULTIPLAYER } from '../config/tuning';
import { MAPS } from '../levels';
import { levelAtMultiplayerPosition } from '../levels/multiplayerPositions';
import type { LevelData } from '../levels/types';
import { runHeadlessShot } from '../physics/headlessShot';
import type { ClassifiedOutcome } from '../sim/classification';

export interface CrossCheckShot { id: string; level: LevelData; angle: number; power: number }

export interface CrossCheckReport {
  count: number;
  /** Same value in two browsers ⇒ every shot scored the same. */
  outcomeDigest: string;
  /** Same value ⇒ even the end positions are bit-identical. */
  exactDigest: string;
  counts: Record<ClassifiedOutcome, number>;
  lines: string[];
}

/** Reference shots plus an angle/power grid on every multiplayer target position. */
export function buildCrossCheckShots(): CrossCheckShot[] {
  const shots: CrossCheckShot[] = [];
  for (const mapId of MULTIPLAYER.maps) {
    const base = MAPS.find(m => m.id === mapId)!;
    for (const position of base.multiplayerPositions ?? []) {
      const level = levelAtMultiplayerPosition(base, position.id);
      const add = (angle: number, power: number) => shots.push({ id: `${mapId}/${position.id} ${angle}/${power}`, level, angle, power });
      for (const ref of position.referenceSolutions) add(ref.angleDeg, ref.powerPercent);
      for (let angle = 20; angle <= 83; angle += 7) {
        for (let power = 40; power <= 100; power += 10) add(angle, power);
      }
    }
  }
  return shots;
}

export function fnv1a(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

export function runCrossCheck(shots: readonly CrossCheckShot[]): CrossCheckReport {
  const counts: Record<ClassifiedOutcome, number> = { ricochet_body: 0, body: 0, hat_only: 0, miss: 0 };
  const outcomeLines: string[] = [];
  const lines: string[] = [];
  for (const shot of shots) {
    const r = runHeadlessShot(shot.level, shot.angle, shot.power);
    counts[r.outcome]++;
    outcomeLines.push(`${shot.id}:${r.outcome}`);
    lines.push(`${shot.id} → ${r.outcome} @ ${String(r.endXSim)}, ${String(r.endYSim)} (${r.steps} steps)`);
  }
  return {
    count: shots.length,
    outcomeDigest: fnv1a(outcomeLines.join('\n')),
    exactDigest: fnv1a(lines.join('\n')),
    counts,
    lines,
  };
}
```

- [ ] **Step 5: Run the test and confirm it passes**

Run: `npx vitest run tests/headlessShot.test.ts`
Expected: PASS (5+ tests). If a reference solution reports `hat_only`/`miss`, the runner diverges from the scene: compare it with `tests/multiplayerPositions.test.ts` `hitsBody` before changing anything else.

- [ ] **Step 6: Add the dev page**

```html
<!-- crosscheck.html -->
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Hit Jonh cross-browser check</title>
  </head>
  <body style="font-family: system-ui, sans-serif; margin: 16px;">
    <h1>Cross-browser shot check</h1>
    <p>Open this page in each browser and compare the two digests. Same <b>outcome digest</b> means every shot scores the same.</p>
    <pre id="out">Running…</pre>
    <script type="module" src="/src/dev/crossCheckPage.ts"></script>
  </body>
</html>
```

```ts
// src/dev/crossCheckPage.ts
import { buildCrossCheckShots, runCrossCheck } from './crossCheck';

const out = document.getElementById('out')!;
// Let "Running…" paint before the synchronous run.
setTimeout(() => {
  const started = performance.now();
  const report = runCrossCheck(buildCrossCheckShots());
  out.textContent = [
    `Browser: ${navigator.userAgent}`,
    `Shots: ${report.count}`,
    `Outcome digest: ${report.outcomeDigest}`,
    `Exact digest:   ${report.exactDigest}`,
    `Outcomes: ${JSON.stringify(report.counts)}`,
    `Time: ${Math.round(performance.now() - started)} ms`,
    '',
    ...report.lines,
  ].join('\n');
}, 50);
```

- [ ] **Step 7: Check, then commit**

Run: `npm run check` then `npm run build`
Expected: both pass. The build output does not contain `crosscheck` (it is not a build input).

```bash
git add src/physics/headlessShot.ts src/dev/crossCheck.ts src/dev/crossCheckPage.ts crosscheck.html tests/headlessShot.test.ts
git commit -m "feat(online): headless shot runner and cross-browser determinism check page"
```

- [ ] **Step 8: GATE — owner runs the page in three browsers**

Run `npm run dev -- --host`, then open `http://<LAN-IP>:5173/crosscheck.html` in Chrome, Firefox and Safari (iOS Safari counts). Record each browser's two digests in `docs/progress.md`.
- **Outcome digests all equal:** continue with Task 2. Exact-digest differences are informational only.
- **Outcome digests differ:** **STOP.** Report the differing lines (diff the shot lists) to the owner. The spec's fallback (send a thinned ball path) is an owner decision, and this plan does not cover it.

---

### Task 2: Online constants, shared types, seeded random, room codes

**Files:**
- Modify: `src/config/tuning.ts` (append `ONLINE`)
- Create: `src/rules/onlineTypes.ts`
- Create: `src/rules/seededRandom.ts`
- Create: `src/rules/roomCode.ts`
- Create: `src/rules/playerName.ts`
- Modify: `src/storage/storage.ts` (re-export `sanitizePlayerName` from `rules/playerName`)
- Test: `tests/onlineBasics.test.ts`

**Interfaces:**
- Produces: `ONLINE` constants (names exactly as in the code below).
- Produces types: `RoomStatus`, `Resolution`, `OnlineErrorCode`, `RoomState`, `SeatState`, `ShotRecord`, `PresenceEntry`, `MatchView`, `RoomSnapshot`.
- Produces: `seededRandom(seed: number): () => number`, `generateRoomCode(random: () => number): string`, `normalizeRoomCode(input: string): string | null`, `sanitizePlayerName(raw: unknown, index: number): string`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/onlineBasics.test.ts
import { describe, expect, it } from 'vitest';
import { ONLINE } from '../src/config/tuning';
import { seededRandom } from '../src/rules/seededRandom';
import { generateRoomCode, normalizeRoomCode } from '../src/rules/roomCode';
import { sanitizePlayerName } from '../src/storage/storage';

describe('seededRandom', () => {
  it('repeats the same sequence for the same seed and stays in [0, 1)', () => {
    const a = seededRandom(1234);
    const b = seededRandom(1234);
    const values = Array.from({ length: 200 }, () => a());
    expect(values).toEqual(Array.from({ length: 200 }, () => b()));
    for (const v of values) { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThan(1); }
  });

  it('differs between seeds', () => {
    expect(seededRandom(1)()).not.toBe(seededRandom(2)());
  });
});

describe('room codes', () => {
  it('uses an alphabet without look-alike characters', () => {
    for (const ch of '0O1IL') expect(ONLINE.codeAlphabet).not.toContain(ch);
  });

  it('generates codes of the configured length from the alphabet', () => {
    expect(generateRoomCode(() => 0)).toBe('AAAAA');
    expect(generateRoomCode(() => 0.999999)).toBe('99999');
    const code = generateRoomCode(Math.random);
    expect(code).toHaveLength(ONLINE.codeLength);
    for (const ch of code) expect(ONLINE.codeAlphabet).toContain(ch);
  });

  it('normalises case, spaces and dashes', () => {
    expect(normalizeRoomCode(' k7q px ')).toBe('K7QPX');
    expect(normalizeRoomCode('k7q-px')).toBe('K7QPX');
  });

  it('rejects wrong lengths and look-alike characters', () => {
    expect(normalizeRoomCode('K7QP')).toBeNull();
    expect(normalizeRoomCode('K7QPXX')).toBeNull();
    expect(normalizeRoomCode('K0QPX')).toBeNull();
    expect(normalizeRoomCode('KOQPX')).toBeNull();
    expect(normalizeRoomCode('')).toBeNull();
  });
});

describe('sanitizePlayerName (moved to rules)', () => {
  it('still trims, caps and falls back', () => {
    expect(sanitizePlayerName('  Ann  ', 0)).toBe('Ann');
    expect(sanitizePlayerName('', 2)).toBe('Player 3');
    expect(sanitizePlayerName(42, 1)).toBe('Player 2');
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run tests/onlineBasics.test.ts`
Expected: FAIL, "ONLINE is not exported" / missing modules.

- [ ] **Step 3: Append the constants to `src/config/tuning.ts`**

```ts
/**
 * Online multiplayer (spec 2026-10-08). PROPOSED/TUNE except turnLimitSeconds (owner decision).
 * Imported by both the browser and the Convex functions.
 */
export const ONLINE = {
  /** Presence check-in interval. */
  heartbeatSeconds: 15,
  /** Show "Waiting for {name}…" once the active player is this quiet. */
  staleWarnSeconds: 60,
  /** Missing-player skip and lobby pruning. Above 60 s: Chrome throttles hidden-tab timers to ~1/min. */
  staleSeconds: 90,
  /** Show the turn countdown from here. */
  turnWarnSeconds: 90,
  /** A connected player's turn is skipped after this (owner decision). */
  turnLimitSeconds: 120,
  /** An unreported shot falls back to a spectator's outcome (or a miss) after this. */
  inFlightTimeoutSeconds: 40,
  /** Time for everyone to press Rematch after the first press. */
  rematchWindowSeconds: 30,
  /** Rooms with no game action for this long are deleted. */
  roomTtlHours: 24,
  codeLength: 5,
  /** No 0, O, 1, I or L. */
  codeAlphabet: 'ABCDEFGHJKMNPQRSTUVWXYZ23456789',
  /** Delays between send retries; 15.5 s in total. */
  retryDelaysSeconds: [0.5, 1, 2, 4, 8],
} as const;
```

- [ ] **Step 4: Create the shared types**

```ts
// src/rules/onlineTypes.ts
import type { ClassifiedOutcome } from '../sim/classification';

export type RoomStatus = 'lobby' | 'playing' | 'finished';
export type Resolution = 'shooter' | 'witness' | 'timeout' | 'skipped';

export type OnlineErrorCode =
  | 'NOT_FOUND' | 'NOT_MEMBER' | 'FULL' | 'ALREADY_STARTED' | 'NOT_HOST' | 'NOT_ENOUGH_PLAYERS'
  | 'INVALID_MAPS' | 'NOT_YOUR_TURN' | 'OUT_OF_ORDER' | 'INVALID_AIM' | 'IMPOSSIBLE_OUTCOME'
  | 'STALE_MATCH' | 'CONFLICT';

/** A room as clients and pure rules see it (no ids, no tokens). */
export interface RoomState {
  code: string;
  status: RoomStatus;
  maps: string[];
  seed: number;
  matchNumber: number;
  matchStartedAt: number;
  turnClockStart: number;
  rematchDeadline: number | null;
}

export interface SeatState {
  seat: number;
  name: string;
  color: number;
  pattern: string;
  left: boolean;
  rematchReady: boolean;
}

export interface ShotRecord {
  seq: number;
  seat: number;
  angle: number;
  power: number;
  /** null while the shot is in flight. */
  outcome: ClassifiedOutcome | null;
  witnessOutcome: ClassifiedOutcome | null;
  resolution: Resolution | null;
  firedAt: number;
  resolvedAt: number | null;
}

export interface PresenceEntry { seat: number; lastSeen: number }

/** Everything the pure rules need about one match. */
export interface MatchView {
  room: RoomState;
  seats: readonly SeatState[];
  shots: readonly ShotRecord[];
}

/** What `getRoom` returns: the match view plus the caller's seat. */
export interface RoomSnapshot {
  room: RoomState;
  seats: SeatState[];
  shots: ShotRecord[];
  you: number | null;
}
```

- [ ] **Step 5: Create the PRNG, the room-code helpers and the name helper**

```ts
// src/rules/seededRandom.ts
/** mulberry32: integer-only maths, so every JS engine produces the same sequence. */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
```

```ts
// src/rules/roomCode.ts
import { ONLINE } from '../config/tuning';

export function generateRoomCode(random: () => number): string {
  let code = '';
  for (let i = 0; i < ONLINE.codeLength; i++) {
    code += ONLINE.codeAlphabet[Math.floor(random() * ONLINE.codeAlphabet.length)];
  }
  return code;
}

/** Upper-cases and drops spaces/dashes; null unless the result is a well-formed code. */
export function normalizeRoomCode(input: string): string | null {
  const code = input.toUpperCase().replace(/[\s-]+/g, '');
  if (code.length !== ONLINE.codeLength) return null;
  return [...code].every(ch => ONLINE.codeAlphabet.includes(ch)) ? code : null;
}
```

```ts
// src/rules/playerName.ts
import { MULTIPLAYER } from '../config/tuning';

/** Trims a name, caps its length and falls back to "Player N" when blank or not text. */
export function sanitizePlayerName(raw: unknown, index: number): string {
  const name = typeof raw === 'string' ? raw.trim().substring(0, MULTIPLAYER.maxNameLength).trim() : '';
  return name || `Player ${index + 1}`;
}
```

In `src/storage/storage.ts`, delete the local `sanitizePlayerName` function (lines ~65-69) and add next to the other imports:

```ts
import { sanitizePlayerName } from '../rules/playerName';
export { sanitizePlayerName };
```

- [ ] **Step 6: Run the tests**

Run: `npx vitest run tests/onlineBasics.test.ts tests/storage.test.ts`
Expected: PASS.

- [ ] **Step 7: Check and commit**

```bash
npm run check
git add src/config/tuning.ts src/rules/onlineTypes.ts src/rules/seededRandom.ts src/rules/roomCode.ts src/rules/playerName.ts src/storage/storage.ts tests/onlineBasics.test.ts
git commit -m "feat(online): ONLINE tuning, shared types, seeded PRNG, room codes"
```

---
### Task 3: `replayMatch` and shared test fixtures

**Files:**
- Create: `src/rules/replayMatch.ts`
- Modify: `src/rules/multiplayerMatch.ts:31` (`const OUTCOME_POINTS` becomes `export const OUTCOME_POINTS`)
- Create: `tests/onlineFixtures.ts` (helpers only; it is not matched by `tests/**/*.test.ts`)
- Test: `tests/replayMatch.test.ts`

**Interfaces:**
- Consumes: `MultiplayerMatchMachine`, `seededRandom`, `SeatState`, `ShotRecord`.
- Produces: `replayMatch(input: ReplayInput, options: { includeInFlight: boolean }): ReplayResult`.
  - `ReplayInput = { seats: readonly Pick<SeatState, 'seat' | 'name' | 'color' | 'pattern'>[]; maps: readonly string[]; seed: number; shots: readonly ShotRecord[] }`
  - `ReplayResult = { machine; awaitingSeat: number | null; inFlightSeq: number | null; nextSeq: number; isMatchComplete: boolean }`
- Produces: `OUTCOME_POINTS: Record<ClassifiedOutcome, number>`.
- Produces test helpers: `makeSeats`, `makeRoom`, `playShots`, `makeView`, `freshPresence`.

- [ ] **Step 1: Create the fixtures** (used by Tasks 3, 5 and 10)

```ts
// tests/onlineFixtures.ts
import { MULTIPLAYER } from '../src/config/tuning';
import { MultiplayerMatchMachine } from '../src/rules/multiplayerMatch';
import type { MatchView, PresenceEntry, RoomState, SeatState, ShotRecord } from '../src/rules/onlineTypes';
import { seededRandom } from '../src/rules/seededRandom';
import type { ClassifiedOutcome } from '../src/sim/classification';

export function makeSeats(n: number, overrides: Partial<SeatState>[] = []): SeatState[] {
  return Array.from({ length: n }, (_, i) => ({
    seat: i, name: `P${i + 1}`, color: MULTIPLAYER.colors[i]!, pattern: MULTIPLAYER.patterns[i]!,
    left: false, rematchReady: false, ...overrides[i],
  }));
}

export function makeRoom(overrides: Partial<RoomState> = {}): RoomState {
  return {
    code: 'ABCDE', status: 'playing', maps: ['backyard'], seed: 7, matchNumber: 0,
    matchStartedAt: 0, turnClockStart: 0, rematchDeadline: null, ...overrides,
  };
}

/**
 * The shot records the server would hold after these outcomes, using a reference machine for turn order.
 * `null` means "fired, still in flight" and must be last. Shot n is fired at `at + n` ms with aim (30 + n)°/60 %.
 */
export function playShots(seats: readonly SeatState[], room: RoomState,
  outcomes: readonly (ClassifiedOutcome | null)[], at = 1_000): ShotRecord[] {
  const machine = new MultiplayerMatchMachine(
    seats.map(s => ({ name: s.name, color: s.color, pattern: s.pattern, lastAngle: 45, lastPower: 50 })),
    room.maps, seededRandom(room.seed));
  return outcomes.map((outcome, seq) => {
    machine.startAiming();
    const seat = machine.activePlayerIndex;
    const angle = 30 + seq;
    const power = 60;
    machine.fire(angle, power);
    if (outcome !== null) {
      machine.resolveShot(outcome);
      machine.continueFromResult();
      if (machine.state === 'round_result') machine.nextRound();
    }
    return {
      seq, seat, angle, power, outcome, witnessOutcome: null,
      resolution: outcome === null ? null : 'shooter',
      firedAt: at + seq, resolvedAt: outcome === null ? null : at + seq,
    };
  });
}

export function makeView(n: number, outcomes: readonly (ClassifiedOutcome | null)[],
  room: Partial<RoomState> = {}, seats: Partial<SeatState>[] = []): MatchView {
  const r = makeRoom(room);
  const s = makeSeats(n, seats);
  return { room: r, seats: s, shots: playShots(s, r, outcomes) };
}

/** Presence entries last seen one second before `now`. */
export function freshPresence(seats: readonly number[], now: number): PresenceEntry[] {
  return seats.map(seat => ({ seat, lastSeen: now - 1_000 }));
}
```

- [ ] **Step 2: Write the failing test**

```ts
// tests/replayMatch.test.ts
import { describe, expect, it } from 'vitest';
import { MULTIPLAYER } from '../src/config/tuning';
import { MultiplayerMatchMachine, OUTCOME_POINTS } from '../src/rules/multiplayerMatch';
import { replayMatch } from '../src/rules/replayMatch';
import { seededRandom } from '../src/rules/seededRandom';
import type { ClassifiedOutcome } from '../src/sim/classification';
import { makeRoom, makeSeats, playShots } from './onlineFixtures';

const CYCLE: ClassifiedOutcome[] = ['body', 'miss', 'hat_only', 'ricochet_body', 'miss'];

describe('replayMatch', () => {
  for (const n of [2, 3, 4]) {
    for (const maps of [['fence'], [...MULTIPLAYER.maps]]) {
      it(`replays a full ${n}-player match on ${maps.join('+')} with hand-driven scores`, () => {
        const seats = makeSeats(n);
        const room = makeRoom({ maps, seed: 99 });
        const total = MULTIPLAYER.shotsPerRound * n * maps.length;
        const shots = playShots(seats, room, Array.from({ length: total }, (_, i) => CYCLE[i % CYCLE.length]!));
        const r = replayMatch({ seats, maps, seed: 99, shots }, { includeInFlight: true });
        expect(r.isMatchComplete).toBe(true);
        expect(r.machine.state).toBe('match_result');
        expect(r.nextSeq).toBe(total);
        expect(r.awaitingSeat).toBeNull();
        for (const seat of seats) {
          const expected = shots.filter(s => s.seat === seat.seat).reduce((sum, s) => sum + OUTCOME_POINTS[s.outcome!], 0);
          expect(r.machine.players[seat.seat]!.totalScore).toBe(expected);
        }
      });
    }
  }

  it('reproduces the hand-driven position schedule for the same seed', () => {
    const seats = makeSeats(3);
    const maps = [...MULTIPLAYER.maps];
    const room = makeRoom({ maps, seed: 4242 });
    const outcomes = Array.from({ length: 27 }, () => 'miss' as const);
    const shots = playShots(seats, room, outcomes);
    const reference = new MultiplayerMatchMachine(
      seats.map(s => ({ name: s.name, color: s.color, pattern: s.pattern, lastAngle: 45, lastPower: 50 })), maps, seededRandom(4242));
    for (let k = 0; k < shots.length; k++) {
      const replayed = replayMatch({ seats, maps, seed: 4242, shots: shots.slice(0, k) }, { includeInFlight: true }).machine;
      expect(`${replayed.currentMapId}:${replayed.activePositionId}`).toBe(`${reference.currentMapId}:${reference.activePositionId}`);
      reference.startAiming(); reference.fire(45, 50); reference.resolveShot('miss'); reference.continueFromResult();
      if (reference.state === 'round_result') reference.nextRound();
    }
  });

  it('scores skipped shots as misses and advances the turn', () => {
    const seats = makeSeats(2);
    const room = makeRoom();
    const shots = playShots(seats, room, ['body', 'miss']);
    shots[1] = { ...shots[1]!, resolution: 'skipped' };
    const r = replayMatch({ seats, maps: room.maps, seed: room.seed, shots }, { includeInFlight: true });
    expect(r.machine.players[1]!.totalScore).toBe(0);
    expect(r.nextSeq).toBe(2);
    expect(r.awaitingSeat).toBe(0);
  });

  it('server view: a trailing in-flight shot leaves the machine simulating', () => {
    const seats = makeSeats(2);
    const room = makeRoom();
    const shots = playShots(seats, room, ['body', null]);
    const r = replayMatch({ seats, maps: room.maps, seed: room.seed, shots }, { includeInFlight: true });
    expect(r.machine.state).toBe('simulating');
    expect(r.inFlightSeq).toBe(1);
    expect(r.awaitingSeat).toBeNull();
    expect(r.nextSeq).toBe(2);
  });

  it('client view: the in-flight shot is left for playback, starting from handover', () => {
    const seats = makeSeats(2);
    const room = makeRoom();
    const shots = playShots(seats, room, ['body', null]);
    const r = replayMatch({ seats, maps: room.maps, seed: room.seed, shots }, { includeInFlight: false });
    expect(r.machine.state).toBe('handover');
    expect(r.inFlightSeq).toBeNull();
    expect(r.awaitingSeat).toBe(1);
    expect(r.nextSeq).toBe(1);
  });

  it('throws on a shot by the wrong seat or a sequence gap', () => {
    const seats = makeSeats(2);
    const room = makeRoom();
    const shots = playShots(seats, room, ['body', 'miss']);
    expect(() => replayMatch({ seats, maps: room.maps, seed: room.seed, shots: [{ ...shots[0]!, seat: 1 }] }, { includeInFlight: true })).toThrow(/expected seat 0/);
    expect(() => replayMatch({ seats, maps: room.maps, seed: room.seed, shots: [shots[1]!] }, { includeInFlight: true })).toThrow(/expected seq 0/);
  });
});
```

- [ ] **Step 3: Run it and confirm it fails**

Run: `npx vitest run tests/replayMatch.test.ts`
Expected: FAIL, missing module `replayMatch` / `OUTCOME_POINTS` not exported.

- [ ] **Step 4: Implement it.** In `src/rules/multiplayerMatch.ts`, change `const OUTCOME_POINTS` to `export const OUTCOME_POINTS`. Then:

```ts
// src/rules/replayMatch.ts
import { MultiplayerMatchMachine, type MPPlayerSetup } from './multiplayerMatch';
import type { SeatState, ShotRecord } from './onlineTypes';
import { seededRandom } from './seededRandom';

/** First-shot aim for every online seat, as in `defaultPlayerSetups`. */
const FIRST_AIM = { angle: 45, power: 50 } as const;

export interface ReplayInput {
  seats: readonly Pick<SeatState, 'seat' | 'name' | 'color' | 'pattern'>[];
  maps: readonly string[];
  seed: number;
  shots: readonly ShotRecord[];
}

export interface ReplayResult {
  machine: MultiplayerMatchMachine;
  /** Seat the match waits on to fire, or null (shot in flight / match over). */
  awaitingSeat: number | null;
  inFlightSeq: number | null;
  /** Number of shots replayed: the seq of the next shot to fire. */
  nextSeq: number;
  isMatchComplete: boolean;
}

/**
 * Rebuilds a match from its stored shots.
 * - Server: `includeInFlight: true`. A trailing unresolved shot is fired and left simulating.
 * - Clients: `includeInFlight: false`. The machine stops in handover before an in-flight shot, so
 *   normal playback can fire it from aiming (MultiCoordinator only fires from aiming).
 */
export function replayMatch(input: ReplayInput, options: { includeInFlight: boolean }): ReplayResult {
  const setups: MPPlayerSetup[] = [...input.seats]
    .sort((a, b) => a.seat - b.seat)
    .map(s => ({ name: s.name, color: s.color, pattern: s.pattern, lastAngle: FIRST_AIM.angle, lastPower: FIRST_AIM.power }));
  const machine = new MultiplayerMatchMachine(setups, input.maps, seededRandom(input.seed));
  const shots = [...input.shots].sort((a, b) => a.seq - b.seq);
  let inFlightSeq: number | null = null;
  let replayed = 0;
  for (const shot of shots) {
    if (shot.seq !== replayed) throw new Error(`replayMatch: expected seq ${replayed}, got ${shot.seq}`);
    if (machine.isMatchComplete) throw new Error(`replayMatch: shot ${shot.seq} after the match ended`);
    if (shot.seat !== machine.activePlayerIndex) {
      throw new Error(`replayMatch: shot ${shot.seq} by seat ${shot.seat}, expected seat ${machine.activePlayerIndex}`);
    }
    if (shot.outcome === null) {
      if (shot.seq !== shots.length - 1) throw new Error(`replayMatch: unresolved shot ${shot.seq} is not the last`);
      if (options.includeInFlight) {
        machine.startAiming();
        machine.fire(shot.angle, shot.power);
        inFlightSeq = shot.seq;
        replayed++;
      }
      break;
    }
    machine.startAiming();
    machine.fire(shot.angle, shot.power);
    machine.resolveShot(shot.outcome);
    machine.continueFromResult();
    if (machine.state === 'round_result') machine.nextRound();
    replayed++;
  }
  const awaitingSeat = inFlightSeq === null && !machine.isMatchComplete ? machine.activePlayerIndex : null;
  return { machine, awaitingSeat, inFlightSeq, nextSeq: replayed, isMatchComplete: machine.isMatchComplete };
}
```

- [ ] **Step 5: Run it and confirm it passes**

Run: `npx vitest run tests/replayMatch.test.ts tests/multiplayerMatch.test.ts`
Expected: PASS.

- [ ] **Step 6: Check and commit**

```bash
npm run check
git add src/rules/replayMatch.ts src/rules/multiplayerMatch.ts tests/onlineFixtures.ts tests/replayMatch.test.ts
git commit -m "feat(online): replayMatch rebuilds a match from stored shots"
```

---

### Task 4: Roster rules (`onlineRoster`)

**Files:**
- Create: `src/rules/onlineRoster.ts`
- Test: `tests/onlineRoster.test.ts`

**Interfaces:**
- Consumes: `ONLINE`, `MULTIPLAYER`, `PresenceEntry`, `SeatState`.
- Produces:
  - `assignAppearance(taken: readonly { color: number; pattern: string }[], requested: { color: number; pattern: string }): { color: number; pattern: string }`
  - `renumberSeats<T extends { seat: number }>(seats: readonly T[]): Array<T & { newSeat: number }>`
  - `staleLobbySeats(seats: readonly { seat: number }[], presence: readonly PresenceEntry[], now: number): number[]`
  - `rematchDecision(seats: readonly SeatState[], atDeadline: boolean): RematchDecision`, where `RematchDecision = { kind: 'start'; seats: number[] } | { kind: 'wait' } | { kind: 'reset' }`

- [ ] **Step 1: Write the failing test**

```ts
// tests/onlineRoster.test.ts
import { describe, expect, it } from 'vitest';
import { MULTIPLAYER } from '../src/config/tuning';
import { assignAppearance, rematchDecision, renumberSeats, staleLobbySeats } from '../src/rules/onlineRoster';
import { makeSeats } from './onlineFixtures';

const [C0, C1, C2] = MULTIPLAYER.colors;
const [P0, P1] = MULTIPLAYER.patterns;

describe('assignAppearance', () => {
  it('keeps a free request', () => {
    expect(assignAppearance([], { color: C1!, pattern: P1! })).toEqual({ color: C1, pattern: P1 });
  });
  it('replaces a taken colour and a taken pattern independently with the first free ones', () => {
    const taken = [{ color: C0!, pattern: P1! }, { color: C1!, pattern: P0! }];
    expect(assignAppearance(taken, { color: C0!, pattern: P1! })).toEqual({ color: C2, pattern: MULTIPLAYER.patterns[2] });
    expect(assignAppearance(taken, { color: C2!, pattern: P0! })).toEqual({ color: C2, pattern: MULTIPLAYER.patterns[2] });
  });
  it('replaces unknown values', () => {
    expect(assignAppearance([], { color: 123, pattern: 'zigzag' })).toEqual({ color: C0, pattern: P0 });
  });
});

describe('renumberSeats', () => {
  it('closes gaps in seat order and keeps other fields', () => {
    const out = renumberSeats([{ seat: 3, id: 'c' }, { seat: 0, id: 'a' }, { seat: 2, id: 'b' }]);
    expect(out.map(s => [s.id, s.newSeat])).toEqual([['a', 0], ['b', 1], ['c', 2]]);
  });
});

describe('staleLobbySeats', () => {
  const now = 1_000_000;
  it('treats missing presence and >= staleSeconds as stale', () => {
    const seats = [{ seat: 0 }, { seat: 1 }, { seat: 2 }, { seat: 3 }];
    const presence = [
      { seat: 0, lastSeen: now - 89_999 },
      { seat: 1, lastSeen: now - 90_000 },
      { seat: 3, lastSeen: now },
    ];
    expect(staleLobbySeats(seats, presence, now)).toEqual([1, 2]);
  });
  it('removes a stale host too', () => {
    expect(staleLobbySeats([{ seat: 0 }, { seat: 1 }], [{ seat: 1, lastSeen: now }], now)).toEqual([0]);
  });
});

describe('rematchDecision', () => {
  it('starts at once when every active player is ready (left players do not count)', () => {
    const seats = makeSeats(3, [{ rematchReady: true }, { rematchReady: true }, { left: true }]);
    expect(rematchDecision(seats, false)).toEqual({ kind: 'start', seats: [0, 1] });
  });
  it('waits while someone active is not ready', () => {
    expect(rematchDecision(makeSeats(2, [{ rematchReady: true }]), false)).toEqual({ kind: 'wait' });
  });
  it('never starts alone', () => {
    expect(rematchDecision(makeSeats(2, [{ rematchReady: true }, { left: true }]), false)).toEqual({ kind: 'wait' });
  });
  it('at the deadline starts with the ready players if there are at least two', () => {
    const seats = makeSeats(3, [{ rematchReady: true }, {}, { rematchReady: true }]);
    expect(rematchDecision(seats, true)).toEqual({ kind: 'start', seats: [0, 2] });
  });
  it('at the deadline resets when fewer than two are ready', () => {
    expect(rematchDecision(makeSeats(3, [{ rematchReady: true }]), true)).toEqual({ kind: 'reset' });
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run tests/onlineRoster.test.ts`
Expected: FAIL, missing module.

- [ ] **Step 3: Implement it**

```ts
// src/rules/onlineRoster.ts
import { MULTIPLAYER, ONLINE } from '../config/tuning';
import type { PresenceEntry, SeatState } from './onlineTypes';

const COLORS = MULTIPLAYER.colors as readonly number[];
const PATTERNS = MULTIPLAYER.patterns as readonly string[];

/** Keeps the requested colour and pattern unless taken (or unknown); then the first free one, independently. */
export function assignAppearance(taken: readonly { color: number; pattern: string }[],
  requested: { color: number; pattern: string }): { color: number; pattern: string } {
  const usedColors = new Set(taken.map(t => t.color));
  const usedPatterns = new Set(taken.map(t => t.pattern));
  const color = COLORS.includes(requested.color) && !usedColors.has(requested.color)
    ? requested.color : COLORS.find(c => !usedColors.has(c)) ?? COLORS[0]!;
  const pattern = PATTERNS.includes(requested.pattern) && !usedPatterns.has(requested.pattern)
    ? requested.pattern : PATTERNS.find(p => !usedPatterns.has(p)) ?? PATTERNS[0]!;
  return { color, pattern };
}

/** Contiguous seats 0..n-1 in current seat (= join) order. */
export function renumberSeats<T extends { seat: number }>(seats: readonly T[]): Array<T & { newSeat: number }> {
  return [...seats].sort((a, b) => a.seat - b.seat).map((s, i) => ({ ...s, newSeat: i }));
}

/** Lobby seats with no heartbeat for staleSeconds; a missing presence row counts as stale. */
export function staleLobbySeats(seats: readonly { seat: number }[], presence: readonly PresenceEntry[], now: number): number[] {
  const limit = ONLINE.staleSeconds * 1000;
  return seats
    .filter(s => {
      const entry = presence.find(p => p.seat === s.seat);
      return entry === undefined || now - entry.lastSeen >= limit;
    })
    .map(s => s.seat);
}

export type RematchDecision = { kind: 'start'; seats: number[] } | { kind: 'wait' } | { kind: 'reset' };

/** On a press: start only when every active player is ready. At the deadline: start with whoever is ready. */
export function rematchDecision(seats: readonly SeatState[], atDeadline: boolean): RematchDecision {
  const active = seats.filter(s => !s.left);
  const ready = active.filter(s => s.rematchReady).map(s => s.seat);
  const enough = ready.length >= MULTIPLAYER.minPlayers;
  if (!atDeadline) return enough && ready.length === active.length ? { kind: 'start', seats: ready } : { kind: 'wait' };
  return enough ? { kind: 'start', seats: ready } : { kind: 'reset' };
}
```

- [ ] **Step 4: Run, check and commit**

Run: `npx vitest run tests/onlineRoster.test.ts` (expected PASS), then `npm run check`.

```bash
git add src/rules/onlineRoster.ts tests/onlineRoster.test.ts
git commit -m "feat(online): roster rules for appearance, seats, lobby pruning and rematch"
```

---

### Task 5: Match rules (`onlineRules`): validation, timer decisions, starting a turn

Server handlers stay thin; all turn logic is here and tested.

**Files:**
- Create: `src/rules/onlineRules.ts`
- Test: `tests/onlineRules.test.ts`

**Interfaces:**
- Consumes: `replayMatch`, `MatchView`, `PresenceEntry`, `ShotRecord`, `OnlineErrorCode`, `ONLINE`, `AIM`, `MULTIPLAYER`, `MAPS`.
- Produces (exact names, used by Convex in Tasks 8–9 and the tracker in Task 10):
  - `type Check<T extends object = object> = ({ ok: true } & T) | { ok: false; code: OnlineErrorCode }`
  - `validMaps(maps: readonly string[]): boolean`
  - `mapHasRicochet(mapId: string): boolean`
  - `isFresh(seat: number, presence: readonly PresenceEntry[], now: number): boolean`
  - `isRoomEmpty(seats: readonly SeatState[], presence: readonly PresenceEntry[], now: number): boolean`
  - `validateFire(view, callerSeat, args: { matchNumber; seq; angle; power }): Check<{ duplicate: boolean }>`
  - `validateReport(view, callerSeat, args: { matchNumber; seq; outcome }): Check<{ duplicate: boolean }>`
  - `acceptWitness(view, callerSeat, args: { matchNumber; seq; outcome }): boolean`
  - `checkTurnDecision(view, presence, now, seq): TurnDecision`
  - `planTurnStart(view, presence, now, clockStart): TurnPlan`
  - `checkInFlightDecision(view, presence, now, seq): InFlightDecision`
  - `TurnDecision = { kind: 'none' } | { kind: 'skip'; seat; angle; power } | { kind: 'wait'; clockStart; at } | { kind: 'reschedule'; at }`
  - `TurnPlan = { skips: ShotRecord[]; clockStart: number; finished: boolean; checkAt: number | null; checkSeq: number | null }`
  - `InFlightDecision = { kind: 'none' } | { kind: 'reschedule'; at } | { kind: 'resolve'; outcome: ClassifiedOutcome; resolution: 'witness' | 'timeout' }`

- [ ] **Step 1: Write the failing test**

```ts
// tests/onlineRules.test.ts
import { describe, expect, it } from 'vitest';
import { MULTIPLAYER } from '../src/config/tuning';
import {
  acceptWitness, checkInFlightDecision, checkTurnDecision, isRoomEmpty, mapHasRicochet,
  planTurnStart, validMaps, validateFire, validateReport,
} from '../src/rules/onlineRules';
import type { MatchView, ShotRecord } from '../src/rules/onlineTypes';
import { freshPresence, makeSeats, makeView } from './onlineFixtures';

/** Two players on backyard: seat 0 hit, seat 1 is up (seq 1). */
const awaitingSeat1 = () => makeView(2, ['body']);
/** Seat 1's shot (seq 1, aim 31/60, fired at 1001 ms) is in flight. */
const inFlight = () => makeView(2, ['body', null]);
const withShot = (view: MatchView, seq: number, patch: Partial<ShotRecord>): MatchView =>
  ({ ...view, shots: view.shots.map(s => (s.seq === seq ? { ...s, ...patch } : s)) });

describe('validMaps / mapHasRicochet', () => {
  it('accepts distinct supported multiplayer maps only', () => {
    expect(validMaps(['backyard'])).toBe(true);
    expect(validMaps([...MULTIPLAYER.maps])).toBe(true);
    expect(validMaps([])).toBe(false);
    expect(validMaps(['backyard', 'backyard'])).toBe(false);
    expect(validMaps(['rubber'])).toBe(false);
    expect(validMaps(['moon'])).toBe(false);
  });
  it('reads ricochet surfaces from level data', () => {
    expect(mapHasRicochet('backyard')).toBe(true);
    expect(mapHasRicochet('moon')).toBe(false);
  });
});

describe('validateFire', () => {
  const fire = { matchNumber: 0, seq: 1, angle: 40, power: 70 };
  it('accepts the awaited seat firing the next seq', () => {
    expect(validateFire(awaitingSeat1(), 1, fire)).toEqual({ ok: true, duplicate: false });
  });
  it('rejects the wrong seat, wrong seq, unresolved previous shot and stale match', () => {
    expect(validateFire(awaitingSeat1(), 0, fire)).toEqual({ ok: false, code: 'NOT_YOUR_TURN' });
    expect(validateFire(awaitingSeat1(), 1, { ...fire, seq: 2 })).toEqual({ ok: false, code: 'OUT_OF_ORDER' });
    expect(validateFire(inFlight(), 0, { ...fire, seq: 2 })).toEqual({ ok: false, code: 'OUT_OF_ORDER' });
    expect(validateFire(awaitingSeat1(), 1, { ...fire, matchNumber: 1 })).toEqual({ ok: false, code: 'STALE_MATCH' });
    expect(validateFire(makeView(2, ['body'], { status: 'finished' }), 1, fire)).toEqual({ ok: false, code: 'NOT_YOUR_TURN' });
  });
  it('rejects out-of-range or fractional aim', () => {
    for (const aim of [{ angle: 4 }, { angle: 86 }, { angle: 45.5 }, { power: -1 }, { power: 101 }, { power: 50.5 }]) {
      expect(validateFire(awaitingSeat1(), 1, { ...fire, ...aim })).toEqual({ ok: false, code: 'INVALID_AIM' });
    }
  });
  it('treats an identical repeat as a duplicate and a different one as a conflict', () => {
    expect(validateFire(inFlight(), 1, { matchNumber: 0, seq: 1, angle: 31, power: 60 })).toEqual({ ok: true, duplicate: true });
    expect(validateFire(inFlight(), 1, { matchNumber: 0, seq: 1, angle: 31, power: 61 })).toEqual({ ok: false, code: 'CONFLICT' });
  });
  it('conflicts when the turn was already skipped', () => {
    const skipped = withShot(makeView(2, ['body', 'miss']), 1, { resolution: 'skipped' });
    expect(validateFire(skipped, 1, { matchNumber: 0, seq: 1, angle: 31, power: 60 })).toEqual({ ok: false, code: 'CONFLICT' });
  });
});

describe('validateReport', () => {
  const report = { matchNumber: 0, seq: 1, outcome: 'body' as const };
  it('accepts the shooter reporting an in-flight shot', () => {
    expect(validateReport(inFlight(), 1, report)).toEqual({ ok: true, duplicate: false });
    expect(validateReport(inFlight(), 1, { ...report, outcome: 'ricochet_body' })).toEqual({ ok: true, duplicate: false });
  });
  it('rejects other seats, unknown shots and stale matches', () => {
    expect(validateReport(inFlight(), 0, report)).toEqual({ ok: false, code: 'NOT_YOUR_TURN' });
    expect(validateReport(inFlight(), 1, { ...report, seq: 5 })).toEqual({ ok: false, code: 'OUT_OF_ORDER' });
    expect(validateReport(inFlight(), 1, { ...report, matchNumber: 3 })).toEqual({ ok: false, code: 'STALE_MATCH' });
  });
  it('is idempotent for the same shooter report and conflicts after a fallback', () => {
    expect(validateReport(makeView(2, ['body', 'hat_only']), 1, { ...report, outcome: 'hat_only' })).toEqual({ ok: true, duplicate: true });
    const timedOut = withShot(makeView(2, ['body', 'miss']), 1, { resolution: 'timeout' });
    expect(validateReport(timedOut, 1, { ...report, outcome: 'miss' })).toEqual({ ok: false, code: 'CONFLICT' });
  });
});

describe('acceptWitness', () => {
  const witness = { matchNumber: 0, seq: 1, outcome: 'body' as const };
  it('records the first spectator outcome only', () => {
    expect(acceptWitness(inFlight(), 0, witness)).toBe(true);
    expect(acceptWitness(inFlight(), 1, witness)).toBe(false);
    expect(acceptWitness(withShot(inFlight(), 1, { witnessOutcome: 'miss' }), 0, witness)).toBe(false);
    expect(acceptWitness(makeView(2, ['body', 'miss']), 0, witness)).toBe(false);
    expect(acceptWitness(inFlight(), 0, { ...witness, matchNumber: 1 })).toBe(false);
  });
});

describe('isRoomEmpty', () => {
  const now = 1_000_000;
  it('is empty only when no non-left seat is fresh', () => {
    const seats = makeSeats(2);
    expect(isRoomEmpty(seats, freshPresence([0], now), now)).toBe(false);
    expect(isRoomEmpty(seats, [{ seat: 0, lastSeen: 0 }, { seat: 1, lastSeen: 0 }], now)).toBe(true);
    expect(isRoomEmpty(makeSeats(2, [{ left: true }]), freshPresence([0], now), now)).toBe(true);
  });
});

describe('checkTurnDecision', () => {
  it('reschedules at the earlier of the turn limit and the stale limit', () => {
    const now = 10_000;
    const presence = [{ seat: 0, lastSeen: 9_000 }, { seat: 1, lastSeen: 9_000 }];
    expect(checkTurnDecision(awaitingSeat1(), presence, now, 1)).toEqual({ kind: 'reschedule', at: 99_000 });
  });
  it('skips at the turn limit with the seat\'s last aim', () => {
    const now = 120_000;
    expect(checkTurnDecision(awaitingSeat1(), freshPresence([0, 1], now), now, 1)).toEqual({ kind: 'skip', seat: 1, angle: 45, power: 50 });
  });
  it('skips a stale or missing active seat while someone else is present', () => {
    const now = 100_000;
    expect(checkTurnDecision(awaitingSeat1(), [{ seat: 0, lastSeen: 99_000 }, { seat: 1, lastSeen: 5_000 }], now, 1).kind).toBe('skip');
    expect(checkTurnDecision(awaitingSeat1(), freshPresence([0], now), now, 1).kind).toBe('skip');
  });
  it('skips a seat that left even when the room is empty', () => {
    const view = makeView(2, ['body'], {}, [{}, { left: true }]);
    expect(checkTurnDecision(view, [], 500_000, 1).kind).toBe('skip');
  });
  it('waits and restarts the clock when the whole room is gone (shared outage)', () => {
    const now = 500_000;
    expect(checkTurnDecision(awaitingSeat1(), [{ seat: 0, lastSeen: 0 }, { seat: 1, lastSeen: 0 }], now, 1))
      .toEqual({ kind: 'wait', clockStart: now, at: now + 90_000 });
  });
  it('does nothing once the turn has moved on, a shot is in flight, or the match is not playing', () => {
    const now = 500_000;
    expect(checkTurnDecision(awaitingSeat1(), [], now, 0)).toEqual({ kind: 'none' });
    expect(checkTurnDecision(inFlight(), [], now, 2)).toEqual({ kind: 'none' });
    expect(checkTurnDecision(makeView(2, ['body'], { status: 'finished' }), [], now, 1)).toEqual({ kind: 'none' });
  });
});

describe('planTurnStart', () => {
  it('skips consecutive gone seats in one go and waits for the first present one', () => {
    const now = 100_000;
    const view = makeView(3, ['body'], {}, [{}, { left: true }, {}]);
    const plan = planTurnStart(view, [{ seat: 0, lastSeen: 99_000 }, { seat: 2, lastSeen: 1_000 }], now, now);
    expect(plan.skips.map(s => [s.seq, s.seat, s.outcome, s.resolution, s.resolvedAt])).toEqual([
      [1, 1, 'miss', 'skipped', now], [2, 2, 'miss', 'skipped', now],
    ]);
    expect(plan).toMatchObject({ finished: false, checkSeq: 3, checkAt: 189_000, clockStart: now });
  });
  it('in an empty room skips only seats that left, then waits', () => {
    const now = 500_000;
    const view = makeView(3, ['body'], {}, [{}, { left: true }, {}]);
    const plan = planTurnStart(view, [{ seat: 0, lastSeen: 0 }, { seat: 2, lastSeen: 0 }], now, now);
    expect(plan.skips.map(s => s.seat)).toEqual([1]);
    expect(plan).toMatchObject({ finished: false, checkSeq: 2, checkAt: now + 90_000, clockStart: now });
  });
  it('finishes the match when the last turn is skipped', () => {
    const view = makeView(2, ['body', 'miss', 'body', 'miss', 'body'], {}, [{}, { left: true }]);
    const plan = planTurnStart(view, freshPresence([0], 10_000), 10_000, 10_000);
    expect(plan.skips).toHaveLength(1);
    expect(plan).toMatchObject({ finished: true, checkAt: null, checkSeq: null });
  });
  it('does nothing while a shot is in flight', () => {
    expect(planTurnStart(inFlight(), [], 10_000, 10_000)).toMatchObject({ skips: [], finished: false, checkAt: null });
  });
  it('once someone is back, a stale active seat is skipped and the clock counts from the restart', () => {
    const now = 600_000;
    const view = makeView(2, ['body'], { turnClockStart: 590_000 });
    const plan = planTurnStart(view, [{ seat: 0, lastSeen: now - 1_000 }, { seat: 1, lastSeen: 0 }], now, 590_000);
    expect(plan.skips.map(s => s.seat)).toEqual([1]);
    expect(plan.checkSeq).toBe(2);
  });
});

describe('checkInFlightDecision', () => {
  const deadline = 1_001 + 40_000;
  it('waits for the shooter until the in-flight timeout', () => {
    expect(checkInFlightDecision(inFlight(), freshPresence([0, 1], 10_000), 10_000, 1)).toEqual({ kind: 'reschedule', at: deadline });
  });
  it('falls back to the witness, or a timeout miss', () => {
    const now = 50_000;
    expect(checkInFlightDecision(inFlight(), freshPresence([0, 1], now), now, 1)).toEqual({ kind: 'resolve', outcome: 'miss', resolution: 'timeout' });
    expect(checkInFlightDecision(withShot(inFlight(), 1, { witnessOutcome: 'body' }), freshPresence([0, 1], now), now, 1))
      .toEqual({ kind: 'resolve', outcome: 'body', resolution: 'witness' });
  });
  it('uses a witness at once when the shooter left', () => {
    const view = withShot(makeView(2, ['body', null], {}, [{}, { left: true }]), 1, { witnessOutcome: 'hat_only' });
    expect(checkInFlightDecision(view, [], 2_000, 1)).toEqual({ kind: 'resolve', outcome: 'hat_only', resolution: 'witness' });
    expect(checkInFlightDecision(makeView(2, ['body', null], {}, [{}, { left: true }]), [], 2_000, 1)).toEqual({ kind: 'reschedule', at: deadline });
  });
  it('keeps waiting in an empty room unless the shooter left', () => {
    const stale = [{ seat: 0, lastSeen: 0 }, { seat: 1, lastSeen: 0 }];
    expect(checkInFlightDecision(inFlight(), stale, 200_000, 1)).toEqual({ kind: 'reschedule', at: 290_000 });
    expect(checkInFlightDecision(makeView(2, ['body', null], {}, [{}, { left: true }]), stale, 200_000, 1))
      .toEqual({ kind: 'resolve', outcome: 'miss', resolution: 'timeout' });
  });
  it('does nothing for resolved or unknown shots', () => {
    expect(checkInFlightDecision(makeView(2, ['body', 'miss']), [], 99_000, 1)).toEqual({ kind: 'none' });
    expect(checkInFlightDecision(inFlight(), [], 99_000, 7)).toEqual({ kind: 'none' });
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run tests/onlineRules.test.ts`
Expected: FAIL, missing module.

- [ ] **Step 3: Implement it**

```ts
// src/rules/onlineRules.ts
import { AIM, MULTIPLAYER, ONLINE } from '../config/tuning';
import { MAPS } from '../levels';
import type { ClassifiedOutcome } from '../sim/classification';
import type { MatchView, OnlineErrorCode, PresenceEntry, SeatState, ShotRecord } from './onlineTypes';
import { replayMatch, type ReplayResult } from './replayMatch';

const MS = 1000;

export type Check<T extends object = object> = ({ ok: true } & T) | { ok: false; code: OnlineErrorCode };
const reject = (code: OnlineErrorCode): { ok: false; code: OnlineErrorCode } => ({ ok: false, code });

function serverReplay(view: MatchView): ReplayResult {
  return replayMatch({ seats: view.seats, maps: view.room.maps, seed: view.room.seed, shots: view.shots }, { includeInFlight: true });
}

export function validMaps(maps: readonly string[]): boolean {
  const allowed = MULTIPLAYER.maps as readonly string[];
  return maps.length > 0 && maps.length <= allowed.length && new Set(maps).size === maps.length && maps.every(m => allowed.includes(m));
}

export function mapHasRicochet(mapId: string): boolean {
  return MAPS.find(m => m.id === mapId)?.obstacles.some(o => o.ricochet) ?? false;
}

function isValidAim(angle: number, power: number): boolean {
  return Number.isInteger(angle) && angle >= AIM.minAngleDeg && angle <= AIM.maxAngleDeg &&
    Number.isInteger(power) && power >= 0 && power <= 100;
}

export function isFresh(seat: number, presence: readonly PresenceEntry[], now: number): boolean {
  const entry = presence.find(p => p.seat === seat);
  return entry !== undefined && now - entry.lastSeen < ONLINE.staleSeconds * MS;
}

/** Nobody still in the match has checked in recently, e.g. a shared router went down. */
export function isRoomEmpty(seats: readonly SeatState[], presence: readonly PresenceEntry[], now: number): boolean {
  return !seats.some(s => !s.left && isFresh(s.seat, presence, now));
}

export function validateFire(view: MatchView, callerSeat: number,
  args: { matchNumber: number; seq: number; angle: number; power: number }): Check<{ duplicate: boolean }> {
  if (args.matchNumber !== view.room.matchNumber) return reject('STALE_MATCH');
  const existing = view.shots.find(s => s.seq === args.seq);
  if (existing) {
    const same = existing.seat === callerSeat && existing.angle === args.angle && existing.power === args.power &&
      existing.resolution !== 'skipped';
    return same ? { ok: true, duplicate: true } : reject('CONFLICT');
  }
  if (view.room.status !== 'playing') return reject('NOT_YOUR_TURN');
  if (args.seq !== view.shots.length) return reject('OUT_OF_ORDER');
  const replay = serverReplay(view);
  if (replay.inFlightSeq !== null) return reject('OUT_OF_ORDER');
  if (replay.awaitingSeat !== callerSeat) return reject('NOT_YOUR_TURN');
  if (!isValidAim(args.angle, args.power)) return reject('INVALID_AIM');
  return { ok: true, duplicate: false };
}

export function validateReport(view: MatchView, callerSeat: number,
  args: { matchNumber: number; seq: number; outcome: ClassifiedOutcome }): Check<{ duplicate: boolean }> {
  if (args.matchNumber !== view.room.matchNumber) return reject('STALE_MATCH');
  const shot = view.shots.find(s => s.seq === args.seq);
  if (!shot) return reject('OUT_OF_ORDER');
  if (shot.seat !== callerSeat) return reject('NOT_YOUR_TURN');
  if (shot.outcome !== null) {
    return shot.resolution === 'shooter' && shot.outcome === args.outcome ? { ok: true, duplicate: true } : reject('CONFLICT');
  }
  if (args.outcome === 'ricochet_body' && !mapHasRicochet(serverReplay(view).machine.currentMapId)) return reject('IMPOSSIBLE_OUTCOME');
  return { ok: true, duplicate: false };
}

/** True when this spectator's outcome should be stored as the shot's witness. */
export function acceptWitness(view: MatchView, callerSeat: number,
  args: { matchNumber: number; seq: number; outcome: ClassifiedOutcome }): boolean {
  if (args.matchNumber !== view.room.matchNumber) return false;
  const shot = view.shots.find(s => s.seq === args.seq);
  if (!shot || shot.outcome !== null || shot.seat === callerSeat || shot.witnessOutcome !== null) return false;
  return args.outcome !== 'ricochet_body' || mapHasRicochet(serverReplay(view).machine.currentMapId);
}

export type TurnDecision =
  | { kind: 'none' }
  | { kind: 'skip'; seat: number; angle: number; power: number }
  | { kind: 'wait'; clockStart: number; at: number }
  | { kind: 'reschedule'; at: number };

/** What the server does about turn `seq` right now (spec §4 checkTurn and "Empty room"). */
export function checkTurnDecision(view: MatchView, presence: readonly PresenceEntry[], now: number, seq: number): TurnDecision {
  if (view.room.status !== 'playing') return { kind: 'none' };
  const replay = serverReplay(view);
  if (replay.inFlightSeq !== null || replay.awaitingSeat === null || replay.nextSeq !== seq) return { kind: 'none' };
  const seat = replay.awaitingSeat;
  const player = replay.machine.players[seat]!;
  const skip: TurnDecision = { kind: 'skip', seat, angle: player.lastAngle, power: player.lastPower };
  if (view.seats.find(s => s.seat === seat)?.left ?? true) return skip;
  if (isRoomEmpty(view.seats, presence, now)) return { kind: 'wait', clockStart: now, at: now + ONLINE.staleSeconds * MS };
  const turnEnds = view.room.turnClockStart + ONLINE.turnLimitSeconds * MS;
  if (now >= turnEnds) return skip;
  const lastSeen = presence.find(p => p.seat === seat)?.lastSeen ?? Number.NEGATIVE_INFINITY;
  if (now - lastSeen >= ONLINE.staleSeconds * MS) return skip;
  return { kind: 'reschedule', at: Math.min(turnEnds, lastSeen + ONLINE.staleSeconds * MS) };
}

export interface TurnPlan {
  /** Skip records to insert, in seq order. */
  skips: ShotRecord[];
  /** New `rooms.turnClockStart`. */
  clockStart: number;
  /** The match ended (status → finished). */
  finished: boolean;
  /** When to run `checkTurn` for `checkSeq`; null when nothing needs checking. */
  checkAt: number | null;
  checkSeq: number | null;
}

/**
 * "Starting a turn": evaluates the next turn at once and skips every seat that is already gone,
 * until it reaches one worth waiting for or the match ends. Never skips anyone for staleness in an empty room.
 */
export function planTurnStart(view: MatchView, presence: readonly PresenceEntry[], now: number, clockStart: number): TurnPlan {
  const shots: ShotRecord[] = [...view.shots];
  const skips: ShotRecord[] = [];
  let clock = clockStart;
  for (let guard = 0; guard <= MULTIPLAYER.maxPlayers * MULTIPLAYER.shotsPerRound * MULTIPLAYER.maps.length; guard++) {
    const current: MatchView = { room: { ...view.room, turnClockStart: clock }, seats: view.seats, shots };
    const replay = serverReplay(current);
    if (replay.isMatchComplete) return { skips, clockStart: clock, finished: true, checkAt: null, checkSeq: null };
    const decision = checkTurnDecision(current, presence, now, replay.nextSeq);
    if (decision.kind === 'skip') {
      const record: ShotRecord = {
        seq: replay.nextSeq, seat: decision.seat, angle: decision.angle, power: decision.power,
        outcome: 'miss', witnessOutcome: null, resolution: 'skipped', firedAt: now, resolvedAt: now,
      };
      shots.push(record);
      skips.push(record);
      clock = now;
      continue;
    }
    if (decision.kind === 'wait') return { skips, clockStart: decision.clockStart, finished: false, checkAt: decision.at, checkSeq: replay.nextSeq };
    if (decision.kind === 'reschedule') return { skips, clockStart: clock, finished: false, checkAt: decision.at, checkSeq: replay.nextSeq };
    return { skips, clockStart: clock, finished: false, checkAt: null, checkSeq: null };
  }
  throw new Error('planTurnStart: did not converge');
}

export type InFlightDecision =
  | { kind: 'none' }
  | { kind: 'reschedule'; at: number }
  | { kind: 'resolve'; outcome: ClassifiedOutcome; resolution: 'witness' | 'timeout' };

/** What the server does about an unreported shot (spec §4 checkInFlight). */
export function checkInFlightDecision(view: MatchView, presence: readonly PresenceEntry[], now: number, seq: number): InFlightDecision {
  const shot = view.shots.find(s => s.seq === seq);
  if (!shot || shot.outcome !== null) return { kind: 'none' };
  const shooterLeft = view.seats.find(s => s.seat === shot.seat)?.left ?? true;
  if (shooterLeft && shot.witnessOutcome !== null) return { kind: 'resolve', outcome: shot.witnessOutcome, resolution: 'witness' };
  const deadline = shot.firedAt + ONLINE.inFlightTimeoutSeconds * MS;
  if (now < deadline) return { kind: 'reschedule', at: deadline };
  if (!shooterLeft && isRoomEmpty(view.seats, presence, now)) return { kind: 'reschedule', at: now + ONLINE.staleSeconds * MS };
  return shot.witnessOutcome !== null
    ? { kind: 'resolve', outcome: shot.witnessOutcome, resolution: 'witness' }
    : { kind: 'resolve', outcome: 'miss', resolution: 'timeout' };
}
```

- [ ] **Step 4: Run, check and commit**

Run: `npx vitest run tests/onlineRules.test.ts` (expected PASS), then `npm run check`.

```bash
git add src/rules/onlineRules.ts tests/onlineRules.test.ts
git commit -m "feat(online): pure validation, turn/in-flight timer decisions and turn-start planning"
```

---

### Task 6: Storage: online profile and per-tab token

**Files:**
- Modify: `src/storage/storage.ts`
- Test: `tests/onlineStorage.test.ts`

**Interfaces:**
- Produces:
  - `interface OnlineProfile { name: string; color: number; pattern: string }`
  - `SaveData.online?: { profile: OnlineProfile }`
  - `defaultOnlineProfile(): OnlineProfile`
  - `loadOnlineProfile(): OnlineProfile`
  - `saveOnlineProfile(profile: OnlineProfile): void`
  - `randomToken(): string` (32 lowercase hex characters)
  - `onlineToken(store?: Pick<Storage, 'getItem' | 'setItem'>, make?: () => string): string` (default store is `sessionStorage`)

- [ ] **Step 1: Write the failing test**

```ts
// tests/onlineStorage.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MULTIPLAYER } from '../src/config/tuning';
import {
  defaultOnlineProfile, loadOnlineProfile, loadSaveData, onlineToken, randomToken,
  saveMultiplayerSetup, saveOnlineProfile, defaultPlayerSetups,
} from '../src/storage/storage';

function memoryStore() {
  let data: Record<string, string> = {};
  return {
    getItem: (k: string) => data[k] ?? null,
    setItem: (k: string, v: string) => { data[k] = String(v); },
    clear: () => { data = {}; },
  };
}
const local = memoryStore();
vi.stubGlobal('localStorage', local);

describe('online profile', () => {
  beforeEach(() => local.clear());

  it('defaults when nothing is saved', () => {
    expect(loadOnlineProfile()).toEqual(defaultOnlineProfile());
  });

  it('round-trips a sanitised profile', () => {
    saveOnlineProfile({ name: '  Ann  ', color: MULTIPLAYER.colors[2]!, pattern: MULTIPLAYER.patterns[3]! });
    expect(loadOnlineProfile()).toEqual({ name: 'Ann', color: MULTIPLAYER.colors[2], pattern: MULTIPLAYER.patterns[3] });
  });

  it('replaces a corrupt online field with defaults and keeps other data', () => {
    local.setItem('hitJonh.v1', JSON.stringify({ version: 'hitJonh.v1', solo: {}, settings: {}, online: 'nope' }));
    expect(loadOnlineProfile()).toEqual(defaultOnlineProfile());
    local.setItem('hitJonh.v1', JSON.stringify({ version: 'hitJonh.v1', solo: {}, settings: {}, online: { profile: { name: 7, color: 1, pattern: 'x' } } }));
    expect(loadOnlineProfile()).toEqual({ ...defaultOnlineProfile(), name: 'Player 1' });
  });

  it('never touches the hot-seat roster', () => {
    const roster = defaultPlayerSetups().slice(0, 3);
    saveMultiplayerSetup(roster);
    saveOnlineProfile({ name: 'Zed', color: MULTIPLAYER.colors[1]!, pattern: MULTIPLAYER.patterns[1]! });
    expect(loadSaveData().lastMP).toEqual(roster);
  });

  it('loads saves written before online play existed', () => {
    local.setItem('hitJonh.v1', JSON.stringify({ version: 'hitJonh.v1', solo: {}, settings: { muted: true } }));
    expect(loadSaveData().settings.muted).toBe(true);
    expect(loadSaveData().online).toBeUndefined();
  });
});

describe('onlineToken', () => {
  it('creates 32-hex tokens', () => {
    expect(randomToken()).toMatch(/^[0-9a-f]{32}$/);
  });

  it('keeps one token per tab store across reloads', () => {
    const tab = memoryStore();
    const first = onlineToken(tab);
    expect(onlineToken(tab)).toBe(first);
  });

  it('gives two tabs two different players', () => {
    expect(onlineToken(memoryStore())).not.toBe(onlineToken(memoryStore()));
  });

  it('replaces an invalid stored token', () => {
    const tab = memoryStore();
    tab.setItem('hitJonh.v1.onlineToken', 'not-a-token');
    expect(onlineToken(tab, () => 'a'.repeat(32))).toBe('a'.repeat(32));
  });

  it('still returns a token when storage throws', () => {
    const broken = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } };
    expect(onlineToken(broken)).toMatch(/^[0-9a-f]{32}$/);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run tests/onlineStorage.test.ts`
Expected: FAIL, missing exports.

- [ ] **Step 3: Implement it in `src/storage/storage.ts`**

Add to the interfaces near the top:

```ts
export interface OnlineProfile {
  name: string;
  color: number;
  pattern: string;
}
```

Add a field to `SaveData`:

```ts
  /** Online play: the name and cannon look to use when creating/joining rooms (optional; older saves lack it). */
  online?: { profile: OnlineProfile };
```

Add these functions below `sanitizePlayerSetups`:

```ts
const ONLINE_TOKEN_KEY = 'hitJonh.v1.onlineToken';

export function defaultOnlineProfile(): OnlineProfile {
  return { name: 'Player 1', color: MULTIPLAYER.colors[0]!, pattern: MULTIPLAYER.patterns[0]! };
}

function sanitizeOnlineProfile(raw: unknown): OnlineProfile | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const fallback = defaultOnlineProfile();
  return {
    name: sanitizePlayerName(r.name, 0),
    color: typeof r.color === 'number' && (MULTIPLAYER.colors as readonly number[]).includes(r.color) ? r.color : fallback.color,
    pattern: typeof r.pattern === 'string' && (MULTIPLAYER.patterns as readonly string[]).includes(r.pattern) ? r.pattern : fallback.pattern,
  };
}
```

In `loadSaveData`, after the `progress` line, add:

```ts
    if (parsedObj.online && typeof parsedObj.online === 'object' && !Array.isArray(parsedObj.online)) {
      const profile = sanitizeOnlineProfile((parsedObj.online as Record<string, unknown>).profile);
      if (profile) data.online = { profile };
    }
```

At the end of the file, add:

```ts
export function loadOnlineProfile(): OnlineProfile {
  return loadSaveData().online?.profile ?? defaultOnlineProfile();
}

export function saveOnlineProfile(profile: OnlineProfile): void {
  const data = loadSaveData();
  data.online = { profile: sanitizeOnlineProfile(profile) ?? defaultOnlineProfile() };
  writeSaveData(data);
}

export function randomToken(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * This tab's online identity. sessionStorage survives a reload (the seat is kept) but not a new tab,
 * so two tabs are two players.
 */
export function onlineToken(store: Pick<Storage, 'getItem' | 'setItem'> = sessionStorage, make: () => string = randomToken): string {
  try {
    const existing = store.getItem(ONLINE_TOKEN_KEY);
    if (existing && /^[0-9a-f]{32}$/.test(existing)) return existing;
    const fresh = make();
    store.setItem(ONLINE_TOKEN_KEY, fresh);
    return fresh;
  } catch {
    return make();
  }
}
```

- [ ] **Step 4: Run, check and commit**

Run: `npx vitest run tests/onlineStorage.test.ts tests/storage.test.ts` (expected PASS), then `npm run check`.

```bash
git add src/storage/storage.ts tests/onlineStorage.test.ts
git commit -m "feat(online): saved online profile and per-tab player token"
```

---

### Task 7: Convex project, schema and server helpers

**Owner step first.** Convex needs an interactive login once, which an agent cannot do.

**Files:**
- Modify: `package.json` / `package-lock.json` (add `convex@1.46.0`, exact)
- Modify: `tsconfig.json` (`include` adds `"convex"`)
- Modify: `eslint.config.js` (ignore `convex/_generated`)
- Create: `convex/schema.ts`, `convex/validators.ts`, `convex/model.ts`
- Generated (commit it): `convex/_generated/*`, `convex/tsconfig.json`, `convex/README.md`

**Interfaces:**
- Consumes: `planTurnStart`, `renumberSeats`, `staleLobbySeats`, and the types from `onlineTypes`.
- Produces (in `convex/model.ts`, used by Tasks 8–9):
  - `fail(code: OnlineErrorCode): never`
  - `randomSeed(): number`
  - `getRoomByCode(ctx: Reader, code)`
  - `requireRoom(ctx: Reader, code)`
  - `listPlayers(ctx: Reader, roomId)`
  - `findMember(ctx: Reader, roomId, token)`
  - `requireMember(ctx: Reader, roomId, token)`
  - `listShots(ctx: Reader, roomId, matchNumber)`
  - `listPresence(ctx: Reader, roomId, players)`
  - `toRoomState`, `toSeat`, `toShot`
  - `loadView(ctx: Reader, roomId) → { room, players, shotDocs, presence, view }`
  - `touchPresence(ctx, roomId, playerId, now)`
  - `removeLobbyPlayers(ctx, roomId, playerIds)`
  - `pruneLobby(ctx, roomId, now)`
  - `startTurn(ctx, roomId, now, clockStart)`
  - `resolveShot(ctx, roomId, shotId, outcome, resolution, now)`
  - `startNewMatch(ctx, roomId, keepSeats, now)`
  - `deleteRoomCascade(ctx, roomId)`
- Produces (`convex/validators.ts`): `outcomeValidator`, `resolutionValidator`.

- [ ] **Step 1: Install Convex (exact pin)**

Run: `npm install --save-exact convex@1.46.0`
Expected: `package.json` shows `"convex": "1.46.0"` under `dependencies`.

- [ ] **Step 2: Owner creates the project.** Ask the owner to run this in **their own terminal** (it opens a browser to log in, then asks to create a project; choose a new project, e.g. "hit-jonh"):

```bash
npx convex dev --once
```

Expected afterwards:
- `.env.local` contains `CONVEX_DEPLOYMENT=...` and `VITE_CONVEX_URL=https://....convex.cloud`. It is git-ignored by `*.local`; do not commit it.
- `convex/` exists with `README.md`, `tsconfig.json` and `_generated/`.

Verify with the Convex MCP: `mcp__convex__status` with `projectDir: "E:\\pet_project\\Kill Jonh"`. It should list an `ownDev` deployment. If it does not, stop and ask the owner.

- [ ] **Step 3: Wire TypeScript and ESLint.** In `tsconfig.json`:

```json
  "include": ["src", "tests", "vite.config.ts", "convex"]
```

In `eslint.config.js`:

```js
  { ignores: ['dist', 'node_modules', 'coverage', 'convex/_generated'] },
```

- [ ] **Step 4: Schema and validators**

```ts
// convex/validators.ts
import { v } from 'convex/values';

export const outcomeValidator = v.union(v.literal('ricochet_body'), v.literal('body'), v.literal('hat_only'), v.literal('miss'));
export const resolutionValidator = v.union(v.literal('shooter'), v.literal('witness'), v.literal('timeout'), v.literal('skipped'));
```

```ts
// convex/schema.ts
import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';
import { outcomeValidator, resolutionValidator } from './validators';

export default defineSchema({
  rooms: defineTable({
    code: v.string(),
    status: v.union(v.literal('lobby'), v.literal('playing'), v.literal('finished')),
    maps: v.array(v.string()),
    seed: v.number(),
    matchNumber: v.number(),
    matchStartedAt: v.number(),
    turnClockStart: v.number(),
    rematchDeadline: v.union(v.number(), v.null()),
    /** Last game action (never heartbeats); drives cleanup. */
    updatedAt: v.number(),
  }).index('by_code', ['code']).index('by_updatedAt', ['updatedAt']),

  players: defineTable({
    roomId: v.id('rooms'),
    seat: v.number(),
    name: v.string(),
    color: v.number(),
    pattern: v.string(),
    /** Client secret; never returned by a query. */
    token: v.string(),
    left: v.boolean(),
    rematchReady: v.boolean(),
  }).index('by_room', ['roomId']).index('by_room_token', ['roomId', 'token']),

  /** Separate from players so heartbeats never re-run getRoom. */
  presence: defineTable({
    roomId: v.id('rooms'),
    playerId: v.id('players'),
    lastSeen: v.number(),
  }).index('by_room', ['roomId']).index('by_player', ['playerId']),

  shots: defineTable({
    roomId: v.id('rooms'),
    matchNumber: v.number(),
    seq: v.number(),
    seat: v.number(),
    angle: v.number(),
    power: v.number(),
    outcome: v.union(outcomeValidator, v.null()),
    witnessOutcome: v.union(outcomeValidator, v.null()),
    resolution: v.union(resolutionValidator, v.null()),
    firedAt: v.number(),
    resolvedAt: v.union(v.number(), v.null()),
  }).index('by_room_match_seq', ['roomId', 'matchNumber', 'seq']),
});
```

- [ ] **Step 5: Server helpers.** Every handler in Tasks 8–9 is written in terms of these.

```ts
// convex/model.ts
import { ConvexError } from 'convex/values';
import { internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import type { MutationCtx, QueryCtx } from './_generated/server';
import { planTurnStart } from '../src/rules/onlineRules';
import { renumberSeats, staleLobbySeats } from '../src/rules/onlineRoster';
import type { MatchView, OnlineErrorCode, PresenceEntry, Resolution, RoomState, SeatState, ShotRecord } from '../src/rules/onlineTypes';
import type { ClassifiedOutcome } from '../src/sim/classification';

type Reader = Pick<QueryCtx, 'db'>;

export function fail(code: OnlineErrorCode): never {
  throw new ConvexError({ code });
}

export function randomSeed(): number {
  return Math.floor(Math.random() * 0x1_0000_0000) >>> 0;
}

export async function getRoomByCode(ctx: Reader, code: string): Promise<Doc<'rooms'> | null> {
  return ctx.db.query('rooms').withIndex('by_code', q => q.eq('code', code)).unique();
}

export async function requireRoom(ctx: Reader, code: string): Promise<Doc<'rooms'>> {
  return (await getRoomByCode(ctx, code)) ?? fail('NOT_FOUND');
}

export async function listPlayers(ctx: Reader, roomId: Id<'rooms'>): Promise<Doc<'players'>[]> {
  const rows = await ctx.db.query('players').withIndex('by_room', q => q.eq('roomId', roomId)).collect();
  return rows.sort((a, b) => a.seat - b.seat);
}

export async function findMember(ctx: Reader, roomId: Id<'rooms'>, token: string): Promise<Doc<'players'> | null> {
  return ctx.db.query('players').withIndex('by_room_token', q => q.eq('roomId', roomId).eq('token', token)).unique();
}

export async function requireMember(ctx: Reader, roomId: Id<'rooms'>, token: string): Promise<Doc<'players'>> {
  return (await findMember(ctx, roomId, token)) ?? fail('NOT_MEMBER');
}

export async function listShots(ctx: Reader, roomId: Id<'rooms'>, matchNumber: number): Promise<Doc<'shots'>[]> {
  return ctx.db.query('shots')
    .withIndex('by_room_match_seq', q => q.eq('roomId', roomId).eq('matchNumber', matchNumber))
    .collect();
}

export async function listPresence(ctx: Reader, roomId: Id<'rooms'>, players: readonly Doc<'players'>[]): Promise<PresenceEntry[]> {
  const rows = await ctx.db.query('presence').withIndex('by_room', q => q.eq('roomId', roomId)).collect();
  const seatOf = new Map(players.map(p => [p._id, p.seat]));
  return rows.flatMap(r => {
    const seat = seatOf.get(r.playerId);
    return seat === undefined ? [] : [{ seat, lastSeen: r.lastSeen }];
  });
}

export const toRoomState = (r: Doc<'rooms'>): RoomState => ({
  code: r.code, status: r.status, maps: r.maps, seed: r.seed, matchNumber: r.matchNumber,
  matchStartedAt: r.matchStartedAt, turnClockStart: r.turnClockStart, rematchDeadline: r.rematchDeadline,
});

export const toSeat = (p: Doc<'players'>): SeatState => ({
  seat: p.seat, name: p.name, color: p.color, pattern: p.pattern, left: p.left, rematchReady: p.rematchReady,
});

export const toShot = (s: Doc<'shots'>): ShotRecord => ({
  seq: s.seq, seat: s.seat, angle: s.angle, power: s.power, outcome: s.outcome, witnessOutcome: s.witnessOutcome,
  resolution: s.resolution, firedAt: s.firedAt, resolvedAt: s.resolvedAt,
});

export async function loadView(ctx: Reader, roomId: Id<'rooms'>) {
  const room = (await ctx.db.get(roomId)) ?? fail('NOT_FOUND');
  const players = await listPlayers(ctx, roomId);
  const shotDocs = await listShots(ctx, roomId, room.matchNumber);
  const presence = await listPresence(ctx, roomId, players);
  const view: MatchView = { room: toRoomState(room), seats: players.map(toSeat), shots: shotDocs.map(toShot) };
  return { room, players, shotDocs, presence, view };
}

export async function touchPresence(ctx: MutationCtx, roomId: Id<'rooms'>, playerId: Id<'players'>, now: number): Promise<void> {
  const existing = await ctx.db.query('presence').withIndex('by_player', q => q.eq('playerId', playerId)).unique();
  if (existing) await ctx.db.patch(existing._id, { lastSeen: now });
  else await ctx.db.insert('presence', { roomId, playerId, lastSeen: now });
}

async function deletePlayer(ctx: MutationCtx, playerId: Id<'players'>): Promise<void> {
  const presence = await ctx.db.query('presence').withIndex('by_player', q => q.eq('playerId', playerId)).collect();
  for (const row of presence) await ctx.db.delete(row._id);
  await ctx.db.delete(playerId);
}

/** Lobby only: removes players and keeps seats contiguous (the new seat 0 is host). */
export async function removeLobbyPlayers(ctx: MutationCtx, roomId: Id<'rooms'>, playerIds: readonly Id<'players'>[]): Promise<void> {
  for (const id of playerIds) await deletePlayer(ctx, id);
  for (const p of renumberSeats(await listPlayers(ctx, roomId))) {
    if (p.seat !== p.newSeat) await ctx.db.patch(p._id, { seat: p.newSeat });
  }
}

export async function pruneLobby(ctx: MutationCtx, roomId: Id<'rooms'>, now: number): Promise<void> {
  const players = await listPlayers(ctx, roomId);
  const stale = new Set(staleLobbySeats(players, await listPresence(ctx, roomId, players), now));
  const ids = players.filter(p => stale.has(p.seat)).map(p => p._id);
  if (ids.length > 0) await removeLobbyPlayers(ctx, roomId, ids);
}

/** "Starting a turn" (spec §4): skip gone seats at once, then schedule the next check. */
export async function startTurn(ctx: MutationCtx, roomId: Id<'rooms'>, now: number, clockStart: number): Promise<void> {
  const { room, view, presence } = await loadView(ctx, roomId);
  if (room.status !== 'playing') return;
  const plan = planTurnStart(view, presence, now, clockStart);
  for (const skip of plan.skips) await ctx.db.insert('shots', { roomId, matchNumber: room.matchNumber, ...skip });
  await ctx.db.patch(roomId, plan.finished
    ? { status: 'finished', turnClockStart: plan.clockStart, updatedAt: now }
    : { turnClockStart: plan.clockStart, updatedAt: now });
  if (plan.checkAt !== null && plan.checkSeq !== null) {
    await ctx.scheduler.runAt(plan.checkAt, internal.timers.checkTurn, { roomId, matchNumber: room.matchNumber, seq: plan.checkSeq });
  }
}

export async function resolveShot(ctx: MutationCtx, roomId: Id<'rooms'>, shotId: Id<'shots'>,
  outcome: ClassifiedOutcome, resolution: Resolution, now: number): Promise<void> {
  await ctx.db.patch(shotId, { outcome, resolution, resolvedAt: now });
  await startTurn(ctx, roomId, now, now);
}

/** Rematch: keep only `keepSeats`, renumber them, wipe the old shots and start match n+1. */
export async function startNewMatch(ctx: MutationCtx, roomId: Id<'rooms'>, keepSeats: readonly number[], now: number): Promise<void> {
  const room = (await ctx.db.get(roomId)) ?? fail('NOT_FOUND');
  const players = await listPlayers(ctx, roomId);
  const keep = new Set(keepSeats);
  for (const p of players) if (!keep.has(p.seat)) await deletePlayer(ctx, p._id);
  for (const p of renumberSeats(players.filter(p => keep.has(p.seat)))) {
    await ctx.db.patch(p._id, { seat: p.newSeat, left: false, rematchReady: false });
  }
  for (const shot of await listShots(ctx, roomId, room.matchNumber)) await ctx.db.delete(shot._id);
  await ctx.db.patch(roomId, {
    status: 'playing', matchNumber: room.matchNumber + 1, seed: randomSeed(), matchStartedAt: now,
    turnClockStart: now, rematchDeadline: null, updatedAt: now,
  });
  await startTurn(ctx, roomId, now, now);
}

export async function deleteRoomCascade(ctx: MutationCtx, roomId: Id<'rooms'>): Promise<void> {
  const shots = await ctx.db.query('shots').withIndex('by_room_match_seq', q => q.eq('roomId', roomId)).collect();
  for (const s of shots) await ctx.db.delete(s._id);
  const presence = await ctx.db.query('presence').withIndex('by_room', q => q.eq('roomId', roomId)).collect();
  for (const p of presence) await ctx.db.delete(p._id);
  const players = await ctx.db.query('players').withIndex('by_room', q => q.eq('roomId', roomId)).collect();
  for (const p of players) await ctx.db.delete(p._id);
  await ctx.db.delete(roomId);
}
```

`internal.timers.checkTurn` does not exist until Task 9. To keep this task pushable on its own, add a stub `convex/timers.ts` now; Task 9 replaces it:

```ts
// convex/timers.ts (stub, replaced in Task 9)
import { v } from 'convex/values';
import { internalMutation } from './_generated/server';

export const checkTurn = internalMutation({
  args: { roomId: v.id('rooms'), matchNumber: v.number(), seq: v.number() },
  handler: async () => {},
});
```

- [ ] **Step 6: Push and generate types**

Run: `npx convex dev --once`
Expected: "Convex functions ready!" (schema pushed, `_generated` updated).

If Convex's own type check rejects imports from `../src/...` because of its `lib` setting, set `"lib": ["ES2022", "DOM"]` in `convex/tsconfig.json` and run again. Do not use `--typecheck=disable` to hide real errors.

- [ ] **Step 7: Check and commit**

Run: `npm run check`. Expected: PASS (`tsc` now also checks `convex/`).

```bash
git add package.json package-lock.json tsconfig.json eslint.config.js convex/
git commit -m "feat(online): Convex project, schema and server helpers"
```

Confirm `git status` shows `.env.local` is **not** staged.

---

### Task 8: Convex lobby functions

**Files:**
- Create: `convex/rooms.ts` (queries plus lobby mutations; Task 9 appends the match mutations)

**Interfaces:**
- Consumes: `convex/model.ts` helpers, `assignAppearance`, `validMaps`, `generateRoomCode`, `sanitizePlayerName`, `MULTIPLAYER`.
- Produces (client API used by Task 11 as `api.rooms.*`):
  - `getRoom({ code, token }) → RoomSnapshot | null`
  - `getPresence({ code }) → PresenceEntry[]`
  - `createRoom({ token, name, color, pattern, maps }) → string` (the code)
  - `joinRoom({ code, token, name, color, pattern }) → { seat: number }`
  - `leaveRoom({ code, token }) → null`
  - `setMaps({ code, token, maps }) → null`
  - `startMatch({ code, token }) → null`
  - `heartbeat({ code, token }) → { now: number }`

No Vitest here (no `convex-test`, per spec §8). The logic lives in the pure helpers tested in Tasks 4–5. These handlers are verified by typecheck, by the push, and by the MCP smoke run in Step 3.

- [ ] **Step 1: Write the handlers**

```ts
// convex/rooms.ts
import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { MULTIPLAYER } from '../src/config/tuning';
import { assignAppearance } from '../src/rules/onlineRoster';
import { validMaps } from '../src/rules/onlineRules';
import { sanitizePlayerName } from '../src/rules/playerName';
import { generateRoomCode } from '../src/rules/roomCode';
import type { RoomSnapshot } from '../src/rules/onlineTypes';
import {
  fail, findMember, getRoomByCode, listPlayers, listPresence, listShots, loadView, pruneLobby, randomSeed,
  removeLobbyPlayers, requireMember, requireRoom, startTurn, toRoomState, toSeat, toShot, touchPresence,
} from './model';

const isToken = (token: string) => /^[0-9a-f]{32}$/.test(token);
const profileArgs = { name: v.string(), color: v.number(), pattern: v.string() };

export const getRoom = query({
  args: { code: v.string(), token: v.string() },
  handler: async (ctx, { code, token }): Promise<RoomSnapshot | null> => {
    const room = await getRoomByCode(ctx, code);
    if (!room) return null;
    const players = await listPlayers(ctx, room._id);
    const shots = await listShots(ctx, room._id, room.matchNumber);
    return {
      room: toRoomState(room),
      seats: players.map(toSeat),
      shots: shots.map(toShot),
      you: players.find(p => p.token === token)?.seat ?? null,
    };
  },
});

export const getPresence = query({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const room = await getRoomByCode(ctx, code);
    if (!room) return [];
    return listPresence(ctx, room._id, await listPlayers(ctx, room._id));
  },
});

export const createRoom = mutation({
  args: { token: v.string(), maps: v.array(v.string()), ...profileArgs },
  handler: async (ctx, args): Promise<string> => {
    if (!isToken(args.token)) fail('NOT_MEMBER');
    if (!validMaps(args.maps)) fail('INVALID_MAPS');
    const now = Date.now();
    let code = generateRoomCode(Math.random);
    for (let attempt = 0; attempt < 10 && (await getRoomByCode(ctx, code)); attempt++) code = generateRoomCode(Math.random);
    if (await getRoomByCode(ctx, code)) throw new Error('Could not allocate a room code');
    const roomId = await ctx.db.insert('rooms', {
      code, status: 'lobby', maps: args.maps, seed: 0, matchNumber: 0, matchStartedAt: 0,
      turnClockStart: 0, rematchDeadline: null, updatedAt: now,
    });
    const look = assignAppearance([], args);
    const playerId = await ctx.db.insert('players', {
      roomId, seat: 0, name: sanitizePlayerName(args.name, 0), color: look.color, pattern: look.pattern,
      token: args.token, left: false, rematchReady: false,
    });
    await touchPresence(ctx, roomId, playerId, now);
    return code;
  },
});

export const joinRoom = mutation({
  args: { code: v.string(), token: v.string(), ...profileArgs },
  handler: async (ctx, args): Promise<{ seat: number }> => {
    if (!isToken(args.token)) fail('NOT_MEMBER');
    const room = await requireRoom(ctx, args.code);
    const now = Date.now();
    const mine = await findMember(ctx, room._id, args.token);
    if (mine) {
      if (mine.left && room.status === 'playing') await ctx.db.patch(mine._id, { left: false });
      await touchPresence(ctx, room._id, mine._id, now);
      return { seat: mine.seat };
    }
    if (room.status !== 'lobby') fail('ALREADY_STARTED');
    await pruneLobby(ctx, room._id, now);
    const players = await listPlayers(ctx, room._id);
    if (players.length >= MULTIPLAYER.maxPlayers) fail('FULL');
    const seat = players.length;
    const look = assignAppearance(players, args);
    const playerId = await ctx.db.insert('players', {
      roomId: room._id, seat, name: sanitizePlayerName(args.name, seat), color: look.color, pattern: look.pattern,
      token: args.token, left: false, rematchReady: false,
    });
    await touchPresence(ctx, room._id, playerId, now);
    await ctx.db.patch(room._id, { updatedAt: now });
    return { seat };
  },
});

export const setMaps = mutation({
  args: { code: v.string(), token: v.string(), maps: v.array(v.string()) },
  handler: async (ctx, { code, token, maps }) => {
    const room = await requireRoom(ctx, code);
    const me = await requireMember(ctx, room._id, token);
    if (room.status !== 'lobby') fail('ALREADY_STARTED');
    if (me.seat !== 0) fail('NOT_HOST');
    if (!validMaps(maps)) fail('INVALID_MAPS');
    await ctx.db.patch(room._id, { maps, updatedAt: Date.now() });
    return null;
  },
});

export const startMatch = mutation({
  args: { code: v.string(), token: v.string() },
  handler: async (ctx, { code, token }) => {
    const room = await requireRoom(ctx, code);
    const me = await requireMember(ctx, room._id, token);
    if (room.status !== 'lobby') fail('ALREADY_STARTED');
    if (me.seat !== 0) fail('NOT_HOST');
    const now = Date.now();
    await touchPresence(ctx, room._id, me._id, now);
    await pruneLobby(ctx, room._id, now);
    if ((await listPlayers(ctx, room._id)).length < MULTIPLAYER.minPlayers) fail('NOT_ENOUGH_PLAYERS');
    await ctx.db.patch(room._id, {
      status: 'playing', seed: randomSeed(), matchStartedAt: now, turnClockStart: now, rematchDeadline: null, updatedAt: now,
    });
    await startTurn(ctx, room._id, now, now);
    return null;
  },
});

export const heartbeat = mutation({
  args: { code: v.string(), token: v.string() },
  handler: async (ctx, { code, token }) => {
    const now = Date.now();
    const room = await getRoomByCode(ctx, code);
    if (!room) return { now };
    const me = await findMember(ctx, room._id, token);
    if (!me) return { now };
    await touchPresence(ctx, room._id, me._id, now);
    // A vanished host is replaced here, so the lobby never needs a newcomer to unstick it.
    if (room.status === 'lobby') await pruneLobby(ctx, room._id, now);
    return { now };
  },
});

export const leaveRoom = mutation({
  args: { code: v.string(), token: v.string() },
  handler: async (ctx, { code, token }) => {
    const room = await getRoomByCode(ctx, code);
    if (!room) return null;
    const me = await findMember(ctx, room._id, token);
    if (!me) return null;
    const now = Date.now();
    if (room.status === 'lobby') {
      await removeLobbyPlayers(ctx, room._id, [me._id]);
      await ctx.db.patch(room._id, { updatedAt: now });
      return null;
    }
    await ctx.db.patch(me._id, { left: true, rematchReady: false });
    await ctx.db.patch(room._id, { updatedAt: now });
    await afterLeave(ctx, room._id, me.seat, now);
    return null;
  },
});
```

`afterLeave` depends on match logic; Task 9 implements it. For now, add this temporary version at the bottom of `convex/rooms.ts` so the file compiles:

```ts
import type { MutationCtx } from './_generated/server';
import type { Id } from './_generated/dataModel';

/** Replaced in Task 9. */
async function afterLeave(_ctx: MutationCtx, _roomId: Id<'rooms'>, _seat: number, _now: number): Promise<void> {}
```

(Move these two `import type` lines to the top of the file with the other imports.)

`loadView` is imported for Task 9; if lint flags it as unused now, leave it out of the import until Task 9.

- [ ] **Step 2: Push**

Run: `npx convex dev --once`, then `npm run check`
Expected: both pass.

- [ ] **Step 3: Smoke-test through the Convex MCP.** Use `mcp__convex__status` to get the `ownDev` deployment selector. Then run these with `mcp__convex__run`, using two fake tokens `T1 = "1111…"` (32 × `1`) and `T2 = "2222…"` (32 × `2`):
  1. `rooms:createRoom` `{ "token": T1, "name": "Ann", "color": 16729156, "pattern": "solid", "maps": ["backyard"] }` returns a 5-char code `C`.
  2. `rooms:joinRoom` `{ "code": C, "token": T2, "name": "Bob", "color": 16729156, "pattern": "solid" }` returns `{ "seat": 1 }`.
  3. `rooms:getRoom` `{ "code": C, "token": T2 }`: `you` is 1, seat 1's colour/pattern differ from seat 0's, and no `token` field appears anywhere.
  4. `rooms:startMatch` `{ "code": C, "token": T2 }` fails with `NOT_HOST`.
  5. `rooms:startMatch` `{ "code": C, "token": T1 }` returns null. `getRoom` now shows `status: "playing"` and a non-zero `seed`.
  6. `rooms:joinRoom` with a third token fails with `ALREADY_STARTED`.

Record the results (pass/fail per step) in the commit message body. If any step fails, fix it before committing.

- [ ] **Step 4: Commit**

```bash
git add convex/rooms.ts convex/_generated
git commit -m "feat(online): Convex room queries and lobby mutations"
```

---

### Task 9: Convex match functions, timers and cleanup cron

**Files:**
- Modify: `convex/rooms.ts` (add `fireShot`, `reportOutcome`, `reportWitness`, `requestRematch`; replace `afterLeave`)
- Modify: `convex/timers.ts` (replace the stub)
- Create: `convex/crons.ts`

**Interfaces:**
- Consumes: `validateFire`, `validateReport`, `acceptWitness`, `checkTurnDecision`, `checkInFlightDecision`, `rematchDecision`, `replayMatch`, and the model helpers.
- Produces (client API):
  - `fireShot({ code, token, matchNumber, seq, angle, power }) → null`
  - `reportOutcome({ code, token, matchNumber, seq, outcome }) → null`
  - `reportWitness({ code, token, matchNumber, seq, outcome }) → null` (never throws)
  - `requestRematch({ code, token, matchNumber }) → null` (never throws)
- Produces (internal): `timers.checkTurn`, `timers.checkInFlight`, `timers.startRematch({ roomId, matchNumber, deadline })`, `timers.cleanupRooms`.

- [ ] **Step 1: Match mutations.** Add to `convex/rooms.ts`, and extend the imports with: `internal` from `./_generated/api`; `ONLINE` from `../src/config/tuning`; `acceptWitness, checkInFlightDecision, validateFire, validateReport` from `../src/rules/onlineRules`; `rematchDecision` from `../src/rules/onlineRoster`; `replayMatch` from `../src/rules/replayMatch`; `outcomeValidator` from `./validators`; `resolveShot, startNewMatch` from `./model`.

```ts
const shotArgs = { code: v.string(), token: v.string(), matchNumber: v.number(), seq: v.number() };

export const fireShot = mutation({
  args: { ...shotArgs, angle: v.number(), power: v.number() },
  handler: async (ctx, args) => {
    const room = await requireRoom(ctx, args.code);
    const me = await requireMember(ctx, room._id, args.token);
    const now = Date.now();
    const { view } = await loadView(ctx, room._id);
    const check = validateFire(view, me.seat, args);
    if (!check.ok) fail(check.code);
    await touchPresence(ctx, room._id, me._id, now);
    if (check.duplicate) return null;
    await ctx.db.insert('shots', {
      roomId: room._id, matchNumber: args.matchNumber, seq: args.seq, seat: me.seat, angle: args.angle, power: args.power,
      outcome: null, witnessOutcome: null, resolution: null, firedAt: now, resolvedAt: null,
    });
    await ctx.db.patch(room._id, { updatedAt: now });
    await ctx.scheduler.runAt(now + ONLINE.inFlightTimeoutSeconds * 1000, internal.timers.checkInFlight,
      { roomId: room._id, matchNumber: args.matchNumber, seq: args.seq });
    return null;
  },
});

export const reportOutcome = mutation({
  args: { ...shotArgs, outcome: outcomeValidator },
  handler: async (ctx, args) => {
    const room = await requireRoom(ctx, args.code);
    const me = await requireMember(ctx, room._id, args.token);
    const now = Date.now();
    const { view, shotDocs } = await loadView(ctx, room._id);
    const check = validateReport(view, me.seat, args);
    if (!check.ok) fail(check.code);
    await touchPresence(ctx, room._id, me._id, now);
    if (check.duplicate) return null;
    const shot = shotDocs.find(s => s.seq === args.seq)!;
    await resolveShot(ctx, room._id, shot._id, args.outcome, 'shooter', now);
    return null;
  },
});

export const reportWitness = mutation({
  args: { ...shotArgs, outcome: outcomeValidator },
  handler: async (ctx, args) => {
    const room = await getRoomByCode(ctx, args.code);
    if (!room) return null;
    const me = await findMember(ctx, room._id, args.token);
    if (!me) return null;
    const { view, shotDocs } = await loadView(ctx, room._id);
    if (!acceptWitness(view, me.seat, args)) return null;
    const shot = shotDocs.find(s => s.seq === args.seq)!;
    await ctx.db.patch(shot._id, { witnessOutcome: args.outcome });
    // If the shooter already left, the first witness resolves the shot at once.
    const now = Date.now();
    const fresh = await loadView(ctx, room._id);
    const decision = checkInFlightDecision(fresh.view, fresh.presence, now, args.seq);
    if (decision.kind === 'resolve') await resolveShot(ctx, room._id, shot._id, decision.outcome, decision.resolution, now);
    return null;
  },
});

export const requestRematch = mutation({
  args: { code: v.string(), token: v.string(), matchNumber: v.number() },
  handler: async (ctx, { code, token, matchNumber }) => {
    const room = await getRoomByCode(ctx, code);
    if (!room || room.status !== 'finished' || room.matchNumber !== matchNumber) return null;
    const me = await findMember(ctx, room._id, token);
    if (!me || me.left) return null;
    const now = Date.now();
    await ctx.db.patch(me._id, { rematchReady: true });
    await ctx.db.patch(room._id, { updatedAt: now });
    const { view } = await loadView(ctx, room._id);
    const decision = rematchDecision(view.seats, false);
    if (decision.kind === 'start') {
      await startNewMatch(ctx, room._id, decision.seats, now);
      return null;
    }
    if (room.rematchDeadline === null) {
      const deadline = now + ONLINE.rematchWindowSeconds * 1000;
      await ctx.db.patch(room._id, { rematchDeadline: deadline });
      await ctx.scheduler.runAt(deadline, internal.timers.startRematch, { roomId: room._id, matchNumber, deadline });
    }
    return null;
  },
});
```

Replace the temporary `afterLeave` with:

```ts
/** After `left` is set: resolve my unfinished shot if a witness exists, skip my pending turn, or re-check rematch readiness. */
async function afterLeave(ctx: MutationCtx, roomId: Id<'rooms'>, seat: number, now: number): Promise<void> {
  const { room, view, presence, shotDocs } = await loadView(ctx, roomId);
  if (room.status === 'playing') {
    const replay = replayMatch({ seats: view.seats, maps: view.room.maps, seed: view.room.seed, shots: view.shots }, { includeInFlight: true });
    if (replay.inFlightSeq !== null) {
      const decision = checkInFlightDecision(view, presence, now, replay.inFlightSeq);
      const shot = shotDocs.find(s => s.seq === replay.inFlightSeq)!;
      if (decision.kind === 'resolve') await resolveShot(ctx, roomId, shot._id, decision.outcome, decision.resolution, now);
    } else if (replay.awaitingSeat === seat) {
      await startTurn(ctx, roomId, now, view.room.turnClockStart);
    }
    return;
  }
  if (room.status === 'finished' && room.rematchDeadline !== null) {
    const decision = rematchDecision(view.seats, false);
    if (decision.kind === 'start') await startNewMatch(ctx, roomId, decision.seats, now);
  }
}
```

- [ ] **Step 2: Timers**

```ts
// convex/timers.ts
import { v } from 'convex/values';
import { internal } from './_generated/api';
import { internalMutation } from './_generated/server';
import { ONLINE } from '../src/config/tuning';
import { rematchDecision } from '../src/rules/onlineRoster';
import { checkInFlightDecision, checkTurnDecision } from '../src/rules/onlineRules';
import { deleteRoomCascade, loadView, resolveShot, startNewMatch, startTurn } from './model';

const turnArgs = { roomId: v.id('rooms'), matchNumber: v.number(), seq: v.number() };

export const checkTurn = internalMutation({
  args: turnArgs,
  handler: async (ctx, { roomId, matchNumber, seq }) => {
    const room = await ctx.db.get(roomId);
    if (!room || room.status !== 'playing' || room.matchNumber !== matchNumber) return;
    const now = Date.now();
    const { view, presence } = await loadView(ctx, roomId);
    const decision = checkTurnDecision(view, presence, now, seq);
    if (decision.kind === 'none') return;
    if (decision.kind === 'wait') {
      // Empty room: restart the turn clock (not a game action, so updatedAt is untouched).
      await ctx.db.patch(roomId, { turnClockStart: decision.clockStart });
      await ctx.scheduler.runAt(decision.at, internal.timers.checkTurn, { roomId, matchNumber, seq });
      return;
    }
    if (decision.kind === 'reschedule') {
      await ctx.scheduler.runAt(decision.at, internal.timers.checkTurn, { roomId, matchNumber, seq });
      return;
    }
    await ctx.db.insert('shots', {
      roomId, matchNumber, seq, seat: decision.seat, angle: decision.angle, power: decision.power,
      outcome: 'miss', witnessOutcome: null, resolution: 'skipped', firedAt: now, resolvedAt: now,
    });
    await startTurn(ctx, roomId, now, now);
  },
});

export const checkInFlight = internalMutation({
  args: turnArgs,
  handler: async (ctx, { roomId, matchNumber, seq }) => {
    const room = await ctx.db.get(roomId);
    if (!room || room.status !== 'playing' || room.matchNumber !== matchNumber) return;
    const now = Date.now();
    const { view, presence, shotDocs } = await loadView(ctx, roomId);
    const decision = checkInFlightDecision(view, presence, now, seq);
    if (decision.kind === 'reschedule') {
      await ctx.scheduler.runAt(decision.at, internal.timers.checkInFlight, { roomId, matchNumber, seq });
    } else if (decision.kind === 'resolve') {
      const shot = shotDocs.find(s => s.seq === seq)!;
      await resolveShot(ctx, roomId, shot._id, decision.outcome, decision.resolution, now);
    }
  },
});

export const startRematch = internalMutation({
  args: { roomId: v.id('rooms'), matchNumber: v.number(), deadline: v.number() },
  handler: async (ctx, { roomId, matchNumber, deadline }) => {
    const room = await ctx.db.get(roomId);
    // A reset followed by a new press sets a new deadline; this older timer must then do nothing.
    if (!room || room.status !== 'finished' || room.matchNumber !== matchNumber || room.rematchDeadline !== deadline) return;
    const now = Date.now();
    const { view, players } = await loadView(ctx, roomId);
    const decision = rematchDecision(view.seats, true);
    if (decision.kind === 'start') {
      await startNewMatch(ctx, roomId, decision.seats, now);
      return;
    }
    for (const p of players) if (p.rematchReady) await ctx.db.patch(p._id, { rematchReady: false });
    await ctx.db.patch(roomId, { rematchDeadline: null });
  },
});

export const cleanupRooms = internalMutation({
  args: {},
  handler: async ctx => {
    const cutoff = Date.now() - ONLINE.roomTtlHours * 3600 * 1000;
    const old = await ctx.db.query('rooms').withIndex('by_updatedAt', q => q.lt('updatedAt', cutoff)).take(50);
    for (const room of old) await deleteRoomCascade(ctx, room._id);
  },
});
```

```ts
// convex/crons.ts
import { cronJobs } from 'convex/server';
import { internal } from './_generated/api';

const crons = cronJobs();
crons.interval('clean up inactive rooms', { hours: 1 }, internal.timers.cleanupRooms, {});
export default crons;
```

- [ ] **Step 3: Push and check**

Run: `npx convex dev --once`, then `npm run check`
Expected: both pass.

- [ ] **Step 4: Smoke-test a short match through the MCP.** Create a fresh room with T1/T2 as in Task 8, using `maps: ["backyard"]`, and start it. Then:
  1. `getRoom` shows no shots; seat 0 is up (round 0 starts with seat 0).
  2. `rooms:fireShot` `{ code, token: T2, matchNumber: 0, seq: 0, angle: 45, power: 60 }` fails with `NOT_YOUR_TURN`.
  3. `rooms:fireShot` with T1, seq 0: succeeds. The same call again also succeeds (duplicate). With `power: 61` it fails with `CONFLICT`.
  4. `rooms:reportOutcome` `{ …T2, seq: 0, outcome: "body" }` fails with `NOT_YOUR_TURN`. With T1 it succeeds; `getRoom` shows `outcome: "body"`, `resolution: "shooter"`.
  5. `rooms:fireShot` T2 seq 1, then `rooms:reportWitness` T1 seq 1 `"miss"`; `getRoom` shows `witnessOutcome: "miss"`, `outcome: null`.
  6. `rooms:leaveRoom` T2. The witness should resolve seq 1 at once: `outcome: "miss"`, `resolution: "witness"`. The next turn is seat 0's; seat 1 is skipped automatically whenever its turn comes.
  7. Use `mcp__convex__logs` to confirm no function errors were logged.

  The timeouts (120 s turn, 40 s in-flight, 90 s stale) are verified in Task 15 with real clients. Record the results in the commit body.

- [ ] **Step 5: Commit**

```bash
git add convex/
git commit -m "feat(online): Convex match mutations, server-side timers and cleanup cron"
```

---

### Task 10: `OnlineMatchTracker` (pure client state)

**Files:**
- Create: `src/rules/onlineMatch.ts`
- Test: `tests/onlineMatch.test.ts`

**Interfaces:**
- Consumes: `replayMatch`, `isFresh`, `isRoomEmpty`, `RoomSnapshot`, `PresenceEntry`, `ShotRecord`, `ONLINE`.
- Produces `class OnlineMatchTracker` with:
  - `snapshot: RoomSnapshot | null`, `mySeat: number | null`, `isLeaving: boolean`, `presented: number` (getters)
  - `markLeaving(): void`
  - `setPresence(entries: readonly PresenceEntry[]): void`
  - `update(next: RoomSnapshot | null): TrackerUpdate`, where `TrackerUpdate = { roomGone: boolean; removal: 'none' | 'rejoin' | 'notIncluded'; rebuild: boolean }`
  - `resetPresentation(): void`
  - `resolvedPrefix(): ShotRecord[]`
  - `nextFireSeq(): number`
  - `markFiredByMe(seq: number): void`
  - `markPresented(seq: number): void`
  - `officialOutcome(seq: number): ClassifiedOutcome | null`
  - `nextPlayback(): PlaybackItem | null`, where `PlaybackItem = { shot: ShotRecord; kind: 'skipped' | 'remote' | 'recovered'; name: string }`
  - `isMyTurnToAim(): boolean`
  - `connectedSeats(now: number): Set<number>`
  - `countdowns(now: number): Countdowns`, where `Countdowns = { turn: Countdown | null; missing: Countdown | null; rematch: number | null }` and `Countdown = { seat: number; name: string; secondsLeft: number }`

- [ ] **Step 1: Write the failing test**

```ts
// tests/onlineMatch.test.ts
import { describe, expect, it } from 'vitest';
import { OnlineMatchTracker } from '../src/rules/onlineMatch';
import type { RoomSnapshot, RoomState, SeatState } from '../src/rules/onlineTypes';
import type { ClassifiedOutcome } from '../src/sim/classification';
import { makeView } from './onlineFixtures';

function snap(outcomes: (ClassifiedOutcome | null)[], you: number | null,
  room: Partial<RoomState> = {}, seats: Partial<SeatState>[] = []): RoomSnapshot {
  const view = makeView(2, outcomes, room, seats);
  return { room: view.room, seats: [...view.seats], shots: [...view.shots], you };
}

describe('OnlineMatchTracker: rebuilds and playback', () => {
  it('rebuilds once per match, starting after the resolved prefix (duplicate snapshots are ignored)', () => {
    const t = new OnlineMatchTracker();
    const s = snap(['body', 'miss', 'hat_only', null], 1);
    expect(t.update(s)).toEqual({ roomGone: false, removal: 'none', rebuild: true });
    expect(t.presented).toBe(3);
    expect(t.update(s).rebuild).toBe(false);
    expect(t.update({ ...s }).rebuild).toBe(false);
  });

  it('queues an in-flight remote shot and returns it until presented', () => {
    const t = new OnlineMatchTracker();
    t.update(snap(['body', 'miss', 'hat_only', null], 0)); // seq 3 is seat 1's shot; I am seat 0
    const first = t.nextPlayback();
    expect(first?.kind).toBe('remote');
    expect(first?.shot.seq).toBe(3);
    expect(t.nextPlayback()).toEqual(first);
    t.markPresented(3);
    expect(t.nextPlayback()).toBeNull();
  });

  it('marks skipped shots and recovers my own unfinished shot after a reload', () => {
    const skipped = snap(['body', 'miss'], 0);
    skipped.shots[1] = { ...skipped.shots[1]!, resolution: 'skipped' };
    const t1 = new OnlineMatchTracker();
    t1.update({ ...skipped, shots: [skipped.shots[0]!] });
    t1.update(skipped);
    expect(t1.nextPlayback()).toMatchObject({ kind: 'skipped', name: 'P2' });

    const t2 = new OnlineMatchTracker();
    t2.update(snap(['body', null], 1));
    expect(t2.nextPlayback()?.kind).toBe('recovered');
  });

  it('never queues a shot this page fired itself', () => {
    const t = new OnlineMatchTracker();
    t.update(snap(['body'], 1));
    t.markFiredByMe(t.nextFireSeq());
    t.update(snap(['body', null], 1));
    expect(t.nextPlayback()).toBeNull();
  });

  it('reports the official outcome once it arrives', () => {
    const t = new OnlineMatchTracker();
    t.update(snap(['body', null], 0));
    expect(t.officialOutcome(1)).toBeNull();
    t.update(snap(['body', 'hat_only'], 0));
    expect(t.officialOutcome(1)).toBe('hat_only');
  });
});

describe('OnlineMatchTracker: whose turn', () => {
  it('lets me aim only when caught up and awaited', () => {
    const mine = new OnlineMatchTracker();
    mine.update(snap(['body'], 1));
    expect(mine.isMyTurnToAim()).toBe(true);

    const theirs = new OnlineMatchTracker();
    theirs.update(snap(['body'], 0));
    expect(theirs.isMyTurnToAim()).toBe(false);

    const flying = new OnlineMatchTracker();
    flying.update(snap(['body', null], 1));
    expect(flying.isMyTurnToAim()).toBe(false);

    const behind = new OnlineMatchTracker();
    behind.update(snap(['body'], 0));
    behind.update(snap(['body', 'miss'], 0));
    expect(behind.isMyTurnToAim()).toBe(false);
    behind.markPresented(1);
    expect(behind.isMyTurnToAim()).toBe(true);

    mine.markLeaving();
    expect(mine.isMyTurnToAim()).toBe(false);
  });

  it('gives the next fire seq from the server view', () => {
    const t = new OnlineMatchTracker();
    t.update(snap(['body', 'miss'], 0));
    expect(t.nextFireSeq()).toBe(2);
  });
});

describe('OnlineMatchTracker: removal and room loss', () => {
  it('asks to rejoin when pruned from a lobby, but not after leaving on purpose', () => {
    const t = new OnlineMatchTracker();
    t.update(snap([], 1, { status: 'lobby' }));
    expect(t.update(snap([], null, { status: 'lobby' })).removal).toBe('rejoin');

    const leaver = new OnlineMatchTracker();
    leaver.update(snap([], 1, { status: 'lobby' }));
    leaver.markLeaving();
    expect(leaver.update(snap([], null, { status: 'lobby' })).removal).toBe('none');
  });

  it('reports "not included" when a rematch drops me', () => {
    const t = new OnlineMatchTracker();
    t.update(snap(['body'], 1, { status: 'finished' }));
    expect(t.update(snap([], null, { status: 'playing', matchNumber: 1 })).removal).toBe('notIncluded');
  });

  it('ignores a first snapshot without a seat', () => {
    expect(new OnlineMatchTracker().update(snap([], null, { status: 'lobby' })).removal).toBe('none');
  });

  it('flags a vanished room unless leaving', () => {
    const t = new OnlineMatchTracker();
    expect(t.update(null).roomGone).toBe(true);
    t.markLeaving();
    expect(t.update(null).roomGone).toBe(false);
  });

  it('rebuilds from zero on a rematch', () => {
    const t = new OnlineMatchTracker();
    t.update(snap(['body', 'miss'], 0));
    expect(t.presented).toBe(2);
    const next = t.update(snap([], 0, { matchNumber: 1 }));
    expect(next.rebuild).toBe(true);
    expect(t.presented).toBe(0);
  });
});

describe('OnlineMatchTracker: countdowns', () => {
  it('shows the turn countdown only after turnWarnSeconds', () => {
    const t = new OnlineMatchTracker();
    t.update(snap([], 1));
    t.setPresence([{ seat: 0, lastSeen: 94_000 }, { seat: 1, lastSeen: 94_000 }]);
    expect(t.countdowns(89_000).turn).toBeNull();
    expect(t.countdowns(95_000).turn).toEqual({ seat: 0, name: 'P1', secondsLeft: 25 });
  });

  it('warns about a quiet active player unless the whole room is quiet', () => {
    const t = new OnlineMatchTracker();
    t.update(snap([], 1));
    t.setPresence([{ seat: 0, lastSeen: 0 }, { seat: 1, lastSeen: 69_000 }]);
    expect(t.countdowns(70_000).missing).toEqual({ seat: 0, name: 'P1', secondsLeft: 20 });
    t.setPresence([{ seat: 0, lastSeen: 0 }, { seat: 1, lastSeen: 0 }]);
    expect(t.countdowns(200_000).missing).toBeNull();
  });

  it('counts down the rematch window', () => {
    const t = new OnlineMatchTracker();
    t.update(snap(['body'], 0, { status: 'finished', rematchDeadline: 30_000 }));
    expect(t.countdowns(12_500).rematch).toBe(18);
  });

  it('lists connected seats', () => {
    const t = new OnlineMatchTracker();
    t.update(snap([], 0, {}, [{}, { left: true }]));
    t.setPresence([{ seat: 0, lastSeen: 99_000 }, { seat: 1, lastSeen: 99_000 }]);
    expect([...t.connectedSeats(100_000)]).toEqual([0]);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run tests/onlineMatch.test.ts`
Expected: FAIL, missing module.

- [ ] **Step 3: Implement it**

```ts
// src/rules/onlineMatch.ts
import { ONLINE } from '../config/tuning';
import type { ClassifiedOutcome } from '../sim/classification';
import { isFresh, isRoomEmpty } from './onlineRules';
import type { PresenceEntry, RoomSnapshot, ShotRecord } from './onlineTypes';
import { replayMatch, type ReplayResult } from './replayMatch';

const MS = 1000;

export type PlaybackKind = 'skipped' | 'remote' | 'recovered';
export interface PlaybackItem { shot: ShotRecord; kind: PlaybackKind; name: string }
export type Removal = 'none' | 'rejoin' | 'notIncluded';
export interface TrackerUpdate { roomGone: boolean; removal: Removal; rebuild: boolean }
export interface Countdown { seat: number; name: string; secondsLeft: number }
export interface Countdowns { turn: Countdown | null; missing: Countdown | null; rematch: number | null }

/** Pure client-side view of an online room: what to present next and what the local player may do. */
export class OnlineMatchTracker {
  private snap: RoomSnapshot | null = null;
  private presence: readonly PresenceEntry[] = [];
  private leaving = false;
  private hadSeat = false;
  private builtMatch: number | null = null;
  private presentedSeq = 0;
  private readonly firedByMe = new Set<number>();
  private cache: { snap: RoomSnapshot; result: ReplayResult } | null = null;

  get snapshot(): RoomSnapshot | null { return this.snap; }
  get mySeat(): number | null { return this.snap?.you ?? null; }
  get isLeaving(): boolean { return this.leaving; }
  /** Shots with seq below this have been shown (or skipped over on a rebuild). */
  get presented(): number { return this.presentedSeq; }

  markLeaving(): void { this.leaving = true; }
  setPresence(entries: readonly PresenceEntry[]): void { this.presence = entries; }

  update(next: RoomSnapshot | null): TrackerUpdate {
    if (next === null) {
      this.snap = null;
      return { roomGone: !this.leaving, removal: 'none', rebuild: false };
    }
    this.snap = next;
    if (next.you === null) {
      const removal: Removal = this.hadSeat && !this.leaving ? (next.room.status === 'lobby' ? 'rejoin' : 'notIncluded') : 'none';
      this.hadSeat = false;
      return { roomGone: false, removal, rebuild: false };
    }
    this.hadSeat = true;
    if (next.room.status === 'lobby') {
      this.builtMatch = null;
      return { roomGone: false, removal: 'none', rebuild: false };
    }
    if (this.builtMatch === next.room.matchNumber) return { roomGone: false, removal: 'none', rebuild: false };
    this.builtMatch = next.room.matchNumber;
    this.resetPresentation();
    return { roomGone: false, removal: 'none', rebuild: true };
  }

  /** Present from the end of the resolved prefix (match start, rematch, reload, resync). */
  resetPresentation(): void {
    this.presentedSeq = this.resolvedPrefix().length;
    this.firedByMe.clear();
  }

  resolvedPrefix(): ShotRecord[] {
    const shots = [...(this.snap?.shots ?? [])].sort((a, b) => a.seq - b.seq);
    const prefix: ShotRecord[] = [];
    for (const shot of shots) {
      if (shot.seq !== prefix.length || shot.outcome === null) break;
      prefix.push(shot);
    }
    return prefix;
  }

  private serverView(): ReplayResult | null {
    const snap = this.snap;
    if (!snap || snap.room.status === 'lobby') return null;
    if (this.cache?.snap !== snap) {
      this.cache = { snap, result: replayMatch({ seats: snap.seats, maps: snap.room.maps, seed: snap.room.seed, shots: snap.shots }, { includeInFlight: true }) };
    }
    return this.cache.result;
  }

  nextFireSeq(): number { return this.serverView()?.nextSeq ?? 0; }
  markFiredByMe(seq: number): void { this.firedByMe.add(seq); }
  markPresented(seq: number): void { this.presentedSeq = Math.max(this.presentedSeq, seq + 1); }

  officialOutcome(seq: number): ClassifiedOutcome | null {
    return this.snap?.shots.find(s => s.seq === seq)?.outcome ?? null;
  }

  private seatName(seat: number): string {
    return this.snap?.seats.find(s => s.seat === seat)?.name ?? `Player ${seat + 1}`;
  }

  nextPlayback(): PlaybackItem | null {
    const snap = this.snap;
    if (!snap || snap.room.status === 'lobby') return null;
    const shot = snap.shots.find(s => s.seq === this.presentedSeq);
    if (!shot || this.firedByMe.has(shot.seq)) return null;
    const name = this.seatName(shot.seat);
    if (shot.resolution === 'skipped') return { shot, kind: 'skipped', name };
    if (shot.seat === snap.you && shot.outcome === null) return { shot, kind: 'recovered', name };
    return { shot, kind: 'remote', name };
  }

  isMyTurnToAim(): boolean {
    const snap = this.snap;
    if (!snap || this.leaving || snap.you === null || snap.room.status !== 'playing') return false;
    if (this.presentedSeq !== snap.shots.length) return false;
    return this.serverView()?.awaitingSeat === snap.you;
  }

  connectedSeats(now: number): Set<number> {
    const seats = this.snap?.seats ?? [];
    return new Set(seats.filter(s => !s.left && isFresh(s.seat, this.presence, now)).map(s => s.seat));
  }

  countdowns(now: number): Countdowns {
    const snap = this.snap;
    const deadline = snap?.room.rematchDeadline ?? null;
    const rematch = deadline === null ? null : Math.max(0, Math.ceil((deadline - now) / MS));
    const view = this.serverView();
    if (!snap || !view || view.awaitingSeat === null) return { turn: null, missing: null, rematch };
    const seat = view.awaitingSeat;
    const name = this.seatName(seat);
    let turn: Countdown | null = null;
    if (now - snap.room.turnClockStart >= ONLINE.turnWarnSeconds * MS) {
      turn = { seat, name, secondsLeft: Math.max(0, Math.ceil((snap.room.turnClockStart + ONLINE.turnLimitSeconds * MS - now) / MS)) };
    }
    let missing: Countdown | null = null;
    const lastSeen = this.presence.find(p => p.seat === seat)?.lastSeen;
    if (lastSeen !== undefined && !isRoomEmpty(snap.seats, this.presence, now) && now - lastSeen >= ONLINE.staleWarnSeconds * MS) {
      missing = { seat, name, secondsLeft: Math.max(0, Math.ceil((lastSeen + ONLINE.staleSeconds * MS - now) / MS)) };
    }
    return { turn, missing, rematch };
  }
}
```

Checking the expectations: in the first countdown test, seat 0 is up with `turnClockStart` 0. At `now = 95_000` the remaining time is 120 − 95 = 25 s. In the "missing" test, seat 0 was last seen at 0 and seat 1 is fresh, so at 70 s the remaining time is 90 − 70 = 20 s.

- [ ] **Step 4: Run, check and commit**

Run: `npx vitest run tests/onlineMatch.test.ts` (expected PASS), then `npm run check`.

```bash
git add src/rules/onlineMatch.ts tests/onlineMatch.test.ts
git commit -m "feat(online): pure client tracker for playback queue, turn ownership and countdowns"
```

---

### Task 11: Network layer (`retry`, `convexClient`, `OnlineSession`)

**Files:**
- Create: `src/net/retry.ts`
- Create: `src/net/convexClient.ts`
- Create: `src/net/onlineSession.ts`
- Test: `tests/retry.test.ts`

**Interfaces:**
- Produces:
  - `withRetry<T>(fn: () => Promise<T>, delaysSeconds: readonly number[], isRetryable: (e: unknown) => boolean, sleep?: (ms: number) => Promise<void>): Promise<T>`
  - `errorCode(e: unknown): OnlineErrorCode | null`
  - `isRetryable(e: unknown): boolean` (true only for errors without a server code)
  - `isOnlineConfigured(): boolean`, `getConvexClient(): ConvexClient | null`
  - `class OnlineSession(client: ConvexClient, token: string)` with:
    - getters `serverNow: number` and `connected: boolean`
    - `peekSeat(code): Promise<number | null>`
    - `createRoom(profile, maps): Promise<string>`
    - `joinRoom(code, profile): Promise<void>`
    - `enter(code, listener: RoomListener): void` and `exit(): void`
    - `leaveRoom(): Promise<void>`
    - `setMaps(maps): Promise<void>`
    - `startMatch(): Promise<void>`
    - `requestRematch(matchNumber): void`
    - `fireShot({ matchNumber, seq, angle, power }): Promise<void>`
    - `reportOutcome({ matchNumber, seq, outcome }): Promise<void>`
    - `reportWitness({ matchNumber, seq, outcome }): void`
  - `RoomListener = { onRoom(snapshot: RoomSnapshot | null): void; onPresence(entries: PresenceEntry[]): void }`

- [ ] **Step 1: Write the failing test**

```ts
// tests/retry.test.ts
import { describe, expect, it } from 'vitest';
import { errorCode, isRetryable, withRetry } from '../src/net/retry';

describe('withRetry', () => {
  it('retries network failures with the configured delays, then succeeds', async () => {
    const waits: number[] = [];
    let calls = 0;
    const result = await withRetry(async () => {
      calls++;
      if (calls < 3) throw new Error('offline');
      return 'ok';
    }, [0.5, 1, 2], isRetryable, async ms => { waits.push(ms); });
    expect(result).toBe('ok');
    expect(waits).toEqual([500, 1000]);
  });

  it('gives up after the last delay', async () => {
    const waits: number[] = [];
    let calls = 0;
    await expect(withRetry(async () => { calls++; throw new Error('offline'); }, [0.5, 1, 2], isRetryable,
      async ms => { waits.push(ms); })).rejects.toThrow('offline');
    expect(calls).toBe(4);
    expect(waits).toEqual([500, 1000, 2000]);
  });

  it('never retries a server rejection', async () => {
    let calls = 0;
    await expect(withRetry(async () => { calls++; throw { data: { code: 'CONFLICT' } }; }, [0.5], isRetryable,
      async () => {})).rejects.toEqual({ data: { code: 'CONFLICT' } });
    expect(calls).toBe(1);
  });
});

describe('errorCode', () => {
  it('reads the code from ConvexError data', () => {
    expect(errorCode({ data: { code: 'FULL' } })).toBe('FULL');
    expect(errorCode(new Error('x'))).toBeNull();
    expect(errorCode(null)).toBeNull();
    expect(errorCode({ data: 'text' })).toBeNull();
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run tests/retry.test.ts`
Expected: FAIL, missing module.

- [ ] **Step 3: Implement `retry.ts`**

```ts
// src/net/retry.ts
import type { OnlineErrorCode } from '../rules/onlineTypes';

/** The `code` a Convex function threw via `ConvexError({ code })`, or null for network/unknown errors. */
export function errorCode(error: unknown): OnlineErrorCode | null {
  if (!error || typeof error !== 'object' || !('data' in error)) return null;
  const data = (error as { data: unknown }).data;
  if (!data || typeof data !== 'object' || !('code' in data)) return null;
  const code = (data as { code: unknown }).code;
  return typeof code === 'string' ? (code as OnlineErrorCode) : null;
}

/** Server rejections are final; anything else (offline, timeout) is worth retrying. */
export const isRetryable = (error: unknown): boolean => errorCode(error) === null;

export async function withRetry<T>(fn: () => Promise<T>, delaysSeconds: readonly number[],
  retryable: (error: unknown) => boolean,
  sleep: (ms: number) => Promise<void> = ms => new Promise(resolve => setTimeout(resolve, ms))): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (!retryable(error) || attempt >= delaysSeconds.length) throw error;
      await sleep(delaysSeconds[attempt]! * 1000);
    }
  }
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run tests/retry.test.ts`
Expected: PASS.

- [ ] **Step 5: Implement the client wrapper and the session.** These are thin wrappers over `convex/browser`, verified by typecheck here and manually in Task 15.

```ts
// src/net/convexClient.ts
import { ConvexClient } from 'convex/browser';

const url = import.meta.env.VITE_CONVEX_URL as string | undefined;
let client: ConvexClient | null = null;

/** True when the build knows a Convex deployment (set by `npx convex dev` in .env.local). */
export function isOnlineConfigured(): boolean {
  return Boolean(url);
}

export function getConvexClient(): ConvexClient | null {
  if (!url) return null;
  client ??= new ConvexClient(url);
  return client;
}
```

```ts
// src/net/onlineSession.ts
import type { ConvexClient } from 'convex/browser';
import { api } from '../../convex/_generated/api';
import { ONLINE } from '../config/tuning';
import type { PresenceEntry, RoomSnapshot } from '../rules/onlineTypes';
import type { ClassifiedOutcome } from '../sim/classification';
import type { OnlineProfile } from '../storage/storage';
import { isRetryable, withRetry } from './retry';

export interface RoomListener {
  onRoom(snapshot: RoomSnapshot | null): void;
  onPresence(entries: PresenceEntry[]): void;
}

/** The only module that talks to Convex. One instance per tab; `enter`/`exit` switch rooms. */
export class OnlineSession {
  private unsubscribers: Array<() => void> = [];
  private heartbeatId: ReturnType<typeof setInterval> | null = null;
  private clockOffsetMs = 0;
  private code: string | null = null;
  private readonly onVisibility = () => { if (document.visibilityState === 'visible') void this.beat(); };

  constructor(private readonly client: ConvexClient, private readonly token: string) {}

  /** Server time estimate, for displaying countdowns only. */
  get serverNow(): number { return Date.now() + this.clockOffsetMs; }
  get connected(): boolean { return this.client.connectionState().isWebSocketConnected; }

  async peekSeat(code: string): Promise<number | null> {
    const snapshot = await this.client.query(api.rooms.getRoom, { code, token: this.token });
    return snapshot?.you ?? null;
  }

  createRoom(profile: OnlineProfile, maps: string[]): Promise<string> {
    return this.client.mutation(api.rooms.createRoom, { token: this.token, maps, ...profile });
  }

  async joinRoom(code: string, profile: OnlineProfile): Promise<void> {
    await this.client.mutation(api.rooms.joinRoom, { code, token: this.token, ...profile });
  }

  enter(code: string, listener: RoomListener): void {
    this.exit();
    this.code = code;
    this.unsubscribers.push(this.client.onUpdate(api.rooms.getRoom, { code, token: this.token }, s => listener.onRoom(s)));
    this.unsubscribers.push(this.client.onUpdate(api.rooms.getPresence, { code }, e => listener.onPresence(e)));
    void this.beat();
    this.heartbeatId = setInterval(() => void this.beat(), ONLINE.heartbeatSeconds * 1000);
    document.addEventListener('visibilitychange', this.onVisibility);
  }

  exit(): void {
    for (const unsubscribe of this.unsubscribers) unsubscribe();
    this.unsubscribers = [];
    if (this.heartbeatId !== null) clearInterval(this.heartbeatId);
    this.heartbeatId = null;
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.code = null;
  }

  /** Captures the code synchronously, so calling `exit()` right after is safe. Errors are ignored. */
  async leaveRoom(): Promise<void> {
    const code = this.code;
    if (!code) return;
    try { await this.client.mutation(api.rooms.leaveRoom, { code, token: this.token }); } catch { /* leaving is best-effort */ }
  }

  async setMaps(maps: string[]): Promise<void> {
    await this.client.mutation(api.rooms.setMaps, { code: this.requireCode(), token: this.token, maps });
  }

  async startMatch(): Promise<void> {
    await this.client.mutation(api.rooms.startMatch, { code: this.requireCode(), token: this.token });
  }

  requestRematch(matchNumber: number): void {
    const code = this.code;
    if (code) void this.client.mutation(api.rooms.requestRematch, { code, token: this.token, matchNumber }).catch(() => undefined);
  }

  async fireShot(args: { matchNumber: number; seq: number; angle: number; power: number }): Promise<void> {
    const code = this.requireCode();
    await withRetry(() => this.client.mutation(api.rooms.fireShot, { code, token: this.token, ...args }),
      ONLINE.retryDelaysSeconds, isRetryable);
  }

  async reportOutcome(args: { matchNumber: number; seq: number; outcome: ClassifiedOutcome }): Promise<void> {
    const code = this.requireCode();
    await withRetry(() => this.client.mutation(api.rooms.reportOutcome, { code, token: this.token, ...args }),
      ONLINE.retryDelaysSeconds, isRetryable);
  }

  /** Sent once; the server ignores late or duplicate witnesses. */
  reportWitness(args: { matchNumber: number; seq: number; outcome: ClassifiedOutcome }): void {
    const code = this.code;
    if (code) void this.client.mutation(api.rooms.reportWitness, { code, token: this.token, ...args }).catch(() => undefined);
  }

  private requireCode(): string {
    if (!this.code) throw new Error('OnlineSession: not in a room');
    return this.code;
  }

  private async beat(): Promise<void> {
    const code = this.code;
    if (!code) return;
    try {
      const sentAt = Date.now();
      const { now } = await this.client.mutation(api.rooms.heartbeat, { code, token: this.token });
      this.clockOffsetMs = now - (sentAt + Date.now()) / 2;
    } catch {
      // The connection state drives the "Reconnecting…" banner.
    }
  }
}
```

If `client.onUpdate` returns an object rather than a function in 1.46.0, push `() => unsubscribe.unsubscribe()` instead. Check the `.d.ts` in `node_modules/convex/dist/esm-types/browser/simple_client.d.ts`.

- [ ] **Step 6: Check and commit**

Run: `npm run check` and `npm run build`
Expected: both pass. The build must succeed with **and** without `VITE_CONVEX_URL` set; temporarily rename `.env.local` to confirm the unset case, then restore it.

```bash
git add src/net/ tests/retry.test.ts
git commit -m "feat(online): Convex session with heartbeat, retries and subscriptions"
```

---

### Task 12: Online UI (screens, banner, menu changes)

DOM-only code. The repo has no DOM test environment, so it is verified by typecheck/lint here and visually in Task 15. All user-supplied text (names) is set with `textContent`, never `innerHTML`.

**Files:**
- Create: `src/ui/onlineScreens.ts`
- Create: `src/ui/onlineBanner.ts`
- Modify: `src/ui/menuOverlay.ts`
- Modify: `src/ui/menu.css`

**Interfaces:**
- Consumes: `MenuOverlay.showCustom(view, build)`, `OnlineProfile`, `SeatState`, `MULTIPLAYER`, `MAPS`, `mapPreview`, `cssColor`, `playerDisplayColor`.
- Produces:
  - `showOnlineSetup(menu, options: OnlineSetupOptions): void`
  - `showOnlineLobby(menu, options: LobbyOptions): void`
  - `showOnlineNotice(menu, message: string, onOk: () => void): void`
  - `class OnlineBanner(parent: HTMLElement)` with `setText(text | null)`, `flash(text, seconds?)`, `setBlocking(text | null, onRetry?)` and `destroy()`
  - `MenuOverlayView` gains `'online_setup' | 'online_lobby' | 'online_notice'`
  - `MenuCallbacks.onOnline?: (() => void) | undefined`
  - `showMPHandover(player, mapName, attemptNum, headline?: string)`
  - `showMPMatchResult(winners, players, online?: OnlineResultExtras)`
  - `export interface OnlineResultExtras { ready: { name: string; color: number; ready: boolean }[]; countdown: number | null; note: string | null; canRematch: boolean }`
  - `showPauseMenu(quitLabel = 'Quit to menu')`

- [ ] **Step 1: Menu overlay changes** in `src/ui/menuOverlay.ts`

1. Extend the view union:

```ts
export type MenuOverlayView = 'none' | 'home' | 'main' | 'map_select' | 'multi_setup' | 'settings' | 'handover' | 'round_result' | 'match_result' | 'solo_result' | 'pause' | 'locker' | 'daily' | 'online_setup' | 'online_lobby' | 'online_notice';
```

2. In `MenuCallbacks` add:

```ts
  /** Opens online play; undefined when no Convex deployment is configured (the card is then disabled). */
  onOnline?: (() => void) | undefined;
```

3. Add the result extras type next to `SoloResultExtras`:

```ts
export interface OnlineResultExtras {
  ready: { name: string; color: number; ready: boolean }[];
  /** Seconds until the rematch window closes, or null before the first press. */
  countdown: number | null;
  note: string | null;
  canRematch: boolean;
}
```

4. In `showMainMenu`, after the "Pass the cannon" card:

```ts
    const onOnline = this.callbacks.onOnline;
    const online = card('⇄', 'Play online', onOnline ? 'Friends on their own devices. Share a room code.' : "Online play isn't configured.",
      'online', () => onOnline?.());
    online.disabled = !onOnline;
```

5. Replace `showMPHandover` with a version that accepts an online headline:

```ts
  showMPHandover(player: MPPlayerView, mapName: string, attemptNum: number, headline?: string): void {
    const signal = this.open('handover');
    if (!headline) this.content.appendChild(el('div', 'handover-kicker', 'Pass the cannon to'));
    const name = el('div', 'handover-name', headline ?? player.name);
    name.style.setProperty('--player-color', cssColor(playerDisplayColor(player.color)));
    this.content.appendChild(name);
    this.content.appendChild(el('p', '', `${mapName} · Shot ${attemptNum}/${MULTIPLAYER.shotsPerRound}`));
    const btn = this.button('Ready now', 'btn-primary', () => { this.hide(); this.callbacks.onMultiplayerHandoverContinue?.(); }, signal);
    const bar = el('div', 'auto-bar');
    bar.style.setProperty('--auto-duration', `${FLOW.handoverSeconds}s`);
    bar.appendChild(el('i'));
    this.content.appendChild(bar);
    this.content.appendChild(el('p', 'auto-note', headline ? 'Starting automatically…' : 'Your turn starts automatically…'));
    btn.focus();
  }
```

6. Replace `showMPMatchResult` with a version that renders online readiness and keeps the overlay open on Rematch:

```ts
  showMPMatchResult(winners: readonly MPPlayerView[], players: readonly MPPlayerView[], online?: OnlineResultExtras): void {
    const firstRender = this.currentView !== 'match_result';
    const signal = this.open('match_result');
    this.content.appendChild(el('h1', '', winners.length > 1 ? "It's a tie!" : `${winners[0]?.name ?? 'Nobody'} wins!`));
    const sorted = [...players].sort((a, b) => (b.totalScore === a.totalScore) ? b.bodyHits - a.bodyHits : b.totalScore - a.totalScore);
    this.content.appendChild(this.scoreRows(sorted, p => `${p.bodyHits} hit${p.bodyHits === 1 ? '' : 's'}`, winners));
    this.content.appendChild(el('p', 'quote', '“I want it noted that I was here first.” — Jonh'));
    if (online) {
      const list = el('div', 'ready-list');
      for (const row of online.ready) {
        const item = el('span', `ready-chip${row.ready ? ' on' : ''}`, `${row.name} ${row.ready ? '✓' : '…'}`);
        item.style.setProperty('--player-color', cssColor(playerDisplayColor(row.color)));
        list.appendChild(item);
      }
      this.content.appendChild(list);
      if (online.countdown !== null) this.content.appendChild(el('p', 'auto-note', `Rematch starts in ${online.countdown} s`));
      if (online.note) this.content.appendChild(el('p', 'online-error', online.note));
    }
    const actions = el('div', 'result-actions');
    this.content.appendChild(actions);
    const rematch = this.button(online && !online.canRematch ? 'Ready ✓' : 'Rematch', 'btn-primary', () => {
      if (!online) this.hide();
      this.callbacks.onMultiplayerRematch?.();
    }, signal, actions);
    rematch.id = 'mp-rematch';
    rematch.disabled = Boolean(online && !online.canRematch);
    const leave = this.button(online ? 'Leave' : 'Main menu', '', () => {
      this.hide();
      this.callbacks.onReturnToMenu();
      if (!online) this.showMainMenu();
    }, signal, actions);
    leave.id = 'mp-leave';
    if (firstRender) (rematch.disabled ? leave : rematch).focus();
  }
```

7. Make the pause menu's quit label configurable:

```ts
  showPauseMenu(quitLabel = 'Quit to menu'): void {
    const signal = this.open('pause');
    this.content.appendChild(el('h2', '', 'Paused'));
    this.content.appendChild(el('p', 'quote', '“Oh good. A moment of peace.”'));
    const actions = el('div', 'result-actions');
    this.content.appendChild(actions);
    const resumeBtn = this.button('Resume', 'btn-primary', () => { this.hide(); this.callbacks.onPauseResume?.(); }, signal, actions);
    this.button(quitLabel, '', () => { this.hide(); this.callbacks.onPauseQuit?.(); }, signal, actions);
    resumeBtn.focus();
  }
```

- [ ] **Step 2: Banner**

```ts
// src/ui/onlineBanner.ts
/** A small status strip above the game for connection state, countdowns and one-off notices. */
export class OnlineBanner {
  private readonly root: HTMLDivElement;
  private readonly text: HTMLSpanElement;
  private readonly retry: HTMLButtonElement;
  private blocking = false;
  private flashUntil = 0;

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'online-banner';
    this.root.setAttribute('role', 'status');
    this.root.setAttribute('aria-live', 'polite');
    this.root.hidden = true;
    this.text = document.createElement('span');
    this.retry = document.createElement('button');
    this.retry.type = 'button';
    this.retry.className = 'btn';
    this.retry.textContent = 'Retry';
    this.retry.hidden = true;
    this.root.append(this.text, this.retry);
    parent.appendChild(this.root);
  }

  /** Routine status; ignored while a blocking message or a flash is showing. */
  setText(message: string | null): void {
    if (this.blocking || Date.now() < this.flashUntil) return;
    this.show(message);
  }

  flash(message: string, seconds = 3): void {
    this.flashUntil = Date.now() + seconds * 1000;
    this.show(message);
  }

  setBlocking(message: string | null, onRetry?: () => void): void {
    this.blocking = message !== null;
    this.retry.hidden = message === null || !onRetry;
    this.retry.onclick = onRetry ? () => onRetry() : null;
    this.show(message);
  }

  private show(message: string | null): void {
    this.root.hidden = message === null;
    this.text.textContent = message ?? '';
  }

  destroy(): void {
    this.root.remove();
  }
}
```

- [ ] **Step 3: Online screens**

```ts
// src/ui/onlineScreens.ts
import { cssColor, playerDisplayColor } from '../art/palette';
import { MULTIPLAYER } from '../config/tuning';
import { MAPS } from '../levels';
import type { SeatState } from '../rules/onlineTypes';
import type { OnlineProfile } from '../storage/storage';
import { mapPreview } from './mapPreview';
import type { MenuOverlay } from './menuOverlay';

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
};

function button(parent: HTMLElement, label: string, className: string, onClick: () => void, signal: AbortSignal): HTMLButtonElement {
  const b = el('button', `btn ${className}`.trim(), label);
  b.type = 'button';
  b.addEventListener('click', onClick, { signal });
  parent.appendChild(b);
  return b;
}

function radioGroup<T>(legend: string, name: string, values: readonly T[], selected: T,
  render: (value: T, label: HTMLLabelElement) => void, onChange: (value: T) => void, signal: AbortSignal): HTMLFieldSetElement {
  const set = el('fieldset', 'online-picker');
  set.appendChild(el('legend', '', legend));
  values.forEach((value, i) => {
    const label = el('label');
    const input = el('input');
    input.type = 'radio';
    input.name = name;
    input.id = `${name}-${i}`;
    input.checked = value === selected;
    input.addEventListener('change', () => { if (input.checked) onChange(value); }, { signal });
    label.appendChild(input);
    render(value, label);
    set.appendChild(label);
  });
  return set;
}

const MP_MAP_IDS = MULTIPLAYER.maps as readonly string[];

export interface OnlineSetupOptions {
  profile: OnlineProfile;
  code: string;
  error: string | null;
  onCreate(profile: OnlineProfile): void;
  onJoin(profile: OnlineProfile, code: string): void;
  onBack(): void;
}

export function showOnlineSetup(menu: MenuOverlay, o: OnlineSetupOptions): void {
  menu.showCustom('online_setup', (content, signal) => {
    const profile: OnlineProfile = { ...o.profile };
    content.appendChild(el('h2', '', 'Play online'));
    content.appendChild(el('p', '', 'Make a room and send friends the code, or join theirs.'));

    const nameRow = el('div', 'player-setup-row');
    const nameLabel = el('label', '', 'Your name');
    nameLabel.htmlFor = 'online-name';
    const nameInput = el('input');
    nameInput.type = 'text';
    nameInput.id = 'online-name';
    nameInput.maxLength = MULTIPLAYER.maxNameLength;
    nameInput.value = profile.name;
    nameInput.addEventListener('input', () => { profile.name = nameInput.value; }, { signal });
    nameRow.append(nameLabel, nameInput);
    content.appendChild(nameRow);

    const colors = MULTIPLAYER.colors as readonly number[];
    content.appendChild(radioGroup('Cannon colour', 'online-color', colors, profile.color, (color, label) => {
      const swatch = el('span', 'swatch');
      swatch.style.background = cssColor(playerDisplayColor(color));
      label.append(swatch, el('span', 'visually-hidden', `Colour ${colors.indexOf(color) + 1}`));
    }, color => { profile.color = color; }, signal));
    content.appendChild(radioGroup('Cannon pattern', 'online-pattern', MULTIPLAYER.patterns as readonly string[], profile.pattern,
      (pattern, label) => label.append(el('span', '', pattern)), pattern => { profile.pattern = pattern; }, signal));

    const actions = el('div', 'menu-actions');
    content.appendChild(actions);
    const create = button(actions, 'Create room', 'btn-primary', () => o.onCreate({ ...profile }), signal);

    const join = el('div', 'online-join');
    const codeLabel = el('label', 'visually-hidden', 'Room code');
    codeLabel.htmlFor = 'online-code';
    const codeInput = el('input');
    codeInput.type = 'text';
    codeInput.id = 'online-code';
    codeInput.placeholder = 'Room code';
    codeInput.autocomplete = 'off';
    codeInput.maxLength = 12;
    codeInput.value = o.code;
    codeInput.addEventListener('keydown', e => { if (e.key === 'Enter') o.onJoin({ ...profile }, codeInput.value); }, { signal });
    join.append(codeLabel, codeInput);
    content.appendChild(join);
    button(join, 'Join', '', () => o.onJoin({ ...profile }, codeInput.value), signal);

    const error = el('p', 'online-error', o.error ?? '');
    error.setAttribute('role', 'alert');
    content.appendChild(error);
    button(content, 'Back', 'btn-quiet', () => o.onBack(), signal);
    (o.code ? codeInput : create).focus();
  });
}

export interface LobbyOptions {
  code: string;
  link: string;
  seats: readonly SeatState[];
  connected: ReadonlySet<number>;
  mySeat: number;
  maps: readonly string[];
  error: string | null;
  onMaps(maps: string[]): void;
  onStart(): void;
  onLeave(): void;
}

export function showOnlineLobby(menu: MenuOverlay, o: LobbyOptions): void {
  // Re-rendered on every roster/presence change; keep keyboard focus where it was.
  const focusedId = document.activeElement instanceof HTMLElement ? document.activeElement.id : '';
  menu.showCustom('online_lobby', (content, signal) => {
    const host = o.mySeat === 0;
    content.appendChild(el('h2', '', 'Room code'));
    content.appendChild(el('div', 'room-code', o.code));
    const copy = button(content, 'Copy link', '', () => {
      navigator.clipboard?.writeText(o.link).then(() => { copy.textContent = 'Link copied!'; }, () => { copy.textContent = o.link; });
    }, signal);
    copy.id = 'online-copy';

    const list = el('div', 'score-list');
    for (const seat of o.seats) {
      const row = el('div', 'score-row');
      row.style.setProperty('--player-color', cssColor(playerDisplayColor(seat.color)));
      const on = o.connected.has(seat.seat);
      const dot = el('span', `presence-dot${on ? ' on' : ''}`);
      dot.setAttribute('aria-label', on ? 'connected' : 'not connected');
      const who = el('span');
      const tags = [`${seat.pattern} cannon`, seat.seat === 0 ? 'host' : '', seat.seat === o.mySeat ? 'you' : ''].filter(Boolean).join(' · ');
      who.append(dot, document.createTextNode(seat.name), el('small', '', tags));
      row.append(el('span', 'rank', String(seat.seat + 1)), who);
      list.appendChild(row);
    }
    content.appendChild(list);

    const isTour = o.maps.length === MP_MAP_IDS.length;
    if (host) {
      const maps = el('fieldset', 'mp-map-picker');
      maps.appendChild(el('legend', '', 'Choose your arena'));
      const choices = [{ id: 'all', name: 'Three-garden tour' }, ...MAPS.filter(m => MP_MAP_IDS.includes(m.id))];
      for (const choice of choices) {
        const label = el('label', 'arena-option');
        const input = el('input');
        input.type = 'radio';
        input.name = 'online-map';
        input.id = `online-map-${choice.id}`;
        input.checked = choice.id === 'all' ? isTour : !isTour && o.maps[0] === choice.id;
        input.addEventListener('change', () => o.onMaps(choice.id === 'all' ? [...MP_MAP_IDS] : [choice.id]), { signal });
        const artwork = el('span');
        artwork.innerHTML = mapPreview(choice.id === 'all' ? 'backyard' : choice.id);
        label.append(input, artwork, el('strong', '', choice.name));
        maps.appendChild(label);
      }
      content.appendChild(maps);
    } else {
      const arena = isTour ? 'Three-garden tour' : MAPS.find(m => m.id === o.maps[0])?.name ?? o.maps[0] ?? '';
      content.appendChild(el('p', '', `Arena: ${arena}`));
    }

    const error = el('p', 'online-error', o.error ?? '');
    error.setAttribute('role', 'alert');
    content.appendChild(error);

    const actions = el('div', 'menu-actions');
    content.appendChild(actions);
    if (host) {
      const start = button(actions, 'Start match', 'btn-primary', () => o.onStart(), signal);
      start.id = 'online-start';
      start.disabled = o.seats.length < MULTIPLAYER.minPlayers;
    } else {
      actions.appendChild(el('p', 'auto-note', 'Waiting for host…'));
    }
    button(actions, 'Leave', '', () => o.onLeave(), signal).id = 'online-leave';

    const again = focusedId ? content.querySelector<HTMLElement>(`#${CSS.escape(focusedId)}`) : null;
    (again ?? content.querySelector<HTMLElement>('button:not(:disabled)'))?.focus();
  });
}

export function showOnlineNotice(menu: MenuOverlay, message: string, onOk: () => void): void {
  menu.showCustom('online_notice', (content, signal) => {
    content.appendChild(el('h2', '', message));
    button(content, 'OK', 'btn-primary', onOk, signal).focus();
  });
}
```

- [ ] **Step 4: Styles.** Append to `src/ui/menu.css`:

```css
/* Online play */
.room-code { font-size: 2.4rem; font-weight: 800; letter-spacing: .2em; text-align: center; margin: .25rem 0 .5rem; }
.online-error { color: #b3261e; font-weight: 700; min-height: 1.2em; margin: .25rem 0; }
.presence-dot { display: inline-block; width: .6rem; height: .6rem; border-radius: 50%; background: #9e9e9e; margin-right: .4rem; vertical-align: middle; }
.presence-dot.on { background: #2e9d4c; }
.online-picker { display: flex; flex-wrap: wrap; gap: .5rem; border: 0; padding: 0; margin: .25rem 0; }
.online-picker label { display: inline-flex; align-items: center; gap: .3rem; cursor: pointer; }
.swatch { display: inline-block; width: 1.4rem; height: 1.4rem; border-radius: 50%; border: 2px solid #222; }
.online-join { display: flex; gap: .5rem; align-items: center; justify-content: center; margin: .5rem 0; }
.online-join input { width: 9ch; text-transform: uppercase; letter-spacing: .15em; }
.ready-list { display: flex; flex-wrap: wrap; gap: .4rem; justify-content: center; margin: .5rem 0; }
.ready-chip { border: 2px solid var(--player-color, #222); border-radius: 999px; padding: .1rem .6rem; opacity: .6; }
.ready-chip.on { opacity: 1; font-weight: 700; }
.online-banner { position: fixed; top: 12px; left: 50%; transform: translateX(-50%); z-index: 50; display: flex; gap: .5rem; align-items: center;
  background: #fff8e1; color: #222; border: 2px solid #222; border-radius: .6rem; padding: .3rem .8rem; font-weight: 700; max-width: calc(100vw - 32px); }
```

- [ ] **Step 5: Check and commit**

Run: `npm run check` and `npm run build`
Expected: both pass. (Existing callers of `showMPHandover`, `showMPMatchResult` and `showPauseMenu` still compile, because every new parameter is optional.)

```bash
git add src/ui/onlineScreens.ts src/ui/onlineBanner.ts src/ui/menuOverlay.ts src/ui/menu.css
git commit -m "feat(online): online setup, lobby, notice screens, status banner and menu hooks"
```

---

### Task 13: `OnlineController` (glue between session, tracker, menus and the scene)

All decisions are delegated to the tested tracker (Task 10) and to the server; this class only sequences calls. Verified by typecheck here and by the manual run in Task 15.

**Files:**
- Create: `src/scenes/onlineController.ts`

**Interfaces:**
- Consumes: `OnlineSession`, `getConvexClient`, `errorCode`, `OnlineMatchTracker`, `replayMatch`, `normalizeRoomCode`, `loadOnlineProfile`, `saveOnlineProfile`, `onlineToken`, `showOnlineSetup`, `showOnlineLobby`, `showOnlineNotice`, `OnlineBanner`, `MenuOverlay`, `OnlineResultExtras`.
- Produces `OnlineSceneHooks`, which the scene implements in Task 14:

```ts
export interface OnlinePresentation {
  state: MPState;
  activeSeat: number;
  /** Aiming, not paused, no overlay, no pending launch: a queued shot may start now. */
  ready: boolean;
  /** A ball is (about to be) flying locally. */
  shotInFlight: boolean;
}
export interface OnlineSceneHooks {
  showOnlineMatch(machine: MultiplayerMatchMachine): void;
  presentation(): OnlinePresentation;
  playShot(angle: number, power: number): void;
  presentSkippedTurn(seat: number, angle: number, power: number, text: string): void;
  applyOfficialOutcome(outcome: ClassifiedOutcome, mine: boolean): void;
  refreshMatchResult(): void;
  refreshAimingControls(): void;
  leaveToMenu(): void;
}
```

- Produces `class OnlineController(menu: MenuOverlay, hooks: OnlineSceneHooks)` with:
  - getters `inRoom`, `inMatch` and `mySeat`
  - `isMyTurnToAim()`
  - `open(error?, code?)` and `openFromLink(raw): Promise<void>`
  - `update(dtSeconds)`
  - `onUserFire(angle, power)` and `onLocalResolution(outcome)`
  - `requestRematch()`, `resultExtras(): OnlineResultExtras` and `leave()`
  - `destroy()`

- [ ] **Step 1: Write the controller**

```ts
// src/scenes/onlineController.ts
import { MULTIPLAYER } from '../config/tuning';
import { getConvexClient } from '../net/convexClient';
import { OnlineSession } from '../net/onlineSession';
import { errorCode } from '../net/retry';
import type { MPState, MultiplayerMatchMachine } from '../rules/multiplayerMatch';
import { OnlineMatchTracker, type PlaybackItem } from '../rules/onlineMatch';
import type { RoomSnapshot } from '../rules/onlineTypes';
import { replayMatch } from '../rules/replayMatch';
import { normalizeRoomCode } from '../rules/roomCode';
import type { ClassifiedOutcome } from '../sim/classification';
import { loadOnlineProfile, onlineToken, saveOnlineProfile, type OnlineProfile } from '../storage/storage';
import type { MenuOverlay, OnlineResultExtras } from '../ui/menuOverlay';
import { OnlineBanner } from '../ui/onlineBanner';
import { showOnlineLobby, showOnlineNotice, showOnlineSetup } from '../ui/onlineScreens';

export interface OnlinePresentation {
  state: MPState;
  activeSeat: number;
  /** Aiming, not paused, no overlay, no pending launch: a queued shot may start now. */
  ready: boolean;
  /** A ball is (about to be) flying locally. */
  shotInFlight: boolean;
}

export interface OnlineSceneHooks {
  showOnlineMatch(machine: MultiplayerMatchMachine): void;
  presentation(): OnlinePresentation;
  playShot(angle: number, power: number): void;
  presentSkippedTurn(seat: number, angle: number, power: number, text: string): void;
  applyOfficialOutcome(outcome: ClassifiedOutcome, mine: boolean): void;
  refreshMatchResult(): void;
  refreshAimingControls(): void;
  leaveToMenu(): void;
}

interface CurrentShot {
  seq: number;
  /** live = fired here now; recovered = mine after a reload; remote = someone else's. */
  kind: 'live' | 'remote' | 'recovered';
  localOutcome: ClassifiedOutcome | null;
}

const JOIN_ERRORS: Partial<Record<string, string>> = {
  NOT_FOUND: 'No room with that code.',
  FULL: 'That room is full.',
  ALREADY_STARTED: 'That match has already started.',
};
const OFFLINE = "Couldn't reach the server. Check your connection and try again.";
const BANNER_TICK_SECONDS = 0.25;

function roomLink(code: string): string {
  const url = new URL(window.location.href);
  url.search = '';
  url.searchParams.set('room', code);
  return url.toString();
}

function setRoomParam(code: string | null): void {
  const url = new URL(window.location.href);
  if (code) url.searchParams.set('room', code);
  else url.searchParams.delete('room');
  window.history.replaceState(null, '', url);
}

export class OnlineController {
  private session: OnlineSession | null = null;
  private tracker = new OnlineMatchTracker();
  private code: string | null = null;
  private profile: OnlineProfile = loadOnlineProfile();
  private current: CurrentShot | null = null;
  /** undefined: no resync pending; null: resync silently; string: resync and show this notice. */
  private resyncNotice: string | null | undefined = undefined;
  private match = false;
  private lobbyKey = '';
  private lobbyError: string | null = null;
  private resultKey = '';
  private sawRematchWindow = false;
  private lastCanAct = false;
  private bannerClock = 0;
  private readonly banner: OnlineBanner;

  constructor(private readonly menu: MenuOverlay, private readonly hooks: OnlineSceneHooks) {
    this.banner = new OnlineBanner(document.body);
  }

  get inRoom(): boolean { return this.code !== null; }
  get inMatch(): boolean { return this.match; }
  get mySeat(): number | null { return this.tracker.mySeat; }
  isMyTurnToAim(): boolean { return this.tracker.isMyTurnToAim(); }

  open(error: string | null = null, code = ''): void {
    showOnlineSetup(this.menu, {
      profile: this.profile, code, error,
      onCreate: profile => void this.create(profile),
      onJoin: (profile, raw) => void this.join(profile, raw),
      onBack: () => this.menu.showMainMenu(),
    });
  }

  /** `?room=CODE`: rejoin silently if this tab already holds a seat, else show Join with the code filled in. */
  async openFromLink(raw: string): Promise<void> {
    const code = normalizeRoomCode(raw);
    if (!code) { this.open(); return; }
    try {
      if ((await this.ensureSession().peekSeat(code)) !== null) { this.enter(code); return; }
    } catch { /* fall through to the join screen */ }
    this.open(null, code);
  }

  private ensureSession(): OnlineSession {
    if (!this.session) {
      const client = getConvexClient();
      if (!client) throw new Error('Online play is not configured');
      this.session = new OnlineSession(client, onlineToken());
    }
    return this.session;
  }

  private async create(profile: OnlineProfile): Promise<void> {
    this.profile = profile;
    saveOnlineProfile(profile);
    try {
      this.enter(await this.ensureSession().createRoom(profile, [...MULTIPLAYER.maps]));
    } catch (e) {
      this.open(JOIN_ERRORS[errorCode(e) ?? ''] ?? OFFLINE);
    }
  }

  private async join(profile: OnlineProfile, raw: string): Promise<void> {
    this.profile = profile;
    saveOnlineProfile(profile);
    const code = normalizeRoomCode(raw);
    if (!code) { this.open('Room codes are 5 letters and numbers, like K7QPX.', raw); return; }
    try {
      await this.ensureSession().joinRoom(code, profile);
      this.enter(code);
    } catch (e) {
      this.open(JOIN_ERRORS[errorCode(e) ?? ''] ?? OFFLINE, raw);
    }
  }

  private enter(code: string): void {
    this.code = code;
    this.tracker = new OnlineMatchTracker();
    this.match = false;
    this.lobbyKey = '';
    this.lobbyError = null;
    setRoomParam(code);
    this.ensureSession().enter(code, {
      onRoom: snapshot => this.onRoom(snapshot),
      onPresence: entries => { this.tracker.setPresence(entries); this.renderLobbyIfShown(); },
    });
  }

  private onRoom(snapshot: RoomSnapshot | null): void {
    const update = this.tracker.update(snapshot);
    if (update.roomGone) { this.exitWith('This room has ended.'); return; }
    if (update.removal === 'rejoin') { void this.rejoin(); return; }
    if (update.removal === 'notIncluded') { this.exitWith("You weren't included in the rematch."); return; }
    if (!snapshot || snapshot.you === null) return;
    if (snapshot.room.status === 'lobby') { this.match = false; this.renderLobby(); return; }
    if (update.rebuild) this.rebuild();
  }

  private renderLobbyIfShown(): void {
    if (this.menu.getView() === 'online_lobby') this.renderLobby();
  }

  private renderLobby(): void {
    const snapshot = this.tracker.snapshot;
    const session = this.session;
    const code = this.code;
    if (!snapshot || snapshot.you === null || snapshot.room.status !== 'lobby' || !session || !code) return;
    const connected = this.tracker.connectedSeats(session.serverNow);
    const key = JSON.stringify([snapshot.seats, snapshot.room.maps, [...connected].sort(), snapshot.you, this.lobbyError]);
    if (key === this.lobbyKey && this.menu.getView() === 'online_lobby') return;
    this.lobbyKey = key;
    showOnlineLobby(this.menu, {
      code, link: roomLink(code), seats: snapshot.seats, connected, mySeat: snapshot.you, maps: snapshot.room.maps,
      error: this.lobbyError,
      onMaps: maps => { session.setMaps(maps).catch(() => undefined); },
      onStart: () => {
        session.startMatch().catch(e => {
          this.lobbyError = errorCode(e) === 'NOT_ENOUGH_PLAYERS' ? 'Waiting for at least 2 connected players.' : OFFLINE;
          this.renderLobby();
        });
      },
      onLeave: () => this.leave(),
    });
  }

  /** Fast-forward over the resolved prefix; any in-flight shot is left for normal playback. */
  private rebuild(): void {
    const snapshot = this.tracker.snapshot;
    if (!snapshot) return;
    this.current = null;
    this.resyncNotice = undefined;
    this.sawRematchWindow = false;
    this.resultKey = '';
    const { machine } = replayMatch(
      { seats: snapshot.seats, maps: snapshot.room.maps, seed: snapshot.room.seed, shots: this.tracker.resolvedPrefix() },
      { includeInFlight: false });
    this.match = true;
    this.hooks.showOnlineMatch(machine);
  }

  /** Called every frame by the scene. */
  update(dtSeconds: number): void {
    if (!this.code || !this.session) return;
    this.bannerClock -= dtSeconds;
    if (this.bannerClock <= 0) {
      this.bannerClock = BANNER_TICK_SECONDS;
      this.refreshStatus();
    }
    if (!this.match) return;
    const view = this.hooks.presentation();
    if (this.resyncNotice !== undefined && !view.shotInFlight) {
      const notice = this.resyncNotice;
      this.tracker.resetPresentation();
      this.rebuild();
      if (notice) this.banner.flash(notice);
      return;
    }
    const current = this.current;
    if (current?.kind === 'remote' && current.localOutcome !== null) {
      const official = this.tracker.officialOutcome(current.seq);
      if (official) this.finishRemote(current, official);
    }
    if (!this.current && view.state === 'aiming' && view.ready) {
      const item = this.tracker.nextPlayback();
      if (item && item.shot.seat === view.activeSeat) this.startPlayback(item);
    }
    const canAct = this.tracker.isMyTurnToAim();
    if (canAct !== this.lastCanAct) {
      this.lastCanAct = canAct;
      this.hooks.refreshAimingControls();
    }
  }

  private startPlayback(item: PlaybackItem): void {
    const { shot } = item;
    if (item.kind === 'skipped') {
      const text = shot.seat === this.tracker.mySeat ? 'Your turn was skipped' : `${item.name} was skipped`;
      this.hooks.presentSkippedTurn(shot.seat, shot.angle, shot.power, text);
      this.tracker.markPresented(shot.seq);
      return;
    }
    this.current = { seq: shot.seq, kind: item.kind, localOutcome: null };
    this.hooks.playShot(shot.angle, shot.power);
  }

  /** The local player pressed Fire on their own turn (the scene has already launched the ball). */
  onUserFire(angle: number, power: number): void {
    const session = this.session;
    const snapshot = this.tracker.snapshot;
    if (!session || !snapshot) return;
    const seq = this.tracker.nextFireSeq();
    const matchNumber = snapshot.room.matchNumber;
    this.tracker.markFiredByMe(seq);
    this.current = { seq, kind: 'live', localOutcome: null };
    const send = () => session.fireShot({ matchNumber, seq, angle, power });
    send().catch(e => this.onRejected(e, 'Your turn was skipped', send));
  }

  /** The local simulation of the current shot resolved. */
  onLocalResolution(outcome: ClassifiedOutcome): void {
    const current = this.current;
    const session = this.session;
    const snapshot = this.tracker.snapshot;
    if (!current || !session || !snapshot) return;
    current.localOutcome = outcome;
    const matchNumber = snapshot.room.matchNumber;
    if (current.kind === 'remote') {
      const official = this.tracker.officialOutcome(current.seq);
      if (official) this.finishRemote(current, official);
      else session.reportWitness({ matchNumber, seq: current.seq, outcome });
      return;
    }
    // My shot (live or recovered): my outcome is the official one.
    this.hooks.applyOfficialOutcome(outcome, true);
    this.tracker.markPresented(current.seq);
    this.current = null;
    if (this.resyncNotice !== undefined) return;
    const send = () => session.reportOutcome({ matchNumber, seq: current.seq, outcome });
    send().catch(e => this.onRejected(e, 'Your shot timed out', send));
  }

  private finishRemote(current: CurrentShot, official: ClassifiedOutcome): void {
    if (import.meta.env.DEV && current.localOutcome !== official) {
      console.warn(`[online] shot ${current.seq}: local ${current.localOutcome ?? 'none'}, official ${official}`);
    }
    this.hooks.applyOfficialOutcome(official, false);
    this.tracker.markPresented(current.seq);
    this.current = null;
  }

  private onRejected(error: unknown, notice: string, retry: () => Promise<void>): void {
    const code = errorCode(error);
    if (code === null) {
      this.banner.setBlocking("Couldn't reach the room.", () => {
        this.banner.setBlocking(null);
        retry().catch(e => this.onRejected(e, notice, retry));
      });
      return;
    }
    if (code === 'NOT_YOUR_TURN' || code === 'CONFLICT') { this.resyncNotice = notice; return; }
    if (import.meta.env.DEV) console.warn(`[online] rejected with ${code}; resyncing`);
    this.resyncNotice = null;
  }

  requestRematch(): void {
    const snapshot = this.tracker.snapshot;
    if (snapshot) this.session?.requestRematch(snapshot.room.matchNumber);
  }

  resultExtras(): OnlineResultExtras {
    const snapshot = this.tracker.snapshot;
    const session = this.session;
    if (!snapshot || !session) return { ready: [], countdown: null, note: null, canRematch: false };
    const me = snapshot.seats.find(s => s.seat === snapshot.you);
    const countdown = this.tracker.countdowns(session.serverNow).rematch;
    if (countdown !== null) this.sawRematchWindow = true;
    const finished = snapshot.room.status === 'finished';
    return {
      ready: snapshot.seats.filter(s => !s.left).map(s => ({ name: s.name, color: s.color, ready: s.rematchReady })),
      countdown,
      note: finished && this.sawRematchWindow && countdown === null ? 'Not enough players — press Rematch to try again.' : null,
      canRematch: finished && me !== undefined && !me.left && !me.rematchReady,
    };
  }

  private refreshStatus(): void {
    const session = this.session;
    if (!session) return;
    this.renderLobbyIfShown();
    if (!session.connected) { this.banner.setText('Reconnecting…'); return; }
    if (!this.match) { this.banner.setText(null); return; }
    const c = this.tracker.countdowns(session.serverNow);
    if (c.missing) this.banner.setText(`Waiting for ${c.missing.name}… skipping in ${c.missing.secondsLeft} s`);
    else if (c.turn) this.banner.setText(c.turn.seat === this.tracker.mySeat ? `${c.turn.secondsLeft} s left to fire` : `${c.turn.name}: ${c.turn.secondsLeft} s left`);
    else this.banner.setText(null);
    if (this.hooks.presentation().state === 'match_result') {
      const key = JSON.stringify(this.resultExtras());
      if (key !== this.resultKey) {
        this.resultKey = key;
        this.hooks.refreshMatchResult();
      }
    }
  }

  /** Leave on purpose: never auto-rejoins (the tracker ignores the seat disappearing). */
  leave(): void {
    if (!this.session || !this.code) return;
    this.tracker.markLeaving();
    void this.session.leaveRoom();
    this.closeRoom();
    this.hooks.leaveToMenu();
    this.open();
  }

  private exitWith(message: string): void {
    this.closeRoom();
    this.hooks.leaveToMenu();
    showOnlineNotice(this.menu, message, () => this.open());
  }

  private closeRoom(): void {
    this.session?.exit();
    this.code = null;
    this.match = false;
    this.current = null;
    this.resyncNotice = undefined;
    this.banner.setBlocking(null);
    this.banner.setText(null);
    setRoomParam(null);
  }

  private async rejoin(): Promise<void> {
    const session = this.session;
    const code = this.code;
    if (!session || !code) return;
    try {
      await session.joinRoom(code, this.profile);
    } catch (e) {
      const c = errorCode(e);
      this.exitWith(c === 'FULL' ? 'The room filled up while you were away.'
        : c === 'ALREADY_STARTED' ? 'That match started without you.' : 'This room has ended.');
    }
  }

  destroy(): void {
    this.session?.exit();
    this.banner.destroy();
  }
}
```

`void session.leaveRoom()` must run **before** `closeRoom()`. `leaveRoom` captures the room code synchronously, and `exit()` (inside `closeRoom`) clears it.

- [ ] **Step 2: Check and commit**

Run: `npm run check`
Expected: PASS. (Nothing imports the controller yet; lint may flag nothing. If `no-unused-vars` flags a type, keep it, because Task 14 uses all exports.)

```bash
git add src/scenes/onlineController.ts
git commit -m "feat(online): OnlineController sequences session, tracker, menus and scene hooks"
```

---

### Task 14: Scene integration (`PrototypeScene`)

Wires the controller in. Hot-seat behaviour must stay identical: every new branch is guarded by `this.online?.inMatch`, or is a no-op when `this.online` is null.

**Files:**
- Modify: `src/scenes/PrototypeScene.ts`

**Interfaces:**
- Consumes: `OnlineController`, `OnlineSceneHooks`, `isOnlineConfigured`, `OUTCOME_POINTS`, `ClassifiedOutcome`, menu changes from Task 12.
- Produces: nothing new for other tasks.

Apply the edits below in order. Line numbers are from commit `b13980b` and will drift, so anchor on the quoted code.

- [ ] **Step 1: Imports and fields**

Change `import { MultiplayerMatchMachine, type MPPlayerSetup } from '../rules/multiplayerMatch';` to:

```ts
import { MultiplayerMatchMachine, OUTCOME_POINTS, type MPPlayerSetup } from '../rules/multiplayerMatch';
```

Change `import { ShotClassifier } from '../sim/classification';` to:

```ts
import { ShotClassifier, type ClassifiedOutcome } from '../sim/classification';
```

Add:

```ts
import { isOnlineConfigured } from '../net/convexClient';
import { OnlineController, type OnlineSceneHooks } from './onlineController';
```

Below the imports, add:

```ts
/** Result labels when the official online outcome differs from what this device simulated. */
const OFFICIAL_LABELS: Record<ClassifiedOutcome, string> = {
  ricochet_body: 'Ricochet hit', body: 'Direct hit', hat_only: 'Hat hit', miss: 'Miss',
};
```

Add fields next to `private multiplayerPositionKey = '';`:

```ts
  /** Online play glue; null when no Convex deployment is configured. */
  private online: OnlineController | null = null;
  /** This device's view of the current online shot, kept until the official outcome is applied. */
  private onlineLocal: { outcome: ClassifiedOutcome; label: string; quote: string; resultSeconds: number } | null = null;
```

- [ ] **Step 2: `create()` wiring**

In the `sessionCoordinator` `onPause` callback, replace `this.menuOverlay.showPauseMenu();` with:

```ts
        this.menuOverlay.showPauseMenu(this.online?.inMatch ? 'Leave match' : undefined);
```

In the `MenuOverlay` callbacks object:
- Make `onMultiplayerRematch` start with an online branch:

```ts
      onMultiplayerRematch: () => {
        if (this.online?.inMatch) { this.online.requestRematch(); return; }
        this.inputCoordinator.setOverlayVisible(false);
        this.multiMachine.rematch();
        this.trailHistory.clear();
        this.loadMultiplayerMap(this.multiMachine.currentMapId);
        this.updateUIPerMultiState();
      },
```

- Add:

```ts
      onOnline: isOnlineConfigured() ? () => this.online?.open() : undefined,
```

Right after `this.menuOverlay = new MenuOverlay(...)` (before `document.documentElement.classList.toggle(...)`), add:

```ts
    this.online = isOnlineConfigured() ? new OnlineController(this.menuOverlay, this.onlineHooks()) : null;
```

At the very end of `create()`, after `this.showAttract();`, add:

```ts
    // A shared room link (?room=CODE) opens online play directly, rejoining this tab's seat after a reload.
    const roomParam = new URLSearchParams(window.location.search).get('room');
    if (roomParam && this.online) void this.online.openFromLink(roomParam);
```

In `cleanup()`, add as the first line:

```ts
    this.online?.destroy();
```

- [ ] **Step 3: Who may act**

Add this method next to `canAimNow()`:

```ts
  /** Online: only the seated player the server is waiting on may aim or fire. Hot-seat: always. */
  private canUserAct(): boolean {
    const online = this.online;
    if (!online?.inMatch) return true;
    return online.isMyTurnToAim() && this.multiMachine.activePlayerIndex === online.mySeat;
  }
```

In `canAimNow()`, append `&& this.canUserAct()` to the returned expression.

At the top of `setAngle` and `setPower`, after the existing guard line, add:

```ts
    if (!this.canUserAct()) return;
```

- [ ] **Step 4: Quit routes through the controller**

Rename the existing `performQuit()` to `teardownGameplay()` (body unchanged), and add a new `performQuit()` above it:

```ts
  private performQuit(): void {
    // Leaving an online room tells the server, then tears down gameplay via the leaveToMenu hook.
    if (this.online?.inRoom) { this.online.leave(); return; }
    this.teardownGameplay();
  }
```

- [ ] **Step 5: Firing**

Change the signature and guard of `fire()`:

```ts
  private fire(source: 'user' | 'remote' = 'user'): void {
    if (this.activeMode === 'none' || this.sessionCoordinator?.isPaused || this.menuOverlay.isVisible() || !this.activeCoordinator || !this.activeCoordinator.canFire()) return;
    if (source === 'user' && !this.canUserAct()) return;
```

Right after `this.activeCoordinator.fire(this.currentAngleDeg, this.currentPowerPercent);`, add:

```ts
    if (source === 'user' && this.online?.inMatch) this.online.onUserFire(this.currentAngleDeg, this.currentPowerPercent);
```

In `loadMultiplayerMap`'s `onShotFired`, replace `saveMultiplayerSetup(this.multiMachine.setups);` with:

```ts
        // Online seats must never overwrite the saved hot-seat roster.
        if (!this.online?.inMatch) saveMultiplayerSetup(this.multiMachine.setups);
```

- [ ] **Step 6: `reset()` must not advance past an unscored online shot**

In `reset()`, directly after `if (!this.activeCoordinator.canReset()) return;`, add:

```ts
    // Online: the official outcome hasn't been applied yet (hot-seat scores before it can get here).
    if (this.activeMode === 'multi' && this.multiMachine.state === 'simulating') return;
```

- [ ] **Step 7: Resolution**

Add the helper below `handleResolution`:

```ts
  /** How long a shot's result stays up; stretched to fit the replay of big hits. */
  private resultWindowSeconds(isBodyHit: boolean): number {
    const replaySeconds = this.replayCountdown !== null ? FX.replayAfterSeconds + this.replayPlan().lead / FX.replaySpeed + this.replayPlan().post : 0;
    return isBodyHit ? Math.max(FLOW.bodyHitResultSeconds, replaySeconds + 0.6) : FLOW.shotResultSeconds;
  }
```

In `handleResolution`:

1. Change `} else if (this.activeMode === 'multi') {` (the one calling `this.multiCoordinator.resolveShot(classification.outcome)`) to:

```ts
    } else if (this.activeMode === 'multi' && !this.online?.inMatch) {
```

2. Directly after these two lines:

```ts
    this.inputCoordinator.setCanFire(false);
    this.htmlControls.setCanFire(false);
```

insert:

```ts
    if (this.online?.inMatch) {
      // Jonh has reacted to the local simulation; score and label wait for the official outcome.
      this.onlineLocal = { outcome: classification.outcome, label: feedback.label, quote, resultSeconds: this.resultWindowSeconds(isBodyHit) };
      this.htmlControls.setFeedback('…', 'info', `Jonh: “${quote}”`);
      this.htmlControls.setResetLabel('Next now ↵');
      this.online.onLocalResolution(classification.outcome);
      return;
    }
```

3. Replace the last two lines of the method:

```ts
    const replaySeconds = this.replayCountdown !== null ? FX.replayAfterSeconds + this.replayPlan().lead / FX.replaySpeed + this.replayPlan().post : 0;
    this.autoAdvance.schedule('shot', isBodyHit ? Math.max(FLOW.bodyHitResultSeconds, replaySeconds + 0.6) : FLOW.shotResultSeconds);
```

with:

```ts
    this.autoAdvance.schedule('shot', this.resultWindowSeconds(isBodyHit));
```

- [ ] **Step 8: Frame update**

Make this the first statement of `update()`:

```ts
    this.online?.update(Math.max(0, Math.min(FLOW.maxFrameSeconds, deltaMs / MS_PER_SECOND)));
```

- [ ] **Step 9: Shared match start**

Replace `startMultiplayer` with:

```ts
  private startMultiplayer(players: MPPlayerSetup[], maps: string[]): void {
    this.beginMatch(new MultiplayerMatchMachine(players, maps));
  }

  /** Shows a match from its machine: a fresh hot-seat match, or an online match fast-forwarded by replayMatch. */
  private beginMatch(machine: MultiplayerMatchMachine): void {
    this.hideAttract();
    this.activeMode = 'multi';
    this.multiMachine = machine;
    this.trailHistory.clear();
    this.loadMultiplayerMap(machine.currentMapId);
    this.updateUIPerMultiState();
  }
```

- [ ] **Step 10: UI per state**

In `updateUIPerMultiState()`:

1. Handover branch: replace `this.menuOverlay.showMPHandover(player, this.currentLevel.name, match.activePlayerShotNumber + 1);` with:

```ts
      const headline = this.online?.inMatch
        ? (match.activePlayerIndex === this.online.mySeat ? 'Your turn!' : `${player.name} is up`)
        : undefined;
      this.menuOverlay.showMPHandover(player, this.currentLevel.name, match.activePlayerShotNumber + 1, headline);
```

2. Replace the whole `aiming` branch with:

```ts
    } else if (match.state === 'aiming') {
      const canAct = this.canUserAct();
      this.htmlControls.setControlsInert(!canAct);
      this.inputCoordinator.setCanFire(canAct);
      this.htmlControls.setCanFire(canAct);
      this.htmlControls.setResetLabel('Aim again ↵');
      const movement = match.activeCycleIndex > 0 ? ' · Jonh has moved—adjust your aim' : '';
      const status = this.online?.inMatch && match.activePlayerIndex !== this.online.mySeat
        ? `${match.activePlayer.name} is aiming…`
        : `${match.activePlayer.name}'s turn · Cycle ${match.activeCycleIndex + 1}/${MULTIPLAYER.shotsPerRound}${movement}`;
      this.htmlControls.setFeedback(status, 'info');
```

3. Match-result branch: replace `this.menuOverlay.showMPMatchResult(match.getWinners(), match.players);` with:

```ts
      this.menuOverlay.showMPMatchResult(match.getWinners(), match.players, this.online?.inMatch ? this.online.resultExtras() : undefined);
```

- [ ] **Step 11: Online hook implementations.** Add these methods to the class.

```ts
  private onlineHooks(): OnlineSceneHooks {
    return {
      showOnlineMatch: machine => {
        this.menuOverlay.hide();
        this.inputCoordinator.setOverlayVisible(false);
        this.autoAdvance.cancel();
        this.pendingLaunch = null;
        this.onlineLocal = null;
        this.beginMatch(machine);
      },
      presentation: () => ({
        state: this.multiMachine?.state ?? 'handover',
        activeSeat: this.multiMachine?.activePlayerIndex ?? 0,
        ready: this.activeMode === 'multi' && !this.sessionCoordinator.isPaused && !this.menuOverlay.isVisible() &&
          this.attemptMachine?.state === 'aiming' && this.pendingLaunch === null,
        shotInFlight: this.attemptMachine?.state === 'simulating' || this.pendingLaunch !== null,
      }),
      playShot: (angle, power) => this.playOnlineShot(angle, power),
      presentSkippedTurn: (seat, angle, power, text) => this.presentSkippedTurn(seat, angle, power, text),
      applyOfficialOutcome: (outcome, mine) => this.applyOfficialOutcome(outcome, mine),
      refreshMatchResult: () => {
        if (this.activeMode === 'multi' && this.multiMachine.state === 'match_result') this.updateUIPerMultiState();
      },
      refreshAimingControls: () => {
        if (this.activeMode === 'multi' && this.multiMachine.state === 'aiming') this.updateUIPerMultiState();
      },
      leaveToMenu: () => this.teardownGameplay(),
    };
  }

  /** Fires someone else's (or my recovered) shot with its recorded aim; input stays locked. */
  private playOnlineShot(angle: number, power: number): void {
    this.currentAngleDeg = angle;
    this.currentPowerPercent = power;
    this.attemptMachine.setAim(angle, power);
    this.htmlControls.setValues(angle, power);
    this.drawCannon();
    this.fire('remote');
  }

  /** A server-skipped turn: nothing is fired; the match records a miss and moves on. */
  private presentSkippedTurn(seat: number, angle: number, power: number, text: string): void {
    this.canvasAim.cancel();
    this.autoAdvance.cancel();
    if (!this.multiMachine.fire(angle, power)) return;
    this.multiMachine.resolveShot('miss');
    this.shotShooterIndex = seat;
    this.inputCoordinator.setCanFire(false);
    this.htmlControls.setCanFire(false);
    this.updateUIPerMultiState();
    this.htmlControls.setFeedback(text, 'miss');
    this.htmlControls.setResetLabel('Next now ↵');
    this.autoAdvance.schedule('shot', FLOW.shotResultSeconds);
  }

  /** Scores and labels the current online shot with the server's outcome. */
  private applyOfficialOutcome(outcome: ClassifiedOutcome, mine: boolean): void {
    if (!this.multiCoordinator.resolveShot(outcome)) return;
    const local = this.onlineLocal;
    this.onlineLocal = null;
    const label = local && local.outcome === outcome ? local.label : OFFICIAL_LABELS[outcome];
    const scored = outcome !== 'miss';
    this.htmlControls.setFeedback(scored ? `${label}  +${OUTCOME_POINTS[outcome]}` : label, scored ? 'hit' : 'miss',
      local ? `Jonh: “${local.quote}”` : '');
    if (mine) this.recordOnlineProgress(outcome);
    this.htmlControls.setResetLabel('Next now ↵');
    this.autoAdvance.schedule('shot', local?.resultSeconds ?? FLOW.shotResultSeconds);
  }

  /** Hats and streaks count only this player's own online shots. */
  private recordOnlineProgress(outcome: ClassifiedOutcome): void {
    const before = this.progress;
    const after = recordShot(before, outcome, false);
    const unlocks = newlyUnlocked(before, after, MAPS.map(m => m.id));
    this.progress = after;
    setTimeout(() => saveProgress(after), 0);
    if (unlocks.length) this.htmlControls.setFeedback(`New hat for Jonh: ${HAT_RULES[unlocks[0]!].name}!`, 'hit');
  }
```

`this.multiMachine?.state` uses `?.` on a field declared with `!`. That is intentional (it is undefined before the first match) and TypeScript accepts it. If lint complains, use `(this.multiMachine as MultiplayerMatchMachine | undefined)?.state`.

- [ ] **Step 11b: Check that hot-seat play is unchanged**

Run `npx vitest run`: all existing tests must pass unchanged. Then `npm run dev` **without** `VITE_CONVEX_URL` (temporarily rename `.env.local`):
- The Online card shows "Online play isn't configured" and is disabled.
- A 2-player hot-seat match on Backyard plays through to the result screen.
- After it, `localStorage['hitJonh.v1']` still has the `lastMP` you entered.

Restore `.env.local`.

- [ ] **Step 12: Check and commit**

Run: `npm run check` and `npm run build`
Expected: both pass.

```bash
git add src/scenes/PrototypeScene.ts
git commit -m "feat(online): wire online play into PrototypeScene behind the OnlineController"
```

---

### Task 15: Manual verification and documentation

**Files:**
- Modify: `SPEC.md` (§4.2; new §6.1)
- Modify: `README.md` (online setup and deployment notes)
- Modify: `docs/progress.md`, `CHANGELOG.md`

**Interfaces:** none (docs and evidence only).

- [ ] **Step 1: Run the manual walkthrough.** Use `npm run dev -- --host` with `.env.local` present. Each tab is its own player (Decision 1), so use two tabs, or a desktop browser plus a phone on the same Wi-Fi. Mark each line PASS / FAIL / NOT VERIFIED (with the reason) in `docs/progress.md`. Spec §8 lists these; the extras come from the Review Focus.
  1. Create a room in tab A. Join from tab B by typing the code in lowercase with a space, then by the copied link. Both are seated, with distinct colour and pattern.
  2. A bad code (`K0QPX`) is rejected locally with a message; an unknown valid code reports "No room with that code."
  3. The host changes the arena and B sees it. B has no Start button. Start is enabled at 2 players.
  4. Play a full single-map match. Each shot animates on both tabs from the moment it is fired. Scores match on both. Handover says "Your turn!" / "{name} is up".
  5. On the other player's turn: Space, arrow keys, dragging and the Fire button do nothing; the status shows "{name} is aiming…".
  6. Pause during the other player's flight; their next shot waits and plays once on resume.
  7. Reload A mid-turn: A rejoins its seat and the match continues. Reload A while its own ball is flying: A replays and reports its own shot, and B is not stuck on "…".
  8. Leave on your own turn: the turn is skipped at once with "{name} was skipped" and no cannon fire.
  9. Close B's tab while it is B's turn: after 60 s "Waiting for … skipping in Ns", and at 90 s a skip.
  10. Idle with the tab open for 120 s on your turn: countdown from 90 s, then a skip.
  11. Kill A's network mid-flight (DevTools → Offline) for over 40 s: B gets B's own outcome (witness), and A sees "Your shot timed out" after reconnecting.
  12. Shared outage: put **both** clients offline for over 120 s mid-turn (DevTools Offline in both, or turn off Wi-Fi), then reconnect. No turns were skipped, the active player got a fresh turn clock, and an in-flight shot was reported by its shooter.
  13. Background tab: hide B's tab for over 5 minutes during A's turns. B is not skipped while away (except on its own turn after 90 s of silence).
  14. Lobby: host tab goes quiet for over 90 s and B becomes host. A returns, rejoins automatically, and pressing Leave does **not** rejoin.
  15. Rematch: both press, so it starts at once. One presses, so "Rematch starts in Ns", and the other sees "You weren't included in the rematch". With fewer than 2 ready, the note "Not enough players…" appears.
  16. Skip-vs-fire race: fire at about 119 s; whichever wins, the loser sees "Your turn was skipped" and both clients agree.
  17. Hot-seat roster: after online play, Pass the cannon still shows your saved local players.
  18. Cleanup cron: use `mcp__convex__data` to confirm rooms exist, and `mcp__convex__logs` to confirm `cleanupRooms` runs hourly without errors. The 24 h deletion itself is NOT VERIFIED unless you wait or temporarily lower `roomTtlHours` (and restore it).
  19. Dev console: note any `[online] shot … local …, official …` mismatch warnings during cross-browser play.

- [ ] **Step 2: Update `SPEC.md`**

In §4.2, change the first item from "Online play/accounts;" to:

```markdown
Accounts, public matchmaking and leaderboards (online play by room code is in scope since 2026-10-08, see §6.1);
```

Add after §6:

```markdown
## 6.1 Online multiplayer [DECIDED by owner 2026-10-08]

Design: `docs/superpowers/specs/2026-10-08-online-multiplayer-design.md`. Summary:

- **Rooms by code.** One player creates a room and gets a 5-character code (shareable as `?room=CODE`); 2–4 friends join. No accounts, no matchmaking. Seat 0 is host in the lobby (maps, Start).
- **Live and turn-based.** Same rules as §6/§7. Each shot is sent when fired (angle/power) and again when it lands (outcome). Every client re-simulates locally; the **shooter's outcome is official** for score and label. Cross-browser divergence only affects the animation.
- **Trust.** The shooter's client is trusted. The server checks turn order, aim ranges, duplicates and map-impossible outcomes, and does not re-simulate physics.
- **Timers run on the server.** Online-only turn limit of 120 s (countdown from 90 s). Missing player skipped after 90 s without a heartbeat (warning from 60 s). Unreported shot resolved after 40 s with a spectator's outcome or a miss. If everyone is disconnected at once, nothing is skipped. Values are [PROPOSED][TUNE] in `ONLINE` (`src/config/tuning.ts`), except the 120 s limit [DECIDED].
- **Rematch.** Any active player may press Rematch. It starts when everyone is ready, or after a 30 s window with the ready players (at least 2). Others see "You weren't included".
- **Identity.** One player per browser tab (token in sessionStorage); a reload keeps the seat. The name/colour profile is saved in `hitJonh.v1.online`. The hot-seat roster is untouched.
- **Out of scope.** Accounts, matchmaking, chat, spectators, live aim streaming, server physics, async play, deployment, kicking.
- **Known limitation.** After a reload, previous-shot trails are empty until each player fires again.
```

- [ ] **Step 3: Update `README.md`.** Add an "Online play (Convex)" section:

```markdown
## Online play (Convex)

Online rooms need a Convex deployment. Without one the game runs normally and the Online card is disabled.

1. `npx convex dev` (first time: log in and create a project). This writes `CONVEX_DEPLOYMENT` and `VITE_CONVEX_URL` to `.env.local` (git-ignored).
2. Keep `npx convex dev` running while editing `convex/`, or push once with `npx convex dev --once`.
3. `npm run dev -- --host` and open the printed LAN URL on each device. Every browser tab is a separate player.
4. `crosscheck.html` (dev server only) checks that shots score identically across browsers.

Deploying later: `npx convex deploy` creates the production backend. Build with `VITE_CONVEX_URL` set to the production URL (`npm run build`), then serve `dist/` from any static host.
```

- [ ] **Step 4: Update `docs/progress.md` and `CHANGELOG.md`.** In progress, add a dated "Online multiplayer" entry covering:
  - what was built;
  - the cross-browser digests from Task 1;
  - `npm run check` / `npm run build` summaries (paste the real output);
  - the Step 1 walkthrough results;
  - the decisions from this plan's "Decisions made while planning";
  - the known limitations (trails after reload; trust model).

  In the changelog, add a short user-facing entry.

- [ ] **Step 5: Final check and commit**

Run: `npm run check` and `npm run build` and paste the summaries into `docs/progress.md`.

```bash
git add SPEC.md README.md docs/progress.md CHANGELOG.md
git commit -m "docs: online multiplayer: SPEC 6.1, README setup, progress evidence, changelog"
```

---

## Self-review notes (plan author)

- **Spec coverage.** §1 decisions → Tasks 7–14. §2 cross-browser check → Task 1 gate. §4 tables, functions and timers → Tasks 7–9, with logic in Tasks 4–5. §4 "Starting a turn", "Empty room" and presence on join → `planTurnStart` and `startTurn`, `touchPresence` in create/join/heartbeat. §5 client modules → Tasks 10–11, 13. §5 scene changes → Task 14. §6 flow and §7 errors → Tasks 12–14, verified in Task 15. §8 tests → Tasks 2–6 and 10–11 (automated), Task 15 (manual). §9 docs → Task 15.
- **Spec deviations** are listed under "Decisions made while planning" and must be raised with the owner at plan review.
- **Untested by automation (by design, no DOM/Convex test runtime):** Convex handlers (MCP smoke runs in Tasks 8–9), DOM screens (Task 12) and scene glue (Tasks 13–14). All are covered by Task 15's walkthrough.
