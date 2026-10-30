import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "../tauri";
import { DEFAULT_THEME, preloadTheme, resolveTheme, type SkinTheme } from "./catalog";

interface ThemeContextValue {
  theme: SkinTheme;
  ready: boolean;
  applyTheme: (id: string) => Promise<void>;
  assetError: () => void;
  notice: string | null;
}
const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState(DEFAULT_THEME);
  const [ready, setReady] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [transitioning, setTransitioning] = useState(false);
  const previousId = useRef(DEFAULT_THEME.id);
  const sequence = useRef(0);
  const mounted = useRef(true);

  useEffect(() => {
    if (previousId.current === theme.id) return;
    previousId.current = theme.id;
    setTransitioning(true);
    const timer = window.setTimeout(() => setTransitioning(false), 250);
    return () => window.clearTimeout(timer);
  }, [theme.id]);

  const acceptTheme = useCallback(async (id: unknown) => {
    const request = ++sequence.current;
    const candidate = resolveTheme(id);
    try {
      await preloadTheme(candidate);
      if (!mounted.current || request !== sequence.current) return;
      setTheme(candidate);
      setReady(true);
      setNotice(id && candidate.id !== id ? "主题不可用，已恢复蓝色大肥鱼。" : null);
    } catch {
      if (!mounted.current || request !== sequence.current) return;
      setTheme(DEFAULT_THEME);
      setReady(true);
      setNotice("主题素材无法加载，已恢复蓝色大肥鱼。");
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    let disposed = false;
    let off: (() => void) | undefined;
    let retry: number | undefined;
    const load = async (attempt = 0) => {
      try {
        const data = await invoke<{ selectedThemeId?: string | null }>("load_data");
        if (!disposed) await acceptTheme(data.selectedThemeId);
      } catch {
        if (!disposed && attempt < 10) retry = window.setTimeout(() => void load(attempt + 1), 80);
      }
    };
    // Subscribe before reading persistence, using the same Tauri event path for
    // this shared WebView and any future second window.
    void listen<string>("theme-updated", event => {
      if (!disposed) {
        if (event.payload) void acceptTheme(event.payload);
        else void load();
      }
    }).then(unlisten => {
      if (disposed) unlisten();
      else { off = unlisten; void load(); }
    }).catch(() => { if (!disposed) void load(); });
    return () => {
      disposed = true;
      mounted.current = false;
      sequence.current++;
      window.clearTimeout(retry);
      off?.();
    };
  }, [acceptTheme]);

  const applyTheme = useCallback(async (id: string) => {
    const candidate = resolveTheme(id);
    if (candidate.id !== id) throw new Error("主题不可用，请选择蓝色大肥鱼。");
    // Decode all four poses before saving/applying; failures leave the current
    // theme and salary draft intact. The backend commits only this one field.
    await preloadTheme(candidate);
    await invoke("save_theme", { selectedThemeId: id });
    await acceptTheme(id);
  }, [acceptTheme]);

  const assetError = useCallback(() => {
    sequence.current++;
    setTheme(DEFAULT_THEME);
    setNotice("主题素材无法加载，已恢复蓝色大肥鱼。");
  }, []);
  const value = useMemo(() => ({ theme, ready, applyTheme, assetError, notice }), [theme, ready, applyTheme, assetError, notice]);
  const style = { ...theme.colors, "--skin-character-filter": theme.characterFilter, "--skin-note-symbol": theme.decorations.symbolColor } as CSSProperties;
  return <ThemeContext.Provider value={value}><div className={`theme-root${transitioning ? " theme-transition" : ""}`} data-theme-id={theme.id} style={style}>{children}</div></ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("ThemeProvider is required");
  return context;
}
