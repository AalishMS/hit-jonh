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
  });

  it('classifies short shots', () => {
    const res = classifyShotOutcome(false, 14.2, jonhMinX, jonhMaxX);
    expect(res.category).toBe('short');
    expect(res.label).toBe('SHORT');
  });

  it('classifies overshot shots', () => {
    const res = classifyShotOutcome(false, 21.0, jonhMinX, jonhMaxX);
    expect(res.category).toBe('over');
    expect(res.label).toBe('OVER JONH');
  });
});
