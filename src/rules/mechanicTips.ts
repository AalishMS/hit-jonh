/**
 * First-meeting tips [DECIDED request 2026-11-25; wording and rules PROPOSED]: the first time a player
 * meets a garden mechanic (wind, glass, hoops, bounce, low gravity, a walking Jonh...), the aiming
 * caption explains it in one line until they hit him there. Each garden names its mechanic in level
 * data (`LevelData.mechanic`). Pure: no Phaser, no DOM.
 */

import type { MechanicId } from '../levels/types';

export type { MechanicId };

export const MECHANIC_IDS: readonly MechanicId[] = ['glass', 'wind', 'rubber', 'bank', 'portal', 'walking', 'lowGravity', 'trampoline', 'longShot', 'ice'];

export function isMechanicId(v: unknown): v is MechanicId {
  return typeof v === 'string' && (MECHANIC_IDS as readonly string[]).includes(v);
}

/** One line each, in the coach's voice: what the mechanic does and what to do about it. */
export const MECHANIC_TIPS: Record<MechanicId, string> = {
  glass: 'Glass! Soft shots bounce off. Hit it hard to smash through.',
  wind: 'Wind blows the ball back. Watch the windsock and aim long.',
  rubber: 'The rubber ceiling is bouncy. Bounce off it to drop over the wall.',
  bank: "Jonh's walled in. Bank it off the billboard behind him.",
  portal: 'Through the hoop and out the other one. Hoop hits are trick shots!',
  walking: 'Jonh sets off when you fire. Time it to meet him.',
  lowGravity: 'Low gravity: the ball floats. Use far less power.',
  trampoline: 'Drop it on the trampoline and let it spring up to him.',
  longShot: 'A long way off. Every bit of power counts here.',
  ice: 'Ice is slippery. Land it short and let it slide in to Jonh.',
};

export interface TipContext {
  /** The garden's mechanic (`LevelData.mechanic`), if it has one. */
  mechanic: MechanicId | undefined;
  /** Mechanics whose tip the player has already been shown (saved `progress.seenTips`). */
  seen: readonly string[];
  /** Mechanics of every garden the player has already cleared: met before the tips existed. */
  cleared: readonly (MechanicId | undefined)[];
  /** Practice records nothing and is only open on cleared gardens, so it never tips. */
  practice: boolean;
}

/** The tip to show on arriving at a garden, or null. */
export function mechanicTip(c: TipContext): { id: MechanicId; text: string } | null {
  const id = c.mechanic;
  if (!id || c.practice || c.seen.includes(id) || c.cleared.includes(id)) return null;
  return { id, text: MECHANIC_TIPS[id] };
}
