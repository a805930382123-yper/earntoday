export type ReactionPose = "working" | "lunch" | "finished";

export interface ReactionPlacement {
  width: string;
  left: string;
  bottom: string;
}

export interface PetReaction {
  src?: string;
  text: string;
  miniText: string;
  duration: 1000 | 1200;
  motion: "gentle" | "playful";
  placement: ReactionPlacement;
  miniPlacement?: ReactionPlacement;
}

export interface ActivePetReaction {
  scope: string;
  sequence: number;
  pose: ReactionPose;
  config: PetReaction;
  src?: string;
}

export interface PetInteraction {
  active: ActivePetReaction | null;
  enabled: boolean;
  trigger: () => void;
  imageFailed: () => void;
}
