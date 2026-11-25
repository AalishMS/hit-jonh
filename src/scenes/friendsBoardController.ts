// src/scenes/friendsBoardController.ts — Daily Bonk friends boards (SPEC §6.2): glue between the board screens,
// this browser's board identity and the server. Posting is offline-first: a counted Daily run is posted in the
// background and retried later when that fails; nothing here ever blocks or delays the Daily itself.
import { FRIENDS_BOARD } from '../config/tuning';
import { getConvexClient } from '../net/convexClient';
import { ConvexBoardBackend, type BoardBackend } from '../net/friendsBoardClient';
import { errorCode } from '../net/retry';
import {
  BOARD_LINK_PARAM, boardDayLabel, boardInviteText, boardSummary, dayNumber, newlyPosted, pendingBoardPosts, rankBoard,
  resultWords, sanitizeBoardName, type BoardDay, type BoardMemberView, type BoardSnapshot, type MyBoardEntry,
} from '../rules/friendsBoard';
import { dateKey, type Progress } from '../rules/progression';
import { normalizeRoomCode } from '../rules/roomCode';
import { localBoardStore, withPosted, type BoardStore } from '../storage/friendsBoardStore';
import { announce } from '../ui/announcer';
import {
  showBoardHub, showBoardJoin, showBoardView, type BoardHubOptions, type BoardJoinOptions, type BoardViewOptions,
} from '../ui/friendsBoardScreens';
import type { MenuOverlay } from '../ui/menuOverlay';

export interface FriendsBoardHooks {
  /** The current progress (the counted Daily runs live in `daily` / `dailyShots`). */
  progress(): Progress;
  /** Start today's Daily Bonk. */
  playDaily(): void;
  /** Leave the board screens (back to the Daily Bonk screen). */
  back(): void;
  /** The name to offer (the online profile's) and where a typed one is saved. */
  loadName(): string;
  saveName(name: string): void;
}

/** The DOM screens; tests pass fakes. */
export interface BoardScreens {
  hub(menu: MenuOverlay, o: BoardHubOptions): void;
  join(menu: MenuOverlay, o: BoardJoinOptions): void;
  board(menu: MenuOverlay, o: BoardViewOptions): void;
  announce(text: string): void;
}

const DOM_SCREENS: BoardScreens = { hub: showBoardHub, join: showBoardJoin, board: showBoardView, announce };

export interface FriendsBoardDeps {
  makeBackend(token: string): BoardBackend | null;
  screens: BoardScreens;
  store: BoardStore;
  now(): Date;
  /** The `?board=CODE` link friends open. */
  linkFor(code: string): string;
  setTimer(fn: () => void, ms: number): ReturnType<typeof setTimeout>;
  clearTimer(id: ReturnType<typeof setTimeout>): void;
}

function defaultLink(code: string): string {
  const url = new URL(window.location.href);
  url.search = '';
  url.hash = '';
  url.searchParams.set(BOARD_LINK_PARAM, code);
  return url.toString();
}

const DEFAULT_DEPS: Omit<FriendsBoardDeps, 'store'> = {
  makeBackend: token => { const client = getConvexClient(); return client ? new ConvexBoardBackend(client, token) : null; },
  screens: DOM_SCREENS,
  now: () => new Date(),
  linkFor: defaultLink,
  setTimer: (fn, ms) => setTimeout(fn, ms),
  clearTimer: id => clearTimeout(id),
};

const OFFLINE = "Couldn't reach the server. Check your connection and try again.";
const ERRORS: Partial<Record<string, string>> = {
  NOT_FOUND: 'No board with that code.',
  FULL: `That board is full (${FRIENDS_BOARD.maxMembers} friends).`,
  TOO_MANY_BOARDS: `You're on ${FRIENDS_BOARD.maxBoardsPerPlayer} boards already. Leave one first.`,
  RATE_LIMITED: 'Easy there! Try again in a few seconds.',
};
const message = (error: unknown): string => ERRORS[errorCode(error) ?? ''] ?? OFFLINE;

type Screen =
  | { kind: 'hub'; code: string; busy: 'create' | 'join' | null; error: string | null; boards: MyBoardEntry[] | null }
  | {
    kind: 'board'; code: string; day: number; tab: BoardDay; snapshot: BoardSnapshot | null | undefined; offline: boolean;
    joining: boolean; confirmLeave: boolean; leaving: boolean; error: string | null; announced: boolean;
  };

