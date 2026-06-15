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

// ── LevelBadge (top-left) — identical to runners 1/2 ──────────────────────────
const LevelBadge: React.FC<{ frame: number; n: number; opacity: number }> = ({ frame, n, opacity }) => {
  const pop = spring({ frame, fps: DESIGN_FPS, config: { damping: 9, mass: 0.8, stiffness: 170 }, durationInFrames: 32 });
  const scale = interpolate(pop, [0, 1], [0.2, 1]);
  return (
    <div style={{ position: "absolute", top: 34, left: 40, opacity, transform: `scale(${scale})`, transformOrigin: "top left", zIndex: 40 }}>
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

// ── Timer (top-right) — identical to runners 1/2 ──────────────────────────────
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
    <div style={{ position: "absolute", top: 34, right: 40, width: 162, height: 162, opacity, transform: `scale(${scale})`, transformOrigin: "top right", zIndex: 40 }}>
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
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontFamily, fontWeight: 800, fontSize: 72, color: COLORS.white, textShadow: "0 2px 6px rgba(0,0,0,0.6)" }}>
        {secs}
      </div>
    </div>
  );
};

// ── Career Path ─────────────────────────────────────────────────────────────
// A single horizontal row of club crests (white cards) joined by arrow discs, in
// chronological order, with the year under each crest. The crest size SCALES with
// the club count so any career (1..14 clubs) fits across the frame in one row:
// big when few, small when many. Crests + arrows pop in staggered.
const CAREER_AVAIL_W = 1740; // usable width for the whole row
const ARROW_FACTOR = 0.42; // arrow disc element width = crest * this
const GAP_FACTOR = 0.1; // flex gap (each side of an arrow) = crest * this

const careerCrestSize = (n: number): number => {
  const jointW = ARROW_FACTOR + 2 * GAP_FACTOR; // width consumed by one arrow + its two gaps, in crest units
  return Math.max(78, Math.min(300, CAREER_AVAIL_W / (n + (n - 1) * jointW)));
};

