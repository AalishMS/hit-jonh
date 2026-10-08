/**
 * "Sunday Stroll": an 8-bar swung loop in F major for marimba, pizzicato bass and shaker.
 * Pure data; the AudioManager schedules it. MIDI note numbers, null = rest.
 */
export const MUSIC = {
  bpm: 104,
  /** Fraction of an eighth note the off-beats are delayed by (light swing). */
  swing: 0.2,
  bars: 8,
  /** Eight eighth-notes per bar. */
  melody: [
    [72, null, 69, 72, 77, null, 76, 74],
    [74, null, 69, 74, 77, null, 74, null],
    [70, null, 67, 70, 74, 72, 70, null],
    [72, null, 67, 64, 70, 69, 67, null],
    [72, null, 69, 72, 77, null, 79, 77],
    [74, null, 77, 74, 69, null, 72, null],
    [70, 74, 77, 74, 70, null, 69, 70],
    [72, null, 70, 67, 65, null, null, null],
  ] as ReadonlyArray<ReadonlyArray<number | null>>,
  /** Four quarter notes per bar. */
  bass: [
    [41, 48, 45, 48],
    [38, 45, 41, 45],
    [43, 50, 46, 50],
    [36, 43, 46, 43],
    [41, 48, 45, 48],
    [38, 45, 41, 45],
    [34, 41, 38, 41],
    [36, 43, 40, 43],
  ] as ReadonlyArray<ReadonlyArray<number>>,
} as const;

export const midiToHz = (note: number) => 440 * 2 ** ((note - 69) / 12);

export interface ScheduledNote { voice: 'marimba' | 'bass' | 'shaker'; time: number; note: number }

/** Every note of one loop with its start time in seconds from the loop start. */
export function loopNotes(): ScheduledNote[] {
  const beat = 60 / MUSIC.bpm;
  const eighth = beat / 2;
  const notes: ScheduledNote[] = [];
  for (let bar = 0; bar < MUSIC.bars; bar++) {
    const barStart = bar * beat * 4;
    MUSIC.melody[bar]!.forEach((note, i) => {
      const time = barStart + i * eighth + (i % 2 === 1 ? eighth * MUSIC.swing : 0);
      if (note !== null) notes.push({ voice: 'marimba', time, note });
      if (i % 2 === 1) notes.push({ voice: 'shaker', time, note: 0 });
    });
    MUSIC.bass[bar]!.forEach((note, i) => notes.push({ voice: 'bass', time: barStart + i * beat, note }));
  }
  return notes.sort((a, b) => a.time - b.time);
}

export const loopSeconds = () => (60 / MUSIC.bpm) * 4 * MUSIC.bars;
