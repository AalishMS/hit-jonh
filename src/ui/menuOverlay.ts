import { MAPS } from '../levels';
import { loadSaveData } from '../storage/storage';

import type { MPPlayerSetup, MPPlayerRecord } from '../rules/multiplayerMatch';

export interface MenuCallbacks {
  onMapSelected: (mapId: string) => void;
  onRetry: () => void;
  onReturnToMenu: () => void;
  onStartMultiplayer?: (players: MPPlayerSetup[]) => void;
  onMultiplayerHandoverContinue?: () => void;
  onMultiplayerNextRound?: () => void;
  onMultiplayerRematch?: () => void;
}

export class MenuOverlay {
  private container: HTMLElement;
  private content: HTMLElement;
  private clickAbortController: AbortController | null = null;
  
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

  showMainMenu(): void {
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
  }

  showMapSelect(): void {
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
    backBtn.addEventListener('click', () => this.showMainMenu(), { signal: this.clickAbortController.signal });
    this.content.appendChild(backBtn);
  }

  showMultiSetup(): void {
    this.container.style.display = 'flex';
    this.clear();
    this.clickAbortController = new AbortController();

    const title = document.createElement('h2');
    title.textContent = 'Multiplayer Setup';
    this.content.appendChild(title);

    let playerCount = 2;
    // Load last MP setup if available
    const data = loadSaveData();
    const loadedSetups = data.lastMP;
    
    const defaultSetups: MPPlayerSetup[] = [
      { name: 'Player 1', color: 0xff4444, pattern: 'solid', lastAngle: 45, lastPower: 50 },
      { name: 'Player 2', color: 0x4444ff, pattern: 'stripes', lastAngle: 45, lastPower: 50 },
      { name: 'Player 3', color: 0x44ff44, pattern: 'dots', lastAngle: 45, lastPower: 50 },
      { name: 'Player 4', color: 0xffaa00, pattern: 'checks', lastAngle: 45, lastPower: 50 }
    ];
    
    const playerSetups = defaultSetups.map(s => ({ ...s }));
    if (loadedSetups && loadedSetups.length >= 2) {
       playerCount = Math.min(4, loadedSetups.length);
       for (let i = 0; i < playerCount; i++) {
         const loaded = loadedSetups[i];
         if (loaded) {
           playerSetups[i] = {
             ...defaultSetups[i],
             ...loaded,
             lastAngle: loaded.lastAngle ?? defaultSetups[i]!.lastAngle,
             lastPower: loaded.lastPower ?? defaultSetups[i]!.lastPower,
           };
         }
       }
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

        const nameInput = document.createElement('input');
        nameInput.type = 'text';
        nameInput.value = playerSetups[i]!.name;
        nameInput.onchange = (e) => playerSetups[i]!.name = (e.target as HTMLInputElement).value || `Player ${i+1}`;
        
        row.append(nameInput);
        list.appendChild(row);
      }
    };
    renderList();

    countMinus.onclick = () => { if (playerCount > 2) { playerCount--; renderList(); } };
    countPlus.onclick = () => { if (playerCount < 4) { playerCount++; renderList(); } };

    const startBtn = document.createElement('button');
    startBtn.className = 'btn';
    startBtn.textContent = 'Start Match';
    startBtn.onclick = () => {
      const finalSetups = playerSetups.slice(0, playerCount);
      const toSave = loadSaveData();
      toSave.lastMP = finalSetups;
      import('../storage/storage').then(s => s.writeSaveData(toSave)); // Hack to avoid circular issues if any, but regular import is fine.
      this.hide();
      this.callbacks.onStartMultiplayer?.(finalSetups);
    };
    this.content.appendChild(startBtn);

    const backBtn = document.createElement('button');
    backBtn.className = 'btn btn-menu';
    backBtn.textContent = 'Back';
    backBtn.style.marginTop = '20px';
    backBtn.addEventListener('click', () => { this.hide(); this.showMainMenu(); }, { signal: this.clickAbortController.signal });
    this.content.appendChild(backBtn);
  }

  showMPHandover(player: MPPlayerRecord, mapName: string, attemptNum: number): void {
    this.container.style.display = 'flex';
    this.clear();
    this.clickAbortController = new AbortController();

    const title = document.createElement('h2');
    title.textContent = `Get ready, ${player.name}!`;
    this.content.appendChild(title);

    const info = document.createElement('p');
    info.textContent = `Map: ${mapName} | Shot: ${attemptNum}/3`;
    this.content.appendChild(info);

    const btn = document.createElement('button');
    btn.className = 'btn';
    btn.textContent = 'Continue';
    btn.addEventListener('click', () => {
      this.hide();
      this.callbacks.onMultiplayerHandoverContinue?.();
    }, { signal: this.clickAbortController.signal });
    this.content.appendChild(btn);
  }

  showMPRoundResult(players: MPPlayerRecord[], roundIndex: number): void {
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
    btn.textContent = 'Next Round';
    btn.addEventListener('click', () => {
      this.hide();
      this.callbacks.onMultiplayerNextRound?.();
    }, { signal: this.clickAbortController.signal });
    this.content.appendChild(btn);
  }

  showMPMatchResult(winners: MPPlayerRecord[], players: MPPlayerRecord[]): void {
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

    const menuBtn = document.createElement('button');
    menuBtn.className = 'btn btn-menu';
    menuBtn.textContent = 'Main Menu';
    menuBtn.style.marginTop = '10px';
    menuBtn.addEventListener('click', () => { this.hide(); this.showMainMenu(); }, { signal: this.clickAbortController.signal });
    this.content.appendChild(menuBtn);
  }

  showSoloResult(success: boolean, shots: number, stars: number, hasStyle: boolean): void {
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
  }

  hide(): void {
    this.container.style.display = 'none';
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
