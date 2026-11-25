/**
 * Online, every screen should show the same Jonh line for the same moment (a shot, Jonh moving, a new
 * garden, the winning-shot replay). Each client simulates every shot itself, so the context of a line is
 * already identical; only the random draw differed. Here the draw is seeded by the match and the moment,
 * and the recent-lines memory holds only this match's online lines, which every client picks in the same
 * order. A client that reloads mid-match starts with an empty memory, so for up to the selector's memory
 * length its picks can differ where the others avoid a recent line. [PROPOSED 2026-11-25]
 */
import { JonhReactionSelector } from './reactions';
import { hashKey, seededRandom } from './seededRandom';
import type { ClassifiedOutcome } from '../sim/classification';
import type { ShotRecord } from './onlineTypes';

export class SharedLines {
  private readonly selector = new JonhReactionSelector();
  private match: string | null = null;

  /** The selector for one moment of one online match, its random draws seeded by both. */
  at(match: string, moment: string): JonhReactionSelector {
    if (match !== this.match) {
      this.match = match;
      this.selector.reset();
    }
    return this.selector.useRandom(seededRandom(hashKey(`${match}|${moment}`)));
  }
}

const isBodyHit = (outcome: ClassifiedOutcome): boolean => outcome === 'body' || outcome === 'ricochet_body';

/**
 * Misses in a row (a hat-only hit counts, a skipped turn doesn't) just before shot `seq`, from the shared shot
 * list: the same on every client, even one that reloaded mid-match.
 */
export function missStreakBefore(shots: readonly ShotRecord[], seq: number): number {
  const earlier = shots.filter(s => s.seq < seq).sort((a, b) => b.seq - a.seq);
  let streak = 0;
  for (const shot of earlier) {
    if (shot.resolution === 'skipped') continue;
    if (shot.outcome === null || isBodyHit(shot.outcome)) break;
    streak++;
  }
  return streak;
}
