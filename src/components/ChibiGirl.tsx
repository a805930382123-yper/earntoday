import { useTheme } from "../themes/ThemeProvider";
import girlLeftHair from "../assets/chibi-girl-left.png";
import girlRightHair from "../assets/chibi-girl-right.png";
import girlHands from "../assets/chibi-girl-hands.png";
import type { PetInteraction } from "../interaction/types";
import { useDisplay } from "../display/DisplayProvider";
import { useState, type CSSProperties } from "react";
import { collectionCharacter } from "../collection/themes";
import { useAutonomousMotion } from "../autonomous/useAutonomousMotion";

export type GirlMood = "working" | "lunch" | "happy" | "rest";

// Poses share a fixed box and are preloaded before each time boundary.
export function ChibiGirl({ mood, width = 361, interaction, mini = false, stage, autonomousBlocked = false }: { mood: GirlMood; width?: number; interaction?: PetInteraction; mini?: boolean; stage?: number; autonomousBlocked?: boolean }) {
  const { theme, assetError } = useTheme();
  const { privacyMode, displayMode } = useDisplay();
  const collectionSrc = displayMode === "collection" && privacyMode === "visible" &&
    (mood === "working" || (mood === "happy" && stage === 10))
    ? collectionCharacter(theme.id, stage) : undefined;
  const [decodedPrivacySources, setDecodedPrivacySources] = useState<ReadonlySet<string>>(() => new Set());
  const privacySrc = theme.privacy?.working;
  const active = interaction?.active;
  const confused = !!interaction && privacyMode === "hidden" && mood === "working";
  const showPrivacyArt = confused && !active && !!privacySrc && decodedPrivacySources.has(privacySrc);
  const placement = active && (mini ? active.config.miniPlacement ?? active.config.placement : active.config.placement);
  const workingSrc = mood === "working" && collectionSrc ? collectionSrc : theme.characters.working;
  const autonomous = useAutonomousMotion({ theme: theme.id, base: workingSrc, mini, working: mood === "working", privacy: privacyMode === "hidden",
    blocked: autonomousBlocked || !!active,
    scope: `${theme.id}:${mood}:${mini}:${privacyMode}:${displayMode}:${stage}:${active?.sequence ?? "idle"}:${autonomousBlocked}:${workingSrc}` });
  return (
    <div
      className={`chibi-girl mood-${mood}${autonomous.ready ? " autonomous-ready" : ""}${autonomous.src ? " autonomous-show-frame" : ""}${interaction ? " pet-interactive" : ""}${confused ? " privacy-confused" : ""}${showPrivacyArt ? " pet-has-privacy-art" : ""}${active ? ` pet-reacting reaction-${active.pose} motion-${active.config.motion}${active.src ? " pet-has-reaction" : ""}` : ""}`}
      data-reaction-pose={active?.pose}
      data-autonomous-action={autonomous.frame?.id}
      data-autonomous-state={autonomous.frame?.state}
      aria-hidden="true"
      style={{ width, "--privacy-tilt": theme.privacy?.tilt ?? "0.65deg" } as CSSProperties}
    >
      <div className="chibi-poses">
        <img className="chibi-layer chibi-base chibi-awake" src={workingSrc} onError={assetError} alt="" draggable={false} />
        {autonomous.src && <img className="chibi-layer chibi-base chibi-autonomous" src={autonomous.src} onError={autonomous.failed} alt="" draggable={false} />}
        <img className="chibi-layer chibi-base chibi-sleeping" src={theme.characters.lunch} onError={assetError} alt="" draggable={false} />
        <img className="chibi-layer chibi-base chibi-after-work" src={mood === "happy" && collectionSrc ? collectionSrc : theme.characters.finished} onError={assetError} alt="" draggable={false} />
        {/* Optional visual asset: decode in advance; failure keeps the original
            working pose and never resets the selected theme or privacy. */}
        {privacySrc && <img key={privacySrc} className="chibi-layer chibi-base chibi-privacy" src={privacySrc} onLoad={event => { void event.currentTarget.decode().then(() => setDecodedPrivacySources(previous => new Set(previous).add(privacySrc)), () => {}); }} onError={() => setDecodedPrivacySources(previous => { const next = new Set(previous); next.delete(privacySrc); return next; })} alt="" draggable={false} />}
        {active?.src && placement && <img className="chibi-reaction" key={active.sequence} src={active.src} style={placement} onError={interaction?.imageFailed} alt="" draggable={false} />}
      </div>
      <img className="chibi-layer chibi-hair-left" src={girlLeftHair} alt="" draggable={false} />
      <img className="chibi-layer chibi-hair-right" src={girlRightHair} alt="" draggable={false} />
      <img className="chibi-layer chibi-hands" src={girlHands} alt="" draggable={false} />
      <div className="sleep-symbols"><span>z</span><span>z</span><span>Z</span></div>
    </div>
  );
}
