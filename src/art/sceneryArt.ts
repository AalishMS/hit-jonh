import type { LevelData, ObstacleData } from '../levels/types';
import { PAL } from './palette';
import { INK, ink, svgDoc, type ArtDef } from './svgKit';

/** Per-map light: sky gradient, haze and far-layer tones (docs/art-direction.md). */
export interface Theme {
  id: string;
  skyTop: string;
  skyLow: string;
  far: string;
  farDetail: string;
  mid: string;
  midDark: string;
  sunY: number;
  sun: string;
  skyline: 'village' | 'town' | 'park';
  /** Ground surface and soil; grass on earth when omitted. */
  groundTop?: string;
  groundDark?: string;
  groundEarth?: string;
}

export const THEMES: Record<string, Theme> = {
  backyard: { id: 'backyard', skyTop: '#5EC2EC', skyLow: '#FFE6AE', far: '#A9D9C0', farDetail: '#8FC6AE', mid: '#86C873', midDark: '#5FA654', sunY: 92, sun: PAL.sun, skyline: 'village' },
  fence: { id: 'fence', skyTop: '#6AB4E8', skyLow: '#FFD9A0', far: '#B4D7B0', farDetail: '#97C29A', mid: '#8CC46E', midDark: '#629F50', sunY: 130, sun: '#FFC94A', skyline: 'village' },
  rooftop: { id: 'rooftop', skyTop: '#7A9FE0', skyLow: '#FFC48A', far: '#B9A9D6', farDetail: '#9F8EC4', mid: '#C9A0B8', midDark: '#A27C95', sunY: 190, sun: '#FFB44A', skyline: 'town' },
  rubber: { id: 'rubber', skyTop: '#8AB2F0', skyLow: '#FFC9C4', far: '#BFD6C8', farDetail: '#A3C2B3', mid: '#9CCB86', midDark: '#72A660', sunY: 150, sun: '#FFD06A', skyline: 'park' },
};

export function themeFor(levelId: string): Theme {
  return THEMES[levelId] ?? THEMES.backyard!;
}

const bg = (key: string, w: number, h: number, body: string, ax = 0, ay = h, scale = 1): ArtDef =>
  ({ key, w, h, ax, ay, scale, svg: svgDoc(w, h, body) });

/** Rolling silhouette that starts and ends at the same height so it tiles seamlessly. */
function hillsPath(w: number, h: number, base: number, bumps: Array<[number, number]>): string {
  let d = `M0 ${base}`;
  let x = 0;
  for (const [width, height] of bumps) {
    const mid = x + width / 2;
    d += ` Q${mid} ${base - height} ${x + width} ${base}`;
    x += width;
  }
  // Bottom rows stay transparent so a repeating TileSprite cannot bleed them into its top edge.
  return `${d} L${w} ${h - 3} L0 ${h - 3} Z`;
}

