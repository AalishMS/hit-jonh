import type { ObstacleData } from '../levels/types';
import { PAL } from './palette';
import { INK, ink } from './svgKit';

/**
 * Art for the scrapyard magnet garden (docs/art-direction.md): the crane's electromagnet seen
 * side-on (iron disc, a yellow-and-ink hazard band, a pale steel face underneath) and stacks of
 * crushed cars. Each is drawn exactly on its collider box, like every obstacle. The cable, chains and
 * field rings are drawn live by render/magnetRenderer.ts (nothing there collides).
 */

/** Car body colours for a crushed stack, in order (never rubber pink: pink means "bounces"). */
const CAR_COLOURS = [PAL.brick, PAL.ironLight, PAL.hat, PAL.leaf, PAL.stone, PAL.jonhTrousers] as const;

/** The electromagnet: a squat iron drum with a hazard band, its pale steel face at the bottom. */
function electromagnet(w: number, h: number): string {
  const band = Math.max(4, h * 0.26);
  const bandY = h * 0.3;
  const face = Math.max(3, h * 0.2);
  const stripes = Array.from({ length: Math.ceil(w / 8) + 2 }, (_, i) =>
    `<path d="M${i * 8 - 4} ${bandY + band} L${i * 8 + 2} ${bandY}" stroke="${PAL.ink}" stroke-width="3"/>`).join('');
  return `<defs><clipPath id="mb"><rect x="1.5" y="${bandY}" width="${w - 3}" height="${band}"/></clipPath></defs>
    <rect x="1.5" y="1.5" width="${w - 3}" height="${h - 3}" rx="${Math.min(6, h / 3)}" fill="${PAL.iron}"/>
    <rect x="1.5" y="${bandY}" width="${w - 3}" height="${band}" fill="${PAL.hat}"/>
    <g clip-path="url(#mb)">${stripes}</g>
    <path d="M1.5 ${bandY} H${w - 1.5} M1.5 ${bandY + band} H${w - 1.5}" ${ink(1.6)}/>
    <rect x="3" y="${h - 1.5 - face}" width="${w - 6}" height="${face}" rx="2" fill="${PAL.silver}"/>
    <path d="M6 ${h - 1.5 - face * 0.55} H${w * 0.45}" stroke="${PAL.paper}" stroke-width="1.4" stroke-linecap="round" opacity="0.9"/>
    <rect x="${w * 0.72}" y="2" width="${w * 0.26}" height="${h - 4}" fill="${PAL.ironDark}" opacity="0.45"/>
    <circle cx="${w * 0.18}" cy="${h * 0.17}" r="1.6" fill="${PAL.paper}" opacity="0.85"/>
    <rect x="1.5" y="1.5" width="${w - 3}" height="${h - 3}" rx="${Math.min(6, h / 3)}" fill="none" ${INK}/>`;
}

/** A stack of crushed cars: flattened bodies in assorted paint, squashed windows, wheels poking out. */
function carStack(w: number, h: number): string {
  const layers = Math.max(2, Math.round(h / 38));
  const lh = (h - 3) / layers;
  const cars = Array.from({ length: layers }, (_, i) => {
    const top = 1.5 + i * lh;
    const inset = [3, 0, 5, 1, 4, 2][i % 6]!;
    const x0 = 1.5 + inset;
    const x1 = w - 1.5 - (5 - inset);
    const color = CAR_COLOURS[(i * 2 + 1) % CAR_COLOURS.length]!;
    const sag = lh * 0.12 * (i % 2 === 0 ? 1 : -1);
    const win = `<path d="M${x0 + (x1 - x0) * 0.22} ${top + lh * 0.3} L${x0 + (x1 - x0) * 0.68} ${top + lh * 0.3 + sag} L${x0 + (x1 - x0) * 0.64} ${top + lh * 0.48 + sag} L${x0 + (x1 - x0) * 0.26} ${top + lh * 0.48} Z" fill="${PAL.glass}" ${ink(1.4)}/>`;
    const wheels = [0.2, 0.8].map(f => `<circle cx="${x0 + (x1 - x0) * f}" cy="${top + lh * 0.86}" r="${Math.min(5, lh * 0.16)}" fill="${PAL.ironDark}" ${ink(1.2)}/>`).join('');
    const crease = `<path d="M${x0 + 3} ${top + lh * 0.62} Q${(x0 + x1) / 2} ${top + lh * 0.62 + sag * 2} ${x1 - 3} ${top + lh * 0.62}" fill="none" stroke="${PAL.ink}" stroke-width="1.2" opacity="0.55"/>`;
    return `<rect x="${x0}" y="${top + 1}" width="${x1 - x0}" height="${lh - 2}" rx="${Math.min(7, lh * 0.25)}" fill="${color}" ${ink(2)}/>${win}${crease}${wheels}`;
  }).join('');
  return `<rect x="1.5" y="1.5" width="${w - 3}" height="${h - 3}" rx="3" fill="${PAL.ironDark}"/>
    ${cars}
    <rect x="${w * 0.7}" y="2" width="${w * 0.3 - 2}" height="${h - 4}" fill="${PAL.ink}" opacity="0.18"/>
    <rect x="1.5" y="1.5" width="${w - 3}" height="${h - 3}" rx="3" fill="none" ${INK}/>`;
}

/** The SVG body for a scrapyard obstacle, or null when the obstacle is not one. */
export function magnetObstacleBody(obs: ObstacleData, w: number, h: number): string | null {
  if (obs.material === 'magnet') return electromagnet(w, h);
  if (obs.material === 'scrap') return carStack(w, h);
  return null;
}
