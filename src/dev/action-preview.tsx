import React, { useEffect, useRef, useState, type CSSProperties } from "react";
import { createRoot } from "react-dom/client";
import { DEFAULT_THEME, previewThemeStyle, type SkinTheme } from "../themes/catalog";
import { MIBAO_THEME } from "../themes/mibao";
import manifest from "./repaired/manifest.json";
import "../styles.css";
import "../widget.css";
import "../themes.css";
import "../display.css";
import "./action-preview.css";

const assets = import.meta.glob<string>("./repaired/*.png", { eager: true, query: "?url", import: "default" });
const comparisons = import.meta.glob<string>("../../docs/action-repair/diffs/*-comparison.png", { eager: true, query: "?url", import: "default" });
type ActionId = keyof typeof manifest.actions;
type Action = {
  id: ActionId; title: string; theme: SkinTheme; labels: string[];
  contacts: number[][]; note: string; mini: boolean; region: string;
};
const blue = { theme: DEFAULT_THEME, contacts: [[619, 550], [755, 553]], mini: true };
const cat = { theme: MIBAO_THEME, contacts: [[561, 810], [1096, 705]], mini: true };
const actions: Action[] = [
  { ...blue, id: "blue-blink", title: "蓝色大肥鱼 · 慢眨眼", labels: ["原图", "半闭眼", "闭眼", "回程"],
    region: "仅两眼局部", note: "原图 → 半闭眼 → 闭眼 → 半闭眼 → 原图。半闭眼保留可见虹膜；头发、嘴巴、袖口、双手和小伙伴保留原像素。" },
  { ...blue, id: "blue-yawn", title: "蓝色大肥鱼 · 小哈欠", labels: ["原图", "微张", "哈欠", "回程"],
    region: "两眼与小片嘴部", note: "原图 → 眼睛变窄、嘴巴微张 → 小哈欠 → 过渡姿态 → 原图。只取补画的眼口局部，手与袖口保持不动。" },
  { ...cat, id: "mibao-ear", title: "咪宝 · 双耳轻动", labels: ["原图", "起动", "微偏", "轻动", "回程", "收回"],
    region: "双耳、减弱的耳根及连接毛发", note: "双耳小幅向外轻动，再缓缓收回。耳根联动幅度已减小，连接毛发更早收束到固定头部，减少对头型的牵拉。猫脸、眼睛、胡须、爪子和鱼玩具不变。" },
  { ...cat, id: "mibao-tail", title: "咪宝 · 尾尖轻摆", labels: ["原图", "右摆", "回中", "左摆"], mini: false,
    region: "尾巴最上端局部", note: "原图 → 尾尖右偏 → 原图回中 → 尾尖左偏 → 原图。尾巴下段与尾根保持原像素；没有分离尾巴图层、挖洞或叠加双尾。" },
];
function art(action: Action, state: string) {
  return state === "static" ? action.theme.characters.working : assets[`./repaired/${action.id}-${state}.png`];
}
function Character({ action, frame, guides, overlay, regions }: { action: Action; frame: number; guides: boolean; overlay: boolean; regions: boolean }) {
  const data = manifest.actions[action.id];
  const state = data.sequence[frame];
  const [nativeWidth, nativeHeight] = data.size;
  const fit = Math.min(1235 / nativeWidth, 561 / nativeHeight);
  const position = (x: number, y: number) => ({ left: `${((1235-nativeWidth*fit)/2+x*fit)/1235*100}%`, top: `${(561-nativeHeight*fit+y*fit)/561*100}%` });
  return <div className="chibi-girl mood-working" style={{ width: 361 }}>
    {/* Exact production container and object-fit/mask for ALL images. The only
        moving pixels are baked into local regions of the read-only source. */}
    <div className="chibi-poses">
      <img className="chibi-base preview-original" src={action.theme.characters.working} alt="正式静态底稿" draggable={false}
        style={{ visibility: state === "static" || overlay ? "visible" : "hidden", opacity: state !== "static" && overlay ? 0.5 : 1 }} />
      {data.states.map(item => <img key={item.state} className="chibi-base preview-action-frame" data-state={item.state}
        src={art(action, item.state)} alt={item.state} draggable={false}
        style={{ visibility: state === item.state ? "visible" : "hidden", opacity: overlay ? 0.5 : 1 }} />)}
      {regions && <img className="chibi-base allowed-region" src={assets[`./repaired/${action.id}-allowed.png`]} alt="允许变化区域" />}
      {guides && action.contacts.map(([x, y], i) => <React.Fragment key={i}>
        <i className="anchor target-anchor" style={position(x, y)} />
        {state !== "static" && <i className="anchor source-anchor" style={position(x, y)} />}
      </React.Fragment>)}
    </div>
  </div>;
}

