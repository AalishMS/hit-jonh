import { describe, expect, it } from 'vitest';
import { MULTIPLAYER } from '../src/config/tuning';
import { MultiplayerMatchMachine } from '../src/rules/multiplayerMatch';
import { matchStakes, shotsLeftPerPlayer, tauntFor, TAUNTS, verdictFor, type Standing } from '../src/rules/matchStakes';

const s = (name: string, score: number, bodyHits: number, shotsLeft: number): Standing => ({ name, score, bodyHits, shotsLeft });

describe('verdictFor (the SPEC §7.1 winner rule after one more shot)', () => {
  it('uses total, then body hits, else a shared win', () => {
    const table = [s('Ace', 100, 1, 1), s('Bo', 125, 1, 0)];
    expect(verdictFor(table, 0, 'miss')).toBe('lose');
    expect(verdictFor(table, 0, 'hat_only')).toBe('lose');
    expect(verdictFor(table, 0, 'body')).toBe('win');
    // Equal scores fall to body hits: a hat hit to 125 with no hits loses to 125 with one hit…
    expect(verdictFor([s('Ace', 105, 0, 1), s('Bo', 125, 1, 0)], 0, 'hat_only')).toBe('lose');
    // …while a body hit to 125 with two hits beats it.
    expect(verdictFor([s('Ace', 25, 1, 1), s('Bo', 125, 1, 0)], 0, 'body')).toBe('win');
    expect(verdictFor([s('Ace', 25, 0, 1), s('Bo', 125, 1, 0)], 0, 'body')).toBe('tie');
  });

  it('reports a tie when score and body hits match', () => {
    const table = [s('Ace', 0, 0, 1), s('Bo', 125, 1, 0)];
    expect(verdictFor(table, 0, 'ricochet_body')).toBe('tie');
  });
});

describe('matchStakes', () => {
  const lastShot = (me: Standing, rival: Standing) => matchStakes([me, rival], 0, { finalRound: true, firstShotOfRound: false });

  it('spells out exactly what wins the very last shot of the match', () => {
    expect(lastShot(s('Ace', 50, 0, 1), s('Bo', 100, 1, 0))).toMatchObject({ kicker: 'Last shot of the match', line: 'Any hit wins it!', decisive: true });
    expect(lastShot(s('Ace', 90, 1, 1), s('Bo', 100, 1, 0))).toMatchObject({ line: 'Even a hat hit wins it!', decisive: true });
    expect(lastShot(s('Ace', 0, 0, 1), s('Bo', 110, 1, 0))).toMatchObject({ line: 'Only a trick shot wins it!', decisive: true });
    expect(lastShot(s('Ace', 0, 0, 1), s('Bo', 125, 1, 0))).toMatchObject({ line: 'A trick shot ties it!', decisive: true });
    // A plain hit ties on score and hits; only a trick shot wins outright.
    expect(lastShot(s('Ace', 0, 0, 1), s('Bo', 100, 1, 0))).toMatchObject({ line: 'Only a trick shot wins it! A hit ties.', decisive: true });
    expect(lastShot(s('Ace', 0, 0, 1), s('Bo', 300, 3, 0))).toMatchObject({ decisive: false });
    expect(lastShot(s('Ace', 150, 2, 1), s('Bo', 100, 1, 0))).toMatchObject({ line: 'Already won. Go for style.', decisive: false });
  });

  it('announces the final round and the last shot, otherwise the standings', () => {
    const table = [s('Ace', 100, 1, 3), s('Bo', 175, 2, 3)];
    expect(matchStakes(table, 0, { finalRound: true, firstShotOfRound: true })).toEqual({ kicker: 'Final round', line: 'Trailing Bo by 75', decisive: false });
    expect(matchStakes(table, 1, { finalRound: false, firstShotOfRound: false })).toEqual({ kicker: null, line: 'Leading by 75', decisive: false });
    expect(matchStakes([s('Ace', 100, 1, 1), s('Bo', 100, 1, 2)], 0, { finalRound: true, firstShotOfRound: false }))
      .toEqual({ kicker: 'Your last shot', line: 'All square', decisive: false });
  });
});

describe('shotsLeftPerPlayer', () => {
  it('counts every remaining shot in this and later rounds', () => {
    expect(shotsLeftPerPlayer(2, 0, 2, 0)).toEqual([6, 6]);
    expect(shotsLeftPerPlayer(2, 0, 2, 1)).toEqual([5, 6]);
    expect(shotsLeftPerPlayer(2, 1, 2, 0)).toEqual([3, 3]);
    expect(shotsLeftPerPlayer(2, 1, 2, 5)).toEqual([1, 0]);
  });

  it('matches a real match: each shot uses one of the shooter\'s, and the active player always has one', () => {
    for (const n of [2, 3, 4]) {
      const setups = Array.from({ length: n }, (_, i) => ({ name: `P${i}`, color: MULTIPLAYER.colors[i]!, pattern: MULTIPLAYER.patterns[i]!, lastAngle: 45, lastPower: 50 }));
      const match = new MultiplayerMatchMachine(setups, ['backyard', 'fence'], () => 0.3);
      let expected = Array.from({ length: n }, () => 2 * MULTIPLAYER.shotsPerRound);
      while (match.state !== 'match_result') {
        if (match.state === 'round_result') { match.nextRound(); continue; }
        const left = shotsLeftPerPlayer(n, match.roundIndex, match.roundCount, match.shotIndexInRound);
        expect(left).toEqual(expected);
        expect(left[match.activePlayerIndex]).toBeGreaterThan(0);
        match.startAiming();
        const shooter = match.activePlayerIndex;
        match.fire(45, 50);
        match.resolveShot('miss');
        expected = expected.map((v, i) => (i === shooter ? v - 1 : v));
        match.continueFromResult();
      }
      expect(expected.every(v => v === 0)).toBe(true);
    }
  });
});

describe('taunts', () => {
  it('only a scoring shot earns a taunt, from the matching pool', () => {
    expect(tauntFor('miss')).toBeNull();
    expect(TAUNTS.trick).toContain(tauntFor('ricochet_body', () => 0));
    expect(TAUNTS.hit).toContain(tauntFor('body', () => 0.99));
    expect(TAUNTS.hat).toContain(tauntFor('hat_only'));
  });
});
