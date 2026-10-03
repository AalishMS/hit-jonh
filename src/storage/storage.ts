export interface LevelScore {
  bestShots: number;
  hasStyle: boolean;
  lastAngle: number;
  lastPower: number;
}

export interface PlayerSetup {
  name: string;
  color: number;
  pattern: string;
}

export interface Settings {
  muted: boolean;
  volume: number;
  reducedMotion: boolean;
}

export interface SaveData {
  version: 'hitJonh.v1';
  solo: Record<string, LevelScore>;
  settings: Settings;
  lastMP?: PlayerSetup[];
}

const STORAGE_KEY = 'hitJonh.v1';

const DEFAULT_SETTINGS: Settings = {
  muted: false,
  volume: 1.0,
  reducedMotion: false,
};

export const defaultSaveData: SaveData = {
  version: 'hitJonh.v1',
  solo: {},
  settings: { ...DEFAULT_SETTINGS },
};

export function loadSaveData(): SaveData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      // Migrate old mute setting if present
      const oldMuted = localStorage.getItem('hitJonh.v1.muted');
      const data = { ...defaultSaveData, settings: { ...DEFAULT_SETTINGS } };
      if (oldMuted === 'true') data.settings.muted = true;
      if (oldMuted === 'false') data.settings.muted = false;
      return data;
    }
    const parsed = JSON.parse(raw);
    if (parsed.version !== 'hitJonh.v1') {
      return { ...defaultSaveData };
    }
    return {
      version: 'hitJonh.v1',
      solo: parsed.solo || {},
      settings: { ...DEFAULT_SETTINGS, ...parsed.settings },
      lastMP: parsed.lastMP,
    };
  } catch (e) {
    console.warn('Failed to load save data, starting fresh', e);
    return { ...defaultSaveData };
  }
}

export function writeSaveData(data: SaveData): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    console.warn('Failed to write save data', e);
  }
}

export function recordSoloResult(mapId: string, shots: number, isRicochet: boolean, angle: number, power: number): void {
  const data = loadSaveData();
  const existing = data.solo[mapId];
  if (!existing) {
    data.solo[mapId] = { bestShots: shots, hasStyle: isRicochet, lastAngle: angle, lastPower: power };
  } else {
    existing.bestShots = Math.min(existing.bestShots, shots);
    existing.hasStyle = existing.hasStyle || isRicochet;
    existing.lastAngle = angle;
    existing.lastPower = power;
  }
  writeSaveData(data);
}

export function saveSoloAim(mapId: string, angle: number, power: number): void {
  const data = loadSaveData();
  const existing = data.solo[mapId];
  if (!existing) {
    data.solo[mapId] = { bestShots: 999, hasStyle: false, lastAngle: angle, lastPower: power };
  } else {
    existing.lastAngle = angle;
    existing.lastPower = power;
  }
  writeSaveData(data);
}

export function saveSettings(settings: Partial<Settings>): void {
  const data = loadSaveData();
  data.settings = { ...data.settings, ...settings };
  writeSaveData(data);
}
