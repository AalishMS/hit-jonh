import { WORLD } from '../config/tuning';
import { MAP_IDS, MAPS } from '../levels';
import type { LevelData } from '../levels/types';
import { campaignStatus } from '../rules/campaign';
import { loadSaveData } from '../storage/storage';

/**
 * A garden for the title screen's live backdrop: one the player has unlocked, of ordinary width so the
 * title framing fits. `isLoaded` narrows the pick to gardens whose art is already on the GPU, so the title
 * never waits for art (the boot loads one pick; every garden played since joins the rotation).
 */
export function pickAttractLevel(isLoaded: (levelId: string) => boolean = () => true): LevelData {
  const fits = (m: LevelData) => m.bounds.maxX * WORLD.pixelsPerMetre <= WORLD.designWidthPx;
  const open = campaignStatus(MAP_IDS, loadSaveData().solo).filter(e => e.unlocked).map(e => MAPS.find(m => m.id === e.mapId)!)
    .filter(m => m && fits(m) && m.referenceSolutions.length > 0);
  const ready = open.filter(m => isLoaded(m.id));
  const pool = ready.length > 0 ? ready : open;
  return pool.length > 0 ? pool[Math.floor(Math.random() * pool.length)]! : MAPS[0]!;
}
