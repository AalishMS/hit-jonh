import { describe, expect, it } from 'vitest';
import { SCORING } from '../src/config/tuning';
import { ShotClassifier, classifyShot } from '../src/sim/classification';

describe('Shot Classification and Scoring', () => {
  it('has proposed scoring points centralized in tuning config', () => {
    expect(SCORING.bodyPoints).toBe(100);
    expect(SCORING.ricochetBodyPoints).toBe(125);
    expect(SCORING.hatOnlyPoints).toBe(20);
    expect(SCORING.missPoints).toBe(0);
  });

  describe('classifyShot (pure function)', () => {
    it('classifies direct body hit as body with 100 points', () => {
      const result = classifyShot({
        hasBodyHit: true,
        hasHatHit: false,
        hadRicochetBeforeBody: false,
        shotEnded: true,
      });
      expect(result.outcome).toBe('body');
      expect(result.points).toBe(100);
      expect(result.isHit).toBe(true);
      expect(result.isRicochet).toBe(false);
      expect(result.label).toBe('DIRECT HIT');
    });

    it('classifies ricochet body hit with 125 points', () => {
      const result = classifyShot({
        hasBodyHit: true,
        hasHatHit: false,
        hadRicochetBeforeBody: true,
        shotEnded: true,
      });
      expect(result.outcome).toBe('ricochet_body');
      expect(result.points).toBe(125);
      expect(result.isHit).toBe(true);
      expect(result.isRicochet).toBe(true);
      expect(result.label).toBe('RICOCHET HIT');
      expect(result.trick).toBe('ricochet');
    });

    it('classifies a body hit after a portal hoop as a trick shot (125 points, HOOP HIT)', () => {
      const result = classifyShot({ hasBodyHit: true, hasHatHit: false, hadRicochetBeforeBody: false, hadPortalBeforeBody: true, shotEnded: true });
      expect(result.outcome).toBe('ricochet_body');
      expect(result.points).toBe(125);
      expect(result.trick).toBe('portal');
      expect(result.label).toBe('HOOP HIT');
    });

    it('classifies hat-then-body as body hit (100 points)', () => {
      const result = classifyShot({
        hasBodyHit: true,
        hasHatHit: true,
        hadRicochetBeforeBody: false,
        shotEnded: true,
      });
      expect(result.outcome).toBe('body');
      expect(result.points).toBe(100);
      expect(result.isHit).toBe(true);
    });

    it('waits for shot end before finalizing hat-only outcome (20 points)', () => {
      // While shot is still in flight, hat-only is not finalized
      const inFlight = classifyShot({
        hasBodyHit: false,
        hasHatHit: true,
        hadRicochetBeforeBody: false,
        shotEnded: false,
      });
      expect(inFlight.outcome).toBe('miss');
      expect(inFlight.points).toBe(0);

      // Once shot ends without body hit, hat-only resolves to 20 points
      const resolved = classifyShot({
        hasBodyHit: false,
        hasHatHit: true,
        hadRicochetBeforeBody: false,
        shotEnded: true,
      });
      expect(resolved.outcome).toBe('hat_only');
      expect(resolved.points).toBe(20);
      expect(resolved.isHit).toBe(false);
      expect(resolved.label).toBe('HAT HIT');
    });

    it('classifies standard miss as 0 points', () => {
      const result = classifyShot({
        hasBodyHit: false,
        hasHatHit: false,
        hadRicochetBeforeBody: false,
        shotEnded: true,
      });
      expect(result.outcome).toBe('miss');
      expect(result.points).toBe(0);
      expect(result.isHit).toBe(false);
      expect(result.label).toBe('MISS');
    });
  });

  describe('ShotClassifier (stateful tracker)', () => {
    it('records direct body hit and finalizes once', () => {
      const classifier = new ShotClassifier();
      classifier.recordContact({ role: 'jonhBody' });

      expect(classifier.isBodyFinalized).toBe(true);
      expect(classifier.hasBodyHit).toBe(true);

      const res = classifier.classify(true);
      expect(res.outcome).toBe('body');
      expect(res.points).toBe(100);

      // Subsequent duplicate callbacks do not change outcome or point value
      classifier.recordContact({ role: 'jonhBody' });
      classifier.recordContact({ role: 'obstacle', id: 'fence', ricochet: true });
      const resAfterDup = classifier.classify(true);
      expect(resAfterDup.outcome).toBe('body');
      expect(resAfterDup.points).toBe(100);
    });

    it('records ricochet body hit when ricochet surface hit prior to body', () => {
      const classifier = new ShotClassifier();
      classifier.recordContact({ role: 'obstacle', id: 'fence', ricochet: true });
      expect(classifier.hadRicochetBeforeBody).toBe(true);

      classifier.recordContact({ role: 'jonhBody' });
      const res = classifier.classify(true);
      expect(res.outcome).toBe('ricochet_body');
      expect(res.points).toBe(125);
      expect(res.isRicochet).toBe(true);
    });

    it('never qualifies ground for ricochet bonus', () => {
      const classifier = new ShotClassifier();
      // Ground contact reported
      classifier.recordContact({ role: 'ground', ricochet: true });
      expect(classifier.hadRicochetBeforeBody).toBe(false);

      classifier.recordContact({ role: 'jonhBody' });
      const res = classifier.classify(true);
      expect(res.outcome).toBe('body');
      expect(res.points).toBe(100);
      expect(res.isRicochet).toBe(false);
    });

    it('handles hat-then-body resulting in body hit', () => {
      const classifier = new ShotClassifier();
      classifier.recordContact({ role: 'jonhHat' });
      expect(classifier.hasHatHit).toBe(true);
      expect(classifier.isBodyFinalized).toBe(false);

      // Later hits body
      classifier.recordContact({ role: 'jonhBody' });
      expect(classifier.isBodyFinalized).toBe(true);

      const res = classifier.classify(true);
      expect(res.outcome).toBe('body');
      expect(res.points).toBe(100);
    });

    it('records hat-only hit when shot ends without body contact', () => {
      const classifier = new ShotClassifier();
      classifier.recordContact({ role: 'jonhHat' });

      // In flight
      expect(classifier.classify(false).outcome).toBe('miss');

      // Shot ended
      const res = classifier.classify(true);
      expect(res.outcome).toBe('hat_only');
      expect(res.points).toBe(20);
      expect(res.isHit).toBe(false);
    });

    it('tracks obstacle contacts for feedback (e.g. fence hit)', () => {
      const classifier = new ShotClassifier();
      classifier.recordContact({ role: 'obstacle', id: 'fence_1', ricochet: true });
      classifier.recordContact({ role: 'obstacle', id: 'post_2', ricochet: false });

      expect(classifier.obstacleContacts).toEqual([
        { id: 'fence_1', ricochet: true },
        { id: 'post_2', ricochet: false },
      ]);
    });

    it('tracks overhead pass events when body/hat not hit', () => {
      const classifier = new ShotClassifier();
      classifier.recordOverhead();
      expect(classifier.hasPassedOverhead).toBe(true);

      // Reset clears everything
      classifier.reset();
      expect(classifier.hasPassedOverhead).toBe(false);
      expect(classifier.hasHatHit).toBe(false);
      expect(classifier.hasBodyHit).toBe(false);
      expect(classifier.isBodyFinalized).toBe(false);
      expect(classifier.obstacleContacts.length).toBe(0);
    });
  });
});

