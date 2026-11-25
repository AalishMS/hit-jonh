import { describe, expect, it } from 'vitest';
import { ART_GROUPS, levelArtGroups } from '../src/art/library';
import { rampArt, rampKey, rampOutline } from '../src/art/rampArt';
import { WORLD } from '../src/config/tuning';
import { MAPS, SKATEPARK_LEVEL } from '../src/levels';
import { levelAtMultiplayerPosition } from '../src/levels/multiplayerPositions';
import type { LevelData } from '../src/levels/types';
import { runHeadlessShot } from '../src/physics/headlessShot';
import { recordShot } from '../src/physics/shotRecorder';
import { CAMPAIGN_ORDER } from '../src/rules/campaign';
import { MAP_LINES } from '../src/rules/jonhLines';
import { MECHANIC_TIPS } from '../src/rules/mechanicTips';
import { mapHasTrick } from '../src/rules/onlineRules';
import { arcCorners, arcShape } from '../src/sim/arc';
import { mapDescription, mapPreview } from '../src/ui/mapPreview';

const isHit = (o: string) => o === 'body' || o === 'ricochet_body';
const withoutRamp = (level: LevelData): LevelData => ({ ...level, ramps: [] });

/** Every reference shot of the garden: solo and each multiplayer target position. */
const references = [
  ...SKATEPARK_LEVEL.referenceSolutions.map(s => ({ where: 'solo', level: SKATEPARK_LEVEL, s })),
  ...SKATEPARK_LEVEL.multiplayerPositions.flatMap(p => {
    const level = levelAtMultiplayerPosition(SKATEPARK_LEVEL, p.id);
    return level.referenceSolutions.map(s => ({ where: p.id, level, s }));
  }),
];

describe('Skate Park: the half-pipe is the only way to Jonh', () => {
  it('every reference shot rolls out of the half-pipe into Jonh, and misses with the half-pipe taken away', () => {
    expect(references.length).toBeGreaterThanOrEqual(4);
    for (const { where, level, s } of references) {
      const label = `${where} ${s.angleDeg}/${s.powerPercent}`;
      const shot = runHeadlessShot(level, s.angleDeg, s.powerPercent);
      expect(shot.outcome, label).toBe('body');
      expect(shot.rampsTouched, label).toEqual(['half-pipe']);
      expect(shot.rampLaunches, label).toContain('half-pipe');
      expect(isHit(runHeadlessShot(withoutRamp(level), s.angleDeg, s.powerPercent).outcome), `${label} without the ramp`).toBe(false);
    }
  });

  it('without the half-pipe no aim reaches him at any target position: he is walled off and roofed over', () => {
    for (const position of SKATEPARK_LEVEL.multiplayerPositions) {
      const level = withoutRamp(levelAtMultiplayerPosition(SKATEPARK_LEVEL, position.id));
      for (let angle = 5; angle <= 85; angle += 5) {
        for (let power = 0; power <= 100; power += 5) {
          expect(isHit(runHeadlessShot(level, angle, power).outcome), `${position.id} ${angle}/${power}`).toBe(false);
        }
      }
    }
  }, 120_000);

  it('the title demo and the winning-shot replay record the same flight, launch clack included', () => {
    const { angleDeg, powerPercent } = SKATEPARK_LEVEL.referenceSolutions[0]!;
    const shot = recordShot(SKATEPARK_LEVEL, angleDeg, powerPercent);
    expect(shot.contactIndex).not.toBeNull();
    expect(shot.trick).toBe(false);
    expect(shot.events.flatMap(e => e.events).some(e => e.kind === 'rampLaunch' && e.id === 'half-pipe')).toBe(true);
  });

  it('rolling through the half-pipe is not a trick shot [OPEN default]: plain body hits, and no trick online', () => {
    expect(SKATEPARK_LEVEL.ramps!.every(r => !r.ricochet)).toBe(true);
    expect(mapHasTrick('skatepark')).toBe(false);
  });
});

describe('Skate Park art and words', () => {
  it('draws the half-pipe from the collider\'s own arc', () => {
    const ramp = SKATEPARK_LEVEL.ramps![0]!;
    const shape = arcShape(ramp);
    const { box, corners } = rampOutline(shape, SKATEPARK_LEVEL.ground.maxY);
    expect(corners).toEqual(arcCorners(shape));
    expect(box.minY).toBe(SKATEPARK_LEVEL.ground.maxY);
    const [def] = rampArt([SKATEPARK_LEVEL], WORLD.pixelsPerMetre);
    expect(def!.key).toBe(rampKey('skatepark', 'half-pipe'));
    // The riding face is one SVG arc at the collider's radius, from lip to lip.
    expect(def!.svg).toContain(`A${ramp.radius * WORLD.pixelsPerMetre} ${ramp.radius * WORLD.pixelsPerMetre} 0 0 0`);
    const keys = new Set(levelArtGroups('skatepark').flatMap(g => ART_GROUPS.get(g)!.map(d => d.key)));
    expect(keys.has(def!.key)).toBe(true);
    expect(mapPreview('skatepark')).toContain(`A${(ramp.radius * 300 / 25.6).toFixed(2)}`);
  });

  it('is registered after the first four chapters, with its mechanic, tip, lines and description', () => {
    expect(MAPS).toContain(SKATEPARK_LEVEL);
    expect(CAMPAIGN_ORDER.indexOf('skatepark')).toBeGreaterThan(CAMPAIGN_ORDER.indexOf('valley'));
    expect(SKATEPARK_LEVEL.mechanic).toBe('ramp');
    expect(MECHANIC_TIPS.ramp).toMatch(/half-pipe/);
    expect(MAP_LINES.skatepark?.arrival).toContain(SKATEPARK_LEVEL.arrivalLine);
    expect(mapDescription('skatepark')).toMatch(/half-pipe/);
  });
});
