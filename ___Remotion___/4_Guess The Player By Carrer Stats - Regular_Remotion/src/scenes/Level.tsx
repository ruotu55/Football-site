import React from "react";
import { AbsoluteFill, Audio, Easing, Img, interpolate, Sequence, spring, staticFile } from "remotion";
import type { ResolvedBackground } from "@shared/effects/AnimatedBackground";
import { sharedSrc, type Language } from "@shared/paths";
import { fontFamily } from "@shared/theme";
import { DESIGN_FPS, useDesignFrame, useFrameScale } from "@shared/timing";
import { FLIP_DURATION, EASE_FLIP } from "@shared/components/PlayerSlot";
import type { ResolvedLevel } from "../level-data";
import audioManifest from "../generated/audio.json";

// ── timing ────────────────────────────────────────────────────────────────────
export const REVEAL_START = 185;

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

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
  const pop = spring({ frame, fps: DESIGN_FPS, config: { damping: 9, mass: 0.8, stiffness: 170 }, durationInFrames: 32 });
  const scale = interpolate(pop, [0, 1], [0.2, 1]);
  return (
    <div style={{ position: "absolute", top: 30, left: 34, opacity, transform: `scale(${scale})`, transformOrigin: "top left", zIndex: 60 }}>
      <div
        style={{
          width: 128, height: 128, borderRadius: "50%",
          background: "radial-gradient(circle at 50% 32%, #ffdf73 0%, #f7a81b 62%, #e07d09 100%)",
          border: "6px solid rgba(255,255,255,0.94)",
          boxShadow: "0 16px 32px rgba(0,0,0,0.55), inset 0 -7px 16px rgba(0,0,0,0.18)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontFamily, fontWeight: 800, fontSize: 76, lineHeight: 1, color: "#241500",
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
  const remain = interpolate(frame, [T_START, T_END], [1, 0], clamp);
  const secs = Math.max(0, Math.ceil((T_END - Math.max(frame, T_START)) / DESIGN_FPS));
  const R = 53;
  const C = 2 * Math.PI * R;
  const pop = spring({ frame, fps: DESIGN_FPS, config: { damping: 12, mass: 0.7, stiffness: 160 }, durationInFrames: 26 });
  const scale = interpolate(pop, [0, 1], [0.2, 1]);
  const ringColor = remain < 0.16 ? "#ff4136" : COLORS_ACCENT;
  // last 3 seconds pulse
  const urgent = remain < 0.16 ? 1 + Math.abs(Math.sin(frame / DESIGN_FPS * 7)) * 0.08 : 1;
  return (
    <div style={{ position: "absolute", top: 30, right: 34, width: 128, height: 128, opacity, transform: `scale(${scale * urgent})`, transformOrigin: "top right", zIndex: 60 }}>
      <svg width={128} height={128} style={{ display: "block", filter: "drop-shadow(0 12px 24px rgba(0,0,0,0.5))" }}>
        <circle cx={64} cy={64} r={R} fill="rgba(12,16,22,0.66)" stroke="rgba(255,255,255,0.16)" strokeWidth={12} />
        <circle cx={64} cy={64} r={R} fill="none" stroke={ringColor} strokeWidth={12} strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - remain)} transform="rotate(-90 64 64)" />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontFamily, fontWeight: 800, fontSize: 58, color: "#fff", textShadow: "0 2px 6px rgba(0,0,0,0.6)" }}>
        {secs}
      </div>
    </div>
  );
};

// ── Stat card design constants ─────────────────────────────────────────────────
// Neutral dark "glass" — darkens whatever's behind it so the cards read on ANY
// competition background (no blue tint that only suits navy themes).
const CARD_BG_HEAD = "linear-gradient(180deg, rgba(20,22,28,0.72) 0%, rgba(12,13,17,0.66) 100%)";
const CARD_BG_VALUE = "linear-gradient(180deg, rgba(14,15,19,0.54) 0%, rgba(6,7,10,0.64) 100%)";
const CARD_BORDER = "1px solid rgba(255,255,255,0.22)";
const HEAD_COLOR = "#e6ebf2";
const VALUE_COLOR = "#ffffff";
const STAT_FONT = "Inter, 'Arial Black', 'Segoe UI', Arial, sans-serif";

