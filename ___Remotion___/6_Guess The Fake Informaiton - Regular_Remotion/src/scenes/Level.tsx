import React from "react";
import { AbsoluteFill, Audio, Easing, Img, interpolate, Sequence, spring, staticFile } from "remotion";
import type { ResolvedBackground } from "@shared/effects/AnimatedBackground";
import { sharedSrc, type Language } from "@shared/paths";
import { COLORS as THEME_COLORS, fontFamily } from "@shared/theme";
import { DESIGN_FPS, useDesignFrame, useFrameScale } from "@shared/timing";
import type { ResolvedLevel, FakeStat } from "../level-data";
import audioManifest from "../generated/audio.json";

export const REVEAL_START = 185;

// ── Fake flip timing ─────────────────────────────────────────────────────────
// The flip begins ~1.2s after reveal = 1.2 × 30fps = 36 design frames after REVEAL_START.
// Duration = 0.9s = 27 design frames.
const FLIP_DELAY = 36;
const FLIP_DUR = 27;
const FLIP_EASE = Easing.bezier(0.22, 1, 0.36, 1);

// ── Emphasis timing (same as flip delay, 1.2s) ───────────────────────────────
const EMPHASIS_DELAY = 36;
const EMPHASIS_DUR = 14; // ~0.45s

// ── Level badge ──────────────────────────────────────────────────────────────
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

// ── Timer ─────────────────────────────────────────────────────────────────────
const Timer: React.FC<{ frame: number; opacity: number }> = ({ frame, opacity }) => {
  const T_START = 14;
  const T_END = REVEAL_START;
  const remain = interpolate(frame, [T_START, T_END], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const secs = Math.max(0, Math.ceil((T_END - Math.max(frame, T_START)) / DESIGN_FPS));
  const R = 66;
  const C = 2 * Math.PI * R;
  const pop = spring({ frame, fps: DESIGN_FPS, config: { damping: 12, mass: 0.7, stiffness: 160 }, durationInFrames: 26 });
  const scale = interpolate(pop, [0, 1], [0.2, 1]);
  const ringColor = remain < 0.16 ? "#ff4136" : THEME_COLORS.accent;
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
          color: THEME_COLORS.white,
          textShadow: "0 2px 6px rgba(0,0,0,0.6)",
        }}
      >
        {secs}
      </div>
    </div>
  );
};

// ── Frosted glass card face ───────────────────────────────────────────────────
const FACE_STYLE: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  display: "flex",
  alignItems: "stretch",
  justifyContent: "stretch",
  backfaceVisibility: "hidden",
  WebkitBackfaceVisibility: "hidden",
  overflow: "hidden",
  borderRadius: 22,
  background: "linear-gradient(145deg, rgba(255,255,255,0.14) 0%, rgba(255,255,255,0.05) 45%, rgba(120,200,255,0.08) 100%)",
  border: "1px solid rgba(255,255,255,0.28)",
  boxShadow: "0 10px 40px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.2), inset 0 -1px 0 rgba(0,0,0,0.12)",
  backdropFilter: "blur(14px) saturate(1.25)",
  WebkitBackdropFilter: "blur(14px) saturate(1.25)",
};

// ── Position abbreviation table (from fake-info-mode.js) ─────────────────────
const POSITION_ABBREV: Record<string, string> = {
  "Goalkeeper": "GK",
  "Centre-Back": "CB",
  "Left-Back": "LB",
  "Right-Back": "RB",
  "Left Wing-Back": "LWB",
  "Right Wing-Back": "RWB",
  "Defensive Midfield": "DM",
  "Central Midfield": "CM",
  "Attacking Midfield": "CAM",
  "Left Midfield": "LM",
  "Right Midfield": "RM",
  "Left Winger": "LW",
  "Right Winger": "RW",
  "Centre-Forward": "ST",
  "Second Striker": "ST",
  "Striker": "ST",
};

const posAbbrev = (pos: string): string =>
  POSITION_ABBREV[pos] || (pos ? pos.slice(0, 3).toUpperCase() : "—");

