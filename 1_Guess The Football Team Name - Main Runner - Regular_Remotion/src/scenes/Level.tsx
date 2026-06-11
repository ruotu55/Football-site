import React from "react";
import { AbsoluteFill, Audio, Easing, interpolate, Sequence, spring, staticFile } from "remotion";
import { Pitch } from "../components/Pitch";
import { PlayerSlot } from "../components/PlayerSlot";
import { RevealPanel } from "../components/RevealPanel";
import type { ResolvedBackground } from "../effects/AnimatedBackground";
import type { ResolvedLevel } from "../level-data";
import { sharedSrc, type Language } from "../paths";
import { COLORS, fontFamily } from "../theme";
import { DESIGN_FPS, useDesignFrame, useFrameScale } from "../timing";
import audioManifest from "../generated/audio.json";

export const SLOT_STAGGER = 4;
export const REVEAL_START = 185;

const PITCH_PLAN_RATIO = 1.28;
const PITCH_TILT = 38;
const PITCH_SURFACE_W = 1280;
const PITCH_SURFACE_H = PITCH_SURFACE_W / PITCH_PLAN_RATIO;
const SLOT_WIDTH_PCT = 14.7;
// Surface transform (shared with the slot-depth math below so slots stay aligned).
const SURFACE_SCALE = 1.0925;
const SURFACE_TY_PCT = -11;
// No top banner anymore → the pitch rises to the top of the frame.
const PITCH_SHIFT_Y = -8;

const PERSP = 1200;
const slotZ = (yPct: number) => {
  const tiltRad = (PITCH_TILT * Math.PI) / 180;
  const tY = (SURFACE_TY_PCT / 100) * PITCH_SURFACE_H;
  const oy = (yPct / 100) * PITCH_SURFACE_H - PITCH_SURFACE_H / 2;
  return (oy * SURFACE_SCALE + tY) * Math.sin(tiltRad) + 60;
};
const Z_REF = slotZ(58);
const sizeComp = (yPct: number) => (PERSP - slotZ(yPct)) / (PERSP - Z_REF);

// ── Top-left level badge: a gold disc that "jumps" in at the start of every level ──
const LevelBadge: React.FC<{ frame: number; n: number; opacity: number }> = ({ frame, n, opacity }) => {
  const pop = spring({
    frame,
    fps: DESIGN_FPS,
    config: { damping: 9, mass: 0.8, stiffness: 170 }, // low damping → a little bounce ("jump")
    durationInFrames: 32,
  });
  const scale = interpolate(pop, [0, 1], [0.2, 1]);
  return (
    <div
      style={{
        position: "absolute",
        top: 34,
        left: 40,
        opacity,
        transform: `scale(${scale})`,
        transformOrigin: "top left",
      }}
    >
      <div
        style={{
          width: 156,
          height: 156,
          borderRadius: "50%",
          background: "radial-gradient(circle at 50% 32%, #ffdf73 0%, #f7a81b 62%, #e07d09 100%)",
          border: "7px solid rgba(255,255,255,0.94)",
          boxShadow: "0 18px 38px rgba(0,0,0,0.55), inset 0 -8px 18px rgba(0,0,0,0.18)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily,
          fontWeight: 800,
          fontSize: 93,
          lineHeight: 1,
          color: "#241500",
          textShadow: "0 2px 0 rgba(255,255,255,0.25)",
        }}
      >
        {n}
      </div>
    </div>
  );
};

// ── Top-right countdown timer: a ring that depletes through the question phase ──
const Timer: React.FC<{ frame: number; opacity: number }> = ({ frame, opacity }) => {
  const T_START = 14;
  const T_END = REVEAL_START;
  const remain = interpolate(frame, [T_START, T_END], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const secs = Math.max(0, Math.ceil((T_END - Math.max(frame, T_START)) / DESIGN_FPS));
  const R = 66;
  const C = 2 * Math.PI * R;
  const pop = spring({ frame, fps: DESIGN_FPS, config: { damping: 12, mass: 0.7, stiffness: 160 }, durationInFrames: 26 });
  const scale = interpolate(pop, [0, 1], [0.2, 1]);
  // urgency: ring goes amber → red in the last second
  const ringColor = remain < 0.16 ? "#ff4136" : COLORS.accent;
  return (
    <div
      style={{
        position: "absolute",
        top: 34,
        right: 40,
        width: 162,
        height: 162,
        opacity,
        transform: `scale(${scale})`,
        transformOrigin: "top right",
      }}
    >
      <svg width={162} height={162} style={{ display: "block", filter: "drop-shadow(0 14px 28px rgba(0,0,0,0.5))" }}>
        <circle cx={81} cy={81} r={R} fill="rgba(12,16,22,0.66)" stroke="rgba(255,255,255,0.16)" strokeWidth={14} />
        <circle
          cx={81}
          cy={81}
          r={R}
          fill="none"
          stroke={ringColor}
          strokeWidth={14}
          strokeLinecap="round"
          strokeDasharray={C}
          strokeDashoffset={C * (1 - remain)}
          transform="rotate(-90 81 81)"
        />
      </svg>
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily,
          fontWeight: 800,
          fontSize: 72,
          color: COLORS.white,
          textShadow: "0 2px 6px rgba(0,0,0,0.6)",
        }}
      >
        {secs}
      </div>
    </div>
  );
};

