import { MAPS } from '../levels';
import { FLOW, MULTIPLAYER } from '../config/tuning';
import { cssColor, playerDisplayColor } from '../art/palette';
import { MAP_DESCRIPTIONS, mapPreview } from './mapPreview';
import { defaultPlayerSetups, loadSaveData, sanitizePlayerName, saveMultiplayerSetup, saveSettings } from '../storage/storage';

import type { MPPlayerSetup, MPPlayerView } from '../rules/multiplayerMatch';

export interface MenuSettings { muted: boolean; volume: number; reducedMotion: boolean; music: boolean }

export interface MenuCallbacks {
  onMapSelected: (mapId: string) => void;
  onRetry: () => void;
  onReturnToMenu: () => void;
  onStartMultiplayer?: (players: MPPlayerSetup[], maps: string[]) => void;
  onMultiplayerHandoverContinue?: () => void;
  onMultiplayerNextRound?: () => void;
  onMultiplayerRematch?: () => void;
  onPauseResume?: () => void;
  onPauseQuit?: () => void;
  onSettingsChange?: (settings: MenuSettings) => void;
  /** Retention hooks (polish pass): extra home-screen entries rendered by the scene. */
  onHomeExtras?: (container: HTMLElement, signal: AbortSignal) => void;
  onClick?: () => void;
}

export interface SoloResultExtras {
  newBest?: boolean;
  quote?: string;
  /** HTML for unlocked items (already escaped / static). */
  unlockHtml?: string;
  streak?: number;
}

export type MenuOverlayView = 'none' | 'home' | 'main' | 'map_select' | 'multi_setup' | 'settings' | 'handover' | 'round_result' | 'match_result' | 'solo_result' | 'pause' | 'locker' | 'daily';

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
};

export class MenuOverlay {
  private container: HTMLElement;
  private content: HTMLElement;
  private clickAbortController: AbortController | null = null;
  private currentView: MenuOverlayView = 'none';

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

