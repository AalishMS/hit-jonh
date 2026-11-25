/**
 * Registers the offline service worker (production builds only; build/pwa.ts generates dist/sw.js).
 * A new build installs in the background and takes over open pages once ready; the page then shows a small
 * "Updated" note, and the new files are used from the next load.
 */
const NOTE_SECONDS = 9;

function showUpdatedNote(): void {
  const note = document.createElement('div');
  note.setAttribute('role', 'status');
  note.style.cssText = 'position:fixed;left:50%;bottom:14px;transform:translateX(-50%);z-index:50;display:flex;gap:10px;align-items:center;'
    + 'padding:8px 14px;border:3px solid #2A1B2E;border-radius:14px;background:#FFF7E6;color:#2A1B2E;font:800 14px/1.3 Nunito,system-ui,sans-serif;box-shadow:0 4px 0 #2A1B2E;';
  note.append('Updated — reload for the newest Hit Jonh.');
  const reload = document.createElement('button');
  reload.type = 'button';
  reload.textContent = 'Reload';
  reload.style.cssText = 'font:inherit;padding:4px 10px;border:2px solid #2A1B2E;border-radius:10px;background:#FFCB45;color:#2A1B2E;cursor:pointer;';
  reload.addEventListener('click', () => location.reload());
  note.append(reload);
  document.body.append(note);
  setTimeout(() => note.remove(), NOTE_SECONDS * 1000);
}

export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  // Only a page that was already under a worker has something to be told about; the first install is silent.
  const hadWorker = navigator.serviceWorker.controller !== null;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadWorker) showUpdatedNote(); });
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((error: unknown) => console.warn('Offline mode unavailable', error));
  });
}
