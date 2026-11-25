import Matter, { type Body, type World } from '@matter-js';
import { LOOK, MATERIALS, PHYSICS, RAMP, type MaterialProps } from '../config/tuning';
import { routePoseAtStep, shiftJonh, type RoutePose } from '../levels/jonhRoute';
import type { BreakableData, JonhRouteData, JonhSpawnData, LevelData, MagnetData, ObstacleData, PortalData, RampData } from '../levels/types';
import { arcPoint, arcShape, clampToArc, closestOnArc, radial, rollOnArc, sweepCircleVsArc, type ArcHit, type ArcShape } from '../sim/arc';
import { magnetAcceleration, magnetProfile, type MagnetProfile } from '../sim/magnet';
import type { Box2D, Point2D, SweptHit } from '../sim/swept';
import { circleOverlapsBox, sweepCircleVsBox, sweepCircleVsDisc } from '../sim/swept';
import './matterSolver';
import {
  accelerationToMatter,
  metresToPixels,
  matterVelocityToSpeedMs,
  pixelsToMetres,
  simYToWorldY,
  speedMsToMatterVelocity,
  vectorLength,
  worldYToSimY,
} from '../sim/units';

/**
 * How far a ball's lowest point may sit above (a tiny hop) or below (Matter's resting overlap) a slide
 * surface's top and still count as resting on it (metres) [TUNE].
 */
const SLIDE_REST_ABOVE_METRES = 0.005;
const SLIDE_REST_BELOW_METRES = 0.02;

export interface ProjectileState {
  xSim: number;
  ySim: number;
  xPx: number;
  yPx: number;
  vxSim: number;
  vySim: number;
  speedMs: number;
  hitJonh: boolean;
  hitHat: boolean;
  hitGround: boolean;
  passedOverhead: boolean;
  impactSpeedMs: number;
  firstGroundContact: { xSim: number; xPx: number; yPx: number } | null;
  obstacleContacts: Array<{ id: string; ricochet: boolean; material: string }>;
  hadRicochetBeforeBody: boolean;
  /** Breakable props smashed so far this shot, in order. Smashing through is never an obstacle contact. */
  brokenObstacleIds: string[];
  /** Portals the ball has gone through so far this shot, in order (each works once per shot). */
  portalsUsed: string[];
  /** Breaks and teleports during this step only, for effects and sound. */
  events: MechanicEvent[];
  /** The ramp the ball is rolling along at the end of this step (its id), or null (SPEC §8.9). */
  rampRolling: string | null;
  /** Ramps the ball has launched off (rolled off a lip into the air) so far this shot, in order. */
  rampLaunches: string[];
  /**
   * The slide surface (material, e.g. `ice`) the ball is gliding along after this step, or null (in the
   * air, resting, or on anything else). Presentation only: skid spray, sound and the settle clock.
   */
  slidingOn?: string | null;
}

/** Something a level mechanic did to the ball during one fixed step (world pixels). */
export type MechanicEvent =
  | { kind: 'break'; id: string; xPx: number; yPx: number; impactSpeedMs: number }
  | { kind: 'portal'; id: string; entryXPx: number; entryYPx: number; exitXPx: number; exitYPx: number }
  /** The ball rolled off the end of a ramp into the air (launched off its lip). */
  | { kind: 'rampLaunch'; id: string; xPx: number; yPx: number; speedMs: number };

/** A ramp and its exact arc, as the swept guard tests it. */
interface RampSolid { ramp: RampData; shape: ArcShape }

/** A solid the swept guard tests: ground, Jonh's body or an obstacle that is not broken. */
interface SolidBox {
  box: Box2D;
  label: 'ground' | 'jonhBody' | 'obstacle';
  material: string;
  id?: string | undefined;
  ricochet?: boolean | undefined;
  breakable?: BreakableData | undefined;
}

interface SolidHit {
  hit: SweptHit;
  boxLabel: SolidBox['label'];
  material: string;
  id?: string | undefined;
  ricochet?: boolean | undefined;
  breakable?: BreakableData | undefined;
}

/**
 * The earliest solid the ball's swept circle touches between two positions, if any. `jonhWins`
 * (walking Jonh only): a tie goes to Jonh's body, so a ball lying on the ground that he walks into
 * is a touch even though it is also touching the ground at t = 0.
 */
function earliestSolidHit(prev: Point2D, curr: Point2D, radius: number, boxes: readonly SolidBox[], jonhWins = false): SolidHit | null {
  let earliestHit: SolidHit | null = null;
  for (const b of boxes) {
    const hit = sweepCircleVsBox(prev, curr, radius, b.box);
    if (hit && hit.t <= 1) { // Accept t=0 if it's currently penetrating
      if (!earliestHit || hit.t < earliestHit.hit.t || (jonhWins && b.label === 'jonhBody' && hit.t === earliestHit.hit.t)) {
        earliestHit = {
          hit,
          boxLabel: b.label,
          material: b.material,
          id: b.id,
          ricochet: b.ricochet,
          breakable: b.breakable,
        };
      }
    }
  }
  return earliestHit;
}

export class MatterAdapter {
  private projectileBody: Body | null = null;
  private groundBody: Body | null = null;
  private jonhBody: Body | null = null;
  private jonhHatBody: Body | null = null;
  private obstacleBodies: Body[] = [];
  /** Ramps as the swept guard sees them, and their Matter sensor pieces. */
  private ramps: RampSolid[] = [];
  private rampBodies: Body[] = [];
  /** The ramp the ball is rolling along after the last step (null in the air or on anything else). */
  private rampRolling: string | null = null;
  /** Per-shot: every launch off a ramp's lip, by ramp id (restored by removeProjectile). */
  private rampLaunches: string[] = [];

  private prevPosPx: { x: number; y: number } | null = null;
  private hasHitJonh = false;
  private hasHitHat = false;
  private hasHitGround = false;
  private passedOverhead = false;
  private previousVelocity = { x: 0, y: 0 };
  private impactSpeedMs = 0;
  private firstGroundContact: ProjectileState['firstGroundContact'] = null;
  private obstacleContacts: Array<{ id: string; ricochet: boolean; material: string }> = [];
  private hadRicochetBeforeBody = false;
  /** Breakable obstacles' Matter bodies and their original collision masks, by obstacle id. */
  private readonly breakables = new Map<string, { body: Body; mask: number }>();
  /** Per-shot mechanic state: restored by removeProjectile (and so by every spawn). */
  private brokenIds: string[] = [];
  private portalsUsed: string[] = [];
  private stepEvents: MechanicEvent[] = [];
  /** Constant wind as a Matter acceleration (px/ms², + is +x); 0 when the level has none. */
  private windPxPerMs2 = 0;
  /** The level's electromagnet (SI level data); null when it has none, and nothing is touched. */
  private magnet: MagnetData | null = null;
  private magnetShape: MagnetProfile | null = null;
  /**
   * Where the magnet holds the ball (sim metres) once it has touched the magnet's housing this shot:
   * the ball stays stuck there (a static body) until the shot ends. Per shot; null otherwise.
   */
  private magnetHold: Point2D | null = null;
  /**
   * Walking Jonh (levels/jonhRoute.ts): the route, the spawn it is measured from, and the fixed step
   * his colliders are placed for (0 while aiming, k during the k-th step after Fire). He stops for
   * good once the ball touches him (body or hat). Null route: he never moves (every other map).
   */
  private jonhRoute: JonhRouteData | null = null;
  private jonhSpawnBase: JonhSpawnData | null = null;
  private jonhStep = 0;
  private jonhPose: RoutePose | null = null;
  private jonhPrevPose: RoutePose | null = null;

