// src/ui/friendsBoardScreens.ts — the Daily Bonk friends-board screens (SPEC §6.2): the hub (my boards, create,
// join), joining from a link, and the live board. DOM only; the controller (scenes/friendsBoardController.ts)
// decides what to show. Every re-render keeps keyboard focus on the element that had it (by id).
import { MULTIPLAYER } from '../config/tuning';
import {
  isTrickRun, ordinal, resultSymbols, resultWords, starText, type BoardDay, type RankedRow,
} from '../rules/friendsBoard';
import { normalizeRoomCode } from '../rules/roomCode';
import type { MenuOverlay } from './menuOverlay';
import { shareOrCopy } from './share';
import './friendsBoard.css';

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
};

function button(parent: HTMLElement, label: string, className: string, onClick: () => void, signal: AbortSignal, id = ''): HTMLButtonElement {
  const b = el('button', `btn ${className}`.trim(), label);
  b.type = 'button';
  if (id) b.id = id;
  b.addEventListener('click', onClick, { signal });
  parent.appendChild(b);
  return b;
}

/** The id of the focused element, so a re-render can put focus back. */
const focusedId = (): string => (document.activeElement instanceof HTMLElement ? document.activeElement.id : '');

function restoreFocus(content: HTMLElement, id: string, fallback: HTMLElement | null): void {
  const again = id ? content.querySelector<HTMLElement>(`#${CSS.escape(id)}`) : null;
  const target = again && !(again as HTMLButtonElement).disabled ? again : fallback;
  target?.focus();
  // A text box rebuilt under the player's fingers keeps the caret at the end of what they typed.
  if (target instanceof HTMLInputElement && target === again && !target.readOnly) target.setSelectionRange(target.value.length, target.value.length);
}

function nameField(value: string, signal: AbortSignal, onInput: (name: string) => void): { field: HTMLElement; input: HTMLInputElement } {
  const field = el('div', 'online-field board-name-field');
  const label = el('label', 'online-field-label', 'Your name on boards');
  label.htmlFor = 'board-name';
  const input = el('input', 'online-input');
  input.type = 'text';
  input.id = 'board-name';
  input.maxLength = MULTIPLAYER.maxNameLength;
  input.autocomplete = 'off';
  input.value = value;
  input.addEventListener('input', () => onInput(input.value), { signal });
  field.append(label, input);
  return { field, input };
}

function codeChip(code: string): HTMLElement {
  const chip = el('div', 'room-code board-code', code);
  chip.setAttribute('aria-label', `Board code ${code.split('').join(' ')}`);
  return chip;
}

const error = (text: string | null): HTMLElement => {
  const p = el('p', 'online-error', text ?? '');
  p.setAttribute('role', 'alert');
  return p;
};

// ---------- Hub ----------

export interface BoardHubOptions {
  name: string;
  /** My boards; `memberCount` is null until the server answers. */
  boards: ReadonlyArray<{ code: string; memberCount: number | null }>;
  /** The join box's text (kept across re-renders). */
  code: string;
  busy: 'create' | 'join' | null;
  error: string | null;
  canCreate: boolean;
  /** Typing is reported as it happens, so a live re-render (the board list arriving) never wipes it. */
  onNameInput(name: string): void;
  onCodeInput(code: string): void;
  onCreate(name: string): void;
  onJoin(name: string, code: string): void;
  onOpen(code: string): void;
  onBack(): void;
}

