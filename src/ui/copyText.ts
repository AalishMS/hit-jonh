export interface ClipboardLike {
  writeText(text: string): Promise<void>;
}

/**
 * Copies `text` with the Clipboard API. Resolves false, and never throws or rejects, when the API is missing
 * (`navigator.clipboard` is undefined on non-secure origins such as a LAN http:// address) or the write is refused.
 */
export async function copyText(text: string, clipboard: ClipboardLike | undefined): Promise<boolean> {
  if (typeof clipboard?.writeText !== 'function') return false;
  try {
    await clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