  constructor(
    private readonly matterWorld: World,
    private readonly pixelsPerMetre: number,
    private readonly worldHeightPx: number,
  ) {}

  setupLevel(level: LevelData): void {
    this.clear();
    this.windPxPerMs2 = accelerationToMatter(level.wind?.accelerationMs2 ?? 0, this.pixelsPerMetre);
    this.magnet = level.magnet ?? null;
    this.magnetShape = level.magnet ? magnetProfile(level.magnet.radius) : null;
    this.jonhRoute = level.jonhRoute ?? null;
    this.jonhSpawnBase = level.jonhSpawn;

    // 1. Ground body
    const groundWidthPx = metresToPixels(
      level.ground.maxX - level.ground.minX,
      this.pixelsPerMetre,
    );
    const groundHeightPx = metresToPixels(
      level.ground.maxY - level.ground.minY,
      this.pixelsPerMetre,
    );
    const groundCenterXPx = metresToPixels(
      (level.ground.minX + level.ground.maxX) / 2,
      this.pixelsPerMetre,
    );
    // In world coords (y down): ground top is simYToWorldY(level.ground.maxY)
    // ground center y is top + groundHeightPx / 2
    const groundTopPx = simYToWorldY(level.ground.maxY, this.worldHeightPx, this.pixelsPerMetre);
    const groundCenterYPx = groundTopPx + groundHeightPx / 2;

    this.groundBody = Matter.Bodies.rectangle(
      groundCenterXPx,
      groundCenterYPx,
      groundWidthPx,
      groundHeightPx,
      {
        isStatic: true,
        ...MATERIALS.grass,
        label: 'ground',
      },
    );
    Matter.World.add(this.matterWorld, this.groundBody);

    // 2. Jonh body
    const jonhBox = level.jonhSpawn.bodyBox;
    const jonhWidthPx = metresToPixels(jonhBox.maxX - jonhBox.minX, this.pixelsPerMetre);
    const jonhHeightPx = metresToPixels(jonhBox.maxY - jonhBox.minY, this.pixelsPerMetre);
    const jonhCenterXPx = metresToPixels((jonhBox.minX + jonhBox.maxX) / 2, this.pixelsPerMetre);
    const jonhTopPx = simYToWorldY(jonhBox.maxY, this.worldHeightPx, this.pixelsPerMetre);
    const jonhCenterYPx = jonhTopPx + jonhHeightPx / 2;

    this.jonhBody = Matter.Bodies.rectangle(
      jonhCenterXPx,
      jonhCenterYPx,
      jonhWidthPx,
      jonhHeightPx,
      {
        isStatic: true,
        ...MATERIALS.jonhBody,
        label: 'jonhBody',
      },
    );
    Matter.World.add(this.matterWorld, this.jonhBody);

    // 3. Jonh hat (sensor) if present
    if (level.jonhSpawn.hatBox) {
      const hatBox = level.jonhSpawn.hatBox;
      const hatWidthPx = metresToPixels(hatBox.maxX - hatBox.minX, this.pixelsPerMetre);
      const hatHeightPx = metresToPixels(hatBox.maxY - hatBox.minY, this.pixelsPerMetre);
      const hatCenterXPx = metresToPixels((hatBox.minX + hatBox.maxX) / 2, this.pixelsPerMetre);
      const hatTopPx = simYToWorldY(hatBox.maxY, this.worldHeightPx, this.pixelsPerMetre);
      const hatCenterYPx = hatTopPx + hatHeightPx / 2;

      this.jonhHatBody = Matter.Bodies.rectangle(
        hatCenterXPx,
        hatCenterYPx,
        hatWidthPx,
        hatHeightPx,
        {
          isStatic: true,
          isSensor: true,
          label: 'jonhHat',
        },
      );
      Matter.World.add(this.matterWorld, this.jonhHatBody);
    }

    // 4. Obstacles
    for (const obs of level.obstacles) {
      const obsWidthPx = metresToPixels(obs.box.maxX - obs.box.minX, this.pixelsPerMetre);
      const obsHeightPx = metresToPixels(obs.box.maxY - obs.box.minY, this.pixelsPerMetre);
      const obsCenterXPx = metresToPixels((obs.box.minX + obs.box.maxX) / 2, this.pixelsPerMetre);
      const obsTopPx = simYToWorldY(obs.box.maxY, this.worldHeightPx, this.pixelsPerMetre);
      const obsCenterYPx = obsTopPx + obsHeightPx / 2;

      // Lookup material (default to concrete if missing)
      const mat = (MATERIALS as Record<string, { restitution: number; friction: number }>)[obs.material] ?? { restitution: 0.2, friction: 0.5 };

      const obsBody = Matter.Bodies.rectangle(
        obsCenterXPx,
        obsCenterYPx,
        obsWidthPx,
        obsHeightPx,
        {
          isStatic: true,
          restitution: mat.restitution,
          friction: mat.friction,
          label: 'obstacle',
        },
      );
      // Matter makes every static body grippy (friction 1, whatever the options say). A slide surface
      // (ice) must stay frictionless in Matter too, or its contact would spin the ball up and brake it.
      if ((MATERIALS as Record<string, MaterialProps>)[obs.material]?.slideFrictionMs2 !== undefined) obsBody.friction = mat.friction;
      Matter.World.add(this.matterWorld, obsBody);
      this.obstacleBodies.push(obsBody);
      if (obs.breakable) this.breakables.set(obs.id, { body: obsBody, mask: obsBody.collisionFilter.mask });
    }

    // 5. Ramps: the swept guard solves the exact arc; Matter gets static sensor pieces along it.
    for (const ramp of level.ramps ?? []) this.addRamp(ramp);
    this.placeJonh(0);
  }

