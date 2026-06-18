// Shared types + helpers for the 5 hidden-player templates.
// A template renders the WHOLE visual layer of a Level (clues, silhouette,
// reveal, its own timer + level badge, ambient objects). Level.tsx owns the
// audio and feeds every template the same TemplateProps.
import React from "react";
import { Easing, Img, interpolate, spring } from "remotion";
import { DESIGN_FPS } from "@shared/timing";
import { fontFamily } from "@shared/theme";
import type { Language } from "@shared/paths";
import type { ResolvedLevel } from "../level-data";

export const REVEAL_START = 185; // design frame the player is revealed at

// ── Clue reveal schedule ───────────────────────────────────────────────────────
// The four clues pop in one after another during the countdown, all settled
// well before the reveal so the last seconds are pure tension.
export const CLUE_START_FRAMES = [24, 54, 84, 114] as const; // club, position, country, age

// 0 → 1 spring for clue `i` (0..3). Use for scale/opacity/slide-in.
export const clueSpring = (frame: number, i: number, durationInFrames = 26): number =>
  spring({
    frame: frame - CLUE_START_FRAMES[i],
    fps: DESIGN_FPS,
    config: { damping: 13, mass: 0.8, stiffness: 150 },
    durationInFrames,
  });

// Generic pop-in spring anchored at an arbitrary start frame.
export const popSpring = (
  frame: number,
  startFrame: number,
  cfg?: { damping?: number; mass?: number; stiffness?: number; durationInFrames?: number },
): number =>
  spring({
    frame: frame - startFrame,
    fps: DESIGN_FPS,
    config: { damping: cfg?.damping ?? 12, mass: cfg?.mass ?? 0.8, stiffness: cfg?.stiffness ?? 160 },
    durationInFrames: cfg?.durationInFrames ?? 28,
  });

// ── Position abbreviation EN → ES (mirrors the browser runner) ──────────────────
const POSITION_ABBREV_EN_TO_ES: Record<string, string> = {
  GK: "POR", CB: "DFC", LB: "LTI", LWB: "CAI", RB: "LTD", RWB: "CAD",
  CDM: "MCD", CM: "MC", CAM: "MCO", LM: "MI", RM: "MD",
  LW: "EI", RW: "ED", CF: "MP", ST: "DC",
};
export const translatePosition = (abbrev: string, language: Language): string => {
  if (!abbrev) return abbrev;
  if (language !== "Spanish") return abbrev;
  return POSITION_ABBREV_EN_TO_ES[abbrev] ?? abbrev;
};

export const ageUnit = (age: number | string, language: Language): string => {
  const n = Number(age);
  return language === "Spanish"
    ? n === 1 ? "AÑO" : "AÑOS"
    : n === 1 ? "YEAR" : "YEARS";
};

export const clueLabel = (
  key: "club" | "position" | "country" | "age",
  language: Language,
): string => {
  const en = { club: "CLUB", position: "POSITION", country: "NATION", age: "AGE" };
  const es = { club: "CLUB", position: "POSICIÓN", country: "PAÍS", age: "EDAD" };
  return (language === "Spanish" ? es : en)[key];
};

// Split a name into "all-but-last" + "last word" for the reveal banner.
export const nameParts = (playerName: string, display: string) => {
  const words = (playerName || display || "").trim().toUpperCase().split(/\s+/).filter(Boolean);
  return {
    first: words.slice(0, -1).join(" "),
    last: words[words.length - 1] ?? "",
    full: words.join(" "),
  };
};

// Black-silhouette filter (matches the browser runner's hidden-player look).
export const SILHOUETTE_FILTER =
  "brightness(0) contrast(0) brightness(0.16) contrast(3.5) saturate(0) " +
  "drop-shadow(-1px -1px 2px rgba(70,95,130,0.22)) " +
  "drop-shadow(2px 3px 4px rgba(0,0,0,0.85)) " +
  "drop-shadow(4px 8px 16px rgba(0,0,0,0.6)) " +
  "drop-shadow(6px 18px 36px rgba(0,0,0,0.4))";

