import React from "react";
import { AbsoluteFill, Easing, interpolate } from "remotion";
import type { TransitionPresentation, TransitionPresentationComponentProps } from "@remotion/transitions";
import { SoccerBallClean as SoccerBall } from "../components/SoccerBallClean";

type Props = Record<string, unknown>;

// Intro → quiz-title hand-off (runner 3, used only with the Ultimate intro).
// The intro's OWN soccer ball is the switch element: it starts at the emblem ball's
// exact position+size (so it's the SAME ball continuing), lifts to centre and zooms up
// to fully COVER the frame, then OPENS — an iris hole grows from its centre while it
// keeps expanding — revealing the quiz title behind it (like the original ball intro).
// It opens and reveals; it never shrinks/closes back. No shine/flash.
const BALL_BASE = 420; // px (scaled by transform)

// Where the intro emblem's ball sits at the start of the hand-off (lock-up is vertically
// centred; emblem ball centre ≈ 151px ABOVE screen centre, 196px across).
const EMBLEM_BALL_PX = 196;
const EMBLEM_Y = -151; // px from screen centre
const START_SCALE = EMBLEM_BALL_PX / BALL_BASE;
const FEATHER = 12; // iris edge softness (%)

const IntroHandoffPresentation: React.FC<TransitionPresentationComponentProps<Props>> = ({
  children,
  presentationProgress,
  presentationDirection,
}) => {
  const p = Math.max(0, Math.min(1, presentationProgress));

  if (presentationDirection === "exiting") {
    // Intro fades out behind the growing ball (gone before it covers).
    const opacity = interpolate(p, [0, 0.28], [1, 0], { extrapolateRight: "clamp" });
    const scale = interpolate(p, [0, 0.4], [1, 1.06], { extrapolateRight: "clamp" });
    return <AbsoluteFill style={{ opacity, transform: `scale(${scale})`, transformOrigin: "center 36%" }}>{children}</AbsoluteFill>;
  }

  // Quiz title — full while the ball still fully covers it (so no leak before the iris).
  const titleOpacity = interpolate(p, [0.18, 0.3], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const titleScale = interpolate(p, [0.18, 0.5], [0.94, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  // ONE continuous expansion: the ball FAST-zooms up from the emblem and covers the frame
  // quickly (steeper ease-out), then keeps growing while the iris opens — so the first part
  // (the zoom) feels snappy and the iris reveal follows.
  const expand = Easing.out(Easing.cubic)(p);
  const ballScale = interpolate(expand, [0, 1], [START_SCALE, 9]); // fast zoom; covers by ~p0.22
  const ballY = interpolate(p, [0, 0.28], [EMBLEM_Y, 0], { easing: Easing.out(Easing.cubic), extrapolateRight: "clamp" });
  // Iris hole opens from the centre while the ball still expands → reveals the title.
  const open = Easing.inOut(Easing.cubic)(interpolate(p, [0.3, 0.97], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }));
  const irisR = interpolate(open, [0, 1], [0, 124]); // % hole radius (>100 = past the corners)
  const irisMask = open > 0.001 ? `radial-gradient(circle at 50% 50%, transparent ${Math.max(0, irisR - FEATHER)}%, #000 ${irisR}%)` : undefined;
  const ballOpacity = interpolate(p, [0.95, 1], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const ballSpin = 0; // no spin — steady expand + open

  return (
    <AbsoluteFill>
      {/* quiz title underneath the ball, revealed through the opening iris */}
      <AbsoluteFill style={{ opacity: titleOpacity, transform: `scale(${titleScale})`, transformOrigin: "center 50%" }}>
        {children}
      </AbsoluteFill>
      {/* the ball — continues from the emblem, covers, then opens (iris) to reveal */}
      <AbsoluteFill
        style={{
          alignItems: "center",
          justifyContent: "center",
          opacity: ballOpacity,
          pointerEvents: "none",
          WebkitMaskImage: irisMask,
          maskImage: irisMask,
        }}
      >
        <div style={{ transform: `translateY(${ballY}px) scale(${ballScale}) rotate(${ballSpin}deg)`, transformOrigin: "center center", filter: "drop-shadow(0 24px 50px rgba(0,0,0,0.36))" }}>
          <SoccerBall diameter={BALL_BASE} />
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

export const introHandoff = (): TransitionPresentation<Props> => ({
  component: IntroHandoffPresentation,
  props: {},
});
