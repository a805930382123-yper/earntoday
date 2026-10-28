import { useRef, type PointerEvent } from "react";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { useTheme } from "../themes/ThemeProvider";
import type { PetInteraction } from "../interaction/types";
import { ChibiGirl, type GirlMood } from "./ChibiGirl";
import { PrivacyQuestion } from "./PrivacyQuestion";
import { useDisplay } from "../display/DisplayProvider";
import { interruptAutonomous } from "../autonomous/useAutonomousMotion";

type Gesture = { id: number; x: number; y: number; dragging: boolean };

export function InteractivePet({ mood, width, interaction, mini = false, onDragEnd, stage, autonomousBlocked = false, onActivityChange }: { mood: GirlMood; width?: number; interaction: PetInteraction; mini?: boolean; onDragEnd: () => void; stage?: number; autonomousBlocked?: boolean; onActivityChange?: (busy: boolean) => void }) {
  const { theme } = useTheme();
  const gesture = useRef<Gesture | null>(null);
  const nativeDragging = useRef(false);
  const clearGesture = () => { gesture.current = null; if (!nativeDragging.current) onActivityChange?.(false); };
  const pointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0 || !event.isPrimary) return;
    event.stopPropagation();
    interruptAutonomous(); onActivityChange?.(true);
    gesture.current = { id: event.pointerId, x: event.clientX, y: event.clientY, dragging: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const pointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    const current = gesture.current;
    if (!current || current.id !== event.pointerId || current.dragging || !(event.buttons & 1)) return;
    if (Math.hypot(event.clientX - current.x, event.clientY - current.y) < 5) return;
    current.dragging = true;
    nativeDragging.current = true;
    // Hand capture to the native move loop only after a deliberate drag.
    event.currentTarget.releasePointerCapture(event.pointerId);
    void getCurrentWebviewWindow().startDragging().then(onDragEnd).catch(console.error).finally(() => { nativeDragging.current = false; clearGesture(); });
  };
  const pointerUp = (event: PointerEvent<HTMLButtonElement>) => {
    const current = gesture.current;
    clearGesture();
    if (!current || current.id !== event.pointerId || current.dragging || event.button !== 0) return;
    if (Math.hypot(event.clientX - current.x, event.clientY - current.y) < 5) interaction.trigger();
  };
  const pet = <>
    <ChibiGirl mood={mood} width={width} interaction={interaction} mini={mini} stage={stage} autonomousBlocked={autonomousBlocked} />
    {interaction.enabled && <button type="button" className="pet-hit-area" aria-label={`${theme.name}桌宠，点击互动`} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={clearGesture} onLostPointerCapture={clearGesture} onBlur={clearGesture} onClick={event => { if (event.detail === 0) { interruptAutonomous(); interaction.trigger(); } }} />}
  </>;
  return <>
    {mini ? <div className="mini-pet-clip">{pet}</div> : pet}
    {mood === "working" && <PrivacyQuestion mini={mini} />}
  </>;
}

export function PetBubble({ interaction, mini = false }: { interaction: PetInteraction; mini?: boolean }) {
  const { displayMode, privacyMode } = useDisplay();
  const { active } = interaction;
  if (!active) return null;
  const text = displayMode === "collection" && privacyMode !== "hidden" && active.pose === "working" ? "又攒下一点努力～" : mini ? active.config.miniText : active.config.text;
  return <span className={`pet-bubble${mini ? " pet-mini-bubble" : ""}`} key={active.sequence} role="status">{text}</span>;
}
