/**
 * The only source of colour for in-canvas art (docs/art-direction.md).
 * UI colours mirror these as CSS custom properties in src/style.css.
 */
export const PAL = {
  ink: '#2A1B2E',
  paper: '#FFF7E6',
  skyTop: '#5EC2EC',
  skyLow: '#FFE6AE',
  sun: '#FFD34E',
  sunGlow: '#FFF0B3',
  hillFar: '#A9D9C0',
  hillMid: '#86C873',
  hillMidDark: '#5FA654',
  grass: '#5DB34B',
  grassDark: '#3E8D3C',
  earth: '#DC9852',
  earthDark: '#AE6A33',
  wood: '#CD7A40',
  woodDark: '#8F4D25',
  woodLight: '#E59A5C',
  brick: '#D9573B',
  brickDark: '#A63A27',
  stone: '#C3BDD6',
  stoneDark: '#948DAE',
  glass: '#BDE7F5',
  rubber: '#FF6FA0',
  rubberDark: '#C93E73',
  iron: '#3A3F63',
  ironDark: '#262A45',
  ironLight: '#5C6391',
  brass: '#F2B33D',
  brassDark: '#C27F1C',
  jonhShirt: '#F2643C',
  jonhShirtDark: '#C4442A',
  jonhTrousers: '#3B4A7A',
  jonhTrousersDark: '#28335A',
  skin: '#FFC9A3',
  skinShade: '#F09C78',
  hair: '#8A7A6E',
  hat: '#FFCB45',
  hatDark: '#D9A21F',
  hatBand: '#E2433B',
  pow: '#FF4B3A',
  zap: '#FFE14D',
  flash: '#FFFFFF',
  smoke: '#EFE6DA',
  dust: '#E8C79A',
  leaf: '#4DBA4F',
} as const;

export type PaletteKey = keyof typeof PAL;

/** Phaser wants numbers; art wants strings. */
export function hex(color: string): number {
  return Number.parseInt(color.slice(1), 16);
}

/** Multiplayer cannon colours (paired with patterns, never colour alone). */
export const PLAYER_COLORS = [0xff5a3c, 0x3fa7e8, 0x4dba4f, 0x9b6be0] as const;

/**
 * Saved setups store MULTIPLAYER.colors values as identifiers (kept for save compatibility);
 * they are drawn with the art-direction colour at the same index.
 */
const STORED_PLAYER_COLORS = [0xff4444, 0x4444ff, 0x44ff44, 0xffaa00];
export function playerDisplayColor(stored: number): number {
  const index = STORED_PLAYER_COLORS.indexOf(stored);
  return index >= 0 ? PLAYER_COLORS[index]! : stored;
}

export function cssColor(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}