  /**
   * A ramp's exact arc for the swept guard, plus a chain of static sensor quads along it in Matter
   * (debug draw and queries see the ramp; they never push the ball). Matter has no curved bodies,
   * and its polygon joints would snag a rolling ball and damp every bounce alike, so the guard owns
   * every ramp contact, as it already owns bounces (SPEC §8.9, §9.2).
   */
  private addRamp(ramp: RampData): void {
    const shape = arcShape(ramp);
    this.ramps.push({ ramp, shape });
    const span = shape.end - shape.start;
    const pieces = Math.max(1, Math.ceil((span * 180) / Math.PI / RAMP.matterSegmentDeg - 1e-9));
    const outer = shape.radius + shape.thickness;
    const toPx = (p: Point2D) => ({
      x: metresToPixels(p.x, this.pixelsPerMetre),
      y: simYToWorldY(p.y, this.worldHeightPx, this.pixelsPerMetre),
    });
    for (let k = 0; k < pieces; k++) {
      const a0 = shape.start + (span * k) / pieces;
      const a1 = shape.start + (span * (k + 1)) / pieces;
      const quad = [arcPoint(shape, a0, shape.radius), arcPoint(shape, a1, shape.radius), arcPoint(shape, a1, outer), arcPoint(shape, a0, outer)].map(toPx);
      const centre = polygonCentroid(quad);
      const body = Matter.Bodies.fromVertices(centre.x, centre.y, quad, { isStatic: true, isSensor: true, label: 'ramp' });
      Matter.World.add(this.matterWorld, body);
      this.rampBodies.push(body);
    }
  }

  spawnProjectile(
    startXPx: number,
    startYPx: number,
    radiusPx: number,
    launchVelocityWorld: { x: number; y: number },
  ): Body {
    this.removeProjectile();
    this.hasHitJonh = false;
    this.hasHitHat = false;
    this.hasHitGround = false;
    this.passedOverhead = false;
    this.impactSpeedMs = 0;
    this.firstGroundContact = null;
    this.obstacleContacts = [];
    this.hadRicochetBeforeBody = false;
    this.previousVelocity = { ...launchVelocityWorld };

    this.projectileBody = Matter.Bodies.circle(startXPx, startYPx, radiusPx, {
      frictionAir: 0,
      ...MATERIALS.cannonball,
      density: 0.005,
      label: 'projectile',
    });

    Matter.World.add(this.matterWorld, this.projectileBody);
    Matter.Body.setVelocity(this.projectileBody, launchVelocityWorld);
    this.pushWind(false);
    this.pushMagnet(false, pixelsToMetres(startXPx, this.pixelsPerMetre), worldYToSimY(startYPx, this.worldHeightPx, this.pixelsPerMetre));
    // Walking Jonh: his colliders sit where he is during the first fixed step after Fire.
    this.placeJonh(1);

    this.prevPosPx = { x: startXPx, y: startYPx };
    return this.projectileBody;
  }

  stepProjectile(level: LevelData, radiusMetres: number): ProjectileState | null {
    const state = this.stepSwept(level, radiusMetres);
    if (state) {
      const supported = this.rampRolling !== null || this.supportMaterial(level, { x: state.xSim, y: state.ySim }, radiusMetres) !== undefined;
      this.pushWind(supported);
      this.pushMagnet(supported, state.xSim, state.ySim);
    }
    return state;
  }

  /**
   * Wind [PROPOSED]: a horizontal force on the ball for Matter's *next* update, added exactly the way
   * Matter adds gravity (so it integrates identically and the swept guard sees the velocity Matter
   * produced). It acts on the ball only, is not a contact, and is skipped while the ball rests on a
   * surface so a rolling ball still settles. Matter clears forces at the end of every update, so the
   * level's wind is re-applied after each step; with no wind nothing is touched at all.
   */
  private pushWind(supported: boolean): void {
    if (this.windPxPerMs2 === 0 || supported || !this.projectileBody) return;
    this.projectileBody.force.x += this.projectileBody.mass * this.windPxPerMs2;
  }

  /**
   * The electromagnet [PROPOSED 2026-11-25] (SPEC §8.10): its pull on the ball where it is now, as a
   * force for Matter's *next* update, added exactly like wind (and gravity), so it is stepped only by
   * the fixed step and the swept guard sees the velocity Matter produced. Ball only, never a contact,
   * skipped while the ball rests on a surface (so it settles); with no magnet nothing is touched.
   */
  private pushMagnet(supported: boolean, xSim: number, ySim: number): void {
    const field = this.magnet;
    if (!field || !this.magnetShape || supported || this.magnetHold || !this.projectileBody) return;
    const a = magnetAcceleration(field, xSim, ySim, this.magnetShape);
    if (a.x === 0 && a.y === 0) return;
    const mass = this.projectileBody.mass;
    this.projectileBody.force.x += mass * accelerationToMatter(a.x, this.pixelsPerMetre);
    // Matter's y points down.
    this.projectileBody.force.y -= mass * accelerationToMatter(a.y, this.pixelsPerMetre);
  }

  /**
   * The ball touched the magnet's housing [PROPOSED 2026-11-25]: it sticks at the contact point (just
   * outside the surface) with no velocity, as a static body, so nothing (gravity, the pull, Matter's
   * contacts) moves it again this shot. Its speed is 0, so the shot settles: a miss.
   */
  private holdOnMagnet(hit: SweptHit, currSim: Point2D, currPx: Point2D): void {
    const body = this.projectileBody!;
    const at = { x: hit.point.x + hit.normal.x * 1e-4, y: hit.point.y + hit.normal.y * 1e-4 };
    const px = { x: metresToPixels(at.x, this.pixelsPerMetre), y: simYToWorldY(at.y, this.worldHeightPx, this.pixelsPerMetre) };
    Matter.Body.setPosition(body, px);
    Matter.Body.setVelocity(body, { x: 0, y: 0 });
    body.positionImpulse.x = 0;
    body.positionImpulse.y = 0;
    Matter.Body.setStatic(body, true);
    this.magnetHold = at;
    currSim.x = at.x;
    currSim.y = at.y;
    currPx.x = px.x;
    currPx.y = px.y;
  }

  /** Whether the magnet is holding the ball (it touched the magnet's housing this shot). */
  get heldByMagnet(): boolean { return this.magnetHold !== null; }

  /** The material of the top surface the ball rests on (ground, roofs, decks), if any. */
  private supportMaterial(level: LevelData, at: Point2D, radiusMetres: number): string | undefined {
    return this.hasHitGround && at.y <= level.ground.maxY + radiusMetres + 1e-3
      ? level.ground.material
      : level.obstacles.find(o => at.x >= o.box.minX && at.x <= o.box.maxX &&
        Math.abs(at.y - radiusMetres - o.box.maxY) <= 2e-3 && !this.brokenIds.includes(o.id))?.material;
  }