function themeArt(t: Theme): ArtDef[] {
  const farHouses = t.skyline === 'town'
    ? [40, 130, 230, 300, 420, 520, 610, 700, 800].map((x, i) => {
      const hh = 40 + ((i * 37) % 55);
      const w = 50 + ((i * 23) % 30);
      return `<rect x="${x}" y="${150 - hh}" width="${w}" height="${hh + 10}" fill="${t.farDetail}"/>` +
        (i % 3 === 0 ? `<rect x="${x + w / 2 - 3}" y="${150 - hh - 18}" width="6" height="18" fill="${t.farDetail}"/>` : '') +
        Array.from({ length: Math.floor(hh / 16) }, (_, r) => `<rect x="${x + 8}" y="${150 - hh + 8 + r * 16}" width="${w - 16}" height="5" fill="${t.far}" opacity="0.7"/>`).join('');
    }).join('')
    : t.skyline === 'village'
      ? [90, 160, 420, 470, 730].map((x, i) => `<path d="M${x} 150 V${128 - i % 2 * 6} L${x + 14} ${116 - i % 2 * 6} L${x + 28} ${128 - i % 2 * 6} V150 Z" fill="${t.farDetail}"/>`).join('') +
        `<path d="M600 150 V112 L606 72 L612 112 V150 Z M596 114 H616 V150 H596 Z" fill="${t.farDetail}"/>`
      : `<circle cx="210" cy="118" r="26" fill="${t.farDetail}"/><path d="M206 150 V125 H214 V150 Z" fill="${t.farDetail}"/>` +
        `<path d="M520 150 L560 96 L600 150 Z" fill="${t.farDetail}"/><path d="M640 150 Q700 70 760 150 Z" fill="none" stroke="${t.farDetail}" stroke-width="7"/>`;
  const farHills = hillsPath(900, 190, 150, [[180, 34], [220, 22], [160, 40], [190, 18], [150, 30]]);
  const midHills = hillsPath(900, 160, 110, [[260, 60], [200, 38], [240, 70], [200, 44]]);
  const trees = [70, 330, 610, 820].map((x, i) => {
    const r = 26 + (i % 2) * 8;
    const y = 72 - (i % 3) * 10;
    return `<path d="M${x - 3} ${y + r - 4} L${x - 4} ${y + r + 34} L${x + 4} ${y + r + 34} L${x + 3} ${y + r - 4} Z" fill="${PAL.woodDark}" stroke="${t.midDark}" stroke-width="2"/>` +
      `<circle cx="${x}" cy="${y}" r="${r}" fill="${t.mid}" stroke="${t.midDark}" stroke-width="2"/>` +
      `<path d="M${x + r * 0.2} ${y - r * 0.8} A${r} ${r} 0 0 1 ${x + r} ${y + r * 0.1} A${r * 0.9} ${r * 0.9} 0 0 0 ${x + r * 0.2} ${y - r * 0.8} Z" fill="${t.midDark}" opacity="0.35"/>`;
  }).join('');
  return [
    {
      key: `sky-${t.id}`, w: 4, h: 512, ax: 0, ay: 0, scale: 1,
      svg: svgDoc(4, 512, `<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${t.skyTop}"/><stop offset="0.35" stop-color="${t.skyTop}"/><stop offset="0.7" stop-color="${t.skyTop}"/><stop offset="0.96" stop-color="${t.skyLow}"/><stop offset="1" stop-color="${t.skyLow}"/></linearGradient></defs><rect width="4" height="512" fill="url(#g)"/>`),
    },
    bg(`far-${t.id}`, 900, 190, `<path d="${farHills}" fill="${t.far}"/>${farHouses}<path d="M0 150 H900 V187 H0 Z" fill="${t.far}"/>`),
    bg(`mid-${t.id}`, 900, 160, `${trees}<path d="${midHills}" fill="${t.mid}"/><path d="${midHills}" fill="none" stroke="${t.midDark}" stroke-width="2"/>`, 0, 160, 1.5),
    {
      key: `sun-${t.id}`, w: 120, h: 120, ax: 60, ay: 60, scale: 1,
      svg: svgDoc(120, 120, `<circle cx="60" cy="60" r="58" fill="${PAL.sunGlow}" opacity="0.45"/><circle cx="60" cy="60" r="34" fill="${t.sun}"/>`),
    },
  ];
}

const clouds: ArtDef[] = [
  bg('cloud-a', 150, 60, `<path d="M18 50 Q4 50 6 38 Q8 26 24 28 Q28 10 50 12 Q66 2 82 14 Q102 6 112 24 Q134 22 140 38 Q146 52 126 52 Z" fill="${PAL.paper}"/><path d="M10 46 Q60 56 138 46 Q134 54 124 54 L20 54 Q10 54 10 46 Z" fill="#E4EEF2" opacity="0.8"/>`, 75, 30),
  bg('cloud-b', 110, 46, `<path d="M14 40 Q2 40 4 30 Q8 20 20 22 Q26 6 46 10 Q60 2 72 14 Q92 10 98 26 Q108 30 102 40 Z" fill="${PAL.paper}"/><path d="M6 36 Q50 44 104 36 Q100 42 92 42 L14 42 Q6 42 6 36 Z" fill="#E4EEF2" opacity="0.8"/>`, 55, 23),
  bg('cloud-c', 80, 34, `<path d="M10 30 Q2 30 4 22 Q8 14 18 16 Q24 4 40 8 Q54 4 62 16 Q76 16 76 26 Q76 31 68 31 Z" fill="${PAL.paper}"/>`, 40, 17),
];

