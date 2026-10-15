import { useId, type CSSProperties } from "react";
import { useDisplay } from "../display/DisplayProvider";
import { DEFAULT_THEME } from "../themes/catalog";
import { useTheme } from "../themes/ThemeProvider";

// Decoration only: visibility comes directly from the existing preference.
export function PrivacyQuestion({ mini = false }: { mini?: boolean }) {
  const { privacyMode } = useDisplay();
  const { theme } = useTheme();
  const gradientId = useId();
  const config = theme.privacy ?? DEFAULT_THEME.privacy!;
  const placement = mini ? config.mini : config.full;
  const style = {
    "--question-left": placement.left, "--question-top": placement.top, "--question-width": placement.width,
    "--question-color": config.color, "--question-highlight": config.highlight, "--question-outline": config.outline,
  } as CSSProperties;
  return <span className={`privacy-question${privacyMode === "hidden" ? " is-visible" : ""}`} style={style} aria-hidden="true">
    <svg viewBox="0 0 34 52" fill="none" focusable="false">
      <defs><linearGradient id={gradientId} x1="17" y1="4" x2="17" y2="48" gradientUnits="userSpaceOnUse"><stop stopColor="var(--question-highlight)" /><stop offset="1" stopColor="var(--question-color)" /></linearGradient></defs>
      <path d="M7 14C7 1 28 1 28 14C28 24 17 22 17 32" stroke="var(--question-outline)" strokeWidth="8" strokeLinecap="round" />
      <path d="M7 14C7 1 28 1 28 14C28 24 17 22 17 32" stroke={`url(#${gradientId})`} strokeWidth="5.5" strokeLinecap="round" />
      <path d="M9 12C10 6 21 4 25 10" stroke="#fff" strokeOpacity=".65" strokeWidth="1.3" strokeLinecap="round" />
      <circle cx="17" cy="44" r="4.2" fill={`url(#${gradientId})`} stroke="var(--question-outline)" strokeWidth="1.5" />
    </svg>
  </span>;
}
