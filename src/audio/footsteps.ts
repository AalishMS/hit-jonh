import { AUDIO, JONH_WALK } from '../config/tuning';

/**
 * Footstep timing for walking Jonh. The walk cycle is driven by the metres he has walked since Fire
 * (`RoutePose.distance`, a pure function of fixed steps), and one stride is `JONH_WALK.strideMetres`
 * with two steps in it. A foot lands each time that distance crosses a plant point, so the sounds follow
 * the legs exactly: they stop when he stops or is hit (the distance stops), restart with a replay and
 * never depend on frame rate.
 */

/** Plants at or before `distance`: foot k lands at (plantPhase + k/2) strides. */
export function plantsUpTo(distance: number, strideMetres: number = JONH_WALK.strideMetres,
  plantPhase: number = AUDIO.footstep.plantPhase): number {
  return Math.max(0, Math.floor((distance / strideMetres - plantPhase) * 2) + 1);
}

export class FootstepTracker {
  private last: number | null = null;

  constructor(
    private readonly strideMetres: number = JONH_WALK.strideMetres,
    private readonly plantPhase: number = AUDIO.footstep.plantPhase,
    private readonly maxPerFrame: number = AUDIO.footstep.maxPerFrame,
  ) {}

  /**
   * Feet (0 or 1, alternating from the first plant) that landed since the last call. A distance that
   * went backwards (shot reset, replay restarting) re-syncs silently; null (no route) clears the tracker.
   */
  update(pose: { distance: number; walking: boolean } | null): Array<0 | 1> {
    if (!pose) { this.last = null; return []; }
    const previous = this.last ?? pose.distance;
    this.last = pose.distance;
    if (pose.distance <= previous || !pose.walking) return [];
    const before = plantsUpTo(previous, this.strideMetres, this.plantPhase);
    const after = plantsUpTo(pose.distance, this.strideMetres, this.plantPhase);
    const feet: Array<0 | 1> = [];
    for (let n = Math.max(before, after - this.maxPerFrame); n < after; n++) feet.push((n % 2) as 0 | 1);
    return feet;
  }

  reset(): void { this.last = null; }
}
