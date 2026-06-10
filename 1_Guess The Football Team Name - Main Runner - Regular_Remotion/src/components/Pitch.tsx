import React from "react";
import { AbsoluteFill } from "remotion";
import { COLORS } from "../theme";

// SVG pitch markings copied verbatim from the runner's html/pitch.html
// (viewBox 0 0 160 100). Drawn over a green gradient surface with mown stripes.
export const Pitch: React.FC = () => {
  return (
    <AbsoluteFill
      style={{
        background: `linear-gradient(180deg, #4a7a63 0%, #3c6553 50%, #305344 100%)`,
      }}
    >
      {/* Mown grass stripes */}
      <AbsoluteFill style={{ opacity: 0.18 }}>
        {Array.from({ length: 10 }).map((_, i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              top: `${i * 10}%`,
              left: 0,
              right: 0,
              height: "10%",
              background: i % 2 === 0 ? "#ffffff" : "transparent",
            }}
          />
        ))}
      </AbsoluteFill>

      <svg
        viewBox="0 0 160 100"
        preserveAspectRatio="none"
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
        aria-hidden
      >
        <rect
          x="0"
          y="0"
          width="160"
          height="100"
          fill="transparent"
          stroke="rgba(232,244,255,0.30)"
          strokeWidth="0.5"
        />
        <g
          fill="none"
          stroke={COLORS.line}
          strokeWidth="0.42"
          strokeLinecap="square"
          strokeLinejoin="miter"
        >
          <line x1="0" y1="50" x2="160" y2="50" />
          <ellipse cx="80" cy="50" rx="21.529" ry="8.714" />
          <rect x="32.565" y="0" width="94.871" height="20.5" />
          <rect x="58.435" y="0" width="43.13" height="6.6" />
          <path d="M 73.038 20.5 A 8.71 8.71 0 0 0 86.962 20.5" />
          <rect x="32.565" y="79.5" width="94.871" height="20.5" />
          <rect x="58.435" y="93.4" width="43.13" height="6.6" />
          <path d="M 73.038 79.5 A 8.71 8.71 0 0 1 86.962 79.5" />
          <path d="M 0 0.952 A 2.353 0.952 0 0 1 2.353 0" />
          <path d="M 160 0.952 A 2.353 0.952 0 0 0 157.647 0" />
          <path d="M 0 99.048 A 2.353 0.952 0 0 0 2.353 100" />
          <path d="M 160 99.048 A 2.353 0.952 0 0 1 157.647 100" />
        </g>
        <g fill="rgba(255,255,255,0.30)">
          <circle cx="80" cy="50" r="0.6" />
          <circle cx="80" cy="13.5" r="0.45" />
          <circle cx="80" cy="86.5" r="0.45" />
        </g>
      </svg>
    </AbsoluteFill>
  );
};
