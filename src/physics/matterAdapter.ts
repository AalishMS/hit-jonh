import Matter, { type Body, type World } from '@matter-js';
import { LOOK, MATERIALS, PHYSICS, type MaterialProps } from '../config/tuning';
import { routePoseAtStep, shiftJonh, type RoutePose } from '../levels/jonhRoute';
import type { BreakableData, JonhRouteData, JonhSpawnData, LevelData, PortalData } from '../levels/types';
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
}

/** Something a level mechanic did to the ball during one fixed step (world pixels). */
export type MechanicEvent =
  | { kind: 'break'; id: string; xPx: number; yPx: number; impactSpeedMs: number }
  | { kind: 'portal'; id: string; entryXPx: number; entryYPx: number; exitXPx: number; exitYPx: number };

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
      Matter.World.add(this.matterWorld, obsBody);
      this.obstacleBodies.push(obsBody);
      if (obs.breakable) this.breakables.set(obs.id, { body: obsBody, mask: obsBody.collisionFilter.mask });
    }
    this.placeJonh(0);
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
    // Walking Jonh: his colliders sit where he is during the first fixed step after Fire.
    this.placeJonh(1);

    this.prevPosPx = { x: startXPx, y: startYPx };
    return this.projectileBody;
  }

  stepProjectile(level: LevelData, radiusMetres: number): ProjectileState | null {
    const state = this.stepSwept(level, radiusMetres);
    if (state) this.pushWind(this.supportMaterial(level, { x: state.xSim, y: state.ySim }, radiusMetres) !== undefined);
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
    const earliestHit = earliestSolidHit(prevSim, currSim, radiusMetres, boxes, this.jonhRoute !== null);

    // Portals: touching an unused entry before any solid sends the ball through (no bounce, no contact).
    if (level.portals && level.portals.length > 0) {
      const entry = this.portalEntry(level.portals, prevSim, currSim, radiusMetres, boxes);
      if (entry && (!earliestHit || entry.t < earliestHit.hit.t)) {
        return this.teleport(level, radiusMetres, prevSim, currSim, entry.portal, entry.t);
      }
    }

    // Hat sensor and overhead pass over this step's path.
    this.senseJonh(level, radiusMetres, prevSim, currSim);

    if (earliestHit && earliestHit.breakable && earliestHit.id !== undefined &&
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
      const matterVx = wall ? this.projectileBody.velocity.x - wall.x : this.projectileBody.velocity.x;
      const matterVy = wall ? this.projectileBody.velocity.y - wall.y : this.projectileBody.velocity.y;
      
      const matterNormalX = earliestHit.hit.normal.x;
      const matterNormalY = -earliestHit.hit.normal.y; // sim +y is up, matter +y is down

      const dotNow = matterVx * matterNormalX + matterVy * matterNormalY;
      // Velocity entering this step: Matter may already have resolved (and damped) the impact.
      const inVx = wall ? this.previousVelocity.x - wall.x : this.previousVelocity.x;
      const inVy = wall ? this.previousVelocity.y - wall.y : this.previousVelocity.y;
      const dotIn = inVx * matterNormalX + inVy * matterNormalY;
      const minBounce = speedMsToMatterVelocity(PHYSICS.bounceMinNormalSpeedMs, this.pixelsPerMetre);

      // Still moving into the surface: reflect to prevent tunnelling. Already resolved by Matter
      // after a real impact: redo the bounce from the incoming velocity with this material.
      if (dotNow < 0 || dotIn < -minBounce) {
        const [vx, vy, dot] = dotNow < 0 ? [matterVx, matterVy, dotNow] : [inVx, inVy, dotIn];
        const mat = (MATERIALS as Record<string, { restitution: number; friction: number }>)[earliestHit.material] ?? { restitution: 0.2, friction: 0.5 };
        const projMat = MATERIALS.cannonball;
        const restitution = Math.max(mat.restitution, projMat.restitution);

        const vNewMatterX = vx - (1 + restitution) * dot * matterNormalX;
        const vNewMatterY = vy - (1 + restitution) * dot * matterNormalY;

        // Reposition exactly at time of impact, plus tiny epsilon to avoid sticky re-collision
        const newSimX = earliestHit.hit.point.x + earliestHit.hit.normal.x * 1e-4;
        const newSimY = earliestHit.hit.point.y + earliestHit.hit.normal.y * 1e-4;

        const newPxX = metresToPixels(newSimX, this.pixelsPerMetre);
        const newPxY = simYToWorldY(newSimY, this.worldHeightPx, this.pixelsPerMetre);
        
        Matter.Body.setPosition(this.projectileBody, { x: newPxX, y: newPxY });
        Matter.Body.setVelocity(this.projectileBody, wall
          ? { x: vNewMatterX + wall.x, y: vNewMatterY + wall.y }
          : { x: vNewMatterX, y: vNewMatterY });

        currPx.x = newPxX;
        currPx.y = newPxY;
        currSim.x = newSimX;
        currSim.y = newSimY;
      }
    }

    // Rolling resistance on whatever top surface the ball rests on (ground, roofs, decks), so a
    // ball that lands on a flat top slows to a stop instead of sliding on indefinitely.
    const support = this.supportMaterial(level, currSim, radiusMetres);
    if (support !== undefined) {
      const mat = (MATERIALS as Record<string, MaterialProps>)[support];
      Matter.Body.setVelocity(this.projectileBody, {
        x: this.projectileBody.velocity.x * (mat?.rollingDamping ?? PHYSICS.groundRollingDamping),
        y: this.projectileBody.velocity.y,
      });
    }

    this.prevPosPx = { ...currPx };
    this.previousVelocity = { ...this.projectileBody.velocity };
    this.advanceJonh();
    return this.snapshot(currSim, currPx);
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

  private snapshot(currSim: Point2D, currPx: Point2D): ProjectileState {
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
  }
}
