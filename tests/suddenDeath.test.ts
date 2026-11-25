import { describe, expect, it } from 'vitest';
import { MultiplayerMatchMachine, type MPPlayerSetup } from '../src/rules/multiplayerMatch';
import { MULTIPLAYER } from '../src/config/tuning';
import type { ClassifiedOutcome } from '../src/sim/classification';

const setup = (name: string): MPPlayerSetup => ({ name, color: 0xff0000, pattern: 'solid', lastAngle: 45, lastPower: 50 });
const players = (n: number) => ['Ana', 'Bo', 'Cy', 'Di'].slice(0, n).map(setup);
const fixed = () => 0.42;

/** Plays one shot for whoever is up: handover → aim → fire → resolve → continue. */
function shoot(m: MultiplayerMatchMachine, outcome: ClassifiedOutcome): number {
  const shooter = m.activePlayerIndex;
  m.startAiming();
  expect(m.fire(45, 50)).toBe(true);
  expect(m.resolveShot(outcome)).toBe(true);
  m.continueFromResult();
  return shooter;
}

/** Plays a whole round; `outcomeFor(player)` decides each shot. */
function playRound(m: MultiplayerMatchMachine, outcomeFor: (player: number) => ClassifiedOutcome): void {
  while (m.state === 'handover') shoot(m, outcomeFor(m.activePlayerIndex));
  expect(m.state).toBe('round_result');
}

describe('hot-seat sudden death', () => {
  it('is off unless asked for: a level match is shared, as before', () => {
    const m = new MultiplayerMatchMachine(players(2), ['backyard'], fixed);
    playRound(m, () => 'body');
    m.nextRound();
    expect(m.state).toBe('match_result');
    expect(m.suddenDeath).toBeNull();
    expect(m.getWinners().map(w => w.name)).toEqual(['Ana', 'Bo']);
  });

  it('plays a shoot-out on the last map from a fresh spot when the tie-break still ties', () => {
    const m = new MultiplayerMatchMachine(players(2), ['fence', 'backyard'], fixed, { suddenDeath: true });
    playRound(m, () => 'miss');
    m.nextRound();
    playRound(m, () => 'body');
    const spot = m.activePositionId;
    m.nextRound();
    expect(m.state).toBe('handover');
    expect(m.isMatchComplete).toBe(false);
    expect(m.currentMapId).toBe('backyard');
    expect(m.activePositionId).not.toBe(spot);
    expect(m.suddenDeath).toMatchObject({ round: 1, contenders: [0, 1], winners: null });
    // Ana hits, Bo misses: Ana wins; totals are untouched by the shoot-out.
    const before = m.players.map(p => [p.totalScore, p.bodyHits]);
    expect(shoot(m, 'body')).toBe(0);
    expect(m.state).toBe('handover');
    expect(shoot(m, 'miss')).toBe(1);
    expect(m.state).toBe('match_result');
    expect(m.isMatchComplete).toBe(true);
    expect(m.getWinners().map(w => w.name)).toEqual(['Ana']);
    expect(m.players.map(p => [p.totalScore, p.bodyHits])).toEqual(before);
  });

  it('keeps Jonh still within a shoot-out round, then moves him and rotates the order for the next', () => {
    const m = new MultiplayerMatchMachine(players(2), ['backyard'], fixed, { suddenDeath: true });
    playRound(m, () => 'hat_only');
    m.nextRound();
    const spot = m.activePositionId;
    shoot(m, 'body');
    expect(m.activePositionId).toBe(spot); // Bo faces the same spot Ana hit
    shoot(m, 'body');
    expect(m.suddenDeath).toMatchObject({ round: 2, contenders: [1, 0] });
    expect(m.activePositionId).not.toBe(spot);
    expect(shoot(m, 'miss')).toBe(1);
    expect(shoot(m, 'hat_only')).toBe(0);
    expect(m.getWinners().map(w => w.name)).toEqual(['Ana']);
  });

  it('ranks a trick shot above a plain hit, and shares the win after the last shoot-out round', () => {
    const trick = new MultiplayerMatchMachine(players(2), ['backyard'], fixed, { suddenDeath: true });
    playRound(trick, () => 'miss');
    trick.nextRound();
    shoot(trick, 'body');
    shoot(trick, 'ricochet_body');
    expect(trick.getWinners().map(w => w.name)).toEqual(['Bo']);

    const level = new MultiplayerMatchMachine(players(2), ['backyard'], fixed, { suddenDeath: true });
    playRound(level, () => 'miss');
    level.nextRound();
    for (let r = 0; r < MULTIPLAYER.suddenDeathRounds; r++) { shoot(level, 'miss'); shoot(level, 'miss'); }
    expect(level.state).toBe('match_result');
    expect(level.suddenDeath?.round).toBe(MULTIPLAYER.suddenDeathRounds);
    expect(level.getWinners().map(w => w.name)).toEqual(['Ana', 'Bo']);
  });

  it('only the players level at the top go to the shoot-out; a clear winner never does', () => {
    const three = new MultiplayerMatchMachine(players(3), ['backyard'], fixed, { suddenDeath: true });
    playRound(three, p => (p === 2 ? 'miss' : 'body'));
    three.nextRound();
    expect(three.suddenDeath?.contenders).toEqual([0, 1]);
    shoot(three, 'miss');
    shoot(three, 'hat_only');
    expect(three.getWinners().map(w => w.name)).toEqual(['Bo']);

    // Equal points but more body hits wins outright (the existing tie-break): Ana 200 with one hit
    // (five hats and a hit), Bo 200 with two hits.
    const clear = new MultiplayerMatchMachine(players(2), ['fence', 'backyard'], fixed, { suddenDeath: true });
    const anaShots: ClassifiedOutcome[] = ['hat_only', 'hat_only', 'hat_only', 'body', 'hat_only', 'hat_only'];
    const boShots: ClassifiedOutcome[] = ['body', 'body', 'miss', 'miss', 'miss', 'miss'];
    playRound(clear, p => (p === 0 ? anaShots : boShots).shift()!);
    clear.nextRound();
    playRound(clear, p => (p === 0 ? anaShots : boShots).shift()!);
    clear.nextRound();
    expect(clear.players.map(p => [p.totalScore, p.bodyHits])).toEqual([[200, 1], [200, 2]]);
    expect(clear.state).toBe('match_result');
    expect(clear.suddenDeath).toBeNull();
    expect(clear.getWinners().map(w => w.name)).toEqual(['Bo']);
  });

  it('tells the round summary when a shoot-out comes next', () => {
    const level = new MultiplayerMatchMachine(players(2), ['fence', 'backyard'], fixed, { suddenDeath: true });
    playRound(level, () => 'miss');
    expect(level.suddenDeathNext).toBe(false); // not the last round yet
    level.nextRound();
    playRound(level, () => 'body');
    expect(level.suddenDeathNext).toBe(true);
    level.nextRound();
    expect(level.suddenDeathNext).toBe(false); // it has started

    const off = new MultiplayerMatchMachine(players(2), ['backyard'], fixed);
    playRound(off, () => 'body');
    expect(off.suddenDeathNext).toBe(false);
  });

  it('rematch clears the shoot-out', () => {
    const m = new MultiplayerMatchMachine(players(2), ['backyard'], fixed, { suddenDeath: true });
    playRound(m, () => 'miss');
    m.nextRound();
    shoot(m, 'body');
    shoot(m, 'miss');
    m.rematch();
    expect(m.suddenDeath).toBeNull();
    expect(m.state).toBe('handover');
    expect(m.isMatchComplete).toBe(false);
  });
});

