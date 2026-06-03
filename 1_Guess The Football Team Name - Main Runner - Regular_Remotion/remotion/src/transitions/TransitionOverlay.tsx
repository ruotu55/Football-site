import React from "react";
import { useVideoConfig } from "remotion";
import { GridOverlay } from "./gridOverlay";

interface TransitionOverlayProps {
  durationInFrames: number;
  /** Transition effect key. Defaults to "grid-overlay". */
  effect?: string;
}

export const TransitionOverlay: React.FC<TransitionOverlayProps> = ({
  durationInFrames,
  effect = "grid-overlay",
}) => {
  const { fps } = useVideoConfig();

  // Only "grid-overlay" is implemented as a frame-driven effect.
  // Other effect keys fall through to the same grid-overlay renderer as a
  // visual default until they are individually implemented.
  // (effect routing can be extended here: if (effect === "bars-left") return <BarsLeft .../>)
  return <GridOverlay durationInFrames={durationInFrames} fps={fps} />;
};
