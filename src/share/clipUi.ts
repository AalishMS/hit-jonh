/** Wording of the "Save clip" action and its status line, one place so it is testable. No DOM. */
import { secondsLabel, sizeLabel } from './clipPlan';
import type { ClipFailure } from './clipTypes';

export type ClipPhase = 'idle' | 'recording' | 'ready';

/**
 * The button. `share`: this device shares through the sheet, which needs a fresh tap after the
 * recording (a share started seconds after the press is refused), so the first press only records.
 */
export function clipButtonLabel(phase: ClipPhase, share: boolean): string {
  if (phase === 'recording') return 'Recording…';
  if (phase === 'ready') return share ? 'Share clip' : 'Save clip again';
  return share ? 'Record clip' : 'Save clip';
}

export function recordingStatus(): string {
  return 'Recording the replay… Tap anywhere to cancel.';
}

export function readyStatus(seconds: number, bytes: number, share: boolean): string {
  return share
    ? `Clip ready (${secondsLabel(seconds)}, ${sizeLabel(bytes)}). Tap Share clip to post it.`
    : `Clip ready (${secondsLabel(seconds)}, ${sizeLabel(bytes)}).`;
}

export function deliveredStatus(how: 'shared' | 'downloaded', name: string): string {
  return how === 'shared' ? 'Shared.' : `Saved ${name}. Post it anywhere.`;
}

export function failureStatus(reason: ClipFailure, message?: string): string {
  switch (reason) {
    case 'cancelled': return 'Clip cancelled.';
    case 'hidden': return 'Clip cancelled: the tab was hidden while recording.';
    case 'busy': return 'A clip is already being recorded.';
    default: return `Couldn't record the clip${message ? `: ${message}` : '.'}`;
  }
}

export const SHARE_FAILED_STATUS = "Couldn't save the clip. Try Record again.";
