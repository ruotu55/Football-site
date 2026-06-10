import React from "react";
import { AbsoluteFill, Easing, interpolate, spring } from "remotion";
import { Pitch } from "../components/Pitch";
import { PlayerSlot } from "../components/PlayerSlot";
import { RevealPanel } from "../components/RevealPanel";
import { FORMATION } from "../data";
import { COLORS, fontFamily } from "../theme";
import { DESIGN_FPS, useDesignFrame } from "../timing";

export const SLOT_STAGGER = 4;
export const REVEAL_START = 185; // frames into the level scene

// Inset the pitch from the frame edges a touch so the markings read cleanly.
const PITCH_INSET = { top: 150, bottom: 70, left: 120, right: 120 };

export const Level: React.FC = () => {
  const frame = useDesignFrame();

  // Banner drops in at the top.
  const bannerPop = spring({
    frame,
    fps: DESIGN_FPS,
    config: { damping: 16, mass: 0.8, stiffness: 120 },
    durationInFrames: 26,
  });
  const bannerY = interpolate(bannerPop, [0, 1], [-120, 0]);

  // When the reveal panel arrives, push the pitch right and dim it slightly so
  // the panel reads as the foreground.
  const revealProgress = interpolate(
    frame,
    [REVEAL_START, REVEAL_START + 26],
    [0, 1],
    {
      easing: Easing.bezier(0.22, 1, 0.36, 1),
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    },
  );
  const pitchShiftX = interpolate(revealProgress, [0, 1], [0, 150]);
  const pitchBrightness = interpolate(revealProgress, [0, 1], [1, 0.62]);

  return (
    <AbsoluteFill>
      {/* Pitch + players group */}
      <div
        style={{
          position: "absolute",
          top: PITCH_INSET.top,
          bottom: PITCH_INSET.bottom,
          left: PITCH_INSET.left,
          right: PITCH_INSET.right,
          borderRadius: 22,
          overflow: "hidden",
          boxShadow: "0 24px 60px rgba(0,0,0,0.5)",
          transform: `translateX(${pitchShiftX}px)`,
          filter: `brightness(${pitchBrightness})`,
        }}
      >
        <Pitch />
        {/* Player slots live in the pitch coordinate box (x%, y%). */}
        <AbsoluteFill>
          {FORMATION.map((player, i) => (
            <PlayerSlot
              key={player.slug}
              player={player}
              frame={frame}
              delay={10 + i * SLOT_STAGGER}
            />
          ))}
        </AbsoluteFill>
      </div>

      {/* Top question banner */}
      <div
        style={{
          position: "absolute",
          top: 40,
          left: 0,
          right: 0,
          display: "flex",
          justifyContent: "center",
          transform: `translateY(${bannerY}px)`,
        }}
      >
        <div
          style={{
            fontFamily,
            fontWeight: 800,
            fontSize: 66,
            letterSpacing: 3,
            color: COLORS.white,
            textTransform: "uppercase",
            textShadow: "0 5px 18px rgba(0,0,0,0.7)",
            padding: "8px 40px",
            borderRadius: 14,
            background: "rgba(13,28,21,0.45)",
            border: `2px solid ${COLORS.accent}`,
          }}
        >
          Guess The Team
        </div>
      </div>

      {/* Reveal panel slides over the left edge */}
      <RevealPanel frame={frame} startFrame={REVEAL_START} />
    </AbsoluteFill>
  );
};
