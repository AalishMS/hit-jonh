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
   * Matter's contact solver constants (Matter's own defaults). Phaser's Matter plugin overwrites
   * these globals with 4 and 6 for the game only, so without passing them explicitly the shipped
   * game ran different contact physics from the headless tests that prove every reference shot
   * (Lunar Picnic's 69°/28% slid to a stop on the slab in the game instead of bouncing on to Jonh).
   * main.ts passes them to Phaser and physics/matterSolver.ts sets them on the adapter's Matter.
   */
  matterSolver: {
    restingThresh: 2,
    restingThreshTangent: Math.sqrt(6),
    positionDampen: 0.9,
    positionWarming: 0.8,
    frictionNormalMultiplier: 5,
  },
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
  /**
   * Miss / hat result window [TUNE]. Was 1.4 s; shortened for a snappier retry loop. Jonh's line
   * stays in his speech bubble while you re-aim, and touching the aim skips the window in solo.
   */
  shotResultSeconds: 1.0,
  /** Body hits hold longer so Jonh's knock-back (and the replay) can land. Polish pass [TUNE]. */
  bodyHitResultSeconds: 2.6,
  handoverSeconds: 1.2,
  /** Party handovers [TUNE]: extra time to read a stakes banner or taunt, and more for a deciding shot. */
  partyHandoverExtraSeconds: 0.6,
  decisiveHandoverExtraSeconds: 1.2,
  roundResultSeconds: 2.4,
  /** Ignore background-tab catch-up for presentation timers. */
  maxFrameSeconds: 0.1,
  /** Title screen [TUNE]: first demo shot, then one every this many seconds (plus up to 4 s). */
  attractFirstShotSeconds: 4,
  attractShotEverySeconds: 11,
  /** Seconds Jonh lies there after a title-screen bonk before climbing back into his chair. */
  attractRecoverSeconds: 3.4,
  /** Winning-shot replay [TUNE]: a beat before the cannon swings, and how long after the impact it lingers. */
  showcaseLeadSeconds: 0.5,
  showcaseAfterSeconds: 2.2,
  /**
   * Seconds after a garden is built before the next garden's art is prepared in idle time (after its title card,
   * while the player aims), so Next garden never waits on art [TUNE].
   */
  warmNextGardenSeconds: 2.5,
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

/**
 * Walking Jonh [PROPOSED 2026-11-25, TUNE] (levels/jonhRoute.ts). His collider moves at most
 * `maxSpeedMs`, i.e. ≤ 1.7 cm per fixed step, well under the ball's radius, so the swept guard can
 * treat his box as still within one step. The stride only drives the walk cycle (cosmetic).
 */
export const JONH_WALK = {
  maxSpeedMs: 2,
  /** Metres per full walk cycle (two steps), so his feet do not skate. */
  strideMetres: 1.1,
} as const;

/**
 * Jonh's chatter [PROPOSED, cosmetic only]: the odds that a fitting context line (rules/jonhLines.ts)
 * replaces a plain one, and when he starts heckling a slow aimer. Never affects the simulation.
 */
export const JONH_TALK = {
  trick: 0.7,
  firstShot: 0.6,
  hitStreak: 0.65,
  strong: 0.45,
  hat: 0.6,
  /** Misses in a row before he comments on the streak. */
  missStreakFrom: 3,
  missStreak: 0.6,
  obstacle: 0.75,
  mapLine: 0.25,
  /** Idle aiming before the first heckle, between heckles, and at most this many per aim. */
  heckleFirstSeconds: 9,
  heckleRepeatSeconds: 15,
  heckleMaxPerAim: 2,
} as const;

/**
 * First-garden coach [PROPOSED][TUNE] (rules/coach.ts). Until a player's first hit ever, a ghost
 * hand shows the drag on the first campaign garden, and each solo miss names one fix.
 */
export const COACH = {
  /** One loop of the ghost hand (s): fade in, press on the cannon, drag, release, fade out, rest. */
  handLoopSeconds: 3,
  /** Where the demonstrated drag ends, from the cannon pivot (m, +y up): about 40° and a medium pull. */
  dragTo: { x: 2.4, y: 2.0 },
  /** At or above this power, "short" suggests aiming nearer 45° instead of more power. */
  nearFullPowerPercent: 92,
  /** At or below this power, "too far" suggests changing the angle instead of less power. */
  nearNoPowerPercent: 8,
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
  /** Hot-seat sudden death [PROPOSED]: shoot-out rounds before a still-level match is shared. */
  suddenDeathRounds: 3,
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
  /**
   * Mechanic maps: the least share of hits that must smash a breakable prop or go through a portal
   * first (coarse grid, every target position).
   */
  minMechanicShare: { greenhouse: 1, magic: 1 } as Readonly<Record<string, number>>,
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
  /** Mechanic maps [PROPOSED][TUNE]: unbroken glass is hard and slick; velvet drapes swallow a ball. */
  glass: { restitution: 0.35, friction: 0.2 },
  velvet: { restitution: 0.1, friction: 0.9, rollingDamping: 0.88 },
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
  /** Seconds a replayed or demo cannon takes to swing round to its aim before winding up (the clip plan counts it). */
  demoAimSeconds: 0.45,
  recoilPx: 18,
  /** Launch feel by power [TUNE]: effects at 0 % power are this fraction of full (recoil, smoke). */
  launchMinStrength: 0.4,
  /** Camera kick backwards along the barrel at full power (px) and its zoom punch. */
  launchKickPx: 9,
  launchPunch: 0.035,
  /** Above this power the wheels throw up dust. */
  launchDustFrom: 0.6,
  /** Camera follow during flight. */
  flightZoomMin: 0.72,
  followRate: 5,
  /** Ball stretch along velocity at maximum launch speed. */
  ballStretch: 0.35,
  /**
   * Snappy misses [TUNE]: once a missed ball has landed and is only rolling to a stop, the
   * presentation clock runs this many times faster (outcome-identical; see fx/settleClock.ts).
   */
  settleFastForward: 4,
  /** A landed ball slower than this (m/s) is fast-forwarded anywhere. */
  settleCrawlSpeedMs: 0.8,
  /** A landed ball slower than this (m/s) is fast-forwarded when at least settleClearMetres from Jonh. */
  settleRollSpeedMs: 4,
  settleClearMetres: 2.5,
  /** How quickly the fast-forward eases in and out (per second). */
  settleEaseRate: 7,
};

/**
 * Breakable props and portals: presentation only [PROPOSED][TUNE]. The physics values live in level data.
 * Reduced motion keeps the state changes (pane gone, hoop spent) and drops everything that flies or spins.
 */
export const MECHANIC_FX = {
  /** Glass shards thrown along the ball's path when a pane breaks. */
  shardCount: 14,
  shardSpeedMinPx: 140,
  shardSpeedMaxPx: 360,
  /** Sparkles at each hoop when the ball goes through. */
  sparkleCount: 10,
  /** Seconds per turn of a hoop's swirl (ambient motion stays slow, ≥ 4 s). */
  swirlTurnSeconds: 5,
  /** Swirl opacity once a hoop has been used this shot (each portal works once per shot). */
  spentAlpha: 0.22,
  popSeconds: 0.3,
  /** The exit hoop is drawn smaller than the entry and squashed along its heading, so it points. */
  exitScale: 0.8,
  exitSquash: 0.45,
};

/**
 * Constant per-level wind [PROPOSED 2026-11-25][TUNE]. The physics value lives in level data
 * (`LevelData.wind`); these are the limits it is validated against and the presentation values.
 * Wind is a horizontal acceleration on the ball only (SPEC §8.7).
 */
export const WIND = {
  /** Strongest wind a level may declare (m/s²). */
  maxAccelerationMs2: 8,
  /** Collider thickness is sized for the extra speed wind can add over this many seconds of flight. */
  thicknessFlightSeconds: 4,
  /** The windsock lies flat at this acceleration (m/s²) and droops towards hanging limp at 0. */
  sockFlatMs2: 5,
  /** Where the windsock stands (metres) unless the level says otherwise. */
  defaultSockXMetres: 6.8,
  /** Drifting streaks: how many, and px/s of drift per m/s² of wind. */
  streakCount: 16,
  streakDriftPxPerMs2: 70,
  /** Streak opacity range. */
  streakAlpha: 0.55,
  /**
   * Gust visuals [PROPOSED 2026-11-25][TUNE]: at a gust's peak (the audio's gusts) the sock lifts by this much
   * and flutters harder, and streaks drift faster and show clearer. The ball's wind never changes (SPEC §8.7).
   */
  gustSockLift: 0.18,
  gustFlutter: 1.6,
  gustStreakSpeedup: 1.1,
  gustStreakAlpha: 0.6,
} as const;

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
  /** [PROPOSED 2026-11-25] Emotes: a seat may send this many at once, then one more every `emoteRefillSeconds`. */
  emoteBurst: 3,
  emoteRefillSeconds: 2,
  /** [PROPOSED 2026-11-25] How long a bubble stays up. */
  emoteShowSeconds: 4,
  /** [PROPOSED 2026-11-25] An emote delivered later than this after it was sent is not shown (e.g. a laptop waking up). */
  emoteMaxAgeSeconds: 10,
  /** [PROPOSED 2026-11-25] Bubbles on screen at once (the newest win). */
  emoteMaxVisible: 3,
} as const;

