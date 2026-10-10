import { describe, expect, it, vi } from 'vitest';
import { MAPS } from '../src/levels';
import { MultiplayerMatchMachine } from '../src/rules/multiplayerMatch';
import { MultiCoordinator } from '../src/rules/multiCoordinator';
import { ShotAttemptMachine } from '../src/rules/shotAttempt';
import { SessionCoordinator } from '../src/rules/sessionCoordinator';
import { PHYSICS } from '../src/config/tuning';
import type { ClassifiedOutcome } from '../src/sim/classification';

const setups = (count: number) => Array.from({ length: count }, (_, i) => ({
  name: `Player ${i + 1}`, color: i, pattern: 'solid', lastAngle: 45, lastPower: 50,
}));

function takeShot(match: MultiplayerMatchMachine, outcome: ClassifiedOutcome): void {
  match.startAiming();
  expect(match.fire(65, 40)).toBe(true);
  expect(match.resolveShot(outcome)).toBe(true);
  match.continueFromResult();
}

describe('Jonh moves only when he is hit', () => {
  it.each([2, 3, 4])('never moves through a whole round of misses with %i players', count => {
    const match = new MultiplayerMatchMachine(setups(count), ['rooftop'], () => 0);
    const start = match.activePositionId;
    for (let shot = 0; shot < 3 * count; shot++) {
      expect(match.activePositionId).toBe(start);
      takeShot(match, shot % 2 === 0 ? 'miss' : 'hat_only');
    }
    expect(match.moveCount).toBe(0);
    expect(match.activePositionId).toBe(start);
  });

  it.each(['body', 'ricochet_body'] as const)('moves to the next position after a %s hit, not before', outcome => {
    const match = new MultiplayerMatchMachine(setups(2), ['rooftop'], () => 0);
    const order = MAPS.find(m => m.id === 'rooftop')!.multiplayerPositions.map(p => p.id);
    const first = match.activePositionId;
    match.startAiming();
    match.fire(65, 40);
    match.resolveShot(outcome);
    expect(match.activePositionId).toBe(first); // the result still shows the old spot
    expect(match.moveCount).toBe(0);
    match.continueFromResult();
    expect(match.moveCount).toBe(1);
    expect(match.activePositionId).not.toBe(first);
    expect(order).toContain(match.activePositionId);
  });

  it('keeps moving through every position and wraps around', () => {
    const match = new MultiplayerMatchMachine(setups(4), ['rooftop'], () => 0);
    const visited: string[] = [match.activePositionId];
    for (let hit = 0; hit < 3; hit++) {
      takeShot(match, 'body');
      visited.push(match.activePositionId);
    }
    expect(new Set(visited.slice(0, 3)).size).toBe(3);
    expect(visited[3]).toBe(visited[0]);
    expect(visited[3]).not.toBe(visited[2]);
  });

  it('stays after a miss that follows a hit', () => {
    const match = new MultiplayerMatchMachine(setups(2), ['rooftop'], () => 0);
    takeShot(match, 'body');
    const moved = match.activePositionId;
    takeShot(match, 'miss');
    takeShot(match, 'miss');
    expect(match.activePositionId).toBe(moved);
    expect(match.moveCount).toBe(1);
  });

  it('starts every round and rematch at the first position, drawing the shuffle once per map', () => {
    const random = vi.fn(() => 0);
    const maps = MAPS.slice(0, 3).map(m => m.id);
    const match = new MultiplayerMatchMachine(setups(2), maps, random);
    expect(random).toHaveBeenCalledTimes(6);
    for (let round = 0; round < 3; round++) {
      expect(match.moveCount).toBe(0);
      const start = match.activePositionId;
      takeShot(match, 'body');
      expect(match.activePositionId).not.toBe(start);
      for (let shot = 1; shot < 6; shot++) takeShot(match, 'miss');
      expect(match.state).toBe('round_result');
      match.nextRound();
    }
    expect(random).toHaveBeenCalledTimes(6);
    expect(match.state).toBe('match_result');
    match.rematch();
    expect(random).toHaveBeenCalledTimes(12);
    expect(match.moveCount).toBe(0);
    expect(match.activeCycleIndex).toBe(0);
  });

  it('shuffles reproducibly and reshuffles a selected-map rematch', () => {
    let value = 0;
    const match = new MultiplayerMatchMachine(setups(2), ['rooftop'], () => value);
    const sequence = () => {
      const result: string[] = [match.activePositionId];
      for (let shot = 0; shot < 2; shot++) {
        takeShot(match, 'body');
        result.push(match.activePositionId);
      }
      takeShot(match, 'miss');
      takeShot(match, 'miss');
      takeShot(match, 'miss');
      takeShot(match, 'miss');
      match.nextRound();
      return result;
    };
    expect(sequence()).toEqual(['middle', 'far', 'near']);
    value = 0.999;
    match.rematch();
    expect(sequence()).toEqual(['near', 'middle', 'far']);
  });

  it('aim resets and pause/resume preserve the position; a hit moves him only after the result', () => {
    const match = new MultiplayerMatchMachine(setups(2), ['backyard'], () => 0);
    const attempt = new ShotAttemptMachine(25.6, 0.05, 0.5, 15, 1);
    const coordinator = new MultiCoordinator(attempt, match, { onStateChange: vi.fn(), onShotFired: vi.fn() });
    const session = new SessionCoordinator({ onPause: vi.fn(), onResume: vi.fn(), onQuit: vi.fn() });
    const firstPosition = match.activePositionId;
    coordinator.beginTurn(45, 50);
    coordinator.reset(45, 50);
    coordinator.reset(45, 50);
    session.requestPause(true);
    session.resume();
    expect(match.activePositionId).toBe(firstPosition);
    coordinator.fire(45, 50);
    coordinator.reset(45, 50);
    expect(match.activePositionId).toBe(firstPosition);
    attempt.step(PHYSICS.fixedStepSeconds, { x: 18, y: 2, speed: 10, hitBody: true, hitHat: false });
    expect(coordinator.resolveShot('body')).toBe(true);
    expect(coordinator.resolveShot('body')).toBe(false);
    expect(match.activePositionId).toBe(firstPosition);
    coordinator.reset(45, 50);
    expect(match.moveCount).toBe(1);
    expect(match.activePositionId).not.toBe(firstPosition);
    const nextPosition = match.activePositionId;
    coordinator.reset(45, 50);
    expect(match.activePositionId).toBe(nextPosition);
  });
});
