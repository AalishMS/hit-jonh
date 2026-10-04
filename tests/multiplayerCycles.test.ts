import { describe, expect, it, vi } from 'vitest';
import { MAPS } from '../src/levels';
import { MultiplayerMatchMachine } from '../src/rules/multiplayerMatch';
import { MultiCoordinator } from '../src/rules/multiCoordinator';
import { ShotAttemptMachine } from '../src/rules/shotAttempt';
import { SessionCoordinator } from '../src/rules/sessionCoordinator';
import { PHYSICS } from '../src/config/tuning';

const setups = (count: number) => Array.from({ length: count }, (_, i) => ({
  name: `Player ${i + 1}`, color: i, pattern: 'solid', lastAngle: 45, lastPower: 50,
}));

describe('Multiplayer position cycles', () => {
  it.each([2, 3, 4])('shares each position for a full cycle with %i players', count => {
    const random = vi.fn(() => 0);
    const match = new MultiplayerMatchMachine(setups(count), undefined, random);
    expect(random).toHaveBeenCalledTimes(6);
    for (let round = 0; round < 3; round++) {
      const positions: string[] = [];
      for (let cycle = 0; cycle < 3; cycle++) {
        const position = match.activePositionId;
        positions.push(position);
        for (let player = 0; player < count; player++) {
          expect(match.activePlayerIndex).toBe((round + player) % count);
          expect(match.activeCycleIndex).toBe(cycle);
          expect(match.activePositionId).toBe(position);
          match.startAiming();
          expect(match.fire(65, 40)).toBe(true);
          match.resolveShot('body');
          expect(match.activeCycleIndex).toBe(cycle);
          expect(match.activePositionId).toBe(position);
          expect(match.resolveShot('body')).toBe(false);
          match.continueFromResult();
          const nextPosition = match.activePositionId;
          match.continueFromResult();
          expect(match.activePositionId).toBe(nextPosition);
        }
      }
      expect(new Set(positions).size).toBe(3);
      expect([...positions].sort()).toEqual(MAPS[round]!.multiplayerPositions!.map(p => p.id).sort());
      expect(match.players.every(p => p.roundScores[round] === 300)).toBe(true);
      match.nextRound();
    }
    expect(random).toHaveBeenCalledTimes(6);
    expect(match.state).toBe('match_result');
    match.rematch();
    expect(random).toHaveBeenCalledTimes(12);
    expect(match.activeCycleIndex).toBe(0);
    expect(match.players.every(p => p.totalScore === 0 && p.lastAngle === 65 && p.lastPower === 40)).toBe(true);
  });

  it('shuffles reproducibly and reshuffles a selected-map rematch', () => {
    let value = 0;
    const match = new MultiplayerMatchMachine(setups(2), ['rooftop'], () => value);
    const sequence = () => {
      const result: string[] = [];
      for (let cycle = 0; cycle < 3; cycle++) {
        result.push(match.activePositionId);
        for (let player = 0; player < 2; player++) {
          match.startAiming(); match.fire(45, 50); match.resolveShot('miss'); match.continueFromResult();
        }
      }
      match.nextRound();
      return result;
    };
    expect(sequence()).toEqual(['middle', 'far', 'near']);
    value = 0.999;
    match.rematch();
    expect(sequence()).toEqual(['near', 'middle', 'far']);
  });

  it('aim resets and pause/resume preserve positions and advance only through handover', () => {
    const match = new MultiplayerMatchMachine(setups(2), ['backyard'], () => 0);
    const attempt = new ShotAttemptMachine(25.6, 0.05, 0.5, 15, 1);
    const coordinator = new MultiCoordinator(attempt, match, { onStateChange: vi.fn(), onShotFired: vi.fn() });
    const session = new SessionCoordinator({ onPause: vi.fn(), onResume: vi.fn(), onQuit: vi.fn() });
    const firstPosition = match.activePositionId;
    for (let player = 0; player < 2; player++) {
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
    }
    expect(match.activeCycleIndex).toBe(1);
    expect(match.activePositionId).not.toBe(firstPosition);
    const nextPosition = match.activePositionId;
    coordinator.reset(45, 50);
    expect(match.activePositionId).toBe(nextPosition);
  });
});