  private stepSwept(level: LevelData, radiusMetres: number): ProjectileState | null {
    if (!this.projectileBody) return null;
    this.stepEvents = [];
    if (this.magnetHold) {
      // Stuck to the magnet: it does not move again this shot (it settles, a miss).
      this.advanceJonh();
      return this.snapshot({ ...this.magnetHold }, { x: this.projectileBody.position.x, y: this.projectileBody.position.y });
    }

    const currPx = {
      x: this.projectileBody.position.x,
      y: this.projectileBody.position.y,
    };
    const prevPx = this.prevPosPx ?? currPx;

    const prevSim = {
      x: pixelsToMetres(prevPx.x, this.pixelsPerMetre),
      y: worldYToSimY(prevPx.y, this.worldHeightPx, this.pixelsPerMetre),
    };
    const currSim = {
      x: pixelsToMetres(currPx.x, this.pixelsPerMetre),
      y: worldYToSimY(currPx.y, this.worldHeightPx, this.pixelsPerMetre),
    };

    // Solid colliders for sweeping (a prop smashed earlier this shot is gone).
    const boxes = this.solidBoxes(level);
    // Ice [PROPOSED 2026-11-25]: a ball gliding along a slide surface is held up by Matter's resting
    // contact alone; the guard skips that surface for the step. Otherwise it would put the ball back at
    // its contact point every step and the ball would lose the ground it covered (harmless on grass,
    // which stops a ball anyway, but it would stall a slide). The ball is not moving into the surface,
    // so it cannot tunnel through it; every other solid (Jonh, walls) is still swept.
    const glideOn = this.slideSurfaceAt(level, prevSim, radiusMetres, this.previousVelocity.y)?.id;
    const sweepBoxes = glideOn !== undefined ? boxes.filter(b => b.label !== 'obstacle' || b.id !== glideOn) : boxes;
    const earliestHit = earliestSolidHit(prevSim, currSim, radiusMetres, sweepBoxes, this.jonhRoute !== null);
    // Ramps (exact arcs): the earliest one counts only when it comes strictly before every box.
    const rampHit = this.ramps.length > 0 ? this.earliestRampHit(prevSim, currSim, radiusMetres) : null;
    const wasRolling = this.rampRolling;
    this.rampRolling = null;

    // Portals: touching an unused entry before any solid sends the ball through (no bounce, no contact).
    if (level.portals && level.portals.length > 0) {
      const entry = this.portalEntry(level.portals, prevSim, currSim, radiusMetres, boxes);
      if (entry && (!earliestHit || entry.t < earliestHit.hit.t) && (!rampHit || entry.t < rampHit.hit.t)) {
        return this.teleport(level, radiusMetres, prevSim, currSim, entry.portal, entry.t);
      }
    }

    // Hat sensor and overhead pass over this step's path.
    this.senseJonh(level, radiusMetres, prevSim, currSim);

    const rampFirst = rampHit !== null && (!earliestHit || rampHit.hit.t < earliestHit.hit.t);
    const rolled = rampFirst && this.resolveRamp(rampHit, prevSim, currSim, currPx, radiusMetres);
    if (wasRolling !== null && this.rampRolling === null) this.noteRampExit(wasRolling, currPx);
    if (rampFirst) {
      // The ramp came first: it rolled or bounced the ball this step, nothing else did.
    } else if (earliestHit && earliestHit.breakable && earliestHit.id !== undefined &&
      this.smash(earliestHit.id, earliestHit.breakable, earliestHit.hit, currSim, currPx)) {
      // Smashed through: the prop is gone, the ball carries on. Not a contact, never a ricochet.
    } else if (earliestHit) {
      if (earliestHit.boxLabel === 'jonhBody' && !this.hasHitJonh) {
        // Use incoming velocity, before Matter or the swept guard reflects it.
        this.impactSpeedMs = matterVelocityToSpeedMs(
          vectorLength(this.previousVelocity.x, this.previousVelocity.y), this.pixelsPerMetre,
        );
      }
      if (earliestHit.boxLabel === 'ground' && !this.firstGroundContact) {
        this.firstGroundContact = {
          xSim: earliestHit.hit.point.x,
          xPx: metresToPixels(earliestHit.hit.point.x, this.pixelsPerMetre),
          yPx: simYToWorldY(level.ground.maxY, this.worldHeightPx, this.pixelsPerMetre),
        };
      }
      if (earliestHit.boxLabel === 'obstacle') {
        const obsId = earliestHit.id ?? 'obstacle';
        if (!this.obstacleContacts.some((o) => o.id === obsId)) {
          this.obstacleContacts.push({
            id: obsId,
            ricochet: Boolean(earliestHit.ricochet),
            material: earliestHit.material,
          });
        }
        if (earliestHit.ricochet && !this.hasHitJonh) {
          this.hadRicochetBeforeBody = true;
        }
      }
      if (earliestHit.boxLabel === 'jonhBody') this.hasHitJonh = true;
      if (earliestHit.boxLabel === 'ground') this.hasHitGround = true;

      // Calculate relative velocity into normal (relative to Jonh's walk when he is the surface).
      const wall = earliestHit.boxLabel === 'jonhBody' ? this.jonhVelocityMatter() : null;
      // The magnet holds a ball that touches its housing: no bounce, it sticks where it touched.
      if (earliestHit.boxLabel === 'obstacle' && this.magnet !== null && earliestHit.id === this.magnet.housingId) {
        this.holdOnMagnet(earliestHit.hit, currSim, currPx);
        this.prevPosPx = { ...currPx };
        this.previousVelocity = { x: 0, y: 0 };
        this.advanceJonh();
        return this.snapshot(currSim, currPx);
      }
      this.reflect(earliestHit.hit, earliestHit.material, wall, currSim, currPx);
    }

    // Only one contact is resolved per step, and a ball resting on a box (the ground) always touches it
    // at t = 0, so a ramp it is also pressing against could be skipped: push it back out of any ramp.
    if (this.ramps.length > 0 && !rolled) this.depenetrateRamps(currSim, currPx, radiusMetres);

    // Ice [PROPOSED 2026-11-25]: a ball resting on a slide surface rides it (see glide).
    const slidingOn = rolled ? undefined : this.glide(level, currSim, currPx, radiusMetres);
    // Rolling resistance on whatever top surface the ball rests on (ground, roofs, decks), so a
    // ball that lands on a flat top slows to a stop instead of sliding on indefinitely. A ball rolling
    // on a ramp gets the ramp's own drag instead (rollOnArc).
    const support = rolled || slidingOn !== undefined ? undefined : this.supportMaterial(level, currSim, radiusMetres);
    if (support !== undefined) {
      const mat = (MATERIALS as Record<string, MaterialProps>)[support];
      Matter.Body.setVelocity(this.projectileBody, {
        x: this.projectileBody.velocity.x * (mat?.rollingDamping ?? PHYSICS.groundRollingDamping),
        y: this.projectileBody.velocity.y,
      });
      // Soft snow [PROPOSED 2026-11-25]: a crawling ball sinks in and stops (only materials that say so).
      const stop = mat?.stopBelowMs;
      if (stop !== undefined && matterVelocityToSpeedMs(vectorLength(this.projectileBody.velocity.x, this.projectileBody.velocity.y), this.pixelsPerMetre) < stop) {
        Matter.Body.setVelocity(this.projectileBody, { x: 0, y: 0 });
        Matter.Body.setAngularVelocity(this.projectileBody, 0);
      }
    }

    this.prevPosPx = { ...currPx };
    this.previousVelocity = { ...this.projectileBody.velocity };
    this.advanceJonh();
    return this.snapshot(currSim, currPx, slidingOn === undefined ? null : slidingOn.moving ? slidingOn.material : null);
  }