    this.content = document.createElement('div');
    this.content.className = 'menu-content';
    this.container.appendChild(this.content);
    parentElement.appendChild(this.container);
  }

  /** Starts a fresh view: clears listeners and replays the card entrance. */
  private open(view: MenuOverlayView): AbortSignal {
    if (this.clickAbortController) this.clickAbortController.abort();
    this.clickAbortController = new AbortController();
    this.currentView = view;
    this.container.style.display = 'flex';
    this.container.className = `menu-overlay view-is-${view}`;
    this.content.innerHTML = '';
    this.content.className = `menu-content view-${view}`;
    this.content.style.animation = 'none';
    void this.content.offsetWidth;
    this.content.style.animation = '';
    return this.clickAbortController.signal;
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
    const play = this.button("Play", 'btn-primary btn-play', () => this.showMainMenu(), signal);
    const row = el('div', 'home-row');
    this.content.appendChild(row);
    this.callbacks.onHomeExtras?.(row, signal);
    this.button('Settings', '', () => this.showSettings(), signal, row);
    this.content.appendChild(el('div', 'home-note', 'Solo challenges · 2–4 friends on one device · One very annoyed man'));
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
    };
    toggle('settings-mute', 'Mute audio', muted, v => { muted = v; });
    toggle('settings-music', 'Music', music, v => { music = v; });
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
    this.content.appendChild(list);
    this.button('Back', '', () => this.showHome(), signal).focus();
  }

  showMapSelect(): void {
    const signal = this.open('map_select');
    const data = loadSaveData();
    this.content.appendChild(el('h2', '', 'Choose a garden'));
    const list = el('div', 'map-list');
    for (const map of MAPS) {
      const score = data.solo[map.id];
      const btn = el('button', 'map-btn');
      btn.type = 'button';
      btn.dataset.map = map.id;
      btn.innerHTML = mapPreview(map.id);
      btn.appendChild(el('div', 'map-name', map.name));
      btn.appendChild(el('small', '', MAP_DESCRIPTIONS[map.id] ?? ''));
      const scoreDiv = el('div', 'map-score');
      if (score && score.bestShots !== null) {
        const stars = 4 - score.bestShots;
        const s = el('span', 'stars', '★'.repeat(stars) + '☆'.repeat(3 - stars));
        scoreDiv.append(s, document.createTextNode(` Best: ${score.bestShots} shot${score.bestShots > 1 ? 's' : ''}${score.hasStyle ? ' · trick' : ''}`));
      } else {
        scoreDiv.textContent = 'Unplayed';
      }
      btn.appendChild(scoreDiv);
      btn.addEventListener('click', () => { this.callbacks.onMapSelected(map.id); this.hide(); }, { signal });
      list.appendChild(btn);
    }
    this.content.appendChild(list);
    const actions = el('div', 'menu-actions');
    this.content.appendChild(actions);
    this.button('Back', '', () => { this.callbacks.onReturnToMenu(); this.showMainMenu(); }, signal, actions);
    (list.firstElementChild as HTMLElement | null)?.focus();
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

    let selectedMaps: string[] = [...MULTIPLAYER.maps];
    const maps = el('fieldset', 'mp-map-picker');
    maps.appendChild(el('legend', '', 'Choose your arena'));
    for (const choice of [{ id: 'all', name: 'Three-garden tour' }, ...MAPS]) {
      const label = el('label', 'arena-option');
      const input = el('input');
      input.type = 'radio';
      input.name = 'mp-map';
      input.value = choice.id;
      input.checked = choice.id === 'all';
      input.addEventListener('change', () => {
        selectedMaps = choice.id === 'all' ? [...MULTIPLAYER.maps] : [choice.id];
      }, { signal });
      const artwork = el('span');
      artwork.innerHTML = mapPreview(choice.id === 'all' ? 'backyard' : choice.id);
      label.append(input, artwork, el('strong', '', choice.name));
      maps.appendChild(label);
    }
    this.content.appendChild(maps);

    const actions = el('div', 'menu-actions');
    this.content.appendChild(actions);
    const startBtn = this.button('Start match', 'btn-primary', () => {
      const finalSetups = playerSetups.slice(0, playerCount).map((s, i) => ({ ...s, name: sanitizePlayerName(s.name, i) }));
      saveMultiplayerSetup(finalSetups);
      this.hide();
      this.callbacks.onStartMultiplayer?.(finalSetups, selectedMaps);
    }, signal, actions);
    this.button('Back', '', () => { this.hide(); this.callbacks.onReturnToMenu(); this.showMainMenu(); }, signal, actions);
    startBtn.focus();
  }

  showMPHandover(player: MPPlayerView, mapName: string, attemptNum: number): void {
    const signal = this.open('handover');
    this.content.appendChild(el('div', 'handover-kicker', 'Pass the cannon to'));
    const name = el('div', 'handover-name', player.name);
    name.style.setProperty('--player-color', cssColor(playerDisplayColor(player.color)));
    this.content.appendChild(name);
    this.content.appendChild(el('p', '', `${mapName} · Shot ${attemptNum}/${MULTIPLAYER.shotsPerRound}`));
    const btn = this.button('Ready now', 'btn-primary', () => { this.hide(); this.callbacks.onMultiplayerHandoverContinue?.(); }, signal);
    const bar = el('div', 'auto-bar');
    bar.style.setProperty('--auto-duration', `${FLOW.handoverSeconds}s`);
    bar.appendChild(el('i'));
    this.content.appendChild(bar);
    this.content.appendChild(el('p', 'auto-note', 'Your turn starts automatically…'));
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

  showMPRoundResult(players: readonly MPPlayerView[], roundIndex: number, roundCount: number = MULTIPLAYER.maps.length): void {
    const signal = this.open('round_result');
    this.content.appendChild(el('h2', '', `Round ${roundIndex + 1} done`));
    const sorted = [...players].sort((a, b) => b.totalScore - a.totalScore);
    this.content.appendChild(this.scoreRows(sorted, p => `+${p.roundScores[roundIndex] ?? 0} this round`));
    const btn = this.button(roundIndex >= roundCount - 1 ? 'Final result' : 'Next round', 'btn-primary', () => { this.hide(); this.callbacks.onMultiplayerNextRound?.(); }, signal);
    const bar = el('div', 'auto-bar');
    bar.style.setProperty('--auto-duration', `${FLOW.roundResultSeconds}s`);
    bar.appendChild(el('i'));
    this.content.appendChild(bar);
    btn.focus();
  }

  showMPMatchResult(winners: readonly MPPlayerView[], players: readonly MPPlayerView[]): void {
    const signal = this.open('match_result');
    this.content.appendChild(el('h1', '', winners.length > 1 ? "It's a tie!" : `${winners[0]?.name ?? 'Nobody'} wins!`));
    const sorted = [...players].sort((a, b) => (b.totalScore === a.totalScore) ? b.bodyHits - a.bodyHits : b.totalScore - a.totalScore);
    this.content.appendChild(this.scoreRows(sorted, p => `${p.bodyHits} hit${p.bodyHits === 1 ? '' : 's'}`, winners));
    this.content.appendChild(el('p', 'quote', '“I want it noted that I was here first.” — Jonh'));
    const actions = el('div', 'result-actions');
    this.content.appendChild(actions);
    const rematch = this.button('Rematch', 'btn-primary', () => { this.hide(); this.callbacks.onMultiplayerRematch?.(); }, signal, actions);
    this.button('Main menu', '', () => { this.hide(); this.callbacks.onReturnToMenu(); this.showMainMenu(); }, signal, actions);
    rematch.focus();
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
      const ribbons = el('div');
      if (extras.newBest) ribbons.appendChild(el('span', 'ribbon', 'New best!'));
      if (hasStyle) ribbons.appendChild(el('span', 'ribbon pow', 'Trick shot!'));
      if (extras.streak && extras.streak >= 2) ribbons.appendChild(el('span', 'ribbon', `${extras.streak} in a row!`));
      if (ribbons.childElementCount) this.content.appendChild(ribbons);
    } else {
      this.content.appendChild(el('p', '', 'Three shots, zero Jonhs. He has resumed reading.'));
    }
    if (extras.quote) this.content.appendChild(el('p', 'quote', `“${extras.quote}”`));
    if (extras.unlockHtml) {
      const unlock = el('div');
      unlock.innerHTML = extras.unlockHtml;
      this.content.appendChild(unlock);
    }
    const actions = el('div', 'result-actions');
    this.content.appendChild(actions);
    const retryBtn = this.button('Retry map', 'btn-retry', () => { this.hide(); this.callbacks.onRetry(); }, signal, actions);
    this.button('Change map', '', () => { this.callbacks.onReturnToMenu(); this.showMapSelect(); }, signal, actions);
    retryBtn.focus();
  }

  showPauseMenu(): void {
    const signal = this.open('pause');
    this.content.appendChild(el('h2', '', 'Paused'));
    this.content.appendChild(el('p', 'quote', '“Oh good. A moment of peace.”'));
    const actions = el('div', 'result-actions');
    this.content.appendChild(actions);
    const resumeBtn = this.button('Resume', 'btn-primary', () => { this.hide(); this.callbacks.onPauseResume?.(); }, signal, actions);
    this.button('Quit to menu', '', () => { this.hide(); this.callbacks.onPauseQuit?.(); }, signal, actions);
    resumeBtn.focus();
  }

  /** Free-form view used by retention screens (locker, daily). */
  showCustom(view: MenuOverlayView, build: (content: HTMLElement, signal: AbortSignal) => void): void {
    const signal = this.open(view);
    build(this.content, signal);
  }

  hide(): void {
    const enteringPlay = this.currentView === 'map_select' || this.currentView === 'multi_setup' || this.currentView === 'daily';
    this.currentView = 'none';
    this.container.style.display = 'none';
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    const reduced = document.documentElement.classList.contains('reduced-motion') ||
      Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);
    if (enteringPlay && !reduced) {
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
