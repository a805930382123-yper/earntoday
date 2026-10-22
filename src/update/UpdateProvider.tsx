import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "../tauri";

type Info = { version: string; notes: string };
type Phase = "idle" | "checking" | "available" | "current" | "downloading" | "preparing" | "installing" | "error";
type Progress = { phase: "downloading" | "preparing" | "installing"; downloaded: number; total: number | null };
type Updater = { phase: Phase; info: Info | null; message: string; progress: Progress | null; check: () => Promise<void>; install: () => Promise<void>; later: () => void };
const Context = createContext<Updater | null>(null);
let startupChecked = false;

export function UpdateProvider({ children, showNotice = true }: { children: ReactNode; showNotice?: boolean }) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [info, setInfo] = useState<Info | null>(null);
  const [message, setMessage] = useState("");
  const [progress, setProgress] = useState<Progress | null>(null);
  const [toast, setToast] = useState(false);
  const check = async () => {
    startupChecked = true;
    setPhase("checking"); setMessage(""); setInfo(null);
    try {
      const result = await invoke<Info | null>("check_update");
      setInfo(result); setPhase(result ? "available" : "current");
      setMessage(result ? `发现新版本 ${result.version}` : "已是最新版");
      setToast(!!result);
    } catch (error) { setPhase("error"); setMessage(String(error)); }
  };
  const install = async () => {
    setPhase("downloading"); setProgress(null); setToast(false);
    try { await invoke("install_update"); }
    catch (error) { setPhase("error"); setMessage(String(error)); }
  };
  useEffect(() => {
    let disposed = false;
    let off: (() => void) | undefined;
    void listen<Progress>("update-progress", event => {
      setProgress(event.payload); setPhase(event.payload.phase);
    }).then(unlisten => { if (disposed) unlisten(); else off = unlisten; }).catch(() => {});
    // One attempt per process, including React StrictMode; no recurring polling.
    const timer = window.setTimeout(() => {
      if (!startupChecked && (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__) {
        startupChecked = true; void check();
      }
    }, 1500);
    return () => { disposed = true; off?.(); window.clearTimeout(timer); };
  }, []);
  return <Context.Provider value={{ phase, info, message, progress, check, install, later: () => { setToast(false); setPhase("idle"); } }}>
    {children}
    {toast && showNotice && <aside className="update-toast" aria-label="发现应用更新">
      <button onClick={() => { setToast(false); void invoke("open_settings"); }}>发现 {info?.version} · 查看更新</button>
      <button aria-label="稍后再说" onClick={() => setToast(false)}>×</button>
    </aside>}
  </Context.Provider>;
}

export function UpdatePanel({ unsaved = false }: { unsaved?: boolean }) {
  const update = useContext(Context)!;
  const busy = ["checking", "downloading", "preparing", "installing"].includes(update.phase);
  const percent = update.progress?.total ? Math.min(100, Math.floor(update.progress.downloaded / update.progress.total * 100)) : null;
  const status = update.phase === "downloading" ? `正在下载${percent === null ? "…" : ` ${percent}%`}`
    : update.phase === "preparing" ? "正在确认设置与本机备份…"
    : update.phase === "installing" ? "正在安装，应用即将重启…"
    : update.phase === "checking" ? "正在检查更新…" : update.message;
  return <section className="update-panel" aria-label="应用更新">
    <div className="update-panel-heading"><strong>应用更新 <small>v{__APP_VERSION__}</small></strong>
      <button type="button" disabled={busy} onClick={() => void update.check()}>检查更新</button></div>
    {status && <p role="status">{status}</p>}
    {update.phase === "downloading" && <progress aria-label="下载进度" max={100} value={percent ?? undefined} />}
    {update.info && !busy && update.phase !== "idle" && <>
      <p className="update-notes">{update.info.notes}</p>
      <p>{unsaved ? "请先保存正在编辑的设置，再安装更新。" : "更新前会备份已保存的设置，安装后自动重启。"}</p>
      <div className="update-actions"><button type="button" disabled={unsaved} onClick={() => void update.install()}>立即更新</button>
        <button type="button" onClick={update.later}>稍后再说</button></div>
    </>}
  </section>;
}
