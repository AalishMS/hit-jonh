import { JONH_TALK, MATERIALS, SCORING, type MaterialProps } from '../config/tuning';
import {
  FIRST_SHOT_LINES, HAT_LINES, HECKLE_AFTER_MISSES, HECKLE_LINES, HIT_STREAK_LINES, MAP_LINES, MISS_STREAK_LINES,
  OBSTACLE_LINES, PORTAL_TRICK_LINES, STRONG_HIT_LINES, TITLE_HIT_LINES, TITLE_LINES, TRICK_HIT_LINES, WINNING_SHOT_LINES,
} from './jonhLines';

export type ReactionCategory = 'hit' | 'hat' | 'overhead' | 'fence' | 'short' | 'over' | 'miss' | 'moved';

export const JONH_REACTIONS: Record<ReactionCategory, readonly string[]> = {
  /** Said when Jonh relocates after being hit. */
  moved: [
    'Right. Somewhere else, then.',
    'Time to find a safer spot.',
    'Let us see you hit me over here.',
    'I shall relocate, thank you.',
    'This chair has been compromised.',
  ],
  hit: [
    'That was my good deckchair.',
    "I hadn't finished that.",
    'Right in the marmalade.',
    "I'm sure that violates local bylaws.",
    'Uncalled for, frankly.',
    "I'll be writing to the council.",
    "That's going to leave a mark on my afternoon.",
  ],
  hat: [
    'Was that meant for me?',
    'My hat!',
    'Mind the haberdashery.',
    'Close, but no tea.',
    "I'll need a new hat. Again.",
  ],
  overhead: [
    'Low-flying iron today.',
    'Going for the neighbours, are we?',
    'Mind the gutters!',
    'I heard that one go over.',
    'Lovely weather for it.',
  ],
  fence: [
    'That was my good fence.',
  ],
  short: [
    'A bit short, was it not?',
    'My daisies would appreciate some space.',
    'Grass needed aerating anyway.',
    'Not even close.',
    'A rather timid effort.',
    'Is that it?',
    'The worms thank you.',
  ],
  over: [
    'Low-flying iron today.',
    'Going for the neighbours, are we?',
    'Mind the gutters!',
    'Flew straight to the next county.',
    "That's the Hendersons' problem now.",
    "Wrong garden, I'm afraid.",
  ],
  miss: [
    'Was that meant for me?',
    'Still here.',
    'Splendid afternoon for amateur artillery.',
    'Close, but no tea.',
  ],
};

/** What Jonh knows about the moment, so his line can fit it. Every field is optional. */
export interface ReactionContext {
  /** Base map id (per-garden flavour lines). */
  mapId?: string;
  /** Shots in a row that did not hit his body, including this one. */
  missStreak?: number;
  /** Body hits in a row, including this one. */
  hitStreak?: number;
  /** This hit came on the first shot of a challenge. */
  firstShot?: boolean;
  strength?: 'weak' | 'strong' | 'trick';
  /** How a trick hit was earned: a bank shot (default) or a portal hoop. */
  trickKind?: 'ricochet' | 'portal';
  /** The hat he is wearing. */
  hatId?: string;
  /** Obstacles the ball touched this shot. */
  obstacles?: ReadonlyArray<{ id: string; material: string }>;
}

/** Lines that must not come back within this many picks (consecutive repeats are never allowed). */
const RECENT_LINES = 8;

function obstacleLines(obstacles: ReadonlyArray<{ id: string; material: string }>): readonly string[] {
  for (const entry of OBSTACLE_LINES) {
    const hit = obstacles.some(o => (entry.match.id !== undefined && o.id.toLowerCase().includes(entry.match.id)) ||
      (entry.match.material !== undefined && o.material === entry.match.material));
    if (hit) return entry.lines;
  }
  return [];
}

