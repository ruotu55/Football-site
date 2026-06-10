import React from "react";
import { AbsoluteFill, Easing, interpolate, spring } from "remotion";
import { Pitch } from "../components/Pitch";
import { PlayerSlot } from "../components/PlayerSlot";
import { RevealPanel } from "../components/RevealPanel";
import { FORMATION } from "../data";
import type { ResolvedBackground } from "../effects/AnimatedBackground";
import { COLORS, fontFamily } from "../theme";
import { DESIGN_FPS, useDesignFrame } from "../timing";

export const SLOT_STAGGER = 4;
export const REVEAL_START = 185; // frames into the level scene

// 3D pitch (matches the runner's css/components/pitch.css):
//   .pitch-wrap     -> perspective: 1200px
//   .pitch-surface  -> rotateX(38deg) translateY(-11%) scale(1.0925), aspect 1.28
const PITCH_PLAN_RATIO = 1.28;
const PITCH_TILT = 38; // deg
const PITCH_SURFACE_W = 1280;
const PITCH_SURFACE_H = PITCH_SURFACE_W / PITCH_PLAN_RATIO;

// Slot card width as a % of the pitch plane (20% bigger than before).
const SLOT_WIDTH_PCT = 10.8;

// Depth (Z) of a slot at formation-y after the pitch's tilt + translateY + the
// slot's translateZ(60). Used to cancel perspective so all slots are one size.
const PERSP = 1200;
const slotZ = (yPct: number) => {
  const s = 1.0925;
  const tiltRad = (PITCH_TILT * Math.PI) / 180;
  const tY = -0.11 * PITCH_SURFACE_H;
  const oy = (yPct / 100) * PITCH_SURFACE_H - PITCH_SURFACE_H / 2;
  return (oy * s + tY) * Math.sin(tiltRad) + 60;
};
// Reference depth (mid formation) → comp = 1 there; far rows scale up, near scale down.
const Z_REF = slotZ(58);
const sizeComp = (yPct: number) => (PERSP - slotZ(yPct)) / (PERSP - Z_REF);

export const Level: React.FC<{ bg: ResolvedBackground }> = ({ bg }) => {
  const frame = useDesignFrame();

  const bannerPop = spring({
    frame,
    fps: DESIGN_FPS,
    config: { damping: 16, mass: 0.8, stiffness: 120 },
    durationInFrames: 26,
  });
  const bannerY = interpolate(bannerPop, [0, 1], [-120, 0]);

  // When the reveal panel arrives, push the pitch right and dim it slightly.
  const revealProgress = interpolate(frame, [REVEAL_START, REVEAL_START + 26], [0, 1], {
    easing: Easing.bezier(0.22, 1, 0.36, 1),
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const pitchShiftX = interpolate(revealProgress, [0, 1], [0, 150]);
  const pitchBrightness = interpolate(revealProgress, [0, 1], [1, 0.62]);

  return (
    <AbsoluteFill>
      {/* Pitch (3D lines) + slots (2D, uniform size) move together on reveal */}
      <AbsoluteFill
        style={{
          transform: `translateX(${pitchShiftX}px)`,
          filter: `brightness(${pitchBrightness})`,
        }}
      >
        {/* .pitch-wrap — perspective container for the tilted line plane */}
        <AbsoluteFill
          style={{ alignItems: "center", justifyContent: "center", perspective: 1200 }}
        >
          <div
            style={{
              position: "relative",
              width: PITCH_SURFACE_W,
              height: PITCH_SURFACE_H,
              transformOrigin: "center center",
              transform: `rotateX(${PITCH_TILT}deg) translateY(-11%) scale(1.0925)`,
              transformStyle: "preserve-3d",
              borderRadius: 8,
              boxShadow:
                "0 36px 90px rgba(0,0,0,0.85), 0 0 50px rgba(30,120,70,0.18)",
            }}
          >
            <Pitch />

            {/* Slots live ON the plane (exact formation positions), upright,
                size-compensated so every card is the same size. */}
            <div style={{ position: "absolute", inset: 0, transformStyle: "preserve-3d" }}>
              {FORMATION.map((player, i) => (
                <PlayerSlot
                  key={player.slug}
                  player={player}
                  frame={frame}
                  delay={10 + i * SLOT_STAGGER}
                  revealStart={REVEAL_START}
                  tilt={PITCH_TILT}
                  sizeComp={sizeComp(player.y)}
                  widthPct={SLOT_WIDTH_PCT}
                  floatPhase={0}
                />
              ))}
            </div>
          </div>
        </AbsoluteFill>
      </AbsoluteFill>

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

      <RevealPanel frame={frame} startFrame={REVEAL_START} panelColor={bg.colorHex} />
    </AbsoluteFill>
  );
};
