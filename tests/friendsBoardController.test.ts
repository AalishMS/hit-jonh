// tests/friendsBoardController.test.ts — the friends-board glue with a fake backend, fake screens, an in-memory
// store and a hand-driven clock and timers. The pure rules (ranking, pending posts) run for real.
import { describe, expect, it, vi } from 'vitest';
import { FRIENDS_BOARD } from '../src/config/tuning';
import type { BoardBackend } from '../src/net/friendsBoardClient';
import { dayNumber, type BoardPost, type BoardSnapshot, type MyBoardEntry } from '../src/rules/friendsBoard';
import { freshProgress, type Progress } from '../src/rules/progression';
import { FriendsBoardController, type BoardScreens } from '../src/scenes/friendsBoardController';
import type { BoardStore, BoardStoreData } from '../src/storage/friendsBoardStore';
import type { BoardHubOptions, BoardJoinOptions, BoardViewOptions } from '../src/ui/friendsBoardScreens';
import type { MenuOverlay } from '../src/ui/menuOverlay';

const TODAY_KEY = '2026-11-25';
const TODAY = dayNumber(TODAY_KEY)!;
const NOW = new Date(2026, 10, 25, 18, 0); // local time, like the game's dateKey
const rejection = (code: string) => Object.assign(new Error(code), { data: { code } });
const flush = async () => { for (let i = 0; i < 5; i++) await new Promise<void>(resolve => setTimeout(resolve, 0)); };

type Shown =
  | { kind: 'hub'; o: BoardHubOptions }
  | { kind: 'join'; o: BoardJoinOptions }
  | { kind: 'board'; o: BoardViewOptions };

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function fakeBackend() {
  const watchers: Array<{ code: string; day: number; update: (s: BoardSnapshot | null) => void; error: (e: unknown) => void; closed: boolean }> = [];
  const backend = {
    createBoard: vi.fn(async (_name: string): Promise<string> => 'K7QPXW2M'),
    joinBoard: vi.fn(async (_code: string, _name: string): Promise<void> => undefined),
    leaveBoard: vi.fn(async (_code: string): Promise<void> => undefined),
    postResult: vi.fn(async (_post: BoardPost): Promise<{ stored: boolean }> => ({ stored: true })),
    myBoards: vi.fn(async (): Promise<MyBoardEntry[]> => []),
    watchBoard: vi.fn((code: string, day: number, update: (s: BoardSnapshot | null) => void, error: (e: unknown) => void) => {
      const w = { code, day, update, error, closed: false };
      watchers.push(w);
      return () => { w.closed = true; };
    }),
  };
  return { backend: backend satisfies BoardBackend, watchers, live: () => watchers.filter(w => !w.closed) };
}

function memoryStore(initial: Partial<BoardStoreData> = {}): BoardStore & { data: BoardStoreData } {
  const store = {
    data: { token: 'f'.repeat(32), boards: [], lastBoard: null, posted: [], ...initial } as BoardStoreData,
    load() { return { ...store.data, boards: [...store.data.boards], posted: [...store.data.posted] }; },
    save(data: BoardStoreData) { store.data = { ...data, boards: [...data.boards], posted: [...data.posted] }; },
  };
  return store;
}

