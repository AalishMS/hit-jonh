import { AIM, PHYSICS, PROJECTILE } from '../config/tuning';
import { powerToLaunchSpeed } from '../sim/units';
import type { LevelData } from './types';

export interface LevelPhysics {
  /** m/s², downward. */
  gravity: number;
  minSpeedMs: number;
  maxSpeedMs: number;
  /** Launch speed (m/s) for a 0–100 power setting on this map. */
  launchSpeed(powerPercent: number): number;
  /** Launch impulse (N·s) for a 0–100 power setting on this map (debug readout). */
  launchImpulse(powerPercent: number): number;
}

/** Gravity and cannon speed range for a map: the global tuning unless the level overrides it. */
export function levelPhysics(level: Pick<LevelData, 'gravityMs2' | 'launchSpeedScale'>): LevelPhysics {
  const scale = level.launchSpeedScale ?? 1;
  const launchSpeed = (powerPercent: number) =>
    powerToLaunchSpeed(powerPercent, AIM.minImpulseNs, AIM.maxImpulseNs, PROJECTILE.massKg) * scale;
  return {
    gravity: level.gravityMs2 ?? PHYSICS.gravity,
    minSpeedMs: launchSpeed(0),
    maxSpeedMs: launchSpeed(100),
    launchSpeed,
    launchImpulse: powerPercent => launchSpeed(powerPercent) * PROJECTILE.massKg,
  };
}
