import { useCallback, useEffect, useRef, useState } from "react";
import type { WorkState } from "../salary/calc";
import type { SkinTheme } from "../themes/catalog";
import type { WindowMode } from "../display/DisplayProvider";
import type { ActivePetReaction, PetInteraction, ReactionPose } from "./types";

// Optional art must never block a theme or replace its healthy base character.
const images = new Map<string, Promise<void>>();
function decodeReaction(src: string): Promise<void> {
  const cached = images.get(src);
  if (cached) return cached;
  const promise = new Promise<void>((resolve, reject) => {
    const image = new Image();
    const timer = window.setTimeout(() => { image.onload = null; image.onerror = null; reject(new Error("互动素材加载超时")); }, 5000);
    image.onload = () => {
      void image.decode().then(resolve, reject).finally(() => window.clearTimeout(timer));
    };
    image.onerror = () => { window.clearTimeout(timer); reject(new Error("互动素材无法加载")); };
    image.src = src;
  }).catch(error => { images.delete(src); throw error; });
  images.set(src, promise);
  return promise;
}

export function usePetInteraction(theme: SkinTheme, state: WorkState, windowMode: WindowMode, ready: boolean): PetInteraction {
  const pose: ReactionPose | null = state === "working" ? "working" : state === "lunch" ? "lunch" : state === "after" ? "finished" : null;
  const scope = `${theme.id}:${state}:${windowMode}:${ready}`;
  const [active, setActive] = useState<ActivePetReaction | null>(null);
  const loaded = useRef(new Set<string>());
  const timer = useRef<number>();
  const cooldown = useRef(0);
  const sequence = useRef(0);

  useEffect(() => {
    let disposed = false;
    loaded.current = new Set();
    for (const config of Object.values(theme.reactions ?? {})) {
      if (!config?.src) continue;
      const src = config.src;
      void decodeReaction(src).then(() => { if (!disposed) loaded.current.add(src); }).catch(() => { /* Base art + light feedback remain available. */ });
    }
    return () => { disposed = true; };
  }, [theme]);

  useEffect(() => {
    window.clearTimeout(timer.current);
    setActive(null);
    cooldown.current = 0;
    return () => window.clearTimeout(timer.current);
  }, [scope]);

  const config = pose ? theme.reactions?.[pose] : undefined;
  const enabled = ready && !!config;
  const trigger = useCallback(() => {
    if (!enabled || !pose || !config || performance.now() < cooldown.current) return;
    cooldown.current = performance.now() + 1500;
    const current = ++sequence.current;
    window.clearTimeout(timer.current);
    setActive({ scope, sequence: current, pose, config, src: config.src && loaded.current.has(config.src) ? config.src : undefined });
    timer.current = window.setTimeout(() => {
      setActive(value => value?.sequence === current ? null : value);
    }, config.duration);
  }, [config, enabled, pose, scope]);

  const imageFailed = useCallback(() => {
    if (active?.src) loaded.current.delete(active.src);
    setActive(value => value?.scope === scope ? { ...value, src: undefined } : value);
  }, [active?.src, scope]);

  // Synchronously reject old scopes before effects run: no outdated pose frame.
  return { active: active?.scope === scope ? active : null, enabled, trigger, imageFailed };
}