function setup(opts: { store?: Partial<BoardStoreData>; progress?: Partial<Progress>; noBackend?: boolean } = {}) {
  const { backend, watchers, live } = fakeBackend();
  const store = memoryStore(opts.store);
  const shown: Shown[] = [];
  const announced: string[] = [];
  const timers: Array<{ fn: () => void; ms: number; cleared: boolean }> = [];
  const menu = { view: 'daily', getView() { return this.view; } };
  const screens: BoardScreens = {
    hub: (m, o) => { (m as unknown as typeof menu).view = 'board_hub'; shown.push({ kind: 'hub', o }); },
    join: (m, o) => { (m as unknown as typeof menu).view = 'board_join'; shown.push({ kind: 'join', o }); },
    board: (m, o) => { (m as unknown as typeof menu).view = 'board_view'; shown.push({ kind: 'board', o }); },
    announce: text => announced.push(text),
  };
  let progress: Progress = { ...freshProgress(), ...opts.progress };
  const hooks = {
    progress: () => progress,
    playDaily: vi.fn(),
    back: vi.fn(() => { menu.view = 'daily'; }),
    loadName: () => 'Sam',
    saveName: vi.fn(),
  };
  const makeBackend = vi.fn((_token: string) => (opts.noBackend ? null : backend));
  const ctl = new FriendsBoardController(menu as unknown as MenuOverlay, hooks, {
    makeBackend, screens, store, now: () => NOW, linkFor: code => `https://hit.example/?board=${code}`,
    setTimer: (fn, ms) => { timers.push({ fn, ms, cleared: false }); return timers.length as unknown as ReturnType<typeof setTimeout>; },
    clearTimer: id => { timers[(id as unknown as number) - 1]!.cleared = true; },
  });
  const last = () => shown.at(-1)!;
  const lastOf = <K extends Shown['kind']>(kind: K) => {
    const s = last();
    if (s.kind !== kind) throw new Error(`expected ${kind}, showing ${s.kind}`);
    return s.o as Extract<Shown, { kind: K }>['o'];
  };
  return {
    ctl, backend, watchers, live, store, shown, announced, timers, hooks, makeBackend, menu, last, lastOf,
    setProgress(p: Partial<Progress>) { progress = { ...progress, ...p }; },
  };
}

const member = (id: string, name: string, today: BoardPost | null, extra: { mine?: boolean; yesterday?: BoardPost | null } = {}) => ({
  id, name, mine: extra.mine ?? false, joinedAt: 0,
  today: today && { ...today, postedAt: 1 }, yesterday: extra.yesterday ? { ...extra.yesterday, postedAt: 1 } : null,
});
const joined = (code: string, members: ReturnType<typeof member>[]): BoardSnapshot => ({ code, joined: true, day: TODAY, members });
const PLAYED_TODAY = { daily: { [TODAY_KEY]: 2 }, dailyShots: { [TODAY_KEY]: 'mb' } };

describe('posting results (offline-first)', () => {
  it('does nothing, not even connect, without a board', async () => {
    const t = setup({ progress: PLAYED_TODAY });
    await t.ctl.syncPosts();
    expect(t.makeBackend).not.toHaveBeenCalled();
  });

  it("posts the day's counted run once, then never again (replays included)", async () => {
    const t = setup({ store: { boards: ['K7QPXW2M'] }, progress: PLAYED_TODAY });
    await t.ctl.syncPosts();
    expect(t.backend.postResult).toHaveBeenCalledWith({ day: TODAY, stars: 2, shots: 'mb', streak: 1 });
    expect(t.store.data.posted).toEqual([TODAY_KEY]);
    // a replay changes nothing saved (recordDaily keeps the first run), and the day is already posted
    await t.ctl.syncPosts();
    expect(t.backend.postResult).toHaveBeenCalledTimes(1);
  });

  it("posts yesterday's run late, then today's, with the streak as of each day", async () => {
    const t = setup({ store: { boards: ['K7QPXW2M'] }, progress: { daily: { '2026-11-24': 3, [TODAY_KEY]: 0 }, dailyShots: { '2026-11-24': 'b', [TODAY_KEY]: 'mhm' } } });
    await t.ctl.syncPosts();
    expect(t.backend.postResult.mock.calls.map(c => c[0])).toEqual([
      { day: TODAY - 1, stars: 3, shots: 'b', streak: 1 },
      { day: TODAY, stars: 0, shots: 'mhm', streak: 2 },
    ]);
  });

  it('retries a network failure later (15 s, 60 s, then every 5 min) and never blocks', async () => {
    const t = setup({ store: { boards: ['K7QPXW2M'] }, progress: PLAYED_TODAY });
    t.backend.postResult.mockRejectedValue(new Error('offline'));
    await t.ctl.syncPosts();
    expect(t.store.data.posted).toEqual([]);
    expect(t.timers.map(x => x.ms)).toEqual([FRIENDS_BOARD.retryDelaysSeconds[0] * 1000]);
    t.timers[0]!.fn();
    await flush();
    t.timers[1]!.fn();
    await flush();
    t.timers[2]!.fn();
    await flush();
    expect(t.timers.map(x => x.ms / 1000)).toEqual([15, 60, 300, 300]);
    t.backend.postResult.mockResolvedValue({ stored: true });
    t.timers[3]!.fn();
    await flush();
    expect(t.store.data.posted).toEqual([TODAY_KEY]);
    expect(t.timers).toHaveLength(4);
  });

  it('treats a rate limit like a network failure, and a refused result as final', async () => {
    const t = setup({ store: { boards: ['K7QPXW2M'] }, progress: PLAYED_TODAY });
    t.backend.postResult.mockRejectedValueOnce(rejection('RATE_LIMITED'));
    await t.ctl.syncPosts();
    expect(t.timers).toHaveLength(1);
    t.backend.postResult.mockRejectedValueOnce(rejection('BAD_DAY'));
    t.timers[0]!.fn();
    await flush();
    expect(t.store.data.posted).toEqual([TODAY_KEY]);
    expect(t.timers).toHaveLength(1);
  });

  it('stops without marking anything when the server says I am in no board', async () => {
    const t = setup({ store: { boards: ['K7QPXW2M'] }, progress: PLAYED_TODAY });
    t.backend.postResult.mockRejectedValueOnce(rejection('NOT_MEMBER'));
    await t.ctl.syncPosts();
    expect(t.store.data.posted).toEqual([]);
    expect(t.timers).toEqual([]);
  });

  it('runs one sync at a time and catches up on a call made meanwhile', async () => {
    const t = setup({ store: { boards: ['K7QPXW2M'] }, progress: { daily: { '2026-11-24': 3 }, dailyShots: { '2026-11-24': 'b' } } });
    const first = deferred<{ stored: boolean }>();
    t.backend.postResult.mockReturnValueOnce(first.promise);
    const running = t.ctl.syncPosts();
    t.setProgress({ daily: { '2026-11-24': 3, [TODAY_KEY]: 2 }, dailyShots: { '2026-11-24': 'b', [TODAY_KEY]: 'mb' } });
    await t.ctl.syncPosts(); // returns at once: a sync is running
    expect(t.backend.postResult).toHaveBeenCalledTimes(1);
    first.resolve({ stored: true });
    await running;
    expect(t.backend.postResult.mock.calls.map(c => c[0].day)).toEqual([TODAY - 1, TODAY]);
    expect(t.store.data.posted).toEqual(['2026-11-24', TODAY_KEY]);
  });
});

