import { JONH_TALK } from '../config/tuning';

/**
 * When Jonh heckles a slow aimer: after `first` seconds of idle aiming, then every `repeat`
 * seconds, at most `max` times per aim. Any aim adjustment restarts the idle clock. Cosmetic only.
 */
export class HeckleTimer {
  private idle = 0;
  private count = 0;

  constructor(
    private readonly first = JONH_TALK.heckleFirstSeconds,
    private readonly repeat = JONH_TALK.heckleRepeatSeconds,
    private readonly max = JONH_TALK.heckleMaxPerAim,
  ) {}

  /** The player did something (adjusted aim): the idle clock restarts. */
  activity(): void { this.idle = 0; }

  /** A new aiming phase (new shot, new map): heckles are available again. */
  reset(): void { this.idle = 0; this.count = 0; }

  /** Advances idle aiming time; true on the frame Jonh should heckle. */
  advance(seconds: number): boolean {
    if (this.count >= this.max || !(seconds > 0)) return false;
    this.idle += seconds;
    if (this.idle < (this.count === 0 ? this.first : this.repeat)) return false;
    this.idle = 0;
    this.count++;
    return true;
  }
}
