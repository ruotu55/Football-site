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

// ── Position abbreviation: EN → ES translation (matches browser runner's POSITION_ABBREV_EN_TO_ES)
const POSITION_ABBREV_EN_TO_ES: Record<string, string> = {
  GK: "POR",   // Portero
  CB: "DFC",   // Defensa Central
  LB: "LTI",   // Lateral Izquierdo
  LWB: "CAI",  // Carrilero Izquierdo
  RB: "LTD",   // Lateral Derecho
  RWB: "CAD",  // Carrilero Derecho
  CDM: "MCD",  // Mediocentro Defensivo
  CM: "MC",    // Mediocentro
  CAM: "MCO",  // Mediocentro Ofensivo
  LM: "MI",    // Mediocampista Izquierdo
  RM: "MD",    // Mediocampista Derecho
  LW: "EI",    // Extremo Izquierdo
  RW: "ED",    // Extremo Derecho
  CF: "MP",    // Mediapunta
  ST: "DC",    // Delantero Centro
};

const translatePosition = (abbrev: string, language: Language): string => {
  if (!abbrev) return abbrev;
  if (language !== "Spanish") return abbrev;
  return POSITION_ABBREV_EN_TO_ES[abbrev] ?? abbrev;
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

// ── Frosted-glass param card ─────────────────────────────────────────────────
const cardStyle: React.CSSProperties = {
  aspectRatio: "1",
  borderRadius: "2.3rem",
  overflow: "hidden",
  background:
    "linear-gradient(145deg, rgba(255,255,255,0.14) 0%, rgba(255,255,255,0.05) 45%, rgba(120,200,255,0.08) 100%)",
  border: "1px solid rgba(255,255,255,0.28)",
  boxShadow:
    "0 10px 40px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.2), inset 0 -1px 0 rgba(0,0,0,0.12)",
  backdropFilter: "blur(14px) saturate(1.25)",
  WebkitBackdropFilter: "blur(14px) saturate(1.25)",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  padding: "0.45rem",
  boxSizing: "border-box",
};

const CARD_SIZE = 220; // px, design size for 1920×1080

// Club card — crest centered, object-fit: contain
const ClubCard: React.FC<{ src: string | null }> = ({ src }) => (
  <div style={{ ...cardStyle, width: CARD_SIZE, height: CARD_SIZE, padding: "0.2rem" }}>
    {src ? (
      <Img
        src={src}
        style={{
          maxWidth: "80%",
          maxHeight: "80%",
          width: "auto",
          height: "auto",
          objectFit: "contain",
          filter: "drop-shadow(0 2px 10px rgba(0,0,0,0.4))",
          transform: "scale(1.1)",
        }}
      />
    ) : (
      <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 32, fontFamily }}>?</div>
    )}
  </div>
);

// Position card — big abbreviated text
const PositionCard: React.FC<{ position: string; language: Language }> = ({ position, language }) => {
  const abbrev = translatePosition(position, language);
  // Shorter abbrevs (2 chars) can be bigger than longer ones (3 chars)
  const fontSize = abbrev.length <= 2 ? 120 : abbrev.length === 3 ? 96 : 72;
  return (
    <div style={{ ...cardStyle, width: CARD_SIZE, height: CARD_SIZE, padding: "0.5rem 0.35rem" }}>
      <div
        style={{
          fontFamily: "'Barlow Condensed', sans-serif",
          fontWeight: 800,
          fontSize,
          color: "#fff",
          lineHeight: 1,
          textShadow: "0 8px 24px rgba(0,0,0,0.45)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flex: 1,
        }}
      >
        {abbrev || "—"}
      </div>
    </div>
  );
};

// Country/flag card — flag fills the card (object-fit: cover)
const CountryCard: React.FC<{ src: string | null; country: string }> = ({ src, country }) => (
  <div style={{ ...cardStyle, width: CARD_SIZE, height: CARD_SIZE, padding: 0, position: "relative" }}>
    {src ? (
      <Img
        src={src}
        style={{
          display: "block",
          width: "100%",
          height: "100%",
          objectFit: "cover",
          borderRadius: "inherit",
        }}
      />
    ) : (
      <div
        style={{
          color: "rgba(255,255,255,0.5)",
          fontSize: 22,
          fontFamily,
          fontWeight: 700,
          textAlign: "center",
          padding: "1rem",
        }}
      >
        {country || "—"}
      </div>
    )}
  </div>
);

