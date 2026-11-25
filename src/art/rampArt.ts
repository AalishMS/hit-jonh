import type { LevelData, ObstacleData, RampData } from '../levels/types';
import { arcCorners, arcShape, type ArcShape } from '../sim/arc';
import { PAL } from './palette';
import { INK, ink, svgDoc, type ArtDef } from './svgKit';

/**
 * The skate ramp garden's art (docs/art-direction.md, "Skate ramp"): the half-pipe is drawn from the
 * same arc as its collider (one SVG arc on the riding face), the shelter and the deck to their boxes.
 * Pure strings: no Phaser.
 */

export const rampKey = (levelId: string, rampId: string) => `ramp-${levelId}-${rampId}`;

/** World-metre box the ramp's art covers: the arc and the solid side panel under it, down to the lawn. */
export interface RampDrawBox { minX: number; maxX: number; minY: number; maxY: number }

/**
 * The ramp's outline in metres: the lawn under one end, up that end face, along the riding face (the
 * arc), down the other end face and back to the lawn. Everything under the arc is drawn solid; the
 * ball can never reach the space between the arc's back and the lawn (it is closed off by the arc,
 * its deck and the lawn), so nothing drawn is without a collider.
 */
export function rampOutline(shape: ArcShape, groundY: number): { box: RampDrawBox; corners: ReturnType<typeof arcCorners> } {
  const corners = arcCorners(shape);
  const xs = corners.map(c => c.x);
  const ys = corners.map(c => c.y);
  // The arc's own extremes (a bowl's lowest point, a quarter-pipe's far side) as well as its corners.
  for (const a of [-Math.PI, -Math.PI / 2, 0, Math.PI / 2]) {
    for (const k of [-1, 0, 1]) {
      const angle = a + k * 2 * Math.PI;
      if (angle >= shape.start && angle <= shape.end) {
        for (const r of [shape.radius, shape.radius + shape.thickness]) {
          xs.push(shape.cx + Math.cos(angle) * r);
          ys.push(shape.cy + Math.sin(angle) * r);
        }
      }
    }
  }
  return {
    box: { minX: Math.min(...xs), maxX: Math.max(...xs), minY: groundY, maxY: Math.max(...ys) },
    corners,
  };
}

