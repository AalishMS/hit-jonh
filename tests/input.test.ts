import { describe, expect, it } from 'vitest';
import { InputCoordinator } from '../src/input/controls';

describe('InputCoordinator', () => {
  it('triggers fire on fresh space press when aiming', () => {
    let fireCount = 0;
    const coordinator = new InputCoordinator({
      onFire: () => {
        fireCount++;
      },
      onReset: () => {},
      onAimChange: () => {},
    });

    coordinator.setCanFire(true);

    // Initial press fires
    coordinator.handleKeyDown('Space', false, false);
    expect(fireCount).toBe(1);

    // Repeated keydown (holding key) is ignored
    coordinator.handleKeyDown('Space', true, false);
    expect(fireCount).toBe(1);

    // Release and press again
    coordinator.handleKeyUp('Space');
    coordinator.handleKeyDown('Space', false, false);
    expect(fireCount).toBe(2);
  });

  it('rejects fire when not aiming (simulating)', () => {
    let fireCount = 0;
    const coordinator = new InputCoordinator({
      onFire: () => {
        fireCount++;
      },
      onReset: () => {},
      onAimChange: () => {},
    });

    coordinator.setCanFire(false);
    coordinator.handleKeyDown('Space', false, false);
    expect(fireCount).toBe(0);
  });

  it('ignores shortcuts when text input has focus', () => {
    let fireCount = 0;
    const coordinator = new InputCoordinator({
      onFire: () => {
        fireCount++;
      },
      onReset: () => {},
      onAimChange: () => {},
    });

    coordinator.setCanFire(true);
    coordinator.handleKeyDown('Space', false, true /* isTextInputFocused */);
    expect(fireCount).toBe(0);
  });

  it('requires fresh space release if space was held when aiming began', () => {
    let fireCount = 0;
    const coordinator = new InputCoordinator({
      onFire: () => {
        fireCount++;
      },
      onReset: () => {},
      onAimChange: () => {},
    });

    // Space was pressed during simulating
    coordinator.setCanFire(false);
    coordinator.handleKeyDown('Space', false, false);

    // Now state transitions to aiming, but Space is still physically held down!
    coordinator.setCanFire(true);

    // Repeat events must not trigger fire
    coordinator.handleKeyDown('Space', true, false);
    expect(fireCount).toBe(0);

    // Even non-repeat until released must not trigger
    coordinator.handleKeyDown('Space', false, false);
    expect(fireCount).toBe(0);

    // Once released:
    coordinator.handleKeyUp('Space');

    // Fresh press now fires!
    coordinator.handleKeyDown('Space', false, false);
    expect(fireCount).toBe(1);
  });

  it('triggers onContinue on Enter keypress', () => {
    let continueCount = 0;
    const coordinator = new InputCoordinator({
      onFire: () => {},
      onReset: () => {},
      onContinue: () => {
        continueCount++;
      },
      onAimChange: () => {},
    });

    coordinator.handleKeyDown('Enter', false, false);
    expect(continueCount).toBe(1);
  });

  it('triggers onToggleMute on KeyM keypress', () => {
    let muteCount = 0;
    const coordinator = new InputCoordinator({
      onFire: () => {},
      onReset: () => {},
      onToggleMute: () => {
        muteCount++;
      },
      onAimChange: () => {},
    });

    coordinator.handleKeyDown('KeyM', false, false);
    expect(muteCount).toBe(1);
  });

  it('ignores all gameplay shortcuts (Enter, KeyM, KeyR, Arrows) when text input has focus', () => {
    let triggered = false;
    const coordinator = new InputCoordinator({
      onFire: () => { triggered = true; },
      onReset: () => { triggered = true; },
      onContinue: () => { triggered = true; },
      onToggleMute: () => { triggered = true; },
      onAimChange: () => { triggered = true; },
    });
    coordinator.setCanFire(true);

    for (const key of ['Space', 'Enter', 'KeyM', 'KeyR', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']) {
      coordinator.handleKeyDown(key, false, true /* isTextInputFocused */);
      expect(triggered, `Shortcut ${key} should be ignored while text input has focus`).toBe(false);
    }
  });
});
