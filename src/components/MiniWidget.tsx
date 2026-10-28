import type { CSSProperties, MouseEvent } from "react";
import { interruptAutonomous } from "../autonomous/useAutonomousMotion";
import type { WorkState } from "../salary/calc";
import { useTheme } from "../themes/ThemeProvider";
import { useDisplay } from "../display/DisplayProvider";
import type { GirlMood } from "./ChibiGirl";
import type { PetInteraction } from "../interaction/types";
import { InteractivePet, PetBubble } from "./InteractivePet";
import { DisplayControls, LockIcon } from "./DisplayControls";
import { Collection } from "./Collection";

export function MiniWidget({ state, mood, moneyText, status, onDragEnd, onWindowDrag, onActivityChange, autonomousBlocked, interaction, stage, deposit }: { state: WorkState; mood: GirlMood; moneyText: string; status: string; onDragEnd: () => void; onWindowDrag: (event: MouseEvent) => void; onActivityChange: (busy: boolean) => void; autonomousBlocked: boolean; interaction: PetInteraction; stage: number; deposit: { pulse: { time: number } | null; finish: () => void } }) {
  const { theme } = useTheme();
  const { privacyMode, displayMode, error } = useDisplay();
  const hidden = privacyMode === "hidden";
  const collection = displayMode === "collection" && !hidden;
  const pose = state === "lunch" || state === "rest_day" ? "lunch" : state === "after" ? "finished" : "working";
  const style = { "--mini-pet-left": theme.mini?.offsets?.[pose] ?? "-37px", "--mini-pet-width": theme.mini?.width ?? "164px", "--mini-pet-top": theme.mini?.top ?? "10px" } as CSSProperties;
  const text = state === "after" ? "已下班 · 美好一天" : state === "lunch" ? "午休中 · 充电中" : status;
  // Only format a real amount for a visible UI; no hidden copy in DOM or titles.
  const visibleMoney = hidden || collection ? null : Number(moneyText).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const amountClass = visibleMoney && visibleMoney.length > 12 ? " mini-amount-long" : visibleMoney && visibleMoney.length > 8 ? " mini-amount-compact" : "";
  return <div className={`mini-stage state-${state}${hidden ? " privacy-hidden" : ""}${collection ? " collection-mode" : ""}`} data-work-state={state} data-window-mode="mini" onContextMenu={e => e.preventDefault()} style={style} onPointerDownCapture={interruptAutonomous} onKeyDownCapture={interruptAutonomous}>
    <div className="card mini-card">
      <div className="mini-theme-detail" aria-hidden="true">{theme.decorations.cardAccent ? <img src={theme.decorations.cardAccent} alt="" draggable={false} /> : <><i /><i /><i /></>}</div>
      <div className="drag-overlay" onMouseDown={onWindowDrag} />
    </div>
    <div className="mini-pet"><InteractivePet mood={mood} width={164} interaction={interaction} mini onDragEnd={onDragEnd} stage={stage} autonomousBlocked={autonomousBlocked} onActivityChange={onActivityChange} /></div>
    <div className="mini-information">
      {collection ? <Collection stage={stage} state={state} mini pulse={deposit.pulse} onAnimationEnd={deposit.finish} interacting={!!interaction.active} /> : <><div className="mini-title">今天已经赚到</div>
      <div className={`mini-amount${hidden ? " masked-amount" : amountClass}`} aria-label={hidden ? "收入已隐藏" : undefined}>
        <span className="mini-currency">¥</span>{" "}<span>{hidden ? "••••••" : visibleMoney}</span>
      </div></>}
      <div className="mini-status">
        {interaction.active ? <PetBubble interaction={interaction} mini /> : <span className="mini-work-status"><span className={`status-dot status-${state}`} aria-hidden="true" /><span>{collection ? state === "working" ? "专注工作中" : state === "after" ? "今日份完成" : state === "lunch" ? "午休充电中" : state === "rest_day" ? "今天休息啦～" : "准备开工啦" : hidden ? state === "after" ? "已下班" : state === "lunch" ? "午休中" : status : text}</span></span>}
        {hidden && <span className="privacy-caption"><LockIcon />收入已隐藏</span>}
      </div>
    </div>
    <DisplayControls mini />
    {error && <div className="display-error mini-error" role="alert">{error}</div>}
  </div>;
}
