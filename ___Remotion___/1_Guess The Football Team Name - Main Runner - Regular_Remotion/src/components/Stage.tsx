import React from "react";
import { AbsoluteFill, useVideoConfig } from "remotion";
import { DESIGN_HEIGHT, DESIGN_WIDTH } from "../timing";

// Renders its children in a fixed 1920x1080 design box and scales that box to
// fill the real composition size. This lets every scene be authored in px at
// 1080p while rendering crisply at 1080p, 1440p or 4K.
export const Stage: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { width } = useVideoConfig();
  const scale = width / DESIGN_WIDTH;

  return (
    <AbsoluteFill style={{ backgroundColor: "#1d332a" }}>
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: DESIGN_WIDTH,
          height: DESIGN_HEIGHT,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
        }}
      >
        {children}
      </div>
    </AbsoluteFill>
  );
};
