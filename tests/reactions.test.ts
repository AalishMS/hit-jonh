import { describe, expect, it } from 'vitest';
import {
  classifyShotOutcome,
  JONH_REACTIONS,
  JonhReactionSelector,
} from '../src/rules/reactions';

describe('JonhReactionSelector', () => {
  it('never repeats the same reaction line on consecutive selections', () => {
    const selector = new JonhReactionSelector();
    let previousLine: string | null = null;

    // Test 100 consecutive reaction requests across categories
    const categories = ['hit', 'short', 'over', 'miss'] as const;
    for (let i = 0; i < 100; i++) {
      const category = categories[i % categories.length]!;
      const line = selector.selectReaction(category);

      expect(line).toBeTruthy();
      expect(JONH_REACTIONS[category]).toContain(line);
      expect(line).not.toBe(previousLine);
      previousLine = line;
    }
  });

  it('never repeats within the same category consecutively', () => {
    const selector = new JonhReactionSelector();
    let previousLine: string | null = null;

    for (let i = 0; i < 50; i++) {
      const line = selector.selectReaction('hit');
      expect(line).not.toBe(previousLine);
      previousLine = line;
    }
  });

  it('selects from hat and overhead reaction categories without consecutive repeats', () => {
    const selector = new JonhReactionSelector();
    for (const cat of ['hat', 'overhead'] as const) {
      let prev: string | null = null;
      for (let i = 0; i < 30; i++) {
        const line = selector.selectReaction(cat);
        expect(line).toBeTruthy();
        expect(JONH_REACTIONS[cat]).toContain(line);
        expect(line).not.toBe(prev);
        prev = line;
      }
    }
  });

  it('handles fence reaction line', () => {
    const selector = new JonhReactionSelector();
    const line = selector.selectReaction('fence');
    expect(line).toBe('That was my good fence.');
  });

  it('handles custom deterministic rng without repetition', () => {
    // Deterministic fake rng returning 0 always
    const selector = new JonhReactionSelector(() => 0);
    const line1 = selector.selectReaction('short');
    const line2 = selector.selectReaction('short');

    expect(line1).not.toBe(line2);
  });
});

describe('classifyShotOutcome', () => {
  const jonhMinX = 17.5;
  const jonhMaxX = 18.5;

  it('classifies direct hits', () => {
    const res = classifyShotOutcome(true, 18.0, jonhMinX, jonhMaxX);
    expect(res.category).toBe('hit');
    expect(res.label).toBe('DIRECT HIT');
    expect(res.points).toBe(100);
  });

  it('classifies ricochet body hits with bonus points', () => {
    const res = classifyShotOutcome(true, 18.0, jonhMinX, jonhMaxX, {
      classifiedOutcome: 'ricochet_body',
    });
    expect(res.category).toBe('hit');
    expect(res.label).toBe('RICOCHET HIT');
    expect(res.points).toBe(125);
  });

  it('classifies hat-only hits with 20 points', () => {
    const res = classifyShotOutcome(false, 19.0, jonhMinX, jonhMaxX, {
      classifiedOutcome: 'hat_only',
    });
    expect(res.category).toBe('hat');
    expect(res.label).toBe('HAT HIT');
    expect(res.points).toBe(20);
  });

  it('classifies fence obstacle contact on miss', () => {
    const res = classifyShotOutcome(false, 12.0, jonhMinX, jonhMaxX, {
      obstacleContacts: [{ id: 'garden_fence', ricochet: true }],
    });
    expect(res.category).toBe('fence');
    expect(res.label).toBe('FENCE HIT');
    expect(res.points).toBe(0);
  });

  it('classifies overhead pass on miss', () => {
    const res = classifyShotOutcome(false, 21.0, jonhMinX, jonhMaxX, {
      passedOverhead: true,
    });
    expect(res.category).toBe('overhead');
    expect(res.label).toBe('OVERHEAD');
    expect(res.points).toBe(0);
  });

  it('classifies short shots', () => {
    const res = classifyShotOutcome(false, 14.2, jonhMinX, jonhMaxX);
    expect(res.category).toBe('short');
    expect(res.label).toBe('SHORT');
    expect(res.points).toBe(0);
  });

  it('classifies overshot shots', () => {
    const res = classifyShotOutcome(false, 21.0, jonhMinX, jonhMaxX);
    expect(res.category).toBe('over');
    expect(res.label).toBe('OVER JONH');
    expect(res.points).toBe(0);
  });
});
