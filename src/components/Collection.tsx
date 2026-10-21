import type { WorkState } from "../salary/calc";
import { collectionTheme } from "../collection/themes";
import { useTheme } from "../themes/ThemeProvider";
import { collectionCopy } from "../collection/copy";

export function Collection({ stage, state, mini = false, pulse, onAnimationEnd, interacting = false }: {
  stage: number; state: WorkState; mini?: boolean;
  pulse: { time: number } | null; onAnimationEnd: () => void;
  interacting?: boolean;
}) {
  const { theme } = useTheme();
  const art = collectionTheme(theme.id);
  const copy = collectionCopy(art.copy, state, stage, mini);
  const progressIcon = art.kind === "rice" ? art.stages[stage === 0 ? 0 : 10] : art.item;
  const feedback = !!pulse && !interacting;
  return <div className={`collection collection-${art.kind}${mini ? " collection-mini" : ""}`} data-collection-stage={stage}>
    <div className="collection-scene" role="img" aria-label={`${art.title}，${copy}`}>
      <img className="collection-vessel" src={art.stages[stage]} alt="" draggable={false} />
      {!mini && <img className="collection-accent" src={art.accent} alt="" draggable={false} />}
      {stage === 10 && <img className="collection-star" src={art.star} alt="" draggable={false} />}
      {pulse && <div key={pulse.time} className="collection-deposit" aria-hidden="true">
        <img className="collection-drop" src={art.drop} alt="" draggable={false} />
        {art.kind === "rice" && <img className="collection-grains" src={art.item} alt="" draggable={false} />}
      </div>}
    </div>
    <div className="collection-description">
      <div className="collection-copy">{feedback ? art.copy.deposit : copy}</div>
      <div className="collection-meter" role="progressbar" aria-label={`${art.copy.unit}积累`} aria-valuemin={0} aria-valuemax={10} aria-valuenow={stage}>
        {mini ? <img className="collection-meter-icon" src={progressIcon} alt="" draggable={false} /> : <div className="collection-cells" aria-hidden="true">
          {Array.from({ length: 10 }, (_, i) => <img key={i} className={`collection-cell${i < stage ? " is-filled" : ""}`} data-filled={i < stage} src={art.kind === "rice" ? art.stages[i < stage ? 10 : 0] : art.item} alt="" draggable={false} />)}
        </div>}
        <span className="collection-count">{!mini && `${art.copy.unit} `}{stage}/10</span>
      </div>
    </div>
    {pulse && <span key={pulse.time} className="collection-feedback-lifetime" aria-hidden="true" onAnimationEnd={onAnimationEnd} />}
  </div>;
}