const props: ArtDef[] = [
  {
    key: 'sun-rays', w: 300, h: 300, ax: 150, ay: 150, scale: 1,
    svg: svgDoc(300, 300, Array.from({ length: 12 }, (_, i) => {
      const a = (i * Math.PI * 2) / 12;
      const a1 = a - 0.06;
      const a2 = a + 0.06;
      return `<path d="M150 150 L${150 + Math.cos(a1) * 150} ${150 + Math.sin(a1) * 150} L${150 + Math.cos(a2) * 150} ${150 + Math.sin(a2) * 150} Z" fill="${PAL.sunGlow}" opacity="0.1"/>`;
    }).join('')),
  },
  bg('fence-back', 96, 56, `
    <path d="M0 22 H96 M0 42 H96" stroke="#DDB896" stroke-width="5"/>
    ${[4, 28, 52, 76].map(x => `<path d="M${x} 53 V12 L${x + 9} 3 L${x + 18} 12 V53 Z" fill="#F4D6B4" stroke="#D8B48E" stroke-width="2" stroke-linejoin="round"/><path d="M${x + 13} 14 V52" stroke="#E6C49F" stroke-width="2"/>`).join('')}`, 0, 56, 2),
  bg('ground-top', 128, 40, `
    <rect x="0" y="0" width="128" height="40" fill="${PAL.earth}"/>
    <path d="M0 0 H128 V16 Q120 22 112 16 Q104 22 96 16 Q88 23 80 16 Q72 22 64 16 Q56 23 48 16 Q40 22 32 16 Q24 23 16 16 Q8 22 0 16 Z" fill="${PAL.grass}"/>
    <path d="M0 10 Q8 14 16 10 Q24 15 32 10 Q40 14 48 10 Q56 15 64 10 Q72 14 80 10 Q88 15 96 10 Q104 14 112 10 Q120 15 128 10 V16 Q120 22 112 16 Q104 22 96 16 Q88 23 80 16 Q72 22 64 16 Q56 23 48 16 Q40 22 32 16 Q24 23 16 16 Q8 22 0 16 Z" fill="${PAL.grassDark}"/>
    <path d="M10 6 l2 -4 M40 7 l-2 -4 M70 6 l2 -4 M101 7 l-1 -4" stroke="${PAL.grassDark}" stroke-width="2" stroke-linecap="round"/>
    <path d="M0 1.5 H128" stroke="${PAL.ink}" stroke-width="3"/>`, 0, 40, 2),
  bg('earth', 128, 128, `
    <rect width="128" height="128" fill="${PAL.earth}"/>
    ${[[14, 20], [70, 12], [104, 46], [40, 60], [88, 84], [16, 100], [60, 112], [118, 118]].map(([x, y], i) =>
    `<ellipse cx="${x}" cy="${y}" rx="${3 + (i % 3)}" ry="${2 + (i % 2)}" fill="${PAL.earthDark}" opacity="0.6"/>`).join('')}
    <path d="M30 40 q6 -3 12 0 M80 100 q6 -3 12 0" stroke="${PAL.earthDark}" stroke-width="2" fill="none" opacity="0.5"/>`, 0, 128, 2),
  bg('tuft', 26, 18, `<path d="M2 17 Q6 6 8 1 Q9 9 12 17 Q14 5 17 0 Q18 10 20 17 Q22 8 25 4 Q24 12 24 17 Z" fill="${PAL.grass}" ${ink(1.6)}/>`, 13, 17, 2),
  bg('flower-a', 16, 30, `<path d="M8 29 Q7 20 8 12" stroke="${PAL.grassDark}" stroke-width="2.4" fill="none"/>
    <g ${ink(1.4)}><circle cx="8" cy="6" r="3.2" fill="${PAL.paper}"/><circle cx="3.5" cy="9" r="3.2" fill="${PAL.paper}"/><circle cx="12.5" cy="9" r="3.2" fill="${PAL.paper}"/><circle cx="5" cy="13" r="3.2" fill="${PAL.paper}"/><circle cx="11" cy="13" r="3.2" fill="${PAL.paper}"/><circle cx="8" cy="10" r="2.6" fill="${PAL.zap}"/></g>`, 8, 29, 2),
  bg('flower-b', 16, 30, `<path d="M8 29 Q9 20 8 12" stroke="${PAL.grassDark}" stroke-width="2.4" fill="none"/>
    <path d="M3 4 L8 9 L13 4 L13 11 Q8 16 3 11 Z" fill="${PAL.rubber}" ${ink(1.4)}/>`, 8, 29, 2),
  bg('bird', 22, 10, `<path d="M1 8 Q6 1 11 7 Q16 1 21 8" fill="none" stroke="${PAL.ink}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>`, 11, 5, 2),
  {
    key: 'tea-table', w: 60, h: 52, ax: 30, ay: 51, scale: 2,
    svg: svgDoc(60, 52, `
      <path d="M14 51 L18 22 M46 51 L42 22" ${ink(5)}/><path d="M14 51 L18 22 M46 51 L42 22" stroke="${PAL.wood}" stroke-width="2.5" stroke-linecap="round"/>
      <rect x="6" y="18" width="48" height="7" rx="2" fill="${PAL.wood}" ${INK}/>
      <path d="M28 16 Q28 6 37 6 Q46 6 46 16 Z" fill="${PAL.skyTop}" ${ink(2.2)}/><path d="M46 9 Q52 9 51 13 Q50 16 46 15" fill="none" ${ink(2)}/>
      <path d="M28 10 L22 7" ${ink(2.2)}/><circle cx="37" cy="5" r="2" fill="${PAL.paper}" ${ink(1.4)}/>
      <path d="M11 17 L12 10 H20 L21 17 Z" fill="${PAL.paper}" ${ink(2)}/><path d="M21 11 Q24 11 24 13.5 Q24 16 21 15.5" fill="none" ${ink(1.6)}/>
      <path d="M14 7 Q13 4 15 2 M18 7 Q17 4 19 2" stroke="${PAL.paper}" stroke-width="1.6" fill="none" stroke-linecap="round" opacity="0.9"/>`),
  },
];

