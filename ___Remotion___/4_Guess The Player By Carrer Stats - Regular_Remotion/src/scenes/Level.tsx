import React from "react";
import { AbsoluteFill, Audio, Img, interpolate, Sequence, spring, staticFile } from "remotion";
import type { ResolvedBackground } from "@shared/effects/AnimatedBackground";
import { sharedSrc, type Language } from "@shared/paths";
import { fontFamily } from "@shared/theme";
import { DESIGN_FPS, useDesignFrame, useFrameScale } from "@shared/timing";
import { FLIP_DURATION, EASE_FLIP } from "@shared/components/PlayerSlot";
import type { ResolvedLevel } from "../level-data";
import audioManifest from "../generated/audio.json";

// ── timing ────────────────────────────────────────────────────────────────────
export const REVEAL_START = 185;

// ── Position bucket → translated label ────────────────────────────────────────
const translatePosition = (pos: string, language: Language): string => {
  if (!pos) return pos;
  if (language !== "Spanish") return pos;
  const map: Record<string, string> = {
    Goalkeeper: "Portero",
    Defender: "Defensa",
    Midfielder: "Centrocampista",
    Forward: "Delantero",
  };
  return map[pos] ?? pos;
};

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
const COLORS_ACCENT = "#f7a81b";
const Timer: React.FC<{ frame: number; opacity: number }> = ({ frame, opacity }) => {
  const T_START = 14;
  const T_END = REVEAL_START;
  const remain = interpolate(frame, [T_START, T_END], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const secs = Math.max(0, Math.ceil((T_END - Math.max(frame, T_START)) / DESIGN_FPS));
  const R = 66;
  const C = 2 * Math.PI * R;
  const pop = spring({ frame, fps: DESIGN_FPS, config: { damping: 12, mass: 0.7, stiffness: 160 }, durationInFrames: 26 });
  const scale = interpolate(pop, [0, 1], [0.2, 1]);
  const ringColor = remain < 0.16 ? "#ff4136" : COLORS_ACCENT;
  return (
    <div style={{ position: "absolute", top: 34, right: 40, width: 162, height: 162, opacity, transform: `scale(${scale})`, transformOrigin: "top right" }}>
      <svg width={162} height={162} style={{ display: "block", filter: "drop-shadow(0 14px 28px rgba(0,0,0,0.5))" }}>
        <circle cx={81} cy={81} r={R} fill="rgba(12,16,22,0.66)" stroke="rgba(255,255,255,0.16)" strokeWidth={14} />
        <circle
          cx={81} cy={81} r={R} fill="none"
          stroke={ringColor} strokeWidth={14} strokeLinecap="round"
          strokeDasharray={C} strokeDashoffset={C * (1 - remain)}
          transform="rotate(-90 81 81)"
        />
      </svg>
      <div
        style={{
          position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
          fontFamily, fontWeight: 800, fontSize: 72, color: "#fff", textShadow: "0 2px 6px rgba(0,0,0,0.6)",
        }}
      >
        {secs}
      </div>
    </div>
  );
};

// ── Stat card design constants ─────────────────────────────────────────────────
// Navy colours from career.css:
//   header bg: rgba(0,30,80,0.72) → #001e50 deep
//   value bg:  rgba(10,25,50,0.55)
//   card border: rgba(255,255,255,0.12)
// We render these as standalone frosted cards (no backdrop-filter in Remotion headless,
// but the gradient + border gives the same identity).

const CARD_BG_HEAD = "linear-gradient(180deg, rgba(0,30,80,0.88) 0%, rgba(0,18,55,0.80) 50%, rgba(0,12,42,0.88) 100%)";
const CARD_BG_VALUE = "linear-gradient(180deg, rgba(10,25,50,0.70) 0%, rgba(5,15,35,0.82) 100%)";
const CARD_BORDER = "1px solid rgba(100,180,255,0.22)";
const HEAD_COLOR = "#b8c8dc";
const VALUE_COLOR = "#c8d4e4";

// GAP between cards
const GAP = 12;

// Sizes for the 3-column layout centred in 1920×1080
// Left col: GAMES + POSITION stacked
// Center col: CLUBS grid (tall)
// Right col: GOALS+ASSISTS (or GK-specific) stacked

const SIDE_CARD_W = 240;
const SIDE_CARD_H = 172; // each side card; two stacked = 344 + gap = 356
const CENTER_W = 420;
const CLUSTER_H = SIDE_CARD_H * 2 + GAP; // 356

// ── Single stat card (label header + value) ───────────────────────────────────
const StatCard: React.FC<{
  label: string;
  value: React.ReactNode;
  width: number;
  height: number;
}> = ({ label, value, width, height }) => (
  <div
    style={{
      width,
      height,
      borderRadius: "0.75rem",
      overflow: "hidden",
      border: CARD_BORDER,
      boxShadow: "0 4px 24px rgba(0,0,0,0.45), 0 0 0 1px rgba(255,255,255,0.08), inset 0 1px 0 rgba(255,255,255,0.12)",
      display: "flex",
      flexDirection: "column",
      flexShrink: 0,
    }}
  >
    {/* Header */}
    <div
      style={{
        flex: "0 0 52px",
        background: CARD_BG_HEAD,
        borderBottom: "1px solid rgba(100,180,255,0.15)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "Inter, 'Arial Black', 'Segoe UI', Arial, sans-serif",
        fontWeight: 800,
        fontSize: 20,
        letterSpacing: "0.06em",
        textTransform: "uppercase" as const,
        color: HEAD_COLOR,
        textShadow: "0 0 6px rgba(100,180,255,0.25), 0 1px 3px rgba(0,0,0,0.5)",
        padding: "0 0.5rem",
        textAlign: "center" as const,
      }}
    >
      {label}
    </div>
    {/* Value */}
    <div
      style={{
        flex: 1,
        background: CARD_BG_VALUE,
        borderTop: "1px solid rgba(100,180,255,0.1)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "Inter, 'Arial Black', 'Segoe UI', Arial, sans-serif",
        fontWeight: 900,
        fontSize: 52,
        lineHeight: 1.05,
        color: VALUE_COLOR,
        textShadow: "0 0 6px rgba(100,200,255,0.2), 0 1px 3px rgba(0,0,0,0.4)",
        padding: "4px 8px",
        textAlign: "center" as const,
        overflow: "hidden",
        boxSizing: "border-box",
      }}
    >
      {value}
    </div>
  </div>
);

// ── Clubs grid card ────────────────────────────────────────────────────────────
const ClubsCard: React.FC<{
  clubs: ResolvedLevel["clubs"];
  label: string;
  width: number;
  height: number;
}> = ({ clubs, label, width, height }) => {
  // Determine grid layout: up to 2 rows
  const n = clubs.length;
  let topRow: ResolvedLevel["clubs"];
  let bottomRow: ResolvedLevel["clubs"];
  if (n <= 4) {
    topRow = clubs;
    bottomRow = [];
  } else {
    const topMap: Record<number, number> = { 5: 3, 6: 3, 7: 4, 8: 4 };
    const top = topMap[n] ?? Math.ceil(n / 2);
    topRow = clubs.slice(0, top);
    bottomRow = clubs.slice(top);
  }

  const crestSize = n <= 4 ? 68 : 54;
  const renderRow = (row: ResolvedLevel["clubs"]) => (
    <div
      style={{
        display: "flex",
        flexDirection: "row" as const,
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        flexWrap: "nowrap" as const,
      }}
    >
      {row.map((c, i) => {
        const src = sharedSrc(c.crestPath);
        return (
          <div
            key={i}
            style={{
              width: crestSize,
              height: crestSize,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            {src ? (
              <Img
                src={src}
                style={{
                  maxWidth: "100%",
                  maxHeight: "100%",
                  objectFit: "contain",
                  filter: "drop-shadow(0 2px 6px rgba(0,0,0,0.5))",
                }}
              />
            ) : (
              <div
                style={{
                  width: crestSize,
                  height: crestSize,
                  borderRadius: "50%",
                  background: "rgba(255,255,255,0.08)",
                  border: "1px solid rgba(255,255,255,0.2)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontFamily,
                  fontSize: 20,
                  color: "rgba(255,255,255,0.4)",
                }}
              >
                ?
              </div>
            )}
          </div>
        );
      })}
    </div>
  );

  return (
    <div
      style={{
        width,
        height,
        borderRadius: "0.75rem",
        overflow: "hidden",
        border: CARD_BORDER,
        boxShadow: "0 4px 24px rgba(0,0,0,0.45), 0 0 0 1px rgba(255,255,255,0.08), inset 0 1px 0 rgba(255,255,255,0.12)",
        display: "flex",
        flexDirection: "column" as const,
        flexShrink: 0,
      }}
    >
      {/* Header */}
      <div
        style={{
          flex: "0 0 52px",
          background: CARD_BG_HEAD,
          borderBottom: "1px solid rgba(100,180,255,0.15)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "Inter, 'Arial Black', 'Segoe UI', Arial, sans-serif",
          fontWeight: 800,
          fontSize: 20,
          letterSpacing: "0.06em",
          textTransform: "uppercase" as const,
          color: HEAD_COLOR,
          textShadow: "0 0 6px rgba(100,180,255,0.25), 0 1px 3px rgba(0,0,0,0.5)",
        }}
      >
        {label}
      </div>
      {/* Crests grid */}
      <div
        style={{
          flex: 1,
          background: CARD_BG_VALUE,
          borderTop: "1px solid rgba(100,180,255,0.1)",
          display: "flex",
          flexDirection: "column" as const,
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          padding: "8px 12px",
          boxSizing: "border-box",
        }}
      >
        {renderRow(topRow)}
        {bottomRow.length > 0 ? renderRow(bottomRow) : null}
      </div>
    </div>
  );
};

// ── Portrait panel (silhouette → photo reveal, left of stats) ─────────────────
const PORTRAIT_W = 260;
const PORTRAIT_H = CLUSTER_H; // same height as the 3-col cluster

const PortraitPanel: React.FC<{
  photoSrc: string | null;
  playerName: string;
  display: string;
  revealProgress: number;
  flagSrc: string | null;
  country: string;
}> = ({ photoSrc, playerName, display, revealProgress, flagSrc, country }) => {
  const silhouetteFilter =
    "brightness(0) contrast(0) brightness(0.18) contrast(3.5) saturate(0) " +
    "drop-shadow(-1px -1px 2px rgba(70,95,130,0.22)) " +
    "drop-shadow(2px 3px 4px rgba(0,0,0,0.85)) " +
    "drop-shadow(4px 8px 16px rgba(0,0,0,0.6)) " +
    "drop-shadow(6px 18px 36px rgba(0,0,0,0.4))";
  const colorFilter = "brightness(1) contrast(1) saturate(1) drop-shadow(0 8px 20px rgba(0,0,0,0.5))";

  const silhouetteOpacity = interpolate(revealProgress, [0, 1], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const colorOpacity = interpolate(revealProgress, [0, 1], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  const words = (playerName || display || "").trim().toUpperCase().split(/\s+/);
  const firstPart = words.slice(0, -1).join(" ");
  const lastWord = words[words.length - 1] ?? "";
  const nameOpacity = interpolate(revealProgress, [0.3, 0.8], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const questionOpacity = silhouetteOpacity;

  return (
    <div
      style={{
        width: PORTRAIT_W,
        height: PORTRAIT_H,
        borderRadius: "1.4rem",
        border: "2px solid rgba(6,8,12,0.88)",
        background: "linear-gradient(155deg, rgba(32,42,58,0.52) 0%, rgba(24,32,46,0.44) 48%, rgba(18,26,38,0.38) 100%)",
        boxShadow: "0 12px 36px rgba(0,0,0,0.34), 0 4px 12px rgba(0,0,0,0.16), inset 0 1px 0 rgba(140,180,220,0.14)",
        display: "flex",
        flexDirection: "column" as const,
        alignItems: "center",
        justifyContent: "flex-start",
        overflow: "hidden",
        position: "relative" as const,
        flexShrink: 0,
      }}
    >
      {/* Flag badge — top-right corner, small */}
      {flagSrc ? (
        <div
          style={{
            position: "absolute",
            top: 10,
            right: 10,
            width: 52,
            height: 34,
            borderRadius: 4,
            overflow: "hidden",
            border: "1.5px solid rgba(255,255,255,0.3)",
            boxShadow: "0 2px 8px rgba(0,0,0,0.5)",
            zIndex: 10,
          }}
        >
          <Img
            src={flagSrc}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        </div>
      ) : country ? (
        <div
          style={{
            position: "absolute",
            top: 10,
            right: 10,
            fontSize: 12,
            color: "rgba(255,255,255,0.5)",
            fontFamily,
            fontWeight: 700,
            zIndex: 10,
          }}
        >
          {country}
        </div>
      ) : null}

      {/* Silhouette layer */}
      {photoSrc ? (
        <div
          style={{
            position: "absolute", inset: 0, display: "flex", alignItems: "center",
            justifyContent: "center", opacity: silhouetteOpacity,
          }}
        >
          <Img
            src={photoSrc}
            style={{
              width: "82%", height: "75%", objectFit: "contain",
              objectPosition: "center center", marginTop: "5%",
              filter: silhouetteFilter,
            }}
          />
        </div>
      ) : (
        <div
          style={{
            position: "absolute", inset: 0, display: "flex", alignItems: "center",
            justifyContent: "center", opacity: silhouetteOpacity,
          }}
        >
          <div
            style={{
              fontFamily, fontWeight: 800, fontSize: 180,
              color: "rgba(255,255,255,0.15)", lineHeight: 1,
              textShadow: "0 4px 20px rgba(0,0,0,0.5)",
            }}
          >
            ?
          </div>
        </div>
      )}

      {/* Full-colour photo layer */}
      {photoSrc ? (
        <div
          style={{
            position: "absolute", inset: 0, display: "flex", alignItems: "center",
            justifyContent: "center", opacity: colorOpacity,
          }}
        >
          <Img
            src={photoSrc}
            style={{
              width: "82%", height: "75%", objectFit: "contain",
              objectPosition: "center center", marginTop: "5%",
              filter: colorFilter,
            }}
          />
        </div>
      ) : null}

      {/* Bottom name bar */}
      <div
        style={{
          position: "absolute",
          bottom: 0, left: 0, right: 0,
          minHeight: 76,
          borderTop: "1px solid rgba(255,255,255,0.18)",
          background: "linear-gradient(145deg, rgba(14,20,30,0.58) 0%, rgba(10,16,26,0.5) 45%, rgba(30,60,90,0.32) 100%)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "0.45rem 0.7rem",
          boxSizing: "border-box",
        }}
      >
        {/* "?" before reveal */}
        <div
          style={{
            fontFamily, fontWeight: 800, fontSize: 60, color: "#fff",
            lineHeight: 1, opacity: questionOpacity, position: "absolute",
          }}
        >
          ?
        </div>
        {/* Player name — fades in on reveal */}
        <div
          style={{
            opacity: nameOpacity,
            textAlign: "center" as const,
            position: "absolute",
            left: 8,
            right: 8,
          }}
        >
          {firstPart ? (
            <div
              style={{
                fontFamily: "'Barlow Condensed', sans-serif",
                fontWeight: 800, fontSize: 22, lineHeight: 1,
                color: "#ffffff", letterSpacing: "0.06em",
                textShadow: "0 4px 12px rgba(0,0,0,0.8)",
              }}
            >
              {firstPart}
            </div>
          ) : null}
          <div
            style={{
              fontFamily: "'Barlow Condensed', sans-serif",
              fontWeight: 900, fontSize: firstPart ? 40 : 46,
              lineHeight: 0.92, color: "#ef4444",
              letterSpacing: "0.03em",
              textShadow: "0 4px 16px rgba(0,0,0,0.8), 0 0 12px rgba(239,68,68,0.3)",
            }}
          >
            {lastWord}
          </div>
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

  const photoSrc = sharedSrc(level.photoPath);
  const flagSrc = sharedSrc(level.countryFlagPath);

  // Labels
  const gamesLabel = language === "Spanish" ? "PARTIDOS" : "GAMES";
  const posLabel = language === "Spanish" ? "POSICIÓN" : "POSITION";
  const clubsLabel = language === "Spanish" ? "CLUBES" : "CLUBS";
  const topRightLabel = level.isGK
    ? (language === "Spanish" ? "GOL. ENCAJADOS" : "GOALS CONCEDED")
    : (language === "Spanish" ? "GOLES" : "GOALS");
  const botRightLabel = level.isGK
    ? (language === "Spanish" ? "PORTERÍAS 0" : "CLEAN SHEETS")
    : (language === "Spanish" ? "ASISTENCIAS" : "ASSISTS");

  const topRightValue = level.isGK ? level.goalsConceded : level.goals;
  const botRightValue = level.isGK ? level.cleanSheets : level.assists;

  const positionDisplay = translatePosition(level.position, language);

  // Total cluster layout:
  // [Portrait | gap | LeftCol | gap | ClubsCard | gap | RightCol]
  const totalW =
    PORTRAIT_W + GAP +
    SIDE_CARD_W + GAP +
    CENTER_W + GAP +
    SIDE_CARD_W;

  return (
    <AbsoluteFill>
      {/* ── Centred layout ────────────────────────────────────────────────── */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          transform: `translate(-50%, -50%)`,
          display: "flex",
          flexDirection: "row" as const,
          alignItems: "center",
          gap: GAP,
          width: totalW,
          height: CLUSTER_H,
        }}
      >
        {/* Portrait: silhouette → photo reveal */}
        <PortraitPanel
          photoSrc={photoSrc}
          playerName={level.playerName}
          display={level.display}
          revealProgress={revealProgress}
          flagSrc={flagSrc}
          country={level.country}
        />

        {/* Left column: GAMES + POSITION */}
        <div style={{ display: "flex", flexDirection: "column" as const, gap: GAP, flexShrink: 0 }}>
          <StatCard label={gamesLabel} value={String(level.games ?? "—")} width={SIDE_CARD_W} height={SIDE_CARD_H} />
          <StatCard
            label={posLabel}
            value={
              <span
                style={{
                  fontSize: positionDisplay.length > 10 ? 24 : positionDisplay.length > 7 ? 30 : 44,
                  lineHeight: 1.1,
                  textAlign: "center" as const,
                  whiteSpace: "nowrap" as const,
                }}
              >
                {positionDisplay || "—"}
              </span>
            }
            width={SIDE_CARD_W}
            height={SIDE_CARD_H}
          />
        </div>

        {/* Center: CLUBS grid */}
        <ClubsCard
          clubs={level.clubs}
          label={clubsLabel}
          width={CENTER_W}
          height={CLUSTER_H}
        />

        {/* Right column: GOALS+ASSISTS or GK stats */}
        <div style={{ display: "flex", flexDirection: "column" as const, gap: GAP, flexShrink: 0 }}>
          <StatCard label={topRightLabel} value={String(topRightValue ?? "—")} width={SIDE_CARD_W} height={SIDE_CARD_H} />
          <StatCard label={botRightLabel} value={String(botRightValue ?? "—")} width={SIDE_CARD_W} height={SIDE_CARD_H} />
        </div>
      </div>

      {/* ── UI widgets ────────────────────────────────────────────────────── */}
      <LevelBadge frame={frame} n={levelNumber} opacity={uiOpacity} />
      <Timer frame={frame} opacity={uiOpacity} />

      {/* ── Audio ─────────────────────────────────────────────────────────── */}
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