// ── Card inner content renderers ──────────────────────────────────────────────
const ClubInner: React.FC<{ crestPath: string | null; clubName: string }> = ({ crestPath, clubName }) => (
  <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "10px 8px", gap: 8 }}>
    {crestPath ? (
      <Img
        src={staticFile(crestPath)}
        style={{ width: "60%", maxHeight: "55%", objectFit: "contain", filter: "drop-shadow(0 4px 8px rgba(0,0,0,0.45))" }}
      />
    ) : null}
    <div
      style={{
        fontFamily,
        fontWeight: 700,
        fontSize: 18,
        color: "rgba(255,255,255,0.92)",
        textAlign: "center",
        lineHeight: 1.2,
        textShadow: "0 2px 6px rgba(0,0,0,0.6)",
        maxWidth: "90%",
        overflow: "hidden",
        display: "-webkit-box",
        WebkitLineClamp: 2,
        WebkitBoxOrient: "vertical",
      }}
    >
      {clubName}
    </div>
  </div>
);

const PositionInner: React.FC<{ position: string }> = ({ position }) => (
  <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
    <div
      style={{
        fontFamily,
        fontWeight: 900,
        fontSize: 64,
        color: "rgba(255,255,255,0.95)",
        textShadow: "0 4px 16px rgba(0,0,0,0.7), 0 0 40px rgba(255,255,255,0.12)",
        letterSpacing: -1,
        lineHeight: 1,
      }}
    >
      {position}
    </div>
  </div>
);

const CountryInner: React.FC<{ flagPath: string | null; country: string }> = ({ flagPath, country }) => (
  <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "10px 8px", gap: 8 }}>
    {flagPath ? (
      <div
        style={{
          width: "72%",
          aspectRatio: "3 / 2",
          borderRadius: 8,
          overflow: "hidden",
          border: "2px solid rgba(255,255,255,0.8)",
          boxShadow: "0 6px 18px rgba(0,0,0,0.45)",
        }}
      >
        <Img src={staticFile(flagPath)} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
      </div>
    ) : null}
    <div
      style={{
        fontFamily,
        fontWeight: 700,
        fontSize: 16,
        color: "rgba(255,255,255,0.88)",
        textAlign: "center",
        textShadow: "0 2px 6px rgba(0,0,0,0.6)",
      }}
    >
      {country}
    </div>
  </div>
);

const ShirtNumberInner: React.FC<{ number: string }> = ({ number }) => (
  <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
    {/* Shirt silhouette */}
    <div
      style={{
        position: "relative",
        width: "62%",
        aspectRatio: "1 / 1",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <svg viewBox="0 0 100 100" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0.35 }}>
        <path
          d="M30 8 L10 22 L20 32 L20 90 L80 90 L80 32 L90 22 L70 8 Q60 2 50 4 Q40 2 30 8Z"
          fill="rgba(255,255,255,0.6)"
          stroke="rgba(255,255,255,0.4)"
          strokeWidth="2"
        />
      </svg>
      <div
        style={{
          position: "relative",
          fontFamily,
          fontWeight: 900,
          fontSize: 52,
          color: "rgba(255,255,255,0.96)",
          textShadow: "0 3px 10px rgba(0,0,0,0.7)",
          lineHeight: 1,
          zIndex: 1,
        }}
      >
        {number}
      </div>
    </div>
  </div>
);

// ── Single param card ─────────────────────────────────────────────────────────
type CardContent = { type: "club"; crestPath: string | null; name: string }
  | { type: "position"; position: string }
  | { type: "country"; flagPath: string | null; country: string }
  | { type: "shirt"; number: string };

const ParamCardInner: React.FC<{ content: CardContent }> = ({ content }) => {
  if (content.type === "club") return <ClubInner crestPath={content.crestPath} clubName={content.name} />;
  if (content.type === "position") return <PositionInner position={content.position} />;
  if (content.type === "country") return <CountryInner flagPath={content.flagPath} country={content.country} />;
  return <ShirtNumberInner number={content.number} />;
};

// ── Card label pills ──────────────────────────────────────────────────────────
const CARD_LABELS: Record<FakeStat, string> = {
  club: "CLUB",
  position: "POSITION",
  country: "COUNTRY",
  shirt_number: "SHIRT #",
};

