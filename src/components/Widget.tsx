import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useVisibleClock, useWindowVisibility } from "../display/VisibilityProvider";
import { invoke } from "../tauri";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import type { GirlMood } from "./ChibiGirl";
import { InteractivePet, PetBubble } from "./InteractivePet";
import { usePetInteraction } from "../interaction/usePetInteraction";
import { useTheme } from "../themes/ThemeProvider";
import { useDisplay } from "../display/DisplayProvider";
import { DisplayControls, LockIcon } from "./DisplayControls";
import { MiniWidget } from "./MiniWidget";
import { Collection } from "./Collection";
import { collectionStage } from "../collection/progress";
import { useCollection } from "../collection/useCollection";
import {
  DEFAULT_SETTINGS,
  earnedAmount,
  effectiveWorkedMinutes,
  formatDuration,
  minutesUntilOffWork,
  workProgress,
  workState,
  type SalarySettings,
  type WorkState,
} from "../salary/calc";

const STATUS_TEXT: Record<WorkState, string> = {
  working: "努力赚钱中",
  lunch: "午休充电中",
  after: "今日打工完成",
  before: "准备开工啦",
  rest_day: "今天休息啦～",
};

const MOOD: Record<WorkState, GirlMood> = {
  working: "working",
  lunch: "lunch",
  after: "happy",
  before: "rest",
  rest_day: "lunch",
};

// Keep the entrance quiet when returning from settings within this app session.
const celebratedDays = new Set<string>();

