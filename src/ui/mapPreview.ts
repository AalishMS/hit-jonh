import { PAL } from '../art/palette';
import { THEMES } from '../art/sceneryArt';
import { MAPS } from '../levels';
import type { Box2D, LevelData, ObstacleData } from '../levels/types';

const INK = `stroke="${PAL.ink}" stroke-width="3" stroke-linejoin="round"`;
const PREVIEW_W = 300;
const PREVIEW_H = 140;
/** Metres always shown across a preview; wider maps shrink to fit, like the in-game camera. */
const MIN_VIEW_METRES = 25.6;
/** Jonh and the cannon are drawn larger than life so they read at thumbnail size. */
const FIGURE_BOOST = 1.6;

interface Frame { s: number; x: (m: number) => number; y: (m: number) => number }

function frameFor(level: LevelData): Frame {
  const s = PREVIEW_W / Math.max(MIN_VIEW_METRES, level.bounds.maxX);
  return { s, x: m => m * s, y: m => PREVIEW_H - m * s };
}

function obstacleSvg(obs: ObstacleData, f: Frame): string {
  const b = obs.box;
  const x = f.x(b.minX);
  const y = f.y(b.maxY);
  const w = (b.maxX - b.minX) * f.s;
  const h = (b.maxY - b.minY) * f.s;
  const rect = (fill: string, extra = '') => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" ${INK} stroke-width="2"${extra}/>`;
  switch (obs.material) {
    case 'wood':
      return obs.id === 'garden-shed'
        ? `${rect(PAL.wood, ' rx="2"')}<rect x="${x}" y="${y}" width="${w}" height="${Math.min(6, h / 4)}" fill="#5B3A4A"/>`
        : rect(PAL.wood, ' rx="1.5"');
    case 'concrete': return rect(b.maxX - b.minX > 1.6 ? PAL.brick : PAL.stone);
    case 'rubber': return rect(PAL.rubber, ` rx="${Math.min(4, h / 2)}"`);
    case 'trampoline':
      return `<path d="M${x + 2} ${y + h} L${x + 4} ${y} M${x + w - 2} ${y + h} L${x + w - 4} ${y}" stroke="${PAL.iron}" stroke-width="2"/>` +
        `<rect x="${x}" y="${y}" width="${w}" height="${Math.max(2.5, h * 0.45)}" rx="1.5" fill="#3FA7E8" ${INK} stroke-width="2"/>`;
    case 'steel': return rect(PAL.ironLight);
    case 'rock': return rect('#A48B78', ' rx="2"');
    case 'leaves': return rect(PAL.leaf, ` rx="${Math.min(6, h / 2)}"`);
    case 'regolith': return rect('#B9B6C9', ' rx="2"');
    case 'gravel': return rect('#A9A3B8');
    case 'sand': return rect('#F2D59B');
    case 'rug': return rect(PAL.pow);
    default: return rect(PAL.stone);
  }
}

function jonhSvg(body: Box2D, hat: Box2D | undefined, f: Frame): string {
  const heightPx = ((hat?.maxY ?? body.maxY) - body.minY) * f.s;
  const k = Math.max(0.35, (heightPx * FIGURE_BOOST) / 52);
  return `<g transform="translate(${f.x((body.minX + body.maxX) / 2)} ${f.y(body.minY)}) scale(${k})">
      <path d="M-6 0 L-14 -2 M2 -14 Q-10 -12 -12 -2" stroke="${PAL.jonhTrousers}" stroke-width="5" stroke-linecap="round" fill="none"/>
      <path d="M-6 -30 Q-8 -16 -2 -10 Q6 -10 8 -16 Q8 -28 0 -32 Z" fill="${PAL.jonhShirt}" ${INK}/>
      <circle cx="0" cy="-38" r="8" fill="${PAL.skin}" ${INK}/>
      <path d="M-10 -45 H10 M-6 -46 V-52 H6 V-46" fill="${PAL.hat}" stroke="${PAL.ink}" stroke-width="2.4"/>
      <rect x="-12" y="-28" width="14" height="11" fill="${PAL.paper}" stroke="${PAL.ink}" stroke-width="2"/>
    </g>`;
}

function cannonSvg(level: LevelData, f: Frame): string {
  const k = Math.max(0.5, (f.s / (PREVIEW_W / MIN_VIEW_METRES)) * 0.9);
  // Pivot sits 0.6 m above the ground the cannon stands on.
  return `<g transform="translate(${f.x(level.cannonSpawn.x)} ${f.y(level.cannonSpawn.y - 0.6)}) scale(${k})">
      <g transform="translate(4 -2) rotate(-38)"><rect x="-4" y="-6" width="34" height="12" rx="4" fill="${PAL.iron}" ${INK}/><rect x="10" y="-7" width="5" height="14" fill="${PAL.brass}"/></g>
      <circle cx="0" cy="0" r="8" fill="${PAL.woodDark}" ${INK}/>
    </g>`;
}

let previewCount = 0;

