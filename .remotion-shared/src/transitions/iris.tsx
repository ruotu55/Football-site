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

  // Reveal radius — EXACT match to the runner's reveal. The runner tweens --reveal-r
  // 0 → hypot(w,h) (the FULL diagonal) linearly, but the centre-to-corner distance is
  // only hypot(w,h)/2 — so the screen is fully revealed at the HALFWAY point of the
  // tween and over-opens after. In CSS-% terms the farthest corner is 100%, so we grow
  // to 200%: full coverage lands at p=0.5 (≈0.65s), matching the runner's fast open.
  // 1px soft edge; r=0 keeps the centre opaque so there's never a dot.
  const r = p * 200; // % of the farthest-corner distance, linear (ease "none")

  // Entering scene (the quiz-type page) is revealed ONLY through the growing circle —
  // its content (logo, watermark, title) must NOT appear around the ball. So it is
  // masked to be VISIBLE inside the hole and HIDDEN outside (the shared themed
  // background still shows everywhere, since it's rendered behind the whole series).
  if (presentationDirection === "entering") {
    const mask = `radial-gradient(circle at 50% 50%, black calc(${r}% - 1px), transparent ${r}%)`;
    return (
      <AbsoluteFill style={{ zIndex: 1, WebkitMaskImage: mask, maskImage: mask }}>
        {children}
      </AbsoluteFill>
    );
  }

  // Exiting scene (the ball) sits ON TOP and gets the inverse: a growing transparent
  // hole from the centre, so it "opens" to reveal the page beneath. Outside the ball's
  // own pixels it is transparent → the shared background shows (never the next page).
  const mask = `radial-gradient(circle at 50% 50%, transparent calc(${r}% - 1px), black ${r}%)`;

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
