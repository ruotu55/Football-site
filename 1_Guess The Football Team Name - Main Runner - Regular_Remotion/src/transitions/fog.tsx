import React from "react";
import { AbsoluteFill, interpolate } from "remotion";
import type {
  TransitionPresentation,
  TransitionPresentationComponentProps,
} from "@remotion/transitions";

type FogProps = Record<string, unknown>;

// A soft "fog" dissolve: the outgoing scene blurs, brightens and FADES OUT into a
// white mist that peaks mid-transition; the incoming scene resolves out of it.
// (The exiting scene must fully fade so its text never lingers underneath the
// next, partly-transparent scene.)
const FogPresentation: React.FC<
  TransitionPresentationComponentProps<FogProps>
> = ({ children, presentationProgress, presentationDirection }) => {
  const p = Math.max(0, Math.min(1, presentationProgress));
  const entering = presentationDirection === "entering";

  const mist = Math.sin(p * Math.PI); // 0 → 1 → 0
  const blur = entering ? (1 - p) * 22 : p * 22;
  const scale = entering ? 1.04 - p * 0.04 : 1 + p * 0.04;

  const opacity = entering
    ? interpolate(p, [0.15, 0.6], [0, 1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      })
    : interpolate(p, [0.4, 0.95], [1, 0], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      });

  return (
    <AbsoluteFill style={{ opacity }}>
      <AbsoluteFill
        style={{
          filter: `blur(${blur}px) brightness(${1 + mist * 0.2})`,
          transform: `scale(${scale})`,
        }}
      >
        {children}
      </AbsoluteFill>

      <AbsoluteFill
        style={{
          background:
            "radial-gradient(130% 130% at 50% 45%, rgba(244,251,255,1) 0%, rgba(228,238,236,0.92) 60%, rgba(214,226,224,0.85) 100%)",
          opacity: mist * 0.7,
        }}
      />
    </AbsoluteFill>
  );
};

export const fog = (): TransitionPresentation<FogProps> => {
  return { component: FogPresentation, props: {} };
};
