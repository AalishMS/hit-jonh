import { MAPS } from '../levels';
import { AIM, MULTIPLAYER } from '../config/tuning';

export interface LevelScore {
  bestShots: number | null;
  hasStyle: boolean;
  lastAngle: number;
  lastPower: number;
}

export interface PlayerSetup {
  name: string;
  color: number;
  pattern: string;
  lastAngle: number;
  lastPower: number;
}

export interface Settings {
  muted: boolean;
  volume: number;
  reducedMotion: boolean;
  /** Background music loop (sound effects follow `muted`). */
  music: boolean;
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
  music: true,
};

function getFreshData(): SaveData {
  return {
    version: 'hitJonh.v1',
    solo: {},
    settings: { ...DEFAULT_SETTINGS },
  };
}

/** Fresh default setups for every player slot; callers may mutate the result. */
export function defaultPlayerSetups(): PlayerSetup[] {
  return Array.from({ length: MULTIPLAYER.maxPlayers }, (_, i) => ({
    name: `Player ${i + 1}`,
    color: MULTIPLAYER.colors[i]!,
    pattern: MULTIPLAYER.patterns[i]!,
    lastAngle: 45,
    lastPower: 50,
  }));
}

/** Trims a name, caps its length and falls back to "Player N" when blank or not text. */
export function sanitizePlayerName(raw: unknown, index: number): string {
  const name = typeof raw === 'string' ? raw.trim().substring(0, MULTIPLAYER.maxNameLength).trim() : '';
  return name || `Player ${index + 1}`;
}

function sanitizePlayerSetup(raw: Record<string, unknown>, index: number): PlayerSetup {
  const defaults = defaultPlayerSetups()[index]!;
  const color = typeof raw.color === 'number' && (MULTIPLAYER.colors as readonly number[]).includes(raw.color)
    ? raw.color : defaults.color;
  const pattern = typeof raw.pattern === 'string' && (MULTIPLAYER.patterns as readonly string[]).includes(raw.pattern)
    ? raw.pattern : defaults.pattern;

  let lastAngle = typeof raw.lastAngle === 'number' && Number.isFinite(raw.lastAngle)
    ? Math.round(raw.lastAngle) : defaults.lastAngle;
  lastAngle = Math.max(AIM.minAngleDeg, Math.min(AIM.maxAngleDeg, lastAngle));

  let lastPower = typeof raw.lastPower === 'number' && Number.isFinite(raw.lastPower)
    ? Math.round(raw.lastPower) : defaults.lastPower;
  lastPower = Math.max(0, Math.min(100, lastPower));

  return { name: sanitizePlayerName(raw.name, index), color, pattern, lastAngle, lastPower };
}

/** Returns validated setups, or null when the list is not 2..4 well-formed entries. */
function sanitizePlayerSetups(raw: unknown): PlayerSetup[] | null {
  if (!Array.isArray(raw)) return null;
  if (raw.length < MULTIPLAYER.minPlayers || raw.length > MULTIPLAYER.maxPlayers) return null;
  const setups: PlayerSetup[] = [];
  for (const [i, entry] of raw.entries()) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
    setups.push(sanitizePlayerSetup(entry as Record<string, unknown>, i));
  }
  return setups;
}

export function loadSaveData(): SaveData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const data = getFreshData();
      const oldMuted = localStorage.getItem('hitJonh.v1.muted');
      if (oldMuted === 'true') data.settings.muted = true;
      if (oldMuted === 'false') data.settings.muted = false;
      return data;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      console.warn('Malformed JSON in save data');
      return getFreshData();
    }

    if (!parsed || typeof parsed !== 'object') {
      return getFreshData();
    }
    
    const parsedObj = parsed as Record<string, unknown>;
    if (parsedObj.version !== 'hitJonh.v1') {
      return getFreshData();
    }

    const data = getFreshData();

    // Validate settings
    if (parsedObj.settings && typeof parsedObj.settings === 'object' && !Array.isArray(parsedObj.settings)) {
      const pSet = parsedObj.settings as Record<string, unknown>;
      data.settings.muted = typeof pSet.muted === 'boolean' ? pSet.muted : DEFAULT_SETTINGS.muted;
      data.settings.volume = typeof pSet.volume === 'number' && Number.isFinite(pSet.volume) 
        ? Math.max(0, Math.min(1, pSet.volume)) 
        : DEFAULT_SETTINGS.volume;
      data.settings.reducedMotion = typeof pSet.reducedMotion === 'boolean' ? pSet.reducedMotion : DEFAULT_SETTINGS.reducedMotion;
      data.settings.music = typeof pSet.music === 'boolean' ? pSet.music : DEFAULT_SETTINGS.music;
    }

    // Validate solo
    if (parsedObj.solo && typeof parsedObj.solo === 'object' && !Array.isArray(parsedObj.solo)) {
      const allowedMapIds = new Set(MAPS.map(m => m.id));
      for (const [key, value] of Object.entries(parsedObj.solo as Record<string, unknown>)) {
        if (!allowedMapIds.has(key) || !value || typeof value !== 'object' || Array.isArray(value)) continue;

        const val = value as Record<string, unknown>;
        let bestShots: number | null = null;
        if (typeof val.bestShots === 'number') {
          const bs = val.bestShots;
          if (bs === 999) {
            bestShots = null; // migrate sentinel
          } else if (Number.isFinite(bs) && bs >= 1 && bs <= 3) {
            bestShots = Math.floor(bs);
          }
        }

        const hasStyle = typeof val.hasStyle === 'boolean' ? val.hasStyle : false;
        
        let lastAngle = typeof val.lastAngle === 'number' && Number.isFinite(val.lastAngle) 
          ? Math.round(val.lastAngle) : 45;
        lastAngle = Math.max(AIM.minAngleDeg, Math.min(AIM.maxAngleDeg, lastAngle));
          
        let lastPower = typeof val.lastPower === 'number' && Number.isFinite(val.lastPower) 
          ? Math.round(val.lastPower) : 50;
        lastPower = Math.max(0, Math.min(100, lastPower));

        data.solo[key] = { bestShots, hasStyle, lastAngle, lastPower };
      }
    }

    // Validate lastMP
    const validSetups = sanitizePlayerSetups(parsedObj.lastMP);
    if (validSetups) data.lastMP = validSetups;

    return data;
  } catch (e) {
    console.warn('Failed to load save data, starting fresh', e);
    return getFreshData();
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
  let existing = data.solo[mapId];
  if (!existing) {
    existing = { bestShots: shots, hasStyle: isRicochet, lastAngle: angle, lastPower: power };
    data.solo[mapId] = existing;
  } else {
    existing.bestShots = existing.bestShots !== null ? Math.min(existing.bestShots, shots) : shots;
    existing.hasStyle = existing.hasStyle || isRicochet;
    existing.lastAngle = angle;
    existing.lastPower = power;
  }
  writeSaveData(data);
}

export function saveSoloAim(mapId: string, angle: number, power: number): void {
  const data = loadSaveData();
  let existing = data.solo[mapId];
  if (!existing) {
    existing = { bestShots: null, hasStyle: false, lastAngle: angle, lastPower: power };
    data.solo[mapId] = existing;
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

/** Validates and persists the multiplayer setup (names, appearance, aim) from a fresh read. */
export function saveMultiplayerSetup(setups: readonly PlayerSetup[]): void {
  const validated = sanitizePlayerSetups(setups);
  if (!validated) return;
  const data = loadSaveData();
  data.lastMP = validated;
  writeSaveData(data);
}

