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
  /** Dragging through half of the canvas height covers the entire angle range. */
  dragDegreesPerCanvasHeight: 160,
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

export const JUICE = {
  freezeSeconds: 0.08,
  slowSeconds: 0.24,
  slowScale: 0.35,
  shakeSeconds: 0.12,
  shakePixels: 3,
  zoomSeconds: 0.18,
  zoomScale: 1.03,
  labelSeconds: 0.7,
  labelPopSeconds: 0.12,
  labelSizePx: 42,
  labelMarginPx: 100,
  labelOffsetXPx: -100,
  flashSeconds: 0.06,
  flashRadiusPx: 22,
  smokeSeconds: 0.32,
  recoilSeconds: 0.22,
  recoilPixels: 8,
  compressionSeconds: 0.07,
  reboundSeconds: 0.09,
  squashAmount: 0.22,
  burstSeconds: 0.55,
  burstCount: 18,
  burstSpeedPx: 95,
  burstGravityPx: 180,
  tumbleSlidePx: 20,
  labelStartScale: 0.6,
  labelStrokePx: 6,
  shakeFrequencyX: 170,
  shakeFrequencyY: 137,
  smokeCount: 3,
  smokeSpacingPx: 8,
  smokeRisePx: 30,
  smokeOffsetYPx: 4,
  smokeRadiusPx: 5,
  smokeGrowthPx: 12,
  smokeAlpha: 0.6,
  starRadiusPx: 5,
  fleckWidthPx: 4,
  fleckHeightPx: 3,
  dustRadiusPx: 4,
  dustGrowthPx: 8,
} as const;

export const FLOW = {
  shotResultSeconds: 1.4,
  handoverSeconds: 1.2,
  roundResultSeconds: 2.4,
  /** Ignore background-tab catch-up for presentation timers. */
  maxFrameSeconds: 0.1,
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
  overheadGlareSeconds: 1.2,
  overheadAltitudeMarginMetres: 2.8,
} as const;

export const SCORING = {
  ricochetBodyPoints: 125,
  bodyPoints: 100,
  hatOnlyPoints: 20,
  missPoints: 0,
} as const;

/** Local multiplayer format (SPEC §6) and the allowed player appearance domain. */
export const MULTIPLAYER = {
  minPlayers: 2,
  maxPlayers: 4,
  shotsPerRound: 3,
  /** One map per round, in order. PROPOSED. */
  maps: ['backyard', 'fence', 'rooftop'],
  maxNameLength: 16,
  /** Cannon colour palette; the index doubles as the default for that player slot. */
  colors: [0xff4444, 0x4444ff, 0x44ff44, 0xffaa00],
  /** Cannon patterns (never colour alone); the index doubles as the default for that player slot. */
  patterns: ['solid', 'stripes', 'dots', 'checks'],
  /** Decorative inactive cannon slots: render-only, in the earth strip below the ground surface. */
  slots: {
    startXPx: 24,
    spacingPx: 280,
    yPx: 538,
    barrelWidthPx: 44,
    barrelHeightPx: 14,
    labelFontPx: 13,
  },
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
