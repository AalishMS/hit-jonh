import type { FaceKey } from '../art/jonhArt';
import { arc, clamp01, dampedWave, easeInQuad, easeOutBack, easeOutCubic, lerp, progress } from './easing';

/**
 * Jonh's rig as pure data. All coordinates are logical pixels relative to the rig origin:
 * the ground point under the centre of his collider (y up is negative, as on screen).
 * Every reaction is a pure function of time, so a hit-stop simply holds t = 0 (the most
 * extreme pose) and the replay re-runs the same curve.
 */
export const RIG = {
  chair: { x: 8, y: 0 },
  hip: { x: 6, y: -26 },
  torsoRot: 0.08,
  neck: { x: -8, y: -32 },
  armFront: { x: -8, y: -28, rot: 0.97 },
  armBack: { x: 13, y: -30, rot: -0.06 },
  paper: { x: -6, y: -17 },
  hatOnHead: { x: -1, y: -33.5 },
  /** Where the attached hat sits in rig space at rest (used as the detach start point). */
  hatRest: { x: 0, y: -91.5 },
  legsRot: 0,
  /** Lying-down root offset so his back rests on the ground after a 90° fall. */
  lyingLift: -17,
} as const;

export interface Xform { x: number; y: number; rot: number; sx: number; sy: number }
export const IDENTITY: Xform = { x: 0, y: 0, rot: 0, sx: 1, sy: 1 };

export type AttachedPart = { attached: true; dx: number; dy: number; rot: number; sx: number };
export type FreePart = { attached: false; x: number; y: number; rot: number };

export interface JonhPose {
  body: Xform;
  torso: { rot: number; sx: number; sy: number };
  head: { rot: number; dx: number; dy: number };
  legs: number;
  armFront: number;
  armBack: number;
  paper: AttachedPart | FreePart;
  hat: AttachedPart | FreePart;
  chair: Xform;
  face: FaceKey;
  /** 0..1 visibility of the dizzy stars orbiting his head. */
  stars: number;
  /** 0..1 strength of the motion smear (ghost copies and speed lines). */
  smear: number;
}

export type HitStrength = 'weak' | 'strong' | 'trick';
export type ReactionKind = 'idle' | 'hit' | 'hat' | 'duck' | 'smug' | 'wince' | 'glare';

export interface ReactionInput {
  kind: ReactionKind;
  /** Seconds since the reaction started (presentation time, already slowed by hit-stop). */
  t: number;
  /** Idle clock, always running; drives breathing/blinks. */
  idleT: number;
  strength?: HitStrength;
  /** +1 when the ball travels right (Jonh is knocked right), −1 when it travels left. */
  dir?: number;
  /** Free space (px) on the support surface in the knock direction. */
  room?: number;
  /** Player is aiming: Jonh peeks over the paper. */
  aware?: boolean;
  /** 0..1 how imminent an incoming ball is: he flinches and raises the paper. */
  alarm?: number;
}

export const HIT_TIMING = {
  /** Seconds from contact to landing for a strong knock. */
  strongAir: 0.62,
  weakFall: 0.42,
  hatAir: 0.95,
  starsFrom: 0.7,
  annoyedFrom: 1.55,
} as const;

function restPose(idleT: number): JonhPose {
  const breath = Math.sin((idleT * 2 * Math.PI) / 3.2);
  return {
    body: { ...IDENTITY },
    torso: { rot: RIG.torsoRot, sx: 1 - breath * 0.008, sy: 1 + breath * 0.018 },
    head: { rot: 0, dx: 0, dy: -breath * 0.7 },
    legs: RIG.legsRot,
    armFront: RIG.armFront.rot,
    armBack: RIG.armBack.rot,
    paper: { attached: true, dx: 0, dy: Math.sin(idleT * 1.3) * 0.6, rot: 0, sx: 1 },
    hat: { attached: true, dx: 0, dy: 0, rot: 0, sx: 1 },
    chair: { x: RIG.chair.x, y: RIG.chair.y, rot: 0, sx: 1, sy: 1 },
    face: 'bored',
    stars: 0,
    smear: 0,
  };
}

