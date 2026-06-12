// Per-runner config for runner 4 — "Guess the Player by Career Stats".
// Everything that differs from the shared template lives here (title/season/theme/voice).
import type { IntroStringsByLanguage } from "@shared/scene-props";

export const COMPOSITION_ID = "Guess-The-Player-By-Career-Stats-Regular";

// Intro title — MUST match the quiz-title voice + the runner's i18n landing title:
//   EN "Guess the football player by career stats"
//   ES "Adivina al jugador por estadísticas de carrera"
export const INTRO_STRINGS: IntroStringsByLanguage = {
  English: {
    titleLines: ["Guess The Player", "By Career Stats"],
    season: "2025/6 SEASON",
    questions: "QUESTIONS",
    bonus: "BONUS",
  },
  Spanish: {
    titleLines: ["Adivina Al Jugador", "Por Estadísticas"],
    season: "TEMPORADA 2025/6",
    questions: "PREGUNTAS",
    bonus: "BONUS",
  },
};

// Intro sizes matched to runner 2 (user request 2026-06-11): title 155, season 126.
export const TITLE_FONT_SIZE = 155;
export const SEASON_FONT_SIZE = 126;

// Background default (matches runner 4's colorId "quiz-career-stats", effect "rising-question-marks").
export const THEME_DEFAULT = {
  color: "#AB47BC - Career Stats",
  effect: "Rising question marks",
  opacity: 0.5,
} as const;
