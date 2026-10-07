import { describe, expect, it } from 'vitest';
import { hitQuality, impactProfile, shakeOffset, type HitQuality } from '../src/fx/impactProfile';
import { FX } from '../src/config/tuning';

const ORDER: HitQuality[] = ['trick', 'strong', 'weak', 'hat', 'obstacle', 'ground'];

describe('Impact profile scales by hit quality', () => {
  it('maps classified outcomes and impact speed to tiers', () => {
    expect(hitQuality('ricochet_body', 3, 10)).toBe('trick');
    expect(hitQuality('body', 12, 10)).toBe('strong');
    expect(hitQuality('body', 9.9, 10)).toBe('weak');
    expect(hitQuality('hat_only', 20, 10)).toBe('hat');
    expect(hitQuality('miss', 20, 10)).toBe('ground');
  });

  it('keeps the big effects special: every layer is non-increasing down the tiers', () => {
    const profiles = ORDER.map(q => impactProfile(q));
    for (let i = 1; i < profiles.length; i++) {
      const a = profiles[i - 1]!;
      const b = profiles[i]!;
      expect(b.intensity).toBeLessThanOrEqual(a.intensity);
      expect(b.freeze).toBeLessThanOrEqual(a.freeze);
      expect(b.shakePx).toBeLessThanOrEqual(a.shakePx);
      expect(b.particles).toBeLessThanOrEqual(a.particles);
      expect(b.zoomPunch).toBeLessThanOrEqual(a.zoomPunch);
    }
    expect(impactProfile('hat').slow).toBe(0);
    expect(impactProfile('hat').flashFrames).toBe(0);
    expect(impactProfile('ground').words).toHaveLength(0);
    expect(impactProfile('strong').replay).toBe(FX.replay > 0);
    expect(impactProfile('hat').replay).toBe(false);
  });

  it('drops freeze, slow motion, shake, zoom, flash, particles and replay for reduced motion', () => {
    for (const q of ORDER) {
      const p = impactProfile(q, true);
      expect(p).toMatchObject({ freeze: 0, slow: 0, ramp: 0, shakePx: 0, zoomPunch: 0, flashFrames: 0, particles: 0, replay: false });
      expect(p.words).toEqual(impactProfile(q).words);
    }
  });

  it('shakes mostly along the hit direction, bounded, and decays to rest', () => {
    const first = shakeOffset(0, 10, 0.4, 20, 1, 0);
    expect(first.x).toBeCloseTo(10);
    expect(first.y).toBeCloseTo(0);
    for (let t = 0; t < 0.4; t += 0.005) {
      const o = shakeOffset(t, 10, 0.4, 20, 3, 4);
      expect(Math.hypot(o.x, o.y)).toBeLessThanOrEqual(10 * Math.hypot(1, 0.3) + 1e-9);
    }
    expect(shakeOffset(0.4, 10, 0.4, 20, 1, 0)).toEqual({ x: 0, y: 0 });
    expect(Math.abs(shakeOffset(0.39, 10, 0.4, 20, 1, 0).x)).toBeLessThan(0.1);
  });
});