// ── Param card (with optional fake flip) ─────────────────────────────────────
const ParamCard: React.FC<{
  frame: number;
  stat: FakeStat;
  isFake: boolean;
  frontContent: CardContent;   // shown during question (may be fake)
  backContent: CardContent;    // shown after flip (always real)
  revealStart: number;
  emphasis: boolean;           // should this card grow 1.1?
  deemphasis: boolean;         // should this card shrink 0.9 + blur?
}> = ({ frame, stat, isFake, frontContent, backContent, revealStart, emphasis, deemphasis }) => {
  const localFlip = frame - (revealStart + FLIP_DELAY);

  // Flip progress 0 → 1 after delay
  const flipProg = isFake
    ? interpolate(localFlip, [0, FLIP_DUR], [0, 1], {
        easing: FLIP_EASE,
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      })
    : 0;

  // rotateY: 0deg → 180deg
  const rotateY = flipProg * 180;
  const localEmph = frame - (revealStart + EMPHASIS_DELAY);
  const emphProg = emphasis || deemphasis
    ? interpolate(localEmph, [0, EMPHASIS_DUR], [0, 1], {
        easing: Easing.bezier(0.22, 1, 0.36, 1),
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      })
    : 0;
  const scaleVal = emphasis
    ? interpolate(emphProg, [0, 1], [1, 1.1])
    : deemphasis
      ? interpolate(emphProg, [0, 1], [1, 0.9])
      : 1;
  const blurVal = deemphasis ? interpolate(emphProg, [0, 1], [0, 4]) : 0;

  const cardStyle: React.CSSProperties = {
    position: "relative",
    width: "100%",
    height: "100%",
    borderRadius: 22,
    // Non-fake cards get the glass chrome directly; fake card is transparent (chrome on faces).
    background: isFake
      ? "transparent"
      : "linear-gradient(145deg, rgba(255,255,255,0.14) 0%, rgba(255,255,255,0.05) 45%, rgba(120,200,255,0.08) 100%)",
    border: isFake ? "none" : "1px solid rgba(255,255,255,0.28)",
    boxShadow: isFake ? "none" : "0 10px 40px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.2)",
    backdropFilter: isFake ? "none" : "blur(14px) saturate(1.25)",
    WebkitBackdropFilter: isFake ? "none" : "blur(14px) saturate(1.25)",
    overflow: isFake ? "visible" : "hidden",
    transform: `scale(${scaleVal})`,
    filter: blurVal > 0 ? `blur(${blurVal}px)` : undefined,
    transition: "none",
    zIndex: emphasis ? 5 : 1,
  };

  // Label pill
  const label = CARD_LABELS[stat];

  return (
    <div style={cardStyle}>
      {/* Card label at top */}
      <div
        style={{
          position: "absolute",
          top: 8,
          left: 0,
          right: 0,
          display: "flex",
          justifyContent: "center",
          zIndex: 10,
          pointerEvents: "none",
        }}
      >
        <div
          style={{
            fontFamily,
            fontWeight: 700,
            fontSize: 13,
            letterSpacing: 1.5,
            color: "rgba(255,255,255,0.72)",
            textShadow: "0 1px 4px rgba(0,0,0,0.6)",
            textTransform: "uppercase",
          }}
        >
          {label}
        </div>
      </div>

      {isFake ? (
        // 3D flipper: front = fake, back = real
        <div
          style={{
            position: "absolute",
            inset: 0,
            transformStyle: "preserve-3d",
            transform: `rotateY(${rotateY}deg)`,
            perspective: 1400,
          }}
        >
          {/* Front face: FAKE value */}
          <div style={FACE_STYLE}>
            <ParamCardInner content={frontContent} />
          </div>
          {/* Back face: REAL value (pre-rotated 180deg so it faces us after flip) */}
          <div style={{ ...FACE_STYLE, transform: "rotateY(180deg)" }}>
            <ParamCardInner content={backContent} />
          </div>
        </div>
      ) : (
        // Normal card: just the content
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "stretch" }}>
          <ParamCardInner content={frontContent} />
        </div>
      )}
    </div>
  );
};

