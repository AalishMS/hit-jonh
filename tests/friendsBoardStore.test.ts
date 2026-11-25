// tests/friendsBoardStore.test.ts — this browser's board identity (localStorage) and the Convex wrapper's calls.
import { describe, expect, it, vi } from 'vitest';
import type { ConvexClient } from 'convex/browser';
import { getFunctionName, type FunctionReference } from 'convex/server';
import { FRIENDS_BOARD } from '../src/config/tuning';
import { ConvexBoardBackend } from '../src/net/friendsBoardClient';
import { BOARD_STORE_KEY, localBoardStore, sanitizeBoardStore, withPosted } from '../src/storage/friendsBoardStore';

const TOKEN = 'a'.repeat(32);

function memoryStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return { map, getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => { map.set(k, v); } };
}

describe('board store', () => {
  it('validates stored data field by field', () => {
    expect(sanitizeBoardStore(null, () => TOKEN)).toEqual({ token: TOKEN, boards: [], lastBoard: null, posted: [] });
    expect(sanitizeBoardStore({ token: 'short', boards: ['abcdefgh', 'ABCDEFGH', 'ABCDE', 'nope', 7], lastBoard: 'k7qp-xw2m', posted: ['2026-11-25', 'x', '2026-11-24'] }, () => TOKEN))
      .toEqual({ token: TOKEN, boards: ['ABCDEFGH'], lastBoard: 'K7QPXW2M', posted: ['2026-11-24', '2026-11-25'] });
    const many = Array.from({ length: 30 }, (_, i) => `ABCDEFG${'HJKMNPQRSTUVWXYZ23456789AB'[i % 26]}`);
    expect(sanitizeBoardStore({ token: TOKEN, boards: many }).boards).toHaveLength(FRIENDS_BOARD.maxBoardsPerPlayer);
  });

  it('keeps only the latest posted days', () => {
    let data = sanitizeBoardStore(null, () => TOKEN);
    for (let d = 1; d <= 20; d++) data = withPosted(data, `2026-11-${String(d).padStart(2, '0')}`);
    expect(data.posted).toEqual(['2026-11-13', '2026-11-14', '2026-11-15', '2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20']);
    expect(withPosted(data, '2026-11-20').posted).toHaveLength(8);
  });

  it('writes nothing until first used, then keeps one identity for every tab and load', () => {
    const storage = memoryStorage();
    const make = vi.fn(() => TOKEN);
    const store = localBoardStore(storage, make);
    expect(store.load().token).toBe(TOKEN);
    expect(store.load().token).toBe(TOKEN);
    expect(make).toHaveBeenCalledTimes(1);
    expect(storage.map.size).toBe(0); // a player who never uses boards gets no key
    store.save({ ...store.load(), boards: ['ABCDEFGH'] });
    expect(JSON.parse(storage.map.get(BOARD_STORE_KEY)!)).toMatchObject({ token: TOKEN, boards: ['ABCDEFGH'] });
    expect(localBoardStore(storage, () => 'b'.repeat(32)).load()).toMatchObject({ token: TOKEN, boards: ['ABCDEFGH'] });
  });

  it('replaces a damaged stored token once and keeps the replacement', () => {
    const storage = memoryStorage({ [BOARD_STORE_KEY]: JSON.stringify({ token: 'bad', boards: ['ABCDEFGH'] }) });
    let n = 0;
    const store = localBoardStore(storage, () => (n++ === 0 ? TOKEN : 'b'.repeat(32)));
    expect(store.load()).toMatchObject({ token: TOKEN, boards: ['ABCDEFGH'] });
    expect(store.load().token).toBe(TOKEN);
  });

  it('falls back to memory when storage throws, keeping the identity stable for the page', () => {
    const broken = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
    let n = 0;
    const store = localBoardStore(broken, () => (n++ === 0 ? TOKEN : 'b'.repeat(32)));
    expect(store.load().token).toBe(TOKEN);
    expect(store.load().token).toBe(TOKEN);
    store.save({ ...store.load(), boards: ['ABCDEFGH'] });
    expect(store.load().boards).toEqual(['ABCDEFGH']);
  });
});

describe('ConvexBoardBackend', () => {
  it('sends the token with every call to the boards module', async () => {
    const calls: Array<[string, unknown]> = [];
    const record = (ref: FunctionReference<'query' | 'mutation'>, args: unknown) => { calls.push([getFunctionName(ref), args]); };
    const client = {
      mutation: vi.fn(async (ref: FunctionReference<'mutation'>, args: unknown) => { record(ref, args); return 'K7QPXW2M'; }),
      query: vi.fn(async (ref: FunctionReference<'query'>, args: unknown) => { record(ref, args); return []; }),
      onUpdate: vi.fn((ref: FunctionReference<'query'>, args: unknown) => { record(ref, args); return () => undefined; }),
    } as unknown as ConvexClient;
    const backend = new ConvexBoardBackend(client, TOKEN);
    await backend.createBoard('Sam');
    await backend.joinBoard('ABCDEFGH', 'Sam');
    await backend.leaveBoard('ABCDEFGH');
    await backend.postResult({ day: 20_417, stars: 2, shots: 'mb', streak: 3 });
    await backend.myBoards();
    backend.watchBoard('ABCDEFGH', 20_417, () => undefined, () => undefined);
    expect(calls).toEqual([
      ['boards:createBoard', { token: TOKEN, name: 'Sam' }],
      ['boards:joinBoard', { code: 'ABCDEFGH', token: TOKEN, name: 'Sam' }],
      ['boards:leaveBoard', { code: 'ABCDEFGH', token: TOKEN }],
      ['boards:postResult', { token: TOKEN, day: 20_417, stars: 2, shots: 'mb', streak: 3 }],
      ['boards:myBoards', { token: TOKEN }],
      ['boards:getBoard', { code: 'ABCDEFGH', token: TOKEN, day: 20_417 }],
    ]);
  });
});
