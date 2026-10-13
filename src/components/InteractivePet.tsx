import { useRef, type PointerEvent } from "react";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { useTheme } from "../themes/ThemeProvider";
import type { PetInteraction } from "../interaction/types";
import { ChibiGirl, type GirlMood } from "./ChibiGirl";

type Gesture = { id: number; x: number; y: number; dragging: boolean };

export function InteractivePet({ mood, width, interaction, mini = false, onDragEnd }: { mood: GirlMood; width?: number; interaction: PetInteraction; mini?: boolean; onDragEnd: () => void }) {
  const { theme } = useTheme();
  const gesture = useRef<Gesture | null>(null);
  const clearGesture = () => { gesture.current = null; };
  const pointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0 || !event.isPrimary) return;
    event.stopPropagation();
    gesture.current = { id: event.pointerId, x: event.clientX, y: event.clientY, dragging: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const pointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    const current = gesture.current;
    if (!current || current.id !== event.pointerId || current.dragging || !(event.buttons & 1)) return;
    if (Math.hypot(event.clientX - current.x, event.clientY - current.y) < 5) return;
    current.dragging = true;
    // Hand capture to the native move loop only after a deliberate drag.
    event.currentTarget.releasePointerCapture(event.pointerId);
    void getCurrentWebviewWindow().startDragging().then(onDragEnd).catch(console.error);
  };
  const pointerUp = (event: PointerEvent<HTMLButtonElement>) => {
    const current = gesture.current;
    gesture.current = null;
    if (!current || current.id !== event.pointerId || current.dragging || event.button !== 0) return;
    if (Math.hypot(event.clientX - current.x, event.clientY - current.y) < 5) interaction.trigger();
  };
  return <>
    <ChibiGirl mood={mood} width={width} interaction={interaction} mini={mini} />
    {interaction.enabled && <button type="button" className="pet-hit-area" aria-label={`${theme.name}桌宠，点击互动`} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={clearGesture} onLostPointerCapture={clearGesture} onBlur={clearGesture} onClick={event => { if (event.detail === 0) interaction.trigger(); }} />}
  </>;
}

export function PetBubble({ interaction, mini = false }: { interaction: PetInteraction; mini?: boolean }) {
  const { active } = interaction;
  if (!active) return null;
  return <span className={`pet-bubble${mini ? " pet-mini-bubble" : ""}`} key={active.sequence} role="status">{mini ? active.config.miniText : active.config.text}</span>;
}