  /**
   * The intact slide-surface obstacle (ice) whose top the ball is resting on at `at` with vertical
   * velocity `vyMatter` (no faster than a bounce either way), if any. More tolerant than
   * supportMaterial: Matter rests a ball a couple of millimetres into a surface. Never on maps without ice.
   */
  private slideSurfaceAt(level: LevelData, at: Point2D, radiusMetres: number, vyMatter: number): ObstacleData | undefined {
    if (Math.abs(vyMatter) > speedMsToMatterVelocity(PHYSICS.bounceMinNormalSpeedMs, this.pixelsPerMetre)) return undefined;
    return level.obstacles.find(o => (MATERIALS as Record<string, MaterialProps>)[o.material]?.slideFrictionMs2 !== undefined &&
      at.x >= o.box.minX && at.x <= o.box.maxX && !this.brokenIds.includes(o.id) &&
      at.y - radiusMetres - o.box.maxY <= SLIDE_REST_ABOVE_METRES && at.y - radiusMetres - o.box.maxY >= -SLIDE_REST_BELOW_METRES);
  }

  /**
   * A ball resting on ice glides along it: it rides the surface exactly (no bob, so it can settle), its
   * horizontal speed falls by the material's slideFrictionMs2 every step (kinetic friction, the same at
   * every speed), and any spin it picked up in a bounce is dropped (a skidding ball does not roll;
   * nothing on frictionless ice would ever stop it, and Matter's many-sided circle bobs on its facets
   * while it turns). Returns the surface and whether the ball is still moving, or undefined.
   */
  private glide(level: LevelData, currSim: Point2D, currPx: Point2D, radiusMetres: number): { material: string; moving: boolean } | undefined {
    const body = this.projectileBody!;
    const surface = this.slideSurfaceAt(level, currSim, radiusMetres, body.velocity.y);
    if (!surface) return undefined;
    const friction = (MATERIALS as Record<string, MaterialProps>)[surface.material]!.slideFrictionMs2!;
    const dv = speedMsToMatterVelocity(friction * PHYSICS.fixedStepSeconds, this.pixelsPerMetre);
    const vx = body.velocity.x > 0 ? Math.max(0, body.velocity.x - dv) : Math.min(0, body.velocity.x + dv);
    currSim.y = surface.box.maxY + radiusMetres;
    currPx.y = simYToWorldY(currSim.y, this.worldHeightPx, this.pixelsPerMetre);
    Matter.Body.setPosition(body, { x: currPx.x, y: currPx.y });
    Matter.Body.setVelocity(body, { x: vx, y: 0 });
    Matter.Body.setAngularVelocity(body, 0);
    body.positionImpulse.x = 0;
    body.positionImpulse.y = 0;
    return { material: surface.material, moving: vx !== 0 };
  }

  /**
   * Bounces the ball off a surface the swept guard found (`hit`, sim units, normal pointing out of the
   * surface), relative to `wall` (Jonh's walk, Matter units) when he is the surface. Still moving into
   * the surface: reflect to prevent tunnelling. Already resolved by Matter after a real impact: redo
   * the bounce from the incoming velocity with this material. Moves `currSim`/`currPx` to the contact.
   */
  private reflect(hit: SweptHit, material: string, wall: { x: number; y: number } | null, currSim: Point2D, currPx: Point2D): void {
    const body = this.projectileBody!;
    const matterVx = wall ? body.velocity.x - wall.x : body.velocity.x;
    const matterVy = wall ? body.velocity.y - wall.y : body.velocity.y;

    const matterNormalX = hit.normal.x;
    const matterNormalY = -hit.normal.y; // sim +y is up, matter +y is down

    const dotNow = matterVx * matterNormalX + matterVy * matterNormalY;
    // Velocity entering this step: Matter may already have resolved (and damped) the impact.
    const inVx = wall ? this.previousVelocity.x - wall.x : this.previousVelocity.x;
    const inVy = wall ? this.previousVelocity.y - wall.y : this.previousVelocity.y;
    const dotIn = inVx * matterNormalX + inVy * matterNormalY;
    const minBounce = speedMsToMatterVelocity(PHYSICS.bounceMinNormalSpeedMs, this.pixelsPerMetre);

    if (dotNow < 0 || dotIn < -minBounce) {
      const [vx, vy, dot] = dotNow < 0 ? [matterVx, matterVy, dotNow] : [inVx, inVy, dotIn];
      const mat = (MATERIALS as Record<string, { restitution: number; friction: number }>)[material] ?? { restitution: 0.2, friction: 0.5 };
      const projMat = MATERIALS.cannonball;
      // Ice [PROPOSED 2026-11-25]: a slide surface's own low bounce wins, so a landing ball skates off
      // at once instead of skipping; every other surface bounces at least as much as the ball itself.
      const restitution = (MATERIALS as Record<string, MaterialProps>)[material]?.slideFrictionMs2 !== undefined
        ? mat.restitution
        : Math.max(mat.restitution, projMat.restitution);

      let vNewMatterX = vx - (1 + restitution) * dot * matterNormalX;
      let vNewMatterY = vy - (1 + restitution) * dot * matterNormalY;
      // Soft snow [PROPOSED 2026-11-25]: a real landing keeps only a share of its speed along the
      // surface, so the ball plops in and stops instead of skipping on. Every other material keeps it all.
      const kept = (MATERIALS as Record<string, MaterialProps>)[material]?.tangentKept;
      if (kept !== undefined && -dot > minBounce) {
        const along = -vNewMatterX * matterNormalY + vNewMatterY * matterNormalX;
        vNewMatterX += (1 - kept) * along * matterNormalY;
        vNewMatterY -= (1 - kept) * along * matterNormalX;
      }

      // Reposition exactly at time of impact, plus tiny epsilon to avoid sticky re-collision
      const newSimX = hit.point.x + hit.normal.x * 1e-4;
      const newSimY = hit.point.y + hit.normal.y * 1e-4;

      const newPxX = metresToPixels(newSimX, this.pixelsPerMetre);
      const newPxY = simYToWorldY(newSimY, this.worldHeightPx, this.pixelsPerMetre);

      Matter.Body.setPosition(body, { x: newPxX, y: newPxY });
      Matter.Body.setVelocity(body, wall
        ? { x: vNewMatterX + wall.x, y: vNewMatterY + wall.y }
        : { x: vNewMatterX, y: vNewMatterY });

      currPx.x = newPxX;
      currPx.y = newPxY;
      currSim.x = newSimX;
      currSim.y = newSimY;
    }
  }