const CheckIcon = () => (
  <svg className="status-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none">
    <circle cx="12" cy="12" r="10" fill="currentColor" />
    <path d="m7.5 12 3 3 6-6" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const CatIcon = () => (
  <svg className="after-cat" viewBox="0 0 32 28" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round">
    <path d="m5 12-1-9 8 5a18 18 0 0 1 8 0l8-5-1 9c7 14-29 18-22 0Z" fill="#fff" />
    <path d="M10 15h1m10 0h1m-8 4 2 1 2-1" strokeLinecap="round" />
    <ellipse cx="8" cy="19" rx="2" ry="1.4" fill="#ffc2cf" stroke="none" />
    <ellipse cx="24" cy="19" rx="2" ry="1.4" fill="#ffc2cf" stroke="none" />
  </svg>
);

const MoneyBagIcon = () => (
  <svg className="label-icon" viewBox="0 0 24 24" width="34" height="34" aria-hidden="true">
    <path
      d="M9.3 7h5.4l3.2 5.3c1.4 2.4.4 5.4-2 6.7a9.2 9.2 0 0 1-7.8 0c-2.4-1.3-3.4-4.3-2-6.7L9.3 7Z"
      fill="#4b9bff"
    />
    <path d="M8.8 3.7h6.4l-1.8 2.4h-2.8L8.8 3.7Z" fill="#2c7fe8" />
    <path
      d="M9.7 11.6 12 14l2.3-2.4M10.2 16.2h3.6M12 13v5.4"
      stroke="#fff"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
  </svg>
);

const StatusChartIcon = () => (
  <svg className="status-icon" viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
    <rect x="4" y="12.5" width="4" height="8" rx="2" fill="#8ec5ff" />
    <rect x="10" y="8" width="4" height="12.5" rx="2" fill="#4b9bff" />
    <rect x="16" y="3.5" width="4" height="17" rx="2" fill="#2c7fe8" />
  </svg>
);

const ClockIcon = () => (
  <svg className="time-icon" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <circle cx="12" cy="12" r="8.2" />
    <path d="M12 7.6V12l3 2" />
  </svg>
);

const CoffeeIcon = () => (
  <svg className="status-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 10h12v5a5 5 0 0 1-5 5h-2a5 5 0 0 1-5-5v-5Zm12 1h1a3 3 0 0 1 0 6h-2M4 21h15M8 3c-2 2 2 2 0 4M13 2c-2 2 2 2 0 4" />
  </svg>
);

const HourglassIcon = () => (
  <svg className="time-icon" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
    <path d="M7 3.8h10l-5 7-5-7Z" fill="#7fb2e8" />
    <path d="M7 20.2h10l-5-7-5 7Z" fill="#4b9bff" />
    <path d="M7.8 3.8h8.4M7.8 20.2h8.4" stroke="var(--skin-icon, #2c7fe8)" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

export function Widget() {
  const { theme } = useTheme();
  const { windowMode, privacyMode, displayMode, ready, error, reload } = useDisplay();
  const hidden = privacyMode === "hidden";
  const collection = displayMode === "collection" && !hidden;
  const [settings, setSettings] = useState<SalarySettings | null>(null);
  const now = useVisibleClock();
  const { visible, generation } = useWindowVisibility();
  const [celebrate, setCelebrate] = useState(false);

  const loadSettings = useCallback(async () => {
    try {
      const data = await invoke<{ settings: SalarySettings | null }>("load_data");
      if (data.settings) setSettings(data.settings);
    } catch (e) {
      console.error("加载设置失败", e);
    }
  }, []);

  useEffect(() => {
    loadSettings();
    const un = listen("settings-updated", () => loadSettings());
    return () => {
      un.then((f) => f());
    };
  }, [loadSettings]);

  const s = settings ?? DEFAULT_SETTINGS;
  const state = settings ? workState(now, s) : "before";
  const interaction = usePetInteraction(theme, state, windowMode, ready && visible, `${generation}:${privacyMode}:${displayMode}`);
  const money = settings ? earnedAmount(now, s) : 0;
  const progress = settings ? workProgress(now, s) : 0;
  const worked = settings ? formatDuration(effectiveWorkedMinutes(now, s)) : "0m";
  const remaining = settings ? formatDuration(minutesUntilOffWork(now, s)) : "--";
  const dayKey = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;
  const stage = collectionStage(progress, state);
  const deposit = useCollection({ stage, state, time: now.getTime(), day: dayKey,
    scope: JSON.stringify([generation, theme.id, windowMode, displayMode, privacyMode, settings]),
    enabled: visible && ready && collection && !!settings && (state === "working" || state === "after") });

  const previousWork = useRef<{ state: string; day: string; generation: string; time: number } | null>(null);
  const activeCelebration = celebrate && previousWork.current?.generation === generation && previousWork.current?.day === dayKey;
  useEffect(() => {
    const previous = previousWork.current;
    const entersAfter = visible && state === "after" && previous?.state === "working" &&
      previous.day === dayKey && previous.generation === generation &&
      now.getTime() - previous.time > 0 && now.getTime() - previous.time <= 2500;
    if (!visible || state !== "after" || previous?.generation !== generation) setCelebrate(false);
    if (entersAfter && !celebratedDays.has(dayKey)) { celebratedDays.add(dayKey); setCelebrate(true); }
    previousWork.current = visible ? { state, day: dayKey, generation, time: now.getTime() } : null;
  }, [visible, state, dayKey, generation, now]);

  const moneyText = money.toFixed(2);
  const [int, dec] = moneyText.split(".");
  const intPart = useMemo(() => ({ int: Number(int).toLocaleString("zh-CN") }), [int]);

  const handleDragEnd = useCallback(async () => {
    try {
      const win = getCurrentWebviewWindow();
      const pos = await win.outerPosition();
      const scale = await win.scaleFactor();
      // 保存逻辑坐标，HiDPI 缩放变化后仍能恢复到相近位置
      await invoke("save_position", { x: pos.x / scale, y: pos.y / scale });
    } catch (e) {
      console.error("保存位置失败", e);
    }
  }, []);

  if (!ready) return <div className="display-loading card" role="status"><span>••••••</span><p>{error ? "显示设置读取失败，内容暂不显示。" : "正在读取显示设置…"}</p>{error && <button type="button" className="display-retry" onClick={reload}>重新读取</button>}<button type="button" className="display-retry" onClick={() => invoke("open_settings").catch(console.error)}>打开设置</button></div>;
  if (windowMode === "mini") return <MiniWidget state={state} mood={MOOD[state]} moneyText={moneyText} status={theme.stateLabels?.[state] ?? STATUS_TEXT[state]} onDragEnd={handleDragEnd} interaction={interaction} stage={stage} deposit={deposit} />;

  return (
    <div className={`widget-stage state-${state}${hidden ? " privacy-hidden" : ""}${collection ? " collection-mode" : ""}`} data-work-state={state} data-window-mode="full" onContextMenu={(e) => e.preventDefault()}>
      {/* 全窗口拖动层（按钮在其上方，互不干扰） */}
      <div className="drag-overlay" data-tauri-drag-region onMouseUp={handleDragEnd} />

      {/* 接触阴影：双手和衣袖压在卡片上 */}
      <div className="girl-contact-shadow" />

      {/* Q 版蓝发女孩：趴在卡片上沿 */}
      <div className="girl-wrap">
        <InteractivePet mood={MOOD[state]} interaction={interaction} onDragEnd={handleDragEnd} stage={stage} />
      </div>
      <PetBubble interaction={interaction} />

      {/* 数字信息卡片 */}
      <div className="card pet-card">
        <DisplayControls />
        {theme.decorations.cardAccent && <img className="theme-card-accent" src={theme.decorations.cardAccent} alt="" aria-hidden="true" draggable={false} />}
        <div className="card-drag-overlay" data-tauri-drag-region onMouseUp={handleDragEnd} />
        <div className="card-actions">
          <button
            type="button"
            className="icon-btn"
            title="设置"
            aria-label="打开设置"
            onClick={() => invoke("open_settings").catch(console.error)}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
          <button
            type="button"
            className="icon-btn"
            title="隐藏到托盘"
            aria-label="隐藏到托盘"
            onClick={() => invoke("hide_main").catch(console.error)}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <path d="M5 12h14" />
            </svg>
          </button>
        </div>

        {collection ? <Collection stage={stage} state={state} pulse={deposit.pulse} onAnimationEnd={deposit.finish} interacting={!!interaction.active} /> : <><div className="money-label">
          <MoneyBagIcon />
          <span>今天已经赚到</span>
        </div>
        <div className={`amount${hidden ? " masked-amount" : moneyText.length > 8 ? " amount-compact" : ""}`} aria-label={hidden ? "收入已隐藏" : undefined}>
          <span className="currency">¥</span>
          {hidden ? <span className="privacy-mask">••••••</span> : <>{intPart.int}<span className="decimals">.{dec}</span></>}
        </div></>}

        {!collection && <div className={`status-row${state === "after" ? " completion-badge" : ""}`}>
          {state === "after" ? <CheckIcon /> : state === "lunch" || state === "rest_day" ? <CoffeeIcon /> : <StatusChartIcon />}
          {state === "lunch" || state === "after" || state === "rest_day" ? null : <span className={`status-dot status-${state}`} />}
          <span className="status-text">{theme.stateLabels?.[state] ?? STATUS_TEXT[state]}</span>
          {hidden && <span className="privacy-caption"><LockIcon />收入已隐藏</span>}
          <span className="status-zzz" aria-hidden="true">z z Z</span>
        </div>}

        {state === "rest_day" ? <p className="rest-day-summary">今天不用赶时间，好好休息吧</p> : <div className="progress-area">
          {!collection && <div className="progress-track">
            <div className="progress-bar" role="progressbar" aria-label="今日有效工作进度" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
              <div className="progress-fill" style={{ width: `${(progress * 100).toFixed(2)}%` }} />
            </div>
            {state === "after" && <span className="progress-percent">100%</span>}
          </div>}
          <div className="progress-times">
            <span className="time-item">
              <ClockIcon />
              已工作
              <strong className="time-value">{worked}</strong>
            </span>
            <span className="time-divider" />
            <span className="time-item">
              {state === "after" ? <CoffeeIcon /> : <HourglassIcon />}
              {state === "after" ? <strong className="off-work-label">已下班</strong> : "距离下班"}
              {state === "after" ? null : <strong className="time-value">{remaining}</strong>}
            </span>
          </div>
        </div>}
      </div>
      {state === "after" && (
        <div className={`after-work-note${activeCelebration && !collection ? " note-enter" : ""}`} role="status">
          <CatIcon />
          <span>下班！又是美好的一天</span>
          <span className="note-heart" aria-hidden="true">{theme.decorations.noteSymbol}</span>
        </div>
      )}
      {error && <div className="display-error" role="alert">{error}</div>}
    </div>
  );
}