export function showBoardHub(menu: MenuOverlay, o: BoardHubOptions): void {
  const focused = focusedId();
  menu.showCustom('board_hub', (content, signal) => {
    let name = o.name;
    let typed = o.code;
    content.appendChild(el('h2', '', 'Friends board'));
    content.appendChild(el('p', '', "Compare today's Daily Bonk with friends. Make a board and send them the code, or join theirs. Only people with the code can find it."));
    let firstBoard: HTMLButtonElement | null = null;
    if (o.boards.length > 0) {
      const list = el('div', 'board-hub-list');
      list.setAttribute('role', 'list');
      list.setAttribute('aria-label', 'Your boards');
      for (const board of o.boards) {
        const item = el('div');
        item.setAttribute('role', 'listitem');
        const count = board.memberCount === null ? '' : ` · ${board.memberCount} ${board.memberCount === 1 ? 'friend' : 'friends'}`;
        const open = button(item, '', 'board-hub-item', () => o.onOpen(board.code), signal, `board-open-${board.code}`);
        open.append(el('span', 'board-hub-code', board.code), el('small', '', `Board${count}`), el('span', 'mode-go', '›'));
        open.setAttribute('aria-label', `Open board ${board.code.split('').join(' ')}${count.replace(' · ', ', ')}`);
        firstBoard ??= open;
        list.appendChild(item);
      }
      content.appendChild(list);
    }
    const { field, input: nameInput } = nameField(name, signal, value => { name = value; o.onNameInput(value); });
    content.appendChild(field);

    const actions = el('div', 'online-actions board-hub-actions');
    content.appendChild(actions);
    const create = button(actions, o.busy === 'create' ? 'Creating…' : 'Create board', 'btn-primary', () => o.onCreate(name), signal, 'board-create');
    create.disabled = o.busy !== null || !o.canCreate;
    actions.appendChild(el('span', 'online-or', 'or'));
    const join = el('div', 'online-join');
    const codeLabel = el('label', 'visually-hidden', 'Board code');
    codeLabel.htmlFor = 'board-code-input';
    const codeInput = el('input', 'online-input');
    codeInput.type = 'text';
    codeInput.id = 'board-code-input';
    codeInput.placeholder = 'Board code';
    codeInput.autocomplete = 'off';
    codeInput.spellcheck = false;
    codeInput.maxLength = 12;
    codeInput.value = typed;
    codeInput.addEventListener('input', () => { typed = codeInput.value; o.onCodeInput(typed); }, { signal });
    const problem = error(o.error);
    const tryJoin = (): void => {
      const code = normalizeRoomCode(codeInput.value);
      if (!code) { problem.textContent = 'Board codes are 5 letters and numbers, like K7QPX.'; codeInput.focus(); return; }
      problem.textContent = '';
      o.onJoin(name, code);
    };
    codeInput.addEventListener('keydown', e => { if (e.key === 'Enter' && o.busy === null) tryJoin(); }, { signal });
    nameInput.addEventListener('keydown', e => { if (e.key === 'Enter' && o.busy === null && !typed && o.canCreate) o.onCreate(name); }, { signal });
    join.append(codeLabel, codeInput);
    actions.appendChild(join);
    button(join, o.busy === 'join' ? 'Joining…' : 'Join', '', tryJoin, signal, 'board-join').disabled = o.busy !== null;
    content.appendChild(problem);
    if (!o.canCreate) content.appendChild(el('p', 'auto-note', 'You are on as many boards as one browser may join. Leave one to make another.'));
    const footer = el('div', 'menu-actions');
    content.appendChild(footer);
    button(footer, 'Back', '', () => o.onBack(), signal, 'board-back');
    restoreFocus(content, focused, firstBoard ?? (o.code ? codeInput : create.disabled ? codeInput : create));
  });
}

// ---------- Join from a link ----------

export interface BoardJoinOptions {
  code: string;
  /** null while loading. */
  memberCount: number | null;
  full: boolean;
  name: string;
  busy: boolean;
  error: string | null;
  /** As on the hub: typing survives live re-renders (member count changes). */
  onNameInput(name: string): void;
  onJoin(name: string): void;
  onCancel(): void;
}

