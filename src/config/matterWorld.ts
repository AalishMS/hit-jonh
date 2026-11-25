import { PHYSICS, WORLD } from './tuning';
import { matterGravityY } from '../sim/units';

/**
 * The game's Matter world config for Phaser (main.ts). Pure, so tests can check it matches the
 * physics they prove: in particular the contact solver constants (PHYSICS.matterSolver), which
 * Phaser would otherwise set to its own values for the game only.
 */
export function matterWorldConfig(debug: boolean) {
  return {
    // Simulation is stepped manually from a fixed-step accumulator (SPEC.md §7).
    autoUpdate: false,
    gravity: {
      x: 0,
      y: matterGravityY(PHYSICS.gravity, WORLD.pixelsPerMetre, PHYSICS.matterGravityScale),
    },
    enableSleeping: false,
    ...PHYSICS.matterSolver,
    debug,
  };
}
