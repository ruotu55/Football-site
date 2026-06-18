// Template — "Synthwave Arcade".
// Retro-80s synthwave / arcade scene: animated neon perspective grid floor, a big
// horizontal-stripe neon SUN low on the horizon, scanlines, and glossy "arcade
// score panel" tiles that slide up + flicker-on for the four clues. The hero stands
// on the grid like a sprite with a magenta/cyan neon rim. Reveal = neon name with a
// chromatic-shift double-image. PURE presentational — no useCurrentFrame.
import React from "react";
import { AbsoluteFill, interpolate, Img } from "remotion";
import { fontFamily } from "@shared/theme";
import {
  clueSpring, translatePosition, ageUnit, clueLabel,
  HeroPlayer, RevealName, rand, type TemplateProps,
} from "./common";

const COND = "'Barlow Condensed', sans-serif";
const MAGENTA = "#ff2bd6";
const CYAN = "#18e0ff";
const ORANGE = "#ff7a00";
const NEAR_BLACK = "#0a0420";
const ACCENT = "#ff2bd6";

const clampOpts = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

// Layered neon glow text-shadow.
const neonGlow = (color: string, size = 1) =>
  `0 0 ${6 * size}px ${color}, 0 0 ${14 * size}px ${color}, 0 0 ${30 * size}px ${color}aa, 0 4px 10px rgba(0,0,0,0.7)`;

// ── Neon perspective grid floor (CSS, scrolling toward the viewer) ──────────────
const GridFloor: React.FC<{ frame: number }> = ({ frame }) => {
  const HORIZON = 660;        // y of the horizon line
  const FLOOR_H = 1080 - HORIZON;
  // Horizontal lines crawl toward the camera (loop the phase 0..1).
  const phase = (frame * 0.018) % 1;
  const rows: React.ReactNode[] = [];
  for (let i = 0; i < 18; i++) {
    // Position grows non-linearly so rows bunch at the horizon and spread near us.
    const f = ((i + phase) / 18);
    const y = HORIZON + Math.pow(f, 2.3) * FLOOR_H;
    const op = interpolate(f, [0, 0.08, 1], [0, 0.85, 0.95], clampOpts);
    rows.push(
      <div key={`h${i}`} style={{
        position: "absolute", left: 0, right: 0, top: y, height: 2,
        background: CYAN, opacity: op,
        boxShadow: `0 0 6px ${CYAN}, 0 0 14px ${CYAN}aa`,
      }} />,
    );
  }
  // Vertical lines fan out from a vanishing point at screen centre on the horizon.
  const cols: React.ReactNode[] = [];
  const VP_X = 960;
  for (let i = -10; i <= 10; i++) {
    const spread = i / 10;          // -1..1
    const topX = VP_X + spread * 90; // narrow near the horizon
    const botX = VP_X + spread * 1700; // wide near the camera
    const len = Math.hypot(botX - topX, FLOOR_H);
    const ang = Math.atan2(FLOOR_H, botX - topX) * (180 / Math.PI);
    cols.push(
      <div key={`v${i}`} style={{
        position: "absolute", left: topX, top: HORIZON, width: len, height: 2,
        background: CYAN, opacity: 0.55,
        boxShadow: `0 0 5px ${CYAN}, 0 0 12px ${CYAN}99`,
        transformOrigin: "left center", transform: `rotate(${ang}deg)`,
      }} />,
    );
  }
  return (
    <div style={{ position: "absolute", inset: 0, zIndex: 6, overflow: "hidden", pointerEvents: "none" }}>
      {/* dark floor wash under the grid */}
      <div style={{ position: "absolute", left: 0, right: 0, top: HORIZON, bottom: 0,
        background: `linear-gradient(to bottom, ${NEAR_BLACK} 0%, #14063a 60%, #1e0840 100%)` }} />
      {cols}
      {rows}
      {/* haze fading the far grid into the horizon */}
      <div style={{ position: "absolute", left: 0, right: 0, top: HORIZON - 4, height: 120,
        background: `linear-gradient(to bottom, ${NEAR_BLACK}, rgba(10,4,32,0) )` }} />
    </div>
  );
};

// ── Neon sun: half-circle with horizontal stripe cut-outs ───────────────────────
const NeonSun: React.FC<{ frame: number }> = ({ frame }) => {
  const SUN = 520;
  const pulse = 1 + 0.012 * Math.sin(frame * 0.12);
  // Horizontal stripes that thicken toward the bottom of the sun.
  const stripes = `repeating-linear-gradient(to bottom,
    rgba(0,0,0,0) 0px, rgba(0,0,0,0) 6px,
    ${NEAR_BLACK} 6px, ${NEAR_BLACK} 6px)`;
  return (
    <div style={{ position: "absolute", left: "50%", top: 660 - SUN * 0.66, transform: `translateX(-50%) scale(${pulse})`,
      width: SUN, height: SUN, zIndex: 4, pointerEvents: "none" }}>
      <div style={{ position: "absolute", inset: 0, borderRadius: "50%",
        background: `linear-gradient(to bottom, ${ORANGE} 0%, ${MAGENTA} 55%, #b3009e 100%)`,
        boxShadow: `0 0 80px 20px ${MAGENTA}66, 0 0 160px 40px ${ORANGE}44`,
        filter: "saturate(1.2)" }} />
      {/* striped lower half (graduated bars getting bigger downward) */}
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <div key={i} style={{
          position: "absolute", left: 0, right: 0,
          top: `${56 + i * 7}%`, height: `${3 + i * 1.4}%`,
          background: NEAR_BLACK,
          borderRadius: 999,
        }} />
      ))}
      {/* the static stripe texture too (subtle) */}
      <div style={{ position: "absolute", inset: 0, borderRadius: "50%", background: stripes, opacity: 0.0 }} />
    </div>
  );
};

