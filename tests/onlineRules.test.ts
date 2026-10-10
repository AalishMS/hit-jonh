// tests/onlineRules.test.ts
import { describe, expect, it } from 'vitest';
import { ONLINE } from '../src/config/tuning';
import {
  acceptWitness, checkInFlightDecision, checkTurnDecision, isRoomQuiet, lastLife, mapHasRicochet,
  planTurnStart, quietEnded, validMaps, validateFire, validateReport,
} from '../src/rules/onlineRules';
import type { MatchView, PresenceEntry, QuietPeriod, ShotRecord } from '../src/rules/onlineTypes';
import { replayMatch } from '../src/rules/replayMatch';
import { MAP_IDS } from '../src/levels';
import { freshPresence, makeSeats, makeView } from './onlineFixtures';

/** Two players on backyard: seat 0 hit, seat 1 is up (seq 1). */
const awaitingSeat1 = () => makeView(2, ['body']);
/** Seat 1's shot (seq 1, aim 31/60, fired at 1001 ms) is in flight. */
const inFlight = () => makeView(2, ['body', null]);
const withShot = (view: MatchView, seq: number, patch: Partial<ShotRecord>): MatchView =>
  ({ ...view, shots: view.shots.map(s => (s.seq === seq ? { ...s, ...patch } : s)) });

