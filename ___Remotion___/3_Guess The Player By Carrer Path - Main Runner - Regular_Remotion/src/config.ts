// Per-runner config for runner 3 — "Guess the Player by Career Path".
// Everything that differs from the shared template lives here (title/season/theme/voice).
import type { IntroStringsByLanguage } from "@shared/scene-props";

export const COMPOSITION_ID = "Guess-The-Player-By-Career-Path-Regular";

// Intro title — MUST match the quiz-title voice + the runner's i18n landing title:
//   EN "Guess the football player by career path"
//   ES "Adivina al jugador por su trayectoria"
export const INTRO_STRINGS: IntroStringsByLanguage = {
  English: {
    titleLines: ["Guess The Player", "By Career Path"],
    season: "2025/6 SEASON",
    questions: "QUESTIONS",
    bonus: "BONUS",
  },
  Spanish: {
    titleLines: ["Adivina Al Jugador", "Por Su Trayectoria"],
    season: "TEMPORADA 2025/6",
    questions: "PREGUNTAS",
    bonus: "BONUS",
  },
};

// Intro sizes matched to runner 2 (user request 2026-06-11): title 155, season 126.
export const TITLE_FONT_SIZE = 155;
export const SEASON_FONT_SIZE = 72;

// Background default (matches the runner's app.js forcedDefaults for "career-path").
export const THEME_DEFAULT = {
  color: "#0069EC - Career Path",
  effect: "Sun effect middle",
  opacity: 0.5,
} as const;
