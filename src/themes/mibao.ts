import type { SkinTheme } from "./catalog";
import working from "../assets/mibao/working.png";
import workingPrivate from "../assets/mibao/working-private.png";
import lunch from "../assets/mibao/lunch.png";
import finished from "../assets/mibao/finished.png";
import settings from "../assets/mibao/settings.png";
import paw from "../assets/mibao/paw.svg";
import workingReact from "../assets/mibao/reactions/mibao_working_react.png";
import lunchReact from "../assets/mibao/reactions/mibao_lunch_react.png";
import finishedReact from "../assets/mibao/reactions/mibao_finished_react-prone.png";

export const MIBAO_THEME: SkinTheme = {
  id: "mibao",
  name: "咪宝",
  description: "活泼好动的狸花猫，陪你一起赚小钱！",
  cover: working,
  characters: { working, lunch, finished, settings },
  reactions: {
    working: { src: workingReact, text: "喵！继续赚小鱼干！", miniText: "赚小鱼干！", duration: 1200, motion: "playful", placement: { width: "60%", left: "0%", bottom: "-12%" } },
    lunch: { src: lunchReact, text: "呼噜呼噜……", miniText: "呼噜呼噜…", duration: 1000, motion: "playful", placement: { width: "64%", left: "-2%", bottom: "-36%" } },
    finished: { src: finishedReact, text: "下班啦！喵！", miniText: "下班啦，喵！", duration: 1200, motion: "playful", placement: { width: "100%", left: "0%", bottom: "0%" } },
  },
  characterFilter: "none",
  privacy: {
    working: workingPrivate,
    color: "#eaa148", highlight: "#ffe3a0", outline: "#a56b35", tilt: "-0.55deg",
    full: { left: "60%", top: "-12px", width: "48px" },
    mini: { left: "104px", top: "4px", width: "18px" },
  },
  stateLabels: { lunch: "午休中", rest_day: "今天休息喵～" },
  mini: { width: "200px", top: "9px", offsets: { working: "-20px", lunch: "-12px", finished: "-20px" } },
  decorations: { noteSymbol: "🐾", symbolColor: "#c99962", cardAccent: paw },
  colors: {
    "--blue": "#9cc45b", "--blue-deep": "#57792e", "--blue-light": "#c6dca0",
    "--porcelain": "#fff9ee", "--porcelain-deep": "#f7e9d4", "--ink": "#56351f", "--ink-soft": "#92704e",
    "--pet-blue": "#56351f", "--pet-ink": "#805a36", "--pet-muted": "#a2825f",
    "--skin-card-background": "linear-gradient(165deg,#fffdf7 0%,#fff9ee 58%,#f7e9d4 100%)",
    "--skin-card-border": "#ecd1ab", "--skin-card-shadow": "0 24px 48px #9b70332b,0 6px 16px #9b703312,inset 0 1px #fff,inset 0 -12px 28px #ecd1ab38",
    "--skin-settings-background": "linear-gradient(150deg,#fffdf7,#fff9ee 65%,#f7e9d4)",
    "--skin-amount": "linear-gradient(180deg,#956739 4%,#56351f 88%)",
    "--skin-amount-finished": "linear-gradient(180deg,#80522b,#56351f)",
    "--skin-progress": "linear-gradient(90deg,#c4dd8b,#a4c965 48%,#83b143)",
    "--skin-progress-finished": "linear-gradient(180deg,#c5e397,#94bf55 65%,#a7d06a)",
    "--skin-progress-track": "#f0e3ca", "--skin-progress-shadow": "inset 0 1px 2px #a8874c24",
    "--skin-button": "linear-gradient(135deg,#b5d27a,#8ab34f)", "--skin-button-text": "#344e1c",
    "--skin-button-shadow": "0 8px 18px #718d432e", "--skin-button-hover-shadow": "0 10px 22px #718d4338",
    "--skin-input-border": "#ead3b3", "--skin-button-border": "#e7cda7",
    "--skin-focus-shadow": "0 0 0 3px #9cc45b29", "--skin-focus-color": "#9cc45b", "--skin-preview": "linear-gradient(150deg,#f0f6de,#eaf2d0)",
    "--skin-completion-background": "#eaf2d0", "--skin-completion-border": "#c6dca0", "--skin-completion-color": "#658537",
    "--skin-status-text": "#805a36", "--skin-subtitle": "#a2825f", "--skin-label": "#805a36",
    "--skin-time-color": "#8a633b", "--skin-icon": "#c69c67", "--skin-divider": "#e5cca7", "--skin-sleep-symbol": "#d3a766",
    "--skin-note-background": "#fffbf1", "--skin-note-border": "#e7cda7", "--skin-note-color": "#805a36", "--skin-note-shadow": "0 5px 12px #9b70332e,inset 0 2px #fff",
    "--skin-money-bag": "#d5ab6d", "--skin-money-bag-rim": "#ba8d50", "--skin-money-bag-finished": "#e3bd75", "--skin-money-bag-rim-finished": "#c79c54",
    "--skin-icon-shadow": "0 2px 5px #af855830,inset 0 0 0 2px #fff", "--skin-icon-hover-shadow": "0 4px 10px #af85582e",
    "--skin-contact-shadow": "radial-gradient(ellipse,#9b70332b,transparent 70%)",
    "--skin-character-mask": "none",
  },
};
