import React from "react";
import { AbsoluteFill } from "remotion";
import type {
  TransitionPresentation,
  TransitionPresentationComponentProps,
} from "@remotion/transitions";

type IrisProps = Record<string, unknown>;

// "Ball opens" reveal: the entering scene is revealed through a circle growing
// from the center, over the (still-visible) exiting scene beneath.
const IrisPresentation: React.FC<
  TransitionPresentationComponentProps<IrisProps>
> = ({ children, presentationProgress, presentationDirection }) => {
  const p = Math.max(0, Math.min(1, presentationProgress));

  // Entering scene (the finished quiz type) sits BENEATH the cover, fully
  // rendered, waiting to be uncovered.
  if (presentationDirection === "entering") {
    return <AbsoluteFill style={{ zIndex: 1 }}>{children}</AbsoluteFill>;
  }

  // Exiting scene (the opaque ball cover) sits ON TOP and gets a growing
  // transparent hole from the centre, so it "opens" to reveal the page beneath.
  const r = p * 108; // % of farthest-corner distance; >100 = fully open
  const mask = `radial-gradient(circle at 50% 50%, transparent ${r}%, black ${r + 0.4}%)`;

  return (
    <AbsoluteFill
      style={{ zIndex: 2, WebkitMaskImage: mask, maskImage: mask }}
    >
      {children}
    </AbsoluteFill>
  );
};

export const iris = (): TransitionPresentation<IrisProps> => {
  return { component: IrisPresentation, props: {} };
};
