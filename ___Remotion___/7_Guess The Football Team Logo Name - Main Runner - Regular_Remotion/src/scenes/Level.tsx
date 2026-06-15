import React from "react";
import { AbsoluteFill, Audio, Easing, Img, interpolate, Sequence, spring, staticFile } from "remotion";
import type { ResolvedBackground } from "@shared/effects/AnimatedBackground";
import { sharedSrc, type Language } from "@shared/paths";
import { COLORS, fontFamily } from "@shared/theme";
import { DESIGN_FPS, useDesignFrame, useFrameScale } from "@shared/timing";
import type { ResolvedLevel } from "../level-data";
import audioManifest from "../generated/audio.json";

export const REVEAL_START = 185;

// ── Level Badge (top-left gold disc with level number) ──────────────────────
const LevelBadge: React.FC<{ frame: number; n: number; opacity: number }> = ({ frame, n, opacity }) => {
  const pop = spring({
    frame,
    fps: DESIGN_FPS,
    config: { damping: 9, mass: 0.8, stiffness: 170 },
    durationInFrames: 32,
  });
  const scale = interpolate(pop, [0, 1], [0.2, 1]);
  return (
    <div style={{ position: "absolute", top: 34, left: 40, opacity, transform: `scale(${scale})`, transformOrigin: "top left" }}>
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

// ── Timer ring (top-right countdown) ────────────────────────────────────────
const Timer: React.FC<{ frame: number; opacity: number }> = ({ frame, opacity }) => {
  const T_START = 14;
  const T_END = REVEAL_START;
  const remain = interpolate(frame, [T_START, T_END], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const secs = Math.max(0, Math.ceil((T_END - Math.max(frame, T_START)) / DESIGN_FPS));
  const R = 66;
  const C = 2 * Math.PI * R;
  const pop = spring({ frame, fps: DESIGN_FPS, config: { damping: 12, mass: 0.7, stiffness: 160 }, durationInFrames: 26 });
  const scale = interpolate(pop, [0, 1], [0.2, 1]);
  const ringColor = remain < 0.16 ? "#ff4136" : COLORS.accent;
  return (
    <div style={{ position: "absolute", top: 34, right: 40, width: 162, height: 162, opacity, transform: `scale(${scale})`, transformOrigin: "top right" }}>
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

// ── Gentle bob animation (keyframe via interpolation) ───────────────────────
const useBobY = (frame: number): number => {
  const cycle = (frame % 120) / 120; // 4s at 30fps
  // sine-like bob using interpolate over a 0..1..0 envelope
  const half = cycle < 0.5 ? cycle * 2 : (1 - cycle) * 2;
  return interpolate(half, [0, 1], [0, -14], { easing: Easing.bezier(0.45, 0, 0.55, 1) });
};

// ── The main Level scene ─────────────────────────────────────────────────────
export const Level: React.FC<{
  bg: ResolvedBackground;
  level: ResolvedLevel;
  levelNumber: number;
  language: Language;
  muteReveal?: boolean;
}> = ({ level, levelNumber, language, muteReveal }) => {
  const frame = useDesignFrame();
  const k = useFrameScale();
  const f = (designFrames: number) => Math.round(designFrames * k);
  const revealVoice = language === "Spanish" ? level.revealVoiceEs : level.revealVoiceEn;

  // Crossfade: 0 = fully obscured, 1 = fully revealed
  const revealProgress = interpolate(frame, [REVEAL_START, REVEAL_START + 26], [0, 1], {
    easing: Easing.bezier(0.22, 1, 0.36, 1),
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Badge + timer fade out as reveal starts
  const uiOpacity = interpolate(revealProgress, [0, 0.5], [1, 0], { extrapolateRight: "clamp" });

  // Bob animation (only during question phase)
  const bobY = frame < REVEAL_START ? useBobY(frame) : 0;

  // Crest image: blur+darken during question, clear on reveal
  const crestBlur = interpolate(revealProgress, [0, 1], [22, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const crestBrightness = interpolate(revealProgress, [0, 1], [0.35, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  const crestSrc = level.crestPath ? sharedSrc(level.crestPath) : null;

  // Pill bar: shows "?" during question, team name on reveal
  const barTextOpacity = interpolate(revealProgress, [0.5, 0.85], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const questionMarkOpacity = interpolate(revealProgress, [0, 0.4], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <AbsoluteFill>
      {/* ── centered crest + bar ── */}
      <AbsoluteFill
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 40,
          transform: `translateY(${bobY}px)`,
        }}
      >
        {/* Crest card */}
        <div
          style={{
            position: "relative",
            width: "min(64vh, 36rem)",
            height: "min(64vh, 36rem)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {/* Dark overlay to reinforce obscure effect during question phase */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: 32,
              background: "rgba(0,0,0,0.45)",
              opacity: interpolate(revealProgress, [0, 0.7], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
              zIndex: 2,
              pointerEvents: "none",
            }}
          />

          {crestSrc ? (
            <Img
              src={crestSrc}
              style={{
                width: "88%",
                height: "88%",
                objectFit: "contain",
                filter: `blur(${crestBlur}px) brightness(${crestBrightness}) drop-shadow(0 24px 48px rgba(0,0,0,0.7))`,
                borderRadius: 24,
                position: "relative",
                zIndex: 1,
              }}
            />
          ) : (
            /* Placeholder when no crest is found */
            <div
              style={{
                width: "88%",
                height: "88%",
                borderRadius: 24,
                background: "rgba(255,255,255,0.08)",
                border: "3px solid rgba(255,255,255,0.18)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                filter: `blur(${crestBlur}px) brightness(${crestBrightness})`,
                zIndex: 1,
              }}
            >
              <div
                style={{
                  fontFamily,
                  fontWeight: 800,
                  fontSize: 120,
                  color: "rgba(255,255,255,0.3)",
                }}
              >
                ?
              </div>
            </div>
          )}
        </div>

        {/* Reveal pill bar */}
        <div
          style={{
            position: "relative",
            width: "min(64vh, 36rem)",
            minHeight: 96,
            borderRadius: 999,
            background: "linear-gradient(145deg, rgba(14,20,30,0.82) 0%, rgba(10,16,26,0.74) 45%, rgba(30,60,90,0.56) 100%)",
            border: "1.5px solid rgba(255,255,255,0.28)",
            boxShadow: "0 10px 40px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.14), inset 0 -1px 0 rgba(0,0,0,0.18)",
            backdropFilter: "blur(18px) saturate(1.25)",
            WebkitBackdropFilter: "blur(18px) saturate(1.25)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "0 32px",
            overflow: "hidden",
          }}
        >
          {/* "?" shown during question */}
          <div
            style={{
              position: "absolute",
              fontFamily,
              fontWeight: 800,
              fontSize: 64,
              color: COLORS.white,
              textShadow: "0 6px 20px rgba(0,0,0,0.7)",
              opacity: questionMarkOpacity,
              letterSpacing: 4,
            }}
          >
            ?
          </div>

          {/* Team name shown on reveal */}
          <div
            style={{
              position: "absolute",
              fontFamily,
              fontWeight: 800,
              fontSize: 52,
              color: COLORS.white,
              textShadow: "0 4px 16px rgba(0,0,0,0.8)",
              opacity: barTextOpacity,
              textTransform: "uppercase",
              letterSpacing: 2,
              textAlign: "center",
              padding: "0 16px",
              lineHeight: 1.05,
              // fit long names by clamping font-size — use CSS clamp for responsive sizing
              maxWidth: "100%",
              wordBreak: "break-word",
            }}
          >
            {level.teamName.toUpperCase()}
          </div>
        </div>
      </AbsoluteFill>

      {/* ── Badge + Timer (fade out on reveal) ── */}
      <LevelBadge frame={frame} n={levelNumber} opacity={uiOpacity} />
      <Timer frame={frame} opacity={uiOpacity} />

      {/* ── Audio ── */}
      <Sequence from={f(REVEAL_START - 30)} durationInFrames={f(30)}>
        <Audio src={staticFile(audioManifest.ticking)} volume={0.8} />
      </Sequence>
      {/* Bonus level (muteReveal): no flip stinger — the answer stays hidden. */}
      {muteReveal ? null : (
        <Sequence from={f(REVEAL_START)}>
          <Audio src={staticFile(audioManifest.stinger)} volume={0.5} />
        </Sequence>
      )}
      {!muteReveal && revealVoice ? (
        <Sequence from={f(REVEAL_START + 5)}>
          <Audio src={staticFile(revealVoice)} volume={1} />
        </Sequence>
      ) : null}
    </AbsoluteFill>
  );
};