// ── Scanlines overlay ───────────────────────────────────────────────────────────
const Scanlines: React.FC = () => (
  <div style={{ position: "absolute", inset: 0, zIndex: 70, pointerEvents: "none",
    background: "repeating-linear-gradient(to bottom, rgba(0,0,0,0) 0px, rgba(0,0,0,0) 2px, rgba(0,0,0,0.18) 3px, rgba(0,0,0,0) 4px)",
    mixBlendMode: "multiply", opacity: 0.6 }} />
);

// ── Arcade score panel tile (slides up from below + flicker-on) ─────────────────
const ScorePanel: React.FC<{
  appear: number; frame: number; seed: number; label: string; glow: string; children: React.ReactNode;
}> = ({ appear, frame, seed, label, glow, children }) => {
  const t = Math.max(0, Math.min(1, appear));
  const ty = interpolate(t, [0, 1], [170, 0], clampOpts);          // slides UP from below
  const baseOp = interpolate(appear, [0, 0.22], [0, 1], clampOpts);
  // Quick flicker-on for the first ~14 frames after the panel begins to appear.
  const flickerWindow = interpolate(appear, [0, 0.55], [1, 0], clampOpts); // 1→0
  const flick = 0.35 + 0.65 * rand(Math.floor(frame * 1.7) + seed * 31.7);
  const op = baseOp * (1 - flickerWindow * (1 - flick));
  return (
    <div style={{
      width: 326, height: 226, transform: `translateY(${ty}px)`, opacity: op,
      borderRadius: 16, position: "relative", overflow: "hidden",
      background: "linear-gradient(165deg, rgba(28,10,56,0.96), rgba(10,4,32,0.96))",
      border: `2px solid ${glow}`,
      boxShadow: `0 0 12px ${glow}, 0 0 28px ${glow}88, inset 0 0 22px ${glow}33, 0 22px 46px rgba(0,0,0,0.6)`,
      display: "flex", flexDirection: "column",
    }}>
      {/* glossy top sheen */}
      <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: "46%",
        background: "linear-gradient(to bottom, rgba(255,255,255,0.16), rgba(255,255,255,0))", pointerEvents: "none" }} />
      <div style={{ fontFamily: COND, fontWeight: 800, fontSize: 28, letterSpacing: "0.22em",
        color: glow, textAlign: "center", paddingTop: 14, textShadow: neonGlow(glow, 0.7) }}>{label}</div>
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "2px 14px 14px" }}>{children}</div>
    </div>
  );
};

