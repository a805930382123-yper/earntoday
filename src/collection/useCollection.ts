import { useEffect, useRef, useState } from "react";
import { shouldAnimateCollection, type CollectionSample } from "./progress";

export function useCollection(sample: CollectionSample) {
  const previous = useRef<CollectionSample | null>(null);
  const [pulse, setPulse] = useState<{ scope: string; time: number; stage: number } | null>(null);
  const { stage, state, time, day, scope, enabled } = sample;
  useEffect(() => {
    const reset = () => { previous.current = null; setPulse(null); };
    document.addEventListener("visibilitychange", reset);
    window.addEventListener("pageshow", reset);
    return () => { document.removeEventListener("visibilitychange", reset); window.removeEventListener("pageshow", reset); };
  }, []);
  useEffect(() => {
    const next = { stage, state, time, day, scope, enabled };
    if (shouldAnimateCollection(previous.current, next) && !document.hidden &&
        !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setPulse({ scope, time, stage });
    }
    previous.current = next;
  }, [stage, state, time, day, scope, enabled]);
  return {
    pulse: enabled && pulse?.scope === scope && pulse.stage === stage && time - pulse.time < 1500 ? pulse : null,
    finish: () => setPulse(null),
  };
}
