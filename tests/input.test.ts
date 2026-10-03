import { describe, expect, it, vi } from 'vitest';
import { InputCoordinator, isTextInputElement } from '../src/input/controls';

describe('InputCoordinator and Accidental-Action Rules', () => {
  it('triggers fire on fresh space press when aiming', () => {
    let fireCount = 0;
    const coordinator = new InputCoordinator({
      onFire: () => { fireCount++; },
      onReset: () => {},
      onAimChange: () => {},
    });

    coordinator.setCanFire(true);

    // Initial press fires and requests preventDefault
    const handled = coordinator.handleKeyDown('Space', false, false);
    expect(handled).toBe(true);
    expect(fireCount).toBe(1);

    // Repeated keydown (holding key) is ignored
    expect(coordinator.handleKeyDown('Space', true, false)).toBe(true);
    expect(fireCount).toBe(1);

    // Release and press again
    coordinator.handleKeyUp('Space');
    expect(coordinator.handleKeyDown('Space', false, false)).toBe(true);
    expect(fireCount).toBe(2);
  });

  it('rejects fire when not aiming (simulating)', () => {
    let fireCount = 0;
    const coordinator = new InputCoordinator({
      onFire: () => { fireCount++; },
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
      onFire: () => { fireCount++; },
      onReset: () => {},
      onAimChange: () => {},
    });

    coordinator.setCanFire(true);
    const handled = coordinator.handleKeyDown('Space', false, true /* isTextInputFocused */);
    expect(handled).toBe(false);
    expect(fireCount).toBe(0);
  });

  it('requires fresh space release if space was held when aiming began', () => {
    let fireCount = 0;
    const coordinator = new InputCoordinator({
      onFire: () => { fireCount++; },
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

  it('tracks held Space across handover and pause boundaries', () => {
    let fireCount = 0;
    const coordinator = new InputCoordinator({
      onFire: () => { fireCount++; },
      onReset: () => {},
      onAimChange: () => {},
    });

    // Handover modal active
    coordinator.setOverlayVisible(true);
    coordinator.setCanFire(false);

    // User presses and holds Space on handover modal
    coordinator.handleKeyDown('Space', false, false);
    expect(fireCount).toBe(0);
    expect(coordinator.isPhysicalSpaceDown).toBe(true);

    // Handover completes, player enters aiming while still holding Space
    coordinator.setOverlayVisible(false);
    coordinator.setCanFire(true);

    // Repeat events while held must NOT fire
    coordinator.handleKeyDown('Space', true, false);
    expect(fireCount).toBe(0);

    // Releasing Space enables the next fresh press
    coordinator.handleKeyUp('Space');
    expect(coordinator.isPhysicalSpaceDown).toBe(false);

    coordinator.handleKeyDown('Space', false, false);
    expect(fireCount).toBe(1);

    // User pauses game while holding Space
    coordinator.handleKeyDown('Space', false, false);
    coordinator.setPaused(true);
    coordinator.setCanFire(false);

    // Resume while Space still held
    coordinator.setPaused(false);
    coordinator.setCanFire(true);
    coordinator.handleKeyDown('Space', true, false);
    expect(fireCount).toBe(1); // No leak into accidental second shot!
  });

  it('tracks key releases even while text input has focus', () => {
    let fireCount = 0;
    const coordinator = new InputCoordinator({
      onFire: () => { fireCount++; },
      onReset: () => {},
      onAimChange: () => {},
    });

    coordinator.setCanFire(true);

    // Space pressed inside player name text field
    coordinator.handleKeyDown('Space', false, true);
    expect(coordinator.isPhysicalSpaceDown).toBe(true);
    expect(fireCount).toBe(0);

    // Space released while still focusing text field
    coordinator.handleKeyUp('Space');
    expect(coordinator.isPhysicalSpaceDown).toBe(false);

    // Space pressed in gameplay now fires cleanly
    coordinator.handleKeyDown('Space', false, false);
    expect(fireCount).toBe(1);
  });

  it('handles Escape repeat-ignoring and allows Escape to toggle/resume while paused', () => {
    const onEscape = vi.fn();
    const coordinator = new InputCoordinator({
      onFire: () => {},
      onReset: () => {},
      onAimChange: () => {},
      onEscape,
    });

    // Normal gameplay Escape triggers onEscape
    expect(coordinator.handleKeyDown('Escape', false, false)).toBe(true);
    expect(onEscape).toHaveBeenCalledTimes(1);

    // Repeat Escape is ignored
    expect(coordinator.handleKeyDown('Escape', true, false)).toBe(false);
    expect(onEscape).toHaveBeenCalledTimes(1);

    // When paused, Escape still works to resume
    coordinator.setPaused(true);
    expect(coordinator.handleKeyDown('Escape', false, false)).toBe(true);
    expect(onEscape).toHaveBeenCalledTimes(2);

    // But Escape inside a text input is ignored
    expect(coordinator.handleKeyDown('Escape', false, true)).toBe(false);
    expect(onEscape).toHaveBeenCalledTimes(2);
  });

  it('does NOT trigger gameplay shortcuts behind overlays, preserving native button activation', () => {
    let fired = false;
    let continued = false;
    let aimAdjusted = false;

    const coordinator = new InputCoordinator({
      onFire: () => { fired = true; },
      onReset: () => { continued = true; },
      onContinue: () => { continued = true; },
      onAimChange: () => { aimAdjusted = true; },
    });
    coordinator.setCanFire(true);
    coordinator.setOverlayVisible(true);

    // Space on a menu returns false so browser can activate the focused button natively
    expect(coordinator.handleKeyDown('Space', false, false)).toBe(false);
    expect(fired).toBe(false);

    // Enter on a menu returns false so browser can submit/activate natively
    expect(coordinator.handleKeyDown('Enter', false, false)).toBe(false);
    expect(continued).toBe(false);

    // Arrows return false
    expect(coordinator.handleKeyDown('ArrowLeft', false, false)).toBe(false);
    expect(aimAdjusted).toBe(false);
  });

  it('consumes arrow keys in active gameplay with preventDefault to prevent double slider increments', () => {
    let deltaA = 0;
    let deltaP = 0;
    const coordinator = new InputCoordinator({
      onFire: () => {},
      onReset: () => {},
      onAimChange: (da, dp) => { deltaA += da; deltaP += dp; },
    });

    coordinator.setCanFire(true);

    expect(coordinator.handleKeyDown('ArrowRight', false, false)).toBe(true);
    expect(deltaA).toBe(1);

    expect(coordinator.handleKeyDown('ArrowLeft', false, false)).toBe(true);
    expect(deltaA).toBe(0);

    expect(coordinator.handleKeyDown('ArrowUp', false, false)).toBe(true);
    expect(deltaP).toBe(1);

    expect(coordinator.handleKeyDown('ArrowDown', false, false)).toBe(true);
    expect(deltaP).toBe(0);
  });

  it('correctly classifies text vs non-text elements via isTextInputElement', () => {
    // True text elements
    expect(isTextInputElement({ tagName: 'input', type: 'text' })).toBe(true);
    expect(isTextInputElement({ tagName: 'input', type: 'password' })).toBe(true);
    expect(isTextInputElement({ tagName: 'textarea' })).toBe(true);
    expect(isTextInputElement({ tagName: 'select' })).toBe(true);
    expect(isTextInputElement({ isContentEditable: true })).toBe(true);

    // Non-text elements (range sliders, buttons, checkboxes)
    expect(isTextInputElement({ tagName: 'input', type: 'range' })).toBe(false);
    expect(isTextInputElement({ tagName: 'input', type: 'button' })).toBe(false);
    expect(isTextInputElement({ tagName: 'input', type: 'checkbox' })).toBe(false);
    expect(isTextInputElement({ tagName: 'button' })).toBe(false);
    expect(isTextInputElement({ tagName: 'div' })).toBe(false);
    expect(isTextInputElement(null)).toBe(false);
  });
});
