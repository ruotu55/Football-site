import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";

export const QuizComposition: React.FC<{ title?: string }> = ({ title = "Quiz" }) => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ backgroundColor: "#0d1117", color: "#fff",
      justifyContent: "center", alignItems: "center", fontSize: 80 }}>
      {title} — frame {frame}
    </AbsoluteFill>
  );
};
