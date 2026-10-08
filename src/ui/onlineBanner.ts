/** A small status strip above the game for connection state, countdowns and one-off notices. */
export class OnlineBanner {
  private readonly root: HTMLDivElement;
  private readonly text: HTMLSpanElement;
  private readonly retry: HTMLButtonElement;
  private blocking = false;
  private flashUntil = 0;

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'online-banner';
    this.root.setAttribute('role', 'status');
    this.root.setAttribute('aria-live', 'polite');
    this.root.hidden = true;
    this.text = document.createElement('span');
    this.retry = document.createElement('button');
    this.retry.type = 'button';
    this.retry.className = 'btn';
    this.retry.textContent = 'Retry';
    this.retry.hidden = true;
    this.root.append(this.text, this.retry);
    parent.appendChild(this.root);
  }

  /** Routine status; ignored while a blocking message or a flash is showing. */
  setText(message: string | null): void {
    if (this.blocking || Date.now() < this.flashUntil) return;
    this.show(message);
  }

  flash(message: string, seconds = 3): void {
    this.flashUntil = Date.now() + seconds * 1000;
    this.show(message);
  }

  setBlocking(message: string | null, onRetry?: () => void): void {
    this.blocking = message !== null;
    this.retry.hidden = message === null || !onRetry;
    this.retry.onclick = onRetry ? () => onRetry() : null;
    this.show(message);
  }

  private show(message: string | null): void {
    this.root.hidden = message === null;
    this.text.textContent = message ?? '';
  }

  destroy(): void {
    this.root.remove();
  }
}
