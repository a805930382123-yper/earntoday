export interface TimerClock {
  now: () => number;
  random: () => number;
  set: (callback: () => void, delay: number) => unknown;
  clear: (handle: unknown) => void;
}
export interface ScheduledAction { id: string; min: number; max: number }

/** Two independent deadlines, one waiting timer. No polling or catch-up queue. */
export class AutonomousScheduler {
  private timer: unknown;
  private actions: ScheduledAction[] = [];
  private due = new Map<string, number>();
  private busy = false;
  private key = "";
  private last = 0;
  private clock: TimerClock;
  private start: (id: string) => boolean;
  constructor(clock: TimerClock, start: (id: string) => boolean) { this.clock = clock; this.start = start; }

  configure(key: string, actions: ScheduledAction[]) {
    if (key === this.key) return; // Salary renders must not move either deadline.
    this.stop(); this.key = key; this.actions = actions;
    this.restart();
  }
  private next(action: ScheduledAction, now: number) {
    return now + action.min + Math.max(0, Math.min(1, this.clock.random()))*(action.max-action.min);
  }
  restart() {
    this.clear(); this.busy = false; this.due.clear();
    this.last = this.clock.now();
    for (const action of this.actions) this.due.set(action.id, this.next(action, this.last));
    this.arm();
  }
  stop() { this.clear(); this.key = ""; this.actions = []; this.due.clear(); this.busy = false; }
  private clear() { if (this.timer !== undefined) this.clock.clear(this.timer); this.timer = undefined; }
  private arm() {
    this.clear();
    if (this.busy || !this.due.size) return;
    const earliest = Math.min(...this.due.values());
    this.timer = this.clock.set(() => this.tick(), Math.max(0, earliest-this.clock.now()));
  }
  private tick() {
    this.timer = undefined;
    const now = this.clock.now(), earliest = Math.min(...this.due.values());
    if (now < this.last || now-earliest > 2500) { this.restart(); return; }
    this.last = now;
    const due = this.actions.filter(a => this.due.get(a.id)! <= now);
    // Drop simultaneous conflicts, rescheduling only deadlines actually reached.
    for (const action of due) this.due.set(action.id, this.next(action, now));
    if (due.length && this.start(due[0].id)) this.busy = true;
    this.arm();
  }
  finished() {
    this.busy = false;
    const now = this.clock.now();
    for (const action of this.actions) if (this.due.get(action.id)! <= now) this.due.set(action.id, this.next(action, now));
    this.arm();
  }
  manualStart() { this.busy = true; this.clear(); }
  snapshot() { return { waitingTimers: this.timer === undefined ? 0 : 1, busy: this.busy, due: Object.fromEntries(this.due) }; }
}
