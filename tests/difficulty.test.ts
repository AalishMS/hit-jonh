import { appendFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DIFFICULTY } from '../src/config/tuning';
import { mapDifficulty, robustHits } from '../src/dev/difficulty';
import { levelAtMultiplayerPosition } from '../src/levels/multiplayerPositions';
import { runHeadlessShot } from '../src/physics/headlessShot';
import { MAPS } from '../src/levels';

/**
 * Difficulty guard. The default run fires a coarse 5° × 5% grid at every target position.
 * `DIFFICULTY_REPORT=1 npx vitest run tests/difficulty.test.ts` prints the full 1° × 1% table
 * used for tuning, with suggested reference aims (slow; DIFFICULTY_MAPS=id,id narrows it,
 * DIFFICULTY_STEP=2 coarsens it, DIFFICULTY_OUT=path writes it to a file).
 */
const REPORT = Boolean(import.meta.env.DIFFICULTY_REPORT);
const ONLY = import.meta.env.DIFFICULTY_MAPS?.split(',');
/** Report lines go to DIFFICULTY_OUT (a file path) when set, otherwise to stdout. */
const report = (line: string) => {
  if (import.meta.env.DIFFICULTY_OUT) appendFileSync(import.meta.env.DIFFICULTY_OUT, `${line}
`);
  else console.log(line);
};

describe.skipIf(REPORT)('map difficulty (coarse grid)', () => {
  for (const base of MAPS) {
    it(`${base.id} stays hard: at most ${DIFFICULTY.maxCoarseHitFraction * 100}% of a 5°×5% grid hits`, () => {
      for (const { positionId, map } of mapDifficulty(base, 5, 5)) {
        expect(map.hitFraction, `${base.id}/${positionId}`).toBeLessThanOrEqual(DIFFICULTY.maxCoarseHitFraction);
        const minTrick = DIFFICULTY.minTrickShare[base.id];
        if (minTrick !== undefined && map.hits > 0) {
          expect(map.ricochetHits / map.hits, `${base.id}/${positionId} trick-shot share`).toBeGreaterThanOrEqual(minTrick);
        }
      }
    }, 120_000);
  }
});

describe.runIf(REPORT)('map difficulty report', () => {
  const step = Number(import.meta.env.DIFFICULTY_STEP ?? 1);
  for (const base of MAPS.filter(m => !ONLY || ONLY.includes(m.id))) {
    it(base.id, () => {
      const results = mapDifficulty(base, step, step);
      for (const { positionId, map } of results) {
        // Reference candidates: forgiving hits that do not also hit the map's other positions.
        const others = base.multiplayerPositions.filter(p => p.id !== positionId).map(p => levelAtMultiplayerPosition(base, p.id));
        const refs = robustHits(map).filter(h => others.every(level => !['body', 'ricochet_body'].includes(runHeadlessShot(level, h.angle, h.power).outcome)))
          .slice(0, 4).map(h => `${h.angle}/${h.power}(${h.neighbours})`).join(' ');
        report(`${base.id}/${positionId}: ${(map.hitFraction * 100).toFixed(2)}% (${map.hits}/${map.total}), ` +
          `ricochet ${map.ricochetHits}, widest run ${map.widestRun} | refs ${refs}`);
      }
    }, 3_600_000);
  }
});
