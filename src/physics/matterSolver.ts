import Matter from '@matter-js';
import { PHYSICS } from '../config/tuning';

type ResolverGlobals = Record<'_restingThresh' | '_restingThreshTangent' | '_positionDampen' | '_positionWarming' | '_frictionNormalMultiplier', number>;

/**
 * Puts PHYSICS.matterSolver on a Matter `Resolver` (its constants are module globals). The game's
 * Phaser world gets the same values through the scene config in main.ts, so the game, the headless
 * runner, the shot recorder and the tests all solve contacts alike.
 */
export function applyMatterSolver(resolver: unknown = Matter.Resolver): void {
  const r = resolver as ResolverGlobals;
  const s = PHYSICS.matterSolver;
  r._restingThresh = s.restingThresh;
  r._restingThreshTangent = s.restingThreshTangent;
  r._positionDampen = s.positionDampen;
  r._positionWarming = s.positionWarming;
  r._frictionNormalMultiplier = s.frictionNormalMultiplier;
}

applyMatterSolver();