export const Level: React.FC<{
  bg: ResolvedBackground;
  level: ResolvedLevel;
  levelNumber: number;
  language: Language;
}> = ({ bg, level, levelNumber, language }) => {
  const frame = useDesignFrame();
  const k = useFrameScale();
  const f = (designFrames: number) => Math.round(designFrames * k);
  // Spoken team name on reveal (language-aware; null if the team has no recording).
  const revealVoice = language === "Spanish" ? level.revealVoiceEs : level.revealVoiceEn;

  const revealProgress = interpolate(frame, [REVEAL_START, REVEAL_START + 26], [0, 1], {
    easing: Easing.bezier(0.22, 1, 0.36, 1),
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const pitchShiftX = interpolate(revealProgress, [0, 1], [0, 150]);
  const pitchBrightness = 1; // no darkening of the pitch when the team is revealed
  // Question-phase UI (level badge + timer) fades out as the answer is revealed.
  const uiOpacity = interpolate(revealProgress, [0, 0.5], [1, 0], { extrapolateRight: "clamp" });

  // The answer panel must match the BACKGROUND. When a competition is set it drives
  // the bg (c2 = vivid brand tone, c1 = dark base); otherwise fall back to the
  // Background-Color control. So the panel re-colours with every background change.
  const panelTop = bg.competition ? bg.competition.c2 : bg.colorHex;
  const panelBottom = bg.competition ? bg.competition.c1 : bg.colorHex;

  return (
    <AbsoluteFill>
      <AbsoluteFill
        style={{
          transform: `translate(${pitchShiftX}px, ${PITCH_SHIFT_Y}px)`,
          filter: `brightness(${pitchBrightness})`,
        }}
      >
        <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", perspective: 1200 }}>
          {/* ONE clean rounded panel — the field is a single window (no nested borders). */}
          <div
            style={{
              position: "relative",
              width: PITCH_SURFACE_W,
              height: PITCH_SURFACE_H,
              transformOrigin: "center center",
              transform: `rotateX(${PITCH_TILT}deg) translateY(${SURFACE_TY_PCT}%) scale(${SURFACE_SCALE})`,
              transformStyle: "preserve-3d",
              borderRadius: 26,
              border: "2px solid rgba(255,255,255,0.22)",
              background:
                "linear-gradient(180deg, rgba(255,255,255,0.05) 0%, rgba(0,0,0,0.10) 55%, rgba(0,0,0,0.20) 100%)",
              boxShadow:
                "0 40px 90px rgba(0,0,0,0.85), 0 0 60px rgba(30,120,70,0.16), inset 0 0 40px rgba(0,0,0,0.18)",
            }}
          >
            <Pitch />
            <div style={{ position: "absolute", inset: 0, transformStyle: "preserve-3d" }}>
              {level.players.map((player, i) => (
                <PlayerSlot
                  key={i}
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

      <LevelBadge frame={frame} n={levelNumber} opacity={uiOpacity} />
      <Timer frame={frame} opacity={uiOpacity} />

      <RevealPanel
        frame={frame}
        startFrame={REVEAL_START}
        colorTop={panelTop}
        colorBottom={panelBottom}
        teamName={level.teamName}
        crestSrc={sharedSrc(level.crestPath)}
        flagSrc={sharedSrc(level.countryFlagPath)}
      />

      {/* ── sound (relative to this level's sequence) ──
          ticking the last ~1s of the countdown, the flip stinger at the reveal tick,
          then the spoken team name 150ms (≈5 design frames) after the flip. */}
      <Sequence from={f(REVEAL_START - 30)} durationInFrames={f(30)}>
        <Audio src={staticFile(audioManifest.ticking)} volume={0.8} />
      </Sequence>
      <Sequence from={f(REVEAL_START)}>
        <Audio src={staticFile(audioManifest.stinger)} volume={0.5} />
      </Sequence>
      {revealVoice ? (
        <Sequence from={f(REVEAL_START + 5)}>
          <Audio src={staticFile(revealVoice)} volume={1} />
        </Sequence>
      ) : null}
    </AbsoluteFill>
  );
};
