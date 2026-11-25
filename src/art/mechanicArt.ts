import type { Box2D, LevelData, ObstacleData } from '../levels/types';
import { PAL } from './palette';
import { hutBackdrop } from './pondArt';
import { INK, ink, starPath, svgDoc, type ArtDef } from './svgKit';

/**
 * Art for the mechanic maps (docs/art-direction.md): glass panes that can be smashed, the white
 * greenhouse frame and brick, the magician's velvet tent and stage, and the magic hoops (portals).
 * Every collider is drawn exactly on its box; backdrops are flat background with no ink.
 */

/* ---------- Obstacles (sized to their collider box, like sceneryArt's obstacleArt) ---------- */

/** Translucent glass with diagonal shine streaks: reads as "fragile, see-through". */
function glassPane(w: number, h: number): string {
  const tall = h > w;
  const n = Math.max(1, Math.floor((tall ? h : w) / 30));
  const streaks = Array.from({ length: n }, (_, i) => {
    if (tall) {
      const y = 4 + ((i + 0.5) * (h - 8)) / n;
      return `<path d="M0 ${y + w} L${w} ${y}"/>`;
    }
    const x = 6 + ((i + 0.3) * (w - 12)) / n;
    return `<path d="M${x} ${h} L${x + h} 0"/>`;
  }).join('');
  // One flat cel shadow on the lower right (the sun is upper left), no gradients.
  const shadow = tall
    ? `<rect x="${w * 0.62}" y="0" width="${w}" height="${h}" fill="${PAL.glassDark}" opacity="0.55"/>`
    : `<rect x="0" y="${h * 0.58}" width="${w}" height="${h}" fill="${PAL.glassDark}" opacity="0.55"/>`;
  return `<defs><clipPath id="g"><rect x="1.5" y="1.5" width="${w - 3}" height="${h - 3}" rx="2"/></clipPath></defs>
    <rect x="1.5" y="1.5" width="${w - 3}" height="${h - 3}" rx="2" fill="${PAL.glass}" fill-opacity="0.88"/>
    <g clip-path="url(#g)">${shadow}<g stroke="${PAL.paper}" stroke-width="3" stroke-linecap="round">${streaks}</g></g>
    <rect x="1.5" y="1.5" width="${w - 3}" height="${h - 3}" rx="2" fill="none" ${ink(2.6)}/>`;
}

/** What is left of a smashed pane: jagged teeth where it met its frame, nothing in the middle. */
function brokenPane(w: number, h: number): string {
  const tall = h > w;
  const depth = (i: number) => [6, 11, 4, 9, 5, 12, 7][i % 7]!;
  const along = tall ? w : h;
  const teeth = (edge: 'a' | 'b') => {
    const pts: string[] = [];
    const steps = Math.max(2, Math.round(along / 5));
    for (let i = 0; i <= steps; i++) {
      const s = 1.5 + ((along - 3) * i) / steps;
      const d = i === 0 || i === steps ? 2 : depth(i + (edge === 'a' ? 0 : 3)) * (tall ? 0.9 : 0.8);
      if (tall) pts.push(edge === 'a' ? `${s} ${1.5 + d}` : `${s} ${h - 1.5 - d}`);
      else pts.push(edge === 'a' ? `${1.5 + d} ${s}` : `${w - 1.5 - d} ${s}`);
    }
    const base = tall
      ? (edge === 'a' ? `M${w - 1.5} 1.5 L1.5 1.5` : `M${w - 1.5} ${h - 1.5} L1.5 ${h - 1.5}`)
      : (edge === 'a' ? `M1.5 ${h - 1.5} L1.5 1.5` : `M${w - 1.5} ${h - 1.5} L${w - 1.5} 1.5`);
    return `<path d="${base} L${pts.join(' L')} Z" fill="${PAL.glass}" fill-opacity="0.8" ${ink(1.4)}/>`;
  };
  return teeth('a') + teeth('b');
}

