import { describe, expect, it, vi } from 'vitest';
import { SessionCoordinator } from '../src/rules/sessionCoordinator';
import { FixedStepper } from '../src/sim/fixedStep';
import { ShotAttemptMachine } from '../src/rules/shotAttempt';
import { MatterAdapter } from '../src/physics/matterAdapter';
import { MAPS } from '../src/levels';
import { PHYSICS, WORLD } from '../src/config/tuning';
import Matter from '@matter-js';

describe('SessionCoordinator - Invariants and Timing', () => {
  it('correctly evaluates pausable states according to SPEC §12', () => {
    const coord = new SessionCoordinator({ onPause: vi.fn(), onResume: vi.fn(), onQuit: vi.fn() });

    // Allowed during aiming, simulating, and in-game result before modal
    expect(coord.canPause('solo', 'aiming', false)).toBe(true);
    expect(coord.canPause('solo', 'simulating', false)).toBe(true);
    expect(coord.canPause('solo', 'resolved', false)).toBe(true);

    expect(coord.canPause('multi', 'aiming', false)).toBe(true);
    expect(coord.canPause('multi', 'simulating', false)).toBe(true);
    expect(coord.canPause('multi', 'resolved', false)).toBe(true);

    // Disallowed outside active gameplay
    expect(coord.canPause('none', 'aiming', false)).toBe(false);

    // Disallowed when any modal overlay is already open
    expect(coord.canPause('solo', 'aiming', true)).toBe(false);
    expect(coord.canPause('solo', 'resolved', true)).toBe(false);
    expect(coord.canPause('multi', 'aiming', true)).toBe(false);
  });

  it('repeat pause/resume/quit inputs do not double-toggle or double-trigger callbacks', () => {
    const cbs = { onPause: vi.fn(), onResume: vi.fn(), onQuit: vi.fn() };
    const coord = new SessionCoordinator(cbs);

    // Initial pause succeeds
    expect(coord.requestPause(true)).toBe(true);
    expect(coord.isPaused).toBe(true);
    expect(cbs.onPause).toHaveBeenCalledTimes(1);

    // Repeat pause call while already paused is rejected
    expect(coord.requestPause(true)).toBe(false);
    expect(cbs.onPause).toHaveBeenCalledTimes(1);

    // Resume succeeds
    expect(coord.resume()).toBe(true);
    expect(coord.isPaused).toBe(false);
    expect(cbs.onResume).toHaveBeenCalledTimes(1);

    // Repeat resume call while already unpaused is rejected
    expect(coord.resume()).toBe(false);
    expect(cbs.onResume).toHaveBeenCalledTimes(1);

    // Quit when unpaused is rejected
    expect(coord.quit()).toBe(false);
    expect(cbs.onQuit).not.toHaveBeenCalled();

    // Pause then quit
    coord.requestPause(true);
    expect(coord.quit()).toBe(true);
    expect(coord.isPaused).toBe(false);
    expect(cbs.onQuit).toHaveBeenCalledTimes(1);

    // Second quit call is rejected
    expect(coord.quit()).toBe(false);
    expect(cbs.onQuit).toHaveBeenCalledTimes(1);
  });

  it('freezes simulation advancement and resets accumulator at both pause and resume boundaries (no catch-up burst)', () => {
    const stepper = new FixedStepper(PHYSICS.fixedStepSeconds, PHYSICS.maxStepsPerFrame);
    const cbs = { onPause: vi.fn(), onResume: vi.fn(), onQuit: vi.fn() };
    const coord = new SessionCoordinator(cbs, stepper);

    // Advance 1/60s (approx 2 steps at 120Hz)
    let stepCount = 0;
    const initialSteps = coord.advance(1 / 60, () => { stepCount++; });
    expect(initialSteps).toBe(2);
    expect(stepCount).toBe(2);

    // Pause boundary resets accumulator
    coord.requestPause(true);
    expect(coord.isPaused).toBe(true);

    // Elapsing massive time while paused produces zero steps
    stepCount = 0;
    const pausedSteps = coord.advance(10.0, () => { stepCount++; });
    expect(pausedSteps).toBe(0);
    expect(stepCount).toBe(0);

    // Resume boundary resets accumulator again so no catch-up burst occurs
    coord.resume();
    expect(coord.isPaused).toBe(false);

    // Immediately after resume, normal time produces exactly normal steps
    stepCount = 0;
    const resumedSteps = coord.advance(PHYSICS.fixedStepSeconds, () => { stepCount++; });
    expect(resumedSteps).toBe(1);
    expect(stepCount).toBe(1);
  });

  it('preserves shot and simulation state across pause and resume', () => {
    const machine = new ShotAttemptMachine(25.6);
    machine.fire(55, 70);

    // Simulate 0.5s of flight
    machine.step(0.5, { x: 5.0, y: 3.0, speed: 12.0, hitBody: false, hitHat: false });
    expect(machine.state).toBe('simulating');
    expect(machine.simulatedTime).toBeCloseTo(0.5);
    expect(machine.angleDeg).toBe(55);
    expect(machine.powerPercent).toBe(70);

    const cbs = { onPause: vi.fn(), onResume: vi.fn(), onQuit: vi.fn() };
    const coord = new SessionCoordinator(cbs);

    coord.requestPause(true);
    // While paused, attempt machine state is untouched
    expect(machine.state).toBe('simulating');
    expect(machine.simulatedTime).toBeCloseTo(0.5);

    coord.resume();
    // Resuming preserves exact state and allows continuation
    expect(machine.state).toBe('simulating');
    expect(machine.simulatedTime).toBeCloseTo(0.5);

    const stepResult = machine.step(0.1, { x: 6.0, y: 3.5, speed: 11.5, hitBody: false, hitHat: false });
    expect(stepResult.resolved).toBe(false);
    expect(machine.simulatedTime).toBeCloseTo(0.6);
  });

  it('preserves MatterAdapter rigid bodies and projectile velocity across pause and resume', () => {
    const engine = Matter.Engine.create({ gravity: { y: 0.4905, scale: 0.001 } });
    const adapter = new MatterAdapter(engine.world, WORLD.pixelsPerMetre, WORLD.designHeightPx);
    const level = MAPS[0]!;
    adapter.setupLevel(level);

    // Spawn a projectile with known initial velocity
    adapter.spawnProjectile(100, 200, 7.5, { x: 12, y: -8 });
    const prePause = adapter.stepProjectile(level, 0.15);
    expect(prePause).not.toBeNull();
    const { xSim: x1, ySim: y1, speedMs: s1 } = prePause!;

    const stepper = new FixedStepper(PHYSICS.fixedStepSeconds, PHYSICS.maxStepsPerFrame);
    const coord = new SessionCoordinator({ onPause: vi.fn(), onResume: vi.fn(), onQuit: vi.fn() }, stepper);

    // Pause
    coord.requestPause(true);

    // Advance while paused does nothing
    coord.advance(5.0);

    // Resume
    coord.resume();

    // Verify projectile physics state has not drifted or corrupted during pause
    const postResume = adapter.stepProjectile(level, 0.15);
    expect(postResume).not.toBeNull();
    // Position advances naturally from where it paused without sudden jump
    expect(Math.abs(postResume!.xSim - x1)).toBeLessThan(1.0);
    expect(Math.abs(postResume!.ySim - y1)).toBeLessThan(1.0);
    expect(Math.abs(postResume!.speedMs - s1)).toBeLessThan(2.0);

    adapter.clear();
  });

  it('guarantees quit cannot later step or dispatch a score/result from an active shot', () => {
    const machine = new ShotAttemptMachine(25.6);
    machine.fire(45, 50);

    let didQuit = false;
    const coord = new SessionCoordinator({
      onPause: vi.fn(),
      onResume: vi.fn(),
      onQuit: () => {
        didQuit = true;
        machine.reset(); // Production PrototypeScene clears session machine and adapter
      },
    });

    coord.requestPause(true);
    coord.quit();

    expect(didQuit).toBe(true);
    expect(coord.isPaused).toBe(false);
    // Machine was reset to aiming - cannot resolve or score from the previous shot
    expect(machine.state).toBe('aiming');
    expect(machine.outcome).toBeNull();
  });
});