function idle(input: ReactionInput): JonhPose {
  const t = input.idleT;
  const pose = restPose(t);
  const blink = t % 3.7 > 3.57;
  pose.face = blink ? 'blink' : 'bored';
  // Turns a page every 8 s: the paper flips edge-on and back.
  const flip = (t % 8) - 6.8;
  if (flip > 0 && flip < 0.5 && pose.paper.attached) {
    pose.paper.sx = Math.max(0.08, Math.abs(Math.cos(Math.PI * (flip / 0.5))));
    pose.armFront += Math.sin(Math.PI * (flip / 0.5)) * 0.35;
  }
  // An occasional suspicious glance at the cannon.
  const glance = (t % 11) - 8.5;
  if (glance > 0 && glance < 1.3) {
    pose.face = 'look';
    if (pose.paper.attached) pose.paper.dy += 5 * Math.sin(Math.PI * (glance / 1.3));
  }
  if (input.aware) {
    pose.face = blink ? 'blink' : 'look';
    pose.head.rot = -0.06;
    if (pose.paper.attached) pose.paper.dy += 6;
  }
  const alarm = clamp01(input.alarm ?? 0);
  if (alarm > 0) {
    pose.face = alarm > 0.35 ? 'shock' : 'look';
    pose.body.sy = 1 + 0.07 * alarm;
    pose.body.sx = 1 - 0.04 * alarm;
    pose.torso.rot = RIG.torsoRot + 0.12 * alarm;
    if (pose.paper.attached) pose.paper.dy -= 7 * alarm;
    pose.armFront -= 0.25 * alarm;
  }
  return pose;
}