/**
 * Manages Jonh's dry dialogue.
 * - Never repeats the same line on consecutive selections, and avoids the last few (SPEC §10.1).
 * - With a context, a fitting line (a miss streak, a third hit, his hat, the garden) is preferred
 *   with the cosmetic odds in `JONH_TALK`; otherwise the plain category pool is used.
 * - Uses a cosmetic random generator, completely decoupled from simulation physics.
 */
export class JonhReactionSelector {
  private lastSelectedLine: string | null = null;
  private readonly recent: string[] = [];

  constructor(private readonly rng: () => number = Math.random) {}

  selectReaction(category: ReactionCategory, context?: ReactionContext): string {
    if (context) {
      for (const { pool, chance } of this.contextPools(category, context)) {
        if (pool.length > 0 && this.rng() < chance) return this.pick(pool);
      }
    }
    const pool = JONH_REACTIONS[category];
    return pool && pool.length > 0 ? this.pick(pool) : '...';
  }

  /** His opening line on a garden. */
  selectArrival(mapId: string, fallback?: string): string {
    const pool = MAP_LINES[mapId]?.arrival ?? [];
    if (pool.length === 0) return fallback ?? this.pick(JONH_REACTIONS.miss);
    return this.pick(pool);
  }

  /** A heckle while the player takes ages to aim; sharper after a few misses. */
  selectHeckle(missStreak = 0): string {
    return this.pick(missStreak >= 2 ? [...HECKLE_AFTER_MISSES, ...HECKLE_LINES] : HECKLE_LINES);
  }

  /** Watching the match-winning shot again. */
  selectWinningShot(): string {
    return this.pick(WINNING_SHOT_LINES);
  }

  /** The title screen: an idle quip, or his line after the demo shot gets him. */
  selectTitle(hit: boolean): string {
    return this.pick(hit ? TITLE_HIT_LINES : TITLE_LINES);
  }

  private contextPools(category: ReactionCategory, c: ReactionContext): Array<{ pool: readonly string[]; chance: number }> {
    const map = c.mapId ? MAP_LINES[c.mapId] : undefined;
    if (category === 'hit') {
      return [
        { pool: c.strength !== 'trick' ? [] : c.trickKind === 'portal' ? PORTAL_TRICK_LINES : TRICK_HIT_LINES, chance: JONH_TALK.trick },
        { pool: c.firstShot ? FIRST_SHOT_LINES : [], chance: JONH_TALK.firstShot },
        { pool: (c.hitStreak ?? 0) >= 3 ? HIT_STREAK_LINES : [], chance: JONH_TALK.hitStreak },
        { pool: c.strength === 'strong' || c.strength === 'trick' ? STRONG_HIT_LINES : [], chance: JONH_TALK.strong },
        { pool: map?.hit ?? [], chance: JONH_TALK.mapLine },
      ];
    }
    if (category === 'hat') return [{ pool: (c.hatId && HAT_LINES[c.hatId]) || [], chance: JONH_TALK.hat }];
    if (category === 'moved') return [];
    return [
      { pool: (c.missStreak ?? 0) >= JONH_TALK.missStreakFrom ? MISS_STREAK_LINES : [], chance: JONH_TALK.missStreak },
      { pool: category === 'overhead' ? [] : obstacleLines(c.obstacles ?? []), chance: JONH_TALK.obstacle },
      { pool: map?.miss ?? [], chance: JONH_TALK.mapLine },
    ];
  }

  private pick(pool: readonly string[]): string {
    const fresh = pool.filter(line => !this.recent.includes(line));
    const notLast = pool.filter(line => line !== this.lastSelectedLine);
    const candidates = fresh.length > 0 ? fresh : notLast.length > 0 ? notLast : pool;
    const index = Math.floor(this.rng() * candidates.length);
    const selected = candidates[Math.min(index, candidates.length - 1)] ?? candidates[0]!;
    this.lastSelectedLine = selected;
    this.recent.push(selected);
    if (this.recent.length > RECENT_LINES) this.recent.shift();
    return selected;
  }