export class FriendsBoardController {
  private readonly deps: FriendsBoardDeps;
  private backend: BoardBackend | null = null;
  private screen: Screen | null = null;
  /** Bumped on every screen change; a late reply or snapshot only acts while its screen is still on show. */
  private screenId = 0;
  private unsubscribe: (() => void) | null = null;
  private name: string;
  private syncing = false;
  private resync = false;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private retryAttempt = 0;
  private readonly onOnline = () => { void this.syncPosts(); };

  constructor(private readonly menu: MenuOverlay, private readonly hooks: FriendsBoardHooks, deps: Partial<FriendsBoardDeps> = {}) {
    this.deps = { ...DEFAULT_DEPS, store: deps.store ?? localBoardStore(), ...deps };
    this.name = hooks.loadName();
    if (typeof window !== 'undefined') window.addEventListener('online', this.onOnline);
  }

  /** Entry from the Daily screen or the Daily result card: straight to my last board, else the hub. */
  open(): void {
    const data = this.deps.store.load();
    const last = data.lastBoard && data.boards.includes(data.lastBoard) ? data.lastBoard : data.boards.length === 1 ? data.boards[0]! : null;
    if (last) this.openBoard(last);
    else this.showHub();
    void this.syncPosts();
  }

  /** `?board=CODE`: open that board (its snapshot decides between the board and "Join this board?"). */
  openFromLink(raw: string): void {
    const code = normalizeRoomCode(raw);
    if (!code) { this.showHub('That link has no valid board code.'); return; }
    this.openBoard(code);
    void this.syncPosts();
  }

  destroy(): void {
    this.stopWatching();
    if (this.retryTimer !== null) this.deps.clearTimer(this.retryTimer);
    this.retryTimer = null;
    if (typeof window !== 'undefined') window.removeEventListener('online', this.onOnline);
    this.screen = null;
  }

  // ---------- Posting (offline-first) ----------

  /**
   * Posts today's and yesterday's counted Daily runs that the server doesn't have yet. Safe to call any time:
   * it does nothing without a board or a pending run, never runs twice at once, and never throws.
   */
  async syncPosts(): Promise<void> {
    if (this.syncing) { this.resync = true; return; }
    const data = this.deps.store.load();
    if (data.boards.length === 0) return;
    const progress = this.hooks.progress();
    const pending = pendingBoardPosts(progress.daily, progress.dailyShots, dateKey(this.deps.now()), data.posted);
    if (pending.length === 0) return;
    const backend = this.ensureBackend();
    if (!backend) return;
    this.syncing = true;
    let retry = false;
    try {
      for (const post of pending) {
        try {
          await backend.postResult({ day: post.day, stars: post.stars, shots: post.shots, streak: post.streak });
          this.markPosted(post.key);
        } catch (error) {
          const code = errorCode(error) as string | null;
          // Not in any board on the server (left elsewhere, or cleaned up): stop; joining a board posts again.
          if (code === 'NOT_MEMBER') break;
          if (code === null || code === 'RATE_LIMITED') { retry = true; break; }
          this.markPosted(post.key); // BAD_DAY / INVALID_RESULT: final, never retried
        }
      }
    } finally {
      this.syncing = false;
    }
    if (retry) this.scheduleRetry();
    else this.retryAttempt = 0;
    if (this.resync) { this.resync = false; await this.syncPosts(); }
  }

  private markPosted(key: string): void {
    this.deps.store.save(withPosted(this.deps.store.load(), key));
  }

  private scheduleRetry(): void {
    if (this.retryTimer !== null) return;
    const delays = FRIENDS_BOARD.retryDelaysSeconds;
    const seconds = delays[Math.min(this.retryAttempt, delays.length - 1)]!;
    this.retryAttempt++;
    this.retryTimer = this.deps.setTimer(() => { this.retryTimer = null; void this.syncPosts(); }, seconds * 1000);
  }

  private ensureBackend(): BoardBackend | null {
    this.backend ??= this.deps.makeBackend(this.deps.store.load().token);
    return this.backend;
  }

  // ---------- Membership list ----------

  private remember(code: string): void {
    const data = this.deps.store.load();
    this.deps.store.save({ ...data, boards: data.boards.includes(code) ? data.boards : [...data.boards, code], lastBoard: code });
  }

  private forget(code: string): void {
    const data = this.deps.store.load();
    this.deps.store.save({ ...data, boards: data.boards.filter(c => c !== code), lastBoard: data.lastBoard === code ? null : data.lastBoard });
  }