describe('entry and the hub', () => {
  it('opens the hub when I have no board, listing what the server says I am in', async () => {
    const t = setup();
    t.backend.myBoards.mockResolvedValue([{ code: 'ABCDEFGH', memberCount: 3, joinedAt: 1 }]);
    t.ctl.open();
    expect(t.lastOf('hub')).toMatchObject({ name: 'Sam', boards: [], busy: null, error: null, canCreate: true });
    await flush();
    expect(t.lastOf('hub').boards).toEqual([{ code: 'ABCDEFGH', memberCount: 3 }]);
    expect(t.store.data.boards).toEqual(['ABCDEFGH']);
  });

  it('opens my last board straight away, subscribed for my local today', () => {
    const t = setup({ store: { boards: ['ABCDEFGH', 'K7QPXW2M'], lastBoard: 'K7QPXW2M' } });
    t.ctl.open();
    expect(t.live().map(w => [w.code, w.day])).toEqual([['K7QPXW2M', TODAY]]);
    expect(t.lastOf('board')).toMatchObject({ code: 'K7QPXW2M', rows: null, summary: 'Loading the board…', offline: false });
  });

  it('creates a board with my (cleaned, saved) name, opens it and posts my result to it', async () => {
    const t = setup({ progress: PLAYED_TODAY });
    t.ctl.open();
    t.lastOf('hub').onCreate('  Sammy  ');
    expect(t.lastOf('hub').busy).toBe('create');
    await flush();
    expect(t.backend.createBoard).toHaveBeenCalledWith('Sammy');
    expect(t.hooks.saveName).toHaveBeenCalledWith('Sammy');
    expect(t.store.data).toMatchObject({ boards: ['K7QPXW2M'], lastBoard: 'K7QPXW2M', posted: [TODAY_KEY] });
    expect(t.lastOf('board').code).toBe('K7QPXW2M');
    expect(t.lastOf('board').link).toBe('https://hit.example/?board=K7QPXW2M');
    expect(t.lastOf('board').inviteText).toContain('K7QPXW2M');
  });

  it('shows why a create or join failed and stays on the hub', async () => {
    const t = setup();
    t.ctl.open();
    const cases: Array<[unknown, string]> = [
      [rejection('NOT_FOUND'), 'No board with that code.'],
      [rejection('FULL'), `That board is full (${FRIENDS_BOARD.maxMembers} friends).`],
      [rejection('TOO_MANY_BOARDS'), `You're on ${FRIENDS_BOARD.maxBoardsPerPlayer} boards already. Leave one first.`],
      [rejection('RATE_LIMITED'), 'Easy there! Try again in a few seconds.'],
      [new Error('offline'), "Couldn't reach the server. Check your connection and try again."],
    ];
    for (const [error, text] of cases) {
      t.backend.joinBoard.mockRejectedValueOnce(error);
      t.lastOf('hub').onJoin('Sam', 'ABCDEFGH');
      await flush();
      expect(t.lastOf('hub')).toMatchObject({ error: text, busy: null, code: 'ABCDEFGH' });
    }
    t.backend.createBoard.mockRejectedValueOnce(rejection('TOO_MANY_BOARDS'));
    t.lastOf('hub').onCreate('Sam');
    await flush();
    expect(t.lastOf('hub').error).toContain('Leave one first');
    expect(t.store.data.boards).toEqual([]);
  });

  it('joins by code from the hub and opens that board', async () => {
    const t = setup();
    t.ctl.open();
    t.lastOf('hub').onJoin('Sam', 'ABCDEFGH');
    await flush();
    expect(t.backend.joinBoard).toHaveBeenCalledWith('ABCDEFGH', 'Sam');
    expect(t.live().map(w => w.code)).toEqual(['ABCDEFGH']);
    expect(t.store.data.boards).toEqual(['ABCDEFGH']);
  });

  it('ignores a reply that lands after the player has left the hub', async () => {
    const t = setup();
    t.ctl.open();
    const slow = deferred<string>();
    t.backend.createBoard.mockReturnValueOnce(slow.promise);
    t.lastOf('hub').onCreate('Sam');
    t.lastOf('hub').onBack();
    expect(t.hooks.back).toHaveBeenCalled();
    slow.resolve('LATE1');
    await flush();
    expect(t.watchers).toEqual([]);
    expect(t.menu.view).toBe('daily');
    expect(t.store.data.boards).toEqual(['LATE1']); // the board exists, so it is remembered for next time
  });

  it('caps boards per browser in the hub too', () => {
    const codes = Array.from({ length: FRIENDS_BOARD.maxBoardsPerPlayer }, (_, i) => `ABCD${'EFGHJKMNPQ'[i]}`);
    const t = setup({ store: { boards: codes } });
    t.ctl.openFromLink('nope!');
    expect(t.lastOf('hub')).toMatchObject({ canCreate: false, error: 'That link has no valid board code.' });
  });
});

