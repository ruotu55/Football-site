import React from "react";
import { AbsoluteFill } from "remotion";

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

const FONT_FAMILY = '"Barlow Condensed", "Arial Black", sans-serif';

export const LandingLevel: React.FC<LandingLevelProps> = ({
  language = "english",
  quizType = "club-by-nat",
  questionCount = 30,
}) => {
  const lang = language === "spanish" ? "spanish" : "english";
  const variant = quizType === "nat-by-club" ? "natByClub" : "clubByNat";
  const tx = TEXTS[lang];
  const { title, subtitle } = tx[variant];

  return (
    <AbsoluteFill
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {/* Center motion group: title + subtitle + questions line */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          width: "100%",
        }}
      >
        {/* Landing title */}
        <div
          style={{
            fontFamily: FONT_FAMILY,
            fontSize: 132, // 5.5rem × 24px screen-ref → scale to 2560px wide canvas
            fontWeight: 800,
            textAlign: "center",
            textTransform: "uppercase",
            lineHeight: 1,
            color: "#ffffff",
            textShadow:
              "0 10px 30px rgba(0,0,0,0.8), 0 2.5px 5px rgba(0,0,0,0.5)",
            marginBottom: 16,
            letterSpacing: 1,
          }}
        >
          {title.map((line, i) => (
            <React.Fragment key={i}>
              {line}
              {i < title.length - 1 && <br />}
            </React.Fragment>
          ))}
        </div>

        {/* Subtitle (season / year) */}
        <div
          style={{
            fontFamily: FONT_FAMILY,
            fontSize: 124, // ~5.2rem
            fontWeight: 800,
            color: "#ff3b30",
            textTransform: "uppercase",
            marginBottom: 62,
            textShadow:
              "0 8px 22px rgba(0,0,0,0.8), 0 2.5px 5px rgba(0,0,0,0.5)",
          }}
        >
          {subtitle}
        </div>

        {/* Questions count pill */}
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 22,
            background:
              "linear-gradient(180deg, rgba(15,15,15,0.82) 0%, rgba(32,32,32,0.82) 100%)",
            backdropFilter: "blur(12px)",
            border: "3px solid #FFD60A",
            borderRadius: 999,
            padding: "22px 56px",
            boxShadow:
              "0 20px 44px rgba(0,0,0,0.55), inset 0 0 20px rgba(0,0,0,0.35)",
          }}
        >
          {/* Count number */}
          <span
            style={{
              color: "#ffffff",
              fontFamily: FONT_FAMILY,
              fontSize: 124,
              fontWeight: 800,
              lineHeight: 1,
              letterSpacing: 0.5,
              textShadow: "0 4px 8px rgba(0,0,0,0.7)",
            }}
          >
            {questionCount}
          </span>
          {/* "QUESTIONS" label */}
          <span
            style={{
              color: "#ffffff",
              fontFamily: FONT_FAMILY,
              fontSize: 68,
              fontWeight: 800,
              textTransform: "uppercase",
              letterSpacing: 1.5,
              lineHeight: 1,
              textShadow: "0 2px 4px rgba(0,0,0,0.7)",
            }}
          >
            {tx.questionsLabel}
          </span>
          {/* Plus circle */}
          <div
            style={{
              width: 76,
              height: 76,
              borderRadius: "50%",
              background: "#FFD60A",
              border: "2px solid #ffffff",
              boxShadow: "inset 0 -2.5px 5px rgba(0,0,0,0.2)",
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
                width: 40,
                height: 9,
                background: "#ffffff",
                borderRadius: 4,
              }}
            />
            {/* Vertical bar */}
            <div
              style={{
                position: "absolute",
                width: 9,
                height: 40,
                background: "#ffffff",
                borderRadius: 4,
              }}
            />
          </div>
          {/* BONUS label */}
          <span
            style={{
              color: "#ffffff",
              fontFamily: FONT_FAMILY,
              fontSize: 68,
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
