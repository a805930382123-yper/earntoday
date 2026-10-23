import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "../tauri";

interface Snapshot { visible: boolean; revision: number }
const Context = createContext({ visible: false, generation: "initial" });

export function VisibilityProvider({ children }: { children: ReactNode }) {
  const [native, setNative] = useState<Snapshot>({ visible: false, revision: -1 });
  const [page, setPage] = useState({ visible: !document.hidden, revision: 0 });
  useEffect(() => {
    let disposed = false;
    let off: (() => void) | undefined;
    let retry: number | undefined;
    const accept = (value: Snapshot) => {
      if (!disposed && typeof value?.visible === "boolean" && Number.isSafeInteger(value.revision)) {
        setNative(previous => value.revision >= previous.revision ? value : previous);
      }
    };
    // Subscribe before querying; a late response cannot undo a newer hide/show.
    const connect = async (attempt = 0) => {
      try {
        const unlisten = await listen<Snapshot>("main-visibility", event => accept(event.payload));
        if (disposed) { unlisten(); return; }
        off?.(); off = unlisten;
        accept(await invoke<Snapshot>("get_main_visibility"));
      } catch (error) {
        if (!disposed && attempt < 10) retry = window.setTimeout(() => void connect(attempt + 1), 80);
        else if (!disposed) console.error(error);
      }
    };
    void connect();
    const onPage = () => setPage(previous => ({ visible: !document.hidden, revision: previous.revision + 1 }));
    document.addEventListener("visibilitychange", onPage);
    window.addEventListener("pageshow", onPage);
    return () => {
      disposed = true; off?.(); window.clearTimeout(retry);
      document.removeEventListener("visibilitychange", onPage);
      window.removeEventListener("pageshow", onPage);
    };
  }, []);
  const visible = native.visible && page.visible;
  useEffect(() => {
    document.documentElement.dataset.windowVisible = String(visible);
    return () => { delete document.documentElement.dataset.windowVisible; };
  }, [visible]);
  return <Context.Provider value={{ visible, generation: `${native.revision}:${page.revision}` }}>{children}</Context.Provider>;
}

export function useWindowVisibility() { return useContext(Context); }

export function useVisibleClock() {
  const { visible, generation } = useWindowVisibility();
  const [tick, setTick] = useState(() => ({ generation, now: new Date() }));
  useEffect(() => {
    if (!visible) return;
    const update = () => setTick({ generation, now: new Date() });
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [visible, generation]);
  return tick.generation === generation ? tick.now : new Date();
}
