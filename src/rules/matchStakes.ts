import { MULTIPLAYER } from '../config/tuning';
import type { ClassifiedOutcome } from '../sim/classification';
import { OUTCOME_POINTS } from './multiplayerMatch';

/**
 * Party callouts for multiplayer: what the next shot means ("Any hit wins it!", "Trailing Bo by 75")
 * and the previous shooter's taunt. Pure presentation logic over the match state; scoring and the
 * winner rule (SPEC §7.1: highest total, then more body hits, else shared) are unchanged.
 */

export interface Standing {
  name: string;
  score: number;
  bodyHits: number;
  /** Shots this player still has in the match (including one about to be taken). */
  shotsLeft: number;
}

export type Verdict = 'win' | 'tie' | 'lose';

const isBody = (o: ClassifiedOutcome) => o === 'body' || o === 'ricochet_body';

/** The match result if player `me` scores `outcome` with their last shot and nobody shoots again. */
export function verdictFor(standings: readonly Standing[], me: number, outcome: ClassifiedOutcome): Verdict {
  const mine = standings[me]!;
  const score = mine.score + OUTCOME_POINTS[outcome];
  const hits = mine.bodyHits + (isBody(outcome) ? 1 : 0);
  let tied = false;
  for (let i = 0; i < standings.length; i++) {
    if (i === me) continue;
    const other = standings[i]!;
    if (other.score > score || (other.score === score && other.bodyHits > hits)) return 'lose';
    if (other.score === score && other.bodyHits === hits) tied = true;
  }
  return tied ? 'tie' : 'win';
}

export interface Stakes {
  /** Banner over the handover ("Final round", "Last shot of the match"), or null. */
  kicker: string | null;
  /** What is at stake for the active player, in a few words. */
  line: string;
  /** This shot can decide the match: worth a drumroll. */
  decisive: boolean;
}

const MAX_SHOT_POINTS = Math.max(...Object.values(OUTCOME_POINTS));

function standingLine(standings: readonly Standing[], me: number): string {
  const mine = standings[me]!;
  let leader: Standing | null = null;
  for (let i = 0; i < standings.length; i++) {
    if (i === me) continue;
    const s = standings[i]!;
    if (!leader || s.score > leader.score) leader = s;
  }
  if (!leader) return '';
  if (mine.score + MAX_SHOT_POINTS * mine.shotsLeft < leader.score) return "Can't catch up. Ruin his afternoon anyway.";
  const diff = mine.score - leader.score;
  if (diff > 0) return `Leading by ${diff}`;
  if (diff < 0) return `Trailing ${leader.name} by ${-diff}`;
  return 'All square';
}

/**
 * Stakes for player `me` before their shot. `finalRound`/`firstShotOfRound` add the final-round
 * banner; the match's very last shot spells out exactly what wins or ties.
 */
export function matchStakes(standings: readonly Standing[], me: number, opts: { finalRound: boolean; firstShotOfRound: boolean }): Stakes {
  const mine = standings[me]!;
  const othersLeft = standings.reduce((sum, s, i) => (i === me ? sum : sum + s.shotsLeft), 0);
  if (mine.shotsLeft === 1 && othersLeft === 0 && standings.length > 1) {
    const kicker = 'Last shot of the match';
    if (verdictFor(standings, me, 'miss') === 'win') return { kicker, line: 'Already won. Go for style.', decisive: false };
    // Cheapest outcome first: hat (20), body (100), trick (125).
    const ladder: ClassifiedOutcome[] = ['hat_only', 'body', 'ricochet_body'];
    const winLine: Record<string, string> = { hat_only: 'Even a hat hit wins it!', body: 'Any hit wins it!', ricochet_body: 'Only a trick shot wins it!' };
    const tieLine: Record<string, string> = { hat_only: 'Knock his hat off to tie!', body: 'A hit ties it!', ricochet_body: 'A trick shot ties it!' };
    const tieSuffix: Record<string, string> = { hat_only: 'A hat hit ties.', body: 'A hit ties.' };
    const winAt = ladder.findIndex(o => verdictFor(standings, me, o) === 'win');
    const tieAt = ladder.findIndex(o => verdictFor(standings, me, o) === 'tie');
    if (winAt >= 0) {
      const line = winLine[ladder[winAt]!]! + (tieAt >= 0 && tieAt < winAt ? ` ${tieSuffix[ladder[tieAt]!]}` : '');
      return { kicker, line, decisive: true };
    }
    if (tieAt >= 0) return { kicker, line: tieLine[ladder[tieAt]!]!, decisive: true };
    return { kicker, line: "Can't catch up. Ruin his afternoon anyway.", decisive: false };
  }
  const kicker = mine.shotsLeft === 1 ? 'Your last shot'
    : opts.finalRound && opts.firstShotOfRound ? 'Final round' : null;
  return { kicker, line: standingLine(standings, me), decisive: false };
}

/** Shots each player has left in the match, from the machine's counters (see MultiplayerMatchMachine). */
export function shotsLeftPerPlayer(players: number, roundIndex: number, roundCount: number, shotIndex: number): number[] {
  const start = roundIndex % players;
  const later = Math.max(0, roundCount - roundIndex - 1) * MULTIPLAYER.shotsPerRound;
  return Array.from({ length: players }, (_, p) => {
    const offset = (p - start + players) % players;
    const taken = shotIndex > offset ? Math.floor((shotIndex - offset - 1) / players) + 1 : 0;
    return Math.max(0, MULTIPLAYER.shotsPerRound - taken) + later;
  });
}

/** What the previous shooter says to the next player on the handover card (hot-seat banter). */
export const TAUNTS: Readonly<Record<'trick' | 'hit' | 'hat', readonly string[]>> = {
  trick: ['Off the wall. Beat that.', 'Geometry, darling.', "Didn't even need to aim."],
  hit: ['Beat that.', 'Your turn to miss.', 'Watch and learn.', 'Easy.', 'Top that, then.'],
  hat: ['Hat counts. Look it up.', 'Nearly. Basically a hit.'],
};

export function tauntFor(outcome: ClassifiedOutcome, rng: () => number = Math.random): string | null {
  const pool = outcome === 'ricochet_body' ? TAUNTS.trick : outcome === 'body' ? TAUNTS.hit : outcome === 'hat_only' ? TAUNTS.hat : null;
  if (!pool) return null;
  return pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))]!;
}
