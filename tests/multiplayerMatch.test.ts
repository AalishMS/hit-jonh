import { describe, it, expect } from 'vitest';
import { MultiplayerMatchMachine } from '../src/rules/multiplayerMatch';
import { SCORING } from '../src/config/tuning';

describe('MultiplayerMatchMachine', () => {
  it('initializes correctly with 2 players', () => {
    const machine = new MultiplayerMatchMachine([
      { name: 'A', color: 0, pattern: 'solid', lastAngle: 45, lastPower: 50 },
      { name: 'B', color: 1, pattern: 'stripes', lastAngle: 45, lastPower: 50 }
    ]);
    expect(machine.state).toBe('handover');
    expect(machine.roundIndex).toBe(0);
    expect(machine.currentMapId).toBe('backyard');
    expect(machine.activePlayerIndex).toBe(0);
  });

  it('rotates players correctly over a round', () => {
    const machine = new MultiplayerMatchMachine([
      { name: 'A', color: 0, pattern: 'solid', lastAngle: 45, lastPower: 50 },
      { name: 'B', color: 1, pattern: 'stripes', lastAngle: 45, lastPower: 50 }
    ]);

    expect(machine.activePlayer.name).toBe('A');
    
    // P0 turn 1
    machine.startAiming();
    machine.fire();
    machine.resolveShot(0, false);
    expect(machine.state).toBe('result');
    machine.nextTurn();
    
    // P1 turn 1
    expect(machine.state).toBe('handover');
    expect(machine.activePlayer.name).toBe('B');
    machine.startAiming();
    machine.fire();
    machine.resolveShot(SCORING.bodyPoints, true);
    machine.nextTurn();
    
    // P0 turn 2
    expect(machine.activePlayer.name).toBe('A');
    expect(machine.activePlayerShotNumber).toBe(1);
    
    // Fast forward to end of round
    for (let i = 0; i < 4; i++) {
      machine.startAiming();
      machine.fire();
      machine.resolveShot(0, false);
      if (i < 3) machine.nextTurn();
    }
    
    expect(machine.state).toBe('round_result');
    expect(machine.activePlayer.totalScore).toBe(0); // B's last shot
  });

  it('rotates starting player per round', () => {
    const machine = new MultiplayerMatchMachine([
      { name: 'A', color: 0, pattern: 'solid', lastAngle: 45, lastPower: 50 },
      { name: 'B', color: 1, pattern: 'stripes', lastAngle: 45, lastPower: 50 },
      { name: 'C', color: 2, pattern: 'dots', lastAngle: 45, lastPower: 50 }
    ]);

    // Round 0
    expect(machine.activePlayer.name).toBe('A');
    for (let i = 0; i < 9; i++) {
      machine.startAiming();
      machine.fire();
      machine.resolveShot(0, false);
      machine.nextTurn();
    }
    machine.nextRound();
    
    // Round 1
    expect(machine.roundIndex).toBe(1);
    expect(machine.currentMapId).toBe('fence');
    expect(machine.activePlayer.name).toBe('B');
    for (let i = 0; i < 9; i++) {
      machine.startAiming();
      machine.fire();
      machine.resolveShot(0, false);
      machine.nextTurn();
    }
    machine.nextRound();

    // Round 2
    expect(machine.roundIndex).toBe(2);
    expect(machine.activePlayer.name).toBe('C');
    for (let i = 0; i < 9; i++) {
      machine.startAiming();
      machine.fire();
      machine.resolveShot(0, false);
      machine.nextTurn();
    }
    
    // Match complete
    machine.nextRound();
    expect(machine.state).toBe('match_result');
  });

  it('determines winner correctly, breaking ties with body hits', () => {
    const machine = new MultiplayerMatchMachine([
      { name: 'A', color: 0, pattern: 'solid', lastAngle: 45, lastPower: 50 },
      { name: 'B', color: 1, pattern: 'stripes', lastAngle: 45, lastPower: 50 }
    ]);

    // A gets ricochet (125), but no body hit? Wait, ricochet_body is a body hit!
    machine.startAiming();
    machine.fire();
    machine.resolveShot(SCORING.ricochetBodyPoints, true);
    machine.nextTurn();

    // B gets body (100) + hat (20), but actually let's just use total score 125 with 2 body hits.
    machine.startAiming();
    machine.fire();
    machine.resolveShot(SCORING.bodyPoints, true);
    machine.nextTurn();

    machine.startAiming();
    machine.fire();
    machine.resolveShot(0, false);
    machine.nextTurn();

    // B gets hat? 25 isn't an outcome. Let's just say B gets hat (20). 100+20 = 120. B loses on score.
    machine.startAiming();
    machine.fire();
    machine.resolveShot(25, false); // Just injecting score for test
    machine.nextTurn();

    // Force tie condition
    machine.players[0]!.totalScore = 125;
    machine.players[0]!.bodyHits = 1;
    
    machine.players[1]!.totalScore = 125;
    machine.players[1]!.bodyHits = 2; // B has more body hits

    let winners = machine.getWinners();
    expect(winners.length).toBe(1);
    expect(winners[0]!.name).toBe('B');

    // Force shared tie
    machine.players[0]!.bodyHits = 2;
    winners = machine.getWinners();
    expect(winners.length).toBe(2);
  });
});





