import { describe, expect, it } from 'vitest';
import { ReplayBuffer, ReplayDirector } from '../src/fx/replay';

describe('Replay buffer', () => {
  it('interpolates recorded samples and clamps outside the range', () => {
    const buffer = new ReplayBuffer(3);
    buffer.push({ t: 0, x: 0, y: 100, vx: 10, vy: 0 });
    buffer.push({ t: 1, x: 10, y: 50, vx: 10, vy: -5 });
    expect(buffer.sampleAt(0.5)).toMatchObject({ x: 5, y: 75, vy: -2.5 });
    expect(buffer.sampleAt(-1)).toMatchObject({ x: 0 });
    expect(buffer.sampleAt(9)).toMatchObject({ x: 10 });
  });

  it('keeps only the most recent seconds and ignores out-of-order samples', () => {
    const buffer = new ReplayBuffer(1);
    for (let i = 0; i <= 600; i++) buffer.push({ t: i / 120, x: i, y: 0, vx: 0, vy: 0 });
    buffer.push({ t: 2, x: -1, y: 0, vx: 0, vy: 0 });
    expect(buffer.endTime).toBeCloseTo(5);
    expect(buffer.startTime!).toBeGreaterThanOrEqual(4 - 1e-9);
    buffer.clear();
    expect(buffer.sampleAt(1)).toBeNull();
  });
});

describe('Replay director', () => {
  const plan = { contactT: 2, lead: 0.6, speed: 0.4, post: 1, postSpeed: 0.6 };

  it('plays the lead-up in slow motion, signals contact once, then runs the reaction', () => {
    for (const hz of [30, 60, 144]) {
      const director = new ReplayDirector(plan);
      let contacts = 0;
      let reaction = 0;
      let lastSim = -Infinity;
      let frame = director.advance(0);
      for (let i = 0; i < hz * 5 && frame.phase !== 'done'; i++) {
        frame = director.advance(1 / hz);
        if (frame.phase === 'pre') {
          expect(frame.simT).toBeGreaterThanOrEqual(lastSim);
          expect(frame.simT).toBeLessThan(plan.contactT);
          lastSim = frame.simT;
        }
        if (frame.contact) contacts++;
        reaction += frame.reactionDt;
      }
      expect(frame.phase).toBe('done');
      expect(contacts).toBe(1);
      expect(director.duration).toBeCloseTo(0.6 / 0.4 + 1);
      expect(reaction).toBeGreaterThan(plan.post * plan.postSpeed - 1 / hz);
      expect(reaction).toBeLessThanOrEqual(plan.post * plan.postSpeed + 1 / hz);
    }
  });
});
