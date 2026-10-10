import { describe, it, expect } from 'vitest';
import { MultiplayerMatchMachine, type MPPlayerSetup } from '../src/rules/multiplayerMatch';

/** A three-map tour; the machine plays whichever maps it is given, in order. */
const MP_MAPS = ['backyard', 'fence', 'rooftop'];
import { MULTIPLAYER } from '../src/config/tuning';
import type { ClassifiedOutcome } from '../src/sim/classification';

describe('MultiplayerMatchMachine', () => {
  function makeSetups(n: number): MPPlayerSetup[] {
    const defaultPatterns = MULTIPLAYER.patterns;
    const defaultColors = MULTIPLAYER.colors;
    return Array.from({ length: n }, (_, i) => ({
      name: `Player ${i + 1}`,
      color: defaultColors[i]!,
      pattern: defaultPatterns[i]!,
      lastAngle: 40 + i * 5,
      lastPower: 50 + i * 5,
    }));
  }

  it('validates player count bounds (2..4)', () => {
    expect(() => new MultiplayerMatchMachine(makeSetups(1))).toThrow(RangeError);
    expect(() => new MultiplayerMatchMachine(makeSetups(5))).toThrow(RangeError);
    expect(() => new MultiplayerMatchMachine(makeSetups(2))).not.toThrow();
    expect(() => new MultiplayerMatchMachine(makeSetups(3))).not.toThrow();
    expect(() => new MultiplayerMatchMachine(makeSetups(4))).not.toThrow();
  });

  it('plays a selected map with alternating shots, then rematches on the same map', () => {
    const mapChoice = ['rooftop'];
    const machine = new MultiplayerMatchMachine(makeSetups(2), mapChoice);
    mapChoice[0] = 'backyard';
    expect(machine.currentMapId).toBe('rooftop');
    expect(machine.roundCount).toBe(1);
    const shooters: number[] = [];
    for (let shot = 0; shot < 6; shot++) {
      shooters.push(machine.activePlayerIndex);
      machine.startAiming();
      machine.fire(45, 50);
      machine.resolveShot('body');
      machine.continueFromResult();
    }
    expect(shooters).toEqual([0, 1, 0, 1, 0, 1]);
    expect(machine.state).toBe('round_result');
    machine.nextRound();
    expect(machine.state).toBe('match_result');
    expect(machine.players.map(p => p.totalScore)).toEqual([300, 300]);
    machine.rematch();
    expect(machine.currentMapId).toBe('rooftop');
    expect(machine.players.map(p => p.roundScores)).toEqual([[0], [0]]);
  });

  it('rejects empty, duplicate and unsupported map choices', () => {
    for (const maps of [[], ['unknown'], ['fence', 'fence']]) {
      expect(() => new MultiplayerMatchMachine(makeSetups(2), maps)).toThrow(RangeError);
    }
  });

  // Table-driven N = 2, 3, 4
  const playerCounts = [2, 3, 4] as const;
  describe.each(playerCounts)('with N = %d players', (N) => {
    it('executes EXACT 3 shots each across all 3 maps, starts each round with r % N, and early hits do not truncate the round', () => {
      const setups = makeSetups(N);
      const machine = new MultiplayerMatchMachine(setups, MP_MAPS);

      expect(machine.state).toBe('handover');
      expect(machine.roundIndex).toBe(0);
      expect(machine.currentMapId).toBe(MP_MAPS[0]);

      // Loop through all 3 maps / rounds
      for (let round = 0; round < 3; round++) {
        expect(machine.roundIndex).toBe(round);
        expect(machine.currentMapId).toBe(MP_MAPS[round]);

        const expectedStartingPlayer = round % N;
        const totalShotsInRound = MULTIPLAYER.shotsPerRound * N; // 3 * N
        const playerShotCounts = new Array(N).fill(0);

        for (let shotIndex = 0; shotIndex < totalShotsInRound; shotIndex++) {
          const expectedPlayerIndex = (expectedStartingPlayer + shotIndex) % N;
          expect(machine.activePlayerIndex).toBe(expectedPlayerIndex);
          expect(machine.state).toBe('handover');

          // Handover guards: cannot fire or aim
          expect(machine.fire(45, 50)).toBe(false);
          expect(machine.updateAim(45, 50)).toBe(false);

          machine.startAiming();
          expect(machine.state).toBe('aiming');

          // Aim adjustment accepted in aiming
          expect(machine.updateAim(50, 60)).toBe(true);

          // Fire transitions to simulating
          expect(machine.fire(52, 62)).toBe(true);
          expect(machine.state).toBe('simulating');
          expect(machine.lastShooterIndex).toBe(expectedPlayerIndex);

          // Simulating guards: cannot update aim or fire again
          expect(machine.updateAim(45, 50)).toBe(false);
          expect(machine.fire(45, 50)).toBe(false);

          // Resolve shot: early body hits on shot 0 do NOT truncate the round
          const outcome: ClassifiedOutcome = (shotIndex === 0) ? 'body' : 'miss';
          expect(machine.resolveShot(outcome)).toBe(true);
          expect(machine.state).toBe('result');

          // Duplicate scoring rejected
          expect(machine.resolveShot('body')).toBe(false);

          // Result guards: cannot update aim or fire
          expect(machine.updateAim(45, 50)).toBe(false);
          expect(machine.fire(45, 50)).toBe(false);

          playerShotCounts[expectedPlayerIndex]++;

          // Advance from result
          machine.continueFromResult();

          if (shotIndex < totalShotsInRound - 1) {
            expect(machine.isRoundComplete).toBe(false);
            expect(machine.state).toBe('handover');
          }
        }

        // Each player must have had EXACTLY 3 shots in this round
        for (let p = 0; p < N; p++) {
          expect(playerShotCounts[p]).toBe(3);
        }

        expect(machine.isRoundComplete).toBe(true);
        expect(machine.state).toBe('round_result');

        // Next round transition
        machine.nextRound();

        if (round < 2) {
          expect(machine.isMatchComplete).toBe(false);
          expect(machine.state).toBe('handover');
        } else {
          expect(machine.isMatchComplete).toBe(true);
          expect(machine.state).toBe('match_result');
        }
      }

      // Rematch resets scores while preserving names, appearances, and saved aims
      const originalNames = machine.players.map(p => p.name);
      const originalColors = machine.players.map(p => p.color);
      const originalPatterns = machine.players.map(p => p.pattern);

      machine.rematch();
      expect(machine.state).toBe('handover');
      expect(machine.roundIndex).toBe(0);
      expect(machine.currentMapId).toBe(MP_MAPS[0]);

      for (let p = 0; p < N; p++) {
        const player = machine.players[p]!;
        expect(player.totalScore).toBe(0);
        expect(player.bodyHits).toBe(0);
        expect(player.roundScores).toEqual([0, 0, 0]);
        expect(player.name).toBe(originalNames[p]);
        expect(player.color).toBe(originalColors[p]);
        expect(player.pattern).toBe(originalPatterns[p]);
        expect(player.lastAngle).toBe(52); // preserved from last fire
        expect(player.lastPower).toBe(62); // preserved from last fire
      }
    });
  });

  it('determines winner ties using valid outcomes through full match (4 ricochet vs 5 body)', () => {
    // 2 players across 3 rounds (6 shots each)
    const machine = new MultiplayerMatchMachine(makeSetups(2), MP_MAPS);

    // Player 0 will achieve 4 ricochet_body (4 * 125 = 500 pts, 4 bodyHits) + 5 misses = 500 pts
    // Player 1 will achieve 5 body hits (5 * 100 = 500 pts, 5 bodyHits) + 4 misses = 500 pts
    let p0HitsLeft = 4;
    let p1HitsLeft = 5;

    for (let round = 0; round < 3; round++) {
      const startP = round % 2;
      for (let shot = 0; shot < 6; shot++) {
        const shooter = (startP + shot) % 2;
        machine.startAiming();
        machine.fire(45, 50);

        let outcome: ClassifiedOutcome = 'miss';
        if (shooter === 0 && p0HitsLeft > 0) {
          outcome = 'ricochet_body';
          p0HitsLeft--;
        } else if (shooter === 1 && p1HitsLeft > 0) {
          outcome = 'body';
          p1HitsLeft--;
        }

        machine.resolveShot(outcome);
        machine.continueFromResult();
      }
      machine.nextRound();
    }

    expect(machine.state).toBe('match_result');
    const p0 = machine.players[0]!;
    const p1 = machine.players[1]!;

    expect(p0.totalScore).toBe(500);
    expect(p0.bodyHits).toBe(4);
    expect(p1.totalScore).toBe(500);
    expect(p1.bodyHits).toBe(5);

    // Tie broken by body hits: Player 1 has 5 body hits vs 4 body hits
    const winners = machine.getWinners();
    expect(winners.length).toBe(1);
    expect(winners[0]!.name).toBe('Player 2');
  });

  it('handles shared win when both score and body hits are equal', () => {
    const machine = new MultiplayerMatchMachine(makeSetups(2), MP_MAPS);

    // Both players achieve 4 ricochet hits = 500 pts each, 4 body hits each
    let p0HitsLeft = 4;
    let p1HitsLeft = 4;

    for (let round = 0; round < 3; round++) {
      const startP = round % 2;
      for (let shot = 0; shot < 6; shot++) {
        const shooter = (startP + shot) % 2;
        machine.startAiming();
        machine.fire(45, 50);

        let outcome: ClassifiedOutcome = 'miss';
        if (shooter === 0 && p0HitsLeft > 0) {
          outcome = 'ricochet_body';
          p0HitsLeft--;
        } else if (shooter === 1 && p1HitsLeft > 0) {
          outcome = 'ricochet_body';
          p1HitsLeft--;
        }

        machine.resolveShot(outcome);
        machine.continueFromResult();
      }
      machine.nextRound();
    }

    const winners = machine.getWinners();
    expect(winners.length).toBe(2);
    expect(winners.map(w => w.name)).toEqual(['Player 1', 'Player 2']);
  });

  it('prevents external mutation of internal player score arrays', () => {
    const machine = new MultiplayerMatchMachine(makeSetups(2), MP_MAPS);
    const players = machine.players;
    // Attempting to mutate returned roundScores copy
    (players[0]!.roundScores as number[])[0] = 999;
    expect(machine.players[0]!.roundScores[0]).toBe(0);
  });
});
