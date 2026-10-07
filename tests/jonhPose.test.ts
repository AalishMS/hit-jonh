import { describe, expect, it } from 'vitest';
import { HIT_TIMING, RIG, jonhPose, squashAmount, type ReactionKind } from '../src/fx/jonhPose';
import { BACKYARD_LEVEL } from '../src/levels';

const SAMPLES = Array.from({ length: 300 }, (_, i) => i / 100);

describe('Jonh pose rig', () => {
  it('makes the contact frame the most extreme squash of a body hit', () => {
    for (const strength of ['weak', 'strong', 'trick'] as const) {
      const first = squashAmount(jonhPose({ kind: 'hit', t: 0, idleT: 0, strength, room: 200 }));
      for (const t of SAMPLES.slice(1)) {
        expect(squashAmount(jonhPose({ kind: 'hit', t, idleT: 0, strength, room: 200 }))).toBeLessThanOrEqual(first + 1e-9);
      }
      expect(first).toBeGreaterThan(0.25);
    }
  });

  it('detaches the hat and paper on the contact frame and shows the shocked face', () => {
    const pose = jonhPose({ kind: 'hit', t: 0, idleT: 3, strength: 'strong', room: 200 });
    expect(pose.hat.attached).toBe(false);
    expect(pose.paper.attached).toBe(false);
    expect(pose.face).toBe('shock');
    expect(pose.smear).toBe(1);
  });

  it('never knocks Jonh further than the free room on his support surface', () => {
    for (const room of [0, 30, 60, 140]) {
      for (const t of SAMPLES) {
        const pose = jonhPose({ kind: 'hit', t, idleT: 0, strength: 'trick', room });
        expect(pose.body.x).toBeLessThanOrEqual(Math.max(room, 30) + 6.0001);
      }
    }
  });

  it('mirrors the knock-back when the ball travels left', () => {
    const right = jonhPose({ kind: 'hit', t: 1, idleT: 0, strength: 'strong', room: 200, dir: 1 });
    const left = jonhPose({ kind: 'hit', t: 1, idleT: 0, strength: 'strong', room: 200, dir: -1 });
    expect(right.body.x).toBeGreaterThan(0);
    expect(left.body.x).toBeCloseTo(-right.body.x);
    expect(left.body.rot).toBeCloseTo(-right.body.rot);
  });

  it('lands, gets dizzy, then annoyed, in that order', () => {
    const at = (t: number) => jonhPose({ kind: 'hit', t, idleT: 0, strength: 'strong', room: 200 });
    expect(at(0.1).stars).toBe(0);
    expect(at(HIT_TIMING.starsFrom + 0.2).stars).toBe(1);
    expect(at(HIT_TIMING.strongAir + 0.1).face).toBe('dazed');
    expect(at(HIT_TIMING.annoyedFrom + 0.1).face).toBe('annoyed');
    // Settled lying pose: rotated a quarter turn (plus whole spins), resting on the ground.
    const rest = at(3);
    expect(Math.abs(((rest.body.rot % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) - Math.PI / 2)).toBeLessThan(0.01);
    expect(rest.body.y).toBeCloseTo(RIG.lyingLift);
  });

  it('keeps every reaction finite and the hat on his head while idle', () => {
    const kinds: ReactionKind[] = ['idle', 'hit', 'hat', 'duck', 'smug', 'wince', 'glare'];
    for (const kind of kinds) {
      for (const t of SAMPLES) {
        const pose = jonhPose({ kind, t, idleT: t * 3, strength: 'strong', room: 120, aware: t > 1, alarm: t % 1 });
        for (const v of [pose.body.x, pose.body.y, pose.body.rot, pose.body.sx, pose.body.sy, pose.armFront, pose.armBack, pose.legs, pose.chair.y]) {
          expect(Number.isFinite(v)).toBe(true);
        }
      }
    }
    for (const t of SAMPLES) expect(jonhPose({ kind: 'idle', t: 0, idleT: t * 5 }).hat.attached).toBe(true);
  });

  it('draws the resting hat over the hat sensor', () => {
    const hat = BACKYARD_LEVEL.jonhSpawn.hatBox!;
    const body = BACKYARD_LEVEL.jonhSpawn.bodyBox;
    const ppm = 50;
    const sensorTopPx = -(hat.maxY - body.minY) * ppm;
    const sensorBottomPx = -(hat.minY - body.minY) * ppm;
    expect(RIG.hatRest.y).toBeGreaterThanOrEqual(sensorTopPx);
    expect(RIG.hatRest.y).toBeLessThanOrEqual(sensorBottomPx + 2);
    expect(Math.abs(RIG.hatRest.x)).toBeLessThanOrEqual(((hat.maxX - hat.minX) / 2) * ppm);
  });

  it('flies the hat off on a hat-only hit while Jonh stays seated', () => {
    const pose = jonhPose({ kind: 'hat', t: 0.4, idleT: 0, dir: 1 });
    expect(pose.hat.attached).toBe(false);
    expect(pose.paper.attached).toBe(true);
    expect(pose.body.x).toBe(0);
    expect(pose.body.rot).toBe(0);
  });
});
