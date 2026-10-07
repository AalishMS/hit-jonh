/** Tiny pure particle simulation for cosmetic effects (driven by pause-aware presentation time). */

export interface Particle {
  kind: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vr: number;
  age: number;
  life: number;
  scale: number;
  /** Scale multiplier reached at end of life (puffs grow, sparks shrink). */
  endScale: number;
  gravity: number;
  drag: number;
  /** Paper scraps sway sideways as they fall. */
  sway: number;
}

export interface BurstSpec {
  kind: string;
  count: number;
  x: number;
  y: number;
  /** Centre direction in radians and spread (full cone width); spread 2π for radial. */
  angle: number;
  spread: number;
  speed: [number, number];
  life: [number, number];
  scale: [number, number];
  endScale?: number;
  gravity?: number;
  drag?: number;
  spin?: number;
  sway?: number;
}

export class ParticleSystem {
  readonly particles: Particle[] = [];

  constructor(readonly max = 96, private readonly rng: () => number = Math.random) {}

  burst(spec: BurstSpec): number {
    let spawned = 0;
    for (let i = 0; i < spec.count && this.particles.length < this.max; i++) {
      const r = this.rng;
      const a = spec.angle + (r() - 0.5) * spec.spread;
      const speed = spec.speed[0] + r() * (spec.speed[1] - spec.speed[0]);
      this.particles.push({
        kind: spec.kind,
        x: spec.x,
        y: spec.y,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed,
        rot: r() * Math.PI * 2,
        vr: (r() - 0.5) * 2 * (spec.spin ?? 0),
        age: 0,
        life: spec.life[0] + r() * (spec.life[1] - spec.life[0]),
        scale: spec.scale[0] + r() * (spec.scale[1] - spec.scale[0]),
        endScale: spec.endScale ?? 1,
        gravity: spec.gravity ?? 0,
        drag: spec.drag ?? 0,
        sway: spec.sway ?? 0,
      });
      spawned++;
    }
    return spawned;
  }

  step(dt: number): void {
    if (!(dt > 0)) return;
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i]!;
      p.age += dt;
      if (p.age >= p.life) { this.particles.splice(i, 1); continue; }
      const damp = Math.exp(-p.drag * dt);
      p.vx *= damp;
      p.vy = p.vy * damp + p.gravity * dt;
      p.x += (p.vx + (p.sway ? Math.sin(p.age * 7 + p.rot) * p.sway : 0)) * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
    }
  }

  /** 0..1 remaining life. */
  static fade(p: Particle): number { return Math.max(0, 1 - p.age / p.life); }
  static currentScale(p: Particle): number { return p.scale * (1 + (p.endScale - 1) * (p.age / p.life)); }

  clear(): void { this.particles.length = 0; }
}
