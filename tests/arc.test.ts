import { describe, expect, it } from 'vitest';
import {
  arcShape, clampToArc, closestOnArc, rollOnArc, sweepCircleVsArc, withinArc, type ArcShape,
} from '../src/sim/arc';
import { seededRandom } from '../src/rules/seededRandom';

/** A 120° bowl like the skate ramp: centre (13, 4.65), riding radius 3 m, 0.3 m thick. */
const BOWL: ArcShape = arcShape({ centre: { x: 13, y: 4.65 }, radius: 3, thickness: 0.3, startDeg: -150, endDeg: -30 });
const R = 0.15;
const G = 9.81;
const DT = 1 / 120;

/** First time in [0, 1] the swept circle touches the shape, by dense sampling and bisection. */
function bruteFirstTouch(shape: ArcShape, p0: { x: number; y: number }, p1: { x: number; y: number }, r: number): number | null {
  const at = (t: number) => ({ x: p0.x + (p1.x - p0.x) * t, y: p0.y + (p1.y - p0.y) * t });
  const touches = (t: number) => closestOnArc(shape, at(t)).distance <= r;
  if (touches(0)) return 0;
  const n = 4000;
  for (let i = 1; i <= n; i++) {
    if (!touches(i / n)) continue;
    let lo = (i - 1) / n;
    let hi = i / n;
    for (let k = 0; k < 40; k++) {
      const mid = (lo + hi) / 2;
      if (touches(mid)) hi = mid; else lo = mid;
    }
    return hi;
  }
  return null;
}

describe('thick arc geometry', () => {
  it('knows its angular range across the ±π seam', () => {
    const seam = arcShape({ centre: { x: 0, y: 0 }, radius: 2, thickness: 0.3, startDeg: 150, endDeg: 210 });
    expect(withinArc(seam, Math.PI)).toBe(true);
    expect(withinArc(seam, -Math.PI * 0.95)).toBe(true);
    expect(withinArc(seam, 0)).toBe(false);
    expect(clampToArc(BOWL, -Math.PI / 2)).toBeCloseTo(-Math.PI / 2, 12);
    expect(clampToArc(BOWL, -0.1)).toBeCloseTo(BOWL.end, 12);
    expect(clampToArc(BOWL, Math.PI)).toBeCloseTo(BOWL.start, 12);
  });

  it('measures distance to the riding face, the back, the end faces and the corners', () => {
    expect(closestOnArc(BOWL, { x: 13, y: 4.65 }).distance).toBeCloseTo(3, 9); // the centre
    const bottom = closestOnArc(BOWL, { x: 13, y: 2 });
    expect(bottom.distance).toBeCloseTo(0.35, 9);
    expect(bottom.feature).toBe('inner');
    expect(bottom.normal.y).toBeCloseTo(1, 9);
    expect(closestOnArc(BOWL, { x: 13, y: 1.65 - 0.3 - 0.5 }).feature).toBe('outer');
    expect(closestOnArc(BOWL, { x: 13, y: 1.5 }).distance).toBe(0); // inside the wood
    // Beyond the far lip: nearest is the lip corner.
    const lip = { x: 13 + 3 * Math.cos(BOWL.end), y: 4.65 + 3 * Math.sin(BOWL.end) };
    const beyond = closestOnArc(BOWL, { x: lip.x + 0.1, y: lip.y + 0.4 });
    expect(beyond.feature).toBe('corner');
    expect(beyond.point.x).toBeCloseTo(lip.x, 9);
  });
});

