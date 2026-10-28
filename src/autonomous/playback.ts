import type { TimerClock } from "./scheduler.ts";
export interface PlaybackDefinition { id: string; sequence: string[]; timing: number[]; leadMs: number; tailMs: number }
export interface PlaybackFrame { id: string; state: string; step: number }

/** Bounded frame switching; one timer only while an action is playing. */
export class FramePlayer {
  private timer: unknown;
  private sequence = 0;
  active = false;
  private clock: TimerClock;
  private frame: (value: PlaybackFrame | null) => void;
  private finish: () => void;
  constructor(clock: TimerClock, frame: (value: PlaybackFrame | null) => void, finish: () => void) {
    this.clock = clock; this.frame = frame; this.finish = finish;
  }
  cancel(notify = true) {
    const wasActive = this.active;
    this.sequence++; this.active = false;
    if (this.timer !== undefined) this.clock.clear(this.timer);
    this.timer = undefined; this.frame(null);
    if (wasActive && notify) this.finish();
  }
  play(action: PlaybackDefinition) {
    this.cancel(false); this.active = true;
    const token = this.sequence;
    const schedule = (delay: number, callback: () => void) => {
      const deadline = this.clock.now()+delay;
      this.timer = this.clock.set(() => {
        this.timer = undefined;
        if (token !== this.sequence) return;
        if (this.clock.now()-deadline > 2500 || this.clock.now() < deadline-100) { this.cancel(); return; }
        callback();
      }, delay);
    };
    const advance = (step: number) => {
      if (token !== this.sequence) return;
      this.frame({ id: action.id, state: action.sequence[step], step });
      if (step === action.sequence.length-1) schedule(action.tailMs, () => this.cancel());
      else schedule(step === 0 ? action.leadMs : action.timing[step-1], () => advance(step+1));
    };
    advance(0);
  }
}
