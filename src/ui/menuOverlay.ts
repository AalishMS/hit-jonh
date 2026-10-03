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
  
  constructor(parentElement: HTMLElement, private callbacks: MenuCallbacks) {
    this.container = document.createElement('div');
    this.container.className = 'menu-overlay';
    
    this.content = document.createElement('div');
    this.content.className = 'menu-content';
    this.container.appendChild(this.content);
    
    parentElement.appendChild(this.container);
  }

  showMapSelect(): void {
    this.container.style.display = 'flex';
    const data = loadSaveData();
    
    let html = `<h2>Select Map</h2><div class="map-list">`;
    for (const map of MAPS) {
      const score = data.solo[map.id];
      const bestText = score 
        ? `Best: ${score.bestShots} shot${score.bestShots > 1 ? 's' : ''} ${score.hasStyle ? '✨' : ''}`
        : 'Unplayed';
        
      html += `
        <button class="map-btn" data-map="${map.id}">
          <div class="map-name">${map.name}</div>
          <div class="map-score">${bestText}</div>
        </button>
      `;
    }
    html += `</div>`;
    
    this.content.innerHTML = html;
    
    const btns = this.content.querySelectorAll('.map-btn');
    btns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        const mapId = (e.currentTarget as HTMLButtonElement).getAttribute('data-map')!;
        this.callbacks.onMapSelected(mapId);
        this.hide();
      });
    });
  }

  showSoloResult(success: boolean, shots: number, stars: number, hasStyle: boolean): void {
    this.container.style.display = 'flex';
    let html: string;
    
    if (success) {
      const starStr = '★'.repeat(stars) + '☆'.repeat(3 - stars);
      html = `
        <h2>Challenge Complete!</h2>
        <div class="result-stars">${starStr}</div>
        <p>You hit Jonh in ${shots} shot${shots > 1 ? 's' : ''}!</p>
        ${hasStyle ? '<p class="style-bonus">✨ Ricochet Style Bonus! ✨</p>' : ''}
      `;
    } else {
      html = `
        <h2>Challenge Failed</h2>
        <p>You used all 3 attempts.</p>
        <p>Jonh is unimpressed.</p>
      `;
    }
    
    html += `
      <div class="result-actions">
        <button class="btn btn-retry" id="result-retry-btn">Retry Map</button>
        <button class="btn btn-menu" id="result-menu-btn">Change Map</button>
      </div>
    `;
    
    this.content.innerHTML = html;
    
    this.content.querySelector('#result-retry-btn')?.addEventListener('click', () => {
      this.hide();
      this.callbacks.onRetry();
    });
    
    this.content.querySelector('#result-menu-btn')?.addEventListener('click', () => {
      this.callbacks.onReturnToMenu();
    });
  }

  hide(): void {
    this.container.style.display = 'none';
  }
}
