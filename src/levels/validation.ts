import type { Box2D } from '../sim/swept';
import { levelPhysics } from './levelPhysics';
import type { LevelData } from './types';

export interface ValidationConfig {
  maxSpeedMs: number;
  dtSeconds: number;
  minThicknessMetres: number;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

function boxThickness(box: Box2D): { width: number; height: number; minThickness: number } {
  const width = Math.abs(box.maxX - box.minX);
  const height = Math.abs(box.maxY - box.minY);
  return {
    width,
    height,
    minThickness: Math.min(width, height),
  };
}

export function validateLevel(level: LevelData, config: ValidationConfig): ValidationResult {
  const errors: string[] = [];
  // A map that scales the cannon up needs thicker colliders than the global top speed implies.
  const maxSpeed = Math.max(config.maxSpeedMs, levelPhysics(level).maxSpeedMs);
  const requiredThickness = Math.max(
    config.minThicknessMetres,
    maxSpeed * config.dtSeconds,
  );

  // 1. Bounds check
  if (level.bounds.maxX <= level.bounds.minX || level.bounds.maxY <= level.bounds.minY) {
    errors.push(`Invalid level bounds: [${level.bounds.minX}, ${level.bounds.maxX}] x [${level.bounds.minY}, ${level.bounds.maxY}]`);
  }

  // 2. Cannon spawn inside bounds
  if (
    level.cannonSpawn.x < level.bounds.minX ||
    level.cannonSpawn.x > level.bounds.maxX ||
    level.cannonSpawn.y < level.bounds.minY ||
    level.cannonSpawn.y > level.bounds.maxY
  ) {
    errors.push(`Cannon spawn (${level.cannonSpawn.x}, ${level.cannonSpawn.y}) is outside level bounds`);
  }

  // 3. Ground thickness
  const groundThickness = boxThickness(level.ground);
  if (groundThickness.minThickness < requiredThickness) {
    errors.push(
      `Ground thickness (${groundThickness.minThickness.toFixed(3)}m) is less than required minimum (${requiredThickness.toFixed(3)}m)`,
    );
  }

  // 4. Jonh body thickness and bounds
  const jonhThickness = boxThickness(level.jonhSpawn.bodyBox);
  if (jonhThickness.minThickness < requiredThickness) {
    errors.push(
      `Jonh body thickness (${jonhThickness.minThickness.toFixed(3)}m) is less than required minimum (${requiredThickness.toFixed(3)}m)`,
    );
  }

  // 5. Obstacles
  for (const obs of level.obstacles) {
    const obsThickness = boxThickness(obs.box);
    if (obsThickness.minThickness < requiredThickness) {
      errors.push(
        `Obstacle "${obs.id}" thickness (${obsThickness.minThickness.toFixed(3)}m) is less than required minimum (${requiredThickness.toFixed(3)}m)`,
      );
    }
  }

  // 6. Reference solutions
  if (!level.referenceSolutions || level.referenceSolutions.length === 0) {
    errors.push('Level has no reference solutions');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
