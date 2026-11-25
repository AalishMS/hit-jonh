/**
 * The first-garden coach [PROPOSED 2026-11-25]: help for the first two minutes. Until a player has
 * hit Jonh for the first time, a ghost hand shows the drag on the first campaign garden, and every
 * solo miss names one fix ("Short. Add power."). Pure: no Phaser, no DOM.
 */
import { COACH } from '../config/tuning';
import type { ReactionCategory } from './reactions';

/** Coaching lasts until the player's first body hit ever (saved `progress.totalHits`). */
export function coachActive(totalHits: number): boolean {
  return totalHits <= 0;
}

export interface GhostHandContext {
  mode: 'solo' | 'multi' | 'none';
  daily: boolean;
  mapId: string;
  /** The first garden of the campaign. */
  firstMapId: string;
  totalHits: number;
  /** Shots fired on this garden in this visit. */
  shotsFired: number;
  /** The player has already moved the aim. */
  aimTouched: boolean;
}

/** The ghost hand plays on the first garden before a new player's first shot, until they touch the aim. */
export function showGhostHand(c: GhostHandContext): boolean {
  return c.mode === 'solo' && !c.daily && c.mapId === c.firstMapId && coachActive(c.totalHits) && c.shotsFired === 0 && !c.aimTouched;
}

export interface MissForCoach {
  /** The miss's feedback category (rules/reactions.ts classifyShotOutcome). */
  category: ReactionCategory;
  angleDeg: number;
  powerPercent: number;
  /** The ball struck an obstacle (feedback "OBSTACLE HIT" comes as category 'miss'). */
  blocked?: boolean;
  /** It landed before the obstacle it touched: a short shot that rolled into it, not a blocked one. */
  landedBeforeObstacle?: boolean;
}

/** One fix for a missed shot, or null for a hit. */
export function missHint(m: MissForCoach): string | null {
  const short = () => (m.powerPercent >= COACH.nearFullPowerPercent ? 'Short. Aim nearer 45°.' : 'Short. Add power.');
  if (m.landedBeforeObstacle && (m.category === 'fence' || m.category === 'miss')) return short();
  switch (m.category) {
    case 'hit':
    case 'moved':
      return null;
    case 'short':
      return short();
    case 'over':
      return m.powerPercent <= COACH.nearNoPowerPercent ? 'Too far. Change the angle.' : 'Too far. Take off some power.';
    case 'overhead':
      return 'Over his head. Less power.';
    case 'fence':
      return 'Blocked by the fence. Aim higher.';
    case 'hat':
      return 'Just the hat! Nudge it a touch lower.';
    case 'miss':
      return m.blocked ? 'Blocked. Aim higher to clear it.' : 'Missed. Nudge the angle or power.';
  }
}
