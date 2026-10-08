// convex/timers.ts
import { v } from 'convex/values';
import { internal } from './_generated/api';
import { internalMutation } from './_generated/server';
import { ONLINE } from '../src/config/tuning';
import { rematchDecision } from '../src/rules/onlineRoster';
import { checkInFlightDecision, checkTurnDecision } from '../src/rules/onlineRules';
import { deleteRoomCascade, loadView, resolveShot, startNewMatch, startTurn } from './model';

const turnArgs = { roomId: v.id('rooms'), matchNumber: v.number(), seq: v.number() };

export const checkTurn = internalMutation({
  args: turnArgs,
  handler: async (ctx, { roomId, matchNumber, seq }) => {
    const room = await ctx.db.get(roomId);
    if (!room || room.status !== 'playing' || room.matchNumber !== matchNumber) return;
    const now = Date.now();
    const { view, presence } = await loadView(ctx, roomId);
    const decision = checkTurnDecision(view, presence, now, seq);
    if (decision.kind === 'none') return;
    if (decision.kind === 'wait') {
      // Quiet room (shared outage): restart the turn clock (not a game action, so updatedAt is untouched).
      await ctx.db.patch(roomId, { turnClockStart: decision.clockStart });
      await ctx.scheduler.runAt(decision.at, internal.timers.checkTurn, { roomId, matchNumber, seq });
      return;
    }
    if (decision.kind === 'reschedule') {
      await ctx.scheduler.runAt(decision.at, internal.timers.checkTurn, { roomId, matchNumber, seq });
      return;
    }
    await ctx.db.insert('shots', {
      roomId, matchNumber, seq, seat: decision.seat, angle: decision.angle, power: decision.power,
      outcome: 'miss', witnessOutcome: null, resolution: 'skipped', firedAt: now, resolvedAt: now,
    });
    await startTurn(ctx, roomId, now, now);
  },
});

export const checkInFlight = internalMutation({
  args: turnArgs,
  handler: async (ctx, { roomId, matchNumber, seq }) => {
    const room = await ctx.db.get(roomId);
    if (!room || room.status !== 'playing' || room.matchNumber !== matchNumber) return;
    const now = Date.now();
    const { view, presence, shotDocs } = await loadView(ctx, roomId);
    const decision = checkInFlightDecision(view, presence, now, seq);
    if (decision.kind === 'reschedule') {
      await ctx.scheduler.runAt(decision.at, internal.timers.checkInFlight, { roomId, matchNumber, seq });
    } else if (decision.kind === 'resolve') {
      const shot = shotDocs.find(s => s.seq === seq)!;
      await resolveShot(ctx, roomId, shot._id, decision.outcome, decision.resolution, now);
    }
  },
});

export const startRematch = internalMutation({
  args: { roomId: v.id('rooms'), matchNumber: v.number(), deadline: v.number() },
  handler: async (ctx, { roomId, matchNumber, deadline }) => {
    const room = await ctx.db.get(roomId);
    // A reset followed by a new press sets a new deadline; this older timer must then do nothing.
    if (!room || room.status !== 'finished' || room.matchNumber !== matchNumber || room.rematchDeadline !== deadline) return;
    const now = Date.now();
    const { view, players } = await loadView(ctx, roomId);
    const decision = rematchDecision(view.seats, true);
    if (decision.kind === 'start') {
      await startNewMatch(ctx, roomId, decision.seats, now);
      return;
    }
    for (const p of players) if (p.rematchReady) await ctx.db.patch(p._id, { rematchReady: false });
    await ctx.db.patch(roomId, { rematchDeadline: null });
  },
});

/** Rooms deleted per transaction; a full batch schedules the next one straight away. */
const CLEANUP_BATCH = 50;

export const cleanupRooms = internalMutation({
  args: {},
  handler: async ctx => {
    const cutoff = Date.now() - ONLINE.roomTtlHours * 3600 * 1000;
    const old = await ctx.db.query('rooms').withIndex('by_updatedAt', q => q.lt('updatedAt', cutoff)).take(CLEANUP_BATCH);
    for (const room of old) await deleteRoomCascade(ctx, room._id);
    if (old.length === CLEANUP_BATCH) await ctx.scheduler.runAfter(0, internal.timers.cleanupRooms, {});
  },
});