describe('the live board', () => {
  it('ranks today, marks me, offers Play when I have not played, and announces the day once', () => {
    const t = setup({ store: { boards: ['ABCDEFGH'], lastBoard: 'ABCDEFGH' } });
    t.ctl.open();
    t.live()[0]!.update(joined('ABCDEFGH', [
      member('m1', 'Ann', { day: TODAY, stars: 1, shots: 'mmb', streak: 1 }),
      member('m2', 'Sam', null, { mine: true }),
      member('m3', 'Bo', { day: TODAY, stars: 3, shots: 't', streak: 5 }),
    ]));
    const o = t.lastOf('board');
    expect(o.rows!.map(r => [r.member.name, r.rank])).toEqual([['Bo', 1], ['Ann', 2], ['Sam', null]]);
    expect(o).toMatchObject({ playedToday: false, memberCount: 3, summary: 'Today: 2 played, 1 still to play.', dayLabels: { today: '25 Nov', yesterday: '24 Nov' } });
    expect(t.announced).toEqual(['Today: 2 played, 1 still to play.']);
  });

  it('announces friends whose result just arrived, and switches to yesterday', () => {
    const t = setup({ store: { boards: ['ABCDEFGH'], lastBoard: 'ABCDEFGH' }, progress: PLAYED_TODAY });
    t.ctl.open();
    const w = t.live()[0]!;
    const me = member('m2', 'Sam', { day: TODAY, stars: 2, shots: 'mb', streak: 1 }, { mine: true });
    const annYesterday = { day: TODAY - 1, stars: 3, shots: 'b', streak: 1 };
    w.update(joined('ABCDEFGH', [member('m1', 'Ann', null, { yesterday: annYesterday }), me]));
    w.update(joined('ABCDEFGH', [member('m1', 'Ann', { day: TODAY, stars: 1, shots: 'hmt', streak: 2 }, { yesterday: annYesterday }), me]));
    expect(t.announced.at(-1)).toBe('Ann posted today: 1 of 3 stars, hat then miss then trick hit');
    expect(t.lastOf('board').playedToday).toBe(true);
    t.lastOf('board').onTab('yesterday');
    expect(t.lastOf('board').tab).toBe('yesterday');
    expect(t.lastOf('board').rows!.map(r => [r.member.name, r.rank])).toEqual([['Ann', 1], ['Sam', null]]);
    expect(t.announced.at(-1)).toBe('Yesterday: 1 played, 1 still to play.');
  });

  it('keeps what it had and says so when the subscription fails', () => {
    const t = setup({ store: { boards: ['ABCDEFGH'], lastBoard: 'ABCDEFGH' } });
    t.ctl.open();
    t.live()[0]!.update(joined('ABCDEFGH', [member('m2', 'Sam', null, { mine: true })]));
    t.live()[0]!.error(new Error('socket closed'));
    expect(t.lastOf('board')).toMatchObject({ offline: true });
    expect(t.lastOf('board').rows).toHaveLength(1);
  });

  it('leaves after a confirmation, forgets the board and returns to the hub', async () => {
    const t = setup({ store: { boards: ['ABCDEFGH'], lastBoard: 'ABCDEFGH' } });
    t.ctl.open();
    t.live()[0]!.update(joined('ABCDEFGH', [member('m2', 'Sam', null, { mine: true })]));
    t.lastOf('board').onLeave();
    expect(t.lastOf('board').confirmLeave).toBe(true);
    t.lastOf('board').onCancelLeave();
    expect(t.lastOf('board').confirmLeave).toBe(false);
    t.lastOf('board').onLeave();
    t.backend.leaveBoard.mockRejectedValueOnce(new Error('offline'));
    t.lastOf('board').onConfirmLeave();
    await flush();
    expect(t.lastOf('board').error).toContain("Couldn't leave");
    t.lastOf('board').onConfirmLeave();
    await flush();
    expect(t.backend.leaveBoard).toHaveBeenCalledWith('ABCDEFGH');
    expect(t.store.data).toMatchObject({ boards: [], lastBoard: null });
    expect(t.last().kind).toBe('hub');
    expect(t.live()).toEqual([]);
  });

  it('Play starts the Daily and Back returns to the Daily screen, both closing the subscription', () => {
    const t = setup({ store: { boards: ['ABCDEFGH'], lastBoard: 'ABCDEFGH' } });
    t.ctl.open();
    t.lastOf('board').onPlay();
    expect(t.hooks.playDaily).toHaveBeenCalled();
    expect(t.live()).toEqual([]);
    t.ctl.open();
    t.lastOf('board').onBack();
    expect(t.hooks.back).toHaveBeenCalled();
    expect(t.live()).toEqual([]);
    // a snapshot for a closed screen does nothing
    const shownBefore = t.shown.length;
    t.watchers[1]!.update(joined('ABCDEFGH', []));
    expect(t.shown).toHaveLength(shownBefore);
  });
});

