import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { loadFont } from "@remotion/google-fonts/BarlowCondensed";

// Load Barlow Condensed weight 800 — same font the app loads via Google Fonts.
const { fontFamily } = loadFont("normal", { weights: ["800"], subsets: ["latin"] });

// i18n text matching app's i18n.js TRANSLATIONS map.
const TEXTS = {
  english: {
    clubByNat: {
      title: ["GUESS THE FOOTBALL", "TEAM NAME BY", "PLAYERS NATIONALITY"],
      subtitle: "2025/6 SEASON",
    },
    natByClub: {
      title: ["GUESS THE FOOTBALL", "NATIONAL TEAM NAME", "BY PLAYERS' CLUB"],
      subtitle: "2025/6 SEASON",
    },
    questionsLabel: "QUESTIONS",
    bonus: "BONUS",
  },
  spanish: {
    clubByNat: {
      title: ["ADIVINA EL EQUIPO DE FÚTBOL", "POR LA NACIONALIDAD", "DE LOS JUGADORES"],
      subtitle: "TEMPORADA 2025/6",
    },
    natByClub: {
      title: ["ADIVINA EL NOMBRE DEL", "EQUIPO NACIONAL POR", "EL CLUB DE LOS JUGADORES"],
      subtitle: "TEMPORADA 2025/6",
    },
    questionsLabel: "PREGUNTAS",
    bonus: "BONUS",
  },
};

interface LandingLevelProps {
  language?: string;
  quizType?: string;
  questionCount?: number;
}

// Root font-size calibration:
// The app uses browser default 16px root. OBS records at 1920×1080.
// Remotion composition is 2560×1440. Scale factor: 2560/1920 = 1.333.
// So 1rem in Remotion = 16px × (2560/1920) ≈ 21.3px.
// We use 24px as a round number that produces clean pixel values and fills
// the canvas title visually like the app does. (5.5rem × 24px = 132px)
const ROOT_PX = 24;

const rem = (r: number) => r * ROOT_PX;

export const LandingLevel: React.FC<LandingLevelProps> = ({
  language = "english",
  quizType = "club-by-nat",
  questionCount = 30,
}) => {
  const { fps } = useVideoConfig();
  const frame = useCurrentFrame();

  const lang = language === "spanish" ? "spanish" : "english";
  const variant = quizType === "nat-by-club" ? "natByClub" : "clubByNat";
  const tx = TEXTS[lang];
  const { title, subtitle } = tx[variant];

  // Float bob animation: @keyframes float-up-down 3.2s ease-in-out infinite
  // 0%,100% -> translateY(0); 50% -> translateY(-12px). Cosine = ease-in-out.
  // Amplitude scaled by the root factor (24/16 = 1.5) so it matches the app's
  // relative motion on this larger canvas (12px * 1.5 ≈ 18px).
  const BOB_PX = 18;
  const t = (frame / fps) % 3.2;
  const bobY = -BOB_PX * 0.5 * (1 - Math.cos((t / 3.2) * 2 * Math.PI));

  const FONT = fontFamily;

  // Pill border uses CSS var(--bg-stage) set by BackgroundTheme on documentElement.
  // We pass the literal string so browsers resolve it from the custom property.
  const pillBorderColor = "var(--bg-stage, #FFD60A)";
  const plusBgColor = "var(--bg-stage, #fff)";

  return (
    <AbsoluteFill
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {/* .landing-motion-group — floats up/down with the bob */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          width: "100%",
          // translate3d + will-change forces a composited GPU layer so the bob
          // moves with sub-pixel precision (plain translateY snapped the big
          // shadowed text to whole pixels = visible stepping).
          transform: `translate3d(0, ${bobY}px, 0)`,
          willChange: "transform",
          backfaceVisibility: "hidden",
        }}
      >
        {/* .landing-title */}
        <div
          style={{
            fontFamily: FONT,
            fontSize: rem(5.5),
            fontWeight: 800,
            textAlign: "center",
            textTransform: "uppercase",
            lineHeight: 1,
            color: "#ffffff",
            textShadow:
              "0 10.4px 31.2px rgba(0,0,0,0.8), 0 2.6px 5.2px rgba(0,0,0,0.5)",
            margin: `0 0 ${rem(0.65)}px 0`,
          }}
        >
          {title.map((line, i) => (
            <React.Fragment key={i}>
              {line}
              {i < title.length - 1 && <br />}
            </React.Fragment>
          ))}
        </div>

        {/* .landing-subtitle */}
        <div
          style={{
            fontFamily: FONT,
            fontSize: rem(5.2),
            fontWeight: 800,
            color: "#ff3b30",
            textTransform: "uppercase",
            margin: `0 0 ${rem(2.6)}px 0`,
            textShadow:
              "0 7.8px 23.4px rgba(0,0,0,0.8), 0 2.6px 5.2px rgba(0,0,0,0.5)",
          }}
        >
          {subtitle}
        </div>

        {/* .landing-questions-line (pill) */}
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: rem(0.91),
            background:
              "linear-gradient(180deg, rgba(15,15,15,0.82) 0%, rgba(32,32,32,0.82) 100%)",
            backdropFilter: "blur(12px)",
            border: `3px solid ${pillBorderColor}`,
            borderRadius: 999,
            padding: `${rem(0.91)}px ${rem(2.34)}px`,
            boxShadow:
              "0 19.5px 45.5px rgba(0,0,0,0.55), inset 0 0 20px rgba(0,0,0,0.35)",
          }}
        >
          {/* .landing-questions-count */}
          <span
            style={{
              color: "#ffffff",
              fontFamily: FONT,
              fontSize: rem(5.2),
              fontWeight: 800,
              lineHeight: 1,
              letterSpacing: 0.5,
              textShadow: "0 4px 8px rgba(0,0,0,0.7)",
            }}
          >
            {questionCount}
          </span>

          {/* .landing-questions-label */}
          <span
            style={{
              color: "#ffffff",
              fontFamily: FONT,
              fontSize: rem(2.86),
              fontWeight: 800,
              textTransform: "uppercase",
              letterSpacing: 1.5,
              lineHeight: 1,
              textShadow: "0 2px 4px rgba(0,0,0,0.7)",
            }}
          >
            {tx.questionsLabel}
          </span>

          {/* .landing-questions-plus — circle with plus bars */}
          <div
            style={{
              width: rem(3.2),
              height: rem(3.2),
              borderRadius: "50%",
              background: plusBgColor,
              border: "2px solid #ffffff",
              boxShadow: `inset 0 ${-2.6}px 5.2px rgba(0,0,0,0.2)`,
              flexShrink: 0,
              position: "relative",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {/* Horizontal bar */}
            <div
              style={{
                position: "absolute",
                width: rem(1.7),
                height: rem(0.4),
                background: "#ffffff",
                borderRadius: rem(0.15),
              }}
            />
            {/* Vertical bar */}
            <div
              style={{
                position: "absolute",
                width: rem(0.4),
                height: rem(1.7),
                background: "#ffffff",
                borderRadius: rem(0.15),
              }}
            />
          </div>

          {/* .landing-questions-bonus */}
          <span
            style={{
              color: "#ffffff",
              fontFamily: FONT,
              fontSize: rem(2.86),
              fontWeight: 800,
              textTransform: "uppercase",
              letterSpacing: 1.5,
              lineHeight: 1,
              textShadow: "0 2px 4px rgba(0,0,0,0.7)",
            }}
          >
            {tx.bonus}
          </span>
        </div>
      </div>
    </AbsoluteFill>
  );
};
