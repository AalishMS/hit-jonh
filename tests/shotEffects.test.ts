import { describe, expect, it, vi } from 'vitest';
import type Phaser from 'phaser';
import { ShotEffectsRenderer } from '../src/render/shotEffectsRenderer';
import { registerArtMeta } from '../src/render/artTextures';
import { FX_ART } from '../src/art/fxArt';
import { FX } from '../src/config/tuning';
import { impactProfile } from '../src/fx/impactProfile';

registerArtMeta(FX_ART);

function mockObject() {
  const o: Record<string, unknown> = { visible: false, alpha: 1, scaleX: 1, width: 120, height: 60, texture: { key: '' } };
  const chain = (name: string, fn?: (...args: unknown[]) => void) => {
    o[name] = vi.fn((...args: unknown[]) => { fn?.(...args); return o; });
  };
  chain('setVisible', v => { o.visible = v; });
  chain('setAlpha', v => { o.alpha = v; });
  chain('setScale', v => { o.scaleX = v; });
  for (const n of ['setDepth', 'setOrigin', 'setPosition', 'setRotation', 'setScrollFactor', 'setResolution', 'setText', 'setColor', 'setFontSize']) chain(n);
  chain('setTexture', k => { (o.texture as { key: string }).key = k as string; });
  o.destroy = vi.fn();
  return o as Record<string, ReturnType<typeof vi.fn>> & { visible: boolean; alpha: number; scaleX: number };
}

function makeEffects() {
  const images: ReturnType<typeof mockObject>[] = [];
  const flash = mockObject();
  const label = mockObject();
  const camera = { zoom: 1, scrollX: 0, scrollY: 0, worldView: { x: 0, y: 0, right: 1280, bottom: 560 } };
  const scene = {
    add: {
      image: () => { const i = mockObject(); images.push(i); return i; },
      rectangle: () => flash,
      text: () => label,
    },
    cameras: { main: camera },
  };
  const effects = new ShotEffectsRenderer(scene as unknown as Phaser.Scene, () => 0.5);
  // Construction order: ring, star, muzzle, then the particle pool.
  const [ring, star, muzzle, ...pool] = images;
  return { effects, flash, label, camera, ring: ring!, star: star!, muzzle: muzzle!, pool };
}

const visibleParticles = (pool: ReturnType<typeof mockObject>[]) => pool.filter(p => p.visible).length;

describe('Shot effects', () => {
  it('fires flash, contact star, ring, burst and comic word on the contact frame itself', () => {
    const { effects, flash, star, ring, label, pool } = makeEffects();
    effects.impact(800, 400, impactProfile('strong'), 1, 0.2, false, 'BONK!');
    expect(flash.visible).toBe(true);
    expect(flash.alpha).toBeCloseTo(FX.flashAlpha);
    expect(star.visible).toBe(true);
    expect(ring.visible).toBe(true);
    expect(label.visible).toBe(true);
    expect(effects.particleCount).toBeGreaterThan(0);
    effects.update(0, false, 1 / 60);
    expect(visibleParticles(pool)).toBe(effects.particleCount);
    // Flash lasts the configured number of rendered frames, then clears.
    for (let i = 0; i < 4; i++) effects.update(1 / 60, false, 1 / 60);
    expect(flash.visible).toBe(false);
  });

  it('keeps the camera untouched (the camera rig owns shake and zoom)', () => {
    const { effects, camera } = makeEffects();
    effects.impact(800, 400, impactProfile('trick'), 1, 0, false, 'KA-BLAM!');
    for (let i = 0; i < 30; i++) effects.update(1 / 60, false, 1 / 60);
    expect(camera).toMatchObject({ zoom: 1, scrollX: 0, scrollY: 0 });
  });

  it('shows only the comic word under reduced motion and settles moving effects immediately', () => {
    const { effects, flash, star, label, pool } = makeEffects();
    effects.impact(800, 400, impactProfile('strong', true), 1, 0, true, 'BONK!');
    effects.update(1 / 60, true, 1 / 60);
    expect(flash.visible).toBe(false);
    expect(star.visible).toBe(false);
    expect(visibleParticles(pool)).toBe(0);
    expect(label.visible).toBe(true);
    expect(label.setScale).toHaveBeenLastCalledWith(1);

    const second = makeEffects();
    second.effects.launch(100, 400, 0.7, false);
    second.effects.impact(800, 400, impactProfile('strong'), 1, 0, false, 'BONK!');
    expect(second.effects.update(1 / 60, true, 1 / 60)).toBe(0);
    expect(second.effects.particleCount).toBe(0);
    expect(second.star.visible).toBe(false);
  });

  it('bounds particle work by the pool and lets recoil return to rest', () => {
    const { effects } = makeEffects();
    for (let i = 0; i < 10; i++) effects.impact(800, 400, impactProfile('trick'), 1, 0, false, 'KA-BLAM!');
    expect(effects.particleCount).toBeLessThanOrEqual(96);
    effects.launch(100, 400, 0.8, false);
    const recoil = effects.update(1 / 60, false, 1 / 60);
    expect(recoil).toBeGreaterThan(0);
    expect(recoil).toBeLessThanOrEqual(FX.recoilPx);
    let last = recoil;
    for (let i = 0; i < 40; i++) last = effects.update(1 / 60, false, 1 / 60);
    expect(last).toBe(0);
  });

  it('reset hides everything and destroy releases every object', () => {
    const { effects, flash, star, ring, muzzle, label, pool } = makeEffects();
    effects.launch(100, 400, 0.8, false);
    effects.impact(800, 400, impactProfile('strong'), 1, 0, false, 'BONK!');
    effects.reset();
    expect([flash, star, ring, muzzle, label].every(o => !o.visible)).toBe(true);
    expect(effects.particleCount).toBe(0);
    expect(visibleParticles(pool)).toBe(0);
    effects.destroy();
    expect(flash.destroy).toHaveBeenCalledOnce();
    expect(label.destroy).toHaveBeenCalledOnce();
    expect(pool.every(p => p.destroy!.mock.calls.length === 1)).toBe(true);
  });
});