/**
 * [PROPOSED 2026-11-25][TUNE] Daily Bonk friends boards (SPEC §6.2, `rules/friendsBoard.ts`, `convex/boards.ts`).
 * Private boards reached only by their code; codes use the room code alphabet and length (`ONLINE`).
 */
export const FRIENDS_BOARD = {
  /**
   * Board code length (room alphabet). Rooms live minutes and use 5 characters; a board lives for weeks and holds
   * names and results, so 8 characters (31⁸ ≈ 8.5 × 10¹¹) keep it from being found by trying codes.
   */
  codeLength: 8,
  /** Members per board. */
  maxMembers: 20,
  /** Boards one browser may belong to at once. */
  maxBoardsPerPlayer: 10,
  /**
   * A posted day may be this many days before / after the server's UTC date. Every calendar date that is "today"
   * somewhere (UTC−12 … UTC+14) lies within one day of it; the extra day behind lets a late retry of yesterday land.
   */
  acceptDaysBehind: 2,
  acceptDaysAhead: 1,
  /** Writes (create, join, post) a browser may make at once, then one more every `actionRefillSeconds`. */
  actionBurst: 6,
  actionRefillSeconds: 20,
  /** A self-reported Daily streak above this is refused (about 27 years). */
  maxStreak: 10_000,
  /** Results older than this many days are deleted by the cleanup cron (the board shows today and yesterday). */
  keepResultsDays: 14,
  /** A board nobody has joined or posted to for this long is deleted, with its memberships. */
  idleBoardDays: 60,
  /** A board's activity clock is bumped by a post at most this often, so members' posts rarely contend. */
  touchEveryMinutes: 60,
  /** Retry delays for a result post that failed for a network reason (the last one repeats). */
  retryDelaysSeconds: [15, 60, 300],
} as const;