/* ---------- Obstacles: drawn to exactly fill their collider box (≤ 2 px overhang). ---------- */

function shed(w: number, h: number): string {
  const planks = Array.from({ length: Math.floor(w / 16) }, (_, i) => `<path d="M${8 + i * 16} 14 V${h - 2}" stroke="${PAL.woodDark}" stroke-width="2" opacity="0.55"/>`).join('');
  const doorW = w * 0.3;
  const doorX = w * 0.56;
  return `
    <rect x="1.5" y="1.5" width="${w - 3}" height="${h - 3}" rx="3" fill="${PAL.wood}"/>
    ${planks}
    <path d="M${w - 18} 14 H${w - 1.5} V${h - 1.5} H${w - 18} Z" fill="${PAL.woodDark}" opacity="0.35"/>
    <rect x="1.5" y="1.5" width="${w - 3}" height="14" rx="3" fill="#5B3A4A"/>
    <path d="M1.5 15 H${w - 1.5}" ${ink(2)}/>
    <rect x="${doorX}" y="${h * 0.42}" width="${doorW}" height="${h * 0.58 - 1.5}" rx="2" fill="${PAL.woodDark}" ${ink(2.5)}/>
    <path d="M${doorX + 4} ${h * 0.5} L${doorX + doorW - 4} ${h * 0.9} M${doorX + doorW - 4} ${h * 0.5} L${doorX + 4} ${h * 0.9}" stroke="${PAL.wood}" stroke-width="3"/>
    <circle cx="${doorX + 6}" cy="${h * 0.72}" r="2.4" fill="${PAL.brass}" ${ink(1.2)}/>
    <rect x="${w * 0.1}" y="${h * 0.3}" width="${w * 0.34}" height="${h * 0.26}" rx="2" fill="${PAL.glass}" ${ink(2.5)}/>
    <path d="M${w * 0.27} ${h * 0.3} V${h * 0.56} M${w * 0.1} ${h * 0.43} H${w * 0.44}" ${ink(2)}/>
    <path d="M${w * 0.1 + 2} ${h * 0.3 + 2} Q${w * 0.16} ${h * 0.42} ${w * 0.12} ${h * 0.54}" stroke="${PAL.brick}" stroke-width="4" fill="none" opacity="0.8"/>
    <rect x="${w * 0.1}" y="${h * 0.62}" width="${w * 0.3}" height="${h * 0.08}" rx="2" fill="${PAL.brick}" ${ink(2)}/>
    <circle cx="${w * 0.16}" cy="${h * 0.6}" r="4" fill="${PAL.rubber}" ${ink(1.4)}/><circle cx="${w * 0.25}" cy="${h * 0.58}" r="4" fill="${PAL.zap}" ${ink(1.4)}/><circle cx="${w * 0.34}" cy="${h * 0.6}" r="4" fill="${PAL.paper}" ${ink(1.4)}/>
    <rect x="1.5" y="1.5" width="${w - 3}" height="${h - 3}" rx="3" fill="none" ${INK}/>`;
}

