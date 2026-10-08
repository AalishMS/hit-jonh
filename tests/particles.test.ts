import { describe, expect, it } from 'vitest';
import { ParticleSystem } from '../src/fx/particles';

describe('Cosmetic particles', () => {
  it('never exceeds the pool and every particle expires', () => {
    let seed = 1;
    const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const system = new ParticleSystem(40, rng);
    const spawned = system.burst({ kind: 'fx-star', count: 100, x: 0, y: 0, angle: 0, spread: Math.PI * 2, speed: [100, 200], life: [0.2, 0.5], scale: [1, 1], gravity: 500, drag: 2 });
    expect(spawned).toBe(40);
    expect(system.particles.length).toBe(40);
    system.step(0.25);
    for (const p of system.particles) {
      expect(ParticleSystem.fade(p)).toBeGreaterThan(0);
      expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
    }
    system.step(0.3);
    expect(system.particles).toHaveLength(0);
  });

  it('ignores non-positive or invalid time steps', () => {
    const system = new ParticleSystem(4, () => 0.5);
    system.burst({ kind: 'fx-dust', count: 2, x: 5, y: 5, angle: 0, spread: 0, speed: [10, 10], life: [1, 1], scale: [1, 1] });
    system.step(0);
    system.step(Number.NaN);
    expect(system.particles.map(p => p.age)).toEqual([0, 0]);
  });
});