describe('swept circle vs thick arc', () => {
  it('matches a dense sampled sweep for thousands of random paths (no early or missed touches)', () => {
    const rand = seededRandom(20261125);
    let hits = 0;
    const features = new Set<string>();
    for (let i = 0; i < 1500; i++) {
      // Starts near the arc (inside the bowl, behind it, beside the lips), every direction.
      const ang = BOWL.start - 0.4 + rand() * (BOWL.end - BOWL.start + 0.8);
      const rad = BOWL.radius - 0.7 + rand() * (BOWL.thickness + 1.4);
      const p0 = { x: BOWL.cx + Math.cos(ang) * rad, y: BOWL.cy + Math.sin(ang) * rad };
      const len = rand() * 0.6;
      const a = rand() * Math.PI * 2;
      const p1 = { x: p0.x + Math.cos(a) * len, y: p0.y + Math.sin(a) * len };
      const hit = sweepCircleVsArc(p0, p1, R, BOWL);
      const brute = bruteFirstTouch(BOWL, p0, p1, R);
      if (brute === null) {
        expect(hit, `path ${i}`).toBeNull();
        continue;
      }
      hits++;
      expect(hit, `path ${i}`).not.toBeNull();
      features.add(hit!.feature);
      expect(Math.abs(hit!.t - brute), `path ${i} t`).toBeLessThan(1 / 4000 + 1e-9);
      // At the reported time the ball touches, and its centre is r from the surface along the normal.
      const c = closestOnArc(BOWL, hit!.point);
      if (hit!.t > 0) {
        expect(c.distance).toBeCloseTo(R, 6);
        expect(hit!.normal.x).toBeCloseTo(c.normal.x, 5);
        expect(hit!.normal.y).toBeCloseTo(c.normal.y, 5);
      }
    }
    expect(hits).toBeGreaterThan(400);
    expect(features.size).toBe(5);
  }, 60_000);

  it('never lets a ball at the top launch speed pass through, from any angle', () => {
    // 20 m/s × 1/120 s = 0.167 m per step, against a 0.3 m thick arc; aim at every part of it.
    const step = 20 / 120 * 1.5; // with margin for wind or a scaled cannon
    for (let deg = 0; deg < 360; deg += 2) {
      const dir = { x: Math.cos(deg * Math.PI / 180), y: Math.sin(deg * Math.PI / 180) };
      for (let k = 0; k <= 24; k++) {
        const target = { x: 13 + 3.15 * Math.cos(BOWL.start + (BOWL.end - BOWL.start) * k / 24), y: 4.65 + 3.15 * Math.sin(BOWL.start + (BOWL.end - BOWL.start) * k / 24) };
        // Start two metres back along the direction, march in steps, and stop at the first hit.
        let p = { x: target.x - dir.x * 2, y: target.y - dir.y * 2 };
        if (closestOnArc(BOWL, p).distance <= R) continue;
        let touched = false;
        for (let s = 0; s < 40 && !touched; s++) {
          const q = { x: p.x + dir.x * step, y: p.y + dir.y * step };
          const hit = sweepCircleVsArc(p, q, R, BOWL);
          if (hit) {
            touched = true;
            expect(closestOnArc(BOWL, hit.point).distance).toBeGreaterThanOrEqual(R - 1e-6);
          }
          p = q;
        }
        expect(touched, `${deg}° at ${k}`).toBe(true);
      }
    }
  });

  it('reports a ball already resting on the riding face at t = 0 with the face normal', () => {
    const hit = sweepCircleVsArc({ x: 13, y: 1.65 + R - 1e-5 }, { x: 13.1, y: 1.65 + R - 1e-3 }, R, BOWL);
    expect(hit?.t).toBe(0);
    expect(hit?.feature).toBe('inner');
    expect(hit?.normal.y).toBeCloseTo(1, 6);
  });
});