  /**
   * The ball was rolling on a ramp last step and is not now. Rising off it is a launch (it rolled off a
   * lip into the air, whether this step's roll carried it past the end or its straight path already
   * cleared the end of the curve): recorded per shot and sent as an event for the clack and the dust.
   */
  private noteRampExit(rampId: string, currPx: Point2D): void {
    const vy = -matterVelocityToSpeedMs(this.projectileBody!.velocity.y, this.pixelsPerMetre);
    if (!(vy > PHYSICS.bounceMinNormalSpeedMs)) return;
    this.rampLaunches.push(rampId);
    const speedMs = matterVelocityToSpeedMs(vectorLength(this.projectileBody!.velocity.x, this.projectileBody!.velocity.y), this.pixelsPerMetre);
    this.stepEvents.push({ kind: 'rampLaunch', id: rampId, xPx: currPx.x, yPx: currPx.y, speedMs });
  }

  /**
   * Pushes a ball that ended the step overlapping a ramp back out along that ramp's surface normal
   * and takes away its velocity into the ramp (a resting contact: no bounce). Matter cannot do this
   * for a ramp (its pieces are sensors), and the swept guard resolves one contact per step.
   */
  private depenetrateRamps(currSim: Point2D, currPx: Point2D, radiusMetres: number): void {
    const body = this.projectileBody!;
    for (const { ramp, shape } of this.ramps) {
      const c = closestOnArc(shape, currSim);
      if (c.signedDistance >= radiusMetres - 1e-6) continue;
      const push = radiusMetres + 1e-4 - c.signedDistance;
      currSim.x += c.normal.x * push;
      currSim.y += c.normal.y * push;
      currPx.x = metresToPixels(currSim.x, this.pixelsPerMetre);
      currPx.y = simYToWorldY(currSim.y, this.worldHeightPx, this.pixelsPerMetre);
      Matter.Body.setPosition(body, { x: currPx.x, y: currPx.y });
      const nx = c.normal.x;
      const ny = -c.normal.y; // Matter's y points down
      const into = body.velocity.x * nx + body.velocity.y * ny;
      if (into < 0) Matter.Body.setVelocity(body, { x: body.velocity.x - into * nx, y: body.velocity.y - into * ny });
      if (!this.obstacleContacts.some(o => o.id === ramp.id)) {
        this.obstacleContacts.push({ id: ramp.id, ricochet: ramp.ricochet, material: ramp.material });
      }
      if (ramp.ricochet && !this.hasHitJonh) this.hadRicochetBeforeBody = true;
    }
  }

  /** The earliest ramp the ball's swept circle touches between two positions, if any. */
  private earliestRampHit(prev: Point2D, curr: Point2D, radius: number): (RampSolid & { hit: ArcHit }) | null {
    let best: (RampSolid & { hit: ArcHit }) | null = null;
    for (const solid of this.ramps) {
      const hit = sweepCircleVsArc(prev, curr, radius, solid.shape);
      if (hit && (!best || hit.t < best.hit.t)) best = { ...solid, hit };
    }
    return best;
  }

  /**
   * A ramp contact (SPEC §8.9). It is an obstacle contact with the ramp's own ricochet flag. On the
   * riding face, a ball arriving faster than PHYSICS.bounceMinNormalSpeedMs into it (measured at the
   * angle it started the step at, so the curve's own turning never counts as an impact) bounces with
   * the material; a gentler one rolls along the curve for this step (sim/arc.ts rollOnArc) and may
   * leave off the lip. Any other face (back, ends, corners) bounces like a box. Returns true when the
   * ball rolled.
   */
  private resolveRamp(rampHit: RampSolid & { hit: ArcHit }, prevSim: Point2D, currSim: Point2D, currPx: Point2D, radiusMetres: number): boolean {
    const body = this.projectileBody!;
    const { ramp, shape, hit } = rampHit;
    if (!this.obstacleContacts.some(o => o.id === ramp.id)) {
      this.obstacleContacts.push({ id: ramp.id, ricochet: ramp.ricochet, material: ramp.material });
    }
    if (ramp.ricochet && !this.hasHitJonh) this.hadRicochetBeforeBody = true;

    const ppm = this.pixelsPerMetre;
    const toSim = (v: { x: number; y: number }) => ({ x: matterVelocityToSpeedMs(v.x, ppm), y: -matterVelocityToSpeedMs(v.y, ppm) });
    const v0 = toSim(this.previousVelocity);
    if (hit.feature === 'inner') {
      const into = radial(clampToArc(shape, Math.atan2(prevSim.y - shape.cy, prevSim.x - shape.cx)));
      if (v0.x * into.x + v0.y * into.y <= PHYSICS.bounceMinNormalSpeedMs) {
        const v1 = toSim(body.velocity);
        const mat = (MATERIALS as Record<string, MaterialProps>)[ramp.material];
        const roll = rollOnArc({
          shape, ballRadius: radiusMetres, p0: prevSim, v0, dv: { x: v1.x - v0.x, y: v1.y - v0.y },
          dt: PHYSICS.fixedStepSeconds, rollingResistance: mat?.rollingResistance ?? RAMP.rollingResistance,
          trappedDragScale: RAMP.trappedDragScale,
        });
        const px = { x: metresToPixels(roll.point.x, ppm), y: simYToWorldY(roll.point.y, this.worldHeightPx, ppm) };
        Matter.Body.setPosition(body, px);
        Matter.Body.setVelocity(body, { x: speedMsToMatterVelocity(roll.velocity.x, ppm), y: -speedMsToMatterVelocity(roll.velocity.y, ppm) });
        body.positionImpulse.x = 0;
        body.positionImpulse.y = 0;
        currPx.x = px.x;
        currPx.y = px.y;
        currSim.x = roll.point.x;
        currSim.y = roll.point.y;
        if (!roll.left) this.rampRolling = ramp.id;
        return true;
      }
    }
    this.reflect(hit, ramp.material, null, currSim, currPx);
    return false;
  }

