import React from "react";
import { AbsoluteFill, Img, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { msToFrames, MS } from "../timeline";
import { assetUrl } from "../assets";

interface LogoLevelProps {
  assetBase: string;
  language?: string;
}

export const LogoLevel: React.FC<LogoLevelProps> = ({ assetBase, language }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // The app adds `.reveal` class at LOGO_PAGE_PLAY_VIDEO_DELAY_MS (2000ms),
  // which triggers `logo-epic-drop` animation (1s cubic-bezier(0.25, 1, 0.5, 1)).
  // Pre-reveal: opacity=0, scale=0.1, translateY=-200px (initial CSS state).
  // The animation goes: scale(1.5) translateY(-400px) blur(10px) → scale(1) translateY(0) blur(0).
  // We model it with the animation start at 2000ms.
  const revealStartFrame = msToFrames(MS.LOGO_REVEAL_DELAY, fps);        // ~120f at 60fps
  const revealEndFrame = revealStartFrame + msToFrames(1000, fps);         // +60f (1s animation)

  // Before reveal: invisible (opacity 0, slightly scaled-down appearance).
  // After reveal start: interpolate scale 1.5→1 and opacity 0→1 over 1s.
  const opacity = interpolate(
    frame,
    [revealStartFrame, revealEndFrame],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  // Scale: starts at 1.5 (app does scale(1.5) at keyframe 0%) drops to 1.0
  const scale = interpolate(
    frame,
    [revealStartFrame, revealEndFrame],
    [1.5, 1.0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  // Y offset: starts at -400px (app translateY(-400px) at 0%) rises to 0
  const translateY = interpolate(
    frame,
    [revealStartFrame, revealEndFrame],
    [-400, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  // Blur: 10px → 0px
  const blurPx = interpolate(
    frame,
    [revealStartFrame, revealEndFrame],
    [10, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  // Logo image — the app uses language-aware filename in the logo/outro;
  // the html src is hardcoded "Football Quiz Logo English.png" for both pages in this runner.
  const logoFile =
    language === "spanish"
      ? "Images/Logo/Football Quiz Logo Spanish.png"
      : "Images/Logo/Football Quiz Logo English.png";

  const logoSrc = assetUrl(logoFile, assetBase);

  return (
    <AbsoluteFill
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Img
        src={logoSrc}
        style={{
          width: 500,
          height: "auto",
          opacity,
          transform: `scale(${scale}) translateY(${translateY}px)`,
          filter: `blur(${blurPx}px)`,
          // Match app's will-change and backface-visibility:
          backfaceVisibility: "hidden",
        }}
      />
    </AbsoluteFill>
  );
};
