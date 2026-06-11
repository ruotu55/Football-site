import React from "react";
import { AbsoluteFill, Audio, Easing, Img, interpolate, Sequence, spring, staticFile } from "remotion";
import type { ResolvedBackground } from "@shared/effects/AnimatedBackground";
import { sharedSrc, type Language } from "@shared/paths";
import { COLORS, fontFamily } from "@shared/theme";
import { DESIGN_FPS, useDesignFrame, useFrameScale } from "@shared/timing";
import { EASE_FLIP, FLIP_DURATION } from "@shared/components/PlayerSlot";
import type { ResolvedLevel } from "../level-data";
import audioManifest from "../generated/audio.json";

// ── timing ────────────────────────────────────────────────────────────────────
export const REVEAL_START = 185;

// ── LevelBadge (top-left) ─────────────────────────────────────────────────────
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

// ── Timer (top-right) ─────────────────────────────────────────────────────────
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

// ── Career Timeline ────────────────────────────────────────────────────────────
// Renders each club as a crest (inside a frosted card) + year pill, connected by
// a line. Layout: horizontally centred, mildly tilted in 3D (rotateX).

const CREST_SIZE = 130; // px — card side
const TIMELINE_GAP = 56; // px between card centres

const CareerTimeline: React.FC<{
  careerHistory: { club: string; year: string; crestPath: string | null }[];
  frame: number;
  opacity: number;
}> = ({ careerHistory, frame, opacity }) => {
  const n = careerHistory.length;
  if (!n) return null;

  const totalW = n * CREST_SIZE + (n - 1) * TIMELINE_GAP;

  // Stagger each club card pop-in
  const STAGGER = 6;
  const POP_DUR = 28;

  return (
    <div
      style={{
        position: "absolute",
        left: "50%",
        top: "50%",
        transform: `translate(-50%, -50%) perspective(1200px) rotateX(15deg)`,
        transformOrigin: "center center",
        opacity,
        width: totalW,
        height: CREST_SIZE + 56, // crest + year pill
      }}
    >
      {/* Connecting line — white outer + dark inner */}
      {n > 1 && (
        <div
          style={{
            position: "absolute",
            top: CREST_SIZE / 2 - 4,
            left: CREST_SIZE / 2,
            width: totalW - CREST_SIZE,
            height: 8,
            borderRadius: 4,
            background: "rgba(255,255,255,0.85)",
            boxShadow: "0 0 0 2px rgba(0,0,0,0.55)",
          }}
        />
      )}

      {careerHistory.map((entry, i) => {
        const pop = spring({
          frame,
          fps: DESIGN_FPS,
          config: { damping: 10, mass: 0.7, stiffness: 180 },
          delay: 10 + i * STAGGER,
          durationInFrames: POP_DUR,
        });
        const scale = interpolate(pop, [0, 1], [0.3, 1]);
        const left = i * (CREST_SIZE + TIMELINE_GAP);
        const crestSrc = sharedSrc(entry.crestPath);

        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left,
              top: 0,
              width: CREST_SIZE,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 10,
              transform: `scale(${scale})`,
              transformOrigin: "center top",
            }}
          >
            {/* Crest card */}
            <div
              style={{
                width: CREST_SIZE,
                height: CREST_SIZE,
                borderRadius: "1.6rem",
                background:
                  "linear-gradient(145deg, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0.06) 50%, rgba(120,200,255,0.10) 100%)",
                border: "1.5px solid rgba(255,255,255,0.30)",
                boxShadow: "0 12px 36px rgba(0,0,0,0.40), inset 0 1px 0 rgba(255,255,255,0.22)",
                backdropFilter: "blur(12px) saturate(1.2)",
                WebkitBackdropFilter: "blur(12px) saturate(1.2)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                overflow: "hidden",
                position: "relative",
              }}
            >
              {crestSrc ? (
                <Img
                  src={crestSrc}
                  style={{
                    maxWidth: "80%",
                    maxHeight: "80%",
                    width: "auto",
                    height: "auto",
                    objectFit: "contain",
                    filter: "drop-shadow(0 2px 8px rgba(0,0,0,0.5))",
                  }}
                />
              ) : (
                <div
                  style={{
                    fontFamily,
                    fontWeight: 800,
                    fontSize: 40,
                    color: "rgba(255,255,255,0.3)",
                    lineHeight: 1,
                  }}
                >
                  ?
                </div>
              )}
              {/* Dot on the connecting line: centred at bottom of card */}
              <div
                style={{
                  position: "absolute",
                  bottom: -6,
                  left: "50%",
                  transform: "translateX(-50%)",
                  width: 14,
                  height: 14,
                  borderRadius: "50%",
                  background: COLORS.white,
                  border: "2px solid rgba(0,0,0,0.55)",
                  zIndex: 2,
                }}
              />
            </div>

            {/* Year pill */}
            {entry.year ? (
              <div
                style={{
                  background: "#0a1118",
                  border: "1.5px solid rgba(255,255,255,0.20)",
                  borderRadius: 20,
                  padding: "4px 14px",
                  fontFamily: "'Barlow Condensed', sans-serif",
                  fontWeight: 700,
                  fontSize: 20,
                  color: COLORS.white,
                  letterSpacing: "0.04em",
                  whiteSpace: "nowrap",
                  boxShadow: "0 4px 12px rgba(0,0,0,0.35)",
                }}
              >
                {entry.year}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
};

// ── Silhouette / Reveal Photo ──────────────────────────────────────────────────
// Dark during question; transitions to full-colour + player name on reveal.

const PORTRAIT_SIZE = 340; // px

const PlayerPortrait: React.FC<{
  photoSrc: string | null;
  playerName: string;
  display: string;
  revealProgress: number;
  frame: number;
}> = ({ photoSrc, playerName, display, revealProgress, frame }) => {
  // silhouette filter: dark + slightly glowing aura
  const silhouetteFilter =
    "brightness(0) contrast(1.35) " +
    "drop-shadow(0 0 8px rgba(236,255,250,0.72)) " +
    "drop-shadow(0 0 42px rgba(147,233,211,0.48))";
  const colorFilter = "brightness(1) contrast(1) saturate(1) drop-shadow(0 8px 20px rgba(0,0,0,0.5))";

  const silhouetteOpacity = interpolate(revealProgress, [0, 1], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const colorOpacity = interpolate(revealProgress, [0, 1], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  // Pop-in spring for the silhouette
  const pop = spring({ frame, fps: DESIGN_FPS, config: { damping: 12, mass: 0.8, stiffness: 160 }, durationInFrames: 30 });
  const entryScale = interpolate(pop, [0, 1], [0.6, 1]);

  // Reveal name: all-but-last-word white small + last word big red
  const words = (playerName || display || "").trim().toUpperCase().split(/\s+/);
  const firstPart = words.slice(0, -1).join(" ");
  const lastWord = words[words.length - 1] ?? "";
  const nameOpacity = interpolate(revealProgress, [0.25, 0.75], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const nameSlide = interpolate(revealProgress, [0.25, 0.75], [24, 0], {
    easing: Easing.bezier(0.22, 1, 0.36, 1),
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div
      style={{
        position: "absolute",
        bottom: 72,
        left: "50%",
        transform: `translateX(-50%) scale(${entryScale})`,
        transformOrigin: "bottom center",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 0,
      }}
    >
      {/* Photo area */}
      <div style={{ position: "relative", width: PORTRAIT_SIZE, height: PORTRAIT_SIZE }}>
        {photoSrc ? (
          <>
            {/* Silhouetted version */}
            <div style={{ position: "absolute", inset: 0, opacity: silhouetteOpacity, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
              <Img
                src={photoSrc}
                style={{
                  maxWidth: "100%",
                  maxHeight: "100%",
                  objectFit: "contain",
                  objectPosition: "center bottom",
                  filter: silhouetteFilter,
                  transform: "rotateX(-15deg)",
                  transformOrigin: "bottom center",
                }}
              />
            </div>
            {/* Full-colour version */}
            <div style={{ position: "absolute", inset: 0, opacity: colorOpacity, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
              <Img
                src={photoSrc}
                style={{
                  maxWidth: "100%",
                  maxHeight: "100%",
                  objectFit: "contain",
                  objectPosition: "center bottom",
                  filter: colorFilter,
                }}
              />
            </div>
          </>
        ) : (
          /* No photo: question mark silhouette */
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              opacity: silhouetteOpacity,
            }}
          >
            <div
              style={{
                fontFamily,
                fontWeight: 800,
                fontSize: 260,
                lineHeight: 1,
                color: "rgba(255,255,255,0.18)",
                filter: "drop-shadow(0 4px 20px rgba(0,0,0,0.5))",
              }}
            >
              ?
            </div>
          </div>
        )}
      </div>

      {/* Reveal name badge */}
      <div
        style={{
          opacity: nameOpacity,
          transform: `translateY(${nameSlide}px)`,
          textAlign: "center",
          padding: "8px 28px 10px",
          borderRadius: 18,
          background: "linear-gradient(145deg, rgba(8,14,22,0.82) 0%, rgba(14,22,34,0.74) 100%)",
          border: "1.5px solid rgba(255,255,255,0.18)",
          backdropFilter: "blur(14px) saturate(1.2)",
          WebkitBackdropFilter: "blur(14px) saturate(1.2)",
          boxShadow: "0 8px 28px rgba(0,0,0,0.45)",
          minWidth: 200,
        }}
      >
        {firstPart ? (
          <div
            style={{
              fontFamily: "'Barlow Condensed', sans-serif",
              fontWeight: 700,
              fontSize: 28,
              lineHeight: 1,
              color: COLORS.white,
              letterSpacing: "0.06em",
              textShadow: "0 2px 8px rgba(0,0,0,0.8)",
            }}
          >
            {firstPart}
          </div>
        ) : null}
        <div
          style={{
            fontFamily: "'Barlow Condensed', sans-serif",
            fontWeight: 900,
            fontSize: firstPart ? 52 : 58,
            lineHeight: 0.95,
            color: "#ef4444",
            letterSpacing: "0.02em",
            textShadow: "0 4px 16px rgba(0,0,0,0.8), 0 0 12px rgba(239,68,68,0.35)",
          }}
        >
          {lastWord}
        </div>
      </div>
    </div>
  );
};

// ── Main Level component ───────────────────────────────────────────────────────
export const Level: React.FC<{
  bg: ResolvedBackground;
  level: ResolvedLevel;
  levelNumber: number;
  language: Language;
}> = ({ bg: _bg, level, levelNumber, language }) => {
  const frame = useDesignFrame();
  const k = useFrameScale();
  const f = (designFrames: number) => Math.round(designFrames * k);
  const revealVoice = language === "Spanish" ? level.revealVoiceEs : level.revealVoiceEn;

  const revealProgress = interpolate(frame, [REVEAL_START, REVEAL_START + FLIP_DURATION], [0, 1], {
    easing: EASE_FLIP,
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const uiOpacity = interpolate(revealProgress, [0, 0.5], [1, 0], { extrapolateRight: "clamp" });
  // Timeline slides up a bit on reveal
  const timelineY = interpolate(revealProgress, [0, 1], [0, -40], {
    easing: Easing.bezier(0.22, 1, 0.36, 1),
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const photoSrc = sharedSrc(level.photoPath);

  return (
    <AbsoluteFill>
      {/* Career timeline — sits in the upper ~55% of the frame */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: "58%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transform: `translateY(${timelineY}px)`,
        }}
      >
        <CareerTimeline
          careerHistory={level.careerHistory}
          frame={frame}
          opacity={1}
        />
      </div>

      {/* Player silhouette / reveal portrait — centred in the lower area */}
      <PlayerPortrait
        photoSrc={photoSrc}
        playerName={level.playerName}
        display={level.display}
        revealProgress={revealProgress}
        frame={frame}
      />

      {/* ── UI widgets ───────────────────────────────────────────────────────── */}
      <LevelBadge frame={frame} n={levelNumber} opacity={uiOpacity} />
      <Timer frame={frame} opacity={uiOpacity} />

      {/* ── Audio ────────────────────────────────────────────────────────────── */}
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
