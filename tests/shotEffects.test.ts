import { describe, expect, it, vi } from 'vitest';
import type Phaser from 'phaser';
import { ShotEffectsRenderer } from '../src/render/shotEffectsRenderer';
import { JUICE, WORLD } from '../src/config/tuning';

function makeEffects() {
  const graphics = {
    setDepth: vi.fn().mockReturnThis(), clear: vi.fn(), destroy: vi.fn(),
    fillStyle: vi.fn(), fillCircle: vi.fn(), fillRect: vi.fn(), fillTriangle: vi.fn(),
  };
  const label = {
    setOrigin: vi.fn().mockReturnThis(), setDepth: vi.fn().mockReturnThis(),
    setVisible: vi.fn().mockReturnThis(), setPosition: vi.fn().mockReturnThis(),
    setAlpha: vi.fn().mockReturnThis(), setScale: vi.fn().mockReturnThis(), destroy: vi.fn(),
  };
  const camera = {
    zoom: 1.2, scrollX: 20, scrollY: 30,
    setZoom(value: number) { this.zoom = value; return this; },
    setScroll(x: number, y: number) { this.scrollX = x; this.scrollY = y; return this; },
  };
  const scene = { add: { graphics: () => graphics, text: () => label }, cameras: { main: camera } };
  return { effects: new ShotEffectsRenderer(scene as unknown as Phaser.Scene), graphics, label, camera };
}

describe('Shot effects lifecycle', () => {
  it('renders a bounded launch cue and returns recoil to zero', () => {
    const { effects, graphics } = makeEffects();
    effects.launch(100, 400, false);
    const recoil = effects.update(JUICE.flashSeconds / 2, false);
    expect(recoil).toBeGreaterThan(0);
    expect(recoil).toBeLessThanOrEqual(JUICE.recoilPixels);
    expect(graphics.fillCircle).toHaveBeenCalledWith(100, 400, JUICE.flashRadiusPx);
    expect(graphics.fillCircle.mock.calls.length).toBeLessThanOrEqual(JUICE.smokeCount + 1);
    expect(effects.update(JUICE.smokeSeconds, false)).toBe(0);
    graphics.fillCircle.mockClear();
    effects.launch(100, 400, true);
    expect(effects.update(0.01, true)).toBe(0);
    expect(graphics.fillCircle).not.toHaveBeenCalled();
  });

  it('restores the original camera on skip/reset, then starts clean', () => {
    const { effects, camera, label } = makeEffects();
    effects.bodyImpact(800, 400);
    effects.update(0.02, false);
    expect(camera.zoom).toBeGreaterThan(1.2);
    effects.reset();
    expect(camera).toMatchObject({ zoom: 1.2, scrollX: 20, scrollY: 30 });
    expect(label.setVisible).toHaveBeenLastCalledWith(false);
    expect(effects.update(0.01, false)).toBe(0);
    effects.bodyImpact(800, 400);
    effects.update(JUICE.zoomSeconds, false);
    expect(camera).toMatchObject({ zoom: 1.2, scrollX: 20, scrollY: 30 });
  });

  it('immediately suppresses moving effects when reduced motion is enabled', () => {
    const { effects, camera, label, graphics } = makeEffects();
    effects.launch(100, 400, false);
    effects.bodyImpact(800, 400);
    effects.update(0.01, false);
    graphics.fillCircle.mockClear(); graphics.fillTriangle.mockClear(); graphics.fillRect.mockClear();
    expect(effects.update(0.01, true)).toBe(0);
    expect(camera).toMatchObject({ zoom: 1.2, scrollX: 20, scrollY: 30 });
    expect(graphics.fillCircle).not.toHaveBeenCalled();
    expect(graphics.fillTriangle).not.toHaveBeenCalled();
    expect(label.setScale).toHaveBeenLastCalledWith(1);
    effects.update(0.01, false);
    expect(camera.zoom).toBe(1.2);
    expect(graphics.fillRect).not.toHaveBeenCalled();
  });

  it('clamps the label and keeps particle work bounded', () => {
    const { effects, label, graphics } = makeEffects();
    effects.bodyImpact(WORLD.designWidthPx + 100, -100);
    expect(label.setPosition).toHaveBeenLastCalledWith(WORLD.designWidthPx - JUICE.labelMarginPx, JUICE.labelSizePx);
    effects.update(0.02, false);
    const count = graphics.fillTriangle.mock.calls.length + graphics.fillCircle.mock.calls.length + graphics.fillRect.mock.calls.length;
    expect(count).toBeLessThanOrEqual(JUICE.burstCount * 2);
    effects.update(JUICE.labelSeconds, false);
    expect(label.setVisible).toHaveBeenLastCalledWith(false);
    effects.destroy();
    expect(graphics.destroy).toHaveBeenCalledOnce();
    expect(label.destroy).toHaveBeenCalledOnce();
  });
});
