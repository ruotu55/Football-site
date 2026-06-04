import React from "react";
import { useVideoConfig } from "remotion";
import { GridOverlay } from "./gridOverlay";
import { CloudDrift } from "./cloudDrift";

interface TransitionOverlayProps {
  /** Cover+reveal animation window in frames (TRANSITION_ANIM_MS). */
  durationInFrames: number;
  /** Transition effect key. Defaults to "grid-overlay". */
  effect?: string;
  /** color-mix string from the live theme's --bg-stage (cells/clouds match the app). */
  fxColor?: string;
}

/**
 * Routes a transition effect key to its frame-driven overlay. The two effects the app
 * actually uses for runner-1 Regular are:
 *   - "new-1" (Cloud Drift) — forced on the landing→first-question transition.
 *   - "grid-overlay" — the default user-selected effect for question→question / →outro.
 * Unknown keys fall back to grid-overlay.
 */
export const TransitionOverlay: React.FC<TransitionOverlayProps> = ({
  durationInFrames,
  effect = "grid-overlay",
  fxColor,
}) => {
  const { fps } = useVideoConfig();

  if (effect === "new-1") {
    return <CloudDrift durationInFrames={durationInFrames} fps={fps} fxColor={fxColor} />;
  }
  return <GridOverlay durationInFrames={durationInFrames} fps={fps} fxColor={fxColor} />;
};
