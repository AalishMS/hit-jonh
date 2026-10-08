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
