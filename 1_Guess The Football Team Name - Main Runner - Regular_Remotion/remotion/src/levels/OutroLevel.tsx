import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import type { RemotionLevel } from "../props";

interface OutroLevelProps {
  level: RemotionLevel;
  endingType?: string;
}

const PANEL: React.CSSProperties = {
  background: "rgba(0,0,0,0.55)",
  borderRadius: 20,
  padding: "60px 120px",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 28,
};

export const OutroLevel: React.FC<OutroLevelProps> = ({ endingType }) => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
      <div style={PANEL}>
        <span style={{ fontSize: 96, fontWeight: 900, color: "#fff", letterSpacing: 6 }}>
          OUTRO
        </span>
        <span style={{ fontSize: 48, color: "#e8b500", fontWeight: 700 }}>
          {endingType ?? "—"}
        </span>
        <span style={{ fontSize: 40, color: "rgba(255,255,255,0.55)" }}>
          local frame: {frame}
        </span>
      </div>
    </AbsoluteFill>
  );
};
