import type { CannonSkinId } from '../rules/cosmetics';
import { PAL } from './palette';
import { burstPath, ink, limb, starPath } from './svgKit';

/**
 * Cannon skin themes. A skin recolours the barrel, carriage and wheel and adds decals; it never
 * changes a shape or pivot, so the muzzle, recoil and fuse stay exactly where they were.
 * In multiplayer the barrel keeps its classic player-colour band (see CannonRenderer).
 */
export interface CannonTheme {
  barrel: { body: string; shade: string; light: string; ring: string; breech: string; decal: string };
  carriage: { body: string; shade: string; line: string; stud: string; hub: string; decal: string };
  wheel: { rim: string; face: string; spoke: string; hub: string; light: string; decal: string };
}

const flower = (cx: number, cy: number, r: number, petal: string, centre: string): string =>
  [0, 1, 2, 3, 4].map(i => {
    const a = (i * 2 * Math.PI) / 5 - Math.PI / 2;
    return `<circle cx="${(cx + Math.cos(a) * r).toFixed(2)}" cy="${(cy + Math.sin(a) * r).toFixed(2)}" r="${(r * 0.78).toFixed(2)}" fill="${petal}" ${ink(1.1)}/>`;
  }).join('') + `<circle cx="${cx}" cy="${cy}" r="${(r * 0.62).toFixed(2)}" fill="${centre}" ${ink(1)}/>`;

/** BONK in four chunky strokes, each letter 4 × 7 units, starting at (x, y). */
function bonk(x: number, y: number): string {
  const letters = [
    'M0 0 V7 M0 0 H2.5 Q4 0 4 1.75 Q4 3.5 2.5 3.5 H0 M2.5 3.5 Q4.2 3.5 4.2 5.25 Q4.2 7 2.5 7 H0',
    'M1.2 0 H2.8 Q4 0 4 1.2 V5.8 Q4 7 2.8 7 H1.2 Q0 7 0 5.8 V1.2 Q0 0 1.2 0 Z',
    'M0 7 V0 L4 7 V0',
    'M0 0 V7 M4 0 L0 3.8 M1.6 2.6 L4 7',
  ];
  return letters.map((d, i) =>
    `<path transform="translate(${(x + i * 5.2).toFixed(1)} ${y})" d="${d}" fill="none" stroke="${PAL.ink}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>`).join('');
}

const anchor = (cx: number, cy: number): string => `
  <g stroke="${PAL.jonhTrousers}" stroke-width="2" stroke-linecap="round" fill="none">
    <circle cx="${cx}" cy="${cy - 6}" r="1.8"/><path d="M${cx} ${cy - 4} V${cy + 6} M${cx - 4} ${cy - 1} H${cx + 4} M${cx - 6} ${cy + 2} Q${cx - 5} ${cy + 7} ${cx} ${cy + 6} Q${cx + 5} ${cy + 7} ${cx + 6} ${cy + 2}"/>
  </g>`;

const skull = (cx: number, cy: number): string => `
  ${limb(`M${cx - 8} ${cy + 6} L${cx + 8} ${cy - 5}`, PAL.paper, 2.6, 1.3)}
  ${limb(`M${cx - 8} ${cy - 5} L${cx + 8} ${cy + 6}`, PAL.paper, 2.6, 1.3)}
  <circle cx="${cx}" cy="${cy - 1.5}" r="5" fill="${PAL.paper}" ${ink(1.6)}/>
  <rect x="${cx - 2.6}" y="${cy + 2}" width="5.2" height="3.4" rx="1" fill="${PAL.paper}" ${ink(1.4)}/>
  <circle cx="${cx - 2}" cy="${cy - 2}" r="1.5" fill="${PAL.ink}"/><circle cx="${cx + 2}" cy="${cy - 2}" r="1.5" fill="${PAL.ink}"/>
  <path d="M${cx - 0.6} ${cy + 0.6} L${cx + 0.6} ${cy + 0.6} L${cx} ${cy - 0.4} Z" fill="${PAL.ink}"/>`;