/** White-painted greenhouse timber (glazing bars and corner posts). */
function paintedTimber(w: number, h: number): string {
  const shade = h > w
    ? `<path d="M${w * 0.68} 2 V${h - 2}" stroke="${PAL.stoneDark}" stroke-width="${Math.max(2, w * 0.3)}" opacity="0.35"/>`
    : `<path d="M2 ${h * 0.7} H${w - 2}" stroke="${PAL.stoneDark}" stroke-width="${Math.max(2, h * 0.3)}" opacity="0.35"/>`;
  return `<rect x="1.5" y="1.5" width="${w - 3}" height="${h - 3}" rx="2" fill="${PAL.paper}"/>${shade}
    <rect x="1.5" y="1.5" width="${w - 3}" height="${h - 3}" rx="2" fill="none" ${INK}/>`;
}

/** A brick dwarf wall with a stone coping. */
function brickWall(w: number, h: number): string {
  const mortar = Array.from({ length: Math.floor((h - 10) / 10) }, (_, r) =>
    `<path d="M2 ${14 + r * 10} H${w - 2}" stroke="${PAL.brickDark}" stroke-width="1.6" opacity="0.6"/>` +
    `<path d="M${r % 2 ? w * 0.35 : w * 0.7} ${14 + r * 10} V${24 + r * 10}" stroke="${PAL.brickDark}" stroke-width="1.4" opacity="0.5"/>`).join('');
  return `<rect x="1.5" y="1.5" width="${w - 3}" height="${h - 3}" rx="2" fill="${PAL.brick}"/>${mortar}
    <path d="M${w * 0.7} 8 V${h - 2}" stroke="${PAL.brickDark}" stroke-width="${Math.max(2, w * 0.25)}" opacity="0.3"/>
    <rect x="1.5" y="1.5" width="${w - 3}" height="7" rx="2" fill="${PAL.stone}"/>
    <path d="M1.5 8.5 H${w - 1.5}" ${ink(2)}/>
    <rect x="1.5" y="1.5" width="${w - 3}" height="${h - 3}" rx="2" fill="none" ${INK}/>`;
}

/** The tent's side walls: heavy velvet drapes with a brass curtain rail. */
function velvetWall(w: number, h: number): string {
  const folds = [0.3, 0.65].map(f => `<path d="M${w * f} 8 Q${w * f + 2} ${h / 2} ${w * f} ${h - 2}" stroke="${PAL.velvetDark}" stroke-width="2.4" fill="none"/>`).join('');
  return `<rect x="1.5" y="1.5" width="${w - 3}" height="${h - 3}" rx="3" fill="${PAL.velvet}"/>${folds}
    <path d="M${w * 0.78} 8 V${h - 2}" stroke="${PAL.velvetDark}" stroke-width="${Math.max(2, w * 0.2)}" opacity="0.45"/>
    <rect x="1.5" y="1.5" width="${w - 3}" height="6" fill="${PAL.brass}"/>
    <path d="M1.5 7.5 H${w - 1.5}" ${ink(1.8)}/>
    <rect x="1.5" y="1.5" width="${w - 3}" height="${h - 3}" rx="3" fill="none" ${INK}/>`;
}

/** The striped tent roof with a scalloped valance drawn inside its box. */
function tentRoof(w: number, h: number): string {
  const stripes = Array.from({ length: Math.ceil(w / 22) }, (_, i) => i % 2 === 0
    ? `<rect x="${i * 22}" y="1.5" width="22" height="${h - 3}" fill="${PAL.velvet}"/>` : '').join('');
  const r = Math.max(2, (h - 3) / 3);
  const scallops = Array.from({ length: Math.floor(w / (2 * r + 2)) }, (_, i) =>
    `<circle cx="${4 + r + i * (2 * r + 2)}" cy="${h - 1.5 - r}" r="${r}" fill="${PAL.brass}" ${ink(1.2)}/>`).join('');
  return `<defs><clipPath id="t"><rect x="1.5" y="1.5" width="${w - 3}" height="${h - 3}" rx="3"/></clipPath></defs>
    <rect x="1.5" y="1.5" width="${w - 3}" height="${h - 3}" rx="3" fill="${PAL.paper}"/>
    <g clip-path="url(#t)">${stripes}${scallops}</g>
    <rect x="1.5" y="1.5" width="${w - 3}" height="${h - 3}" rx="3" fill="none" ${INK}/>`;
}

