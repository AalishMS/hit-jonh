/**
 * Online, every screen should show the same Jonh line for the same moment (a shot, Jonh moving, a new
 * garden, the winning-shot replay). Each client simulates every shot itself, so the context of a line is
 * already identical; only the random draw and the "don't repeat a recent line" memory differed.
 *
 * Here the draw is seeded by the match and the moment, and the memory is rebuilt for every pick from the lines
 * this client picked at earlier shot and "Jonh moved" moments, in moment order. So a pick no other client made
 * cannot skew later lines: a shot fired at the turn deadline and refused by the server is overwritten when that
 * shot number is really played, and arrival lines (a resync re-shows one) are never remembered. What remains
 * [PROPOSED 2026-11-25]: a client that reloads mid-match has no memory of the shots before, so for up to the
 * memory's length its picks can differ where the others avoid a recent line.
 */
import { JonhReactionSelector, type ReactionCategory, type ReactionContext } from './reactions';
import { hashKey, seededRandom } from './seededRandom';
import type { ClassifiedOutcome } from '../sim/classification';
import type { ShotRecord } from './onlineTypes';

/** What the scene asks a line picker for (the offline selector has the same methods). */
export interface LinePicker {
  selectReaction(category: ReactionCategory, context?: ReactionContext): string;
  selectArrival(mapId: string, fallback?: string): string;
  selectWinningShot(): string;
}

/** Lines remembered when avoiding repeats (the selector keeps the same number). */
const MEMORY = 8;
/** Order of moments that share a number: an arrival or Jonh moving comes before that shot, the replay after. */
const KIND_ORDER: Record<string, number> = { arrival: 0, moved: 1, shot: 2, winning: 3 };
/** Moments whose lines are remembered (arrival and replay lines come from their own pools). */
const REMEMBERED = new Set(['shot', 'moved']);

function momentKey(moment: string): number {
  const [kind = '', n = '0'] = moment.split(':');
  return Number(n) * 4 + (KIND_ORDER[kind] ?? 3);
}

export class SharedLines {
  private readonly selector = new JonhReactionSelector();
  private match: string | null = null;
  /** Lines picked at each moment of this match. */
  private readonly picked = new Map<string, string[]>();
  /** The moment of the previous pick and its random generator (several picks at one moment continue it). */
  private current: { moment: string; rng: () => number } | null = null;

  /** The picker for one moment of one online match. */
  at(match: string, moment: string): LinePicker {
    if (match !== this.match) {
      this.match = match;
      this.picked.clear();
      this.current = null;
    }
    if (this.current?.moment !== moment) {
      // Entering a moment (again, after a refused shot) starts it afresh.
      this.picked.set(moment, []);
      this.current = { moment, rng: seededRandom(hashKey(`${match}|${moment}`)) };
    }
    const rng = this.current.rng;
    const pick = (select: (s: JonhReactionSelector) => string): string => {
      this.selector.setMemory(this.memoryFor(moment));
      const line = select(this.selector.useRandom(rng));
      this.picked.get(moment)?.push(line);
      return line;
    };
    return {
      selectReaction: (category, context) => pick(s => s.selectReaction(category, context)),
      selectArrival: (mapId, fallback) => pick(s => s.selectArrival(mapId, fallback)),
      selectWinningShot: () => pick(s => s.selectWinningShot()),
    };
  }

  /** Lines picked at remembered moments before `moment`, then those already picked at it; the latest `MEMORY`. */
  private memoryFor(moment: string): string[] {
    const at = momentKey(moment);
    const earlier = [...this.picked]
      .filter(([m]) => m !== moment && REMEMBERED.has(m.split(':')[0] ?? '') && momentKey(m) < at)
      .sort((a, b) => momentKey(a[0]) - momentKey(b[0]))
      .flatMap(([, lines]) => lines);
    return [...earlier, ...(this.picked.get(moment) ?? [])].slice(-MEMORY);
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
