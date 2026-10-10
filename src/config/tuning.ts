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
   * Linear rolling damping factor applied per fixed step while the projectile rests on a top
   * surface (ground, roof, deck), unless that material sets its own `rollingDamping` [TUNE].
   */
  groundRollingDamping: 0.975,
  /**
   * Impacts faster than this (m/s into the surface) bounce with the material's restitution even
   * when Matter's contact solver already resolved them (it damps every material alike). Slower
   * contacts (resting, rolling) are left to Matter.
   */
  bounceMinNormalSpeedMs: 0.5,
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
  /** Pressing within this radius of the cannon pivot grabs the cannon directly. */
  grabRadiusPx: 70,
  /** Grab mode: pointer distance from the pivot mapped to 0–100 % power. */
  grabMinPx: 60,
  grabMaxPx: 380,
  /** Short analytic launch preview (seconds of flight shown); not a full trajectory (SPEC §3.2). */
  previewSeconds: 0.3,
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
  /** Body hits hold longer so Jonh's knock-back (and the replay) can land. Polish pass [TUNE]. */
  bodyHitResultSeconds: 2.6,
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
  maxNameLength: 16,
  /** Cannon colour palette; the index doubles as the default for that player slot. */
  colors: [0xff4444, 0x4444ff, 0x44ff44, 0xffaa00],
  /** Cannon patterns (never colour alone); the index doubles as the default for that player slot. */
  patterns: ['solid', 'stripes', 'dots', 'checks'],
  /** Decorative inactive cannon slots: render-only, in the earth strip below the ground surface. */
  slots: {
    startXPx: 260,
    spacingPx: 280,
    yPx: 538,
    barrelWidthPx: 44,
    barrelHeightPx: 14,
    labelFontPx: 13,
  },
} as const;

/** Map difficulty guard (tests/difficulty.test.ts) [TUNE]. */
export const DIFFICULTY = {
  /** Most of a coarse 5° × 5% aim grid that may score a body hit, per target position. */
  maxCoarseHitFraction: 0.08,
  /**
   * Trick maps: the least share of hits that must bounce off a ricochet surface first.
   * 1 = no direct line to Jonh at all.
   */
  minTrickShare: { bankshot: 1, trampoline: 0.9 } as Readonly<Record<string, number>>,
} as const;

export interface MaterialProps {
  restitution: number;
  friction: number;
  /** Ground only: per-step horizontal speed kept while rolling; PHYSICS.groundRollingDamping when omitted. */
  rollingDamping?: number;
}

export const MATERIALS = {
  grass: { restitution: 0.2, friction: 0.8 },
  wood: { restitution: 0.3, friction: 0.6 },
  concrete: { restitution: 0.4, friction: 0.5 },
  rubber: { restitution: 0.9, friction: 0.2 },
  /** Bounce maps [TUNE]: a trampoline gives back almost everything; steel rings off hard. */
  trampoline: { restitution: 1.0, friction: 0.3 },
  steel: { restitution: 0.75, friction: 0.3 },
  /** Soft canopy: catches the ball rather than bouncing it. */
  leaves: { restitution: 0.12, friction: 0.9 },
  rock: { restitution: 0.35, friction: 0.6 },
  /** Ball-stopping floors (driveway, roof gravel, sandpit, balcony rug): dead landings, short rolls. */
  gravel: { restitution: 0.15, friction: 0.9, rollingDamping: 0.88 },
  sand: { restitution: 0.1, friction: 0.9, rollingDamping: 0.88 },
  rug: { restitution: 0.15, friction: 0.9, rollingDamping: 0.88 },
  /** Moon dust: dead landings, and a rolling ball stops within a metre or two. */
  regolith: { restitution: 0.15, friction: 0.8, rollingDamping: 0.95 },
  jonhBody: { restitution: 0.3, friction: 0.6 },
  cannonball: { restitution: 0.25, friction: 0.5 },
} as const satisfies Record<string, MaterialProps>;

/**
 * Polish-pass presentation tuning [TUNE]. Deliberately mutable: the dev-only tuning panel
 * (?tune) edits these live. Simulation never reads them; they only shape presentation time,
 * camera and effects. Durations are real (unscaled) seconds.
 */
export const FX = {
  /** Hit-stop per hit quality (seconds frozen on the contact frame). */
  freezeTrick: 0.13,
  freezeStrong: 0.1,
  freezeWeak: 0.075,
  freezeHat: 0.045,
  /** Slow motion after the freeze: duration, speed, and ease back to full speed. */
  slowSeconds: 0.3,
  slowScale: 0.3,
  rampSeconds: 0.25,
  /** Directional camera shake along the ball's travel direction. */
  shakePx: 14,
  shakeSeconds: 0.4,
  shakeHz: 21,
  /** Zoom punch added on top of the impact framing, and how long it takes to settle. */
  zoomPunch: 0.14,
  punchSeconds: 0.35,
  /** Camera framing while Jonh reacts. */
  impactZoom: 1.6,
  flashFrames: 2,
  flashAlpha: 0.7,
  particles: 34,
  textSeconds: 1.0,
  /** Slow-motion replay of a body hit: playback speed and seconds of flight shown before contact. */
  replay: 1,
  replaySpeed: 0.4,
  replayLeadSeconds: 0.75,
  replayAfterSeconds: 1.1,
  /** Cannon anticipation: physics waits this long after Fire while the cannon winds up. */
  windupSeconds: 0.12,
  recoilPx: 18,
  /** Camera follow during flight. */
  flightZoomMin: 0.72,
  followRate: 5,
  /** Ball stretch along velocity at maximum launch speed. */
  ballStretch: 0.35,
};

/**
 * Online multiplayer (spec 2026-10-08). PROPOSED/TUNE except turnLimitSeconds (owner decision).
 * Imported by both the browser and the Convex functions.
 */
export const ONLINE = {
  /** Presence check-in interval. */
  heartbeatSeconds: 15,
  /** Show "Waiting for {name}…" once the active player is this quiet. */
  staleWarnSeconds: 60,
  /** Missing-player skip and lobby pruning. Above 60 s: Chrome throttles hidden-tab timers to ~1/min. */
  staleSeconds: 90,
  /** Show the turn countdown from here. */
  turnWarnSeconds: 90,
  /** A connected player's turn is skipped after this (owner decision). */
  turnLimitSeconds: 120,
  /**
   * After the turn limit, the server looks again this soon for a check-in proving someone is still connected
   * (every client checks in when its countdown reaches 0), instead of a whole heartbeat later.
   */
  turnLimitRecheckSeconds: 2,
  /** An unreported shot falls back to a spectator's outcome (or a miss) after this. */
  inFlightTimeoutSeconds: 40,
  /** Time for everyone to press Rematch after the first press. */
  rematchWindowSeconds: 30,
  /** Rooms with no game action for this long are deleted. */
  roomTtlHours: 24,
  codeLength: 5,
  /** No 0, O, 1, I or L. */
  codeAlphabet: 'ABCDEFGHJKMNPQRSTUVWXYZ23456789',
  /** Delays between send retries; 15.5 s in total. */
  retryDelaysSeconds: [0.5, 1, 2, 4, 8],
} as const;
