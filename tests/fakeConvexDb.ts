// tests/fakeConvexDb.ts — a small in-memory stand-in for `ctx.db`, enough to run server functions' own logic.
// It is NOT a Convex runtime: validators, OCC retries, transactions/rollback and real index definitions are not
// exercised. Index ranges are applied as filters on the named fields; rows come back in insertion order (Convex
// orders by the index fields and then _creationTime, which matches for the single-value ranges used here).
import type { MutationCtx } from '../convex/_generated/server';

export type Row = Record<string, unknown> & { _id: string; _creationTime: number };

type Op = 'eq' | 'gt' | 'gte' | 'lt' | 'lte';

export function fakeDb(seed: Record<string, Array<Record<string, unknown> & { _id: string }>> = {}) {
  let clock = 1;
  const tables = new Map<string, Row[]>(Object.entries(seed).map(([name, rows]) => [name, rows.map(r => ({ _creationTime: clock++, ...r }))]));
  const writes: string[] = [];
  let nextId = 1;
  const rows = (table: string) => { if (!tables.has(table)) tables.set(table, []); return tables.get(table)!; };
  const tableOf = (id: string) => [...tables.entries()].find(([, rs]) => rs.some(r => r._id === id))?.[0] ?? null;
  /** Accepts both `get(id)` and `get(table, id)` (and the same for patch/delete). */
  const splitArgs = (a: unknown, b: unknown): [string, unknown] => (typeof b === 'string' ? [b, undefined] : [a as string, b]);

  const db = {
    query: (table: string) => ({
      withIndex: (_index: string, build?: (q: Record<Op, (field: string, value: unknown) => unknown>) => unknown) => {
        const filters: Array<[Op, string, unknown]> = [];
        const q = {} as Record<Op, (field: string, value: unknown) => unknown>;
        for (const op of ['eq', 'gt', 'gte', 'lt', 'lte'] as const) q[op] = (field, value) => { filters.push([op, field, value]); return q; };
        build?.(q);
        const test = (row: Row) => filters.every(([op, field, value]) => {
          const x = row[field] as number | string;
          const y = value as number | string;
          return op === 'eq' ? x === y : op === 'gt' ? x > y : op === 'gte' ? x >= y : op === 'lt' ? x < y : x <= y;
        });
        const matching = () => rows(table).filter(test);
        return {
          unique: async () => {
            const found = matching();
            if (found.length > 1) throw new Error(`unique() found ${found.length} rows in ${table}`);
            return found[0] ?? null;
          },
          first: async () => matching()[0] ?? null,
          collect: async () => matching(),
          take: async (n: number) => matching().slice(0, n),
        };
      },
    }),
    get: async (a: string, b?: string) => {
      const [id] = splitArgs(a, b);
      return [...tables.values()].flat().find(r => r._id === id) ?? null;
    },
    insert: async (table: string, doc: Record<string, unknown>) => {
      const _id = `${table}:${nextId++}`;
      rows(table).push({ _id, _creationTime: clock++, ...doc });
      writes.push(`insert ${table}`);
      return _id;
    },
    patch: async (a: string, b: unknown, c?: Record<string, unknown>) => {
      const [id, fields] = typeof b === 'string' ? [b, c!] : [a, b as Record<string, unknown>];
      const row = [...tables.values()].flat().find(r => r._id === id);
      if (!row) throw new Error(`no row ${id}`);
      Object.assign(row, fields);
      writes.push(`patch ${tableOf(id)}`);
    },
    delete: async (a: string, b?: string) => {
      const [id] = splitArgs(a, b);
      const table = tableOf(id as string);
      if (!table) throw new Error(`no row ${String(id)}`);
      tables.set(table, rows(table).filter(r => r._id !== id));
      writes.push(`delete ${table}`);
    },
  };
  /** Runs one "mutation": like Convex, a throw undoes every write it made. */
  async function transact<T>(fn: (ctx: MutationCtx) => Promise<T>): Promise<T> {
    const before = new Map([...tables.entries()].map(([name, rs]) => [name, rs.map(r => ({ ...r }))]));
    const writesBefore = writes.length;
    try {
      return await fn({ db } as unknown as MutationCtx);
    } catch (error) {
      tables.clear();
      for (const [name, rs] of before) tables.set(name, rs);
      writes.length = writesBefore;
      throw error;
    }
  }
  return { ctx: { db } as unknown as MutationCtx, tables, writes, rows, transact };
}
