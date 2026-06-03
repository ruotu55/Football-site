import React from "react";
import { AbsoluteFill } from "remotion";

interface BackgroundThemeProps {
  /** Reserved for per-competition colour schemes — not used yet. */
  competition?: string;
}

export const BackgroundTheme: React.FC<BackgroundThemeProps> = () => {
  return (
    <AbsoluteFill
      style={{
        background: "linear-gradient(to bottom, #0b1622 0%, #142436 100%)",
      }}
    />
  );
};
