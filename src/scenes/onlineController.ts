// src/scenes/onlineController.ts
import { MULTIPLAYER } from '../config/tuning';
import { getConvexClient } from '../net/convexClient';
import { OnlineSession } from '../net/onlineSession';
import { errorCode } from '../net/retry';
import type { MPState, MultiplayerMatchMachine } from '../rules/multiplayerMatch';
import { OnlineMatchTracker, type PlaybackItem } from '../rules/onlineMatch';
import type { RoomSnapshot } from '../rules/onlineTypes';
import { sanitizePlayerName } from '../rules/playerName';
import { replayMatch } from '../rules/replayMatch';
import { normalizeRoomCode } from '../rules/roomCode';
import type { ClassifiedOutcome } from '../sim/classification';
import { loadOnlineProfile, onlineToken, saveOnlineProfile, type OnlineProfile } from '../storage/storage';
import type { MenuOverlay, OnlineResultExtras } from '../ui/menuOverlay';
import { OnlineBanner } from '../ui/onlineBanner';
import { showOnlineLobby, showOnlineNotice, showOnlineSetup } from '../ui/onlineScreens';

export interface OnlinePresentation {
  state: MPState;
  activeSeat: number;
  /** Aiming, not paused, no overlay, no pending launch: a queued shot may start now. */
  ready: boolean;
  /** A ball is (about to be) flying locally. */
  shotInFlight: boolean;
}

export interface OnlineSceneHooks {
  showOnlineMatch(machine: MultiplayerMatchMachine): void;
  presentation(): OnlinePresentation;
  playShot(angle: number, power: number): void;
  presentSkippedTurn(seat: number, angle: number, power: number, text: string): void;
  applyOfficialOutcome(outcome: ClassifiedOutcome, mine: boolean): void;
  refreshMatchResult(): void;
  refreshAimingControls(): void;
  leaveToMenu(): void;
}

interface CurrentShot {
  seq: number;
  /** live = fired here now; recovered = mine after a reload; remote = someone else's. */
  kind: 'live' | 'remote' | 'recovered';
  localOutcome: ClassifiedOutcome | null;
}

/**
 * My shot's server writes, sent strictly in order: the fire (unless already on the server), then the outcome.
 * Replaced or dropped on a rebuild or room exit; results for a dropped outbox are ignored, because the
 * session's retry loops keep running after `exit()`.
 */
interface Outbox {
  matchNumber: number;
  seq: number;
  angle: number;
  power: number;
  fired: boolean;
  outcome: ClassifiedOutcome | null;
  sending: boolean;
  /** Retries ran out: nothing is sent until the player presses Retry on the blocking banner. */
  blocked: boolean;
}

const JOIN_ERRORS: Partial<Record<string, string>> = {
  NOT_FOUND: 'No room with that code.',
  FULL: 'That room is full.',
  ALREADY_STARTED: 'That match has already started.',
};
const OFFLINE = "Couldn't reach the server. Check your connection and try again.";
const BAD_CODE = 'Room codes are 5 letters and numbers, like K7QPX.';
const CUT_SHORT = 'This match ended unexpectedly.';
const BANNER_TICK_SECONDS = 0.25;

function roomLink(code: string): string {
  const url = new URL(window.location.href);
  url.search = '';
  url.searchParams.set('room', code);
  return url.toString();
}

function setRoomParam(code: string | null): void {
  const url = new URL(window.location.href);
  if (code) url.searchParams.set('room', code);
  else url.searchParams.delete('room');
  window.history.replaceState(null, '', url);
}

/** The setup screen hands over the raw name: trim, cap and fall back before anything reaches the server. */
function cleanProfile(profile: OnlineProfile): OnlineProfile {
  return { ...profile, name: sanitizePlayerName(profile.name, 0) };
}

export class OnlineController {
  private session: OnlineSession | null = null;
  private tracker = new OnlineMatchTracker();
  private code: string | null = null;
  /** Bumped on every room enter/exit so late async results from an earlier room are ignored. */
  private epoch = 0;
  /**
   * Bumped every time the setup screen is shown. Convex queues calls while offline, so a reply can land long after
   * the user moved on; a request only acts if its screen is still the one on show.
   */
  private setupScreen = 0;
  private profile: OnlineProfile = loadOnlineProfile();
  private current: CurrentShot | null = null;
  private outbox: Outbox | null = null;
  /** undefined: no resync pending; null: resync silently; string: resync and show this notice. */
  private resyncNotice: string | null | undefined = undefined;
  private match = false;
  private connecting = false;
  private lobbyKey = '';
  private lobbyError: string | null = null;
  private resultKey = '';
  private sawRematchWindow = false;
  private lastCanAct = false;
  private bannerClock = 0;
  private readonly banner: OnlineBanner;

