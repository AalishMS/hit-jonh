import { describe, expect, it, vi } from 'vitest';
import type Phaser from 'phaser';
import { MECHANIC_FX_ART, brokenKey } from '../src/art/mechanicArt';
import { FX_ART } from '../src/art/fxArt';
import { obstacleKey, sceneryArt } from '../src/art/sceneryArt';
import { GREENHOUSE_LEVEL, MAGIC_LEVEL, MAPS } from '../src/levels';
import type { ProjectileState } from '../src/physics/matterAdapter';
import { registerArtMeta } from '../src/render/artTextures';
import { MechanicsRenderer } from '../src/render/mechanicsRenderer';

registerArtMeta([...FX_ART, ...MECHANIC_FX_ART, ...sceneryArt(MAPS, 50)]);

function mockImage(key: string) {
  const o: Record<string, unknown> = { visible: true, alpha: 1, scaleX: 1, texture: { key } };
  const chain = (name: string, fn?: (...args: unknown[]) => void) => { o[name] = vi.fn((...args: unknown[]) => { fn?.(...args); return o; }); };
  chain('setVisible', v => { o.visible = v; });
  chain('setAlpha', v => { o.alpha = v; });
  chain('setScale', v => { o.scaleX = v; });
  chain('setTexture', k => { (o.texture as { key: string }).key = k as string; });
  for (const n of ['setDepth', 'setOrigin', 'setPosition', 'setRotation']) chain(n);
  o.destroy = vi.fn();
  return o as Record<string, ReturnType<typeof vi.fn>> & { visible: boolean; alpha: number; texture: { key: string } };
}

function makeRenderer() {
  const images: ReturnType<typeof mockImage>[] = [];
  const scene = { add: { image: (_x: number, _y: number, key: string) => { const i = mockImage(key); images.push(i); return i; } } };
  const sounds = { playGlassBreak: vi.fn(), playPortal: vi.fn() };
  const renderer = new MechanicsRenderer(scene as unknown as Phaser.Scene, 50, 560, () => 0.5);
  return { renderer, images, sounds };
}

const state = (events: ProjectileState['events']): ProjectileState => ({
  xSim: 14, ySim: 4.4, xPx: 700, yPx: 340, vxSim: 5, vySim: -1, speedMs: 5.1, hitJonh: false, hitHat: false, hitGround: false,
  passedOverhead: false, impactSpeedMs: 0, firstGroundContact: null, obstacleContacts: [], hadRicochetBeforeBody: false,
  brokenObstacleIds: [], portalsUsed: [], events,
});

const flying = (images: ReturnType<typeof mockImage>[]) => images.filter(i => (i.texture.key === 'fx-shard' || i.texture.key === 'fx-magic' || i.texture.key === 'fx-dust') && i.visible && (i.setPosition?.mock.calls.length ?? 0) > 0);

describe('Mechanics renderer', () => {
  it('draws every pane, smashes the one that broke, and restores it on reset', () => {
    const { renderer, images, sounds } = makeRenderer();
    renderer.draw(GREENHOUSE_LEVEL);
    const paneObstacles = GREENHOUSE_LEVEL.obstacles.filter(o => o.breakable);
    const front = paneObstacles.find(o => o.id === 'pane-front')!;
    const frontKey = obstacleKey('greenhouse', front);
    const frontImage = images.find(i => i.texture.key === frontKey)!;
    expect(images.filter(i => paneObstacles.some(o => obstacleKey('greenhouse', o) === i.texture.key))).toHaveLength(paneObstacles.length);
    expect(images.some(i => i.texture.key === 'backdrop-greenhouse')).toBe(true);

    expect(renderer.onStep(state([]), false, sounds)).toBe(false);
    expect(renderer.onStep(state([{ kind: 'break', id: 'pane-front', xPx: 700, yPx: 340, impactSpeedMs: 9 }]), false, sounds)).toBe(true);
    expect(frontImage.texture.key).toBe(brokenKey(frontKey));
    expect(renderer.isBroken('pane-front')).toBe(true);
    expect(sounds.playGlassBreak).toHaveBeenCalledOnce();
    renderer.update(1 / 60, false);
    expect(flying(images).length).toBeGreaterThan(0);

    renderer.reset();
    expect(frontImage.texture.key).toBe(frontKey);
    expect(renderer.isBroken('pane-front')).toBe(false);
    expect(flying(images)).toHaveLength(0);
  });

  it('reduced motion: the pane still shows smashed, but nothing flies', () => {
    const { renderer, images, sounds } = makeRenderer();
    renderer.draw(GREENHOUSE_LEVEL);
    renderer.onStep(state([{ kind: 'break', id: 'pane-roof-2', xPx: 850, yPx: 300, impactSpeedMs: 7 }]), true, sounds);
    renderer.update(1 / 60, true);
    expect(renderer.isBroken('pane-roof-2')).toBe(true);
    expect(flying(images)).toHaveLength(0);
    expect(sounds.playGlassBreak).toHaveBeenCalledOnce();
  });

  it('a used hoop goes dim until the next attempt, with sparkles and a fwoop', () => {
    const { renderer, images, sounds } = makeRenderer();
    renderer.draw(MAGIC_LEVEL);
    const [entrySwirl] = images.filter(i => i.texture.key === 'portal-swirl');
    expect(entrySwirl!.alpha).toBe(1);
    const event = { kind: 'portal' as const, id: 'hoops', entryXPx: 400, entryYPx: 235, exitXPx: 1180, exitYPx: 400 };
    expect(renderer.onStep(state([event]), false, sounds)).toBe(true);
    expect(sounds.playPortal).toHaveBeenCalledOnce();
    for (let i = 0; i < 30; i++) renderer.update(1 / 60, false);
    expect(renderer.isSpent('hoops')).toBe(true);
    expect(entrySwirl!.alpha).toBeCloseTo(0.22, 2);
    renderer.reset();
    expect(renderer.isSpent('hoops')).toBe(false);
    expect(entrySwirl!.alpha).toBe(1);

    // Reduced motion: dim at once, no sparkles.
    renderer.onStep(state([event]), true, sounds);
    renderer.update(1 / 60, true);
    expect(entrySwirl!.alpha).toBeCloseTo(0.22, 2);
    expect(flying(images)).toHaveLength(0);
  });

  it('draws nothing for maps without mechanics', () => {
    const { renderer, images } = makeRenderer();
    renderer.draw(MAPS[0]!);
    expect(images).toHaveLength(0);
    expect(renderer.onStep(state([]), false)).toBe(false);
    renderer.update(1 / 60, false);
    renderer.destroy();
  });
});