  private useName(raw: string): string {
    const name = sanitizeBoardName(raw);
    this.name = name;
    this.hooks.saveName(name);
    return name;
  }

  // ---------- Hub ----------

  private showHub(error: string | null = null, code = ''): void {
    this.stopWatching();
    const id = ++this.screenId;
    this.screen = { kind: 'hub', code, busy: null, error, boards: null };
    this.render();
    const backend = this.ensureBackend();
    if (!backend) return;
    backend.myBoards().then(list => {
      // The server is the truth about membership (a board left in another tab, or cleaned up).
      const data = this.deps.store.load();
      const codes = list.map(b => b.code);
      this.deps.store.save({ ...data, boards: codes, lastBoard: data.lastBoard && codes.includes(data.lastBoard) ? data.lastBoard : null });
      if (id !== this.screenId || this.screen?.kind !== 'hub') return;
      this.screen.boards = list;
      this.render();
    }, () => { /* offline: the hub shows the boards this browser remembers */ });
  }

  private async create(rawName: string): Promise<void> {
    const screen = this.screen;
    if (screen?.kind !== 'hub' || screen.busy) return;
    const backend = this.ensureBackend();
    if (!backend) return;
    const name = this.useName(rawName);
    const id = this.screenId;
    screen.busy = 'create';
    screen.error = null;
    this.render();
    let code: string;
    try {
      code = await backend.createBoard(name);
    } catch (error) {
      if (id !== this.screenId) return;
      screen.busy = null;
      screen.error = message(error);
      this.render();
      return;
    }
    this.remember(code);
    void this.syncPosts();
    if (id === this.screenId) this.openBoard(code);
  }

  private async joinFromHub(rawName: string, code: string): Promise<void> {
    const screen = this.screen;
    if (screen?.kind !== 'hub' || screen.busy) return;
    const backend = this.ensureBackend();
    if (!backend) return;
    const name = this.useName(rawName);
    const id = this.screenId;
    screen.busy = 'join';
    screen.error = null;
    screen.code = code;
    this.render();
    try {
      await backend.joinBoard(code, name);
    } catch (error) {
      if (id !== this.screenId) return;
      screen.busy = null;
      screen.error = message(error);
      this.render();
      return;
    }
    this.remember(code);
    void this.syncPosts();
    if (id === this.screenId) this.openBoard(code);
  }

  // ---------- A board ----------

  private openBoard(code: string): void {
    this.stopWatching();
    const id = ++this.screenId;
    const day = dayNumber(dateKey(this.deps.now()))!;
    this.screen = { kind: 'board', code, day, tab: 'today', snapshot: undefined, offline: false, joining: false, confirmLeave: false, leaving: false, error: null, announced: false };
    const backend = this.ensureBackend();
    if (!backend) { this.screen.offline = true; this.render(); return; }
    this.render();
    try {
      this.unsubscribe = backend.watchBoard(code, day,
        snapshot => { if (id === this.screenId) this.onSnapshot(snapshot); },
        () => { if (id === this.screenId && this.screen?.kind === 'board') { this.screen.offline = true; this.render(); } });
    } catch {
      this.screen.offline = true;
      this.render();
    }
  }

  private onSnapshot(snapshot: BoardSnapshot | null): void {
    const screen = this.screen;
    if (screen?.kind !== 'board') return;
    if (snapshot === null) {
      this.forget(screen.code);
      this.showHub('No board with that code. It may have been closed after a quiet spell.');
      return;
    }
    const previous = screen.snapshot?.joined ? screen.snapshot.members : null;
    if (!snapshot.joined) {
      // Not (or no longer) a member here: offer to join.
      if (this.deps.store.load().boards.includes(screen.code)) this.forget(screen.code);
    } else {
      const data = this.deps.store.load();
      if (!data.boards.includes(screen.code) || data.lastBoard !== screen.code) this.remember(screen.code);
      this.announceChanges(previous, snapshot.members, screen);
    }
    screen.snapshot = snapshot;
    screen.offline = false;
    screen.joining = false;
    this.render();
  }

  private announceChanges(previous: readonly BoardMemberView[] | null, next: readonly BoardMemberView[], screen: Extract<Screen, { kind: 'board' }>): void {
    if (!screen.announced) {
      screen.announced = true;
      this.deps.screens.announce(boardSummary(rankBoard(next, screen.tab), screen.tab));
      return;
    }
    const fresh = newlyPosted(previous, next, 'today');
    if (fresh.length > 0) {
      this.deps.screens.announce(fresh.map(m => `${m.name} posted today: ${resultWords(m.today!)}`).join('. '));
    }
  }