/** Rolls a ball along the bowl with the fixed step until it leaves or `maxSteps` pass. */
function roll(shape: ArcShape, startDeg: number, speed: number, mu: number, maxSteps = 4000) {
  const rho = shape.radius - R;
  let phi = startDeg * Math.PI / 180;
  let p = { x: shape.cx + rho * Math.cos(phi), y: shape.cy + rho * Math.sin(phi) };
  let v = { x: -Math.sin(phi) * speed, y: Math.cos(phi) * speed };
  let maxY = p.y;
  for (let i = 0; i < maxSteps; i++) {
    const r = rollOnArc({ shape, ballRadius: R, p0: p, v0: v, dv: { x: 0, y: -G * DT }, dt: DT, rollingResistance: mu, epsilon: 0 });
    p = r.point;
    v = r.velocity;
    phi = r.angle;
    maxY = Math.max(maxY, p.y);
    if (r.left) return { left: r.left, speed: r.left === 'start' ? r.speed : Math.abs(r.speed), y: p.y, maxY, steps: i + 1, phi };
  }
  return { left: null, speed: Math.hypot(v.x, v.y), y: p.y, maxY, steps: maxSteps, phi };
}

/** Reference: the same constrained motion integrated with RK4 at a tiny step (no fixed-step artefacts). */
function referenceExitSpeed(shape: ArcShape, startDeg: number, speed: number, mu: number): number | null {
  const rho = shape.radius - R;
  let phi = startDeg * Math.PI / 180;
  let s = speed;
  const h = 1e-5;
  const acc = (ph: number, sp: number) => {
    const tang = -G * Math.cos(ph); // gravity (0, −g) · tangent(ph) = −g·cos(ph)
    const load = Math.max(0, sp * sp / rho - G * Math.sin(ph)); // gravity · radial = −g·sin(ph)
    return tang - Math.sign(sp) * mu * load;
  };
  for (let i = 0; i < 2e6; i++) {
    const k1p = s / rho, k1s = acc(phi, s);
    const k2p = (s + h / 2 * k1s) / rho, k2s = acc(phi + h / 2 * k1p, s + h / 2 * k1s);
    const k3p = (s + h / 2 * k2s) / rho, k3s = acc(phi + h / 2 * k2p, s + h / 2 * k2s);
    const k4p = (s + h * k3s) / rho, k4s = acc(phi + h * k3p, s + h * k3s);
    phi += h / 6 * (k1p + 2 * k2p + 2 * k3p + k4p);
    s += h / 6 * (k1s + 2 * k2s + 2 * k3s + k4s);
    if (phi >= shape.end) return s;
    if (s <= 0) return null;
  }
  return null;
}

