import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";

interface TransitionOverlayProps {
  durationInFrames: number;
}

export const TransitionOverlay: React.FC<TransitionOverlayProps> = ({ durationInFrames }) => {
  const frame = useCurrentFrame();
  const half = durationInFrames / 2;
  const opacity = interpolate(frame, [0, half, durationInFrames], [0, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: `rgba(10, 15, 30, ${opacity})`,
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <span
        style={{
          fontSize: 60,
          fontWeight: 700,
          color: `rgba(255,255,255,${opacity * 0.7})`,
          letterSpacing: 8,
          textTransform: "uppercase",
        }}
      >
        TRANSITION
      </span>
    </AbsoluteFill>
  );
};