  constructor(private readonly menu: MenuOverlay, private readonly hooks: OnlineSceneHooks) {
    this.banner = new OnlineBanner(document.body);
  }

  get inRoom(): boolean { return this.code !== null; }
  get inMatch(): boolean { return this.match; }
  get mySeat(): number | null { return this.tracker.mySeat; }
  isMyTurnToAim(): boolean { return this.tracker.isMyTurnToAim(); }

  open(error: string | null = null, code = ''): void {
    this.setupScreen++;
    showOnlineSetup(this.menu, {
      profile: this.profile, code, error,
      onCreate: profile => void this.create(profile),
      onJoin: (profile, raw) => void this.join(profile, raw),
      onBack: () => this.menu.showMainMenu(),
    });
  }

  /**
   * `?room=CODE`: rejoin silently if this tab still holds a seat (a reload), else show Join with the code filled in.
   * A seat this tab left on purpose counts as none, so it is never re-entered without an explicit Join.
   */
  async openFromLink(raw: string): Promise<void> {
    const code = normalizeRoomCode(raw);
    if (!code) { this.open(); return; }
    // The seat check can land late; if the user has left the screen it started from, it does nothing.
    const view = this.menu.getView();
    const screen = this.setupScreen;
    let seat: number | null = null;
    try {
      seat = await this.ensureSession().peekSeat(code);
    } catch { /* fall through to the join screen */ }
    if (this.menu.getView() !== view || this.setupScreen !== screen) return;
    if (seat !== null) {
      const error = this.enter(code);
      if (error) this.open(error, code);
      return;
    }
    this.open(null, code);
  }

  /** True while the setup screen a request was made from is still the one on show. */
  private stillOnSetup(screen: number): boolean {
    return this.setupScreen === screen && this.menu.getView() === 'online_setup';
  }

  private ensureSession(): OnlineSession {
    if (!this.session) {
      const client = getConvexClient();
      if (!client) throw new Error('Online play is not configured');
      this.session = new OnlineSession(client, onlineToken());
    }
    return this.session;
  }

  private async create(raw: OnlineProfile): Promise<void> {
    if (this.connecting || this.code) return;
    const profile = cleanProfile(raw);
    this.profile = profile;
    saveOnlineProfile(profile);
    const screen = this.setupScreen;
    this.connecting = true;
    try {
      let code: string;
      try {
        code = await this.ensureSession().createRoom(profile, [...MULTIPLAYER.maps]);
      } catch (e) {
        if (this.stillOnSetup(screen)) this.open(JOIN_ERRORS[errorCode(e) ?? ''] ?? OFFLINE);
        return;
      }
      // The user moved on while this was pending: give the seat back instead of popping a lobby up.
      if (!this.stillOnSetup(screen)) { void this.session?.leaveRoom(code); return; }
      const error = this.enter(code);
      if (error) this.open(error);
    } finally {
      this.connecting = false;
    }
  }

  private async join(raw: OnlineProfile, rawCode: string): Promise<void> {
    if (this.connecting || this.code) return;
    const profile = cleanProfile(raw);
    this.profile = profile;
    saveOnlineProfile(profile);
    // The setup screen already normalizes; this guards every other caller (defence in depth).
    const code = normalizeRoomCode(rawCode);
    if (!code) { this.open(BAD_CODE, rawCode); return; }
    const screen = this.setupScreen;
    this.connecting = true;
    try {
      try {
        await this.ensureSession().joinRoom(code, profile);
      } catch (e) {
        if (this.stillOnSetup(screen)) this.open(JOIN_ERRORS[errorCode(e) ?? ''] ?? OFFLINE, code);
        return;
      }
      if (!this.stillOnSetup(screen)) { void this.session?.leaveRoom(code); return; }
      const error = this.enter(code);
      if (error) this.open(error, code);
    } finally {
      this.connecting = false;
    }
  }

  /** Subscribes to the room. Returns the session's error message (e.g. a malformed code) instead of throwing. */
  private enter(code: string): string | null {
    const epoch = ++this.epoch;
    this.code = code;
    this.tracker = new OnlineMatchTracker();
    this.match = false;
    this.current = null;
    this.outbox = null;
    this.resyncNotice = undefined;
    this.lobbyKey = '';
    this.lobbyError = null;
    this.lastCanAct = false;
    try {
      const session = this.ensureSession();
      session.enter(code, {
        onRoom: snapshot => { if (epoch === this.epoch) this.onRoom(snapshot); },
        onPresence: entries => {
          if (epoch !== this.epoch) return;
          this.tracker.setPresence(entries);
          this.renderLobbyIfShown();
        },
      });
      this.code = session.code ?? code;
    } catch (e) {
      this.epoch++;
      this.code = null;
      return e instanceof Error ? e.message : OFFLINE;
    }
    setRoomParam(this.code);
    return null;
  }

