// tests/onlineController.test.ts
// The controller is glue, so its collaborators (Convex session, DOM screens, banner, storage) are faked here
// and the pure tracker, replayMatch and match machine run for real.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MULTIPLAYER } from '../src/config/tuning';
import type { MultiplayerMatchMachine } from '../src/rules/multiplayerMatch';
import type { PresenceEntry, RoomSnapshot, RoomState, ShotRecord } from '../src/rules/onlineTypes';
import { OnlineController, type OnlineSceneHooks } from '../src/scenes/onlineController';
import type { ClassifiedOutcome } from '../src/sim/classification';
import type { OnlineProfile } from '../src/storage/storage';
import type { MenuOverlay } from '../src/ui/menuOverlay';
import type { LobbyOptions, OnlineSetupOptions } from '../src/ui/onlineScreens';
import { makeRoom, makeSeats, playShots } from './onlineFixtures';

interface Listener { onRoom(s: RoomSnapshot | null): void; onPresence(e: PresenceEntry[]): void }
type Screen =
  | { kind: 'setup'; opts: OnlineSetupOptions }
  | { kind: 'lobby'; opts: LobbyOptions }
  | { kind: 'notice'; message: string; onOk: () => void };

const h = vi.hoisted(() => {
  const state = {
    calls: [] as string[],
    sessions: [] as FakeSession[],
    screens: [] as Screen[],
    banner: { blocking: null as string | null, retry: undefined as (() => void) | undefined, flashes: [] as string[] },
    url: '',
  };
  class FakeSession {
    code: string | null = null;
    serverNow = 0;
    connected = true;
    listener: Listener | null = null;
    enterError: Error | null = null;
    createRoom = vi.fn(async (_p: OnlineProfile, _m: string[]): Promise<string> => 'ABCDE');
    joinRoom = vi.fn(async (_c: string, _p: OnlineProfile): Promise<void> => undefined);
    peekSeat = vi.fn(async (_c: string): Promise<number | null> => null);
    fireShot = vi.fn(async (_a: { matchNumber: number; seq: number; angle: number; power: number }): Promise<void> => undefined);
    reportOutcome = vi.fn(async (_a: { matchNumber: number; seq: number; outcome: ClassifiedOutcome }): Promise<void> => undefined);
    reportWitness = vi.fn((_a: { matchNumber: number; seq: number; outcome: ClassifiedOutcome }): void => undefined);
    requestRematch = vi.fn((_m: number): void => undefined);
    setMaps = vi.fn(async (_m: string[]): Promise<void> => undefined);
    startMatch = vi.fn(async (): Promise<void> => undefined);
    constructor() { state.sessions.push(this); }
    enter(typed: string, listener: Listener): void {
      if (this.enterError) throw this.enterError;
      state.calls.push(`enter:${typed}`);
      this.code = typed;
      this.listener = listener;
    }
    exit(): void {
      state.calls.push('exit');
      this.code = null;
      this.listener = null;
    }
    leaveRoom(): Promise<void> {
      state.calls.push(`leaveRoom:${this.code ?? 'none'}`);
      return Promise.resolve();
    }
  }
  return { state, FakeSession };
});

vi.mock('../src/net/convexClient', () => ({ getConvexClient: () => ({}), isOnlineConfigured: () => true }));
vi.mock('../src/net/onlineSession', () => ({ OnlineSession: h.FakeSession }));
vi.mock('../src/storage/storage', () => ({
  loadOnlineProfile: () => ({ name: 'Saved', color: 1, pattern: 'dots' }),
  saveOnlineProfile: vi.fn(),
  onlineToken: () => 'token',
}));
vi.mock('../src/ui/onlineBanner', () => ({
  OnlineBanner: class {
    setText(): void { /* status text is not asserted */ }
    flash(message: string): void { h.state.banner.flashes.push(message); }
    setBlocking(message: string | null, onRetry?: () => void): void {
      h.state.banner.blocking = message;
      h.state.banner.retry = onRetry;
    }
    destroy(): void { /* nothing to remove */ }
  },
}));
vi.mock('../src/ui/onlineScreens', () => ({
  showOnlineSetup: (menu: { view: string }, opts: OnlineSetupOptions) => { menu.view = 'online_setup'; h.state.screens.push({ kind: 'setup', opts }); },
  showOnlineLobby: (menu: { view: string }, opts: LobbyOptions) => { menu.view = 'online_lobby'; h.state.screens.push({ kind: 'lobby', opts }); },
  showOnlineNotice: (menu: { view: string }, message: string, onOk: () => void) => {
    menu.view = 'online_notice';
    h.state.screens.push({ kind: 'notice', message, onOk });
  },
}));

