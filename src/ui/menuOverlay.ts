import { MAPS } from '../levels';
import { MULTIPLAYER } from '../config/tuning';
import { defaultPlayerSetups, loadSaveData, sanitizePlayerName, saveMultiplayerSetup } from '../storage/storage';

import type { MPPlayerSetup, MPPlayerView } from '../rules/multiplayerMatch';

export interface MenuCallbacks {
  onMapSelected: (mapId: string) => void;
  onRetry: () => void;
  onReturnToMenu: () => void;
  onStartMultiplayer?: (players: MPPlayerSetup[]) => void;
  onMultiplayerHandoverContinue?: () => void;
  onMultiplayerNextRound?: () => void;
  onMultiplayerRematch?: () => void;
  onPauseResume?: () => void;
  onPauseQuit?: () => void;
  onSettingsChange?: (settings: { muted: boolean; volume: number; reducedMotion: boolean }) => void;
}

export type MenuOverlayView = 'none' | 'main' | 'map_select' | 'multi_setup' | 'settings' | 'handover' | 'round_result' | 'match_result' | 'solo_result' | 'pause';

export class MenuOverlay {
  private container: HTMLElement;
  private content: HTMLElement;
  private clickAbortController: AbortController | null = null;
  private currentView: MenuOverlayView = 'none';
  
  constructor(private parentElement: HTMLElement, private callbacks: MenuCallbacks) {
    this.container = document.createElement('div');
    this.container.className = 'menu-overlay';
    
    this.content = document.createElement('div');
    this.content.className = 'menu-content';
    this.container.appendChild(this.content);
    
    parentElement.appendChild(this.container);
  }

  private clear(): void {
    if (this.clickAbortController) {
      this.clickAbortController.abort();
      this.clickAbortController = null;
    }
    this.content.innerHTML = '';
  }

  getView(): MenuOverlayView {
    return this.currentView;
  }

  isPauseMenuVisible(): boolean {
    return this.currentView === 'pause' && this.isVisible();
  }

  showMainMenu(): void {
    this.currentView = 'main';
    this.container.style.display = 'flex';
    this.clear();
    this.clickAbortController = new AbortController();

    const title = document.createElement('h1');
    title.textContent = 'Hit Jonh';
    this.content.appendChild(title);

    const btnSolo = document.createElement('button');
    btnSolo.className = 'btn';
    btnSolo.textContent = 'Solo Challenge';
    btnSolo.addEventListener('click', () => this.showMapSelect(), { signal: this.clickAbortController.signal });
    this.content.appendChild(btnSolo);

    const btnMulti = document.createElement('button');
    btnMulti.className = 'btn';
    btnMulti.textContent = 'Local Multiplayer';
    btnMulti.addEventListener('click', () => this.showMultiSetup(), { signal: this.clickAbortController.signal });
    this.content.appendChild(btnMulti);

    const btnSettings = document.createElement('button');
    btnSettings.className = 'btn btn-menu';
    btnSettings.textContent = 'Settings';
    btnSettings.style.marginTop = '10px';
    btnSettings.addEventListener('click', () => this.showSettings(), { signal: this.clickAbortController.signal });
    this.content.appendChild(btnSettings);

    btnSolo.focus();
  }

