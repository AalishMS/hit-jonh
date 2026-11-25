// tests/emotesServer.test.ts — convex/emotes.ts's `storeEmote` against a small in-memory stand-in for `ctx.db`.
// This proves the function's own logic (authentication, validation, rate limit, seq, what it does not write).
// It is NOT a Convex runtime: indexes, OCC retries, validators and deployment are not exercised here.
import { describe, expect, it } from 'vitest';
import { ConvexError } from 'convex/values';
import type { MutationCtx } from '../convex/_generated/server';
import { storeEmote } from '../convex/emotes';
import { ONLINE } from '../src/config/tuning';

type Row = Record<string, unknown> & { _id: string };

/** Tables of plain rows with just the query/get/insert/patch surface storeEmote uses. */
function fakeDb(seed: Record<string, Row[]>) {
  const tables = new Map(Object.entries(seed).map(([name, rows]) => [name, rows.map(r => ({ ...r }))]));
  const writes: string[] = [];
  let nextId = 1;
  const rows = (table: string) => { if (!tables.has(table)) tables.set(table, []); return tables.get(table)!; };
  const db = {
    query: (table: string) => ({
      withIndex: (_index: string, build: (q: { eq: (field: string, value: unknown) => unknown }) => unknown) => {
        const filters: Array<[string, unknown]> = [];
        const q = { eq(field: string, value: unknown) { filters.push([field, value]); return q; } };
        build(q);
        const matching = () => rows(table).filter(r => filters.every(([f, v]) => r[f] === v));
        return {
          unique: async () => {
            const found = matching();
            if (found.length > 1) throw new Error('unique() found several rows');
            return found[0] ?? null;
          },
          collect: async () => matching(),
          take: async (n: number) => matching().slice(0, n),
        };
      },
    }),
    get: async (id: string) => [...tables.values()].flat().find(r => r._id === id) ?? null,
    insert: async (table: string, doc: Record<string, unknown>) => {
      const _id = `${table}:${nextId++}`;
      rows(table).push({ _id, ...doc });
      writes.push(`insert ${table}`);
      return _id;
    },
    patch: async (id: string, fields: Record<string, unknown>) => {
      const row = [...tables.values()].flat().find(r => r._id === id);
      if (!row) throw new Error(`no row ${id}`);
      Object.assign(row, fields);
      const table = [...tables.entries()].find(([, rs]) => rs.includes(row))![0];
      writes.push(`patch ${table}`);
    },
  };
  return { ctx: { db } as unknown as MutationCtx, tables, writes };
}

const TOKEN = 'a'.repeat(32);
const OTHER = 'b'.repeat(32);
const world = () => fakeDb({
  rooms: [{ _id: 'rooms:r', code: 'ABCDE', status: 'playing', updatedAt: 111 }],
  players: [
    { _id: 'players:p0', roomId: 'rooms:r', seat: 0, token: TOKEN, left: false },
    { _id: 'players:p1', roomId: 'rooms:r', seat: 1, token: OTHER, left: false },
    { _id: 'players:p2', roomId: 'rooms:r', seat: 2, token: 'c'.repeat(32), left: true },
  ],
});

async function codeOf(promise: Promise<unknown>): Promise<string | null> {
  try { await promise; } catch (e) { if (e instanceof ConvexError) return (e.data as { code: string }).code; throw e; }
  return null;
}

const send = (w: ReturnType<typeof world>, token: string, emote: string, now: number, code = 'ABCDE') =>
  storeEmote(w.ctx, { code, token, emote }, now);

describe('storeEmote', () => {
  it('stores a valid emote for the caller and counts them from 1', async () => {
    const w = world();
    await send(w, TOKEN, 'beat_that', 1_000);
    expect(w.tables.get('emotes')).toEqual([expect.objectContaining({
      roomId: 'rooms:r', playerId: 'players:p0', emote: 'beat_that', seq: 1, at: 1_000, tokens: ONLINE.emoteBurst - 1,
    })]);
    await send(w, TOKEN, 'oof', 1_000 + ONLINE.emoteRefillSeconds * 1000);
    expect(w.tables.get('emotes')).toHaveLength(1); // rewritten in place, one row per player
    expect(w.tables.get('emotes')![0]).toMatchObject({ emote: 'oof', seq: 2 });
    await send(w, OTHER, 'unlucky', 5_000);
    expect(w.tables.get('emotes')).toHaveLength(2);
  });

  it('works in the lobby, during the match and on the result screen', async () => {
    for (const status of ['lobby', 'playing', 'finished']) {
      const w = world();
      w.tables.get('rooms')![0]!.status = status;
      expect(await codeOf(send(w, TOKEN, 'rematch', 1))).toBeNull();
      expect(w.tables.get('emotes')).toHaveLength(1);
    }
  });

  it('rejects ids outside the fixed list, including free text, without writing', async () => {
    for (const bad of ['', 'hello there', 'Beat that!', 'BEAT_THAT', 'x'.repeat(5_000), '__proto__']) {
      const w = world();
      expect(await codeOf(send(w, TOKEN, bad, 1))).toBe('INVALID_EMOTE');
      expect(w.writes).toEqual([]);
    }
  });

  it('authenticates like the other mutations: unknown room, wrong token, a seat that left', async () => {
    const w = world();
    expect(await codeOf(send(w, TOKEN, 'oof', 1, 'ZZZZZ'))).toBe('NOT_FOUND');
    expect(await codeOf(send(w, 'd'.repeat(32), 'oof', 1))).toBe('NOT_MEMBER');
    expect(await codeOf(send(w, 'c'.repeat(32), 'oof', 1))).toBe('NOT_MEMBER');
    expect(w.writes).toEqual([]);
  });

  it('rate-limits per seat: the burst, then one per refill, and one seat never uses another’s allowance', async () => {
    const w = world();
    for (let i = 0; i < ONLINE.emoteBurst; i++) expect(await codeOf(send(w, TOKEN, 'oof', 10_000))).toBeNull();
    expect(await codeOf(send(w, TOKEN, 'oof', 10_000))).toBe('RATE_LIMITED');
    expect(await codeOf(send(w, TOKEN, 'oof', 10_000 + ONLINE.emoteRefillSeconds * 500))).toBe('RATE_LIMITED');
    expect(await codeOf(send(w, OTHER, 'oof', 10_000))).toBeNull();
    expect(await codeOf(send(w, TOKEN, 'oof', 10_000 + ONLINE.emoteRefillSeconds * 1000))).toBeNull();
    // a refused send changes nothing: the seq counts accepted emotes only
    expect(w.tables.get('emotes')!.find(r => r.playerId === 'players:p0')).toMatchObject({ seq: ONLINE.emoteBurst + 1 });
  });

  it('writes only the caller’s emote row: never the room, the players, presence or shots', async () => {
    const w = world();
    await send(w, TOKEN, 'poor_jonh', 50_000);
    await send(w, TOKEN, 'oof', 50_000);
    expect(new Set(w.writes)).toEqual(new Set(['insert emotes', 'patch emotes']));
    expect(w.tables.get('rooms')![0]).toEqual({ _id: 'rooms:r', code: 'ABCDE', status: 'playing', updatedAt: 111 });
    expect(w.tables.has('presence')).toBe(false);
    expect(w.tables.has('shots')).toBe(false);
  });
});
