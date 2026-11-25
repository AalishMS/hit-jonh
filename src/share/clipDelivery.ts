/**
 * Getting a recorded clip to the player: the share sheet on phones (`navigator.share({ files })`),
 * else a download. Browser objects are passed in so the choice is unit-testable.
 */
import type { ClipFile } from './clipTypes';

export type ClipDelivery = 'shared' | 'downloaded' | 'cancelled' | 'failed';

export interface ShareNavigatorLike {
  share?: (data: { files?: File[]; title?: string; text?: string }) => Promise<void>;
  canShare?: (data: { files?: File[] }) => boolean;
}

export interface DeliveryEnv {
  nav: ShareNavigatorLike | undefined;
  /** Touch device (the share sheet is for phones; desktops get a file in Downloads, as with the Daily result's clipboard). */
  coarsePointer: boolean;
  download: (file: File) => boolean;
}

/** The recording as a File (the share sheet and `canShare` need one). */
export function clipToFile(clip: ClipFile): File {
  return new File([clip.blob], clip.name, { type: clip.type });
}

/** The browser can hand this file to a share sheet, and this is a device where that is the right default. */
export function canShareFile(env: Pick<DeliveryEnv, 'nav' | 'coarsePointer'>, file: File): boolean {
  const nav = env.nav;
  if (!env.coarsePointer || typeof nav?.share !== 'function' || typeof nav.canShare !== 'function') return false;
  try { return nav.canShare({ files: [file] }); } catch { return false; }
}

/**
 * Decides the button wording before anything is recorded, with an empty stand-in of the format the
 * recorder will use (some browsers only share certain file types).
 */
export function wouldShare(env: Pick<DeliveryEnv, 'nav' | 'coarsePointer'>, fileType: string): boolean {
  try { return canShareFile(env, new File([], 'hit-jonh', { type: fileType })); } catch { return false; }
}

/**
 * Shares the clip when the device can, else downloads it. A share sheet closed by the player is
 * 'cancelled' (their choice); any other share error (for instance the tap has expired) falls back to a download.
 */
export async function deliverClip(clip: ClipFile, env: DeliveryEnv): Promise<ClipDelivery> {
  const file = clipToFile(clip);
  if (canShareFile(env, file)) {
    try {
      await env.nav!.share!({ files: [file], title: 'Hit Jonh' });
      return 'shared';
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return 'cancelled';
    }
  }
  return env.download(file) ? 'downloaded' : 'failed';
}

/** Saves the file through a temporary link; false when the page has no document. */
export function downloadFile(file: File, doc: Document | undefined = typeof document === 'undefined' ? undefined : document,
  urls: Pick<typeof URL, 'createObjectURL' | 'revokeObjectURL'> = URL): boolean {
  if (!doc) return false;
  try {
    const url = urls.createObjectURL(file);
    const link = doc.createElement('a');
    link.href = url;
    link.download = file.name;
    link.rel = 'noopener';
    link.style.display = 'none';
    doc.body.appendChild(link);
    link.click();
    link.remove();
    // The browser has started the save by now; keep the URL a while for slow starts.
    setTimeout(() => urls.revokeObjectURL(url), 30_000);
    return true;
  } catch {
    return false;
  }
}

/** The real browser environment. */
export function browserDeliveryEnv(): DeliveryEnv {
  return {
    nav: typeof navigator === 'undefined' ? undefined : navigator,
    coarsePointer: typeof window !== 'undefined' && Boolean(window.matchMedia?.('(pointer: coarse)')?.matches),
    download: file => downloadFile(file),
  };
}