function post(w: number, h: number, color: string, dark: string): string {
  const knots = Array.from({ length: Math.floor(h / 30) }, (_, i) => `<path d="M${w / 2 - 2} ${20 + i * 30} q2 4 0 8" stroke="${dark}" stroke-width="1.6" fill="none"/>`).join('');
  return `
    <path d="M1.5 ${h - 1.5} V10 L${w / 2} 1.5 L${w - 1.5} 10 V${h - 1.5} Z" fill="${color}"/>
    <path d="M${w * 0.62} 8 V${h - 2}" stroke="${dark}" stroke-width="${Math.max(2, w * 0.3)}" opacity="0.4"/>
    ${knots}
    <circle cx="${w / 2}" cy="${h * 0.3}" r="1.6" fill="${PAL.ink}"/><circle cx="${w / 2}" cy="${h * 0.7}" r="1.6" fill="${PAL.ink}"/>
    <path d="M1.5 ${h - 1.5} V10 L${w / 2} 1.5 L${w - 1.5} 10 V${h - 1.5} Z" fill="none" ${INK}/>`;
}

function building(w: number, h: number): string {
  const cols = Math.max(2, Math.floor((w - 40) / 75));
  const rows = Math.max(1, Math.floor((h - 70) / 72));
  const gapX = (w - 40) / cols;
  const windows: string[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = 20 + c * gapX + gapX / 2 - 18;
      const y = 34 + r * 72;
      if (r === rows - 1 && c === Math.floor(cols / 2)) continue;
      windows.push(`<rect x="${x - 3}" y="${y - 3}" width="42" height="50" fill="${PAL.paper}" ${ink(2)}/>` +
        `<rect x="${x}" y="${y}" width="36" height="44" fill="${PAL.glass}" ${ink(2.2)}/>` +
        `<path d="M${x + 18} ${y} V${y + 44} M${x} ${y + 22} H${x + 36}" ${ink(1.8)}/>` +
        ((r + c) % 3 === 0 ? `<path d="M${x + 2} ${y + 2} Q${x + 10} ${y + 20} ${x + 4} ${y + 42}" stroke="${PAL.pow}" stroke-width="5" fill="none" opacity="0.75"/>` : '') +
        `<rect x="${x - 5}" y="${y + 46}" width="46" height="5" fill="${PAL.stone}" ${ink(1.6)}/>`);
    }
  }
  const doorX = 20 + Math.floor(cols / 2) * gapX + gapX / 2 - 22;
  const bricks = Array.from({ length: Math.floor(h / 14) }, (_, r) =>
    Array.from({ length: Math.ceil(w / 34) + 1 }, (_, c) => `<path d="M${c * 34 + (r % 2) * 17} ${16 + r * 14} h14" stroke="${PAL.brickDark}" stroke-width="2" opacity="0.45"/>`).join('')).join('');
  return `
    <rect x="1.5" y="1.5" width="${w - 3}" height="${h - 3}" fill="${PAL.brick}"/>
    ${bricks}
    <path d="M${w - 26} 1.5 H${w - 1.5} V${h - 1.5} H${w - 26} Z" fill="${PAL.brickDark}" opacity="0.3"/>
    <path d="M${w - 16} 16 V${h - 6}" stroke="${PAL.stoneDark}" stroke-width="5"/><path d="M${w - 16} 16 V${h - 6}" ${ink(1.4)}/>
    ${windows.join('')}
    <rect x="${doorX}" y="${h - 62}" width="44" height="60" rx="3" fill="${PAL.iron}" ${ink(2.5)}/>
    <circle cx="${doorX + 34}" cy="${h - 32}" r="2.6" fill="${PAL.brass}"/>
    <rect x="${doorX - 6}" y="${h - 68}" width="56" height="7" fill="${PAL.stone}" ${ink(2)}/>
    <rect x="1.5" y="1.5" width="${w - 3}" height="12" fill="${PAL.stone}"/>
    <path d="M1.5 13.5 H${w - 1.5}" ${ink(2)}/>
    <rect x="1.5" y="1.5" width="${w - 3}" height="${h - 3}" fill="none" ${INK}/>`;
}

