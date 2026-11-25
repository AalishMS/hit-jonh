// src/storage/friendsBoardStore.ts — this browser's Daily Bonk friends-board identity (SPEC §6.2), kept apart from
// the `hitJonh.v1` save on purpose: save codes never carry it (the token is a secret, and a save code is meant to
// be pasted around), and clearing it only forgets the boards, never progress.
import { normalizeRoomCode } from '../rules/roomCode';
import { FRIENDS_BOARD } from '../config/tuning';
import { randomToken } from './storage';

export const BOARD_STORE_KEY = 'hitJonh.v1.boards';

export interface BoardStoreData {
  /** This browser's board identity (32 hex chars). localStorage, so every tab and every day is the same member. */
  token: string;
  /** Codes of the boards I'm in, as last confirmed (the server's `myBoards` is the truth). */
  boards: string[];
  /** The board opened last, so the Daily's "Friends board" button lands straight on it. */
  lastBoard: string | null;
  /** Local date keys whose counted Daily run the server has (or finally refused). Only the latest few are kept. */
  posted: string[];
}

export interface BoardStore {
  load(): BoardStoreData;
  save(data: BoardStoreData): void;
}

const POSTED_KEEP = 8;

/** Validates stored data field by field; anything unusable is replaced (a bad token by a fresh one). */
export function sanitizeBoardStore(raw: unknown, make: () => string = randomToken): BoardStoreData {
  const r = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  const token = typeof r.token === 'string' && /^[0-9a-f]{32}$/.test(r.token) ? r.token : make();
  const codes = Array.isArray(r.boards) ? r.boards.flatMap(c => (typeof c === 'string' ? [normalizeRoomCode(c)] : [])).filter((c): c is string => c !== null) : [];
  const boards = [...new Set(codes)].slice(0, FRIENDS_BOARD.maxBoardsPerPlayer);
  const last = typeof r.lastBoard === 'string' ? normalizeRoomCode(r.lastBoard) : null;
  const posted = Array.isArray(r.posted) ? r.posted.filter((k): k is string => typeof k === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(k)) : [];
  return { token, boards, lastBoard: last, posted: [...new Set(posted)].sort().slice(-POSTED_KEEP) };
}

/** Adds a key to `posted`, keeping only the latest few. */
export function withPosted(data: BoardStoreData, key: string): BoardStoreData {
  return { ...data, posted: [...new Set([...data.posted, key])].sort().slice(-POSTED_KEEP) };
}

/**
 * The store backed by localStorage. When storage is unavailable (private windows, blocked site data) it keeps the
 * data in memory for this page, so the identity at least stays stable until a reload.
 */
export function localBoardStore(storage: Pick<Storage, 'getItem' | 'setItem'> | null = typeof localStorage === 'undefined' ? null : localStorage,
  make: () => string = randomToken): BoardStore {
  let memory: BoardStoreData | null = null;
  return {
    load() {
      try {
        const text = storage?.getItem(BOARD_STORE_KEY);
        if (text) { memory = sanitizeBoardStore(JSON.parse(text), make); return memory; }
      } catch { /* fall through to memory */ }
      if (!memory) {
        memory = sanitizeBoardStore(null, make);
        try { storage?.setItem(BOARD_STORE_KEY, JSON.stringify(memory)); } catch { /* memory only */ }
      }
      return memory;
    },
    save(data) {
      memory = sanitizeBoardStore(data, make);
      try { storage?.setItem(BOARD_STORE_KEY, JSON.stringify(memory)); } catch { /* memory only */ }
    },
  };
}
