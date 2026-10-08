import { MULTIPLAYER } from '../config/tuning';

/** Trims a name, caps its length and falls back to "Player N" when blank or not text. */
export function sanitizePlayerName(raw: unknown, index: number): string {
  const name = typeof raw === 'string' ? raw.trim().substring(0, MULTIPLAYER.maxNameLength).trim() : '';
  return name || `Player ${index + 1}`;
}
