import { copyText, type ClipboardLike } from './copyText';

export type ShareOutcome = 'shared' | 'copied' | 'cancelled' | 'failed';

interface ShareNavigator {
  share?: (data: { text: string }) => Promise<void>;
  clipboard?: ClipboardLike;
}

/**
 * Shares `text`: the native share sheet on touch devices that have one (phones), else the clipboard.
 * Resolves 'failed' (never throws) when neither works, so the caller can show the text to copy by hand.
 */
export async function shareOrCopy(text: string, nav: ShareNavigator | undefined = typeof navigator === 'undefined' ? undefined : navigator,
  coarsePointer = typeof window !== 'undefined' && Boolean(window.matchMedia?.('(pointer: coarse)')?.matches)): Promise<ShareOutcome> {
  if (coarsePointer && typeof nav?.share === 'function') {
    try {
      await nav.share({ text });
      return 'shared';
    } catch (error) {
      // The player closed the share sheet: that's a choice, not a failure.
      if (error instanceof Error && error.name === 'AbortError') return 'cancelled';
    }
  }
  return (await copyText(text, nav?.clipboard)) ? 'copied' : 'failed';
}

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
};

/**
 * A "Share result" button with a preview of exactly what gets shared. If sharing and copying both
 * fail (no Clipboard API on a non-secure origin), the preview becomes a selected text box to copy by hand.
 */
export function shareBlock(text: string, signal: AbortSignal, label = 'Share result', className = 'btn btn-share'): { block: HTMLElement; button: HTMLButtonElement } {
  const block = el('div', 'share-block');
  const preview = el('pre', 'share-preview', text);
  preview.setAttribute('aria-label', 'Result to share');
  const status = el('span', 'share-status');
  status.setAttribute('role', 'status');
  const button = el('button', className, label);
  button.type = 'button';
  button.addEventListener('click', () => {
    void shareOrCopy(text).then(outcome => {
      if (signal.aborted) return;
      if (outcome === 'copied') status.textContent = 'Copied! Paste it to your friends.';
      else if (outcome === 'shared') status.textContent = 'Shared.';
      else if (outcome === 'failed') {
        const box = el('textarea', 'share-text');
        box.readOnly = true;
        box.value = text;
        box.rows = text.split('\n').length;
        box.setAttribute('aria-label', 'Copy this result');
        preview.replaceWith(box);
        box.focus();
        box.select();
        status.textContent = 'Copy the text above.';
      }
    });
  }, { signal });
  block.append(preview, status);
  return { block, button };
}
