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
