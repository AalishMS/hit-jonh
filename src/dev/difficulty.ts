import { AIM } from '../config/tuning';
import { levelAtMultiplayerPosition } from '../levels/multiplayerPositions';
import type { LevelData } from '../levels/types';
import { runHeadlessShot } from '../physics/headlessShot';
import type { ClassifiedOutcome } from '../sim/classification';

/**
 * Difficulty as a number: fire an angle × power grid through the real physics and measure how much
 * of it scores a body hit. Small fractions are hard maps; `widestRun` checks a human can still find
 * the window with 1°/1% controls.
 */
export interface SolutionMap {
  angleStep: number;
  powerStep: number;
  total: number;
  hits: number;
  hitFraction: number;
  /** Body hits that bounced off a ricochet surface first. */
  ricochetHits: number;
  /** Longest run of adjacent grid hits along either axis. */
  widestRun: number;
  /** Every hit as `angle/power`, for picking reference solutions. */
  hitAims: Array<{ angle: number; power: number; outcome: ClassifiedOutcome }>;
  angles: number[];
  powers: number[];
  /** grid[angleIndex][powerIndex]: body hit. */
  grid: boolean[][];
}

const isHit = (o: ClassifiedOutcome) => o === 'body' || o === 'ricochet_body';

export function solutionMap(level: LevelData, angleStep: number, powerStep: number): SolutionMap {
  const angles: number[] = [];
  for (let a = AIM.minAngleDeg; a <= AIM.maxAngleDeg; a += angleStep) angles.push(a);
  const powers: number[] = [];
  for (let p = 0; p <= 100; p += powerStep) powers.push(p);
  const grid: boolean[][] = [];
  const hitAims: SolutionMap['hitAims'] = [];
  let ricochetHits = 0;
  for (const angle of angles) {
    const row: boolean[] = [];
    for (const power of powers) {
      const { outcome } = runHeadlessShot(level, angle, power);
      const hit = isHit(outcome);
      row.push(hit);
      if (hit) {
        hitAims.push({ angle, power, outcome });
        if (outcome === 'ricochet_body') ricochetHits++;
      }
    }
    grid.push(row);
  }
  let widestRun = 0;
  for (let i = 0; i < angles.length; i++) {
    let run = 0;
    for (let j = 0; j < powers.length; j++) { run = grid[i]![j] ? run + 1 : 0; widestRun = Math.max(widestRun, run); }
  }
  for (let j = 0; j < powers.length; j++) {
    let run = 0;
    for (let i = 0; i < angles.length; i++) { run = grid[i]![j] ? run + 1 : 0; widestRun = Math.max(widestRun, run); }
  }
  const total = angles.length * powers.length;
  return { angleStep, powerStep, total, hits: hitAims.length, hitFraction: hitAims.length / total, ricochetHits, widestRun, hitAims, angles, powers, grid };
}

/**
 * Hits whose grid neighbours mostly hit too (a forgiving aim), most-surrounded first: good
 * reference solutions, since they survive small physics changes.
 */
export function robustHits(map: SolutionMap): Array<{ angle: number; power: number; neighbours: number }> {
  const out: Array<{ angle: number; power: number; neighbours: number }> = [];
  map.grid.forEach((row, i) => row.forEach((hit, j) => {
    if (!hit) return;
    let n = 0;
    for (const [di, dj] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, 1], [-1, 1], [1, -1]] as const) {
      if (map.grid[i + di]?.[j + dj]) n++;
    }
    out.push({ angle: map.angles[i]!, power: map.powers[j]!, neighbours: n });
  }));
  return out.sort((a, b) => b.neighbours - a.neighbours);
}

/** One solution map per multiplayer target position of a map. */
export function mapDifficulty(base: LevelData, angleStep: number, powerStep: number): Array<{ positionId: string; map: SolutionMap }> {
  return base.multiplayerPositions.map(p => ({
    positionId: p.id,
    map: solutionMap(levelAtMultiplayerPosition(base, p.id), angleStep, powerStep),
  }));
}