/** Small scene illustration in the game's own palette, drawn from the map's level data. */
export function mapPreview(id: string): string {
  const level = MAPS.find(m => m.id === id) ?? MAPS[0]!;
  const t = THEMES[level.id] ?? THEMES.backyard!;
  const f = frameFor(level);
  // Unique per call: several previews (or re-renders of the same one) can be on the page at once.
  const sky = `sky-${level.id}-${++previewCount}`;
  const ground = f.y(level.ground.maxY);
  const dy = ground - 116;
  return `<svg viewBox="0 0 ${PREVIEW_W} ${PREVIEW_H}" aria-hidden="true" class="map-preview">
    <defs><linearGradient id="${sky}" x1="0" y1="0" x2="0" y2="1"><stop offset="0.3" stop-color="${t.skyTop}"/><stop offset="1" stop-color="${t.skyLow}"/></linearGradient></defs>
    <rect width="${PREVIEW_W}" height="${PREVIEW_H}" fill="url(#${sky})"/>
    <circle cx="250" cy="26" r="13" fill="${t.sun}"/>
    <g transform="translate(0 ${dy})">
      <path d="M0 96 Q40 74 80 94 T160 92 T240 90 T300 92 V140 H0 Z" fill="${t.far}"/>
      <path d="M0 104 Q50 88 100 104 T200 102 T300 104 V140 H0 Z" fill="${t.mid}" stroke="${t.midDark}" stroke-width="1.5"/>
    </g>
    <rect x="0" y="${ground}" width="${PREVIEW_W}" height="${PREVIEW_H - ground}" fill="${t.groundEarth ?? PAL.earth}"/>
    <rect x="0" y="${ground}" width="${PREVIEW_W}" height="5" fill="${t.groundTop ?? PAL.grass}"/>
    <path d="M0 ${ground + 0.5} H${PREVIEW_W}" stroke="${PAL.ink}" stroke-width="3"/>
    ${level.obstacles.map(o => obstacleSvg(o, f)).join('')}
    ${cannonSvg(level, f)}
    ${jonhSvg(level.jonhSpawn.bodyBox, level.jonhSpawn.hatBox, f)}
  </svg>`;
}

/** Where a tour slice of `width` preview px starts: Jonh near its right edge, his cover in view. */
function cropX(id: string, width: number): number {
  const level = MAPS.find(m => m.id === id) ?? MAPS[0]!;
  const f = frameFor(level);
  const jonhX = f.x((level.jonhSpawn.bodyBox.minX + level.jonhSpawn.bodyBox.maxX) / 2);
  return Math.max(0, Math.min(PREVIEW_W - width, jonhX - width * 0.7));
}

/** Most slices a tour preview shows before summarising the rest as "+N". */
const TOUR_SLICES = 4;

/** A multi-map set: one slice of each map's preview side by side. */
export function tourPreview(ids: readonly string[]): string {
  const shown = ids.slice(0, TOUR_SLICES);
  const w = PREVIEW_W / Math.max(1, shown.length);
  const slices = shown.map((id, i) => {
    const inner = mapPreview(id).replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
    // Each slice keeps Jonh and his cover.
    return `<svg x="${i * w}" y="0" width="${w}" height="${PREVIEW_H}" viewBox="${cropX(id, w)} 0 ${w} ${PREVIEW_H}">${inner}</svg>`;
  }).join('');
  const seams = shown.slice(1).map((_, i) => `<path d="M${(i + 1) * w} 0 V${PREVIEW_H}" stroke="${PAL.ink}" stroke-width="3"/>`).join('');
  const more = ids.length - shown.length;
  const badge = more > 0
    ? `<g transform="translate(${PREVIEW_W - 44} 8)"><rect width="36" height="22" rx="11" fill="${PAL.zap}" ${INK} stroke-width="2.5"/><text x="18" y="15.5" text-anchor="middle" font-family="sans-serif" font-weight="900" font-size="13" fill="${PAL.ink}">+${more}</text></g>`
    : '';
  return `<svg viewBox="0 0 ${PREVIEW_W} ${PREVIEW_H}" aria-hidden="true" class="map-preview">${slices}${seams}${badge}</svg>`;
}

export const MAP_DESCRIPTIONS: Record<string, string> = {
  backyard: 'Arc over the garden shed. Afternoon peace is overrated.',
  fence: 'Clear the fence. Settle the neighbourhood dispute.',
  rooftop: 'A higher target. A very inconvenient lunch break.',
  rubber: 'A wall in the way and a bouncy ceiling above. Bank it.',
  bankshot: 'Walled in under a carport. Bank it off the billboard behind him.',
  trampoline: 'A hedge, a balcony and a trampoline. Drop it in and let it spring.',
  moon: 'Low gravity. Everything floats. Feather that power.',
  valley: 'He is a dot on a far mesa. Hope you brought the big cannon.',
};

export function mapDescription(id: string): string {
  return MAP_DESCRIPTIONS[id] ?? 'Find a way to Jonh.';
}

/** Difficulty pips for pickers: ●○○ to ●●●. */
export function difficultyPips(level: Pick<LevelData, 'difficulty'>): string {
  return '●'.repeat(level.difficulty) + '○'.repeat(3 - level.difficulty);
}
