import React from "react";
import { AbsoluteFill } from "remotion";
import type {
  TransitionPresentation,
  TransitionPresentationComponentProps,
} from "@remotion/transitions";

type FogProps = Record<string, unknown>;

// A soft "fog" dissolve: the outgoing scene blurs and brightens into a white
// mist that peaks mid-transition; the incoming scene resolves out of the mist.
const FogPresentation: React.FC<
  TransitionPresentationComponentProps<FogProps>
> = ({ children, presentationProgress, presentationDirection }) => {
  const p = Math.max(0, Math.min(1, presentationProgress));
  const entering = presentationDirection === "entering";

  // Mist density peaks at the midpoint of the transition.
  const mist = Math.sin(p * Math.PI);

  const blur = entering ? (1 - p) * 24 : p * 24;
  const scale = entering ? 1.06 - p * 0.06 : 1 + p * 0.05;
  const opacity = entering ? Math.min(1, p * 1.35) : 1;

  return (
    <AbsoluteFill style={{ opacity }}>
      <AbsoluteFill
        style={{
          filter: `blur(${blur}px) brightness(${1 + mist * 0.22})`,
          transform: `scale(${scale})`,
        }}
      >
        {children}
      </AbsoluteFill>

      {/* White mist veil */}
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(130% 130% at 50% 45%, rgba(244,251,255,1) 0%, rgba(225,236,233,0.9) 60%, rgba(210,224,221,0.8) 100%)",
          opacity: mist * 0.6,
        }}
      />
    </AbsoluteFill>
  );
};

export const fog = (): TransitionPresentation<FogProps> => {
  return { component: FogPresentation, props: {} };
};
