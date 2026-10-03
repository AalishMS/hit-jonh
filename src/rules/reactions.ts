export type ReactionCategory = 'hit' | 'short' | 'over' | 'miss';

export const JONH_REACTIONS: Record<ReactionCategory, readonly string[]> = {
  hit: [
    'That was my good deckchair.',
    "I hadn't finished that.",
    'Right in the marmalade.',
    "I'm sure that violates local bylaws.",
    'Uncalled for, frankly.',
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

/**
 * Classifies a shot outcome for readable player feedback (SPEC §3.1, §14).
 */
export function classifyShotOutcome(
  isHit: boolean,
  terminalXSim: number,
  jonhMinXSim: number,
  jonhMaxXSim: number,
): { category: ReactionCategory; label: string; detail: string } {
  if (isHit) {
    return {
      category: 'hit',
      label: 'DIRECT HIT',
      detail: 'Jonh was struck directly!',
    };
  }

  if (terminalXSim < jonhMinXSim) {
    return {
      category: 'short',
      label: 'SHORT',
      detail: 'Cannonball fell short before reaching Jonh.',
    };
  }

  if (terminalXSim > jonhMaxXSim) {
    return {
      category: 'over',
      label: 'OVER JONH',
      detail: 'Cannonball overshot and flew past Jonh.',
    };
  }

  return {
    category: 'miss',
    label: 'MISS',
    detail: 'Cannonball missed Jonh.',
  };
}
