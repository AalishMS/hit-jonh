import { describe, expect, it } from 'vitest';
import { AUDIO, WIND } from '../src/config/tuning';
import { gustPlan, gustTimeline, windBedFilters, windBedLevel, windStrength } from '../src/audio/windSound';
import { WASHDAY_LEVEL } from '../src/levels';

describe('wind bed maths', () => {
  it('is silent in calm air, and louder and brighter as the windsock lifts', () => {
    expect(windBedLevel(0)).toBe(0);
    const levels = [0.5, 1, 2, 3, 4, WIND.sockFlatMs2].map(windBedLevel);
    for (let i = 1; i < levels.length; i++) expect(levels[i]!).toBeGreaterThan(levels[i - 1]!);
    expect(windBedLevel(-WIND.sockFlatMs2)).toBeCloseTo(AUDIO.wind.bedGain, 9);
    expect(windBedLevel(-0.5)).toBeGreaterThan(AUDIO.wind.bedGain * AUDIO.wind.floor * 0.99);
    expect(windBedLevel(-3)).toBe(windBedLevel(3)); // direction does not matter for loudness
    expect(windBedLevel(-8)).toBeCloseTo(windBedLevel(-WIND.sockFlatMs2), 9); // saturates like the sock
    expect(windBedFilters(-5).airHz).toBeGreaterThan(windBedFilters(-1).airHz);
    expect(windBedFilters(-5).rumbleHz).toBeGreaterThan(windBedFilters(-1).rumbleHz);
    expect(windStrength(-3)).toBeCloseTo(WIND.sockFlatMs2 ? 3 / WIND.sockFlatMs2 : 0, 9);
  });

  it("plays on Windy Washday's wind strength", () => {
    expect(windBedLevel(WASHDAY_LEVEL.wind!.accelerationMs2)).toBeGreaterThan(0);
  });

  it('plans gusts deterministically, within the tuned ranges', () => {
    for (const a of [-1, -3, -5]) {
      for (let i = 0; i < 20; i++) {
        const plan = gustPlan(i, a);
        expect(gustPlan(i, a)).toEqual(plan);
        expect(plan.gapSeconds).toBeGreaterThan(0.5);
        expect(plan.swellSeconds).toBeGreaterThan(0.3);
        expect(plan.fadeSeconds).toBeGreaterThan(plan.swellSeconds * 0.8);
        expect(plan.lift).toBeGreaterThan(0);
        expect(plan.lift).toBeLessThanOrEqual(AUDIO.wind.gustLift * 1.25);
      }
    }
    expect(gustPlan(0, -3).gapSeconds).toBeLessThanOrEqual(AUDIO.wind.firstGustSeconds * 2);
  });

  it('a stronger wind gusts more often and harder', () => {
    const count = (a: number) => gustTimeline(0, 120, a).length;
    expect(count(-5)).toBeGreaterThan(count(-1));
    const meanLift = (a: number) => { const g = gustTimeline(0, 120, a); return g.reduce((s, x) => s + x.lift, 0) / g.length; };
    expect(meanLift(-5)).toBeGreaterThan(meanLift(-1));
  });

  it('lays gusts out in order without overlap, starting after the first gap', () => {
    const gusts = gustTimeline(10, 90, -3);
    expect(gusts.length).toBeGreaterThan(5);
    expect(gusts[0]!.start).toBeGreaterThanOrEqual(10 + AUDIO.wind.firstGustSeconds);
    gusts.forEach((g, i) => {
      expect(g.peak).toBeGreaterThan(g.start);
      expect(g.end).toBeGreaterThan(g.peak);
      if (i > 0) expect(g.start).toBeGreaterThan(gusts[i - 1]!.end);
      expect(g.start).toBeLessThan(90);
    });
    // Resuming from the next index continues the same sequence.
    const cont = gustTimeline(gusts[0]!.end, 90, -3, 1);
    expect(cont[0]!.start).toBeCloseTo(gusts[1]!.start, 9);
  });
});
