import { describe, expect, it } from 'vitest';
import { MAPS } from '../src/levels';
import { levelAtMultiplayerPosition } from '../src/levels/multiplayerPositions';
import { runHeadlessShot } from '../src/physics/headlessShot';
import { buildCrossCheckShots, fnv1a, runCrossCheck } from '../src/dev/crossCheck';

describe('headless shot runner', () => {
  for (const base of MAPS) {
    const mapId = base.id;
    for (const position of base.multiplayerPositions) {
      it(`${mapId}/${position.id} reference solutions hit Jonh`, () => {
        const level = levelAtMultiplayerPosition(base, position.id);
        for (const ref of position.referenceSolutions) {
          const result = runHeadlessShot(level, ref.angleDeg, ref.powerPercent);
          expect(['body', 'ricochet_body']).toContain(result.outcome);
        }
      });
    }
  }

  it('is deterministic within one engine', () => {
    const level = MAPS.find(m => m.id === 'fence')!;
    expect(runHeadlessShot(level, 41, 83)).toEqual(runHeadlessShot(level, 41, 83));
  });
});

describe('cross-check report', () => {
  it('hashes with 32-bit FNV-1a', () => {
    expect(fnv1a('')).toBe('811c9dc5');
    expect(fnv1a('a')).toBe('e40c292c');
  });

  it('covers every MP position with references plus a 10 x 7 grid', () => {
    const expected = MAPS.reduce((sum, base) => {
      return sum + base.multiplayerPositions.reduce((s, p) => s + p.referenceSolutions.length + 70, 0);
    }, 0);
    expect(buildCrossCheckShots()).toHaveLength(expected);
  });

  it('produces stable digests for the same shots', () => {
    const shots = buildCrossCheckShots().slice(0, 12);
    const a = runCrossCheck(shots);
    const b = runCrossCheck(shots);
    expect(a.outcomeDigest).toBe(b.outcomeDigest);
    expect(a.exactDigest).toBe(b.exactDigest);
    expect(a.count).toBe(12);
  });
});