/** The ramp body as an SVG in a texture covering `rampOutline(...).box` at `ppm` px per metre. */
function rampBody(shape: ArcShape, groundY: number, ppm: number): { w: number; h: number; body: string } {
  const { box, corners } = rampOutline(shape, groundY);
  const w = Math.ceil((box.maxX - box.minX) * ppm) + 4;
  const h = Math.ceil((box.maxY - box.minY) * ppm) + 4;
  // Texture coordinates (2 px margin for the ink line).
  const tx = (x: number) => (x - box.minX) * ppm + 2;
  const ty = (y: number) => (box.maxY - y) * ppm + 2;
  const pt = (p: { x: number; y: number }) => `${tx(p.x).toFixed(2)} ${ty(p.y).toFixed(2)}`;
  const [startIn, startOut, endIn, endOut] = corners as [typeof corners[0], typeof corners[0], typeof corners[0], typeof corners[0]];
  const r = shape.radius * ppm;
  const ro = (shape.radius + shape.thickness) * ppm;
  const large = shape.end - shape.start > Math.PI ? 1 : 0;
  // Counter-clockwise in metres stays counter-clockwise on screen (the world is drawn upright), and SVG
  // measures angles clockwise (its y points down): sweep flag 0.
  const ridingFace = `M${pt(startIn)} A${r} ${r} 0 ${large} 0 ${pt(endIn)}`;
  const outline = `M${tx(startOut.x).toFixed(2)} ${ty(groundY).toFixed(2)} L${pt(startOut)} L${pt(startIn)} A${r} ${r} 0 ${large} 0 ${pt(endIn)} ` +
    `L${pt(endOut)} L${tx(endOut.x).toFixed(2)} ${ty(groundY).toFixed(2)} Z`;
  // The plywood skin: the collider's own depth, between the riding face and the back of the arc.
  const skin = `M${pt(startIn)} A${r} ${r} 0 ${large} 0 ${pt(endIn)} L${pt(endOut)} A${ro} ${ro} 0 ${large} 1 ${pt(startOut)} Z`;
  // Upright studs in the side panel, every 0.6 m.
  const studs: string[] = [];
  for (let x = Math.ceil(box.minX / 0.6) * 0.6 + 0.3; x < box.maxX - 0.15; x += 0.6) {
    studs.push(`M${tx(x).toFixed(2)} ${ty(groundY).toFixed(2)} V${ty(box.maxY).toFixed(2)}`);
  }
  // A painted band low on the panel and a lightning flash where the panel is tallest (by the high end).
  const band = `<rect x="0" y="${(ty(groundY) - 0.34 * ppm).toFixed(2)}" width="${w}" height="${(0.2 * ppm).toFixed(2)}" fill="${PAL.pow}" opacity="0.85"/>`;
  const high = endOut.y >= startOut.y ? endOut : startOut;
  const flashX = tx(high.x) + (high === endOut ? -0.45 : 0.45) * ppm;
  const flashY = ty(groundY) - 0.78 * ppm;
  const flash = `<path d="M${flashX} ${flashY - 18} L${flashX - 9} ${flashY + 2} L${flashX - 1} ${flashY + 2} L${flashX - 6} ${flashY + 20} L${flashX + 10} ${flashY - 4} L${flashX + 2} ${flashY - 4} L${flashX + 7} ${flashY - 18} Z" fill="${PAL.zap}" ${ink(2)}/>`;
  // Steel coping on each end face, inside the solid (≤ 2 px overhang).
  const coping = (inner: { x: number; y: number }, outer: { x: number; y: number }) =>
    `<path d="M${pt(inner)} L${pt(outer)}" stroke="${PAL.ink}" stroke-width="8" stroke-linecap="round"/>` +
    `<path d="M${pt(inner)} L${pt(outer)}" stroke="${PAL.ironLight}" stroke-width="4.5" stroke-linecap="round"/>`;
  const body = `<defs><clipPath id="panel"><path d="${outline}"/></clipPath></defs>
    <path d="${outline}" fill="${PAL.wood}"/>
    <g clip-path="url(#panel)">
      <path d="${studs.join(' ')}" stroke="${PAL.woodDark}" stroke-width="2.5" opacity="0.45"/>
      ${band}${flash}
      <rect x="${(w * 0.72).toFixed(2)}" y="0" width="${w}" height="${h}" fill="${PAL.woodDark}" opacity="0.22"/>
      <path d="${skin}" fill="${PAL.woodLight}"/>
      <path d="${skin}" fill="none" stroke="${PAL.woodDark}" stroke-width="2"/>
    </g>
    ${coping(startIn, startOut)}${coping(endIn, endOut)}
    <path d="${outline}" fill="none" ${INK}/>
    <path d="${ridingFace}" fill="none" ${ink(3.4)}/>`;
  return { w, h, body };
}

/** One texture per ramp, sized from its arc so the drawing matches the collider. */
export function rampArt(levels: readonly LevelData[], ppm: number): ArtDef[] {
  const defs: ArtDef[] = [];
  for (const level of levels) {
    for (const ramp of level.ramps ?? []) {
      const { w, h, body } = rampBody(arcShape(ramp), level.ground.maxY, ppm);
      defs.push({ key: rampKey(level.id, ramp.id), w, h, ax: 0, ay: 0, scale: 2, svg: svgDoc(w, h, body) });
    }
  }
  return defs;
}

/** Where a ramp's texture goes: its draw box's top-left, in world metres (the art has a 2 px margin). */
export function rampArtOrigin(level: LevelData, ramp: RampData): { x: number; y: number } {
  const { box } = rampOutline(arcShape(ramp), level.ground.maxY);
  return { x: box.minX, y: box.maxY };
}

/* ---------- The shelter and the deck (sized to their collider boxes) ---------- */

