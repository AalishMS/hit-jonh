/**
 * The shareable clip, pure parts: which seconds of the replay to record, which video format to ask
 * the browser for, what the file is called and what the in-canvas caption says. No DOM, no Phaser.
 *
 * [PROPOSED 2026-11-25] See SPEC §10.3 ("Shareable clip").
 */

export interface ClipTiming {
  /** Seconds before the cannon starts to swing (the replay's lead-in beat). */
  leadSeconds: number;
  /** Seconds the cannon swings and winds up before the ball leaves. */
  introSeconds: number;
  /** Seconds the ball is in the air until it touches Jonh. */
  flightSeconds: number;
  /** Seconds kept after the impact. */
  afterSeconds: number;
  minSeconds: number;
  maxSeconds: number;
}

/** Times are seconds on the replay's own clock (0 = the replay scene starts). */
export interface ClipPlan {
  /** When recording starts. */
  startAt: number;
  /** When recording stops, and the replay ends. */
  endAt: number;
  impactAt: number;
  /** Length of the clip. */
  seconds: number;
}

const finiteOr = (value: number, fallback: number): number => (Number.isFinite(value) ? value : fallback);

/**
 * The window of the replay to record: from its start to a little after the impact, but never
 * longer than `maxSeconds` (a long lob keeps only its last seconds) nor shorter than `minSeconds`
 * (a quick hit lingers on Jonh lying there).
 */
export function planClip(timing: ClipTiming): ClipPlan {
  const min = Math.max(0.5, finiteOr(timing.minSeconds, 3));
  const max = Math.max(min, finiteOr(timing.maxSeconds, 6));
  const impactAt = Math.max(0, finiteOr(timing.leadSeconds, 0)) + Math.max(0, finiteOr(timing.introSeconds, 0)) + Math.max(0, finiteOr(timing.flightSeconds, 0));
  const endAt = Math.max(impactAt + Math.max(0, finiteOr(timing.afterSeconds, 0)), min);
  const startAt = Math.max(0, endAt - max);
  return { startAt, endAt, impactAt, seconds: endAt - startAt };
}

export type ClipContainer = 'mp4' | 'webm';

export interface ClipMime {
  /** What MediaRecorder is asked for, codecs included. */
  mime: string;
  container: ClipContainer;
  /** The file extension without the dot. */
  ext: ClipContainer;
  /** The container's plain type, for the File (no codec list). */
  fileType: string;
}

/**
 * Formats to try, best first: mp4 where the browser can record it (Safari, current Chrome; it posts
 * everywhere), else WebM (VP9, then VP8). With game sound in the clip the audio codec is named too.
 */
export function clipMimeCandidates(withAudio: boolean): string[] {
  return withAudio
    ? ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']
    : ['video/mp4;codecs=avc1.42E01E', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
}

/** The first candidate the browser says it can record, or null when none (no clip action then). */
export function pickClipMime(isSupported: (mime: string) => boolean, withAudio: boolean): ClipMime | null {
  for (const mime of clipMimeCandidates(withAudio)) {
    let ok: boolean;
    try { ok = isSupported(mime); } catch { ok = false; }
    if (ok) {
      const container: ClipContainer = mime.startsWith('video/mp4') ? 'mp4' : 'webm';
      return { mime, container, ext: container, fileType: `video/${container}` };
    }
  }
  return null;
}

/** "The Greenhouse" → "the-greenhouse" (ASCII, safe in every file system). */
export function slug(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '');
}

/** `hit-jonh-<garden>.webm` (or .mp4); just `hit-jonh.<ext>` when the garden has no usable letters. */
export function clipFileName(garden: string, ext: ClipContainer): string {
  const s = slug(garden);
  return s ? `hit-jonh-${s}.${ext}` : `hit-jonh.${ext}`;
}

export interface ClipCaption {
  /** Top-left plate, e.g. "Hit Jonh · The Greenhouse · Bullseye!". */
  title: string;
  /** Bottom-right: where to play it (no protocol); empty to leave it out. */
  address: string;
}

/** The title plate: the game, the garden and what happened, skipping any blank part. */
export function clipCaption(parts: { garden: string; headline: string; address: string }): ClipCaption {
  const title = ['Hit Jonh', parts.garden, parts.headline].map(p => p.trim()).filter(Boolean).join(' · ');
  return { title, address: parts.address.trim() };
}

/**
 * The game's address as people type it: no protocol, no trailing slash, no query or hash
 * ("https://hit-jonh.example/play/?daily#x" → "hit-jonh.example/play"). Empty when there is no real address (file://).
 */
export function gameAddress(origin: string, pathname: string): string {
  const host = /^https?:\/\/(.+)$/i.exec(origin)?.[1];
  if (!host) return '';
  const path = pathname === '/' ? '' : pathname.replace(/\/+$/, '');
  return `${host}${path}`;
}

/** The clip's length in the wording of the status line ("4 s"). */
export function secondsLabel(seconds: number): string {
  return `${Math.max(0, Math.round(seconds))} s`;
}

/** "1.4 MB" / "820 KB": the size in the status line. */
export function sizeLabel(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';
  return bytes >= 1_000_000 ? `${(bytes / 1_000_000).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1000))} KB`;
}
