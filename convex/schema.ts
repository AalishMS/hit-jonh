import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';
import { outcomeValidator, resolutionValidator } from './validators';

export default defineSchema({
  rooms: defineTable({
    code: v.string(),
    status: v.union(v.literal('lobby'), v.literal('playing'), v.literal('finished')),
    maps: v.array(v.string()),
    seed: v.number(),
    matchNumber: v.number(),
    matchStartedAt: v.number(),
    turnClockStart: v.number(),
    rematchDeadline: v.union(v.number(), v.null()),
    /** The latest quiet period a check-in ended (spec §4 "Empty room"); staleness counts from its end. */
    lastQuiet: v.optional(v.object({ start: v.number(), end: v.number() })),
    /** Last game action (never heartbeats); drives cleanup. */
    updatedAt: v.number(),
  }).index('by_code', ['code']).index('by_updatedAt', ['updatedAt']),

  players: defineTable({
    roomId: v.id('rooms'),
    seat: v.number(),
    name: v.string(),
    color: v.number(),
    pattern: v.string(),
    /** Client secret; never returned by a query. */
    token: v.string(),
    left: v.boolean(),
    rematchReady: v.boolean(),
  }).index('by_room', ['roomId']).index('by_room_token', ['roomId', 'token']),

  /** Separate from players so heartbeats never re-run getRoom. */
  presence: defineTable({
    roomId: v.id('rooms'),
    playerId: v.id('players'),
    lastSeen: v.number(),
  }).index('by_room', ['roomId']).index('by_player', ['playerId']),

  /**
   * Each player's latest emote plus their send allowance (spec §6.1). Its own table, like `presence`: an emote
   * writes only here, so it never collides with a turn, a shot or a heartbeat, and the read-side `getEmotes`
   * subscription is separate from `getRoom`. At most one row per player, rewritten in place.
   */
  emotes: defineTable({
    roomId: v.id('rooms'),
    playerId: v.id('players'),
    /** An id from EMOTES in src/rules/onlineEmotes.ts. */
    emote: v.string(),
    /** This player's emote count, from 1. */
    seq: v.number(),
    /** When it was sent; also when `tokens` was last counted. */
    at: v.number(),
    /** Send allowance left as of `at`. */
    tokens: v.number(),
  }).index('by_room', ['roomId']).index('by_player', ['playerId']),

  shots: defineTable({
    roomId: v.id('rooms'),
    matchNumber: v.number(),
    seq: v.number(),
    seat: v.number(),
    angle: v.number(),
    power: v.number(),
    outcome: v.union(outcomeValidator, v.null()),
    witnessOutcome: v.union(outcomeValidator, v.null()),
    resolution: v.union(resolutionValidator, v.null()),
    firedAt: v.number(),
    resolvedAt: v.union(v.number(), v.null()),
  }).index('by_room_match_seq', ['roomId', 'matchNumber', 'seq']),
});
