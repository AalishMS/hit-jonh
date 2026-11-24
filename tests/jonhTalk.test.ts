import { describe, expect, it } from 'vitest';
import { JONH_TALK } from '../src/config/tuning';
import { MAPS } from '../src/levels';
import {
  FIRST_SHOT_LINES, HAT_LINES, HECKLE_AFTER_MISSES, HECKLE_LINES, HIT_STREAK_LINES, MAP_LINES, MISS_STREAK_LINES,
  OBSTACLE_LINES, STRONG_HIT_LINES, TITLE_HIT_LINES, TITLE_LINES, TRICK_HIT_LINES,
} from '../src/rules/jonhLines';
import { HeckleTimer } from '../src/rules/heckleTimer';
import { JONH_REACTIONS, JonhReactionSelector } from '../src/rules/reactions';

/** rng that always says "yes" to the first context pool and picks the first candidate. */
const always = () => 0;

describe('Jonh picks lines that fit the moment', () => {
  it('a trick hit gets a trick line; a first-shot hit a first-shot line; a third hit in a row a streak line', () => {
    expect(TRICK_HIT_LINES).toContain(new JonhReactionSelector(always).selectReaction('hit', { strength: 'trick' }));
    expect(FIRST_SHOT_LINES).toContain(new JonhReactionSelector(always).selectReaction('hit', { firstShot: true }));
    expect(HIT_STREAK_LINES).toContain(new JonhReactionSelector(always).selectReaction('hit', { hitStreak: 3 }));
    expect(STRONG_HIT_LINES).toContain(new JonhReactionSelector(always).selectReaction('hit', { strength: 'strong' }));
  });

  it('comments on a miss streak only from the configured length', () => {
    const quiet = new JonhReactionSelector(always).selectReaction('short', { missStreak: JONH_TALK.missStreakFrom - 1 });
    expect(MISS_STREAK_LINES).not.toContain(quiet);
    const fed = new JonhReactionSelector(always).selectReaction('short', { missStreak: JONH_TALK.missStreakFrom });
    expect(MISS_STREAK_LINES).toContain(fed);
  });

  it('complains about the property the ball touched, matched by id or material', () => {
    const shed = OBSTACLE_LINES.find(e => e.match.id === 'shed')!.lines;
    expect(shed).toContain(new JonhReactionSelector(always).selectReaction('miss', { obstacles: [{ id: 'garden-shed', material: 'wood' }] }));
    const tree = OBSTACLE_LINES.find(e => e.match.material === 'leaves')!.lines;
    expect(tree).toContain(new JonhReactionSelector(always).selectReaction('miss', { obstacles: [{ id: 'apple-tree', material: 'leaves' }] }));
  });

  it('mourns the specific hat he was wearing', () => {
    expect(HAT_LINES.fez).toContain(new JonhReactionSelector(always).selectReaction('hat', { hatId: 'fez' }));
  });

  it('falls back to the plain pool when the odds say no, and without a context', () => {
    const never = new JonhReactionSelector(() => 0.999);
    expect(JONH_REACTIONS.hit).toContain(never.selectReaction('hit', { strength: 'trick', firstShot: true, hitStreak: 9, mapId: 'moon' }));
    expect(JONH_REACTIONS.over).toContain(new JonhReactionSelector().selectReaction('over'));
  });

  it('never repeats a line within the last eight picks when the pool allows it', () => {
    const selector = new JonhReactionSelector();
    const pool = [...JONH_REACTIONS.short, ...JONH_REACTIONS.over];
    expect(new Set(pool).size).toBeGreaterThan(8);
    const picks: string[] = [];
    for (let i = 0; i < 200; i++) picks.push(selector.selectReaction(i % 2 ? 'short' : 'over'));
    for (let i = 8; i < picks.length; i++) {
      const window = picks.slice(i - 8, i);
      // Only a line fresh across the window may be picked while fresh lines remain in its pool.
      const category = i % 2 ? 'short' : 'over';
      const freshExists = JONH_REACTIONS[category].some(line => !window.includes(line));
      if (freshExists) expect(window).not.toContain(picks[i]);
      expect(picks[i]).not.toBe(picks[i - 1]);
    }
  });

  it('opens each garden with a line of its own, falling back to the level line', () => {
    expect(MAP_LINES.moon!.arrival).toContain(new JonhReactionSelector().selectArrival('moon'));
    expect(new JonhReactionSelector().selectArrival('no-such-map', 'Fallback line.')).toBe('Fallback line.');
  });

  it('heckles get sharper after a couple of misses', () => {
    const lines = new Set<string>();
    const selector = new JonhReactionSelector();
    for (let i = 0; i < 40; i++) lines.add(selector.selectHeckle(2));
    expect([...lines].some(line => HECKLE_AFTER_MISSES.includes(line))).toBe(true);
    for (let i = 0; i < 20; i++) expect(HECKLE_LINES).toContain(selector.selectHeckle(0));
  });
});

describe('Jonh lines data', () => {
  const all = [
    ...Object.values(JONH_REACTIONS).flat(), ...MISS_STREAK_LINES, ...FIRST_SHOT_LINES, ...HIT_STREAK_LINES,
    ...STRONG_HIT_LINES, ...TRICK_HIT_LINES, ...Object.values(HAT_LINES).flat(), ...OBSTACLE_LINES.flatMap(e => e.lines),
    ...Object.values(MAP_LINES).flatMap(m => [...m.arrival, ...m.miss, ...m.hit]), ...HECKLE_LINES, ...HECKLE_AFTER_MISSES,
    ...TITLE_LINES, ...TITLE_HIT_LINES,
  ];

  it('every line fits a speech bubble and spells his name right', () => {
    for (const line of all) {
      expect(line.length, line).toBeLessThanOrEqual(60);
      expect(line, line).not.toMatch(/\bJohn\b/);
    }
  });

  it('per-garden lines only name real maps', () => {
    const ids = new Set(MAPS.map(m => m.id));
    for (const id of Object.keys(MAP_LINES)) expect(ids.has(id), id).toBe(true);
  });
});

describe('HeckleTimer', () => {
  it('heckles after the first idle wait, then after the repeat wait, at most max times', () => {
    const timer = new HeckleTimer(9, 15, 2);
    expect(timer.advance(8.9)).toBe(false);
    expect(timer.advance(0.2)).toBe(true);
    expect(timer.advance(14.9)).toBe(false);
    expect(timer.advance(0.2)).toBe(true);
    expect(timer.advance(100)).toBe(false);
    timer.reset();
    expect(timer.advance(9.1)).toBe(true);
  });

  it('any aim adjustment restarts the idle clock', () => {
    const timer = new HeckleTimer(9, 15, 2);
    timer.advance(8);
    timer.activity();
    expect(timer.advance(8)).toBe(false);
    expect(timer.advance(1.1)).toBe(true);
  });
});