const ArrowDisc: React.FC<{ size: number; t: number }> = ({ size, t }) => {
  const d = size * 0.34; // disc diameter
  const scale = interpolate(t, [0, 1], [0.2, 1]);
  const op = interpolate(t, [0, 0.5], [0, 1], { extrapolateRight: "clamp" });
  return (
    <div style={{ width: size * ARROW_FACTOR, height: size, display: "flex", alignItems: "center", justifyContent: "center", flex: "0 0 auto", opacity: op, transform: `scale(${scale})` }}>
      <div
        style={{
          width: d,
          height: d,
          borderRadius: "50%",
          background: "radial-gradient(circle at 50% 34%, #1a2430 0%, #0a1119 100%)",
          border: "2px solid rgba(255,255,255,0.16)",
          boxShadow: "0 8px 20px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.12)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <svg width={d * 0.5} height={d * 0.5} viewBox="0 0 24 24" style={{ overflow: "visible" }}>
          <polyline points="8,5 16,12 8,19" fill="none" stroke={COLORS.accent} strokeWidth={3.4} strokeLinecap="round" strokeLinejoin="round" style={{ filter: "drop-shadow(0 0 4px rgba(255,202,40,0.4))" }} />
        </svg>
      </div>
    </div>
  );
};

const CrestCard: React.FC<{ entry: { club: string; year: string; crestPath: string | null }; size: number; frame: number; delay: number }> = ({
  entry,
  size,
  frame,
  delay,
}) => {
  const pop = spring({ frame, fps: DESIGN_FPS, config: { damping: 11, mass: 0.7, stiffness: 175 }, delay, durationInFrames: 26 });
  const scale = interpolate(pop, [0, 1], [0.3, 1]);
  const drop = interpolate(pop, [0, 1], [-size * 0.22, 0]);
  const op = interpolate(pop, [0, 0.35], [0, 1], { extrapolateRight: "clamp" });
  const crestSrc = sharedSrc(entry.crestPath);
  const yearSize = Math.max(20, size * 0.21);
  // Continuous up/down bob while the question plays — ramps in after the card lands,
  // and each card is phase-staggered by its delay so the row ripples like a wave.
  const settled = interpolate(pop, [0.55, 1], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const floatAmp = Math.min(22, Math.max(9, size * 0.05));
  const float = Math.sin(((frame - delay) / DESIGN_FPS) * 1.9 + delay * 0.55) * floatAmp * settled;
  const tilt = Math.cos(((frame - delay) / DESIGN_FPS) * 1.9 + delay * 0.55) * 1.1 * settled;
  return (
    <div
      style={{
        flex: "0 0 auto",
        width: size,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: size * 0.11,
        opacity: op,
        transform: `translateY(${drop + float}px) rotate(${tilt}deg) scale(${scale})`,
      }}
    >
      <div
        style={{
          position: "relative",
          width: size,
          height: size,
          borderRadius: size * 0.2,
          // uniform see-through glass — single transparency, no top sheen
          background: "rgba(255,255,255,0.15)",
          backdropFilter: "blur(16px) saturate(1.4)",
          WebkitBackdropFilter: "blur(16px) saturate(1.4)",
          border: "1.5px solid rgba(255,255,255,0.45)",
          boxShadow: "0 18px 40px rgba(0,0,0,0.4), inset 0 0 0 1px rgba(255,255,255,0.1)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: size * 0.07,
          overflow: "hidden",
        }}
      >
        {crestSrc ? (
          <Img src={crestSrc} style={{ position: "relative", maxWidth: "100%", maxHeight: "100%", objectFit: "contain", filter: "drop-shadow(0 3px 8px rgba(0,0,0,0.3))" }} />
        ) : (
          <div style={{ position: "relative", fontFamily, fontWeight: 800, fontSize: size * 0.34, color: "rgba(255,255,255,0.55)" }}>?</div>
        )}
      </div>
      {entry.year ? (
        <div
          style={{
            fontFamily: "'Barlow Condensed', sans-serif",
            fontWeight: 800,
            fontSize: yearSize,
            color: COLORS.white,
            letterSpacing: "0.03em",
            whiteSpace: "nowrap",
            textShadow: "0 3px 10px rgba(0,0,0,0.75), 0 1px 0 rgba(0,0,0,0.5)",
          }}
        >
          {entry.year}
        </div>
      ) : null}
    </div>
  );
};

const CareerRow: React.FC<{ careerHistory: { club: string; year: string; crestPath: string | null }[]; frame: number }> = ({ careerHistory, frame }) => {
  const n = careerHistory.length;
  if (!n) return null;
  const size = careerCrestSize(n);
  const STAGGER = 6;
  return (
    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "center", gap: size * GAP_FACTOR, maxWidth: CAREER_AVAIL_W }}>
      {careerHistory.map((entry, i) => {
        const delay = 8 + i * STAGGER;
        const arrowT = spring({ frame, fps: DESIGN_FPS, config: { damping: 14, mass: 0.6, stiffness: 150 }, delay: delay + 5, durationInFrames: 16 });
        return (
          <React.Fragment key={i}>
            <CrestCard entry={entry} size={size} frame={frame} delay={delay} />
            {i < n - 1 ? <ArrowDisc size={size} t={arrowT} /> : null}
          </React.Fragment>
        );
      })}
    </div>
  );
};

// ── colour helpers — derive the silhouette tint + glow from the background theme ──
type Rgb = { r: number; g: number; b: number };
const hexToRgb = (hex: string): Rgb => {
  const h = (hex || "").replace("#", "");
  const n = h.length === 3 ? h.split("").map((c) => c + c).join("") : h.slice(0, 6);
  const int = parseInt(n || "2a3340", 16);
  return Number.isNaN(int) ? { r: 42, g: 51, b: 64 } : { r: (int >> 16) & 255, g: (int >> 8) & 255, b: int & 255 };
};
const scaleRgb = ({ r, g, b }: Rgb, f: number) => `rgb(${Math.round(r * f)}, ${Math.round(g * f)}, ${Math.round(b * f)})`;
const lightenRgb = ({ r, g, b }: Rgb, t: number): Rgb => ({ r: Math.round(r + (255 - r) * t), g: Math.round(g + (255 - g) * t), b: Math.round(b + (255 - b) * t) });
const rgba = ({ r, g, b }: Rgb, a: number) => `rgba(${r}, ${g}, ${b}, ${a})`;
// A dark, theme-tinted gradient for the hidden figure (always darker than the bg so it
// reads on ANY background) + a lighter same-hue glow for the rim/backlight.
export const silhouetteColorsFor = (bgColorHex: string) => {
  const base = hexToRgb(bgColorHex);
  return {
    tint: `linear-gradient(178deg, ${scaleRgb(base, 0.52)} 0%, ${scaleRgb(base, 0.34)} 34%, ${scaleRgb(base, 0.2)} 64%, ${scaleRgb(base, 0.1)} 100%)`,
    glow: lightenRgb(base, 0.5),
  };
};

// ── Player portrait — bottom-anchored, hidden silhouette → smooth colour reveal ──
// The player is anchored to the BOTTOM EDGE of the frame (cropped at the bottom,
// never floating). Question: a dark theme-tinted silhouette lit by a soft cool
// BACKLIGHT behind it (clean rim, not a flat blob) + a ground shadow so it sits on
// the floor. Reveal: a SMOOTH crossfade — the colour photo eases up from the feet
// and the silhouette dissolves away. No flashes, scan lines, or glow bursts.
// EVERY player photo is scaled to EXACTLY this height (px in the 1080 canvas) — same
// normalization runner 4 uses (HeroPlayer PLAYER_H). The Img uses `height:100%` of this
// box with `width:auto`, so all players share one height regardless of photo aspect, and
// the SAME box drives both the hidden silhouette and the colour reveal → hidden and
// revealed are always identical height (no reveal-grow here). 1044 ≈ the previous "97%".
const PLAYER_H = 1044;
const PLAYER_IMG_STYLE = { height: "100%", width: "auto", objectFit: "contain", objectPosition: "center bottom", display: "block" } as const;

const PlayerPortrait: React.FC<{ photoSrc: string | null; silhouetteTint: string; glow: Rgb; revealProgress: number; frame: number }> = ({ photoSrc, silhouetteTint, glow, revealProgress: p, frame }) => {
  // Hidden look: a black base (for the shape + clean rim glow) tinted with a dark
  // theme-coloured gradient painted into the player's exact silhouette (the photos are
  // cutouts, so their alpha = the player shape). Softer + more dimensional than flat
  // black, and it MATCHES whatever background/competition theme is active.
  const silhouetteFilter = `brightness(0) saturate(0) drop-shadow(0 0 5px ${rgba(glow, 0.55)}) drop-shadow(0 0 16px ${rgba(glow, 0.42)})`;
  const colorFilter = "drop-shadow(0 -2px 26px rgba(0,0,0,0.45))";
  const maskUrl = photoSrc ? `url("${photoSrc}")` : undefined;

  // Entry pop for the silhouette during the question (rise from the floor).
  const pop = spring({ frame, fps: DESIGN_FPS, config: { damping: 13, mass: 0.9, stiffness: 140 }, durationInFrames: 32 });
  const entryRise = interpolate(pop, [0, 1], [70, 0]);
  const entryOp = interpolate(pop, [0, 0.5], [0, 1], { extrapolateRight: "clamp" });

  // Reveal: the player DROPS straight down and fully OFF the bottom of the screen,
  // swaps silhouette→colour while hidden, then POPS back up from the bottom and
  // finishes IN FRONT of the logos with a landing bounce. The z-index flips while
  // it's off-screen so the behind→front swap is never seen.
  const revF = frame - REVEAL_START;
  const clamp = { extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const };
  const OFFSCREEN = 1220; // px to drop fully below the frame (portrait is ~97% of 1080)
  const DOWN = 8; // frame it reaches the bottom (off-screen)
  const UP_END = 20; // frame it finishes rising back
  // Sharp V-trough: ACCELERATE down off-screen, then IMMEDIATELY rebound back up with
  // NO flat hold at the bottom — so there's no empty-screen pause. As soon as it's
  // down, it comes back up.
  const swoopY =
    revF <= DOWN
      ? interpolate(revF, [0, DOWN], [0, OFFSCREEN], { easing: Easing.in(Easing.cubic), ...clamp })
      : interpolate(revF, [DOWN, UP_END], [OFFSCREEN, 0], { easing: Easing.out(Easing.cubic), ...clamp });
  const inFront = revF >= DOWN; // flip to the front layer at the trough
  // Crossfade silhouette → colour at the trough (briefly off-screen), so colour "pops out".
  const silhouetteOpacity = interpolate(revF, [7, 9], [1, 0], clamp);
  const colorOpacity = interpolate(revF, [7, 9], [0, 1], clamp);
  // Backlight + ground shadow only exist while the player is near the floor.
  const onFloor = interpolate(swoopY, [0, 380], [1, 0], clamp);
  const backlightOpacity = interpolate(p, [0, 1], [0.62, 0.18], clamp) * onFloor;

  return (
    <>
      {/* ground shadow — anchors the player to the floor so it never floats */}
      <div
        style={{
          position: "absolute",
          bottom: "1.5%",
          left: "50%",
          width: 760,
          height: 120,
          transform: "translateX(-50%)",
          borderRadius: "50%",
          background: "radial-gradient(ellipse at center, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0.28) 45%, rgba(0,0,0,0) 72%)",
          filter: "blur(6px)",
          opacity: onFloor,
          zIndex: 10,
          pointerEvents: "none",
        }}
      />

      {/* soft cool backlight behind the player — clean "spotlight from behind" look */}
      <div
        style={{
          position: "absolute",
          bottom: "6%",
          left: "50%",
          width: 720,
          height: 880,
          transform: "translateX(-50%)",
          borderRadius: "50%",
          background: `radial-gradient(ellipse 50% 55% at 50% 42%, ${rgba(glow, 0.5)} 0%, ${rgba(glow, 0.24)} 38%, ${rgba(glow, 0.08)} 60%, ${rgba(glow, 0)} 75%)`,
          filter: "blur(14px)",
          opacity: backlightOpacity,
          zIndex: 11,
          pointerEvents: "none",
        }}
      />

      {/* bottom-anchored portrait stack — z flips from behind (12) to in-front (26)
          of the crest row (20) at the bottom of the reveal dip */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: PLAYER_H,
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "center",
          zIndex: inFront ? 26 : 12,
          opacity: entryOp,
          transform: `translateY(${entryRise + swoopY}px)`,
          transformOrigin: "center bottom",
        }}
      >
        {photoSrc ? (
          <div style={{ position: "relative", height: "100%", display: "flex", alignItems: "flex-end" }}>
            {/* silhouette group (defines the box, dissolves as colour completes) */}
            <div style={{ position: "relative", height: "100%", display: "flex", alignItems: "flex-end", opacity: silhouetteOpacity }}>
              {/* black base — gives the shape + the soft blue rim glow */}
              <Img src={photoSrc} style={{ ...PLAYER_IMG_STYLE, filter: silhouetteFilter }} />
              {/* navy-gradient tint painted into the player shape via the cutout's alpha */}
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  background: silhouetteTint,
                  WebkitMaskImage: maskUrl,
                  maskImage: maskUrl,
                  WebkitMaskSize: "contain",
                  maskSize: "contain",
                  WebkitMaskPosition: "center bottom",
                  maskPosition: "center bottom",
                  WebkitMaskRepeat: "no-repeat",
                  maskRepeat: "no-repeat",
                }}
              />
            </div>
            {/* colour overlay — crossfades in over the silhouette during the dip */}
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "flex-end", justifyContent: "center", opacity: colorOpacity }}>
              <Img src={photoSrc} style={{ ...PLAYER_IMG_STYLE, filter: colorFilter }} />
            </div>
          </div>
        ) : (
          <div style={{ height: "100%", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
            <svg viewBox="0 0 200 280" style={{ height: "92%", width: "auto", filter: `drop-shadow(0 0 24px ${rgba(glow, 0.3)})` }}>
              <path
                fill={rgba(glow, 0.18)}
                d="M100 18c26 0 46 21 46 49 0 20-10 37-26 46 30 9 52 30 60 60 5 18 8 41 9 69H11c1-28 4-51 9-69 8-30 30-51 60-60-16-9-26-26-26-46 0-28 20-49 46-49z"
              />
            </svg>
          </div>
        )}
      </div>
    </>
  );
};

