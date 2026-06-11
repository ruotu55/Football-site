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

// Three-line title that can be long in Spanish → slightly smaller than the default 104.
export const TITLE_FONT_SIZE = 84;

// Background default (matches the runner's forcedDefaults for "quiz-four-params").
export const THEME_DEFAULT = {
  color: "#5C6BC0 - Club + Position + Country + Age",
  effect: "Floating emojis",
  opacity: 0.5,
} as const;
