/** Shared shapes of the shareable clip (see clipPlan.ts). No DOM, no Phaser. */

/** A finished recording, ready to share or save. */
export interface ClipFile {
  blob: Blob;
  /** Plain container type ("video/mp4" or "video/webm"). */
  type: string;
  /** `hit-jonh-<garden>.webm` / `.mp4`. */
  name: string;
  /** Length in seconds (wall clock, what the video will play for). */
  seconds: number;
}

/** Why no clip came out. */
export type ClipFailure =
  /** The player skipped the replay, or left (Home, a new match): nothing is kept. */
  | 'cancelled'
  /** The tab was hidden, so frames stopped: nothing is kept. */
  | 'hidden'
  /** Another clip is being recorded. */
  | 'busy'
  /** The browser refused, or produced an empty file. */
  | 'failed';

export type ClipResult = { ok: true; clip: ClipFile } | { ok: false; reason: ClipFailure; message?: string };

/** What a result card gets to show a "Save clip" button: record it, or stop recording. */
export interface ClipOffer {
  record(): Promise<ClipResult>;
  /** Stops a recording in progress and discards it (no-op otherwise). */
  cancel(): void;
}
