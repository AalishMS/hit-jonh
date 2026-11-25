import { clipFormat } from '../share/clipRecorder';
import { browserDeliveryEnv, deliverClip, wouldShare, type DeliveryEnv } from '../share/clipDelivery';
import type { ClipFile, ClipOffer } from '../share/clipTypes';
import { clipButtonLabel, deliveredStatus, failureStatus, readyStatus, recordingStatus, SHARE_FAILED_STATUS, type ClipPhase } from '../share/clipUi';
import { announce } from './announcer';

/** True when this browser can record a clip at all (MediaRecorder + canvas.captureStream); otherwise no clip action is shown. */
export function clipSupported(): boolean {
  return clipFormat(false) !== null;
}

/**
 * The "Save clip" / "Share clip" action of a result card, with its status line. Press → the replay
 * plays again (card hidden) while it is recorded → on a phone the button becomes "Share clip" (the
 * share sheet needs a fresh tap), elsewhere the file downloads at once. Returns null (nothing is shown)
 * when this browser cannot record.
 */
export function clipControl(offer: ClipOffer, signal: AbortSignal, className = 'btn btn-clip', env: DeliveryEnv = browserDeliveryEnv()):
  { button: HTMLButtonElement; status: HTMLElement } | null {
  const format = clipFormat(true) ?? clipFormat(false);
  if (!format) return null;
  const share = wouldShare(env, format.fileType);
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  const status = document.createElement('p');
  status.className = 'share-status clip-status';
  status.setAttribute('role', 'status');
  let phase: ClipPhase = 'idle';
  let clip: ClipFile | null = null;

  const render = (next: ClipPhase, text?: string): void => {
    phase = next;
    button.textContent = clipButtonLabel(phase, share);
    button.disabled = phase === 'recording';
    if (text !== undefined) status.textContent = text;
  };
  const say = (text: string): void => { render(phase, text); announce(text); };
  render('idle', '');

  const deliver = async (file: ClipFile): Promise<void> => {
    const how = await deliverClip(file, env);
    if (signal.aborted) return;
    if (how === 'shared' || how === 'downloaded') say(deliveredStatus(how, file.name));
    else if (how === 'failed') say(SHARE_FAILED_STATUS);
  };

  button.addEventListener('click', () => {
    if (phase === 'recording') return;
    if (phase === 'ready' && clip) { void deliver(clip); return; }
    render('recording', recordingStatus());
    announce(recordingStatus());
    void offer.record().then(async result => {
      if (signal.aborted) return;
      if (!result.ok) { render('idle'); say(failureStatus(result.reason, result.message)); button.focus(); return; }
      clip = result.clip;
      render('ready', readyStatus(clip.seconds, clip.blob.size, share));
      announce(status.textContent ?? '');
      button.focus();
      // A phone's share sheet needs a fresh tap; elsewhere a download needs none.
      if (!share) await deliver(clip);
    });
  }, { signal });
  // Leaving the card (Retry, Home, a new match) while recording discards the clip.
  signal.addEventListener('abort', () => offer.cancel(), { once: true });
  return { button, status };
}
