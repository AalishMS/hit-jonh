import { cannonFigureSvg } from '../art/cannonArt';
import { cssColor, playerDisplayColor } from '../art/palette';
import { MULTIPLAYER } from '../config/tuning';
import { normalizeRoomCode } from '../rules/roomCode';
import type { SeatState } from '../rules/onlineTypes';
import type { OnlineProfile } from '../storage/storage';
import { copyText } from './copyText';
import { mapSetCard, mapSetPicker } from './mapSetPicker';
import type { MenuOverlay } from './menuOverlay';

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
};

function button(parent: HTMLElement, label: string, className: string, onClick: () => void, signal: AbortSignal): HTMLButtonElement {
  const b = el('button', `btn ${className}`.trim(), label);
  b.type = 'button';
  b.addEventListener('click', onClick, { signal });
  parent.appendChild(b);
  return b;
}

/** A row of chip-style radios; the native input stays inside each label for keyboard and screen readers. */
function radioGroup<T>(legend: string, name: string, values: readonly T[], selected: T,
  render: (value: T, label: HTMLLabelElement) => void, onChange: (value: T) => void, signal: AbortSignal): HTMLFieldSetElement {
  const set = el('fieldset', 'online-picker');
  set.appendChild(el('legend', '', legend));
  const options = el('div', 'online-picker-options');
  values.forEach((value, i) => {
    const label = el('label', 'picker-chip');
    const input = el('input');
    input.type = 'radio';
    input.name = name;
    input.id = `${name}-${i}`;
    input.checked = value === selected;
    input.addEventListener('change', () => { if (input.checked) onChange(value); }, { signal });
    label.appendChild(input);
    render(value, label);
    options.appendChild(label);
  });
  set.appendChild(options);
  return set;
}

export interface OnlineSetupOptions {
  profile: OnlineProfile;
  code: string;
  error: string | null;
  onCreate(profile: OnlineProfile): void;
  onJoin(profile: OnlineProfile, code: string): void;
  onBack(): void;
}

export function showOnlineSetup(menu: MenuOverlay, o: OnlineSetupOptions): void {
  menu.showCustom('online_setup', (content, signal) => {
    const profile: OnlineProfile = { ...o.profile };
    content.appendChild(el('h2', '', 'Play online'));
    content.appendChild(el('p', '', 'Make a room and send friends the code, or join theirs.'));

    // Left: a live preview of the cannon as the others will see it. Right: name, colour and pattern.
    const card = el('div', 'online-profile');
    const stage = el('div', 'cannon-stage');
    const figure = el('div', 'cannon-stage-figure');
    const caption = el('div', 'cannon-stage-name');
    stage.append(figure, caption);
    const fields = el('div', 'online-profile-fields');
    card.append(stage, fields);
    content.appendChild(card);
    const refreshPreview = (): void => {
      figure.innerHTML = cannonFigureSvg(profile.color, profile.pattern);
      caption.textContent = profile.name.trim() || 'Your cannon';
      stage.style.setProperty('--player-color', cssColor(playerDisplayColor(profile.color)));
    };

    const nameField = el('div', 'online-field');
    const nameLabel = el('label', 'online-field-label', 'Your name');
    nameLabel.htmlFor = 'online-name';
    const nameInput = el('input', 'online-input');
    nameInput.type = 'text';
    nameInput.id = 'online-name';
    nameInput.maxLength = MULTIPLAYER.maxNameLength;
    nameInput.value = profile.name;
    nameInput.addEventListener('input', () => { profile.name = nameInput.value; refreshPreview(); }, { signal });
    nameField.append(nameLabel, nameInput);
    fields.appendChild(nameField);

    const colors = MULTIPLAYER.colors as readonly number[];
    fields.appendChild(radioGroup('Cannon colour', 'online-color', colors, profile.color, (color, label) => {
      label.classList.add('color-chip');
      const swatch = el('span', 'swatch');
      swatch.style.background = cssColor(playerDisplayColor(color));
      label.append(swatch, el('span', 'visually-hidden', `Colour ${colors.indexOf(color) + 1}`));
    }, color => { profile.color = color; refreshPreview(); }, signal));
    fields.appendChild(radioGroup('Cannon pattern', 'online-pattern', MULTIPLAYER.patterns as readonly string[], profile.pattern,
      (pattern, label) => label.append(el('span', '', pattern)), pattern => { profile.pattern = pattern; refreshPreview(); }, signal));
    refreshPreview();

    const actions = el('div', 'online-actions');
    content.appendChild(actions);
    const create = button(actions, 'Create room', 'btn-primary', () => o.onCreate({ ...profile }), signal);
    actions.appendChild(el('span', 'online-or', 'or'));

    const join = el('div', 'online-join');
    const codeLabel = el('label', 'visually-hidden', 'Room code');
    codeLabel.htmlFor = 'online-code';
    const codeInput = el('input', 'online-input');
    codeInput.type = 'text';
    codeInput.id = 'online-code';
    codeInput.placeholder = 'Room code';
    codeInput.autocomplete = 'off';
    codeInput.spellcheck = false;
    codeInput.maxLength = 12;
    codeInput.value = o.code;
    const error = el('p', 'online-error', o.error ?? '');
    error.setAttribute('role', 'alert');
    // Typed codes are normalised (case, spaces, dashes, look-alikes) or rejected here, before any server call.
    const tryJoin = (): void => {
      const normalized = normalizeRoomCode(codeInput.value);
      if (!normalized) { error.textContent = "That doesn't look like a room code."; codeInput.focus(); return; }
      error.textContent = '';
      o.onJoin({ ...profile }, normalized);
    };
    codeInput.addEventListener('keydown', e => { if (e.key === 'Enter') tryJoin(); }, { signal });
    join.append(codeLabel, codeInput);
    actions.appendChild(join);
    button(join, 'Join', '', tryJoin, signal);
    content.appendChild(error);
    const footer = el('div', 'menu-actions');
    content.appendChild(footer);
    button(footer, 'Back', '', () => o.onBack(), signal);
    (o.code ? codeInput : create).focus();
  });
}

