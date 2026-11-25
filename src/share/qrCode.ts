/**
 * A small QR Code encoder (ISO/IEC 18004, byte mode only), for showing a save link as a code another phone can
 * scan. Pure: text in, a square grid of dark/light modules out; no DOM. It follows the well-known structure of
 * Project Nayuki's reference encoder (MIT): pick the smallest version that fits, add Reed–Solomon error
 * correction per block, interleave, place the codewords around the function patterns, then pick the mask with
 * the lowest penalty.
 */

export type QrEcl = 'L' | 'M' | 'Q' | 'H';

export interface QrCode {
  version: number;
  ecl: QrEcl;
  mask: number;
  /** Modules per side (21 + 4 per version above 1), without the quiet zone. */
  size: number;
  /** modules[y][x]: true is dark. */
  modules: boolean[][];
}

const ECL_ORDER: readonly QrEcl[] = ['L', 'M', 'Q', 'H'];
/** The two format-information bits of each level. */
const ECL_FORMAT_BITS: Record<QrEcl, number> = { L: 1, M: 0, Q: 3, H: 2 };

// Index 0 is unused (versions run 1–40).
const ECC_CODEWORDS_PER_BLOCK: Record<QrEcl, readonly number[]> = {
  L: [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  M: [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
  Q: [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  H: [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
};
const NUM_ERROR_CORRECTION_BLOCKS: Record<QrEcl, readonly number[]> = {
  L: [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
  M: [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
  Q: [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
  H: [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81],
};

const getBit = (x: number, i: number): boolean => ((x >>> i) & 1) !== 0;

/** Data and error-correction modules of a version (everything but the function patterns). */
export function rawDataModules(version: number): number {
  let result = (16 * version + 128) * version + 64;
  if (version >= 2) {
    const numAlign = Math.floor(version / 7) + 2;
    result -= (25 * numAlign - 10) * numAlign - 55;
    if (version >= 7) result -= 36;
  }
  return result;
}

/** 8-bit data codewords a version and level hold (after error correction). */
export function dataCodewords(version: number, ecl: QrEcl): number {
  return Math.floor(rawDataModules(version) / 8) - ECC_CODEWORDS_PER_BLOCK[ecl][version]! * NUM_ERROR_CORRECTION_BLOCKS[ecl][version]!;
}

const countBits = (version: number): number => (version <= 9 ? 8 : 16);

/** Bytes of byte-mode data a version and level hold. */
export function byteCapacity(version: number, ecl: QrEcl): number {
  return Math.floor((dataCodewords(version, ecl) * 8 - 4 - countBits(version)) / 8);
}

/* ---------- Reed–Solomon over GF(2^8), polynomial 0x11D ---------- */

function gfMultiply(x: number, y: number): number {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z;
}

function rsDivisor(degree: number): number[] {
  const result: number[] = new Array<number>(degree - 1).fill(0);
  result.push(1);
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < result.length; j++) {
      result[j] = gfMultiply(result[j]!, root);
      if (j + 1 < result.length) result[j]! ^= result[j + 1]!;
    }
    root = gfMultiply(root, 0x02);
  }
  return result;
}

/** The error-correction codewords for `data` (the remainder of its division by the generator). */
export function rsRemainder(data: readonly number[], degree: number): number[] {
  const divisor = rsDivisor(degree);
  const result: number[] = new Array<number>(degree).fill(0);
  for (const b of data) {
    const factor = b ^ result.shift()!;
    result.push(0);
    divisor.forEach((coef, i) => { result[i]! ^= gfMultiply(coef, factor); });
  }
  return result;
}

/** Splits the data into blocks, adds each block's error correction and interleaves them. */
function addEccAndInterleave(data: readonly number[], version: number, ecl: QrEcl): number[] {
  const numBlocks = NUM_ERROR_CORRECTION_BLOCKS[ecl][version]!;
  const blockEccLen = ECC_CODEWORDS_PER_BLOCK[ecl][version]!;
  const rawCodewords = Math.floor(rawDataModules(version) / 8);
  const numShortBlocks = numBlocks - (rawCodewords % numBlocks);
  const shortBlockLen = Math.floor(rawCodewords / numBlocks);
  const blocks: number[][] = [];
  for (let i = 0, k = 0; i < numBlocks; i++) {
    const dat = data.slice(k, k + shortBlockLen - blockEccLen + (i < numShortBlocks ? 0 : 1));
    k += dat.length;
    const ecc = rsRemainder(dat, blockEccLen);
    if (i < numShortBlocks) dat.push(0);
    blocks.push(dat.concat(ecc));
  }
  const result: number[] = [];
  for (let i = 0; i < blocks[0]!.length; i++) {
    blocks.forEach((block, j) => {
      // Short blocks carry a placeholder byte at the end of their data, skipped here.
      if (i !== shortBlockLen - blockEccLen || j >= numShortBlocks) result.push(block[i]!);
    });
  }
  return result;
}

/** Byte-mode segment, terminator and pad bytes, packed into the version's data codewords. */
export function dataCodewordsFor(bytes: Uint8Array, version: number, ecl: QrEcl): number[] {
  const bits: number[] = [];
  const append = (value: number, length: number) => { for (let i = length - 1; i >= 0; i--) bits.push((value >>> i) & 1); };
  append(0b0100, 4);
  append(bytes.length, countBits(version));
  for (const b of bytes) append(b, 8);
  const capacity = dataCodewords(version, ecl) * 8;
  append(0, Math.min(4, capacity - bits.length));
  append(0, (8 - (bits.length % 8)) % 8);
  for (let pad = 0xec; bits.length < capacity; pad ^= 0xec ^ 0x11) append(pad, 8);
  const out: number[] = new Array<number>(bits.length / 8).fill(0);
  bits.forEach((bit, i) => { out[i >>> 3]! |= bit << (7 - (i & 7)); });
  return out;
}

/** Centre coordinates of the alignment patterns along each axis. */
export function alignmentPositions(version: number): number[] {
  if (version === 1) return [];
  const numAlign = Math.floor(version / 7) + 2;
  const step = Math.floor((version * 8 + numAlign * 3 + 5) / (numAlign * 4 - 4)) * 2;
  const result = [6];
  for (let pos = version * 4 + 17 - 7; result.length < numAlign; pos -= step) result.splice(1, 0, pos);
  return result;
}

/** The 15 format bits (level and mask, BCH-protected and masked). */
export function formatBits(ecl: QrEcl, mask: number): number {
  const data = (ECL_FORMAT_BITS[ecl] << 3) | mask;
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  return ((data << 10) | rem) ^ 0x5412;
}

/** The 18 version bits (versions 7 and up). */
export function versionBits(version: number): number {
  let rem = version;
  for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
  return (version << 12) | rem;
}

class Grid {
  readonly modules: boolean[][];
  readonly isFunction: boolean[][];

  constructor(readonly size: number) {
    this.modules = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
    this.isFunction = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  }

  setFunction(x: number, y: number, dark: boolean): void {
    this.modules[y]![x] = dark;
    this.isFunction[y]![x] = true;
  }
}

function drawFunctionPatterns(g: Grid, version: number, ecl: QrEcl): void {
  const size = g.size;
  for (let i = 0; i < size; i++) {
    g.setFunction(6, i, i % 2 === 0);
    g.setFunction(i, 6, i % 2 === 0);
  }
  const finder = (cx: number, cy: number) => {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        const dist = Math.max(Math.abs(dx), Math.abs(dy));
        if (x >= 0 && x < size && y >= 0 && y < size) g.setFunction(x, y, dist !== 2 && dist !== 4);
      }
    }
  };
  finder(3, 3);
  finder(size - 4, 3);
  finder(3, size - 4);
  const align = alignmentPositions(version);
  const n = align.length;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      // Skip the three corners the finder patterns occupy.
      if ((i === 0 && j === 0) || (i === 0 && j === n - 1) || (i === n - 1 && j === 0)) continue;
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) g.setFunction(align[i]! + dx, align[j]! + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
      }
    }
  }
  drawFormat(g, ecl, 0); // reserves the area; redrawn with the chosen mask
  if (version >= 7) {
    const bits = versionBits(version);
    for (let i = 0; i < 18; i++) {
      const dark = getBit(bits, i);
      const a = size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      g.setFunction(a, b, dark);
      g.setFunction(b, a, dark);
    }
  }
}

