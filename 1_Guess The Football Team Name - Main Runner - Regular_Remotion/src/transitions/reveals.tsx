import React from "react";
import { AbsoluteFill, Easing, interpolate } from "remotion";
import type {
  TransitionPresentation,
  TransitionPresentationComponentProps,
} from "@remotion/transitions";

type P = Record<string, unknown>;
const EASE = Easing.inOut(Easing.cubic);

// Depth Iris — a soft circle opens from the centre AND the incoming content scales
// in as it's revealed (the outgoing is pushed gently back). Clean reveal (no
// cross-fade ghosting) with smooth content motion. `isolation` contains the 3D pitch.
const DepthIrisPresentation: React.FC<TransitionPresentationComponentProps<P>> = ({
  children,
  presentationProgress,
  presentationDirection,
}) => {
  const p = Math.max(0, Math.min(1, presentationProgress));
  const e = EASE(p);
  const r = interpolate(e, [0, 1], [0, 122]);
  if (presentationDirection === "exiting") {
    const mask = `radial-gradient(circle at 50% 50%, transparent ${r - 14}%, #000 ${r}%)`;
    const scale = interpolate(e, [0, 1], [1, 1.08]);
    return (
      <AbsoluteFill style={{ isolation: "isolate", WebkitMaskImage: mask, maskImage: mask }}>
        <AbsoluteFill style={{ transform: `scale(${scale})` }}>{children}</AbsoluteFill>
      </AbsoluteFill>
    );
  }
  const mask = `radial-gradient(circle at 50% 50%, #000 ${r - 14}%, transparent ${r}%)`;
  const scale = interpolate(e, [0, 1], [1.14, 1]);
  return (
    <AbsoluteFill style={{ isolation: "isolate", WebkitMaskImage: mask, maskImage: mask }}>
      <AbsoluteFill style={{ transform: `scale(${scale})` }}>{children}</AbsoluteFill>
    </AbsoluteFill>
  );
};
export const depthIris = (): TransitionPresentation<P> => ({ component: DepthIrisPresentation, props: {} });
