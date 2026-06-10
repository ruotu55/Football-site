import React from "react";
import { Img, interpolate, spring, staticFile } from "remotion";
import type { Player } from "../data";
import { COLORS, fontFamily } from "../theme";
import { DESIGN_FPS } from "../timing";

const DIAMETER = 132;

// Map a formation coordinate (0..100) into a padded field inside the pitch box
// so edge slots (especially the GK at y=100) keep room for their name plate.
const fieldX = (x: number) => 4 + x * 0.92;
const fieldY = (y: number) => 6 + y * 0.8;

export const PlayerSlot: React.FC<{
  player: Player;
  frame: number; // frame local to the level scene
  delay: number; // pop-in delay in frames
}> = ({ player, frame, delay }) => {
  const pop = spring({
    frame: frame - delay,
    fps: DESIGN_FPS,
    config: { damping: 12, mass: 0.6, stiffness: 140 },
    durationInFrames: 28,
  });
  const scale = interpolate(pop, [0, 1], [0.3, 1]);
  const opacity = interpolate(pop, [0, 0.6], [0, 1], {
    extrapolateRight: "clamp",
  });

  return (
    <div
      style={{
        position: "absolute",
        left: `${fieldX(player.x)}%`,
        top: `${fieldY(player.y)}%`,
        transform: `translate(-50%, -50%) scale(${scale})`,
        opacity,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 6,
      }}
    >
      {/* Photo disc */}
      <div
        style={{
          position: "relative",
          width: DIAMETER,
          height: DIAMETER,
          borderRadius: "50%",
          background: `radial-gradient(circle at 50% 30%, #ffffff 0%, #e6eef0 100%)`,
          border: `4px solid ${COLORS.white}`,
          boxShadow: "0 10px 26px rgba(0,0,0,0.45)",
          overflow: "hidden",
        }}
      >
        <Img
          src={staticFile(`players/${player.slug}.webp`)}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            objectPosition: "center top",
          }}
        />
        {/* Shirt number badge */}
        <div
          style={{
            position: "absolute",
            right: -6,
            bottom: -6,
            width: 40,
            height: 40,
            borderRadius: "50%",
            background: COLORS.accent,
            color: COLORS.ink,
            border: `3px solid ${COLORS.white}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily,
            fontWeight: 800,
            fontSize: 22,
            lineHeight: 1,
            boxShadow: "0 4px 10px rgba(0,0,0,0.4)",
          }}
        >
          {player.number}
        </div>
      </div>

      {/* Name plate */}
      <div
        style={{
          fontFamily,
          fontWeight: 700,
          fontSize: 26,
          color: COLORS.white,
          letterSpacing: 0.5,
          padding: "3px 14px",
          borderRadius: 7,
          background: "rgba(13,28,21,0.82)",
          border: "1px solid rgba(255,255,255,0.18)",
          textShadow: "0 2px 6px rgba(0,0,0,0.6)",
          whiteSpace: "nowrap",
        }}
      >
        {player.display}
      </div>
    </div>
  );
};
