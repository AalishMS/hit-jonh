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

  it('samples between recorded steps linearly and clamps at the ends', () => {
    const points = [{ t: 0, x: 0, y: 0 }, { t: PHYSICS.fixedStepSeconds, x: 10, y: -4 }];
    expect(sampleRecorded(points, PHYSICS.fixedStepSeconds / 2)).toMatchObject({ x: 5, y: -2 });
    expect(sampleRecorded(points, 99)).toMatchObject({ x: 10, y: -4 });
    expect(sampleRecorded(points, -1)).toMatchObject({ x: 0, y: 0 });
  });
});
