import { useDisplay } from "../display/DisplayProvider";
import { invoke } from "../tauri";

export function EyeIcon({ hidden }: { hidden: boolean }) {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
    <circle cx="12" cy="12" r="3" />{hidden && <path d="m3 3 18 18" strokeWidth="2.4" />}
  </svg>;
}
export function LockIcon() {
  return <svg className="privacy-lock" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="5" y="10" width="14" height="11" rx="3" /><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 4v3" /></svg>;
}
export function DisplayControls({ mini = false }: { mini?: boolean }) {
  const { windowMode, privacyMode, displayMode, setWindowMode, togglePrivacy, busy } = useDisplay();
  const title = mini ? "恢复完整模式" : "进入迷你模式";
  const privacy = displayMode === "collection" ? privacyMode === "hidden" ? "恢复展示" : "隐私隐藏" : privacyMode === "hidden" ? "显示收入" : "隐藏收入";
  const modeControl = <button type="button" className="icon-btn mode-control" title={title} aria-label={title} aria-pressed={windowMode === "mini"} disabled={busy} onClick={() => setWindowMode(mini ? "full" : "mini")}>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {mini ? <path d="M9 3H3v6m12-6h6v6M3 15v6h6m12-6v6h-6M3 3l6 6m12-6-6 6M3 21l6-6m12 6-6-6" /> : <path d="M3 9h6V3m6 0v6h6M9 15H3m6 0v6m6 0v-6h6M3 3l6 6m12-6-6 6M3 21l6-6m12 6-6-6" />}
      </svg>
    </button>;
  const privacyControl = <button type="button" className="icon-btn privacy-control" title={privacy} aria-label={privacy} aria-pressed={privacyMode === "hidden"} disabled={busy} onClick={togglePrivacy}><EyeIcon hidden={privacyMode === "hidden"} /></button>;
  return <div className={`display-controls${mini ? " mini-controls" : ""}`}>
    {mini ? <>{privacyControl}{modeControl}</> : <>{modeControl}{privacyControl}</>}
    {mini && <>
      <button type="button" className="icon-btn" title="设置" aria-label="打开设置" onClick={() => invoke("open_settings").catch(console.error)}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="12" cy="12" r="3" /><path d="m9 3-1 3-3 1-2 4 2 3 1 4 4 3 3-2 4-1 3-4-2-3-1-4-4-3-3 2Z" /></svg>
      </button>
      <button type="button" className="icon-btn" title="隐藏到托盘" aria-label="隐藏到托盘" onClick={() => invoke("hide_main").catch(console.error)}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M5 12h14" /></svg></button>
    </>}
  </div>;
}