export function showBoardJoin(menu: MenuOverlay, o: BoardJoinOptions): void {
  const focused = focusedId();
  menu.showCustom('board_join', (content, signal) => {
    let name = o.name;
    content.appendChild(el('h2', '', 'Join this board?'));
    const row = el('div', 'room-code-row');
    row.appendChild(codeChip(o.code));
    content.appendChild(row);
    const n = o.memberCount;
    content.appendChild(el('p', '', n === null ? 'Looking up the board…'
      : o.full ? 'This board is full.'
        : `${n} ${n === 1 ? 'friend compares' : 'friends compare'} their Daily Bonk here. Your result shows once you've played today.`));
    const { field, input } = nameField(name, signal, value => { name = value; o.onNameInput(value); });
    content.appendChild(field);
    input.addEventListener('keydown', e => { if (e.key === 'Enter' && !o.busy && !o.full) o.onJoin(name); }, { signal });
    content.appendChild(error(o.error));
    const actions = el('div', 'menu-actions');
    content.appendChild(actions);
    const join = button(actions, o.busy ? 'Joining…' : 'Join board', 'btn-primary', () => o.onJoin(name), signal, 'board-join-confirm');
    join.disabled = o.busy || o.full || n === null;
    button(actions, 'Not now', '', () => o.onCancel(), signal, 'board-join-cancel');
    restoreFocus(content, focused, join.disabled ? input : join);
  });
}

// ---------- The board ----------

export interface BoardViewOptions {
  code: string;
  link: string;
  inviteText: string;
  tab: BoardDay;
  /** "25 Nov" for today and yesterday. */
  dayLabels: Record<BoardDay, string>;
  /** null while the first snapshot is loading. */
  rows: readonly RankedRow[] | null;
  /** The live subscription failed (offline, server down): keep showing what we had. */
  offline: boolean;
  summary: string;
  playedToday: boolean;
  memberCount: number;
  maxMembers: number;
  confirmLeave: boolean;
  leaving: boolean;
  error: string | null;
  onTab(tab: BoardDay): void;
  onPlay(): void;
  onLeave(): void;
  onConfirmLeave(): void;
  onCancelLeave(): void;
  onBoards(): void;
  onBack(): void;
}

/** The invite link last shown as text because sharing and copying failed; it stays visible across re-renders. */
let revealedLink: string | null = null;

function boardRow(row: RankedRow): HTMLElement {
  const li = el('li', `board-row${row.member.mine ? ' is-me' : ''}${row.result ? '' : ' is-waiting'}`);
  const r = row.result;
  const words = [row.rank !== null ? ordinal(row.rank) : null, row.member.name, row.member.mine ? '(you)' : null,
    r ? resultWords(r) : 'not played yet', r && r.streak >= 2 ? `${r.streak}-day streak` : null].filter(Boolean).join(', ');
  const spoken = el('span', 'visually-hidden', words);
  const rank = el('span', 'board-rank', row.rank !== null ? String(row.rank) : '–');
  const who = el('span', 'board-who');
  const name = el('span', 'board-name', row.member.name);
  who.appendChild(name);
  if (row.member.mine) who.appendChild(el('span', 'board-you', 'you'));
  const detail = el('small', 'board-detail');
  if (r) {
    detail.appendChild(el('span', 'board-shots', resultSymbols(r)));
    if (isTrickRun(r.shots)) detail.appendChild(el('span', 'board-trick', 'Trick'));
    if (r.streak >= 2) detail.appendChild(el('span', 'board-streak', `🔥 ${r.streak}`));
  } else {
    detail.textContent = 'Not played yet';
  }
  who.appendChild(detail);
  const stars = el('span', `board-stars${r && r.stars === 0 ? ' is-zero' : ''}`, r ? starText(r.stars) : '');
  for (const part of [rank, who, stars]) part.setAttribute('aria-hidden', 'true');
  li.append(spoken, rank, who, stars);
  return li;
}

