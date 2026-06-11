import React from "react";
import { AbsoluteFill, Easing, interpolate } from "remotion";
import type {
  TransitionPresentation,
  TransitionPresentationComponentProps,
} from "@remotion/transitions";

type Props = Record<string, unknown>;

// Premium "shine wipe": the incoming scene is revealed behind a diagonal wipe whose
// leading edge carries a bright light streak — a glossy reveal like a glass swipe.
// The outgoing scene is masked away behind the SAME edge, so it cleanly hands over
// (these scenes are transparent over a shared background, so the old one must be
// removed where the wipe has passed or it would bleed through).
const ANGLE = 115; // diagonal sweep direction (deg)
const SOFT = 9; // % softness of the wipe edge
const EASE = Easing.bezier(0.5, 0, 0.2, 1);

const ShineWipePresentation: React.FC<
  TransitionPresentationComponentProps<Props>
> = ({ children, presentationProgress, presentationDirection }) => {
  const p = Math.max(0, Math.min(1, presentationProgress));
  const e = EASE(p);
  const a = interpolate(e, [0, 1], [-SOFT, 100 + SOFT]); // wipe-edge position along the gradient line

  if (presentationDirection === "exiting") {
    // Visible ONLY ahead of the wipe (a..100); removed where the wipe has passed.
    const mask = `linear-gradient(${ANGLE}deg, transparent ${a - SOFT}%, #000 ${a}%)`;
    return <AbsoluteFill style={{ isolation: "isolate", WebkitMaskImage: mask, maskImage: mask }}>{children}</AbsoluteFill>;
  }

  // Incoming, revealed behind the wipe (0..a).
  const mask = `linear-gradient(${ANGLE}deg, #000 ${a - SOFT}%, transparent ${a}%)`;
  const streak = `linear-gradient(${ANGLE}deg, transparent ${a - SOFT - 3}%, rgba(255,255,255,0.92) ${a - SOFT / 2}%, rgba(190,225,255,0.5) ${a - 1}%, transparent ${a + 3}%)`;
  const streakOpacity = Math.sin(Math.min(1, p) * Math.PI); // glow brightest mid-sweep

  return (
    <AbsoluteFill style={{ isolation: "isolate" }}>
      <AbsoluteFill style={{ WebkitMaskImage: mask, maskImage: mask }}>{children}</AbsoluteFill>
      <AbsoluteFill
        style={{ background: streak, mixBlendMode: "screen", opacity: streakOpacity, pointerEvents: "none" }}
      />
    </AbsoluteFill>
  );
};

export const shineWipe = (): TransitionPresentation<Props> => ({
  component: ShineWipePresentation,
  props: {},
});
