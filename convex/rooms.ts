// convex/rooms.ts
import { v } from 'convex/values';
import type { Id } from './_generated/dataModel';
import { mutation, query } from './_generated/server';
import type { MutationCtx } from './_generated/server';
import { MULTIPLAYER } from '../src/config/tuning';
import { assignAppearance } from '../src/rules/onlineRoster';
import { validMaps } from '../src/rules/onlineRules';
import { sanitizePlayerName } from '../src/rules/playerName';
import { generateRoomCode } from '../src/rules/roomCode';
import type { RoomSnapshot } from '../src/rules/onlineTypes';
import {
  fail, findMember, getRoomByCode, listPlayers, listPresence, listShots, pruneLobby, randomSeed,
  removeLobbyPlayers, requireMember, requireRoom, startTurn, toRoomState, toSeat, toShot, touchPresence,
} from './model';

const isToken = (token: string) => /^[0-9a-f]{32}$/.test(token);
const profileArgs = { name: v.string(), color: v.number(), pattern: v.string() };

export const getRoom = query({
  args: { code: v.string(), token: v.string() },
  handler: async (ctx, { code, token }): Promise<RoomSnapshot | null> => {
    const room = await getRoomByCode(ctx, code);
    if (!room) return null;
    const players = await listPlayers(ctx, room._id);
    const shots = await listShots(ctx, room._id, room.matchNumber);
    return {
      room: toRoomState(room),
      seats: players.map(toSeat),
      shots: shots.map(toShot),
      you: players.find(p => p.token === token)?.seat ?? null,
    };
  },
});

export const getPresence = query({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const room = await getRoomByCode(ctx, code);
    if (!room) return [];
    return listPresence(ctx, room._id, await listPlayers(ctx, room._id));
  },
});

export const createRoom = mutation({
  args: { token: v.string(), maps: v.array(v.string()), ...profileArgs },
  handler: async (ctx, args): Promise<string> => {
    if (!isToken(args.token)) fail('NOT_MEMBER');
    if (!validMaps(args.maps)) fail('INVALID_MAPS');
    const now = Date.now();
    let code = generateRoomCode(Math.random);
    for (let attempt = 0; attempt < 10 && (await getRoomByCode(ctx, code)); attempt++) code = generateRoomCode(Math.random);
    if (await getRoomByCode(ctx, code)) throw new Error('Could not allocate a room code');
    const roomId = await ctx.db.insert('rooms', {
      code, status: 'lobby', maps: args.maps, seed: 0, matchNumber: 0, matchStartedAt: 0,
      turnClockStart: 0, rematchDeadline: null, updatedAt: now,
    });
    const look = assignAppearance([], args);
    const playerId = await ctx.db.insert('players', {
      roomId, seat: 0, name: sanitizePlayerName(args.name, 0), color: look.color, pattern: look.pattern,
      token: args.token, left: false, rematchReady: false,
    });
    await touchPresence(ctx, roomId, playerId, now);
    return code;
  },
});

export const joinRoom = mutation({
  args: { code: v.string(), token: v.string(), ...profileArgs },
  handler: async (ctx, args): Promise<{ seat: number }> => {
    if (!isToken(args.token)) fail('NOT_MEMBER');
    const room = await requireRoom(ctx, args.code);
    const now = Date.now();
    const mine = await findMember(ctx, room._id, args.token);
    if (mine) {
      if (mine.left && room.status === 'playing') await ctx.db.patch(mine._id, { left: false });
      await touchPresence(ctx, room._id, mine._id, now);
      return { seat: mine.seat };
    }
    if (room.status !== 'lobby') fail('ALREADY_STARTED');
    await pruneLobby(ctx, room._id, now);
    const players = await listPlayers(ctx, room._id);
    if (players.length >= MULTIPLAYER.maxPlayers) fail('FULL');
    const seat = players.length;
    const look = assignAppearance(players, args);
    const playerId = await ctx.db.insert('players', {
      roomId: room._id, seat, name: sanitizePlayerName(args.name, seat), color: look.color, pattern: look.pattern,
      token: args.token, left: false, rematchReady: false,
    });
    await touchPresence(ctx, room._id, playerId, now);
    await ctx.db.patch(room._id, { updatedAt: now });
    return { seat };
  },
});

export const setMaps = mutation({
  args: { code: v.string(), token: v.string(), maps: v.array(v.string()) },
  handler: async (ctx, { code, token, maps }) => {
    const room = await requireRoom(ctx, code);
    const me = await requireMember(ctx, room._id, token);
    if (room.status !== 'lobby') fail('ALREADY_STARTED');
    if (me.seat !== 0) fail('NOT_HOST');
    if (!validMaps(maps)) fail('INVALID_MAPS');
    await ctx.db.patch(room._id, { maps, updatedAt: Date.now() });
    return null;
  },
});

export const startMatch = mutation({
  args: { code: v.string(), token: v.string() },
  handler: async (ctx, { code, token }) => {
    const room = await requireRoom(ctx, code);
    const me = await requireMember(ctx, room._id, token);
    if (room.status !== 'lobby') fail('ALREADY_STARTED');
    if (me.seat !== 0) fail('NOT_HOST');
    const now = Date.now();
    await touchPresence(ctx, room._id, me._id, now);
    await pruneLobby(ctx, room._id, now);
    if ((await listPlayers(ctx, room._id)).length < MULTIPLAYER.minPlayers) fail('NOT_ENOUGH_PLAYERS');
    await ctx.db.patch(room._id, {
      status: 'playing', seed: randomSeed(), matchStartedAt: now, turnClockStart: now, rematchDeadline: null, updatedAt: now,
    });
    await startTurn(ctx, room._id, now, now);
    return null;
  },
});

export const heartbeat = mutation({
  args: { code: v.string(), token: v.string() },
  handler: async (ctx, { code, token }) => {
    const now = Date.now();
    const room = await getRoomByCode(ctx, code);
    if (!room) return { now };
    const me = await findMember(ctx, room._id, token);
    if (!me) return { now };
    await touchPresence(ctx, room._id, me._id, now);
    // A vanished host is replaced here, so the lobby never needs a newcomer to unstick it.
    if (room.status === 'lobby') await pruneLobby(ctx, room._id, now);
    return { now };
  },
});

export const leaveRoom = mutation({
  args: { code: v.string(), token: v.string() },
  handler: async (ctx, { code, token }) => {
    const room = await getRoomByCode(ctx, code);
    if (!room) return null;
    const me = await findMember(ctx, room._id, token);
    if (!me) return null;
    const now = Date.now();
    if (room.status === 'lobby') {
      await removeLobbyPlayers(ctx, room._id, [me._id]);
      await ctx.db.patch(room._id, { updatedAt: now });
      return null;
    }
    await ctx.db.patch(me._id, { left: true, rematchReady: false });
    await ctx.db.patch(room._id, { updatedAt: now });
    await afterLeave(ctx, room._id, me.seat, now);
    return null;
  },
});

/** Replaced in Task 9. */
async function afterLeave(_ctx: MutationCtx, _roomId: Id<'rooms'>, _seat: number, _now: number): Promise<void> {}
