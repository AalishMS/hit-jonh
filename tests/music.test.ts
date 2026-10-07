import { describe, expect, it } from 'vitest';
import { MUSIC, loopNotes, loopSeconds, midiToHz } from '../src/audio/music';

describe('Music loop', () => {
  it('is a sorted 8-bar loop with notes inside the loop and a playable range', () => {
    const notes = loopNotes();
    expect(loopSeconds()).toBeCloseTo((60 / MUSIC.bpm) * 32);
    for (let i = 1; i < notes.length; i++) expect(notes[i]!.time).toBeGreaterThanOrEqual(notes[i - 1]!.time);
    for (const n of notes) {
      expect(n.time).toBeGreaterThanOrEqual(0);
      expect(n.time).toBeLessThan(loopSeconds());
      if (n.voice !== 'shaker') {
        expect(midiToHz(n.note)).toBeGreaterThan(50);
        expect(midiToHz(n.note)).toBeLessThan(1000);
      }
    }
    expect(MUSIC.melody.every(bar => bar.length === 8)).toBe(true);
    expect(MUSIC.bass.every(bar => bar.length === 4)).toBe(true);
  });
});
