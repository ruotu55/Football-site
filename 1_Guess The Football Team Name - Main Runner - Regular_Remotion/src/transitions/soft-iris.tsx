import React from "react";
import { AbsoluteFill, Easing, interpolate } from "remotion";
import type {
  TransitionPresentation,
  TransitionPresentationComponentProps,
} from "@remotion/transitions";

type Props = Record<string, unknown>;

// Soft circular iris: the incoming scene opens through a feathered circle growing
// from the centre; the outgoing scene is masked away inside it (complementary mask
// so the old foreground can't show through the transparent new scene).
const FEATHER = 14;

const SoftIrisPresentation: React.FC<
  TransitionPresentationComponentProps<Props>
> = ({ children, presentationProgress, presentationDirection }) => {
  const p = Math.max(0, Math.min(1, presentationProgress));
  const e = Easing.inOut(Easing.cubic)(p);
  const r = interpolate(e, [0, 1], [0, 122]); // % of farthest-corner; >100 fully opens

  if (presentationDirection === "exiting") {
    const mask = `radial-gradient(circle at 50% 50%, transparent ${r - FEATHER}%, #000 ${r}%)`;
    return <AbsoluteFill style={{ isolation: "isolate", WebkitMaskImage: mask, maskImage: mask }}>{children}</AbsoluteFill>;
  }

  const mask = `radial-gradient(circle at 50% 50%, #000 ${r - FEATHER}%, transparent ${r}%)`;
  return <AbsoluteFill style={{ isolation: "isolate", WebkitMaskImage: mask, maskImage: mask }}>{children}</AbsoluteFill>;
};

export const softIris = (): TransitionPresentation<Props> => ({
  component: SoftIrisPresentation,
  props: {},
});
