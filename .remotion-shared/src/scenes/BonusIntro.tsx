import React from "react";
import { AbsoluteFill, interpolate, spring } from "remotion";
import { fontFamily } from "../theme";
import type { Language } from "../paths";
import { DESIGN_FPS, useDesignFrame } from "../timing";
import { type Accent, brandAccent } from "../brand-accent";

const DEFAULT_ACCENT = brandAccent(null); // gold

// Mid-quiz BONUS window: rotating gold starburst + "BONUS QUESTION!" slamming in,
// shown right before the bonus level (the one whose answer is never revealed).
// Voice ("It's time for a bonus question!") is stamped by FootballQuizDemo.

const TEXT = {
  English: { main: "BONUS", sub: "QUESTION!" },
  Spanish: { main: "BONUS", sub: "¡PREGUNTA!" },
} as const;

const STAR_PATH = "50,5 61,38 96,38 68,59 79,93 50,72 21,93 32,59 4,38 39,38";
const STARS = [
  { x: -560, y: -210, delay: 12, size: 64 },
  { x: 560, y: -190, delay: 16, size: 54 },
  { x: -650, y: 130, delay: 20, size: 46 },
  { x: 650, y: 160, delay: 14, size: 70 },
  { x: -390, y: 320, delay: 24, size: 40 },
  { x: 430, y: -340, delay: 22, size: 44 },
];

const Sparkle: React.FC<{ frame: number; x: number; y: number; delay: number; size: number }> = ({
  frame,
  x,
  y,
  delay,
  size,
}) => {
  const pop = spring({
    frame: frame - delay,
    fps: DESIGN_FPS,
    config: { damping: 9, mass: 0.6, stiffness: 180 },
    durationInFrames: 26,
  });
  if (frame < delay) return null;
  const twinkle = 0.72 + 0.28 * Math.sin((frame - delay) * 0.35);
  const spin = (frame - delay) * 0.8;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      style={{
        position: "absolute",
        left: `calc(50% + ${x}px - ${size / 2}px)`,
        top: `calc(50% + ${y}px - ${size / 2}px)`,
        opacity: pop * twinkle,
        transform: `scale(${interpolate(pop, [0, 1], [0.2, 1])}) rotate(${spin}deg)`,
        filter: "drop-shadow(0 6px 14px rgba(0,0,0,0.5))",
      }}
    >
      <polygon points={STAR_PATH} fill="#ffffff" stroke="#ffffff" strokeWidth={3} strokeLinejoin="round" />
    </svg>
  );
};

const ShockRing: React.FC<{ frame: number; delay: number }> = ({ frame, delay }) => {
  const t = interpolate(frame, [delay, delay + 26], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  if (t <= 0 || t >= 1) return null;
  return (
    <div
      style={{
        position: "absolute",
        left: "50%",
        top: "50%",
        width: 320,
        height: 320,
        marginLeft: -160,
        marginTop: -160,
        borderRadius: "50%",
        border: "6px solid rgba(255,255,255,0.9)",
        transform: `scale(${interpolate(t, [0, 1], [0.4, 4.4])})`,
        opacity: interpolate(t, [0, 0.25, 1], [0.9, 0.6, 0]),
        pointerEvents: "none",
      }}
    />
  );
};

export const BonusIntro: React.FC<{ language: Language; accent?: Accent }> = ({ language, accent = DEFAULT_ACCENT }) => {
  const frame = useDesignFrame();
  const copy = TEXT[language];

  const raysPop = spring({
    frame,
    fps: DESIGN_FPS,
    config: { damping: 14, mass: 0.9, stiffness: 120 },
    durationInFrames: 30,
  });
  const mainPop = spring({
    frame: frame - 6,
    fps: DESIGN_FPS,
    config: { damping: 8, mass: 0.8, stiffness: 190 }, // low damping → hard slam + bounce
    durationInFrames: 30,
  });
  const subPop = spring({
    frame: frame - 16,
    fps: DESIGN_FPS,
    config: { damping: 11, mass: 0.7, stiffness: 150 },
    durationInFrames: 28,
  });

  const float = Math.sin((frame / DESIGN_FPS) * 1.7) * 12;
  const mainScale = interpolate(mainPop, [0, 1], [2.6, 1]); // slams DOWN onto the screen
  const mainOpacity = interpolate(mainPop, [0, 0.35], [0, 1], { extrapolateRight: "clamp" });
  const mainTilt = interpolate(mainPop, [0, 1], [-10, -3]);
  const subScale = interpolate(subPop, [0, 1], [0.4, 1]);
  const subOpacity = interpolate(subPop, [0, 0.6], [0, 1], { extrapolateRight: "clamp" });
  const glowPulse = 0.55 + 0.45 * Math.sin((frame / DESIGN_FPS) * 5.2);

  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
      {/* Rotating golden starburst behind everything */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          width: 1700,
          height: 1700,
          marginLeft: -850,
          marginTop: -850,
          borderRadius: "50%",
          background: `repeating-conic-gradient(${accent.glow(0.2)} 0deg 11deg, ${accent.glow(0)} 11deg 26deg)`,
          WebkitMaskImage: "radial-gradient(circle, rgba(0,0,0,1) 0%, rgba(0,0,0,0.5) 42%, rgba(0,0,0,0) 68%)",
          maskImage: "radial-gradient(circle, rgba(0,0,0,1) 0%, rgba(0,0,0,0.5) 42%, rgba(0,0,0,0) 68%)",
          transform: `rotate(${frame * 0.55}deg) scale(${interpolate(raysPop, [0, 1], [0.3, 1])})`,
          opacity: raysPop,
        }}
      />

      <ShockRing frame={frame} delay={6} />
      <ShockRing frame={frame} delay={13} />
      {STARS.map((s, i) => (
        <Sparkle key={i} frame={frame} x={s.x} y={s.y} delay={s.delay} size={s.size} />
      ))}

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          transform: `translateY(${float}px)`,
        }}
      >
        <h1
          style={{
            margin: 0,
            fontFamily,
            fontWeight: 800,
            fontSize: 300,
            lineHeight: 0.95,
            letterSpacing: 6,
            textTransform: "uppercase",
            color: accent.main,
            opacity: mainOpacity,
            transform: `scale(${mainScale}) rotate(${mainTilt}deg)`,
            filter: `drop-shadow(0 14px 34px rgba(0,0,0,0.75)) drop-shadow(0 0 ${26 + glowPulse * 26}px ${accent.glow(0.35 + glowPulse * 0.3)})`,
          }}
        >
          {copy.main}
        </h1>
        <h2
          style={{
            margin: "30px 0 0",
            fontFamily,
            fontWeight: 800,
            fontSize: 124,
            letterSpacing: 10,
            textTransform: "uppercase",
            color: "#ffffff",
            textShadow: "0 8px 26px rgba(0,0,0,0.8)",
            opacity: subOpacity,
            transform: `scale(${subScale})`,
          }}
        >
          {copy.sub}
        </h2>
      </div>
    </AbsoluteFill>
  );
};
