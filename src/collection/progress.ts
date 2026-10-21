import type { WorkState } from "../salary/calc";

/** The input is the existing salary workProgress, never a second clock. */
export function collectionStage(progress: number, state: WorkState): number {
  if (state === "before" || state === "rest_day" || !Number.isFinite(progress)) return 0;
  // Small tolerance only compensates for floating point at exact tenths.
  return Math.min(10, Math.max(0, Math.floor(Math.min(1, Math.max(0, progress)) * 10 + 1e-9)));
}

export interface CollectionSample {
  stage: number;
  state: WorkState;
  time: number;
  day: string;
  scope: string;
  enabled: boolean;
}

export function shouldAnimateCollection(previous: CollectionSample | null, next: CollectionSample): boolean {
  if (!previous || !previous.enabled || !next.enabled || previous.scope !== next.scope || previous.day !== next.day) return false;
  const gap = next.time - previous.time;
  return gap > 0 && gap <= 2500 && next.stage === previous.stage + 1 &&
    previous.state === "working" && (next.state === "working" || next.state === "after");
}
