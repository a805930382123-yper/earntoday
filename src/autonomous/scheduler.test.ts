import { test } from "node:test";
import assert from "node:assert/strict";
import { AutonomousScheduler, type TimerClock } from "./scheduler.ts";
import { FramePlayer } from "./playback.ts";
import { FAST_INTERVAL, SLOW_INTERVAL } from "./frequency.ts";

class FakeClock implements TimerClock {
  time = 0; seed = 0; nextId = 0;
  tasks = new Map<number, { at: number; fn: () => void }>();
  now = () => this.time;
  random = () => this.seed;
  set = (fn: () => void, delay: number) => { const id = ++this.nextId; this.tasks.set(id, { at: this.time + delay, fn }); return id; };
  clear = (id: unknown) => { this.tasks.delete(id as number); };
  run(ms: number) {
    const end = this.time + ms;
    for (;;) {
      const next = [...this.tasks].sort((a, b) => a[1].at - b[1].at)[0];
      if (!next || next[1].at > end) break;
      this.tasks.delete(next[0]); this.time = next[1].at; next[1].fn();
    }
    this.time = end;
  }
  wake(ms: number) { this.time += ms; const tasks = [...this.tasks.values()]; this.tasks.clear(); for (const task of tasks) task.fn(); }
}
const actions = [{ id: "blink", ...FAST_INTERVAL }, { id: "yawn", ...SLOW_INTERVAL }];

test("one waiting task; independent slow deadline survives salary renders and repeated blinks", () => {
  const clock = new FakeClock(), played: [string, number][] = [];
  clock.seed = .25; // Distinct deadlines, leaving collision policy unchanged.
  const scheduler = new AutonomousScheduler(clock, id => { played.push([id, clock.time]); return true; });
  scheduler.configure("ordinary", actions);
  for (let i = 0; i < 90; i++) {
    scheduler.configure("ordinary", actions); // Equivalent one-second salary render.
    assert.equal(clock.tasks.size, 1);
    clock.run(1000);
    if (scheduler.snapshot().busy) scheduler.finished();
  }
  assert.deepEqual(played.filter(p => p[0] === "yawn"), [["yawn", 90000]]);
  assert.equal(played.filter(p => p[0] === "blink").length, 2);
  scheduler.stop(); assert.equal(clock.tasks.size, 0);
});
test("upper frequency bounds, eligibility restart, no idle polling and no catch-up after sleep", () => {
  const clock = new FakeClock(); clock.seed = 1; let played = 0;
  const scheduler = new AutonomousScheduler(clock, () => { played++; return true; });
  scheduler.configure("a", actions);
  assert.deepEqual(scheduler.snapshot().due, { blink: 45000, yawn: 180000 });
  clock.run(1000); scheduler.restart();
  assert.equal(scheduler.snapshot().due.blink, 46000);
  clock.wake(600000); assert.equal(played, 0); assert.equal(clock.tasks.size, 1);
  assert.equal(scheduler.snapshot().due.blink, 646000);
  scheduler.configure("hidden", []); assert.equal(clock.tasks.size, 0);
  clock.run(1000000); scheduler.configure("shown", actions);
  assert.equal(played, 0); assert.equal(scheduler.snapshot().due.blink, clock.time + 45000);
  scheduler.stop(); scheduler.stop(); assert.equal(clock.tasks.size, 0);
});
test("simultaneous deadlines do not queue, and elapsed deadlines during playback are discarded", () => {
  const clock = new FakeClock(), played: string[] = [];
  const scheduler = new AutonomousScheduler(clock, id => { played.push(id); return true; });
  scheduler.configure("a", [{ id: "one", min: 10, max: 10 }, { id: "two", min: 10, max: 10 }]);
  clock.run(10); assert.deepEqual(played, ["one"]); assert.equal(clock.tasks.size, 0);
  clock.run(40); scheduler.finished(); assert.equal(clock.tasks.size, 1);
  assert.deepEqual(scheduler.snapshot().due, { one: 60, two: 60 });
  scheduler.stop();
});
test("approved static/half/closed/half/static timings and token-safe cancellation", () => {
  const clock = new FakeClock(), frames: [number, string | null][] = []; let finished = 0;
  const player = new FramePlayer(clock, f => frames.push([clock.time, f?.state ?? null]), () => finished++);
  const action = { id: "blink", sequence: ["static", "half", "closed", "half", "static"], timing: [200, 300, 200], leadMs: 360, tailMs: 360 };
  player.play(action); clock.run(1420);
  assert.deepEqual(frames.filter(f => f[1]), [[0, "static"], [360, "half"], [560, "closed"], [860, "half"], [1060, "static"]]);
  assert.equal(finished, 1); assert.equal(clock.tasks.size, 0);
  player.play(action); clock.run(400);
  const stale = [...clock.tasks.values()][0].fn;
  player.cancel(false); player.play({ ...action, id: "new" });
  const before = frames.length; stale(); assert.equal(frames.length, before);
  player.cancel(false); clock.run(10000); assert.equal(clock.tasks.size, 0); assert.equal(finished, 1);
});
test("suspended playback ends at current static state without running overdue frames", () => {
  const clock = new FakeClock(); let state: string | null = null;
  const player = new FramePlayer(clock, f => { state = f?.state ?? null; }, () => {});
  player.play({ id: "ear", sequence: ["static", "tilt", "static"], timing: [150], leadMs: 360, tailMs: 360 });
  clock.wake(900000); assert.equal(state, null); assert.equal(player.active, false); assert.equal(clock.tasks.size, 0);
});
