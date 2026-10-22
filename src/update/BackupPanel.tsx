import { useState } from "react";
import { invoke } from "../tauri";
type Backup = { id: string; appVersion: string; createdAtUnixMs: number; restorable: boolean };

export function BackupPanel() {
  const [backups, setBackups] = useState<Backup[] | null>(null);
  const [selected, setSelected] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const run = async (action: () => Promise<void>) => {
    setBusy(true); setMessage("");
    try { await action(); } catch (e) { setMessage(String(e)); } finally { setBusy(false); }
  };
  return <section className="backup-panel" aria-label="本机配置备份">
    <div className="update-panel-heading"><strong>本机配置备份</strong><button type="button" disabled={busy}
      onClick={() => void run(async () => { setBackups(await invoke<Backup[]>("list_config_backups")); setConfirm(false); })}>查看备份</button></div>
    {backups !== null && <>
      <p>备份仅保存在这台电脑。恢复前会保留当前文件。</p>
      <button type="button" disabled={busy} onClick={() => void run(async () => {
        await invoke("create_config_backup"); setBackups(await invoke<Backup[]>("list_config_backups")); setMessage("当前已生效设置已备份");
      })}>立即备份</button>
      <select aria-label="选择配置备份" disabled={busy} value={selected} onChange={e => { setSelected(e.target.value); setConfirm(false); }}>
        <option value="">请选择要恢复的备份</option>
        {backups.map(b => <option key={b.id} value={b.id} disabled={!b.restorable}>{new Date(b.createdAtUnixMs).toLocaleString()} · v{b.appVersion}{b.restorable ? "" : "（无效，仅保留原文）"}</option>)}
      </select>
      {selected && (confirm ? <div className="update-actions"><button type="button" disabled={busy} onClick={() => void run(async () => {
        await invoke("restore_config_backup", { id: selected }); await invoke("hide_settings");
      })}>确认恢复所选设置</button><button type="button" onClick={() => setConfirm(false)}>取消</button></div>
        : <button type="button" disabled={busy} onClick={() => setConfirm(true)}>恢复所选备份</button>)}
      {backups.length === 0 && <p>还没有本机备份，可先点击“立即备份”。</p>}
    </>}
    {message && <p role="status">{message}</p>}
  </section>;
}
