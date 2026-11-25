import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_KEYS, KEY_ACTIONS, actionFor, isBindableCode, keyLabel, rebind, sanitizeKeys } from '../src/input/keyBindings';
import { InputCoordinator } from '../src/input/controls';

describe('key bindings', () => {
  it('keeps Escape and Tab for pause and focus', () => {
    for (const code of ['Escape', 'Tab', 'MetaLeft', '', 'Nonsense']) expect(isBindableCode(code)).toBe(false);
    for (const code of ['Space', 'KeyF', 'Digit3', 'ArrowUp', 'Numpad5', 'Enter', 'ShiftLeft']) expect(isBindableCode(code)).toBe(true);
  });

  it('swaps when a key is already used, so every action keeps a key', () => {
    const k = rebind(DEFAULT_KEYS, 'fire', 'Enter');
    expect(k.fire).toBe('Enter');
    expect(k.next).toBe('Space');
    expect(new Set(Object.values(k)).size).toBe(KEY_ACTIONS.length);
    expect(rebind(DEFAULT_KEYS, 'fire', 'Escape')).toBe(DEFAULT_KEYS);
    expect(actionFor(k, 'Space')).toBe('next');
  });

  it('sanitizes saved bindings and resets clashes', () => {
    expect(sanitizeKeys(undefined)).toEqual(DEFAULT_KEYS);
    expect(sanitizeKeys({ fire: 'KeyF', retry: 'Escape', mute: 3 })).toEqual({ ...DEFAULT_KEYS, fire: 'KeyF' });
    expect(sanitizeKeys({ fire: 'Enter' })).toEqual(DEFAULT_KEYS); // Enter would clash with next
  });

  it('labels keys briefly', () => {
    expect(['Space', 'Enter', 'ArrowLeft', 'KeyR', 'Digit1', 'Numpad5', 'Slash'].map(keyLabel)).toEqual(['Space', '↵', '←', 'R', '1', 'Num 5', '/']);
  });

  it('drives the game: a remapped fire key fires (fresh press), the old one no longer does', () => {
    const onFire = vi.fn();
    const onAimChange = vi.fn();
    const onReset = vi.fn();
    const input = new InputCoordinator({ onFire, onReset, onAimChange });
    input.setKeys({ ...DEFAULT_KEYS, fire: 'KeyF', angleUp: 'KeyD', retry: 'KeyQ' });
    input.setCanFire(true);
    expect(input.handleKeyDown('Space', false, false)).toBe(false);
    expect(onFire).not.toHaveBeenCalled();
    input.handleKeyDown('KeyF', false, false);
    expect(onFire).toHaveBeenCalledTimes(1);
    input.setCanFire(false);
    input.setCanFire(true);
    input.handleKeyDown('KeyF', false, false); // still held: needs a fresh press
    expect(onFire).toHaveBeenCalledTimes(1);
    input.handleKeyUp('KeyF');
    input.handleKeyDown('KeyF', false, false);
    expect(onFire).toHaveBeenCalledTimes(2);
    input.handleKeyDown('KeyD', false, false);
    expect(onAimChange).toHaveBeenCalledWith(1, 0);
    input.handleKeyDown('KeyQ', false, false);
    expect(onReset).toHaveBeenCalledTimes(1);
    expect(input.handleKeyDown('KeyR', false, false)).toBe(false);
  });
});