// Age card — large number + "YEARS" / "AÑOS" below
const AgeCard: React.FC<{ age: number | string; language: Language }> = ({ age, language }) => {
  const ageNum = Number(age);
  const unit = language === "Spanish"
    ? ageNum === 1 ? "año" : "años"
    : ageNum === 1 ? "year old" : "years old";
  return (
    <div style={{ ...cardStyle, width: CARD_SIZE, height: CARD_SIZE, padding: "0.25rem" }}>
      <div
        style={{
          fontFamily: "'Barlow Condensed', 'Inter', sans-serif",
          fontWeight: 800,
          lineHeight: 1,
          color: "#fff",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 0,
        }}
      >
        <span style={{ fontSize: 100, lineHeight: 1, textShadow: "0 10px 32px rgba(0,0,0,0.5)" }}>
          {age ?? "?"}
        </span>
        <span
          style={{
            fontSize: 28,
            lineHeight: 1,
            opacity: 0.9,
            marginTop: -4,
            textShadow: "0 4px 12px rgba(0,0,0,0.5)",
            textTransform: "uppercase",
            letterSpacing: "0.04em",
          }}
        >
          {unit}
        </span>
      </div>
    </div>
  );
};

// ── Portrait card (tall, spans both grid rows, center column) ──────────────────
const PORTRAIT_W = CARD_SIZE;
const PORTRAIT_H = CARD_SIZE * 2 + 24; // two card heights + gap between cards
const GAP = 24; // px between cards in the cluster grid

