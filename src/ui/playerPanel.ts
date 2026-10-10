import { cssColor, playerDisplayColor } from '../art/palette';
import { cannonFigureSvg } from '../art/cannonArt';
import type { MPPlayerView, MPState } from '../rules/multiplayerMatch';

export interface OnlinePlayerPresence {
  code: string;
  mySeat: number | null;
  connected: readonly number[];
  left: readonly number[];
  reconnecting: boolean;
}

/** Persistent roster outside the playfield; seat order stays stable as scores change. */
export class PlayerPanel {
  private readonly root = document.createElement('aside');
  private readonly heading = document.createElement('div');
  private readonly turn = document.createElement('div');
  private readonly list = document.createElement('ol');
  private players: readonly MPPlayerView[] = [];
  private active: number | null = null;
  private state: MPState = 'handover';
  private online: OnlinePlayerPresence | null = null;
  private visible = false;
  private key = '';

  constructor(private readonly stage: HTMLElement) {
    this.root.className = 'player-panel';
    this.root.setAttribute('aria-label', 'Players and scores');
    this.heading.className = 'player-panel-heading';
    this.turn.className = 'player-panel-turn';
    this.turn.setAttribute('role', 'status');
    this.list.className = 'player-panel-list';
    this.root.append(this.heading, this.turn, this.list);
    stage.appendChild(this.root);
    this.setVisible(false);
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    const shown = visible && this.players.length > 0;
    this.root.hidden = !shown;
    this.stage.classList.toggle('has-player-panel', shown);
  }

  update(players: readonly MPPlayerView[], active: number | null, state: MPState): void {
    this.players = players;
    this.active = active;
    this.state = state;
    if (!players.length) this.online = null;
    this.setVisible(this.visible);
    this.render();
  }

  setOnlinePresence(online: OnlinePlayerPresence | null): void {
    this.online = online;
    this.render();
  }

  private render(): void {
    const key = JSON.stringify([this.players, this.active, this.state, this.online]);
    if (key === this.key) return;
    this.key = key;
    this.heading.textContent = this.online ? `Players · ${this.online.code}` : 'Players · Local';
    const active = this.players.find(p => p.id === this.active);
    const phase = this.state === 'simulating' ? 'Firing' : this.state === 'result' ? 'Shot complete'
      : this.state === 'handover' ? 'Up next' : 'Aiming';
    const message = active ? `${active.name} · ${phase}` : this.state === 'match_result' ? 'Match finished' : 'Round complete';
    if (this.turn.textContent !== message) this.turn.textContent = message;
    this.list.replaceChildren();
    for (const player of this.players) {
      const isActive = player.id === this.active;
      const row = document.createElement('li');
      row.className = `player-tab${isActive ? ' is-active' : ''}`;
      if (isActive) row.setAttribute('aria-current', 'true');
      row.style.setProperty('--player-color', cssColor(playerDisplayColor(player.color)));
      const avatar = document.createElement('span');
      avatar.className = 'player-tab-avatar';
      avatar.innerHTML = cannonFigureSvg(player.color, player.pattern);
      const details = document.createElement('div');
      details.className = 'player-tab-details';
      const name = document.createElement('strong');
      name.className = 'player-tab-name';
      name.textContent = player.name;
      name.title = player.name;
      if (this.online?.mySeat === player.id) {
        const you = document.createElement('small');
        you.className = 'player-tab-you';
        you.textContent = 'You';
        name.append(you);
      }
      const status = document.createElement('span');
      status.className = 'player-tab-status';
      const presence = !this.online ? 'Here' : this.online.left.includes(player.id) ? 'Left'
        : this.online.reconnecting ? 'Connection unknown'
        : this.online.connected.includes(player.id) ? 'Online' : 'Away';
      status.textContent = isActive ? `${phase} · ${presence}` : presence;
      details.append(name, status);
      const score = document.createElement('span');
      score.className = 'player-tab-score';
      const points = document.createElement('b');
      points.textContent = String(player.totalScore);
      const unit = document.createElement('small');
      unit.textContent = 'pts';
      score.append(points, unit);
      row.append(avatar, details, score);
      this.list.appendChild(row);
    }
  }

  destroy(): void {
    this.stage.classList.remove('has-player-panel');
    this.root.remove();
  }
}
