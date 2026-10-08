import { cssColor, playerDisplayColor } from '../art/palette';
import { MULTIPLAYER } from '../config/tuning';
import { MAPS } from '../levels';
import { normalizeRoomCode } from '../rules/roomCode';
import type { SeatState } from '../rules/onlineTypes';
import type { OnlineProfile } from '../storage/storage';
import { mapPreview } from './mapPreview';
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

function radioGroup<T>(legend: string, name: string, values: readonly T[], selected: T,
  render: (value: T, label: HTMLLabelElement) => void, onChange: (value: T) => void, signal: AbortSignal): HTMLFieldSetElement {
  const set = el('fieldset', 'online-picker');
  set.appendChild(el('legend', '', legend));
  values.forEach((value, i) => {
    const label = el('label');
    const input = el('input');
    input.type = 'radio';
    input.name = name;
    input.id = `${name}-${i}`;
    input.checked = value === selected;
    input.addEventListener('change', () => { if (input.checked) onChange(value); }, { signal });
    label.appendChild(input);
    render(value, label);
    set.appendChild(label);
  });
  return set;
}

const MP_MAP_IDS = MULTIPLAYER.maps as readonly string[];

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

    const nameRow = el('div', 'player-setup-row');
    const nameLabel = el('label', '', 'Your name');
    nameLabel.htmlFor = 'online-name';
    const nameInput = el('input');
    nameInput.type = 'text';
    nameInput.id = 'online-name';
    nameInput.maxLength = MULTIPLAYER.maxNameLength;
    nameInput.value = profile.name;
    nameInput.addEventListener('input', () => { profile.name = nameInput.value; }, { signal });
    nameRow.append(nameLabel, nameInput);
    content.appendChild(nameRow);

    const colors = MULTIPLAYER.colors as readonly number[];
    content.appendChild(radioGroup('Cannon colour', 'online-color', colors, profile.color, (color, label) => {
      const swatch = el('span', 'swatch');
      swatch.style.background = cssColor(playerDisplayColor(color));
      label.append(swatch, el('span', 'visually-hidden', `Colour ${colors.indexOf(color) + 1}`));
    }, color => { profile.color = color; }, signal));
    content.appendChild(radioGroup('Cannon pattern', 'online-pattern', MULTIPLAYER.patterns as readonly string[], profile.pattern,
      (pattern, label) => label.append(el('span', '', pattern)), pattern => { profile.pattern = pattern; }, signal));

    const actions = el('div', 'menu-actions');
    content.appendChild(actions);
    const create = button(actions, 'Create room', 'btn-primary', () => o.onCreate({ ...profile }), signal);

    const join = el('div', 'online-join');
    const codeLabel = el('label', 'visually-hidden', 'Room code');
    codeLabel.htmlFor = 'online-code';
    const codeInput = el('input');
    codeInput.type = 'text';
    codeInput.id = 'online-code';
    codeInput.placeholder = 'Room code';
    codeInput.autocomplete = 'off';
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
    content.appendChild(join);
    button(join, 'Join', '', tryJoin, signal);
    content.appendChild(error);
    button(content, 'Back', 'btn-quiet', () => o.onBack(), signal);
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

export function showOnlineLobby(menu: MenuOverlay, o: LobbyOptions): void {
  // Re-rendered on every roster/presence change; keep keyboard focus where it was.
  const focusedId = document.activeElement instanceof HTMLElement ? document.activeElement.id : '';
  menu.showCustom('online_lobby', (content, signal) => {
    const host = o.mySeat === 0;
    content.appendChild(el('h2', '', 'Room code'));
    content.appendChild(el('div', 'room-code', o.code));
    const copy = button(content, 'Copy link', '', () => {
      navigator.clipboard?.writeText(o.link).then(() => { copy.textContent = 'Link copied!'; }, () => { copy.textContent = o.link; });
    }, signal);
    copy.id = 'online-copy';

    const list = el('div', 'score-list');
    for (const seat of o.seats) {
      const row = el('div', 'score-row');
      row.style.setProperty('--player-color', cssColor(playerDisplayColor(seat.color)));
      const on = o.connected.has(seat.seat);
      const dot = el('span', `presence-dot${on ? ' on' : ''}`);
      dot.setAttribute('aria-label', on ? 'connected' : 'not connected');
      const who = el('span');
      const tags = [`${seat.pattern} cannon`, seat.seat === 0 ? 'host' : '', seat.seat === o.mySeat ? 'you' : ''].filter(Boolean).join(' · ');
      who.append(dot, document.createTextNode(seat.name), el('small', '', tags));
      row.append(el('span', 'rank', String(seat.seat + 1)), who);
      list.appendChild(row);
    }
    content.appendChild(list);

    const isTour = o.maps.length === MP_MAP_IDS.length;
    if (host) {
      const maps = el('fieldset', 'mp-map-picker');
      maps.appendChild(el('legend', '', 'Choose your arena'));
      const choices = [{ id: 'all', name: 'Three-garden tour' }, ...MAPS.filter(m => MP_MAP_IDS.includes(m.id))];
      for (const choice of choices) {
        const label = el('label', 'arena-option');
        const input = el('input');
        input.type = 'radio';
        input.name = 'online-map';
        input.id = `online-map-${choice.id}`;
        input.checked = choice.id === 'all' ? isTour : !isTour && o.maps[0] === choice.id;
        input.addEventListener('change', () => o.onMaps(choice.id === 'all' ? [...MP_MAP_IDS] : [choice.id]), { signal });
        const artwork = el('span');
        artwork.innerHTML = mapPreview(choice.id === 'all' ? 'backyard' : choice.id);
        label.append(input, artwork, el('strong', '', choice.name));
        maps.appendChild(label);
      }
      content.appendChild(maps);
    } else {
      const arena = isTour ? 'Three-garden tour' : MAPS.find(m => m.id === o.maps[0])?.name ?? o.maps[0] ?? '';
      content.appendChild(el('p', '', `Arena: ${arena}`));
    }

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
