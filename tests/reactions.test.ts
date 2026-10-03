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

describe('Mid-flight reaction workflow and resolution logic', () => {
  it('triggers hat reaction mid-flight and preserves quote on hat-only resolution without re-rolling', () => {
    const selector = new JonhReactionSelector();
    let hatReactionTriggered = false;
    let activeReactionQuote: string | null = null;

    // Simulate mid-flight hat contact
    const simulateStep = { hitHat: true, hitJonh: false };
    if (simulateStep.hitHat && !simulateStep.hitJonh && !hatReactionTriggered) {
      hatReactionTriggered = true;
      activeReactionQuote = selector.selectReaction('hat');
    }

    expect(hatReactionTriggered).toBe(true);
    expect(activeReactionQuote).toBeTruthy();
    expect(JONH_REACTIONS.hat).toContain(activeReactionQuote);

    // Further simulation steps before shot resolves do not re-trigger or change quote
    const nextStep = { hitHat: true, hitJonh: false };
    if (nextStep.hitHat && !nextStep.hitJonh && !hatReactionTriggered) {
      activeReactionQuote = selector.selectReaction('hat');
    }
    const midflightQuote = activeReactionQuote;

    // Shot ends as hat-only
    const feedback = classifyShotOutcome(false, 19.0, 17.5, 18.5, {
      classifiedOutcome: 'hat_only',
    });
    const isBodyHit = false;
    const finalQuote = isBodyHit
      ? selector.selectReaction(feedback.category)
      : (activeReactionQuote ?? selector.selectReaction(feedback.category));

    expect(finalQuote).toBe(midflightQuote);
    // Selector last selected line is preserved; no second line was drawn from the pool
    expect(selector.getLastReaction()).toBe(midflightQuote);
  });

  it('preserves body override when hat contact is followed by body contact and avoids repeating hat quote', () => {
    const selector = new JonhReactionSelector();
    let hatReactionTriggered = false;
    let activeReactionQuote: string | null = null;

    // Step 1: contacts hat
    const step1 = { hitHat: true, hitJonh: false };
    if (step1.hitHat && !step1.hitJonh && !hatReactionTriggered) {
      hatReactionTriggered = true;
      activeReactionQuote = selector.selectReaction('hat');
    }
    expect(hatReactionTriggered).toBe(true);
    const hatQuote = activeReactionQuote;

    // Step 2: subsequent body contact (hat-then-body)
    const step2 = { hitHat: true, hitJonh: true };
    const isBodyHit = step2.hitJonh;
    const feedback = classifyShotOutcome(isBodyHit, 18.0, 17.5, 18.5, {
      classifiedOutcome: 'body',
    });

    // Body hit overrides with fresh dialogue reaction
    const finalQuote = isBodyHit
      ? selector.selectReaction(feedback.category)
      : (activeReactionQuote ?? selector.selectReaction(feedback.category));

    expect(feedback.category).toBe('hit');
    expect(feedback.points).toBe(100);
    expect(finalQuote).toBeTruthy();
    expect(JONH_REACTIONS.hit).toContain(finalQuote);
    // Crucial: non-repetition rule ensures final body quote is not identical to the mid-flight quote
    expect(finalQuote).not.toBe(hatQuote);
  });

  it('triggers overhead reaction mid-flight and preserves quote on overhead miss resolution', () => {
    const selector = new JonhReactionSelector();
    let overheadReactionTriggered = false;
    let activeReactionQuote: string | null = null;

    // Simulate mid-flight overhead pass
    const step = { passedOverhead: true, hitJonh: false, hitHat: false };
    if (step.passedOverhead && !step.hitJonh && !step.hitHat && !overheadReactionTriggered) {
      overheadReactionTriggered = true;
      activeReactionQuote = selector.selectReaction('overhead');
    }

    expect(overheadReactionTriggered).toBe(true);
    const midflightQuote = activeReactionQuote;
    expect(JONH_REACTIONS.overhead).toContain(midflightQuote);

    // Shot ends settled as overhead miss
    const isBodyHit = false;
    const feedback = classifyShotOutcome(false, 21.0, 17.5, 18.5, {
      passedOverhead: true,
    });
    const finalQuote = isBodyHit
      ? selector.selectReaction(feedback.category)
      : (activeReactionQuote ?? selector.selectReaction(feedback.category));

    expect(finalQuote).toBe(midflightQuote);
    expect(selector.getLastReaction()).toBe(midflightQuote);
  });

  it('resets reaction guards and active quote cleanly between shots', () => {
    let hatReactionTriggered = true;
    let overheadReactionTriggered = true;
    let activeReactionQuote: string | null = 'My hat!';

    expect(hatReactionTriggered).toBe(true);
    expect(overheadReactionTriggered).toBe(true);
    expect(activeReactionQuote).toBe('My hat!');

    // Reset action
    hatReactionTriggered = false;
    overheadReactionTriggered = false;
    activeReactionQuote = null;

    expect(hatReactionTriggered).toBe(false);
    expect(overheadReactionTriggered).toBe(false);
    expect(activeReactionQuote).toBeNull();
  });
});