// ── Name reveal — slammed across the bottom over the player's chest ────────────
const NameReveal: React.FC<{ playerName: string; display: string; revealProgress: number; frame: number }> = ({ playerName, display, frame }) => {
  // Slams in as the player POPS back up in front of the logos (after the off-screen drop).
  const NAME_DELAY = 18;
  const namePop = spring({ frame: frame - REVEAL_START - NAME_DELAY, fps: DESIGN_FPS, config: { damping: 9, mass: 0.7, stiffness: 175 }, durationInFrames: 24 });
  const nameScale = interpolate(namePop, [0, 1], [0.55, 1]);
  const nameOpacity = interpolate(frame - REVEAL_START, [NAME_DELAY, NAME_DELAY + 8], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const rise = interpolate(namePop, [0, 1], [40, 0]);
  const words = (display || playerName || "").trim().toUpperCase().split(/\s+/).filter(Boolean);
  const firstPart = words.slice(0, -1).join(" ");
  const lastWord = words[words.length - 1] ?? "";
  if (!lastWord) return null;
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: "6%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        zIndex: 30,
        opacity: nameOpacity,
        transform: `translateY(${rise}px) scale(${nameScale})`,
        pointerEvents: "none",
      }}
    >
      {firstPart ? (
        <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 64, lineHeight: 0.95, letterSpacing: "0.16em", color: COLORS.white, textShadow: "0 4px 18px rgba(0,0,0,0.85)" }}>{firstPart}</div>
      ) : null}
      <div
        style={{
          fontFamily: "'Barlow Condensed', sans-serif",
          fontWeight: 900,
          fontSize: 150,
          lineHeight: 0.86,
          letterSpacing: "0.01em",
          color: COLORS.accent,
          textShadow: "0 6px 26px rgba(0,0,0,0.9), 0 0 22px rgba(255,202,40,0.35)",
        }}
      >
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
}> = ({ bg, level, levelNumber, language, muteReveal }) => {
  const frame = useDesignFrame();
  const k = useFrameScale();
  const f = (designFrames: number) => Math.round(designFrames * k);
  const revealVoice = language === "Spanish" ? level.revealVoiceEs : level.revealVoiceEn;
  // Silhouette tint + glow follow the active background/competition theme colour.
  const { tint: silhouetteTint, glow } = silhouetteColorsFor(bg.colorHex);

  const revealProgress = interpolate(frame, [REVEAL_START, REVEAL_START + FLIP_DURATION], [0, 1], {
    easing: EASE_FLIP,
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const uiOpacity = interpolate(revealProgress, [0, 0.5], [1, 0], { extrapolateRight: "clamp" });
  const photoSrc = sharedSrc(level.photoPath);

  // The career row stays VISIBLE but BLURS into a soft frosted backdrop behind the
  // revealed player — starting RIGHT WHEN the reveal begins (revF 0), in sync with
  // the player dropping (not after he's back). It dims a little but never disappears.
  const revF = frame - REVEAL_START;
  const rowOpacity = interpolate(revF, [0, 10], [1, 0.5], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const rowBlur = interpolate(revF, [0, 10], [0, 13], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const rowScale = interpolate(revF, [0, 12], [1, 0.97], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <AbsoluteFill>
      {/* Player — bottom-anchored, hidden → materialize reveal. */}
      <PlayerPortrait photoSrc={photoSrc} silhouetteTint={silhouetteTint} glow={glow} revealProgress={revealProgress} frame={frame} />

      {/* Career path — the clue, big crest cards in a row across the lower-centre. */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: "52%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 20,
          opacity: rowOpacity,
          filter: rowBlur > 0.05 ? `blur(${rowBlur}px)` : undefined,
          transform: `scale(${rowScale})`,
        }}
      >
        <CareerRow careerHistory={level.careerHistory} frame={frame} />
      </div>

      {/* Player name — revealed across the bottom. */}
      <NameReveal playerName={level.playerName} display={level.display} revealProgress={revealProgress} frame={frame} />

      {/* UI widgets — same as runners 1/2. */}
      <LevelBadge frame={frame} n={levelNumber} opacity={uiOpacity} />
      <Timer frame={frame} opacity={uiOpacity} />

      {/* Audio. */}
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
