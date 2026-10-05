import { describe, expect, it } from 'vitest';
import { ImpactTimeline } from '../src/render/impactTimeline';
import { AutoAdvance } from '../src/rules/autoAdvance';
import { FixedStepper } from '../src/sim/fixedStep';
import { JUICE, PHYSICS } from '../src/config/tuning';

describe('Impact presentation clock', () => {
  it('leaves flight unchanged and starts only once per shot', () => {
    const clock = new ImpactTimeline();
    expect(clock.advance(0.1)).toBe(0.1);
    expect(clock.bodyImpact()).toBe(true);
    clock.advance(0.04);
    expect(clock.bodyImpact()).toBe(false);
    expect(clock.age).toBe(0.04);
    clock.reset();
    expect(clock.age).toBeNull();
    expect(clock.advance(0.1)).toBe(0.1);
    expect(clock.bodyImpact()).toBe(true);
  });

  it('integrates a frame crossing both timing boundaries', () => {
    const clock = new ImpactTimeline();
    clock.bodyImpact();
    expect(clock.advance(0.5)).toBeCloseTo(JUICE.slowSeconds * JUICE.slowScale + 0.18);
  });

  it('freezes on pause and settles immediately for reduced motion', () => {
    const clock = new ImpactTimeline();
    clock.bodyImpact();
    expect(clock.advance(0.04)).toBe(0);
    expect(clock.advance(10, true)).toBe(0);
    expect(clock.age).toBe(0.04);
    expect(clock.advance(0.04)).toBeCloseTo(0);
    expect(clock.advance(0.1, false, true)).toBe(0.1);
    expect(clock.age).toBeNull();
    expect(clock.bodyImpact()).toBe(false);
    clock.reset();
    clock.bodyImpact(true);
    expect(clock.advance(0.1)).toBe(0.1);
  });

  for (const hz of [30, 60, 144]) {
    it(`preserves boundaries, fixed dt and the real-time result window at ${hz} Hz`, () => {
      const clock = new ImpactTimeline();
      const stepper = new FixedStepper(PHYSICS.fixedStepSeconds, PHYSICS.maxStepsPerFrame);
      const timer = new AutoAdvance();
      clock.bodyImpact();
      timer.schedule('shot', 1.4);
      let elapsed = 0;
      let scaled = 0;
      let steps = 0;
      let action: ReturnType<AutoAdvance['advance']> = null;
      while (elapsed < 1.4 - 1e-9) {
        const dt = Math.min(1 / hz, 1.4 - elapsed);
        const adjusted = clock.advance(dt);
        scaled += adjusted;
        steps += stepper.advance(adjusted);
        action = timer.advance(dt);
        elapsed += dt;
        if (elapsed < 1.4 - 1e-9) expect(action).toBeNull();
      }
      expect(scaled).toBeCloseTo(1.4 - JUICE.freezeSeconds - JUICE.slowSeconds * (1 - JUICE.slowScale));
      expect(steps).toBe(Math.floor(scaled / PHYSICS.fixedStepSeconds + 1e-9));
      expect(action).toBe('shot');
    });
  }
});
