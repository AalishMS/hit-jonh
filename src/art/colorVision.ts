/**
 * Colour-vision checks for the accessibility pass: simulates protanopia, deuteranopia and
 * tritanopia (Machado, Oliveira & Fernandes 2009, severity 1.0, in linear sRGB) and measures how
 * far apart two colours stay (CIE76 ΔE in CIELAB). Pure maths, used by tests/colorVision.test.ts.
 */
export type ColorVision = 'normal' | 'protanopia' | 'deuteranopia' | 'tritanopia';

type Mat3 = readonly [number, number, number, number, number, number, number, number, number];

const MACHADO: Record<Exclude<ColorVision, 'normal'>, Mat3> = {
  protanopia: [0.152286, 1.052583, -0.204868, 0.114503, 0.786281, 0.099216, -0.003882, -0.048116, 1.051998],
  deuteranopia: [0.367322, 0.860646, -0.227968, 0.280085, 0.672501, 0.047413, -0.011820, 0.042940, 0.968881],
  tritanopia: [1.255528, -0.076749, -0.178779, -0.078411, 0.930809, 0.147602, 0.004733, 0.691367, 0.303900],
};

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** 0xRRGGBB → linear RGB (0–1). */
function linearRgb(color: number): [number, number, number] {
  return [(color >> 16) & 255, (color >> 8) & 255, color & 255].map(v => toLinear(v / 255)) as [number, number, number];
}

/** How a colour looks with the given colour vision, as linear RGB. */
export function simulate(color: number, vision: ColorVision): [number, number, number] {
  const [r, g, b] = linearRgb(color);
  if (vision === 'normal') return [r, g, b];
  const m = MACHADO[vision];
  return [
    clamp01(m[0] * r + m[1] * g + m[2] * b),
    clamp01(m[3] * r + m[4] * g + m[5] * b),
    clamp01(m[6] * r + m[7] * g + m[8] * b),
  ];
}

/** Linear sRGB → CIELAB (D65). */
export function lab([r, g, b]: [number, number, number]): [number, number, number] {
  const x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047;
  const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
  const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  const [fx, fy, fz] = [f(x), f(y), f(z)];
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

/** CIE76 colour difference between two colours as seen with `vision` (about 2.3 is just noticeable). */
export function deltaE(a: number, b: number, vision: ColorVision = 'normal'): number {
  const [l1, a1, b1] = lab(simulate(a, vision));
  const [l2, a2, b2] = lab(simulate(b, vision));
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2);
}
