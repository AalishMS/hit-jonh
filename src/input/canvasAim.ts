import { AIM } from '../config/tuning';

export function angleFromDrag(startAngle: number, verticalFraction: number): number {
  return Math.max(AIM.minAngleDeg, Math.min(AIM.maxAngleDeg,
    Math.round(startAngle - verticalFraction * AIM.dragDegreesPerCanvasHeight)));
}

/** Grabbing the cannon itself: the barrel points at the pointer, distance sets power. */
export function aimFromCannonPoint(pivot: { x: number; y: number }, point: { x: number; y: number }): { angle: number; power: number } {
  const dx = point.x - pivot.x;
  const dy = pivot.y - point.y;
  const angle = Math.max(AIM.minAngleDeg, Math.min(AIM.maxAngleDeg, Math.round((Math.atan2(dy, Math.max(dx, 0.001)) * 180) / Math.PI)));
  const distance = Math.hypot(dx, dy);
  const power = Math.max(0, Math.min(100, Math.round(((distance - AIM.grabMinPx) / (AIM.grabMaxPx - AIM.grabMinPx)) * 100)));
  return { angle, power };
}

export type AimDragMode = 'grab' | 'angle';

export interface CanvasAimHooks {
  canAim: () => boolean;
  getAim: () => { angle: number; power: number };
  onAim: (angle: number, power: number) => void;
  /** Converts a client (CSS) point to world coordinates. */
  toWorld: (clientX: number, clientY: number) => { x: number; y: number };
  /** Cannon pivot in world coordinates. */
  pivot: () => { x: number; y: number };
}

/**
 * In-world aiming. Press on the cannon to grab it (it points at the pointer; distance is power),
 * or drag anywhere on the field: up/down sets angle (power stays on the slider/keys).
 * Pointer capture lets a drag finish outside the canvas; touch uses the same input.
 */
export class CanvasAim {
  private drag: { pointerId: number; x: number; y: number; angle: number; power: number; width: number; height: number; mode: AimDragMode } | null = null;
  private abort = new AbortController();

  constructor(private canvas: HTMLCanvasElement, hooks: CanvasAimHooks) {
    const options = { signal: this.abort.signal };
    canvas.addEventListener('pointerdown', (event) => {
      if (!hooks.canAim() || !event.isPrimary || event.button !== 0) return;
      const rect = canvas.getBoundingClientRect();
      const world = hooks.toWorld(event.clientX, event.clientY);
      const pivot = hooks.pivot();
      const onCannon = Math.hypot(world.x - pivot.x, world.y - pivot.y) <= AIM.grabRadiusPx;
      const aim = hooks.getAim();
      this.drag = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, angle: aim.angle, power: aim.power,
        width: Math.max(1, rect.width), height: Math.max(1, rect.height), mode: onCannon ? 'grab' : 'angle' };
      canvas.setPointerCapture(event.pointerId);
      event.preventDefault();
    }, options);
    canvas.addEventListener('pointermove', (event) => {
      const d = this.drag;
      if (!d || d.pointerId !== event.pointerId) return;
      if (!hooks.canAim()) { this.cancel(); return; }
      if (d.mode === 'grab') {
        const aim = aimFromCannonPoint(hooks.pivot(), hooks.toWorld(event.clientX, event.clientY));
        hooks.onAim(aim.angle, aim.power);
        return;
      }
      const fy = (event.clientY - d.y) / d.height;
      hooks.onAim(angleFromDrag(d.angle, fy), d.power);
    }, options);
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      canvas.addEventListener(type, () => this.cancel(), options);
    }
    window.addEventListener('blur', () => this.cancel(), options);
  }

  get isDragging(): boolean { return this.drag !== null; }
  get mode(): AimDragMode | null { return this.drag?.mode ?? null; }

  cancel(): void {
    const pointerId = this.drag?.pointerId;
    this.drag = null;
    if (pointerId !== undefined && this.canvas.hasPointerCapture(pointerId)) {
      this.canvas.releasePointerCapture(pointerId);
    }
  }

  destroy(): void { this.cancel(); this.abort.abort(); }
}