/** The magician's stage: wooden boards under a red carpet. */
function stage(w: number, h: number): string {
  const planks = Array.from({ length: Math.floor(w / 26) }, (_, i) => `<path d="M${14 + i * 26} ${h * 0.4} V${h - 2}" stroke="${PAL.woodDark}" stroke-width="2" opacity="0.55"/>`).join('');
  return `<rect x="1.5" y="1.5" width="${w - 3}" height="${h - 3}" rx="2" fill="${PAL.wood}"/>${planks}
    <rect x="1.5" y="1.5" width="${w - 3}" height="${h * 0.38}" rx="2" fill="${PAL.velvet}"/>
    <path d="M1.5 ${1.5 + h * 0.38} H${w - 1.5}" stroke="${PAL.brass}" stroke-width="2"/>
    <rect x="1.5" y="1.5" width="${w - 3}" height="${h - 3}" rx="2" fill="none" ${INK}/>`;
}

/** Bodies for the mechanic maps' obstacles; null for anything sceneryArt already draws. */
export function mechanicObstacleBody(obs: ObstacleData, w: number, h: number): string | null {
  if (obs.material === 'glass') return glassPane(w, h);
  if (obs.id.startsWith('frame-')) return paintedTimber(w, h);
  if (obs.id.startsWith('brick-')) return brickWall(w, h);
  if (obs.id === 'tent-roof') return tentRoof(w, h);
  if (obs.material === 'velvet') return velvetWall(w, h);
  if (obs.id === 'stage') return stage(w, h);
  return null;
}

/* ---------- Backdrops: flat background inside the greenhouse and the tent ---------- */

/** The open space a map's backdrop fills (between its walls, floor and roof), or null. */
export function backdropBox(level: LevelData): Box2D | null {
  const box = (id: string) => level.obstacles.find(o => o.id === id)?.box;
  if (level.id === 'greenhouse') {
    const [l, r, f, c] = [box('brick-front'), box('brick-back'), box('greenhouse-floor'), box('frame-0')];
    return l && r && f && c ? { minX: l.maxX, maxX: r.minX, minY: f.maxY, maxY: c.minY } : null;
  }
  if (level.id === 'magic') {
    const [l, r, f, c] = [box('tent-front'), box('tent-back'), box('stage'), box('tent-roof')];
    return l && r && f && c ? { minX: l.maxX, maxX: r.minX, minY: f.maxY, maxY: c.minY } : null;
  }
  if (level.id === 'pond') {
    const [l, r, f, c] = [box('hut-door'), box('hut-back'), box('pond-ice'), box('hut-roof')];
    return l && r && f && c ? { minX: l.maxX, maxX: r.minX, minY: f.maxY, maxY: c.minY } : null;
  }
  return null;
}

export const backdropKey = (levelId: string) => `backdrop-${levelId}`;

