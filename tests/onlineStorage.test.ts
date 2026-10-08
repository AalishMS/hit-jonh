// tests/onlineStorage.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MULTIPLAYER } from '../src/config/tuning';
import {
  defaultOnlineProfile, loadOnlineProfile, loadSaveData, onlineToken, randomToken,
  saveMultiplayerSetup, saveOnlineProfile, defaultPlayerSetups,
} from '../src/storage/storage';

function memoryStore() {
  let data: Record<string, string> = {};
  return {
    getItem: (k: string) => data[k] ?? null,
    setItem: (k: string, v: string) => { data[k] = String(v); },
    clear: () => { data = {}; },
  };
}
const local = memoryStore();
vi.stubGlobal('localStorage', local);

describe('online profile', () => {
  beforeEach(() => local.clear());

  it('defaults when nothing is saved', () => {
    expect(loadOnlineProfile()).toEqual(defaultOnlineProfile());
  });

  it('round-trips a sanitised profile', () => {
    saveOnlineProfile({ name: '  Ann  ', color: MULTIPLAYER.colors[2]!, pattern: MULTIPLAYER.patterns[3]! });
    expect(loadOnlineProfile()).toEqual({ name: 'Ann', color: MULTIPLAYER.colors[2], pattern: MULTIPLAYER.patterns[3] });
  });

  it('replaces a corrupt online field with defaults and keeps other data', () => {
    local.setItem('hitJonh.v1', JSON.stringify({ version: 'hitJonh.v1', solo: {}, settings: {}, online: 'nope' }));
    expect(loadOnlineProfile()).toEqual(defaultOnlineProfile());
    local.setItem('hitJonh.v1', JSON.stringify({ version: 'hitJonh.v1', solo: {}, settings: {}, online: { profile: { name: 7, color: 1, pattern: 'x' } } }));
    expect(loadOnlineProfile()).toEqual({ ...defaultOnlineProfile(), name: 'Player 1' });
  });

  it('never touches the hot-seat roster', () => {
    const roster = defaultPlayerSetups().slice(0, 3);
    saveMultiplayerSetup(roster);
    saveOnlineProfile({ name: 'Zed', color: MULTIPLAYER.colors[1]!, pattern: MULTIPLAYER.patterns[1]! });
    expect(loadSaveData().lastMP).toEqual(roster);
  });

  it('loads saves written before online play existed', () => {
    local.setItem('hitJonh.v1', JSON.stringify({ version: 'hitJonh.v1', solo: {}, settings: { muted: true } }));
    expect(loadSaveData().settings.muted).toBe(true);
    expect(loadSaveData().online).toBeUndefined();
  });
});

describe('onlineToken', () => {
  it('creates 32-hex tokens', () => {
    expect(randomToken()).toMatch(/^[0-9a-f]{32}$/);
  });

  it('keeps one token per tab store across reloads', () => {
    const tab = memoryStore();
    const first = onlineToken(tab);
    expect(onlineToken(tab)).toBe(first);
  });

  it('gives two tabs two different players', () => {
    expect(onlineToken(memoryStore())).not.toBe(onlineToken(memoryStore()));
  });

  it('replaces an invalid stored token', () => {
    const tab = memoryStore();
    tab.setItem('hitJonh.v1.onlineToken', 'not-a-token');
    expect(onlineToken(tab, () => 'a'.repeat(32))).toBe('a'.repeat(32));
  });

  it('still returns a token when storage throws', () => {
    const broken = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } };
    expect(onlineToken(broken)).toMatch(/^[0-9a-f]{32}$/);
  });
});
