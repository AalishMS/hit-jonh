// convex/emotes.ts — online emotes (spec §6.1). Canned reactions only; nothing here touches turns, timers,
// heartbeats, scores or the room's cleanup clock.
import { v } from 'convex/values';
import type { MutationCtx } from './_generated/server';
import { mutation, query } from './_generated/server';
import { MULTIPLAYER } from '../src/config/tuning';
import { checkEmoteSend } from '../src/rules/onlineEmotes';
import type { EmoteEntry } from '../src/rules/onlineTypes';
import { fail, getRoomByCode, listPlayers, requireMember, requireRoom } from './model';

/**
 * Validates, rate-limits and stores one emote for the caller's seat. Exported apart from `sendEmote` so the
 * tests can run it against an in-memory database.
 *
 * It reads the room and the caller's player row (to authenticate, as every mutation does) but writes only the
 * caller's own `emotes` row. It deliberately does not call `touchPresence` or patch `rooms.updatedAt`: an emote
 * is not a game action, so spam can neither keep a dead room from being cleaned up nor fake a check-in.
 * A read of the room by this mutation can only make *this* mutation retry when a turn lands at the same time.
 */
export async function storeEmote(ctx: MutationCtx, args: { code: string; token: string; emote: string }, now: number): Promise<void> {
  const room = await requireRoom(ctx, args.code);
  const me = await requireMember(ctx, room._id, args.token);
  if (me.left) fail('NOT_MEMBER');
  const prior = await ctx.db.query('emotes').withIndex('by_player', q => q.eq('playerId', me._id)).unique();
  const check = checkEmoteSend(args.emote, prior ? { tokens: prior.tokens, at: prior.at } : null, now);
  if (!check.ok) fail(check.code);
  const row = { emote: check.emote, seq: (prior?.seq ?? 0) + 1, at: now, tokens: check.bucket.tokens };
  if (prior) await ctx.db.patch(prior._id, row);
  else await ctx.db.insert('emotes', { roomId: room._id, playerId: me._id, ...row });
}

export const sendEmote = mutation({
  args: { code: v.string(), token: v.string(), emote: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await storeEmote(ctx, args, Date.now());
    return null;
  },
});

/** Each seated player's latest emote. A separate subscription from `getRoom`, so emotes never re-run it. */
export const getEmotes = query({
  args: { code: v.string(), token: v.string() },
  handler: async (ctx, { code, token }): Promise<EmoteEntry[]> => {
    const room = await getRoomByCode(ctx, code);
    if (!room) return [];
    const players = await listPlayers(ctx, room._id);
    const rows = await ctx.db.query('emotes').withIndex('by_room', q => q.eq('roomId', room._id)).take(MULTIPLAYER.maxPlayers * 4);
    return rows.flatMap(row => {
      const player = players.find(p => p._id === row.playerId);
      return player ? [{ sender: player._id, seat: player.seat, emote: row.emote, seq: row.seq, at: row.at, mine: player.token === token }] : [];
    });
  },
});