function Sample({ action, mini, background, guides, regions }: { action: Action; mini: boolean; background: string; guides: boolean; regions: boolean }) {
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(false);
  const [overlay, setOverlay] = useState(false);
  const timers = useRef<number[]>([]);
  const data = manifest.actions[action.id];
  const stop = () => { timers.current.forEach(window.clearTimeout); timers.current = []; setPlaying(false); };
  useEffect(() => {
    let cancelled = false;
    Promise.all([...new Set(data.sequence)].map(state => {
      const image = new Image(); image.src = art(action, state); return image.decode();
    })).then(() => { if (!cancelled) setReady(true); }, () => { if (!cancelled) setError(true); });
    return () => { cancelled = true; timers.current.forEach(window.clearTimeout); };
  }, [action, data]);
  const play = () => {
    stop(); setFrame(0); setOverlay(false); setPlaying(true);
    let elapsed = 360;
    data.sequence.slice(1, -1).forEach((_, i) => {
      const index = i + 1;
      timers.current.push(window.setTimeout(() => setFrame(index), elapsed));
      elapsed += data.timing[i];
    });
    timers.current.push(window.setTimeout(() => setFrame(0), elapsed));
    timers.current.push(window.setTimeout(() => { setPlaying(false); timers.current = []; }, elapsed + 360));
  };
  const select = (next: number) => { stop(); setFrame(next); if (data.sequence[next] === "static") setOverlay(false); };
  const style = { ...previewThemeStyle(action.theme), "--mini-pet-width": action.theme.mini?.width,
    "--mini-pet-left": action.theme.mini?.offsets?.working, "--mini-pet-top": action.theme.mini?.top } as CSSProperties;
  return <section className="sample" data-sample={`${action.id}-${mini ? "mini" : "full"}`} data-playing={playing} data-active-frame={frame} data-active-key={data.sequence[frame]}>
    <h3>{mini ? "迷你" : "完整"}模式 <small>{mini ? "260 × 108" : "260 × 276"} CSS px</small></h3>
    <div className={`sample-viewport bg-${background}`} style={{ height: mini ? 108 : 276 }}>
      <div className="theme-root" data-theme-id={action.theme.id} style={style}>
        <div className={mini ? "mini-stage" : "widget-stage"}>
          <div className={mini ? "card mini-card" : "card pet-card"}><span className="preview-surface-label">角色接触面 · 开发样板</span></div>
          <div className={mini ? "mini-pet" : "girl-wrap"}>
            {mini ? <div className="mini-pet-clip"><Character action={action} frame={frame} guides={guides} overlay={overlay} regions={regions && !playing} /></div>
              : <Character action={action} frame={frame} guides={guides} overlay={overlay} regions={regions && !playing} />}
          </div>
          {!mini && <div className="girl-contact-shadow" />}
          {guides && <div className="contact-guide" />}
        </div>
      </div>
    </div>
    <div className="sample-controls">
      <button className="play-once" onClick={play} disabled={!ready || playing}>{playing ? "播放中…" : "播放一次"}</button>
      <output aria-live="polite">{error ? "素材加载失败" : !ready ? "解码中…" : data.sequence[frame] === "static" ? "正式原图" : action.labels[frame]}</output>
    </div>
    <div className="frame-controls" aria-label="逐帧检查">
      {action.labels.map((text, i) => <button key={text} data-step={i} disabled={!ready} aria-pressed={frame === i} onClick={() => select(i)}>{text}</button>)}
    </div>
    <label className="overlay-control"><input type="checkbox" checked={overlay} disabled={data.sequence[frame] === "static" || playing} onChange={e => setOverlay(e.target.checked)} />50% 原图叠加（仅手动检查）</label>
    <p className="sample-hint">{mini ? `200 px 容器；左偏移 ${action.theme.mini?.offsets?.working}；原有裁切` : "361 px 容器 × 0.5 = 180.5 px；原有底边遮罩"}</p>
  </section>;
}

function Preview() {
  const [background, setBackground] = useState("checker");
  const [guides, setGuides] = useState(false);
  const [regions, setRegions] = useState(false);
  return <main className="action-preview">
    <header><h1>同一底稿，只看局部动作</h1>
      <p>正式原图进入，正式原图恢复。仅手动播放；七个样本保持原有实际尺寸和裁切。</p>
      <p className="review-warning">像素检查已通过，连续动作待视觉确认。不会接入正式自主调度。</p>
      <div className="preview-toolbar"><label>背景 <select aria-label="背景" value={background} onChange={e => setBackground(e.target.value)}><option value="checker">透明棋盘</option><option value="light">浅色</option><option value="dark">深色</option></select></label>
        <label><input type="checkbox" checked={guides} onChange={e => setGuides(e.target.checked)} />接触线与锚点</label>
        <label><input type="checkbox" checked={regions} onChange={e => setRegions(e.target.checked)} />允许变化区域</label>
        <span>紫圈：原图　青框：返修接触点　紫色面：允许区</span></div>
    </header>
    <div className="action-grid">{actions.map(action => <article className="action-panel" key={action.id} data-action={action.id}>
      <div className="action-heading"><h2>{action.title}</h2><small>视觉待确认</small></div>
      <div className="pixel-summary"><span>区域外变化 <strong>0</strong> 像素</span><span>{action.region}</span></div>
      <div className="samples"><Sample action={action} mini={false} background={background} guides={guides} regions={regions} />
        {action.mini ? <Sample action={action} mini background={background} guides={guides} regions={regions} /> : <div className="excluded-mini"><h3>迷你模式</h3><p>本轮仅验证完整模式</p></div>}</div>
      <p className="repair-note">{action.note}</p>
      <details className="difference-evidence"><summary>查看正式底稿与像素差异</summary>
        <p>底稿：<code>{manifest.bases[manifest.actions[action.id].base as keyof typeof manifest.bases].path}</code></p>
        <p>紫色为允许区域，青色为实际变化。所有帧与底稿共享画布；眼口补画候选仅通过局部遮罩使用。</p>
        <a href={comparisons[`../../docs/action-repair/diffs/${action.id}-comparison.png`]} target="_blank" rel="noreferrer"><img src={comparisons[`../../docs/action-repair/diffs/${action.id}-comparison.png`]} alt={`${action.title}底稿、允许区与逐帧差异`} loading="lazy" /></a>
      </details>
    </article>)}</div>
    <footer>首尾直接引用正式原始 PNG。9 张无损局部返修帧；回程复用已有帧。透明边缘继承底稿，未改动非动作区。浏览器请保持 100% 缩放；迷你模式沿用正式裁切，未另行放大角色。</footer>
  </main>;
}

if (import.meta.env.DEV) createRoot(document.getElementById("root")!).render(<React.StrictMode><Preview /></React.StrictMode>);
