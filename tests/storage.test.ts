import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { loadSaveData, recordSoloResult, saveSettings, saveSoloAim } from '../src/storage/storage';

const localStorageMock = (function () {
  let store: Record<string, string> = {};
  return {
    getItem(key: string) {
      return store[key] || null;
    },
    setItem(key: string, value: string) {
      store[key] = value.toString();
    },
    clear() {
      store = {};
    }
  };
})();

vi.stubGlobal('localStorage', localStorageMock);

describe('Storage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('loads default data when nothing exists', () => {
    const data = loadSaveData();
    expect(data.version).toBe('hitJonh.v1');
    expect(data.settings.muted).toBe(false);
  });

  it('migrates old mute setting', () => {
    localStorage.setItem('hitJonh.v1.muted', 'true');
    const data = loadSaveData();
    expect(data.settings.muted).toBe(true);
  });

  it('ignores malformed JSON and returns default', () => {
    localStorage.setItem('hitJonh.v1', '{invalid_json');
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const data = loadSaveData();
    expect(data.version).toBe('hitJonh.v1');
    expect(consoleWarn).toHaveBeenCalled();
  });

  it('ignores data with wrong version', () => {
    localStorage.setItem('hitJonh.v1', JSON.stringify({ version: 'hitJonh.v0' }));
    const data = loadSaveData();
    expect(data.version).toBe('hitJonh.v1');
  });

  it('records best solo result and keeps style', () => {
    recordSoloResult('backyard', 3, false, 45, 50);
    let data = loadSaveData();
    expect(data.solo['backyard']!.bestShots).toBe(3);
    expect(data.solo['backyard']!.hasStyle).toBe(false);

    // Worse shots but has style -> keep best shots, gain style
    recordSoloResult('backyard', 4, true, 50, 50);
    data = loadSaveData();
    expect(data.solo['backyard']!.bestShots).toBe(3);
    expect(data.solo['backyard']!.hasStyle).toBe(true);
    expect(data.solo['backyard']!.lastAngle).toBe(50);
  });

  it('saves solo aim without overwriting bestShots if it is new', () => {
    saveSoloAim('fence', 45, 100);
    const data = loadSaveData();
    expect(data.solo['fence']!.lastAngle).toBe(45);
    expect(data.solo['fence']!.bestShots).toBe(999);
  });

  it('guards localStorage access failures', () => {
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw new Error('QuotaExceeded'); });
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(() => saveSettings({ muted: true })).not.toThrow();
    expect(consoleWarn).toHaveBeenCalled();
  });
});
