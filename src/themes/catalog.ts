import working from "../assets/chibi-girl-top.png";
import lunch from "../assets/chibi-girl-sleeping.png";
import finished from "../assets/chibi-girl-after-work.png";
import settings from "../assets/chibi-girl-calculator.png";
import workingReact from "../assets/reactions/blue-whale-girl/bluewhale_working_react.png";
import lunchReact from "../assets/reactions/blue-whale-girl/bluewhale_lunch_react.png";
import finishedReact from "../assets/reactions/blue-whale-girl/bluewhale_finished_react.png";
import { MIBAO_THEME } from "./mibao";
import type { WorkState } from "../salary/calc";
import type { PetReaction, ReactionPose } from "../interaction/types";

export type CharacterState = "working" | "lunch" | "finished" | "settings";
export type ThemeVariables = Record<`--${string}`, string>;
export interface SkinTheme {
  id: string;
  name: string;
  description: string;
  cover: string;
  characters: Record<CharacterState, string>;
  reactions?: Partial<Record<ReactionPose, PetReaction>>;
  colors: ThemeVariables;
  decorations: { noteSymbol: string; symbolColor: string; cardAccent?: string };
  stateLabels?: Partial<Record<WorkState, string>>;
  mini?: { width?: string; top?: string; offsets?: Partial<Record<Exclude<CharacterState, "settings">, string>> };
  characterFilter: string;
  internal?: boolean;
}

export const DEFAULT_THEME_ID = "blue-whale-girl";
export const DEFAULT_THEME: SkinTheme = {
  id: DEFAULT_THEME_ID,
  name: "蓝色大肥鱼",
  description: "温柔、慵懒、治愈的蓝色鲸鱼少女",
  cover: working,
  characters: { working, lunch, finished, settings },
  reactions: {
    working: { src: workingReact, text: "又赚到一点点啦～", miniText: "又赚一点点～", duration: 1200, motion: "gentle", placement: { width: "68%", left: "24%", bottom: "-19%" }, miniPlacement: { width: "64%", left: "25%", bottom: "-18%" } },
    lunch: { src: lunchReact, text: "唔……再睡五分钟……", miniText: "再睡五分钟…", duration: 1000, motion: "gentle", placement: { width: "80%", left: "20%", bottom: "-24%" }, miniPlacement: { width: "80%", left: "20%", bottom: "-36%" } },
    finished: { src: finishedReact, text: "终于可以休息啦！", miniText: "可以休息啦！", duration: 1200, motion: "gentle", placement: { width: "70%", left: "21%", bottom: "-23%" } },
  },
  // Tokens keep the exact existing mature blue theme, including state accents.
  colors: {
    "--blue": "#4a9dff", "--blue-deep": "#2e7fe0", "--blue-light": "#a9d8ff",
    "--porcelain": "#f7fbff", "--porcelain-deep": "#e8f3ff", "--ink": "#20354a",
    "--ink-soft": "#5b7a93", "--pet-blue": "#0866eb", "--pet-ink": "#486d8c", "--pet-muted": "#67829a",
    "--mini-ink": "#163d82", "--mini-amount": "#123b80", "--mini-amount-lunch": "#586588", "--mini-amount-finished": "#1462d5", "--mini-status": "#284c84",
  },
  decorations: { noteSymbol: "♥", symbolColor: "#efa6b7" },
  characterFilter: "none",
  mini: { width: "200px", top: "9px", offsets: { working: "-59px", lunch: "-59px", finished: "-59px" } },
};

