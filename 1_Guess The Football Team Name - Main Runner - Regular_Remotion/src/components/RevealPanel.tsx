import React from "react";
import { Img, interpolate, spring, staticFile, useVideoConfig } from "remotion";
import { TEAM } from "../data";
import { COLORS, fontFamily } from "../theme";
import { buildHatchUri, HATCH_TILE } from "../effects/hatch";
import { DESIGN_FPS } from "../timing";

const PANEL_WIDTH = 340; // ≈ runner's min(16.35vw, 14.4rem)

// Broken-dash crosshatch in the team/flag colours (Spain → red + gold), built once.
const HATCH = buildHatchUri(["rgba(170,21,27,0.52)", "rgba(241,191,0,0.5)"], 7);

export const RevealPanel: React.FC<{
  frame: number;
  startFrame: number;
  panelColor: string; // theme colour; the panel base is a darkened version
}> = ({ frame, startFrame, panelColor }) => {
  const { fps } = useVideoConfig();
  const local = frame - startFrame;

  const slide = spring({
    frame: local,
    fps: DESIGN_FPS,
    config: { damping: 18, mass: 0.9, stiffness: 110 },
    durationInFrames: 30,
  });
  const x = interpolate(slide, [0, 1], [-PANEL_WIDTH - 40, 0]);

  const crestPop = spring({
    frame: local - 12,
    fps: DESIGN_FPS,
    config: { damping: 12, mass: 0.7, stiffness: 130 },
    durationInFrames: 24,
  });
  const crestScale = interpolate(crestPop, [0, 1], [0.65, 1]);

  const contentFade = interpolate(local, [14, 28], [0, 1], {
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
        backgroundColor: `color-mix(in srgb, ${panelColor} 78%, #000 22%)`,
        borderRight: "2px solid rgba(0,0,0,0.55)",
        boxShadow: "14px 0 40px rgba(0,0,0,0.5)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        overflow: "hidden",
      }}
    >
      {/* Broken-dash crosshatch in team/flag colours (runner team-header-hatch) */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: HATCH,
          backgroundRepeat: "repeat",
          backgroundSize: `${HATCH_TILE}px ${HATCH_TILE}px`,
        }}
      />

      {/* Crest + name (centered in the upper area) */}
      <div
        style={{
          position: "relative",
          zIndex: 2,
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 22,
          padding: "44px 28px 36%",
          transform: "translateY(-20%)",
        }}
      >
        <Img
          src={staticFile(TEAM.crest)}
          style={{
            width: 220,
            height: 220,
            objectFit: "contain",
            transform: `scale(${crestScale})`,
            filter: "drop-shadow(0 10px 22px rgba(0,0,0,0.5))",
          }}
        />
        <div
          style={{
            fontFamily,
            fontWeight: 800,
            fontSize: 52,
            lineHeight: 0.95,
            color: COLORS.white,
            textAlign: "center",
            letterSpacing: 1,
            textShadow: "0 4px 14px rgba(0,0,0,0.7)",
            opacity: contentFade,
          }}
        >
          {TEAM.name}
        </div>
      </div>

      {/* Flag — slanted (-8°), filling the bottom 35% (runner flag-section) */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          width: "100%",
          height: "35%",
          zIndex: 2,
          overflow: "hidden",
          opacity: contentFade,
        }}
      >
        <div
          style={{
            position: "absolute",
            bottom: "-10%",
            left: "-10%",
            width: "120%",
            height: "100%",
            transform: "rotate(-8deg)",
            transformOrigin: "center center",
            boxSizing: "border-box",
            borderTop: "6px solid #0a0a0a",
          }}
        >
          <Img
            src={staticFile(TEAM.flag)}
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: "cover",
              display: "block",
            }}
          />
        </div>
      </div>
    </div>
  );
};
