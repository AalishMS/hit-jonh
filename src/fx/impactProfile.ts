import { FX } from '../config/tuning';

/** Presentation tiers: the full treatment is reserved for real body hits. */
export type HitQuality = 'trick' | 'strong' | 'weak' | 'hat' | 'obstacle' | 'ground';

export interface ImpactProfile {
  quality: HitQuality;
  /** 0..~1.3 overall intensity used to scale particles, text and sound. */
  intensity: number;
  freeze: number;
  slow: number;
  slowScale: number;
  ramp: number;
  shakePx: number;
  shakeSeconds: number;
  zoomPunch: number;
  flashFrames: number;
  particles: number;
  words: readonly string[];
  textColor: 'pow' | 'zap' | 'paper' | null;
  replay: boolean;
}

export function hitQuality(outcome: 'ricochet_body' | 'body' | 'hat_only' | 'miss', impactSpeedMs: number, strongThresholdMs: number): HitQuality {
  if (outcome === 'ricochet_body') return 'trick';
  if (outcome === 'body') return impactSpeedMs >= strongThresholdMs ? 'strong' : 'weak';
  if (outcome === 'hat_only') return 'hat';
  return 'ground';
}

const INTENSITY: Record<HitQuality, number> = { trick: 1.25, strong: 1, weak: 0.72, hat: 0.35, obstacle: 0.2, ground: 0.08 };
const WORDS: Record<HitQuality, readonly string[]> = {
  trick: ['KA-BLAM!', 'TRICK SHOT!'],
  strong: ['WHAM!', 'BONK!', 'KA-POW!'],
  weak: ['BONK!', 'THWACK!', 'BOINK!'],
  hat: ['PLINK!', 'YOINK!'],
  obstacle: [],
  ground: [],
};

export function impactProfile(quality: HitQuality, reducedMotion = false, fx: typeof FX = FX): ImpactProfile {
  const k = INTENSITY[quality];
  const body = quality === 'trick' || quality === 'strong' || quality === 'weak';
  const freeze = quality === 'trick' ? fx.freezeTrick : quality === 'strong' ? fx.freezeStrong
    : quality === 'weak' ? fx.freezeWeak : quality === 'hat' ? fx.freezeHat : 0;
  const profile: ImpactProfile = {
    quality,
    intensity: k,
    freeze,
    slow: body ? fx.slowSeconds * (quality === 'trick' ? 1.3 : quality === 'weak' ? 0.7 : 1) : 0,
    slowScale: fx.slowScale,
    ramp: body ? fx.rampSeconds : 0,
    shakePx: fx.shakePx * k,
    shakeSeconds: fx.shakeSeconds * Math.min(1, 0.45 + k * 0.55),
    zoomPunch: body ? fx.zoomPunch * k : quality === 'hat' ? fx.zoomPunch * 0.25 : 0,
    flashFrames: body ? Math.round(fx.flashFrames) : 0,
    particles: Math.round(fx.particles * k),
    words: WORDS[quality],
    textColor: quality === 'trick' || quality === 'strong' ? 'pow' : quality === 'weak' ? 'zap' : quality === 'hat' ? 'paper' : null,
    replay: body && fx.replay > 0,
  };
  if (!reducedMotion) return profile;
  // Reduced motion: no freeze, slow motion, shake, zoom, flash, flying particles or replay.
  // Comic text and sound remain (text fades in place).
  return { ...profile, freeze: 0, slow: 0, ramp: 0, shakePx: 0, zoomPunch: 0, flashFrames: 0, particles: 0, replay: false };
}

/** Decaying directional shake: mostly along the hit direction, a little across it. */
export function shakeOffset(age: number, amplitude: number, duration: number, hz: number, dirX: number, dirY: number): { x: number; y: number } {
  if (age < 0 || age >= duration || amplitude <= 0) return { x: 0, y: 0 };
  const len = Math.hypot(dirX, dirY) || 1;
  const ux = dirX / len;
  const uy = dirY / len;
  const decay = (1 - age / duration) ** 2;
  const along = Math.sin(2 * Math.PI * hz * age + Math.PI / 2) * amplitude * decay;
  const across = Math.sin(2 * Math.PI * hz * 1.37 * age) * amplitude * 0.3 * decay;
  return { x: ux * along - uy * across, y: uy * along + ux * across };
}
