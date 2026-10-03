import { describe, it, expect } from 'vitest';
import { PlayerHistory } from '../src/rules/playerHistory';
import { asPreviousTrail, type TrailData } from '../src/render/trailRenderer';

describe('PlayerHistory and trail ownership', () => {
  it('stores and retrieves history keyed by shooter index', () => {
    const history = new PlayerHistory<TrailData>();

    const trailP0: TrailData = {
      activePoints: [{ x: 10, y: 20 }, { x: 30, y: 40 }],
      activeLandingMarker: { x: 30, y: 40, label: 'Landed' },
      previousPoints: [],
      previousLandingMarker: null,
    };

    const trailP1: TrailData = {
      activePoints: [{ x: 50, y: 60 }],
      activeLandingMarker: { x: 50, y: 60, label: 'Landed' },
      previousPoints: [],
      previousLandingMarker: null,
    };

    expect(history.get(0)).toBeNull();
    expect(history.get(1)).toBeNull();

    // Record P0's shot
    history.record(0, trailP0);
    expect(history.get(0)).toEqual(trailP0);
    expect(history.get(1)).toBeNull();

    // Record P1's shot: isolated from P0
    history.record(1, trailP1);
    expect(history.get(1)).toEqual(trailP1);
    expect(history.get(0)).toEqual(trailP0);

    // Overwrite P0 on their next shot
    const trailP0Second: TrailData = {
      activePoints: [{ x: 100, y: 200 }],
      activeLandingMarker: { x: 100, y: 200, label: 'Hit' },
      previousPoints: [],
      previousLandingMarker: null,
    };
    history.record(0, trailP0Second);
    expect(history.get(0)).toEqual(trailP0Second);

    // Clear removes all
    history.clear();
    expect(history.get(0)).toBeNull();
    expect(history.get(1)).toBeNull();
  });

  it('promotes finished shot active points and landing marker to ghost previous trail', () => {
    const shotData: TrailData = {
      activePoints: [{ x: 1, y: 2 }, { x: 3, y: 4 }],
      activeLandingMarker: { x: 3, y: 4, label: 'DIRECT HIT · 45° / 50%' },
      previousPoints: [{ x: 99, y: 99 }],
      previousLandingMarker: { x: 99, y: 99, label: 'Old' },
    };

    const previous = asPreviousTrail(shotData);
    expect(previous.activePoints).toEqual([]);
    expect(previous.activeLandingMarker).toBeNull();
    expect(previous.previousPoints).toEqual([{ x: 1, y: 2 }, { x: 3, y: 4 }]);
    expect(previous.previousLandingMarker).toEqual({ x: 3, y: 4, label: 'DIRECT HIT · 45° / 50%' });
  });
});
