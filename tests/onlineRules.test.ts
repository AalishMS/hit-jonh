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
