/**
 * Per-player history keyed by player index (e.g. each player's last trail).
 * Callers pass the shooter captured at Fire, never the current active player,
 * because the turn has already advanced by the time a shot resolves.
 */
export class PlayerHistory<T> {
  private readonly entries = new Map<number, T>();

  record(playerIndex: number, data: T): void {
    this.entries.set(playerIndex, data);
  }

  get(playerIndex: number): T | null {
    return this.entries.get(playerIndex) ?? null;
  }

  clear(): void {
    this.entries.clear();
  }
}