  getLastReaction(): string | null {
    return this.lastSelectedLine;
  }

  reset(): void {
    this.lastSelectedLine = null;
    this.recent.length = 0;
  }
}

export interface ShotOutcomeExtra {
  classifiedOutcome?: 'ricochet_body' | 'body' | 'hat_only' | 'miss';
  /** How a trick (`ricochet_body`) was earned; a bank shot when omitted. */
  trick?: 'ricochet' | 'portal' | null;
  passedOverhead?: boolean;
  obstacleContacts?: ReadonlyArray<{ id: string; ricochet: boolean; material?: string }>;
}

export interface ClassifiedShotFeedback {
  category: ReactionCategory;
  label: string;
  detail: string;
  points: number;
}

/**
 * Classifies a shot outcome for readable player feedback (SPEC §3.1, §10.1, §14).
 * Supports body, ricochet body, hat-only, obstacle/fence contacts, overhead, and short/over misses.
 */
export function classifyShotOutcome(
  isHit: boolean,
  terminalXSim: number,
  jonhMinXSim: number,
  jonhMaxXSim: number,
  extra?: ShotOutcomeExtra,
): ClassifiedShotFeedback {
  if (extra?.classifiedOutcome === 'ricochet_body' && extra.trick === 'portal') {
    return {
      category: 'hit',
      label: 'HOOP HIT',
      detail: 'Jonh was struck after the ball went through a magic hoop!',
      points: SCORING.ricochetBodyPoints,
    };
  }

  if (extra?.classifiedOutcome === 'ricochet_body') {
    return {
      category: 'hit',
      label: 'RICOCHET HIT',
      detail: 'Jonh was struck after a qualifying ricochet!',
      points: SCORING.ricochetBodyPoints,
    };
  }

  if (extra?.classifiedOutcome === 'body' || isHit) {
    return {
      category: 'hit',
      label: 'DIRECT HIT',
      detail: 'Jonh was struck directly!',
      points: SCORING.bodyPoints,
    };
  }

  if (extra?.classifiedOutcome === 'hat_only') {
    return {
      category: 'hat',
      label: 'HAT HIT',
      detail: 'Hat knocked off, but Jonh avoided the body hit.',
      points: SCORING.hatOnlyPoints,
    };
  }

  // Landing on a slide surface (Frozen Pond's ice) is where the ball is meant to land, not an obstacle hit.
  const struck = (extra?.obstacleContacts ?? []).filter(o =>
    o.material === undefined || (MATERIALS as Record<string, MaterialProps>)[o.material]?.slideFrictionMs2 === undefined);
  if (struck.length > 0) {
    const isFence = struck.some((o) =>
      o.id.toLowerCase().includes('fence'),
    );
    if (isFence) {
      return {
        category: 'fence',
        label: 'FENCE HIT',
        detail: 'Hit the fence before reaching Jonh.',
        points: SCORING.missPoints,
      };
    }
    return {
      category: 'miss',
      label: 'OBSTACLE HIT',
      detail: 'Struck an obstacle before reaching Jonh.',
      points: SCORING.missPoints,
    };
  }

  if (extra?.passedOverhead) {
    return {
      category: 'overhead',
      label: 'OVERHEAD',
      detail: 'Cannonball sailed cleanly over Jonh.',
      points: SCORING.missPoints,
    };
  }

  if (terminalXSim < jonhMinXSim) {
    return {
      category: 'short',
      label: 'SHORT',
      detail: 'Cannonball fell short before reaching Jonh.',
      points: SCORING.missPoints,
    };
  }

  if (terminalXSim > jonhMaxXSim) {
    return {
      category: 'over',
      label: 'OVER JONH',
      detail: 'Cannonball overshot and flew past Jonh.',
      points: SCORING.missPoints,
    };
  }

  return {
    category: 'miss',
    label: 'MISS',
    detail: 'Cannonball missed Jonh.',
    points: SCORING.missPoints,
  };
}