function stoneWall(w: number, h: number): string {
  const blocks = Array.from({ length: Math.floor(h / 18) }, (_, r) => `<path d="M2 ${18 + r * 18} H${w - 2}" stroke="${PAL.stoneDark}" stroke-width="2"/>`).join('');
  return `<rect x="1.5" y="1.5" width="${w - 3}" height="${h - 3}" rx="2" fill="${PAL.stone}"/>${blocks}
    <path d="M${w * 0.65} 2 V${h - 2}" stroke="${PAL.stoneDark}" stroke-width="${w * 0.3}" opacity="0.35"/>
    <rect x="1.5" y="1.5" width="${w - 3}" height="${h - 3}" rx="2" fill="none" ${INK}/>`;
}

function rubber(w: number, h: number): string {
  const chevrons = Array.from({ length: Math.floor(w / 40) }, (_, i) => `<path d="M${20 + i * 40} ${h * 0.7} l6 -${h * 0.3} l6 ${h * 0.3}" stroke="${PAL.rubberDark}" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`).join('');
  return `<rect x="1.5" y="1.5" width="${w - 3}" height="${h - 3}" rx="${Math.min(10, h / 2 - 1)}" fill="${PAL.rubber}"/>
    <rect x="8" y="5" width="${w - 16}" height="${Math.max(2, h * 0.2)}" rx="2" fill="#FFB3CC"/>
    ${chevrons}
    <rect x="1.5" y="1.5" width="${w - 3}" height="${h - 3}" rx="${Math.min(10, h / 2 - 1)}" fill="none" ${INK}/>`;
}

/** Steel legs, blue sprung mat along the top edge (the collider is the whole box). */
function trampoline(w: number, h: number): string {
  const matH = Math.max(8, h * 0.4);
  const legs = [0.12, 0.88].map(f => `<path d="M${w * f} ${matH} L${w * f + (f < 0.5 ? -4 : 4)} ${h - 2}" stroke="${PAL.iron}" stroke-width="5" stroke-linecap="round"/>`).join('');
  const springCount = Math.max(2, Math.floor(w / 18));
  const springs = Array.from({ length: springCount }, (_, i) => {
    const x = 8 + (i * (w - 16)) / (springCount - 1);
    return `<path d="M${x} ${matH - 2} l-3 3 l6 3 l-6 3 l3 3" stroke="${PAL.stoneDark}" stroke-width="1.6" fill="none"/>`;
  }).join('');
  return `${legs}${springs}
    <path d="M2 4 Q${w / 2} ${matH * 0.9} ${w - 2} 4 V${matH} H2 Z" fill="#3FA7E8"/>
    <path d="M6 7 Q${w / 2} ${matH * 0.7} ${w - 6} 7" stroke="#9FD7F7" stroke-width="2.5" fill="none" opacity="0.8"/>
    <rect x="1.5" y="1.5" width="${w - 3}" height="${Math.min(8, matH / 2)}" rx="3" fill="${PAL.iron}" ${ink(2)}/>
    <path d="M2 4 Q${w / 2} ${matH * 0.9} ${w - 2} 4 V${matH} H2 Z" fill="none" ${ink(2)}/>`;
}

/** Riveted steel billboard panel. */
function steelPanel(w: number, h: number): string {
  const rivets = Array.from({ length: Math.floor(h / 26) }, (_, r) =>
    [6, w - 6].map(x => `<circle cx="${x}" cy="${14 + r * 26}" r="2" fill="${PAL.ironDark}"/>`).join('')).join('');
  const seams = Array.from({ length: Math.floor(h / 60) }, (_, r) => `<path d="M2 ${60 + r * 60} H${w - 2}" stroke="${PAL.ironDark}" stroke-width="2"/>`).join('');
  return `<rect x="1.5" y="1.5" width="${w - 3}" height="${h - 3}" rx="2" fill="${PAL.ironLight}"/>
    <path d="M${w * 0.2} 2 V${h - 2}" stroke="#8C93C2" stroke-width="${Math.max(2, w * 0.2)}" opacity="0.5"/>
    ${seams}${rivets}
    <rect x="1.5" y="1.5" width="${w - 3}" height="${h - 3}" rx="2" fill="none" ${INK}/>`;
}

