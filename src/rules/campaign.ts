/**
 * The solo campaign: the gardens in a fixed order, each with up to three stars (shots used, SPEC §5)
 * and a separate trick-shot badge (a trick hit — a bank shot or a hoop shot — ever landed there). A garden unlocks when
 * the one before it is cleared. Pure: derived entirely from the saved solo bests, no Phaser.
 *
 * [DECIDED by owner 2026-11-24: a campaign with star ratings and unlockable maps; the unlock rule
 * and order are PROPOSED.] Hot-seat, online and Daily Bonk keep every map available.
 */

/**
 * Campaign order [PROPOSED]: the gentle gardens, then each mechanic introduced on its own (smash
 * through glass, read the wind, bank off rubber, bank off a billboard, a magic hoop, low gravity, a trampoline),
 * the long shot last.
 */
export const CAMPAIGN_ORDER: readonly string[] = ['backyard', 'fence', 'rooftop', 'greenhouse', 'washday', 'rubber', 'bankshot', 'magic', 'stroll', 'moon', 'trampoline', 'valley', 'skatepark'];

/** What the campaign needs from a saved solo best (storage `LevelScore`). */
export interface MapRecord {
  bestShots: number | null;
  hasStyle: boolean;
}

export interface CampaignEntry {
  mapId: string;
  /** 0-based position in the campaign. */
  index: number;
  stars: number;
  /** A ricochet (trick) body hit has been landed on this garden. */
  trick: boolean;
  cleared: boolean;
  unlocked: boolean;
  /** For a locked garden: the garden to clear first. */
  lockedBy: string | null;
}

export interface CampaignTotals {
  stars: number;
  maxStars: number;
  tricks: number;
  cleared: number;
  count: number;
}

/** The authored order first, then any other map in its MAPS order (new maps join at the end). */
export function campaignOrder(mapIds: readonly string[]): string[] {
  const known = new Set(mapIds);
  const ordered = CAMPAIGN_ORDER.filter(id => known.has(id));
  return [...ordered, ...mapIds.filter(id => !ordered.includes(id))];
}

/** Stars for a saved best: three for one shot, two for two, one for three, none if never hit. */
export function starsFor(record: MapRecord | undefined): number {
  const shots = record?.bestShots;
  if (shots === null || shots === undefined || !Number.isFinite(shots)) return 0;
  return Math.max(0, Math.min(3, 4 - Math.round(shots)));
}

/**
 * Every garden's campaign status. A garden is unlocked when it is first, when the previous one is
 * cleared, or when it already has a saved record (nothing a player could open before is taken away).
 */
export function campaignStatus(mapIds: readonly string[], solo: Readonly<Record<string, MapRecord | undefined>>): CampaignEntry[] {
  const order = campaignOrder(mapIds);
  return order.map((mapId, index) => {
    const record = solo[mapId];
    const stars = starsFor(record);
    const previous = index > 0 ? order[index - 1]! : null;
    const previousCleared = previous === null || starsFor(solo[previous]) > 0;
    const unlocked = previousCleared || record !== undefined;
    return { mapId, index, stars, trick: Boolean(record?.hasStyle), cleared: stars > 0, unlocked, lockedBy: unlocked ? null : previous };
  });
}

export function campaignTotals(entries: readonly CampaignEntry[]): CampaignTotals {
  return {
    stars: entries.reduce((sum, e) => sum + e.stars, 0),
    maxStars: entries.length * 3,
    tricks: entries.filter(e => e.trick).length,
    cleared: entries.filter(e => e.cleared).length,
    count: entries.length,
  };
}

/** The garden after `mapId` in campaign order, locked or not (to prepare its art early); null after the last. */
export function campaignSuccessor(mapIds: readonly string[], mapId: string): string | null {
  const order = campaignOrder(mapIds);
  const at = order.indexOf(mapId);
  return at >= 0 ? order[at + 1] ?? null : null;
}

/** The garden after `mapId` in campaign order, if it is unlocked (e.g. just cleared `mapId`). */
export function nextCampaignMap(entries: readonly CampaignEntry[], mapId: string): string | null {
  const at = entries.findIndex(e => e.mapId === mapId);
  const next = at >= 0 ? entries[at + 1] : undefined;
  return next && next.unlocked ? next.mapId : null;
}

/**
 * Where "Continue" goes: the first unlocked garden not yet cleared; once everything is cleared,
 * the first garden short of three stars; null when every garden has three stars.
 */
export function continueTarget(entries: readonly CampaignEntry[]): string | null {
  const uncleared = entries.find(e => e.unlocked && !e.cleared);
  if (uncleared) return uncleared.mapId;
  return entries.find(e => e.stars < 3)?.mapId ?? null;
}
