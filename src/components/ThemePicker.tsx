import { useState, type CSSProperties } from "react";
import { invoke } from "../tauri";
import { PUBLIC_THEMES, previewThemeStyle, resolveTheme } from "../themes/catalog";
import { useTheme } from "../themes/ThemeProvider";

export function PaletteIcon() {
  return <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
    <path d="M12 3a9 9 0 1 0 0 18h1a2.5 2.5 0 0 0 2.1-3.9 1.4 1.4 0 0 1 1.1-2.1h1a4.5 4.5 0 0 0 3.8-6.7A9 9 0 0 0 12 3Z" />
    <circle cx="7.5" cy="10" r=".8" fill="currentColor" /><circle cx="11" cy="7" r=".8" fill="currentColor" /><circle cx="15.5" cy="8" r=".8" fill="currentColor" /><circle cx="7.5" cy="14" r=".8" fill="currentColor" />
  </svg>;
}

export function ThemePicker({ onBack }: { onBack: () => void }) {
  const { theme, applyTheme, notice } = useTheme();
  const [selectedId, setSelectedId] = useState(theme.id);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [brokenId, setBrokenId] = useState<string | null>(null);
  const preview = resolveTheme(selectedId);
  const current = preview.id === theme.id;
  const apply = async () => {
    if (busy || current) return;
    setBusy(true); setError(null);
    try { await applyTheme(preview.id); }
    catch (err) { setError(`未能使用此主题：${String(err)}`); }
    finally { setBusy(false); }
  };

  return <div className="settings-shell theme-picker">
    <div className="card settings-card theme-picker-card">
      <header className="theme-picker-header" data-tauri-drag-region>
        <button type="button" className="icon-btn" aria-label="返回工资设置" onClick={onBack} disabled={busy}>‹</button>
        <h1>皮肤主题</h1>
        <button type="button" className="icon-btn" aria-label="关闭设置" onClick={() => invoke("hide_settings").catch(console.error)} disabled={busy}>×</button>
      </header>
      <p className="theme-intro">选一个喜欢的小伙伴，陪你度过打工时光。</p>
      <div className="theme-list" aria-label="可用皮肤">
        {PUBLIC_THEMES.map(item => <button type="button" key={item.id} style={previewThemeStyle(item) as CSSProperties} className={`theme-option${selectedId === item.id ? " is-selected" : ""}`} aria-pressed={selectedId === item.id} onClick={() => { setSelectedId(item.id); setError(null); }} disabled={busy}>
          <img className="theme-cover" src={item.cover} alt="" draggable={false} onError={() => setBrokenId(item.id)} />
          <span className="theme-option-copy"><strong>{item.name}</strong><span>{item.description}</span><small className={`theme-current${theme.id === item.id ? "" : " theme-current-empty"}`}>{theme.id === item.id ? "✓ 当前使用" : "\u00a0"}</small></span>
        </button>)}
      </div>
      <section className="theme-preview" aria-label={`${preview.name}状态预览`} style={previewThemeStyle(preview) as CSSProperties}>
        <div className="theme-preview-heading"><h2>陪伴你的每个时刻</h2><span>三种状态，同一个小伙伴</span></div>
        <div className="theme-state-previews">
          {([['working', '上班'], ['lunch', '午休'], ['finished', '下班']] as const).map(([state, label]) => <figure key={state}>
            <div><img src={preview.characters[state]} alt={`${preview.name}·${label}`} draggable={false} onError={() => setBrokenId(preview.id)} /></div><figcaption>{label}</figcaption>
          </figure>)}
        </div>
        <div className="theme-settings-preview"><img src={preview.characters.settings} alt={`${preview.name}·设置`} draggable={false} onError={() => setBrokenId(preview.id)} /><div><strong>也陪你算算打工身价</strong><p>人物、卡片和设置界面一起换肤</p><div className="theme-swatches" aria-hidden="true"><i /><i /><i /></div></div></div>
      </section>
      {(error || brokenId === preview.id || notice) && <p className="theme-notice" role={error ? "alert" : "status"}>{error || (brokenId === preview.id ? "预览素材无法加载，请返回后重试。" : notice)}</p>}
      <button type="button" className="primary-btn theme-apply" onClick={() => void apply()} disabled={busy || current || brokenId === preview.id}>{busy ? "正在使用…" : current ? "当前使用" : "使用此主题"}</button>
      <p className="theme-footnote">只换一个陪伴风格，工资和工作时间保持原样。</p>
    </div>
  </div>;
}