// Cross-fade helpers from revealProgress.
export const silhouetteOpacity = (rp: number) =>
  interpolate(rp, [0, 1], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
export const colorOpacity = (rp: number) =>
  interpolate(rp, [0, 1], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

// ── Props every template receives ───────────────────────────────────────────────
export interface TemplateProps {
  level: ResolvedLevel;
  levelNumber: number;
  language: Language;
  frame: number;          // design frame (30fps space)
  revealProgress: number; // 0 (hidden) → 1 (revealed)
  uiOpacity: number;      // timer/badge fade as the reveal happens
  secs: number;           // whole seconds left on the countdown
  timerRemain: number;    // 1 → 0 over the countdown
  photoSrc: string | null;
  clubSrc: string | null;
  flagSrc: string | null;
}

export type TemplateComponent = React.FC<TemplateProps>;

// A small deterministic pseudo-random (no Math.random — keeps renders stable).
export const rand = (seed: number): number => {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
};

const clampOpts = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

// ── HeroPlayer ─────────────────────────────────────────────────────────────────
// The BIG full-body player (ported from runner 4): every photo scaled to the same
// height, bottom-anchored, centred, aspect kept. Hidden = rim-lit black silhouette;
// reveal = in-place colour materialise (mask wipe up from the feet) + slight grow.
// Templates that want the "full size photo" look render this instead of a small
// contained portrait. `bottom`/`heroH` let a template seat the figure on a podium.
export const HeroPlayer: React.FC<{
  photoSrc: string | null;
  revealProgress: number;
  heroH?: number;
  bottom?: number;
  rimColor?: string;
  zIndex?: number;
}> = ({ photoSrc, revealProgress: p, heroH = 690, bottom = 0, rimColor = "rgba(150,200,255,0.4)", zIndex = 30 }) => {
  const silOpacity = interpolate(p, [0.12, 0.82], [1, 0], clampOpts);
  const cut = interpolate(p, [0, 1], [-18, 106], clampOpts);
  const colorMask = `linear-gradient(to top, #000 ${cut}%, rgba(0,0,0,0) ${cut + 18}%)`;
  const colorOpacity = interpolate(p, [0.02, 0.18], [0, 1], clampOpts);
  const pop = interpolate(p, [0, 0.55], [1, 1.08], { easing: Easing.out(Easing.cubic), ...clampOpts });

  const silFilter =
    "brightness(0) saturate(0) " +
    "drop-shadow(0 0 3px rgba(255,255,255,0.6)) " +
    `drop-shadow(0 0 16px ${rimColor}) ` +
    "drop-shadow(0 18px 30px rgba(0,0,0,0.6))";
  const colorFilter = "brightness(1.02) contrast(1.02) saturate(1.06) drop-shadow(0 16px 34px rgba(0,0,0,0.6))";
  const imgStyle: React.CSSProperties = { height: "100%", width: "auto", objectFit: "contain", objectPosition: "center bottom", display: "block" };

  return (
    <div style={{ position: "absolute", left: 0, right: 0, bottom, height: heroH, transform: `scale(${pop})`, transformOrigin: "center bottom", zIndex, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div style={{ position: "absolute", bottom: 6, left: "50%", transform: "translateX(-50%)", width: 460, height: 54, borderRadius: "50%", background: "radial-gradient(ellipse at center, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.22) 50%, rgba(0,0,0,0) 78%)", filter: "blur(6px)" }} />
      {photoSrc ? (
        <>
          <div style={{ position: "relative", height: "100%", display: "flex", alignItems: "flex-end", opacity: silOpacity }}>
            <Img src={photoSrc} style={{ ...imgStyle, filter: silFilter }} />
          </div>
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

// ── RevealName ──────────────────────────────────────────────────────────────────
// Big stroked name banner that slams up from the bottom on reveal (runner-4 style).
// `accent` colours the last word; templates pass their own accent.
export const RevealName: React.FC<{
  playerName: string; display: string; revealProgress: number;
  accent?: string; bottom?: number;
}> = ({ playerName, display, revealProgress: p, accent = "#ffd24a", bottom = 46 }) => {
  const { first, last } = nameParts(playerName, display);
  const slam = interpolate(p, [0.28, 0.5], [0, 1], clampOpts);
  if (slam <= 0) return null;
  const ty = interpolate(slam, [0, 1], [70, 0]);
  const scale = interpolate(slam, [0, 0.7, 1], [0.7, 1.05, 1]);
  const COND = "'Barlow Condensed', " + fontFamily;
  return (
    <div style={{ position: "absolute", left: "50%", bottom, transform: `translate(-50%, ${ty}px) scale(${scale})`, transformOrigin: "center bottom", opacity: slam, textAlign: "center", zIndex: 50, width: 1600 }}>
      {first ? (
        <div style={{ fontFamily: COND, fontWeight: 800, fontSize: 64, lineHeight: 0.95, letterSpacing: "0.1em", color: "#fff", WebkitTextStroke: "4px rgba(8,12,20,0.95)", paintOrder: "stroke", textShadow: "0 4px 14px rgba(0,0,0,0.95)", whiteSpace: "nowrap" }}>{first}</div>
      ) : null}
      <div style={{ fontFamily: COND, fontWeight: 900, fontSize: 144, lineHeight: 0.88, letterSpacing: "0.02em", color: accent, WebkitTextStroke: "6px rgba(8,12,20,0.95)", paintOrder: "stroke", textShadow: "0 8px 28px rgba(0,0,0,0.95)", whiteSpace: "nowrap" }}>{last}</div>
    </div>
  );
};
