import { useEffect, useState } from "react";
import { invoke } from "../tauri";

interface Status { enabled: boolean; registered: boolean; error: string | null }
export function ShortcutPanel() {
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let disposed = false;
    void invoke<Status>("get_shortcut_status").then(value => { if (!disposed) setStatus(value); })
      .catch(err => { if (!disposed) setError(String(err)); });
    return () => { disposed = true; };
  }, []);
  const change = async (enabled: boolean) => {
    setBusy(true); setError("");
    try { setStatus(await invoke<Status>("set_shortcut_enabled", { enabled })); }
    catch (err) {
      setError(String(err));
      // A failed disk write may have rolled native registration back.
      try { setStatus(await invoke<Status>("get_shortcut_status")); } catch { /* Keep the existing diagnostic. */ }
    }
    finally { setBusy(false); }
  };
  return <section className="backup-panel shortcut-panel" aria-label="隐藏与恢复">
    <strong>隐藏与恢复</strong>
    <p>Ctrl+Shift+H 隐藏或恢复当前页面，保留未保存的设置。也可点击托盘恢复。</p>
    <label><input type="checkbox" checked={status?.enabled ?? false} disabled={busy || !status} onChange={event => void change(event.target.checked)} />启用全局快捷键</label>
    {status && <p role="status">{status.registered ? "快捷键已启用" : status.enabled ? "快捷键未注册，托盘仍可恢复" : "快捷键已停用"}</p>}
    {(error || status?.error) && <p className="error" role="alert">{error || status?.error}</p>}
    {status?.enabled && !status.registered && <button type="button" disabled={busy} onClick={() => void change(true)}>重试注册快捷键</button>}
  </section>;
}
