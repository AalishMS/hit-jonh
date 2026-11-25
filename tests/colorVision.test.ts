import { describe, expect, it } from 'vitest';
import { PAL, PLAYER_COLORS, hex } from '../src/art/palette';
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
});