  private onRoom(snapshot: RoomSnapshot | null): void {
    const update = this.tracker.update(snapshot);
    if (update.roomGone) { this.exitWith('This room has ended.'); return; }
    if (update.removal === 'rejoin') { void this.rejoin(); return; }
    if (update.removal === 'notIncluded') { this.exitWith("You weren't included in the rematch."); return; }
    if (!snapshot || snapshot.you === null) return;
    if (snapshot.room.status === 'lobby') { this.match = false; this.renderLobby(); return; }
    if (update.rebuild) this.rebuild();
  }

  private renderLobbyIfShown(): void {
    if (this.menu.getView() === 'online_lobby') this.renderLobby();
  }

  private renderLobby(): void {
    const snapshot = this.tracker.snapshot;
    const session = this.session;
    const code = this.code;
    if (!snapshot || snapshot.you === null || snapshot.room.status !== 'lobby' || !session || !code) return;
    const connected = this.tracker.connectedSeats(session.serverNow);
    const key = JSON.stringify([snapshot.seats, snapshot.room.maps, [...connected].sort(), snapshot.you, this.lobbyError]);
    if (key === this.lobbyKey && this.menu.getView() === 'online_lobby') return;
    this.lobbyKey = key;
    const epoch = this.epoch;
    showOnlineLobby(this.menu, {
      code, link: roomLink(code), seats: snapshot.seats, connected, mySeat: snapshot.you, maps: snapshot.room.maps,
      error: this.lobbyError,
      onMaps: maps => { session.setMaps(maps).catch(() => undefined); },
      onStart: () => {
        session.startMatch().catch(e => {
          if (epoch !== this.epoch) return;
          this.lobbyError = errorCode(e) === 'NOT_ENOUGH_PLAYERS' ? 'Waiting for at least 2 connected players.' : OFFLINE;
          this.renderLobby();
        });
      },
      onLeave: () => this.leave(),
    });
  }

  /** Fast-forward over the resolved prefix; any in-flight shot is left for normal playback. */
  private rebuild(): void {
    const snapshot = this.tracker.snapshot;
    if (!snapshot) return;
    this.current = null;
    this.outbox = null;
    this.resyncNotice = undefined;
    this.sawRematchWindow = false;
    this.resultKey = '';
    let machine: MultiplayerMatchMachine;
    try {
      ({ machine } = replayMatch(
        { seats: snapshot.seats, maps: snapshot.room.maps, seed: snapshot.room.seed, shots: this.tracker.resolvedPrefix() },
        { includeInFlight: false }));
    } catch (e) {
      // Only a server bug gets here (a shot list that disagrees with the turn order).
      if (import.meta.env.DEV) console.warn('[online] cannot replay this match', e);
      this.endCutShort();
      return;
    }
    this.match = true;
    this.hooks.showOnlineMatch(machine);
  }

  /** Called every frame by the scene. */
  update(dtSeconds: number): void {
    if (!this.code || !this.session) return;
    this.bannerClock -= dtSeconds;
    if (this.bannerClock <= 0) {
      this.bannerClock = BANNER_TICK_SECONDS;
      this.refreshStatus();
    }
    if (!this.match) return;
    const view = this.hooks.presentation();
    if (this.resyncNotice !== undefined && !view.shotInFlight) {
      const notice = this.resyncNotice;
      this.tracker.resetPresentation();
      this.rebuild();
      if (notice) this.banner.flash(notice);
      return;
    }
    const current = this.current;
    if (current?.kind === 'remote' && current.localOutcome !== null) {
      const official = this.tracker.officialOutcome(current.seq);
      if (official) this.finishRemote(current, official);
    }
    if (!this.current && view.state === 'aiming' && view.ready) {
      const item = this.tracker.nextPlayback();
      if (item && item.shot.seat === view.activeSeat) this.startPlayback(item);
    }
    // Re-read: finishing or starting a shot above moves the scene on (a skipped turn resolves at once), and judging
    // the room against the stale "aiming" would mistake a match that just ended normally for a cut-short one.
    if (this.isCutShort(this.hooks.presentation())) { this.endCutShort(); return; }
    const canAct = this.tracker.isMyTurnToAim();
    if (canAct !== this.lastCanAct) {
      this.lastCanAct = canAct;
      this.hooks.refreshAimingControls();
    }
  }