function drawFormat(g: Grid, ecl: QrEcl, mask: number): void {
  const bits = formatBits(ecl, mask);
  const size = g.size;
  for (let i = 0; i <= 5; i++) g.setFunction(8, i, getBit(bits, i));
  g.setFunction(8, 7, getBit(bits, 6));
  g.setFunction(8, 8, getBit(bits, 7));
  g.setFunction(7, 8, getBit(bits, 8));
  for (let i = 9; i < 15; i++) g.setFunction(14 - i, 8, getBit(bits, i));
  for (let i = 0; i < 8; i++) g.setFunction(size - 1 - i, 8, getBit(bits, i));
  for (let i = 8; i < 15; i++) g.setFunction(8, size - 15 + i, getBit(bits, i));
  g.setFunction(8, size - 8, true); // the dark module
}

function drawCodewords(g: Grid, codewords: readonly number[]): void {
  const size = g.size;
  let i = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5; // skip the vertical timing column
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? size - 1 - vert : vert;
        if (!g.isFunction[y]![x] && i < codewords.length * 8) {
          g.modules[y]![x] = getBit(codewords[i >>> 3]!, 7 - (i & 7));
          i++;
        }
      }
    }
  }
}

function maskApplies(mask: number, x: number, y: number): boolean {
  switch (mask) {
    case 0: return (x + y) % 2 === 0;
    case 1: return y % 2 === 0;
    case 2: return x % 3 === 0;
    case 3: return (x + y) % 3 === 0;
    case 4: return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0;
    case 5: return ((x * y) % 2) + ((x * y) % 3) === 0;
    case 6: return (((x * y) % 2) + ((x * y) % 3)) % 2 === 0;
    default: return (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
  }
}

function applyMask(g: Grid, mask: number): void {
  for (let y = 0; y < g.size; y++) {
    for (let x = 0; x < g.size; x++) {
      if (!g.isFunction[y]![x] && maskApplies(mask, x, y)) g.modules[y]![x] = !g.modules[y]![x];
    }
  }
}

/** The standard mask penalty (lower scans more reliably): runs, 2×2 blocks, finder look-alikes, dark balance. */
export function maskPenalty(modules: readonly (readonly boolean[])[]): number {
  const size = modules.length;
  let penalty = 0;
  const line = (get: (i: number) => boolean) => {
    let run = 1;
    for (let i = 1; i <= size; i++) {
      if (i < size && get(i) === get(i - 1)) { run++; continue; }
      if (run >= 5) penalty += 3 + (run - 5);
      run = 1;
    }
    // 1:1:3:1:1 finder look-alike with four light modules on either side (light outside the grid counts).
    const at = (i: number) => (i >= 0 && i < size ? get(i) : false);
    for (let i = -4; i < size; i++) {
      if (at(i) || at(i + 1) || at(i + 2) || at(i + 3)) continue;
      if (at(i + 4) && !at(i + 5) && at(i + 6) && at(i + 7) && at(i + 8) && !at(i + 9) && at(i + 10)) penalty += 40;
    }
    for (let i = -6; i < size; i++) {
      if (at(i) && !at(i + 1) && at(i + 2) && at(i + 3) && at(i + 4) && !at(i + 5) && at(i + 6)
        && !at(i + 7) && !at(i + 8) && !at(i + 9) && !at(i + 10)) penalty += 40;
    }
  };
  for (let y = 0; y < size; y++) line(x => modules[y]![x]!);
  for (let x = 0; x < size; x++) line(y => modules[y]![x]!);
  for (let y = 0; y + 1 < size; y++) {
    for (let x = 0; x + 1 < size; x++) {
      const c = modules[y]![x];
      if (c === modules[y]![x + 1] && c === modules[y + 1]![x] && c === modules[y + 1]![x + 1]) penalty += 3;
    }
  }
  let dark = 0;
  for (const row of modules) for (const m of row) if (m) dark++;
  const total = size * size;
  penalty += Math.floor(Math.abs(dark * 20 - total * 10) / total) * 10;
  return penalty;
}

/**
 * Encodes `text` (as UTF-8) in the smallest version that fits at `minEcl`, raised to a stronger level when that
 * still fits the same version. Null when it is too long for any QR code.
 */
export function encodeQr(text: string, minEcl: QrEcl = 'L'): QrCode | null {
  const bytes = new TextEncoder().encode(text);
  let version = 1;
  while (version <= 40 && byteCapacity(version, minEcl) < bytes.length) version++;
  if (version > 40) return null;
  let ecl = minEcl;
  for (const stronger of ECL_ORDER.slice(ECL_ORDER.indexOf(minEcl) + 1)) {
    if (byteCapacity(version, stronger) >= bytes.length) ecl = stronger;
  }
  const codewords = addEccAndInterleave(dataCodewordsFor(bytes, version, ecl), version, ecl);
  const size = version * 4 + 17;
  let best: { mask: number; grid: Grid; penalty: number } | null = null;
  for (let mask = 0; mask < 8; mask++) {
    const grid = new Grid(size);
    drawFunctionPatterns(grid, version, ecl);
    drawCodewords(grid, codewords);
    applyMask(grid, mask);
    drawFormat(grid, ecl, mask);
    const penalty = maskPenalty(grid.modules);
    if (!best || penalty < best.penalty) best = { mask, grid, penalty };
  }
  return { version, ecl, mask: best!.mask, size, modules: best!.grid.modules };
}

/**
 * The code as one SVG path in module units, including a four-module quiet zone, so it scales crisply at any size
 * (`viewBox="0 0 n n"` with `n = size + 8`).
 */
export function qrPath(qr: QrCode): string {
  const parts: string[] = [];
  qr.modules.forEach((row, y) => {
    let x = 0;
    while (x < qr.size) {
      if (!row[x]) { x++; continue; }
      const start = x;
      while (x < qr.size && row[x]) x++;
      parts.push(`M${start + 4} ${y + 4}h${x - start}v1h${start - x}z`);
    }
  });
  return parts.join('');
}