/**
 * Sound levels and the cues added for the gardens [PROPOSED 2026-11-25][TUNE]. Cosmetic only: nothing here
 * touches the simulation. Every cue plays through its own trim bus (`CUE_NAMES`), so balancing is a table of
 * dB offsets rather than gains scattered through the synth code. The values are set from the offline
 * loudness report (`audio-levels.html`, `src/dev/audioLevelsPage.ts`); nothing has been judged by ear.
 */
export const CUE_NAMES = [
  'cannon', 'fuse', 'hit', 'hat', 'surface', 'glass', 'portal', 'jonhVoice', 'mutter', 'outOfBounds',
  'drumroll', 'sting', 'whoosh', 'click', 'emoteIn', 'emoteOut', 'footstep',
] as const;
export type CueName = (typeof CUE_NAMES)[number];

export const AUDIO = {
  /**
   * Per-cue trim in dB, applied on the cue's own bus ahead of the shared compressor and master volume.
   * Tiers: 0 = impacts, 1 = voices and big accents, 2 = scenery and results, 3 = accents that sit under
   * everything, 4 = beds, steps and UI (targets in `src/audio/loudness.ts`).
   */
  cueTrimDb: {
    cannon: -2.3, fuse: 10.4, hit: -3.4, hat: 1.9, surface: -1.7, glass: 0.6, portal: 0.3, jonhVoice: -0.2, mutter: 14,
    outOfBounds: 8.7, drumroll: -8.8, sting: -7.9, whoosh: -0.8, click: 7.6, emoteIn: -1.3, emoteOut: 5.3, footstep: 0.8,
  } as Record<CueName, number>,
  /**
   * Level targets [TUNE], measured on a cue's loudest variant at master volume 1, after the compressor:
   * `targetLufs` is its K-weighted loudness over the loudest 200 ms (mono) and `maxPeakDb` its sample
   * peak, whichever is the stricter; `cues` are the members. Short cues (clicks, steps) are held by
   * the peak ceiling so they stay quiet in absolute terms, long ones by the loudness. The report page
   * (audio-levels.html) checks these; the trims above are what makes them true.
   */
  tiers: [
    { name: 'impact', targetLufs: -15.5, maxPeakDb: -5, cues: ['cannon', 'hit'] },
    { name: 'voice', targetLufs: -19, maxPeakDb: -8.5, cues: ['outOfBounds', 'glass', 'drumroll'] },
    { name: 'scenery', targetLufs: -21, maxPeakDb: -10, cues: ['surface', 'hat', 'portal', 'sting'] },
    // Jonh's yelp plays on top of every hit, so it sits well under it (about 7 dB by loudness) instead of fighting it.
    { name: 'reaction', targetLufs: -25, maxPeakDb: -15, cues: ['jonhVoice'] },
    { name: 'accent', targetLufs: -26, maxPeakDb: -13, cues: ['mutter', 'emoteIn', 'fuse'] },
    { name: 'quiet', targetLufs: -30, maxPeakDb: -17, cues: ['click', 'footstep', 'emoteOut', 'whoosh'] },
  ] as ReadonlyArray<{ name: string; targetLufs: number; maxPeakDb: number; cues: readonly CueName[] }>,
  /** Beds at their loudest (the wind's gust peak at full strength; the music loop): short-event loudness in LUFS. */
  bedTargetLufs: { wind: -34, music: -30 },
  /** Music and the garden ambience (the wind bed) share the music toggle; these are the bus gains. */
  musicGain: 0.16,
  musicDuckedGain: 0.06,
  /** The ambience bus (wind bed) sits on the music toggle and ducking, scaled by this. */
  ambienceGain: 1,
  /** Soft clip after the compressor: linear up to `kneeLevel`, then bending towards `ceilingLevel` (full scale = 1). */
  softClip: { kneeLevel: 0.75, ceilingLevel: 0.97 },
  /** Wind bed on gardens with wind (level data). Strength is `|a| / WIND.sockFlatMs2`, clamped to 0..1. */
  wind: {
    /** Bed loudness at full strength; a breeze is `floor` of this. */
    bedGain: 0.234,
    floor: 0.35,
    /** Low-pass corner of the rumble layer and band-pass centre of the air layer, calm → full (Hz). */
    rumbleHz: [260, 520],
    airHz: [520, 1150],
    /** Gust: seconds between gusts, swell and fade times (calm → full), and the extra gain over the bed at full strength. */
    gustGapSeconds: [7, 3.2],
    gustSwellSeconds: [1.1, 0.7],
    gustFadeSeconds: [2.2, 1.6],
    gustLift: 1.1,
    /** The first gust arrives this soon after the bed starts (seconds, plus up to the same again). */
    firstGustSeconds: 1.5,
    /** Fade-in and fade-out when the bed starts or stops (seconds). */
    fadeInSeconds: 0.8,
    fadeOutSeconds: 0.35,
    /** The scene must refresh the bed this often (seconds) or it fades away (pause, quit, hidden tab). */
    keepAliveSeconds: 0.4,
    /** Shot cues dip the bed by this many dB for `duckSeconds`, so it stays under them. */
    duckDb: -9,
    duckSeconds: 0.9,
  },
  /** Gravel footsteps: one per foot-plant, in step with the walk cycle (levels/jonhRoute distance). */
  footstep: {
    /** Phase of the walk cycle (0..1 of a stride, which has two steps) at which the first foot lands. */
    plantPhase: 0.25,
    /** At most this many steps are voiced per frame (a stalled frame must not machine-gun). */
    maxPerFrame: 2,
    /** Pitch spread between steps. */
    pitchSpread: 0.12,
  },
  /** Rate limits (seconds between sounds, and a cap per window) so bursts never stack into noise. */
  limits: {
    emoteIn: { minGapSeconds: 0.3, windowSeconds: 3, maxInWindow: 3 },
    emoteOut: { minGapSeconds: 0.18, windowSeconds: 3, maxInWindow: 3 },
    footstep: { minGapSeconds: 0.12, windowSeconds: 1, maxInWindow: 6 },
  },
} as const;

/**
 * [PROPOSED 2026-11-25] Shareable winning-shot clip (share/clipPlan.ts): a few seconds of the replay
 * recorded with MediaRecorder. All values are [TUNE].
 */
export const CLIP = {
  /** The clip is never shorter than this (a quick hit lingers on Jonh) nor longer (a long lob keeps its last seconds). */
  minSeconds: 3,
  maxSeconds: 6,
  /** Seconds kept after the impact. */
  afterImpactSeconds: 2.0,
  /** Capture rate: 30 fps keeps a clip small enough to post. */
  fps: 30,
  videoBitsPerSecond: 2_500_000,
  audioBitsPerSecond: 96_000,
  /** MediaRecorder is asked for data this often so a clip never sits in one huge buffer. */
  timesliceMs: 500,
  /** Stopping gives up waiting for the recorder's last chunk after this long. */
  finishTimeoutSeconds: 4,
  /** In-canvas caption: title plate top-left, address bottom-right (logical px of the 1280-wide canvas). */
  titleFontPx: 30,
  addressFontPx: 22,
  captionMarginPx: 20,
} as const;
