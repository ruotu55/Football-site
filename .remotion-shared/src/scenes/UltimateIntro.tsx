import React from "react";
import { AbsoluteFill, Easing, interpolate, spring } from "remotion";
import { SoccerBallClean as SoccerBall } from "../components/SoccerBallClean";
import { DESIGN_FPS, useDesignFrame } from "../timing";
import { fontFamily } from "../theme";
import { type Accent, brandAccent } from "../brand-accent";

const DEFAULT_ACCENT = brandAccent(null); // gold

// ── Ultimate Football Quiz — branded channel intro (runner 3 only) ───────────────
// ~3.07s (92 design frames @30fps, = BALL_INTRO_FRAMES, so timing is a drop-in swap
// for BallIntro). A gold emblem with a spinning soccer ball drops in over a dramatic
// darkened stage with stadium light rays, then the channel name slams in with a gold
// gradient + a shine sweep, sparkles drift, and it settles into the iris hand-off.
//
// Channel name is split into two lines for the lock-up — edit here to retune branding.
const NAME_TOP = "THE ULTIMATE";
const NAME_BIG = "FOOTBALL QUIZ";

const COND = "'Barlow Condensed', " + fontFamily;
// Shared type for the big name (base + shine copy use the SAME metrics so they overlap).
const BIG_TEXT: React.CSSProperties = { fontFamily: COND, fontWeight: 900, fontSize: 188, lineHeight: 0.9, letterSpacing: "0.005em", padding: "0 14px" };
const backOut = Easing.bezier(0.34, 1.45, 0.5, 1);

// Deterministic sparkle field (no Math.random → no per-frame flicker). x/y are px
// offsets from screen centre; d = appear delay (frames); s = size (px).
const SPARKLES = [
  { x: -430, y: -150, d: 16, s: 8 },
  { x: 410, y: -110, d: 24, s: 11 },
  { x: -520, y: 120, d: 30, s: 7 },
  { x: 500, y: 90, d: 20, s: 9 },
  { x: -300, y: 240, d: 34, s: 6 },
  { x: 330, y: 250, d: 28, s: 8 },
  { x: -610, y: -40, d: 38, s: 7 },
  { x: 600, y: -10, d: 22, s: 10 },
  { x: 130, y: -300, d: 32, s: 7 },
  { x: -170, y: -280, d: 26, s: 9 },
  { x: 250, y: 330, d: 40, s: 6 },
  { x: -260, y: 340, d: 36, s: 7 },
];

const Sparkle: React.FC<{ x: number; y: number; d: number; s: number; frame: number }> = ({ x, y, d, s, frame }) => {
  const life = frame - d;
  const twinkle = 0.5 + 0.5 * Math.sin(life / DESIGN_FPS * 5 + x);
  const op = interpolate(life, [0, 8], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) * twinkle;
  const drift = Math.sin(life / DESIGN_FPS * 1.3 + y) * 10;
  return (
    <div
      style={{
        position: "absolute",
        left: `calc(50% + ${x}px)`,
        top: `calc(50% + ${y + drift}px)`,
        width: s,
        height: s,
        marginLeft: -s / 2,
        marginTop: -s / 2,
        borderRadius: "50%",
        background: "radial-gradient(circle, #fff 0%, #ffe79a 45%, rgba(255,210,90,0) 72%)",
        boxShadow: "0 0 12px rgba(255,220,120,0.9)",
        opacity: op,
        pointerEvents: "none",
      }}
    />
  );
};