  /**
   * The server may finish a match with an incomplete shot list. Once every stored shot has been shown, a match
   * that is still waiting for a turn (handover or aiming) can never reach its result screen.
   */
  private isCutShort(view: OnlinePresentation): boolean {
    const snapshot = this.tracker.snapshot;
    if (!snapshot || snapshot.room.status !== 'finished' || this.current || view.shotInFlight) return false;
    if (this.tracker.presented < snapshot.shots.length) return false;
    return view.state === 'handover' || view.state === 'aiming';
  }

  private endCutShort(): void {
    this.leaveRoomQuietly();
    this.exitWith(CUT_SHORT);
  }

  private startPlayback(item: PlaybackItem): void {
    const { shot } = item;
    if (item.kind === 'skipped') {
      const text = shot.seat === this.tracker.mySeat ? 'Your turn was skipped' : `${item.name} was skipped`;
      this.hooks.presentSkippedTurn(shot.seat, shot.angle, shot.power, text);
      this.tracker.markPresented(shot.seq);
      return;
    }
    this.current = { seq: shot.seq, kind: item.kind, localOutcome: null };
    if (item.kind === 'recovered') {
      // My shot from before a reload: already on the server, so only the outcome is still to send.
      const matchNumber = this.tracker.snapshot?.room.matchNumber ?? 0;
      this.outbox = { matchNumber, seq: shot.seq, angle: shot.angle, power: shot.power, fired: true, outcome: null, sending: false, blocked: false };
    }
    this.hooks.playShot(shot.angle, shot.power);
  }

  /** The local player pressed Fire on their own turn (the scene has already launched the ball). */
  onUserFire(angle: number, power: number): void {
    const snapshot = this.tracker.snapshot;
    // Defence in depth: the scene already gates Fire, but a stray call must never send a shot out of turn.
    if (!this.session || !snapshot || this.current || !this.tracker.isMyTurnToAim()) return;
    const seq = this.tracker.nextFireSeq();
    this.tracker.markFiredByMe(seq);
    this.current = { seq, kind: 'live', localOutcome: null };
    const box: Outbox = { matchNumber: snapshot.room.matchNumber, seq, angle, power, fired: false, outcome: null, sending: false, blocked: false };
    this.outbox = box;
    this.pump(box);
  }

  /** The local simulation of the current shot resolved. */
  onLocalResolution(outcome: ClassifiedOutcome): void {
    const current = this.current;
    const session = this.session;
    const snapshot = this.tracker.snapshot;
    if (!current || !session || !snapshot) return;
    current.localOutcome = outcome;
    if (current.kind === 'remote') {
      const official = this.tracker.officialOutcome(current.seq);
      if (official) this.finishRemote(current, official);
      else session.reportWitness({ matchNumber: snapshot.room.matchNumber, seq: current.seq, outcome });
      return;
    }
    // My shot (live or recovered): my outcome is the official one.
    this.hooks.applyOfficialOutcome(outcome, true);
    this.tracker.markPresented(current.seq);
    this.current = null;
    const box = this.outbox;
    if (this.resyncNotice !== undefined || !box || box.seq !== current.seq) return;
    box.outcome = outcome;
    this.pump(box);
  }

  private finishRemote(current: CurrentShot, official: ClassifiedOutcome): void {
    if (import.meta.env.DEV && current.localOutcome !== official) {
      console.warn(`[online] shot ${current.seq}: local ${current.localOutcome ?? 'none'}, official ${official}`);
    }
    this.hooks.applyOfficialOutcome(official, false);
    this.tracker.markPresented(current.seq);
    this.current = null;
  }

  /** Sends the next pending write of my shot: the fire first, the outcome only once the fire is on the server. */
  private pump(box: Outbox): void {
    const session = this.session;
    if (!session || box !== this.outbox || box.sending || box.blocked) return;
    const { matchNumber, seq } = box;
    let send: () => Promise<void>;
    let notice: string;
    if (!box.fired) {
      send = () => session.fireShot({ matchNumber, seq, angle: box.angle, power: box.power });
      notice = 'Your turn was skipped';
    } else if (box.outcome !== null) {
      const outcome = box.outcome;
      send = () => session.reportOutcome({ matchNumber, seq, outcome });
      notice = 'Your shot timed out';
    } else {
      return; // fired; the outcome follows when the local shot resolves
    }
    box.sending = true;
    send().then(() => {
      if (box !== this.outbox) return;
      box.sending = false;
      if (!box.fired) { box.fired = true; this.pump(box); } else this.outbox = null;
    }, (e: unknown) => {
      if (box !== this.outbox) return;
      box.sending = false;
      this.onRejected(e, notice, box);
    });
  }