  showSettings(): void {
    this.currentView = 'settings';
    this.container.style.display = 'flex';
    this.clear();
    this.clickAbortController = new AbortController();

    const data = loadSaveData();
    let { muted, volume, reducedMotion } = data.settings;

    const title = document.createElement('h2');
    title.textContent = 'Settings';
    this.content.appendChild(title);

    const settingsList = document.createElement('div');
    settingsList.style.display = 'flex';
    settingsList.style.flexDirection = 'column';
    settingsList.style.gap = '16px';
    settingsList.style.marginBottom = '20px';
    settingsList.style.width = '100%';
    settingsList.style.maxWidth = '320px';

    // Mute row
    const muteRow = document.createElement('label');
    muteRow.style.display = 'flex';
    muteRow.style.alignItems = 'center';
    muteRow.style.justifyContent = 'space-between';
    muteRow.style.cursor = 'pointer';
    const muteText = document.createElement('span');
    muteText.textContent = 'Mute Audio';
    const muteCheck = document.createElement('input');
    muteCheck.type = 'checkbox';
    muteCheck.checked = muted;
    muteCheck.addEventListener('change', () => {
      muted = muteCheck.checked;
      this.callbacks.onSettingsChange?.({ muted, volume, reducedMotion });
    }, { signal: this.clickAbortController.signal });
    muteRow.append(muteText, muteCheck);
    settingsList.appendChild(muteRow);

    // Volume row
    const volumeRow = document.createElement('div');
    volumeRow.style.display = 'flex';
    volumeRow.style.flexDirection = 'column';
    volumeRow.style.gap = '6px';
    const volLabelRow = document.createElement('div');
    volLabelRow.style.display = 'flex';
    volLabelRow.style.justifyContent = 'space-between';
    const volText = document.createElement('span');
    volText.textContent = 'Master Volume';
    const volValue = document.createElement('span');
    volValue.textContent = `${Math.round(volume * 100)}%`;
    volLabelRow.append(volText, volValue);

    const volSlider = document.createElement('input');
    volSlider.type = 'range';
    volSlider.min = '0';
    volSlider.max = '100';
    volSlider.step = '5';
    volSlider.value = String(Math.round(volume * 100));
    volSlider.addEventListener('input', () => {
      const val = Number.parseInt(volSlider.value, 10);
      volume = val / 100;
      volValue.textContent = `${val}%`;
      this.callbacks.onSettingsChange?.({ muted, volume, reducedMotion });
    }, { signal: this.clickAbortController.signal });
    volumeRow.append(volLabelRow, volSlider);
    settingsList.appendChild(volumeRow);

    // Reduced Motion row
    const motionRow = document.createElement('label');
    motionRow.style.display = 'flex';
    motionRow.style.alignItems = 'center';
    motionRow.style.justifyContent = 'space-between';
    motionRow.style.cursor = 'pointer';
    const motionText = document.createElement('span');
    motionText.textContent = 'Reduced Motion';
    const motionCheck = document.createElement('input');
    motionCheck.type = 'checkbox';
    motionCheck.checked = reducedMotion;
    motionCheck.addEventListener('change', () => {
      reducedMotion = motionCheck.checked;
      this.callbacks.onSettingsChange?.({ muted, volume, reducedMotion });
    }, { signal: this.clickAbortController.signal });
    motionRow.append(motionText, motionCheck);
    settingsList.appendChild(motionRow);

    this.content.appendChild(settingsList);

    const backBtn = document.createElement('button');
    backBtn.className = 'btn btn-menu';
    backBtn.textContent = 'Back';
    backBtn.addEventListener('click', () => {
      this.showMainMenu();
    }, { signal: this.clickAbortController.signal });
    this.content.appendChild(backBtn);
    backBtn.focus();
  }


