// Per-runner config for runner 7 — "Guess the Football Team Logo Name".
// Everything that differs from the shared template lives here (title/season/theme/voice).
import type { IntroStringsByLanguage } from "@shared/scene-props";

export const COMPOSITION_ID = "Guess-The-Football-Team-Logo-Name-Regular";

// Intro title — matches the quiz-title voice + the runner's i18n landing title:
//   EN "Guess the football team name"  (landingTitleFakeInfo in i18n.js)
//   ES "Adivina el nombre del equipo de fútbol"
export const INTRO_STRINGS: IntroStringsByLanguage = {
  English: {
    titleLines: ["Guess The Football", "Team Logo Name"],
    season: "2025/6 SEASON",
    questions: "QUESTIONS",
    bonus: "BONUS",
  },
  Spanish: {
    titleLines: ["Adivina El Nombre", "Del Escudo Del Equipo"],
    season: "TEMPORADA 2025/6",
    questions: "PREGUNTAS",
    bonus: "BONUS",
  },
};

// Intro sizes matched to runner 2 (user request 2026-06-11): title 155, season 126.
export const TITLE_FONT_SIZE = 155;
export const SEASON_FONT_SIZE = 72;

// Background default — runner 7 uses colorId "extra-soft-green" + effect "center-rings".
// Color label: "#81C784 - Football Team Name"  (id: extra-soft-green)
// Effect label: "Center circles"               (id: center-rings)
export const THEME_DEFAULT = {
  color: "#81C784 - Football Team Name",
  effect: "Center circles",
  opacity: 0.5,
} as const;
