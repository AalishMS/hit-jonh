import { loadSaveData } from '../storage/storage';
// src/ui/emotes.ts — the online emote button, its picker and the bubbles (spec §6.1). Own module and stylesheet.
import { cssColor, playerDisplayColor } from '../art/palette';
import { isTextInputElement } from '../input/controls';
import { EMOTES, type EmoteId } from '../rules/onlineEmotes';
import './emotes.css';

export interface EmoteBubbleView {
  key: string;
  /** The sender's seat; the dock ignores it, the player panel uses it. */
  seat: number;
  name: string;
  color: number;
  text: string;
  mine: boolean;
}

const BUBBLE_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-6l-5 4v-4H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z" fill="currentColor"/></svg>';
const NOTE_SECONDS = 1.6;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text = ''): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text) node.textContent = text;
  return node;
}

/**
 * A button and a six-choice picker in the bottom-left corner, and the bubbles others' emotes appear in.
 *
 * Aiming must keep working, because the game's Space (fire) and Enter (skip) are ignored while a button has focus:
 *  - pressing a button with a mouse or finger never leaves it focused, and picking an emote always lets go of focus;
 *  - `E` opens and closes the picker without moving focus, and 1–6 pick while it is open (Esc closes it);
 *  - only when the picker is opened from the keyboard (Tab to the button, Enter) does focus move into it.
 */
export class EmoteWidget {
  private readonly root = el('div', 'emote-dock');
  private readonly toasts = el('div', 'emote-toasts');
  private readonly picker = el('div', 'emote-picker');
  private readonly toggle = el('button', 'emote-toggle');
  private readonly options: HTMLButtonElement[] = [];
  private readonly bubbles = new Map<string, HTMLElement>();
  private note: HTMLElement | null = null;
  private noteTimer: ReturnType<typeof setTimeout> | null = null;
  private enabled = false;
  private isOpen = false;

  constructor(parent: HTMLElement, private readonly onPick: (id: EmoteId) => void) {
    this.toasts.setAttribute('role', 'log');
    this.toasts.setAttribute('aria-live', 'polite');
    this.toasts.setAttribute('aria-label', 'Emotes');

    this.picker.id = 'emote-picker';
    this.picker.setAttribute('role', 'group');
    this.picker.setAttribute('aria-label', 'Quick emotes');
    this.picker.hidden = true;
    EMOTES.forEach((emote, i) => {
      const option = el('button', 'emote-option');
      option.type = 'button';
      option.dataset.emote = emote.id;
      option.append(el('span', 'emote-option-text', emote.text), el('kbd', 'emote-option-key', String(i + 1)));
      option.setAttribute('aria-keyshortcuts', String(i + 1));
      option.addEventListener('click', () => this.pick(emote.id));
      this.picker.appendChild(option);
      this.options.push(option);
    });

    this.toggle.type = 'button';
    this.toggle.id = 'emote-btn';
    this.toggle.innerHTML = `${BUBBLE_ICON}<span class="emote-toggle-label">Emote</span><kbd class="emote-toggle-key">E</kbd>`;
    this.toggle.setAttribute('aria-haspopup', 'true');
    this.toggle.setAttribute('aria-expanded', 'false');
    this.toggle.setAttribute('aria-controls', this.picker.id);
    this.toggle.setAttribute('aria-keyshortcuts', 'E');
    this.toggle.addEventListener('click', e => {
      const keyboard = e.detail === 0;
      this.setOpen(!this.isOpen);
      if (this.isOpen && keyboard) this.options[0]?.focus();
      else this.toggle.blur(); // a mouse/touch press must not keep Space and Enter for itself
    });

    this.root.append(this.toasts, this.picker, this.toggle);
    this.root.hidden = true;
    parent.appendChild(this.root);
    window.addEventListener('keydown', this.onKeyDown, true);
    document.addEventListener('pointerdown', this.onPointerDown, true);
  }

  /** Shown while in an online room. */
  setVisible(visible: boolean): void {
    this.root.hidden = !visible;
    if (!visible) { this.setOpen(false); this.render([]); }
  }

