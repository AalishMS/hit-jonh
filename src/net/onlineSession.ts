import type { ConvexClient } from 'convex/browser';
import { api } from '../../convex/_generated/api';
import { ONLINE } from '../config/tuning';
import type { PresenceEntry, RoomSnapshot } from '../rules/onlineTypes';
import { normalizeRoomCode } from '../rules/roomCode';
import type { ClassifiedOutcome } from '../sim/classification';
import type { OnlineProfile } from '../storage/storage';
import { isRetryable, withRetry } from './retry';

export interface RoomListener {
  onRoom(snapshot: RoomSnapshot | null): void;
  onPresence(entries: PresenceEntry[]): void;
}

/** Typed codes are normalized here because the server does an exact lookup. */
export function requireValidCode(code: string): string {
  const normalized = normalizeRoomCode(code);
  if (!normalized) throw new Error("That doesn't look like a room code.");
  return normalized;
}

/** A throwing query must not become an uncaught async error; the connection banner covers outages. */
function swallowSubscriptionError(): void { /* intentionally ignored */ }

/** The only module that talks to Convex. One instance per tab; `enter`/`exit` switch rooms. */
export class OnlineSession {
  private unsubscribers: Array<() => void> = [];
  private heartbeatId: ReturnType<typeof setInterval> | null = null;
  private clockOffsetMs = 0;
  private currentCode: string | null = null;
  private readonly onVisibility = () => { if (document.visibilityState === 'visible') void this.beat(); };

  constructor(private readonly client: ConvexClient, private readonly token: string) {}

  /** The normalized code of the room currently entered, or null. */
  get code(): string | null { return this.currentCode; }

  /** Server time estimate, for displaying countdowns only. */
  get serverNow(): number { return Date.now() + this.clockOffsetMs; }
  get connected(): boolean { return this.client.connectionState().isWebSocketConnected; }

  /**
   * The seat this token still holds in the room, or null. A seat marked `left` counts as none: the player left on
   * purpose, so a room link must show Join (whose `joinRoom` clears `left`) rather than silently re-entering.
   */
  async peekSeat(code: string): Promise<number | null> {
    const snapshot = await this.client.query(api.rooms.getRoom, { code: requireValidCode(code), token: this.token });
    const you = snapshot?.you ?? null;
    if (you === null || snapshot?.seats.find(s => s.seat === you)?.left) return null;
    return you;
  }

  createRoom(profile: OnlineProfile, maps: string[]): Promise<string> {
    return this.client.mutation(api.rooms.createRoom, { token: this.token, maps, ...profile });
  }

  async joinRoom(code: string, profile: OnlineProfile): Promise<void> {
    await this.client.mutation(api.rooms.joinRoom, { code: requireValidCode(code), token: this.token, ...profile });
  }

  enter(typedCode: string, listener: RoomListener): void {
    const code = requireValidCode(typedCode);
    this.exit();
    this.currentCode = code;
    this.unsubscribers.push(this.client.onUpdate(api.rooms.getRoom, { code, token: this.token }, s => listener.onRoom(s), swallowSubscriptionError));
    this.unsubscribers.push(this.client.onUpdate(api.rooms.getPresence, { code }, e => listener.onPresence(e), swallowSubscriptionError));
    void this.beat();
    this.heartbeatId = setInterval(() => void this.beat(), ONLINE.heartbeatSeconds * 1000);
    document.addEventListener('visibilitychange', this.onVisibility);
  }

  exit(): void {
    for (const unsubscribe of this.unsubscribers) unsubscribe();
    this.unsubscribers = [];
    if (this.heartbeatId !== null) clearInterval(this.heartbeatId);
    this.heartbeatId = null;
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.currentCode = null;
  }

  /** Captures the code synchronously, so calling `exit()` right after is safe. Errors are ignored. */
  async leaveRoom(): Promise<void> {
    const code = this.currentCode;
    if (!code) return;
    try { await this.client.mutation(api.rooms.leaveRoom, { code, token: this.token }); } catch { /* leaving is best-effort */ }
  }

  async setMaps(maps: string[]): Promise<void> {
    await this.client.mutation(api.rooms.setMaps, { code: this.requireCode(), token: this.token, maps });
  }

  async startMatch(): Promise<void> {
    await this.client.mutation(api.rooms.startMatch, { code: this.requireCode(), token: this.token });
  }

  requestRematch(matchNumber: number): void {
    const code = this.currentCode;
    if (code) void this.client.mutation(api.rooms.requestRematch, { code, token: this.token, matchNumber }).catch(() => undefined);
  }

  async fireShot(args: { matchNumber: number; seq: number; angle: number; power: number }): Promise<void> {
    const code = this.requireCode();
    await withRetry(() => this.client.mutation(api.rooms.fireShot, { code, token: this.token, ...args }),
      ONLINE.retryDelaysSeconds, isRetryable);
  }

  async reportOutcome(args: { matchNumber: number; seq: number; outcome: ClassifiedOutcome }): Promise<void> {
    const code = this.requireCode();
    await withRetry(() => this.client.mutation(api.rooms.reportOutcome, { code, token: this.token, ...args }),
      ONLINE.retryDelaysSeconds, isRetryable);
  }

  /** Sent once; the server ignores late or duplicate witnesses. */
  reportWitness(args: { matchNumber: number; seq: number; outcome: ClassifiedOutcome }): void {
    const code = this.currentCode;
    if (code) void this.client.mutation(api.rooms.reportWitness, { code, token: this.token, ...args }).catch(() => undefined);
  }

  private requireCode(): string {
    if (!this.currentCode) throw new Error('OnlineSession: not in a room');
    return this.currentCode;
  }

  private async beat(): Promise<void> {
    const code = this.currentCode;
    if (!code) return;
    try {
      const sentAt = Date.now();
      const { now } = await this.client.mutation(api.rooms.heartbeat, { code, token: this.token });
      this.clockOffsetMs = now - (sentAt + Date.now()) / 2;
    } catch {
      // The connection state drives the "Reconnecting…" banner.
    }
  }
}
