import { describe, expect, it, vi } from 'vitest';
import { SessionCoordinator } from '../src/rules/sessionCoordinator';

describe('SessionCoordinator', () => {
  it('starts unpaused', () => {
    const coord = new SessionCoordinator({ onPause: vi.fn(), onResume: vi.fn(), onQuit: vi.fn() });
    expect(coord.isPaused).toBe(false);
  });

  it('pauses if allowed', () => {
    const cbs = { onPause: vi.fn(), onResume: vi.fn(), onQuit: vi.fn() };
    const coord = new SessionCoordinator(cbs);
    
    expect(coord.requestPause(true)).toBe(true);
    expect(coord.isPaused).toBe(true);
    expect(cbs.onPause).toHaveBeenCalledOnce();
  });

  it('ignores pause if not allowed', () => {
    const cbs = { onPause: vi.fn(), onResume: vi.fn(), onQuit: vi.fn() };
    const coord = new SessionCoordinator(cbs);
    
    expect(coord.requestPause(false)).toBe(false);
    expect(coord.isPaused).toBe(false);
    expect(cbs.onPause).not.toHaveBeenCalled();
  });

  it('resumes from pause', () => {
    const cbs = { onPause: vi.fn(), onResume: vi.fn(), onQuit: vi.fn() };
    const coord = new SessionCoordinator(cbs);
    
    coord.requestPause(true);
    coord.resume();
    
    expect(coord.isPaused).toBe(false);
    expect(cbs.onResume).toHaveBeenCalledOnce();
  });

  it('quits from pause', () => {
    const cbs = { onPause: vi.fn(), onResume: vi.fn(), onQuit: vi.fn() };
    const coord = new SessionCoordinator(cbs);
    
    coord.requestPause(true);
    coord.quit();
    
    expect(coord.isPaused).toBe(false);
    expect(cbs.onQuit).toHaveBeenCalledOnce();
  });

  it('togglePause behaves correctly', () => {
    const cbs = { onPause: vi.fn(), onResume: vi.fn(), onQuit: vi.fn() };
    const coord = new SessionCoordinator(cbs);

    // cannot toggle on if not allowed
    coord.togglePause(false);
    expect(coord.isPaused).toBe(false);
    
    // toggles on if allowed
    coord.togglePause(true);
    expect(coord.isPaused).toBe(true);
    
    // toggles off (canPause parameter ignored when turning off)
    coord.togglePause(false);
    expect(coord.isPaused).toBe(false);
  });
});
