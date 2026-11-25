import { describe, expect, it } from 'vitest';
import {
  alignmentPositions, byteCapacity, dataCodewordsFor, encodeQr, formatBits, maskPenalty, qrPath, rawDataModules, rsRemainder, versionBits,
} from '../src/share/qrCode';

describe('QR tables and arithmetic', () => {
  it('holds the published byte-mode capacities', () => {
    // ISO/IEC 18004 capacity table (8-bit bytes).
    expect([byteCapacity(1, 'L'), byteCapacity(1, 'M'), byteCapacity(1, 'Q'), byteCapacity(1, 'H')]).toEqual([17, 14, 11, 7]);
    expect([byteCapacity(10, 'L'), byteCapacity(10, 'M'), byteCapacity(10, 'Q'), byteCapacity(10, 'H')]).toEqual([271, 213, 151, 119]);
    expect([byteCapacity(13, 'L'), byteCapacity(15, 'M'), byteCapacity(20, 'L'), byteCapacity(25, 'Q')]).toEqual([425, 412, 858, 715]);
    expect([byteCapacity(40, 'L'), byteCapacity(40, 'M'), byteCapacity(40, 'Q'), byteCapacity(40, 'H')]).toEqual([2953, 2331, 1663, 1273]);
    expect(rawDataModules(1)).toBe(208);
    expect(rawDataModules(40)).toBe(29648);
  });

  it('computes Reed–Solomon codewords (the HELLO WORLD 1-M worked example)', () => {
    const data = [32, 91, 11, 120, 209, 114, 220, 77, 67, 64, 236, 17, 236, 17, 236, 17];
    expect(rsRemainder(data, 10)).toEqual([196, 35, 39, 119, 235, 215, 231, 226, 93, 23]);
  });

  it('builds format and version information', () => {
    expect(formatBits('L', 0)).toBe(0b111011111000100);
    expect(formatBits('M', 0)).toBe(0b101010000010010);
    expect(formatBits('Q', 0)).toBe(0b011010101011111);
    expect(formatBits('H', 0)).toBe(0b001011010001001);
    expect(versionBits(7)).toBe(0x07c94);
    expect(versionBits(40)).toBe(0x28c69);
  });

  it('places alignment patterns where the standard does', () => {
    expect(alignmentPositions(1)).toEqual([]);
    expect(alignmentPositions(2)).toEqual([6, 18]);
    expect(alignmentPositions(7)).toEqual([6, 22, 38]);
    expect(alignmentPositions(14)).toEqual([6, 26, 46, 66]);
    expect(alignmentPositions(32)).toEqual([6, 34, 60, 86, 112, 138]);
    expect(alignmentPositions(40)).toEqual([6, 30, 58, 86, 114, 142, 170]);
  });

  it('packs a byte segment with terminator and alternating pad bytes', () => {
    const words = dataCodewordsFor(new TextEncoder().encode('Hi'), 1, 'M');
    // 0100 | 00000010 | 01001000 01101001 | 0000, then 0xEC 0x11 …
    expect(words.slice(0, 4)).toEqual([0x40, 0x24, 0x86, 0x90]);
    expect(words.slice(4)).toEqual([0xec, 0x11, 0xec, 0x11, 0xec, 0x11, 0xec, 0x11, 0xec, 0x11, 0xec, 0x11]);
    expect(words.length).toBe(16);
  });
});

describe('encodeQr', () => {
  const link = `https://hit-jonh.vercel.app/#save=HJ1-${'Ab9_-'.repeat(70)}`;

  it('picks the smallest version that fits and raises the level when it is free', () => {
    const qr = encodeQr(link)!;
    expect(qr.version).toBe(13); // 386 bytes at level L
    expect(qr.size).toBe(69);
    const short = encodeQr('HJ')!;
    expect(short.version).toBe(1);
    expect(short.ecl).toBe('H');
    expect(encodeQr('x'.repeat(2954))).toBeNull();
    expect(encodeQr('x'.repeat(2953))!.version).toBe(40);
  });

  it('draws the finder, timing and dark-module patterns and a format copy that matches its mask', () => {
    const qr = encodeQr(link)!;
    const m = qr.modules;
    const finderAt = (x0: number, y0: number) => {
      for (let dy = 0; dy < 7; dy++) {
        for (let dx = 0; dx < 7; dx++) {
          const ring = Math.max(Math.abs(dx - 3), Math.abs(dy - 3));
          expect(m[y0 + dy]![x0 + dx]).toBe(ring !== 2);
        }
      }
    };
    finderAt(0, 0);
    finderAt(qr.size - 7, 0);
    finderAt(0, qr.size - 7);
    for (let i = 8; i < qr.size - 8; i++) {
      expect(m[6]![i]).toBe(i % 2 === 0);
      expect(m[i]![6]).toBe(i % 2 === 0);
    }
    expect(m[qr.size - 8]![8]).toBe(true);
    // Read the first format copy back (bits 0–5 down column 8, then 7, 8, then across row 8).
    const bits = formatBits(qr.ecl, qr.mask);
    const read = [0, 1, 2, 3, 4, 5].map(i => m[i]![8]);
    read.push(m[7]![8]!, m[8]![8]!, m[8]![7]!);
    for (let i = 9; i < 15; i++) read.push(m[8]![14 - i]!);
    expect(read).toEqual(Array.from({ length: 15 }, (_, i) => ((bits >>> i) & 1) === 1));
  });

  it('chooses the mask with the lowest penalty and keeps the dark share near half', () => {
    const qr = encodeQr(link)!;
    let dark = 0;
    for (const row of qr.modules) for (const v of row) if (v) dark++;
    expect(dark / (qr.size * qr.size)).toBeGreaterThan(0.35);
    expect(dark / (qr.size * qr.size)).toBeLessThan(0.65);
    expect(maskPenalty(qr.modules)).toBeGreaterThan(0);
  });

  it('renders as one SVG path inside a quiet zone', () => {
    const qr = encodeQr('HJ')!;
    const path = qrPath(qr);
    expect(path.startsWith('M4 4h7')).toBe(true); // the top-left finder's top edge
    expect(path).not.toMatch(/NaN/);
  });
});
