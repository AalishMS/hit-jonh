import type { ObstacleData } from '../levels/types';
import { PAL } from './palette';
import { INK, ink } from './svgKit';

/**
 * Frozen Pond art (docs/art-direction.md): the pond ice, Jonh's fishing hut (snowy roof, plank back wall,
 * striped roll-down door frozen stuck just off the ice) and the hut's interior. Every collider is drawn
 * exactly on its box; the interior is flat background with no ink.
 */

/** Pond ice seen side-on: pale and glossy, a deeper cel shadow below, shine streaks and a few cracks. */
function iceSheet(w: number, h: number): string {
  const glints = Array.from({ length: Math.floor(w / 46) }, (_, i) => {
    const x = 14 + i * 46 + (i % 3) * 7;
    return `<path d="M${x} ${h - 3} L${x + 7} 3" stroke="${PAL.paper}" stroke-width="2" stroke-linecap="round" opacity="0.9"/>`;
  }).join('');
  const cracks = Array.from({ length: Math.floor(w / 110) }, (_, i) => {
    const x = 40 + i * 110 + (i % 2) * 23;
    return `<path d="M${x} 3 l5 ${h * 0.35} l-4 ${h * 0.2} l6 ${h * 0.3}" stroke="${PAL.iceDark}" stroke-width="1.2" fill="none" stroke-linejoin="round"/>`;
  }).join('');
  return `<rect x="1.5" y="1.5" width="${w - 3}" height="${h - 3}" rx="3" fill="${PAL.ice}"/>
    <rect x="1.5" y="${h * 0.56}" width="${w - 3}" height="${h * 0.44 - 1.5}" rx="2" fill="${PAL.iceDark}" opacity="0.55"/>
    ${cracks}${glints}
    <path d="M5 3.4 H${w - 5}" stroke="${PAL.paper}" stroke-width="1.6" stroke-linecap="round"/>
    <rect x="1.5" y="1.5" width="${w - 3}" height="${h - 3}" rx="3" fill="none" ${ink(2.4)}/>`;
}

/** The hut's flat timber roof under a thick, lumpy cap of snow (all inside the roof's box). */
function snowyRoof(w: number, h: number): string {
  const n = Math.max(2, Math.floor(w / 18));
  const lumps = Array.from({ length: n }, (_, i) =>
    `<circle cx="${1.5 + ((i + 0.5) * (w - 3)) / n}" cy="${h * 0.52}" r="${h * (i % 2 ? 0.2 : 0.15)}" fill="${PAL.snow}"/>`).join('');
  return `<rect x="1.5" y="1.5" width="${w - 3}" height="${h - 3}" rx="3" fill="${PAL.wood}"/>
    <path d="M3 ${h - 3.2} H${w - 3}" stroke="${PAL.woodDark}" stroke-width="2"/>
    <rect x="1.5" y="1.5" width="${w - 3}" height="${h * 0.52}" rx="3" fill="${PAL.snow}"/>${lumps}
    <rect x="1.5" y="1.5" width="${w - 3}" height="${h - 3}" rx="3" fill="none" ${INK}/>`;
}

/** A striped canvas roll-down door, its rolled bottom edge frozen stuck a hand's width off the ice. */
function rollDoor(w: number, h: number): string {
  const roll = Math.min(9, h * 0.12);
  const stripes = Array.from({ length: Math.floor((h - roll) / 14) }, (_, i) => i % 2 === 0
    ? `<rect x="1.5" y="${3 + i * 14}" width="${w - 3}" height="14" fill="${PAL.pow}"/>` : '').join('');
  return `<defs><clipPath id="d"><rect x="1.5" y="1.5" width="${w - 3}" height="${h - roll - 2}"/></clipPath></defs>
    <rect x="1.5" y="1.5" width="${w - 3}" height="${h - roll - 2}" fill="${PAL.paper}"/>
    <g clip-path="url(#d)">${stripes}</g>
    <path d="M${w * 0.7} 3 V${h - roll - 2}" stroke="${PAL.ink}" stroke-width="${Math.max(2, w * 0.25)}" opacity="0.18"/>
    <rect x="1.5" y="1.5" width="${w - 3}" height="${h - roll - 2}" fill="none" ${ink(2.4)}/>
    <rect x="1" y="${h - roll - 1.5}" width="${w - 2}" height="${roll}" rx="${roll / 2}" fill="${PAL.snow}" ${ink(2.2)}/>`;
}

/** The hut's back wall: upright planks. */
function plankWall(w: number, h: number): string {
  const seams = Array.from({ length: Math.floor(h / 30) }, (_, i) => `<path d="M3 ${22 + i * 30} H${w - 3}" stroke="${PAL.woodDark}" stroke-width="1.6" opacity="0.6"/>`).join('');
  return `<rect x="1.5" y="1.5" width="${w - 3}" height="${h - 3}" rx="2" fill="${PAL.wood}"/>${seams}
    <path d="M${w * 0.68} 3 V${h - 3}" stroke="${PAL.woodDark}" stroke-width="${Math.max(2, w * 0.3)}" opacity="0.35"/>
    <rect x="1.5" y="1.5" width="${w - 3}" height="${h - 3}" rx="2" fill="none" ${INK}/>`;
}

/** Bodies for Frozen Pond's obstacles; null for anything sceneryArt already draws. */
export function pondObstacleBody(obs: ObstacleData, w: number, h: number): string | null {
  if (obs.material === 'ice') return iceSheet(w, h);
  if (obs.id === 'hut-roof') return snowyRoof(w, h);
  if (obs.id === 'hut-door') return rollDoor(w, h);
  if (obs.id === 'hut-back') return plankWall(w, h);
  return null;
}

/** Inside the hut: dark timber, a frosty little window, a lantern glow and a rod on its hooks. Flat, no ink. */
export function hutBackdrop(w: number, h: number): string {
  const planks = Array.from({ length: Math.ceil(w / 24) }, (_, i) => i % 2
    ? `<rect x="${i * 24}" y="0" width="24" height="${h}" fill="${PAL.woodDark}" opacity="0.35"/>` : '').join('');
  const wx = w * 0.62;
  return `<rect width="${w}" height="${h}" fill="${PAL.woodDark}" opacity="0.82"/>${planks}
    <rect x="${wx}" y="${h * 0.22}" width="34" height="26" rx="3" fill="${PAL.ice}" opacity="0.8"/>
    <path d="M${wx + 17} ${h * 0.22} V${h * 0.22 + 26} M${wx} ${h * 0.22 + 13} H${wx + 34}" stroke="${PAL.woodDark}" stroke-width="3"/>
    <ellipse cx="${w * 0.3}" cy="${h * 0.3}" rx="34" ry="26" fill="${PAL.zap}" opacity="0.16"/>
    <rect x="${w * 0.3 - 5}" y="${h * 0.3 - 8}" width="10" height="15" rx="3" fill="${PAL.brass}" opacity="0.75"/>
    <path d="M${w * 0.08} ${h * 0.16} L${w * 0.5} ${h * 0.12}" stroke="${PAL.brassDark}" stroke-width="2.4" opacity="0.6"/>`;
}
