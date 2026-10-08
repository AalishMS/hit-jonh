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

describe('Polish-pass time scaling', () => {
  const profile = { freeze: 0.1, slow: 0.3, slowScale: 0.3, ramp: 0.25 };

  it('integrates freeze → slow → ramp exactly, independent of frame rate', () => {
    const total = (hz: number) => {
      const clock = new ImpactTimeline();
      clock.bodyImpact(false, profile);
      let sum = 0;
      for (let i = 0; i < hz * 2; i++) sum += clock.advance(1 / hz);
      return sum;
    };
    // 2 s real time minus freeze, minus slowed time, minus the ramp's average shortfall.
    const expected = 2 - 0.1 - 0.3 * (1 - 0.3) - 0.25 * (1 - 0.3) / 2;
    for (const hz of [30, 60, 144]) expect(total(hz)).toBeCloseTo(expected, 9);
  });

  it('holds simulation during the cannon wind-up, then passes the leftover through', () => {
    const clock = new ImpactTimeline();
    clock.hold(0.12);
    expect(clock.isHolding).toBe(true);
    expect(clock.advance(0.1)).toBe(0);
    expect(clock.advance(0.05)).toBeCloseTo(0.03);
    expect(clock.isHolding).toBe(false);
    clock.hold(0.2);
    expect(clock.advance(0.05, false, true)).toBe(0.05);
    expect(clock.isHolding).toBe(false);
  });

  it('lets a hat pulse freeze briefly, but never overrides a body impact', () => {
    const clock = new ImpactTimeline();
    clock.pulse({ freeze: 0.05, slow: 0, slowScale: 1 });
    expect(clock.advance(0.05)).toBeCloseTo(0);
    expect(clock.bodyImpact(false, profile)).toBe(true);
    clock.pulse({ freeze: 1, slow: 0, slowScale: 1 });
    expect(clock.advance(0.1)).toBeCloseTo(0);
    expect(clock.advance(0.1)).toBeCloseTo(0.03);
  });

  it('steps physics the same number of times with and without effects once settled', () => {
    for (const hz of [30, 60, 144]) {
      const clock = new ImpactTimeline();
      const stepper = new FixedStepper(PHYSICS.fixedStepSeconds, PHYSICS.maxStepsPerFrame);
      clock.hold(0.12);
      let steps = 0;
      for (let i = 0; i < hz * 3; i++) steps += stepper.advance(clock.advance(1 / hz));
      expect(steps).toBe(Math.floor((3 - 0.12) / PHYSICS.fixedStepSeconds + 1e-6));
    }
  });
});
