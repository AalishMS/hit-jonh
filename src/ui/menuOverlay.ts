import { DEFAULT_MAP_SET, MAP_IDS, MAPS } from '../levels';
import { campaignStatus, campaignTotals, continueTarget, type CampaignEntry } from '../rules/campaign';
import { chapterStatuses, type ChapterStatus } from '../rules/chapters';
import { FLOW, MULTIPLAYER } from '../config/tuning';
import { cssColor, playerDisplayColor, setPlayerPalette } from '../art/palette';
import { difficultyPips, mapDescription, mapPreview } from './mapPreview';
import { mapSetPicker } from './mapSetPicker';
import { shareBlock, shareOrCopy } from './share';
import { exportSaveCode, importSaveCode } from '../storage/saveCode';
import { clipControl } from './clipButton';
import type { ClipOffer } from '../share/clipTypes';
import { announce, sentence } from './announcer';
import { DEFAULT_KEYS, KEY_ACTIONS, KEY_ACTION_LABELS, actionFor, isBindableCode, keyLabel, rebind, type KeyAction, type KeyBindings } from '../input/keyBindings';
import { defaultPlayerSetups, loadSaveData, sanitizePlayerName, saveMultiplayerSetup, saveSettings } from '../storage/storage';

import type { MPPlayerSetup, MPPlayerView } from '../rules/multiplayerMatch';

export interface MenuSettings { muted: boolean; volume: number; reducedMotion: boolean; music: boolean }

export interface MenuCallbacks {
  /** Opens online play; undefined when no Convex deployment is configured (the card is then disabled). */
  onOnline?: (() => void) | undefined;
  onMapSelected: (mapId: string) => void;
  /** Practice on a cleared garden: unlimited shots, nothing saved. */
  onPracticeSelected?: (mapId: string) => void;
  onRetry: () => void;
  onReturnToMenu: () => void;
  onStartMultiplayer?: (players: MPPlayerSetup[], maps: string[]) => void;
  onMultiplayerHandoverContinue?: () => void;
  onMultiplayerNextRound?: () => void;
  onMultiplayerRematch?: () => void;
  onPauseResume?: () => void;
  onPauseQuit?: () => void;
  onSettingsChange?: (settings: MenuSettings) => void;
  /** Settings → Keys changed the gameplay key bindings (already saved). */
  onKeysChange?: (keys: KeyBindings) => void;
  /** A save code from another device was merged into this save: reload progress. */
  onSaveImported?: () => void;
  /** Retention hooks (polish pass): extra home-screen entries rendered by the scene. */
  onHomeExtras?: (container: HTMLElement, signal: AbortSignal) => void;
  onClick?: () => void;
}

export interface OnlineResultExtras {
  ready: { name: string; color: number; ready: boolean }[];
  /** Seconds until the rematch window closes, or null before the first press. */
  countdown: number | null;
  note: string | null;
  canRematch: boolean;
}

export interface SoloResultExtras {
  newBest?: boolean;
  quote?: string;
  /** HTML for unlocked items (already escaped / static). */
  unlockHtml?: string;
  streak?: number;
  /** Campaign: the garden "Next map" opens (unlocked), or null/undefined for none (e.g. Daily Bonk). */
  nextMapId?: string | null;
  /** Campaign: this win unlocked that garden for the first time. */
  unlockedMapId?: string | null;
  /** Campaign star total after this result (none for Daily Bonk). */
  campaignStars?: { stars: number; maxStars: number } | undefined;
  /** This win cleared the last garden of a chapter for the first time (rules/chapters.ts). */
  chapterComplete?: { number: number; name: string; stars: number; maxStars: number } | null;
  /** First trick-shot badge on this garden. */
  newTrick?: boolean;
  /** Feats completed during this run (rules/feats.ts), shown as ribbons. */
  feats?: string[];
  /** A cleared garden offers Practice (P): unlimited shots that never change stars or bests. */
  practiceMapId?: string | null;
  /** Daily Bonk: the text Share puts on the clipboard (the day's counted run) and an optional note. */
  share?: { text: string; note?: string | undefined } | undefined;
  /** After a body hit: record the replay as a shareable clip (share/clipDirector.ts). */
  clip?: ClipOffer | undefined;
}



/** Party extras on the multiplayer handover card (stakes callouts and the previous shooter's taunt). */
export interface HandoverParty {
  kicker: string | null;
  stakes: string;
  decisive: boolean;
  taunt: { name: string; color: number; text: string } | null;
  /** How long the card stays before the turn starts (the auto-advance bar matches it). */
  autoSeconds: number;
}

export type MenuOverlayView = 'none' | 'home' | 'main' | 'map_select' | 'multi_setup' | 'settings' | 'handover' | 'round_result' | 'match_result' | 'solo_result' | 'pause' | 'locker' | 'feats' | 'daily' | 'online_setup' | 'online_lobby' | 'online_notice';

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
};

const mapName = (id: string): string => MAPS.find(m => m.id === id)?.name ?? id;

/** "★★☆" plus an accessible label. */
function starRow(stars: number, className = 'stars'): HTMLElement {
  const row = el('span', className, '★'.repeat(stars) + '☆'.repeat(Math.max(0, 3 - stars)));
  row.setAttribute('aria-label', `${stars} of 3 stars`);
  return row;
}

/** The per-garden trick-shot badge: filled when earned. */
function trickBadge(earned: boolean): HTMLElement {
  const badge = el('span', `trick-badge${earned ? ' earned' : ''}`, 'Trick');
  badge.setAttribute('aria-label', earned ? 'Trick shot landed' : 'No trick shot yet');
  return badge;
}

/** Campaign status from the current save. */
function currentCampaign(): CampaignEntry[] {
  return campaignStatus(MAP_IDS, loadSaveData().solo);
}

export class MenuOverlay {
  private container: HTMLElement;
  private content: HTMLElement;
  private clickAbortController: AbortController | null = null;
  private currentView: MenuOverlayView = 'none';
  /** Scroll offset to restore once a refreshed view has been rebuilt. */
  private refreshScroll = 0;