// Only the public registry is listed in the picker. DEV is eliminated by Vite
// from the production build; no internal skin ships as a selectable product.
const themes = new Map<string, SkinTheme>([[DEFAULT_THEME_ID, DEFAULT_THEME], [MIBAO_THEME.id, MIBAO_THEME]]);
if (import.meta.env.DEV) {
  themes.set("test-theme", {
    ...DEFAULT_THEME,
    id: "test-theme", name: "主题切换测试", description: "内部验证：紫色配色与四状态资源切换", internal: true,
    cover: `${working}?skin-test=cover`,
    characters: { working: `${working}?skin-test=working`, lunch: `${lunch}?skin-test=lunch`, finished: `${finished}?skin-test=finished`, settings: `${settings}?skin-test=settings` },
    characterFilter: "hue-rotate(48deg)",
    decorations: { noteSymbol: "✦", symbolColor: "#c789d2" },
    colors: {
      "--blue": "#9673e0", "--blue-deep": "#7754bc", "--blue-light": "#d2b9f4",
      "--porcelain": "#fff8fd", "--porcelain-deep": "#efe4fa", "--ink": "#443259", "--ink-soft": "#867394",
      "--pet-blue": "#7754bc", "--pet-ink": "#6e508a", "--pet-muted": "#947daa",
      "--skin-card-background": "linear-gradient(165deg,#fffaff,#f6edff 58%,#f3dcf0)",
      "--skin-card-border": "#dbc4f1", "--skin-card-shadow": "0 24px 48px #8762b52e,0 6px 16px #8762b514,inset 0 1px #fff,inset 0 -12px 28px #d1b4e438",
      "--skin-settings-background": "linear-gradient(150deg,#fff8fd,#f2e9fc)",
      "--skin-amount": "linear-gradient(180deg,#ad8bdf 4%,#7754bc 88%)", "--skin-amount-finished": "linear-gradient(180deg,#9066ad,#533574)",
      "--skin-progress": "linear-gradient(90deg,#d6b5f3,#b58bd9 48%,#8660bb)", "--skin-progress-finished": "linear-gradient(180deg,#dec4ff,#a078cb 65%,#c19bea)",
      "--skin-button": "linear-gradient(135deg,#b295e7,#7754bc)", "--skin-input-border": "#dbc4f1", "--skin-button-border": "#d6c2ef",
      "--skin-preview": "linear-gradient(150deg,#f4eaff,#ebddf6)", "--skin-completion-background": "#efe2fb", "--skin-completion-border": "#d6bcea",
      "--skin-completion-color": "#8055a7", "--skin-status-text": "#70557f", "--skin-subtitle": "#8b719f", "--skin-label": "#705b81",
      "--skin-time-color": "#8b60b7", "--skin-icon": "#b090cb", "--skin-divider": "#dfcbed", "--skin-progress-track": "#eaddf4",
      "--skin-note-background": "#fffaff", "--skin-note-border": "#e3d1f3", "--skin-note-color": "#7b559f",
      "--skin-money-bag": "#a87bd7", "--skin-money-bag-rim": "#7d51b5", "--skin-money-bag-finished": "#d995ba", "--skin-money-bag-rim-finished": "#b57599",
    },
  });
}

export const PUBLIC_THEMES = [...themes.values()].filter(theme => !theme.internal);
// Preview a different skin without changing the active theme. Reset the few
// preview-specific tokens so a blue preview never inherits purple test tokens.
export function previewThemeStyle(theme: SkinTheme) {
  return {
    "--skin-preview": "linear-gradient(150deg,#eaf6ff,#dcefff)",
    "--skin-input-border": "#cfe6fb",
    ...theme.colors,
    "--skin-character-filter": theme.characterFilter,
  };
}
export function resolveTheme(id: unknown): SkinTheme {
  const theme = typeof id === "string" ? themes.get(id) : undefined;
  const states: CharacterState[] = ["working", "lunch", "finished", "settings"];
  if (!theme || typeof theme.cover !== "string" || !theme.cover || !states.every(state => typeof theme.characters?.[state] === "string" && !!theme.characters[state]) || !theme.colors?.["--blue"] || !theme.decorations?.noteSymbol) return DEFAULT_THEME;
  return theme;
}

const resourceCache = new Map<string, Promise<void>>();
export function preloadTheme(theme: SkinTheme): Promise<void> {
  const sources = [...new Set([theme.cover, ...Object.values(theme.characters), ...(theme.decorations.cardAccent ? [theme.decorations.cardAccent] : [])])];
  return Promise.all(sources.map(src => {
    const cached = resourceCache.get(src);
    if (cached) return cached;
    const resource = new Promise<void>((resolve, reject) => {
      const image = new Image();
      const timer = window.setTimeout(() => { image.onload = null; image.onerror = null; reject(new Error("人物素材加载超时")); }, 5000);
      image.onload = () => { window.clearTimeout(timer); resolve(); };
      image.onerror = () => { window.clearTimeout(timer); reject(new Error("人物素材加载失败")); };
      image.src = src;
    }).catch(error => { resourceCache.delete(src); throw error; });
    resourceCache.set(src, resource);
    return resource;
  })).then(() => undefined);
}