/** A leafy canopy: soft, bumpy, catches the ball. */
function canopy(w: number, h: number): string {
  const n = Math.max(3, Math.round(w / 34));
  const bumps = Array.from({ length: n }, (_, i) => {
    const cx = (w * (i + 0.5)) / n;
    const r = Math.min(h * 0.6, (w / n) * 0.62);
    return `<circle cx="${cx}" cy="${h * 0.42}" r="${r}" fill="${PAL.leaf}" ${ink(2)}/>`;
  }).join('');
  return `<rect x="2" y="${h * 0.3}" width="${w - 4}" height="${h * 0.66}" rx="${h * 0.3}" fill="${PAL.grassDark}" ${ink(2.4)}/>${bumps}
    ${Array.from({ length: n }, (_, i) => `<circle cx="${(w * (i + 0.5)) / n - 4}" cy="${h * 0.32}" r="${Math.min(5, h * 0.12)}" fill="#8EDB7F" opacity="0.7"/>`).join('')}`;
}

/** Layered rock face (cliffs, mesas, crater rims). */
function rockFace(w: number, h: number, light: string, dark: string): string {
  const strata = Array.from({ length: Math.floor(h / 40) }, (_, r) =>
    `<path d="M2 ${30 + r * 40} q${w * 0.25} ${r % 2 ? 6 : -6} ${w * 0.5} 0 t${w * 0.5 - 4} 0" stroke="${dark}" stroke-width="2.4" fill="none" opacity="0.6"/>`).join('');
  return `<rect x="1.5" y="1.5" width="${w - 3}" height="${h - 3}" rx="4" fill="${light}"/>
    <path d="M${w * 0.7} 2 V${h - 2}" stroke="${dark}" stroke-width="${Math.max(2, w * 0.25)}" opacity="0.25"/>
    ${strata}
    <rect x="1.5" y="1.5" width="${w - 3}" height="${h - 3}" rx="4" fill="none" ${INK}/>`;
}

function obstacleBody(obs: ObstacleData, w: number, h: number): string {
  if (obs.id === 'garden-shed') return shed(w, h);
  if (obs.material === 'rubber') return rubber(w, h);
  if (obs.material === 'trampoline') return trampoline(w, h);
  if (obs.material === 'steel') return steelPanel(w, h);
  if (obs.material === 'leaves') return canopy(w, h);
  if (obs.material === 'rock') return rockFace(w, h, '#B89A80', '#7E634F');
  if (obs.material === 'regolith') return rockFace(w, h, '#B9B6C9', '#7D7895');
  if (obs.material === 'wood') return post(w, h, PAL.wood, PAL.woodDark);
  if (obs.material === 'concrete') return w > 80 ? building(w, h) : stoneWall(w, h);
  return `<rect x="1.5" y="1.5" width="${w - 3}" height="${h - 3}" rx="3" fill="${PAL.stone}" ${INK}/>`;
}

export function obstacleKey(levelId: string, obs: ObstacleData): string {
  return `obs-${levelId}-${obs.id}`;
}

/** One texture per obstacle, sized from level data so the drawing matches the collider. */
export function obstacleArt(levels: readonly LevelData[], ppm: number): ArtDef[] {
  const defs: ArtDef[] = [];
  for (const level of levels) {
    for (const obs of level.obstacles) {
      const w = Math.round((obs.box.maxX - obs.box.minX) * ppm);
      const h = Math.round((obs.box.maxY - obs.box.minY) * ppm);
      defs.push({ key: obstacleKey(level.id, obs), w, h, ax: 0, ay: 0, scale: 2, svg: svgDoc(w, h, obstacleBody(obs, w, h)) });
    }
  }
  return defs;
}

export function sceneryArt(levels: readonly LevelData[], ppm: number): ArtDef[] {
  const themes = [...new Set(levels.map(l => themeFor(l.id)))];
  return [...themes.flatMap(themeArt), ...clouds, ...props, ...obstacleArt(levels, ppm)];
}
