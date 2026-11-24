import { WORLD } from '../config/tuning';

/**
 * How much to enlarge in-canvas text (Jonh's speech bubble, the landing label) when the canvas is
 * shown smaller than the design width, so a phone shows ~16 px text instead of ~11 px. 1 at full
 * size, growing as the canvas shrinks, capped so the bubble never crowds the garden.
 */
export function readabilityBoost(canvasCssWidth: number, max = 1.6): number {
  if (!(canvasCssWidth > 0)) return 1;
  const shown = canvasCssWidth / WORLD.designWidthPx;
  return Math.max(1, Math.min(max, 0.85 / shown));
}
