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

  it('does not warn during a shared outage with staggered heartbeats (nobody checked in well after the active player)', () => {
    const t = new OnlineMatchTracker();
    t.update(snap([], 1));
    t.setPresence([{ seat: 0, lastSeen: 0 }, { seat: 1, lastSeen: 14_000 }]);
    expect(t.countdowns(70_000).missing).toBeNull();
    expect(t.countdowns(85_000).missing).toBeNull();
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

describe('OnlineMatchTracker: review-focus guarantees', () => {
  it('input on someone else\'s turn, or while catching up, does nothing', () => {
    const t = new OnlineMatchTracker();
    t.update(snap(['body', 'miss', 'body'], 0)); // seat 1 is up next
    expect(t.isMyTurnToAim()).toBe(false);
    const c = new OnlineMatchTracker();
    c.update(snap(['body'], 0));
    c.update(snap(['body', 'miss'], 0)); // seat 0 is up, but seq 1 not yet presented
    expect(c.isMyTurnToAim()).toBe(false);
  });

  it('a shot arriving while presentation is blocked waits, is stable, and plays exactly once', () => {
    const t = new OnlineMatchTracker();
    t.update(snap(['body'], 0));
    t.update(snap(['body', null], 0));
    const a = t.nextPlayback();
    expect(a?.shot.seq).toBe(1);
    for (let i = 0; i < 5; i++) expect(t.nextPlayback()).toEqual(a);
    t.update(snap(['body', 'miss'], 0)); // official outcome arrives while still waiting
    expect(t.nextPlayback()?.shot.seq).toBe(1);
    t.markPresented(1);
    expect(t.nextPlayback()).toBeNull();
    t.update(snap(['body', 'miss'], 0));
    expect(t.nextPlayback()).toBeNull();
  });

  it('presence-only and duplicate snapshots never rebuild or replay a shot', () => {
    const t = new OnlineMatchTracker();
    t.update(snap(['body', null], 0));
    t.markPresented(1);
    const again = snap(['body', null], 0);
    expect(t.update(again).rebuild).toBe(false);
    t.setPresence([{ seat: 0, lastSeen: 1 }]);
    expect(t.update(snap(['body', null], 0)).rebuild).toBe(false);
    expect(t.nextPlayback()).toBeNull();
    expect(t.presented).toBe(2);
  });

  it('does not crash on a finished match with an incomplete shot list', () => {
    const t = new OnlineMatchTracker();
    expect(() => t.update(snap(['body', null], 0, { status: 'finished' }))).not.toThrow();
    expect(() => {
      t.isMyTurnToAim();
      t.nextFireSeq();
      t.nextPlayback();
      t.countdowns(1000);
      t.connectedSeats(1000);
    }).not.toThrow();
    expect(t.isMyTurnToAim()).toBe(false);
  });
});

describe('OnlineMatchTracker: malformed finished match (server fallback)', () => {
  function malformed(kind: 'gap' | 'wrongSeat'): RoomSnapshot {
    const s = snap(['body', 'miss', 'body'], 0, { status: 'finished' });
    if (kind === 'gap') s.shots = [s.shots[0]!, s.shots[2]!];
    else s.shots[1] = { ...s.shots[1]!, seat: s.shots[0]!.seat };
    return s;
  }
  for (const kind of ['gap', 'wrongSeat'] as const) {
    it(`does not throw on a ${kind} shot list`, () => {
      const t = new OnlineMatchTracker();
      expect(() => t.update(malformed(kind))).not.toThrow();
      expect(() => t.nextFireSeq()).not.toThrow();
      expect(() => t.countdowns(1000)).not.toThrow();
      expect(() => t.isMyTurnToAim()).not.toThrow();
      expect(() => t.nextPlayback()).not.toThrow();
      expect(t.isMyTurnToAim()).toBe(false);
    });
  }

  it('shows no countdowns outside a playing room', () => {
    const t = new OnlineMatchTracker();
    t.update(snap(['body'], 0, { status: 'finished', turnClockStart: 0 }));
    const c = t.countdowns(500_000);
    expect(c.turn).toBeNull();
    expect(c.missing).toBeNull();
  });
});