export const SynthwaveArcade: React.FC<TemplateProps> = (p) => {
  const { level, language, frame, revealProgress: rp, secs, timerRemain, uiOpacity, levelNumber } = p;

  // Chromatic-shift double image strength for the reveal name (gentle wobble).
  const chroma = interpolate(rp, [0.28, 0.5], [0, 1], clampOpts);
  const chromaShift = chroma * (3 + 1.5 * Math.sin(frame * 0.4));

  // Number colors per panel.
  const panelGlow = [CYAN, ORANGE, MAGENTA, CYAN];

  return (
    <AbsoluteFill style={{ background: `radial-gradient(ellipse 90% 80% at 50% 18%, #1a0846 0%, ${NEAR_BLACK} 70%)` }}>
      {/* far starfield-ish vignette top */}
      <div style={{ position: "absolute", inset: 0, zIndex: 2,
        background: "radial-gradient(ellipse 70% 50% at 50% 70%, rgba(255,43,214,0.10), rgba(0,0,0,0) 70%)" }} />

      <NeonSun frame={frame} />
      <GridFloor frame={frame} />

      {/* hero sprite on the grid */}
      <HeroPlayer photoSrc={p.photoSrc} revealProgress={rp} rimColor="rgba(255,43,214,0.55)" zIndex={30} />

      {/* top row of arcade score panels — kept high (top ~46) so the hero stays clear */}
      <div style={{ position: "absolute", top: 46, left: "50%", transform: "translateX(-50%)", display: "flex", gap: 30, zIndex: 40 }}>
        <ScorePanel appear={clueSpring(frame, 0)} frame={frame} seed={1} label={clueLabel("club", language)} glow={panelGlow[0]}>
          {p.clubSrc
            ? <Img src={p.clubSrc} style={{ maxWidth: "80%", maxHeight: 124, objectFit: "contain", filter: `drop-shadow(0 0 10px ${CYAN}88) drop-shadow(0 3px 8px rgba(0,0,0,0.6))` }} />
            : <span style={{ fontFamily: COND, fontSize: 84, fontWeight: 800, color: "#fff", textShadow: neonGlow(CYAN) }}>?</span>}
        </ScorePanel>

        <ScorePanel appear={clueSpring(frame, 1)} frame={frame} seed={2} label={clueLabel("position", language)} glow={panelGlow[1]}>
          <span style={{ fontFamily: COND, fontWeight: 900, fontSize: 104, color: "#fff", textShadow: neonGlow(ORANGE, 1.1) }}>{translatePosition(level.position, language)}</span>
        </ScorePanel>

        <ScorePanel appear={clueSpring(frame, 2)} frame={frame} seed={3} label={clueLabel("country", language)} glow={panelGlow[2]}>
          {p.flagSrc
            ? <Img src={p.flagSrc} style={{ width: 176, height: 116, objectFit: "cover", borderRadius: 6, boxShadow: `0 0 10px ${MAGENTA}88, 0 4px 12px rgba(0,0,0,0.6)` }} />
            : <span style={{ fontFamily: COND, fontWeight: 800, fontSize: 36, color: "#fff", textShadow: neonGlow(MAGENTA) }}>{level.country}</span>}
        </ScorePanel>

        <ScorePanel appear={clueSpring(frame, 3)} frame={frame} seed={4} label={ageUnit(level.age, language)} glow={panelGlow[3]}>
          <span style={{ fontFamily: COND, fontWeight: 900, fontSize: 112, color: "#fff", textShadow: neonGlow(CYAN, 1.1) }}>{level.age ?? "?"}</span>
        </ScorePanel>
      </div>

      {/* Reveal name with chromatic-shift double-image (magenta + cyan ghosts) */}
      {chroma > 0 ? (
        <>
          <div style={{ position: "absolute", inset: 0, zIndex: 49, transform: `translateX(${-chromaShift}px)`, opacity: 0.55, mixBlendMode: "screen" }}>
            <RevealName playerName={level.playerName} display={level.display} revealProgress={rp} accent={CYAN} />
          </div>
          <div style={{ position: "absolute", inset: 0, zIndex: 49, transform: `translateX(${chromaShift}px)`, opacity: 0.55, mixBlendMode: "screen" }}>
            <RevealName playerName={level.playerName} display={level.display} revealProgress={rp} accent={ORANGE} />
          </div>
        </>
      ) : null}
      <RevealName playerName={level.playerName} display={level.display} revealProgress={rp} accent={ACCENT} />

      {/* level badge — arcade "PLAYER" coin */}
      <div style={{ position: "absolute", top: 40, left: 44, zIndex: 60, opacity: uiOpacity,
        width: 122, height: 122, borderRadius: 18,
        background: "linear-gradient(160deg, rgba(28,10,56,0.96), rgba(10,4,32,0.96))",
        border: `2px solid ${MAGENTA}`,
        boxShadow: `0 0 12px ${MAGENTA}, 0 0 26px ${MAGENTA}88, inset 0 0 18px ${MAGENTA}33`,
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <div style={{ fontFamily: COND, fontWeight: 700, fontSize: 18, letterSpacing: "0.18em", color: MAGENTA, textShadow: neonGlow(MAGENTA, 0.6) }}>LVL</div>
        <div style={{ fontFamily: COND, fontWeight: 900, fontSize: 70, color: "#fff", lineHeight: 0.9, textShadow: neonGlow(MAGENTA, 1) }}>{levelNumber}</div>
      </div>

      {/* timer — neon arcade gauge */}
      <div style={{ position: "absolute", top: 40, right: 44, zIndex: 60, opacity: uiOpacity, width: 132, height: 132 }}>
        <svg width={132} height={132}>
          <circle cx={66} cy={66} r={54} fill="rgba(10,4,32,0.85)" stroke="rgba(255,255,255,0.12)" strokeWidth={12} />
          <circle cx={66} cy={66} r={54} fill="none"
            stroke={timerRemain < 0.18 ? ORANGE : CYAN} strokeWidth={12} strokeLinecap="round"
            strokeDasharray={2 * Math.PI * 54} strokeDashoffset={2 * Math.PI * 54 * (1 - timerRemain)}
            transform="rotate(-90 66 66)"
            style={{ filter: `drop-shadow(0 0 6px ${timerRemain < 0.18 ? ORANGE : CYAN})` }} />
        </svg>
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
          fontFamily: COND, fontWeight: 900, fontSize: 62, color: "#fff",
          textShadow: neonGlow(timerRemain < 0.18 ? ORANGE : CYAN, 1) }}>{secs}</div>
      </div>

      <Scanlines />
    </AbsoluteFill>
  );
};
