import { AIM } from '../config/tuning';

export function angleFromDrag(startAngle: number, verticalFraction: number): number {
  return Math.max(AIM.minAngleDeg, Math.min(AIM.maxAngleDeg,
    Math.round(startAngle - verticalFraction * AIM.dragDegreesPerCanvasHeight)));
}

/** Dragging right adds power; the same fraction of the canvas works at every screen size. */
export function powerFromDrag(startPower: number, horizontalFraction: number): number {
  return Math.max(0, Math.min(100, Math.round(startPower + horizontalFraction * AIM.dragPowerPerCanvasWidth)));
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

/** A relative drag commits to one axis once it has moved far enough, for precise adjustments. */
export function lockAxis(dxFraction: number, dyFraction: number, threshold = 0.02): 'angle' | 'power' | null {
  if (Math.hypot(dxFraction, dyFraction) < threshold) return null;
  return Math.abs(dyFraction) >= Math.abs(dxFraction) ? 'angle' : 'power';
}

export type AimDragMode = 'grab' | 'pending' | 'angle' | 'power';

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
 * or drag anywhere on the field: up/down sets angle, left/right sets power (axis-locked).
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
        width: Math.max(1, rect.width), height: Math.max(1, rect.height), mode: onCannon ? 'grab' : 'pending' };
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
      const fx = (event.clientX - d.x) / d.width;
      const fy = (event.clientY - d.y) / d.height;
      if (d.mode === 'pending') d.mode = lockAxis(fx, fy) ?? 'pending';
      if (d.mode === 'angle') hooks.onAim(angleFromDrag(d.angle, fy), d.power);
      else if (d.mode === 'power') hooks.onAim(d.angle, powerFromDrag(d.power, fx));
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
