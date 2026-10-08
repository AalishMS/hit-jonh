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