/** The shelter's brick side wall, with a stone coping. */
function shelterWall(w: number, h: number): string {
  const courses = Array.from({ length: Math.floor((h - 10) / 10) }, (_, r) =>
    `<path d="M2 ${14 + r * 10} H${w - 2}" stroke="${PAL.brickDark}" stroke-width="1.6" opacity="0.6"/>` +
    `<path d="M${r % 2 ? w * 0.35 : w * 0.7} ${14 + r * 10} V${24 + r * 10}" stroke="${PAL.brickDark}" stroke-width="1.4" opacity="0.5"/>`).join('');
  return `<rect x="1.5" y="1.5" width="${w - 3}" height="${h - 3}" rx="2" fill="${PAL.brick}"/>${courses}
    <path d="M${w * 0.7} 8 V${h - 2}" stroke="${PAL.brickDark}" stroke-width="${Math.max(2, w * 0.25)}" opacity="0.3"/>
    <rect x="1.5" y="1.5" width="${w - 3}" height="${h - 3}" rx="2" fill="none" ${INK}/>`;
}

/** A concrete roof slab with gravel on top and a cream sign board on its face (the words are drawn live). */
function shelterRoof(w: number, h: number): string {
  const gravel = Array.from({ length: Math.floor(w / 7) }, (_, i) =>
    `<circle cx="${4 + i * 7 + (i % 3)}" cy="${3.5 + (i % 2)}" r="${1.2 + (i % 2) * 0.6}" fill="#6F6984"/>`).join('');
  const signW = Math.min(w - 16, 150);
  const signH = Math.max(8, h - 9);
  return `<rect x="1.5" y="1.5" width="${w - 3}" height="${h - 3}" rx="3" fill="${PAL.stone}"/>
    <rect x="1.5" y="1.5" width="${w - 3}" height="5" fill="#A9A3B8"/>${gravel}
    <rect x="1.5" y="${h * 0.62}" width="${w - 3}" height="${h * 0.38 - 1.5}" fill="${PAL.stoneDark}" opacity="0.4"/>
    <rect x="${(w - signW) / 2}" y="${(h - signH) / 2 + 1.5}" width="${signW}" height="${signH}" rx="2" fill="${PAL.paper}" ${ink(2)}/>
    <rect x="1.5" y="1.5" width="${w - 3}" height="${h - 3}" rx="3" fill="none" ${INK}/>`;
}

/** The deck behind the half-pipe's tall wall: a plywood box with cross-bracing and a plank top. */
function rampDeck(w: number, h: number): string {
  return `<rect x="1.5" y="1.5" width="${w - 3}" height="${h - 3}" rx="2" fill="${PAL.wood}"/>
    <path d="M4 10 L${w - 4} ${h - 4} M${w - 4} 10 L4 ${h - 4}" stroke="${PAL.woodDark}" stroke-width="3" opacity="0.5"/>
    <path d="M${w * 0.66} 8 V${h - 2}" stroke="${PAL.woodDark}" stroke-width="${Math.max(2, w * 0.3)}" opacity="0.3"/>
    <rect x="1.5" y="1.5" width="${w - 3}" height="7" fill="${PAL.woodLight}"/>
    <path d="M1.5 8.5 H${w - 1.5}" ${ink(2)}/>
    <rect x="1.5" y="1.5" width="${w - 3}" height="${h - 3}" rx="2" fill="none" ${INK}/>`;
}

/** Bodies for the skate ramp garden's obstacles; null for anything sceneryArt draws itself. */
export function rampObstacleBody(obs: ObstacleData, w: number, h: number): string | null {
  if (obs.id === 'shelter-wall') return shelterWall(w, h);
  if (obs.id === 'shelter-roof') return shelterRoof(w, h);
  if (obs.id === 'ramp-deck') return rampDeck(w, h);
  return null;
}

/** The sign on the shelter roof's face (drawn as live text over the roof's sign board). */
export const SHELTER_SIGN = { obstacleId: 'shelter-roof', text: 'NO BALL GAMES' } as const;