/** Back glazing and a potting shelf, all faint: the inside of a glasshouse. */
function greenhouseBackdrop(w: number, h: number, bars: number[]): string {
  const glazing = bars.map(x => `<rect x="${x - 2}" y="0" width="4" height="${h}" fill="${PAL.paper}" opacity="0.45"/>`).join('');
  const pots = Array.from({ length: Math.floor((w - 20) / 34) }, (_, i) => {
    const x = 18 + i * 34;
    return `<path d="M${x - 7} ${h - 46} L${x + 7} ${h - 46} L${x + 5} ${h - 34} L${x - 5} ${h - 34} Z" fill="${PAL.earth}" opacity="0.55"/>` +
      `<path d="M${x} ${h - 46} Q${x - 6} ${h - 56} ${x - 2} ${h - 60} M${x} ${h - 46} Q${x + 6} ${h - 54} ${x + 3} ${h - 58}" stroke="${PAL.grassDark}" stroke-width="2.2" fill="none" opacity="0.55"/>`;
  }).join('');
  return `<rect width="${w}" height="${h}" fill="${PAL.glass}" opacity="0.32"/>${glazing}
    <rect x="0" y="${h - 34}" width="${w}" height="5" fill="${PAL.woodDark}" opacity="0.3"/>${pots}`;
}

/** The tent's back curtain: dark velvet folds and a scatter of brass stars. */
function tentBackdrop(w: number, h: number): string {
  const folds = Array.from({ length: Math.ceil(w / 36) }, (_, i) => `<rect x="${i * 36 + 12}" y="0" width="12" height="${h}" fill="${PAL.velvet}" opacity="0.28"/>`).join('');
  const stars = Array.from({ length: Math.floor(w / 60) }, (_, i) => {
    const x = 30 + i * 60 + (i % 2) * 18;
    const y = 30 + ((i * 47) % Math.max(40, h - 120));
    return `<path d="${starPath(x, y, 5, 6, 2.6)}" fill="${PAL.brass}" opacity="0.55"/>`;
  }).join('');
  return `<rect width="${w}" height="${h}" fill="${PAL.velvetDark}"/>${folds}${stars}
    <ellipse cx="${w * 0.45}" cy="${h - 6}" rx="${w * 0.32}" ry="22" fill="${PAL.zap}" opacity="0.14"/>`;
}

/* ---------- Portals and particles ---------- */

/** Canonical portal swirl radius in art pixels; scaled to each portal's entry radius. */
export const PORTAL_ART_RADIUS = 30;

function swirlArms(c: number, r: number): string {
  return [0, 1, 2].map(k => {
    const a = (k * Math.PI * 2) / 3;
    const p = (ang: number, rad: number) => `${(c + Math.cos(ang) * rad).toFixed(1)} ${(c + Math.sin(ang) * rad).toFixed(1)}`;
    return `<path d="M${p(a, r * 0.15)} Q${p(a + 0.9, r * 0.6)} ${p(a + 1.9, r * 0.95)}" stroke="${PAL.magic}" stroke-width="7" fill="none" stroke-linecap="round"/>` +
      `<path d="M${p(a, r * 0.2)} Q${p(a + 0.9, r * 0.6)} ${p(a + 1.8, r * 0.88)}" stroke="${PAL.magicLight}" stroke-width="2.4" fill="none" stroke-linecap="round" opacity="0.9"/>`;
  }).join('');
}

const fxDef = (key: string, w: number, h: number, body: string, scale = 2): ArtDef =>
  ({ key, w, h, ax: w / 2, ay: h / 2, scale, svg: svgDoc(w, h, body) });

