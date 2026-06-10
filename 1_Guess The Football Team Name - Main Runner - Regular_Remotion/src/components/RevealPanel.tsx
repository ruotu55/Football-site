import React from "react";
import { Img, interpolate, spring, staticFile } from "remotion";
import { TEAM } from "../data";
import { COLORS, fontFamily } from "../theme";
import { DESIGN_FPS } from "../timing";

const PANEL_WIDTH = 620;

// Full-height side panel that slides in from the left to reveal the answer team.
// Mirrors the runner's #team-header (translateX(-100%) -> 0).
export const RevealPanel: React.FC<{
  frame: number; // frame local to the level scene
  startFrame: number; // when the slide begins
}> = ({ frame, startFrame }) => {
  const local = frame - startFrame;

  const slide = spring({
    frame: local,
    fps: DESIGN_FPS,
    config: { damping: 18, mass: 0.9, stiffness: 110 },
    durationInFrames: 30,
  });
  const x = interpolate(slide, [0, 1], [-PANEL_WIDTH - 40, 0]);

  // Crest flourish: scales up + glow pulse shortly after the panel arrives.
  const crestPop = spring({
    frame: local - 14,
    fps: DESIGN_FPS,
    config: { damping: 11, mass: 0.7, stiffness: 130 },
    durationInFrames: 26,
  });
  const crestScale = interpolate(crestPop, [0, 1], [0.55, 1]);
  const glow = interpolate(crestPop, [0, 0.5, 1], [0, 0.9, 0.45], {
    extrapolateRight: "clamp",
  });

  const contentFade = interpolate(local, [16, 30], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const nameY = interpolate(local, [16, 32], [26, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        bottom: 0,
        left: 0,
        width: PANEL_WIDTH,
        transform: `translateX(${x}px)`,
        background: `linear-gradient(160deg, #16302a 0%, #0f241e 100%)`,
        borderRight: `5px solid ${COLORS.accent}`,
        boxShadow: "18px 0 50px rgba(0,0,0,0.5)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 26,
        padding: "0 48px",
        overflow: "hidden",
      }}
    >
      {/* Diagonal hatch texture (static background image, not an animation) */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: `repeating-linear-gradient(45deg, rgba(255,255,255,0.05) 0 2px, transparent 2px 16px)`,
          opacity: 0.7,
        }}
      />

      {/* "THE TEAM IS" eyebrow */}
      <div
        style={{
          fontFamily,
          fontWeight: 600,
          fontSize: 34,
          letterSpacing: 6,
          color: COLORS.accent,
          opacity: contentFade,
          textTransform: "uppercase",
          zIndex: 2,
        }}
      >
        And it's…
      </div>

      {/* Crest */}
      <div
        style={{
          position: "relative",
          transform: `scale(${crestScale})`,
          zIndex: 2,
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: -30,
            borderRadius: "50%",
            background: COLORS.accent,
            filter: "blur(40px)",
            opacity: glow,
          }}
        />
        <Img
          src={staticFile(TEAM.crest)}
          style={{
            position: "relative",
            width: 300,
            height: 300,
            objectFit: "contain",
            filter: "drop-shadow(0 12px 26px rgba(0,0,0,0.55))",
          }}
        />
      </div>

      {/* Team name */}
      <div
        style={{
          fontFamily,
          fontWeight: 800,
          fontSize: 72,
          lineHeight: 0.95,
          color: COLORS.white,
          textAlign: "center",
          letterSpacing: 1,
          textShadow: "0 5px 16px rgba(0,0,0,0.7)",
          opacity: contentFade,
          transform: `translateY(${nameY}px)`,
          zIndex: 2,
        }}
      >
        {TEAM.name}
      </div>

      {/* Flag + country */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 16,
          opacity: contentFade,
          transform: `translateY(${nameY}px)`,
          zIndex: 2,
        }}
      >
        <Img
          src={staticFile(TEAM.flag)}
          style={{
            width: 96,
            height: 64,
            objectFit: "cover",
            borderRadius: 6,
            border: "2px solid rgba(255,255,255,0.6)",
            boxShadow: "0 6px 16px rgba(0,0,0,0.45)",
          }}
        />
        <span
          style={{
            fontFamily,
            fontWeight: 600,
            fontSize: 40,
            letterSpacing: 4,
            color: COLORS.white,
          }}
        >
          {TEAM.flagLabel}
        </span>
      </div>
    </div>
  );
};
