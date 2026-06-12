// Per-runner config for runner 8 — "Guess the Football Player Name".
// Everything that differs from the shared template lives here (title/season/theme/voice).
import type { IntroStringsByLanguage } from "@shared/scene-props";

export const COMPOSITION_ID = "Guess-The-Football-Player-Name-Regular";

// Intro title — MUST match the quiz-title voice + the runner's i18n landing title:
//   EN "GUESS THE FOOTBALL PLAYER NAME" (from i18n.js landingTitleFourParams)
//   ES "ADIVINA EL NOMBRE DEL JUGADOR DE FÚTBOL" (from i18n.js landingTitleFourParams)
export const INTRO_STRINGS: IntroStringsByLanguage = {
  English: {
    titleLines: ["Guess The Football", "Player Name"],
    season: "2025/6 SEASON",
    questions: "QUESTIONS",
    bonus: "BONUS",
  },
  Spanish: {
    titleLines: ["Adivina El Nombre", "Del Jugador De Fútbol"],
    season: "TEMPORADA 2025/6",
    questions: "PREGUNTAS",
    bonus: "BONUS",
  },
};

// Intro sizes matched to runner 2 (user request 2026-06-11): title 155, season 126.
export const TITLE_FONT_SIZE = 155;
export const SEASON_FONT_SIZE = 126;

// Background default:
//   colorId "extra-deep-lavender" → label "#9575CD - Football Player Name" (effects-data.ts)
//   effectId "sun-spiral-center"  → label "Sun spiral middle"              (effects-data.ts)
export const THEME_DEFAULT = {
  color: "#9575CD - Football Player Name",
  effect: "Sun spiral middle",
  opacity: 0.5,
} as const;
