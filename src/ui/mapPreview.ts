import { PAL } from '../art/palette';
import { THEMES } from '../art/sceneryArt';

const INK = `stroke="${PAL.ink}" stroke-width="3" stroke-linejoin="round"`;

const OBSTACLE: Record<string, string> = {
  backyard: `<rect x="128" y="70" width="44" height="46" rx="3" fill="${PAL.wood}" ${INK}/><rect x="128" y="70" width="44" height="7" fill="#5B3A4A"/><rect x="150" y="88" width="14" height="28" fill="${PAL.woodDark}" stroke="${PAL.ink}" stroke-width="2"/><rect x="133" y="84" width="12" height="10" fill="${PAL.glass}" stroke="${PAL.ink}" stroke-width="2"/>`,
  fence: `<path d="M144 116 V78 L149 72 L154 78 V116 Z" fill="${PAL.wood}" ${INK}/>`,
  rooftop: `<rect x="176" y="52" width="92" height="64" fill="${PAL.brick}" ${INK}/><rect x="176" y="52" width="92" height="6" fill="${PAL.stone}"/>${[188, 214, 240].map(x => `<rect x="${x}" y="66" width="14" height="16" fill="${PAL.glass}" stroke="${PAL.ink}" stroke-width="2"/>`).join('')}<rect x="214" y="94" width="14" height="22" fill="${PAL.iron}" stroke="${PAL.ink}" stroke-width="2"/>`,
  rubber: `<rect x="96" y="30" width="122" height="9" rx="4.5" fill="${PAL.rubber}" ${INK}/><path d="M110 0 V30 M204 0 V30" stroke="${PAL.ink}" stroke-width="1.5" opacity=".5"/><rect x="146" y="60" width="6" height="56" fill="${PAL.stone}" stroke="${PAL.ink}" stroke-width="2.5"/>`,
};

let previewCount = 0;

/** Small scene illustrations in the game's own palette, mirroring each map's layout. */
export function mapPreview(id: string): string {
  const t = THEMES[id] ?? THEMES.backyard!;
  // Unique per call: several previews (or re-renders of the same one) can be on the page at once.
  const sky = `sky-${id}-${++previewCount}`;
  const jonhX = id === 'rooftop' ? 222 : id === 'fence' ? 210 : 226;
  const jonhY = id === 'rooftop' ? 52 : 116;
  return `<svg viewBox="0 0 300 140" aria-hidden="true" class="map-preview">
    <defs><linearGradient id="${sky}" x1="0" y1="0" x2="0" y2="1"><stop offset="0.3" stop-color="${t.skyTop}"/><stop offset="1" stop-color="${t.skyLow}"/></linearGradient></defs>
    <rect width="300" height="140" fill="url(#${sky})"/>
    <circle cx="250" cy="26" r="13" fill="${t.sun}"/>
    <path d="M0 96 Q40 74 80 94 T160 92 T240 90 T300 92 V140 H0 Z" fill="${t.far}"/>
    <path d="M0 104 Q50 88 100 104 T200 102 T300 104 V140 H0 Z" fill="${t.mid}" stroke="${t.midDark}" stroke-width="1.5"/>
    <rect x="0" y="116" width="300" height="24" fill="${PAL.earth}"/><rect x="0" y="116" width="300" height="6" fill="${PAL.grass}"/>
    <path d="M0 116.5 H300" stroke="${PAL.ink}" stroke-width="3"/>
    ${OBSTACLE[id] ?? ''}
    <g transform="translate(34 108) rotate(-38)"><rect x="-4" y="-6" width="34" height="12" rx="4" fill="${PAL.iron}" ${INK}/><rect x="10" y="-7" width="5" height="14" fill="${PAL.brass}"/></g>
    <circle cx="30" cy="110" r="8" fill="${PAL.woodDark}" ${INK}/>
    <g transform="translate(${jonhX} ${jonhY})">
      <path d="M-6 0 L-14 -2 M2 -14 Q-10 -12 -12 -2" stroke="${PAL.jonhTrousers}" stroke-width="5" stroke-linecap="round" fill="none"/>
      <path d="M-6 -30 Q-8 -16 -2 -10 Q6 -10 8 -16 Q8 -28 0 -32 Z" fill="${PAL.jonhShirt}" ${INK}/>
      <circle cx="0" cy="-38" r="8" fill="${PAL.skin}" ${INK}/>
      <path d="M-10 -45 H10 M-6 -46 V-52 H6 V-46" fill="${PAL.hat}" stroke="${PAL.ink}" stroke-width="2.4"/>
      <rect x="-12" y="-28" width="14" height="11" fill="${PAL.paper}" stroke="${PAL.ink}" stroke-width="2"/>
    </g>
  </svg>`;
}

const TOUR_CROP_X: Record<string, number> = { backyard: 137, fence: 132, rooftop: 172, rubber: 100 };

/** The multi-map tour: one slice of each map's preview side by side. */
export function tourPreview(ids: readonly string[]): string {
  const w = 300 / ids.length;
  const slices = ids.map((id, i) => {
    const inner = mapPreview(id).replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
    // Each slice keeps the obstacle and Jonh of its map.
    return `<svg x="${i * w}" y="0" width="${w}" height="140" viewBox="${TOUR_CROP_X[id] ?? 130} 0 ${w} 140">${inner}</svg>`;
  }).join('');
  const seams = ids.slice(1).map((_, i) => `<path d="M${(i + 1) * w} 0 V140" stroke="${PAL.ink}" stroke-width="3"/>`).join('');
  return `<svg viewBox="0 0 300 140" aria-hidden="true" class="map-preview">${slices}${seams}</svg>`;
}

export const MAP_DESCRIPTIONS: Record<string, string> = {
  backyard: 'Arc over the garden shed. Afternoon peace is overrated.',
  fence: 'Clear the fence. Settle the neighbourhood dispute.',
  rooftop: 'A higher target. A very inconvenient lunch break.',
  rubber: 'A wall in the way and a bouncy ceiling above. Bank it.',
};