describe('sudden-death callouts', () => {
  const names = ['Ana', 'Bo', 'Cy'];
  const sd = (outcomes: Array<[number, ClassifiedOutcome]>, contenders = [0, 1], round = 1) => ({ round, contenders, outcomes: new Map(outcomes) });
  it('say what each shoot-out shot needs', async () => {
    const { suddenDeathStakes } = await import('../src/rules/matchStakes');
    expect(suddenDeathStakes(sd([]), names, 0, false)).toEqual({ kicker: 'Sudden death', line: 'One shot each. Best hit wins.', decisive: true });
    expect(suddenDeathStakes(sd([], [1, 0], 3), names, 1, true).line).toBe('Last chance: level again and you share it.');
    expect(suddenDeathStakes(sd([], [1, 0], 2), names, 1, false).kicker).toBe('Sudden death · round 2');
    expect(suddenDeathStakes(sd([[0, 'miss']]), names, 1, false).line).toBe('Any hit wins it!');
    expect(suddenDeathStakes(sd([[0, 'hat_only']]), names, 1, false).line).toBe('Hit him to win! His hat ties.');
    expect(suddenDeathStakes(sd([[0, 'body']]), names, 1, false).line).toBe('A hit ties it. A trick shot wins it!');
    expect(suddenDeathStakes(sd([[0, 'ricochet_body']]), names, 1, false).line).toBe('Only a trick shot ties it!');
    // With a third contender still to shoot, it names the leader instead.
    expect(suddenDeathStakes(sd([[0, 'body']], [0, 1, 2]), names, 1, false).line).toBe('Ana hit him. Match it!');
    expect(suddenDeathStakes(sd([[0, 'miss']], [0, 1, 2]), names, 1, false).line).toBe('Nobody has hit him yet.');
  });
});
