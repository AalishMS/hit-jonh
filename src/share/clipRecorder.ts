/**
 * The browser half of the clip: copies the game canvas, with a caption drawn on it, into a second
 * canvas on every rendered frame and records that canvas with `captureStream()` + `MediaRecorder`.
 * HTML overlays (menus, result card, letterbox) are never in the picture. Recording only reads the
 * canvas: it never touches the simulation, scoring or saved data.
 */
import { CLIP } from '../config/tuning';
import { clipFileName, pickClipMime, type ClipCaption, type ClipMime } from './clipPlan';
import type { RecorderLike } from './clipDirector';
import type { ClipFile } from './clipTypes';

/** The recording format this browser would use (mp4 first), or null when it cannot record a canvas at all. */
export function clipFormat(withAudio: boolean): ClipMime | null {
  if (typeof MediaRecorder === 'undefined' || typeof HTMLCanvasElement === 'undefined') return null;
  if (typeof HTMLCanvasElement.prototype.captureStream !== 'function') return null;
  return pickClipMime(mime => MediaRecorder.isTypeSupported(mime), withAudio);
}

export interface ClipRecorderOptions {
  /** The game's canvas. */
  source: HTMLCanvasElement;
  /** Calls back right after each frame is rendered (the canvas holds the finished picture only then); returns the unsubscribe. */
  subscribeFrames: (callback: () => void) => () => void;
  caption: ClipCaption;
  /** Name of the garden for the file name. */
  garden: string;
  /** The game's sound (master output), or null for a silent clip. */
  audio: MediaStream | null;
  releaseAudio?: () => void;
  format: ClipMime;
}

const INK = 'rgba(41, 60, 54, 0.84)';
const PAPER = '#fffdf3';
const FONT = 'Nunito, system-ui, sans-serif';

/** A caption plate: rounded dark label with light text, shrunk to fit `maxWidth`. */
function plate(ctx: CanvasRenderingContext2D, text: string, fontPx: number, x: number, y: number, anchor: 'left' | 'right', maxWidth: number, k: number): void {
  if (!text) return;
  let size = fontPx * k;
  const padX = 0.5 * size;
  const padY = 0.32 * size;
  ctx.font = `900 ${size}px ${FONT}`;
  while (size > 10 * k && ctx.measureText(text).width + 2 * padX > maxWidth) {
    size -= k;
    ctx.font = `900 ${size}px ${FONT}`;
  }
  const w = ctx.measureText(text).width + 2 * padX;
  const h = size + 2 * padY;
  const left = anchor === 'left' ? x : x - w;
  const top = anchor === 'left' ? y : y - h;
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.roundRect(left, top, w, h, h / 2);
  ctx.fill();
  ctx.fillStyle = PAPER;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillText(text, left + padX, top + h / 2 + size * 0.04);
}

/** Draws the caption over a frame of `width` × `height` (1280 logical px wide = scale 1). */
export function drawCaption(ctx: CanvasRenderingContext2D, caption: ClipCaption, width: number, height: number): void {
  const k = width / 1280;
  const margin = CLIP.captionMarginPx * k;
  ctx.save();
  plate(ctx, caption.title, CLIP.titleFontPx, margin, margin, 'left', width - 2 * margin, k);
  plate(ctx, caption.address, CLIP.addressFontPx, width - margin, height - margin, 'right', width / 2, k);
  ctx.restore();
}

export class ClipRecorder implements RecorderLike {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly chunks: Blob[] = [];
  private recorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private unsubscribe: (() => void) | null = null;
  private startedAt = 0;
  private started = false;
  private ended = false;
  private errored = false;
  private audioReleased = false;

  constructor(private readonly options: ClipRecorderOptions) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = Math.max(2, options.source.width);
    this.canvas.height = Math.max(2, options.source.height);
    const ctx = this.canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('no 2D canvas');
    this.ctx = ctx;
  }

  begin(): void {
    if (this.started || this.ended) return;
    const { options } = this;
    const stream = this.canvas.captureStream(CLIP.fps);
    for (const track of options.audio?.getAudioTracks() ?? []) stream.addTrack(track);
    this.stream = stream;
    const recorder = new MediaRecorder(stream, {
      mimeType: options.format.mime,
      videoBitsPerSecond: CLIP.videoBitsPerSecond,
      ...(options.audio ? { audioBitsPerSecond: CLIP.audioBitsPerSecond } : {}),
    });
    recorder.ondataavailable = event => { if (event.data.size > 0) this.chunks.push(event.data); };
    recorder.onerror = () => { this.errored = true; };
    this.recorder = recorder;
    this.started = true;
    // The first picture is painted on the next rendered frame, then the encoder starts: no blank first frame.
    let first = true;
    this.unsubscribe = options.subscribeFrames(() => {
      this.paint();
      if (first && this.recorder === recorder && recorder.state === 'inactive') {
        first = false;
        this.startedAt = performance.now();
        try { recorder.start(CLIP.timesliceMs); } catch { this.errored = true; }
      }
    });
  }

  private paint(): void {
    const { width, height } = this.canvas;
    this.ctx.drawImage(this.options.source, 0, 0, width, height);
    drawCaption(this.ctx, this.options.caption, width, height);
  }

  finish(): Promise<ClipFile | null> {
    const recorder = this.recorder;
    if (!recorder || this.ended || this.errored || recorder.state === 'inactive') {
      this.teardown();
      return Promise.resolve(null);
    }
    const seconds = Math.max(0, (performance.now() - this.startedAt) / 1000);
    return new Promise<ClipFile | null>(resolve => {
      let done = false;
      const collect = (): void => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        const { format, garden } = this.options;
        const blob = new Blob(this.chunks, { type: format.fileType });
        this.teardown();
        resolve(this.errored || blob.size === 0 ? null : { blob, type: format.fileType, name: clipFileName(garden, format.ext), seconds });
      };
      const timer = setTimeout(collect, CLIP.finishTimeoutSeconds * 1000);
      recorder.onstop = collect;
      try { recorder.stop(); } catch { collect(); }
    });
  }

  cancel(): void {
    const recorder = this.recorder;
    if (recorder) {
      recorder.ondataavailable = null;
      recorder.onstop = null;
      recorder.onerror = null;
      try { if (recorder.state !== 'inactive') recorder.stop(); } catch { /* already stopped */ }
    }
    this.chunks.length = 0;
    this.teardown();
  }

  private teardown(): void {
    this.ended = true;
    this.unsubscribe?.();
    this.unsubscribe = null;
    for (const track of this.stream?.getTracks() ?? []) {
      // The shared audio track belongs to the game; only the canvas video is ours to stop.
      if (track.kind === 'video') track.stop();
    }
    if (!this.audioReleased) {
      this.audioReleased = true;
      this.options.releaseAudio?.();
    }
    this.stream = null;
    this.recorder = null;
  }
}
