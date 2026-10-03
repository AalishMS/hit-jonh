export interface SessionCallbacks {
  onPause: () => void;
  onResume: () => void;
  onQuit: () => void;
}

export class SessionCoordinator {
  private _isPaused = false;

  constructor(private callbacks: SessionCallbacks) {}

  get isPaused(): boolean {
    return this._isPaused;
  }

  requestPause(canPause: boolean): boolean {
    if (this._isPaused || !canPause) return false;
    this._isPaused = true;
    this.callbacks.onPause();
    return true;
  }

  resume(): void {
    if (!this._isPaused) return;
    this._isPaused = false;
    this.callbacks.onResume();
  }

  quit(): void {
    if (!this._isPaused) return;
    this._isPaused = false;
    this.callbacks.onQuit();
  }

  togglePause(canPause: boolean): void {
    if (this._isPaused) {
      this.resume();
    } else {
      this.requestPause(canPause);
    }
  }
}
