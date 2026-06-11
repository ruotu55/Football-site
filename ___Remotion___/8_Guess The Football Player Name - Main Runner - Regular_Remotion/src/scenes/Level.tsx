import React from "react";
import { AbsoluteFill, Audio, Easing, interpolate, Sequence, spring, staticFile, Img } from "remotion";
import type { ResolvedBackground } from "@shared/effects/AnimatedBackground";
import type { Language } from "@shared/paths";
import { sharedSrc } from "@shared/paths";
import { COLORS, fontFamily } from "@shared/theme";
import { DESIGN_FPS, useDesignFrame, useFrameScale } from "@shared/timing";
import type { ResolvedLevel } from "../level-data";
import audioManifest from "../generated/audio.json";

export const REVEAL_START = 185;

// ── Level Badge (top-left gold circle) ──────────────────────────────────────
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

// ── Timer ring (top-right) ───────────────────────────────────────────────────
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

// Silhouette filter matching the browser CSS on .career-portrait-card__photo (video mode):
//   brightness(0) contrast(0) brightness(0.18) contrast(3.5) saturate(0) + drop-shadows
const SILHOUETTE_FILTER =
  "brightness(0) contrast(0) brightness(0.18) contrast(3.5) saturate(0) " +
  "drop-shadow(-1px -1px 2px rgba(70,95,130,0.22)) " +
  "drop-shadow(2px 3px 4px rgba(0,0,0,0.85)) " +
  "drop-shadow(4px 8px 16px rgba(0,0,0,0.6)) " +
  "drop-shadow(6px 18px 36px rgba(0,0,0,0.4)) " +
  "drop-shadow(0 0 6px rgba(60,90,130,0.12))";

// ── Level scene ──────────────────────────────────────────────────────────────
export const Level: React.FC<{
  bg: ResolvedBackground;
  level: ResolvedLevel;
  levelNumber: number;
  language: Language;
}> = ({ level, levelNumber, language }) => {
  const frame = useDesignFrame();
  const k = useFrameScale();
  const f = (designFrames: number) => Math.round(designFrames * k);
  const revealVoice = language === "Spanish" ? level.revealVoiceEs : level.revealVoiceEn;

  // Reveal progress: 0 (question phase) → 1 (fully revealed) over 26 frames
  const revealProgress = interpolate(frame, [REVEAL_START, REVEAL_START + 26], [0, 1], {
    easing: Easing.bezier(0.22, 1, 0.36, 1),
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Badge + timer fade out as reveal begins
  const uiOpacity = interpolate(revealProgress, [0, 0.5], [1, 0], { extrapolateRight: "clamp" });

  // Two-layer crossfade: silhouette fades out, color fades in
  const silhouetteOpacity = interpolate(revealProgress, [0, 1], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const colorOpacity = interpolate(revealProgress, [0, 1], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  const photoSrc = level.photoPath ? sharedSrc(level.photoPath) : null;

  // Bar text: "?" during question, player name on reveal
  const isRevealed = revealProgress > 0.1;
  const barText = isRevealed ? level.display.toUpperCase() : "?";
  // "?" uses a large size; player name uses a smaller size to fit the pill
  const barFontSize = isRevealed ? 52 : 76;

  // Card is a square centered in the 1920×1080 frame; ~480px matches min(64vh) at 1080p
  const CARD_SIZE = 480;

  return (
    <AbsoluteFill>
      {/* Centered layout: card + reveal bar stacked vertically */}
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 28,
          }}
        >
          {/* Photo card — square with rounded corners */}
          <div
            style={{
              position: "relative",
              width: CARD_SIZE,
              height: CARD_SIZE,
              borderRadius: 24,
              overflow: "hidden",
              border: "2px solid rgba(255,255,255,0.22)",
              boxShadow: "0 24px 64px rgba(0,0,0,0.7)",
              background: "rgba(10,16,26,0.6)",
            }}
          >
            {/* Placeholder when no photo is available */}
            {!photoSrc && (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontFamily,
                  fontWeight: 800,
                  fontSize: 40,
                  color: "rgba(255,255,255,0.35)",
                  textTransform: "uppercase",
                  letterSpacing: 2,
                }}
              >
                {level.display}
              </div>
            )}

            {/* Silhouette layer (fades out on reveal) */}
            {photoSrc && (
              <Img
                src={photoSrc}
                style={{
                  position: "absolute",
                  inset: 0,
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  objectPosition: "center top",
                  opacity: silhouetteOpacity,
                  filter: SILHOUETTE_FILTER,
                }}
              />
            )}

            {/* Color layer (fades in on reveal) */}
            {photoSrc && (
              <Img
                src={photoSrc}
                style={{
                  position: "absolute",
                  inset: 0,
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  objectPosition: "center top",
                  opacity: colorOpacity,
                }}
              />
            )}
          </div>

          {/* Reveal bar — pill shape matching .career-team-quiz-card__reveal from career.css */}
          <div
            style={{
              width: CARD_SIZE,
              height: 84,
              borderRadius: 999,
              border: "1px solid rgba(255,255,255,0.3)",
              background: "rgba(8,16,28,0.85)",
              boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "0 16px",
              boxSizing: "border-box" as const,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                fontFamily,
                fontWeight: 800,
                fontSize: barFontSize,
                letterSpacing: isRevealed ? 2 : 4,
                color: COLORS.white,
                lineHeight: 1,
                textAlign: "center",
                textTransform: "uppercase",
                textShadow: "0 2px 8px rgba(0,0,0,0.6)",
                maxWidth: "100%",
                overflow: "hidden",
                whiteSpace: "nowrap",
                textOverflow: "ellipsis",
              }}
            >
              {barText}
            </div>
          </div>
        </div>
      </AbsoluteFill>

      {/* UI overlays — badge + timer */}
      <LevelBadge frame={frame} n={levelNumber} opacity={uiOpacity} />
      <Timer frame={frame} opacity={uiOpacity} />

      {/* Audio — ticking → stinger → reveal voice (same pattern as runner-2) */}
      <Sequence from={f(REVEAL_START - 30)} durationInFrames={f(30)}>
        <Audio src={staticFile(audioManifest.ticking ?? "")} volume={0.8} />
      </Sequence>
      <Sequence from={f(REVEAL_START)}>
        <Audio src={staticFile(audioManifest.stinger ?? "")} volume={0.5} />
      </Sequence>
      {revealVoice ? (
        <Sequence from={f(REVEAL_START + 5)}>
          <Audio src={staticFile(revealVoice)} volume={1} />
        </Sequence>
      ) : null}
    </AbsoluteFill>
  );
};
