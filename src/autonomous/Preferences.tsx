import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "../tauri";
const Context = createContext({ enabled: false, ready: false, reduced: false });
export function AutonomousPreferences({ children }: { children: ReactNode }) {
  const [preference, setPreference] = useState({ enabled: false, ready: false });
  const [reduced, setReduced] = useState(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  useEffect(() => {
    let disposed = false, revision = 0;
    let off: (() => void) | undefined;
    const load = async () => {
      const request = ++revision;
      try {
        const data = await invoke<{ autonomousMotionEnabled?: boolean; configError?: string }>("load_data");
        if (!disposed && request === revision) setPreference({ enabled: data.autonomousMotionEnabled !== false, ready: !data.configError });
      } catch { if (!disposed && request === revision) setPreference({ enabled: false, ready: false }); }
    };
    void listen("settings-updated", load).then(unlisten => { if (disposed) unlisten(); else { off = unlisten; void load(); } }).catch(() => void load());
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const change = () => setReduced(media.matches);
    media.addEventListener("change", change); change();
    return () => { disposed = true; revision++; off?.(); media.removeEventListener("change", change); };
  }, []);
  return <Context.Provider value={{ ...preference, reduced }}>{children}</Context.Provider>;
}
export function useAutonomousPreferences() { return useContext(Context); }