  /** Jonh's colliders as they are this step: his spawn moved along the route (the spawn itself otherwise). */
  private jonhNow(level: LevelData): JonhSpawnData {
    const pose = this.jonhPose;
    return pose ? shiftJonh(level.jonhSpawn, pose.dx, pose.dy) : level.jonhSpawn;
  }

  /**
   * Puts Jonh's Matter body and hat where the route has him during fixed step `step` (0 = aiming).
   * The swept guard reads the same pose through jonhNow, so both see the same boxes every step.
   */
  private placeJonh(step: number): void {
    const route = this.jonhRoute;
    const base = this.jonhSpawnBase;
    if (!route || !base) { this.jonhPose = null; this.jonhPrevPose = null; this.jonhStep = 0; return; }
    this.jonhStep = step;
    this.jonhPrevPose = step > 0 ? routePoseAtStep(route, step - 1) : null;
    this.jonhPose = routePoseAtStep(route, step);
    const moved = shiftJonh(base, this.jonhPose.dx, this.jonhPose.dy);
    const centre = (b: Box2D) => ({
      x: metresToPixels((b.minX + b.maxX) / 2, this.pixelsPerMetre),
      y: simYToWorldY((b.minY + b.maxY) / 2, this.worldHeightPx, this.pixelsPerMetre),
    });
    if (this.jonhBody) Matter.Body.setPosition(this.jonhBody, centre(moved.bodyBox));
    if (this.jonhHatBody && moved.hatBox) Matter.Body.setPosition(this.jonhHatBody, centre(moved.hatBox));
  }

  /** After a step: Jonh walks on to the next step's spot, unless the ball has touched him (he stops). */
  private advanceJonh(): void {
    if (!this.jonhRoute) return;
    // Stopped: he stands still from now on (later contacts see a still wall).
    if (this.hasHitJonh || this.hasHitHat) { this.jonhPrevPose = this.jonhPose; return; }
    this.placeJonh(this.jonhStep + 1);
  }

  /** Jonh's walking velocity during this step in Matter units (px per 1000/60 ms; y down). */
  private jonhVelocityMatter(): { x: number; y: number } | null {
    const now = this.jonhPose;
    const before = this.jonhPrevPose;
    if (!now || !before) return null;
    const dt = PHYSICS.fixedStepSeconds;
    return {
      x: speedMsToMatterVelocity((now.dx - before.dx) / dt, this.pixelsPerMetre),
      y: -speedMsToMatterVelocity((now.dy - before.dy) / dt, this.pixelsPerMetre),
    };
  }

  /** Jonh's body box where he is now (his spawn box on maps where he does not walk). */
  jonhBodyBox(level: LevelData): Box2D { return this.jonhNow(level).bodyBox; }

  /** Where Jonh is on his route now (null on maps where he does not walk). Offsets in metres. */
  get jonhRoutePose(): RoutePose | null { return this.jonhPose; }

  /**
   * Jonh's route pose at simulated time `simT` after Fire during the current shot, never past the
   * step he stopped at (for the slow-motion replay). Null on maps where he does not walk.
   */
  jonhRoutePoseAt(simT: number): RoutePose | null {
    if (!this.jonhRoute) return null;
    const step = Math.min(this.jonhStep, Math.max(0, Math.round(simT / PHYSICS.fixedStepSeconds)));
    return routePoseAtStep(this.jonhRoute, step);
  }

  /** Ground, Jonh's body and every obstacle not smashed this shot, in level order. */
  private solidBoxes(level: LevelData): SolidBox[] {
    return [
      { box: level.ground, label: 'ground', material: level.ground.material },
      { box: this.jonhNow(level).bodyBox, label: 'jonhBody', material: 'jonhBody' },
      ...level.obstacles.filter(o => !this.brokenIds.includes(o.id)).map((o) => ({
        box: o.box,
        label: 'obstacle' as const,
        material: o.material,
        id: o.id,
        ricochet: o.ricochet,
        breakable: o.breakable,
      })),
    ];
  }

  /** Hat sensor (never blocks or reflects) and the overhead-pass check, over one stretch of path. */
  private senseJonh(level: LevelData, radiusMetres: number, from: Point2D, to: Point2D): void {
    const jonh = this.jonhNow(level);
    if (jonh.hatBox) {
      const hatHit = sweepCircleVsBox(from, to, radiusMetres, jonh.hatBox);
      if (hatHit && hatHit.t <= 1) {
        this.hasHitHat = true;
      }
    }

    const jonhMinX = jonh.bodyBox.minX;
    const jonhMaxX = jonh.bodyBox.maxX;
    const jonhTopY = jonh.hatBox?.maxY ?? jonh.bodyBox.maxY;
    const maxOverheadY = jonhTopY + LOOK.overheadAltitudeMarginMetres;

    const minXSeg = Math.min(from.x, to.x);
    const maxXSeg = Math.max(from.x, to.x);
    const crossesJonhX = maxXSeg >= jonhMinX && minXSeg <= jonhMaxX;
    const isAboveJonh = to.y > jonhTopY && to.y <= maxOverheadY;

    if (crossesJonhX && isAboveJonh) {
      this.passedOverhead = true;
    }
  }

  /**
   * Breaks a prop when the ball drives into it at least as fast as its threshold: it is switched off
   * in Matter and the swept guard for the rest of the shot, and the ball carries on from the contact
   * point with the kept share of its incoming velocity (no reflection). Returns false when too slow.
   */
  private smash(id: string, breakable: BreakableData, hit: SweptHit, currSim: Point2D, currPx: Point2D): boolean {
    const body = this.projectileBody!;
    const nx = hit.normal.x;
    const ny = -hit.normal.y; // sim +y is up, matter +y is down
    const dotNow = body.velocity.x * nx + body.velocity.y * ny;
    const dotIn = this.previousVelocity.x * nx + this.previousVelocity.y * ny;
    // Same incoming velocity a bounce would use: still driving in, else the one entering this step.
    const [vx, vy, dot] = dotNow < 0
      ? [body.velocity.x, body.velocity.y, dotNow]
      : [this.previousVelocity.x, this.previousVelocity.y, dotIn];
    const impactSpeedMs = matterVelocityToSpeedMs(-dot, this.pixelsPerMetre);
    if (!(impactSpeedMs >= breakable.minImpactSpeedMs)) return false;

    const prop = this.breakables.get(id);
    if (prop) prop.body.collisionFilter.mask = 0;
    this.brokenIds.push(id);
    const at = {
      x: metresToPixels(hit.point.x, this.pixelsPerMetre),
      y: simYToWorldY(hit.point.y, this.worldHeightPx, this.pixelsPerMetre),
    };
    Matter.Body.setPosition(body, at);
    Matter.Body.setVelocity(body, { x: vx * breakable.speedKept, y: vy * breakable.speedKept });
    body.positionImpulse.x = 0;
    body.positionImpulse.y = 0;
    this.stepEvents.push({ kind: 'break', id, xPx: at.x, yPx: at.y, impactSpeedMs });
    currPx.x = at.x;
    currPx.y = at.y;
    currSim.x = hit.point.x;
    currSim.y = hit.point.y;
    return true;
  }

