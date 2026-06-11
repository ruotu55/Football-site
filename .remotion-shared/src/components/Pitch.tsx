import React from "react";
import { AbsoluteFill } from "remotion";

// The runner's pitch markings (html/pitch.html, viewBox 0 0 160 100). The surface
// is TRANSPARENT — the themed background behind shows through as the "grass" —
// exactly like the runner. Only the white lines are drawn here.
export const Pitch: React.FC = () => {
  return (
    <AbsoluteFill>
      <svg
        viewBox="0 0 160 100"
        preserveAspectRatio="none"
        style={{
          width: "100%",
          height: "100%",
          display: "block",
          borderRadius: 4,
          filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.22))",
        }}
        aria-hidden
      >
        {/* No outer touchline rect here — the panel div's rounded border IS the
            single field boundary (one clean window, no square-inside-a-square). */}
        <g
          className="pitch-lines"
          fill="none"
          stroke="rgba(255,255,255,0.28)"
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
        <g className="pitch-marks" fill="rgba(255,255,255,0.28)">
          <circle cx="80" cy="50" r="0.55" />
          <circle cx="80" cy="13.5" r="0.42" />
          <circle cx="80" cy="86.5" r="0.42" />
        </g>
      </svg>
    </AbsoluteFill>
  );
};
