// Keep the loading fallback independent of the game bundle so failed imports
// still leave the player a useful retry action.
const statusElement = document.getElementById('game-status');

function showLoadingFailure(): void {
  if (!statusElement || statusElement.hidden) return;
  statusElement.className = 'boot-status boot-error';
  statusElement.textContent = 'Hit Jonh could not start. ';
  const retry = document.createElement('button');
  retry.type = 'button';
  retry.className = 'btn btn-retry';
  retry.textContent = 'Retry';
  retry.addEventListener('click', () => location.reload());
  statusElement.appendChild(retry);
}

window.addEventListener('error', showLoadingFailure, { once: true });
void import('./main').catch(showLoadingFailure);
