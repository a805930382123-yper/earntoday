import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "../tauri";

export type WindowMode = "full" | "mini";
export type PrivacyMode = "visible" | "hidden";
export type DisplayMode = "amount" | "collection";
interface Preferences { windowMode: WindowMode; privacyMode: PrivacyMode; displayMode: DisplayMode }
interface DisplayContextValue extends Preferences {
  ready: boolean;
  busy: boolean;
  error: string | null;
  reload: () => void;
  setWindowMode: (mode: WindowMode) => void;
  togglePrivacy: () => void;
}
const Context = createContext<DisplayContextValue | null>(null);

export function DisplayProvider({ children }: { children: ReactNode }) {
  // Fail closed until persistence has been read, including during cold startup.
  const [preferences, setPreferences] = useState<Preferences>({ windowMode: "full", privacyMode: "hidden", displayMode: "amount" });
  const [ready, setReady] = useState(false), [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(false), revision = useRef(0), localHidden = useRef(false), saving = useRef(false);
  const accept = useCallback((value: Partial<Preferences>) => {
    const mode = value.windowMode ?? "full", privacy = value.privacyMode ?? "visible", display = value.displayMode ?? "amount";
    if (!["full", "mini"].includes(mode) || !["visible", "hidden"].includes(privacy) || !["amount", "collection"].includes(display)) throw new Error("显示配置无效");
    setPreferences({ windowMode: mode, privacyMode: localHidden.current ? "hidden" : privacy, displayMode: display });
    setReady(true);
  }, []);
  const load = useCallback(async (attempt = 0) => {
    const request = ++revision.current;
    try {
      const data = await invoke<Partial<Preferences> & { configError?: string }>("load_data");
      if (!mounted.current || request !== revision.current) return;
      if (data.configError) throw new Error(data.configError);
      accept(data); setError(null);
    } catch (err) {
      if (!mounted.current || request !== revision.current) return;
      if (attempt < 10 && String(err).includes("bridge")) {
        window.setTimeout(() => { if (mounted.current && request === revision.current) void load(attempt + 1); }, 80);
      } else { setReady(false); setError(`显示设置读取失败，金额暂不显示。${String(err)}`); }
    }
  }, [accept]);
  useEffect(() => {
    mounted.current = true;
    let disposed = false, off: (() => void) | undefined;
    void listen<Preferences>("display-updated", event => {
      if (disposed) return;
      revision.current++;
      try { accept(event.payload); setError(null); } catch (err) { setReady(false); setError(String(err)); }
    }).then(unlisten => {
      if (disposed) unlisten();
      else { off = unlisten; void load(); }
    }).catch(() => { if (!disposed) void load(); });
    return () => { disposed = true; mounted.current = false; revision.current++; off?.(); };
  }, [accept, load]);

  const save = async (kind: "window" | "privacy", value: WindowMode | PrivacyMode) => {
    if (saving.current) return;
    saving.current = true; setBusy(true); setError(null); revision.current++;
    if (kind === "privacy" && value === "hidden") {
      localHidden.current = true;
      setPreferences(previous => ({ ...previous, privacyMode: "hidden" }));
    }
    try {
      const updated = await invoke<Preferences>(kind === "window" ? "set_window_mode" : "set_privacy_mode", kind === "window" ? { windowMode: value } : { privacyMode: value });
      if (!mounted.current) return;
      if (kind === "privacy") localHidden.current = false;
      accept(updated);
    } catch (err) {
      if (mounted.current) setError(kind === "privacy" && value === "hidden" ? "收入已遮盖，但保存失败；重启后可能恢复显示。请重试。" : `显示设置未能保存，请重试。${String(err)}`);
    } finally { saving.current = false; if (mounted.current) setBusy(false); }
  };
  return <Context.Provider value={{ ...preferences, ready, busy, error, reload: () => void load(), setWindowMode: mode => void save("window", mode), togglePrivacy: () => void save("privacy", preferences.privacyMode === "hidden" ? "visible" : "hidden") }}>{children}</Context.Provider>;
}

export function useDisplay() {
  const value = useContext(Context);
  if (!value) throw new Error("DisplayProvider is required");
  return value;
}
