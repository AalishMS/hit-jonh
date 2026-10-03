import type Phaser from 'phaser';
import type { LevelData } from '../levels/types';
import type { ProjectileState } from '../physics/matterAdapter';
import { metresToPixels, simYToWorldY } from '../sim/units';

export interface DebugTelemetry {
  angleDeg: number;
  powerPercent: number;
  launchSpeedMs: number;
  launchImpulseNs: number;
  shotState: string;
  simulatedTimeSeconds: number;
  projectile?: ProjectileState | null;
  muzzlePosPx?: { x: number; y: number };
}

export class DebugRenderer {
  private graphics: Phaser.GameObjects.Graphics;
  private textObject: Phaser.GameObjects.Text;
  private visible = false;

  constructor(
    scene: Phaser.Scene,
    private readonly ppm: number,
    private readonly worldHeightPx: number,
  ) {
    this.graphics = scene.add.graphics();
    this.graphics.setDepth(100);

    this.textObject = scene.add.text(16, 16, '', {
      fontFamily: 'monospace',
      fontSize: '13px',
      color: '#00ff66',
      backgroundColor: '#000000bb',
      padding: { x: 10, y: 8 },
    });
    this.textObject.setDepth(101);

    this.setVisible(false);
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    this.graphics.setVisible(visible);
    this.textObject.setVisible(visible);
    if (!visible) {
      this.graphics.clear();
      this.textObject.setText('');
    }
  }

  toggle(): boolean {
    this.setVisible(!this.visible);
    return this.visible;
  }

  draw(level: LevelData, telemetry: DebugTelemetry): void {
    if (!this.visible) return;

    this.graphics.clear();

    // 1. Draw Ground wireframe (green)
    const groundHeightPx = metresToPixels(level.ground.maxY - level.ground.minY, this.ppm);
    const groundTopPx = simYToWorldY(level.ground.maxY, this.worldHeightPx, this.ppm);
    this.graphics.lineStyle(2, 0x00ff88, 0.9);
    this.graphics.strokeRect(0, groundTopPx, metresToPixels(level.ground.maxX, this.ppm), groundHeightPx);

    // 2. Draw Jonh Body wireframe (cyan)
    const jb = level.jonhSpawn.bodyBox;
    const jbXPx = metresToPixels(jb.minX, this.ppm);
    const jbYPx = simYToWorldY(jb.maxY, this.worldHeightPx, this.ppm);
    const jbWPx = metresToPixels(jb.maxX - jb.minX, this.ppm);
    const jbHPx = metresToPixels(jb.maxY - jb.minY, this.ppm);
    this.graphics.lineStyle(2, 0x00d8ff, 0.9);
    this.graphics.strokeRect(jbXPx, jbYPx, jbWPx, jbHPx);

    // 3. Draw Jonh Hat wireframe (gold)
    if (level.jonhSpawn.hatBox) {
      const jh = level.jonhSpawn.hatBox;
      const jhXPx = metresToPixels(jh.minX, this.ppm);
      const jhYPx = simYToWorldY(jh.maxY, this.worldHeightPx, this.ppm);
      const jhWPx = metresToPixels(jh.maxX - jh.minX, this.ppm);
      const jhHPx = metresToPixels(jh.maxY - jh.minY, this.ppm);
      this.graphics.lineStyle(2, 0xffd700, 0.9);
      this.graphics.strokeRect(jhXPx, jhYPx, jhWPx, jhHPx);
    }

    // 4. Draw Cannon spawn & Muzzle marker
    const cannonXPx = metresToPixels(level.cannonSpawn.x, this.ppm);
    const cannonYPx = simYToWorldY(level.cannonSpawn.y, this.worldHeightPx, this.ppm);
    this.graphics.lineStyle(2, 0xff9900, 0.8);
    this.graphics.strokeCircle(cannonXPx, cannonYPx, 8);

    if (telemetry.muzzlePosPx) {
      this.graphics.fillStyle(0xff3300, 1);
      this.graphics.fillCircle(telemetry.muzzlePosPx.x, telemetry.muzzlePosPx.y, 4);
    }

    // 5. Draw Projectile wireframe
    if (telemetry.projectile) {
      this.graphics.lineStyle(2, 0xff0044, 1);
      this.graphics.strokeCircle(telemetry.projectile.xPx, telemetry.projectile.yPx, metresToPixels(0.15, this.ppm));
    }

    // 6. Update HUD text
    const lines = [
      '=== DEBUG TELEMETRY (Hit Jonh M1) ===',
      `State: ${telemetry.shotState.toUpperCase()}  |  Sim Time: ${telemetry.simulatedTimeSeconds.toFixed(2)}s`,
      `Aim: ${telemetry.angleDeg}°  |  Power: ${telemetry.powerPercent}%`,
      `Launch Speed: ${telemetry.launchSpeedMs.toFixed(2)} m/s  |  Impulse: ${telemetry.launchImpulseNs.toFixed(1)} N·s`,
    ];

    if (telemetry.projectile) {
      const p = telemetry.projectile;
      lines.push(
        `Ball Pos (SI): x = ${p.xSim.toFixed(2)}m, y = ${p.ySim.toFixed(2)}m`,
        `Ball Pos (Px): x = ${p.xPx.toFixed(0)}px, y = ${p.yPx.toFixed(0)}px`,
        `Ball Vel: vx = ${p.vxSim.toFixed(2)} m/s, vy = ${p.vySim.toFixed(2)} m/s (Speed: ${p.speedMs.toFixed(2)} m/s)`,
        `Contacts: Hit Jonh = ${p.hitJonh ? 'YES' : 'NO'}, Hit Ground = ${p.hitGround ? 'YES' : 'NO'}`,
      );
    } else {
      lines.push('Ball: Not active in world');
    }

    this.textObject.setText(lines.join('\n'));
  }

  destroy(): void {
    this.graphics.destroy();
    this.textObject.destroy();
  }
}