export const MECHANIC_FX_ART: ArtDef[] = [
  fxDef('portal-swirl', 2 * PORTAL_ART_RADIUS + 4, 2 * PORTAL_ART_RADIUS + 4, `
    <circle cx="${PORTAL_ART_RADIUS + 2}" cy="${PORTAL_ART_RADIUS + 2}" r="${PORTAL_ART_RADIUS}" fill="${PAL.magicDark}"/>
    ${swirlArms(PORTAL_ART_RADIUS + 2, PORTAL_ART_RADIUS)}
    <circle cx="${PORTAL_ART_RADIUS + 2}" cy="${PORTAL_ART_RADIUS + 2}" r="${PORTAL_ART_RADIUS * 0.22}" fill="${PAL.magicLight}"/>`),
  fxDef('portal-ring', 2 * PORTAL_ART_RADIUS + 16, 2 * PORTAL_ART_RADIUS + 16, `
    <circle cx="${PORTAL_ART_RADIUS + 8}" cy="${PORTAL_ART_RADIUS + 8}" r="${PORTAL_ART_RADIUS + 3}" fill="none" stroke="${PAL.ink}" stroke-width="10"/>
    <circle cx="${PORTAL_ART_RADIUS + 8}" cy="${PORTAL_ART_RADIUS + 8}" r="${PORTAL_ART_RADIUS + 3}" fill="none" stroke="${PAL.brass}" stroke-width="5.5"/>
    <path d="M${PORTAL_ART_RADIUS * 0.35 + 8} ${PORTAL_ART_RADIUS * 0.62 + 8} A${PORTAL_ART_RADIUS + 3} ${PORTAL_ART_RADIUS + 3} 0 0 1 ${PORTAL_ART_RADIUS * 0.75 + 8} ${PORTAL_ART_RADIUS * 0.12 + 8}" fill="none" stroke="${PAL.paper}" stroke-width="2" stroke-linecap="round"/>`),
  // Points along +x; rotated to the exit heading.
  fxDef('portal-arrow', 26, 26, `<path d="M7 5 L19 13 L7 21" fill="none" stroke="${PAL.ink}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M7 5 L19 13 L7 21" fill="none" stroke="${PAL.brass}" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/>`),
  fxDef('fx-shard', 16, 16, `<path d="M1.5 13.5 L8 1.5 L14.5 10.5 Z" fill="${PAL.glass}" ${ink(1.4)}/><path d="M6 9.5 L8.2 4.6" stroke="${PAL.paper}" stroke-width="1.6" stroke-linecap="round"/>`),
  fxDef('fx-magic', 14, 14, `<path d="${starPath(7, 7, 4, 6.4, 2.2)}" fill="${PAL.magicLight}" ${ink(1.2)}/>`),
];

/** Key of a breakable obstacle's smashed texture (the whole one is sceneryArt's obstacleKey). */
export const brokenKey = (intactKey: string) => `${intactKey}-broken`;

/**
 * Per-level art: smashed versions of every breakable obstacle (sized from level data) and the
 * backdrops of the mechanic maps. `obstacleKey` comes from sceneryArt so the keys always match.
 */
export function mechanicArt(levels: readonly LevelData[], ppm: number, obstacleKey: (levelId: string, obs: ObstacleData) => string): ArtDef[] {
  const defs: ArtDef[] = [...MECHANIC_FX_ART];
  for (const level of levels) {
    for (const obs of level.obstacles) {
      if (!obs.breakable) continue;
      const w = Math.round((obs.box.maxX - obs.box.minX) * ppm);
      const h = Math.round((obs.box.maxY - obs.box.minY) * ppm);
      defs.push({ key: brokenKey(obstacleKey(level.id, obs)), w, h, ax: 0, ay: 0, scale: 2, svg: svgDoc(w, h, brokenPane(w, h)) });
    }
    const box = backdropBox(level);
    if (!box) continue;
    const w = Math.round((box.maxX - box.minX) * ppm);
    const h = Math.round((box.maxY - box.minY) * ppm);
    const bars = level.obstacles.filter(o => o.id.startsWith('frame-') && o.box.minX > box.minX && o.box.maxX < box.maxX)
      .map(o => ((o.box.minX + o.box.maxX) / 2 - box.minX) * ppm);
    const body = level.id === 'greenhouse' ? greenhouseBackdrop(w, h, bars) : level.id === 'pond' ? hutBackdrop(w, h) : tentBackdrop(w, h);
    defs.push({ key: backdropKey(level.id), w, h, ax: 0, ay: 0, scale: 1, svg: svgDoc(w, h, body) });
  }
  return defs;
}
