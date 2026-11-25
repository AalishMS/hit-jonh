import type Phaser from 'phaser';
import { PAL, hex } from '../art/palette';
import { routeLegs } from '../levels/jonhRoute';
import type { LevelData } from '../levels/types';
import { metresToPixels, simYToWorldY } from '../sim/units';

/** Footprints are this far apart along a walk (px), alternating left and right foot. */
const FOOTPRINT_SPACING_PX = 22;

/**
 * Jonh's walking route, painted on the garden path so the timing can be learnt (walking-Jonh garden,
 * 2026-11-25): a chalk line over the whole walk, footprints and an arrow for each leg in the
 * direction he walks it, and a ring at every stop (filled where he turns round or ends). Flat marks
 * on the path only, never anything that looks solid. Drawn from level data, so a multiplayer target
 * position (which shifts his spawn) moves the marks with him.
 */
export function drawRoute(scene: Phaser.Scene, level: LevelData, ppm: number, worldHeightPx: number, depth: number): Phaser.GameObjects.GameObject[] {
  const route = level.jonhRoute;
  if (!route || route.waypoints.length < 2) return [];
  const b = level.jonhSpawn.bodyBox;
  const cx = (b.minX + b.maxX) / 2;
  const at = (dx: number, dy: number) => ({ x: metresToPixels(cx + dx, ppm), y: simYToWorldY(b.minY + dy, worldHeightPx, ppm) });
  const g = scene.add.graphics().setDepth(depth);
  const ink = hex(PAL.ink);
  const paper = hex(PAL.paper);

  // Chalk line along everything he walks, just on the path's top face.
  const legs = routeLegs(route).filter(l => l.walking);
  const xs = route.waypoints.map(w => at(w.dx, w.dy ?? 0).x);
  const y0 = at(0, route.waypoints[0]!.dy ?? 0).y + 5;
  for (let x = Math.min(...xs); x < Math.max(...xs); x += 14) {
    g.fillStyle(paper, 0.85).fillRect(x, y0 - 1, 8, 2.5);
  }

  // Footprints and an arrow per leg; later legs sit a little lower so a walk back stays readable.
  legs.forEach((leg, i) => {
    const from = at(leg.from.dx, leg.from.dy);
    const to = at(leg.to.dx, leg.to.dy);
    const dir = Math.sign(to.x - from.x) || 1;
    const length = Math.abs(to.x - from.x);
    const lane = y0 + 6 + i * 7;
    let n = 0;
    for (let d = 14; d < length - 18; d += FOOTPRINT_SPACING_PX, n++) {
      const x = from.x + dir * d;
      g.fillStyle(ink, 0.45).fillEllipse(x, lane + (n % 2 === 0 ? -1.5 : 1.5), 7, 3.5);
    }
    const tip = to.x - dir * 6;
    g.fillStyle(paper, 1).lineStyle(2, ink, 1);
    g.fillTriangle(tip, lane, tip - dir * 10, lane - 5, tip - dir * 10, lane + 5);
    g.strokeTriangle(tip, lane, tip - dir * 10, lane - 5, tip - dir * 10, lane + 5);
  });

  // A ring at every stop: hollow where he only passes, filled where he waits.
  route.waypoints.forEach((w, i) => {
    const p = at(w.dx, w.dy ?? 0);
    const waits = i === route.waypoints.length - 1 || (w.pauseS ?? 0) > 0;
    g.lineStyle(2, ink, 1).fillStyle(waits ? hex(PAL.zap) : paper, 1);
    g.fillCircle(p.x, y0, 5).strokeCircle(p.x, y0, 5);
  });
  return [g];
}