  showMapSelect(): void {
    this.currentView = 'map_select';
    this.container.style.display = 'flex';
    this.clear();
    this.clickAbortController = new AbortController();

    const data = loadSaveData();
    
    const title = document.createElement('h2');
    title.textContent = 'Select Map';
    this.content.appendChild(title);

    const list = document.createElement('div');
    list.className = 'map-list';

    for (const map of MAPS) {
      const score = data.solo[map.id];
      const bestText = (score && score.bestShots !== null)
        ? `Best: ${score.bestShots} shot${score.bestShots > 1 ? 's' : ''} ${score.hasStyle ? '✨' : ''}`
        : 'Unplayed';
        
      const btn = document.createElement('button');
      btn.className = 'map-btn';
      btn.dataset.map = map.id;

      const nameDiv = document.createElement('div');
      nameDiv.className = 'map-name';
      nameDiv.textContent = map.name; // Text content prevents XSS

      const scoreDiv = document.createElement('div');
      scoreDiv.className = 'map-score';
      scoreDiv.textContent = bestText;

      btn.appendChild(nameDiv);
      btn.appendChild(scoreDiv);

      btn.addEventListener('click', () => {
        this.callbacks.onMapSelected(map.id);
        this.hide();
      }, { signal: this.clickAbortController.signal });

      list.appendChild(btn);
    }

    this.content.appendChild(list);

    const backBtn = document.createElement('button');
    backBtn.className = 'btn btn-menu';
    backBtn.textContent = 'Back';
    backBtn.style.marginTop = '20px';
    backBtn.addEventListener('click', () => {
      this.callbacks.onReturnToMenu();
      this.showMainMenu();
    }, { signal: this.clickAbortController.signal });
    this.content.appendChild(backBtn);
    (list.firstElementChild as HTMLElement | null)?.focus();
  }

  showMultiSetup(): void {
    this.currentView = 'multi_setup';
    this.container.style.display = 'flex';
    this.clear();
    this.clickAbortController = new AbortController();

    const title = document.createElement('h2');
    title.textContent = 'Multiplayer Setup';
    this.content.appendChild(title);

    let playerCount = 2;
    // Load last MP setup if available (storage already validated count, appearance, names and aim)
    const loadedSetups = loadSaveData().lastMP;

    const playerSetups: MPPlayerSetup[] = defaultPlayerSetups();
    if (loadedSetups) {
      playerCount = loadedSetups.length;
      loadedSetups.forEach((loaded, i) => { playerSetups[i] = { ...loaded }; });
    }

    const countContainer = document.createElement('div');
    countContainer.style.marginBottom = '20px';
    const countLabel = document.createElement('span');
    countLabel.textContent = `Players: ${playerCount} `;
    
    const countMinus = document.createElement('button');
    countMinus.textContent = '-';
    countMinus.className = 'btn';
    countMinus.style.marginRight = '10px';
    
    const countPlus = document.createElement('button');
    countPlus.textContent = '+';
    countPlus.className = 'btn';

    countContainer.append(countMinus, countLabel, countPlus);
    this.content.appendChild(countContainer);

    const list = document.createElement('div');
    list.style.display = 'flex';
    list.style.flexDirection = 'column';
    list.style.gap = '10px';
    list.style.marginBottom = '20px';
    this.content.appendChild(list);

    const renderList = () => {
      list.innerHTML = '';
      countLabel.textContent = `Players: ${playerCount} `;
      for (let i = 0; i < playerCount; i++) {
        const row = document.createElement('div');
        row.style.display = 'flex';
        row.style.gap = '10px';
        row.style.alignItems = 'center';

        const nameLabel = document.createElement('label');
        nameLabel.htmlFor = `mp-name-${i}`;
        nameLabel.textContent = `Player ${i + 1} name`;

        const nameInput = document.createElement('input');
        nameInput.type = 'text';
        nameInput.id = `mp-name-${i}`;
        nameInput.maxLength = MULTIPLAYER.maxNameLength;
        nameInput.value = playerSetups[i]!.name;
        nameInput.onchange = (e) => playerSetups[i]!.name = sanitizePlayerName((e.target as HTMLInputElement).value, i);

        row.append(nameLabel, nameInput);
        list.appendChild(row);
      }
    };
    renderList();

    countMinus.onclick = () => { if (playerCount > MULTIPLAYER.minPlayers) { playerCount--; renderList(); } };
    countPlus.onclick = () => { if (playerCount < MULTIPLAYER.maxPlayers) { playerCount++; renderList(); } };

    const startBtn = document.createElement('button');
    startBtn.className = 'btn';
    startBtn.textContent = 'Start Match';
    startBtn.onclick = () => {
      const finalSetups = playerSetups.slice(0, playerCount).map((s, i) => ({ ...s, name: sanitizePlayerName(s.name, i) }));
      saveMultiplayerSetup(finalSetups);
      this.hide();
      this.callbacks.onStartMultiplayer?.(finalSetups);
    };
    this.content.appendChild(startBtn);

    const backBtn = document.createElement('button');
    backBtn.className = 'btn btn-menu';
    backBtn.textContent = 'Back';
    backBtn.style.marginTop = '20px';
    backBtn.addEventListener('click', () => {
      this.hide();
      this.callbacks.onReturnToMenu();
      this.showMainMenu();
    }, { signal: this.clickAbortController.signal });
    this.content.appendChild(backBtn);
    startBtn.focus();
  }

