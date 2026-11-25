import { describe, expect, it } from 'vitest';
import { coachActive, missHint, showGhostHand, type GhostHandContext } from '../src/rules/coach';
import { COACH } from '../src/config/tuning';

const base: GhostHandContext = { mode: 'solo', daily: false, mapId: 'backyard', firstMapId: 'backyard', totalHits: 0, shotsFired: 0, aimTouched: false };

describe('first-garden coach', () => {
  it('coaches only until the first hit ever', () => {
    expect(coachActive(0)).toBe(true);
    expect(coachActive(1)).toBe(false);
  });

  it('shows the ghost hand on the first garden before a new player touches the aim', () => {
    expect(showGhostHand(base)).toBe(true);
    expect(showGhostHand({ ...base, totalHits: 1 })).toBe(false);
    expect(showGhostHand({ ...base, mapId: 'fence' })).toBe(false);
    expect(showGhostHand({ ...base, daily: true })).toBe(false);
    expect(showGhostHand({ ...base, mode: 'multi' })).toBe(false);
    expect(showGhostHand({ ...base, shotsFired: 1 })).toBe(false);
    expect(showGhostHand({ ...base, aimTouched: true })).toBe(false);
  });

  it('names one fix per miss', () => {
    const at = (category: Parameters<typeof missHint>[0]['category'], powerPercent = 50, blocked = false) => missHint({ category, angleDeg: 45, powerPercent, blocked });
    expect(at('hit')).toBeNull();
    expect(at('short')).toBe('Short. Add power.');
    expect(at('short', COACH.nearFullPowerPercent)).toBe('Short. Aim nearer 45°.');
    expect(at('over')).toBe('Too far. Take off some power.');
    expect(at('over', COACH.nearNoPowerPercent)).toBe('Too far. Change the angle.');
    expect(at('overhead')).toBe('Over his head. Less power.');
    expect(at('fence')).toBe('Blocked by the fence. Aim higher.');
    expect(at('miss', 50, true)).toBe('Blocked. Aim higher to clear it.');
    expect(at('miss')).toBe('Missed. Nudge the angle or power.');
    expect(at('hat')).toMatch(/hat/i);
    // Landing short and rolling into the shed is a short shot, not a blocked one.
    expect(missHint({ category: 'miss', angleDeg: 45, powerPercent: 10, blocked: true, landedBeforeObstacle: true })).toBe('Short. Add power.');
    expect(missHint({ category: 'fence', angleDeg: 45, powerPercent: 95, blocked: true, landedBeforeObstacle: true })).toBe('Short. Aim nearer 45°.');
  });
});
