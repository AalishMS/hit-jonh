import { MAPS } from '../levels';
import { levelAtMultiplayerPosition } from '../levels/multiplayerPositions';
import type { LevelData } from '../levels/types';
import { runHeadlessShot } from '../physics/headlessShot';
import type { ClassifiedOutcome } from '../sim/classification';

export interface CrossCheckShot { id: string; level: LevelData; angle: number; power: number }

export interface CrossCheckReport {
  count: number;
  /** Same value in two browsers ⇒ every shot scored the same. */
  outcomeDigest: string;
  /** Same value ⇒ even the end positions are bit-identical. */
  exactDigest: string;
  counts: Record<ClassifiedOutcome, number>;
  lines: string[];
}

/** Reference shots plus an angle/power grid on every multiplayer target position. */
export function buildCrossCheckShots(): CrossCheckShot[] {
  const shots: CrossCheckShot[] = [];
  for (const base of MAPS) {
    const mapId = base.id;
    for (const position of base.multiplayerPositions) {
      const level = levelAtMultiplayerPosition(base, position.id);
      const add = (angle: number, power: number) => shots.push({ id: `${mapId}/${position.id} ${angle}/${power}`, level, angle, power });
      for (const ref of position.referenceSolutions) add(ref.angleDeg, ref.powerPercent);
      for (let angle = 20; angle <= 83; angle += 7) {
        for (let power = 40; power <= 100; power += 10) add(angle, power);
      }
    }
  }
  return shots;
}

export function fnv1a(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

export function runCrossCheck(shots: readonly CrossCheckShot[]): CrossCheckReport {
  const counts: Record<ClassifiedOutcome, number> = { ricochet_body: 0, body: 0, hat_only: 0, miss: 0 };
  const outcomeLines: string[] = [];
  const lines: string[] = [];
  for (const shot of shots) {
    const r = runHeadlessShot(shot.level, shot.angle, shot.power);
    counts[r.outcome]++;
    outcomeLines.push(`${shot.id}:${r.outcome}`);
    lines.push(`${shot.id} → ${r.outcome} @ ${String(r.endXSim)}, ${String(r.endYSim)} (${r.steps} steps)`);
  }
  return {
    count: shots.length,
    outcomeDigest: fnv1a(outcomeLines.join('\n')),
    exactDigest: fnv1a(lines.join('\n')),
    counts,
    lines,
  };
}
