/**
 * Runs one clip recording from the button press to the finished file: starts the replay, starts
 * the recorder when the replay reaches the clip window, and settles exactly once: with the clip, or
 * with why there is none (skipped, left, tab hidden, browser refused). One recording at a time.
 * Phaser- and DOM-free: the replay and the recorder are passed in (and faked in tests).
 */
import type { ClipFile, ClipResult } from './clipTypes';

export interface RecorderLike {
  /** Starts capturing; throws when the browser refuses. */
  begin(): void;
  /** Stops and collects the file (null when nothing was captured). */
  finish(): Promise<ClipFile | null>;
  /** Stops and throws everything away. */
  cancel(): void;
}

export interface ReplayHooks {
  /** The replay has reached the start of the clip window. */
  onRecordStart(): void;
  /** The replay ended: `completed` is false when it was skipped or torn down (Home, a new match). */
  onEnd(completed: boolean): void;
}

export interface ClipDirectorDeps {
  /** null when this browser cannot record. */
  createRecorder(): RecorderLike | null;
  /** Plays the replay with the hooks; null when there is nothing to replay. `stop` ends it early. */
  startReplay(hooks: ReplayHooks): { stop(): void } | null;
  tabHidden(): boolean;
  /** Calls back when the tab becomes hidden; returns the unsubscribe. */
  onTabHidden(callback: () => void): () => void;
}

export class ClipDirector {
  private active: { cancel: () => void } | null = null;

  constructor(private readonly deps: ClipDirectorDeps) {}

  get busy(): boolean { return this.active !== null; }

  /** Ends a recording in progress and discards it (the replay is stopped too). No-op when idle. */
  cancel(): void {
    this.active?.cancel();
  }

  record(): Promise<ClipResult> {
    if (this.active) return Promise.resolve({ ok: false, reason: 'busy' });
    if (this.deps.tabHidden()) return Promise.resolve({ ok: false, reason: 'hidden' });
    const recorder = this.deps.createRecorder();
    if (!recorder) return Promise.resolve({ ok: false, reason: 'failed', message: 'this browser cannot record video' });

    return new Promise<ClipResult>(resolve => {
      let settled = false;
      let recording = false;
      let hidden = false;
      let run: { stop(): void } | null = null;
      let unsubscribe: () => void = () => undefined;
      const settle = (result: ClipResult): void => {
        if (settled) return;
        settled = true;
        unsubscribe();
        this.active = null;
        resolve(result);
      };
      const fail = (message: string): void => {
        recorder.cancel();
        settle({ ok: false, reason: 'failed', message });
        run?.stop();
      };
      const hooks: ReplayHooks = {
        onRecordStart: () => {
          if (settled || recording) return;
          try {
            recorder.begin();
            recording = true;
          } catch (error) {
            fail(error instanceof Error && error.message ? error.message : 'the browser refused to start recording');
          }
        },
        onEnd: completed => {
          if (settled) return;
          if (!completed || !recording) {
            recorder.cancel();
            settle({ ok: false, reason: hidden ? 'hidden' : 'cancelled' });
            return;
          }
          recorder.finish().then(
            clip => settle(clip && clip.blob.size > 0 ? { ok: true, clip } : { ok: false, reason: 'failed', message: 'the recording was empty' }),
            () => settle({ ok: false, reason: 'failed' }),
          );
        },
      };
      this.active = {
        cancel: () => {
          if (settled) return;
          if (run) run.stop();
          // The replay reports its own end; if it was already gone, end it here.
          hooks.onEnd(false);
        },
      };
      unsubscribe = this.deps.onTabHidden(() => {
        hidden = true;
        this.cancel();
      });
      try {
        run = this.deps.startReplay(hooks);
      } catch {
        run = null;
      }
      if (!run && !settled) fail('there is nothing to replay');
    });
  }
}
