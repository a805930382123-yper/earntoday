import approved from "./approved.json";
import { DEFAULT_THEME } from "../themes/catalog";
import { MIBAO_THEME } from "../themes/mibao";
import type { PlaybackDefinition } from "./playback";
import type { ScheduledAction } from "./scheduler";
import { FAST_INTERVAL, SLOW_INTERVAL } from "./frequency";
const images = import.meta.glob<string>("../assets/autonomous/*.png", { eager: true, query: "?url", import: "default" });
export interface AutonomousAction extends PlaybackDefinition, ScheduledAction { base: string; mini: boolean; frames: Record<string, string> }
const bases = { blue: DEFAULT_THEME.characters.working, mibao: MIBAO_THEME.characters.working };
const actions: AutonomousAction[] = Object.entries(approved.actions).map(([id, item]) => {
  const fast = id === "blue-blink" || id === "mibao-ear";
  return { ...item, id, base: bases[item.base as keyof typeof bases], mini: id !== "mibao-tail",
    leadMs: approved.leadMs, tailMs: approved.tailMs,
    ...(fast ? FAST_INTERVAL : SLOW_INTERVAL),
    frames: Object.fromEntries([...new Set(item.sequence)].filter(state => state !== "static").map(state => [state, images[`../assets/autonomous/${id}-${state}.png`]])) };
});
export function matchingActions(themeId: string, base: string, mini: boolean) {
  if (themeId !== "blue-whale-girl" && themeId !== "mibao") return [];
  return actions.filter(a => a.base === base && (!mini || a.mini));
}
// Failed optional art stays failed for this session: no unbounded retries.
const prepared = new Map<string, Promise<boolean>>();
function decode(src: string) {
  if (!prepared.has(src)) prepared.set(src, new Promise<boolean>(resolve => {
    const image = new Image();
    const done = (ok: boolean) => { window.clearTimeout(timer); image.onload = null; image.onerror = null; resolve(ok); };
    const timer = window.setTimeout(() => done(false), 5000);
    image.onload = () => { void image.decode().then(() => done(true), () => done(false)); };
    image.onerror = () => done(false); image.src = src;
  }));
  return prepared.get(src)!;
}
export async function prepareAction(action: AutonomousAction) { return (await Promise.all(Object.values(action.frames).map(decode))).every(Boolean); }