describe('validMaps / mapHasRicochet', () => {
  it('accepts any distinct subset of the shared map list', () => {
    expect(validMaps(['backyard'])).toBe(true);
    expect(validMaps([...MAP_IDS])).toBe(true);
    expect(validMaps(['rubber'])).toBe(true);
    expect(validMaps([])).toBe(false);
    expect(validMaps(['backyard', 'backyard'])).toBe(false);
    expect(validMaps(['nowhere'])).toBe(false);
  });
  it('reads ricochet surfaces from level data', () => {
    expect(mapHasRicochet('backyard')).toBe(true);
    expect(mapHasRicochet('nowhere')).toBe(false);
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

const HEARTBEAT = ONLINE.heartbeatSeconds * 1000;
const STALE = ONLINE.staleSeconds * 1000;
const TURN = ONLINE.turnLimitSeconds * 1000;
const IN_FLIGHT = ONLINE.inFlightTimeoutSeconds * 1000;
const RECHECK = ONLINE.turnLimitRecheckSeconds * 1000;

/** Check-ins every `interval` ms from `first` until `until` (exclusive), as the presence row would show at `now`. */
const beats = (first: number, interval: number, until = Number.POSITIVE_INFINITY) => (now: number): number | null => {
  const last = Math.min(now, until - 1);
  return last < first ? null : first + Math.floor((last - first) / interval) * interval;
};
type Beats = ReturnType<typeof beats>;
const presenceAt = (now: number, bySeat: Record<number, Beats>): PresenceEntry[] =>
  Object.entries(bySeat).flatMap(([seat, b]) => {
    const lastSeen = b(now);
    return lastSeen === null ? [] : [{ seat: Number(seat), lastSeen }];
  });

/**
 * Runs the server's `checkTurn` timer chain for seq 1 of `view` from `firstAt` until it skips or passes `until`,
 * applying clock restarts like `convex/timers.ts` does.
 */
function runTurnTimers(view: MatchView, bySeat: Record<number, Beats>, firstAt: number, until: number) {
  let clock = view.room.turnClockStart;
  let at = firstAt;
  const restarts: number[] = [];
  while (at <= until) {
    const d = checkTurnDecision({ ...view, room: { ...view.room, turnClockStart: clock } }, presenceAt(at, bySeat), at, 1);
    if (d.kind === 'skip') return { skippedAt: at, clock, restarts, nextAt: null };
    if (d.kind === 'none') throw new Error('unexpected none');
    if (d.kind === 'wait') { clock = d.clockStart; restarts.push(d.clockStart); }
    if (d.at <= at) throw new Error(`timer did not advance at ${at}`);
    at = d.at;
  }
  return { skippedAt: null, clock, restarts, nextAt: at };
}

describe('evidence of life', () => {
  it('lastLife is the latest check-in of a seat still in the match', () => {
    const seats = makeSeats(3, [{}, { left: true }]);
    const presence = [{ seat: 0, lastSeen: 5_000 }, { seat: 1, lastSeen: 9_000 }, { seat: 2, lastSeen: 7_000 }];
    expect(lastLife(seats, presence)).toBe(7_000);
    expect(lastLife(seats, presence, 2)).toBe(5_000);
    expect(lastLife(seats, [])).toBe(Number.NEGATIVE_INFINITY);
  });
  it('the room is quiet once nobody still in the match checked in for two heartbeats', () => {
    const seats = makeSeats(2);
    expect(isRoomQuiet(seats, [{ seat: 0, lastSeen: 0 }, { seat: 1, lastSeen: 1_000 }], 1_000 + 2 * HEARTBEAT)).toBe(true);
    expect(isRoomQuiet(seats, [{ seat: 0, lastSeen: 0 }, { seat: 1, lastSeen: 1_000 }], 1_000 + 2 * HEARTBEAT - 1)).toBe(false);
    expect(isRoomQuiet(makeSeats(2, [{ left: true }]), freshPresence([0], 10_000), 10_000)).toBe(true);
  });
});

describe('checkTurnDecision: shared outage needs evidence of life before skipping', () => {
  it('never skips during a shared outage with staggered heartbeats (Alice last checked in 14 s before Bob)', () => {
    // Alice is seat 1 (up at seq 1), Bob seat 0. Both drop at 30 s; Alice's last beat was 20 s, Bob's 34 s.
    const outage = { 1: beats(20_000, HEARTBEAT, 30_000), 0: beats(34_000 - 2 * HEARTBEAT, HEARTBEAT, 35_000) };
    for (let now = 35_000; now <= 900_000; now += 1_000) {
      for (const clock of [0, now - TURN, now - 1_000]) {
        const view = makeView(2, ['body'], { turnClockStart: clock });
        expect(checkTurnDecision(view, presenceAt(now, outage), now, 1).kind, `now ${now} clock ${clock}`).not.toBe('skip');
      }
    }
    expect(runTurnTimers(awaitingSeat1(), outage, 95_000, 900_000).skippedAt).toBeNull();
  });

  it('turn limit expiring 10 s into an outage: no skip, and the clock restarts once the room is quiet', () => {
    const outageStart = TURN - 10_000;
    const outage = { 1: beats(5_000, HEARTBEAT, outageStart), 0: beats(12_000, HEARTBEAT, outageStart) };
    const lastBeat = Math.max(outage[1](outageStart)!, outage[0](outageStart)!);
    const during = runTurnTimers(awaitingSeat1(), outage, 50_000, 400_000);
    expect(during.skippedAt).toBeNull();
    expect(during.restarts.length).toBeGreaterThan(0);
    expect(during.restarts[0]).toBeGreaterThanOrEqual(lastBeat + 2 * HEARTBEAT);
    expect(during.restarts[0]).toBeLessThan(lastBeat + 3 * HEARTBEAT);

    // Back online at 400 s, heartbeating normally: the active player gets (about) a fresh turn limit.
    const back = 400_000;
    const online = { 1: beats(back, HEARTBEAT), 0: beats(back + 3_000, HEARTBEAT) };
    const view = makeView(2, ['body'], { turnClockStart: during.clock });
    const after = runTurnTimers(view, online, during.nextAt!, back + 10 * TURN);
    expect(during.clock).toBeGreaterThanOrEqual(back - 2 * HEARTBEAT);
    expect(after.skippedAt).not.toBeNull();
    expect(after.skippedAt!).toBeGreaterThanOrEqual(during.clock + TURN);
    expect(after.skippedAt!).toBeLessThanOrEqual(during.clock + TURN + HEARTBEAT);
  });

  it('skips a truly missing player at 90 s while a spectator is present', () => {
    const view = makeView(2, ['body'], { turnClockStart: 5_000 });
    const missing = beats(5_000, HEARTBEAT, 5_001); // Alice's last check-in: 5 s
    expect(runTurnTimers(view, { 1: missing, 0: beats(7_000, HEARTBEAT) }, 5_001, 400_000).skippedAt).toBe(5_000 + STALE);
  });

  it('skips a truly missing player at 90 s even when the spectator only checks in once a minute (background tab), with no quiet period recorded', () => {
    const view = makeView(2, ['body'], { turnClockStart: 5_000 });
    const missing = beats(5_000, HEARTBEAT, 5_001);
    const throttled = 60_000;
    for (let phase = 0; phase < throttled; phase += 1_000) {
      const result = runTurnTimers(view, { 1: missing, 0: beats(5_000 + phase - throttled, throttled) }, 5_001, 400_000);
      expect(result.skippedAt, `phase ${phase}`).toBe(5_000 + STALE);
    }
  });

  it('skips at the turn limit only once someone checked in after it; otherwise rechecks shortly after', () => {
    const presence = [{ seat: 0, lastSeen: TURN - 1_000 }, { seat: 1, lastSeen: TURN - 1_000 }];
    expect(RECHECK).toBeLessThan(HEARTBEAT);
    expect(checkTurnDecision(awaitingSeat1(), presence, TURN, 1)).toEqual({ kind: 'reschedule', at: TURN + RECHECK });
    expect(checkTurnDecision(awaitingSeat1(), presence, TURN + 5_000, 1)).toEqual({ kind: 'reschedule', at: TURN + 5_000 + RECHECK });
    const fresh = [{ seat: 0, lastSeen: TURN }, { seat: 1, lastSeen: TURN - 1_000 }];
    expect(checkTurnDecision(awaitingSeat1(), fresh, TURN, 1).kind).toBe('skip');
    expect(checkTurnDecision(awaitingSeat1(), fresh, TURN + HEARTBEAT, 1).kind).toBe('skip');
  });

  it('with the clients\' check-ins at the limit (countdown at 0), the skip lands one recheck after the limit', () => {
    // Regular beats on their own phases; every client also checks in when its countdown reaches 0 (here 300 ms late).
    const atZero = TURN + 300;
    for (let phase = 0; phase < HEARTBEAT; phase += 1_000) {
      const ins = { 0: [...every(phase, TURN), atZero, ...every(TURN + phase, 2 * TURN)], 1: [...every(phase + 500, TURN), atZero] };
      const result = runRoomTimers(awaitingSeat1(), ins, 30_000, 2 * TURN);
      expect(result.skippedAt, `phase ${phase}`).not.toBeNull();
      expect(result.skippedAt!, `phase ${phase}`).toBeGreaterThanOrEqual(TURN);
      expect(result.skippedAt!, `phase ${phase}`).toBeLessThanOrEqual(TURN + RECHECK);
    }
  });

  it('still never skips at the limit while nobody checks in after it, and still waits once the room is quiet', () => {
    // Both drop 10 s before the limit; rechecks after the limit run every RECHECK until the room is quiet.
    const outageStart = TURN - 10_000;
    const ins = { 0: every(4_000, outageStart), 1: every(0, outageStart) };
    const lastBeat = Math.max(...ins[0], ...ins[1]);
    let at = TURN;
    let clock = 0;
    const kinds: string[] = [];
    while (at < TURN + 5 * HEARTBEAT) {
      const d = checkTurnDecision(roomAt(awaitingSeat1(), ins, at, clock), presenceFrom(ins, at), at, 1);
      kinds.push(d.kind);
      expect(d.kind, `at ${at}`).not.toBe('skip');
      if (d.kind === 'none' || d.kind === 'skip') break;
      if (d.kind === 'wait') {
        expect(d).toEqual({ kind: 'wait', clockStart: at, at: at + 2 * HEARTBEAT });
        expect(at).toBeGreaterThanOrEqual(lastBeat + 2 * HEARTBEAT);
        clock = d.clockStart;
      } else if (at < lastBeat + 2 * HEARTBEAT) {
        expect(d.at, `at ${at}`).toBe(at + RECHECK);
      }
      at = d.at;
    }
    expect(kinds).toContain('wait');
  });

  it('waits and restarts the clock, checking again two heartbeats later, while the room is quiet', () => {
    const now = 500_000;
    expect(checkTurnDecision(awaitingSeat1(), [{ seat: 0, lastSeen: 0 }, { seat: 1, lastSeen: 0 }], now, 1))
      .toEqual({ kind: 'wait', clockStart: now, at: now + 2 * HEARTBEAT });
  });
});

describe('planTurnStart: all-quiet room', () => {
  it('skips only seats that left and waits on the first one still in the match', () => {
    const now = 60_000;
    const view = makeView(3, ['body'], {}, [{}, { left: true }, {}]);
    // Everyone went quiet 40 s ago: not stale yet, but quiet.
    const quiet = [0, 1, 2].map(seat => ({ seat, lastSeen: now - 40_000 }));
    const plan = planTurnStart(view, quiet, now, now);
    expect(plan.skips.map(s => s.seat)).toEqual([1]);
    expect(plan).toMatchObject({ finished: false, checkSeq: 2, checkAt: now + 2 * HEARTBEAT, clockStart: now });
  });
});

describe('checkInFlightDecision: deadline during an outage', () => {
  const deadline = 1_001 + IN_FLIGHT;
  it('reschedules a heartbeat later until someone checks in after the deadline, then falls back', () => {
    // Shooter (seat 1) fired at 1001 then dropped with Bob; Bob's last beat was 10 s.
    const outage = [{ seat: 0, lastSeen: 10_000 }, { seat: 1, lastSeen: 1_001 }];
    expect(checkInFlightDecision(inFlight(), outage, deadline, 1)).toEqual({ kind: 'reschedule', at: deadline + HEARTBEAT });
    expect(checkInFlightDecision(inFlight(), outage, deadline + 300_000, 1)).toEqual({ kind: 'reschedule', at: deadline + 300_000 + HEARTBEAT });
    const back = [{ seat: 0, lastSeen: deadline + 200_000 }, { seat: 1, lastSeen: 1_001 }];
    expect(checkInFlightDecision(inFlight(), back, deadline + 210_000, 1)).toEqual({ kind: 'resolve', outcome: 'miss', resolution: 'timeout' });
    expect(checkInFlightDecision(withShot(inFlight(), 1, { witnessOutcome: 'body' }), back, deadline + 210_000, 1))
      .toEqual({ kind: 'resolve', outcome: 'body', resolution: 'witness' });
  });
  it('a left shooter without a witness also waits for a check-in, unless nobody is left in the match', () => {
    const shooterLeft = makeView(2, ['body', null], {}, [{}, { left: true }]);
    expect(checkInFlightDecision(shooterLeft, [{ seat: 0, lastSeen: 10_000 }], deadline + 1, 1)).toEqual({ kind: 'reschedule', at: deadline + 1 + HEARTBEAT });
    expect(checkInFlightDecision(shooterLeft, [{ seat: 0, lastSeen: deadline }], deadline + 1, 1))
      .toEqual({ kind: 'resolve', outcome: 'miss', resolution: 'timeout' });
    const everyoneLeft = makeView(2, ['body', null], {}, [{ left: true }, { left: true }]);
    expect(checkInFlightDecision(everyoneLeft, [], deadline, 1)).toEqual({ kind: 'resolve', outcome: 'miss', resolution: 'timeout' });
  });
});

/** Each seat's check-in times (ascending): heartbeats, fires, reports, rejoins. */
type CheckIns = Record<number, readonly number[]>;
/** Check-ins every heartbeat from `from` until `until` (exclusive). */
const every = (from: number, until: number, step = HEARTBEAT): number[] =>
  Array.from({ length: Math.max(0, Math.ceil((until - from) / step)) }, (_, i) => from + i * step);
const presenceFrom = (ins: CheckIns, now: number): PresenceEntry[] =>
  Object.entries(ins).flatMap(([seat, times]) => {
    const seen = times.filter(t => t <= now);
    return seen.length === 0 ? [] : [{ seat: Number(seat), lastSeen: seen[seen.length - 1]! }];
  });

/** The room's `lastQuiet` at `now`, as the server's check-in helper records it: every check-in replays `quietEnded`. */
function quietFrom(view: MatchView, ins: CheckIns, now: number): QuietPeriod | undefined {
  const events = Object.values(ins).flatMap(times => times.filter(t => t <= now)).sort((a, b) => a - b);
  let quiet: QuietPeriod | undefined;
  for (const t of events) quiet = quietEnded(view.seats, presenceFrom(ins, t - 1), t) ?? quiet;
  return quiet;
}
const roomAt = (view: MatchView, ins: CheckIns, now: number, clock = view.room.turnClockStart): MatchView => {
  const quiet = quietFrom(view, ins, now);
  return { ...view, room: { ...view.room, turnClockStart: clock, ...(quiet ? { lastQuiet: quiet } : {}) } };
};

/** {@link runTurnTimers} with check-ins recording quiet periods, as on the server. */
function runRoomTimers(view: MatchView, ins: CheckIns, firstAt: number, until: number, seq = 1) {
  let clock = view.room.turnClockStart;
  let at = firstAt;
  while (at <= until) {
    const d = checkTurnDecision(roomAt(view, ins, at, clock), presenceFrom(ins, at), at, seq);
    if (d.kind === 'skip') return { skippedAt: at, clock };
    if (d.kind === 'none') throw new Error('unexpected none');
    if (d.kind === 'wait') clock = d.clockStart;
    if (d.at <= at) throw new Error(`timer did not advance at ${at}`);
    at = d.at;
  }
  return { skippedAt: null, clock };
}

/** Runs `checkInFlight` for seq 1 from its deadline until it resolves; returns when and how. */
function runInFlightTimers(view: MatchView, ins: CheckIns, until: number) {
  let at = view.shots[1]!.firedAt + IN_FLIGHT;
  while (at <= until) {
    const d = checkInFlightDecision(roomAt(view, ins, at), presenceFrom(ins, at), at, 1);
    if (d.kind === 'resolve') return { at, ...d };
    if (d.kind === 'none') throw new Error('unexpected none');
    if (d.at <= at) throw new Error(`timer did not advance at ${at}`);
    at = d.at;
  }
  return null;
}

describe('after a shared outage, everyone gets a full stale window from the first check-in back', () => {
  const down = 30_000;
  const back = 200_000; // first check-in after a 170 s outage
  const end = 1_000_000;

  it('records a quiet period when a check-in lands in a quiet room, and only then', () => {
    const seats = makeSeats(2);
    const before = [{ seat: 0, lastSeen: 19_000 }, { seat: 1, lastSeen: 15_000 }];
    expect(quietEnded(seats, before, back)).toEqual({ start: 19_000, end: back });
    expect(quietEnded(seats, before, 19_000 + 2 * HEARTBEAT - 1)).toBeNull();
    expect(quietEnded(seats, [], back)).toBeNull();
  });

  it('checkTurn: the active player is not skipped while reconnecting 40 s after the other player', () => {
    // Alice (seat 1) is up. Bob (seat 0) is back at 200 s, Alice at 240 s.
    const ins = { 0: [...every(4_000, down), ...every(back, end)], 1: [...every(0, down), ...every(back + 40_000, end)] };
    const result = runRoomTimers(awaitingSeat1(), ins, 10_000, end);
    // Only the turn limit ends her turn, on the clock restarted during the outage.
    expect(result.skippedAt).not.toBeNull();
    expect(result.skippedAt!).toBeGreaterThanOrEqual(back + STALE);
    expect(result.skippedAt).toBe(result.clock + TURN);
  });

  it('checkTurn: an active player who never comes back is skipped a full stale window after the first check-in back', () => {
    const ins = { 0: [...every(4_000, down), ...every(back, end)], 1: every(0, down) };
    expect(runRoomTimers(awaitingSeat1(), ins, 10_000, end).skippedAt).toBe(back + STALE);
  });

  it('the shooter\'s report after an outage does not skip the players who have not reconnected yet', () => {
    const view = makeView(3, ['body', null]);
    const shooter = view.shots[1]!.seat;
    const [first, second] = [0, 1, 2].filter(s => s !== shooter) as [number, number];
    const ins = {
      [shooter]: [...every(0, down), ...every(back, end)], // the report is the first check-in back
      [first]: [...every(5_000, down), ...every(back + 20_000, end)],
      [second]: [...every(10_000, down), ...every(back + 40_000, end)],
    };
    const resolved = withShot(view, 1, { outcome: 'miss', resolution: 'shooter', resolvedAt: back });
    const plan = planTurnStart(roomAt(resolved, ins, back), presenceFrom(ins, back), back, back);
    expect(plan.skips).toEqual([]);
    expect(plan.checkSeq).toBe(2);
    const next = { ...resolved, room: { ...resolved.room, turnClockStart: back } };
    expect(runRoomTimers(next, ins, plan.checkAt!, end, 2).skippedAt).toBe(back + TURN);
  });

  it('a truly missing player after the report is still skipped a full stale window after it', () => {
    const view = makeView(3, ['body', null]);
    const shooter = view.shots[1]!.seat;
    const resolved = withShot(view, 1, { outcome: 'miss', resolution: 'shooter', resolvedAt: back });
    const up = replayMatch({ seats: resolved.seats, maps: resolved.room.maps, seed: resolved.room.seed, shots: resolved.shots },
      { includeInFlight: true }).awaitingSeat!;
    const other = [0, 1, 2].find(s => s !== shooter && s !== up)!;
    const ins = {
      [shooter]: [...every(0, down), ...every(back, end)],
      [up]: every(5_000, down), // never comes back
      [other]: [...every(10_000, down), ...every(back + 20_000, end)],
    };
    const plan = planTurnStart(roomAt(resolved, ins, back), presenceFrom(ins, back), back, back);
    expect(plan.skips).toEqual([]);
    const next = { ...resolved, room: { ...resolved.room, turnClockStart: back } };
    expect(runRoomTimers(next, ins, plan.checkAt!, end, 2).skippedAt).toBe(back + STALE);
  });

  it('in-flight: a spectator back first does not time out the shooter who reconnects 30 s later', () => {
    // Alice (seat 1) fired at 1 s; the deadline passes during the outage. Bob is back at 200 s, Alice at 230 s.
    const ins = { 0: [...every(4_000, down), ...every(back, end)], 1: [...every(1_001, down), ...every(back + 30_000, end)] };
    const result = runInFlightTimers(inFlight(), ins, end);
    expect(result).not.toBeNull();
    expect(result!.at).toBeGreaterThan(back + 30_000);
  });

  it('in-flight: a shooter who never comes back times out a full stale window after the first check-in back', () => {
    const ins = { 0: [...every(4_000, down), ...every(back, end)], 1: every(1_001, down) };
    expect(runInFlightTimers(inFlight(), ins, end)).toEqual({ at: back + STALE, kind: 'resolve', outcome: 'miss', resolution: 'timeout' });
    const witnessed = withShot(inFlight(), 1, { witnessOutcome: 'body' });
    expect(runInFlightTimers(witnessed, ins, end)).toMatchObject({ at: back + STALE, outcome: 'body', resolution: 'witness' });
  });

  it('a background-tab spectator (one check-in a minute) still gets a missing player skipped, one minute late at most', () => {
    // Each of Bob's minute-apart check-ins ends a "quiet" room. The first such quiet period still catches Alice;
    // the next one does not, because by then Bob had outlived her.
    const throttled = 60_000;
    for (let phase = 0; phase < throttled; phase += 1_000) {
      const bob = every(5_000 + phase - throttled, end, throttled);
      const ins = { 0: bob, 1: [5_000] };
      const view = makeView(2, ['body'], { turnClockStart: 5_000 });
      const skippedAt = runRoomTimers(view, ins, 5_001, end).skippedAt;
      const firstBeatAfterStale = bob.find(b => b >= 5_000 + STALE)!;
      expect(skippedAt, `phase ${phase}`).not.toBeNull();
      expect(skippedAt!, `phase ${phase}`).toBeGreaterThanOrEqual(5_000 + STALE);
      expect(skippedAt!, `phase ${phase}`).toBeLessThanOrEqual(firstBeatAfterStale + 2 * HEARTBEAT);
    }
  });
});

describe('checkTurnDecision', () => {
  it('reschedules at the earlier of the turn limit and the stale limit', () => {
    const now = 10_000;
    const presence = [{ seat: 0, lastSeen: 9_000 }, { seat: 1, lastSeen: 9_000 }];
    expect(checkTurnDecision(awaitingSeat1(), presence, now, 1)).toEqual({ kind: 'reschedule', at: 99_000 });
  });
  it('skips at the turn limit with the seat\'s last aim', () => {
    const now = TURN + HEARTBEAT;
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
    expect(plan).toMatchObject({ finished: false, checkSeq: 2, checkAt: now + 2 * HEARTBEAT, clockStart: now });
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
  it('keeps waiting in an empty room, checking again a heartbeat later', () => {
    const stale = [{ seat: 0, lastSeen: 0 }, { seat: 1, lastSeen: 0 }];
    expect(checkInFlightDecision(inFlight(), stale, 200_000, 1)).toEqual({ kind: 'reschedule', at: 200_000 + HEARTBEAT });
    expect(checkInFlightDecision(makeView(2, ['body', null], {}, [{}, { left: true }]), stale, 200_000, 1))
      .toEqual({ kind: 'reschedule', at: 200_000 + HEARTBEAT });
  });
  it('does nothing for resolved or unknown shots', () => {
    expect(checkInFlightDecision(makeView(2, ['body', 'miss']), [], 99_000, 1)).toEqual({ kind: 'none' });
    expect(checkInFlightDecision(inFlight(), [], 99_000, 7)).toEqual({ kind: 'none' });
  });
});
