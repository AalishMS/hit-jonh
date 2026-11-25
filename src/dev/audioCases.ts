// The cues and mixes the level report (audio-levels.html) measures and the listening page (listen.html) plays.
import type { AudioManager } from '../audio/audioManager';
import type { CueName } from '../config/tuning';

export type Play = (audio: AudioManager, at: (seconds: number, fn: () => void) => void) => void;
export interface Case {
  id: string;
  /** The cue this case represents (others are silenced while measuring); null = a mix of everything. */
  cue: CueName | 'wind' | 'music' | null;
  seconds: number;
  play: Play;
}

export const ALL: Case[] = [
  { id: 'cannon (power 0.25)', cue: 'cannon', seconds: 1.4, play: a => a.playCannonFire(0.25) },
  { id: 'cannon (power 1)', cue: 'cannon', seconds: 1.4, play: a => a.playCannonFire(1) },
  { id: 'fuse', cue: 'fuse', seconds: 0.5, play: a => a.playFuse() },
  { id: 'hit (weak)', cue: 'hit', seconds: 1.2, play: a => a.playHit('weak') },
  { id: 'hit (strong)', cue: 'hit', seconds: 1.2, play: a => a.playHit('strong') },
  { id: 'hit (trick)', cue: 'hit', seconds: 1.2, play: a => a.playHit('trick') },
  { id: 'hat hit', cue: 'hat', seconds: 0.8, play: a => a.playHatHit() },
  { id: 'surface: wood', cue: 'surface', seconds: 0.8, play: a => a.playSurface('wood', 1) },
  { id: 'surface: concrete', cue: 'surface', seconds: 0.8, play: a => a.playSurface('concrete', 1) },
  { id: 'surface: ground', cue: 'surface', seconds: 0.8, play: a => a.playSurface('ground', 1) },
  { id: 'surface: rubber', cue: 'surface', seconds: 0.8, play: a => a.playSurface('rubber', 1) },
  { id: 'surface: glass (held)', cue: 'surface', seconds: 0.8, play: a => a.playSurface('glass', 1) },
  { id: 'glass break', cue: 'glass', seconds: 1.0, play: a => a.playGlassBreak(1) },
  { id: 'portal', cue: 'portal', seconds: 0.9, play: a => a.playPortal() },
  { id: "Jonh's yelp", cue: 'jonhVoice', seconds: 1.0, play: a => a.playJonhReaction(1) },
  { id: 'Jonh mutter', cue: 'mutter', seconds: 1.0, play: a => a.playMutter(30) },
  { id: 'FAAH (out of bounds)', cue: 'outOfBounds', seconds: 1.2, play: a => a.playOutOfBounds() },
  { id: 'drumroll (1.1 s)', cue: 'drumroll', seconds: 2.0, play: a => a.playDrumroll(1.1) },
  { id: 'sting (success)', cue: 'sting', seconds: 1.2, play: a => a.playSting(true) },
  { id: 'sting (failure)', cue: 'sting', seconds: 1.2, play: a => a.playSting(false) },
  { id: 'flight whoosh (full speed)', cue: 'whoosh', seconds: 2.0, play: a => a.setFlightWhoosh(1) },
  { id: 'magnet hum (ball at the magnet)', cue: 'whoosh', seconds: 2.0, play: a => a.setMagnetHum(1) },
  { id: 'UI click', cue: 'click', seconds: 0.3, play: a => a.playClick() },
  { id: 'emote (incoming)', cue: 'emoteIn', seconds: 0.6, play: a => a.playEmote(false) },
  { id: 'emote (mine)', cue: 'emoteOut', seconds: 0.6, play: a => a.playEmote(true) },
  { id: 'footstep (left)', cue: 'footstep', seconds: 0.4, play: a => a.playFootstep(0) },
  { id: 'footstep (right)', cue: 'footstep', seconds: 0.4, play: a => a.playFootstep(1) },
  { id: 'wind bed (full, 5 m/s²)', cue: 'wind', seconds: 10, play: a => a.windForReport(-5, 10) },
  { id: 'wind bed (Washday, 3 m/s²)', cue: null, seconds: 10, play: a => a.windForReport(-3, 10) },
  { id: 'wind bed (breeze, 1 m/s²)', cue: null, seconds: 10, play: a => a.windForReport(-1, 10) },
  { id: 'music loop (first 8 s)', cue: 'music', seconds: 8, play: a => a.scheduleMusicForReport(8) },
  // Events as played: every layer of one in-game moment together (hit = thump + crack + yelp + extras).
  { id: 'EVENT hit (weak), as played', cue: null, seconds: 1.2, play: a => a.playHit('weak') },
  { id: 'EVENT hit (strong), as played', cue: null, seconds: 1.2, play: a => a.playHit('strong') },
  { id: 'EVENT hit (trick), as played', cue: null, seconds: 1.2, play: a => a.playHit('trick') },
  // Mixes (everything audible together, as in play).
  { id: 'MIX shot: drumroll → trick hit + sting, wind, music', cue: null, seconds: 4, play: (a, at) => {
    a.windForReport(-5, 4);
    a.scheduleMusicForReport(4);
    a.playDrumroll(1.1);
    at(1.1, () => { a.playHit('trick'); a.playSurface('concrete', 1); });
    at(1.25, () => a.playSting(true));
  } },
  { id: 'MIX cannon + whoosh + wind + music', cue: null, seconds: 3, play: (a, at) => {
    a.windForReport(-5, 3);
    a.scheduleMusicForReport(3);
    a.playCannonFire(1);
    at(0.15, () => a.setFlightWhoosh(1));
    at(0.5, () => a.playSurface('wood', 1));
  } },
  { id: 'MIX stroll: steps + mutter + emote + music', cue: null, seconds: 4, play: (a, at) => {
    a.scheduleMusicForReport(4);
    for (let i = 0; i < 6; i++) at(0.3 + i * 0.55, () => a.playFootstep((i % 2) as 0 | 1));
    at(0.5, () => a.playMutter(30));
    at(1.5, () => a.playEmote(false));
  } },
  { id: 'MIX emote burst (6 incoming in 0.3 s, gated)', cue: null, seconds: 2, play: (a, at) => {
    for (let i = 0; i < 6; i++) at(i * 0.06, () => a.playEmote(false));
  } },
];