describe('rolling on the riding face', () => {
  it('conserves energy without drag: in at one lip, out of the other at the same speed', () => {
    for (const speed of [0.5, 3, 9, 20]) {
      // Starts on the near lip heading down into the bowl (clockwise is −, so counter-clockwise is in).
      const r = roll(BOWL, -150, speed, 0);
      expect(r.left).toBe('end');
      expect(Math.abs(r.speed - speed) / speed, `${speed} m/s`).toBeLessThan(0.002);
    }
  });

  it('leaves the lip at the speed energy allows, at every entry speed, without drag', () => {
    const rho = 3 - R;
    const drop = rho * (1 - Math.cos(Math.PI / 3)); // bottom to lip
    for (const speed of [6, 8, 12, 16, 20]) {
      const r = roll(BOWL, -90, speed, 0);
      expect(r.left).toBe('end');
      const expected = Math.sqrt(speed * speed - 2 * G * drop);
      expect(Math.abs(r.speed - expected) / expected, `${speed} m/s`).toBeLessThan(0.002);
    }
  });

  it('loses exactly what the rolling drag should (fixed step vs an RK4 reference)', () => {
    for (const mu of [0.01, 0.03, 0.06]) {
      for (const speed of [6, 10, 16]) {
        const r = roll(BOWL, -90, speed, mu);
        const ref = referenceExitSpeed(BOWL, -90, speed, mu);
        expect(ref).not.toBeNull();
        expect(r.left).toBe('end');
        expect(Math.abs(r.speed - ref!) / ref!, `μ ${mu}, ${speed} m/s`).toBeLessThan(0.01);
        // Never more than a drag-free ball.
        expect(r.speed).toBeLessThan(Math.sqrt(speed * speed - 2 * G * (3 - R) * 0.5));
      }
    }
  });

  it('launches along the lip tangent (60° above the horizon on the far side)', () => {
    const r = rollOnArc({ shape: BOWL, ballRadius: R, p0: { x: 13 + 2.85 * Math.cos(-31 * Math.PI / 180), y: 4.65 + 2.85 * Math.sin(-31 * Math.PI / 180) },
      v0: { x: -Math.sin(-31 * Math.PI / 180) * 9, y: Math.cos(-31 * Math.PI / 180) * 9 }, dv: { x: 0, y: -G * DT }, dt: DT, rollingResistance: 0.03 });
    expect(r.left).toBe('end');
    // Leaves along the tangent; gravity has only had the rest of that one step to bend it.
    expect(Math.abs(Math.atan2(r.velocity.y, r.velocity.x) * 180 / Math.PI - 60)).toBeLessThan(0.5);
  });

  it('on a quarter-pipe, a ball too slow for the lip rolls back off the bottom; a still ball at the bottom holds', () => {
    const kicker = arcShape({ centre: { x: 13, y: 4.6 }, radius: 3, thickness: 0.3, startDeg: -90, endDeg: -30 });
    const back = roll(kicker, -90, 4, 0.03);
    expect(back.left).toBe('start');
    expect(back.speed).toBeLessThan(0); // heading back the way it came
    expect(Math.abs(back.speed)).toBeLessThan(4);
    const hold = rollOnArc({ shape: kicker, ballRadius: R, p0: { x: 13 + 2.85 * Math.cos(-91 * Math.PI / 180), y: 4.6 + 2.85 * Math.sin(-91 * Math.PI / 180) },
      v0: { x: 0, y: 0 }, dv: { x: 0, y: -G * DT }, dt: DT, rollingResistance: 0.03 });
    expect(hold.speed).toBe(0);
    expect(hold.left).toBeNull();
  });

  it('a ball trapped in a bowl (it cannot reach either lip) settles in a few swings; a ball that can escape is untouched', () => {
    const settle = (scale: number) => {
      const rho = 3 - R;
      // At rest 35° up the near side: below both lips (60° either side of the bottom), so trapped.
      const phi = -125 * Math.PI / 180;
      let p = { x: BOWL.cx + rho * Math.cos(phi), y: BOWL.cy + rho * Math.sin(phi) };
      let v = { x: 0, y: 0 };
      let still = 0;
      for (let i = 1; i <= 15 * 120; i++) {
        const r = rollOnArc({ shape: BOWL, ballRadius: R, p0: p, v0: v, dv: { x: 0, y: -G * DT }, dt: DT, rollingResistance: 0.03, trappedDragScale: scale });
        p = r.point; v = r.velocity;
        // Settled: slower than the shot's settle speed (0.05 m/s) for half a second.
        still = Math.abs(r.speed) < 0.05 ? still + 1 : 0;
        if (still >= 60) return i / 120;
      }
      return Infinity;
    };
    expect(settle(1)).toBeGreaterThan(9);
    expect(settle(6)).toBeLessThan(4);
    // Fast enough to leave over a lip: the trapped drag does not apply, so the exit speed is unchanged.
    const exit = (scale: number) => {
      let p = { x: BOWL.cx, y: BOWL.cy - (3 - R) };
      let v = { x: 8, y: 0 };
      for (let i = 0; i < 600; i++) {
        const r = rollOnArc({ shape: BOWL, ballRadius: R, p0: p, v0: v, dv: { x: 0, y: -G * DT }, dt: DT, rollingResistance: 0.03, trappedDragScale: scale });
        p = r.point; v = r.velocity;
        if (r.left) return r.speed;
      }
      return null;
    };
    expect(exit(6)).toBe(exit(1));
    expect(exit(1)).not.toBeNull();
  });
});