// Cluster layout: Position/Games stacked LEFT, big CLUBS box CENTRE (spans both
// rows = 2× size), Goals/Assists stacked RIGHT.
const STAT_W = 316; // ~20% wider than before (264) — boxes reach further to the sides
const STAT_H = 130;
const STACK_GAP = 12;
const STACK_H = STAT_H * 2 + STACK_GAP; // 272 — the clubs box height
const CLUBS_W = 512; // ~2× a stat box
const COL_GAP = 74;

// ── Single stat card (label header + value) ───────────────────────────────────
const StatCard: React.FC<{ label: string; value: React.ReactNode; width: number; height: number }> = ({ label, value, width, height }) => (
  <div style={{ width, height, borderRadius: 16, overflow: "hidden", border: CARD_BORDER, boxShadow: "0 10px 30px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.08), inset 0 1px 0 rgba(255,255,255,0.14)", display: "flex", flexDirection: "column", flexShrink: 0 }}>
    <div style={{ flex: "0 0 50px", background: CARD_BG_HEAD, borderBottom: "1px solid rgba(255,255,255,0.18)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: STAT_FONT, fontWeight: 800, fontSize: 28, letterSpacing: "0.05em", textTransform: "uppercase", color: HEAD_COLOR, textShadow: "0 0 6px rgba(255,255,255,0.25), 0 1px 3px rgba(0,0,0,0.5)", padding: "0 0.5rem", textAlign: "center" }}>
      {label}
    </div>
    <div style={{ flex: 1, background: CARD_BG_VALUE, borderTop: "1px solid rgba(255,255,255,0.1)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: STAT_FONT, fontWeight: 900, fontSize: 64, lineHeight: 1.02, color: VALUE_COLOR, textShadow: "0 0 8px rgba(255,255,255,0.25), 0 2px 4px rgba(0,0,0,0.5)", padding: "4px 8px", textAlign: "center", overflow: "hidden", boxSizing: "border-box" }}>
      {value}
    </div>
  </div>
);

// ── Clubs grid card — crest size SCALES with the club count (handles 1 … 16+) ──
const ClubsCard: React.FC<{ clubs: ResolvedLevel["clubs"]; label: string; width: number; height: number }> = ({ clubs, label, width, height }) => {
  const n = Math.max(1, clubs.length);
  // MAX 4 per row → rows = ceil(n/4); cols balances them evenly (≤4).
  const rows = Math.ceil(n / 4);
  const cols = Math.ceil(n / rows);
  const gap = 10;
  const padX = 16;
  const padY = 14;
  const headH = 52;
  const cellW = (width - padX * 2 - (cols - 1) * gap) / cols;
  const cellH = (height - headH - padY * 2 - (rows - 1) * gap) / rows;
  // Crests as BIG as possible for the space (capped so 1–2 clubs aren't huge).
  const crestSize = Math.max(24, Math.min(140, Math.floor(Math.min(cellW, cellH))));
  const rowsArr: ResolvedLevel["clubs"][] = [];
  for (let r = 0; r < rows; r++) rowsArr.push(clubs.slice(r * cols, (r + 1) * cols));

  return (
    <div style={{ width, height, borderRadius: 16, overflow: "hidden", border: CARD_BORDER, boxShadow: "0 10px 30px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.08), inset 0 1px 0 rgba(255,255,255,0.14)", display: "flex", flexDirection: "column", flexShrink: 0 }}>
      <div style={{ flex: `0 0 ${headH}px`, background: CARD_BG_HEAD, borderBottom: "1px solid rgba(255,255,255,0.18)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: STAT_FONT, fontWeight: 800, fontSize: 28, letterSpacing: "0.05em", textTransform: "uppercase", color: HEAD_COLOR, textShadow: "0 0 6px rgba(255,255,255,0.25), 0 1px 3px rgba(0,0,0,0.5)" }}>
        {label}
      </div>
      <div style={{ flex: 1, background: CARD_BG_VALUE, borderTop: "1px solid rgba(255,255,255,0.1)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap, padding: `${padY}px ${padX}px`, boxSizing: "border-box" }}>
        {rowsArr.map((row, ri) => (
          <div key={ri} style={{ width: "100%", display: "flex", flexDirection: "row", alignItems: "center", justifyContent: "space-evenly" }}>
            {row.map((c, i) => {
              const src = sharedSrc(c.crestPath);
              return (
                <div key={i} style={{ width: crestSize, height: crestSize, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  {src ? (
                    <Img src={src} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", filter: "drop-shadow(0 2px 6px rgba(0,0,0,0.5))" }} />
                  ) : (
                    <div style={{ width: crestSize, height: crestSize, borderRadius: "50%", background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.2)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily, fontSize: crestSize * 0.4, color: "rgba(255,255,255,0.4)" }}>?</div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
};

// ── Waving flag — SMOOTH CSS-transform cloth (no SVG filters: those rasterise
// coarsely in the Studio preview = "pixelated"; pure transforms stay crisp). ───
// The flag is split into many vertical strips. Each strip is offset by a
// TRAVELLING sine wave (translateY) AND skewed by that wave's local slope, so the
// strips tilt to connect into a continuous surface with smooth (non-stair-stepped)
// top/bottom edges. Continuous fold-shading; deterministic via useDesignFrame.
const FLAG_STRIPS = 70;
// Travelling soft-light fold-shading, in FLAG space (so it's continuous across
// strips). Rendered INSIDE each strip (clipped to the flag + isolated) so it
// never bleeds onto the background as a box.
const FLAG_SHADE_GRADIENT =
  "linear-gradient(90deg, rgba(128,128,128,0) 0%, rgba(255,255,255,0.9) 25%, rgba(128,128,128,0) 50%, rgba(0,0,0,0.9) 75%, rgba(128,128,128,0) 100%)";
const WavingFlag: React.FC<{ src: string; width: number; height: number; frame: number; intensity: number }> = ({ src, width, height, frame, intensity }) => {
  const stripW = width / FLAG_STRIPS;
  const t = frame / DESIGN_FPS;
  const K = 2.2 * Math.PI; // ~1.1 waves across the flag
  const W = 2.0 * Math.PI; // temporal frequency
  const period = ((2 * Math.PI) / K) * width; // one wave, in px
  const phaseX = ((W * t) / K) * width; // travels with the geometry wave
  const segs: React.ReactNode[] = [];
  for (let i = 0; i < FLAG_STRIPS; i++) {
    const e = i / (FLAG_STRIPS - 1); // 0 at pole, 1 at free edge
    const amp = (4 + 24 * e) * intensity; // amplitude grows toward the free edge
    const ang = K * e - W * t;
    const ty = amp * Math.sin(ang);
    const slope = (amp * K * Math.cos(ang)) / width; // d(ty)/dx → strip tilt
    const skew = (Math.atan(slope) * 180) / Math.PI;
    const offX = i * stripW - 1; // strips OVERLAP by 1px each side → no seams
    segs.push(
      <div
        key={i}
        style={{
          position: "absolute",
          left: offX,
          top: 0,
          width: stripW + 2,
          height,
          overflow: "hidden",
          transform: `translateY(${ty}px) skewY(${skew}deg)`,
          transformOrigin: "center center",
        }}
      >
        <div style={{ position: "absolute", left: -offX, top: 0, width, height, isolation: "isolate" }}>
          <Img src={src} style={{ width, height, objectFit: "cover", display: "block" }} />
          <div
            style={{
              position: "absolute",
              inset: 0,
              pointerEvents: "none",
              mixBlendMode: "soft-light",
              opacity: 0.8,
              backgroundImage: FLAG_SHADE_GRADIENT,
              backgroundSize: `${period}px 100%`,
              backgroundRepeat: "repeat",
              backgroundPositionX: `${phaseX}px`,
            }}
          />
        </div>
      </div>,
    );
  }
  // drop-shadow on the OUTER wrapper follows the FLAG shape (only the strips are
  // here now — no full-rect overlays), so there's no rectangular halo/box.
  return (
    <div style={{ position: "relative", width, height, filter: "drop-shadow(0 22px 40px rgba(0,0,0,0.42))" }}>{segs}</div>
  );
};

// ── Flagpole (left edge of the flag) ──────────────────────────────────────────
// `bottom` is a big negative so the pole runs from above the flag all the way
// DOWN past the bottom of the 1080 frame (the flag sits at top≈404, h≈412).
const Flagpole: React.FC<{ height: number }> = ({ height }) => (
  <div style={{ position: "absolute", left: -16, top: -34, bottom: -276, width: 16, zIndex: 1 }}>
    <div style={{ position: "absolute", inset: 0, borderRadius: 8, background: "linear-gradient(90deg, #6b4a22 0%, #c79a55 38%, #f3dca0 50%, #b07f38 64%, #5a3c1c 100%)", boxShadow: "0 10px 30px rgba(0,0,0,0.5)" }} />
    {/* finial ball */}
    <div style={{ position: "absolute", top: -26, left: "50%", transform: "translateX(-50%)", width: 30, height: 30, borderRadius: "50%", background: "radial-gradient(circle at 38% 32%, #ffe9a8 0%, #d9a93f 55%, #8a5f1e 100%)", boxShadow: "0 6px 16px rgba(0,0,0,0.55)" }} />
  </div>
);

// ── Hero player (big, centred, in front of the flag) ──────────────────────────
// Hidden = a glossy BLACK silhouette with a bright rim-light so it pops against
// the flag (different from runner 3's theme-tinted, drop-and-pop silhouette).
// Reveal = an IN-PLACE colour materialise: the colour photo sweeps UP from the
// feet (mask wipe) while the silhouette fades, with a scale pop + glow.
// EVERY player is scaled to EXACTLY this height (bottom-anchored), so all photos
// reach the same height regardless of their aspect ratio — small photos are scaled
// UP, tall ones DOWN. Width is free (full aspect kept → never squashed). Chosen so
// the grown reveal (×1.09) still clears the top info boxes (cluster bottom ≈ 312).
const PLAYER_H = 690;
const HeroPlayer: React.FC<{ photoSrc: string | null; revealProgress: number }> = ({ photoSrc, revealProgress: p }) => {
  const silOpacity = interpolate(p, [0.12, 0.82], [1, 0], clamp);
  const cut = interpolate(p, [0, 1], [-18, 106], clamp); // colour mask sweep up
  const colorMask = `linear-gradient(to top, #000 ${cut}%, rgba(0,0,0,0) ${cut + 18}%)`;
  const colorOpacity = interpolate(p, [0.02, 0.18], [0, 1], clamp);
  // Grows on reveal and STAYS bigger (1 → 1.09, no shrink-back).
  const pop = interpolate(p, [0, 0.55], [1, 1.09], { easing: Easing.out(Easing.cubic), extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  const silFilter =
    "brightness(0) saturate(0) " +
    "drop-shadow(0 0 3px rgba(255,255,255,0.6)) " +
    "drop-shadow(0 0 16px rgba(150,200,255,0.4)) " +
    "drop-shadow(0 18px 30px rgba(0,0,0,0.6))";
  const colorFilter = "brightness(1.02) contrast(1.02) saturate(1.06) drop-shadow(0 16px 34px rgba(0,0,0,0.6))";

  // Full-bleed image, centred by the flex container (height drives the width).
  // height:100% → the photo always fills PLAYER_H (SAME height for every player);
  // width:auto keeps the aspect (no squash). Same style for silhouette + colour.
  const imgStyle: React.CSSProperties = { height: "100%", width: "auto", objectFit: "contain", objectPosition: "center bottom", display: "block" };

  return (
    // Full-width container + justifyContent:center → the player is dead-centre on
    // screen (no shrink-to-fit ambiguity that nudged it off-centre).
    <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: PLAYER_H, transform: `scale(${pop})`, transformOrigin: "center bottom", zIndex: 30, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      {/* ground shadow */}
      <div style={{ position: "absolute", bottom: 6, left: "50%", transform: "translateX(-50%)", width: 460, height: 54, borderRadius: "50%", background: "radial-gradient(ellipse at center, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.22) 50%, rgba(0,0,0,0) 78%)", filter: "blur(6px)" }} />
      {photoSrc ? (
        <>
          {/* silhouette */}
          <div style={{ position: "relative", height: "100%", display: "flex", alignItems: "flex-end", opacity: silOpacity }}>
            <Img src={photoSrc} style={{ ...imgStyle, filter: silFilter }} />
          </div>
          {/* colour photo — wipes up */}
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "flex-end", justifyContent: "center", opacity: colorOpacity, WebkitMaskImage: colorMask, maskImage: colorMask }}>
            <Img src={photoSrc} style={{ ...imgStyle, filter: colorFilter }} />
          </div>
        </>
      ) : (
        <div style={{ height: "100%", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
          <div style={{ fontFamily, fontWeight: 800, fontSize: 360, color: "rgba(255,255,255,0.16)", lineHeight: 1, textShadow: "0 6px 30px rgba(0,0,0,0.6)" }}>?</div>
        </div>
      )}
    </div>
  );
};

// ── Name banner (slams in across the bottom on reveal) ────────────────────────
const NameBanner: React.FC<{ playerName: string; display: string; revealProgress: number }> = ({ playerName, display, revealProgress: p }) => {
  const words = (display || playerName || "").trim().toUpperCase().split(/\s+/).filter(Boolean);
  const firstPart = words.slice(0, -1).join(" ");
  const lastWord = words[words.length - 1] ?? "";
  const slam = interpolate(p, [0.28, 0.5], [0, 1], clamp);
  const ty = interpolate(slam, [0, 1], [70, 0]);
  const scale = interpolate(slam, [0, 0.7, 1], [0.7, 1.05, 1]);
  if (slam <= 0) return null;
  return (
    <div style={{ position: "absolute", left: "50%", bottom: 46, transform: `translate(-50%, ${ty}px) scale(${scale})`, transformOrigin: "center bottom", opacity: slam, textAlign: "center", zIndex: 50, width: 1500 }}>
      {firstPart ? (
        <div style={{ fontFamily: "'Barlow Condensed', " + fontFamily, fontWeight: 800, fontSize: 68, lineHeight: 0.95, letterSpacing: "0.1em", color: "#ffffff", WebkitTextStroke: "4px rgba(8,12,20,0.95)", paintOrder: "stroke", textShadow: "0 4px 14px rgba(0,0,0,0.95)", whiteSpace: "nowrap" }}>
          {firstPart}
        </div>
      ) : null}
      <div style={{ fontFamily: "'Barlow Condensed', " + fontFamily, fontWeight: 900, fontSize: 150, lineHeight: 0.88, letterSpacing: "0.02em", color: "#ffd24a", WebkitTextStroke: "6px rgba(8,12,20,0.95)", paintOrder: "stroke", textShadow: "0 8px 28px rgba(0,0,0,0.95)", whiteSpace: "nowrap" }}>
        {lastWord}
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
  muteReveal?: boolean;
}> = ({ bg: _bg, level, levelNumber, language, muteReveal }) => {
  const frame = useDesignFrame();
  const k = useFrameScale();
  const f = (designFrames: number) => Math.round(designFrames * k);
  const revealVoice = language === "Spanish" ? level.revealVoiceEs : level.revealVoiceEn;

  const revealProgress = interpolate(frame, [REVEAL_START, REVEAL_START + FLIP_DURATION], [0, 1], {
    easing: EASE_FLIP,
    ...clamp,
  });
  const uiOpacity = 1; // keep the info boxes (and badge/timer) visible through the reveal

  const photoSrc = sharedSrc(level.photoPath);
  const flagSrc = sharedSrc(level.countryFlagPath);

  // Labels
  const gamesLabel = language === "Spanish" ? "PARTIDOS" : "GAMES";
  const posLabel = language === "Spanish" ? "POSICIÓN" : "POSITION";
  const clubsLabel = language === "Spanish" ? "CLUBES" : "CLUBS";
  const topRightLabel = level.isGK ? (language === "Spanish" ? "GOL. ENCAJADOS" : "GOALS CONCEDED") : (language === "Spanish" ? "GOLES" : "GOALS");
  const botRightLabel = level.isGK ? (language === "Spanish" ? "PORTERÍAS 0" : "CLEAN SHEETS") : (language === "Spanish" ? "ASISTENCIAS" : "ASSISTS");
  const topRightValue = level.isGK ? level.goalsConceded : level.goals;
  const botRightValue = level.isGK ? level.cleanSheets : level.assists;
  const positionDisplay = translatePosition(level.position, language);

  // entrance: the top boxes drop in
  const boxesIn = spring({ frame: frame - 6, fps: DESIGN_FPS, config: { damping: 14, mass: 0.8, stiffness: 130 }, durationInFrames: 30 });
  const boxesY = interpolate(boxesIn, [0, 1], [-60, 0]);
  const boxesOp = interpolate(frame, [6, 18], [0, 1], clamp);

  // Flag waves a bit harder on reveal.
  const flagIntensity = 1 + interpolate(revealProgress, [0, 1], [0, 0.9], clamp);

  // Flag geometry (behind player, centred) — a little smaller
  const FLAG_W = 760;
  const FLAG_H = 412;

  const posFontSize = positionDisplay.length > 11 ? 30 : positionDisplay.length > 8 ? 38 : 56;

  return (
    <AbsoluteFill>
      {/* soft vignette so the flag + player read against any theme bg */}
      <AbsoluteFill style={{ background: "radial-gradient(ellipse 60% 70% at 50% 64%, rgba(0,0,0,0.42) 0%, rgba(0,0,0,0.18) 45%, rgba(0,0,0,0) 72%)" }} />

      {/* ── Waving flag backdrop (behind the player) ── */}
      {flagSrc ? (
        <div style={{ position: "absolute", left: "50%", top: 404, transform: "translateX(-50%) rotate(-1.2deg)", width: FLAG_W, height: FLAG_H, zIndex: 10 }}>
          <Flagpole height={FLAG_H} />
          <WavingFlag src={flagSrc} width={FLAG_W} height={FLAG_H} frame={frame} intensity={flagIntensity} />
        </div>
      ) : null}

      {/* ── Hero player (in front of the flag) ── */}
      <HeroPlayer photoSrc={photoSrc} revealProgress={revealProgress} />

      {/* (reveal burst removed — no light-rays/shock-ring/flash; the player's
          scale-grow + glow on reveal is kept in HeroPlayer.) */}

      {/* ── Top cluster: [Position / Games] · [CLUBS 2×] · [Goals / Assists] ── */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: 40,
          transform: `translate(-50%, ${boxesY}px)`,
          opacity: boxesOp * uiOpacity,
          display: "flex",
          flexDirection: "row",
          alignItems: "flex-start",
          gap: COL_GAP,
          zIndex: 40,
        }}
      >
        {/* LEFT column: Position (top) + Games (bottom) */}
        <div style={{ display: "flex", flexDirection: "column", gap: STACK_GAP }}>
          <StatCard
            label={posLabel}
            value={<span style={{ fontSize: posFontSize, lineHeight: 1.05, whiteSpace: "nowrap" }}>{positionDisplay || "—"}</span>}
            width={STAT_W}
            height={STAT_H}
          />
          <StatCard label={gamesLabel} value={String(level.games ?? "—")} width={STAT_W} height={STAT_H} />
        </div>

        {/* CENTRE: CLUBS — spans both rows (2× size) */}
        <ClubsCard clubs={level.clubs} label={clubsLabel} width={CLUBS_W} height={STACK_H} />

        {/* RIGHT column: Goals (top) + Assists (bottom) */}
        <div style={{ display: "flex", flexDirection: "column", gap: STACK_GAP }}>
          <StatCard label={topRightLabel} value={<span style={{ fontSize: String(topRightValue).length > 4 ? 44 : 60 }}>{String(topRightValue ?? "—")}</span>} width={STAT_W} height={STAT_H} />
          <StatCard label={botRightLabel} value={<span style={{ fontSize: String(botRightValue).length > 4 ? 44 : 60 }}>{String(botRightValue ?? "—")}</span>} width={STAT_W} height={STAT_H} />
        </div>
      </div>

      {/* ── Name banner (reveal) ── */}
      {muteReveal ? null : <NameBanner playerName={level.playerName} display={level.display} revealProgress={revealProgress} />}

      {/* ── UI widgets ── */}
      <LevelBadge frame={frame} n={levelNumber} opacity={uiOpacity} />
      <Timer frame={frame} opacity={uiOpacity} />

      {/* ── Audio ── */}
      <Sequence from={f(REVEAL_START - 30)} durationInFrames={f(30)}>
        <Audio src={staticFile(audioManifest.ticking)} volume={0.8} />
      </Sequence>
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