  private onRejected(error: unknown, notice: string, box: Outbox): void {
    const code = errorCode(error);
    if (code === null) {
      // Every retry failed: block until the player retries; the server's timers keep the others moving.
      box.blocked = true;
      this.banner.setBlocking("Couldn't reach the room.", () => {
        this.banner.setBlocking(null);
        box.blocked = false;
        this.pump(box);
      });
      return;
    }
    this.outbox = null;
    if (code === 'NOT_YOUR_TURN' || code === 'CONFLICT') { this.resyncNotice = notice; return; }
    if (import.meta.env.DEV) console.warn(`[online] rejected with ${code}; resyncing`);
    this.resyncNotice = null;
  }

  requestRematch(): void {
    const snapshot = this.tracker.snapshot;
    if (snapshot) this.session?.requestRematch(snapshot.room.matchNumber);
  }

  resultExtras(): OnlineResultExtras {
    const snapshot = this.tracker.snapshot;
    const session = this.session;
    if (!snapshot || !session) return { ready: [], countdown: null, note: null, canRematch: false };
    const me = snapshot.seats.find(s => s.seat === snapshot.you);
    const countdown = this.tracker.countdowns(session.serverNow).rematch;
    if (countdown !== null) this.sawRematchWindow = true;
    const finished = snapshot.room.status === 'finished';
    return {
      ready: snapshot.seats.filter(s => !s.left).map(s => ({ name: s.name, color: s.color, ready: s.rematchReady })),
      countdown,
      note: finished && this.sawRematchWindow && countdown === null ? 'Not enough players — press Rematch to try again.' : null,
      canRematch: finished && me !== undefined && !me.left && !me.rematchReady,
    };
  }

  private refreshStatus(): void {
    const session = this.session;
    if (!session) return;
    this.renderLobbyIfShown();
    if (!session.connected) { this.banner.setText('Reconnecting…'); return; }
    if (!this.match) { this.banner.setText(null); return; }
    const now = session.serverNow;
    // Proves we are still here right at the turn limit, so the server can skip the turn at once.
    if (this.tracker.takeTurnExpiry(now)) session.heartbeat();
    const c = this.tracker.countdowns(now);
    if (c.missing) this.banner.setText(`Waiting for ${c.missing.name}… skipping in ${c.missing.secondsLeft} s`);
    else if (c.turn) this.banner.setText(c.turn.seat === this.tracker.mySeat ? `${c.turn.secondsLeft} s left to fire` : `${c.turn.name}: ${c.turn.secondsLeft} s left`);
    else this.banner.setText(null);
    if (this.hooks.presentation().state === 'match_result') {
      const key = JSON.stringify(this.resultExtras());
      if (key !== this.resultKey) {
        this.resultKey = key;
        this.hooks.refreshMatchResult();
      }
    }
  }

  /** Leave on purpose: never auto-rejoins (the tracker ignores the seat disappearing). */
  leave(): void {
    if (!this.session || !this.code) return;
    this.leaveRoomQuietly();
    this.closeRoom();
    this.hooks.leaveToMenu();
    this.open();
  }

  /** `leaveRoom` captures the room code synchronously, so it must run before `exit()` (inside `closeRoom`). */
  private leaveRoomQuietly(): void {
    this.tracker.markLeaving();
    void this.session?.leaveRoom();
  }

  private exitWith(message: string): void {
    this.closeRoom();
    this.hooks.leaveToMenu();
    showOnlineNotice(this.menu, message, () => this.open());
  }

  private closeRoom(): void {
    this.epoch++;
    this.session?.exit();
    this.code = null;
    this.match = false;
    this.current = null;
    this.outbox = null;
    this.resyncNotice = undefined;
    this.lastCanAct = false;
    this.banner.setBlocking(null);
    this.banner.setText(null);
    setRoomParam(null);
  }

  private async rejoin(): Promise<void> {
    const session = this.session;
    const code = this.code;
    if (!session || !code) return;
    const epoch = this.epoch;
    try {
      await session.joinRoom(code, this.profile);
    } catch (e) {
      if (epoch !== this.epoch) return; // left (or moved rooms) meanwhile
      const c = errorCode(e);
      this.exitWith(c === 'FULL' ? 'The room filled up while you were away.'
        : c === 'ALREADY_STARTED' ? 'That match started without you.' : 'This room has ended.');
    }
  }

  destroy(): void {
    this.epoch++;
    this.outbox = null;
    this.session?.exit();
    this.banner.destroy();
  }
}
