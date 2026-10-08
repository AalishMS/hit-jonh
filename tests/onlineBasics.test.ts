// tests/onlineBasics.test.ts
import { describe, expect, it } from 'vitest';
import { ONLINE } from '../src/config/tuning';
import { seededRandom } from '../src/rules/seededRandom';
import { generateRoomCode, normalizeRoomCode } from '../src/rules/roomCode';
import { sanitizePlayerName } from '../src/storage/storage';

describe('seededRandom', () => {
  it('repeats the same sequence for the same seed and stays in [0, 1)', () => {
    const a = seededRandom(1234);
    const b = seededRandom(1234);
    const values = Array.from({ length: 200 }, () => a());
    expect(values).toEqual(Array.from({ length: 200 }, () => b()));
    for (const v of values) { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThan(1); }
  });

  it('differs between seeds', () => {
    expect(seededRandom(1)()).not.toBe(seededRandom(2)());
  });
});

describe('room codes', () => {
  it('uses an alphabet without look-alike characters', () => {
    for (const ch of '0O1IL') expect(ONLINE.codeAlphabet).not.toContain(ch);
  });

  it('generates codes of the configured length from the alphabet', () => {
    expect(generateRoomCode(() => 0)).toBe('AAAAA');
    expect(generateRoomCode(() => 0.999999)).toBe('99999');
    const code = generateRoomCode(Math.random);
    expect(code).toHaveLength(ONLINE.codeLength);
    for (const ch of code) expect(ONLINE.codeAlphabet).toContain(ch);
  });

  it('normalises case, spaces and dashes', () => {
    expect(normalizeRoomCode(' k7q px ')).toBe('K7QPX');
    expect(normalizeRoomCode('k7q-px')).toBe('K7QPX');
  });

  it('rejects wrong lengths and look-alike characters', () => {
    expect(normalizeRoomCode('K7QP')).toBeNull();
    expect(normalizeRoomCode('K7QPXX')).toBeNull();
    expect(normalizeRoomCode('K0QPX')).toBeNull();
    expect(normalizeRoomCode('KOQPX')).toBeNull();
    expect(normalizeRoomCode('')).toBeNull();
  });
});

describe('sanitizePlayerName (moved to rules)', () => {
  it('still trims, caps and falls back', () => {
    expect(sanitizePlayerName('  Ann  ', 0)).toBe('Ann');
    expect(sanitizePlayerName('', 2)).toBe('Player 3');
    expect(sanitizePlayerName(42, 1)).toBe('Player 2');
  });
});
