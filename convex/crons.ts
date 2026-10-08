// convex/crons.ts
import { cronJobs } from 'convex/server';
import { internal } from './_generated/api';

const crons = cronJobs();
crons.interval('clean up inactive rooms', { hours: 1 }, internal.timers.cleanupRooms, {});
export default crons;
