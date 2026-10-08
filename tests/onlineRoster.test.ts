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
