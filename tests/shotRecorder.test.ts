import { describe, expect, it } from 'vitest';
import { MAPS } from '../src/levels';
import { PHYSICS } from '../src/config/tuning';
import { recordShot, sampleRecorded } from '../src/physics/shotRecorder';
import { runHeadlessShot } from '../src/physics/headlessShot';

describe('shot recorder (title-screen demo shots)', () => {
  for (const level of MAPS) {
    it(`${level.id}: the recorded reference shot reaches Jonh's body, matching the headless runner`, () => {
      const aim = level.referenceSolutions[0]!;
      const shot = recordShot(level, aim.angleDeg, aim.powerPercent);
      expect(shot.contactIndex).not.toBeNull();
      const official = runHeadlessShot(level, aim.angleDeg, aim.powerPercent);
      expect(shot.trick).toBe(official.outcome === 'ricochet_body');
      expect(shot.points[shot.contactIndex!]!.t).toBeCloseTo(shot.contactIndex! * PHYSICS.fixedStepSeconds, 9);
    });
  }

  it('records the mechanic events a replay must show: a smash in the greenhouse, a hoop on the magic act', () => {
    const kinds = (id: string) => {
      const level = MAPS.find(m => m.id === id)!;
      const aim = level.referenceSolutions[0]!;
      const shot = recordShot(level, aim.angleDeg, aim.powerPercent);
      expect(shot.contactIndex).not.toBeNull();
      for (const e of shot.events) expect(e.t).toBeLessThanOrEqual(shot.points[shot.contactIndex!]!.t);
      return shot.events.flatMap(e => e.events.map(ev => ev.kind));
    };
    expect(kinds('greenhouse')).toContain('break');
    expect(kinds('magic')).toContain('portal');
    expect(kinds('backyard')).toEqual([]);
  });

  it('samples between recorded steps linearly and clamps at the ends', () => {
    const points = [{ t: 0, x: 0, y: 0 }, { t: PHYSICS.fixedStepSeconds, x: 10, y: -4 }];
    expect(sampleRecorded(points, PHYSICS.fixedStepSeconds / 2)).toMatchObject({ x: 5, y: -2 });
    expect(sampleRecorded(points, 99)).toMatchObject({ x: 10, y: -4 });
    expect(sampleRecorded(points, -1)).toMatchObject({ x: 0, y: 0 });
  });
});