describe('ShotClassifier portals (SPEC §7.1, owner decision 2026-11-25)', () => {
  it('a hoop then the body is a trick; a hoop alone is a miss; body first stays a plain hit', () => {
    const c = new ShotClassifier();
    c.recordContact({ role: 'portal', id: 'hoops' });
    expect(c.classify(true).outcome).toBe('miss');
    c.recordContact({ role: 'jonhBody' });
    expect(c.classify(true)).toMatchObject({ outcome: 'ricochet_body', trick: 'portal' });

    const late = new ShotClassifier();
    late.recordContact({ role: 'jonhBody' });
    late.recordContact({ role: 'portal', id: 'hoops' });
    expect(late.classify(true)).toMatchObject({ outcome: 'body', trick: null });

    // A portal is not a surface: no obstacle contact is recorded for it.
    expect(c.obstacleContacts).toEqual([]);
    c.reset();
    expect(c.hadPortalBeforeBody).toBe(false);
  });
  it('a bank shot through a hoop is labelled as the bank shot', () => {
    const c = new ShotClassifier();
    c.recordContact({ role: 'portal', id: 'hoops' });
    c.recordContact({ role: 'obstacle', id: 'billboard', ricochet: true });
    c.recordContact({ role: 'jonhBody' });
    expect(c.classify(true)).toMatchObject({ outcome: 'ricochet_body', trick: 'ricochet', label: 'RICOCHET HIT' });
  });
});