export interface LobbyOptions {
  code: string;
  link: string;
  seats: readonly SeatState[];
  connected: ReadonlySet<number>;
  mySeat: number;
  maps: readonly string[];
  error: string | null;
  onMaps(maps: string[]): void;
  onStart(): void;
  onLeave(): void;
}

/** The room link last shown as text because copying failed; it stays visible across lobby re-renders. */
let revealedLink: string | null = null;

export function showOnlineLobby(menu: MenuOverlay, o: LobbyOptions): void {
  // Re-rendered on every roster/presence change; keep keyboard focus where it was.
  const focusedId = document.activeElement instanceof HTMLElement ? document.activeElement.id : '';
  menu.showCustom('online_lobby', (content, signal) => {
    const host = o.mySeat === 0;
    content.appendChild(el('h2', '', 'Room code'));
    const codeRow = el('div', 'room-code-row');
    const codeText = el('div', 'room-code', o.code);
    codeText.setAttribute('aria-label', `Room code ${o.code.split('').join(' ')}`);
    codeRow.appendChild(codeText);
    content.appendChild(codeRow);
    // Without the Clipboard API (non-secure http:// origins, e.g. a LAN address) the link is shown selected instead.
    const linkRow = el('label', 'online-link');
    linkRow.htmlFor = 'online-link';
    const linkInput = el('input', 'online-input');
    linkInput.type = 'text';
    linkInput.id = 'online-link';
    linkInput.readOnly = true;
    linkInput.value = o.link;
    linkRow.append(el('span', '', 'Copy this link'), linkInput);
    linkRow.hidden = revealedLink !== o.link;
    linkInput.addEventListener('focus', () => linkInput.select(), { signal });
    const copy = button(codeRow, 'Copy link', '', () => {
      void copyText(o.link, typeof navigator === 'undefined' ? undefined : navigator.clipboard).then(copied => {
        if (!copied) revealedLink = o.link; // later re-renders keep showing it
        if (signal.aborted) return; // this render was replaced or left meanwhile
        if (copied) { copy.textContent = 'Link copied!'; return; }
        linkRow.hidden = false;
        linkInput.focus();
        linkInput.select();
      });
    }, signal);
    copy.id = 'online-copy';
    content.appendChild(linkRow);

    const list = el('div', 'score-list lobby-list');
    for (const seat of o.seats) {
      const row = el('div', 'score-row');
      row.style.setProperty('--player-color', cssColor(playerDisplayColor(seat.color)));
      const on = o.connected.has(seat.seat);
      const dot = el('span', `presence-dot${on ? ' on' : ''}`);
      dot.setAttribute('aria-label', on ? 'connected' : 'not connected');
      const who = el('span');
      const tags = [`${seat.pattern} cannon`, seat.seat === 0 ? 'host' : '', seat.seat === o.mySeat ? 'you' : ''].filter(Boolean).join(' · ');
      who.append(dot, document.createTextNode(seat.name), el('small', '', tags));
      const cannon = el('span', 'lobby-cannon');
      cannon.innerHTML = cannonFigureSvg(seat.color, seat.pattern);
      row.append(el('span', 'rank', String(seat.seat + 1)), who, cannon);
      list.appendChild(row);
    }
    const open = MULTIPLAYER.maxPlayers - o.seats.length;
    if (open > 0) {
      const row = el('div', 'score-row empty-seat');
      row.append(el('span', 'rank', '+'), el('span', '', `${open} open seat${open === 1 ? '' : 's'} · send friends the code`));
      list.appendChild(row);
    }
    content.appendChild(list);

    // Guests see the host's pick read-only; the host's ticks go straight to the room.
    content.appendChild(host
      ? mapSetPicker({ idPrefix: 'online', selected: o.maps, onChange: maps => o.onMaps(maps), signal })
      : mapSetCard(o.maps));

    const error = el('p', 'online-error', o.error ?? '');
    error.setAttribute('role', 'alert');
    content.appendChild(error);

    const actions = el('div', 'menu-actions');
    content.appendChild(actions);
    if (host) {
      const start = button(actions, 'Start match', 'btn-primary', () => o.onStart(), signal);
      start.id = 'online-start';
      start.disabled = o.seats.length < MULTIPLAYER.minPlayers;
    } else {
      actions.appendChild(el('p', 'auto-note', 'Waiting for host…'));
    }
    button(actions, 'Leave', '', () => o.onLeave(), signal).id = 'online-leave';
    if (host && o.seats.length < MULTIPLAYER.minPlayers) {
      content.appendChild(el('p', 'auto-note', `You need at least ${MULTIPLAYER.minPlayers} players to start.`));
    }

    const again = focusedId ? content.querySelector<HTMLElement>(`#${CSS.escape(focusedId)}`) : null;
    (again ?? content.querySelector<HTMLElement>('button:not(:disabled)'))?.focus();
  });
}

export function showOnlineNotice(menu: MenuOverlay, message: string, onOk: () => void): void {
  menu.showCustom('online_notice', (content, signal) => {
    content.appendChild(el('h2', '', message));
    button(content, 'OK', 'btn-primary', onOk, signal).focus();
  });
}
