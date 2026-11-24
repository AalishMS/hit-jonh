/** Letterbox bars and a blinking "REPLAY" tag over the canvas while a replay plays. */
export class ReplayOverlay {
  private readonly root: HTMLElement;

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'replay-overlay';
    this.root.setAttribute('aria-hidden', 'true');
    this.root.innerHTML = '<div class="replay-bar top"><span class="replay-tag"><i></i>REPLAY</span></div><div class="replay-bar bottom"><span class="replay-hint">Tap Next or press Enter to skip</span></div>';
    parent.appendChild(this.root);
  }

  /** Changes the tag ("REPLAY") and the skip hint, e.g. for the winning-shot replay. */
  setText(tag: string, hint: string): void {
    const tagEl = this.root.querySelector('.replay-tag');
    if (tagEl) tagEl.replaceChildren(document.createElement('i'), document.createTextNode(tag));
    const hintEl = this.root.querySelector('.replay-hint');
    if (hintEl) hintEl.textContent = hint;
  }

  show(): void { this.root.classList.add('on'); }
  hide(): void { this.root.classList.remove('on'); }
  get visible(): boolean { return this.root.classList.contains('on'); }

  destroy(): void { this.root.remove(); }
}
