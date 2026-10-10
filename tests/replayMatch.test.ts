// tests/replayMatch.test.ts
import { describe, expect, it } from 'vitest';
import { MULTIPLAYER } from '../src/config/tuning';

const THREE_MAPS = ['backyard', 'fence', 'rooftop'];
import { MultiplayerMatchMachine, OUTCOME_POINTS } from '../src/rules/multiplayerMatch';
import { replayMatch } from '../src/rules/replayMatch';
import { seededRandom } from '../src/rules/seededRandom';
import type { ClassifiedOutcome } from '../src/sim/classification';
import { makeRoom, makeSeats, playShots } from './onlineFixtures';

const CYCLE: ClassifiedOutcome[] = ['body', 'miss', 'hat_only', 'ricochet_body', 'miss'];

describe('replayMatch', () => {
  for (const n of [2, 3, 4]) {
    for (const maps of [['fence'], THREE_MAPS]) {
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
    const maps = [...THREE_MAPS];
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