  /**
   * The first unused portal whose entry the ball touches along this step. A portal whose exit is
   * blocked by a solid is skipped (level validation keeps authored exits clear).
   */
  private portalEntry(portals: readonly PortalData[], prev: Point2D, curr: Point2D, radiusMetres: number,
    boxes: readonly SolidBox[]): { portal: PortalData; t: number } | null {
    let best: { portal: PortalData; t: number } | null = null;
    for (const portal of portals) {
      if (this.portalsUsed.includes(portal.id)) continue;
      const t = sweepCircleVsDisc(prev, curr, radiusMetres, portal.entry, portal.entry.radius);
      if (t === null || (best && t >= best.t)) continue;
      if (boxes.some(b => circleOverlapsBox(portal.exit, radiusMetres, b.box))) continue;
      best = { portal, t };
    }
    return best;
  }

  /**
   * Sends the ball through a portal: the stretch of this step up to the entry still counts for the hat
   * and overhead checks, then the ball reappears at the exit with the speed it entered this step at,
   * heading in the exit's direction. The next step's sweep starts from the exit.
   */
  private teleport(level: LevelData, radiusMetres: number, prevSim: Point2D, currSim: Point2D,
    portal: PortalData, t: number): ProjectileState {
    const body = this.projectileBody!;
    const reached = { x: prevSim.x + (currSim.x - prevSim.x) * t, y: prevSim.y + (currSim.y - prevSim.y) * t };
    this.senseJonh(level, radiusMetres, prevSim, reached);

    const speed = vectorLength(this.previousVelocity.x, this.previousVelocity.y);
    const heading = portal.exit.angleDeg * Math.PI / 180;
    const exitPx = {
      x: metresToPixels(portal.exit.x, this.pixelsPerMetre),
      y: simYToWorldY(portal.exit.y, this.worldHeightPx, this.pixelsPerMetre),
    };
    Matter.Body.setPosition(body, exitPx);
    // Matter's y points down.
    Matter.Body.setVelocity(body, { x: speed * Math.cos(heading), y: -speed * Math.sin(heading) });
    body.positionImpulse.x = 0;
    body.positionImpulse.y = 0;
    this.portalsUsed.push(portal.id);
    this.stepEvents.push({
      kind: 'portal',
      id: portal.id,
      entryXPx: metresToPixels(reached.x, this.pixelsPerMetre),
      entryYPx: simYToWorldY(reached.y, this.worldHeightPx, this.pixelsPerMetre),
      exitXPx: exitPx.x,
      exitYPx: exitPx.y,
    });

    this.prevPosPx = { ...exitPx };
    this.previousVelocity = { ...body.velocity };
    this.advanceJonh();
    return this.snapshot({ x: portal.exit.x, y: portal.exit.y }, exitPx);
  }

  private snapshot(currSim: Point2D, currPx: Point2D, slidingOn: string | null = null): ProjectileState {
    const body = this.projectileBody!;
    // Matter velocity is in px per (1000/60)ms -> speed in m/s = (px/baseStep * 60) / ppm
    const vxMs = matterVelocityToSpeedMs(body.velocity.x, this.pixelsPerMetre);
    // In world y is down, so vySim = -vyWorld
    const vyMs = -matterVelocityToSpeedMs(body.velocity.y, this.pixelsPerMetre);
    const speedMs = vectorLength(vxMs, vyMs);

    return {
      xSim: currSim.x,
      ySim: currSim.y,
      xPx: currPx.x,
      yPx: currPx.y,
      vxSim: vxMs,
      vySim: vyMs,
      speedMs,
      hitJonh: this.hasHitJonh,
      hitHat: this.hasHitHat,
      hitGround: this.hasHitGround,
      passedOverhead: this.passedOverhead,
      impactSpeedMs: this.impactSpeedMs,
      firstGroundContact: this.firstGroundContact,
      obstacleContacts: [...this.obstacleContacts],
      hadRicochetBeforeBody: this.hadRicochetBeforeBody,
      brokenObstacleIds: [...this.brokenIds],
      portalsUsed: [...this.portalsUsed],
      events: this.stepEvents,
      rampRolling: this.rampRolling,
      rampLaunches: [...this.rampLaunches],
      slidingOn,
    };
  }

  removeProjectile(): void {
    if (this.projectileBody) {
      Matter.World.remove(this.matterWorld, this.projectileBody);
      this.projectileBody = null;
    }
    this.prevPosPx = null;
    this.hasHitJonh = false;
    this.hasHitHat = false;
    this.hasHitGround = false;
    this.passedOverhead = false;
    this.impactSpeedMs = 0;
    this.firstGroundContact = null;
    this.obstacleContacts = [];
    this.hadRicochetBeforeBody = false;
    // Scene reset (SPEC §7.2): every smashed prop is whole again and every portal works again.
    for (const id of this.brokenIds) {
      const prop = this.breakables.get(id);
      if (prop) prop.body.collisionFilter.mask = prop.mask;
    }
    this.brokenIds = [];
    this.portalsUsed = [];
    this.stepEvents = [];
    this.rampRolling = null;
    this.rampLaunches = [];
    this.magnetHold = null;
    // Jonh walks back to the start of his route (scene reset, SPEC §7.2).
    if (this.jonhRoute) this.placeJonh(0);
  }

  clear(): void {
    this.removeProjectile();
    if (this.groundBody) {
      Matter.World.remove(this.matterWorld, this.groundBody);
      this.groundBody = null;
    }
    if (this.jonhBody) {
      Matter.World.remove(this.matterWorld, this.jonhBody);
      this.jonhBody = null;
    }
    if (this.jonhHatBody) {
      Matter.World.remove(this.matterWorld, this.jonhHatBody);
      this.jonhHatBody = null;
    }
    for (const obs of this.obstacleBodies) {
      Matter.World.remove(this.matterWorld, obs);
    }
    this.obstacleBodies = [];
    this.breakables.clear();
    for (const piece of this.rampBodies) Matter.World.remove(this.matterWorld, piece);
    this.rampBodies = [];
    this.ramps = [];
  }
}

/** Area centroid of a simple polygon (Matter centres a body's vertices on it). */
function polygonCentroid(points: ReadonlyArray<{ x: number; y: number }>): { x: number; y: number } {
  let area = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    const cross = a.x * b.y - b.x * a.y;
    area += cross;
    cx += (a.x + b.x) * cross;
    cy += (a.y + b.y) * cross;
  }
  return { x: cx / (3 * area), y: cy / (3 * area) };
}
