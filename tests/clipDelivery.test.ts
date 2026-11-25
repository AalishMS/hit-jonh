import { describe, expect, it, vi } from 'vitest';
import { canShareFile, clipToFile, deliverClip, downloadFile, wouldShare, type DeliveryEnv } from '../src/share/clipDelivery';
import type { ClipFile } from '../src/share/clipTypes';

const clip: ClipFile = { blob: new Blob([new Uint8Array(2000)], { type: 'video/mp4' }), type: 'video/mp4', name: 'hit-jonh-test.mp4', seconds: 4.2 };

function env(over: Partial<DeliveryEnv> & { share?: DeliveryEnv['nav'] } = {}): DeliveryEnv & { downloads: File[] } {
  const downloads: File[] = [];
  return { nav: over.share, coarsePointer: true, download: file => { downloads.push(file); return true; }, downloads, ...over };
}

describe('clip delivery', () => {
  it('turns the recording into a named File', () => {
    const file = clipToFile(clip);
    expect(file.name).toBe('hit-jonh-test.mp4');
    expect(file.type).toBe('video/mp4');
    expect(file.size).toBe(2000);
  });

  it('shares the file through the share sheet on a phone that can share files', async () => {
    const share = vi.fn(() => Promise.resolve());
    const e = env({ nav: { share, canShare: () => true } });
    expect(await deliverClip(clip, e)).toBe('shared');
    const arg = (share.mock.calls[0] as unknown as [{ files: File[] }])[0];
    expect(arg.files).toHaveLength(1);
    expect(arg.files[0]!.name).toBe('hit-jonh-test.mp4');
    expect(e.downloads).toHaveLength(0);
  });

  it('downloads when canShare says no for files, or on a desktop pointer, or without Web Share', async () => {
    for (const e of [
      env({ nav: { share: vi.fn(), canShare: () => false } }),
      env({ nav: { share: vi.fn(), canShare: () => true }, coarsePointer: false }),
      env({ nav: { share: vi.fn() } }),
      env({ nav: undefined }),
    ]) {
      expect(await deliverClip(clip, e)).toBe('downloaded');
      expect(e.downloads).toHaveLength(1);
    }
  });

  it('treats a closed share sheet as the player\'s choice, not a failure', async () => {
    const abort = Object.assign(new Error('closed'), { name: 'AbortError' });
    const e = env({ nav: { share: () => Promise.reject(abort), canShare: () => true } });
    expect(await deliverClip(clip, e)).toBe('cancelled');
    expect(e.downloads).toHaveLength(0);
  });

  it('falls back to a download when sharing is refused (e.g. the tap expired)', async () => {
    const refused = Object.assign(new Error('needs a user gesture'), { name: 'NotAllowedError' });
    const e = env({ nav: { share: () => Promise.reject(refused), canShare: () => true } });
    expect(await deliverClip(clip, e)).toBe('downloaded');
    expect(e.downloads).toHaveLength(1);
  });

  it('reports failure when nothing can deliver it', async () => {
    expect(await deliverClip(clip, env({ nav: undefined, download: () => false }))).toBe('failed');
  });

  it('knows before recording whether the device will share (button wording)', () => {
    expect(wouldShare({ nav: { share: vi.fn(), canShare: () => true }, coarsePointer: true }, 'video/mp4')).toBe(true);
    expect(wouldShare({ nav: { share: vi.fn(), canShare: () => true }, coarsePointer: false }, 'video/mp4')).toBe(false);
    expect(wouldShare({ nav: { share: vi.fn(), canShare: () => { throw new Error('x'); } }, coarsePointer: true }, 'video/mp4')).toBe(false);
    expect(canShareFile({ nav: undefined, coarsePointer: true }, clipToFile(clip))).toBe(false);
  });

  it('downloads through a temporary link and cleans up', () => {
    const link = { href: '', download: '', rel: '', style: { display: '' }, click: vi.fn(), remove: vi.fn() };
    const doc = { createElement: vi.fn(() => link), body: { appendChild: vi.fn() } } as unknown as Document;
    const urls = { createObjectURL: vi.fn(() => 'blob:x'), revokeObjectURL: vi.fn() };
    expect(downloadFile(clipToFile(clip), doc, urls)).toBe(true);
    expect(link.download).toBe('hit-jonh-test.mp4');
    expect(link.href).toBe('blob:x');
    expect(link.click).toHaveBeenCalled();
    expect(link.remove).toHaveBeenCalled();
    expect(downloadFile(clipToFile(clip), undefined, urls)).toBe(false);
  });
});
