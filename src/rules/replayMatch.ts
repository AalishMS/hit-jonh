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