  /** The button works once the room's emote list has arrived. */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.toggle.disabled = !enabled;
    if (!enabled) this.setOpen(false);
  }

  /**
   * Makes the bubbles on screen exactly `bubbles`: new ones appear, missing ones go. While the player panel shows
   * the same bubbles beside the arena (`panelShown`), the dock's copies step aside, except on portrait phones where
   * the panel sits below the fold.
   */
  render(bubbles: readonly EmoteBubbleView[], panelShown = false): void {
    this.toasts.classList.toggle('is-redundant', panelShown);
    const keep = new Set(bubbles.map(b => b.key));
    for (const [key, node] of this.bubbles) {
      if (keep.has(key)) continue;
      node.remove();
      this.bubbles.delete(key);
    }
    for (const bubble of bubbles) {
      if (this.bubbles.has(bubble.key)) continue;
      const node = el('div', `emote-bubble${bubble.mine ? ' is-mine' : ''}`);
      node.style.setProperty('--player-color', cssColor(playerDisplayColor(bubble.color)));
      node.append(el('strong', 'emote-bubble-name', bubble.mine ? 'You' : bubble.name), el('span', 'emote-bubble-text', bubble.text));
      this.toasts.insertBefore(node, this.note);
      this.bubbles.set(bubble.key, node);
    }
  }

  /** A short line in the bubble stack, e.g. "Easy there!" when sending too fast. */
  notice(text: string): void {
    this.note?.remove();
    if (this.noteTimer !== null) clearTimeout(this.noteTimer);
    this.note = el('div', 'emote-bubble is-note', text);
    this.toasts.appendChild(this.note);
    this.noteTimer = setTimeout(() => { this.note?.remove(); this.note = null; }, NOTE_SECONDS * 1000);
  }

  /** The text of the bubbles on screen, oldest first (for tests and diagnostics). */
  get bubbleTexts(): string[] { return [...this.bubbles.values()].map(b => b.textContent ?? ''); }
  get open(): boolean { return this.isOpen; }

  private setOpen(open: boolean): void {
    this.isOpen = open && this.enabled;
    this.picker.hidden = !this.isOpen;
    this.toggle.setAttribute('aria-expanded', String(this.isOpen));
    this.toggle.classList.toggle('is-open', this.isOpen);
  }

  private pick(id: EmoteId): void {
    this.setOpen(false);
    // Whatever had focus (the toggle, an option) lets go, so Space fires and Enter skips again.
    if (document.activeElement instanceof HTMLElement && this.root.contains(document.activeElement)) document.activeElement.blur();
    this.onPick(id);
  }

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (this.root.hidden || e.ctrlKey || e.metaKey || e.altKey || isTextInputElement(e.target)) return;
    if (this.isOpen && e.code === 'Escape') {
      this.setOpen(false);
      if (document.activeElement instanceof HTMLElement && this.root.contains(document.activeElement)) document.activeElement.blur();
      e.stopPropagation(); // closing the picker must not also pause the game
      e.preventDefault();
      return;
    }
    if (e.repeat) return;
    // A key the player bound to a game action (Settings → Keys) belongs to the game, not the picker.
    if (Object.values(loadSaveData().settings.keys).includes(e.code)) return;
    if (e.code === 'KeyE' && this.enabled) {
      this.setOpen(!this.isOpen);
      e.preventDefault();
      return;
    }
    const digit = /^(?:Digit|Numpad)([1-9])$/.exec(e.code);
    const choice = digit ? EMOTES[Number(digit[1]) - 1] : undefined;
    if (this.isOpen && choice) {
      this.pick(choice.id);
      e.preventDefault();
    }
  };

  private readonly onPointerDown = (e: Event): void => {
    if (this.isOpen && e.target instanceof Node && !this.root.contains(e.target)) this.setOpen(false);
  };

  destroy(): void {
    window.removeEventListener('keydown', this.onKeyDown, true);
    document.removeEventListener('pointerdown', this.onPointerDown, true);
    if (this.noteTimer !== null) clearTimeout(this.noteTimer);
    this.root.remove();
  }
}
