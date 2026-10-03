import { MAPS } from '../levels';
import { loadSaveData } from '../storage/storage';

export interface MenuCallbacks {
  onMapSelected: (mapId: string) => void;
  onRetry: () => void;
  onReturnToMenu: () => void;
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