describe('invite links', () => {
  it('offers to join when I am not on the board, then shows it once the server agrees', async () => {
    const t = setup({ progress: PLAYED_TODAY });
    t.ctl.openFromLink('abcd-efgh');
    t.live()[0]!.update({ code: 'ABCDEFGH', joined: false, memberCount: 4 });
    expect(t.lastOf('join')).toMatchObject({ code: 'ABCDEFGH', memberCount: 4, full: false, name: 'Sam', busy: false });
    t.lastOf('join').onJoin('Sam');
    expect(t.lastOf('join').busy).toBe(true);
    await flush();
    expect(t.backend.joinBoard).toHaveBeenCalledWith('ABCDEFGH', 'Sam');
    expect(t.backend.postResult).toHaveBeenCalledTimes(1); // today's run reaches the board I just joined
    t.live()[0]!.update(joined('ABCDEFGH', [member('m9', 'Sam', { day: TODAY, stars: 2, shots: 'mb', streak: 1 }, { mine: true })]));
    expect(t.last().kind).toBe('board');
    expect(t.store.data).toMatchObject({ boards: ['ABCDEFGH'], lastBoard: 'ABCDEFGH' });
  });

  it('says a full board is full, and shows join errors', async () => {
    const t = setup();
    t.ctl.openFromLink('ABCDEFGH');
    t.live()[0]!.update({ code: 'ABCDEFGH', joined: false, memberCount: FRIENDS_BOARD.maxMembers });
    expect(t.lastOf('join').full).toBe(true);
    t.backend.joinBoard.mockRejectedValueOnce(rejection('FULL'));
    t.lastOf('join').onJoin('Sam');
    await flush();
    expect(t.lastOf('join')).toMatchObject({ busy: false, error: `That board is full (${FRIENDS_BOARD.maxMembers} friends).` });
    t.lastOf('join').onCancel();
    expect(t.hooks.back).toHaveBeenCalled();
  });

  it('a board that no longer exists is forgotten, with a reason on the hub', () => {
    const t = setup({ store: { boards: ['ABCDEFGH'], lastBoard: 'ABCDEFGH' } });
    t.ctl.open();
    t.live()[0]!.update(null);
    expect(t.lastOf('hub').error).toContain('No board with that code');
    expect(t.store.data.boards).toEqual([]);
  });

  it('a board I was removed from (left on another device) is forgotten and offered again', () => {
    const t = setup({ store: { boards: ['ABCDEFGH'], lastBoard: 'ABCDEFGH' } });
    t.ctl.open();
    t.live()[0]!.update({ code: 'ABCDEFGH', joined: false, memberCount: 2 });
    expect(t.last().kind).toBe('join');
    expect(t.store.data.boards).toEqual([]);
  });
});

