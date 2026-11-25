/**
 * Cannon skins and Jonh outfits: earned cosmetics, never bought (SPEC §4.2, §10.3). Pure (no Phaser,
 * no DOM). Persisted as ids in `Progress`; the art for each id is registered by `art/cosmeticArt.ts`.
 * Nothing here affects physics, colliders or scoring.
 *
 * Unlock thresholds are [PROPOSED]. Star gates use the campaign star total (3 per garden). Once
 * unlocked, an item stays unlocked (`Progress.earned*`), even when new gardens raise a gate.
 */
import { CAMPAIGN_ORDER, campaignStatus, campaignTotals, type MapRecord } from './campaign';
import type { Progress } from './progression';

export const CANNON_SKIN_ORDER = ['classic', 'admiral', 'garden', 'pirate', 'moonshot', 'golden'] as const;
export type CannonSkinId = typeof CANNON_SKIN_ORDER[number];

export const OUTFIT_ORDER = ['cardigan', 'argyle', 'hawaiian', 'tracksuit', 'pyjamas', 'tuxedo', 'sundayBest'] as const;
export type OutfitId = typeof OUTFIT_ORDER[number];

export const DEFAULT_CANNON_SKIN: CannonSkinId = 'classic';
export const DEFAULT_OUTFIT: OutfitId = 'cardigan';

/** What an unlock rule needs besides `Progress`: the campaign star total and gardens cleared. */
export interface CosmeticContext {
  stars: number;
  cleared: number;
}

export const NO_COSMETIC_CONTEXT: CosmeticContext = { stars: 0, cleared: 0 };

/** Star total and gardens cleared, from the saved solo bests (the same data the campaign screen uses). */
export function cosmeticContext(mapIds: readonly string[], solo: Readonly<Record<string, MapRecord | undefined>>): CosmeticContext {
  const totals = campaignTotals(campaignStatus(mapIds, solo));
  return { stars: totals.stars, cleared: totals.cleared };
}

export interface CosmeticRule {
  name: string;
  hint: string;
  unlocked: (p: Progress, ctx: CosmeticContext) => boolean;
}

/** Star gates [PROPOSED]. `starsAll` is every campaign star (3 per garden: 30 with ten gardens). */
export const COSMETIC_GATES = {
  stars6: 6,
  stars12: 12,
  stars18: 18,
  starsAll: CAMPAIGN_ORDER.length * 3,
  gardensCleared: 4,
  tricks: 3,
  streak: 5,
  totalHits: 50,
  dailyDays: 3,
} as const;

const G = COSMETIC_GATES;

export const CANNON_SKIN_RULES: Record<CannonSkinId, CosmeticRule> = {
  classic: { name: 'Classic iron', hint: 'The family cannon.', unlocked: () => true },
  admiral: { name: 'Admiral', hint: `Earn ${G.stars6} stars in the gardens.`, unlocked: (_p, c) => c.stars >= G.stars6 },
  garden: { name: 'Garden Party', hint: `Clear ${G.gardensCleared} gardens.`, unlocked: (_p, c) => c.cleared >= G.gardensCleared },
  pirate: { name: 'Pirate', hint: `Land ${G.tricks} trick shots (ricochet hits).`, unlocked: p => p.trickHits >= G.tricks },
  moonshot: { name: 'Moonshot', hint: `Earn ${G.stars12} stars in the gardens.`, unlocked: (_p, c) => c.stars >= G.stars12 },
  golden: { name: 'Golden Bonk', hint: `Earn every star in the gardens (${G.starsAll}).`, unlocked: (_p, c) => c.stars >= G.starsAll },
};

export const OUTFIT_RULES: Record<OutfitId, CosmeticRule> = {
  cardigan: { name: 'Cardigan', hint: 'His usual.', unlocked: () => true },
  argyle: { name: 'Argyle jumper', hint: `Hit Jonh ${G.streak} times in a row.`, unlocked: p => p.bestStreak >= G.streak },
  hawaiian: { name: 'Hawaiian shirt', hint: `Earn ${G.stars12} stars in the gardens.`, unlocked: (_p, c) => c.stars >= G.stars12 },
  tracksuit: { name: 'Tracksuit', hint: `${G.totalHits} hits in total.`, unlocked: p => p.totalHits >= G.totalHits },
  pyjamas: { name: 'Stripy pyjamas', hint: 'Three stars in a Daily Bonk.', unlocked: p => Object.values(p.daily).some(stars => stars >= 3) },
  tuxedo: { name: 'Tuxedo', hint: `Earn ${G.stars18} stars in the gardens.`, unlocked: (_p, c) => c.stars >= G.stars18 },
  sundayBest: { name: 'Sunday best', hint: `Play the Daily Bonk on ${G.dailyDays} different days.`, unlocked: p => Object.keys(p.daily).length >= G.dailyDays },
};

export function isCannonSkinId(v: unknown): v is CannonSkinId {
  return typeof v === 'string' && (CANNON_SKIN_ORDER as readonly string[]).includes(v);
}

export function isOutfitId(v: unknown): v is OutfitId {
  return typeof v === 'string' && (OUTFIT_ORDER as readonly string[]).includes(v);
}

/** Unlocked once earned, even if the rule now asks for more (`Progress.earnedCannons`). */
export function cannonSkinUnlocked(p: Progress, id: CannonSkinId, ctx: CosmeticContext): boolean {
  return p.earnedCannons.includes(id) || CANNON_SKIN_RULES[id].unlocked(p, ctx);
}

/** Unlocked once earned, even if the rule now asks for more (`Progress.earnedOutfits`). */
export function outfitUnlocked(p: Progress, id: OutfitId, ctx: CosmeticContext): boolean {
  return p.earnedOutfits.includes(id) || OUTFIT_RULES[id].unlocked(p, ctx);
}

export function unlockedCannonSkins(p: Progress, ctx: CosmeticContext): CannonSkinId[] {
  return CANNON_SKIN_ORDER.filter(id => cannonSkinUnlocked(p, id, ctx));
}

export function unlockedOutfits(p: Progress, ctx: CosmeticContext): OutfitId[] {
  return OUTFIT_ORDER.filter(id => outfitUnlocked(p, id, ctx));
}

/** Skins unlocked by the step from `before` to `after` (a shot, a solo finish or a daily result). */
export function newlyUnlockedCannonSkins(before: Progress, after: Progress, beforeCtx: CosmeticContext, afterCtx: CosmeticContext = beforeCtx): CannonSkinId[] {
  const had = new Set(unlockedCannonSkins(before, beforeCtx));
  return unlockedCannonSkins(after, afterCtx).filter(id => !had.has(id));
}

export function newlyUnlockedOutfits(before: Progress, after: Progress, beforeCtx: CosmeticContext, afterCtx: CosmeticContext = beforeCtx): OutfitId[] {
  const had = new Set(unlockedOutfits(before, beforeCtx));
  return unlockedOutfits(after, afterCtx).filter(id => !had.has(id));
}

/** A saved skin id, falling back to the default when unknown or still locked. */
export function sanitizeCannonSkin(id: unknown, p: Progress, ctx: CosmeticContext): CannonSkinId {
  return isCannonSkinId(id) && cannonSkinUnlocked(p, id, ctx) ? id : DEFAULT_CANNON_SKIN;
}

export function sanitizeOutfit(id: unknown, p: Progress, ctx: CosmeticContext): OutfitId {
  return isOutfitId(id) && outfitUnlocked(p, id, ctx) ? id : DEFAULT_OUTFIT;
}
