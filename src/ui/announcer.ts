/**
 * Screen-reader announcements (accessibility pass): one visually hidden, polite live region for
 * moments that otherwise only show on screen — a title card, a handover's stakes, a result.
 * Menus move focus to their main button, which a screen reader reads; this adds the context.
 */
let region: HTMLElement | null = null;
let pending: ReturnType<typeof setTimeout> | undefined;

/** Text that summarises a screen in one breath: parts joined with full stops, empty parts dropped. */
export function sentence(...parts: Array<string | null | undefined | false>): string {
  return parts.filter((p): p is string => typeof p === 'string' && p.trim().length > 0)
    .map(p => p.trim().replace(/[.!?…]*$/, m => m || '.'))
    .join(' ');
}

export function announce(text: string): void {
  if (typeof document === 'undefined' || !text) return;
  if (!region || !region.isConnected) {
    region = document.createElement('div');
    region.className = 'visually-hidden';
    region.id = 'sr-announcer';
    region.setAttribute('role', 'status');
    region.setAttribute('aria-live', 'polite');
    region.setAttribute('aria-atomic', 'true');
    document.body.appendChild(region);
  }
  // Clear first, then speak a moment later, so the same words twice in a row are still read.
  region.textContent = '';
  if (pending !== undefined) clearTimeout(pending);
  const target = region;
  pending = setTimeout(() => { target.textContent = text; pending = undefined; }, 60);
}
