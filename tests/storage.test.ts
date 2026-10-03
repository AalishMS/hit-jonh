import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { defaultPlayerSetups, loadSaveData, recordSoloResult, sanitizePlayerName, saveMultiplayerSetup, saveSettings, saveSoloAim } from '../src/storage/storage';


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

// Fake MAPS id so we can test validation mapping
vi.mock('../src/levels', () => ({
  MAPS: [{ id: 'backyard', name: 'Backyard' }, { id: 'fence', name: 'Fence' }]
}));

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
    expect(data.solo['fence']!.bestShots).toBeNull();
  });

  it('guards localStorage access failures', () => {
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw new Error('QuotaExceeded'); });
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(() => saveSettings({ muted: true })).not.toThrow();
    expect(consoleWarn).toHaveBeenCalled();
  });

  it('saves and loads settings including volume and reduced motion', () => {
    saveSettings({ muted: true, volume: 0.65, reducedMotion: true });
    const data = loadSaveData();
    expect(data.settings.muted).toBe(true);
    expect(data.settings.volume).toBeCloseTo(0.65);
    expect(data.settings.reducedMotion).toBe(true);
  });

  it('validates against bad data shapes safely', () => {
    localStorage.setItem('hitJonh.v1', JSON.stringify({
      version: 'hitJonh.v1',
      solo: 'not_an_object',
      settings: ['an_array_not_object']
    }));
    const data1 = loadSaveData();
    expect(data1.solo).toEqual({});
    expect(data1.settings.muted).toBe(false);

    // Invalid map id, out of range values, NaN
    localStorage.setItem('hitJonh.v1', JSON.stringify({
      version: 'hitJonh.v1',
      solo: {
        'invalid_map': { bestShots: 1, hasStyle: false, lastAngle: 45, lastPower: 50 },
        'backyard': { bestShots: 999, hasStyle: 'yes', lastAngle: 'NaN', lastPower: NaN }
      }
    }));
    const data2 = loadSaveData();
    expect(data2.solo['invalid_map']).toBeUndefined();
    expect(data2.solo['backyard']!.bestShots).toBeNull(); // 999 migrated to null
    expect(data2.solo['backyard']!.hasStyle).toBe(false); // bad type falls back
    expect(data2.solo['backyard']!.lastAngle).toBe(45); // NaN falls back
    expect(data2.solo['backyard']!.lastPower).toBe(50); // NaN falls back
  });

  it('provides fresh default multiplayer setups and sanitizes player names', () => {
    const defaults = defaultPlayerSetups();
    expect(defaults.length).toBe(4);
    expect(defaults[0]!.name).toBe('Player 1');
    expect(defaults[0]!.color).toBe(0xff4444);
    expect(defaults[0]!.pattern).toBe('solid');

    // Name sanitization: trims, bounds length, defaults empty
    expect(sanitizePlayerName('  Alice  ', 0)).toBe('Alice');
    expect(sanitizePlayerName('', 2)).toBe('Player 3');
    expect(sanitizePlayerName('   ', 3)).toBe('Player 4');
    expect(sanitizePlayerName(12345, 0)).toBe('Player 1');
    expect(sanitizePlayerName('VeryLongNameExceeding16Chars', 0).length).toBe(16);
  });

  it('validates multiplayer setup domain, bounds, and counts safely', () => {
    // Valid 3-player setup save
    saveMultiplayerSetup([
      { name: 'Red', color: 0xff4444, pattern: 'solid', lastAngle: 50, lastPower: 60 },
      { name: 'Blue', color: 0x4444ff, pattern: 'stripes', lastAngle: 30, lastPower: 70 },
      { name: 'Green', color: 0x44ff44, pattern: 'dots', lastAngle: 70, lastPower: 80 },
    ]);
    let data = loadSaveData();
    expect(data.lastMP).toBeDefined();
    expect(data.lastMP!.length).toBe(3);
    expect(data.lastMP![0]!.name).toBe('Red');

    // Rejects invalid counts (< 2 or > 4) and does not corrupt existing data
    saveMultiplayerSetup([
      { name: 'Solo', color: 0xff4444, pattern: 'solid', lastAngle: 45, lastPower: 50 },
    ]);
    data = loadSaveData();
    expect(data.lastMP!.length).toBe(3); // unchanged

    // Malformed JSON storage payload with invalid colours, patterns, out-of-bounds aim
    localStorage.setItem('hitJonh.v1', JSON.stringify({
      version: 'hitJonh.v1',
      solo: {},
      settings: { muted: false, volume: 1, reducedMotion: false },
      lastMP: [
        { name: '  Bob  ', color: 0x999999 /* not in allowed domain */, pattern: 'invalid' /* invalid pattern */, lastAngle: 999, lastPower: -50 },
        { name: '', color: 0x4444ff, pattern: 'stripes', lastAngle: 2 /* below min */, lastPower: 150 /* above max */ },
      ],
    }));
    const loaded = loadSaveData();
    expect(loaded.lastMP).toBeDefined();
    expect(loaded.lastMP!.length).toBe(2);
    // Unrecognized colour falls back to slot 0 default
    expect(loaded.lastMP![0]!.color).toBe(0xff4444);
    // Unrecognized pattern falls back to slot 0 default
    expect(loaded.lastMP![0]!.pattern).toBe('solid');
    // Name trimmed
    expect(loaded.lastMP![0]!.name).toBe('Bob');
    // Angle clamped to 85, power clamped to 0
    expect(loaded.lastMP![0]!.lastAngle).toBe(85);
    expect(loaded.lastMP![0]!.lastPower).toBe(0);

    // Slot 1 blank name defaults to "Player 2"
    expect(loaded.lastMP![1]!.name).toBe('Player 2');
    // Angle clamped to minAngleDeg (5), power clamped to 100
    expect(loaded.lastMP![1]!.lastAngle).toBe(5);
    expect(loaded.lastMP![1]!.lastPower).toBe(100);
  });

  it('persists reducedMotion across reloads and maintains all settings on incremental updates', () => {
    // Repro case: Settings sets volume 40%, mute true, reducedMotion true
    saveSettings({ volume: 0.4, muted: true, reducedMotion: true });
    let data = loadSaveData();
    expect(data.settings.volume).toBeCloseTo(0.4);
    expect(data.settings.muted).toBe(true);
    expect(data.settings.reducedMotion).toBe(true);

    // Subsequent reload or independent volume change preserves reducedMotion
    saveSettings({ volume: 0.5 });
    data = loadSaveData();
    expect(data.settings.volume).toBeCloseTo(0.5);
    expect(data.settings.muted).toBe(true);
    expect(data.settings.reducedMotion).toBe(true);

    // Toggle reducedMotion off
    saveSettings({ reducedMotion: false });
    data = loadSaveData();
    expect(data.settings.reducedMotion).toBe(false);
    expect(data.settings.volume).toBeCloseTo(0.5);
    expect(data.settings.muted).toBe(true);
  });

  it('supports onSettingsChange callback pattern to persist settings even without an active renderer', () => {
    // Mimic PrototypeScene's onSettingsChange callback handler
    const mockJonhRenderer: { setReducedMotion: (val: boolean) => void } | null = null;
    const handleSettingsChange = (settings: { muted: boolean; volume: number; reducedMotion: boolean }) => {
      saveSettings(settings);
      if (mockJonhRenderer) (mockJonhRenderer as { setReducedMotion: (val: boolean) => void }).setReducedMotion(settings.reducedMotion);
    };

    handleSettingsChange({ muted: true, volume: 0.4, reducedMotion: true });
    const data = loadSaveData();
    expect(data.settings.muted).toBe(true);
    expect(data.settings.volume).toBeCloseTo(0.4);
    expect(data.settings.reducedMotion).toBe(true);
  });
});
