import { PAL } from './palette';

/**
 * One piece of art: an SVG authored in logical pixels (the 1280×560 world space)
 * with a pivot (ax, ay). It is rasterized once at boot at `scale` × for crisp zooms.
 */
export interface ArtDef {
  key: string;
  w: number;
  h: number;
  ax: number;
  ay: number;
  scale: number;
  svg: string;
}

export function svgDoc(w: number, h: number, body: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${body}</svg>`;
}

/** Foreground outline (docs/art-direction.md: 3 px ink, round joins). */
export const INK = `stroke="${PAL.ink}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"`;
export const ink = (width: number) =>
  `stroke="${PAL.ink}" stroke-width="${width}" stroke-linejoin="round" stroke-linecap="round"`;

/** An outlined limb: a fat ink stroke under a thinner coloured stroke along the same path. */
export function limb(d: string, color: string, width: number, outline = 3): string {
  return `<path d="${d}" fill="none" stroke="${PAL.ink}" stroke-width="${width + outline * 2}" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<path d="${d}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/>`;
}

/** Regular star polygon centred on (cx, cy). */
export function starPath(cx: number, cy: number, points: number, outer: number, inner: number, rotation = -Math.PI / 2): string {
  const parts: string[] = [];
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = rotation + (i * Math.PI) / points;
    parts.push(`${(cx + Math.cos(a) * r).toFixed(2)} ${(cy + Math.sin(a) * r).toFixed(2)}`);
  }
  return `M${parts.join(' L')} Z`;
}

/** Jagged comic burst with deterministic irregular spikes. */
export function burstPath(cx: number, cy: number, points: number, outer: number, inner: number, jitter: number[]): string {
  const parts: string[] = [];
  for (let i = 0; i < points * 2; i++) {
    const j = jitter[i % jitter.length]!;
    const r = (i % 2 === 0 ? outer : inner) * j;
    const a = -Math.PI / 2 + (i * Math.PI) / points;
    parts.push(`${(cx + Math.cos(a) * r).toFixed(2)} ${(cy + Math.sin(a) * r).toFixed(2)}`);
  }
  return `M${parts.join(' L')} Z`;
}