/** Body hit. Frame 0 is the most squashed, most extreme pose; everything relaxes from it. */
function hit(input: ReactionInput): JonhPose {
  const t = Math.max(0, input.t);
  const strength = input.strength ?? 'strong';
  const pose = restPose(input.idleT);
  const big = strength !== 'weak';
  const room = Math.max(0, input.room ?? 140);
  const airborne = big && room >= 50;
  const dist = airborne ? Math.min(strength === 'trick' ? 150 : 118, room) : Math.min(30, room);

  // Frame 0: crumpled into a "C" around the ball (hips punched back, head and limbs thrown
  // forward), flattened along the hit. Then the limbs trail as he is launched, then neutral.
  const sq = big ? 1 : 0.75;
  const toStretch = easeOutCubic(progress(t, 0, 0.09));
  const toNeutral = easeOutCubic(progress(t, 0.09, 0.22));
  const squashX = lerp(lerp(0.7, 1.16, toStretch), 1, toNeutral);
  const squashY = lerp(lerp(1.12, 0.9, toStretch), 1, toNeutral);
  pose.body.sx = 1 + (squashX - 1) * sq;
  pose.body.sy = 1 + (squashY - 1) * sq;
  const curl = 1 - toStretch;

  const startRot = 0.16;
  if (airborne) {
    const air = big ? HIT_TIMING.strongAir : HIT_TIMING.weakFall;
    const p = clamp01(t / air);
    const spins = strength === 'trick' ? 2 : 1;
    pose.body.x = dist * easeOutCubic(p * 0.85 + p * p * 0.15);
    pose.body.y = -(strength === 'trick' ? 105 : 78) * arc(p) + RIG.lyingLift * easeInQuad(p);
    pose.body.rot = startRot + (spins * 2 * Math.PI + Math.PI / 2 - startRot) * easeOutCubic(p);
    if (t > air) {
      const land = dampedWave(t - air, 3.2, 7);
      pose.body.sx = 1 - 0.22 * land;
      pose.body.sy = 1 + 0.14 * land;
    }
  } else {
    const p = progress(t, 0.04, HIT_TIMING.weakFall);
    pose.body.rot = lerp(startRot, Math.PI / 2, easeInQuad(p));
    pose.body.x = dist * easeOutCubic(p);
    pose.body.y = RIG.lyingLift * easeInQuad(p);
    if (p >= 1) {
      const land = dampedWave(t - 0.04 - HIT_TIMING.weakFall, 3.5, 8);
      pose.body.sx = 1 - 0.18 * land;
      pose.body.sy = 1 + 0.12 * land;
    }
  }

  // Limbs: flung out on contact, flailing in the air, splayed on the ground.
  const landT = airborne ? HIT_TIMING.strongAir : 0.04 + HIT_TIMING.weakFall;
  const flail = t < landT ? Math.sin(t * 34) * 0.55 * (1 - t / landT) : 0;
  const settle = easeOutBack(progress(t, landT, 0.35));
  // Airborne: limbs trail forward (behind the motion) and flail.
  const airFront = lerp(2.35, 1.75 + flail, toStretch);
  const airBack = lerp(-2.5, 1.35 - flail, toStretch);
  // Lying on his back the arms flop skyward (local "left" is world up after the 90° fall).
  pose.armFront = lerp(airFront, 1.75 + 0.08 * Math.sin(t * 3), settle);
  pose.armBack = lerp(airBack, 1.3 - 0.08 * Math.sin(t * 2.6), settle);
  pose.legs = lerp(lerp(-0.8, -0.35 + flail * 0.6, toStretch), -0.55 + 0.12 * Math.sin(t * 2.2), settle);
  pose.head.rot = -0.3 * curl + 0.25 * toStretch * (1 - settle) - 0.1 * dampedWave(t, 2.6, 5) * settle;
  pose.head.dy = 2 * curl;
  pose.torso.rot = RIG.torsoRot - 0.45 * curl + 0.25 * toStretch * (1 - settle);
  pose.body.x += 6 * curl;

  // Newspaper is torn out of his hands and flutters down.
  const pp = clamp01(t / 1.7);
  pose.paper = {
    attached: false,
    x: RIG.hip.x + RIG.paper.x - 30 * pp + 7 * Math.sin(t * 8.5),
    y: lerp(-44, -4, pp * pp) - 95 * Math.sin(Math.PI * pp) * (1 - pp * 0.35),
    rot: 0.9 * Math.sin(t * 6.5) * (1 - pp) + pp * 1.4,
  };

  // Hat pops straight up on contact, spins, lands beyond him.
  pose.hat = hatFlight(t, strength === 'trick' ? 1.25 : big ? 1 : 0.7, dist * 0.55 + 34);

  // The deckchair goes over too.
  const cp = progress(t, 0.02, big ? 0.55 : 0.5);
  // It ends lying on its back (90° about its foot), lifted so nothing sinks into the ground.
  pose.chair = {
    x: RIG.chair.x + (airborne ? dist * 0.45 : 14) * easeOutCubic(cp),
    y: -(airborne ? 46 : 8) * arc(cp) - 36 * easeInQuad(cp),
    rot: (airborne ? Math.PI * 2.5 : Math.PI * 0.5) * easeOutCubic(cp),
    sx: 1, sy: 1,
  };

  pose.face = t < landT ? (t < 0.32 ? 'shock' : 'wince') : t < HIT_TIMING.annoyedFrom ? 'dazed' : 'annoyed';
  pose.stars = t >= HIT_TIMING.starsFrom ? clamp01((t - HIT_TIMING.starsFrom) / 0.15) * (t < 2.6 ? 1 : clamp01(1 - (t - 2.6) / 0.3)) : 0;
  pose.smear = t < 0.075 ? 1 : clamp01(1 - (t - 0.075) / 0.06);
  return mirror(pose, input.dir ?? 1);
}

function hatFlight(t: number, power: number, distance: number): FreePart {
  const air = HIT_TIMING.hatAir * (0.75 + 0.25 * power);
  const p = clamp01(t / air);
  const landY = -4;
  const startY = RIG.hatRest.y;
  const peak = 70 * power;
  let y = lerp(startY, landY, p * p) - peak * arc(p) * 1.1;
  let rot = p * Math.PI * 2 * (1.5 + power);
  if (t > air) {
    const b = t - air;
    y = landY - 9 * Math.max(0, Math.sin(Math.min(b / 0.22, 1) * Math.PI)) * Math.exp(-b * 3);
    rot = Math.PI * 2 * Math.round(1.5 + power) + 0.25 * dampedWave(b, 3, 6);
  }
  return { attached: false, x: RIG.hatRest.x + distance * easeOutCubic(p), y, rot };
}

