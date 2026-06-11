import React from "react";
import { AbsoluteFill, Easing, interpolate } from "remotion";
import type {
  TransitionPresentation,
  TransitionPresentationComponentProps,
} from "@remotion/transitions";

type Props = Record<string, unknown>;

// "Diagonal Wipe": exactly the Shine Wipe motion (same angle, softness, easing,
// complementary masks) but WITHOUT the bright light streak — a clean diagonal reveal.
const ANGLE = 115; // diagonal sweep direction (deg)
const SOFT = 9; // % softness of the wipe edge
const EASE = Easing.bezier(0.5, 0, 0.2, 1);

const DiagonalWipePresentation: React.FC<
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

  // Incoming, revealed behind the wipe (0..a). No light streak.
  const mask = `linear-gradient(${ANGLE}deg, #000 ${a - SOFT}%, transparent ${a}%)`;
  return <AbsoluteFill style={{ isolation: "isolate", WebkitMaskImage: mask, maskImage: mask }}>{children}</AbsoluteFill>;
};

export const diagonalWipe = (): TransitionPresentation<Props> => ({
  component: DiagonalWipePresentation,
  props: {},
});