export const CANNON_THEMES: Record<CannonSkinId, CannonTheme> = {
  classic: {
    barrel: { body: PAL.iron, shade: PAL.ironDark, light: PAL.ironLight, ring: PAL.brass, breech: PAL.iron, decal: '' },
    carriage: { body: PAL.wood, shade: PAL.woodDark, line: PAL.woodDark, stud: PAL.brass, hub: PAL.brass, decal: '' },
    wheel: { rim: PAL.woodDark, face: PAL.wood, spoke: PAL.woodDark, hub: PAL.brass, light: PAL.woodLight, decal: '' },
  },
  admiral: {
    barrel: { body: PAL.brass, shade: PAL.brassDark, light: PAL.sunGlow, ring: PAL.jonhTrousers, breech: PAL.brass, decal: anchor(36, 17) },
    carriage: { body: PAL.jonhTrousers, shade: PAL.jonhTrousersDark, line: PAL.jonhTrousersDark, stud: PAL.brass, hub: PAL.brass, decal: '' },
    wheel: { rim: PAL.jonhTrousersDark, face: PAL.brass, spoke: PAL.brassDark, hub: PAL.jonhTrousers, light: PAL.sunGlow, decal: '' },
  },
  garden: {
    barrel: {
      body: PAL.grass, shade: PAL.grassDark, light: PAL.hillMid, ring: PAL.wood, breech: PAL.grass,
      decal: `<path d="M25 24 Q31 17 36 19 Q42 21 47 11" fill="none" stroke="${PAL.grassDark}" stroke-width="2" stroke-linecap="round"/>
        ${flower(30, 13, 2.3, PAL.paper, PAL.sun)}${flower(41, 20.5, 2.6, PAL.hatBand, PAL.sun)}${flower(32.5, 23.3, 1.7, PAL.sun, PAL.hatBand)}`,
    },
    carriage: {
      body: PAL.wood, shade: PAL.woodDark, line: PAL.woodDark, stud: PAL.brass, hub: PAL.brass,
      decal: `<path d="M12 36 Q22 28 32 33 Q44 38 58 30" fill="none" stroke="${PAL.grassDark}" stroke-width="2.4" stroke-linecap="round"/>
        <ellipse cx="22" cy="30.6" rx="3.2" ry="1.8" fill="${PAL.leaf}" ${ink(1.2)}/><ellipse cx="46" cy="35.2" rx="3.2" ry="1.8" fill="${PAL.leaf}" ${ink(1.2)}/>`,
    },
    wheel: { rim: PAL.grassDark, face: PAL.wood, spoke: PAL.woodDark, hub: PAL.sun, light: PAL.hillMid, decal: '' },
  },
  pirate: {
    barrel: { body: PAL.coal, shade: PAL.ink, light: PAL.coalLight, ring: PAL.brassDark, breech: PAL.coal, decal: skull(36, 17) },
    carriage: { body: PAL.woodDark, shade: PAL.ink, line: PAL.ink, stud: PAL.brass, hub: PAL.brass, decal: '' },
    wheel: { rim: PAL.coal, face: PAL.woodDark, spoke: PAL.coal, hub: PAL.brass, light: PAL.coalLight, decal: '' },
  },
  moonshot: {
    barrel: {
      body: PAL.silver, shade: PAL.silverDark, light: PAL.paper, ring: PAL.jonhTrousers, breech: PAL.silver,
      decal: `<path d="${starPath(30, 12.5, 5, 4.2, 1.8)}" fill="${PAL.zap}" ${ink(1.2)}/>
        <path d="${starPath(41, 20, 5, 5.4, 2.3)}" fill="${PAL.zap}" ${ink(1.3)}/>
        <path d="${starPath(32.5, 23.4, 5, 2.6, 1.1)}" fill="${PAL.zap}" ${ink(1)}/>
        <circle cx="45" cy="11" r="1.1" fill="${PAL.jonhTrousers}"/><circle cx="26.5" cy="19.5" r="0.9" fill="${PAL.jonhTrousers}"/>`,
    },
    carriage: { body: PAL.stone, shade: PAL.stoneDark, line: PAL.stoneDark, stud: PAL.silver, hub: PAL.silver, decal: '' },
    wheel: { rim: PAL.stoneDark, face: PAL.stone, spoke: PAL.stoneDark, hub: PAL.silver, light: PAL.paper, decal: '' },
  },
  golden: {
    barrel: {
      body: PAL.sun, shade: PAL.brass, light: PAL.sunGlow, ring: PAL.brassDark, breech: PAL.sun,
      decal: `<path d="${burstPath(36.5, 17, 8, 11.2, 7.6, [1, 0.88, 1.05, 0.9, 1, 0.86, 1.04, 0.92])}" fill="${PAL.pow}" ${ink(1.5)}/>${bonk(26.2, 13.5)}`,
    },
    carriage: { body: PAL.brass, shade: PAL.brassDark, line: PAL.brassDark, stud: PAL.sun, hub: PAL.sun, decal: '' },
    wheel: { rim: PAL.brassDark, face: PAL.brass, spoke: PAL.brassDark, hub: PAL.sun, light: PAL.sunGlow, decal: '' },
  },
};
