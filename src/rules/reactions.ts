import { SCORING } from '../config/tuning';

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
  ],
  hat: [
    'Was that meant for me?',
    'My hat!',
    'Mind the haberdashery.',
    'Close, but no tea.',
  ],
  overhead: [
    'Low-flying iron today.',
    'Going for the neighbours, are we?',
    'Take your time. Apparently you need it.',
    'Mind the gutters!',
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
  ],
  over: [
    'Low-flying iron today.',
    'Going for the neighbours, are we?',
    'Take your time. Apparently you need it.',
    'Mind the gutters!',
    'Flew straight to the next county.',
  ],
  miss: [
    'Was that meant for me?',
    'Still here.',
    'Splendid afternoon for amateur artillery.',
    'Close, but no tea.',
  ],
};

/**
 * Manages Jonh's dry dialogue reaction pool.
 * Guaranteed not to repeat the same line on consecutive selections (SPEC §10.1).
 * Uses a cosmetic random generator completely decoupled from simulation physics.
 */
export class JonhReactionSelector {
  private lastSelectedLine: string | null = null;

  constructor(private readonly rng: () => number = Math.random) {}

  selectReaction(category: ReactionCategory): string {
    const pool = JONH_REACTIONS[category];
    if (!pool || pool.length === 0) {
      return '...';
    }

    if (pool.length === 1) {
      const line = pool[0]!;
      this.lastSelectedLine = line;
      return line;
    }

    // Filter out the line used on the immediate previous shot
    const available = pool.filter((line) => line !== this.lastSelectedLine);
    const candidates = available.length > 0 ? available : pool;

    const index = Math.floor(this.rng() * candidates.length);
    const selected = candidates[index] ?? candidates[0]!;
    this.lastSelectedLine = selected;
    return selected;
  }

  getLastReaction(): string | null {
    return this.lastSelectedLine;
  }

  reset(): void {
    this.lastSelectedLine = null;
  }
}

export interface ShotOutcomeExtra {
  classifiedOutcome?: 'ricochet_body' | 'body' | 'hat_only' | 'miss';
  passedOverhead?: boolean;
  obstacleContacts?: ReadonlyArray<{ id: string; ricochet: boolean }>;
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

  if (extra?.obstacleContacts && extra.obstacleContacts.length > 0) {
    const isFence = extra.obstacleContacts.some((o) =>
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
