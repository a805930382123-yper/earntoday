import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { Widget } from "./components/Widget";
import { Settings } from "./components/Settings";
import { invoke } from "./tauri";
import { ThemeProvider } from "./themes/ThemeProvider";
import { DisplayProvider } from "./display/DisplayProvider";
import { UpdateProvider } from "./update/UpdateProvider";

type TauriWindowMetadata = {
  currentWindow?: { label?: string };
};

type AppView = "widget" | "settings";

// 浏览器调试仍可通过 query 打开设置；生产环境只保留一个 WebView，用事件切换视图。
const kind =
  (window as unknown as { __TAURI_INTERNALS__?: TauriWindowMetadata }).__TAURI_INTERNALS__
    ?.currentWindow?.label ??
  new URLSearchParams(window.location.search).get("window") ??
  (window as unknown as { __APP_WINDOW__?: string }).__APP_WINDOW__;

export default function App() {
  const [view, setView] = useState<AppView>(kind === "settings" ? "settings" : "widget");

  useEffect(() => {
    let disposed = false;
    const disposers: Array<() => void> = [];
    let retryTimer: number | undefined;

    const subscribe = (event: string, action: () => void) => {
      void listen(event, action).then((off) => {
        if (disposed) off();
        else disposers.push(off);
      }).catch(console.error);
    };

    const detectFirstRun = async (attempt = 0) => {
      try {
        const data = await invoke<{ settings: unknown }>("load_data");
        if (!disposed && !data.settings) {
          setView("settings");
        }
      } catch {
        if (!disposed && attempt < 10) {
          retryTimer = window.setTimeout(() => detectFirstRun(attempt + 1), 80);
        }
      }
    };

    subscribe("open-settings", () => setView("settings"));
    subscribe("show-main", () => setView("widget"));
    subscribe("settings-updated", () => setView("widget"));
    void detectFirstRun();

    return () => {
      disposed = true;
      window.clearTimeout(retryTimer);
      disposers.forEach((off) => off());
    };
  }, []);

  return <DisplayProvider><ThemeProvider><UpdateProvider showNotice={view !== "settings"}>{view === "settings" ? <Settings /> : <Widget />}</UpdateProvider></ThemeProvider></DisplayProvider>;
}