// ── Portrait card ─────────────────────────────────────────────────────────────
const PortraitCard: React.FC<{
  frame: number;
  revealStart: number;
  photoPath: string | null;
  display: string;
  deemphasis: boolean;
}> = ({ frame, revealStart, photoPath, display, deemphasis }) => {
  const revealProg = interpolate(frame, [revealStart, revealStart + 26], [0, 1], {
    easing: Easing.bezier(0.22, 1, 0.36, 1),
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const localEmph = frame - (revealStart + EMPHASIS_DELAY);
  const emphProg = deemphasis
    ? interpolate(localEmph, [0, EMPHASIS_DUR], [0, 1], {
        easing: Easing.bezier(0.22, 1, 0.36, 1),
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      })
    : 0;
  const scaleVal = deemphasis ? interpolate(emphProg, [0, 1], [1, 0.9]) : 1;
  const blurVal = deemphasis ? interpolate(emphProg, [0, 1], [0, 4]) : 0;

  const pop = spring({
    frame,
    fps: DESIGN_FPS,
    config: { damping: 12, mass: 0.7, stiffness: 140 },
    durationInFrames: 28,
  });
  const popScale = interpolate(pop, [0, 1], [0.2, 1]);

  return (
    <div
      style={{
        width: 220,
        height: 290,
        borderRadius: 20,
        overflow: "hidden",
        background: "rgba(12,16,22,0.55)",
        border: "2px solid rgba(255,255,255,0.28)",
        boxShadow: "0 20px 50px rgba(0,0,0,0.65)",
        backdropFilter: "blur(14px)",
        WebkitBackdropFilter: "blur(14px)",
        display: "flex",
        flexDirection: "column",
        transform: `scale(${popScale * scaleVal})`,
        filter: blurVal > 0 ? `blur(${blurVal}px)` : undefined,
        position: "relative",
      }}
    >
      {/* Photo area */}
      <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
        {photoPath ? (
          <Img
            src={staticFile(photoPath)}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              objectPosition: "center 8%",
              // Silhouette during question; full color after reveal
              filter: revealProg < 0.5 ? "brightness(0) contrast(1)" : "none",
            }}
          />
        ) : (
          <div
            style={{
              width: "100%",
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily,
              fontWeight: 800,
              fontSize: 72,
              color: "rgba(255,255,255,0.3)",
            }}
          >
            {display.charAt(0)}
          </div>
        )}
      </div>

      {/* Name band — only visible after reveal */}
      <div
        style={{
          flex: "0 0 54px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(180deg, #e53935 0%, #b71c1c 100%)",
          borderTop: "2px solid rgba(255,255,255,0.18)",
          fontFamily,
          fontWeight: 800,
          fontSize: 22,
          color: "#ffffff",
          textTransform: "uppercase",
          textAlign: "center",
          padding: "0 8px",
          opacity: revealProg,
          textShadow: "-1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000",
        }}
      >
        {display}
      </div>
    </div>
  );
};