const PortraitCard: React.FC<{
  photoSrc: string | null;
  playerName: string;
  display: string;
  revealProgress: number;
}> = ({ photoSrc, playerName, display, revealProgress }) => {
  // photo: silhouetted during question, full-color on reveal
  const silhouetteFilter =
    "brightness(0) contrast(0) brightness(0.18) contrast(3.5) saturate(0) " +
    "drop-shadow(-1px -1px 2px rgba(70,95,130,0.22)) " +
    "drop-shadow(2px 3px 4px rgba(0,0,0,0.85)) " +
    "drop-shadow(4px 8px 16px rgba(0,0,0,0.6)) " +
    "drop-shadow(6px 18px 36px rgba(0,0,0,0.4))";
  const colorFilter = "brightness(1) contrast(1) saturate(1) drop-shadow(0 8px 20px rgba(0,0,0,0.5))";

  // Interpolate filter brightness — use opacity trick: cross-fade via two stacked divs
  const silhouetteOpacity = interpolate(revealProgress, [0, 1], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const colorOpacity = interpolate(revealProgress, [0, 1], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  // Reveal name — all-but-last word in small white, last word big red
  const words = (playerName || display || "").trim().toUpperCase().split(/\s+/);
  const firstPart = words.slice(0, -1).join(" ");
  const lastWord = words[words.length - 1] ?? "";
  const nameOpacity = interpolate(revealProgress, [0.3, 0.8], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <div
      style={{
        width: PORTRAIT_W,
        height: PORTRAIT_H,
        borderRadius: "2.3rem",
        border: "2px solid rgba(6,8,12,0.88)",
        background: "linear-gradient(155deg, rgba(32,42,58,0.52) 0%, rgba(24,32,46,0.44) 48%, rgba(18,26,38,0.38) 100%)",
        backdropFilter: "blur(14px) saturate(1.12)",
        WebkitBackdropFilter: "blur(14px) saturate(1.12)",
        boxShadow: "0 12px 36px rgba(0,0,0,0.34), 0 4px 12px rgba(0,0,0,0.16), inset 0 1px 0 rgba(140,180,220,0.14)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "flex-start",
        overflow: "hidden",
        position: "relative",
        flexShrink: 0,
      }}
    >
      {/* Photo layer — silhouetted (question) */}
      {photoSrc ? (
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
          <Img
            src={photoSrc}
            style={{
              width: "82%",
              height: "82%",
              objectFit: "contain",
              objectPosition: "center center",
              marginTop: "5%",
              filter: silhouetteFilter,
            }}
          />
        </div>
      ) : (
        // No photo — show question mark silhouette
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
              fontSize: 200,
              color: "rgba(255,255,255,0.15)",
              lineHeight: 1,
              textShadow: "0 4px 20px rgba(0,0,0,0.5)",
            }}
          >
            ?
          </div>
        </div>
      )}

      {/* Photo layer — full-colour (reveal) */}
      {photoSrc ? (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            opacity: colorOpacity,
          }}
        >
          <Img
            src={photoSrc}
            style={{
              width: "82%",
              height: "82%",
              objectFit: "contain",
              objectPosition: "center center",
              marginTop: "5%",
              filter: colorFilter,
            }}
          />
        </div>
      ) : null}

      {/* Bottom mystery bar — shows "?" before reveal, name after */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          minHeight: 80,
          borderTop: "1px solid rgba(255,255,255,0.18)",
          background:
            "linear-gradient(145deg, rgba(14,20,30,0.58) 0%, rgba(10,16,26,0.5) 45%, rgba(30,60,90,0.32) 100%)",
          backdropFilter: "blur(14px) saturate(1.25)",
          WebkitBackdropFilter: "blur(14px) saturate(1.25)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "0.5rem 0.75rem",
          boxSizing: "border-box",
        }}
      >
        {/* "?" — shown before reveal */}
        <div
          style={{
            fontFamily,
            fontWeight: 800,
            fontSize: 64,
            color: "#fff",
            lineHeight: 1,
            opacity: silhouetteOpacity,
            position: "absolute",
          }}
        >
          ?
        </div>

        {/* Player name — fades in on reveal */}
        <div
          style={{
            opacity: nameOpacity,
            textAlign: "center",
            position: "absolute",
            left: 8,
            right: 8,
          }}
        >
          {firstPart ? (
            <div
              style={{
                fontFamily: "'Barlow Condensed', sans-serif",
                fontWeight: 800,
                fontSize: 26,
                lineHeight: 1,
                color: "#ffffff",
                letterSpacing: "0.06em",
                textShadow: "0 4px 12px rgba(0,0,0,0.8)",
              }}
            >
              {firstPart}
            </div>
          ) : null}
          <div
            style={{
              fontFamily: "'Barlow Condensed', sans-serif",
              fontWeight: 900,
              fontSize: firstPart ? 46 : 52,
              lineHeight: 0.92,
              color: "#ef4444",
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

  // Cluster: center it in the 1920×1080 canvas
  // Layout: 3-column grid → [left 2 cards | portrait | right 2 cards]
  // Column widths: CARD_SIZE | PORTRAIT_W | CARD_SIZE, column-gap GAP
  const clusterW = CARD_SIZE + GAP + PORTRAIT_W + GAP + CARD_SIZE; // 220+24+220+24+220 = 708
  const clusterH = PORTRAIT_H; // 464

  const photoSrc = sharedSrc(level.photoPath);
  const clubSrc = sharedSrc(level.clubCrestPath);
  const flagSrc = sharedSrc(level.countryFlagPath);

  return (
    <AbsoluteFill>
      {/* ── 3-column cluster centred in the frame ─────────────────────────── */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          transform: `translate(-50%, -50%)`,
          width: clusterW,
          height: clusterH,
          display: "grid",
          gridTemplateColumns: `${CARD_SIZE}px ${PORTRAIT_W}px ${CARD_SIZE}px`,
          gridTemplateRows: `${CARD_SIZE}px ${CARD_SIZE}px`,
          gap: GAP,
          alignItems: "start",
        }}
      >
        {/* Left col, row 1: CLUB */}
        <div style={{ gridColumn: 1, gridRow: 1 }}>
          <ClubCard src={clubSrc} />
        </div>
        {/* Left col, row 2: POSITION */}
        <div style={{ gridColumn: 1, gridRow: 2 }}>
          <PositionCard position={level.position} language={language} />
        </div>
        {/* Center col, rows 1+2: PORTRAIT (tall) */}
        <div style={{ gridColumn: 2, gridRow: "1 / span 2" }}>
          <PortraitCard
            photoSrc={photoSrc}
            playerName={level.playerName}
            display={level.display}
            revealProgress={revealProgress}
          />
        </div>
        {/* Right col, row 1: COUNTRY */}
        <div style={{ gridColumn: 3, gridRow: 1 }}>
          <CountryCard src={flagSrc} country={level.country} />
        </div>
        {/* Right col, row 2: AGE */}
        <div style={{ gridColumn: 3, gridRow: 2 }}>
          <AgeCard age={level.age} language={language} />
        </div>
      </div>

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
