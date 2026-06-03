import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import { msToFrames } from "./timeline";

/**
 * CountdownRing — mirrors the app's #countdown-timer for Regular (non-Shorts) mode.
 *
 * Geometry: r=45, viewBox="0 0 100 100", circumference=283 (≈ 2π×45).
 * The SVG is rotated -90° so the ring drains clockwise from the top.
 * strokeDashoffset goes 0 → 283 linearly over 10 s (no easing, matches `1s linear` per tick).
 * Colors: green #22c55e when remaining>6s, yellow #eab308 when >3s, red #ef4444 (≤3s).
 * Pulse: subtle scale oscillation when remaining ≤ 3 s (replaces CSS animation).
 * No numeric text — Regular mode hides it (showNumericCountdown = isShorts).
 * Hidden (returns null) once the ring has fully drained (frame ≥ revealFrame).
 *
 * Position matches timer-overrides.css body:not(.shorts-mode):
 *   top: 2rem, left: calc(4rem + 5vw), width/height 6.4rem.
 *   At 2560×1440 with 1rem≡24px (Video scaled up), we use viewport-relative values via %.
 *   The parent AbsoluteFill is 2560×1440. We use absolute px calculated from those rems.
 */

const DASH = 283; // 2 * π * 45
const COUNTDOWN_MS = 10000;
// Stroke width in SVG user units (viewBox 100×100, r=45, stroke-width=10 from CSS)
const STROKE_WIDTH = 10;
// Ring size on screen: 6.4rem. At the 2560×1440 canvas 1rem ≈ 28px (browser default scaled).
// The app renders at CSS pixels but the video canvas is 2560 wide; devtools show ~2560 actual px.
// We use percentage-based positioning to keep it layout-relative.
// timer-overrides.css: top: 2rem, left: calc(4rem + 5vw)
// At video canvas: 1rem = 16px (CSS default), so top=32px, left= 64+128 = 192px, size=102.4px
const REM = 16; // CSS rem baseline (browser default; video frame uses this)
const RING_PX = 6.4 * REM; // 102.4px
const TOP_PX = 2 * REM; // 32px
const LEFT_PX = 4 * REM + 0.05 * 2560; // 64 + 128 = 192px

// Colors matching the app CSS
const COLOR_GREEN = "#22c55e";
const COLOR_YELLOW = "#eab308";
const COLOR_RED = "#ef4444";

export const CountdownRing: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const revealFrame = msToFrames(COUNTDOWN_MS, fps);

  // Hide once the ring is done
  if (frame >= revealFrame) return null;

  // Linear drain: offset 0 → 283 over 10s
  const offset = interpolate(frame, [0, revealFrame], [0, DASH], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Remaining seconds (floored-ish for color logic matching the app's integer `count`)
  const remaining = COUNTDOWN_MS / 1000 - frame / fps;

  let strokeColor: string;
  if (remaining > 6) {
    strokeColor = COLOR_GREEN;
  } else if (remaining > 3) {
    strokeColor = COLOR_YELLOW;
  } else {
    strokeColor = COLOR_RED;
  }

  // Pulse scale when ≤ 3s: 1 → 1.12 → 1 at 1Hz using sin wave
  let pulseScale = 1;
  if (remaining <= 3 && remaining > 0) {
    // frame-driven sine: peaks at 0.5s intervals
    const pulseAmt = Math.sin((frame / fps) * Math.PI * 2) * 0.5 + 0.5; // 0..1
    pulseScale = 1 + pulseAmt * 0.12; // 1.0 .. 1.12
  }

  // Glow filter matching CSS drop-shadow
  const glowColor =
    remaining > 6
      ? "rgba(34,197,94,0.6)"
      : remaining > 3
      ? "rgba(234,179,8,0.6)"
      : "rgba(239,68,68,0.6)";

  const containerStyle: React.CSSProperties = {
    position: "absolute",
    top: TOP_PX,
    left: LEFT_PX,
    width: RING_PX,
    height: RING_PX,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    transform: `scale(${pulseScale})`,
    transformOrigin: "center center",
    // pointerEvents none so it doesn't block pitch interaction in preview
    pointerEvents: "none",
  };

  // SVG insets beyond the container (mirrors .timer-svg: inset: -0.64rem)
  const inset = 0.64 * REM; // 10.24px
  const svgSize = RING_PX + inset * 2;

  const svgStyle: React.CSSProperties = {
    position: "absolute",
    top: -inset,
    left: -inset,
    width: svgSize,
    height: svgSize,
    // Start ring from top (matches CSS rotate(-90deg))
    transform: "rotate(-90deg)",
    overflow: "visible",
    pointerEvents: "none",
  };

  return (
    <div style={containerStyle}>
      <svg style={svgStyle} viewBox="0 0 100 100">
        {/* Background ring track (subtle dark) */}
        <circle
          cx="50"
          cy="50"
          r="45"
          fill="none"
          stroke="rgba(0,0,0,0.35)"
          strokeWidth={STROKE_WIDTH}
          strokeLinecap="round"
        />
        {/* Progress ring */}
        <circle
          cx="50"
          cy="50"
          r="45"
          fill="none"
          stroke={strokeColor}
          strokeWidth={STROKE_WIDTH}
          strokeLinecap="round"
          strokeDasharray={DASH}
          strokeDashoffset={offset}
          style={{
            filter: `drop-shadow(0 0 6px ${glowColor})`,
          }}
        />
      </svg>
      {/* No numeric text in Regular mode */}
    </div>
  );
};
