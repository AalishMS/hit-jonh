import { describe, expect, it } from 'vitest';
import { CLIP, FLOW, FX } from '../src/config/tuning';
import {
  clipCaption, clipFileName, clipMimeCandidates, gameAddress, pickClipMime, planClip, secondsLabel, sizeLabel, slug,
  type ClipTiming,
} from '../src/share/clipPlan';

const timing = (over: Partial<ClipTiming> = {}): ClipTiming => ({
  leadSeconds: 0.5, introSeconds: 0.45 + 0.12, flightSeconds: 2, afterSeconds: 2, minSeconds: 3, maxSeconds: 6, ...over,
});

describe('clip timing plan', () => {
  it('records the whole replay when it fits: from the start to a little after the impact', () => {
    const plan = planClip(timing());
    expect(plan.startAt).toBe(0);
    expect(plan.impactAt).toBeCloseTo(0.5 + 0.57 + 2);
    expect(plan.endAt).toBeCloseTo(plan.impactAt + 2);
    expect(plan.seconds).toBeCloseTo(plan.endAt);
  });

  it('keeps only the last seconds of a long lob', () => {
    const plan = planClip(timing({ flightSeconds: 9 }));
    expect(plan.seconds).toBeCloseTo(6);
    expect(plan.startAt).toBeGreaterThan(0);
    expect(plan.endAt - plan.impactAt).toBeCloseTo(2);
    expect(plan.startAt).toBeLessThan(plan.impactAt);
  });

  it('lingers on a very quick hit so the clip is never shorter than the minimum', () => {
    const plan = planClip(timing({ flightSeconds: 0.2, afterSeconds: 0.5 }));
    expect(plan.startAt).toBe(0);
    expect(plan.seconds).toBeCloseTo(3);
    expect(plan.endAt).toBeGreaterThan(plan.impactAt + 0.5);
  });

  it('tolerates nonsense timings and a max below the min', () => {
    const plan = planClip(timing({ flightSeconds: Number.NaN, leadSeconds: -4, minSeconds: 5, maxSeconds: 2 }));
    expect(Number.isFinite(plan.startAt) && Number.isFinite(plan.endAt)).toBe(true);
    expect(plan.seconds).toBeCloseTo(5);
    expect(plan.startAt).toBeGreaterThanOrEqual(0);
  });

  it('the shipped tuning gives clips of about 3 to 6 seconds', () => {
    expect(CLIP.minSeconds).toBeGreaterThanOrEqual(3);
    expect(CLIP.maxSeconds).toBeLessThanOrEqual(6);
    for (const flight of [0.3, 1, 2.5, 4, 8, 14]) {
      const plan = planClip({ leadSeconds: FLOW.showcaseLeadSeconds, introSeconds: FX.demoAimSeconds + FX.windupSeconds, flightSeconds: flight,
        afterSeconds: CLIP.afterImpactSeconds, minSeconds: CLIP.minSeconds, maxSeconds: CLIP.maxSeconds });
      expect(plan.seconds).toBeGreaterThanOrEqual(CLIP.minSeconds - 1e-9);
      expect(plan.seconds).toBeLessThanOrEqual(CLIP.maxSeconds + 1e-9);
    }
  });
});

describe('clip format choice', () => {
  it('prefers mp4 where the browser can record it, else VP9 then VP8 WebM', () => {
    expect(pickClipMime(m => m.startsWith('video/mp4'), true)).toMatchObject({ container: 'mp4', ext: 'mp4', fileType: 'video/mp4' });
    expect(pickClipMime(m => m === 'video/webm;codecs=vp9,opus' || m === 'video/webm;codecs=vp8,opus' || m === 'video/webm', true)?.mime).toBe('video/webm;codecs=vp9,opus');
    expect(pickClipMime(m => m.includes('vp8') || m === 'video/webm', false)).toMatchObject({ mime: 'video/webm;codecs=vp8', container: 'webm', fileType: 'video/webm' });
    expect(pickClipMime(m => m === 'video/webm', false)?.mime).toBe('video/webm');
  });

  it('names the audio codec only when there is audio', () => {
    expect(clipMimeCandidates(true).some(m => m.includes('opus') || m.includes('mp4a'))).toBe(true);
    expect(clipMimeCandidates(false).some(m => m.includes('opus') || m.includes('mp4a'))).toBe(false);
  });

  it('is null when nothing can be recorded, and treats a throwing probe as unsupported', () => {
    expect(pickClipMime(() => false, true)).toBeNull();
    expect(pickClipMime(() => { throw new Error('no isTypeSupported'); }, false)).toBeNull();
  });
});

describe('clip file name and caption', () => {
  it('names the file after the garden', () => {
    expect(clipFileName('The Greenhouse', 'webm')).toBe('hit-jonh-the-greenhouse.webm');
    expect(clipFileName('Lunar Picnic', 'mp4')).toBe('hit-jonh-lunar-picnic.mp4');
    expect(clipFileName('Café — Jardin!', 'webm')).toBe('hit-jonh-cafe-jardin.webm');
    expect(clipFileName('???', 'mp4')).toBe('hit-jonh.mp4');
    expect(slug('x'.repeat(100)).length).toBeLessThanOrEqual(40);
  });

  it('builds the title plate, skipping blank parts', () => {
    expect(clipCaption({ garden: 'The Greenhouse', headline: 'Bullseye!', address: 'hit-jonh.example' }))
      .toEqual({ title: 'Hit Jonh · The Greenhouse · Bullseye!', address: 'hit-jonh.example' });
    expect(clipCaption({ garden: ' ', headline: 'Trick shot!', address: '' }).title).toBe('Hit Jonh · Trick shot!');
  });

  it('shortens the game address the way people type it', () => {
    expect(gameAddress('https://hit-jonh.example', '/')).toBe('hit-jonh.example');
    expect(gameAddress('https://example.com', '/play/')).toBe('example.com/play');
    expect(gameAddress('http://localhost:5173', '/')).toBe('localhost:5173');
    expect(gameAddress('file://', '/index.html')).toBe('');
    expect(gameAddress('null', '/')).toBe('');
  });

  it('words the length and size', () => {
    expect(secondsLabel(4.4)).toBe('4 s');
    expect(sizeLabel(1_460_000)).toBe('1.5 MB');
    expect(sizeLabel(820_000)).toBe('820 KB');
    expect(sizeLabel(0)).toBe('0 KB');
  });
});