  showMPHandover(player: MPPlayerView, mapName: string, attemptNum: number): void {
    this.currentView = 'handover';
    this.container.style.display = 'flex';
    this.clear();
    this.clickAbortController = new AbortController();

    const title = document.createElement('h2');
    title.textContent = `Get ready, ${player.name}!`;
    this.content.appendChild(title);

    const info = document.createElement('p');
    info.textContent = `Map: ${mapName} | Shot: ${attemptNum}/${MULTIPLAYER.shotsPerRound}`;
    this.content.appendChild(info);

    const btn = document.createElement('button');
    btn.className = 'btn';
    btn.textContent = 'Continue';
    btn.addEventListener('click', () => {
      this.hide();
      this.callbacks.onMultiplayerHandoverContinue?.();
    }, { signal: this.clickAbortController.signal });
    this.content.appendChild(btn);
    btn.focus();
  }

  showMPRoundResult(players: readonly MPPlayerView[], roundIndex: number): void {
    this.currentView = 'round_result';
    this.container.style.display = 'flex';
    this.clear();
    this.clickAbortController = new AbortController();

    const title = document.createElement('h2');
    title.textContent = 'Round Complete';
    this.content.appendChild(title);

    const list = document.createElement('div');
    for (const p of [...players].sort((a, b) => b.totalScore - a.totalScore)) {
      const row = document.createElement('div');
      row.textContent = `${p.name}: ${p.totalScore} pts (+${p.roundScores[roundIndex]})`;
      list.appendChild(row);
    }
    this.content.appendChild(list);

    const btn = document.createElement('button');
    btn.className = 'btn';
    btn.textContent = roundIndex >= MULTIPLAYER.maps.length - 1 ? 'Final Result' : 'Next Round';
    btn.addEventListener('click', () => {
      this.hide();
      this.callbacks.onMultiplayerNextRound?.();
    }, { signal: this.clickAbortController.signal });
    this.content.appendChild(btn);
    btn.focus();
  }

  showMPMatchResult(winners: readonly MPPlayerView[], players: readonly MPPlayerView[]): void {
    this.currentView = 'match_result';
    this.container.style.display = 'flex';
    this.clear();
    this.clickAbortController = new AbortController();

    const title = document.createElement('h2');
    title.textContent = winners.length > 1 ? 'Match Tied!' : `${winners[0]?.name ?? 'Nobody'} Wins!`;
    this.content.appendChild(title);

    const list = document.createElement('div');
    for (const p of [...players].sort((a, b) => (b.totalScore === a.totalScore) ? b.bodyHits - a.bodyHits : b.totalScore - a.totalScore)) {
      const row = document.createElement('div');
      row.textContent = `${p.name}: ${p.totalScore} pts, ${p.bodyHits} hits`;
      list.appendChild(row);
    }
    this.content.appendChild(list);

    const rematchBtn = document.createElement('button');
    rematchBtn.className = 'btn';
    rematchBtn.textContent = 'Rematch';
    rematchBtn.addEventListener('click', () => {
      this.hide();
      this.callbacks.onMultiplayerRematch?.();
    }, { signal: this.clickAbortController.signal });
    this.content.appendChild(rematchBtn);
    rematchBtn.focus();

    const menuBtn = document.createElement('button');
    menuBtn.className = 'btn btn-menu';
    menuBtn.textContent = 'Main Menu';
    menuBtn.style.marginTop = '10px';
    menuBtn.addEventListener('click', () => {
      this.hide();
      this.callbacks.onReturnToMenu();
      this.showMainMenu();
    }, { signal: this.clickAbortController.signal });
    this.content.appendChild(menuBtn);
  }

