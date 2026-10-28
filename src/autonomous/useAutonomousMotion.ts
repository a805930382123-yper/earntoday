import { useEffect, useRef, useState } from "react";
import { useAutonomousPreferences } from "./Preferences";
import { useWindowVisibility } from "../display/VisibilityProvider";
import { matchingActions, prepareAction, type AutonomousAction } from "./catalog";
import { AutonomousScheduler, type TimerClock } from "./scheduler";
import { FramePlayer, type PlaybackFrame } from "./playback";

const USER_ACTIVITY = "pet-autonomous-interrupt";
export function interruptAutonomous() { window.dispatchEvent(new Event(USER_ACTIVITY)); }
interface Options { theme: string; base: string; mini: boolean; working: boolean; privacy: boolean; blocked: boolean; scope: string }
type Debug = { play: (id: string) => boolean; snapshot: () => unknown };
declare global { interface Window { __autonomousDebug?: Debug } }

export function useAutonomousMotion(options: Options) {
  const preference = useAutonomousPreferences();
  const { nativeVisible, nativeGeneration } = useWindowVisibility();
  const candidates = matchingActions(options.theme, options.base, options.mini);
  const signature = candidates.map(a => a.id).join(":");
  const [loaded, setLoaded] = useState<{ key: string; actions: AutonomousAction[] }>({ key: "", actions: [] });
  const [failed, setFailed] = useState<Set<string>>(() => new Set());
  const [frame, setFrame] = useState<{ scope: string; value: PlaybackFrame } | null>(null);
  const alive = useRef(true), playScope = useRef("");
  const preparationAllowed = preference.ready && preference.enabled && !preference.reduced && nativeVisible && options.working && !options.privacy && !!signature;
  const allowed = preparationAllowed && !options.blocked;
  const scope = `${options.scope}:${nativeGeneration}:${allowed}:${signature}`;
  const actions = loaded.key === signature ? loaded.actions.filter(a => !failed.has(a.id)) : [];
  const latest = useRef({ scope, allowed, actions }); latest.current = { scope, allowed, actions };
  const controls = useRef<{ scheduler: AutonomousScheduler; player: FramePlayer }>();
  if (!controls.current) {
    const clock: TimerClock = { now: () => Date.now(), random: () => Math.random(),
      set: (fn, delay) => window.setTimeout(fn, delay), clear: handle => window.clearTimeout(handle as number) };
    const player = new FramePlayer(clock, value => {
      if (!alive.current) return;
      setFrame(value && latest.current.allowed && playScope.current === latest.current.scope ? { scope: playScope.current, value } : null);
    }, () => controls.current?.scheduler.finished());
    const start = (id: string) => {
      const current = latest.current;
      const action = current.actions.find(a => a.id === id);
      if (!current.allowed || !action || player.active) return false;
      playScope.current = current.scope; player.play(action); return true;
    };
    controls.current = { player, scheduler: new AutonomousScheduler(clock, start) };
  }
  useEffect(() => {
    let disposed = false;
    if (preparationAllowed) void Promise.all(candidates.map(async action => await prepareAction(action) ? action : null)).then(values => {
      if (!disposed) setLoaded({ key: signature, actions: values.filter((a): a is AutonomousAction => a !== null) });
    });
    return () => { disposed = true; };
    // Stable selection key; never subscribe to the one-second salary clock.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, preparationAllowed]);
  const actionKey = actions.map(a => a.id).join(":");
  useEffect(() => {
    const { scheduler, player } = controls.current!;
    player.cancel(false);
    scheduler.configure(`${scope}:${actionKey}`, allowed ? latest.current.actions : []);
    return () => { scheduler.stop(); player.cancel(false); };
  }, [scope, actionKey, allowed]);
  useEffect(() => {
    alive.current = true;
    const interrupt = () => {
      const { scheduler, player } = controls.current!;
      player.cancel(false); scheduler.restart();
    };
    window.addEventListener(USER_ACTIVITY, interrupt);
    window.addEventListener("pageshow", interrupt);
    let debug: Debug | undefined;
    if (import.meta.env.DEV) {
      debug = {
        play: id => {
          const current = latest.current, action = current.actions.find(a => a.id === id);
          if (!current.allowed || !action) return false;
          const { scheduler, player } = controls.current!;
          player.cancel(false); scheduler.manualStart(); playScope.current = current.scope; player.play(action); return true;
        },
        snapshot: () => ({ ...controls.current!.scheduler.snapshot(), allowed: latest.current.allowed,
          actions: latest.current.actions.map(a => a.id), scope: latest.current.scope }),
      };
      window.__autonomousDebug = debug;
    }
    return () => {
      alive.current = false;
      window.removeEventListener(USER_ACTIVITY, interrupt); window.removeEventListener("pageshow", interrupt);
      controls.current!.scheduler.stop(); controls.current!.player.cancel(false);
      if (debug && window.__autonomousDebug === debug) delete window.__autonomousDebug;
    };
  }, []);
  const active = allowed && frame?.scope === scope ? frame.value : null;
  const currentAction = active && actions.find(a => a.id === active.id);
  return { frame: active, src: currentAction && active?.state !== "static" ? currentAction.frames[active!.state] : undefined,
    ready: allowed && actions.length > 0,
    failed: () => {
      const id = active?.id;
      controls.current!.player.cancel(false); controls.current!.scheduler.restart();
      if (id) setFailed(previous => new Set(previous).add(id));
    } };
}
