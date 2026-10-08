// src/rules/onlineMatch.ts
import { ONLINE } from '../config/tuning';
import type { ClassifiedOutcome } from '../sim/classification';
import { isFresh, isOutlived, lastSeenAfterQuiet } from './onlineRules';
import type { PresenceEntry, RoomSnapshot, ShotRecord } from './onlineTypes';
import { replayMatch, type ReplayResult } from './replayMatch';

const MS = 1000;

export type PlaybackKind = 'skipped' | 'remote' | 'recovered';
export interface PlaybackItem { shot: ShotRecord; kind: PlaybackKind; name: string }
export type Removal = 'none' | 'rejoin' | 'notIncluded';
export interface TrackerUpdate { roomGone: boolean; removal: Removal; rebuild: boolean }
export interface Countdown { seat: number; name: string; secondsLeft: number }
export interface Countdowns { turn: Countdown | null; missing: Countdown | null; rematch: number | null }

/** Pure client-side view of an online room: what to present next and what the local player may do. */
export class OnlineMatchTracker {
  private snap: RoomSnapshot | null = null;
  private presence: readonly PresenceEntry[] = [];
  private leaving = false;
  private hadSeat = false;
  private builtMatch: number | null = null;
  private presentedSeq = 0;
  private readonly firedByMe = new Set<number>();
  private cache: { snap: RoomSnapshot; result: ReplayResult | null } | null = null;

  get snapshot(): RoomSnapshot | null { return this.snap; }
  get mySeat(): number | null { return this.snap?.you ?? null; }
  get isLeaving(): boolean { return this.leaving; }
  /** Shots with seq below this have been shown (or skipped over on a rebuild). */
  get presented(): number { return this.presentedSeq; }

  markLeaving(): void { this.leaving = true; }
  setPresence(entries: readonly PresenceEntry[]): void { this.presence = entries; }

  update(next: RoomSnapshot | null): TrackerUpdate {
    if (next === null) {
      this.snap = null;
      return { roomGone: !this.leaving, removal: 'none', rebuild: false };
    }
    this.snap = next;
    if (next.you === null) {
      const removal: Removal = this.hadSeat && !this.leaving ? (next.room.status === 'lobby' ? 'rejoin' : 'notIncluded') : 'none';
      this.hadSeat = false;
      return { roomGone: false, removal, rebuild: false };
    }
    this.hadSeat = true;
    if (next.room.status === 'lobby') {
      this.builtMatch = null;
      return { roomGone: false, removal: 'none', rebuild: false };
    }
    if (this.builtMatch === next.room.matchNumber) return { roomGone: false, removal: 'none', rebuild: false };
    this.builtMatch = next.room.matchNumber;
    this.resetPresentation();
    return { roomGone: false, removal: 'none', rebuild: true };
  }

  /** Present from the end of the resolved prefix (match start, rematch, reload, resync). */
  resetPresentation(): void {
    this.presentedSeq = this.resolvedPrefix().length;
    this.firedByMe.clear();
  }

  resolvedPrefix(): ShotRecord[] {
    const shots = [...(this.snap?.shots ?? [])].sort((a, b) => a.seq - b.seq);
    const prefix: ShotRecord[] = [];
    for (const shot of shots) {
      if (shot.seq !== prefix.length || shot.outcome === null) break;
      prefix.push(shot);
    }
    return prefix;
  }

  private serverView(): ReplayResult | null {
    const snap = this.snap;
    if (!snap || snap.room.status === 'lobby') return null;
    if (this.cache?.snap !== snap) {
      let result: ReplayResult | null;
      try {
        result = replayMatch({ seats: snap.seats, maps: snap.room.maps, seed: snap.room.seed, shots: snap.shots }, { includeInFlight: true });
      } catch {
        result = null; // server may finish a room with an unreplayable shot list
      }
      this.cache = { snap, result };
    }
    return this.cache.result;
  }

  nextFireSeq(): number { return this.serverView()?.nextSeq ?? 0; }
  markFiredByMe(seq: number): void { this.firedByMe.add(seq); }
  markPresented(seq: number): void { this.presentedSeq = Math.max(this.presentedSeq, seq + 1); }

  officialOutcome(seq: number): ClassifiedOutcome | null {
    return this.snap?.shots.find(s => s.seq === seq)?.outcome ?? null;
  }

  private seatName(seat: number): string {
    return this.snap?.seats.find(s => s.seat === seat)?.name ?? `Player ${seat + 1}`;
  }

  nextPlayback(): PlaybackItem | null {
    const snap = this.snap;
    if (!snap || snap.room.status === 'lobby') return null;
    const shot = snap.shots.find(s => s.seq === this.presentedSeq);
    if (!shot || this.firedByMe.has(shot.seq)) return null;
    const name = this.seatName(shot.seat);
    if (shot.resolution === 'skipped') return { shot, kind: 'skipped', name };
    if (shot.seat === snap.you && shot.outcome === null) return { shot, kind: 'recovered', name };
    return { shot, kind: 'remote', name };
  }

  isMyTurnToAim(): boolean {
    const snap = this.snap;
    if (!snap || this.leaving || snap.you === null || snap.room.status !== 'playing') return false;
    if (this.presentedSeq !== snap.shots.length) return false;
    return this.serverView()?.awaitingSeat === snap.you;
  }

  connectedSeats(now: number): Set<number> {
    const seats = this.snap?.seats ?? [];
    return new Set(seats.filter(s => !s.left && isFresh(s.seat, this.presence, now)).map(s => s.seat));
  }

  countdowns(now: number): Countdowns {
    const snap = this.snap;
    const deadline = snap?.room.rematchDeadline ?? null;
    const rematch = deadline === null ? null : Math.max(0, Math.ceil((deadline - now) / MS));
    const view = this.serverView();
    if (!snap || snap.room.status !== 'playing' || !view || view.awaitingSeat === null) return { turn: null, missing: null, rematch };
    const seat = view.awaitingSeat;
    const name = this.seatName(seat);
    let turn: Countdown | null = null;
    if (now - snap.room.turnClockStart >= ONLINE.turnWarnSeconds * MS) {
      turn = { seat, name, secondsLeft: Math.max(0, Math.ceil((snap.room.turnClockStart + ONLINE.turnLimitSeconds * MS - now) / MS)) };
    }
    let missing: Countdown | null = null;
    const quiet = snap.room.lastQuiet;
    const lastSeen = this.presence.some(p => p.seat === seat) ? lastSeenAfterQuiet(seat, this.presence, quiet) : undefined;
    // Same evidence rule as the server's skip: someone else checked in well after the active player went quiet.
    if (lastSeen !== undefined && now - lastSeen >= ONLINE.staleWarnSeconds * MS && isOutlived(snap.seats, this.presence, seat, quiet)) {
      missing = { seat, name, secondsLeft: Math.max(0, Math.ceil((lastSeen + ONLINE.staleSeconds * MS - now) / MS)) };
    }
    return { turn, missing, rematch };
  }
}
