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

  // Entering scene (the quiz type) renders normally on top.
  if (presentationDirection === "entering") {
    return <AbsoluteFill>{children}</AbsoluteFill>;
  }

  // Exiting scene (the ball) gets a growing transparent hole from the centre,
  // so the ball "opens" outward to reveal what's beneath.
  const r = p * 108; // % of farthest-corner distance; >100 = fully open
  const mask = `radial-gradient(circle at 50% 50%, transparent ${r}%, black ${r + 0.4}%)`;

  return (
    <AbsoluteFill style={{ WebkitMaskImage: mask, maskImage: mask }}>
      {children}
    </AbsoluteFill>
  );
};

export const iris = (): TransitionPresentation<IrisProps> => {
  return { component: IrisPresentation, props: {} };
};