const OFFLINE = "Couldn't reach the server. Check your connection and try again.";
const flush = () => new Promise<void>(resolve => setTimeout(resolve, 0));
const rejection = (code: string) => Object.assign(new Error(code), { data: { code } });

/** A minimal stand-in for PrototypeScene: drives the real match machine the way the scene would. */
function makeScene() {
  const scene = {
    machine: null as MultiplayerMatchMachine | null,
    ready: true,
    inFlight: false,
    shows: 0,
    played: [] as Array<[number, number]>,
    applied: [] as Array<[ClassifiedOutcome, boolean]>,
    skipped: [] as string[],
    aimingRefreshes: 0,
    leftToMenu: 0,
  };
  const settle = (m: MultiplayerMatchMachine) => {
    m.continueFromResult();
    if (m.state === 'round_result') m.nextRound();
    m.startAiming();
  };
  const hooks: OnlineSceneHooks = {
    showOnlineMatch: m => { scene.machine = m; scene.shows++; scene.inFlight = false; m.startAiming(); },
    presentation: () => ({
      state: scene.machine?.state ?? 'handover',
      activeSeat: scene.machine?.activePlayerIndex ?? 0,
      ready: scene.ready && !scene.inFlight && scene.machine?.state === 'aiming',
      shotInFlight: scene.inFlight,
    }),
    playShot: (angle, power) => { scene.played.push([angle, power]); scene.machine?.fire(angle, power); scene.inFlight = true; },
    presentSkippedTurn: (_seat, angle, power, text) => {
      scene.skipped.push(text);
      const m = scene.machine!;
      m.fire(angle, power);
      m.resolveShot('miss');
      settle(m);
    },
    applyOfficialOutcome: (outcome, mine) => {
      scene.applied.push([outcome, mine]);
      const m = scene.machine!;
      m.resolveShot(outcome);
      settle(m);
    },
    refreshMatchResult: () => undefined,
    refreshAimingControls: () => { scene.aimingRefreshes++; },
    leaveToMenu: () => { scene.leftToMenu++; },
  };
  return { scene, hooks };
}

function setup() {
  const menu = { view: 'main', getView() { return this.view; }, showMainMenu() { this.view = 'main'; } };
  const { scene, hooks } = makeScene();
  const ctl = new OnlineController(menu as unknown as MenuOverlay, hooks);
  return { ctl, menu, scene };
}

const session = () => h.state.sessions.at(-1)!;
const screens = <K extends Screen['kind']>(kind: K) => h.state.screens.filter((s): s is Extract<Screen, { kind: K }> => s.kind === kind);
const lastSetup = () => screens('setup').at(-1)!.opts;

function snapshot(outcomes: (ClassifiedOutcome | null)[], you: number | null, room: Partial<RoomState> = {}): RoomSnapshot {
  const r = makeRoom(room);
  const seats = makeSeats(2);
  return { room: r, seats, shots: playShots(seats, r, outcomes), you };
}

/** The seat that fires shot 0 in the fixture room. */
const firstShooter = () => playShots(makeSeats(2), makeRoom(), [null])[0]!.seat;

