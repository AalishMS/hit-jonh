export type ShotState = 'aiming' | 'simulating' | 'resolved';

export type ShotOutcome = 'hit' | 'miss';

export type MissReason = 'settled' | 'out_of_bounds' | 'timeout';

export interface ProjectileSnapshot {
  x: number;
  y: number;
  speed: number;
  hitBody: boolean;
}

export type StepResult =
  | { resolved: false }
  | { resolved: true; outcome: 'hit' }
  | { resolved: true; outcome: 'miss'; reason: MissReason };
