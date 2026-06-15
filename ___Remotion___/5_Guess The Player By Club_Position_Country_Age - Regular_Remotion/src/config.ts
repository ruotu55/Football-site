// Per-runner config for runner 5 — "Guess the Player by Club + Position + Country + Age".
// Everything that differs from the shared template lives here (title/season/theme/voice).
import type { IntroStringsByLanguage } from "@shared/scene-props";

export const COMPOSITION_ID = "Guess-The-Player-By-Club-Position-Country-Age-Regular";

// Intro title — MUST match the quiz-title voice + the runner's i18n landing title:
//   EN "Guess the player by club + position + country + age"
//   ES "Adivina al jugador por club + posición + país + edad"
export const INTRO_STRINGS: IntroStringsByLanguage = {
  English: {
    titleLines: ["Guess The Player By", "Club + Position", "Country + Age"],
    season: "2025/6 SEASON",
    questions: "QUESTIONS",
    bonus: "BONUS",
  },
  Spanish: {
    titleLines: ["Adivina Al Jugador Por", "Club + Posición", "País + Edad"],
    season: "TEMPORADA 2025/6",
    questions: "PREGUNTAS",
    bonus: "BONUS",
  },
};

// Intro sizes matched to runner 2 (user request 2026-06-11): title 155, season 126.
// WATCH-OUT: this title can be long in Spanish (was 84) — check it fits.
export const TITLE_FONT_SIZE = 155;
export const SEASON_FONT_SIZE = 72;

// Background default (matches the runner's forcedDefaults for "quiz-four-params").
export const THEME_DEFAULT = {
  color: "#5C6BC0 - Club + Position + Country + Age",
  effect: "Floating emojis",
  opacity: 0.5,
} as const;