/** Creates a room through the setup screen and returns the room listener. */
async function enterRoom(ctl: OnlineController): Promise<Listener> {
  ctl.open();
  lastSetup().onCreate({ name: 'Ann', color: 1, pattern: 'dots' });
  await flush();
  return session().listener!;
}

beforeEach(() => {
  h.state.calls.length = 0;
  h.state.sessions.length = 0;
  h.state.screens.length = 0;
  h.state.banner = { blocking: null, retry: undefined, flashes: [] };
  h.state.url = '';
  vi.stubGlobal('document', { body: {} });
  vi.stubGlobal('window', {
    location: { href: 'http://localhost:5173/' },
    history: { replaceState: (_s: unknown, _t: string, url: URL | string) => { h.state.url = String(url); } },
  });
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('OnlineController: setup screen', () => {
  it('sanitizes the raw name (blank falls back, long is capped) before any server call', async () => {
    const { ctl } = setup();
    ctl.open();
    lastSetup().onCreate({ name: '   ', color: 1, pattern: 'dots' });
    await flush();
    expect(session().createRoom).toHaveBeenCalledWith({ name: 'Player 1', color: 1, pattern: 'dots' }, [...MULTIPLAYER.maps]);
    expect(ctl.inRoom).toBe(true);
    expect(h.state.url).toContain('room=ABCDE');

    const { ctl: other } = setup();
    other.open();
    lastSetup().onJoin({ name: `  ${'x'.repeat(40)}  `, color: 1, pattern: 'dots' }, 'ABCDE');
    await flush();
    expect(session().joinRoom.mock.calls[0]![1].name).toBe('x'.repeat(MULTIPLAYER.maxNameLength));
  });

  it('normalizes the code again before joining and rejects a malformed one without a server call', async () => {
    const { ctl } = setup();
    ctl.open();
    lastSetup().onJoin({ name: 'Bo', color: 1, pattern: 'dots' }, ' k7q-px ');
    await flush();
    expect(session().joinRoom).toHaveBeenCalledWith('K7QPX', { name: 'Bo', color: 1, pattern: 'dots' });
    expect(h.state.calls).toContain('enter:K7QPX');

    const joins = () => h.state.sessions.reduce((n, s) => n + s.joinRoom.mock.calls.length, 0);
    const before = joins();
    const { ctl: other } = setup();
    other.open();
    lastSetup().onJoin({ name: 'Bo', color: 1, pattern: 'dots' }, '!!');
    await flush();
    expect(joins()).toBe(before);
    expect(other.inRoom).toBe(false);
    expect(lastSetup().error).toMatch(/Room codes are/);
  });

  it('shows friendly join errors and the offline message on the setup screen', async () => {
    const { ctl } = setup();
    await ctl.openFromLink('ABCDE'); // creates the session; no seat yet, so the join screen opens
    session().joinRoom.mockRejectedValueOnce(rejection('FULL'));
    lastSetup().onJoin({ name: 'Bo', color: 1, pattern: 'dots' }, 'ABCDE');
    await flush();
    expect(lastSetup().error).toBe('That room is full.');
    expect(lastSetup().code).toBe('ABCDE');
    session().joinRoom.mockRejectedValueOnce(new Error('socket closed'));
    lastSetup().onJoin({ name: 'Bo', color: 1, pattern: 'dots' }, 'ABCDE');
    await flush();
    expect(lastSetup().error).toBe(OFFLINE);
    expect(ctl.inRoom).toBe(false);
  });

  it("catches session.enter's throw and shows its message", async () => {
    const { ctl } = setup();
    ctl.open();
    lastSetup().onJoin({ name: 'Bo', color: 1, pattern: 'dots' }, 'ABCDE');
    session().enterError = new Error("That doesn't look like a room code.");
    await flush();
    expect(ctl.inRoom).toBe(false);
    expect(lastSetup().error).toBe("That doesn't look like a room code.");
    expect(h.state.url).not.toContain('room=');
  });

  it('ignores a second Create while the first is still pending', async () => {
    const { ctl } = setup();
    ctl.open();
    const opts = lastSetup();
    opts.onCreate({ name: 'Ann', color: 1, pattern: 'dots' });
    opts.onCreate({ name: 'Ann', color: 1, pattern: 'dots' });
    await flush();
    expect(session().createRoom).toHaveBeenCalledTimes(1);
  });

  it('a room link rejoins a seat this tab already holds, otherwise prefills the join screen', async () => {
    const { ctl } = setup();
    await ctl.openFromLink('abcde');
    expect(ctl.inRoom).toBe(false);
    expect(lastSetup().code).toBe('ABCDE');
    session().peekSeat.mockResolvedValueOnce(1);
    await ctl.openFromLink('abcde');
    expect(ctl.inRoom).toBe(true);
    expect(h.state.calls).toContain('enter:ABCDE');
  });
});

describe('OnlineController: lobby, removal and leaving', () => {
  it('calls leaveRoom before exit and returns to the setup screen', async () => {
    const { ctl, scene } = setup();
    const listener = await enterRoom(ctl);
    listener.onRoom(snapshot([], 0, { status: 'lobby' }));
    expect(screens('lobby').length).toBe(1);
    screens('lobby')[0]!.opts.onLeave();
    expect(h.state.calls.slice(-2)).toEqual(['leaveRoom:ABCDE', 'exit']);
    expect(ctl.inRoom).toBe(false);
    expect(scene.leftToMenu).toBe(1);
    expect(h.state.screens.at(-1)!.kind).toBe('setup');
    expect(h.state.url).not.toContain('room=');
  });

  it('shows the start error in the lobby', async () => {
    const { ctl } = setup();
    const listener = await enterRoom(ctl);
    listener.onRoom(snapshot([], 0, { status: 'lobby' }));
    session().startMatch.mockRejectedValueOnce(rejection('NOT_ENOUGH_PLAYERS'));
    screens('lobby').at(-1)!.opts.onStart();
    await flush();
    expect(screens('lobby').at(-1)!.opts.error).toBe('Waiting for at least 2 connected players.');
  });

  it('rejoins silently when pruned from the lobby, and reports a full room', async () => {
    const { ctl } = setup();
    const listener = await enterRoom(ctl);
    listener.onRoom(snapshot([], 0, { status: 'lobby' }));
    listener.onRoom(snapshot([], null, { status: 'lobby' }));
    await flush();
    expect(session().joinRoom).toHaveBeenCalledWith('ABCDE', { name: 'Ann', color: 1, pattern: 'dots' });
    expect(ctl.inRoom).toBe(true);

    listener.onRoom(snapshot([], 0, { status: 'lobby' }));
    session().joinRoom.mockRejectedValueOnce(rejection('FULL'));
    listener.onRoom(snapshot([], null, { status: 'lobby' }));
    await flush();
    expect(ctl.inRoom).toBe(false);
    expect(screens('notice').at(-1)!.message).toBe('The room filled up while you were away.');
  });

  it('ignores a rejoin failure that lands after I left on purpose', async () => {
    const { ctl } = setup();
    const listener = await enterRoom(ctl);
    listener.onRoom(snapshot([], 0, { status: 'lobby' }));
    let fail: (e: unknown) => void = () => undefined;
    session().joinRoom.mockImplementationOnce(() => new Promise<void>((_resolve, reject) => { fail = reject; }));
    listener.onRoom(snapshot([], null, { status: 'lobby' }));
    ctl.leave();
    fail(rejection('FULL'));
    await flush();
    expect(screens('notice')).toEqual([]);
    expect(h.state.screens.at(-1)!.kind).toBe('setup');
  });

  it('reports a vanished room and a rematch that left me out', async () => {
    const { ctl, scene } = setup();
    const listener = await enterRoom(ctl);
    listener.onRoom(snapshot([], 0));
    listener.onRoom(null);
    expect(ctl.inRoom).toBe(false);
    expect(screens('notice').at(-1)!.message).toBe('This room has ended.');
    expect(h.state.calls).not.toContain('leaveRoom:ABCDE');
    expect(scene.leftToMenu).toBe(1);

    const again = await enterRoom(ctl);
    again.onRoom(snapshot([], 0));
    again.onRoom(snapshot([], null, { matchNumber: 1 }));
    expect(ctl.inRoom).toBe(false);
    expect(screens('notice').at(-1)!.message).toBe("You weren't included in the rematch.");
  });
});

describe('OnlineController: my shots', () => {
  async function myTurn() {
    const ctx = setup();
    const listener = await enterRoom(ctx.ctl);
    const me = firstShooter();
    listener.onRoom(snapshot([], me));
    ctx.ctl.update(0.016);
    return { ...ctx, listener, me };
  }

  it('fires, then reports my local outcome as the official one after the fire is delivered', async () => {
    const { ctl, scene } = await myTurn();
    expect(ctl.inMatch).toBe(true);
    expect(ctl.isMyTurnToAim()).toBe(true);
    expect(scene.aimingRefreshes).toBe(1);
    scene.machine!.fire(40, 70);
    scene.inFlight = true;
    let deliver: () => void = () => undefined;
    session().fireShot.mockImplementationOnce(() => new Promise<void>(resolve => { deliver = resolve; }));
    ctl.onUserFire(40, 70);
    ctl.onLocalResolution('body');
    expect(scene.applied).toEqual([['body', true]]);
    await flush();
    expect(session().fireShot).toHaveBeenCalledWith({ matchNumber: 0, seq: 0, angle: 40, power: 70 });
    expect(session().reportOutcome).not.toHaveBeenCalled(); // the fire is still being retried
    deliver();
    await flush();
    expect(session().reportOutcome).toHaveBeenCalledWith({ matchNumber: 0, seq: 0, outcome: 'body' });
  });

  it('blocks with Retry after the last fire retry fails, holds the report, then sends both in order', async () => {
    const { ctl, scene } = await myTurn();
    session().fireShot.mockRejectedValueOnce(new Error('offline'));
    scene.machine!.fire(40, 70);
    ctl.onUserFire(40, 70);
    ctl.onLocalResolution('miss');
    await flush();
    expect(h.state.banner.blocking).toBe("Couldn't reach the room.");
    expect(session().reportOutcome).not.toHaveBeenCalled();
    h.state.banner.retry!();
    await flush();
    expect(h.state.banner.blocking).toBeNull();
    expect(session().fireShot).toHaveBeenCalledTimes(2);
    expect(session().reportOutcome).toHaveBeenCalledTimes(1);
  });

  it('does not resend behind the blocking banner when the local shot resolves after the retries ran out', async () => {
    const { ctl, scene } = await myTurn();
    session().fireShot.mockRejectedValueOnce(new Error('offline'));
    scene.machine!.fire(40, 70);
    ctl.onUserFire(40, 70);
    await flush();
    expect(h.state.banner.blocking).toBe("Couldn't reach the room.");
    ctl.onLocalResolution('miss');
    await flush();
    expect(session().fireShot).toHaveBeenCalledTimes(1);
    expect(session().reportOutcome).not.toHaveBeenCalled();
    expect(h.state.banner.blocking).toBe("Couldn't reach the room.");
    h.state.banner.retry!();
    await flush();
    expect(h.state.banner.blocking).toBeNull();
    expect(session().fireShot).toHaveBeenCalledTimes(2);
    expect(session().reportOutcome).toHaveBeenCalledWith({ matchNumber: 0, seq: 0, outcome: 'miss' });
  });

  it('ignores Fire while a shot of mine is already in progress', async () => {
    const { ctl, scene } = await myTurn();
    scene.machine!.fire(40, 70);
    ctl.onUserFire(40, 70);
    ctl.onUserFire(41, 71);
    await flush();
    expect(session().fireShot).toHaveBeenCalledTimes(1);
  });

  it('a rejected fire skips the report and resyncs with a notice once the local shot ends', async () => {
    const { ctl, scene } = await myTurn();
    session().fireShot.mockRejectedValueOnce(rejection('NOT_YOUR_TURN'));
    scene.machine!.fire(40, 70);
    scene.inFlight = true;
    ctl.onUserFire(40, 70);
    await flush();
    ctl.update(0.016);
    expect(scene.shows).toBe(1); // still flying: no resync yet
    ctl.onLocalResolution('body');
    scene.inFlight = false;
    await flush();
    expect(session().reportOutcome).not.toHaveBeenCalled();
    ctl.update(0.016);
    expect(scene.shows).toBe(2);
    expect(h.state.banner.flashes).toEqual(['Your turn was skipped']);
  });

  it('a rejected report resyncs with "Your shot timed out"', async () => {
    const { ctl, scene } = await myTurn();
    session().reportOutcome.mockRejectedValueOnce(rejection('CONFLICT'));
    scene.machine!.fire(40, 70);
    ctl.onUserFire(40, 70);
    ctl.onLocalResolution('miss');
    await flush();
    ctl.update(0.016);
    expect(scene.shows).toBe(2);
    expect(h.state.banner.flashes).toEqual(['Your shot timed out']);
  });

  it('ignores a fire that fails after I left the room', async () => {
    const { ctl, scene } = await myTurn();
    let fail: (e: unknown) => void = () => undefined;
    session().fireShot.mockImplementationOnce(() => new Promise<void>((_resolve, reject) => { fail = reject; }));
    scene.machine!.fire(40, 70);
    ctl.onUserFire(40, 70);
    await flush();
    ctl.leave();
    fail(new Error('offline'));
    await flush();
    expect(h.state.banner.blocking).toBeNull();
    expect(session().reportOutcome).not.toHaveBeenCalled();
  });

  it('a late report rejection from the previous match does not resync the rematch', async () => {
    const { ctl, scene, listener, me } = await myTurn();
    let fail: (e: unknown) => void = () => undefined;
    session().reportOutcome.mockImplementationOnce(() => new Promise<void>((_resolve, reject) => { fail = reject; }));
    scene.machine!.fire(40, 70);
    ctl.onUserFire(40, 70);
    ctl.onLocalResolution('miss');
    await flush();
    listener.onRoom(snapshot([], me, { matchNumber: 1 }));
    expect(scene.shows).toBe(2);
    fail(rejection('STALE_MATCH'));
    await flush();
    ctl.update(0.016);
    expect(scene.shows).toBe(2);
  });

  it('replays my unfinished shot after a reload as mine and reports it without firing again', async () => {
    const { ctl, scene } = setup();
    const listener = await enterRoom(ctl);
    const me = firstShooter();
    listener.onRoom(snapshot([null], me));
    ctl.update(0.016);
    expect(scene.played).toEqual([[30, 60]]);
    expect(ctl.isMyTurnToAim()).toBe(false);
    ctl.onLocalResolution('miss');
    expect(scene.applied).toEqual([['miss', true]]);
    await flush();
    expect(session().fireShot).not.toHaveBeenCalled();
    expect(session().reportWitness).not.toHaveBeenCalled();
    expect(session().reportOutcome).toHaveBeenCalledWith({ matchNumber: 0, seq: 0, outcome: 'miss' });
  });
});

describe('OnlineController: other players’ shots', () => {
  async function watching(outcomes: (ClassifiedOutcome | null)[], edit?: (shots: ShotRecord[]) => void) {
    const ctx = setup();
    const listener = await enterRoom(ctx.ctl);
    const shooter = firstShooter();
    const me = 1 - shooter;
    listener.onRoom(snapshot([], me));
    const s = snapshot(outcomes, me);
    edit?.(s.shots);
    listener.onRoom(s);
    return { ...ctx, listener, me, shooter };
  }

  it('waits while not ready, plays a remote shot exactly once and scores it with the official outcome', async () => {
    const { ctl, scene, listener, me } = await watching([null]);
    scene.ready = false;
    ctl.update(0.016);
    expect(scene.played).toEqual([]);
    scene.ready = true;
    ctl.update(0.016);
    ctl.update(0.016);
    expect(scene.played).toEqual([[30, 60]]);
    ctl.onLocalResolution('miss');
    scene.inFlight = false;
    expect(session().reportWitness).toHaveBeenCalledWith({ matchNumber: 0, seq: 0, outcome: 'miss' });
    expect(scene.applied).toEqual([]);
    listener.onRoom(snapshot(['body'], me));
    ctl.update(0.016);
    ctl.update(0.016);
    expect(scene.applied).toEqual([['body', false]]);
    expect(scene.played.length).toBe(1);
    expect(ctl.isMyTurnToAim()).toBe(true);
  });

  it('uses an official outcome that is already in, without a witness report', async () => {
    const { ctl, scene } = await watching(['hat_only']);
    ctl.update(0.016);
    expect(scene.played).toEqual([[30, 60]]);
    ctl.onLocalResolution('miss');
    expect(scene.applied).toEqual([['hat_only', false]]);
    expect(session().reportWitness).not.toHaveBeenCalled();
  });

  it("ignores Fire on someone else's turn", async () => {
    const { ctl, scene } = await watching([]);
    expect(ctl.isMyTurnToAim()).toBe(false);
    ctl.onUserFire(40, 70);
    ctl.onLocalResolution('body');
    await flush();
    expect(session().fireShot).not.toHaveBeenCalled();
    expect(scene.applied).toEqual([]);
  });

  it('presents a skipped turn without firing', async () => {
    const { ctl, scene, shooter } = await watching(['miss'], shots => { shots[0] = { ...shots[0]!, resolution: 'skipped' }; });
    ctl.update(0.016);
    ctl.update(0.016);
    expect(scene.played).toEqual([]);
    expect(scene.skipped).toEqual([`P${shooter + 1} was skipped`]);
    expect(ctl.isMyTurnToAim()).toBe(true);
  });
});

describe('OnlineController: finished matches', () => {
  it('leaves with a notice when the server finished the match early', async () => {
    const { ctl, scene } = setup();
    const listener = await enterRoom(ctl);
    listener.onRoom(snapshot(['miss'], 0, { status: 'finished' }));
    expect(scene.shows).toBe(1);
    ctl.update(0.016);
    expect(ctl.inRoom).toBe(false);
    expect(h.state.calls.slice(-2)).toEqual(['leaveRoom:ABCDE', 'exit']);
    expect(screens('notice').at(-1)!.message).toBe('This match ended unexpectedly.');
  });

  it('does not throw on an unreplayable finished shot list', async () => {
    const { ctl } = setup();
    const listener = await enterRoom(ctl);
    const s = snapshot(['miss'], 0, { status: 'finished' });
    s.shots[0] = { ...s.shots[0]!, seat: 1 - s.shots[0]!.seat };
    expect(() => listener.onRoom(s)).not.toThrow();
    expect(ctl.inRoom).toBe(false);
    expect(screens('notice').at(-1)!.message).toBe('This match ended unexpectedly.');
  });

  it('shows a complete finished match as a result with rematch extras', async () => {
    const { ctl, scene } = setup();
    const listener = await enterRoom(ctl);
    const room = makeRoom({ status: 'finished' });
    const seats = makeSeats(2);
    const full = playShots(seats, room, Array.from({ length: MULTIPLAYER.shotsPerRound * 2 }, () => 'miss' as const));
    listener.onRoom({ room, seats, shots: full, you: 0 });
    expect(scene.machine!.state).toBe('match_result');
    ctl.update(0.016);
    expect(ctl.inRoom).toBe(true);
    expect(ctl.resultExtras().canRematch).toBe(true);
    ctl.requestRematch();
    expect(session().requestRematch).toHaveBeenCalledWith(0);
  });
});
