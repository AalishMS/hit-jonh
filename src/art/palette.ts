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
  glassDark: '#7FC4E0',
  rubber: '#FF6FA0',
  rubberDark: '#C93E73',
  iron: '#3A3F63',
  ironDark: '#262A45',
  ironLight: '#5C6391',
  brass: '#F2B33D',
  brassDark: '#C27F1C',
  /* Cosmetic unlocks (cannon skins, Jonh outfits). */
  coal: '#2F2A36',
  coalLight: '#554C5F',
  silver: '#D5D9E8',
  silverDark: '#9AA0BE',
  grape: '#9B6BE0',
  grapeDark: '#7448B8',
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
  /** Magic hoops (portals): the grape player colour family, so it never reads as "bouncy" pink. */
  magic: '#9B6BE0',
  magicDark: '#5E3A9E',
  magicLight: '#E2D2FF',
  /** The magician's tent: deep red velvet. */
  velvet: '#B8324A',
  velvetDark: '#7E1F33',
  /** The scrapyard magnet's field rings: electric cyan, used for nothing else. */
  field: '#8FF0FF',
  fieldDark: '#2A9CC4',
  /** Frozen Pond: pond ice (paler and whiter than glass, so it never reads as breakable), the dark water under it, and snow. */
  ice: '#D3F0FA',
  iceDark: '#8CC6DE',
  iceDeep: '#4F86B0',
  snow: '#F6FAFD',
  snowShade: '#C9DAE8',
} as const;

export type PaletteKey = keyof typeof PAL;

/** Phaser wants numbers; art wants strings. */
export function hex(color: string): number {
  return Number.parseInt(color.slice(1), 16);
}

/** Multiplayer cannon colours (paired with patterns, never colour alone). */
export const PLAYER_COLORS = [0xff5a3c, 0x3fa7e8, 0x4dba4f, 0x9b6be0] as const;

/**
 * Colour-blind friendly player colours [PROPOSED 2026-11-25] (Settings): brick, sky, gold and navy.
 * Their lightness runs from dark to light (L* 28, 40, 70, 82), so the closest pair stays ΔE ≥ 43
 * under protanopia, deuteranopia and tritanopia (the standard set falls to 11 under deuteranopia).
 * Checked by tests/colorVision.test.ts. Patterns and names still carry identity.
 */
export const PLAYER_COLORS_COLORBLIND = [0xa23b2a, 0x56b4e9, 0xffc233, 0x1f3a93] as const;

export type PlayerPalette = 'standard' | 'colorblind';
export const PLAYER_PALETTES: readonly PlayerPalette[] = ['standard', 'colorblind'];

let activePalette: PlayerPalette = 'standard';

/** Picks the player colours every screen draws with (Settings → Player colours). Takes effect on the next draw. */
export function setPlayerPalette(palette: PlayerPalette): void {
  activePalette = palette;
}

export function playerPalette(): PlayerPalette {
  return activePalette;
}

/**
 * Saved setups store MULTIPLAYER.colors values as identifiers (kept for save compatibility, and
 * what online seats send); they are drawn with the chosen palette's colour at the same index.
 */
const STORED_PLAYER_COLORS = [0xff4444, 0x4444ff, 0x44ff44, 0xffaa00];
export function playerDisplayColor(stored: number, palette: PlayerPalette = activePalette): number {
  const index = STORED_PLAYER_COLORS.indexOf(stored);
  if (index < 0) return stored;
  return (palette === 'colorblind' ? PLAYER_COLORS_COLORBLIND : PLAYER_COLORS)[index]!;
}

export function cssColor(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}
