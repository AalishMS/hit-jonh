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