function hatOnly(input: ReactionInput): JonhPose {
  const t = Math.max(0, input.t);
  const pose = restPose(input.idleT);
  const flinch = dampedWave(t, 2.5, 7);
  pose.body.sy = 1 - 0.1 * Math.max(0, flinch);
  pose.body.sx = 1 + 0.06 * Math.max(0, flinch);
  pose.hat = hatFlight(t, 0.9, 62);
  pose.face = t < 0.35 ? 'wince' : t < 0.85 ? 'shock' : 'annoyed';
  pose.head.rot = t < 0.85 ? -0.14 * clamp01((t - 0.3) / 0.15) : -0.04;
  if (pose.paper.attached) pose.paper.dy = 7 * easeOutCubic(progress(t, 0.25, 0.3));
  // He pats his bald head.
  const pat = progress(t, 0.9, 0.35);
  pose.armBack = lerp(RIG.armBack.rot, -2.75 + 0.12 * Math.sin(t * 16) * (t > 1.25 ? 1 : 0), easeOutBack(pat));
  return mirror(pose, input.dir ?? 1);
}

function duck(input: ReactionInput): JonhPose {
  const t = Math.max(0, input.t);
  const pose = restPose(input.idleT);
  const down = t < 0.45 ? easeOutBack(progress(t, 0, 0.1)) : 1 - easeOutCubic(progress(t, 0.45, 0.25));
  pose.body.sy = 1 - 0.15 * down;
  pose.body.sx = 1 + 0.07 * down;
  pose.head.dy = 5 * down;
  if (pose.paper.attached) pose.paper.dy = -9 * down + (t > 0.6 ? 6 : 0);
  pose.armFront -= 0.35 * down;
  pose.face = t < 0.5 ? 'shock' : 'annoyed';
  pose.head.rot = t < 0.5 ? 0 : -0.08;
  return pose;
}

function smug(input: ReactionInput): JonhPose {
  const t = Math.max(0, input.t);
  const pose = idle({ ...input, aware: false, alarm: 0 });
  if (t < 1.6) {
    pose.face = 'smug';
    pose.head.rot = 0.07 * Math.sin(t * 13) * Math.exp(-t * 1.8);
    if (pose.paper.attached) pose.paper.dy += 6 * easeOutCubic(progress(t, 0, 0.2));
  }
  return pose;
}

function wince(input: ReactionInput): JonhPose {
  const t = Math.max(0, input.t);
  const pose = idle({ ...input, aware: false, alarm: 0 });
  const k = dampedWave(t, 3, 6);
  pose.body.sy = 1 - 0.06 * Math.max(0, k);
  pose.face = t < 0.4 ? 'wince' : t < 1.6 ? 'annoyed' : pose.face;
  return pose;
}

function glare(input: ReactionInput): JonhPose {
  const t = Math.max(0, input.t);
  const pose = idle({ ...input, aware: false, alarm: 0 });
  if (t < 1.8) {
    pose.face = 'annoyed';
    pose.head.rot = -0.08 * easeOutCubic(progress(t, 0, 0.2));
    if (pose.paper.attached) pose.paper.dy += 8;
  }
  return pose;
}

function mirror(pose: JonhPose, dir: number): JonhPose {
  if (dir >= 0) return pose;
  const flipFree = (p: AttachedPart | FreePart): AttachedPart | FreePart =>
    p.attached ? p : { ...p, x: -p.x, rot: -p.rot };
  return {
    ...pose,
    body: { ...pose.body, x: -pose.body.x, rot: -pose.body.rot },
    chair: { ...pose.chair, x: RIG.chair.x - (pose.chair.x - RIG.chair.x), rot: -pose.chair.rot },
    hat: flipFree(pose.hat),
    paper: flipFree(pose.paper),
  };
}

export function jonhPose(input: ReactionInput): JonhPose {
  switch (input.kind) {
    case 'hit': return hit(input);
    case 'hat': return hatOnly(input);
    case 'duck': return duck(input);
    case 'smug': return smug(input);
    case 'wince': return wince(input);
    case 'glare': return glare(input);
    default: return idle(input);
  }
}

/** How far from rest the body squash is; used to verify frame 0 is the extreme pose. */
export function squashAmount(pose: JonhPose): number {
  return Math.abs(pose.body.sx - 1) + Math.abs(pose.body.sy - 1);
}

/** Seconds until a reaction has visibly settled (used to schedule the replay). */
export function reactionDuration(kind: ReactionKind): number {
  switch (kind) {
    case 'hit': return HIT_TIMING.annoyedFrom + 0.2;
    case 'hat': return 1.4;
    default: return 1.2;
  }
}

