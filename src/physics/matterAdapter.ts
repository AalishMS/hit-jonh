import Matter, { type Body, type World } from '@matter-js';
import { MATERIALS, PHYSICS } from '../config/tuning';
import type { LevelData } from '../levels/types';
import { sweepCircleVsBox } from '../sim/swept';
import {
  metresToPixels,
  matterVelocityToSpeedMs,
  pixelsToMetres,
  simYToWorldY,
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
  hitGround: boolean;
  impactSpeedMs: number;
  firstGroundContact: { xSim: number; xPx: number; yPx: number } | null;
}

export class MatterAdapter {
  private projectileBody: Body | null = null;
  private groundBody: Body | null = null;
  private jonhBody: Body | null = null;
  private jonhHatBody: Body | null = null;
  private obstacleBodies: Body[] = [];

  private prevPosPx: { x: number; y: number } | null = null;
  private hasHitJonh = false;
  private hasHitGround = false;
  private previousVelocity = { x: 0, y: 0 };
  private impactSpeedMs = 0;
  private firstGroundContact: ProjectileState['firstGroundContact'] = null;

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
    this.hasHitGround = false;
    this.impactSpeedMs = 0;
    this.firstGroundContact = null;
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

    // Gather solid colliders for sweeping
    const boxes = [
      { box: level.ground, label: 'ground', material: level.ground.material },
      { box: level.jonhSpawn.bodyBox, label: 'jonhBody', material: 'jonhBody' },
      ...level.obstacles.map(o => ({ box: o.box, label: 'obstacle', material: o.material })),
    ];

    let earliestHit: {
      hit: NonNullable<ReturnType<typeof sweepCircleVsBox>>;
      boxLabel: string;
      material: string;
    } | null = null;
    for (const b of boxes) {
      const hit = sweepCircleVsBox(prevSim, currSim, radiusMetres, b.box);
      if (hit && hit.t <= 1) { // Accept t=0 if it's currently penetrating
        if (!earliestHit || hit.t < earliestHit.hit.t) {
          earliestHit = { hit, boxLabel: b.label, material: b.material };
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
      if (earliestHit.boxLabel === 'jonhBody') this.hasHitJonh = true;
      if (earliestHit.boxLabel === 'ground') this.hasHitGround = true;

      // Calculate relative velocity into normal
      const matterVx = this.projectileBody.velocity.x;
      const matterVy = this.projectileBody.velocity.y;
      
      const matterNormalX = earliestHit.hit.normal.x;
      const matterNormalY = -earliestHit.hit.normal.y; // sim +y is up, matter +y is down

      const dot = matterVx * matterNormalX + matterVy * matterNormalY;
      
      // If moving into the surface, apply manual reflection to prevent tunnelling
      if (dot < 0) {
        const mat = (MATERIALS as Record<string, { restitution: number; friction: number }>)[earliestHit.material] ?? { restitution: 0.2, friction: 0.5 };
        const projMat = MATERIALS.cannonball;
        const restitution = Math.max(mat.restitution, projMat.restitution);
        
        const vNewMatterX = matterVx - (1 + restitution) * dot * matterNormalX;
        const vNewMatterY = matterVy - (1 + restitution) * dot * matterNormalY;

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

    if (this.hasHitGround && currSim.y <= level.ground.maxY + radiusMetres + 1e-3) {
      Matter.Body.setVelocity(this.projectileBody, {
        x: this.projectileBody.velocity.x * PHYSICS.groundRollingDamping,
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
      hitGround: this.hasHitGround,
      impactSpeedMs: this.impactSpeedMs,
      firstGroundContact: this.firstGroundContact,
    };
  }

  removeProjectile(): void {
    if (this.projectileBody) {
      Matter.World.remove(this.matterWorld, this.projectileBody);
      this.projectileBody = null;
    }
    this.prevPosPx = null;
    this.hasHitJonh = false;
    this.hasHitGround = false;
    this.impactSpeedMs = 0;
    this.firstGroundContact = null;
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