  constructor(private parentElement: HTMLElement, private callbacks: MenuCallbacks) {
    this.container = document.createElement('div');
    this.container.className = 'menu-overlay';
    this.container.setAttribute('role', 'dialog');
    this.container.setAttribute('aria-modal', 'true');
    this.container.setAttribute('aria-label', 'Hit Jonh menu');
    this.container.addEventListener('keydown', (event) => {
      if (event.key !== 'Tab') return;
      const focusable = [...this.content.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select')];
      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    });
    this.container.addEventListener('click', (event) => {
      if (event.target instanceof HTMLElement && event.target.closest('button')) this.callbacks.onClick?.();
    });
    // A key held from the game (Enter or Space used to skip a result) must not press the button that
    // just got focus: repeats never activate menu buttons. A fresh press still does.
    this.container.addEventListener('keydown', (event) => {
      if (event.repeat && (event.code === 'Enter' || event.code === 'Space' || event.code === 'NumpadEnter')) event.preventDefault();
    }, { capture: true });

    this.content = document.createElement('div');
    this.content.className = 'menu-content';
    this.container.appendChild(this.content);
    parentElement.appendChild(this.container);
  }

  /**
   * Starts a fresh view: clears listeners and replays the card entrance.
   * Re-rendering the view already on show (live lobby/result updates) keeps the card still: no entrance replay,
   * and `is-refresh` mutes the content's own entrance animations, so updates don't flicker.
   */
  private open(view: MenuOverlayView): AbortSignal {
    if (this.clickAbortController) this.clickAbortController.abort();
    this.clickAbortController = new AbortController();
    const refresh = this.currentView === view && this.isVisible();
    this.currentView = view;
    this.container.style.display = 'flex';
    this.container.className = `menu-overlay view-is-${view}`;
    this.refreshScroll = refresh ? this.content.scrollTop : 0;
    this.content.innerHTML = '';
    this.content.className = `menu-content view-${view}${refresh ? ' is-refresh' : ''}`;
    if (!refresh) {
      this.content.style.animation = 'none';
      void this.content.offsetWidth;
      this.content.style.animation = '';
    }
    return this.clickAbortController.signal;
  }

  /** A keyboard shortcut that lives as long as the current view (ignores repeats and typing). */
  private shortcut(code: string, action: () => void, signal: AbortSignal): void {
    const view = this.currentView;
    window.addEventListener('keydown', (e) => {
      if (e.code !== code || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      if (this.currentView !== view || !this.isVisible()) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      e.preventDefault();
      action();
    }, { signal });
  }

  /** Appends a small key hint (e.g. "R") to a button. */
  private keyHint(button: HTMLButtonElement, key: string): void {
    const hint = el('kbd', 'key-hint', key);
    hint.setAttribute('aria-hidden', 'true');
    button.appendChild(hint);
    button.setAttribute('aria-keyshortcuts', key);
  }

  private button(label: string, className: string, onClick: () => void, signal: AbortSignal, parent: HTMLElement = this.content): HTMLButtonElement {
    const b = el('button', `btn ${className}`.trim(), label);
    b.type = 'button';
    b.addEventListener('click', onClick, { signal });
    parent.appendChild(b);
    return b;
  }

  showHome(): void {
    const signal = this.open('home');
    this.content.innerHTML = `
      <div class="logo" aria-label="Hit Jonh"><span class="hit">Hit</span><span class="jonh">Jonh!</span><span class="bonk">BONK!</span></div>
      <p class="tagline">He just wants to read the paper.<br>You have a cannon.</p>`;
    // Returning players continue the campaign in one tap; "Play" opens every mode.
    const campaign = currentCampaign();
    const played = Object.values(loadSaveData().solo).some(record => record !== undefined);
    const target = played ? continueTarget(campaign) : null;
    let play: HTMLButtonElement;
    if (target) {
      play = this.button('', 'btn-primary btn-play btn-continue', () => this.startMap(target), signal);
      play.innerHTML = '<span class="continue-word">Continue</span><small></small>';
      play.querySelector('small')!.textContent = mapName(target);
      const totals = campaignTotals(campaign);
      const modes = this.button('All modes', 'btn-modes', () => this.showMainMenu(), signal);
      const tally = el('span', 'home-stars', `★ ${totals.stars} / ${totals.maxStars}`);
      tally.setAttribute('aria-label', `${totals.stars} of ${totals.maxStars} campaign stars`);
      modes.appendChild(tally);
    } else if (!played && campaign[0]) {
      // A brand-new player starts the first garden in one tap (the coach takes it from there).
      const first = campaign[0].mapId;
      play = this.button('', 'btn-primary btn-play btn-continue', () => this.startMap(first), signal);
      play.innerHTML = '<span class="continue-word">Play</span><small></small>';
      play.querySelector('small')!.textContent = `Garden 1 · ${mapName(first)}`;
      this.button('All modes', 'btn-modes', () => this.showMainMenu(), signal);
    } else {
      play = this.button('Play', 'btn-primary btn-play', () => this.showMainMenu(), signal);
    }
    const row = el('div', 'home-row');
    this.content.appendChild(row);
    this.callbacks.onHomeExtras?.(row, signal);
    this.button('Settings', '', () => this.showSettings(), signal, row);
    // Same switch as the in-game button: silences effects and music together.
    const settings = loadSaveData().settings;
    let silenced = settings.muted || !settings.music;
    const label = () => `Sound: ${silenced ? 'off' : 'on'}`;
    const mute = this.button(label(), '', () => {
      silenced = !silenced;
      const next = { ...loadSaveData().settings, muted: silenced, music: !silenced };
      saveSettings(next);
      this.callbacks.onSettingsChange?.({ muted: next.muted, volume: next.volume, reducedMotion: next.reducedMotion, music: next.music });
      mute.textContent = label();
      mute.setAttribute('aria-pressed', String(silenced));
    }, signal, row);
    mute.setAttribute('aria-pressed', String(silenced));
    this.content.appendChild(el('div', 'home-note', 'Solo challenges · 2–4 friends on one device · One very annoyed man'));
    this.content.appendChild(el('p', 'home-tip', 'Psst: poke the garden.'));
    play.focus();
  }

  getView(): MenuOverlayView { return this.currentView; }

  isPauseMenuVisible(): boolean { return this.currentView === 'pause' && this.isVisible(); }

  showMainMenu(): void {
    const signal = this.open('main');
    this.content.appendChild(el('h1', '', 'Pick your trouble'));
    const card = (symbol: string, title: string, blurb: string, extra: string, onClick: () => void) => {
      const b = this.button('', `mode-card ${extra}`, onClick, signal);
      b.innerHTML = `<span class="mode-symbol">${symbol}</span><strong></strong><small></small><span class="mode-go">›</span>`;
      b.querySelector('strong')!.textContent = title;
      b.querySelector('small')!.textContent = blurb;
      return b;
    };
    const solo = card('1', 'Solo challenge', 'Three shots per map. Earn stars, unlock hats.', 'solo', () => this.showMapSelect());
    card('2+', 'Pass the cannon', '2–4 friends, one device. Take turns, steal the glory.', 'multi', () => this.showMultiSetup());
    const onOnline = this.callbacks.onOnline;
    const online = card('⇄', 'Play online', onOnline ? 'Friends on their own devices. Share a room code.' : "Online play isn't configured.",
      'online', () => onOnline?.());
    online.disabled = !onOnline;
    const actions = el('div', 'menu-actions');
    this.content.appendChild(actions);
    this.button('Settings', '', () => this.showSettings(), signal, actions);
    this.button('Home', 'btn-quiet', () => this.showHome(), signal, actions);
    solo.focus();
  }

  showSettings(): void {
    const signal = this.open('settings');
    const data = loadSaveData();
    let { muted, volume, reducedMotion, music } = data.settings;
    this.content.appendChild(el('h2', '', 'Settings'));
    const list = el('div', 'settings-list');
    const notify = () => {
      saveSettings({ muted, volume, reducedMotion, music });
      this.callbacks.onSettingsChange?.({ muted, volume, reducedMotion, music });
    };
    const toggle = (id: string, label: string, value: boolean, set: (v: boolean) => void) => {
      const row = el('label', 'setting-row');
      row.htmlFor = id;
      const input = el('input');
      input.type = 'checkbox';
      input.id = id;
      input.checked = value;
      input.addEventListener('change', () => { set(input.checked); notify(); }, { signal });
      row.append(el('span', '', label), input);
      list.appendChild(row);
      return input;
    };
    // Mute lives on the home screen; turning music back on here also lifts the mute.
    toggle('settings-music', 'Music', music && !muted, v => {
      music = v;
      if (v) muted = false;
    });
    const volRow = el('div', 'setting-row volume');
    const head = el('div');
    const volLabel = el('label', '', 'Master volume');
    volLabel.htmlFor = 'settings-volume';
    const volValue = el('span', '', `${Math.round(volume * 100)}%`);
    head.append(volLabel, volValue);
    const slider = el('input');
    slider.type = 'range';
    slider.id = 'settings-volume';
    slider.setAttribute('aria-label', 'Master Volume');
    slider.min = '0'; slider.max = '100'; slider.step = '5';
    slider.value = String(Math.round(volume * 100));
    slider.addEventListener('input', () => {
      const val = Number.parseInt(slider.value, 10);
      volume = val / 100;
      volValue.textContent = `${val}%`;
      notify();
    }, { signal });
    volRow.append(head, slider);
    list.appendChild(volRow);
    toggle('settings-reduced-motion', 'Reduced motion', reducedMotion, v => { reducedMotion = v; });
    // Player colours (art/palette.ts): a colour-blind friendly set, previewed as the four cannon colours.
    const colors = toggle('settings-player-colors', 'Colour-blind friendly player colours', data.settings.playerColors === 'colorblind', v => {
      const playerColors = v ? 'colorblind' : 'standard';
      saveSettings({ playerColors });
      setPlayerPalette(playerColors);
      paintPreview();
    });
    const preview = el('span', 'palette-preview');
    preview.setAttribute('aria-hidden', 'true');
    const paintPreview = () => {
      preview.replaceChildren(...MULTIPLAYER.colors.map(c => {
        const dot = el('span', 'palette-dot');
        dot.style.background = cssColor(playerDisplayColor(c));
        return dot;
      }));
    };
    paintPreview();
    colors.before(preview);
    this.content.appendChild(list);
    this.content.appendChild(this.saveCodeSection(signal));
    this.content.appendChild(this.keysSection(signal));
    this.button('Back', '', () => this.showHome(), signal).focus();
  }

  /**
   * Settings → Your progress (storage/saveCode.ts): copy or share this device's save code, or paste one
   * from another device. Loading merges (the best of both), so it never takes anything away.
   */
  private saveCodeSection(signal: AbortSignal): HTMLElement {
    const section = el('section', 'keys-section save-code-section');
    const title = el('h3', 'keys-title', 'Your progress');
    title.id = 'save-code-title';
    section.setAttribute('aria-labelledby', title.id);
    const status = el('p', 'keys-status save-code-status');
    status.setAttribute('role', 'status');
    const say = (text: string, error = false) => {
      if (signal.aborted) return;
      status.textContent = text;
      status.classList.toggle('is-error', error);
    };
    const actions = el('div', 'save-code-actions');
    const copy = this.button('Copy save code', '', () => {
      void exportSaveCode().then(code => shareOrCopy(code)).then(outcome => {
        if (outcome === 'copied') say('Copied. Paste it into Settings on your other device.');
        else if (outcome === 'shared') say('Shared. Open it on your other device and paste it here.');
        else if (outcome === 'failed') void exportSaveCode().then(code => { if (!signal.aborted) { input.value = code; input.focus(); input.select(); say('Copy the code from the box.'); } });
      });
    }, signal, actions);
    copy.id = 'save-code-copy';
    const label = el('label', 'visually-hidden', 'Save code from another device');
    label.htmlFor = 'save-code-input';
    const input = el('textarea', 'online-input save-code-input');
    input.id = 'save-code-input';
    input.rows = 2;
    input.placeholder = 'Paste a code from another device (HJ1-…)';
    input.spellcheck = false;
    input.autocomplete = 'off';
    const load = this.button('Load code', '', () => {
      const code = input.value.trim();
      if (!code) { say('Paste a save code into the box first.', true); input.focus(); return; }
      load.disabled = true;
      void importSaveCode(code).then(result => {
        load.disabled = false;
        if (!result.ok) { say(result.message, true); return; }
        input.value = '';
        say(`Loaded. This device now has ${result.stars} / ${result.maxStars} stars and ${result.hits} hit${result.hits === 1 ? '' : 's'}.`);
        this.callbacks.onSaveImported?.();
      });
    }, signal, actions);
    load.id = 'save-code-load';
    section.append(title, el('p', 'home-note', 'Move your stars, tricks and unlocks to another device. Loading a code keeps the best of both.'),
      label, input, actions, status);
    return section;
  }

  /** Settings → Keys: rebind each gameplay key. Escape cancels a change; a key already in use swaps. */
  private keysSection(signal: AbortSignal): HTMLElement {
    const section = el('section', 'keys-section');
    const title = el('h3', 'keys-title', 'Keys');
    title.id = 'keys-title';
    section.setAttribute('aria-labelledby', title.id);
    const table = el('div', 'keys-list');
    const status = el('p', 'keys-status');
    status.setAttribute('role', 'status');
    let keys = loadSaveData().settings.keys;
    let stopCapture: (() => void) | null = null;
    const save = (next: KeyBindings, message: string, focusAction: KeyAction | null) => {
      keys = next;
      saveSettings({ keys });
      this.callbacks.onKeysChange?.(keys);
      render();
      status.textContent = message;
      // Focus returns after the key is released, so a Space or Enter binding can't re-press the button.
      if (focusAction) window.addEventListener('keyup', () => (table.querySelector(`[data-action="${focusAction}"]`) as HTMLElement | null)?.focus(), { once: true, signal });
    };
    const capture = (action: KeyAction, button: HTMLButtonElement) => {
      stopCapture?.();
      const name = KEY_ACTION_LABELS[action];
      button.textContent = 'Press a key…';
      button.classList.add('capturing');
      status.textContent = `Press the new key for ${name}. Escape cancels.`;
      const onKey = (e: KeyboardEvent) => {
        // First in line (window, capture phase): the game and the menus never see this key.
        e.preventDefault();
        e.stopImmediatePropagation();
        if (e.repeat) return;
        stopCapture?.();
        if (e.code === 'Escape') { render(); status.textContent = `${name} unchanged.`; return; }
        if (!isBindableCode(e.code)) { render(); status.textContent = `That key can't be used. Try another.`; return; }
        const other = actionFor(keys, e.code);
        const swapped = other && other !== action ? ` ${KEY_ACTION_LABELS[other]} now uses ${keyLabel(keys[action])}.` : '';
        save(rebind(keys, action, e.code), `${name}: ${keyLabel(e.code)}.${swapped}`, action);
      };
      window.addEventListener('keydown', onKey, { capture: true, signal });
      stopCapture = () => { window.removeEventListener('keydown', onKey, { capture: true }); stopCapture = null; };
    };
    const render = () => {
      table.replaceChildren();
      for (const action of KEY_ACTIONS) {
        const row = el('div', 'key-row');
        const change = el('button', 'btn key-change', 'Change');
        change.type = 'button';
        change.dataset.action = action;
        change.setAttribute('aria-label', `Change the key for ${KEY_ACTION_LABELS[action]}, now ${keyLabel(keys[action])}`);
        change.addEventListener('click', () => capture(action, change), { signal });
        row.append(el('span', 'key-action', KEY_ACTION_LABELS[action]), el('kbd', 'key-current', keyLabel(keys[action])), change);
        table.appendChild(row);
      }
    };
    render();
    const reset = el('button', 'btn btn-quiet keys-reset', 'Reset keys');
    reset.type = 'button';
    reset.addEventListener('click', () => save({ ...DEFAULT_KEYS }, 'Keys reset to the defaults.', null), { signal });
    section.append(title, el('p', 'home-note', 'Escape always pauses and goes back. In online rooms E and 1–6 also send emotes.'), table, status, reset);
    return section;
  }

  /** The campaign gardens; `practice` lists the same cards for practice (cleared gardens only). */
  showMapSelect(practice = false): void {
    const signal = this.open('map_select');
    const data = loadSaveData();
    const campaign = currentCampaign();
    const totals = campaignTotals(campaign);
    this.content.appendChild(el('h2', '', practice ? 'Practice' : 'Choose a garden'));
    if (this.callbacks.onPracticeSelected && totals.cleared > 0) {
      const modes = el('div', 'mode-toggle');
      modes.setAttribute('role', 'group');
      modes.setAttribute('aria-label', 'Mode');
      const challenge = this.button('Challenge', `mode-chip${practice ? '' : ' active'}`, () => { if (practice) this.showMapSelect(false); }, signal, modes);
      challenge.setAttribute('aria-pressed', String(!practice));
      const practise = this.button('Practice', `mode-chip${practice ? ' active' : ''}`, () => { if (!practice) this.showMapSelect(true); }, signal, modes);
      practise.setAttribute('aria-pressed', String(practice));
      this.content.appendChild(modes);
    }
    if (practice) this.content.appendChild(el('p', 'home-note', 'As many shots as you like on gardens you have cleared. Nothing is saved: your stars and bests stay as they are.'));
    const tally = el('div', 'campaign-tally');
    const starTotal = el('span', 'tally-stars', `★ ${totals.stars} / ${totals.maxStars}`);
    starTotal.setAttribute('aria-label', `${totals.stars} of ${totals.maxStars} stars`);
    tally.append(starTotal, el('span', '', `Trick shots ${totals.tricks} / ${totals.count}`), el('span', '', `${totals.cleared} of ${totals.count} gardens cleared`));
    const bar = el('div', 'tally-bar');
    bar.style.setProperty('--fill', `${totals.maxStars ? (totals.stars / totals.maxStars) * 100 : 0}%`);
    tally.appendChild(bar);
    this.content.appendChild(tally);
    const target = continueTarget(campaign);
    let focus: HTMLElement | null = null;
    // The gardens grouped under their chapter headers (rules/chapters.ts); one grid of cards per chapter.
    const chapterByMap = new Map(chapterStatuses(campaign).flatMap(c => c.entries.map(e => [e.mapId, c] as const)));
    const groups = el('div', 'chapter-list');
    let list = el('div', 'map-list');
    let currentChapter: ChapterStatus | null = null;
    for (const entry of campaign) {
      const map = MAPS.find(m => m.id === entry.mapId);
      if (!map) continue;
      const chapter = chapterByMap.get(entry.mapId) ?? null;
      if (chapter !== currentChapter || !groups.childElementCount) {
        currentChapter = chapter;
        const section = el('section', `chapter${chapter?.unlocked === false ? ' locked' : ''}`);
        list = el('div', 'map-list');
        if (chapter) {
          const head = this.chapterHeader(chapter);
          section.setAttribute('aria-labelledby', head.id);
          section.appendChild(head);
        }
        section.appendChild(list);
        groups.appendChild(section);
      }
      const score = data.solo[map.id];
      const available = practice ? entry.cleared : entry.unlocked;
      const btn = el('button', `map-btn${available ? '' : ' locked'}`);
      btn.type = 'button';
      btn.dataset.map = map.id;
      btn.innerHTML = mapPreview(map.id);
      const name = el('div', 'map-name', map.name);
      const number = el('span', 'map-number', String(entry.index + 1));
      number.setAttribute('aria-hidden', 'true');
      btn.prepend(number);
      const pips = el('small', 'difficulty-pips', difficultyPips(map));
      pips.setAttribute('aria-label', `difficulty ${map.difficulty} of 3`);
      name.appendChild(pips);
      btn.appendChild(name);
      const scoreDiv = el('div', 'map-score');
      if (practice && !available) {
        btn.disabled = true;
        const why = entry.unlocked ? 'Clear it to practise here' : `Clear ${mapName(entry.lockedBy ?? '')} to unlock`;
        btn.setAttribute('aria-label', `${map.name}: ${why}.`);
        btn.appendChild(el('small', 'lock-note', why));
      } else if (!entry.unlocked) {
        btn.disabled = true;
        btn.setAttribute('aria-label', `${map.name}, locked. Clear ${mapName(entry.lockedBy ?? '')} to unlock.`);
        btn.appendChild(el('small', 'lock-note', `Clear ${mapName(entry.lockedBy ?? '')} to unlock`));
        const lock = el('span', 'lock-badge');
        lock.setAttribute('aria-hidden', 'true');
        btn.appendChild(lock);
      } else {
        btn.appendChild(el('small', '', mapDescription(map.id)));
        if (score && score.bestShots !== null) {
          scoreDiv.append(starRow(entry.stars), document.createTextNode(` Best: ${score.bestShots} shot${score.bestShots > 1 ? 's' : ''}`));
        } else {
          scoreDiv.textContent = entry.mapId === target ? 'Up next' : 'Unplayed';
        }
        scoreDiv.appendChild(trickBadge(entry.trick));
      }
      btn.appendChild(scoreDiv);
      btn.addEventListener('click', () => {
        if (!available) return;
        if (practice) this.startPractice(map.id);
        else this.startMap(map.id);
      }, { signal });
      list.appendChild(btn);
      if ((!practice && entry.mapId === target) || (!focus && available)) focus = btn;
    }
    this.content.appendChild(groups);
    const actions = el('div', 'menu-actions');
    this.content.appendChild(actions);
    this.button('Back', '', () => { this.callbacks.onReturnToMenu(); this.showMainMenu(); }, signal, actions);
    focus?.focus();
  }

  /** A chapter's heading on the garden list: number, name, and its stars (or that it is locked). */
  private chapterHeader(chapter: ChapterStatus): HTMLElement {
    const head = el('h3', 'chapter-head');
    head.id = `chapter-head-${chapter.id}`;
    // Plain spaces between the parts so a screen reader names the heading "Chapter 2 Mild Inconveniences ...".
    if (chapter.number !== null) head.append(el('span', 'chapter-no', `Chapter ${chapter.number}`), ' ');
    head.append(el('span', 'chapter-name', chapter.name), ' ');
    if (!chapter.unlocked) {
      head.appendChild(el('span', 'chapter-state', `Locked. Clear ${mapName(chapter.lockedBy ?? '')} to open`));
    } else {
      if (chapter.complete) head.append(el('span', 'chapter-state done', 'Complete'), ' ');
      const stars = el('span', 'chapter-stars', `★ ${chapter.stars} / ${chapter.maxStars}`);
      stars.setAttribute('aria-label', `${chapter.stars} of ${chapter.maxStars} stars`);
      head.appendChild(stars);
    }
    return head;
  }

  /** Opens a garden for solo play, with the iris transition into play. */
  private startPractice(mapId: string): void {
    this.hide(true);
    this.callbacks.onPracticeSelected?.(mapId);
  }

  private startMap(mapId: string): void {
    this.callbacks.onMapSelected(mapId);
    this.hide(true);
  }

  showMultiSetup(): void {
    const signal = this.open('multi_setup');
    this.content.appendChild(el('h2', '', 'Pass the cannon'));
    this.content.appendChild(el('p', '', 'One shot each, in turn. Three shots per player on each map. Jonh moves between cycles.'));

    let playerCount = 2;
    const loadedSetups = loadSaveData().lastMP;
    const playerSetups: MPPlayerSetup[] = defaultPlayerSetups();
    if (loadedSetups) {
      playerCount = loadedSetups.length;
      loadedSetups.forEach((loaded, i) => { playerSetups[i] = { ...loaded }; });
    }

    const countContainer = el('div', 'player-count');
    const countLabel = el('span', '', `Players: ${playerCount}`);
    const countMinus = el('button', 'btn', '−');
    countMinus.type = 'button';
    countMinus.setAttribute('aria-label', 'Fewer players');
    const countPlus = el('button', 'btn', '+');
    countPlus.type = 'button';
    countPlus.setAttribute('aria-label', 'More players');
    countContainer.append(countMinus, countLabel, countPlus);
    this.content.appendChild(countContainer);

    const list = el('div', 'player-setup-list');
    this.content.appendChild(list);
    const renderList = () => {
      list.innerHTML = '';
      countLabel.textContent = `Players: ${playerCount}`;
      countMinus.disabled = playerCount === MULTIPLAYER.minPlayers;
      countPlus.disabled = playerCount === MULTIPLAYER.maxPlayers;
      for (let i = 0; i < playerCount; i++) {
        const row = el('div', 'player-setup-row');
        row.style.setProperty('--player-color', cssColor(playerDisplayColor(playerSetups[i]!.color)));
        const nameLabel = el('label', '', `Player ${i + 1} · ${playerSetups[i]!.pattern} cannon`);
        nameLabel.htmlFor = `mp-name-${i}`;
        const nameInput = el('input');
        nameInput.type = 'text';
        nameInput.id = `mp-name-${i}`;
        nameInput.maxLength = MULTIPLAYER.maxNameLength;
        nameInput.value = playerSetups[i]!.name;
        nameInput.oninput = () => { playerSetups[i]!.name = nameInput.value; };
        row.append(nameLabel, nameInput);
        list.appendChild(row);
      }
    };
    renderList();
    countMinus.onclick = () => { if (playerCount > MULTIPLAYER.minPlayers) { playerCount--; renderList(); } };
    countPlus.onclick = () => { if (playerCount < MULTIPLAYER.maxPlayers) { playerCount++; renderList(); } };

    let selectedMaps: string[] = [...DEFAULT_MAP_SET];
    this.content.appendChild(mapSetPicker({ idPrefix: 'mp', selected: selectedMaps, onChange: maps => {
      selectedMaps = maps;
      startBtn.disabled = maps.length === 0;
    }, signal }));

    const actions = el('div', 'menu-actions');
    this.content.appendChild(actions);
    const startBtn = this.button('Start match', 'btn-primary', () => {
      if (selectedMaps.length === 0) return;
      const finalSetups = playerSetups.slice(0, playerCount).map((s, i) => ({ ...s, name: sanitizePlayerName(s.name, i) }));
      saveMultiplayerSetup(finalSetups);
      this.hide();
      this.callbacks.onStartMultiplayer?.(finalSetups, selectedMaps);
    }, signal, actions);
    this.button('Back', '', () => { this.hide(); this.callbacks.onReturnToMenu(); this.showMainMenu(); }, signal, actions);
    startBtn.focus();
  }

  showMPHandover(player: MPPlayerView, mapName: string, attemptNum: number, headline?: string, party?: HandoverParty): void {
    const signal = this.open('handover');
    if (party?.kicker) {
      const banner = el('div', `stakes-banner${party.decisive ? ' decisive' : ''}`, party.kicker);
      this.content.appendChild(banner);
    }
    if (!headline) this.content.appendChild(el('div', 'handover-kicker', 'Pass the cannon to'));
    const name = el('div', 'handover-name', headline ?? player.name);
    name.style.setProperty('--player-color', cssColor(playerDisplayColor(player.color)));
    this.content.appendChild(name);
    if (party?.stakes) this.content.appendChild(el('p', `stakes-line${party.decisive ? ' decisive' : ''}`, party.stakes));
    if (party?.taunt) {
      const taunt = el('div', 'taunt');
      taunt.style.setProperty('--player-color', cssColor(playerDisplayColor(party.taunt.color)));
      taunt.append(el('strong', '', party.taunt.name), el('span', '', `“${party.taunt.text}”`));
      this.content.appendChild(taunt);
    }
    // attemptNum 0: a sudden-death shot (one each), not one of the round's three.
    const where = attemptNum > 0 ? `${mapName} · Shot ${attemptNum}/${MULTIPLAYER.shotsPerRound}` : `${mapName} · One shot`;
    this.content.appendChild(el('p', '', where));
    announce(sentence(party?.kicker, headline ?? `Pass the cannon to ${player.name}`, party?.stakes,
      party?.taunt ? `${party.taunt.name} says: ${party.taunt.text}` : null, where.replace(' · ', ', ')));
    const btn = this.button('Ready now', 'btn-primary', () => { this.hide(); this.callbacks.onMultiplayerHandoverContinue?.(); }, signal);
    const bar = el('div', 'auto-bar');
    bar.style.setProperty('--auto-duration', `${party?.autoSeconds ?? FLOW.handoverSeconds}s`);
    bar.appendChild(el('i'));
    this.content.appendChild(bar);
    this.content.appendChild(el('p', 'auto-note', headline ? 'Starting automatically…' : 'Your turn starts automatically…'));
    btn.focus();
  }

  private scoreRows(sorted: readonly MPPlayerView[], detail: (p: MPPlayerView) => string, winners: readonly MPPlayerView[] = []): HTMLElement {
    const list = el('div', 'score-list');
    sorted.forEach((p, i) => {
      const won = winners.some(w => w.id === p.id);
      const row = el('div', `score-row${won ? ' winner' : ''}`);
      row.style.setProperty('--player-color', cssColor(playerDisplayColor(p.color)));
      const who = el('span');
      who.append(document.createTextNode(p.name), el('small', '', detail(p)));
      row.append(el('span', 'rank', won ? '♛' : String(i + 1)), who, el('b', '', String(p.totalScore)));
      list.appendChild(row);
    });
    return list;
  }

  /** `suddenDeathNext`: the match is level after the last round, so a shoot-out follows. */
  showMPRoundResult(players: readonly MPPlayerView[], roundIndex: number, roundCount: number, suddenDeathNext = false): void {
    const signal = this.open('round_result');
    this.content.appendChild(el('h2', '', `Round ${roundIndex + 1} done`));
    const sorted = [...players].sort((a, b) => b.totalScore - a.totalScore);
    this.content.appendChild(this.scoreRows(sorted, p => `+${p.roundScores[roundIndex] ?? 0} this round`));
    const finalNext = roundIndex === roundCount - 2;
    if (finalNext) this.content.appendChild(el('p', 'stakes-line', 'Final round next. Everything to play for.'));
    if (suddenDeathNext) this.content.appendChild(el('p', 'stakes-line decisive', 'Dead level! Sudden death next.'));
    announce(sentence(`Round ${roundIndex + 1} done`, sorted.map(p => `${p.name} ${p.totalScore}`).join(', '), finalNext && 'Final round next',
      suddenDeathNext && 'Dead level. Sudden death next'));
    const label = suddenDeathNext ? 'Sudden death ›' : roundIndex >= roundCount - 1 ? 'Final result' : finalNext ? 'Final round ›' : 'Next round';
    const btn = this.button(label, 'btn-primary', () => { this.hide(); this.callbacks.onMultiplayerNextRound?.(); }, signal);
    const bar = el('div', 'auto-bar');
    bar.style.setProperty('--auto-duration', `${FLOW.roundResultSeconds}s`);
    bar.appendChild(el('i'));
    this.content.appendChild(bar);
    btn.focus();
  }

  /** `note` explains how it was decided (e.g. "Won in sudden death!"). */
  showMPMatchResult(winners: readonly MPPlayerView[], players: readonly MPPlayerView[], online?: OnlineResultExtras, note?: string, clip?: ClipOffer): void {
    const firstRender = this.currentView !== 'match_result';
    // Online re-renders this every rematch-countdown second; keep keyboard focus where it was (as the lobby does).
    const active = document.activeElement;
    const focusedId = !firstRender && active instanceof HTMLElement && this.content.contains(active) ? active.id : '';
    const signal = this.open('match_result');
    this.content.appendChild(el('h1', '', winners.length > 1 ? "It's a tie!" : `${winners[0]?.name ?? 'Nobody'} wins!`));
    if (note) this.content.appendChild(el('p', 'stakes-line decisive', note));
    if (firstRender) {
      announce(sentence(winners.length > 1 ? "It's a tie" : `${winners[0]?.name ?? 'Nobody'} wins`, note,
        [...players].sort((a, b) => b.totalScore - a.totalScore).map(p => `${p.name} ${p.totalScore} points`).join(', ')));
    }
    const sorted = [...players].sort((a, b) => (b.totalScore === a.totalScore) ? b.bodyHits - a.bodyHits : b.totalScore - a.totalScore);
    this.content.appendChild(this.scoreRows(sorted, p => `${p.bodyHits} hit${p.bodyHits === 1 ? '' : 's'}`, winners));
    this.content.appendChild(el('p', 'quote', '“I want it noted that I was here first.” — Jonh'));
    if (online) {
      const list = el('div', 'ready-list');
      for (const row of online.ready) {
        const item = el('span', `ready-chip${row.ready ? ' on' : ''}`, `${row.name} ${row.ready ? '✓' : '…'}`);
        item.style.setProperty('--player-color', cssColor(playerDisplayColor(row.color)));
        list.appendChild(item);
      }
      this.content.appendChild(list);
      if (online.countdown !== null) this.content.appendChild(el('p', 'auto-note', `Rematch starts in ${online.countdown} s`));
      if (online.note) this.content.appendChild(el('p', 'online-error', online.note));
    }
    const clipUi = clip ? clipControl(clip, signal) : null;
    if (clipUi) this.content.appendChild(clipUi.status);
    const actions = el('div', 'result-actions');
    this.content.appendChild(actions);
    const rematch = this.button(online && !online.canRematch ? 'Ready ✓' : 'Rematch', 'btn-primary', () => {
      if (!online) this.hide();
      this.callbacks.onMultiplayerRematch?.();
    }, signal, actions);
    rematch.id = 'mp-rematch';
    rematch.disabled = Boolean(online && !online.canRematch);
    const leave = this.button(online ? 'Leave' : 'Main menu', '', () => {
      this.hide();
      this.callbacks.onReturnToMenu();
      if (!online) this.showMainMenu();
    }, signal, actions);
    leave.id = 'mp-leave';
    if (clipUi) actions.insertBefore(clipUi.button, leave);
    const again = focusedId === rematch.id ? rematch : focusedId === leave.id ? leave : null;
    if (again && !again.disabled) again.focus();
    else if (firstRender || again) (rematch.disabled ? leave : rematch).focus();
    this.content.scrollTop = this.refreshScroll;
  }

  showSoloResult(success: boolean, shots: number, stars: number, hasStyle: boolean, extras: SoloResultExtras = {}): void {
    const signal = this.open('solo_result');
    this.content.appendChild(el('h1', '', success ? 'Bullseye!' : 'Jonh wins'));
    if (success) {
      const starsDiv = el('div', 'result-stars');
      starsDiv.setAttribute('aria-label', `${stars} of 3 stars`);
      for (let i = 0; i < 3; i++) starsDiv.appendChild(el('span', i < stars ? 'on' : '', '★'));
      this.content.appendChild(starsDiv);
      this.content.appendChild(el('p', '', `You hit Jonh in ${shots} shot${shots > 1 ? 's' : ''}.`));
      if (extras.chapterComplete) {
        const done = extras.chapterComplete;
        const card = el('div', 'chapter-complete');
        card.append(el('span', 'ribbon chapter-ribbon', `Chapter ${done.number} complete!`),
          el('p', '', `${done.name} · ★ ${done.stars} / ${done.maxStars}`));
        this.content.appendChild(card);
      }
      const ribbons = el('div');
      if (extras.newBest) ribbons.appendChild(el('span', 'ribbon', 'New best!'));
      if (hasStyle) ribbons.appendChild(el('span', 'ribbon pow', extras.newTrick ? 'Trick badge!' : 'Trick shot!'));
      if (extras.streak && extras.streak >= 2) ribbons.appendChild(el('span', 'ribbon', `${extras.streak} in a row!`));
      if (ribbons.childElementCount) this.content.appendChild(ribbons);
      if (extras.campaignStars) {
        const tally = el('p', 'result-tally', `Campaign ★ ${extras.campaignStars.stars} / ${extras.campaignStars.maxStars}`);
        this.content.appendChild(tally);
      }
      if (extras.unlockedMapId) {
        const card = el('div', 'unlock-card map-unlock');
        const text = el('div');
        text.append(el('strong', '', `Unlocked: ${mapName(extras.unlockedMapId)}`), document.createTextNode('A new garden. Jonh thinks he is safe there.'));
        card.append(el('span', 'unlock-key'), text);
        this.content.appendChild(card);
      }
    } else {
      this.content.appendChild(el('p', '', 'Three shots, zero Jonhs. He has resumed reading.'));
    }
    if (extras.feats?.length) {
      const feats = el('div', 'feat-ribbons');
      for (const name of extras.feats.slice(0, 3)) feats.appendChild(el('span', 'ribbon feat-ribbon', `Feat: ${name}`));
      if (extras.feats.length > 3) feats.appendChild(el('span', 'ribbon feat-ribbon', `+${extras.feats.length - 3} more`));
      this.content.appendChild(feats);
    }
    if (extras.quote) this.content.appendChild(el('p', 'quote', `“${extras.quote}”`));
    announce(sentence(success ? `Bullseye! ${stars} of 3 stars` : 'Jonh wins', success ? `You hit Jonh in ${shots} shot${shots > 1 ? 's' : ''}` : 'Three shots, zero Jonhs',
      extras.newBest && 'New best', hasStyle && 'Trick shot',
      extras.chapterComplete && `Chapter ${extras.chapterComplete.number} complete: ${extras.chapterComplete.name}. ${extras.chapterComplete.stars} of ${extras.chapterComplete.maxStars} stars`, extras.unlockedMapId && `Unlocked ${mapName(extras.unlockedMapId)}`,
      extras.feats?.length ? `Feat: ${extras.feats.join(', ')}` : null, extras.quote && `Jonh: ${extras.quote}`));
    if (extras.unlockHtml) {
      const unlock = el('div');
      unlock.innerHTML = extras.unlockHtml;
      this.content.appendChild(unlock);
    }
    let shareBtn: HTMLButtonElement | null = null;
    if (extras.share) {
      if (extras.share.note) this.content.appendChild(el('p', 'home-note', extras.share.note));
      const share = shareBlock(extras.share.text, signal, 'Share result', 'btn btn-primary btn-share');
      this.content.appendChild(share.block);
      shareBtn = share.button;
    }
    const clipUi = extras.clip ? clipControl(extras.clip, signal) : null;
    if (clipUi) this.content.appendChild(clipUi.status);
    const actions = el('div', 'result-actions');
    this.content.appendChild(actions);
    if (shareBtn) actions.appendChild(shareBtn);
    if (clipUi) actions.appendChild(clipUi.button);
    const retry = () => { this.hide(); this.callbacks.onRetry(); };
    const next = success && extras.nextMapId ? extras.nextMapId : null;
    let nextBtn: HTMLButtonElement | null = null;
    // A Retry key rebound to N or P wins on this card: that card shortcut is dropped, never doubled.
    const retryKey = loadSaveData().settings.keys.retry;
    if (next) {
      const goNext = () => this.startMap(next);
      nextBtn = this.button('Next garden ›', 'btn-primary btn-next', goNext, signal, actions);
      if (retryKey !== 'KeyN') {
        this.keyHint(nextBtn, 'N');
        this.shortcut('KeyN', goNext, signal);
      }
    }
    const quiet = next !== null || shareBtn !== null;
    const retryBtn = this.button(extras.share ? 'Play again' : success ? 'Retry' : 'Retry map', quiet ? 'btn-retry-quiet' : 'btn-retry', retry, signal, actions);
    this.keyHint(retryBtn, keyLabel(retryKey));
    this.shortcut(retryKey, retry, signal);
    if (extras.share) this.button('Home', '', () => { this.callbacks.onReturnToMenu(); this.showHome(); }, signal, actions);
    else this.button('Map select', '', () => { this.callbacks.onReturnToMenu(); this.showMapSelect(); }, signal, actions);
    const practiceId = extras.practiceMapId;
    if (practiceId && this.callbacks.onPracticeSelected) {
      const practise = () => this.startPractice(practiceId);
      const practiceBtn = this.button('Practice', 'btn-practice', practise, signal, actions);
      if (retryKey !== 'KeyP') {
        this.keyHint(practiceBtn, 'P');
        this.shortcut('KeyP', practise, signal);
      }
    }
    (nextBtn ?? shareBtn ?? retryBtn).focus();
  }

  showPauseMenu(quitLabel = 'Quit to menu'): void {
    const signal = this.open('pause');
    this.content.appendChild(el('h2', '', 'Paused'));
    this.content.appendChild(el('p', 'quote', '“Oh good. A moment of peace.”'));
    const actions = el('div', 'result-actions');
    this.content.appendChild(actions);
    const resumeBtn = this.button('Resume', 'btn-primary', () => { this.hide(); this.callbacks.onPauseResume?.(); }, signal, actions);
    this.button(quitLabel, '', () => { this.hide(); this.callbacks.onPauseQuit?.(); }, signal, actions);
    resumeBtn.focus();
  }

  /** Free-form view used by retention screens (locker, daily). */
  showCustom(view: MenuOverlayView, build: (content: HTMLElement, signal: AbortSignal) => void): void {
    const signal = this.open(view);
    build(this.content, signal);
    this.content.scrollTop = this.refreshScroll;
  }

  hide(intoPlay = false): void {
    const enteringPlay = intoPlay || this.currentView === 'map_select' || this.currentView === 'multi_setup' || this.currentView === 'daily';
    // The hidden view's buttons and shortcuts (R, N) must not keep acting during play.
    this.clickAbortController?.abort();
    this.clickAbortController = null;
    this.currentView = 'none';
    this.container.style.display = 'none';
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    const reduced = document.documentElement.classList.contains('reduced-motion') ||
      Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);
    // A title card (ui/transition.ts) already covers the way into play.
    if (enteringPlay && !reduced && !document.querySelector('.title-card')) {
      const iris = el('div', 'iris');
      document.body.appendChild(iris);
      iris.addEventListener('animationend', () => iris.remove(), { once: true });
      setTimeout(() => iris.remove(), 900);
    }
  }

  isVisible(): boolean {
    return this.container.style.display !== 'none';
  }

  destroy(): void {
    if (this.clickAbortController) this.clickAbortController.abort();
    this.parentElement.removeChild(this.container);
  }
}
