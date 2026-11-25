import { describe, expect, it } from 'vitest';
import { clipButtonLabel, deliveredStatus, failureStatus, readyStatus, recordingStatus } from '../src/share/clipUi';

describe('clip action wording', () => {
  it('has a first press that only records on a share-sheet device, and one that saves elsewhere', () => {
    expect(clipButtonLabel('idle', false)).toBe('Save clip');
    expect(clipButtonLabel('idle', true)).toBe('Record clip');
    expect(clipButtonLabel('recording', false)).toBe('Recording…');
    expect(clipButtonLabel('ready', true)).toBe('Share clip');
    expect(clipButtonLabel('ready', false)).toBe('Save clip again');
  });

  it('shows progress, success and a clear failure', () => {
    expect(recordingStatus()).toMatch(/Recording/);
    expect(readyStatus(4.2, 1_400_000, true)).toBe('Clip ready (4 s, 1.4 MB). Tap Share clip to post it.');
    expect(readyStatus(4.2, 900_000, false)).toBe('Clip ready (4 s, 900 KB).');
    expect(deliveredStatus('downloaded', 'a.webm')).toMatch(/a\.webm/);
    expect(deliveredStatus('shared', 'a.webm')).toBe('Shared.');
    expect(failureStatus('cancelled')).toBe('Clip cancelled.');
    expect(failureStatus('hidden')).toMatch(/tab was hidden/);
    expect(failureStatus('failed', 'the recording was empty')).toBe("Couldn't record the clip: the recording was empty");
    expect(failureStatus('failed')).toBe("Couldn't record the clip.");
  });
});
