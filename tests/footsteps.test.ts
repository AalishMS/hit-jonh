import { describe, expect, it } from 'vitest';
import { FootstepTracker, plantsUpTo } from '../src/audio/footsteps';
import { AUDIO, JONH_WALK, PHYSICS } from '../src/config/tuning';
import { routeLegs, routePoseAtStep } from '../src/levels/jonhRoute';
import { STROLL_LEVEL } from '../src/levels';

const route = STROLL_LEVEL.jonhRoute!;
const dt = PHYSICS.fixedStepSeconds;
const half = JONH_WALK.strideMetres / 2;

/** Seconds after Fire of every foot-plant, stepping the route clock one fixed step at a time. */
function plantTimes(lastStep: number, tracker = new FootstepTracker()): Array<{ t: number; foot: 0 | 1 }> {
  const out: Array<{ t: number; foot: 0 | 1 }> = [];
  for (let step = 0; step <= lastStep; step++) {
    for (const foot of tracker.update(routePoseAtStep(route, step))) out.push({ t: step * dt, foot });
  }
  return out;
}

describe('footstep timing (derived from the walk cycle)', () => {
  it('counts one plant per half stride, the first at plantPhase', () => {
    const s = JONH_WALK.strideMetres;
    expect(plantsUpTo(0)).toBe(0);
    expect(plantsUpTo(AUDIO.footstep.plantPhase * s - 0.001)).toBe(0);
    expect(plantsUpTo(AUDIO.footstep.plantPhase * s + 0.001)).toBe(1);
    expect(plantsUpTo(AUDIO.footstep.plantPhase * s + half + 0.001)).toBe(2);
    expect(plantsUpTo(10 * s + 0.001)).toBe(plantsUpTo(9 * s + 0.001) + 2);
  });

  it('on the stroll route: silent while he waits, even steps while he walks, silent in the pause', () => {
    const legs = routeLegs(route);
    const walks = legs.filter(l => l.walking);
    const total = Math.ceil((walks[walks.length - 1]!.end + 1) / dt);
    const plants = plantTimes(total);
    const [first, second] = walks as [typeof walks[0], typeof walks[0]];
    // Nothing before the first walk, nothing between the walks, nothing after the last.
    expect(plants.filter(p => p.t < first!.start)).toHaveLength(0);
    expect(plants.filter(p => p.t > first!.end + dt && p.t < second!.start)).toHaveLength(0);
    expect(plants.filter(p => p.t > second!.end + dt)).toHaveLength(0);
    // During the first walk: one plant per half stride of walking, evenly spaced in time.
    const firstWalk = plants.filter(p => p.t >= first!.start && p.t <= first!.end + dt);
    expect(firstWalk.length).toBe(Math.floor((first!.to.dx - first!.from.dx) / half - AUDIO.footstep.plantPhase * 2) + 1);
    const speed = Math.hypot(first!.to.dx - first!.from.dx, first!.to.dy - first!.from.dy) / (first!.end - first!.start);
    for (let i = 1; i < firstWalk.length; i++) expect(firstWalk[i]!.t - firstWalk[i - 1]!.t).toBeCloseTo(half / speed, 1);
    // Feet alternate.
    const all = plants.map(p => p.foot);
    all.forEach((f, i) => { if (i > 0) expect(f).not.toBe(all[i - 1]); });
    // The second walk's steps start over from the distance walked so far, not from zero.
    expect(plants.length).toBe(plantsUpTo(walks.reduce((m, l) => m + Math.hypot(l.to.dx - l.from.dx, l.to.dy - l.from.dy), 0)));
  });

  it('stops the moment he stops (a hit freezes the route step), and a replay re-walks identical steps', () => {
    const stopStep = Math.round(2.0 / dt); // hit two seconds after Fire
    const clamped = new FootstepTracker();
    const heard: number[] = [];
    for (let step = 0; step < stopStep + 600; step++) {
      if (clamped.update(routePoseAtStep(route, Math.min(step, stopStep))).length > 0) heard.push(step * dt);
    }
    expect(heard.length).toBeGreaterThan(0);
    expect(Math.max(...heard)).toBeLessThanOrEqual(2.0 + dt);
    // Replay: the same tracker sees the distance restart from 0 and voices the same steps again, silently resetting first.
    const tracker = new FootstepTracker();
    const first = plantTimes(stopStep, tracker);
    const replay = plantTimes(stopStep, tracker);
    expect(replay).toEqual(first);
  });

  it('a distance that goes backwards, no walking and no route make no sound', () => {
    const t = new FootstepTracker();
    expect(t.update({ distance: 3, walking: true })).toEqual([]); // first sight: sync only
    expect(t.update({ distance: 0.2, walking: true })).toEqual([]); // back to the start
    expect(t.update({ distance: 5, walking: false })).toEqual([]);
    expect(t.update(null)).toEqual([]);
    expect(t.update({ distance: 0, walking: true })).toEqual([]);
    expect(t.update({ distance: 0.4, walking: true })).toEqual([0]);
  });

  it('a stalled frame voices at most maxPerFrame steps (the latest ones)', () => {
    const t = new FootstepTracker();
    t.update({ distance: 0, walking: true });
    const feet = t.update({ distance: 4, walking: true });
    expect(feet).toHaveLength(AUDIO.footstep.maxPerFrame);
    expect(feet[feet.length - 1]).toBe(((plantsUpTo(4) - 1) % 2) as 0 | 1);
  });
});
