import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ConvexClient } from 'convex/browser';
import { ONLINE } from '../src/config/tuning';
import { OnlineSession } from '../src/net/onlineSession';

function fakeClient() {
  const subs: Array<{ args: { code: string }; onError?: unknown }> = [];
  const client = {
    onUpdate: vi.fn((_q: unknown, args: { code: string }, _cb: unknown, onError?: unknown) => { subs.push({ args, onError }); return () => {}; }),
    mutation: vi.fn(async () => ({ now: 1 })),
    connectionState: () => ({ isWebSocketConnected: true }),
  };
  return { client: client as unknown as ConvexClient, subs };
}
const valid = ONLINE.codeAlphabet[0]!.repeat(ONLINE.codeLength);
const listener = { onRoom() {}, onPresence() {} };

afterEach(() => vi.unstubAllGlobals());

describe('OnlineSession.enter', () => {
  it('normalizes the code for subscriptions and exposes it, with error callbacks', () => {
    vi.stubGlobal('document', { addEventListener() {}, removeEventListener() {}, visibilityState: 'visible' });
    const { client, subs } = fakeClient();
    const session = new OnlineSession(client, 't');
    session.enter(` ${valid.toLowerCase()} `, listener);
    expect(session.code).toBe(valid);
    expect(subs.length).toBe(2);
    for (const s of subs) { expect(s.args.code).toBe(session.code); expect(typeof s.onError).toBe('function'); }
    session.exit();
  });

  it('rejects an invalid code with a clear message and subscribes to nothing', () => {
    const { client, subs } = fakeClient();
    const session = new OnlineSession(client, 't');
    expect(() => session.enter('!!', listener)).toThrow("That doesn't look like a room code.");
    expect(subs.length).toBe(0);
  });
});

describe('OnlineSession.leaveRoom', () => {
  it('leaves a room it never entered when given its code, and does nothing with no room at all', async () => {
    const { client } = fakeClient();
    const session = new OnlineSession(client, 't');
    await session.leaveRoom();
    expect(client.mutation).not.toHaveBeenCalled();
    await session.leaveRoom(valid);
    expect(client.mutation).toHaveBeenCalledWith(expect.anything(), { code: valid, token: 't' });
  });
});

describe('OnlineSession.peekSeat', () => {
  function withSnapshot(snapshot: unknown) {
    const { client } = fakeClient();
    (client as unknown as { query: unknown }).query = vi.fn(async () => snapshot);
    return new OnlineSession(client, 't');
  }
  const seats = [{ seat: 0, left: false }, { seat: 1, left: true }];

  it('returns the seat this token still holds', async () => {
    expect(await withSnapshot({ seats, you: 0 }).peekSeat(valid)).toBe(0);
  });

  it('treats a seat that has left (or no seat, or no room) as none, so the link opens Join instead', async () => {
    expect(await withSnapshot({ seats, you: 1 }).peekSeat(valid)).toBeNull();
    expect(await withSnapshot({ seats, you: null }).peekSeat(valid)).toBeNull();
    expect(await withSnapshot(null).peekSeat(valid)).toBeNull();
  });
});
