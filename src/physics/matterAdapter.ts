import Matter, { type Body, type World } from '@matter-js';
import { LOOK, MATERIALS, PHYSICS, type MaterialProps } from '../config/tuning';
import type { LevelData } from '../levels/types';
import type { Box2D } from '../sim/swept';
import { sweepCircleVsBox } from '../sim/swept';
import {
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

  constructor(
    private readonly matterWorld: World,
    private readonly pixelsPerMetre: number,
    private readonly worldHeightPx: number,
  ) {}

  setupLevel(level: LevelData): void {
    this.clear();

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

    this.prevPosPx = { x: startXPx, y: startYPx };
    return this.projectileBody;
  }

  stepProjectile(level: LevelData, radiusMetres: number): ProjectileState | null {
    if (!this.projectileBody) return null;

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

    // 1. Hat sensor sweep (sensor collider: does not reflect velocity or block projectile)
    if (level.jonhSpawn.hatBox) {
      const hatHit = sweepCircleVsBox(prevSim, currSim, radiusMetres, level.jonhSpawn.hatBox);
      if (hatHit && hatHit.t <= 1) {
        this.hasHitHat = true;
      }
    }

    // 2. Overhead pass detection
    const jonhMinX = level.jonhSpawn.bodyBox.minX;
    const jonhMaxX = level.jonhSpawn.bodyBox.maxX;
    const jonhTopY = level.jonhSpawn.hatBox?.maxY ?? level.jonhSpawn.bodyBox.maxY;
    const maxOverheadY = jonhTopY + LOOK.overheadAltitudeMarginMetres;

    const minXSeg = Math.min(prevSim.x, currSim.x);
    const maxXSeg = Math.max(prevSim.x, currSim.x);
    const crossesJonhX = maxXSeg >= jonhMinX && minXSeg <= jonhMaxX;
    const isAboveJonh = currSim.y > jonhTopY && currSim.y <= maxOverheadY;

    if (crossesJonhX && isAboveJonh) {
      this.passedOverhead = true;
    }

    // 3. Gather solid colliders for sweeping
    const boxes: Array<{
      box: Box2D;
      label: 'ground' | 'jonhBody' | 'obstacle';
      material: string;
      id?: string;
      ricochet?: boolean;
    }> = [
      { box: level.ground, label: 'ground', material: level.ground.material },
      { box: level.jonhSpawn.bodyBox, label: 'jonhBody', material: 'jonhBody' },
      ...level.obstacles.map((o) => ({
        box: o.box,
        label: 'obstacle' as const,
        material: o.material,
        id: o.id,
        ricochet: o.ricochet,
      })),
    ];

    let earliestHit: {
      hit: NonNullable<ReturnType<typeof sweepCircleVsBox>>;
      boxLabel: 'ground' | 'jonhBody' | 'obstacle';
      material: string;
      id?: string | undefined;
      ricochet?: boolean | undefined;
    } | null = null;
    for (const b of boxes) {
      const hit = sweepCircleVsBox(prevSim, currSim, radiusMetres, b.box);
      if (hit && hit.t <= 1) { // Accept t=0 if it's currently penetrating
        if (!earliestHit || hit.t < earliestHit.hit.t) {
          earliestHit = {
            hit,
            boxLabel: b.label,
            material: b.material,
            id: b.id,
            ricochet: b.ricochet,
          };
        }
      }
    }

    if (earliestHit) {
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

      // Calculate relative velocity into normal
      const matterVx = this.projectileBody.velocity.x;
      const matterVy = this.projectileBody.velocity.y;
      
      const matterNormalX = earliestHit.hit.normal.x;
      const matterNormalY = -earliestHit.hit.normal.y; // sim +y is up, matter +y is down

      const dotNow = matterVx * matterNormalX + matterVy * matterNormalY;
      // Velocity entering this step: Matter may already have resolved (and damped) the impact.
      const inVx = this.previousVelocity.x;
      const inVy = this.previousVelocity.y;
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
        Matter.Body.setVelocity(this.projectileBody, { x: vNewMatterX, y: vNewMatterY });
        
        currPx.x = newPxX;
        currPx.y = newPxY;
        currSim.x = newSimX;
        currSim.y = newSimY;
      }
    }

    // Rolling resistance on whatever top surface the ball rests on (ground, roofs, decks), so a
    // ball that lands on a flat top slows to a stop instead of sliding on indefinitely.
    const support = this.hasHitGround && currSim.y <= level.ground.maxY + radiusMetres + 1e-3
      ? level.ground.material
      : level.obstacles.find(o => currSim.x >= o.box.minX && currSim.x <= o.box.maxX &&
        Math.abs(currSim.y - radiusMetres - o.box.maxY) <= 2e-3)?.material;
    if (support !== undefined) {
      const mat = (MATERIALS as Record<string, MaterialProps>)[support];
      Matter.Body.setVelocity(this.projectileBody, {
        x: this.projectileBody.velocity.x * (mat?.rollingDamping ?? PHYSICS.groundRollingDamping),
        y: this.projectileBody.velocity.y,
      });
    }

    this.prevPosPx = { ...currPx };
    this.previousVelocity = { ...this.projectileBody.velocity };

    // Matter velocity is in px per (1000/60)ms -> speed in m/s = (px/baseStep * 60) / ppm
    const vxMs = matterVelocityToSpeedMs(this.projectileBody.velocity.x, this.pixelsPerMetre);
    // In world y is down, so vySim = -vyWorld
    const vyMs = -matterVelocityToSpeedMs(this.projectileBody.velocity.y, this.pixelsPerMetre);
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
  }
}