export function showBoardView(menu: MenuOverlay, o: BoardViewOptions): void {
  const focused = focusedId();
  menu.showCustom('board_view', (content, signal) => {
    content.appendChild(el('h2', '', 'Friends board'));
    const head = el('div', 'room-code-row board-head');
    head.appendChild(codeChip(o.code));
    const invite = button(head, 'Invite friends', '', () => {
      void shareOrCopy(o.inviteText).then(outcome => {
        if (outcome === 'failed') revealedLink = o.link;
        if (signal.aborted) return;
        if (outcome === 'copied') { inviteStatus.textContent = 'Link copied! Send it to your friends.'; return; }
        if (outcome === 'shared') { inviteStatus.textContent = 'Shared.'; return; }
        if (outcome === 'failed') { linkRow.hidden = false; linkInput.focus(); linkInput.select(); inviteStatus.textContent = 'Copy the link above.'; }
      });
    }, signal, 'board-invite');
    invite.setAttribute('aria-describedby', 'board-invite-status');
    content.appendChild(head);
    const linkRow = el('label', 'online-link');
    linkRow.htmlFor = 'board-link';
    const linkInput = el('input', 'online-input');
    linkInput.type = 'text';
    linkInput.id = 'board-link';
    linkInput.readOnly = true;
    linkInput.value = o.link;
    linkInput.addEventListener('focus', () => linkInput.select(), { signal });
    linkRow.append(el('span', '', 'Copy this link'), linkInput);
    linkRow.hidden = revealedLink !== o.link;
    content.appendChild(linkRow);
    const inviteStatus = el('p', 'share-status board-invite-status');
    inviteStatus.id = 'board-invite-status';
    inviteStatus.setAttribute('role', 'status');
    content.appendChild(inviteStatus);

    // Today / Yesterday: two toggle buttons (aria-pressed), so arrow-free keyboard use and 44 px targets.
    const tabs = el('div', 'board-tabs');
    tabs.setAttribute('role', 'group');
    tabs.setAttribute('aria-label', 'Which day');
    for (const tab of ['today', 'yesterday'] as const) {
      const label = `${tab === 'today' ? 'Today' : 'Yesterday'} · ${o.dayLabels[tab]}`;
      const b = button(tabs, label, `board-tab${o.tab === tab ? ' is-on' : ''}`, () => o.onTab(tab), signal, `board-tab-${tab}`);
      b.setAttribute('aria-pressed', String(o.tab === tab));
    }
    content.appendChild(tabs);

    const status = el('p', `board-summary${o.offline ? ' is-offline' : ''}`,
      o.offline ? "Can't reach the board right now. It will catch up when you're back online." : o.summary);
    content.appendChild(status);

    let primary: HTMLButtonElement | null = null;
    if (o.rows) {
      const list = el('ol', 'board-list');
      list.setAttribute('aria-label', `${o.tab === 'today' ? 'Today' : 'Yesterday'}, ${o.dayLabels[o.tab]}`);
      for (const row of o.rows) list.appendChild(boardRow(row));
      content.appendChild(list);
      if (o.memberCount < o.maxMembers && o.memberCount <= 1) {
        content.appendChild(el('p', 'auto-note', "It's just you so far. Invite friends with the code or the link."));
      }
    } else if (!o.offline) {
      content.appendChild(el('p', 'auto-note', 'Loading the board…'));
    }

    const actions = el('div', 'result-actions board-actions');
    content.appendChild(actions);
    if (!o.playedToday) primary = button(actions, "Play today's Daily", 'btn-primary', () => o.onPlay(), signal, 'board-play');
    button(actions, 'All boards', '', () => o.onBoards(), signal, 'board-all');
    button(actions, 'Back', '', () => o.onBack(), signal, 'board-back');

    content.appendChild(error(o.error));
    const leaveRow = el('div', 'board-leave');
    if (o.confirmLeave) {
      leaveRow.appendChild(el('p', '', `Leave board ${o.code}? You'll drop off it, and you can rejoin with the code.`));
      const yes = button(leaveRow, o.leaving ? 'Leaving…' : 'Leave', 'btn-danger', () => o.onConfirmLeave(), signal, 'board-leave-confirm');
      yes.disabled = o.leaving;
      button(leaveRow, 'Stay', '', () => o.onCancelLeave(), signal, 'board-leave-cancel');
    } else {
      button(leaveRow, 'Leave board', 'btn-quiet', () => o.onLeave(), signal, 'board-leave');
    }
    content.appendChild(leaveRow);
    content.appendChild(el('p', 'home-note', `Results are self-reported. Up to ${o.maxMembers} friends per board.`));

    const fallback = o.confirmLeave ? content.querySelector<HTMLElement>('#board-leave-cancel') : primary ?? invite;
    restoreFocus(content, o.confirmLeave && focused === 'board-leave' ? 'board-leave-cancel' : focused, fallback);
  });
}