  private async joinFromLink(rawName: string): Promise<void> {
    const screen = this.screen;
    if (screen?.kind !== 'board' || screen.joining) return;
    const backend = this.ensureBackend();
    if (!backend) return;
    const name = this.useName(rawName);
    const id = this.screenId;
    screen.joining = true;
    screen.error = null;
    this.render();
    try {
      await backend.joinBoard(screen.code, name);
    } catch (error) {
      if (id !== this.screenId) return;
      screen.joining = false;
      screen.error = message(error);
      this.render();
      return;
    }
    this.remember(screen.code);
    void this.syncPosts();
    // The live snapshot flips to the member view by itself; "Joining…" stays until it does.
  }

  private async leave(): Promise<void> {
    const screen = this.screen;
    if (screen?.kind !== 'board' || screen.leaving) return;
    const backend = this.ensureBackend();
    if (!backend) return;
    const id = this.screenId;
    screen.leaving = true;
    screen.error = null;
    this.render();
    try {
      await backend.leaveBoard(screen.code);
    } catch {
      if (id !== this.screenId) return;
      screen.leaving = false;
      screen.error = "Couldn't leave right now. Check your connection and try again.";
      this.render();
      return;
    }
    this.forget(screen.code);
    if (id === this.screenId) this.showHub();
  }

  private stopWatching(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  private exit(then: () => void): void {
    this.stopWatching();
    this.screenId++;
    this.screen = null;
    then();
  }

  // ---------- Rendering ----------

  private render(): void {
    const screen = this.screen;
    if (!screen) return;
    const { screens } = this.deps;
    if (screen.kind === 'hub') {
      const data = this.deps.store.load();
      const boards = screen.boards ?? data.boards.map(code => ({ code, memberCount: null as number | null }));
      screens.hub(this.menu, {
        name: this.name, boards: boards.map(b => ({ code: b.code, memberCount: b.memberCount })), code: screen.code,
        busy: screen.busy, error: screen.error, canCreate: boards.length < FRIENDS_BOARD.maxBoardsPerPlayer,
        onCreate: name => void this.create(name),
        onJoin: (name, code) => void this.joinFromHub(name, code),
        onOpen: code => this.openBoard(code),
        onBack: () => this.exit(() => this.hooks.back()),
      });
      return;
    }
    const snapshot = screen.snapshot;
    if (snapshot && !snapshot.joined) {
      screens.join(this.menu, {
        code: screen.code, memberCount: snapshot.memberCount, full: snapshot.memberCount >= FRIENDS_BOARD.maxMembers,
        name: this.name, busy: screen.joining, error: screen.error,
        onJoin: name => void this.joinFromLink(name),
        onCancel: () => this.exit(() => this.hooks.back()),
      });
      return;
    }
    const members = snapshot?.joined ? snapshot.members : null;
    const rows = members ? rankBoard(members, screen.tab) : null;
    const todayKey = dateKey(this.deps.now());
    screens.board(this.menu, {
      code: screen.code, link: this.deps.linkFor(screen.code), inviteText: boardInviteText(screen.code, this.deps.linkFor(screen.code)),
      tab: screen.tab, dayLabels: { today: boardDayLabel(screen.day), yesterday: boardDayLabel(screen.day - 1) },
      rows, offline: screen.offline, summary: rows ? boardSummary(rows, screen.tab) : 'Loading the board…',
      playedToday: todayKey in this.hooks.progress().daily,
      memberCount: members?.length ?? 0, maxMembers: FRIENDS_BOARD.maxMembers,
      confirmLeave: screen.confirmLeave, leaving: screen.leaving, error: screen.error,
      onTab: tab => {
        if (this.screen !== screen || screen.tab === tab) return;
        screen.tab = tab;
        this.render();
        if (rows) this.deps.screens.announce(boardSummary(rankBoard(members!, tab), tab));
      },
      onPlay: () => this.exit(() => this.hooks.playDaily()),
      onLeave: () => { if (this.screen === screen) { screen.confirmLeave = true; this.render(); } },
      onConfirmLeave: () => void this.leave(),
      onCancelLeave: () => { if (this.screen === screen) { screen.confirmLeave = false; screen.error = null; this.render(); } },
      onBoards: () => this.showHub(),
      onBack: () => this.exit(() => this.hooks.back()),
    });
  }
}