export const UltimateIntro: React.FC<{ accent?: Accent }> = ({ accent = DEFAULT_ACCENT }) => {
  const f = useDesignFrame();

  // Emblem (gold ring + spinning ball) drops in with a back-out bounce.
  const emblem = spring({ frame: f - 4, fps: DESIGN_FPS, config: { damping: 12, mass: 0.9, stiffness: 150 }, durationInFrames: 34 });
  const emblemScale = interpolate(emblem, [0, 1], [0.1, 1]);
  const emblemDrop = interpolate(emblem, [0, 1], [-120, 0]);
  const emblemOp = interpolate(f, [4, 12], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const ballSpin = interpolate(f, [4, 46], [-150, 0], { easing: Easing.out(Easing.cubic), extrapolateLeft: "clamp", extrapolateRight: "clamp" })
    + Math.sin(Math.max(0, f - 46) / DESIGN_FPS * 1.2) * 4;

  // "THE ULTIMATE" — tracks in.
  const topOp = interpolate(f, [18, 32], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const topTrack = interpolate(f, [18, 38], [0.6, 0.34], { easing: Easing.out(Easing.cubic), extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const topRise = interpolate(f, [18, 34], [26, 0], { easing: Easing.out(Easing.cubic), extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  // "FOOTBALL QUIZ" — slams in big.
  const bigSpring = spring({ frame: f - 24, fps: DESIGN_FPS, config: { damping: 11, mass: 0.8, stiffness: 170 }, durationInFrames: 28 });
  const bigScale = interpolate(bigSpring, [0, 1], [0.55, 1]);
  const bigOp = interpolate(f, [24, 32], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  // Shine sweep across the big name (a white text copy masked to a moving band).
  const shineX = interpolate(f, [38, 96], [-16, 116], { easing: Easing.inOut(Easing.cubic), extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const shineOp = interpolate(f, [38, 48, 86, 96], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  // Gold underline draws out.
  const underline = interpolate(f, [34, 50], [0, 1], { easing: Easing.out(Easing.cubic), extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  // Whole lock-up settles with a tiny push at the end → hands off to the iris.
  const settle = 1; // no end scale-up (the lock-up was growing before the ball opened)
  const glowPulse = 0.85 + 0.15 * Math.sin(f / DESIGN_FPS * 2.4);

  return (
    <AbsoluteFill>
      {/* NOTE: no full-screen darkening — the intro sits on the SAME bright competition
          background as the rest of the video, so there's no bright→dark→bright flicker.
          Branding pops via strong element shadows/outlines instead. */}

      {/* twinkling stars */}
      {SPARKLES.map((sp, i) => (
        <Sparkle key={i} {...sp} frame={f} />
      ))}

      {/* centre lock-up */}
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", transform: `scale(${settle})` }}>
          {/* emblem */}
          <div
            style={{
              position: "relative",
              width: 300,
              height: 300,
              marginBottom: 26,
              opacity: emblemOp,
              transform: `translateY(${emblemDrop}px) scale(${emblemScale})`,
            }}
          >
            {/* glow halo */}
            <div style={{ position: "absolute", inset: -40, borderRadius: "50%", background: `radial-gradient(circle, ${accent.glow(0.45)} 0%, ${accent.glow(0)} 68%)`, opacity: glowPulse }} />
            {/* outer accent ring */}
            <div
              style={{
                position: "absolute",
                inset: 0,
                borderRadius: "50%",
                background: accent.ring,
                boxShadow: `0 18px 48px rgba(0,0,0,0.6), 0 0 32px ${accent.glow(0.45)}`,
              }}
            />
            {/* inner dark disc */}
            <div style={{ position: "absolute", inset: 16, borderRadius: "50%", background: "radial-gradient(circle at 50% 36%, #14233e 0%, #0a1526 70%, #060d18 100%)", boxShadow: "inset 0 4px 18px rgba(0,0,0,0.6)" }} />
            {/* spinning ball */}
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <div style={{ transform: `rotate(${ballSpin}deg)` }}>
                <SoccerBall diameter={196} />
              </div>
            </div>
          </div>

          {/* THE ULTIMATE */}
          <div
            style={{
              fontFamily: COND,
              fontWeight: 700,
              fontSize: 78,
              lineHeight: 1,
              color: "#f4fbff",
              letterSpacing: `${topTrack}em`,
              opacity: topOp,
              transform: `translateY(${topRise}px)`,
              textShadow: "0 2px 3px rgba(0,0,0,0.85), 0 4px 18px rgba(0,0,0,0.65)",
              paddingLeft: `${topTrack}em`,
            }}
          >
            {NAME_TOP}
          </div>

          {/* FOOTBALL QUIZ — solid gold base + a white text copy masked to a moving band
              (the shine, only on the letters; mask-image works where background-clip failed) */}
          <div style={{ position: "relative", marginTop: 6, opacity: bigOp, transform: `scale(${bigScale})` }}>
            <div style={{ ...BIG_TEXT, color: accent.main, textShadow: "0 3px 9px rgba(0,0,0,0.5), 0 1px 1px rgba(0,0,0,0.6)" }}>{NAME_BIG}</div>
            <div
              style={{
                ...BIG_TEXT,
                position: "absolute",
                inset: 0,
                color: "#ffffff",
                opacity: shineOp,
                pointerEvents: "none",
                WebkitMaskImage: `linear-gradient(100deg, transparent ${shineX - 8}%, #000 ${shineX}%, transparent ${shineX + 8}%)`,
                maskImage: `linear-gradient(100deg, transparent ${shineX - 8}%, #000 ${shineX}%, transparent ${shineX + 8}%)`,
              }}
            >
              {NAME_BIG}
            </div>
          </div>

          {/* accent underline */}
          <div
            style={{
              marginTop: 18,
              width: 560,
              height: 6,
              borderRadius: 999,
              background: accent.linear,
              transform: `scaleX(${underline})`,
              boxShadow: `0 0 16px ${accent.glow(0.6)}`,
            }}
          />
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
