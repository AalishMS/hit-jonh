/**
 * Central tuning values for Hit Jonh.
 *
 * Every gameplay/physics number that might be adjusted during playtesting
 * belongs here (or in level data), never inline in scenes or systems.
 * Values marked PROPOSED are defaults from SPEC.md, not approved decisions.
 */

export const WORLD = {
  /** Logical design resolution in pixels. The canvas is scaled to fit; physics never sees screen pixels. */
  designWidthPx: 1280,
  designHeightPx: 560,
  /** Pixels per metre in the logical (unscaled) world. PROPOSED. */
  pixelsPerMetre: 50,
} as const;

export const PHYSICS = {
  /** Downward gravity in m/s² (positive number; world-up is +y in simulation maths). */
  gravity: 9.81,
  /** Fixed simulation step in seconds. PROPOSED: 1/120, validate on target devices. */
  fixedStepSeconds: 1 / 120,
  /** Upper bound on simulation steps per rendered frame; excess backlog is dropped. */
  maxStepsPerFrame: 8,
  /** Matter's gravity.scale default; gravity.y is derived from this so units stay explicit. */
  matterGravityScale: 0.001,
  /**
   * Linear rolling damping factor applied per fixed step once the projectile contacts the ground.
   * Enables the cannonball to roll naturally to a stop on grass/turf.
   */
  groundRollingDamping: 0.985,
} as const;

export const PROJECTILE = {
  /** PROPOSED: cannonball radius in metres. */
  radiusMetres: 0.15,
  /** PROPOSED: cannonball mass in kilograms. */
  massKg: 4,
} as const;

export const AIM = {
  /** PROPOSED angle range in degrees above horizontal. Must allow every map to be solved. */
  minAngleDeg: 5,
  maxAngleDeg: 85,
  angleStepDeg: 1,
  /** Power is shown as a percentage 0–100. */
  powerStepPercent: 1,
  barrelLengthMetres: 1.2,
  muzzleGapMetres: 0.04,
  /**
   * PROPOSED launch impulse range in N·s; speed = impulse / mass.
   * With massKg = 4 this gives 6–20 m/s (45° flat range ≈ 3.7–40.8 m) for a
   * 25.6 m-wide world. Tune in Milestone 1.
   */
  minImpulseNs: 24,
  maxImpulseNs: 80,
} as const;

export const SHOT = {
  settledSpeedMs: 0.05,
  settledSeconds: 0.5,
  timeoutSeconds: 15,
  boundsMarginMetres: 1,
} as const;

/** Reversible art direction: a quiet, sunlit garden with inked cartoon figures. */
export const LOOK = {
  ink: 0x293c36,
  sky: 0xd8ebe6,
  cloud: 0xfaf8e9,
  distantGreen: 0xb6cbb0,
  hedge: 0x8eac86,
  grass: 0x72966a,
  earth: 0xc9b693,
  wood: 0x9c7450,
  shirt: 0xc76d43,
  trousers: 0x405d64,
  skin: 0xf0c299,
  paper: 0xfff9e6,
  hat: 0xd8b76e,
  accent: 0xc45032,
  trailSpacingPx: 10,
  strongImpactMs: 10,
  tumbleSeconds: 0.35,
  hatFlightSeconds: 0.85,
  paperFlightSeconds: 1,
  impactFlashSeconds: 0.22,
} as const;

export interface MaterialProps {
  restitution: number;
  friction: number;
}

export const MATERIALS = {
  grass: { restitution: 0.2, friction: 0.8 },
  wood: { restitution: 0.3, friction: 0.6 },
  concrete: { restitution: 0.4, friction: 0.5 },
  jonhBody: { restitution: 0.3, friction: 0.6 },
  cannonball: { restitution: 0.25, friction: 0.5 },
} as const satisfies Record<string, MaterialProps>;
