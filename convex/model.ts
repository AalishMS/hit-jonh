// convex/model.ts
import { ConvexError } from 'convex/values';
import { internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import type { MutationCtx, QueryCtx } from './_generated/server';
import { planTurnStart } from '../src/rules/onlineRules';
import { renumberSeats, staleLobbySeats } from '../src/rules/onlineRoster';
import type { MatchView, OnlineErrorCode, PresenceEntry, Resolution, RoomState, SeatState, ShotRecord } from '../src/rules/onlineTypes';
import type { ClassifiedOutcome } from '../src/sim/classification';

type Reader = Pick<QueryCtx, 'db'>;

export function fail(code: OnlineErrorCode): never {
  throw new ConvexError({ code });
}

export function randomSeed(): number {
  return Math.floor(Math.random() * 0x1_0000_0000) >>> 0;
}

export async function getRoomByCode(ctx: Reader, code: string): Promise<Doc<'rooms'> | null> {
  return ctx.db.query('rooms').withIndex('by_code', q => q.eq('code', code)).unique();
}

export async function requireRoom(ctx: Reader, code: string): Promise<Doc<'rooms'>> {
  return (await getRoomByCode(ctx, code)) ?? fail('NOT_FOUND');
}

export async function listPlayers(ctx: Reader, roomId: Id<'rooms'>): Promise<Doc<'players'>[]> {
  const rows = await ctx.db.query('players').withIndex('by_room', q => q.eq('roomId', roomId)).collect();
  return rows.sort((a, b) => a.seat - b.seat);
}

export async function findMember(ctx: Reader, roomId: Id<'rooms'>, token: string): Promise<Doc<'players'> | null> {
  return ctx.db.query('players').withIndex('by_room_token', q => q.eq('roomId', roomId).eq('token', token)).unique();
}

export async function requireMember(ctx: Reader, roomId: Id<'rooms'>, token: string): Promise<Doc<'players'>> {
  return (await findMember(ctx, roomId, token)) ?? fail('NOT_MEMBER');
}

export async function listShots(ctx: Reader, roomId: Id<'rooms'>, matchNumber: number): Promise<Doc<'shots'>[]> {
  return ctx.db.query('shots')
    .withIndex('by_room_match_seq', q => q.eq('roomId', roomId).eq('matchNumber', matchNumber))
    .collect();
}

export async function listPresence(ctx: Reader, roomId: Id<'rooms'>, players: readonly Doc<'players'>[]): Promise<PresenceEntry[]> {
  const rows = await ctx.db.query('presence').withIndex('by_room', q => q.eq('roomId', roomId)).collect();
  const seatOf = new Map(players.map(p => [p._id, p.seat]));
  return rows.flatMap(r => {
    const seat = seatOf.get(r.playerId);
    return seat === undefined ? [] : [{ seat, lastSeen: r.lastSeen }];
  });
}

export const toRoomState = (r: Doc<'rooms'>): RoomState => ({
  code: r.code, status: r.status, maps: r.maps, seed: r.seed, matchNumber: r.matchNumber,
  matchStartedAt: r.matchStartedAt, turnClockStart: r.turnClockStart, rematchDeadline: r.rematchDeadline,
});

export const toSeat = (p: Doc<'players'>): SeatState => ({
  seat: p.seat, name: p.name, color: p.color, pattern: p.pattern, left: p.left, rematchReady: p.rematchReady,
});

export const toShot = (s: Doc<'shots'>): ShotRecord => ({
  seq: s.seq, seat: s.seat, angle: s.angle, power: s.power, outcome: s.outcome, witnessOutcome: s.witnessOutcome,
  resolution: s.resolution, firedAt: s.firedAt, resolvedAt: s.resolvedAt,
});

export async function loadView(ctx: Reader, roomId: Id<'rooms'>) {
  const room = (await ctx.db.get(roomId)) ?? fail('NOT_FOUND');
  const players = await listPlayers(ctx, roomId);
  const shotDocs = await listShots(ctx, roomId, room.matchNumber);
  const presence = await listPresence(ctx, roomId, players);
  const view: MatchView = { room: toRoomState(room), seats: players.map(toSeat), shots: shotDocs.map(toShot) };
  return { room, players, shotDocs, presence, view };
}

export async function touchPresence(ctx: MutationCtx, roomId: Id<'rooms'>, playerId: Id<'players'>, now: number): Promise<void> {
  const existing = await ctx.db.query('presence').withIndex('by_player', q => q.eq('playerId', playerId)).unique();
  if (existing) await ctx.db.patch(existing._id, { lastSeen: now });
  else await ctx.db.insert('presence', { roomId, playerId, lastSeen: now });
}

async function deletePlayer(ctx: MutationCtx, playerId: Id<'players'>): Promise<void> {
  const presence = await ctx.db.query('presence').withIndex('by_player', q => q.eq('playerId', playerId)).collect();
  for (const row of presence) await ctx.db.delete(row._id);
  await ctx.db.delete(playerId);
}

/** Lobby only: removes players and keeps seats contiguous (the new seat 0 is host). */
export async function removeLobbyPlayers(ctx: MutationCtx, roomId: Id<'rooms'>, playerIds: readonly Id<'players'>[]): Promise<void> {
  for (const id of playerIds) await deletePlayer(ctx, id);
  for (const p of renumberSeats(await listPlayers(ctx, roomId))) {
    if (p.seat !== p.newSeat) await ctx.db.patch(p._id, { seat: p.newSeat });
  }
}

export async function pruneLobby(ctx: MutationCtx, roomId: Id<'rooms'>, now: number): Promise<void> {
  const players = await listPlayers(ctx, roomId);
  const stale = new Set(staleLobbySeats(players, await listPresence(ctx, roomId, players), now));
  const ids = players.filter(p => stale.has(p.seat)).map(p => p._id);
  if (ids.length > 0) await removeLobbyPlayers(ctx, roomId, ids);
}

/** "Starting a turn" (spec §4): skip gone seats at once, then schedule the next check. */
export async function startTurn(ctx: MutationCtx, roomId: Id<'rooms'>, now: number, clockStart: number): Promise<void> {
  const { room, view, presence } = await loadView(ctx, roomId);
  if (room.status !== 'playing') return;
  const plan = planTurnStart(view, presence, now, clockStart);
  for (const skip of plan.skips) await ctx.db.insert('shots', { roomId, matchNumber: room.matchNumber, ...skip });
  await ctx.db.patch(roomId, plan.finished
    ? { status: 'finished', turnClockStart: plan.clockStart, updatedAt: now }
    : { turnClockStart: plan.clockStart, updatedAt: now });
  if (plan.checkAt !== null && plan.checkSeq !== null) {
    await ctx.scheduler.runAt(plan.checkAt, internal.timers.checkTurn, { roomId, matchNumber: room.matchNumber, seq: plan.checkSeq });
  }
}

export async function resolveShot(ctx: MutationCtx, roomId: Id<'rooms'>, shotId: Id<'shots'>,
  outcome: ClassifiedOutcome, resolution: Resolution, now: number): Promise<void> {
  await ctx.db.patch(shotId, { outcome, resolution, resolvedAt: now });
  await startTurn(ctx, roomId, now, now);
}

/** Rematch: keep only `keepSeats`, renumber them, wipe the old shots and start match n+1. */
export async function startNewMatch(ctx: MutationCtx, roomId: Id<'rooms'>, keepSeats: readonly number[], now: number): Promise<void> {
  const room = (await ctx.db.get(roomId)) ?? fail('NOT_FOUND');
  const players = await listPlayers(ctx, roomId);
  const keep = new Set(keepSeats);
  for (const p of players) if (!keep.has(p.seat)) await deletePlayer(ctx, p._id);
  for (const p of renumberSeats(players.filter(p => keep.has(p.seat)))) {
    await ctx.db.patch(p._id, { seat: p.newSeat, left: false, rematchReady: false });
  }
  for (const shot of await listShots(ctx, roomId, room.matchNumber)) await ctx.db.delete(shot._id);
  await ctx.db.patch(roomId, {
    status: 'playing', matchNumber: room.matchNumber + 1, seed: randomSeed(), matchStartedAt: now,
    turnClockStart: now, rematchDeadline: null, updatedAt: now,
  });
  await startTurn(ctx, roomId, now, now);
}

export async function deleteRoomCascade(ctx: MutationCtx, roomId: Id<'rooms'>): Promise<void> {
  const shots = await ctx.db.query('shots').withIndex('by_room_match_seq', q => q.eq('roomId', roomId)).collect();
  for (const s of shots) await ctx.db.delete(s._id);
  const presence = await ctx.db.query('presence').withIndex('by_room', q => q.eq('roomId', roomId)).collect();
  for (const p of presence) await ctx.db.delete(p._id);
  const players = await ctx.db.query('players').withIndex('by_room', q => q.eq('roomId', roomId)).collect();
  for (const p of players) await ctx.db.delete(p._id);
  await ctx.db.delete(roomId);
}
