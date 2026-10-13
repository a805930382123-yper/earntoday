import { useTheme } from "../themes/ThemeProvider";
import girlLeftHair from "../assets/chibi-girl-left.png";
import girlRightHair from "../assets/chibi-girl-right.png";
import girlHands from "../assets/chibi-girl-hands.png";
import type { PetInteraction } from "../interaction/types";

export type GirlMood = "working" | "lunch" | "happy" | "rest";

// Poses share a fixed box and are preloaded before each time boundary.
export function ChibiGirl({ mood, width = 361, interaction, mini = false }: { mood: GirlMood; width?: number; interaction?: PetInteraction; mini?: boolean }) {
  const { theme, assetError } = useTheme();
  const active = interaction?.active;
  const placement = active && (mini ? active.config.miniPlacement ?? active.config.placement : active.config.placement);
  return (
    <div
      className={`chibi-girl mood-${mood}${interaction ? " pet-interactive" : ""}${active ? ` pet-reacting reaction-${active.pose} motion-${active.config.motion}${active.src ? " pet-has-reaction" : ""}` : ""}`}
      data-reaction-pose={active?.pose}
      aria-hidden="true"
      style={{ width }}
    >
      <div className="chibi-poses">
        <img className="chibi-layer chibi-base chibi-awake" src={theme.characters.working} onError={assetError} alt="" draggable={false} />
        <img className="chibi-layer chibi-base chibi-sleeping" src={theme.characters.lunch} onError={assetError} alt="" draggable={false} />
        <img className="chibi-layer chibi-base chibi-after-work" src={theme.characters.finished} onError={assetError} alt="" draggable={false} />
        {active?.src && placement && <img className="chibi-reaction" key={active.sequence} src={active.src} style={placement} onError={interaction?.imageFailed} alt="" draggable={false} />}
      </div>
      <img className="chibi-layer chibi-hair-left" src={girlLeftHair} alt="" draggable={false} />
      <img className="chibi-layer chibi-hair-right" src={girlRightHair} alt="" draggable={false} />
      <img className="chibi-layer chibi-hands" src={girlHands} alt="" draggable={false} />
      <div className="sleep-symbols"><span>z</span><span>z</span><span>Z</span></div>
    </div>
  );
}