describe('review fixes', () => {
  it('posts today again after leaving my last board and joining another (the server dropped my results)', async () => {
    const t = setup({ store: { boards: ['ABCDEFGH'], lastBoard: 'ABCDEFGH', posted: [TODAY_KEY] }, progress: PLAYED_TODAY });
    t.ctl.open();
    t.live()[0]!.update(joined('ABCDEFGH', [member('m2', 'Sam', { day: TODAY, stars: 2, shots: 'mb', streak: 1 }, { mine: true })]));
    t.lastOf('board').onLeave();
    t.lastOf('board').onConfirmLeave();
    await flush();
    expect(t.last().kind).toBe('hub');
    t.lastOf('hub').onJoin('Sam', 'FGHJK');
    await flush();
    expect(t.backend.postResult).toHaveBeenCalledWith({ day: TODAY, stars: 2, shots: 'mb', streak: 1 });
    expect(t.store.data.posted).toEqual([TODAY_KEY]);
  });

  it('keeps what the player is typing when the hub re-renders under them', async () => {
    const t = setup();
    const list = deferred<MyBoardEntry[]>();
    t.backend.myBoards.mockReturnValueOnce(list.promise);
    t.ctl.open();
    t.lastOf('hub').onNameInput('Samantha');
    t.lastOf('hub').onCodeInput('K7Q');
    list.resolve([{ code: 'ABCDEFGH', memberCount: 2, joinedAt: 1 }]);
    await flush();
    expect(t.lastOf('hub')).toMatchObject({ name: 'Samantha', code: 'K7Q', boards: [{ code: 'ABCDEFGH', memberCount: 2 }] });
  });

  it('keeps the typed name on the join screen across member-count updates', () => {
    const t = setup();
    t.ctl.openFromLink('ABCDEFGH');
    t.live()[0]!.update({ code: 'ABCDEFGH', joined: false, memberCount: 2 });
    t.lastOf('join').onNameInput('Bo');
    t.live()[0]!.update({ code: 'ABCDEFGH', joined: false, memberCount: 3 });
    expect(t.lastOf('join')).toMatchObject({ name: 'Bo', memberCount: 3 });
  });

  it('leaving as the last member goes to the hub without a "no board" error', async () => {
    const t = setup({ store: { boards: ['ABCDEFGH'], lastBoard: 'ABCDEFGH' } });
    t.ctl.open();
    t.live()[0]!.update(joined('ABCDEFGH', [member('m2', 'Sam', null, { mine: true })]));
    const leaving = deferred<void>();
    t.backend.leaveBoard.mockReturnValueOnce(leaving.promise);
    t.lastOf('board').onLeave();
    t.lastOf('board').onConfirmLeave();
    t.live()[0]!.update(null); // the board is gone before the mutation's reply
    expect(t.last().kind).toBe('board');
    leaving.resolve();
    await flush();
    expect(t.lastOf('hub').error).toBeNull();
    // and a non-last leaver never flashes "Join this board?"
    const u = setup({ store: { boards: ['ABCDEFGH'], lastBoard: 'ABCDEFGH' } });
    u.ctl.open();
    u.live()[0]!.update(joined('ABCDEFGH', [member('m2', 'Sam', null, { mine: true }), member('m1', 'Ann', null)]));
    u.backend.leaveBoard.mockReturnValueOnce(new Promise<void>(() => undefined));
    u.lastOf('board').onLeave();
    u.lastOf('board').onConfirmLeave();
    u.live()[0]!.update({ code: 'ABCDEFGH', joined: false, memberCount: 1 });
    expect(u.last().kind).toBe('board');
  });

  it('a myBoards reply that started before a join does not undo it', async () => {
    const t = setup();
    const list = deferred<MyBoardEntry[]>();
    t.backend.myBoards.mockReturnValueOnce(list.promise);
    t.ctl.open();
    t.lastOf('hub').onJoin('Sam', 'ABCDEFGH');
    await flush();
    list.resolve([]);
    await flush();
    expect(t.store.data).toMatchObject({ boards: ['ABCDEFGH'], lastBoard: 'ABCDEFGH' });
  });

  it('schedules no retry once destroyed', async () => {
    const t = setup({ store: { boards: ['ABCDEFGH'] }, progress: PLAYED_TODAY });
    const post = deferred<{ stored: boolean }>();
    t.backend.postResult.mockReturnValueOnce(post.promise);
    const running = t.ctl.syncPosts();
    t.ctl.destroy();
    post.reject(new Error('offline'));
    await running;
    expect(t.timers).toEqual([]);
  });
});