// ── Main Level component ──────────────────────────────────────────────────────
export const Level: React.FC<{
  bg: ResolvedBackground;
  level: ResolvedLevel;
  levelNumber: number;
  language: Language;
  muteReveal?: boolean;
}> = ({ bg, level, levelNumber, language, muteReveal }) => {
  const frame = useDesignFrame();
  const k = useFrameScale();
  const f = (designFrames: number) => Math.round(designFrames * k);

  const revealVoice = language === "Spanish" ? level.revealVoiceEs : level.revealVoiceEn;

  const revealProgress = interpolate(frame, [REVEAL_START, REVEAL_START + 26], [0, 1], {
    easing: Easing.bezier(0.22, 1, 0.36, 1),
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const uiOpacity = interpolate(revealProgress, [0, 0.5], [1, 0], { extrapolateRight: "clamp" });

  const panelTop = bg.competition ? bg.competition.c2 : bg.colorHex;

  // Resolve the 4 cards' front (possibly fake) and back (always real) content
  const { fakeStat, fakeValue, fakeClubCrestPath, fakeCountryFlagPath } = level;

  const cards: Array<{
    stat: FakeStat;
    front: CardContent;
    back: CardContent;
  }> = [
    {
      stat: "club",
      front: fakeStat === "club"
        ? { type: "club", crestPath: fakeClubCrestPath ?? null, name: fakeValue }
        : { type: "club", crestPath: level.clubCrestPath, name: level.club },
      back: { type: "club", crestPath: level.clubCrestPath, name: level.club },
    },
    {
      stat: "position",
      front: fakeStat === "position"
        ? { type: "position", position: posAbbrev(fakeValue) }
        : { type: "position", position: level.position },
      back: { type: "position", position: level.position },
    },
    {
      stat: "country",
      front: fakeStat === "country"
        ? { type: "country", flagPath: fakeCountryFlagPath ?? null, country: fakeValue }
        : { type: "country", flagPath: level.countryFlagPath, country: level.country },
      back: { type: "country", flagPath: level.countryFlagPath, country: level.country },
    },
    {
      stat: "shirt_number",
      front: fakeStat === "shirt_number"
        ? { type: "shirt", number: fakeValue }
        : { type: "shirt", number: level.shirtNumber },
      back: { type: "shirt", number: level.shirtNumber },
    },
  ];

  const hexToRgb = (hex: string) => {
    let h = (hex || "").replace("#", "").trim();
    if (h.length === 3) h = h.split("").map((c) => c + c).join("");
    const n = parseInt(h, 16);
    if (h.length !== 6 || Number.isNaN(n)) return { r: 36, g: 48, b: 62 };
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  };

  const rgb = hexToRgb(panelTop);
  const bgAccent = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.18)`;

  return (
    <AbsoluteFill>
      {/* Main content area */}
      <AbsoluteFill
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "row",
            alignItems: "center",
            gap: 52,
          }}
        >
          {/* Portrait card (left) */}
          <PortraitCard
            frame={frame}
            revealStart={REVEAL_START}
            photoPath={level.photoPath}
            display={level.display}
            deemphasis={revealProgress >= 0.5}
          />

          {/* 2×2 parameter grid (right) */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 18,
              width: 480,
              height: 340,
              perspective: 1400,
            }}
          >
            {cards.map(({ stat, front, back }) => {
              const isFake = stat === fakeStat;
              const revealed = revealProgress >= 0.5;
              return (
                <ParamCard
                  key={stat}
                  frame={frame}
                  stat={stat}
                  isFake={isFake}
                  frontContent={front}
                  backContent={back}
                  revealStart={REVEAL_START}
                  emphasis={isFake && revealed}
                  deemphasis={!isFake && revealed}
                />
              );
            })}
          </div>
        </div>
      </AbsoluteFill>

      <LevelBadge frame={frame} n={levelNumber} opacity={uiOpacity} />
      <Timer frame={frame} opacity={uiOpacity} />

      {/* Reveal glow overlay — tinted flash at reveal moment */}
      <AbsoluteFill
        style={{
          background: bgAccent,
          opacity: interpolate(frame, [REVEAL_START, REVEAL_START + 18], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }) * interpolate(frame, [REVEAL_START + 18, REVEAL_START + 54], [1, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
          pointerEvents: "none",
        }}
      />

      {/* Ticking sound: last 30 frames before reveal */}
      <Sequence from={f(REVEAL_START - 30)} durationInFrames={f(30)}>
        <Audio src={staticFile(audioManifest.ticking)} volume={0.8} />
      </Sequence>

      {/* Stinger at reveal */}
      {/* Bonus level (muteReveal): no flip stinger — the answer stays hidden. */}
      {muteReveal ? null : (
        <Sequence from={f(REVEAL_START)}>
          <Audio src={staticFile(audioManifest.stinger)} volume={0.5} />
        </Sequence>
      )}

      {/* Reveal voice (fake stat announcement) at reveal + 5 frames */}
      {!muteReveal && revealVoice ? (
        <Sequence from={f(REVEAL_START + 5)}>
          <Audio src={staticFile(revealVoice)} volume={1} />
        </Sequence>
      ) : null}
    </AbsoluteFill>
  );
};
