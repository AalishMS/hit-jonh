import { MULTIPLAYER, WORLD } from '../config/tuning';
import { MAPS } from '../levels';
import { barrelKey, cannonArt, cannonSkinKeys } from './cannonArt';
import { CANNON_THEMES } from './cannonSkins';
import { outfitArt, outfitKeys } from './outfitArt';
import { FX_ART } from './fxArt';
import { HAT_IDS, JONH_ART } from './jonhArt';
import { MECHANIC_FX_ART, mechanicArt } from './mechanicArt';
import { clouds, obstacleArt, obstacleKey, props, sceneryArt, themeArt, themeFor } from './sceneryArt';
import { WIND_ART } from './windArt';
import type { ArtDef } from './svgKit';
import type { CannonSkinId, OutfitId } from '../rules/cosmetics';
import { OUTFIT_ORDER } from '../rules/cosmetics';

/** Every piece of art, for metadata (sizes, pivots) and tests. Pixels are rasterized lazily, by group. */
export const ALL_ART: readonly ArtDef[] = [...JONH_ART, ...outfitArt(), ...FX_ART, ...cannonArt(), ...sceneryArt(MAPS, WORLD.pixelsPerMetre), ...WIND_ART];

/* ---------- Lazy art groups ----------
 * Rasterizing one SVG costs tens of milliseconds on a phone, and the whole set used to be done at boot
 * (228 images, ~44 MB of GPU texture) although a session shows one map, one hat, one outfit and one cannon
 * at a time. Art is therefore split into groups that are rasterized the first time something needs them. */

export const CORE_GROUP = 'core';
export const SCENERY_COMMON_GROUP = 'scenery-common';
export const hatGroup = (id: string) => `hat:${id}`;
export const outfitGroup = (id: OutfitId) => `outfit:${id}`;
export const cannonSkinGroup = (id: CannonSkinId) => `cannon:${id}`;
export const barrelGroup = (color: number, pattern: string) => `barrel:${color.toString(16)}-${pattern}`;
export const themeGroup = (levelId: string) => `theme:${themeFor(levelId).id}`;
export const levelGroup = (levelId: string) => `level:${levelId}`;

function buildGroups(): Map<string, ArtDef[]> {
  const groups = new Map<string, ArtDef[]>();
  const byKey = new Map(ALL_ART.map(def => [def.key, def]));
  const assigned = new Set<string>();
  const put = (group: string, keys: readonly string[]): void => {
    const defs = groups.get(group) ?? [];
    for (const key of keys) {
      const def = byKey.get(key);
      if (!def) throw new Error(`Art group ${group}: unknown art ${key}`);
      if (assigned.has(key)) throw new Error(`Art ${key} is in two groups`);
      assigned.add(key);
      defs.push(def);
    }
    groups.set(group, defs);
  };

  for (const id of HAT_IDS) put(hatGroup(id), [`hat-${id}`]);
  for (const id of OUTFIT_ORDER) {
    const k = outfitKeys(id);
    put(outfitGroup(id), [k.torso, k.legs, k.armFront, k.armBack]);
  }
  for (const skin of Object.keys(CANNON_THEMES) as CannonSkinId[]) {
    const k = cannonSkinKeys(skin);
    // The classic parts are drawn by every cannon (they are the renderer's initial textures).
    put(skin === 'classic' ? CORE_GROUP : cannonSkinGroup(skin), [k.barrel, k.carriage, k.wheel]);
  }
  for (const color of MULTIPLAYER.colors) {
    for (const pattern of MULTIPLAYER.patterns) put(barrelGroup(color, pattern), [barrelKey(color, pattern)]);
  }
  put(SCENERY_COMMON_GROUP, [...clouds, ...props, ...MECHANIC_FX_ART].map(def => def.key));
  for (const theme of new Set(MAPS.map(level => themeFor(level.id)))) put(`theme:${theme.id}`, themeArt(theme).map(def => def.key));
  for (const level of MAPS) {
    const own = [...obstacleArt([level], WORLD.pixelsPerMetre), ...mechanicArt([level], WORLD.pixelsPerMetre, obstacleKey)]
      .map(def => def.key).filter(key => !assigned.has(key));
    put(levelGroup(level.id), own);
  }
  // Everything left (Jonh's body, faces, chair, effects, ball) is needed by every scene.
  put(CORE_GROUP, ALL_ART.map(def => def.key).filter(key => !assigned.has(key)));
  return groups;
}

export const ART_GROUPS: ReadonlyMap<string, readonly ArtDef[]> = buildGroups();

/** What a garden needs on screen. Theme and level groups are skipped for unknown ids. */
export function levelArtGroups(levelId: string): string[] {
  return [SCENERY_COMMON_GROUP, themeGroup(levelId), levelGroup(levelId)].filter(id => ART_GROUPS.has(id));
}

/** What Jonh and the cannon wear. */
export function cosmeticArtGroups(look: { hat: string; outfit: OutfitId; cannon: CannonSkinId }): string[] {
  return [hatGroup(look.hat), outfitGroup(look.outfit), cannonSkinGroup(look.cannon)].filter(id => ART_GROUPS.has(id));
}

/** The barrels of the players at the table (multiplayer cannons are painted in the player's colour). */
export function playerBarrelGroups(players: ReadonlyArray<{ color: number; pattern: string }>): string[] {
  return players.map(p => barrelGroup(p.color, p.pattern)).filter(id => ART_GROUPS.has(id));
}
