// convex/crons.ts
import { cronJobs } from 'convex/server';
import { internal } from './_generated/api';

const crons = cronJobs();
crons.interval('clean up inactive rooms', { hours: 1 }, internal.timers.cleanupRooms, {});
crons.interval('clean up old friends-board results and idle boards', { hours: 6 }, internal.boards.cleanupBoards, {});
export default crons;
