// convex/timers.ts (stub, replaced in Task 9)
import { v } from 'convex/values';
import { internalMutation } from './_generated/server';

export const checkTurn = internalMutation({
  args: { roomId: v.id('rooms'), matchNumber: v.number(), seq: v.number() },
  handler: async () => {},
});
