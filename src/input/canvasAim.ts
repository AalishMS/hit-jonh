import { AIM } from '../config/tuning';

export function angleFromDrag(startAngle: number, verticalFraction: number): number {
  return Math.max(AIM.minAngleDeg, Math.min(AIM.maxAngleDeg,
    Math.round(startAngle - verticalFraction * AIM.dragDegreesPerCanvasHeight)));
}

/** Pointer capture lets a drag finish outside the canvas; touch uses the same input. */
export class CanvasAim {
  private drag: { pointerId: number; y: number; angle: number; height: number } | null = null;
  private abort = new AbortController();

  constructor(private canvas: HTMLCanvasElement, canAim: () => boolean,
    getAngle: () => number, onAngle: (angle: number) => void) {
    const options = { signal: this.abort.signal };
    canvas.addEventListener('pointerdown', (event) => {
      if (!canAim() || !event.isPrimary || event.button !== 0) return;
      this.drag = { pointerId: event.pointerId, y: event.clientY, angle: getAngle(),
        height: Math.max(1, canvas.getBoundingClientRect().height) };
      canvas.setPointerCapture(event.pointerId);
      event.preventDefault();
    }, options);
    canvas.addEventListener('pointermove', (event) => {
      if (!this.drag || this.drag.pointerId !== event.pointerId) return;
      if (!canAim()) { this.cancel(); return; }
      onAngle(angleFromDrag(this.drag.angle, (event.clientY - this.drag.y) / this.drag.height));
    }, options);
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      canvas.addEventListener(type, () => this.cancel(), options);
    }
    window.addEventListener('blur', () => this.cancel(), options);
  }

  cancel(): void {
    const pointerId = this.drag?.pointerId;
    this.drag = null;
    if (pointerId !== undefined && this.canvas.hasPointerCapture(pointerId)) {
      this.canvas.releasePointerCapture(pointerId);
    }
  }

  destroy(): void { this.cancel(); this.abort.abort(); }
}