  showSoloResult(success: boolean, shots: number, stars: number, hasStyle: boolean): void {
    this.currentView = 'solo_result';
    this.container.style.display = 'flex';
    this.clear();
    this.clickAbortController = new AbortController();

    const title = document.createElement('h2');
    title.textContent = success ? 'Challenge Complete!' : 'Challenge Failed';
    this.content.appendChild(title);

    if (success) {
      const starsDiv = document.createElement('div');
      starsDiv.className = 'result-stars';
      starsDiv.textContent = '★'.repeat(stars) + '☆'.repeat(3 - stars);
      this.content.appendChild(starsDiv);

      const desc = document.createElement('p');
      desc.textContent = `You hit Jonh in ${shots} shot${shots > 1 ? 's' : ''}!`;
      this.content.appendChild(desc);

      if (hasStyle) {
        const styleBonus = document.createElement('p');
        styleBonus.className = 'style-bonus';
        styleBonus.textContent = '✨ Ricochet Style Bonus! ✨';
        this.content.appendChild(styleBonus);
      }
    } else {
      const p1 = document.createElement('p');
      p1.textContent = 'You used all 3 attempts.';
      const p2 = document.createElement('p');
      p2.textContent = 'Jonh is unimpressed.';
      this.content.appendChild(p1);
      this.content.appendChild(p2);
    }

    const actions = document.createElement('div');
    actions.className = 'result-actions';

    const retryBtn = document.createElement('button');
    retryBtn.className = 'btn btn-retry';
    retryBtn.textContent = 'Retry Map';
    retryBtn.addEventListener('click', () => {
      this.hide();
      this.callbacks.onRetry();
    }, { signal: this.clickAbortController.signal });
    actions.appendChild(retryBtn);

    const menuBtn = document.createElement('button');
    menuBtn.className = 'btn btn-menu';
    menuBtn.textContent = 'Change Map';
    menuBtn.addEventListener('click', () => {
      this.callbacks.onReturnToMenu();
    }, { signal: this.clickAbortController.signal });
    actions.appendChild(menuBtn);

    this.content.appendChild(actions);
    retryBtn.focus();
  }

  showPauseMenu(): void {
    this.currentView = 'pause';
    this.container.style.display = 'flex';
    this.clear();
    this.clickAbortController = new AbortController();

    const title = document.createElement('h2');
    title.textContent = 'Paused';
    this.content.appendChild(title);

    const resumeBtn = document.createElement('button');
    resumeBtn.className = 'btn';
    resumeBtn.textContent = 'Resume';
    resumeBtn.addEventListener('click', () => {
      this.hide();
      this.callbacks.onPauseResume?.();
    }, { signal: this.clickAbortController.signal });
    this.content.appendChild(resumeBtn);

    const quitBtn = document.createElement('button');
    quitBtn.className = 'btn btn-menu';
    quitBtn.textContent = 'Quit to Menu';
    quitBtn.style.marginTop = '10px';
    quitBtn.addEventListener('click', () => {
      this.hide();
      this.callbacks.onPauseQuit?.();
    }, { signal: this.clickAbortController.signal });
    this.content.appendChild(quitBtn);

    resumeBtn.focus();
  }

  hide(): void {
    this.currentView = 'none';
    this.container.style.display = 'none';
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  }

  isVisible(): boolean {
    return this.container.style.display !== 'none';
  }


  destroy(): void {
    if (this.clickAbortController) {
      this.clickAbortController.abort();
    }
    this.parentElement.removeChild(this.container);
  }
}
