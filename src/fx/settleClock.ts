import { FX } from '../config/tuning';

/**
 * Fast-forward for the boring end of a missed shot: once the ball has landed and is only rolling
 * to a stop, presentation time runs faster so the next attempt comes sooner.
 *
 * Presentation only. The scene feeds `realSeconds × scale` to the FixedStepper (with a matching
 * step cap), exactly like the hit-stop/slow motion does in reverse: the fixed step never changes,
 * so the flight, contacts and outcome are identical to an unscaled run (SPEC §8.3).
 */
export interface SettleInput {
  /** The ball has touched the ground or an obstacle during this shot. */
  landed: boolean;
  speedMs: number;
  /** Shortest distance from the ball centre to Jonh's body box, in metres. */
  distanceToJonhMetres: number;
  /** A body contact, hit-stop or wind-up is running: never fast-forward through those. */
  impactActive: boolean;
}

/** The time scale this frame wants: 1 (real time) or FX.settleFastForward. */
export function fastForwardTarget(s: SettleInput): number {
  if (!s.landed || s.impactActive) return 1;
  // A crawling ball cannot meaningfully go anywhere; a rolling one only when it is clear of Jonh.
  if (s.speedMs <= FX.settleCrawlSpeedMs) return FX.settleFastForward;
  if (s.speedMs <= FX.settleRollSpeedMs && s.distanceToJonhMetres >= FX.settleClearMetres) return FX.settleFastForward;
  return 1;
}

/** Shortest distance from a point to an axis-aligned box (0 inside it). */
export function distanceToBox(x: number, y: number, box: { minX: number; maxX: number; minY: number; maxY: number }): number {
  const dx = Math.max(box.minX - x, 0, x - box.maxX);
  const dy = Math.max(box.minY - y, 0, y - box.maxY);
  return Math.hypot(dx, dy);
}

/** Eases the time scale toward its target so a speed change never reads as a hitch. */
export class SettleClock {
  private current = 1;

  get scale(): number { return this.current; }

  /** True once the clock is (mostly) fast-forwarding: the shot is just rolling to a stop. */
  get isFastForwarding(): boolean { return this.current > 1.5; }

  advance(realSeconds: number, target: number): number {
    const k = Math.min(1, Math.max(0, realSeconds) * FX.settleEaseRate);
    this.current += (target - this.current) * k;
    if (Math.abs(target - this.current) < 0.02) this.current = target;
    return this.current;
  }

  reset(): void { this.current = 1; }
}