describe('another screen takes over', () => {
  it('a live board replaced by another view (a save-link prompt, a game) stops watching and never draws over it', () => {
    const t = setup({ store: { boards: ['ABCDEFGH'], lastBoard: 'ABCDEFGH' } });
    t.ctl.open();
    t.live()[0]!.update(joined('ABCDEFGH', [member('m2', 'Sam', null, { mine: true })]));
    const drawn = t.shown.length;
    const watcher = t.live()[0]!;
    t.menu.view = 'save_link';
    watcher.update(joined('ABCDEFGH', [member('m1', 'Ann', { day: TODAY, stars: 3, shots: 'b', streak: 1 }), member('m2', 'Sam', null, { mine: true })]));
    expect(t.shown.length).toBe(drawn);
    expect(t.live()).toHaveLength(0);
    expect(t.menu.view).toBe('save_link');
  });

  it('close() stops the board at once, and opening again starts afresh', () => {
    const t = setup({ store: { boards: ['ABCDEFGH'], lastBoard: 'ABCDEFGH' } });
    t.ctl.open();
    t.ctl.close();
    expect(t.live()).toHaveLength(0);
    t.ctl.open();
    expect(t.live()).toHaveLength(1);
  });
});

describe('without a backend', () => {
  it('shows the board as offline instead of throwing, and never posts', async () => {
    const t = setup({ noBackend: true, store: { boards: ['ABCDEFGH'], lastBoard: 'ABCDEFGH' }, progress: PLAYED_TODAY });
    t.ctl.open();
    await flush();
    expect(t.lastOf('board').offline).toBe(true);
    expect(t.store.data.posted).toEqual([]);
  });
});
