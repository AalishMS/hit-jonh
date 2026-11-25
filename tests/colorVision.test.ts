import { describe, expect, it } from 'vitest';
import { PAL, PLAYER_COLORS, PLAYER_COLORS_COLORBLIND, hex, playerDisplayColor, setPlayerPalette } from '../src/art/palette';
import { barrelKey } from '../src/art/cannonArt';
import { ART_GROUPS, barrelGroup, playerBarrelGroups } from '../src/art/library';
import { deltaE, type ColorVision } from '../src/art/colorVision';
import { MULTIPLAYER } from '../src/config/tuning';

const VISIONS: ColorVision[] = ['normal', 'protanopia', 'deuteranopia', 'tritanopia'];

describe('colour-vision check (accessibility pass)', () => {
  it('player colours are far apart with normal vision', () => {
    for (let i = 0; i < PLAYER_COLORS.length; i++) {
      for (let j = i + 1; j < PLAYER_COLORS.length; j++) expect(deltaE(PLAYER_COLORS[i]!, PLAYER_COLORS[j]!)).toBeGreaterThan(40);
    }
  });

  it('never leaves players to colour alone: every default look has its own pattern', () => {
    // Under deuteranopia tomato/leaf (ΔE ≈ 15) and sky/grape (≈ 11) come close, and with four hues any
    // three players include such a pair, so the cannon patterns (and names everywhere) carry identity.
    expect(new Set(MULTIPLAYER.patterns).size).toBe(MULTIPLAYER.patterns.length);
    expect(MULTIPLAYER.patterns.length).toBeGreaterThanOrEqual(MULTIPLAYER.maxPlayers);
    let closest = Number.POSITIVE_INFINITY;
    for (const v of VISIONS) {
      for (let i = 0; i < PLAYER_COLORS.length; i++) {
        for (let j = i + 1; j < PLAYER_COLORS.length; j++) closest = Math.min(closest, deltaE(PLAYER_COLORS[i]!, PLAYER_COLORS[j]!, v));
      }
    }
    // Still noticeably different side by side (ΔE76 ≈ 2.3 is the threshold of a just noticeable difference).
    expect(closest).toBeGreaterThan(10);
  });

  it('the red trail and markers stand out from the sky for every colour vision', () => {
    for (const v of VISIONS) expect(deltaE(hex(PAL.pow), hex(PAL.skyTop), v)).toBeGreaterThan(40);
  });

  it('the colour-blind friendly palette keeps every pair far apart for every colour vision', () => {
    const visions = ['normal', 'protanopia', 'deuteranopia', 'tritanopia'] as const;
    const set = PLAYER_COLORS_COLORBLIND;
    for (const vision of visions) {
      for (let i = 0; i < set.length; i++) {
        for (let j = i + 1; j < set.length; j++) expect(deltaE(set[i]!, set[j]!, vision), `${i}/${j} ${vision}`).toBeGreaterThan(40);
      }
    }
    // The standard set is the one that needed it: under deuteranopia a pair comes within ΔE 12.
    const worst = Math.min(...PLAYER_COLORS.flatMap((a, i) => PLAYER_COLORS.slice(i + 1).map(b => deltaE(a, b, 'deuteranopia'))));
    expect(worst).toBeLessThan(12);
  });

  it('the setting switches what every screen draws, and barrels get their own textures', () => {
    const stored = MULTIPLAYER.colors[0];
    expect(playerDisplayColor(stored, 'standard')).toBe(PLAYER_COLORS[0]);
    expect(playerDisplayColor(stored, 'colorblind')).toBe(PLAYER_COLORS_COLORBLIND[0]);
    setPlayerPalette('colorblind');
    try {
      expect(playerDisplayColor(stored)).toBe(PLAYER_COLORS_COLORBLIND[0]);
      expect(barrelKey(stored, 'solid')).not.toBe(barrelKey(stored, 'solid', 'standard'));
      expect(playerBarrelGroups([{ color: stored, pattern: 'solid' }])).toEqual([barrelGroup(stored, 'solid', 'colorblind')]);
      expect(ART_GROUPS.get(barrelGroup(stored, 'solid', 'colorblind'))?.map(d => d.key)).toEqual([barrelKey(stored, 'solid', 'colorblind')]);
    } finally {
      setPlayerPalette('standard');
    }
    // An unknown colour (e.g. from an old save) is drawn as is.
    expect(playerDisplayColor(0x123456, 'colorblind')).toBe(0x123456);
  });
});
